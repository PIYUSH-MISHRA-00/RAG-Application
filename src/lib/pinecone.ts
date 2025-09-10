import { Pinecone } from '@pinecone-database/pinecone';
import { config } from './config';

class PineconeClient {
  private static instance: PineconeClient;
  private pinecone: Pinecone;
  private indexName: string;

  private constructor() {
    const apiKey = process.env.PINECONE_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️  PINECONE_API_KEY not found in environment variables');
      throw new Error('Pinecone API key is required. Please add PINECONE_API_KEY to your .env.local file.');
    }
    
    this.pinecone = new Pinecone({
      apiKey: apiKey,
    });
    this.indexName = config.vectorDb.indexName;
  }

  public static getInstance(): PineconeClient {
    if (!PineconeClient.instance) {
      PineconeClient.instance = new PineconeClient();
    }
    return PineconeClient.instance;
  }

  /**
   * Initialize Pinecone index with proper configuration
   */
  async initializeIndex(): Promise<void> {
    try {
      // Check if index exists
      const indexes = await this.pinecone.listIndexes();
      const indexExists = indexes.indexes?.some(index => index.name === this.indexName);

      if (!indexExists) {
        console.log(`Creating Pinecone index: ${this.indexName}`);
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: config.vectorDb.dimension,
          metric: config.vectorDb.metric,
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });
        
        // Wait for index to be ready
        await this.waitForIndexReady();
      } else {
        // Check if existing index has correct dimensions
        const indexDescription = await this.pinecone.describeIndex(this.indexName);
        if (indexDescription.dimension !== config.vectorDb.dimension) {
          console.log(`⚠️  Index ${this.indexName} has wrong dimensions (${indexDescription.dimension}), recreating with ${config.vectorDb.dimension}`);
          await this.pinecone.deleteIndex(this.indexName);
          
          // Wait for deletion to complete
          await this.waitForIndexDeletion();
          
          // Create new index with correct dimensions
          await this.pinecone.createIndex({
            name: this.indexName,
            dimension: config.vectorDb.dimension,
            metric: config.vectorDb.metric,
            spec: {
              serverless: {
                cloud: 'aws',
                region: 'us-east-1'
              }
            }
          });
          
          // Wait for index to be ready
          await this.waitForIndexReady();
        }
      }
    } catch (error) {
      console.error('Error initializing Pinecone index:', error);
      throw error;
    }
  }

  /**
   * Wait for index to be in ready state
   */
  private async waitForIndexReady(maxAttempts: number = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const indexDescription = await this.pinecone.describeIndex(this.indexName);
        if (indexDescription.status?.ready) {
          console.log(`Index ${this.indexName} is ready`);
          return;
        }
        console.log(`Waiting for index ${this.indexName} to be ready... (${i + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced wait time
      } catch (error) {
        console.error('Error checking index status:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error(`Index ${this.indexName} did not become ready within timeout`);
  }

  /**
   * Wait for index to be deleted
   */
  private async waitForIndexDeletion(maxAttempts: number = 15): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const indexes = await this.pinecone.listIndexes();
        const indexExists = indexes.indexes?.some(index => index.name === this.indexName);
        
        if (!indexExists) {
          console.log(`Index ${this.indexName} has been deleted`);
          return;
        }
        
        console.log(`Waiting for index ${this.indexName} to be deleted... (${i + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced wait time
      } catch (error) {
        // If we get an error, it might mean the index is gone
        console.log(`Index ${this.indexName} appears to be deleted`);
        return;
      }
    }
    throw new Error(`Index ${this.indexName} was not deleted within timeout`);
  }

  /**
   * Get the Pinecone index instance
   */
  getIndex() {
    return this.pinecone.index(this.indexName);
  }

  /**
   * Upsert vectors to the index with progress tracking
   */
  async upsertVectors(
    vectors: Array<{
      id: string;
      values: number[];
      metadata: any;
    }>,
    progressCallback?: (uploaded: number, total: number) => void
  ): Promise<void> {
    const index = this.getIndex();
    
    // Process in larger batches for better performance
    const batchSize = 150; // Increased from 100
    let uploaded = 0;
    
    console.log(`📦 Uploading ${vectors.length} vectors in batches of ${batchSize}...`);
    
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      
      try {
        await index.upsert(batch);
        uploaded += batch.length;
        
        if (progressCallback) {
          progressCallback(uploaded, vectors.length);
        }
        
        console.log(`✅ Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)} (${uploaded}/${vectors.length})`);
        
        // Log detailed progress more frequently
        if (uploaded % 30 === 0 || uploaded === vectors.length) { // More frequent updates
          console.log(`📊 Indexing progress: ${uploaded}/${vectors.length} (${Math.round((uploaded/vectors.length)*100)}%)`);
        }
        
        // Minimal delay to avoid overwhelming Pinecone
        if (i + batchSize < vectors.length) {
          await new Promise(resolve => setTimeout(resolve, 30)); // Reduced delay for faster processing
        }
      } catch (error) {
        console.error(`❌ Error uploading batch ${Math.floor(i / batchSize) + 1}:`, error);
        throw error;
      }
    }
    
    console.log(`✅ Successfully uploaded all ${vectors.length} vectors`);
  }

  /**
   * Query vectors from the index
   */
  async queryVectors(
    vector: number[], 
    topK: number = config.vectorDb.topK,
    filter?: any
  ) {
    const index = this.getIndex();
    console.log('Querying Pinecone with topK:', topK);
    console.log('Query vector dimension:', vector.length);
    
    const result = await index.query({
      vector,
      topK,
      includeMetadata: true,
      includeValues: false,
      filter
    });
    console.log('Pinecone query result:', result?.matches?.length || 0, 'matches');
    
    // Log more details about the results
    if (result?.matches && result.matches.length > 0) {
      console.log('First match score:', result.matches[0].score);
      console.log('First match metadata keys:', Object.keys(result.matches[0].metadata || {}));
      console.log('First match content preview:', String(result.matches[0].metadata?.content || '').substring(0, 100) + '...');
    }
    
    return result;
  }

  /**
   * Delete vectors by IDs
   */
  async deleteVectors(ids: string[]): Promise<void> {
    const index = this.getIndex();
    await index.deleteMany(ids);
  }

  /**
   * Get index statistics
   */
  async getIndexStats() {
    const index = this.getIndex();
    return await index.describeIndexStats();
  }

  /**
   * Delete all vectors in the index
   */
  async clearIndex(): Promise<void> {
    const index = this.getIndex();
    await index.deleteAll();
  }
}

export default PineconeClient;