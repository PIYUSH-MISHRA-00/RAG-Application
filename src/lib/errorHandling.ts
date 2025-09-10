/**
 * Comprehensive error handling utilities for the RAG application
 */

export class RAGError extends Error {
  public code: string;
  public statusCode: number;
  public context?: any;

  constructor(message: string, code: string, statusCode: number = 500, context?: any) {
    super(message);
    this.name = 'RAGError';
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
  }
}

// Error codes and types
export const ErrorCodes = {
  // Validation Errors (400)
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  
  // Authentication/Authorization Errors (401/403)
  INVALID_API_KEY: 'INVALID_API_KEY',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  
  // Processing Errors (422)
  CHUNKING_FAILED: 'CHUNKING_FAILED',
  EMBEDDING_FAILED: 'EMBEDDING_FAILED',
  INDEXING_FAILED: 'INDEXING_FAILED',
  
  // Service Errors (500+)
  PINECONE_ERROR: 'PINECONE_ERROR',
  OPENAI_ERROR: 'OPENAI_ERROR',
  GOOGLE_AI_ERROR: 'GOOGLE_AI_ERROR',
  GROQ_ERROR: 'GROQ_ERROR',
  COHERE_ERROR: 'COHERE_ERROR',
  
  // System Errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Create standardized error responses
 */
export function createErrorResponse(error: Error | RAGError, defaultMessage: string = 'An error occurred') {
  if (error instanceof RAGError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      context: error.context
    };
  }

  // Handle known error types
  if (error.message.includes('API key')) {
    return {
      success: false,
      error: 'Invalid or missing API key. Please check your configuration.',
      code: ErrorCodes.INVALID_API_KEY
    };
  }

  if (error.message.includes('quota') || error.message.includes('rate limit')) {
    return {
      success: false,
      error: 'API quota exceeded. Please try again later.',
      code: ErrorCodes.QUOTA_EXCEEDED
    };
  }

  if (error.message.includes('timeout')) {
    return {
      success: false,
      error: 'Request timeout. Please try again.',
      code: ErrorCodes.TIMEOUT
    };
  }

  // Generic error response
  return {
    success: false,
    error: defaultMessage,
    code: ErrorCodes.INTERNAL_ERROR,
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  };
}

/**
 * Validation utilities
 */
export class Validator {
  static validateQuery(query: string): void {
    if (!query || typeof query !== 'string') {
      throw new RAGError('Query must be a non-empty string', ErrorCodes.INVALID_INPUT, 400);
    }
    
    if (query.trim().length === 0) {
      throw new RAGError('Query cannot be empty', ErrorCodes.INVALID_INPUT, 400);
    }
    
    if (query.length > 1000) {
      throw new RAGError('Query is too long (max 1000 characters)', ErrorCodes.INVALID_INPUT, 400);
    }
  }

  static validateFile(file: File, maxSize: number = 10 * 1024 * 1024): void {
    if (!file) {
      throw new RAGError('No file provided', ErrorCodes.MISSING_REQUIRED_FIELD, 400);
    }

    if (file.size > maxSize) {
      throw new RAGError(
        `File size exceeds maximum allowed size of ${Math.round(maxSize / (1024 * 1024))}MB`,
        ErrorCodes.FILE_TOO_LARGE,
        400,
        { fileSize: file.size, maxSize }
      );
    }

    const allowedTypes = ['.txt', '.pdf', '.docx', '.md', '.mp3', '.wav', '.m4a'];
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!allowedTypes.includes(extension)) {
      throw new RAGError(
        `Unsupported file type: ${extension}. Allowed types: ${allowedTypes.join(', ')}`,
        ErrorCodes.UNSUPPORTED_FILE_TYPE,
        400,
        { fileType: extension, allowedTypes }
      );
    }
  }

  static validateApiKeys(): void {
    const requiredKeys = {
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      PINECONE_API_KEY: process.env.PINECONE_API_KEY,
      COHERE_API_KEY: process.env.COHERE_API_KEY,
    };

    const missingKeys = Object.entries(requiredKeys)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingKeys.length > 0) {
      throw new RAGError(
        `Missing required API keys: ${missingKeys.join(', ')}`,
        ErrorCodes.INVALID_API_KEY,
        500,
        { missingKeys }
      );
    }
  }
}

