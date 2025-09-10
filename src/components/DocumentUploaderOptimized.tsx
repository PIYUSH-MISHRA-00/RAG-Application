import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, CheckCircle, AlertCircle, Clock, DollarSign, Zap } from 'lucide-react';
import { config } from '@/lib/config';

interface UploadStatus {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  message: string;
  progress?: number;
  jobId?: string;
  backgroundProcessing?: boolean;
  estimatedTime?: number;
  costEstimate?: {
    embedding: number;
    total: number;
  };
}

interface JobProgress {
  jobId: string;
  status: string;
  progress: number;
  message: string;
  startTime: number;
  endTime?: number;
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

const DocumentUploader: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [textContent, setTextContent] = useState('');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ 
    status: 'idle', 
    message: '' 
  });
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [tokenEstimate, setTokenEstimate] = useState<number>(0);
  const [costEstimate, setCostEstimate] = useState<{ tokens: number; cost: number }>({ tokens: 0, cost: 0 });

  // Calculate token and cost estimates
  useEffect(() => {
    const calculateEstimates = () => {
      let totalText = textContent;
      
      // Estimate text content from files (rough approximation)
      files.forEach(file => {
        if (file.type.includes('text')) {
          totalText += ' '.repeat(file.size / 2); // Very rough estimate
        } else if (file.type.includes('pdf')) {
          totalText += ' '.repeat(file.size / 10); // PDFs are more compressed
        }
      });
      
      // Rough token count (1 token ≈ 4 characters)
      const estimatedTokens = Math.ceil(totalText.length / 4);
      setTokenEstimate(estimatedTokens);
      
      // Cost estimate (Google Gemini is free, but show for demonstration)
      const embeddingCost = 0; // Free
      const processingCost = estimatedTokens * 0.00001; // Rough estimate for processing
      setCostEstimate({ 
        tokens: estimatedTokens, 
        cost: embeddingCost + processingCost 
      });
    };
    
    calculateEstimates();
  }, [files, textContent]);

  // Poll job status for background processing
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (uploadStatus.jobId && uploadStatus.backgroundProcessing) {
      intervalId = setInterval(async () => {
        try {
          const response = await fetch(`/api/jobs/${uploadStatus.jobId}`);
          const result = await response.json();
          
          if (result.success) {
            const progress = result.data as JobProgress;
            setJobProgress(progress);
            
            if (progress.status === 'complete' || progress.status === 'failed') {
              clearInterval(intervalId);
              setUploadStatus({
                status: progress.status === 'complete' ? 'success' : 'error',
                message: progress.message,
                progress: progress.progress
              });
              setFiles([]);
              setTextContent('');
            }
          }
        } catch (error) {
          console.error('Error polling job status:', error);
        }
      }, 2000); // Poll every 2 seconds
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [uploadStatus.jobId, uploadStatus.backgroundProcessing]);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      const reasons = rejectedFiles.map(({ file, errors }) => 
        `${file.name}: ${errors.map((e: any) => e.message).join(', ')}`
      ).join('; ');
      setUploadStatus({
        status: 'error',
        message: `Some files were rejected: ${reasons}`
      });
      return;
    }

    setFiles(prev => [...prev, ...acceptedFiles]);
    setUploadStatus({ status: 'idle', message: '' });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    maxSize: config.upload.maxFileSize,
    maxFiles: config.upload.maxFiles
  });

  const removeFile = (indexToRemove: number) => {
    setFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const cancelJob = async () => {
    if (uploadStatus.jobId) {
      try {
        await fetch(`/api/jobs/${uploadStatus.jobId}`, { method: 'DELETE' });
        setUploadStatus({ status: 'idle', message: 'Job cancelled' });
        setJobProgress(null);
      } catch (error) {
        console.error('Error cancelling job:', error);
      }
    }
  };

  const handleUpload = async () => {
    if (files.length === 0 && !textContent.trim()) {
      setUploadStatus({
        status: 'error',
        message: 'Please select files or enter text content to upload'
      });
      return;
    }

    setUploadStatus({ 
      status: 'uploading', 
      message: 'Uploading files...', 
      progress: 0 
    });

    try {
      const formData = new FormData();
      
      files.forEach(file => {
        formData.append('files', file);
      });

      if (textContent.trim()) {
        formData.append('textContent', textContent.trim());
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      if (result.data.backgroundProcessing) {
        // Background processing started
        setUploadStatus({
          status: 'processing',
          message: result.data.message,
          progress: 5,
          jobId: result.data.jobId,
          backgroundProcessing: true,
          estimatedTime: result.data.estimatedTime
        });
      } else {
        // Synchronous processing completed
        setUploadStatus({
          status: 'success',
          message: result.data.message,
          progress: 100
        });
        setFiles([]);
        setTextContent('');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Upload failed'
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const getProgressColor = (status: string) => {
    switch (status) {
      case 'uploading': return 'bg-blue-500';
      case 'extracting': return 'bg-yellow-500';
      case 'chunking': return 'bg-orange-500';
      case 'embedding': return 'bg-purple-500';
      case 'indexing': return 'bg-green-500';
      case 'complete': return 'bg-green-600';
      default: return 'bg-blue-500';
    }
  };

  return (
    <div className="space-y-4">
      {/* File Drop Zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive 
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p className="text-gray-600 dark:text-gray-400">
          {isDragActive 
            ? 'Drop the files here...' 
            : 'Drag & drop files here, or click to select'
          }
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
          Supports: .txt, .md, .pdf, .docx (max {formatFileSize(config.upload.maxFileSize)})
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Selected Files ({files.length})
          </h4>
          <div className="space-y-1">
            {files.map((file, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded p-2">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{file.name}</span>
                  <span className="text-xs text-gray-500">({formatFileSize(file.size)})</span>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-red-500 hover:text-red-700 p-1"
                  disabled={uploadStatus.status === 'uploading' || uploadStatus.status === 'processing'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Text Content */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Or paste text content:
        </label>
        <textarea
          value={textContent}
          onChange={(e) => setTextContent(e.target.value)}
          placeholder="Paste your text content here..."
          rows={4}
          disabled={uploadStatus.status === 'uploading' || uploadStatus.status === 'processing'}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
        />
      </div>

      {/* Estimates */}
      {(files.length > 0 || textContent.trim()) && uploadStatus.status === 'idle' && (
        <div className="flex items-center space-x-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
          <div className="flex items-center space-x-1">
            <Zap className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-blue-700 dark:text-blue-400">
              ~{tokenEstimate.toLocaleString()} tokens
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-700 dark:text-green-400">
              FREE (Google Gemini)
            </span>
          </div>
          {tokenEstimate > 50000 && (
            <div className="flex items-center space-x-1">
              <Clock className="w-4 h-4 text-orange-600" />
              <span className="text-sm text-orange-700 dark:text-orange-400">
                Large upload - will use background processing
              </span>
            </div>
          )}
        </div>
      )}

      {/* Upload Button */}
      <div className="flex items-center space-x-2">
        <button
          onClick={handleUpload}
          disabled={uploadStatus.status === 'uploading' || uploadStatus.status === 'processing' || (files.length === 0 && !textContent.trim())}
          className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploadStatus.status === 'uploading' || uploadStatus.status === 'processing' ? 'Processing...' : 'Upload & Process'}
        </button>
        
        {uploadStatus.backgroundProcessing && uploadStatus.status === 'processing' && (
          <button
            onClick={cancelJob}
            className="px-4 py-2 text-red-600 border border-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress Display */}
      {uploadStatus.message && (
        <div className={`flex items-center space-x-2 p-3 rounded-md ${
          uploadStatus.status === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : uploadStatus.status === 'error'
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
        }`}>
          {uploadStatus.status === 'success' && <CheckCircle className="w-5 h-5" />}
          {uploadStatus.status === 'error' && <AlertCircle className="w-5 h-5" />}
          {(uploadStatus.status === 'uploading' || uploadStatus.status === 'processing') && (
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          )}
          <div>
            <span className="text-sm">{uploadStatus.message}</span>
            {(uploadStatus.status === 'uploading' || uploadStatus.status === 'processing') && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Detailed progress information is available in the terminal/console output
              </p>
            )}
          </div>
        </div>
      )}

      {/* Detailed Progress for Background Jobs */}
      {jobProgress && uploadStatus.backgroundProcessing && (
        <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900 dark:text-white">Processing Progress</h4>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {jobProgress.progress}%
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(jobProgress.status)}`}
              style={{ width: `${jobProgress.progress}%` }}
            />
          </div>
          
          {/* Status Message */}
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {jobProgress.message}
          </p>
          
          {/* Metadata */}
          {jobProgress.metadata && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {jobProgress.metadata.totalFiles && (
                <div className="text-center p-2 bg-white dark:bg-gray-700 rounded">
                  <div className="font-medium">{jobProgress.metadata.filesProcessed || 0}/{jobProgress.metadata.totalFiles}</div>
                  <div className="text-gray-500">Files</div>
                </div>
              )}
              {jobProgress.metadata.chunksCreated && (
                <div className="text-center p-2 bg-white dark:bg-gray-700 rounded">
                  <div className="font-medium">{jobProgress.metadata.chunksCreated}</div>
                  <div className="text-gray-500">Chunks</div>
                </div>
              )}
              {jobProgress.metadata.chunksEmbedded !== undefined && (
                <div className="text-center p-2 bg-white dark:bg-gray-700 rounded">
                  <div className="font-medium">{jobProgress.metadata.chunksEmbedded}</div>
                  <div className="text-gray-500">Embedded</div>
                </div>
              )}
              {jobProgress.metadata.chunksIndexed !== undefined && (
                <div className="text-center p-2 bg-white dark:bg-gray-700 rounded">
                  <div className="font-medium">{jobProgress.metadata.chunksIndexed}</div>
                  <div className="text-gray-500">Indexed</div>
                </div>
              )}
            </div>
          )}
          
          {/* Timing */}
          {jobProgress.startTime && (
            <div className="text-xs text-gray-500 text-center">
              {jobProgress.endTime ? (
                `Completed in ${formatTime(jobProgress.endTime - jobProgress.startTime)}`
              ) : (
                `Running for ${formatTime(Date.now() - jobProgress.startTime)}`
              )}
            </div>
          )}
        </div>
      )}

      {/* Processing Time Warning */}
      {files.some(file => file.size > 1024 * 1024) && uploadStatus.status === 'idle' && (
        <div className="flex items-center space-x-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">
            Large files detected. Processing may take several minutes and will run in the background.
          </span>
        </div>
      )}
    </div>
  );
};

export default DocumentUploader;