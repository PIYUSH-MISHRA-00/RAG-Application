import { NextRequest, NextResponse } from 'next/server';
import { APIResponse } from '@/lib/types';

// In-memory progress store (in production, use Redis or similar)
const progressStore = new Map<string, {
  status: 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  totalChunks?: number;
  processedChunks?: number;
  estimatedTimeRemaining?: number;
  detailedLogs?: string[]; // Add detailed logs to progress tracking
}>();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uploadId = searchParams.get('uploadId');

    if (!uploadId) {
      return NextResponse.json<APIResponse>({
        success: false,
        error: 'Upload ID is required'
      }, { status: 400 });
    }

    const progress = progressStore.get(uploadId);
    
    if (!progress) {
      return NextResponse.json<APIResponse>({
        success: false,
        error: 'Upload progress not found'
      }, { status: 404 });
    }

    return NextResponse.json<APIResponse>({
      success: true,
      data: progress
    });

  } catch (error) {
    console.error('Error getting upload progress:', error);
    return NextResponse.json<APIResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get progress'
    }, { status: 500 });
  }
}

// Helper function to update progress (called by upload process)
export function updateUploadProgress(
  uploadId: string, 
  status: 'processing' | 'completed' | 'error',
  progress: number,
  message: string,
  additionalData?: {
    totalChunks?: number;
    processedChunks?: number;
    estimatedTimeRemaining?: number;
    detailedLogs?: string[]; // Add detailed logs parameter
  }
) {
  const existingProgress = progressStore.get(uploadId);
  
  progressStore.set(uploadId, {
    status,
    progress,
    message,
    ...additionalData,
    detailedLogs: additionalData?.detailedLogs || (existingProgress ? existingProgress.detailedLogs : []) || []
  });

  // Clean up completed/error entries after 5 minutes
  if (status === 'completed' || status === 'error') {
    setTimeout(() => {
      progressStore.delete(uploadId);
    }, 5 * 60 * 1000);
  }
}