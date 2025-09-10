import { DocumentChunk, QueryResult, RetrievalResult, UploadedFile, ProcessingStatus } from './types';
import { createTextProcessor, TextProcessor } from './textProcessor';
import { getEmbeddingService } from './embeddingsOptimized';
import { getRetrieverService } from './retriever';
import { getRerankerService } from './reranker';
import { getLLMService } from './llm';
import PineconeClient from './pinecone';
import { config } from './config';

/**
 * Main RAG service that orchestrates the entire pipeline
 */
export class RAGService {
  private textProcessor: TextProcessor;
  private embeddingService: ReturnType<typeof getEmbeddingService>;
  private retrieverService: ReturnType<typeof getRetrieverService>;
  private rerankerService: ReturnType<typeof getRerankerService>;
  private llmService: ReturnType<typeof getLLMService>;
  private pineconeClient: PineconeClient;

  constructor() {
    this.textProcessor = createTextProcessor();
    this.embeddingService = getEmbeddingService();
    this.retrieverService = getRetrieverService();
    this.rerankerService = getRerankerService();
    this.llmService = getLLMService();
    this.pineconeClient = PineconeClient.getInstance();
  }

  /**
   * Filter duplicate files using document cache
   */
  async filterDuplicateFiles(files: UploadedFile[]): Promise<UploadedFile[]> {
    const { getDocumentCache } = await import('./documentCache');
    const documentCache = getDocumentCache();
    
    const { uniqueFiles } = documentCache.filterDuplicateFiles(files);
    return uniqueFiles;
  }

  /**
   * Initialize the RAG system
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing RAG system...');
      await this.pineconeClient.initializeIndex();
      console.log('RAG system initialized successfully');
    } catch (error) {
      console.error('Error initializing RAG system:', error);
      throw error;
    }
  }

  /**
   * Process and index uploaded files with optimized performance
   */
  async processAndIndexFiles(
    files: UploadedFile[],
    onProgress?: (status: ProcessingStatus) => void,
    clearExisting: boolean = false
  ): Promise<void> {
    const updateProgress = (status: ProcessingStatus) => {
      if (onProgress) onProgress(status);
    };

    try {
      updateProgress({
        status: 'processing',
        message: 'Initializing processing...',
        progress: 0,
        totalDocuments: files.length
      });

      // Clear existing index if requested
      if (clearExisting) {
        console.log('Clearing existing index...');
        await this.clearIndex();
        console.log('Existing index cleared');
      }

      // Process files into chunks
      const allChunks: DocumentChunk[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        updateProgress({
          status: 'processing',
          message: `Processing file: ${file.name}`,
          progress: Math.round((i / files.length) * 10),
          documentsProcessed: i,
          totalDocuments: files.length
        });

        const chunks = await this.textProcessor.processFile(file);
        allChunks.push(...chunks);
        
        updateProgress({
          status: 'processing',
          message: `Processed ${file.name} (${chunks.length} chunks)`,
          progress: Math.round(((i + 1) / files.length) * 10),
          documentsProcessed: i + 1,
          totalDocuments: files.length
        });
        
        console.log(`📊 Processed file ${i + 1}/${files.length}: ${file.name} (${chunks.length} chunks)`);
      }

      updateProgress({
        status: 'processing',
        message: `Created ${allChunks.length} chunks from ${files.length} files`,
        progress: 15,
        documentsProcessed: files.length,
        totalDocuments: files.length
      });

      // Generate embeddings for chunks with more frequent progress updates
      updateProgress({
        status: 'processing',
        message: `Generating embeddings for ${allChunks.length} chunks...`,
        progress: 20,
        documentsProcessed: files.length,
        totalDocuments: files.length
      });

      const chunksWithEmbeddings = await this.embeddingService.generateChunkEmbeddings(
        allChunks,
        (current: number, total: number, failed: number) => {
          // More granular progress updates during embedding generation
          const embeddingProgress = 20 + Math.round((current / total) * 50);
          updateProgress({
            status: 'processing',
            message: `Generating embeddings: ${current}/${total} (${Math.round((current/total)*100)}%)`,
            progress: embeddingProgress,
            documentsProcessed: files.length,
            totalDocuments: files.length
          });
        }
      );

      updateProgress({
        status: 'processing',
        message: 'Indexing to vector database...',
        progress: 75,
        documentsProcessed: files.length,
        totalDocuments: files.length
      });

      // Index to Pinecone with progress tracking
      await this.indexChunksInternal(
        chunksWithEmbeddings,
        (indexed: number, total: number) => {
          const indexingProgress = 75 + Math.round((indexed / total) * 20);
          updateProgress({
            status: 'processing',
            message: `Indexing: ${indexed}/${total} chunks (${Math.round((indexed/total)*100)}%)`,
            progress: indexingProgress,
            documentsProcessed: files.length,
            totalDocuments: files.length
          });
        }
      );

      updateProgress({
        status: 'completed',
        message: `Successfully processed ${files.length} files and indexed ${chunksWithEmbeddings.length} chunks`,
        progress: 100,
        documentsProcessed: files.length,
        totalDocuments: files.length
      });

    } catch (error) {
      console.error('Error processing files:', error);
      updateProgress({
        status: 'error',
        message: `Error processing files: ${error}`,
        progress: 0
      });
      throw error;
    }
  }