/**
 * Service-specific error handlers
 */
export class ServiceErrorHandler {
  static handlePineconeError(error: any): RAGError {
    const message = error.message || 'Pinecone service error';
    
    if (message.includes('index not found')) {
      return new RAGError(
        'Vector database index not found. Please initialize the system.',
        ErrorCodes.PINECONE_ERROR,
        503
      );
    }
    
    if (message.includes('quota exceeded')) {
      return new RAGError(
        'Vector database quota exceeded. Please try again later.',
        ErrorCodes.QUOTA_EXCEEDED,
        429
      );
    }
    
    return new RAGError(message, ErrorCodes.PINECONE_ERROR, 503);
  }

  static handleGoogleAIError(error: any): RAGError {
    const message = error.message || 'Google AI service error';
    
    if (message.includes('API key')) {
      return new RAGError(
        'Invalid Google AI API key',
        ErrorCodes.INVALID_API_KEY,
        401
      );
    }
    
    if (message.includes('quota') || message.includes('billing')) {
      return new RAGError(
        'Google AI quota exceeded. Please check your billing.',
        ErrorCodes.QUOTA_EXCEEDED,
        429
      );
    }
    
    return new RAGError(message, ErrorCodes.GOOGLE_AI_ERROR, 503);
  }

  static handleOpenAIError(error: any): RAGError {
    const message = error.message || 'OpenAI service error';
    
    if (message.includes('API key')) {
      return new RAGError(
        'Invalid OpenAI API key',
        ErrorCodes.INVALID_API_KEY,
        401
      );
    }
    
    if (message.includes('quota') || message.includes('billing')) {
      return new RAGError(
        'OpenAI quota exceeded. Please check your billing.',
        ErrorCodes.QUOTA_EXCEEDED,
        429
      );
    }
    
    return new RAGError(message, ErrorCodes.OPENAI_ERROR, 503);
  }

  static handleGroqError(error: any): RAGError {
    const message = error.message || 'Groq service error';
    
    if (message.includes('API key')) {
      return new RAGError(
        'Invalid Groq API key',
        ErrorCodes.INVALID_API_KEY,
        401
      );
    }
    
    if (message.includes('rate limit')) {
      return new RAGError(
        'Groq rate limit exceeded. Please try again later.',
        ErrorCodes.QUOTA_EXCEEDED,
        429
      );
    }
    
    return new RAGError(message, ErrorCodes.GROQ_ERROR, 503);
  }

  static handleCohereError(error: any): RAGError {
    const message = error.message || 'Cohere service error';
    
    if (message.includes('API key')) {
      return new RAGError(
        'Invalid Cohere API key',
        ErrorCodes.INVALID_API_KEY,
        401
      );
    }
    
    if (message.includes('quota') || message.includes('rate limit')) {
      return new RAGError(
        'Cohere quota exceeded. Please try again later.',
        ErrorCodes.QUOTA_EXCEEDED,
        429
      );
    }
    
    return new RAGError(message, ErrorCodes.COHERE_ERROR, 503);
  }
}

/**
 * Retry mechanism with exponential backoff
 */
export class RetryHandler {
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    errorHandler?: (error: Error) => RAGError
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on certain error types
        if (error instanceof RAGError) {
          if (error.code === ErrorCodes.INVALID_API_KEY || error.statusCode < 500) {
            throw error;
          }
        }
        
        if (attempt === maxRetries) {
          break;
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we have a custom error handler, use it
    if (errorHandler && lastError!) {
      throw errorHandler(lastError!);
    }
    
    throw lastError!
  }
}

/**
 * Circuit breaker pattern for service reliability
 */
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new RAGError(
          'Service temporarily unavailable (circuit breaker open)',
          ErrorCodes.SERVICE_UNAVAILABLE,
          503
        );
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}

/**
 * Global error logger
 */
export class ErrorLogger {
  static log(error: Error | RAGError, context?: any): void {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
      ...(error instanceof RAGError && {
        code: error.code,
        statusCode: error.statusCode,
        ragContext: error.context
      })
    };
    
    // In production, you might want to send this to a logging service
    console.error('[RAG Error]', JSON.stringify(logData, null, 2));
  }
}