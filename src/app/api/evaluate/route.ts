import { NextRequest, NextResponse } from 'next/server';
import { createEvaluationService } from '@/lib/evaluation';
import { APIResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { useCustomDocuments = true } = body;

    const evaluationService = createEvaluationService();
    const report = await evaluationService.runEvaluation(useCustomDocuments);

    return NextResponse.json<APIResponse>({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error running evaluation:', error);
    return NextResponse.json<APIResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Evaluation failed'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json<APIResponse>({
    success: true,
    data: {
      message: 'Evaluation endpoint is ready',
      description: 'POST request to run RAG system evaluation with 5 Q/A pairs',
      parameters: {
        useCustomDocuments: 'boolean (optional) - Upload sample documents for testing, default: true'
      }
    }
  });
}