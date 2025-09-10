'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileText, AlertCircle, CheckCircle, Clock, Database, Copy, Check } from 'lucide-react';
import { config } from '@/lib/config';

interface UploadStatus {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  message: string;
  progress?: number;
}

interface DetailedProgress {
  step: string;
  message: string;
  timestamp: number;
  progress?: number;
}

const DocumentUploader: React.FC = () => {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ 
    status: 'idle', 
    message: '' 
  });
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
  const [textContent, setTextContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [detailedProgress, setDetailedProgress] = useState<DetailedProgress[]>([]);
  const [showDetails, setShowDetails] = useState(true); // Show details by default
  const [copied, setCopied] = useState(false);
  const [detailedLogs, setDetailedLogs] = useState<string[]>([]); // Store detailed logs from backend

  // Add detailed progress message
  const addDetailedProgress = (step: string, message: string, progress?: number) => {
    const newProgress: DetailedProgress = {
      step,
      message,
      timestamp: Date.now(),
      progress
    };
    
    setDetailedProgress(prev => [...prev, newProgress]);
    console.log(`[${step}] ${message}`); // Log to console as well
  };

  // Copy detailed logs to clipboard
  const copyLogsToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(detailedLogs.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs:', err);
    }
  };

  // Poll progress from backend more frequently
  const pollProgress = async (id: string) => {
    let finished = false;
    let lastProgress = 0;
    let stagnantCount = 0;
    
    while (!finished) {
      try {
        const res = await fetch(`/api/upload/progress?uploadId=${id}`);
        const data = await res.json();
        if (data.success && data.data) {
          // Always update the UI with new data, but be more responsive to changes
          setUploadStatus({
            status: data.data.status === 'completed' ? 'success' : (data.data.status === 'error' ? 'error' : 'processing'),
            message: data.data.message,
            progress: data.data.progress
          });
          
          // Add detailed progress (always add, not just when changed)
          addDetailedProgress('Progress', data.data.message, data.data.progress);
          
          // Update detailed logs if available
          if (data.data.detailedLogs && data.data.detailedLogs.length > 0) {
            setDetailedLogs(data.data.detailedLogs);
          }
          
          // Update tracking variables
          lastProgress = data.data.progress || 0;
          stagnantCount = 0;
          
          if (data.data.estimatedTimeRemaining) {
            setEstimatedTime(data.data.estimatedTimeRemaining);
          }
          if (data.data.status === 'completed' || data.data.status === 'error') {
            finished = true;
            setFiles([]);
            setTextContent('');
            setUploadId(null);
            addDetailedProgress(
              data.data.status === 'completed' ? 'Complete' : 'Error', 
              data.data.status === 'completed' ? 'Processing completed successfully' : 'Processing failed'
            );
          }
        } else {
          setUploadStatus({ status: 'error', message: data.error || 'Progress error' });
          addDetailedProgress('Error', data.error || 'Progress error');
          finished = true;
        }
      } catch (err) {
        setUploadStatus({ status: 'error', message: 'Progress polling failed' });
        addDetailedProgress('Error', 'Progress polling failed');
        finished = true;
      }
      // Poll more frequently for better real-time updates (every 300ms)
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  };

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      const reasons = rejectedFiles.map(({ file, errors }) => 
        `${file.name}: ${errors.map((e: any) => e.message).join(', ')}`
      ).join('; ');
      setUploadStatus({
        status: 'error',
        message: `Some files were rejected: ${reasons}`
      });
      addDetailedProgress('Error', `Some files were rejected: ${reasons}`);
      return;
    }

    setFiles(prev => [...prev, ...acceptedFiles]);
    setUploadStatus({ status: 'idle', message: '' });
    setDetailedProgress([]);
    setDetailedLogs([]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/pdf': ['.pdf']
    },
    maxSize: config.upload.maxFileSize,
    maxFiles: config.upload.maxFiles
  });

  const removeFile = (indexToRemove: number) => {
    setFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleUpload = async () => {
    if (files.length === 0 && !textContent.trim()) {
      setUploadStatus({
        status: 'error',
        message: 'Please select files or enter text content to upload'
      });
      addDetailedProgress('Error', 'Please select files or enter text content to upload');
      return;
    }

    setUploadStatus({ status: 'uploading', message: 'Uploading and processing...', progress: 0 });
    setEstimatedTime(null);
    setDetailedProgress([]);
    setDetailedLogs([]);
    addDetailedProgress('Start', 'Upload process started');

    try {
      const formData = new FormData();
      
      files.forEach(file => {
        formData.append('files', file);
      });

      if (textContent.trim()) {
        formData.append('textContent', textContent.trim());
      }

      // Show initial progress
      setUploadStatus({ status: 'uploading', message: 'Uploading files...', progress: 5 });
      addDetailedProgress('Upload', 'Uploading files...', 5);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      // Show processing progress
      setUploadStatus({ status: 'processing', message: 'Processing documents and generating embeddings...', progress: 10 });
      addDetailedProgress('Processing', 'Processing documents and generating embeddings...', 10);

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      // If we have detailed logs in the response, use them
      if (result.data && result.data.detailedLogs) {
        setDetailedLogs(result.data.detailedLogs);
      }

      // Start polling for progress
      if (result.data.uploadId) {
        setUploadId(result.data.uploadId);
        addDetailedProgress('Background', `Background processing started with ID: ${result.data.uploadId}`);
        pollProgress(result.data.uploadId);
      } else {
        // Synchronous processing completed
        setUploadStatus({
          status: 'success',
          message: result.data.message,
          progress: 100
        });
        addDetailedProgress('Complete', result.data.message, 100);
        setFiles([]);
        setTextContent('');
      }

    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Upload failed'
      });
      addDetailedProgress('Error', error instanceof Error ? error.message : 'Upload failed');
      setUploadId(null);
      setEstimatedTime(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const clearDetails = () => {
    setDetailedProgress([]);
    setDetailedLogs([]);
  };

  return (
    <div className="space-y-4">
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
          Supports: .txt, .md, .docx, .pdf (max {formatFileSize(config.upload.maxFileSize)})<br/>
          <span className="text-blue-600 dark:text-blue-400">
            All document types are now supported with improved processing speed.
          </span>
        </p>
      </div>

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
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Or paste text content:
        </label>
        <textarea
          value={textContent}
          onChange={(e) => setTextContent(e.target.value)}
          placeholder="Paste your text content here..."
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={uploadStatus.status === 'uploading' || uploadStatus.status === 'processing' || (files.length === 0 && !textContent.trim())}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {uploadStatus.status === 'uploading' || uploadStatus.status === 'processing' ? 'Processing...' : 'Upload & Process'}
      </button>

      {/* Processing time warning for large files */}
      {files.some(file => file.size > 1024 * 1024) && uploadStatus.status === 'idle' && (
        <div className="flex items-center space-x-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">
            Large files detected. Processing may take several minutes depending on file size and content.
          </span>
        </div>
      )}

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
          <div className="flex-1">
            <span className="text-sm">{uploadStatus.message}</span>
            {(uploadStatus.status === 'uploading' || uploadStatus.status === 'processing') && (
              <div className="mt-2">
                <button 
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {showDetails ? 'Hide' : 'Show'} detailed progress
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detailed Progress Panel */}
      {showDetails && (uploadStatus.status === 'uploading' || uploadStatus.status === 'processing') && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
              <Database className="w-4 h-4 mr-1" />
              Detailed Processing Information
            </h4>
            <div className="flex space-x-2">
              <button 
                onClick={copyLogsToClipboard}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center"
              >
                {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                {copied ? 'Copied' : 'Copy Logs'}
              </button>
              <button 
                onClick={clearDetails}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Clear
              </button>
              <button 
                onClick={() => setShowDetails(false)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Hide
              </button>
            </div>
          </div>
          
          <div className="text-xs bg-black text-green-400 p-3 rounded font-mono max-h-60 overflow-y-auto">
            {/* Display backend detailed logs if available */}
            {detailedLogs.length > 0 ? (
              detailedLogs.map((log, index) => (
                <div key={index} className="mb-1 last:mb-0">
                  {log}
                </div>
              ))
            ) : (
              /* Fallback to frontend detailed progress */
              <>
                {detailedProgress.map((progress, index) => (
                  <div key={index} className="mb-1 last:mb-0">
                    <span className="text-gray-400">
                      [{new Date(progress.timestamp).toLocaleTimeString()}]
                    </span>{' '}
                    <span className="text-yellow-400">[{progress.step}]</span>{' '}
                    <span>{progress.message}</span>
                    {progress.progress !== undefined && (
                      <span className="text-cyan-400"> ({progress.progress}%)</span>
                    )}
                  </div>
                ))}
                {detailedProgress.length === 0 && (
                  <div className="text-gray-500">No detailed progress information yet...</div>
                )}
              </>
            )}
          </div>
          
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            <p>This information is also available in your browser's console.</p>
          </div>
        </div>
      )}

      {uploadStatus.status === 'uploading' && uploadStatus.progress !== undefined && (
        <>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadStatus.progress}%` }}
            />
          </div>
          {estimatedTime !== null && (
            <div className="text-xs text-gray-500 mt-1 flex items-center">
              <Clock className="w-3 h-3 mr-1" />
              Estimated time remaining: {Math.ceil(estimatedTime / 1000)}s
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DocumentUploader;