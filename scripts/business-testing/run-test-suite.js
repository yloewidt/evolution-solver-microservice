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

class TestRunner {
  constructor(config) {
    this.config = config;
    this.apiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    this.results = [];
    this.startTime = Date.now();
  }

  async loadProblems() {
    const problemsFile = this.config.problemsFile || 'problems.json';
    const problemsPath = path.join(__dirname, '../../test/business', problemsFile);
    const problemsData = await fs.readFile(problemsPath, 'utf-8');
    return JSON.parse(problemsData);
  }

  async submitJob(problem) {
    try {
      const response = await axios.post(`${this.apiUrl}/api/evolution/jobs`, {
        problemContext: problem.context,
        evolutionConfig: this.config.evolutionConfig
      });
      
      return {
        jobId: response.data.jobId,
        problemId: problem.id,
        submittedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Failed to submit job for ${problem.id}:`, error.message);
      throw error;
    }
  }

  async pollJobStatus(jobId, maxAttempts = 300, delayMs = 5000) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await axios.get(`${this.apiUrl}/api/evolution/jobs/${jobId}`);
        
        if (response.data.status === 'completed') {
          return response.data;
        } else if (response.data.status === 'failed') {
          throw new Error(`Job ${jobId} failed: ${response.data.error}`);
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } catch (error) {
        console.error(`Error polling job ${jobId}:`, error.message);
        throw error;
      }
    }
    
    throw new Error(`Job ${jobId} timed out after ${maxAttempts * delayMs / 1000} seconds`);
  }

  async runTest(problem) {
    console.log(`\nStarting test for: ${problem.id}`);
    
    try {
      // Submit job
      const submission = await this.submitJob(problem);
      console.log(`  Job submitted: ${submission.jobId}`);
      
      // Poll for completion
      console.log(`  Polling for completion...`);
      const completedJob = await this.pollJobStatus(submission.jobId);
      
      console.log(`  Job completed successfully`);
      
      return {
        problemId: problem.id,
        jobId: submission.jobId,
        status: 'completed',
        submittedAt: submission.submittedAt,
        completedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error(`  Test failed for ${problem.id}:`, error.message);
      
      return {
        problemId: problem.id,
        status: 'failed',
        error: error.message,
        submittedAt: new Date().toISOString()
      };
    }
  }

  async runSuite() {
    console.log('Evolution Solver Test Suite');
    console.log('==========================');
    console.log(`Configuration: ${JSON.stringify(this.config.evolutionConfig, null, 2)}`);
    console.log(`API URL: ${this.apiUrl}`);
    console.log(`Test Collection: ${this.config.testCollection || 'default'}`);
    
    const problems = await this.loadProblems();
    console.log(`\nLoaded ${problems.length} test problems`);
    
    // Run tests with concurrency control
    const concurrency = this.config.concurrency || 3;
    const results = [];
    
    for (let i = 0; i < problems.length; i += concurrency) {
      const batch = problems.slice(i, i + concurrency);
      const batchPromises = batch.map(problem => this.runTest(problem));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      console.log(`\nCompleted ${results.length}/${problems.length} tests`);
    }
    
    // Save results
    await this.saveResults(results);
    
    // Print summary
    this.printSummary(results);
    
    return results;
  }

  async saveResults(results) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = path.join(__dirname, `../../test/business/results/${this.config.name || 'unnamed'}`);
    
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });
    
    // Save job IDs list
    const jobIds = results
      .filter(r => r.status === 'completed')
      .map(r => r.jobId);
    
    const summaryPath = path.join(outputDir, 'summary.json');
    await fs.writeFile(summaryPath, JSON.stringify({
      config: this.config,
      timestamp,
      duration: Date.now() - this.startTime,
      totalTests: results.length,
      completed: results.filter(r => r.status === 'completed').length,
      failed: results.filter(r => r.status === 'failed').length,
      jobIds,
      results
    }, null, 2));
    
    console.log(`\nResults saved to: ${summaryPath}`);
  }

  printSummary(results) {
    const completed = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const duration = (Date.now() - this.startTime) / 1000;
    
    console.log('\nTest Suite Summary');
    console.log('==================');
    console.log(`Total tests: ${results.length}`);
    console.log(`Completed: ${completed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Duration: ${duration.toFixed(1)}s`);
    console.log(`Success rate: ${(completed / results.length * 100).toFixed(1)}%`);
  }
}

// Main execution
async function main() {
  const configFile = process.argv[2];
  
  if (!configFile) {
    console.error('Usage: node run-test-suite.js <config-file>');
    console.error('Example: node run-test-suite.js baseline-config.json');
    process.exit(1);
  }
  
  try {
    // Load configuration
    const configPath = path.join(process.cwd(), configFile);
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    // Run test suite
    const runner = new TestRunner(config);
    await runner.runSuite();
    
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default TestRunner;