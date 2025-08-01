#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';
import { processAllMetrics } from './calculate-metrics.js';

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

  async loadJobIds(jobIdsFile) {
    const content = await fs.readFile(jobIdsFile, 'utf-8');
    
    // Try to parse as JSON first
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        return data.map(item => typeof item === 'string' ? item : item.jobId);
      }
      // If it's an object with jobIds property
      if (data.jobIds && Array.isArray(data.jobIds)) {
        return data.jobIds;
      }
    } catch (e) {
      // Not JSON, try other formats
    }
    
    // Extract job IDs from markdown
    const jobIdSection = content.match(/```\n([\s\S]*?)```/);
    if (jobIdSection) {
      return jobIdSection[1].trim().split('\n').filter(id => id.trim());
    }
    
    // Try line-by-line (for .txt files with one ID per line)
    return content.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.match(/^[a-f0-9-]{36}$/));
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

  // Legacy KPI calculation for backward compatibility
  calculateLegacyKPIs(jobResult) {
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

  async aggregateResults(summaryPath, options = {}) {
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
    const jobResults = [];
    const jobKPIs = []; // For legacy compatibility
    
    for (let i = 0; i < summary.jobIds.length; i++) {
      const jobId = summary.jobIds[i];
      console.log(`\nProcessing job ${i + 1}/${summary.jobIds.length}: ${jobId}`);
      
      // Fetch job results
      const jobResult = await this.fetchJobResult(jobId);
      
      if (jobResult) {
        // Ensure jobId is in the result
        if (!jobResult.jobId) {
          jobResult.jobId = jobId;
        }
        
        // Save raw result
        const rawPath = path.join(rawDir, `${jobId}.json`);
        await fs.writeFile(rawPath, JSON.stringify(jobResult, null, 2));
        
        jobResults.push(jobResult);
        
        // Calculate legacy KPIs for backward compatibility
        if (!options.useNewMetrics) {
          const kpis = this.calculateLegacyKPIs(jobResult);
          jobKPIs.push(kpis);
          
          console.log(`  Top Score: ${kpis.topScore.toFixed(2)}`);
          console.log(`  Total Tokens: ${kpis.totalTokens}`);
          console.log(`  Search Efficiency: ${kpis.searchEfficiency.toFixed(6)}`);
        }
      }
    }
    
    if (options.useNewMetrics) {
      // Use new metrics calculation
      console.log('\nCalculating metrics using client specifications...');
      const metrics = await processAllMetrics(jobResults, {
        intendedGenerations: summary.config.evolutionConfig?.generations || 20,
        totalProblems: summary.jobIds.length,
        model: 'o3',
        serviceVersion: '1.0.0',
        configName: summary.config.name || 'baseline'
      });
      
      // Save new metrics
      const metricsPath = path.join(testDir, 'metrics.json');
      await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2));
      console.log(`\n\nMetrics saved to: ${metricsPath}`);
      
      // Print summary
      console.log('\nGeneral Statistics');
      console.log('==================');
      console.log(`Success Rate: ${(metrics.generalStatistics.successRate * 100).toFixed(1)}%`);
      console.log(`Find Good Ideas (Median Top Score): ${metrics.generalStatistics.findGoodIdeas.toFixed(3)}`);
      console.log(`Search Efficiently: ${metrics.generalStatistics.searchEfficiently.toFixed(4)}`);
      console.log(`Have Variability: ${metrics.generalStatistics.haveVariability.toFixed(3)}`);
      console.log(`Think About Good Ideas: ${metrics.generalStatistics.thinkAboutGoodIdeas.toFixed(3)}`);
      console.log(`Good Improving Process: ${metrics.generalStatistics.goodImprovingProcess.toFixed(6)}`);
      
      return metrics;
    } else {
      // Calculate legacy aggregate KPIs
      const aggregateKPIs = this.calculateAggregateKPIs(jobKPIs);
      
      // Save legacy KPIs
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

  // Alternative method to aggregate from job IDs file
  async aggregateFromJobIds(jobIdsFile, outputDir, options = {}) {
    console.log('Results Aggregator');
    console.log('==================');
    console.log(`Job IDs file: ${jobIdsFile}`);
    console.log(`Output directory: ${outputDir}`);
    
    // Create output directories
    await fs.mkdir(outputDir, { recursive: true });
    const rawDir = path.join(outputDir, 'raw');
    await fs.mkdir(rawDir, { recursive: true });
    
    // Load job IDs
    const jobIds = await this.loadJobIds(jobIdsFile);
    console.log(`\nFound ${jobIds.length} job IDs to process`);
    
    // Fetch all results
    const jobResults = [];
    const failedJobs = [];
    
    for (let i = 0; i < jobIds.length; i++) {
      const jobId = jobIds[i];
      console.log(`\nProcessing job ${i + 1}/${jobIds.length}: ${jobId}`);
      
      let jobResult = null;
      
      // First try to load from existing raw results if specified
      if (options.rawResultsDir) {
        try {
          const existingPath = path.join(options.rawResultsDir, `${jobId}.json`);
          const data = await fs.readFile(existingPath, 'utf-8');
          jobResult = JSON.parse(data);
          console.log(`  Loaded from existing raw results`);
        } catch (e) {
          // Fall back to API
        }
      }
      
      // If not found locally, fetch from API
      if (!jobResult) {
        jobResult = await this.fetchJobResult(jobId);
      }
      
      if (jobResult) {
        // Ensure jobId is in the result
        if (!jobResult.jobId) {
          jobResult.jobId = jobId;
        }
        
        // Save raw result
        const rawPath = path.join(rawDir, `${jobId}.json`);
        await fs.writeFile(rawPath, JSON.stringify(jobResult, null, 2));
        
        jobResults.push(jobResult);
      } else {
        failedJobs.push(jobId);
      }
    }
    
    console.log(`\nSuccessfully fetched ${jobResults.length} results`);
    if (failedJobs.length > 0) {
      console.log(`Failed to fetch ${failedJobs.length} jobs`);
    }
    
    // Calculate metrics using new system
    console.log('\nCalculating metrics...');
    const metrics = await processAllMetrics(jobResults, {
      intendedGenerations: options.intendedGenerations || 20,
      totalProblems: jobIds.length,
      model: options.model || 'o3',
      serviceVersion: options.serviceVersion || '1.0.0',
      configName: options.configName || 'baseline'
    });
    
    // Save metrics
    const metricsPath = path.join(outputDir, 'metrics.json');
    await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2));
    console.log(`Metrics saved to: ${metricsPath}`);
    
    // Save summary
    const summary = {
      timestamp: new Date().toISOString(),
      totalJobs: jobIds.length,
      successfulJobs: jobResults.length,
      failedJobs: failedJobs.length,
      generalStatistics: metrics.generalStatistics,
      version: metrics.version
    };
    
    const summaryPath = path.join(outputDir, 'summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`Summary saved to: ${summaryPath}`);
    
    return metrics;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const useNewMetrics = args.includes('--new-metrics');
  const fromJobIds = args.includes('--from-job-ids');
  
  // Parse --raw-results-dir option
  const rawResultsDirIndex = args.indexOf('--raw-results-dir');
  const rawResultsDir = rawResultsDirIndex >= 0 && args[rawResultsDirIndex + 1] ? args[rawResultsDirIndex + 1] : null;
  
  // Remove flags and their values from args
  const positionalArgs = args.filter((arg, index) => {
    if (arg.startsWith('--')) return false;
    if (rawResultsDirIndex >= 0 && index === rawResultsDirIndex + 1) return false;
    return true;
  });
  
  if (positionalArgs.length === 0) {
    console.error('Usage:');
    console.error('  node aggregate-results.js <summary-path> [--new-metrics]');
    console.error('  node aggregate-results.js --from-job-ids <job-ids-file> <output-dir> [--raw-results-dir <dir>]');
    console.error('\nExamples:');
    console.error('  node aggregate-results.js test/business/results/baseline/summary.json');
    console.error('  node aggregate-results.js test/business/results/baseline/summary.json --new-metrics');
    console.error('  node aggregate-results.js --from-job-ids test/business/results/baseline/job-ids.txt output/');
    console.error('  node aggregate-results.js --from-job-ids job-ids.txt output/ --raw-results-dir test/business/results/baseline/raw');
    process.exit(1);
  }
  
  try {
    const aggregator = new ResultsAggregator();
    
    if (fromJobIds) {
      const [jobIdsFile, outputDir] = positionalArgs;
      if (!outputDir) {
        console.error('Error: Output directory required when using --from-job-ids');
        process.exit(1);
      }
      await aggregator.aggregateFromJobIds(jobIdsFile, outputDir, { rawResultsDir });
    } else {
      const summaryPath = positionalArgs[0];
      await aggregator.aggregateResults(summaryPath, { useNewMetrics });
    }
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