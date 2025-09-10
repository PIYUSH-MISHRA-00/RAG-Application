import { DocumentChunk, ChunkMetadata, UploadedFile } from './types';
import { config } from './config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Text processing utilities for document chunking and metadata extraction
 */
export class TextProcessor {
  /**
   * Count tokens in text using a simple approximation
   * This avoids external dependencies and works reliably in all environments
   */
  countTokens(text: string): number {
    // More accurate approximation: count words, punctuation, and whitespace
    // Typical ratios: 1 token ≈ 0.75 words for English text
    const words = text.split(/\s+/).filter(word => word.length > 0).length;
    const punctuation = (text.match(/[.,;:!?()\[\]{}"\'`]/g) || []).length;
    const approximateTokens = Math.ceil(words * 1.3 + punctuation * 0.5);
    
    // Fallback to character-based if word count is unreliable
    const charBasedTokens = Math.ceil(text.length / 4);
    
    // Use the higher estimate to be conservative
    return Math.max(approximateTokens, charBasedTokens);
  }

  /**
   * Process uploaded files and convert to chunks
   */
  async processFiles(files: UploadedFile[]): Promise<DocumentChunk[]> {
    const allChunks: DocumentChunk[] = [];

    for (const file of files) {
      const chunks = await this.processFile(file);
      allChunks.push(...chunks);
    }

    return allChunks;
  }

  /**
   * Process a single file and create chunks
   */
  async processFile(file: UploadedFile): Promise<DocumentChunk[]> {
    const documentId = uuidv4();
    const timestamp = new Date().toISOString();

    // Extract content based on file type
    let content: string;
    try {
      content = await this.extractContent(file);
    } catch (error) {
      console.error(`Error extracting content from ${file.name}:`, error);
      throw new Error(`Failed to process file: ${file.name}`);
    }

    // Clean and normalize content
    content = this.cleanText(content);

    // Split into sections if possible
    const sections = this.extractSections(content, file.name);

    // Create chunks from sections
    const chunks: DocumentChunk[] = [];
    let globalChunkIndex = 0;

    for (const section of sections) {
      const sectionChunks = this.createChunks(
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

    return chunks;
  }

  /**
   * Extract content from different file types
   */
  private async extractContent(file: UploadedFile): Promise<string> {
    const extension = this.getFileExtension(file.name).toLowerCase();

    switch (extension) {
      case '.txt':
      case '.md':
        return file.content;

      case '.pdf':
        // For PDF files, content should be pre-extracted on the client side
        return file.content;

      case '.docx':
        // For DOCX files, content should be pre-extracted
        return file.content;

      default:
        throw new Error(`Unsupported file type: ${extension}`);
    }
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
      .trim();
  }

  /**
   * Extract sections from document (basic implementation)
   */
  private extractSections(content: string, fileName: string): Array<{ title: string; content: string; position: number }> {
    // Try to detect sections based on headers (markdown style)
    const headerRegex = /^#{1,6}\s+(.+)$/gm;
    const matches = Array.from(content.matchAll(headerRegex));

    if (matches.length === 0) {
      // No sections found, treat entire content as one section
      return [{
        title: this.extractTitle(fileName),
        content,
        position: 0
      }];
    }

    const sections: Array<{ title: string; content: string; position: number }> = [];
    
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const nextMatch = matches[i + 1];
      
      const startIndex = currentMatch.index!;
      const endIndex = nextMatch ? nextMatch.index! : content.length;
      
      const sectionContent = content.slice(startIndex, endIndex).trim();
      
      sections.push({
        title: currentMatch[1],
        content: sectionContent,
        position: i
      });
    }

    return sections;
  }

  /**
   * Create chunks from text with overlap and size limits
   */
  private createChunks(
    text: string,
    baseMetadata: Omit<ChunkMetadata, 'chunkIndex' | 'totalChunks' | 'tokens' | 'position'> & { position: number },
    startingIndex: number = 0
  ): DocumentChunk[] {
    const { chunkSize, chunkOverlap, separators, maxChunksPerDocument, minChunkLength } = config.chunking;
    
    const chunks: DocumentChunk[] = [];
    let currentPosition = 0;
    let chunkIndex = startingIndex;

    // Estimate total chunks to prevent excessive processing
    const estimatedChunks = Math.ceil(text.length / this.estimateCharactersForTokens(chunkSize));
    if (estimatedChunks > maxChunksPerDocument) {
      console.warn(`Document would create ${estimatedChunks} chunks, limiting to ${maxChunksPerDocument}`);
    }

    while (currentPosition < text.length && chunks.length < maxChunksPerDocument) {
      // Find the best chunk end position
      let chunkEnd = currentPosition + this.estimateCharactersForTokens(chunkSize);
      
      // Adjust to not break words/sentences
      if (chunkEnd < text.length) {
        chunkEnd = this.findBestSplitPoint(text, currentPosition, chunkEnd, [...separators]);
      } else {
        chunkEnd = text.length;
      }

      const chunkText = text.slice(currentPosition, chunkEnd).trim();
      
      // Skip empty or too short chunks
      if (chunkText.length === 0 || chunkText.length < minChunkLength) {
        currentPosition = Math.min(currentPosition + this.estimateCharactersForTokens(chunkSize), text.length);
        continue;
      }

      const tokens = this.countTokens(chunkText);

      const chunk: DocumentChunk = {
        id: uuidv4(),
        content: chunkText,
        metadata: {
          ...baseMetadata,
          chunkIndex,
          totalChunks: 0, // Will be updated after all chunks are created
          tokens,
          position: baseMetadata.position + chunkIndex
        }
      };

      chunks.push(chunk);

      // Calculate next position with overlap
      const overlapChars = this.estimateCharactersForTokens(chunkOverlap);
      currentPosition = Math.max(currentPosition + 1, chunkEnd - overlapChars);
      chunkIndex++;
    }

    // Update total chunks count
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });

    console.log(`Created ${chunks.length} chunks for ${baseMetadata.source}`);
    return chunks;
  }

  /**
   * Find the best point to split text (prefer sentence/paragraph boundaries)
   */
  private findBestSplitPoint(text: string, start: number, end: number, separators: string[]): number {
    for (const separator of separators) {
      const lastIndex = text.lastIndexOf(separator, end);
      if (lastIndex > start) {
        return lastIndex + separator.length;
      }
    }
    return end;
  }

  /**
   * Estimate character count for given token count (improved approximation)
   */
  private estimateCharactersForTokens(tokens: number): number {
    // More conservative estimate: 1 token ≈ 3 characters for chunking purposes
    return Math.floor(tokens * 2.5); // Reduced character estimate for smaller chunks
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
   * No cleanup needed for simple token approximation
   */
  cleanup(): void {
    // No resources to clean up since we're not using tiktoken
  }
}

/**
 * Utility function to create a text processor instance
 */
export function createTextProcessor(): TextProcessor {
  return new TextProcessor();
}