'use client';

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Database, 
  Zap, 
  Brain, 
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface SystemStatusData {
  status: string;
  indexStats?: {
    totalVectorCount: number;
    dimension: number;
  };
  configuration?: {
    chunking: any;
    vectorDb: any;
    retrieval: any;
    llm: any;
    reranker: any;
  };
  services?: {
    retriever: any;
    reranker: any;
    llm: any;
    embedding: any;
  };
  timestamp: string;
  error?: string;
}

const SystemStatus: React.FC = () => {
  const [statusData, setStatusData] = useState<SystemStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      
      if (data.success) {
        setStatusData(data.data);
        setLastRefresh(new Date());
      } else {
        console.error('Failed to fetch status:', data.error);
      }
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'operational':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-yellow-500';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="w-4 h-4" />;
      case 'error':
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center space-x-2 px-3 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      >
        <Activity className="w-4 h-4" />
        <span>System Status</span>
        {statusData && (
          <span className={`${getStatusColor(statusData.status)}`}>
            {getStatusIcon(statusData.status)}
          </span>
        )}
      </button>

      {showDetails && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                System Status
              </h3>
              <button
                onClick={fetchStatus}
                disabled={isLoading}
                className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {statusData ? (
              <div className="space-y-4">
                {/* Overall Status */}
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Overall Status</span>
                  <div className={`flex items-center space-x-1 ${getStatusColor(statusData.status)}`}>
                    {getStatusIcon(statusData.status)}
                    <span className="capitalize font-medium">{statusData.status}</span>
                  </div>
                </div>

                {/* Vector Database Stats */}
                {statusData.indexStats && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-700 dark:text-gray-300 flex items-center">
                      <Database className="w-4 h-4 mr-1" />
                      Vector Database
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <div className="text-gray-600 dark:text-gray-400">Documents</div>
                        <div className="font-mono font-medium">
                          {formatNumber(statusData.indexStats.totalVectorCount || 0)}
                        </div>
                      </div>
                      <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <div className="text-gray-600 dark:text-gray-400">Dimensions</div>
                        <div className="font-mono font-medium">
                          {statusData.indexStats.dimension || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Service Status */}
                {statusData.services && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-700 dark:text-gray-300">Services</h4>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center">
                          <Brain className="w-3 h-3 mr-1 text-blue-500" />
                          <span>LLM ({statusData.services.llm?.model})</span>
                        </div>
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center">
                          <Zap className="w-3 h-3 mr-1 text-purple-500" />
                          <span>Embeddings ({statusData.services.embedding?.model})</span>
                        </div>
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center">
                          <Search className="w-3 h-3 mr-1 text-orange-500" />
                          <span>Reranker ({statusData.services.reranker?.model})</span>
                        </div>
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Configuration Summary */}
                {statusData.configuration && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-700 dark:text-gray-300">Configuration</h4>
                    <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                      <div>Chunk Size: {statusData.configuration.chunking?.chunkSize} tokens</div>
                      <div>Retrieval: Top-{statusData.configuration.retrieval?.topK} → {statusData.configuration.retrieval?.rerankedK}</div>
                      <div>Temperature: {statusData.configuration.llm?.temperature}</div>
                    </div>
                  </div>
                )}

                {/* Last Updated */}
                <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-600">
                  Last updated: {lastRefresh ? lastRefresh.toLocaleTimeString() : 'Never'}
                </div>

                {/* Error Display */}
                {statusData.error && (
                  <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm">
                    <div className="font-medium text-red-700 dark:text-red-400">Error</div>
                    <div className="text-red-600 dark:text-red-300">{statusData.error}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <RefreshCw className="w-8 h-8 mx-auto mb-2 text-gray-400 animate-spin" />
                  <div className="text-sm text-gray-500 dark:text-gray-400">Loading status...</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {showDetails && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowDetails(false)}
        />
      )}
    </div>
  );
};

export default SystemStatus;
