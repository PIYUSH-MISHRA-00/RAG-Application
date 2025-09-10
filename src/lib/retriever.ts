import PineconeClient from './pinecone';
import { getEmbeddingService } from './embeddings';
import { RetrievalResult, DocumentChunk } from './types';
import { config } from './config';

/**
 * Advanced retriever with MMR (Maximal Marginal Relevance) support
 */
export class RetrieverService {
  private pineconeClient: PineconeClient;
  private embeddingService: ReturnType<typeof getEmbeddingService>;

  constructor() {
    this.pineconeClient = PineconeClient.getInstance();
    this.embeddingService = getEmbeddingService();
  }

  /**
   * Retrieve relevant documents using vector similarity search
   */
  async retrieve(
    query: string,
    topK: number = config.retrieval.topK,
    filter?: any
  ): Promise<RetrievalResult[]> {
    try {
      console.log('=== RETRIEVAL PROCESS STARTED ===');
      console.log('Retrieving documents for query:', query, 'topK:', topK);
      
      // Generate query embedding
      console.log('Generating query embedding...');
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      console.log('Generated query embedding, dimension:', queryEmbedding.length);

      // Query Pinecone index
      console.log('Querying Pinecone index...');
      const results = await this.pineconeClient.queryVectors(
        queryEmbedding,
        topK,
        filter
      );
      console.log('Pinecone query results:', results?.matches?.length || 0, 'matches');

      // Check if we have any matches
      if (!results?.matches || results.matches.length === 0) {
        console.log('No matches found in Pinecone index');
        return [];
      }

      // Convert to RetrievalResult format
      console.log('Converting matches to retrieval results...');
      const retrievalResults: RetrievalResult[] = results.matches.map((match, index) => {
        console.log(`Processing match ${index + 1}:`, {
          id: match.id,
          score: match.score,
          metadataKeys: Object.keys(match.metadata || {})
        });
        
        const content = String(match.metadata?.content || '');
        console.log(`Match ${index + 1} content length:`, content.length);
        
        return {
          chunk: {
            id: match.id,
            content: content,
            metadata: {
              source: String(match.metadata?.source || ''),
              title: String(match.metadata?.title || ''),
              section: match.metadata?.section ? String(match.metadata.section) : undefined,
              position: Number(match.metadata?.position) || 0,
              chunkIndex: Number(match.metadata?.chunkIndex) || 0,
              totalChunks: Number(match.metadata?.totalChunks) || 1,
              documentId: String(match.metadata?.documentId || ''),
              timestamp: String(match.metadata?.timestamp || ''),
              fileType: String(match.metadata?.fileType || ''),
              tokens: Number(match.metadata?.tokens) || 0
            }
          },
          score: match.score || 0
        };
      });

      console.log('Converted to retrieval results:', retrievalResults.length);
      console.log('=== RETRIEVAL PROCESS COMPLETED ===');
      return retrievalResults;
    } catch (error) {
      console.error('Error during retrieval:', error);
      throw new Error(`Retrieval failed: ${error}`);
    }
  }

  /**
   * Retrieve with MMR (Maximal Marginal Relevance) for diversity
   */
  async retrieveWithMMR(
    query: string,
    topK: number = config.retrieval.topK,
    lambda: number = config.retrieval.diversityLambda,
    filter?: any
  ): Promise<RetrievalResult[]> {
    try {
      // Get initial candidates (more than topK for diversity selection)
      const candidateCount = Math.min(topK * 3, 100);
      const candidates = await this.retrieve(query, candidateCount, filter);

      if (candidates.length === 0) {
        return [];
      }

      // Generate query embedding for MMR calculation
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Apply MMR algorithm
      const selected: RetrievalResult[] = [];
      const remaining = [...candidates];

      while (selected.length < topK && remaining.length > 0) {
        let bestIndex = 0;
        let bestScore = -Infinity;

        for (let i = 0; i < remaining.length; i++) {
          const candidate = remaining[i];
          
          // Relevance score (similarity to query)
          const relevanceScore = candidate.score;

          // Diversity score (negative similarity to already selected)
          let diversityScore = 0;
          if (selected.length > 0) {
            // Get candidate embedding (we need to generate it since it's not stored)
            const candidateEmbedding = await this.embeddingService.generateEmbedding(
              candidate.chunk.content
            );

            let maxSimilarity = 0;
            for (const selectedResult of selected) {
              const selectedEmbedding = await this.embeddingService.generateEmbedding(
                selectedResult.chunk.content
              );
              const similarity = this.embeddingService.cosineSimilarity(
                candidateEmbedding,
                selectedEmbedding
              );
              maxSimilarity = Math.max(maxSimilarity, similarity);
            }
            diversityScore = -maxSimilarity;
          }

          // Combined MMR score
          const mmrScore = lambda * relevanceScore + (1 - lambda) * diversityScore;

          if (mmrScore > bestScore) {
            bestScore = mmrScore;
            bestIndex = i;
          }
        }

        // Add best candidate to selected and remove from remaining
        selected.push(remaining[bestIndex]);
        remaining.splice(bestIndex, 1);
      }

      return selected;
    } catch (error) {
      console.error('Error during MMR retrieval:', error);
      throw new Error(`MMR retrieval failed: ${error}`);
    }
  }

