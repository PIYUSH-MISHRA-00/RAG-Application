import { v4 as uuidv4 } from 'uuid';
import { UploadedFile, DocumentChunk } from './types';
import { EventEmitter } from 'events';

/**
 * Job status enumeration
 */
export enum JobStatus {
  PENDING = 'pending',
  UPLOADING = 'uploading',
  EXTRACTING = 'extracting',
  CHUNKING = 'chunking',
  EMBEDDING = 'embedding',
  INDEXING = 'indexing',
  COMPLETE = 'complete',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Progress update interface
 */
export interface ProgressUpdate {
  jobId: string;
  status: JobStatus;
  progress: number; // 0-100
  message: string;
  currentStep?: string;
  totalSteps?: number;
  currentStepIndex?: number;
  estimatedTimeRemaining?: number;
  startTime: number;
  endTime?: number;
  error?: string;
  metadata?: {
    filesProcessed?: number;
    totalFiles?: number;
    chunksCreated?: number;
    chunksEmbedded?: number;
    chunksIndexed?: number;
    tokensProcessed?: number;
    duplicatesSkipped?: number;
  };
}

/**
 * Processing job interface
 */
export interface ProcessingJob {
  id: string;
  files: UploadedFile[];
  status: JobStatus;
  progress: number;
  message: string;
  startTime: number;
  endTime?: number;
  error?: string;
  result?: {
    chunks: DocumentChunk[];
    totalTokens: number;
    processingTime: number;
    duplicatesSkipped: number;
  };
  metadata: {
    filesProcessed: number;
    totalFiles: number;
    chunksCreated: number;
    chunksEmbedded: number;
    chunksIndexed: number;
    tokensProcessed: number;
    duplicatesSkipped: number;
  };
}

/**
 * Background processing service with job queue
 */
export class BackgroundProcessingService extends EventEmitter {
  private jobs: Map<string, ProcessingJob> = new Map();
  private jobQueue: string[] = [];
  private isProcessing = false;
  private maxConcurrentJobs = 2;
  private activeJobs = 0;
  private readonly JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_JOBS_HISTORY = 100;