  /**
   * Index document chunks to Pinecone with progress callback
   */
  async indexChunks(
    chunks: DocumentChunk[],
    progressCallback?: (indexed: number, total: number) => void
  ): Promise<void> {
    try {
      const vectors = chunks.map(chunk => ({
        id: chunk.id,
        values: chunk.embedding!,
        metadata: {
          content: chunk.content,
          source: chunk.metadata.source,
          title: chunk.metadata.title,
          section: chunk.metadata.section,
          position: chunk.metadata.position,
          chunkIndex: chunk.metadata.chunkIndex,
          totalChunks: chunk.metadata.totalChunks,
          documentId: chunk.metadata.documentId,
          timestamp: chunk.metadata.timestamp,
          fileType: chunk.metadata.fileType,
          tokens: chunk.metadata.tokens
        }
      }));

      // Use chunked upsert with progress tracking
      await this.pineconeClient.upsertVectors(vectors, progressCallback);
      console.log(`✅ Successfully indexed ${vectors.length} chunks`);
    } catch (error) {
      console.error('❌ Error indexing chunks:', error);
      throw error;
    }
  }

  /**
   * Index document chunks to Pinecone (private method for internal use)
   */
  private async indexChunksInternal(
    chunks: DocumentChunk[],
    progressCallback?: (indexed: number, total: number) => void
  ): Promise<void> {
    return this.indexChunks(chunks, progressCallback);
  }

