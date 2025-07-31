#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

class ResultsAggregator {
  constructor() {
    this.apiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    this.results = [];
  }

  async loadSummary(summaryPath) {
    const summaryData = await fs.readFile(summaryPath, 'utf-8');
    return JSON.parse(summaryData);
  }

  async fetchJobResult(jobId) {
    try {
      const response = await axios.get(`${this.apiUrl}/api/evolution/results/${jobId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch results for job ${jobId}:`, error.message);
      return null;
    }
  }

  calculateKPIs(jobResult) {
    const kpis = {
      jobId: jobResult.jobId || jobResult.id,
      problemId: jobResult.problemContext,
      
      // Overall Idea Quality - Top Score
      topScore: 0,
      
      // Search Efficiency - Top Score / Total Tokens
      totalTokens: 0,
      searchEfficiency: 0,
      
      // Idea Variability - Score Standard Deviation
      scoreStdDev: 0,
      allScores: [],
      
      // Initial Idea Quality - Generation 1 Average Score
      generation1AvgScore: 0,
      
      // Evolutionary Improvement - Average ΔScore per Generation
      avgScoreImprovement: 0,
      scoreProgression: []
    };

    // Calculate total tokens from API calls
    if (jobResult.apiCalls && Array.isArray(jobResult.apiCalls)) {
      jobResult.apiCalls.forEach(call => {
        if (call.tokens && call.tokens.total_tokens) {
          kpis.totalTokens += call.tokens.total_tokens;
        }
      });
    }

    // Process each generation (stored as object properties)
    if (jobResult.generations && typeof jobResult.generations === 'object') {
      const generationKeys = Object.keys(jobResult.generations).sort();
      
      generationKeys.forEach((genKey, genIndex) => {
        const generation = jobResult.generations[genKey];
        const genScores = [];
        
        // Extract scores from solutions
        if (generation.solutions && Array.isArray(generation.solutions)) {
          generation.solutions.forEach(solution => {
            if (solution.score !== undefined) {
              genScores.push(solution.score);
              kpis.allScores.push(solution.score);
            }
          });
        }
        
        // Use generation's calculated metrics
        if (generation.topScore !== undefined) {
          kpis.scoreProgression.push({
            generation: generation.generation || (genIndex + 1),
            maxScore: generation.topScore,
            avgScore: generation.avgScore || 0,
            solutionCount: generation.solutionCount || genScores.length
          });
          
          // Update top score
          if (generation.topScore > kpis.topScore) {
            kpis.topScore = generation.topScore;
          }
          
          // Capture generation 1 average
          if (genIndex === 0 && generation.avgScore !== undefined) {
            kpis.generation1AvgScore = generation.avgScore;
          }
        }
      });
    }
    
    // Calculate derived metrics
    if (kpis.allScores.length > 0) {
      // Calculate standard deviation
      const mean = kpis.allScores.reduce((a, b) => a + b, 0) / kpis.allScores.length;
      const variance = kpis.allScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / kpis.allScores.length;
      kpis.scoreStdDev = Math.sqrt(variance);
      
      // Calculate search efficiency
      if (kpis.totalTokens > 0) {
        kpis.searchEfficiency = kpis.topScore / kpis.totalTokens;
      }
      
      // Calculate average improvement per generation
      if (kpis.scoreProgression.length > 1) {
        let totalImprovement = 0;
        for (let i = 1; i < kpis.scoreProgression.length; i++) {
          totalImprovement += kpis.scoreProgression[i].maxScore - kpis.scoreProgression[i-1].maxScore;
        }
        kpis.avgScoreImprovement = totalImprovement / (kpis.scoreProgression.length - 1);
      }
    }
    
    // Add metadata
    kpis.apiCalls = jobResult.apiCalls ? jobResult.apiCalls.length : 0;
    kpis.totalGenerations = jobResult.generations ? Object.keys(jobResult.generations).length : 0;
    
    return kpis;
  }

