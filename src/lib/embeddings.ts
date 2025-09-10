import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config';
import { DocumentChunk } from './types';

/**
 * Service for generating embeddings using Google Gemini's embedding models
 * Free tier: 15 requests/minute, 1,500 requests/day
 */
export class EmbeddingService {
  private genAI: GoogleGenerativeAI;
  private model: string;
  private dimensions: number;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️  GOOGLE_API_KEY not found in environment variables');
      throw new Error('Google API key is required. Please add GOOGLE_API_KEY to your .env.local file.');
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = config.embeddings.model;
    this.dimensions = config.embeddings.dimensions;
  }

  /**
   * Generate embedding for a single text using Google Gemini
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });
      
      const result = await model.embedContent(text.replace(/\n/g, ' '));
      
      if (!result.embedding || !result.embedding.values) {
        throw new Error('No embedding returned from Google API');
      }

      return result.embedding.values;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batches
   * Google Gemini has rate limits: 15 requests/minute on free tier
   */
  async generateEmbeddings(
    texts: string[],
    progressCallback?: (current: number, total: number) => void
  ): Promise<number[][]> {
    const embeddings: number[][] = [];
    const batchSize = 5; // Reduced batch size for Google API rate limits
    const model = this.genAI.getGenerativeModel({ model: this.model });
  // progressCallback is now passed as an argument and properly typed
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      try {
        // Process batch sequentially to respect rate limits
        for (const text of batch) {
          const result = await model.embedContent(text.replace(/\n/g, ' '));
          if (!result.embedding || !result.embedding.values) {
            throw new Error(`No embedding returned for text: ${text.substring(0, 50)}...`);
          }
          embeddings.push(result.embedding.values);
          if (progressCallback) progressCallback(embeddings.length, texts.length);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        console.log(`Generated embeddings for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`);
      } catch (error) {
        console.error(`Error generating embeddings for batch ${Math.floor(i / batchSize) + 1}:`, error);
        throw new Error(`Failed to generate embeddings for batch: ${error}`);
      }
    }
    return embeddings;
  }

  /**
   * Generate embeddings for document chunks
   */
  async generateChunkEmbeddings(chunks: DocumentChunk[]): Promise<DocumentChunk[]> {
    console.log(`Generating embeddings for ${chunks.length} chunks...`);
    const texts = chunks.map(chunk => chunk.content);
    let lastProgress = 0;
    const embeddings = await this.generateEmbeddings(texts, (current, total) => {
      if (current !== lastProgress) {
        console.log(`Embedding progress: ${current}/${total}`);
        lastProgress = current;
      }
    });
    return chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index]
    }));
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
    return embedding.length === this.dimensions;
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
   * Get model information
   */
  getModelInfo() {
    return {
      model: this.model,
      dimensions: this.dimensions,
      provider: 'google',
      cost: 'FREE (up to 1,500 requests/day)',
      rateLimit: '15 requests/minute'
    };
  }
}

/**
 * Singleton instance of the embedding service
 */
let embeddingServiceInstance: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService();
  }
  return embeddingServiceInstance;
}