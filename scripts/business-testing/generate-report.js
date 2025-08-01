#!/usr/bin/env node

/**
 * Report Generator - Generates reports using client's metric specifications
 */

import fs from 'fs/promises';
import path from 'path';

// Helper to format numbers
function fmt(num, decimals = 3) {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  return num.toFixed(decimals);
}

// Helper to format percentage
function pct(num, decimals = 1) {
  return fmt(num * 100, decimals) + '%';
}

// Generate markdown report from metrics
export async function generateReport(metrics, config = {}) {
  const { perProblemMetrics, generalStatistics, perGenerationMetrics, version, metadata } = metrics;
  // Support both old and new naming conventions
  const perProblem = perProblemMetrics || metrics.perProblem || [];
  const perGeneration = perGenerationMetrics || metrics.perGeneration || [];
  
  let report = `# Business Testing Report - ${config.title || 'Evolution Solver'}\n\n`;
  report += `**Date:** ${new Date().toISOString()}\n`;
  report += `**Model:** ${version.model || 'o3'}\n`;
  report += `**Configuration:** ${metadata.intendedGenerations} generations × ${config.populationSize || 10} population\n`;
  report += `**Problems Tested:** ${metadata.totalProblems}\n\n`;
  
  // Executive Summary
  report += `## 🎯 Executive Summary\n\n`;
  report += `### General Statistics\n\n`;
  report += `| Metric | Value | Description |\n`;
  report += `|--------|-------|-------------|\n`;
  report += `| Success Rate | ${pct(generalStatistics.successRate)} | Average completion rate across all problems |\n`;
  report += `| Find Good Ideas | ${fmt(generalStatistics.findGoodIdeas)} | Median of best scores achieved |\n`;
  report += `| Search Efficiently | ${fmt(generalStatistics.searchEfficiently, 4)} | Median score per 1000 tokens |\n`;
  report += `| Have Variability | ${fmt(generalStatistics.haveVariability)} | Median score variability within generations |\n`;
  report += `| Think About Good Ideas | ${fmt(generalStatistics.thinkAboutGoodIdeas)} | Median quality of first generation |\n`;
  report += `| Good Improving Process | ${fmt(generalStatistics.goodImprovingProcess, 6)} | Median improvement efficiency |\n\n`;
  
  report += `**Key Insights:**\n`;
  report += `- ${generalStatistics.successfulProblems} out of ${generalStatistics.totalProblems} problems completed all ${metadata.intendedGenerations} generations\n`;
  report += `- Best median score achieved: ${fmt(generalStatistics.findGoodIdeas)}\n`;
  report += `- Search efficiency: ${fmt(generalStatistics.searchEfficiently, 4)} score points per 1000 tokens\n\n`;
  
  // Per-Problem Performance
  report += `## 📊 Per-Problem Metrics\n\n`;
  report += `| Problem | Success | Top Score | Efficiency | Variability | First Score | Improvement |\n`;
  report += `|---------|---------|-----------|------------|-------------|-------------|-------------|\n`;
  
  // Sort problems by top score - handle both wrapped and unwrapped metrics
  const sortedProblems = [...perProblem].sort((a, b) => {
    const aScore = (a.metrics || a).findGoodIdeas;
    const bScore = (b.metrics || b).findGoodIdeas;
    return bScore - aScore;
  });
  
  sortedProblems.forEach(problem => {
    const m = problem.metrics || problem;
    const problemName = problem.problemId || m.problemId || 'Unknown';
    report += `| ${problemName} | ${pct(m.successRate)} | ${fmt(m.findGoodIdeas)} | ${fmt(m.searchEfficiently, 4)} | ${fmt(m.haveVariability)} | ${fmt(m.thinkAboutGoodIdeas)} | ${fmt(m.goodImprovingProcess, 6)} |\n`;
  });
  
  report += `\n### Problem Performance Analysis\n\n`;
  
  // Top 5 performers
  report += `**Top 5 Best Performing Problems (by score):**\n`;
  sortedProblems.slice(0, 5).forEach((problem, idx) => {
    const m = problem.metrics || problem;
    const problemName = problem.problemId || m.problemId || 'Unknown';
    report += `${idx + 1}. **${problemName}** - Score: ${fmt(m.findGoodIdeas)}\n`;
  });
  
  report += `\n**Bottom 5 Performing Problems:**\n`;
  sortedProblems.slice(-5).reverse().forEach((problem, idx) => {
    const m = problem.metrics || problem;
    const problemName = problem.problemId || m.problemId || 'Unknown';
    report += `${idx + 1}. **${problemName}** - Score: ${fmt(m.findGoodIdeas)}\n`;
  });
  
  // Per-Generation Analysis
  report += `\n## 🔄 Per-Generation Metrics\n\n`;
  report += `| Gen | Success Rate | Median Tokens | Top Score | Avg Score | Variability | Improvement |\n`;
  report += `|-----|--------------|---------------|-----------|-----------|-------------|-------------|\n`;
  
  perGeneration.forEach(gen => {
    report += `| ${gen.generation} | ${pct(gen.successRate)} | ${Math.round(gen.medianTokenUsed).toLocaleString()} | ${fmt(gen.findGoodIdeas)} | ${fmt(gen.medianAvgScore)} | ${fmt(gen.haveVariability)} | ${fmt(gen.goodImprovingProcess, 6)} |\n`;
  });
  
  // Generation insights
  report += `\n### Generation-to-Generation Insights\n\n`;
  
  if (perGeneration.length > 0) {
    const firstGen = perGeneration[0];
    const lastGen = perGeneration[perGeneration.length - 1];
    const gen5 = perGeneration.find(g => g.generation === 5);
    const gen10 = perGeneration.find(g => g.generation === 10);
    
    report += `- **Early Progress (Gen 1-5):** `;
    if (gen5) {
      const improvement = ((gen5.medianAvgScore - firstGen.medianAvgScore) / firstGen.medianAvgScore) * 100;
      report += `${fmt(improvement, 1)}% improvement in average scores\n`;
    }
    
    report += `- **Mid Progress (Gen 5-10):** `;
    if (gen5 && gen10) {
      const improvement = ((gen10.medianAvgScore - gen5.medianAvgScore) / gen5.medianAvgScore) * 100;
      report += `${fmt(improvement, 1)}% improvement in average scores\n`;
    }
    
    report += `- **Overall Progress:** `;
    const totalImprovement = ((lastGen.medianAvgScore - firstGen.medianAvgScore) / firstGen.medianAvgScore) * 100;
    report += `${fmt(totalImprovement, 1)}% improvement from first to last generation\n`;
    
    // Token efficiency
    const totalTokens = perGeneration.reduce((sum, g) => sum + (g.medianTokenUsed * g.problemsReporting), 0);
    const avgTokensPerProblem = totalTokens / metadata.totalProblems;
    report += `- **Token Usage:** Median ${Math.round(avgTokensPerProblem).toLocaleString()} tokens per problem\n`;
  }
  
  // Distribution Analysis
  report += `\n## 📈 Score Distribution\n\n`;
  
  const scoreRanges = [
    { min: 10, max: Infinity, label: 'Excellent (>10)' },
    { min: 5, max: 10, label: 'Very Good (5-10)' },
    { min: 1, max: 5, label: 'Good (1-5)' },
    { min: 0.1, max: 1, label: 'Moderate (0.1-1)' },
    { min: 0, max: 0.1, label: 'Low (<0.1)' }
  ];
  
  scoreRanges.forEach(range => {
    const count = perProblem.filter(p => {
      const score = (p.metrics || p).findGoodIdeas;
      return score >= range.min && score < range.max;
    }).length;
    const percentage = (count / perProblem.length) * 100;
    report += `- **${range.label}:** ${count} problems (${fmt(percentage, 1)}%)\n`;
  });
  
  // Efficiency Analysis
  report += `\n## 💡 Efficiency Analysis\n\n`;
  
  const efficiencyQuartiles = perProblem
    .map(p => (p.metrics || p).searchEfficiently)
    .filter(e => e > 0)
    .sort((a, b) => b - a);
  
  if (efficiencyQuartiles.length >= 4) {
    report += `- **Top Quartile Efficiency:** ${fmt(efficiencyQuartiles[Math.floor(efficiencyQuartiles.length * 0.25)], 4)} score/1000 tokens\n`;
    report += `- **Median Efficiency:** ${fmt(generalStatistics.searchEfficiently, 4)} score/1000 tokens\n`;
    report += `- **Bottom Quartile Efficiency:** ${fmt(efficiencyQuartiles[Math.floor(efficiencyQuartiles.length * 0.75)], 4)} score/1000 tokens\n`;
  }
  
  // Most efficient problems
  const mostEfficient = [...perProblem]
    .filter(p => (p.metrics || p).searchEfficiently > 0)
    .sort((a, b) => (b.metrics || b).searchEfficiently - (a.metrics || a).searchEfficiently)
    .slice(0, 3);
  
  report += `\n**Most Efficient Problems:**\n`;
  mostEfficient.forEach((problem, idx) => {
    const m = problem.metrics || problem;
    const problemName = problem.problemId || m.problemId || 'Unknown';
    report += `${idx + 1}. **${problemName}** - ${fmt(m.searchEfficiently, 4)} score/1000 tokens\n`;
  });
  
  // Version information
  report += `\n## 📋 Test Information\n\n`;
  report += `- **Model Version:** ${version.modelVersion}\n`;
  report += `- **Service Version:** ${version.service}\n`;
  report += `- **Configuration:** ${version.config}\n`;
  report += `- **Test Completed:** ${version.timestamp}\n`;
  
  return report;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    try {
      const metricsFile = process.argv[2];
      const outputFile = process.argv[3];
      
      if (!metricsFile) {
        console.error('Usage: generate-report.js <metrics-file> [output-file]');
        console.error('Example: generate-report.js test/business/results/baseline/metrics.json');
        console.error('         generate-report.js metrics.json report.md');
        process.exit(1);
      }
      
      // Default output path
      const reportPath = outputFile || metricsFile.replace('.json', '-report.md');
      
      console.log('Report Generator');
      console.log('================');
      console.log(`Loading metrics from: ${metricsFile}`);
      
      // Load metrics
      const metrics = JSON.parse(await fs.readFile(metricsFile, 'utf-8'));
      
      // Generate report using detected or default configuration
      const config = {
        title: metrics.version?.config || 'Evolution Solver Test',
        populationSize: 10  // Default population size
      };
      
      console.log('Generating report...');
      const report = await generateReport(metrics, config);
      
      // Save report
      await fs.writeFile(reportPath, report);
      console.log(`\n✅ Report saved to: ${reportPath}`);
      
      // Print summary stats
      if (metrics.generalStatistics) {
        console.log('\nSummary Statistics:');
        console.log(`- Success Rate: ${(metrics.generalStatistics.successRate * 100).toFixed(1)}%`);
        console.log(`- Median Top Score: ${metrics.generalStatistics.findGoodIdeas.toFixed(3)}`);
        console.log(`- Median Efficiency: ${metrics.generalStatistics.searchEfficiently.toFixed(4)} score/1000 tokens`);
        console.log(`- Problems Tested: ${metrics.metadata.totalProblems}`);
      }
      
    } catch (error) {
      console.error('Error generating report:', error);
      process.exit(1);
    }
  }
  
  main();
}