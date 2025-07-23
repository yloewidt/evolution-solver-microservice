#!/usr/bin/env node
import fetch from 'node-fetch';
import fs from 'fs/promises';

const API_URL = 'https://evolution-solver-production-pfm22omnda-uc.a.run.app';

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

// Format time
function formatTime(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toTimeString().slice(0, 8);
}

// Format duration in seconds
function formatDuration(ms) {
  if (!ms && ms !== 0) return 'N/A';
  return `${Math.round(ms / 1000)}s`;
}

// Create detailed stage table
async function createStageTable() {
  try {
    const jobInfo = JSON.parse(await fs.readFile('parallel-jobs.json', 'utf8'));
    
    console.log('📊 Stage-by-Stage Execution Report');
    console.log('==================================');
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    // Collect all stage data
    const allStages = [];
    
    for (const job of jobInfo) {
      const [status, analytics] = await Promise.all([
        getJobStatus(job.jobId),
        getJobAnalytics(job.jobId)
      ]);
      
      // Extract stages from API calls
      if (status.apiCalls && status.apiCalls.length > 0) {
        status.apiCalls.forEach(call => {
          if (call.phase && call.generation !== undefined) {
            allStages.push({
              jobName: job.name,
              jobId: job.jobId,
              generation: call.generation,
              phase: call.phase,
              status: call.status || 'completed',
              tokensIn: call.usage?.prompt_tokens || 0,
              tokensOut: call.usage?.completion_tokens || 0,
              timestamp: call.timestamp,
              duration: call.duration,
              model: call.model || 'o3',
              requestId: call.id
            });
          }
        });
      }
    }
    
    // Sort by timestamp
    allStages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Print table header
    console.log('Job              | Gen | Phase     | Status    | Tokens In | Tokens Out | Started  | Duration | Model');
    console.log('-----------------|-----|-----------|-----------|-----------|------------|----------|----------|-------');
    
    // Print each stage
    allStages.forEach(stage => {
      console.log(
        `${stage.jobName.padEnd(16)} | ${stage.generation.toString().padEnd(3)} | ${stage.phase.padEnd(9)} | ${stage.status.padEnd(9)} | ${stage.tokensIn.toString().padEnd(9)} | ${stage.tokensOut.toString().padEnd(10)} | ${formatTime(stage.timestamp)} | ${formatDuration(stage.duration).padEnd(8)} | ${stage.model}`
      );
    });
    
    // Summary by job
    console.log('\n📊 Summary by Job:');
    console.log('==================');
    console.log('\nJob              | Total Calls | Variator | Enricher | Ranker | Total Tokens | Avg Duration');
    console.log('-----------------|-------------|----------|----------|--------|--------------|-------------');
    
    for (const job of jobInfo) {
      const jobStages = allStages.filter(s => s.jobId === job.jobId);
      const variatorCount = jobStages.filter(s => s.phase === 'variator').length;
      const enricherCount = jobStages.filter(s => s.phase === 'enricher').length;
      const rankerCount = jobStages.filter(s => s.phase === 'ranker').length;
      const totalTokens = jobStages.reduce((sum, s) => sum + s.tokensIn + s.tokensOut, 0);
      const avgDuration = jobStages.length > 0 
        ? Math.round(jobStages.reduce((sum, s) => sum + (s.duration || 0), 0) / jobStages.length / 1000)
        : 0;
      
      console.log(
        `${job.name.padEnd(16)} | ${jobStages.length.toString().padEnd(11)} | ${variatorCount.toString().padEnd(8)} | ${enricherCount.toString().padEnd(8)} | ${rankerCount.toString().padEnd(6)} | ${totalTokens.toString().padEnd(12)} | ${avgDuration}s`
      );
    }
    
    // Overall statistics
    console.log('\n📈 Overall Statistics:');
    console.log('=====================');
    console.log(`Total API Calls: ${allStages.length}`);
    console.log(`Total Tokens: ${allStages.reduce((sum, s) => sum + s.tokensIn + s.tokensOut, 0)}`);
    console.log(`Average Call Duration: ${Math.round(allStages.reduce((sum, s) => sum + (s.duration || 0), 0) / allStages.length / 1000)}s`);
    
    // Phase breakdown
    const phaseStats = {
      variator: allStages.filter(s => s.phase === 'variator'),
      enricher: allStages.filter(s => s.phase === 'enricher'),
      ranker: allStages.filter(s => s.phase === 'ranker')
    };
    
    console.log('\nPhase Breakdown:');
    Object.entries(phaseStats).forEach(([phase, stages]) => {
      if (stages.length > 0) {
        const tokens = stages.reduce((sum, s) => sum + s.tokensIn + s.tokensOut, 0);
        const avgDuration = Math.round(stages.reduce((sum, s) => sum + (s.duration || 0), 0) / stages.length / 1000);
        console.log(`${phase}: ${stages.length} calls, ${tokens} tokens, avg ${avgDuration}s`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run report
createStageTable().catch(console.error);