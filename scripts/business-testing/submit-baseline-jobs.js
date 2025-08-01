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

// Already submitted job IDs
const existingJobs = [
  { problemId: 'food-waste-restaurants', jobId: '78f7bf54-4e73-438c-9b43-b73c8b838af1' },
  { problemId: 'elderly-tech-adoption', jobId: '23db77f9-6a47-4d68-abc4-8b23e1640953' },
  { problemId: 'rural-healthcare-access', jobId: '209e1307-3ad3-4a75-8f09-186c54761e15' }
];

const evolutionConfig = {
  generations: 20,
  populationSize: 10,
  model: "o3",
  maxCapex: 50,
  minProfits: 10
};

async function loadProblems() {
  const problemsPath = path.join(__dirname, '../../test/business/problems.json');
  const problemsData = await fs.readFile(problemsPath, 'utf-8');
  return JSON.parse(problemsData);
}

async function submitJob(problem) {
  try {
    console.log(`Submitting job for: ${problem.id}`);
    const response = await axios.post(`${API_URL}/api/evolution/jobs`, {
      problemContext: problem.context,
      evolutionConfig: evolutionConfig
    });
    
    console.log(`  ✓ Job submitted: ${response.data.jobId}`);
    return {
      problemId: problem.id,
      jobId: response.data.jobId,
      submittedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`  ✗ Failed to submit job for ${problem.id}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('Baseline Job Submission');
  console.log('======================');
  console.log(`API URL: ${API_URL}`);
  console.log(`Configuration: ${JSON.stringify(evolutionConfig, null, 2)}`);
  console.log('');
  
  // Load all problems
  const allProblems = await loadProblems();
  console.log(`Total problems: ${allProblems.length}`);
  
  // Find problems that haven't been submitted yet
  const submittedProblemIds = existingJobs.map(j => j.problemId);
  const remainingProblems = allProblems.filter(p => !submittedProblemIds.includes(p.id));
  
  console.log(`Already submitted: ${existingJobs.length}`);
  console.log(`Remaining to submit: ${remainingProblems.length}`);
  console.log('');
  
  // Combine existing jobs with new submissions
  const allJobs = [...existingJobs];
  
  // Submit remaining jobs with controlled concurrency
  const concurrency = 3;
  for (let i = 0; i < remainingProblems.length; i += concurrency) {
    const batch = remainingProblems.slice(i, i + concurrency);
    console.log(`\nSubmitting batch ${Math.floor(i/concurrency) + 1}/${Math.ceil(remainingProblems.length/concurrency)}...`);
    
    const batchPromises = batch.map(problem => submitJob(problem));
    const batchResults = await Promise.all(batchPromises);
    allJobs.push(...batchResults);
    
    // Small delay between batches to avoid overwhelming the API
    if (i + concurrency < remainingProblems.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Save all job IDs to markdown file
  const timestamp = new Date().toISOString();
  let markdown = `# Baseline Test Job IDs\n\n`;
  markdown += `**Test Configuration:**\n`;
  markdown += `- Generations: ${evolutionConfig.generations}\n`;
  markdown += `- Population Size: ${evolutionConfig.populationSize}\n`;
  markdown += `- Model: ${evolutionConfig.model}\n`;
  markdown += `- Total Jobs: ${allJobs.length}\n`;
  markdown += `- Submission Date: ${timestamp}\n\n`;
  
  markdown += `## Job IDs\n\n`;
  markdown += `| Problem ID | Job ID | Status |\n`;
  markdown += `|------------|--------|--------|\n`;
  
  allJobs.forEach(job => {
    const status = existingJobs.includes(job) ? 'Previously Submitted' : 'Newly Submitted';
    markdown += `| ${job.problemId} | ${job.jobId} | ${status} |\n`;
  });
  
  markdown += `\n## Job ID List (for easy copying)\n\n`;
  markdown += '```\n';
  allJobs.forEach(job => {
    markdown += `${job.jobId}\n`;
  });
  markdown += '```\n';
  
  const outputDir = path.join(__dirname, '../../test/business/results/baseline');
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'job-ids.md');
  await fs.writeFile(outputPath, markdown);
  
  console.log(`\n✅ All jobs submitted successfully!`);
  console.log(`📄 Job IDs saved to: ${outputPath}`);
  console.log(`Total jobs: ${allJobs.length}`);
}

main().catch(error => {
  console.error('Failed to submit jobs:', error);
  process.exit(1);
});