import mammoth from 'mammoth';

/**
 * Text extraction service for various file formats
 * Handles server-side extraction with proper error handling
 */
export class TextExtractor {
  /**
   * Extract text from file buffer based on type
   */
  async extractText(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const extension = this.getFileExtension(filename).toLowerCase();
    
    try {
      switch (extension) {
        case '.txt':
        case '.md':
          return this.extractTextFile(buffer);
          
        case '.pdf':
          return await this.extractPDF(buffer);
          
        case '.docx':
          return await this.extractDOCX(buffer);
          
        default:
          throw new Error(`Unsupported file type: ${extension}`);
      }
    } catch (error) {
      console.error(`Error extracting text from ${filename}:`, error);
      throw new Error(`Text extraction failed for ${filename}: ${error}`);
    }
  }

  /**
   * Extract text from plain text files
   */
  private extractTextFile(buffer: Buffer): string {
    try {
      // Try UTF-8 first, fallback to latin1 if needed
      let text = buffer.toString('utf8');
      
      // Check for encoding issues (if we see invalid characters, try latin1)
      if (text.includes('\ufffd')) {
        text = buffer.toString('latin1');
      }
      
      return text.trim();
    } catch (error) {
      throw new Error(`Failed to read text file: ${error}`);
    }
  }

  /**
   * Extract text from PDF files with multiple fallback approaches
   */
  private async extractPDF(buffer: Buffer): Promise<string> {
    // Try multiple approaches for PDF parsing
    const approaches = [
      // Approach 1: Try pdf-parse-fork
      async () => {
        try {
          const pdfModule = await import('pdf-parse-fork');
          const pdfParse = pdfModule.default || pdfModule;
          if (typeof pdfParse === 'function') {
            // @ts-ignore - pdf-parse-fork doesn't have proper types
            const data = await pdfParse(buffer, { max: 0 });
            return data.text;
          }
        } catch (error: any) {
          console.warn('pdf-parse-fork failed:', error);
          throw error;
        }
      },
      
      // Approach 2: Try original pdf-parse
      async () => {
        try {
          const pdfModule = await import('pdf-parse');
          const pdfParse = pdfModule.default || pdfModule;
          if (typeof pdfParse === 'function') {
            // @ts-ignore - pdf-parse doesn't have proper types
            const data = await pdfParse(buffer, { max: 0 });
            return data.text;
          }
        } catch (error: any) {
          console.warn('pdf-parse failed:', error);
          throw error;
        }
      },
      
      // Approach 3: Simple text extraction (for text-based PDFs)
      async () => {
        // Try to extract text directly from buffer
        const text = buffer.toString('utf8');
        // Basic check if this might be a text-based PDF
        if (text.includes('/Type /Page') || text.includes('BT') || text.includes('ET')) {
          // This looks like a binary PDF, not text-based
          throw new Error('Binary PDF detected, text extraction not possible with this method');
        }
        return text;
      }
    ];
    
    // Try each approach
    for (const [index, approach] of approaches.entries()) {
      try {
        console.log(`Trying PDF extraction approach ${index + 1}...`);
        const text = await approach();
        
        if (text && text.trim().length > 0) {
          // Clean up text
          const cleanText = text
            .replace(/\f/g, '\n')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\s{2,}/g, ' ')
            .trim();
          
          console.log(`✅ PDF extracted using approach ${index + 1}: ${cleanText.length} characters`);
          return cleanText;
        }
      } catch (error: any) {
        console.warn(`Approach ${index + 1} failed:`, error.message);
        continue;
      }
    }
    
    // If all approaches failed, provide clear guidance
    throw new Error(
      'PDF parsing failed with all available methods. This is a known compatibility issue in some environments. ' +
      'Please try one of the following solutions:\n' +
      '1. Convert your PDF to a text file (.txt) and upload that instead\n' +
      '2. Ensure pdf-parse is properly installed by running: npm install pdf-parse\n' +
      '3. Try restarting the development server\n' +
      'Supported file types: .txt, .md, .docx'
    );
  }

  /**
   * Extract text from DOCX files using mammoth
   */
  private async extractDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      
      if (!result.value || result.value.trim().length === 0) {
        throw new Error('No text content found in DOCX file');
      }
      
      // Log warnings if any
      if (result.messages.length > 0) {
        console.warn('DOCX extraction warnings:', result.messages);
      }
      
      // Clean up text
      const cleanText = result.value
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\t/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      
      console.log(`📝 DOCX extracted: ${cleanText.length} characters`);
      
      return cleanText;
    } catch (error) {
      throw new Error(`DOCX extraction failed: ${error}`);
    }
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.slice(lastDot) : '';
  }

  /**
   * Validate file type support
   */
  isSupported(filename: string): boolean {
    const extension = this.getFileExtension(filename).toLowerCase();
    return ['.txt', '.md', '.pdf', '.docx'].includes(extension);
  }

  /**
   * Get supported file types
   */
  getSupportedTypes(): string[] {
    return ['.txt', '.md', '.pdf', '.docx'];
  }

  /**
   * Estimate processing time based on file size
   */
  estimateProcessingTime(fileSize: number, fileType: string): number {
    const baseTime = 100; // Base processing time in ms
    
    switch (fileType.toLowerCase()) {
      case '.txt':
      case '.md':
        return baseTime + (fileSize / 1024); // ~1ms per KB
      case '.docx':
        return baseTime + (fileSize / 512); // ~2ms per KB
      case '.pdf':
        return baseTime + (fileSize / 256); // ~4ms per KB (slower due to parsing)
      default:
        return baseTime + (fileSize / 1024);
    }
  }
}

/**
 * Create a text extractor instance
 */
export function createTextExtractor(): TextExtractor {
  return new TextExtractor();
}