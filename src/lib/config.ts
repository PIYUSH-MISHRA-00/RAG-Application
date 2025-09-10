export const config = {
  timeouts: {
    rerankerMs: 15000,
    llmMs: 30000
  },
  retries: {
    reranker: 2,
    llm: 2
  },
  tokenLimits: {
    modelMax: 32000,
    reserveForAnswer: 1024
  },
  // Token-based Chunking Strategy (Optimized)
  chunking: {
    chunkSize: 300,  // Further reduced chunk size for faster processing
    chunkOverlap: 30, // Further reduced overlap
    separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ', ''],
    maxChunksPerDocument: 500, // Further reduced limit
    minChunkLength: 30, // Minimum tokens per chunk
    useTokenBasedChunking: true // Enable tiktoken-based chunking
  },

  // Vector Database Configuration
  vectorDb: {
    indexName: process.env.PINECONE_INDEX_NAME || 'rag-documents',
    dimension: 768, // Updated to match Google Gemini embedding dimensions
    metric: 'cosine',
    topK: 3 // Further reduced initial retrieval count
  },

  // Embeddings Configuration (Google Gemini with Optimization)
  embeddings: {
    model: 'text-embedding-004', // Google's latest embedding model
    dimensions: 768, // Updated to match Google Gemini embedding dimensions
    provider: 'google', // Free alternative to OpenAI
    batchSize: 30, // Increased batch size for faster processing
    batchDelayMs: 5, // Further reduced delay between batches
    maxRetries: 1, // Further reduced retries
    parallelBatches: 8, // Increased parallel processing
    retryDelayMs: 250 // Further reduced retry delay
  },

  // Retrieval Configuration
  retrieval: {
    topK: 3,        // Further reduced initial retrieval
    rerankedK: 1,    // Further reduced after reranking
    diversityLambda: 0.7, // MMR lambda for diversity
    similarityThreshold: 0.7
  },

  // LLM Configuration (Groq - High Performance)
  llm: {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile', // Changed back to a valid Groq model
    maxTokens: 1024, // Further reduced token limit for faster responses
    temperature: 0.1,
    systemPrompt: `You are a helpful AI assistant that answers questions based on the provided context. 
Always include inline citations [1], [2], etc. for each piece of information you reference from the context.
If you cannot answer based on the provided context, say so clearly.
Be concise but comprehensive in your responses.
Provide accurate, well-structured answers with proper citations.`
  },

  // Reranker Configuration
  reranker: {
    provider: 'cohere',
    model: 'rerank-english-v3.0',
    topN: 1 // Further reduced reranking count
  },

  // File Upload Configuration
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    supportedTypes: ['.txt', '.pdf', '.docx', '.md', '.mp3', '.wav', '.m4a'], // Added audio support
    maxFiles: 3 // Further reduced max files
  },

  // Speech-to-Text Configuration (Groq Whisper)
  speechToText: {
    provider: 'groq',
    model: 'whisper-large-v3-turbo',
    maxFileSize: 100 * 1024 * 1024, // 100MB for audio files
    supportedFormats: ['mp3', 'wav', 'm4a', 'flac', 'ogg']
  }
} as const;

export type AppConfig = typeof config;