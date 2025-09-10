export interface DocumentChunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
  embedding?: number[];
}

export interface ChunkMetadata {
  source: string;
  title: string;
  section?: string;
  position: number;
  chunkIndex: number;
  totalChunks: number;
  documentId: string;
  timestamp: string;
  fileType: string;
  tokens: number;
}

export interface RetrievalResult {
  chunk: DocumentChunk;
  score: number;
  rerankedScore?: number;
}

export interface QueryResult {
  query: string;
  answer: string;
  citations: Citation[];
  sources: SourceDocument[];
  retrievalResults: RetrievalResult[];
  metrics: QueryMetrics;
  timestamp: string;
}

export interface Citation {
  id: number;
  text: string;
  source: string;
  section?: string;
  position: number;
}

export interface SourceDocument {
  id: string;
  title: string;
  source: string;
  relevantChunks: number[];
  fileType: string;
}

export interface QueryMetrics {
  totalTime: number;
  retrievalTime: number;
  rerankingTime: number;
  llmTime: number;
  embeddingTime: number;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  costEstimate: {
    embedding: number;
    llm: number;
    reranking: number;
    total: number;
  };
}

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  content: string;
  lastModified: number;
  contentHash?: string; // SHA256 hash for deduplication
}

export interface ProcessingStatus {
  status: 'idle' | 'processing' | 'completed' | 'error';
  message: string;
  progress?: number;
  documentsProcessed?: number;
  totalDocuments?: number;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metrics?: QueryMetrics;
}