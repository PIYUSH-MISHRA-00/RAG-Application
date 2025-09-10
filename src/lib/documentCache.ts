import crypto from 'crypto';
import { UploadedFile, DocumentChunk } from './types';

/**
 * Document caching and deduplication service using SHA256 hashing
 */
export class DocumentCacheService {
  private documentHashes: Map<string, {
    hash: string;
    filename: string;
    timestamp: number;
    chunks: number;
    tokens: number;
  }> = new Map();

  private chunkHashes: Set<string> = new Set();
  private readonly CACHE_EXPIRY_HOURS = 24 * 7; // 7 days

  constructor() {
    console.log('\ud83d\udcbe Document cache service initialized');
  }

  /**
   * Calculate SHA256 hash for content
   */
  calculateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
  }

  /**
   * Check if document content already exists
   */
  isDocumentDuplicate(content: string, filename?: string): {
    isDuplicate: boolean;
    existingEntry?: {
      hash: string;
      filename: string;
      timestamp: number;
      chunks: number;
      tokens: number;
    };
  } {
    const hash = this.calculateContentHash(content);
    
    if (this.documentHashes.has(hash)) {
      const existingEntry = this.documentHashes.get(hash)!;
      
      // Check if cache entry is still valid
      const hoursSinceProcessed = (Date.now() - existingEntry.timestamp) / (1000 * 60 * 60);
      
      if (hoursSinceProcessed < this.CACHE_EXPIRY_HOURS) {
        console.log(`\ud83d\udd04 Duplicate detected: ${filename || 'unnamed'} matches ${existingEntry.filename}`);
        return { isDuplicate: true, existingEntry };
      } else {
        // Remove expired entry
        console.log(`\ud83d\uddfa Removing expired cache entry for ${existingEntry.filename}`);
        this.documentHashes.delete(hash);
      }
    }
    
    return { isDuplicate: false };
  }

  /**
   * Filter out duplicate files from upload batch
   */
  filterDuplicateFiles(files: UploadedFile[]): {
    uniqueFiles: UploadedFile[];
    duplicates: Array<{
      file: UploadedFile;
      existingEntry: {
        hash: string;
        filename: string;
        timestamp: number;
        chunks: number;
        tokens: number;
      };
    }>;
  } {
    const uniqueFiles: UploadedFile[] = [];
    const duplicates: Array<{
      file: UploadedFile;
      existingEntry: {
        hash: string;
        filename: string;
        timestamp: number;
        chunks: number;
        tokens: number;
      };
    }> = [];
    
    const currentBatchHashes = new Set<string>();
    
    for (const file of files) {
      const hash = file.contentHash || this.calculateContentHash(file.content);
      
      // Check against current batch (within-batch deduplication)
      if (currentBatchHashes.has(hash)) {
        console.log(`\ud83d\udd04 Within-batch duplicate: ${file.name}`);
        continue;
      }
      
      // Check against existing cache
      const duplicateCheck = this.isDocumentDuplicate(file.content, file.name);
      
      if (duplicateCheck.isDuplicate && duplicateCheck.existingEntry) {
        console.log(`\ud83d\udd04 Cache duplicate detected: ${file.name} matches ${duplicateCheck.existingEntry.filename}`);
        duplicates.push({
          file,
          existingEntry: duplicateCheck.existingEntry
        });
      } else {
        console.log(`\ud83d\udd30 New unique file detected: ${file.name}`);
        uniqueFiles.push({
          ...file,
          contentHash: hash
        });
        currentBatchHashes.add(hash);
      }
    }
    
    console.log(`\ud83d\udccb Deduplication results: ${uniqueFiles.length} unique, ${duplicates.length} duplicates`);
    
    return { uniqueFiles, duplicates };
  }

  /**
   * Register processed document in cache
   */
  registerProcessedDocument(
    file: UploadedFile,
    chunks: DocumentChunk[]
  ): void {
    const hash = file.contentHash || this.calculateContentHash(file.content);
    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.metadata.tokens, 0);
    
    const entry = {
      hash,
      filename: file.name,
      timestamp: Date.now(),
      chunks: chunks.length,
      tokens: totalTokens
    };
    
    this.documentHashes.set(hash, entry);
    
    // Also cache individual chunk hashes for additional deduplication
    chunks.forEach(chunk => {
      const chunkHash = this.calculateContentHash(chunk.content);
      this.chunkHashes.add(chunkHash);
    });
    
    console.log(`\ud83d\udcbe Cached document: ${file.name} (${chunks.length} chunks, ${totalTokens} tokens)`);
  }

  /**
   * Check for chunk-level duplicates (useful for preventing redundant embeddings)
   */
  filterDuplicateChunks(chunks: DocumentChunk[]): {
    uniqueChunks: DocumentChunk[];
    duplicateCount: number;
  } {
    const uniqueChunks: DocumentChunk[] = [];
    const seenHashes = new Set<string>();
    let duplicateCount = 0;
    
    for (const chunk of chunks) {
      const chunkHash = this.calculateContentHash(chunk.content);
      
      if (seenHashes.has(chunkHash) || this.chunkHashes.has(chunkHash)) {
        duplicateCount++;
        continue;
      }
      
      seenHashes.add(chunkHash);
      uniqueChunks.push(chunk);
    }
    
    if (duplicateCount > 0) {
      console.log(`\ud83d\udd04 Filtered ${duplicateCount} duplicate chunks`);
    }
    
    return { uniqueChunks, duplicateCount };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    documentCount: number;
    chunkCount: number;
    oldestEntry: number | null;
    newestEntry: number | null;
    cacheSize: string;
  } {
    const entries = Array.from(this.documentHashes.values());
    const timestamps = entries.map(e => e.timestamp);
    
    // Calculate estimated cache size
    const estimatedSize = (this.documentHashes.size * 200 + this.chunkHashes.size * 100) / 1024; // KB
    
    return {
      documentCount: this.documentHashes.size,
      chunkCount: this.chunkHashes.size,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
      cacheSize: `${estimatedSize.toFixed(2)} KB`
    };
  }

  /**
   * Clean up expired cache entries
   */
  cleanupExpiredEntries(): {
    removedDocuments: number;
    removedChunks: number;
  } {
    const now = Date.now();
    const expiredHashes: string[] = [];
    let removedDocuments = 0;
    
    // Find expired document entries
    for (const [hash, entry] of this.documentHashes.entries()) {
      const hoursSinceProcessed = (now - entry.timestamp) / (1000 * 60 * 60);
      if (hoursSinceProcessed >= this.CACHE_EXPIRY_HOURS) {
        expiredHashes.push(hash);
        this.documentHashes.delete(hash);
        removedDocuments++;
      }
    }
    
    // For simplicity, we'll clear all chunk hashes when documents expire
    // In a production system, you'd want more sophisticated chunk tracking
    const removedChunks = this.chunkHashes.size;
    if (removedDocuments > 0) {
      this.chunkHashes.clear();
      console.log(`\ud83e\uddf9 Cleaned up ${removedDocuments} expired documents and ${removedChunks} chunks`);
    }
    
    return { removedDocuments, removedChunks };
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    const docCount = this.documentHashes.size;
    const chunkCount = this.chunkHashes.size;
    
    this.documentHashes.clear();
    this.chunkHashes.clear();
    
    console.log(`\ud83e\uddf9 Cache cleared: ${docCount} documents, ${chunkCount} chunks`);
  }

  /**
   * Export cache for persistence (optional)
   */
  exportCache(): {
    documents: Array<{
      hash: string;
      filename: string;
      timestamp: number;
      chunks: number;
      tokens: number;
    }>;
    chunkHashes: string[];
    exportTimestamp: number;
  } {
    return {
      documents: Array.from(this.documentHashes.values()),
      chunkHashes: Array.from(this.chunkHashes),
      exportTimestamp: Date.now()
    };
  }

  /**
   * Import cache from persistence (optional)
   */
  importCache(cacheData: {
    documents: Array<{
      hash: string;
      filename: string;
      timestamp: number;
      chunks: number;
      tokens: number;
    }>;
    chunkHashes: string[];
    exportTimestamp: number;
  }): void {
    // Clear existing cache
    this.clearCache();
    
    // Import documents
    cacheData.documents.forEach(doc => {
      this.documentHashes.set(doc.hash, doc);
    });
    
    // Import chunk hashes
    cacheData.chunkHashes.forEach(hash => {
      this.chunkHashes.add(hash);
    });
    
    console.log(`\ud83d\udcbe Imported cache: ${cacheData.documents.length} documents, ${cacheData.chunkHashes.length} chunks`);
  }

  /**
   * Generate content fingerprint for similarity detection
   */
  generateFingerprint(content: string): {
    hash: string;
    wordCount: number;
    charCount: number;
    uniqueWords: number;
    avgWordLength: number;
  } {
    const hash = this.calculateContentHash(content);
    const words = content.toLowerCase().split(/\\s+/).filter(w => w.length > 0);
    const uniqueWords = new Set(words).size;
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    
    return {
      hash,
      wordCount: words.length,
      charCount: content.length,
      uniqueWords,
      avgWordLength: Math.round(avgWordLength * 100) / 100
    };
  }
}

/**
 * Singleton instance of the document cache service
 */
let documentCacheInstance: DocumentCacheService | null = null;

export function getDocumentCache(): DocumentCacheService {
  if (!documentCacheInstance) {
    documentCacheInstance = new DocumentCacheService();
  }
  return documentCacheInstance;
}