  /**
   * Perform RAG query - main entry point for questions with optimized performance
   */
  async query(
    question: string,
    options: {
      useMMR?: boolean;
      useReranking?: boolean;
      topK?: number;
      rerankedK?: number;
      includeMetrics?: boolean;
    } = {}
  ): Promise<QueryResult> {
    const startTime = Date.now();
    const {
      useMMR = true,
      useReranking = true,
      topK = config.retrieval.topK,
      rerankedK = config.retrieval.rerankedK,
      includeMetrics = true
    } = options;

    try {
      console.log(`=== RAG QUERY PROCESS STARTED ===`);
      console.log(`Processing query: "${question}" with options:`, { useMMR, useReranking, topK, rerankedK, includeMetrics });

      // Step 1: Embedding generation (faster with smaller topK)
      const embeddingStartTime = Date.now();
      console.log('Generating query embedding...');
      const queryEmbedding = await this.embeddingService.generateEmbedding(question);
      const embeddingTime = Date.now() - embeddingStartTime;
      console.log(`Query embedding generated in ${embeddingTime}ms`);

      // Step 2: Retrieval (optimized with smaller topK)
      const retrievalStartTime = Date.now();
      console.log(`Retrieving documents with topK: ${topK}...`);
      let retrievalResults: RetrievalResult[];
      
      if (useMMR) {
        console.log('Using MMR retrieval...');
        retrievalResults = await this.retrieverService.retrieveWithMMR(question, topK);
      } else {
        console.log('Using standard retrieval...');
        retrievalResults = await this.retrieverService.retrieve(question, topK);
      }
      const retrievalTime = Date.now() - retrievalStartTime;
      console.log(`Retrieved ${retrievalResults.length} initial results in ${retrievalTime}ms`);

      // Log retrieval results details
      console.log('Retrieval results details:');
      retrievalResults.forEach((result, index) => {
        console.log(`Result ${index + 1}: Score=${result.score}, Content length=${result.chunk.content.length}`);
      });

      // Step 3: Reranking (optimized with smaller rerankedK)
      let finalResults = retrievalResults;
      let rerankingTime = 0;

      if (useReranking && retrievalResults.length > 0) {
        console.log(`Reranking ${retrievalResults.length} results with rerankedK: ${rerankedK}...`);
        const rerankingStartTime = Date.now();
        finalResults = await this.rerankerService.rerank(question, retrievalResults, rerankedK);
        rerankingTime = Date.now() - rerankingStartTime;
        console.log(`Reranked to ${finalResults.length} results in ${rerankingTime}ms`);
      } else if (!useReranking && retrievalResults.length > rerankedK) {
        console.log(`Skipping reranking, taking top ${rerankedK} results...`);
        finalResults = retrievalResults.slice(0, rerankedK);
      }

      console.log(`Final results count: ${finalResults.length}`);

      // Check if we have any results
      if (finalResults.length === 0) {
        console.log('No relevant results found, returning no answer response');
        return {
          query: question,
          answer: "I don't have enough relevant information in my knowledge base to answer your question. Please try uploading relevant documents or rephrasing your question.",
          citations: [],
          sources: [],
          retrievalResults: [],
          metrics: {
            totalTime: Date.now() - startTime,
            retrievalTime,
            rerankingTime,
            llmTime: 0,
            embeddingTime,
            tokensUsed: { input: 0, output: 0, total: 0 },
            costEstimate: { embedding: 0, llm: 0, reranking: 0, total: 0 }
          },
          timestamp: new Date().toISOString()
        };
      }

      // Step 4: LLM Generation (faster with optimized parameters)
      console.log('Generating LLM response...');
      const llmStartTime = Date.now();
      const result = await this.llmService.generateAnswer(question, finalResults, includeMetrics);
      const llmTime = Date.now() - llmStartTime;
      console.log(`LLM response generated in ${llmTime}ms`);

      // Update metrics
      if (includeMetrics) {
        const totalTokens = result.metrics.tokensUsed.total;
        const embeddingCost = this.embeddingService.getEmbeddingCost(
          this.textProcessor.countTokens(question)
        );
        const rerankingCost = useReranking ? 
          this.rerankerService.getRerankingCost(retrievalResults.length) : 0;

        result.metrics = {
          ...result.metrics,
          totalTime: Date.now() - startTime,
          retrievalTime,
          rerankingTime,
          llmTime,
          embeddingTime,
          costEstimate: {
            embedding: embeddingCost,
            llm: result.metrics.costEstimate.llm,
            reranking: rerankingCost,
            total: embeddingCost + result.metrics.costEstimate.llm + rerankingCost
          }
        };
      }

      console.log(`Query completed in ${Date.now() - startTime}ms`);
      console.log(`=== RAG QUERY PROCESS COMPLETED ===`);
      return result;

    } catch (error) {
      console.error('Error processing query:', error);
      // Return a default response instead of throwing an error
      return {
        query: question,
        answer: "I apologize, but I encountered an error while processing your query. Please try again.",
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
  }

  /**
   * Streaming query for real-time response
   */
  async streamingQuery(
    question: string,
    onChunk: (chunk: string) => void,
    options: {
      useMMR?: boolean;
      useReranking?: boolean;
      topK?: number;
      rerankedK?: number;
    } = {}
  ): Promise<QueryResult> {
    const {
      useMMR = true,
      useReranking = true,
      topK = config.retrieval.topK,
      rerankedK = config.retrieval.rerankedK
    } = options;

    try {
      // Retrieval phase (same as regular query)
      let retrievalResults: RetrievalResult[];
      
      if (useMMR) {
        retrievalResults = await this.retrieverService.retrieveWithMMR(question, topK);
      } else {
        retrievalResults = await this.retrieverService.retrieve(question, topK);
      }

      // Reranking phase (if enabled)
      let finalResults = retrievalResults;
      if (useReranking && retrievalResults.length > 0) {
        finalResults = await this.rerankerService.rerank(question, retrievalResults, rerankedK);
      } else if (!useReranking && retrievalResults.length > rerankedK) {
        finalResults = retrievalResults.slice(0, rerankedK);
      }

      // Streaming LLM generation
      return await this.llmService.generateStreamingAnswer(question, finalResults, onChunk);

    } catch (error) {
      console.error('Error in streaming query:', error);
      throw error;
    }
  }

  /**
   * Get system status and statistics
   */
  async getSystemStatus() {
    try {
      const [indexStats, retrieverInfo, rerankerInfo, llmInfo, embeddingInfo] = await Promise.all([
        this.pineconeClient.getIndexStats(),
        this.retrieverService.getRetrieverInfo(),
        Promise.resolve(this.rerankerService.getRerankerInfo()),
        Promise.resolve(this.llmService.getLLMInfo()),
        Promise.resolve(this.embeddingService.getModelInfo())
      ]);

      return {
        status: 'operational',
        indexStats,
        configuration: {
          chunking: config.chunking,
          vectorDb: config.vectorDb,
          retrieval: config.retrieval,
          llm: config.llm,
          reranker: config.reranker
        },
        services: {
          retriever: retrieverInfo,
          reranker: rerankerInfo,
          llm: llmInfo,
          embedding: embeddingInfo
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting system status:', error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Clear all indexed data
   */
  async clearIndex(): Promise<void> {
    try {
      await this.pineconeClient.clearIndex();
      console.log('Index cleared successfully');
    } catch (error) {
      console.error('Error clearing index:', error);
      throw error;
    }
  }

  /**
   * Test the complete RAG pipeline
   */
  async testPipeline(query: string = "What is this document about?"): Promise<{
    query: string;
    result: QueryResult;
    performance: {
      totalTime: number;
      stages: Record<string, number>;
    };
  }> {
    const startTime = Date.now();
    const stages: Record<string, number> = {};

    try {
      // Test retrieval
      const retrievalStart = Date.now();
      const retrievalResults = await this.retrieverService.retrieve(query, 5);
      stages.retrieval = Date.now() - retrievalStart;

      // Test reranking
      const rerankingStart = Date.now();
      const rerankedResults = await this.rerankerService.rerank(query, retrievalResults, 3);
      stages.reranking = Date.now() - rerankingStart;

      // Test LLM generation
      const llmStart = Date.now();
      const result = await this.llmService.generateAnswer(query, rerankedResults);
      stages.llm = Date.now() - llmStart;

      const totalTime = Date.now() - startTime;

      return {
        query,
        result,
        performance: {
          totalTime,
          stages
        }
      };
    } catch (error) {
      console.error('Error testing pipeline:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.textProcessor.cleanup();
  }
}

/**
 * Singleton instance of the RAG service
 */
let ragServiceInstance: RAGService | null = null;

export function getRAGService(): RAGService {
  if (!ragServiceInstance) {
    ragServiceInstance = new RAGService();
  }
  return ragServiceInstance;
}