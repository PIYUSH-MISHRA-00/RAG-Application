import { CohereClient } from 'cohere-ai';
import { RetrievalResult } from './types';
import { config } from './config';

/**
 * Service for reranking search results using Cohere's rerank API
 */
export class RerankerService {
  private cohere: CohereClient;
  private model: string;
  private topN: number;

  constructor() {
    this.cohere = new CohereClient({
      token: process.env.COHERE_API_KEY!,
    });
    this.model = config.reranker.model;
    this.topN = config.reranker.topN;
  }

  /**
   * Optimized rerank search results using Cohere's rerank API
   */
  async rerank(
    query: string,
    results: RetrievalResult[],
    topN?: number
  ): Promise<RetrievalResult[]> {
    try {
      if (results.length === 0) {
        return [];
      }

      const rerankTopN = topN || this.topN;
      
      // Limit to top-K to avoid unnecessary reranker calls (optimization)
      const maxInputResults = Math.min(50, results.length); // Limit to top 50 for efficiency
      const limitedResults = results.slice(0, maxInputResults);
      
      // Prepare documents for reranking
      const documents = limitedResults.map(result => result.chunk.content);

      console.log(`🔄 Reranking ${documents.length} results (limited from ${results.length})...`);
      const startTime = Date.now();

      // Call Cohere rerank API
      const response = await this.cohere.rerank({
        model: this.model,
        query: query,
        documents: documents,
        topN: Math.min(rerankTopN, documents.length),
        returnDocuments: false // We already have the documents
      });

      const rerankTime = Date.now() - startTime;
      console.log(`✅ Reranking completed in ${rerankTime}ms`);

      // Map reranked results back to original format
      const rerankedResults: RetrievalResult[] = response.results.map(result => {
        const originalResult = limitedResults[result.index];
        return {
          ...originalResult,
          rerankedScore: result.relevanceScore,
          score: result.relevanceScore // Update score to reranked score
        };
      });

      // Sort by reranked score (descending)
      rerankedResults.sort((a, b) => (b.rerankedScore || 0) - (a.rerankedScore || 0));

      // Reduced delay (was 100ms, now 25ms)
      await new Promise(resolve => setTimeout(resolve, 25));

      return rerankedResults;
    } catch (error) {
      console.error('❌ Error during reranking:', error);
      // Fallback: return original results if reranking fails
      console.warn('⚠️ Reranking failed, returning original results');
      return results.slice(0, topN || this.topN);
    }
  }

  /**
   * Rerank with custom parameters
   */
  async rerankWithParams(
    query: string,
    results: RetrievalResult[],
    options: {
      topN?: number;
      model?: string;
      maxChunksPerDoc?: number;
    } = {}
  ): Promise<RetrievalResult[]> {
    try {
      if (results.length === 0) {
        return [];
      }

      const {
        topN = this.topN,
        model = this.model,
        maxChunksPerDoc = 1
      } = options;

      // Optionally limit chunks per document for diversity
      const filteredResults = this.limitChunksPerDocument(results, maxChunksPerDoc);
      
      const documents = filteredResults.map(result => result.chunk.content);

      const response = await this.cohere.rerank({
        model,
        query,
        documents,
        topN: Math.min(topN, documents.length),
        returnDocuments: false
      });

      const rerankedResults: RetrievalResult[] = response.results.map(result => {
        const originalResult = filteredResults[result.index];
        return {
          ...originalResult,
          rerankedScore: result.relevanceScore,
          score: result.relevanceScore
        };
      });

      rerankedResults.sort((a, b) => (b.rerankedScore || 0) - (a.rerankedScore || 0));

      return rerankedResults;
    } catch (error) {
      console.error('Error during custom reranking:', error);
      return results.slice(0, options.topN || this.topN);
    }
  }

  /**
   * Limit number of chunks per document for diversity
   */
  private limitChunksPerDocument(
    results: RetrievalResult[],
    maxChunksPerDoc: number
  ): RetrievalResult[] {
    const documentChunkCounts = new Map<string, number>();
    const filteredResults: RetrievalResult[] = [];

    for (const result of results) {
      const documentId = result.chunk.metadata.documentId;
      const currentCount = documentChunkCounts.get(documentId) || 0;

      if (currentCount < maxChunksPerDoc) {
        filteredResults.push(result);
        documentChunkCounts.set(documentId, currentCount + 1);
      }
    }

    return filteredResults;
  }

