#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ResultsComparator {
  async loadMetrics(metricsPath) {
    const metricsData = await fs.readFile(metricsPath, 'utf-8');
    return JSON.parse(metricsData);
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
    const baseStats = baseline.generalStatistics;
    const expStats = experiment.generalStatistics;
    
    let markdown = '# Test Results Comparison\n\n';
    
    // Test Information
    markdown += `## Test Information\n\n`;
    markdown += `| Attribute | Baseline | Experiment |\n`;
    markdown += `|-----------|----------|------------|\n`;
    markdown += `| Configuration | ${baseline.version.config} | ${experiment.version.config} |\n`;
    markdown += `| Model | ${baseline.version.model} | ${experiment.version.model} |\n`;
    markdown += `| Intended Generations | ${baseline.metadata.intendedGenerations} | ${experiment.metadata.intendedGenerations} |\n`;
    markdown += `| Total Problems | ${baseline.metadata.totalProblems} | ${experiment.metadata.totalProblems} |\n`;
    markdown += `| Test Date | ${baseline.version.timestamp} | ${experiment.version.timestamp} |\n`;
    
    // Key Performance Metrics
    markdown += `\n## Key Performance Metrics\n\n`;
    markdown += `| Metric | Baseline | Experiment | Change | Improved? |\n`;
    markdown += `|--------|----------|------------|---------|----------|\n`;
    
    // Success Rate
    const successChange = this.calculateChange(baseStats.successRate, expStats.successRate);
    markdown += `| Success Rate | ${(baseStats.successRate * 100).toFixed(1)}% | ${(expStats.successRate * 100).toFixed(1)}% | ${this.formatChange(successChange)} | ${successChange >= 0 ? '✅' : '❌'} |\n`;
    
    // Find Good Ideas (Top Score)
    const topScoreChange = this.calculateChange(baseStats.findGoodIdeas, expStats.findGoodIdeas);
    markdown += `| Find Good Ideas (Median) | ${this.formatValue(baseStats.findGoodIdeas)} | ${this.formatValue(expStats.findGoodIdeas)} | ${this.formatChange(topScoreChange)} | ${topScoreChange >= 0 ? '✅' : '❌'} |\n`;
    
    // Search Efficiency
    const efficiencyChange = this.calculateChange(baseStats.searchEfficiently, expStats.searchEfficiently);
    markdown += `| Search Efficiently | ${this.formatValue(baseStats.searchEfficiently, 4)} | ${this.formatValue(expStats.searchEfficiently, 4)} | ${this.formatChange(efficiencyChange)} | ${efficiencyChange >= 0 ? '✅' : '❌'} |\n`;
    
    // Variability
    const variabilityChange = this.calculateChange(baseStats.haveVariability, expStats.haveVariability);
    markdown += `| Have Variability | ${this.formatValue(baseStats.haveVariability)} | ${this.formatValue(expStats.haveVariability)} | ${this.formatChange(variabilityChange)} | ${variabilityChange >= 0 ? '✅' : '❌'} |\n`;
    
    // First Generation Quality
    const firstGenChange = this.calculateChange(baseStats.thinkAboutGoodIdeas, expStats.thinkAboutGoodIdeas);
    markdown += `| Think About Good Ideas | ${this.formatValue(baseStats.thinkAboutGoodIdeas)} | ${this.formatValue(expStats.thinkAboutGoodIdeas)} | ${this.formatChange(firstGenChange)} | ${firstGenChange >= 0 ? '✅' : '❌'} |\n`;
    
    // Improvement Process
    const improvementChange = this.calculateChange(baseStats.goodImprovingProcess, expStats.goodImprovingProcess);
    markdown += `| Good Improving Process | ${this.formatValue(baseStats.goodImprovingProcess, 6)} | ${this.formatValue(expStats.goodImprovingProcess, 6)} | ${this.formatChange(improvementChange)} | ${improvementChange >= 0 ? '✅' : '❌'} |\n`;
    
    // Summary
    markdown += `\n## Summary\n\n`;
    
    if (topScoreChange > 0) {
      markdown += `- ✅ **Primary Goal Achieved**: Median top score improved by ${topScoreChange.toFixed(1)}%\n`;
    } else if (topScoreChange < 0) {
      markdown += `- ❌ **Primary Goal Not Met**: Median top score decreased by ${Math.abs(topScoreChange).toFixed(1)}%\n`;
    } else {
      markdown += `- ➖ **No Change**: Median top score remained the same\n`;
    }
    
    if (efficiencyChange > 0) {
      markdown += `- ✅ Search efficiency improved by ${efficiencyChange.toFixed(1)}%\n`;
    } else if (efficiencyChange < 0) {
      markdown += `- ❌ Search efficiency decreased by ${Math.abs(efficiencyChange).toFixed(1)}%\n`;
    }
    
    // Success rate analysis
    markdown += `- ${baseStats.successfulProblems} problems completed all generations in baseline vs ${expStats.successfulProblems} in experiment\n`;
    
    // Configuration differences
    if (baseline.metadata.intendedGenerations !== experiment.metadata.intendedGenerations) {
      markdown += `- ⚠️  Different generation counts: ${baseline.metadata.intendedGenerations} vs ${experiment.metadata.intendedGenerations}\n`;
    }
    
    return markdown;
  }

  async compare(baselinePath, experimentPath, outputPath) {
    console.log('Loading metrics files...');
    
    const baseline = await this.loadMetrics(baselinePath);
    const experiment = await this.loadMetrics(experimentPath);
    
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
    console.error('Usage: compare-results.js <baseline-metrics.json> <experiment-metrics.json> [output.md]');
    console.error('Example: compare-results.js baseline/metrics.json experiment/metrics.json comparison.md');
    process.exit(1);
  }
  
  try {
    const comparator = new ResultsComparator();
    await comparator.compare(baselinePath, experimentPath, outputPath);
  } catch (error) {
    console.error('Comparison failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}