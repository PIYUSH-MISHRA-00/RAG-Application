import { NextRequest, NextResponse } from 'next/server';
import { getBackgroundProcessingService } from '@/lib/backgroundProcessing';
import { APIResponse } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { jobId } = resolvedParams;
    
    if (!jobId) {
      return NextResponse.json<APIResponse>({
        success: false,
        error: 'Job ID is required'
      }, { status: 400 });
    }

    const backgroundService = getBackgroundProcessingService();
    const jobStatus = backgroundService.getJobStatus(jobId);
    
    if (!jobStatus) {
      return NextResponse.json<APIResponse>({
        success: false,
        error: 'Job not found'
      }, { status: 404 });
    }

    return NextResponse.json<APIResponse>({
      success: true,
      data: jobStatus
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    return NextResponse.json<APIResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get job status'
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { jobId } = resolvedParams;
    
    if (!jobId) {
      return NextResponse.json<APIResponse>({
        success: false,
        error: 'Job ID is required'
      }, { status: 400 });
    }

    const backgroundService = getBackgroundProcessingService();
    const cancelled = backgroundService.cancelJob(jobId);
    
    if (!cancelled) {
      return NextResponse.json<APIResponse>({
        success: false,
        error: 'Job could not be cancelled (not found or already completed)'
      }, { status: 400 });
    }

    return NextResponse.json<APIResponse>({
      success: true,
      data: { message: 'Job cancelled successfully' }
    });
  } catch (error) {
    console.error('Error cancelling job:', error);
    return NextResponse.json<APIResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel job'
    }, { status: 500 });
  }
}