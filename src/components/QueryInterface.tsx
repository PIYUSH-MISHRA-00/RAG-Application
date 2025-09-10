'use client';

import React, { useState, useEffect } from 'react';
import { Send, Loader, Settings, Clock, DollarSign } from 'lucide-react';
import { QueryResult } from '@/lib/types';

interface QueryInterfaceProps {
  onResult: (result: QueryResult) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

interface QueryOptions {
  useMMR: boolean;
  useReranking: boolean;
  topK: number;
  rerankedK: number;
  includeMetrics: boolean;
}

const QueryInterface: React.FC<QueryInterfaceProps> = ({ onResult, isLoading, setIsLoading }) => {
  const [query, setQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [options, setOptions] = useState<QueryOptions>({
  useMMR: false,
  useReranking: false,
    topK: 10,
    rerankedK: 3,
    includeMetrics: true
  });
  const [error, setError] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);

  // Load query history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('query-history');
    if (saved) {
      try {
        setQueryHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load query history:', e);
      }
    }
  }, []);

  const saveQueryToHistory = (query: string) => {
    const newHistory = [query, ...queryHistory.filter(q => q !== query)].slice(0, 10);
    setQueryHistory(newHistory);
    localStorage.setItem('query-history', JSON.stringify(newHistory));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!query.trim()) {
      setError('Please enter a question');
      return;
    }

    setError(null);
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          options
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Query failed');
      }

      if (data.success && data.data) {
  onResult(data.data);
        saveQueryToHistory(query.trim());
        setQuery(''); // Clear the input after successful query
      } else {
        throw new Error('Invalid response format');
      }

    } catch (error) {
      console.error('Query error:', error);
      setError(error instanceof Error ? error.message : 'Query failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleHistoryClick = (historicalQuery: string) => {
    setQuery(historicalQuery);
  };

  const clearHistory = () => {
    setQueryHistory([]);
    localStorage.removeItem('query-history');
  };

  return (
    <div className="space-y-4">
      {/* Main Query Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask a question about your documents... (Ctrl+Enter to submit)"
            rows={3}
            className="w-full px-3 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white resize-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="absolute bottom-2 right-2 p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Advanced Options Toggle */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            <Settings className="w-4 h-4" />
            <span>Advanced Options</span>
          </button>
          
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Ctrl+Enter to submit
          </div>
        </div>

        {/* Advanced Options Panel */}
        {showAdvanced && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-4 space-y-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Query Configuration</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* MMR Toggle */}
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={options.useMMR}
                  onChange={(e) => setOptions(prev => ({ ...prev, useMMR: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Use MMR for diversity</span>
              </label>

              {/* Reranking Toggle */}
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={options.useReranking}
                  onChange={(e) => setOptions(prev => ({ ...prev, useReranking: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Use reranking</span>
              </label>

              {/* Top K */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Initial retrieval (top-k)</label>
                <input
                  type="number"
                  value={options.topK}
                  onChange={(e) => setOptions(prev => ({ ...prev, topK: parseInt(e.target.value) || 10 }))}
                  min={1}
                  max={50}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-white"
                />
              </div>

              {/* Reranked K */}
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Final results</label>
                <input
                  type="number"
                  value={options.rerankedK}
                  onChange={(e) => setOptions(prev => ({ ...prev, rerankedK: parseInt(e.target.value) || 3 }))}
                  min={1}
                  max={options.topK}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-white"
                />
              </div>
            </div>
          </div>
        )}
      </form>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Query History */}
      {queryHistory.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Recent Queries</h4>
            <button
              onClick={clearHistory}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              Clear
            </button>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {queryHistory.map((historicalQuery, index) => (
              <button
                key={index}
                onClick={() => handleHistoryClick(historicalQuery)}
                className="w-full text-left text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded px-2 py-1 transition-colors"
              >
                {historicalQuery.length > 80 ? `${historicalQuery.slice(0, 80)}...` : historicalQuery}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sample Queries */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Sample Questions</h4>
        <div className="space-y-1">
          {[
            "What is the main topic of these documents?",
            "Summarize the key findings or conclusions",
            "What are the important dates or events mentioned?",
            "Are there any specific recommendations or actions suggested?"
          ].map((sample, index) => (
            <button
              key={index}
              onClick={() => setQuery(sample)}
              disabled={isLoading}
              className="w-full text-left text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QueryInterface;
