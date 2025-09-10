import { NextRequest, NextResponse } from 'next/server';
import { getRAGService } from '@/lib/ragService';
import { UploadedFile, APIResponse } from '@/lib/types';
import { createTextExtractor } from '@/lib/textExtractor';
import crypto from 'crypto';
import { updateUploadProgress } from './progress/route';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Processing upload request...');
    
    // Parse form data
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const textContent = formData.get('textContent') as string | null;
    
    if (files.length === 0 && !textContent) {
      return NextResponse.json<APIResponse>({ 
        success: false, 
        error: 'No files or text content provided' 
      }, { status: 400 });
    }

    console.log(`📁 Received ${files.length} files for processing`);
    
    const ragService = getRAGService();
    console.log('Initializing RAG system...');
    await ragService.initialize();
    
    const textExtractor = createTextExtractor();
    const uploadedFiles: UploadedFile[] = [];
    
    // Process uploaded files
    for (const file of files) {
      if (!(file instanceof File)) continue;
      
      console.log(`📄 Processing file: ${file.name} (${file.type}, ${file.size} bytes)`);
      
      let content: string;
      
      try {
        // Convert File to Buffer for text extraction
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Extract text content based on file type
        content = await textExtractor.extractText(buffer, file.name, file.type);
        
        if (!content || content.trim().length === 0) {
          throw new Error('No text content could be extracted');
        }
        
        // Calculate hash for deduplication
        const contentHash = crypto.createHash('sha256').update(content).digest('hex');
        
        console.log(`✅ Extracted ${content.length} characters from ${file.name}`);
        console.log(`🔑 Content hash: ${contentHash.substring(0, 8)}...`);
        
        uploadedFiles.push({
          name: file.name,
          size: file.size,
          type: file.type,
          content: content.trim(),
          lastModified: Date.now(),
          contentHash
        });
      } catch (error: any) {
        console.error(`❌ Error processing file ${file.name}:`, error);
        return NextResponse.json<APIResponse>({
          success: false,
          error: `Failed to extract content from ${file.name}: ${error.message || error}`
        }, { status: 400 });
      }
    }
    
    // Process text content if provided
    if (textContent && textContent.trim()) {
      const contentHash = crypto.createHash('sha256').update(textContent).digest('hex');
      
      uploadedFiles.push({
        name: 'pasted-text.txt',
        size: textContent.length,
        type: 'text/plain',
        content: textContent.trim(),
        lastModified: Date.now(),
        contentHash
      });
      
      console.log(`📝 Added pasted text content (${textContent.length} characters)`);
    }
    
    // Check for duplicates based on content hash
    const uniqueFiles = await ragService.filterDuplicateFiles(uploadedFiles);
    const duplicateCount = uploadedFiles.length - uniqueFiles.length;
    
    if (duplicateCount > 0) {
      console.log(`🔄 Skipping ${duplicateCount} duplicate files`);
    }
    
    if (uniqueFiles.length === 0) {
      return NextResponse.json<APIResponse>({
        success: true,
        data: {
          message: 'All files were already processed (duplicates)',
          filesProcessed: 0,
          duplicatesSkipped: duplicateCount,
          totalSize: 0,
          contentLength: 0
        }
      });
    }
    
    // Calculate total content size for validation
    const totalContentLength = uniqueFiles.reduce((sum, file) => sum + file.content.length, 0);
    console.log(`📊 Processing ${uniqueFiles.length} unique files with ${totalContentLength} total characters`);
    
    // For large documents, use background processing
    const BACKGROUND_THRESHOLD = 250000; // 250KB of text content
    const shouldUseBackground = totalContentLength > BACKGROUND_THRESHOLD || uniqueFiles.length > 3;
    
    if (shouldUseBackground) {
      console.log(`📤 Using background processing for large upload (${totalContentLength} chars)`);
      
      // Generate a unique upload ID
      const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      
      // Start background processing
      processInBackground(uniqueFiles, uploadId, duplicateCount);
      
      return NextResponse.json<APIResponse>({
        success: true,
        data: {
          uploadId,
          message: `Background processing started for ${uniqueFiles.length} files${duplicateCount > 0 ? ` (${duplicateCount} duplicates skipped)` : ''}`,
          filesQueued: uniqueFiles.length,
          duplicatesSkipped: duplicateCount,
          totalSize: uniqueFiles.reduce((sum, file) => sum + file.size, 0),
          contentLength: totalContentLength,
          estimatedTime: Math.ceil(totalContentLength / 10000) * 1000, // Rough estimate
          backgroundProcessing: true
        }
      });
    }
    
    // For smaller files, process synchronously with progress updates
    console.log(`⚡ Processing ${uniqueFiles.length} files synchronously...`);
    
    // Process and index files with progress tracking
    const processingStartTime = Date.now();
    const detailedLogs: string[] = [];
    
    // Capture console logs during processing
    const originalConsoleLog = console.log;
    console.log = (...args: any[]) => {
      const logMessage = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      detailedLogs.push(logMessage);
      originalConsoleLog(...args);
    };
    
    try {
      // Clear existing index before processing new files to ensure fresh start
      console.log('Clearing existing index for fresh document processing...');
      await ragService.clearIndex();
      console.log('Existing index cleared successfully');
      
      await ragService.processAndIndexFiles(uniqueFiles, (status) => {
        console.log(`📊 Progress: ${status.progress}% - ${status.message}`);
      });
    } finally {
      // Restore original console.log
      console.log = originalConsoleLog;
    }
    
    const processingTime = Date.now() - processingStartTime;
    
    console.log(`✅ Successfully processed ${uniqueFiles.length} files in ${processingTime}ms`);
    
    return NextResponse.json<APIResponse>({
      success: true,
      data: {
        message: `Successfully processed ${uniqueFiles.length} files${duplicateCount > 0 ? ` (${duplicateCount} duplicates skipped)` : ''}`,
        filesProcessed: uniqueFiles.length,
        duplicatesSkipped: duplicateCount,
        totalSize: uniqueFiles.reduce((sum, file) => sum + file.size, 0),
        contentLength: totalContentLength,
        processingTime,
        backgroundProcessing: false,
        detailedLogs // Include detailed logs in the response
      }
    });
  } catch (error) {
    console.error('❌ Error in upload API:', error);
    
    return NextResponse.json<APIResponse>({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Upload failed. Please try again.' 
    }, { status: 500 });
  }
}

