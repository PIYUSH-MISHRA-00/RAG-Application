import { NextRequest, NextResponse } from 'next/server';
import { getBackgroundProcessingService } from '@/lib/backgroundProcessing';
import { APIResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const backgroundService = getBackgroundProcessingService();
    const activeJobs = backgroundService.getActiveJobs();
    const stats = backgroundService.getStats();
    
    return NextResponse.json<APIResponse>({
      success: true,
      data: {
        activeJobs,
        stats
      }
    });
  } catch (error) {
    console.error('Error getting jobs:', error);
    return NextResponse.json<APIResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get jobs'
    }, { status: 500 });
  }
}