  constructor() {
    super();
    console.log('🔄 Background processing service initialized');
    
    // Clean up old jobs periodically
    setInterval(() => this.cleanupOldJobs(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Create a new processing job
   */
  createJob(files: UploadedFile[]): string {
    const jobId = uuidv4();
    
    const job: ProcessingJob = {
      id: jobId,
      files,
      status: JobStatus.PENDING,
      progress: 0,
      message: 'Job created, waiting to start...',
      startTime: Date.now(),
      metadata: {
        filesProcessed: 0,
        totalFiles: files.length,
        chunksCreated: 0,
        chunksEmbedded: 0,
        chunksIndexed: 0,
        tokensProcessed: 0,
        duplicatesSkipped: 0
      }
    };
    
    this.jobs.set(jobId, job);
    this.jobQueue.push(jobId);
    
    console.log(`📝 Created job ${jobId} for ${files.length} files`);
    
    // Start processing if not already running
    this.processQueue();
    
    return jobId;
  }

  /**
   * Get job status and progress
   */
  getJobStatus(jobId: string): ProgressUpdate | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      message: job.message,
      startTime: job.startTime,
      endTime: job.endTime,
      error: job.error,
      metadata: job.metadata
    };
  }

  /**
   * Get all active jobs
   */
  getActiveJobs(): ProgressUpdate[] {
    return Array.from(this.jobs.values())
      .filter(job => job.status !== JobStatus.COMPLETE && job.status !== JobStatus.FAILED)
      .map(job => this.getJobStatus(job.id)!)
      .sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    
    if (job.status === JobStatus.COMPLETE || job.status === JobStatus.FAILED) {
      return false; // Cannot cancel completed jobs
    }
    
    job.status = JobStatus.CANCELLED;
    job.message = 'Job cancelled by user';
    job.endTime = Date.now();
    job.progress = 0;
    
    // Remove from queue if pending
    const queueIndex = this.jobQueue.indexOf(jobId);
    if (queueIndex > -1) {
      this.jobQueue.splice(queueIndex, 1);
    }
    
    this.emitProgress(job);
    console.log(`❌ Cancelled job ${jobId}`);
    
    return true;
  }

  /**
   * Process the job queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.activeJobs >= this.maxConcurrentJobs) {
      return;
    }
    
    const jobId = this.jobQueue.shift();
    if (!jobId) return;
    
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    this.activeJobs++;
    this.isProcessing = true;
    
    try {
      await this.processJob(job);
    } catch (error) {
      console.error(`❌ Job ${jobId} failed:`, error);
      job.status = JobStatus.FAILED;
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.message = `Job failed: ${job.error}`;
      job.endTime = Date.now();
      this.emitProgress(job);
    } finally {
      this.activeJobs--;
      this.isProcessing = false;
      
      // Process next job if available
      if (this.jobQueue.length > 0 && this.activeJobs < this.maxConcurrentJobs) {
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: ProcessingJob): Promise<void> {
    console.log(`🚀 Starting job ${job.id}`);
    
    try {
      // Step 1: Initialize
      job.status = JobStatus.UPLOADING;
      job.progress = 5;
      job.message = 'Initializing processing...';
      this.emitProgress(job);
      
      // Import services dynamically to avoid circular dependencies
      const { getRAGService } = await import('./ragService');
      const { getDocumentCache } = await import('./documentCache');
      const { createTextProcessor } = await import('./textProcessorOptimized');
      
      const ragService = getRAGService();
      const documentCache = getDocumentCache();
      const textProcessor = createTextProcessor();
      
      await ragService.initialize();
      
      // Step 2: Check for duplicates
      job.status = JobStatus.EXTRACTING;
      job.progress = 10;
      job.message = 'Checking for duplicate files...';
      this.emitProgress(job);
      
      const { uniqueFiles, duplicates } = documentCache.filterDuplicateFiles(job.files);
      job.metadata.duplicatesSkipped = duplicates.length;
      
      if (uniqueFiles.length === 0) {
        job.status = JobStatus.COMPLETE;
        job.progress = 100;
        job.message = 'All files were duplicates - no processing needed';
        job.endTime = Date.now();
        job.result = {
          chunks: [],
          totalTokens: 0,
          processingTime: Date.now() - job.startTime,
          duplicatesSkipped: duplicates.length
        };
        this.emitProgress(job);
        return;
      }
      
      // Step 3: Process files into chunks
      job.status = JobStatus.CHUNKING;
      job.progress = 20;
      job.message = `Processing ${uniqueFiles.length} unique files into chunks...`;
      this.emitProgress(job);
      
      const chunks = await textProcessor.processFiles(uniqueFiles);
      job.metadata.chunksCreated = chunks.length;
      job.metadata.tokensProcessed = chunks.reduce((sum, chunk) => sum + chunk.metadata.tokens, 0);
      
      // Step 4: Generate embeddings
      job.status = JobStatus.EMBEDDING;
      job.progress = 40;
      job.message = `Generating embeddings for ${chunks.length} chunks...`;
      this.emitProgress(job);
      
      const { getEmbeddingService } = await import('./embeddingsOptimized');
      const embeddingService = getEmbeddingService();
      
      const embeddedChunks = await embeddingService.generateChunkEmbeddings(
        chunks,
        (current, total, failed) => {
          const embeddingProgress = 40 + (current / total) * 30; // 40-70%
          job.progress = Math.round(embeddingProgress);
          job.message = `Generating embeddings: ${current}/${total} (${failed || 0} failed)`;
          job.metadata.chunksEmbedded = current;
          this.emitProgress(job);
          
          // Log detailed progress to console
          console.log(`📊 Embedding progress: ${current}/${total}`);
          if (current % 50 === 0 || current === total) {
            const batchNumber = Math.ceil(current / embeddingService.getBatchSize());
            const totalBatches = Math.ceil(total / embeddingService.getBatchSize());
            console.log(`📦 Generated embeddings for batch ${batchNumber}/${totalBatches}`);
          }
        }
      );

      // Step 5: Index in vector database
      job.status = JobStatus.INDEXING;
      job.progress = 70;
      job.message = `Indexing ${embeddedChunks.length} chunks in vector database...`;
      this.emitProgress(job);
      
      await ragService.indexChunks(embeddedChunks, (indexed, total) => {
        const indexingProgress = 70 + (indexed / total) * 25; // 70-95%
        job.progress = Math.round(indexingProgress);
        job.message = `Indexing: ${indexed}/${total} chunks`;
        job.metadata.chunksIndexed = indexed;
        this.emitProgress(job);
        
        // Log detailed progress to console
        console.log(`📊 Indexing progress: ${indexed}/${total}`);
        if (indexed % 100 === 0 || indexed === total) {
          const batchNumber = Math.ceil(indexed / 100);
          const totalBatches = Math.ceil(total / 100);
          console.log(`📦 Indexed batch ${batchNumber}/${totalBatches}`);
        }
      });

      // Step 6: Cache processed documents
      job.progress = 95;
      job.message = 'Caching processed documents...';
      this.emitProgress(job);
      
      for (const file of uniqueFiles) {
        const fileChunks = embeddedChunks.filter(chunk => 
          chunk.metadata.source === file.name
        );
        documentCache.registerProcessedDocument(file, fileChunks);
      }
      
      // Step 7: Complete
      job.status = JobStatus.COMPLETE;
      job.progress = 100;
      job.message = `Successfully processed ${uniqueFiles.length} files (${embeddedChunks.length} chunks)`;
      job.endTime = Date.now();
      job.metadata.filesProcessed = uniqueFiles.length;
      
      job.result = {
        chunks: embeddedChunks,
        totalTokens: job.metadata.tokensProcessed,
        processingTime: job.endTime - job.startTime,
        duplicatesSkipped: job.metadata.duplicatesSkipped
      };
      
      this.emitProgress(job);
      
      console.log(`✅ Job ${job.id} completed successfully`);
      
      // Cleanup textProcessor
      textProcessor.cleanup();
      
    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Emit progress update
   */
  private emitProgress(job: ProcessingJob): void {
    const progress: ProgressUpdate = {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      message: job.message,
      startTime: job.startTime,
      endTime: job.endTime,
      error: job.error,
      metadata: job.metadata
    };
    
    this.emit('progress', progress);
  }

  /**
   * Clean up old completed jobs
   */
  private cleanupOldJobs(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let removedCount = 0;
    
    for (const [jobId, job] of this.jobs.entries()) {
      if ((job.status === JobStatus.COMPLETE || job.status === JobStatus.FAILED) &&
          now - job.startTime > maxAge) {
        this.jobs.delete(jobId);
        removedCount++;
      }
    }
    
    // Also limit total number of jobs in history
    if (this.jobs.size > this.MAX_JOBS_HISTORY) {
      const sortedJobs = Array.from(this.jobs.entries())
        .sort(([, a], [, b]) => a.startTime - b.startTime);
      
      const toRemove = sortedJobs.slice(0, sortedJobs.length - this.MAX_JOBS_HISTORY);
      toRemove.forEach(([jobId]) => {
        this.jobs.delete(jobId);
        removedCount++;
      });
    }
    
    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} old jobs`);
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    totalJobs: number;
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
    queueLength: number;
    avgProcessingTime: number;
  } {
    const jobs = Array.from(this.jobs.values());
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETE);
    const avgProcessingTime = completedJobs.length > 0 ?
      completedJobs.reduce((sum, job) => sum + ((job.endTime || 0) - job.startTime), 0) / completedJobs.length :
      0;
    
    return {
      totalJobs: jobs.length,
      activeJobs: this.activeJobs,
      completedJobs: completedJobs.length,
      failedJobs: jobs.filter(j => j.status === JobStatus.FAILED).length,
      queueLength: this.jobQueue.length,
      avgProcessingTime: Math.round(avgProcessingTime)
    };
  }
}

/**
 * Singleton instance of the background processing service
 */
let backgroundProcessingInstance: BackgroundProcessingService | null = null;

export function getBackgroundProcessingService(): BackgroundProcessingService {
  if (!backgroundProcessingInstance) {
    backgroundProcessingInstance = new BackgroundProcessingService();
  }
  return backgroundProcessingInstance;
}