// Background processing function with better progress tracking
async function processInBackground(
  files: UploadedFile[], 
  uploadId: string, 
  duplicateCount: number
) {
  try {
    // Initialize progress
    updateUploadProgress(
      uploadId,
      'processing',
      0,
      'Initializing processing...',
      {
        totalChunks: files.length,
        processedChunks: 0
      }
    );
    
    const ragService = getRAGService();
    console.log('Initializing RAG system...');
    await ragService.initialize();
    
    // Clear existing index before processing new files to ensure fresh start
    console.log('Clearing existing index for fresh document processing...');
    await ragService.clearIndex();
    console.log('Existing index cleared successfully');
    
    // Capture detailed logs during processing
    const detailedLogs: string[] = [];
    
    // Capture console logs during processing
    const originalConsoleLog = console.log;
    console.log = (...args: any[]) => {
      const logMessage = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      detailedLogs.push(logMessage);
      originalConsoleLog(...args);
    };
    
    try {
      // Process files with progress updates
      await ragService.processAndIndexFiles(files, (status) => {
        updateUploadProgress(
          uploadId,
          'processing', // Fixed: was status.status which doesn't exist
          status.progress || 0,
          status.message,
          {
            totalChunks: status.totalDocuments,
            processedChunks: status.documentsProcessed,
            estimatedTimeRemaining: status.progress ? Math.round((100 - status.progress) * 100) : undefined
          }
        );
      });
    } finally {
      // Restore original console.log
      console.log = originalConsoleLog;
    }
    
    // Mark as completed
    updateUploadProgress(
      uploadId,
      'completed',
      100,
      `Successfully processed ${files.length} files${duplicateCount > 0 ? ` (${duplicateCount} duplicates skipped)` : ''}`,
      {
        totalChunks: files.length,
        processedChunks: files.length
      }
    );
  } catch (error: any) {
    console.error('❌ Error in background processing:', error);
    updateUploadProgress(
      uploadId,
      'error',
      0,
      `Error processing files: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        totalChunks: files.length,
        processedChunks: 0
      }
    );
  }
}