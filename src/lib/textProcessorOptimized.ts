import { get_encoding } from 'tiktoken';
import { DocumentChunk, ChunkMetadata, UploadedFile } from './types';
import { config } from './config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Enhanced text processing utilities with tiktoken-based chunking
 */
export class TextProcessor {
  private tokenizer: any;
  
  constructor() {
    // Initialize tiktoken encoder for accurate token counting
    try {
      this.tokenizer = get_encoding('cl100k_base'); // GPT-4 tokenizer
    } catch (error) {
      console.warn('Failed to initialize tiktoken, falling back to approximation:', error);
      this.tokenizer = null;
    }
  }

  /**
   * Accurate token counting using tiktoken
   */
  countTokens(text: string): number {
    if (this.tokenizer) {
      try {
        const tokens = this.tokenizer.encode(text);
        return tokens.length;
      } catch (error) {
        console.warn('Tiktoken encoding failed, using approximation:', error);
      }
    }
    
    // Fallback to improved approximation
    const words = text.split(/\s+/).filter(word => word.length > 0).length;
    const punctuation = (text.match(/[.,;:!?()\[\]{}"'`]/g) || []).length;
    const approximateTokens = Math.ceil(words * 1.3 + punctuation * 0.5);
    const charBasedTokens = Math.ceil(text.length / 4);
    return Math.max(approximateTokens, charBasedTokens);
  }

  /**
   * Convert tokens to approximate character count
   */
  tokensToChars(tokens: number): number {
    // More accurate conversion: 1 token ≈ 3.5 characters for English text
    return Math.floor(tokens * 3.5);
  }

  /**
   * Process uploaded files and convert to chunks with optimized chunking
   */
  async processFiles(files: UploadedFile[]): Promise<DocumentChunk[]> {
    const allChunks: DocumentChunk[] = [];
    console.log(`🔄 Processing ${files.length} files with token-based chunking...`);

    for (const file of files) {
      const chunks = await this.processFile(file);
      allChunks.push(...chunks);
    }

    console.log(`✅ Created ${allChunks.length} total chunks from ${files.length} files`);
    return allChunks;
  }

  /**
   * Process a single file and create optimized chunks
   */
  async processFile(file: UploadedFile): Promise<DocumentChunk[]> {
    const documentId = uuidv4();
    const timestamp = new Date().toISOString();

    // Content is already extracted at upload time
    let content = file.content;

    // Clean and normalize content
    content = this.cleanText(content);

    // Count total tokens for monitoring
    const totalTokens = this.countTokens(content);
    console.log(`📄 Processing ${file.name}: ${totalTokens} tokens, ${content.length} characters`);

    // Split into sections if possible
    const sections = this.extractSections(content, file.name);

    // Create chunks from sections using token-based chunking
    const chunks: DocumentChunk[] = [];
    let globalChunkIndex = 0;

    for (const section of sections) {
      const sectionChunks = this.createTokenBasedChunks(
        section.content,
        {
          source: file.name,
          title: this.extractTitle(file.name),
          section: section.title,
          documentId,
          timestamp,
          fileType: this.getFileType(file.name),
          position: section.position
        },
        globalChunkIndex
      );

      chunks.push(...sectionChunks);
      globalChunkIndex += sectionChunks.length;
    }

    console.log(`📊 ${file.name}: ${chunks.length} chunks created (avg ${Math.round(totalTokens / chunks.length)} tokens/chunk)`);
    return chunks;
  }

  /**
   * Create token-based chunks with proper overlap
   */
  private createTokenBasedChunks(
    text: string,
    baseMetadata: Omit<ChunkMetadata, 'chunkIndex' | 'totalChunks' | 'tokens' | 'position'> & { position: number },
    startingIndex: number = 0
  ): DocumentChunk[] {
    const { chunkSize, chunkOverlap, separators, maxChunksPerDocument, minChunkLength } = config.chunking;
    
    const chunks: DocumentChunk[] = [];
    let currentPosition = 0;
    let chunkIndex = startingIndex;

    // Estimate total chunks to prevent excessive processing
    const totalTokens = this.countTokens(text);
    const estimatedChunks = Math.ceil(totalTokens / chunkSize);
    
    if (estimatedChunks > maxChunksPerDocument) {
      console.warn(`⚠️ Document would create ${estimatedChunks} chunks, limiting to ${maxChunksPerDocument}`);
    }

    // For token-based chunking, we need to work with the actual text more carefully
    const textLength = text.length;

    while (currentPosition < textLength && chunks.length < maxChunksPerDocument) {
      // Estimate character position for target token count
      let estimatedEnd = currentPosition + this.tokensToChars(chunkSize);
      estimatedEnd = Math.min(estimatedEnd, textLength);

      // Find the best split point near our target
      let chunkEnd = this.findBestSplitPoint(text, currentPosition, estimatedEnd, [...separators]);
      
      // Extract the chunk text
      const chunkText = text.slice(currentPosition, chunkEnd).trim();
      
      // Skip empty chunks
      if (chunkText.length === 0) {
        currentPosition = chunkEnd;
        continue;
      }

      // Count actual tokens in this chunk
      const actualTokens = this.countTokens(chunkText);
      
      // Skip chunks that are too small (in tokens)
      if (actualTokens < minChunkLength) {
        currentPosition = chunkEnd;
        continue;
      }

      // If chunk is too large, try to split it further
      if (actualTokens > chunkSize * 1.5) {
        // Recalculate a smaller end position
        const adjustedEnd = currentPosition + this.tokensToChars(chunkSize);
        chunkEnd = this.findBestSplitPoint(text, currentPosition, adjustedEnd, [...separators]);
        const adjustedText = text.slice(currentPosition, chunkEnd).trim();
        const adjustedTokens = this.countTokens(adjustedText);
        
        if (adjustedTokens >= minChunkLength && adjustedText.length > 0) {
          // Use the adjusted chunk
          this.addChunk(chunks, adjustedText, adjustedTokens, baseMetadata, chunkIndex);
        } else {
          // Use original chunk even if it's large
          this.addChunk(chunks, chunkText, actualTokens, baseMetadata, chunkIndex);
        }
      } else {
        // Chunk size is acceptable
        this.addChunk(chunks, chunkText, actualTokens, baseMetadata, chunkIndex);
      }

      // Calculate next position with overlap
      const overlapChars = this.tokensToChars(chunkOverlap);
      currentPosition = Math.max(currentPosition + 1, chunkEnd - overlapChars);
      chunkIndex++;
    }

    // Update total chunks count
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Helper method to add a chunk
   */
  private addChunk(
    chunks: DocumentChunk[],
    content: string,
    tokens: number,
    baseMetadata: any,
    chunkIndex: number
  ): void {
    const chunk: DocumentChunk = {
      id: uuidv4(),
      content,
      metadata: {
        ...baseMetadata,
        chunkIndex,
        totalChunks: 0, // Will be updated after all chunks are created
        tokens,
        position: baseMetadata.position + chunkIndex
      }
    };

    chunks.push(chunk);
  }

  /**
   * Find the best point to split text (prefer sentence/paragraph boundaries)
   */
  private findBestSplitPoint(text: string, start: number, end: number, separators: string[]): number {
    // Ensure we don't go beyond text bounds
    end = Math.min(end, text.length);
    
    // Try each separator in order of preference
    for (const separator of separators) {
      const lastIndex = text.lastIndexOf(separator, end);
      if (lastIndex > start && lastIndex < end) {
        return lastIndex + separator.length;
      }
    }
    
    // If no good separator found, split at word boundary
    for (let i = end; i > start; i--) {
      if (text[i] === ' ' || text[i] === '\n') {
        return i;
      }
    }
    
    // Last resort: split at the target position
    return end;
  }

  /**
   * Clean and normalize text content
   */
  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines
      .replace(/[ \t]+/g, ' ') // Normalize whitespace
      .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
      .trim();
  }

  /**
   * Extract sections from document (enhanced implementation)
   */
  private extractSections(content: string, fileName: string): Array<{ title: string; content: string; position: number }> {
    // Try multiple header patterns
    const patterns = [
      /^#{1,6}\s+(.+)$/gm, // Markdown headers
      /^(.+)\n=+$/gm,      // Underlined headers (=)
      /^(.+)\n-+$/gm,      // Underlined headers (-)
      /^\d+\.\s+(.+)$/gm,  // Numbered sections
    ];

    let bestMatches: RegExpMatchArray[] = [];
    
    for (const pattern of patterns) {
      const matches = Array.from(content.matchAll(pattern));
      if (matches.length > bestMatches.length) {
        bestMatches = matches;
      }
    }

    if (bestMatches.length === 0) {
      // No sections found, treat entire content as one section
      return [{
        title: this.extractTitle(fileName),
        content,
        position: 0
      }];
    }

    const sections: Array<{ title: string; content: string; position: number }> = [];
    
    for (let i = 0; i < bestMatches.length; i++) {
      const currentMatch = bestMatches[i];
      const nextMatch = bestMatches[i + 1];
      
      const startIndex = currentMatch.index!;
      const endIndex = nextMatch ? nextMatch.index! : content.length;
      
      const sectionContent = content.slice(startIndex, endIndex).trim();
      
      sections.push({
        title: currentMatch[1] || `Section ${i + 1}`,
        content: sectionContent,
        position: i
      });
    }

    return sections;
  }

  /**
   * Extract title from filename
   */
  private extractTitle(fileName: string): string {
    return fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  }

  /**
   * Get file extension
   */
  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot !== -1 ? fileName.slice(lastDot) : '';
  }

  /**
   * Get file type from filename
   */
  private getFileType(fileName: string): string {
    const extension = this.getFileExtension(fileName).toLowerCase();
    const typeMap: Record<string, string> = {
      '.txt': 'text',
      '.md': 'markdown',
      '.pdf': 'pdf',
      '.docx': 'docx'
    };
    return typeMap[extension] || 'unknown';
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(chunks: DocumentChunk[]): {
    totalChunks: number;
    totalTokens: number;
    avgTokensPerChunk: number;
    minTokens: number;
    maxTokens: number;
  } {
    if (chunks.length === 0) {
      return { totalChunks: 0, totalTokens: 0, avgTokensPerChunk: 0, minTokens: 0, maxTokens: 0 };
    }

    const tokenCounts = chunks.map(chunk => chunk.metadata.tokens);
    const totalTokens = tokenCounts.reduce((sum, tokens) => sum + tokens, 0);

    return {
      totalChunks: chunks.length,
      totalTokens,
      avgTokensPerChunk: Math.round(totalTokens / chunks.length),
      minTokens: Math.min(...tokenCounts),
      maxTokens: Math.max(...tokenCounts)
    };
  }

  /**
   * Cleanup tokenizer resources
   */
  cleanup(): void {
    if (this.tokenizer) {
      try {
        this.tokenizer.free();
      } catch (error) {
        console.warn('Error cleaning up tokenizer:', error);
      }
    }
  }
}

/**
 * Utility function to create a text processor instance
 */
export function createTextProcessor(): TextProcessor {
  return new TextProcessor();
}