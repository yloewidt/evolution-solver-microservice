#!/usr/bin/env node

import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

const jobs = [
  { id: 'd74c53ee-1428-4c09-8f8c-643df5c8e77e', name: '1x100', gens: 1, pop: 100 },
  { id: 'a55d2274-0841-4a89-86b0-81af142f6b8f', name: '2x50', gens: 2, pop: 50 },
  { id: '50e03129-5947-4d64-a459-771e6b01feee', name: '4x25', gens: 4, pop: 25 },
  { id: 'c6674bca-0082-4928-8082-2717de02d0f6', name: '10x10', gens: 10, pop: 10 },
  { id: '83ef0f18-00ca-461c-b7f0-7bc23c21fcfa', name: '20x5', gens: 20, pop: 5 }
];

function calculateDuration(start, end) {
  if (!start || !end) return null;
  
  // Handle Firestore timestamp format
  let startTime, endTime;
  
  if (start._seconds) {
    startTime = new Date(start._seconds * 1000 + (start._nanoseconds || 0) / 1000000);
  } else {
    startTime = new Date(start);
  }
  
  if (end._seconds) {
    endTime = new Date(end._seconds * 1000 + (end._nanoseconds || 0) / 1000000);
  } else {
    endTime = new Date(end);
  }
  
  return (endTime - startTime) / 1000; // seconds
}

