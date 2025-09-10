import Groq from 'groq-sdk';
import { RetrievalResult, Citation, SourceDocument, QueryResult, QueryMetrics } from './types';
import { config } from './config';

/**
 * Service for generating LLM responses using Groq API with citation support
 */
export class LLMService {
  private groq: Groq;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private systemPrompt: string;

  constructor() {
    // Validate API key
    if (!process.env.GROQ_API_KEY) {
      console.error('GROQ_API_KEY is not set in environment variables');
      throw new Error('GROQ_API_KEY is required for LLM service');
    }
    
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY!,
    });
    this.model = config.llm.model;
    this.maxTokens = config.llm.maxTokens;
    this.temperature = config.llm.temperature;
    this.systemPrompt = config.llm.systemPrompt;
    
    console.log('LLM Service initialized with model:', this.model);
  }

  /**
   * Generate answer with citations from retrieval results
   */
  async generateAnswer(
    query: string,
    retrievalResults: RetrievalResult[],
    includeMetrics: boolean = true
  ): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      console.log('Generating LLM response for query:', query);
      console.log('Retrieval results count:', retrievalResults.length);
      
      if (retrievalResults.length === 0) {
        console.log('No retrieval results, returning no answer response');
        return this.createNoAnswerResponse(query, startTime);
      }

      // Prepare context with citations
      const { contextText, citations, sources } = this.prepareContextWithCitations(retrievalResults);
      console.log('Prepared context with citations');

      // Create the prompt
      const userPrompt = this.createPrompt(query, contextText);
      console.log('Created prompt');
      console.log('Prompt length:', userPrompt.length, 'characters');

      // Generate response with timeout
      const llmStartTime = Date.now();
      console.log('Calling Groq API with model:', this.model);
      console.log('API Key present:', !!process.env.GROQ_API_KEY);
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('LLM request timeout after 30 seconds')), 30000);
      });
      
      const groqPromise = this.groq.chat.completions.create({
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        stream: false
      });
      
      // Type the completion response properly
      const completion: any = await Promise.race([groqPromise, timeoutPromise]);
      console.log('Received response from Groq API');

      const llmEndTime = Date.now();
      const llmTime = llmEndTime - llmStartTime;
      console.log('Groq API response received in', llmTime, 'ms');

      const answer = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
      console.log('Generated answer length:', answer.length, 'characters');
      console.log('Generated answer (first 200 chars):', answer.substring(0, 200) + '...');

      // Calculate metrics
      const totalTime = Date.now() - startTime;
      const metrics: QueryMetrics = includeMetrics ? {
        totalTime,
        retrievalTime: 0, // This would be calculated in the main RAG service
        rerankingTime: 0, // This would be calculated in the main RAG service
        llmTime,
        embeddingTime: 0, // This would be calculated in the main RAG service
        tokensUsed: {
          input: completion.usage?.prompt_tokens || 0,
          output: completion.usage?.completion_tokens || 0,
          total: completion.usage?.total_tokens || 0
        },
        costEstimate: this.calculateCost(completion.usage?.total_tokens || 0)
      } : {
        totalTime: 0,
        retrievalTime: 0,
        rerankingTime: 0,
        llmTime: 0,
        embeddingTime: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        costEstimate: { embedding: 0, llm: 0, reranking: 0, total: 0 }
      };

      return {
        query,
        answer,
        citations,
        sources,
        retrievalResults,
        metrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error generating LLM response:', error);
      // Log more details about the error
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw new Error(`LLM generation failed: ${error}`);
    }
  }

  /**
   * Generate streaming answer (for real-time response)
   */
  async generateStreamingAnswer(
    query: string,
    retrievalResults: RetrievalResult[],
    onChunk: (chunk: string) => void
  ): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      if (retrievalResults.length === 0) {
        return this.createNoAnswerResponse(query, startTime);
      }

      const { contextText, citations, sources } = this.prepareContextWithCitations(retrievalResults);
      const userPrompt = this.createPrompt(query, contextText);

      const stream = await this.groq.chat.completions.create({
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        stream: true
      });

      let fullAnswer = '';
      let tokenCount = 0;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullAnswer += content;
          tokenCount++;
          onChunk(content);
        }
      }

      const totalTime = Date.now() - startTime;
      const metrics: QueryMetrics = {
        totalTime,
        retrievalTime: 0,
        rerankingTime: 0,
        llmTime: totalTime,
        embeddingTime: 0,
        tokensUsed: {
          input: 0, // Not available in streaming
          output: tokenCount,
          total: tokenCount
        },
        costEstimate: this.calculateCost(tokenCount)
      };

      return {
        query,
        answer: fullAnswer,
        citations,
        sources,
        retrievalResults,
        metrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error generating streaming response:', error);
      throw new Error(`Streaming generation failed: ${error}`);
    }
  }

  /**
   * Prepare context text with citation markers
   */
  private prepareContextWithCitations(retrievalResults: RetrievalResult[]) {
    const citations: Citation[] = [];
    const sources: SourceDocument[] = [];
    const sourceMap = new Map<string, SourceDocument>();

    let contextText = 'Context information:\n\n';

    retrievalResults.forEach((result, index) => {
      const citationId = index + 1;
      const chunk = result.chunk;
      const metadata = chunk.metadata;

      // Add citation
      citations.push({
        id: citationId,
        text: chunk.content,
        source: metadata.source,
        section: metadata.section,
        position: metadata.position
      });

      // Add to context with citation marker
      contextText += `[${citationId}] ${chunk.content}\n\n`;

      // Build source document map
      const sourceKey = metadata.documentId;
      if (!sourceMap.has(sourceKey)) {
        sourceMap.set(sourceKey, {
          id: metadata.documentId,
          title: metadata.title,
          source: metadata.source,
          relevantChunks: [],
          fileType: metadata.fileType
        });
      }
      sourceMap.get(sourceKey)!.relevantChunks.push(citationId);
    });

    // Convert source map to array
    sources.push(...Array.from(sourceMap.values()));

    return { contextText, citations, sources };
  }

  /**
   * Create the prompt for the LLM
   */
  private createPrompt(query: string, contextText: string): string {
    return `${contextText}

Question: ${query}

Please answer the question based on the provided context. Include inline citations using the format [1], [2], etc. to reference specific pieces of information from the context. If you cannot answer the question based on the provided context, please say so clearly.

Answer:`;
  }

  /**
   * Create a no-answer response when no relevant context is found
   */
  private createNoAnswerResponse(query: string, startTime: number): QueryResult {
    return {
      query,
      answer: "I don't have enough relevant information in my knowledge base to answer your question. Please try uploading relevant documents or rephrasing your question.",
      citations: [],
      sources: [],
      retrievalResults: [],
      metrics: {
        totalTime: Date.now() - startTime,
        retrievalTime: 0,
        rerankingTime: 0,
        llmTime: 0,
        embeddingTime: 0,
        tokensUsed: { input: 0, output: 0, total: 0 },
        costEstimate: { embedding: 0, llm: 0, reranking: 0, total: 0 }
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate cost estimation for LLM usage (Updated for Groq pricing)
   */
  private calculateCost(totalTokens: number) {
    // Groq pricing for Llama 3.3 70B: $0.59 per 1M input tokens, $0.79 per 1M output tokens
    // Using average of $0.69 per 1M tokens for estimation
    const groqRate = 0.69 / 1000000; // Convert to per-token rate
    const llmCost = totalTokens * groqRate;

    return {
      embedding: 0, // Will be calculated elsewhere
      llm: llmCost,
      reranking: 0, // Will be calculated elsewhere
      total: llmCost
    };
  }

  /**
   * Validate response quality (basic checks)
   */
  validateResponse(answer: string, retrievalResults: RetrievalResult[]): {
    hasCitations: boolean;
    citationCount: number;
    hasContent: boolean;
    isGrounded: boolean;
  } {
    const citationRegex = /\[(\d+)\]/g;
    const citationMatches = answer.match(citationRegex) || [];
    
    return {
      hasCitations: citationMatches.length > 0,
      citationCount: citationMatches.length,
      hasContent: answer.trim().length > 10,
      isGrounded: citationMatches.length > 0 && retrievalResults.length > 0
    };
  }

  /**
   * Get LLM service configuration
   */
  getLLMInfo() {
    return {
      model: this.model,
      provider: 'groq',
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      supportedModels: [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'llama-3.1-70b-versatile',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
        'llama3-groq-70b-8192-tool-use-preview'
      ]
    };
  }

  /**
   * Test LLM with sample data
   */
  async testLLM(query: string = "What is artificial intelligence?"): Promise<string> {
    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: query }
        ],
        model: this.model,
        max_tokens: 200,
        temperature: 0.7
      });

      return completion.choices[0]?.message?.content || 'No response generated';
    } catch (error) {
      console.error('Error testing LLM:', error);
      throw error;
    }
  }
}

/**
 * Singleton instance of the LLM service
 */
let llmServiceInstance: LLMService | null = null;

export function getLLMService(): LLMService {
  if (!llmServiceInstance) {
    llmServiceInstance = new LLMService();
  }
  return llmServiceInstance;
}