  /**
   * Retrieve with similarity threshold filtering
   */
  async retrieveWithThreshold(
    query: string,
    topK: number = config.retrieval.topK,
    threshold: number = config.retrieval.similarityThreshold,
    filter?: any
  ): Promise<RetrievalResult[]> {
    const results = await this.retrieve(query, topK, filter);
    return results.filter(result => result.score >= threshold);
  }

  /**
   * Hybrid retrieval: combines vector search with keyword matching
   */
  async hybridRetrieve(
    query: string,
    topK: number = config.retrieval.topK,
    vectorWeight: number = 0.7,
    filter?: any
  ): Promise<RetrievalResult[]> {
    try {
      // Get vector similarity results
      const vectorResults = await this.retrieve(query, topK * 2, filter);

      // Simple keyword scoring (can be enhanced with BM25)
      const keywords = this.extractKeywords(query);
      const hybridResults = vectorResults.map(result => {
        const keywordScore = this.calculateKeywordScore(result.chunk.content, keywords);
        const hybridScore = vectorWeight * result.score + (1 - vectorWeight) * keywordScore;
        
        return {
          ...result,
          score: hybridScore
        };
      });

      // Sort by hybrid score and return top K
      hybridResults.sort((a, b) => b.score - a.score);
      return hybridResults.slice(0, topK);
    } catch (error) {
      console.error('Error during hybrid retrieval:', error);
      throw new Error(`Hybrid retrieval failed: ${error}`);
    }
  }

  /**
   * Extract keywords from query (simple implementation)
   */
  private extractKeywords(query: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'what', 'how', 'when', 'where', 'why', 'who'
    ]);

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Calculate keyword score for content
   */
  private calculateKeywordScore(content: string, keywords: string[]): number {
    const contentLower = content.toLowerCase();
    let score = 0;
    
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = contentLower.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    // Normalize by content length
    return score / Math.max(content.length / 100, 1);
  }

  /**
   * Get retriever configuration and stats
   */
  async getRetrieverInfo() {
    const indexStats = await this.pineconeClient.getIndexStats();
    
    return {
      configuration: {
        topK: config.retrieval.topK,
        rerankedK: config.retrieval.rerankedK,
        diversityLambda: config.retrieval.diversityLambda,
        similarityThreshold: config.retrieval.similarityThreshold
      },
      indexStats,
      embeddingModel: this.embeddingService.getModelInfo()
    };
  }

  /**
   * Test retrieval with sample query
   */
  async testRetrieval(query: string = "test query"): Promise<{
    standardRetrieval: RetrievalResult[];
    mmrRetrieval: RetrievalResult[];
    hybridRetrieval: RetrievalResult[];
  }> {
    const [standardRetrieval, mmrRetrieval, hybridRetrieval] = await Promise.all([
      this.retrieve(query, 5),
      this.retrieveWithMMR(query, 5),
      this.hybridRetrieve(query, 5)
    ]);

    return {
      standardRetrieval,
      mmrRetrieval,
      hybridRetrieval
    };
  }
}

/**
 * Singleton instance of the retriever service
 */
let retrieverServiceInstance: RetrieverService | null = null;

export function getRetrieverService(): RetrieverService {
  if (!retrieverServiceInstance) {
    retrieverServiceInstance = new RetrieverService();
  }
  return retrieverServiceInstance;
}