async function analyzeJobTiming(job) {
  try {
    const [jobRes, analyticsRes] = await Promise.all([
      fetch(`${API_URL}/api/evolution/jobs/${job.id}`),
      fetch(`${API_URL}/api/evolution/jobs/${job.id}/analytics`)
    ]);
    
    const jobData = await jobRes.json();
    const analytics = await analyticsRes.json();
    
    console.log('\n' + '='.repeat(100));
    console.log(`📊 ${job.name} - ${job.gens} generations × ${job.pop} ideas`);
    console.log(`Status: ${jobData.status} | Total Elapsed: ${analytics.timing?.elapsedMinutes?.toFixed(2) || 'N/A'} minutes | API Calls: ${analytics.o3Calls?.actual || 0}`);
    console.log('='.repeat(100));
    
    console.log('┌──────────┬────────────┬────────────────┬──────────────────┬──────────────────┬────────────────┐');
    console.log('│ Gen      │ Stage      │ Duration (sec) │ Tokens In→Out    │ Status           │ Score (Top/Avg)│');
    console.log('├──────────┼────────────┼────────────────┼──────────────────┼──────────────────┼────────────────┤');
    
    let totalVariatorTime = 0;
    let totalEnricherTime = 0;
    let completedGenerations = 0;
    
    for (let gen = 1; gen <= job.gens; gen++) {
      const genKey = `generation_${gen}`;
      const genData = jobData.generations?.[genKey] || {};
      const genAnalytics = analytics.generationAnalytics?.[gen - 1];
      
      // Variator
      let variatorStatus = '⏸️ Not Started';
      let variatorDuration = '-';
      let variatorTokens = '-';
      
      if (genData.variatorStartedAt) {
        if (genData.variatorComplete && genData.variatorCompletedAt) {
          variatorStatus = '✅ Complete';
          const duration = calculateDuration(genData.variatorStartedAt, genData.variatorCompletedAt);
          if (duration) {
            variatorDuration = duration.toFixed(1);
            totalVariatorTime += duration;
          }
        } else if (genData.variatorError) {
          variatorStatus = '❌ Failed';
        } else {
          variatorStatus = '🔄 Processing';
          const elapsed = calculateDuration(genData.variatorStartedAt, new Date());
          if (elapsed) variatorDuration = elapsed.toFixed(1) + '+';
        }
      }
      
      // Calculate tokens for this generation
      if (gen <= analytics.o3Calls?.breakdown?.variator) {
        const variatorIn = Math.round((analytics.tokenUsage?.byPhase?.variator?.input || 0) / analytics.o3Calls.breakdown.variator);
        const variatorOut = Math.round((analytics.tokenUsage?.byPhase?.variator?.output || 0) / analytics.o3Calls.breakdown.variator);
        if (variatorIn || variatorOut) variatorTokens = `${variatorIn}→${variatorOut}`;
      }
      
      const scoreInfo = genAnalytics ? 
        `${genAnalytics.topScore?.toFixed(2) || '-'}/${genAnalytics.avgScore?.toFixed(2) || '-'}` : 
        '-';
      
      console.log(`│ Gen ${String(gen).padEnd(4)} │ Variator   │ ${variatorDuration.padEnd(14)} │ ${variatorTokens.padEnd(16)} │ ${variatorStatus.padEnd(16)} │ ${gen === 1 ? scoreInfo.padEnd(14) : ''.padEnd(14)} │`);
      
      // Enricher
      let enricherStatus = '⏸️ Not Started';
      let enricherDuration = '-';
      let enricherTokens = '-';
      
      if (genData.enricherStartedAt) {
        if (genData.enricherComplete && genData.enricherCompletedAt) {
          enricherStatus = '✅ Complete';
          const duration = calculateDuration(genData.enricherStartedAt, genData.enricherCompletedAt);
          if (duration) {
            enricherDuration = duration.toFixed(1);
            totalEnricherTime += duration;
          }
        } else if (genData.enricherError) {
          enricherStatus = '❌ Failed';
        } else {
          enricherStatus = '🔄 Processing';
          const elapsed = calculateDuration(genData.enricherStartedAt, new Date());
          if (elapsed) enricherDuration = elapsed.toFixed(1) + '+';
        }
      }
      
      // Calculate enricher tokens
      if (gen <= analytics.o3Calls?.breakdown?.enricher) {
        const enricherIn = Math.round((analytics.tokenUsage?.byPhase?.enricher?.input || 0) / analytics.o3Calls.breakdown.enricher);
        const enricherOut = Math.round((analytics.tokenUsage?.byPhase?.enricher?.output || 0) / analytics.o3Calls.breakdown.enricher);
        if (enricherIn || enricherOut) enricherTokens = `${enricherIn}→${enricherOut}`;
      }
      
      console.log(`│          │ Enricher   │ ${enricherDuration.padEnd(14)} │ ${enricherTokens.padEnd(16)} │ ${enricherStatus.padEnd(16)} │                │`);
      
      // Count completed generations
      if (genData.generationComplete) {
        completedGenerations++;
      }
      
      if (gen < job.gens) {
        console.log('├──────────┼────────────┼────────────────┼──────────────────┼──────────────────┼────────────────┤');
      }
    }
    
    console.log('└──────────┴────────────┴────────────────┴──────────────────┴──────────────────┴────────────────┘');
    
    // Summary
    if (completedGenerations > 0) {
      console.log('\nPerformance Metrics:');
      console.log(`  • Completed Generations: ${completedGenerations}/${job.gens}`);
      console.log(`  • Avg Variator Time: ${(totalVariatorTime / completedGenerations).toFixed(1)}s`);
      console.log(`  • Avg Enricher Time: ${(totalEnricherTime / completedGenerations).toFixed(1)}s`);
      console.log(`  • Avg Total per Gen: ${((totalVariatorTime + totalEnricherTime) / completedGenerations).toFixed(1)}s`);
      
      const totalTokens = (analytics.tokenUsage?.total?.input || 0) + (analytics.tokenUsage?.total?.output || 0);
      console.log(`  • Tokens per Idea: ${Math.round(totalTokens / (completedGenerations * job.pop))}`);
      console.log(`  • Tokens per Generation: ${Math.round(totalTokens / completedGenerations)}`);
    }
    
  } catch (error) {
    console.error(`Error analyzing ${job.name}:`, error.message);
  }
}

async function main() {
  console.log('🔍 Detailed Timing Analysis for Parallel Jobs');
  console.log(`Analysis Time: ${new Date().toLocaleString()}`);
  
  for (const job of jobs) {
    await analyzeJobTiming(job);
  }
  
  console.log('\n' + '='.repeat(100));
  console.log('Key Insights:');
  console.log('• 1x100: Stuck in enricher - too many ideas for single API call');
  console.log('• 2x50: Very slow progress - large batches inefficient');  
  console.log('• 4x25: Moderate progress - reasonable batch size');
  console.log('• 10x10: Good progress - efficient batch size');
  console.log('• 20x5: Best progress - smallest batches process fastest');
}

main().catch(console.error);