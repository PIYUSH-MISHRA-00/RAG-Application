import { NextRequest, NextResponse } from 'next/server';
import { getRAGService } from '@/lib/ragService';
import { APIResponse } from '@/lib/types';

export async function GET() {
  try {
    // Check for required environment variables first
    const missingEnvVars = [];
    if (!process.env.PINECONE_API_KEY) missingEnvVars.push('PINECONE_API_KEY');
    if (!process.env.GROQ_API_KEY) missingEnvVars.push('GROQ_API_KEY');
    if (!process.env.GOOGLE_API_KEY) missingEnvVars.push('GOOGLE_API_KEY');
    if (!process.env.COHERE_API_KEY) missingEnvVars.push('COHERE_API_KEY');
    
    if (missingEnvVars.length > 0) {
      return NextResponse.json<APIResponse>({
        success: false,
        error: `Missing required environment variables: ${missingEnvVars.join(', ')}. Please check your .env.local file.`,
        data: {
          status: 'configuration_error',
          missingVariables: missingEnvVars,
          message: 'Please configure all required API keys in .env.local'
        }
      }, { status: 400 });
    }
    
    const ragService = getRAGService();
    const status = await ragService.getSystemStatus();

    return NextResponse.json<APIResponse>({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting system status:', error);
    return NextResponse.json<APIResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get system status'
    }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const ragService = getRAGService();
    await ragService.clearIndex();

    return NextResponse.json<APIResponse>({
      success: true,
      data: { message: 'Index cleared successfully' }
    });
  } catch (error) {
    console.error('Error clearing index:', error);
    return NextResponse.json<APIResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear index'
    }, { status: 500 });
  }
}