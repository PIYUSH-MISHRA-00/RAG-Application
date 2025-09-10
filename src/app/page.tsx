'use client';

import { useState } from 'react';
import DocumentUploader from '@/components/DocumentUploader';
import QueryInterface from '@/components/QueryInterface';
import ResultsDisplay from '@/components/ResultsDisplay';
import SystemStatus from '@/components/SystemStatus';
import { QueryResult } from '@/lib/types';

export default function Home() {
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleQueryResult = (result: QueryResult) => {
    setQueryResult(result);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                RAG Application
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Retrieval-Augmented Generation with Citations
              </p>
            </div>
            <SystemStatus />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Input */}
          <div className="space-y-6">
            {/* Document Upload */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                Upload Documents
              </h2>
              <DocumentUploader />
            </div>

            {/* Query Interface */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                Ask a Question
              </h2>
              <QueryInterface 
                onResult={handleQueryResult}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
              />
            </div>
          </div>

          {/* Right Column - Results */}
          <div className="space-y-6">
            {queryResult ? (
              <ResultsDisplay result={queryResult} />
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No queries yet
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Upload some documents and ask a question to get started.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-900 border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Built with Next.js, Pinecone, OpenAI, Groq, and Cohere
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Developed by Piyush Mishra
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
