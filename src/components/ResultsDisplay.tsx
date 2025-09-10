'use client';

import React, { useState } from 'react';
import { QueryResult } from '@/lib/types';
import { 
  Clock, 
  DollarSign, 
  FileText, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp,
  Copy,
  Check,
  BarChart3
} from 'lucide-react';

interface ResultsDisplayProps {
  result: QueryResult;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result }) => {
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [showMetrics, setShowMetrics] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggleSource = (sourceId: string) => {
    const newExpanded = new Set(expandedSources);
    if (newExpanded.has(sourceId)) {
      newExpanded.delete(sourceId);
    } else {
      newExpanded.add(sourceId);
    }
    setExpandedSources(newExpanded);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(result.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const formatCost = (cost: number) => {
    return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(4)}`;
  };

  const formatTime = (ms: number) => {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  };

  const getFileTypeIcon = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return '📄';
      case 'docx':
        return '📝';
      case 'md':
      case 'markdown':
        return '📋';
      case 'txt':
      case 'text':
        return '📄';
      default:
        return '📄';
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Answer */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Answer
          </h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={copyToClipboard}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              title="Copy answer"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowMetrics(!showMetrics)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              title="Show metrics"
            >
              <BarChart3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="prose dark:prose-invert max-w-none">
          <div className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
            {result.answer}
          </div>
        </div>

        {/* Query Info */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium">Query:</span>
            <span className="ml-2 italic">&ldquo;{result.query}&rdquo;</span>
          </div>
          <div className="flex items-center text-xs text-gray-400 dark:text-gray-500 mt-1">
            <Clock className="w-3 h-3 mr-1" />
            <span>{new Date(result.timestamp).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      {showMetrics && result.metrics && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Performance Metrics
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {formatTime(result.metrics.totalTime)}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Total Time</div>
            </div>
            
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {formatTime(result.metrics.retrievalTime)}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Retrieval</div>
            </div>
            
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {formatTime(result.metrics.rerankingTime)}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Reranking</div>
            </div>
            
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {formatTime(result.metrics.llmTime)}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">LLM</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Token Usage */}
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Token Usage</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Input:</span>
                  <span className="font-mono">{result.metrics.tokensUsed.input.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Output:</span>
                  <span className="font-mono">{result.metrics.tokensUsed.output.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-medium pt-1 border-t border-gray-200 dark:border-gray-600">
                  <span className="text-gray-700 dark:text-gray-300">Total:</span>
                  <span className="font-mono">{result.metrics.tokensUsed.total.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Cost Estimate</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Embedding:</span>
                  <span className="font-mono">{formatCost(result.metrics.costEstimate.embedding)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">LLM:</span>
                  <span className="font-mono">{formatCost(result.metrics.costEstimate.llm)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Reranking:</span>
                  <span className="font-mono">{formatCost(result.metrics.costEstimate.reranking)}</span>
                </div>
                <div className="flex justify-between font-medium pt-1 border-t border-gray-200 dark:border-gray-600">
                  <span className="text-gray-700 dark:text-gray-300">Total:</span>
                  <span className="font-mono">{formatCost(result.metrics.costEstimate.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Citations */}
      {result.citations.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Citations ({result.citations.length})
          </h3>
          
          <div className="space-y-3">
            {result.citations.map((citation) => (
              <div 
                key={citation.id} 
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm font-medium rounded-full">
                      {citation.id}
                    </span>
                    <div>
                      <span className="font-medium text-gray-900 dark:text-white">{citation.source}</span>
                      {citation.section && (
                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">• {citation.section}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed ml-8">
                  {citation.text.length > 200 ? (
                    <>
                      {citation.text.slice(0, 200)}...
                      <button className="text-blue-600 dark:text-blue-400 ml-1 hover:underline">
                        read more
                      </button>
                    </>
                  ) : (
                    citation.text
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source Documents */}
      {result.sources.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Source Documents ({result.sources.length})
          </h3>
          
          <div className="space-y-3">
            {result.sources.map((source) => (
              <div key={source.id} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <button
                  onClick={() => toggleSource(source.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">{getFileTypeIcon(source.fileType)}</span>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{source.title}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {source.relevantChunks.length} relevant section{source.relevantChunks.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  
                  {expandedSources.has(source.id) ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                
                {expandedSources.has(source.id) && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
                    {source.relevantChunks.map((citationId, index) => {
                      // Find the citation for this chunk
                      const citation = result.citations.find(c => c.id === citationId);
                      // Find the retrieval result for score information
                      const retrievalResult = result.retrievalResults.find(r => 
                        r.chunk.metadata.source === citation?.source && 
                        r.chunk.content === citation?.text
                      );
                      
                      if (!citation) return null;
                      
                      return (
                        <div key={index} className="pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                          <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                            {citation.text}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Relevance: {retrievalResult ? (retrievalResult.score * 100).toFixed(1) : 'N/A'}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsDisplay;
