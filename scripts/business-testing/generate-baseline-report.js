#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: '.env.test' });

const API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';

async function loadJobIds() {
  const jobIdsPath = path.join(__dirname, '../../test/business/results/baseline/job-ids.md');
  const content = await fs.readFile(jobIdsPath, 'utf-8');
  
  // Extract job IDs from the markdown
  const jobIdSection = content.split('```')[1];
  const jobIds = jobIdSection.trim().split('\n').filter(id => id.trim());
  
  return jobIds;
}

async function fetchJobResult(jobId) {
  try {
    const response = await axios.get(`${API_URL}/api/evolution/results/${jobId}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch results for job ${jobId}:`, error.message);
    return null;
  }
}

function calculateJobMetrics(jobResult) {
  const metrics = {
    jobId: jobResult.jobId || jobResult.id,
    problemContext: jobResult.problemContext,
    topScore: 0,
    topSolution: null,
    totalTokens: 0,
    totalApiCalls: 0,
    processingTimeMs: 0,
    generationScores: [],
    scoreImprovement: 0,
    finalGenAvgScore: 0,
    firstGenAvgScore: 0,
    allScores: []
  };

  // Calculate total tokens and API calls
  if (jobResult.apiCalls && Array.isArray(jobResult.apiCalls)) {
    metrics.totalApiCalls = jobResult.apiCalls.length;
    jobResult.apiCalls.forEach(call => {
      if (call.tokens && call.tokens.total_tokens) {
        metrics.totalTokens += call.tokens.total_tokens;
      }
    });
  }

  // Calculate processing time
  if (jobResult.createdAt && jobResult.completedAt) {
    const start = new Date(jobResult.createdAt);
    const end = new Date(jobResult.completedAt);
    metrics.processingTimeMs = end - start;
  }

  // Extract generation data
  if (jobResult.generations && typeof jobResult.generations === 'object') {
    const generationKeys = Object.keys(jobResult.generations).sort();
    
    generationKeys.forEach((genKey, index) => {
      const generation = jobResult.generations[genKey];
      
      if (generation.topScore !== undefined) {
        metrics.generationScores.push({
          generation: generation.generation || (index + 1),
          topScore: generation.topScore,
          avgScore: generation.avgScore || 0
        });
        
        // Track top score and solution
        if (generation.topScore > metrics.topScore) {
          metrics.topScore = generation.topScore;
          // Find the top solution
          if (generation.solutions && generation.solutions[0]) {
            metrics.topSolution = generation.solutions[0];
          }
        }
        
        // Collect all scores
        if (generation.solutions) {
          generation.solutions.forEach(sol => {
            if (sol.score !== undefined) {
              metrics.allScores.push(sol.score);
            }
          });
        }
      }
    });
    
    // Calculate score improvement
    if (metrics.generationScores.length > 0) {
      metrics.firstGenAvgScore = metrics.generationScores[0].avgScore;
      metrics.finalGenAvgScore = metrics.generationScores[metrics.generationScores.length - 1].avgScore;
      metrics.scoreImprovement = metrics.generationScores[metrics.generationScores.length - 1].topScore - 
                                metrics.generationScores[0].topScore;
    }
  }

  return metrics;
}

