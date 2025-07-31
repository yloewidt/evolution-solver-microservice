#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ResultsComparator {
  async loadKPIs(kpisPath) {
    const kpisData = await fs.readFile(kpisPath, 'utf-8');
    return JSON.parse(kpisData);
  }

  calculateChange(baseline, experiment) {
    if (baseline === 0) return experiment === 0 ? 0 : 100;
    return ((experiment - baseline) / baseline) * 100;
  }

  formatValue(value, precision = 3) {
    if (typeof value === 'number') {
      return value.toFixed(precision);
    }
    return value;
  }

  formatChange(change) {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  }

  generateMarkdownTable(baseline, experiment) {
    const baseKPIs = baseline.aggregate;
    const expKPIs = experiment.aggregate;
    
    let markdown = '# Test Results Comparison\n\n';
    
    // Summary info
    markdown += `## Test Information\n\n`;
    markdown += `| Attribute | Baseline | Experiment |\n`;
    markdown += `|-----------|----------|------------|\n`;
    markdown += `| Test Name | ${baseline.summary.testName} | ${experiment.summary.testName} |\n`;
    markdown += `| Generations | ${baseline.summary.config.generations} | ${experiment.summary.config.generations} |\n`;
    markdown += `| Population Size | ${baseline.summary.config.populationSize} | ${experiment.summary.config.populationSize} |\n`;
    markdown += `| Total Jobs | ${baseline.summary.totalJobs} | ${experiment.summary.totalJobs} |\n`;
    markdown += `| Duration (s) | ${(baseline.summary.duration / 1000).toFixed(1)} | ${(experiment.summary.duration / 1000).toFixed(1)} |\n`;
    
    markdown += `\n## Key Performance Indicators\n\n`;
    markdown += `| KPI | Baseline | Experiment | Change | Improved? |\n`;
    markdown += `|-----|----------|------------|--------|----------|\n`;
    
    // Define KPIs with their improvement direction
    const kpis = [
      { key: 'avgTopScore', label: 'Average Top Score', higher: true },
      { key: 'avgSearchEfficiency', label: 'Search Efficiency', higher: true },
      { key: 'avgScoreStdDev', label: 'Score Variability', higher: true },
      { key: 'avgGeneration1Score', label: 'Generation 1 Score', higher: true },
      { key: 'avgScoreImprovement', label: 'Avg Improvement/Gen', higher: true },
      { key: 'avgTokensPerJob', label: 'Avg Tokens/Job', higher: false },
    ];
    
    kpis.forEach(kpi => {
      const baseValue = baseKPIs[kpi.key];
      const expValue = expKPIs[kpi.key];
      const change = this.calculateChange(baseValue, expValue);
      const improved = kpi.higher ? change > 0 : change < 0;
      const improvedIcon = improved ? '✅' : change === 0 ? '➖' : '❌';
      
      markdown += `| ${kpi.label} | ${this.formatValue(baseValue)} | ${this.formatValue(expValue)} | ${this.formatChange(change)} | ${improvedIcon} |\n`;
    });
    
    // Additional metrics
    markdown += `\n## Resource Usage\n\n`;
    markdown += `| Metric | Baseline | Experiment | Change |\n`;
    markdown += `|--------|----------|------------|--------|\n`;
    markdown += `| Total Tokens | ${baseKPIs.totalTokensUsed} | ${expKPIs.totalTokensUsed} | ${this.formatChange(this.calculateChange(baseKPIs.totalTokensUsed, expKPIs.totalTokensUsed))} |\n`;
    markdown += `| Total API Calls | ${baseKPIs.totalApiCalls} | ${expKPIs.totalApiCalls} | ${this.formatChange(this.calculateChange(baseKPIs.totalApiCalls, expKPIs.totalApiCalls))} |\n`;
    
    // Summary
    markdown += `\n## Summary\n\n`;
    
    const topScoreChange = this.calculateChange(baseKPIs.avgTopScore, expKPIs.avgTopScore);
    const efficiencyChange = this.calculateChange(baseKPIs.avgSearchEfficiency, expKPIs.avgSearchEfficiency);
    
    if (topScoreChange > 0) {
      markdown += `- ✅ **Primary Goal Achieved**: Average top score improved by ${topScoreChange.toFixed(1)}%\n`;
    } else if (topScoreChange < 0) {
      markdown += `- ❌ **Primary Goal Not Met**: Average top score decreased by ${Math.abs(topScoreChange).toFixed(1)}%\n`;
    } else {
      markdown += `- ➖ **No Change**: Average top score remained the same\n`;
    }
    
    if (efficiencyChange > 0) {
      markdown += `- ✅ Search efficiency improved by ${efficiencyChange.toFixed(1)}%\n`;
    } else if (efficiencyChange < 0) {
      markdown += `- ❌ Search efficiency decreased by ${Math.abs(efficiencyChange).toFixed(1)}%\n`;
    }
    
    // Cost per point analysis
    const baseCostPerPoint = baseKPIs.totalTokensUsed / (baseKPIs.avgTopScore * baseline.summary.totalJobs);
    const expCostPerPoint = expKPIs.totalTokensUsed / (expKPIs.avgTopScore * experiment.summary.totalJobs);
    const costPerPointChange = this.calculateChange(baseCostPerPoint, expCostPerPoint);
    
    markdown += `- 💰 Cost per score point: ${costPerPointChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(costPerPointChange).toFixed(1)}%\n`;
    
    return markdown;
  }

  async compare(baselinePath, experimentPath, outputPath) {
    console.log('Loading KPI files...');
    
    const baseline = await this.loadKPIs(baselinePath);
    const experiment = await this.loadKPIs(experimentPath);
    
    const markdown = this.generateMarkdownTable(baseline, experiment);
    
    if (outputPath) {
      await fs.writeFile(outputPath, markdown);
      console.log(`\nComparison saved to: ${outputPath}`);
    } else {
      console.log('\n' + markdown);
    }
    
    return { baseline, experiment, markdown };
  }
}

// Main execution
async function main() {
  const baselinePath = process.argv[2];
  const experimentPath = process.argv[3];
  const outputPath = process.argv[4];
  
  if (!baselinePath || !experimentPath) {
    console.error('Usage: node compare-results.js <baseline-kpis> <experiment-kpis> [output-file]');
    console.error('Example: node compare-results.js test/business/results/baseline/kpis.json test/business/results/experiment-A/kpis.json comparison.md');
    process.exit(1);
  }
  
  try {
    const comparator = new ResultsComparator();
    await comparator.compare(baselinePath, experimentPath, outputPath);
  } catch (error) {
    console.error('Comparison failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default ResultsComparator;