  async aggregateResults(summaryPath) {
    console.log('Results Aggregator');
    console.log('==================');
    
    // Load summary
    const summary = await this.loadSummary(summaryPath);
    console.log(`\nLoaded summary from: ${summaryPath}`);
    console.log(`Test name: ${summary.config.name}`);
    console.log(`Completed jobs: ${summary.jobIds.length}`);
    
    // Create output directories
    const testDir = path.dirname(summaryPath);
    const rawDir = path.join(testDir, 'raw');
    await fs.mkdir(rawDir, { recursive: true });
    
    // Fetch and process each job
    const jobKPIs = [];
    
    for (let i = 0; i < summary.jobIds.length; i++) {
      const jobId = summary.jobIds[i];
      console.log(`\nProcessing job ${i + 1}/${summary.jobIds.length}: ${jobId}`);
      
      // Fetch job results
      const jobResult = await this.fetchJobResult(jobId);
      
      if (jobResult) {
        // Save raw result
        const rawPath = path.join(rawDir, `${jobId}.json`);
        await fs.writeFile(rawPath, JSON.stringify(jobResult, null, 2));
        
        // Calculate KPIs
        const kpis = this.calculateKPIs(jobResult);
        jobKPIs.push(kpis);
        
        console.log(`  Top Score: ${kpis.topScore.toFixed(2)}`);
        console.log(`  Total Tokens: ${kpis.totalTokens}`);
        console.log(`  Search Efficiency: ${kpis.searchEfficiency.toFixed(6)}`);
      }
    }
    
    // Calculate aggregate KPIs
    const aggregateKPIs = this.calculateAggregateKPIs(jobKPIs);
    
    // Save KPIs
    const kpisPath = path.join(testDir, 'kpis.json');
    await fs.writeFile(kpisPath, JSON.stringify({
      summary: {
        testName: summary.config.name,
        config: summary.config.evolutionConfig,
        timestamp: summary.timestamp,
        duration: summary.duration,
        totalJobs: summary.jobIds.length
      },
      aggregate: aggregateKPIs,
      perJob: jobKPIs
    }, null, 2));
    
    console.log(`\n\nAggregate KPIs saved to: ${kpisPath}`);
    this.printAggregateKPIs(aggregateKPIs);
    
    return aggregateKPIs;
  }

  calculateAggregateKPIs(jobKPIs) {
    if (jobKPIs.length === 0) {
      return null;
    }
    
    const aggregate = {
      // Average Top Score (Primary KPI)
      avgTopScore: 0,
      minTopScore: Infinity,
      maxTopScore: -Infinity,
      
      // Average Search Efficiency
      avgSearchEfficiency: 0,
      
      // Average Score Standard Deviation
      avgScoreStdDev: 0,
      
      // Average Generation 1 Score
      avgGeneration1Score: 0,
      
      // Average Score Improvement per Generation
      avgScoreImprovement: 0,
      
      // Token usage stats
      avgTokensPerJob: 0,
      totalTokensUsed: 0,
      
      // API call stats
      avgApiCallsPerJob: 0,
      totalApiCalls: 0
    };
    
    // Sum up values
    jobKPIs.forEach(kpi => {
      aggregate.avgTopScore += kpi.topScore;
      aggregate.minTopScore = Math.min(aggregate.minTopScore, kpi.topScore);
      aggregate.maxTopScore = Math.max(aggregate.maxTopScore, kpi.topScore);
      
      aggregate.avgSearchEfficiency += kpi.searchEfficiency;
      aggregate.avgScoreStdDev += kpi.scoreStdDev;
      aggregate.avgGeneration1Score += kpi.generation1AvgScore;
      aggregate.avgScoreImprovement += kpi.avgScoreImprovement;
      
      aggregate.totalTokensUsed += kpi.totalTokens;
      aggregate.totalApiCalls += kpi.apiCalls;
    });
    
    // Calculate averages
    const count = jobKPIs.length;
    aggregate.avgTopScore /= count;
    aggregate.avgSearchEfficiency /= count;
    aggregate.avgScoreStdDev /= count;
    aggregate.avgGeneration1Score /= count;
    aggregate.avgScoreImprovement /= count;
    aggregate.avgTokensPerJob = aggregate.totalTokensUsed / count;
    aggregate.avgApiCallsPerJob = aggregate.totalApiCalls / count;
    
    // Round for readability
    Object.keys(aggregate).forEach(key => {
      if (typeof aggregate[key] === 'number' && !Number.isInteger(aggregate[key])) {
        aggregate[key] = Math.round(aggregate[key] * 1000) / 1000;
      }
    });
    
    return aggregate;
  }

  printAggregateKPIs(kpis) {
    console.log('\nAggregate KPIs');
    console.log('==============');
    console.log(`Average Top Score: ${kpis.avgTopScore.toFixed(2)} (min: ${kpis.minTopScore.toFixed(2)}, max: ${kpis.maxTopScore.toFixed(2)})`);
    console.log(`Average Search Efficiency: ${kpis.avgSearchEfficiency.toFixed(6)}`);
    console.log(`Average Score Std Dev: ${kpis.avgScoreStdDev.toFixed(2)}`);
    console.log(`Average Generation 1 Score: ${kpis.avgGeneration1Score.toFixed(2)}`);
    console.log(`Average Score Improvement/Gen: ${kpis.avgScoreImprovement.toFixed(2)}`);
    console.log(`Average Tokens per Job: ${kpis.avgTokensPerJob.toFixed(0)}`);
    console.log(`Total Tokens Used: ${kpis.totalTokensUsed}`);
  }
}

// Main execution
async function main() {
  const summaryPath = process.argv[2];
  
  if (!summaryPath) {
    console.error('Usage: node aggregate-results.js <summary-path>');
    console.error('Example: node aggregate-results.js test/business/results/baseline/summary.json');
    process.exit(1);
  }
  
  try {
    const aggregator = new ResultsAggregator();
    await aggregator.aggregateResults(summaryPath);
  } catch (error) {
    console.error('Aggregation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default ResultsAggregator;