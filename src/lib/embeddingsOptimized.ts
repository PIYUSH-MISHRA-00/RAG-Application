import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config';
import { DocumentChunk } from './types';

/**
 * Optimized embedding service with batch processing and retry logic
 */
export class EmbeddingService {
  private genAI: GoogleGenerativeAI;
  private model: string;
  private dimensions: number;
  private batchSize: number;
  private batchDelayMs: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private parallelBatches: number;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️  GOOGLE_API_KEY not found in environment variables');
      throw new Error('Google API key is required. Please add GOOGLE_API_KEY to your .env.local file.');
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = config.embeddings.model;
    this.dimensions = config.embeddings.dimensions;
    this.batchSize = config.embeddings.batchSize;
    this.batchDelayMs = config.embeddings.batchDelayMs;
    this.maxRetries = config.embeddings.maxRetries;
    this.retryDelayMs = config.embeddings.retryDelayMs;
    this.parallelBatches = config.embeddings.parallelBatches;

    console.log(`🚀 Embedding service initialized: batch_size=${this.batchSize}, parallel_batches=${this.parallelBatches}`);
  }

  /**
   * Generate embedding for a single text with retry logic
   */
  async generateEmbedding(text: string, retryCount: number = 0): Promise<number[]> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });
      const result = await model.embedContent(text.replace(/\n/g, ' '));
      
      if (!result.embedding || !result.embedding.values) {
        throw new Error('No embedding returned from Google API');
      }

      return result.embedding.values;
    } catch (error) {
      if (retryCount < this.maxRetries) {
        const delay = this.retryDelayMs * Math.pow(2, retryCount); // Exponential backoff
        console.warn(`⚠️ Embedding failed (attempt ${retryCount + 1}/${this.maxRetries + 1}), retrying in ${delay}ms...`);
        await this.sleep(delay);
        return this.generateEmbedding(text, retryCount + 1);
      }
      
      console.error('❌ Embedding failed after all retries:', error);
      throw new Error(`Failed to generate embedding after ${this.maxRetries + 1} attempts: ${error}`);
    }
  }

  /**
   * Optimized batch embedding generation with parallel processing
   */
  async generateEmbeddings(
    texts: string[],
    progressCallback?: (current: number, total: number, failed: number) => void
  ): Promise<number[][]> {
    if (texts.length === 0) return [];

    console.log(`🔄 Starting batch embedding generation for ${texts.length} texts...`);
    const startTime = Date.now();
    
    const embeddings: (number[] | null)[] = new Array(texts.length).fill(null);
    let completed = 0;
    let failed = 0;

    // Split texts into batches
    const batches: Array<{ texts: string[]; indices: number[] }> = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batchTexts = texts.slice(i, i + this.batchSize);
      const batchIndices = Array.from({ length: batchTexts.length }, (_, idx) => i + idx);
      batches.push({ texts: batchTexts, indices: batchIndices });
    }

    console.log(`📦 Created ${batches.length} batches of size ${this.batchSize}`);

    // Process batches with controlled parallelism
    const processBatch = async (batch: { texts: string[]; indices: number[] }) => {
      const results = await Promise.allSettled(
        batch.texts.map(async (text, idx) => {
          try {
            const embedding = await this.generateEmbedding(text);
            completed++;
            // Update progress more frequently
            if (progressCallback && (completed % Math.max(1, Math.floor(texts.length / 50)) === 0 || completed === texts.length)) {
              progressCallback(completed, texts.length, failed);
            }
            return { index: batch.indices[idx], embedding };
          } catch (error) {
            failed++;
            console.error(`❌ Failed to embed text at index ${batch.indices[idx]}:`, error);
            if (progressCallback) {
              progressCallback(completed, texts.length, failed);
            }
            return { index: batch.indices[idx], embedding: null };
          }
        })
      );

      // Store results
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.embedding) {
          embeddings[result.value.index] = result.value.embedding;
        }
      });

      // Reduced delay between batches to respect rate limits
      if (this.batchDelayMs > 0) {
        await this.sleep(this.batchDelayMs);
      }
    };

    // Process batches in parallel groups with progress updates
    for (let i = 0; i < batches.length; i += this.parallelBatches) {
      const parallelBatches = batches.slice(i, i + this.parallelBatches);
      await Promise.all(parallelBatches.map(processBatch));
      
      console.log(`✅ Processed batch group ${Math.floor(i / this.parallelBatches) + 1}/${Math.ceil(batches.length / this.parallelBatches)}`);
      
      // Update progress after each batch group
      if (progressCallback) {
        progressCallback(completed, texts.length, failed);
      }
    }

    // Filter out failed embeddings and create final result
    const successfulEmbeddings: number[][] = [];
    const failedIndices: number[] = [];

    embeddings.forEach((embedding, index) => {
      if (embedding) {
        successfulEmbeddings.push(embedding);
      } else {
        failedIndices.push(index);
      }
    });

    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`🎯 Embedding generation complete:`);
    console.log(`   • Successful: ${successfulEmbeddings.length}/${texts.length}`);
    console.log(`   • Failed: ${failed}`);
    console.log(`   • Duration: ${duration}ms`);
    console.log(`   • Rate: ${Math.round((successfulEmbeddings.length / duration) * 1000)} embeddings/sec`);

    if (failedIndices.length > 0) {
      console.warn(`⚠️ Failed to generate embeddings for indices: ${failedIndices.join(', ')}`);
    }

    return successfulEmbeddings;
  }

  /**
   * Generate embeddings for document chunks with enhanced error handling
   */
  async generateChunkEmbeddings(
    chunks: DocumentChunk[],
    progressCallback?: (current: number, total: number, failed: number) => void
  ): Promise<DocumentChunk[]> {
    if (chunks.length === 0) return [];

    console.log(`🔄 Generating embeddings for ${chunks.length} chunks...`);
    const texts = chunks.map(chunk => chunk.content);
    
    const embeddings = await this.generateEmbeddings(texts, progressCallback);
    
    // Map embeddings back to chunks (only successful ones)
    const successfulChunks: DocumentChunk[] = [];
    let embeddingIndex = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      if (embeddingIndex < embeddings.length) {
        successfulChunks.push({
          ...chunks[i],
          embedding: embeddings[embeddingIndex]
        });
        embeddingIndex++;
      } else {
        console.warn(`⚠️ Skipping chunk ${i} due to failed embedding generation`);
      }
    }

    console.log(`✅ Successfully embedded ${successfulChunks.length}/${chunks.length} chunks`);
    return successfulChunks;
  }

  /**
   * Batch embedding with fallback for failed chunks
   */
  async generateEmbeddingsWithFallback(
    texts: string[],
    progressCallback?: (current: number, total: number, failed: number) => void
  ): Promise<{ embeddings: number[][]; failedIndices: number[] }> {
    const embeddings: number[][] = [];
    const failedIndices: number[] = [];
    
    // First attempt: batch processing
    try {
      const batchEmbeddings = await this.generateEmbeddings(texts, progressCallback);
      
      // If we got all embeddings, return them
      if (batchEmbeddings.length === texts.length) {
        return { embeddings: batchEmbeddings, failedIndices: [] };
      }
      
      // Some failed, identify which ones
      let successIndex = 0;
      for (let i = 0; i < texts.length; i++) {
        if (successIndex < batchEmbeddings.length) {
          embeddings.push(batchEmbeddings[successIndex]);
          successIndex++;
        } else {
          failedIndices.push(i);
          // Create zero vector as fallback
          embeddings.push(new Array(this.dimensions).fill(0));
        }
      }
      
    } catch (error) {
      console.error('❌ Batch embedding failed completely, using fallback:', error);
      
      // Fallback: try individual embeddings
      for (let i = 0; i < texts.length; i++) {
        try {
          const embedding = await this.generateEmbedding(texts[i]);
          embeddings.push(embedding);
          if (progressCallback) {
            progressCallback(i + 1, texts.length, failedIndices.length);
          }
        } catch (error) {
          console.warn(`⚠️ Individual embedding failed for index ${i}, using zero vector`);
          failedIndices.push(i);
          embeddings.push(new Array(this.dimensions).fill(0));
          if (progressCallback) {
            progressCallback(i + 1, texts.length, failedIndices.length);
          }
        }
        
        // Small delay between individual requests
        if (i < texts.length - 1) {
          await this.sleep(50); // Reduced delay
        }
      }
    }
    
    return { embeddings, failedIndices };
  }

  /**
   * Utility function for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get the batch size used for embedding generation
   */
  getBatchSize(): number {
    return this.batchSize;
  }

  /**
   * Get embedding cost estimation (Google Gemini is FREE!)
   */
  getEmbeddingCost(tokenCount: number): number {
    // Google Gemini embeddings are completely free up to 1,500 requests/day
    return 0;
  }

  /**
   * Validate that embeddings have correct dimensions
   */
  validateEmbedding(embedding: number[]): boolean {
    return embedding.length === this.dimensions && embedding.every(val => typeof val === 'number');
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Get model information and performance settings
   */
  getModelInfo() {
    return {
      model: this.model,
      dimensions: this.dimensions,
      provider: 'google',
      cost: 'FREE (up to 1,500 requests/day)',
      rateLimit: '15 requests/minute',
      batchSize: this.batchSize,
      parallelBatches: this.parallelBatches,
      maxRetries: this.maxRetries,
      batchDelayMs: this.batchDelayMs
    };
  }

  /**
   * Performance monitoring
   */
  async benchmarkEmbedding(sampleTexts: string[] = [
    'This is a sample text for benchmarking.',
    'Another example sentence to test embedding performance.',
    'A third piece of text to complete the benchmark.'
  ]): Promise<{
    avgTimePerEmbedding: number;
    totalTime: number;
    successRate: number;
    embeddings: number[][];
  }> {
    const startTime = Date.now();
    
    try {
      const embeddings = await this.generateEmbeddings(sampleTexts);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      return {
        avgTimePerEmbedding: totalTime / sampleTexts.length,
        totalTime,
        successRate: embeddings.length / sampleTexts.length,
        embeddings
      };
    } catch (error) {
      console.error('Benchmark failed:', error);
      throw error;
    }
  }
}

/**
 * Singleton instance of the optimized embedding service
 */
let embeddingServiceInstance: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService();
  }
  return embeddingServiceInstance;
}