  /**
   * Calculate reranking cost estimation
   */
  getRerankingCost(numDocuments: number): number {
    // Cohere rerank pricing: approximately $1.00 per 1K searches
    // Assuming each search processes the given number of documents
    const baseSearchCost = 0.001; // $0.001 per search
    const documentFactor = Math.log(numDocuments + 1) / 10; // Slight increase for more docs
    return baseSearchCost * (1 + documentFactor);
  }

  /**
   * Test reranking with sample data
   */
  async testReranking(
    query: string,
    sampleTexts: string[]
  ): Promise<Array<{ text: string; score: number; index: number }>> {
    try {
      const response = await this.cohere.rerank({
        model: this.model,
        query,
        documents: sampleTexts,
        topN: Math.min(5, sampleTexts.length),
        returnDocuments: true
      });

      return response.results.map(result => ({
        text: result.document?.text || sampleTexts[result.index],
        score: result.relevanceScore,
        index: result.index
      }));
    } catch (error) {
      console.error('Error testing reranking:', error);
      throw error;
    }
  }

  /**
   * Get reranker configuration info
   */
  getRerankerInfo() {
    return {
      model: this.model,
      topN: this.topN,
      provider: 'cohere',
      supportedModels: [
        'rerank-english-v3.0',
        'rerank-multilingual-v3.0',
        'rerank-english-v2.0',
        'rerank-multilingual-v2.0'
      ]
    };
  }

  /**
   * Enhanced batch reranking for multiple queries with optimized delays
   */
  async batchRerank(
    queryResultPairs: Array<{ query: string; results: RetrievalResult[] }>,
    topN?: number
  ): Promise<RetrievalResult[][]> {
    const rerankedBatch: RetrievalResult[][] = [];
    const startTime = Date.now();

    console.log(`🚀 Starting batch reranking for ${queryResultPairs.length} queries...`);

    // Process in smaller batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < queryResultPairs.length; i += batchSize) {
      const batch = queryResultPairs.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (pair, index) => {
        try {
          const reranked = await this.rerank(pair.query, pair.results, topN);
          console.log(`✅ Reranked query ${i + index + 1}/${queryResultPairs.length}`);
          return reranked;
        } catch (error) {
          console.error(`❌ Error reranking query ${i + index + 1}: ${pair.query}`, error);
          return pair.results.slice(0, topN || this.topN);
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      rerankedBatch.push(...batchResults);
      
      // Reduced delay between batches (was 100ms, now 25ms)
      if (i + batchSize < queryResultPairs.length) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Batch reranking completed in ${totalTime}ms (avg ${Math.round(totalTime / queryResultPairs.length)}ms per query)`);

    return rerankedBatch;
  }

  /**
   * Compare reranked vs original scores
   */
  compareScores(originalResults: RetrievalResult[], rerankedResults: RetrievalResult[]) {
    const comparison = rerankedResults.map((reranked, index) => {
      const original = originalResults.find(r => r.chunk.id === reranked.chunk.id);
      return {
        chunkId: reranked.chunk.id,
        originalScore: original?.score || 0,
        rerankedScore: reranked.rerankedScore || 0,
        scoreDiff: (reranked.rerankedScore || 0) - (original?.score || 0),
        rankChange: originalResults.findIndex(r => r.chunk.id === reranked.chunk.id) - index
      };
    });

    return {
      comparisons: comparison,
      averageScoreDiff: comparison.reduce((sum, c) => sum + c.scoreDiff, 0) / comparison.length,
      averageRankChange: comparison.reduce((sum, c) => sum + Math.abs(c.rankChange), 0) / comparison.length
    };
  }
}

/**
 * Singleton instance of the reranker service
 */
let rerankerServiceInstance: RerankerService | null = null;

export function getRerankerService(): RerankerService {
  if (!rerankerServiceInstance) {
    rerankerServiceInstance = new RerankerService();
  }
  return rerankerServiceInstance;
}