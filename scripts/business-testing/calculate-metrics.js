#!/usr/bin/env node

/**
 * Metrics Calculator V2 - Implements client's specification
 * 
 * Per-Problem Metrics:
 * 1. Success Rate: Max(Generation)/Intended
 * 2. Find Good Ideas (Top Score): Max(Score)
 * 3. Search Efficiently: Max(Score) * 1000 / SUM(Tokens)
 * 4. Have Variability in Ideas: AVG(STD(Score) by Generation)
 * 5. Think About Good Ideas (First Score): AVG(Score) WHERE Generation = 1
 * 6. Good Improving Process: (Last Gen AVG - First Gen AVG) / SUM(Tokens from Gen 2 to Last)
 * 
 * General Statistics:
 * - Uses MEDIAN instead of AVG for all metrics
 * 
 * Per-Generation Metrics:
 * - Success Rate, Token Usage, Scores, Variability, Improvement
 */

import fs from 'fs/promises';
import path from 'path';

// Helper function to calculate standard deviation
function standardDeviation(values) {
  if (!values || values.length === 0) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// Helper function to calculate median
function median(values) {
  if (!values || values.length === 0) return 0;
  
  const validValues = values.filter(val => val !== null && val !== undefined && !isNaN(val));
  if (validValues.length === 0) return 0;
  
  const sorted = [...validValues].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

// Helper function to calculate average
function average(values) {
  if (!values || values.length === 0) return 0;
  const validValues = values.filter(val => val !== null && val !== undefined && !isNaN(val));
  if (validValues.length === 0) return 0;
  return validValues.reduce((sum, val) => sum + val, 0) / validValues.length;
}

// Extract scores from a generation
function extractScores(generation) {
  const scores = [];
  if (generation.solutions && Array.isArray(generation.solutions)) {
    generation.solutions.forEach(solution => {
      if (typeof solution.score === 'number') {
        scores.push(solution.score);
      }
    });
  }
  return scores;
}

// Calculate per-problem metrics
export function calculatePerProblemMetrics(jobResult, intendedGenerations = 20) {
  const metrics = {
    jobId: jobResult.jobId || jobResult.id,
    problemId: jobResult.problemId,
    problemContext: jobResult.problemContext,
    successRate: 0,
    findGoodIdeas: 0,
    searchEfficiently: 0,
    haveVariability: 0,
    thinkAboutGoodIdeas: 0,
    goodImprovingProcess: 0,
    // Raw data for debugging
    maxGeneration: 0,
    totalTokens: 0,
    firstGenAvgScore: 0,
    lastGenAvgScore: 0,
    tokensFromGen2ToLast: 0
  };

  // Extract generation data
  const generations = [];
  if (jobResult.generations && typeof jobResult.generations === 'object') {
    const genKeys = Object.keys(jobResult.generations).sort();
    genKeys.forEach(key => {
      const gen = jobResult.generations[key];
      if (gen) {
        generations.push({
          generation: gen.generation || parseInt(key),
          scores: extractScores(gen),
          topScore: gen.topScore || 0,
          avgScore: gen.avgScore || 0,
          tokens: 0 // Will calculate from API calls
        });
      }
    });
  }

  if (generations.length === 0) {
    return metrics;
  }

  // Calculate token usage per generation from API calls
  if (jobResult.apiCalls && Array.isArray(jobResult.apiCalls)) {
    jobResult.apiCalls.forEach(call => {
      const gen = call.generation || 1;
      const genData = generations.find(g => g.generation === gen);
      if (genData && call.tokens && call.tokens.total_tokens) {
        genData.tokens += call.tokens.total_tokens;
        metrics.totalTokens += call.tokens.total_tokens;
      }
    });
  }

  // 1. Success Rate: Max(Generation) / Intended
  metrics.maxGeneration = Math.max(...generations.map(g => g.generation));
  metrics.successRate = metrics.maxGeneration / intendedGenerations;

  // 2. Find Good Ideas: Max(Score)
  const allScores = generations.flatMap(g => g.scores);
  metrics.findGoodIdeas = allScores.length > 0 ? Math.max(...allScores) : 0;

  // 3. Search Efficiently: Max(Score) * 1000 / SUM(Tokens)
  if (metrics.totalTokens > 0) {
    metrics.searchEfficiently = (metrics.findGoodIdeas * 1000) / metrics.totalTokens;
  }

  // 4. Have Variability: AVG(STD(Score) by Generation)
  const stdDeviations = generations.map(g => standardDeviation(g.scores));
  metrics.haveVariability = average(stdDeviations);

  // 5. Think About Good Ideas: AVG(Score) WHERE Generation = 1
  const firstGen = generations.find(g => g.generation === 1);
  if (firstGen && firstGen.scores.length > 0) {
    metrics.thinkAboutGoodIdeas = average(firstGen.scores);
    metrics.firstGenAvgScore = metrics.thinkAboutGoodIdeas;
  }

  // 6. Good Improving Process: (Last Gen AVG - First Gen AVG) / SUM(Tokens from Gen 2 to Last)
  const lastGen = generations[generations.length - 1];
  if (lastGen && lastGen.scores.length > 0) {
    metrics.lastGenAvgScore = average(lastGen.scores);
    
    // Calculate tokens from generation 2 to last
    metrics.tokensFromGen2ToLast = generations
      .filter(g => g.generation > 1)
      .reduce((sum, g) => sum + g.tokens, 0);
    
    if (metrics.tokensFromGen2ToLast > 0) {
      metrics.goodImprovingProcess = 
        (metrics.lastGenAvgScore - metrics.firstGenAvgScore) / metrics.tokensFromGen2ToLast;
    }
  }

  return metrics;
}

// Calculate general statistics (using medians)
export function calculateGeneralStatistics(perProblemMetrics) {
  // Extract metrics from wrapper objects if necessary
  const metrics = perProblemMetrics.map(m => m.metrics || m);
  
  return {
    successRate: average(metrics.map(m => m.successRate)), // AVG as specified
    findGoodIdeas: median(metrics.map(m => m.findGoodIdeas)),
    searchEfficiently: median(metrics.map(m => m.searchEfficiently)),
    haveVariability: median(metrics.map(m => m.haveVariability)),
    thinkAboutGoodIdeas: median(metrics.map(m => m.thinkAboutGoodIdeas)),
    goodImprovingProcess: median(metrics.map(m => m.goodImprovingProcess)),
    // Additional context
    totalProblems: metrics.length,
    successfulProblems: metrics.filter(m => m.successRate === 1).length
  };
}

// Calculate per-generation metrics across all problems
export function calculatePerGenerationMetrics(jobResults, totalProblems = 30) {
  const generationMap = new Map();
  
  // Organize data by generation
  jobResults.forEach(job => {
    if (job.generations && typeof job.generations === 'object') {
      Object.keys(job.generations).forEach(key => {
        const gen = job.generations[key];
        const genNum = gen.generation || parseInt(key);
        
        if (!generationMap.has(genNum)) {
          generationMap.set(genNum, {
            generation: genNum,
            problems: [],
            tokensUsed: [],
            maxScores: [],
            avgScores: [],
            stdScores: []
          });
        }
        
        const genData = generationMap.get(genNum);
        const scores = extractScores(gen);
        
        if (scores.length > 0) {
          genData.problems.push(job.problemId || job.jobId);
          genData.maxScores.push(Math.max(...scores));
          genData.avgScores.push(average(scores));
          genData.stdScores.push(standardDeviation(scores));
        }
        
        // Get token usage for this generation
        let genTokens = 0;
        if (job.apiCalls && Array.isArray(job.apiCalls)) {
          job.apiCalls.forEach(call => {
            if (call.generation === genNum && call.tokens && call.tokens.total_tokens) {
              genTokens += call.tokens.total_tokens;
            }
          });
        }
        if (genTokens > 0) {
          genData.tokensUsed.push(genTokens);
        }
      });
    }
  });
  
  // Calculate metrics for each generation
  const perGenerationMetrics = [];
  const sortedGenerations = Array.from(generationMap.keys()).sort((a, b) => a - b);
  
  let lastGenMedianAvgScore = 0;
  
  sortedGenerations.forEach((genNum, index) => {
    const genData = generationMap.get(genNum);
    
    const metrics = {
      generation: genNum,
      successRate: genData.problems.length / totalProblems,
      medianTokenUsed: median(genData.tokensUsed),
      findGoodIdeas: median(genData.maxScores),
      medianAvgScore: median(genData.avgScores),
      haveVariability: median(genData.stdScores),
      goodImprovingProcess: 0,
      problemsReporting: genData.problems.length
    };
    
    // Good Improving Process: (This Gen Median AVG - Last Gen Median AVG) / Median(Tokens)
    if (index > 0 && metrics.medianTokenUsed > 0) {
      metrics.goodImprovingProcess = 
        (metrics.medianAvgScore - lastGenMedianAvgScore) / metrics.medianTokenUsed;
    }
    
    lastGenMedianAvgScore = metrics.medianAvgScore;
    perGenerationMetrics.push(metrics);
  });
  
  return perGenerationMetrics;
}

// Add version metadata to results
export function addVersionMetadata(result, config = {}) {
  return {
    ...result,
    version: {
      model: config.model || 'o3',
      modelVersion: 'o3-2024-12-17',
      service: config.serviceVersion || '1.0.0',
      config: config.configName || 'baseline-v2',
      timestamp: new Date().toISOString()
    }
  };
}

// Main function to process all metrics
export async function processAllMetrics(jobResults, config = {}) {
  const intendedGenerations = config.intendedGenerations || 20;
  const totalProblems = config.totalProblems || 30;
  
  // Calculate per-problem metrics
  const perProblemMetrics = jobResults.map(job => 
    calculatePerProblemMetrics(job, intendedGenerations)
  );
  
  // Calculate general statistics
  const generalStats = calculateGeneralStatistics(perProblemMetrics);
  
  // Calculate per-generation metrics
  const perGenerationMetrics = calculatePerGenerationMetrics(jobResults, totalProblems);
  
  // Combine all metrics with version metadata
  const result = {
    perProblem: perProblemMetrics,
    generalStatistics: generalStats,
    perGeneration: perGenerationMetrics,
    metadata: {
      totalProblems: jobResults.length,
      intendedGenerations,
      calculatedAt: new Date().toISOString()
    }
  };
  
  return addVersionMetadata(result, config);
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    try {
      const inputFile = process.argv[2];
      if (!inputFile) {
        console.error('Usage: calculate-metrics-v2.js <input-results.json> [output-metrics.json]');
        process.exit(1);
      }
      
      const outputFile = process.argv[3] || inputFile.replace('.json', '-metrics-v2.json');
      
      // Load job results
      const jobResults = JSON.parse(await fs.readFile(inputFile, 'utf-8'));
      
      // Process metrics
      const metrics = await processAllMetrics(
        Array.isArray(jobResults) ? jobResults : [jobResults],
        {
          serviceVersion: '1.0.0',
          configName: 'client-metrics-v2'
        }
      );
      
      // Save results
      await fs.writeFile(outputFile, JSON.stringify(metrics, null, 2));
      console.log(`Metrics calculated and saved to: ${outputFile}`);
      
    } catch (error) {
      console.error('Error calculating metrics:', error);
      process.exit(1);
    }
  }
  
  main();
}