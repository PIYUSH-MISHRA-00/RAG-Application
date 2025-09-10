import { QueryResult } from './types';
import { getRAGService } from './ragService';

/**
 * Evaluation dataset for testing RAG system performance
 */

interface EvaluationPair {
  id: string;
  question: string;
  expectedAnswer: string;
  expectedCitations: string[];
  category: 'factual' | 'analytical' | 'summary' | 'specific' | 'general';
  difficulty: 'easy' | 'medium' | 'hard';
  requiredDocuments?: string[];
}

interface EvaluationResult {
  pair: EvaluationPair;
  actualResult: QueryResult;
  scores: {
    relevance: number; // 0-1: How relevant is the answer
    completeness: number; // 0-1: How complete is the answer
    accuracy: number; // 0-1: How accurate is the answer
    citations: number; // 0-1: Quality of citations
    overall: number; // 0-1: Overall score
  };
  feedback: string;
  timestamp: string;
}

interface EvaluationReport {
  totalQuestions: number;
  successfulAnswers: number;
  averageScores: {
    relevance: number;
    completeness: number;
    accuracy: number;
    citations: number;
    overall: number;
  };
  categoryBreakdown: Record<string, { count: number; averageScore: number }>;
  detailedResults: EvaluationResult[];
  recommendations: string[];
  timestamp: string;
}

/**
 * Gold standard evaluation dataset
 */
export const evaluationDataset: EvaluationPair[] = [
  {
    id: 'eval-001',
    question: 'What are the main benefits of using renewable energy sources?',
    expectedAnswer: 'Renewable energy sources offer several key benefits including environmental sustainability, reduced greenhouse gas emissions, energy independence, cost-effectiveness over time, and job creation in green industries.',
    expectedCitations: ['environmental benefits', 'economic advantages', 'sustainability'],
    category: 'factual',
    difficulty: 'easy'
  },
  {
    id: 'eval-002', 
    question: 'How do machine learning algorithms improve over time, and what are the key factors that influence their performance?',
    expectedAnswer: 'Machine learning algorithms improve through training on larger datasets, feature engineering, hyperparameter tuning, and algorithmic improvements. Key factors include data quality, quantity, feature selection, model architecture, and computational resources.',
    expectedCitations: ['training processes', 'performance factors', 'optimization techniques'],
    category: 'analytical',
    difficulty: 'medium'
  },
  {
    id: 'eval-003',
    question: 'Summarize the key findings and recommendations from the latest research on climate change mitigation strategies.',
    expectedAnswer: 'Recent research emphasizes the need for rapid decarbonization, renewable energy transition, carbon capture technologies, policy reforms, and international cooperation. Key recommendations include achieving net-zero emissions by 2050, massive investment in clean energy, and implementation of carbon pricing mechanisms.',
    expectedCitations: ['research findings', 'mitigation strategies', 'policy recommendations'],
    category: 'summary',
    difficulty: 'hard'
  },
  {
    id: 'eval-004',
    question: 'What specific methodologies are mentioned for data collection in qualitative research?',
    expectedAnswer: 'Specific methodologies for qualitative data collection include in-depth interviews, focus groups, participant observation, ethnographic studies, case studies, document analysis, and narrative inquiry.',
    expectedCitations: ['interview methods', 'observation techniques', 'analysis approaches'],
    category: 'specific',
    difficulty: 'medium'
  },
  {
    id: 'eval-005',
    question: 'What are the main themes discussed in the uploaded documents?',
    expectedAnswer: 'The main themes should be identified based on the actual content of uploaded documents, covering the primary topics, concepts, and subjects discussed across the document collection.',
    expectedCitations: ['document sections', 'thematic content'],
    category: 'general',
    difficulty: 'easy'
  }
];

/**
 * Sample documents for evaluation testing
 */
