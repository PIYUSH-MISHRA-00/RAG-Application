import { NextRequest, NextResponse } from 'next/server';
import { getRAGService } from '@/lib/ragService';
import { APIResponse, QueryResult } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // 1 minute

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, options = {} } = body;

    console.log('Received query request:', { query, options });

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      console.log('Invalid query received');
      return NextResponse.json<APIResponse>({
        success: false,
        error: 'Query is required and must be a non-empty string'
      }, { status: 400 });
    }

    const ragService = getRAGService();
    console.log('Initializing RAG service...');
    await ragService.initialize();

    // Use optimized defaults for faster responses
    console.log('Processing query with options:', {
      useMMR: options.useMMR ?? true,
      useReranking: options.useReranking ?? true,
      topK: options.topK ?? 3, // Reduced from default
      rerankedK: options.rerankedK ?? 1, // Reduced from default
      includeMetrics: options.includeMetrics ?? true
    });
    
    const result = await ragService.query(query.trim(), {
      useMMR: options.useMMR ?? true,
      useReranking: options.useReranking ?? true,
      topK: options.topK ?? 3, // Reduced from default
      rerankedK: options.rerankedK ?? 1, // Reduced from default
      includeMetrics: options.includeMetrics ?? true
    });

    console.log('Query processed successfully:', result);
    
    return NextResponse.json<APIResponse<QueryResult>>({
      success: true,
      data: result,
      metrics: result.metrics
    });

  } catch (error) {
    console.error('Error in query API:', error);
    return NextResponse.json<APIResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Query failed'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json<APIResponse>({
    success: true,
    data: {
      message: 'Query endpoint is ready',
      supportedMethods: ['POST'],
      parameters: {
        query: 'string (required) - The question to ask',
        options: {
          useMMR: 'boolean (optional) - Use MMR for diversity, default: true',
          useReranking: 'boolean (optional) - Use reranking, default: true',
          topK: 'number (optional) - Initial retrieval count, default: 3',
          rerankedK: 'number (optional) - Final result count, default: 1',
          includeMetrics: 'boolean (optional) - Include performance metrics, default: true'
        }
      }
    }
  });
}