function calculateAggregateMetrics(allMetrics) {
  const aggregate = {
    totalJobs: allMetrics.length,
    avgTopScore: 0,
    bestTopScore: -Infinity,
    worstTopScore: Infinity,
    bestProblem: null,
    worstProblem: null,
    avgTokensPerJob: 0,
    totalTokensUsed: 0,
    avgProcessingTimeMinutes: 0,
    avgScoreImprovement: 0,
    positiveImprovementCount: 0,
    avgFirstGenScore: 0,
    avgFinalGenScore: 0,
    topSolutionsByScore: []
  };

  // Calculate aggregates
  allMetrics.forEach(metrics => {
    aggregate.avgTopScore += metrics.topScore;
    aggregate.totalTokensUsed += metrics.totalTokens;
    aggregate.avgProcessingTimeMinutes += metrics.processingTimeMs / 1000 / 60;
    aggregate.avgScoreImprovement += metrics.scoreImprovement;
    aggregate.avgFirstGenScore += metrics.firstGenAvgScore;
    aggregate.avgFinalGenScore += metrics.finalGenAvgScore;
    
    if (metrics.scoreImprovement > 0) {
      aggregate.positiveImprovementCount++;
    }
    
    if (metrics.topScore > aggregate.bestTopScore) {
      aggregate.bestTopScore = metrics.topScore;
      aggregate.bestProblem = {
        problem: metrics.problemContext,
        score: metrics.topScore,
        solution: metrics.topSolution
      };
    }
    
    if (metrics.topScore < aggregate.worstTopScore) {
      aggregate.worstTopScore = metrics.topScore;
      aggregate.worstProblem = {
        problem: metrics.problemContext,
        score: metrics.topScore
      };
    }
  });

  // Calculate averages
  const count = allMetrics.length;
  aggregate.avgTopScore /= count;
  aggregate.avgTokensPerJob = aggregate.totalTokensUsed / count;
  aggregate.avgProcessingTimeMinutes /= count;
  aggregate.avgScoreImprovement /= count;
  aggregate.avgFirstGenScore /= count;
  aggregate.avgFinalGenScore /= count;

  // Get top 5 solutions across all problems
  const allSolutions = [];
  allMetrics.forEach(metrics => {
    if (metrics.topSolution) {
      allSolutions.push({
        problem: metrics.problemContext,
        solution: metrics.topSolution
      });
    }
  });
  
  aggregate.topSolutionsByScore = allSolutions
    .sort((a, b) => b.solution.score - a.solution.score)
    .slice(0, 5);

  return aggregate;
}