export const sampleDocuments = {
  renewableEnergy: `
Renewable Energy: A Comprehensive Overview

Renewable energy sources have emerged as crucial solutions for addressing climate change and energy security challenges. This document explores the various types of renewable energy and their benefits.

Types of Renewable Energy:
1. Solar Energy: Harnesses sunlight through photovoltaic cells
2. Wind Energy: Utilizes wind currents through turbines
3. Hydroelectric Power: Generates electricity from flowing water
4. Geothermal Energy: Exploits heat from the Earth's core
5. Biomass: Converts organic matter into energy

Environmental Benefits:
Renewable energy sources produce minimal greenhouse gas emissions compared to fossil fuels. They help reduce air pollution, water contamination, and environmental degradation. The use of renewables contributes significantly to climate change mitigation efforts.

Economic Advantages:
While initial investment costs can be high, renewable energy systems offer long-term cost savings. They create jobs in manufacturing, installation, and maintenance sectors. Many regions have experienced economic growth through renewable energy investments.

Challenges and Solutions:
Intermittency issues with solar and wind can be addressed through energy storage technologies and smart grid systems. Government policies and incentives play crucial roles in renewable energy adoption.
`,

  machineLearning: `
Machine Learning: Fundamentals and Performance Optimization

Machine learning algorithms are computational methods that enable systems to learn and improve from experience without being explicitly programmed.

Training Processes:
Algorithms learn through iterative training on datasets. The process involves:
- Data preprocessing and cleaning
- Feature selection and engineering
- Model training and validation
- Performance evaluation and tuning

Performance Factors:
Several factors influence ML algorithm performance:
1. Data Quality: Clean, relevant, and representative data is crucial
2. Data Quantity: Larger datasets generally improve model performance
3. Feature Engineering: Well-designed features enhance learning
4. Model Architecture: Appropriate algorithm selection for the problem
5. Hyperparameter Tuning: Optimization of model parameters
6. Computational Resources: Sufficient processing power and memory

Optimization Techniques:
- Cross-validation for robust model evaluation
- Regularization to prevent overfitting
- Ensemble methods for improved accuracy
- Transfer learning for leveraging pre-trained models

Continuous Improvement:
ML models improve through feedback loops, additional training data, and algorithmic refinements. Regular monitoring and updating ensure sustained performance.
`,

  climateResearch: `
Climate Change Mitigation: Latest Research Findings and Strategies

Recent scientific research has provided new insights into effective climate change mitigation strategies.

Key Research Findings:
1. Rapid Decarbonization: Studies show the need for immediate and dramatic reduction in carbon emissions
2. Renewable Energy Transition: Research confirms renewables can meet global energy demands
3. Carbon Capture Technologies: New developments in direct air capture and storage
4. Natural Climate Solutions: Forests and ecosystems play crucial roles in carbon sequestration

Mitigation Strategies:
- Energy Efficiency: Improving efficiency across all sectors
- Electrification: Transitioning transport and heating to electricity
- Industrial Innovation: Developing clean technologies for heavy industries
- Sustainable Agriculture: Reducing emissions from food production

Policy Recommendations:
1. Implement carbon pricing mechanisms globally
2. Phase out fossil fuel subsidies
3. Invest heavily in clean energy infrastructure
4. Establish binding international agreements
5. Support developing countries in green transitions

Timeline Goals:
Research indicates that achieving net-zero emissions by 2050 is critical for limiting global warming to 1.5°C. This requires unprecedented cooperation and investment.
`,

  qualitativeResearch: `
Qualitative Research Methods: Data Collection Methodologies

Qualitative research employs various methodologies to gather rich, descriptive data about human experiences and social phenomena.

Interview Methods:
- In-depth Interviews: One-on-one conversations exploring individual perspectives
- Semi-structured Interviews: Flexible format with predetermined topics
- Life History Interviews: Biographical approach to understanding experiences
- Expert Interviews: Gathering insights from knowledgeable individuals

Observation Techniques:
- Participant Observation: Researcher actively participates in the setting
- Non-participant Observation: Researcher observes without direct involvement
- Ethnographic Studies: Immersive long-term observation of cultures
- Structured Observation: Systematic recording of specific behaviors

Group Methods:
- Focus Groups: Facilitated discussions with 6-12 participants
- Focus Group Interviews: In-depth group conversations
- Community Forums: Larger group discussions on shared issues

Document Analysis:
- Historical Document Review: Examining archival materials
- Content Analysis: Systematic examination of texts
- Narrative Analysis: Studying stories and personal accounts
- Visual Analysis: Interpreting images, videos, and artifacts

Analysis Approaches:
- Thematic Analysis: Identifying patterns and themes
- Grounded Theory: Developing theory from data
- Phenomenological Analysis: Understanding lived experiences
- Case Study Method: In-depth examination of specific instances
`
};

/**
 * Evaluation service for testing RAG performance
 */
export class EvaluationService {
  private ragService = getRAGService();

