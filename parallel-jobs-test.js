#!/usr/bin/env node
import fetch from 'node-fetch';
import { setTimeout } from 'timers/promises';

const API_URL = 'https://evolution-solver-production-pfm22omnda-uc.a.run.app';
const PROBLEM_CONTEXT = 'Create innovative business models for sustainable urban farming that can generate significant returns while addressing food security in cities';

// Job configurations
const JOB_CONFIGS = [
  { generations: 10, populationSize: 10, name: '10gen x 10ideas' },
  { generations: 5, populationSize: 20, name: '5gen x 20ideas' },
  { generations: 4, populationSize: 25, name: '4gen x 25ideas' },
  { generations: 3, populationSize: 33, name: '3gen x 33ideas' },
  { generations: 2, populationSize: 50, name: '2gen x 50ideas' }
];

// Create a job
async function createJob(config) {
  const response = await fetch(`${API_URL}/api/evolution/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      problemContext: PROBLEM_CONTEXT,
      preferences: {
        max_capex: 5.0,  // $5M max investment
        target_return: 10, // 10x return target
        timeline_months: 24
      },
      parameters: {  // Fixed: parameters must be in this object
        generations: config.generations,
        populationSize: config.populationSize
      }
    })
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  
  return {
    ...data,
    config: config,
    startTime: new Date()
  };
}

// Get job analytics
async function getJobAnalytics(jobId) {
  const response = await fetch(`${API_URL}/api/evolution/jobs/${jobId}/analytics`);
  return response.json();
}

// Get job status
async function getJobStatus(jobId) {
  const response = await fetch(`${API_URL}/api/evolution/jobs/${jobId}`);
  return response.json();
}

// Format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// Monitor jobs
async function monitorJobs(jobs) {
  console.log('\n📊 Monitoring Jobs Progress\n');
  console.log('Time | Job | Generation | Phase | Status | Tokens In | Tokens Out | Duration');
  console.log('-----|-----|------------|-------|--------|-----------|------------|----------');

  const startTime = Date.now();
  let allComplete = false;
  const jobStatuses = new Map();

  while (!allComplete) {
    allComplete = true;
    
    for (const job of jobs) {
      try {
        const [status, analytics] = await Promise.all([
          getJobStatus(job.jobId),
          getJobAnalytics(job.jobId)
        ]);

        const prevStatus = jobStatuses.get(job.jobId);
        jobStatuses.set(job.jobId, status);

        // Check for new generation/phase updates
        if (analytics.generationAnalytics) {
          for (const genData of analytics.generationAnalytics) {
            const genNum = genData.generation;
            
            // Check each phase
            for (const phase of ['variator', 'enricher', 'ranker']) {
              if (genData[phase]) {
                const phaseData = genData[phase];
                const phaseKey = `${job.jobId}-gen${genNum}-${phase}`;
                
                if (!jobStatuses.has(phaseKey) && phaseData.startTime) {
                  jobStatuses.set(phaseKey, true);
                  
                  const elapsed = Date.now() - startTime;
                  const duration = phaseData.duration ? formatDuration(phaseData.duration) : 'processing';
                  const tokens = analytics.tokenUsage?.byPhase?.[phase] || {};
                  
                  console.log(
                    `${formatDuration(elapsed)} | ${job.config.name} | Gen ${genNum} | ${phase} | ${phaseData.status || 'started'} | ${tokens.input || 0} | ${tokens.output || 0} | ${duration}`
                  );
                }
              }
            }
          }
        }

        if (status.status !== 'completed' && status.status !== 'failed') {
          allComplete = false;
        } else if (!prevStatus || prevStatus.status !== status.status) {
          const elapsed = Date.now() - startTime;
          console.log(
            `${formatDuration(elapsed)} | ${job.config.name} | Final | - | ${status.status} | ${analytics.tokenUsage?.total?.input || 0} | ${analytics.tokenUsage?.total?.output || 0} | ${formatDuration(elapsed)}`
          );
        }
      } catch (error) {
        console.error(`Error checking job ${job.jobId}:`, error.message);
      }
    }
    
    if (!allComplete) {
      await setTimeout(5000); // Check every 5 seconds
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting Parallel Evolution Jobs Test');
  console.log('Problem Context:', PROBLEM_CONTEXT);
  console.log('\nJob Configurations:');
  JOB_CONFIGS.forEach((config, i) => {
    console.log(`${i + 1}. ${config.name}: ${config.generations} generations × ${config.populationSize} ideas = ${config.generations * config.populationSize} total`);
  });

  console.log('\n⏳ Creating jobs...');
  
  try {
    // Create all jobs in parallel
    const jobs = await Promise.all(JOB_CONFIGS.map(config => createJob(config)));
    
    console.log('\n✅ All jobs created successfully!');
    jobs.forEach(job => {
      console.log(`- ${job.config.name}: Job ID ${job.jobId}`);
    });

    // Monitor all jobs
    await monitorJobs(jobs);
    
    console.log('\n📈 Final Summary:');
    
    // Get final analytics for all jobs
    const finalAnalytics = await Promise.all(
      jobs.map(async job => ({
        job,
        analytics: await getJobAnalytics(job.jobId)
      }))
    );
    
    console.log('\nJob | Total Ideas | Best Score | Total Tokens | Duration | Cost Estimate');
    console.log('----|-------------|------------|--------------|----------|---------------');
    
    let totalTokens = 0;
    let totalIdeas = 0;
    
    finalAnalytics.forEach(({ job, analytics }) => {
      const totalIn = analytics.tokenUsage?.total?.input || 0;
      const totalOut = analytics.tokenUsage?.total?.output || 0;
      const total = totalIn + totalOut;
      totalTokens += total;
      
      const topScore = analytics.solutions?.topScores?.[0]?.score || 0;
      const ideasCount = analytics.solutions?.all?.length || 0;
      totalIdeas += ideasCount;
      
      const duration = analytics.timing?.elapsedMinutes 
        ? `${Math.round(analytics.timing.elapsedMinutes)}m`
        : 'N/A';
      
      // Rough cost estimate (o3 pricing approximation)
      const costEstimate = (total / 1000) * 0.015; // Assuming ~$0.015 per 1K tokens
      
      console.log(
        `${job.config.name} | ${ideasCount} | ${topScore.toFixed(2)} | ${total} | ${duration} | $${costEstimate.toFixed(2)}`
      );
    });
    
    console.log(`\nTotal: ${totalIdeas} ideas generated using ${totalTokens} tokens`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
main().catch(console.error);