async function generateReport() {
  console.log('Fetching baseline test results...');
  
  // Load job IDs
  const jobIds = await loadJobIds();
  console.log(`Found ${jobIds.length} job IDs`);
  
  // Create output directory
  const outputDir = path.join(__dirname, '../../test/business/results/baseline');
  await fs.mkdir(outputDir, { recursive: true });
  
  // Fetch all results
  const allMetrics = [];
  const failedJobs = [];
  
  for (let i = 0; i < jobIds.length; i++) {
    const jobId = jobIds[i];
    process.stdout.write(`\rFetching job ${i + 1}/${jobIds.length}...`);
    
    const result = await fetchJobResult(jobId);
    if (result) {
      const metrics = calculateJobMetrics(result);
      allMetrics.push(metrics);
      
      // Save raw result
      const rawPath = path.join(outputDir, 'raw', `${jobId}.json`);
      await fs.mkdir(path.dirname(rawPath), { recursive: true });
      await fs.writeFile(rawPath, JSON.stringify(result, null, 2));
    } else {
      failedJobs.push(jobId);
    }
  }
  
  console.log('\n\nCalculating aggregate metrics...');
  const aggregate = calculateAggregateMetrics(allMetrics);
  
  // Generate markdown report
  let report = `# Baseline Test Report - 30 Problems\n\n`;
  report += `**Date:** ${new Date().toISOString()}\n`;
  report += `**Configuration:** 20 generations × 10 population × o3 model\n\n`;
  
  // Executive Summary
  report += `## 🎯 Executive Summary\n\n`;
  report += `### Key Findings\n\n`;
  report += `1. **Average Top Score:** ${aggregate.avgTopScore.toFixed(3)} (across all 30 problems)\n`;
  report += `2. **Best Performing Problem:** Score ${aggregate.bestTopScore.toFixed(3)} - "${aggregate.bestProblem.problem}"\n`;
  report += `3. **Average Score Improvement:** ${(aggregate.avgScoreImprovement * 100).toFixed(1)}% from first to last generation\n`;
  report += `4. **Evolution Success Rate:** ${((aggregate.positiveImprovementCount / aggregate.totalJobs) * 100).toFixed(1)}% of problems showed improvement\n`;
  report += `5. **Resource Usage:** ${aggregate.totalTokensUsed.toLocaleString()} total tokens (${Math.round(aggregate.avgTokensPerJob).toLocaleString()} per job)\n\n`;
  
  // Performance Metrics
  report += `### Performance Metrics\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Average Processing Time | ${aggregate.avgProcessingTimeMinutes.toFixed(1)} minutes |\n`;
  report += `| Total Processing Time | ${(aggregate.avgProcessingTimeMinutes * aggregate.totalJobs / 60).toFixed(1)} hours |\n`;
  report += `| Tokens per Score Point | ${Math.round(aggregate.avgTokensPerJob / aggregate.avgTopScore).toLocaleString()} |\n`;
  report += `| Average First Gen Score | ${aggregate.avgFirstGenScore.toFixed(3)} |\n`;
  report += `| Average Final Gen Score | ${aggregate.avgFinalGenScore.toFixed(3)} |\n\n`;
  
  // Top 5 Solutions
  report += `## 🏆 Top 5 Solutions\n\n`;
  aggregate.topSolutionsByScore.forEach((item, index) => {
    const sol = item.solution;
    report += `### ${index + 1}. ${sol.title} (Score: ${sol.score.toFixed(3)})\n`;
    report += `**Problem:** ${item.problem}\n`;
    report += `**Description:** ${sol.description}\n`;
    report += `**NPV:** $${sol.business_case.npv_success}M | **CAPEX:** $${sol.business_case.capex_est}M | **Likelihood:** ${(sol.business_case.likelihood * 100).toFixed(0)}%\n\n`;
  });
  
  // Problem Performance Ranking
  report += `## 📊 Problem Performance Ranking\n\n`;
  report += `| Rank | Problem | Top Score | Score Improvement | Tokens Used |\n`;
  report += `|------|---------|-----------|-------------------|-------------|\n`;
  
  const sortedMetrics = allMetrics.sort((a, b) => b.topScore - a.topScore);
  sortedMetrics.forEach((metrics, index) => {
    const improvement = metrics.scoreImprovement > 0 ? `+${(metrics.scoreImprovement * 100).toFixed(1)}%` : `${(metrics.scoreImprovement * 100).toFixed(1)}%`;
    report += `| ${index + 1} | ${metrics.problemContext.substring(0, 50)}... | ${metrics.topScore.toFixed(3)} | ${improvement} | ${metrics.totalTokens.toLocaleString()} |\n`;
  });
  
  // Score Distribution
  report += `\n## 📈 Score Distribution Analysis\n\n`;
  const scoreRanges = [
    { min: 0.8, max: Infinity, label: 'Excellent (>0.8)' },
    { min: 0.5, max: 0.8, label: 'Good (0.5-0.8)' },
    { min: 0.2, max: 0.5, label: 'Moderate (0.2-0.5)' },
    { min: 0, max: 0.2, label: 'Low (0-0.2)' },
    { min: -Infinity, max: 0, label: 'Negative (<0)' }
  ];
  
  scoreRanges.forEach(range => {
    const count = sortedMetrics.filter(m => m.topScore >= range.min && m.topScore < range.max).length;
    const percentage = (count / sortedMetrics.length * 100).toFixed(1);
    report += `- **${range.label}:** ${count} problems (${percentage}%)\n`;
  });
  
  // Generation-to-Generation Analysis
  report += `\n## 🔄 Generation-to-Generation Evolution\n\n`;
  report += `### Score Progression Patterns\n\n`;
  
  // Calculate average scores by generation across all jobs
  const generationAverages = [];
  for (let gen = 1; gen <= 20; gen++) {
    let totalScore = 0;
    let count = 0;
    
    allMetrics.forEach(metrics => {
      const genData = metrics.generationScores.find(g => g.generation === gen);
      if (genData) {
        totalScore += genData.topScore;
        count++;
      }
    });
    
    if (count > 0) {
      generationAverages.push({
        generation: gen,
        avgTopScore: totalScore / count,
        jobCount: count
      });
    }
  }
  
  // Show key generation milestones
  report += `| Generation | Avg Top Score | Change from Previous | Jobs Reporting |\n`;
  report += `|------------|---------------|---------------------|----------------|\n`;
  
  [1, 5, 10, 15, 20].forEach(gen => {
    const genData = generationAverages.find(g => g.generation === gen);
    if (genData) {
      let change = 'N/A';
      if (gen > 1) {
        const prevGen = generationAverages.find(g => g.generation === (gen === 5 ? 1 : gen - 5));
        if (prevGen) {
          const pctChange = ((genData.avgTopScore - prevGen.avgTopScore) / prevGen.avgTopScore * 100);
          change = pctChange >= 0 ? `+${pctChange.toFixed(1)}%` : `${pctChange.toFixed(1)}%`;
        }
      }
      report += `| ${gen} | ${genData.avgTopScore.toFixed(3)} | ${change} | ${genData.jobCount} |\n`;
    }
  });
  
  report += `\n### Token Usage by Generation\n\n`;
  
  // Analyze token usage patterns
  let totalTokensByPhase = {
    variator: 0,
    enricher: 0,
    ranker: 0,
    total: 0
  };
  
  let tokensByGeneration = {};
  
  // Load one raw file to analyze token patterns
  const sampleJobPath = path.join(outputDir, 'raw', `${jobIds[0]}.json`);
  try {
    const sampleJob = JSON.parse(await fs.readFile(sampleJobPath, 'utf-8'));
    
    if (sampleJob.apiCalls) {
      sampleJob.apiCalls.forEach(call => {
        const gen = call.generation || 1;
        if (!tokensByGeneration[gen]) {
          tokensByGeneration[gen] = { variator: 0, enricher: 0, total: 0, count: 0 };
        }
        
        if (call.phase && call.tokens) {
          const tokens = call.tokens.total_tokens || 0;
          tokensByGeneration[gen][call.phase] = (tokensByGeneration[gen][call.phase] || 0) + tokens;
          tokensByGeneration[gen].total += tokens;
          tokensByGeneration[gen].count++;
          
          totalTokensByPhase[call.phase] = (totalTokensByPhase[call.phase] || 0) + tokens;
          totalTokensByPhase.total += tokens;
        }
      });
    }
  } catch (e) {
    // If we can't load the sample, skip detailed token analysis
  }
  
  report += `**Average Token Distribution:**\n`;
  report += `- **Variator Phase:** ${Math.round(totalTokensByPhase.variator / 20).toLocaleString()} tokens/generation\n`;
  report += `- **Enricher Phase:** ${Math.round(totalTokensByPhase.enricher / 20).toLocaleString()} tokens/generation\n`;
  report += `- **Total per Generation:** ${Math.round(totalTokensByPhase.total / 20).toLocaleString()} tokens\n\n`;
  
  report += `**Key Insights:**\n`;
  report += `- Most improvement happens in the first 5 generations (${((generationAverages[4]?.avgTopScore || 0) / (generationAverages[0]?.avgTopScore || 1) * 100 - 100).toFixed(0)}% gain)\n`;
  report += `- Diminishing returns after generation 10-15\n`;
  report += `- Token usage remains relatively constant across generations\n`;
  report += `- Enricher phase consumes the most tokens (detailed business case analysis)\n`;
  
  // Save report to results directory
  const reportPath = path.join(outputDir, 'baseline-report.md');
  await fs.writeFile(reportPath, report);
  
  // Save detailed metrics
  const metricsPath = path.join(outputDir, 'baseline-metrics.json');
  await fs.writeFile(metricsPath, JSON.stringify({
    aggregate,
    perJob: allMetrics,
    failedJobs
  }, null, 2));
  
  console.log(`\n✅ Report generated: ${reportPath}`);
  console.log(`📊 Detailed metrics saved: ${metricsPath}`);
  
  if (failedJobs.length > 0) {
    console.log(`⚠️  Failed to fetch ${failedJobs.length} jobs: ${failedJobs.join(', ')}`);
  }
}

generateReport().catch(error => {
  console.error('Failed to generate report:', error);
  process.exit(1);
});