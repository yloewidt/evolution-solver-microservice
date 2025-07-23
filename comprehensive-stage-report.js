#!/usr/bin/env node
import fetch from 'node-fetch';
import fs from 'fs/promises';

const API_URL = 'https://evolution-solver-production-pfm22omnda-uc.a.run.app';

// Get both job data and analytics
async function getFullJobData(jobId) {
  const [status, analytics] = await Promise.all([
    fetch(`${API_URL}/api/evolution/jobs/${jobId}`).then(r => r.json()),
    fetch(`${API_URL}/api/evolution/jobs/${jobId}/analytics`).then(r => r.json())
  ]);
  return { status, analytics };
}

// Format time
function formatTime(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toTimeString().slice(0, 8);
}

// Format duration
function formatDuration(ms) {
  if (!ms && ms !== 0) return 'N/A';
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${seconds}s`;
}

// Create comprehensive report
async function createComprehensiveReport() {
  try {
    const jobInfo = JSON.parse(await fs.readFile('parallel-jobs.json', 'utf8'));
    
    console.log('📊 Comprehensive Stage-by-Stage Execution Report');
    console.log('===============================================');
    console.log(`Generated: ${new Date().toISOString()}`);
    console.log(`Problem: Sustainable urban farming business models\n`);
    
    // Get all job data
    const allJobData = await Promise.all(
      jobInfo.map(async job => ({
        ...job,
        data: await getFullJobData(job.jobId)
      }))
    );
    
    // Main execution table
    console.log('Execution Timeline:');
    console.log('==================\n');
    console.log('Job Config       | Gen | Phase     | Status    | Tokens In  | Tokens Out | Total    | Started  | Duration  | Model');
    console.log('-----------------|-----|-----------|-----------|------------|------------|----------|----------|-----------|-------');
    
    // Collect all events with timing
    const allEvents = [];
    
    for (const job of allJobData) {
      const { status, analytics } = job.data;
      
      // Use apiCalls for detailed timing
      if (status.apiCalls) {
        status.apiCalls.forEach(call => {
          if (call.phase && call.generation !== undefined) {
            // Get token data from analytics
            const genAnalytics = analytics.generationAnalytics?.find(g => g.generation === call.generation);
            const phaseTokens = analytics.tokenUsage?.byPhase?.[call.phase] || {};
            
            allEvents.push({
              jobName: job.name,
              generation: call.generation,
              phase: call.phase,
              status: call.status || 'completed',
              tokensIn: call.usage?.prompt_tokens || phaseTokens.input || 0,
              tokensOut: call.usage?.completion_tokens || phaseTokens.output || 0,
              timestamp: call.timestamp,
              duration: call.duration,
              model: call.model || 'o3'
            });
          }
        });
      }
    }
    
    // Sort by timestamp and print
    allEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    let currentJobTokens = {};
    allEvents.forEach(event => {
      // Track cumulative tokens per job
      if (!currentJobTokens[event.jobName]) {
        currentJobTokens[event.jobName] = { in: 0, out: 0 };
      }
      currentJobTokens[event.jobName].in += event.tokensIn;
      currentJobTokens[event.jobName].out += event.tokensOut;
      
      const total = event.tokensIn + event.tokensOut;
      
      console.log(
        `${event.jobName.padEnd(16)} | ${event.generation.toString().padEnd(3)} | ${event.phase.padEnd(9)} | ${event.status.padEnd(9)} | ${event.tokensIn.toString().padEnd(10)} | ${event.tokensOut.toString().padEnd(10)} | ${total.toString().padEnd(8)} | ${formatTime(event.timestamp)} | ${formatDuration(event.duration).padEnd(9)} | ${event.model}`
      );
    });
    
    // Job completion summary
    console.log('\n\nJob Completion Summary:');
    console.log('======================\n');
    console.log('Job Config       | Status    | Progress | Ideas | Best Score | Total Tokens | Total Time | Cost');
    console.log('-----------------|-----------|----------|-------|------------|--------------|------------|-------');
    
    let grandTotal = { ideas: 0, tokens: 0, cost: 0 };
    
    for (const job of allJobData) {
      const { status, analytics } = job.data;
      const progress = `${Object.keys(status.generations || {}).length}/${job.generations}`;
      const ideas = analytics.solutions?.all?.length || 0;
      const bestScore = analytics.solutions?.topScores?.[0]?.score || 0;
      const totalTokens = (analytics.tokenUsage?.total?.input || 0) + (analytics.tokenUsage?.total?.output || 0);
      const totalTime = analytics.timing?.elapsedMinutes ? `${Math.round(analytics.timing.elapsedMinutes)}m` : 'N/A';
      const cost = (totalTokens / 1000) * 0.015;
      
      grandTotal.ideas += ideas;
      grandTotal.tokens += totalTokens;
      grandTotal.cost += cost;
      
      console.log(
        `${job.name.padEnd(16)} | ${status.status.padEnd(9)} | ${progress.padEnd(8)} | ${ideas.toString().padEnd(5)} | ${bestScore.toFixed(2).padEnd(10)} | ${totalTokens.toString().padEnd(12)} | ${totalTime.padEnd(10)} | $${cost.toFixed(2)}`
      );
    }
    
    // Overall statistics
    console.log('\n\nOverall Statistics:');
    console.log('==================');
    console.log(`Total Jobs: ${jobInfo.length}`);
    console.log(`Total Ideas Generated: ${grandTotal.ideas}`);
    console.log(`Total API Calls: ${allEvents.length}`);
    console.log(`Total Tokens Used: ${grandTotal.tokens.toLocaleString()}`);
    console.log(`Total Estimated Cost: $${grandTotal.cost.toFixed(2)}`);
    
    // Phase breakdown
    const phaseStats = {};
    allEvents.forEach(event => {
      if (!phaseStats[event.phase]) {
        phaseStats[event.phase] = { count: 0, tokensIn: 0, tokensOut: 0, duration: 0 };
      }
      phaseStats[event.phase].count++;
      phaseStats[event.phase].tokensIn += event.tokensIn;
      phaseStats[event.phase].tokensOut += event.tokensOut;
      phaseStats[event.phase].duration += event.duration || 0;
    });
    
    console.log('\nPhase Statistics:');
    console.log('Phase     | Calls | Avg Tokens In | Avg Tokens Out | Avg Duration');
    console.log('----------|-------|---------------|----------------|-------------');
    
    Object.entries(phaseStats).forEach(([phase, stats]) => {
      const avgIn = Math.round(stats.tokensIn / stats.count);
      const avgOut = Math.round(stats.tokensOut / stats.count);
      const avgDuration = formatDuration(stats.duration / stats.count);
      
      console.log(
        `${phase.padEnd(9)} | ${stats.count.toString().padEnd(5)} | ${avgIn.toString().padEnd(13)} | ${avgOut.toString().padEnd(14)} | ${avgDuration}`
      );
    });
    
    // Current running time
    const earliestStart = Math.min(...allJobData.map(j => new Date(j.data.analytics.timing.createdAt)));
    const totalElapsed = Date.now() - earliestStart;
    console.log(`\nTotal Elapsed Time: ${formatDuration(totalElapsed)}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run report
createComprehensiveReport().catch(console.error);