  /**
   * Run the complete evaluation suite
   */
  async runEvaluation(useCustomDocuments: boolean = false): Promise<EvaluationReport> {
    console.log('Starting RAG system evaluation...');
    
    // Initialize the system
    await this.ragService.initialize();
    
    // Upload sample documents if requested
    if (useCustomDocuments) {
      await this.setupSampleDocuments();
    }
    
    const results: EvaluationResult[] = [];
    
    for (const pair of evaluationDataset) {
      console.log(`Evaluating question: ${pair.question}`);
      
      try {
        const actualResult = await this.ragService.query(pair.question, {
          useMMR: true,
          useReranking: true,
          topK: 10,
          rerankedK: 3,
          includeMetrics: true
        });
        
        const scores = this.evaluateAnswer(pair, actualResult);
        
        results.push({
          pair,
          actualResult,
          scores,
          feedback: this.generateFeedback(pair, actualResult, scores),
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`Error evaluating question ${pair.id}:`, error);
        
        // Create a failed result
        results.push({
          pair,
          actualResult: {
            query: pair.question,
            answer: 'Error: Failed to generate answer',
            citations: [],
            sources: [],
            retrievalResults: [],
            metrics: {
              totalTime: 0,
              retrievalTime: 0,
              rerankingTime: 0,
              llmTime: 0,
              embeddingTime: 0,
              tokensUsed: { input: 0, output: 0, total: 0 },
              costEstimate: { embedding: 0, llm: 0, reranking: 0, total: 0 }
            },
            timestamp: new Date().toISOString()
          },
          scores: {
            relevance: 0,
            completeness: 0,
            accuracy: 0,
            citations: 0,
            overall: 0
          },
          feedback: `Failed to process question: ${error}`,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return this.generateReport(results);
  }
  
  /**
   * Setup sample documents for evaluation
   */
  private async setupSampleDocuments(): Promise<void> {
    const files = Object.entries(sampleDocuments).map(([name, content]) => ({
      name: `${name}.txt`,
      size: content.length,
      type: 'text/plain',
      content,
      lastModified: Date.now()
    }));
    
    await this.ragService.processAndIndexFiles(files);
    console.log('Sample documents uploaded and indexed');
  }
  
  /**
   * Evaluate a single answer against expected results
   */
  private evaluateAnswer(pair: EvaluationPair, result: QueryResult) {
    const scores = {
      relevance: this.evaluateRelevance(pair, result),
      completeness: this.evaluateCompleteness(pair, result),
      accuracy: this.evaluateAccuracy(pair, result),
      citations: this.evaluateCitations(pair, result),
      overall: 0
    };
    
    // Calculate overall score (weighted average)
    scores.overall = (
      scores.relevance * 0.3 +
      scores.completeness * 0.25 +
      scores.accuracy * 0.25 +
      scores.citations * 0.2
    );
    
    return scores;
  }
  
  /**
   * Evaluate answer relevance (keyword overlap and semantic similarity)
   */
  private evaluateRelevance(pair: EvaluationPair, result: QueryResult): number {
    if (!result.answer || result.answer.includes('Error:') || result.answer.includes("don't have")) {
      return 0;
    }
    
    // Simple keyword-based relevance (can be enhanced with semantic similarity)
    const questionKeywords = this.extractKeywords(pair.question);
    const answerKeywords = this.extractKeywords(result.answer);
    const expectedKeywords = this.extractKeywords(pair.expectedAnswer);
    
    const questionOverlap = this.calculateOverlap(questionKeywords, answerKeywords);
    const expectedOverlap = this.calculateOverlap(expectedKeywords, answerKeywords);
    
    return Math.min(1, (questionOverlap + expectedOverlap) / 2);
  }
  
  /**
   * Evaluate answer completeness
   */
  private evaluateCompleteness(pair: EvaluationPair, result: QueryResult): number {
    if (!result.answer || result.answer.includes('Error:')) {
      return 0;
    }
    
    // Length-based completeness (basic approach)
    const answerLength = result.answer.length;
    const expectedLength = pair.expectedAnswer.length;
    
    if (answerLength === 0) return 0;
    
    // Optimal range: 70-130% of expected length
    const ratio = answerLength / expectedLength;
    if (ratio >= 0.7 && ratio <= 1.3) {
      return 1;
    } else if (ratio >= 0.5 && ratio <= 1.5) {
      return 0.7;
    } else {
      return 0.3;
    }
  }
  
  /**
   * Evaluate answer accuracy (keyword presence and structure)
   */
  private evaluateAccuracy(pair: EvaluationPair, result: QueryResult): number {
    if (!result.answer || result.answer.includes('Error:')) {
      return 0;
    }
    
    const expectedKeywords = this.extractKeywords(pair.expectedAnswer);
    const actualKeywords = this.extractKeywords(result.answer);
    
    const keywordScore = this.calculateOverlap(expectedKeywords, actualKeywords);
    
    // Check for factual accuracy indicators
    const hasNumbers = /\d+/.test(result.answer);
    const hasSpecificTerms = expectedKeywords.some(keyword => 
      result.answer.toLowerCase().includes(keyword.toLowerCase())
    );
    
    let accuracyBonus = 0;
    if (hasNumbers && pair.category === 'factual') accuracyBonus += 0.1;
    if (hasSpecificTerms) accuracyBonus += 0.1;
    
    return Math.min(1, keywordScore + accuracyBonus);
  }
  
  /**
   * Evaluate citation quality
   */
  private evaluateCitations(pair: EvaluationPair, result: QueryResult): number {
    const citationCount = result.citations.length;
    const sourceCount = result.sources.length;
    
    if (citationCount === 0) return 0;
    
    // Base score for having citations
    let score = 0.3;
    
    // Points for appropriate number of citations (2-4 is ideal)
    if (citationCount >= 2 && citationCount <= 4) {
      score += 0.4;
    } else if (citationCount === 1) {
      score += 0.2;
    }
    
    // Points for having sources
    if (sourceCount > 0) {
      score += 0.2;
    }
    
    // Check if citations are properly integrated
    const hasCitationMarkers = /\[\d+\]/.test(result.answer);
    if (hasCitationMarkers) {
      score += 0.1;
    }
    
    return Math.min(1, score);
  }
  
  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
    ]);
    
    return text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }
  
  /**
   * Calculate keyword overlap between two sets
   */
  private calculateOverlap(keywords1: string[], keywords2: string[]): number {
    if (keywords1.length === 0 || keywords2.length === 0) return 0;
    
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    
    return intersection.size / Math.max(set1.size, set2.size);
  }
  
  /**
   * Generate feedback for a single evaluation result
   */
  private generateFeedback(pair: EvaluationPair, result: QueryResult, scores: any): string {
    const feedback: string[] = [];
    
    if (scores.overall >= 0.8) {
      feedback.push('Excellent performance - high-quality answer with good citations.');
    } else if (scores.overall >= 0.6) {
      feedback.push('Good performance - answer addresses the question adequately.');
    } else if (scores.overall >= 0.4) {
      feedback.push('Fair performance - answer partially addresses the question.');
    } else {
      feedback.push('Poor performance - answer does not adequately address the question.');
    }
    
    if (scores.relevance < 0.5) {
      feedback.push('Improve relevance by better matching question keywords and intent.');
    }
    
    if (scores.completeness < 0.5) {
      feedback.push('Answer lacks completeness - consider providing more comprehensive information.');
    }
    
    if (scores.citations < 0.5) {
      feedback.push('Improve citation quality and ensure proper source attribution.');
    }
    
    return feedback.join(' ');
  }
  
  /**
   * Generate comprehensive evaluation report
   */
  private generateReport(results: EvaluationResult[]): EvaluationReport {
    const totalQuestions = results.length;
    const successfulAnswers = results.filter(r => r.scores.overall > 0.3).length;
    
    // Calculate average scores
    const avgScores = {
      relevance: results.reduce((sum, r) => sum + r.scores.relevance, 0) / totalQuestions,
      completeness: results.reduce((sum, r) => sum + r.scores.completeness, 0) / totalQuestions,
      accuracy: results.reduce((sum, r) => sum + r.scores.accuracy, 0) / totalQuestions,
      citations: results.reduce((sum, r) => sum + r.scores.citations, 0) / totalQuestions,
      overall: results.reduce((sum, r) => sum + r.scores.overall, 0) / totalQuestions
    };
    
    // Category breakdown
    const categoryBreakdown: Record<string, { count: number; averageScore: number }> = {};
    
    for (const result of results) {
      const category = result.pair.category;
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = { count: 0, averageScore: 0 };
      }
      categoryBreakdown[category].count++;
      categoryBreakdown[category].averageScore += result.scores.overall;
    }
    
    Object.keys(categoryBreakdown).forEach(category => {
      categoryBreakdown[category].averageScore /= categoryBreakdown[category].count;
    });
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (avgScores.overall < 0.6) {
      recommendations.push('Overall performance needs improvement. Consider fine-tuning retrieval and reranking parameters.');
    }
    
    if (avgScores.relevance < 0.5) {
      recommendations.push('Improve retrieval relevance by adjusting embedding model or search parameters.');
    }
    
    if (avgScores.citations < 0.5) {
      recommendations.push('Enhance citation generation and source attribution in the LLM prompts.');
    }
    
    if (successfulAnswers / totalQuestions < 0.8) {
      recommendations.push('Increase document coverage and improve no-answer detection.');
    }
    
    return {
      totalQuestions,
      successfulAnswers,
      averageScores: avgScores,
      categoryBreakdown,
      detailedResults: results,
      recommendations,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Export evaluation utilities
 */
export function createEvaluationService(): EvaluationService {
  return new EvaluationService();
}