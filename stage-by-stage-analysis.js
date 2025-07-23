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

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(timestamp) {
  if (!timestamp) return null;
  
  // Handle Firestore timestamp format
  if (timestamp._seconds) {
    return new Date(timestamp._seconds * 1000 + (timestamp._nanoseconds || 0) / 1000000);
  }
  return new Date(timestamp);
}

function calculateDuration(start, end) {
  if (!start || !end) return null;
  
  const startTime = formatTime(start);
  const endTime = formatTime(end);
  
  return (endTime - startTime) / 1000; // seconds
}

async function analyzeJobStages(job) {
  try {
    const [jobRes, analyticsRes] = await Promise.all([
      fetch(`${API_URL}/api/evolution/jobs/${job.id}`),
      fetch(`${API_URL}/api/evolution/jobs/${job.id}/analytics`)
    ]);
    
    const jobData = await jobRes.json();
    const analytics = await analyticsRes.json();
    
    console.log('\n' + '='.repeat(120));
    console.log(`📊 ${job.name} - ${job.gens} generations × ${job.pop} ideas`);
    console.log(`Status: ${jobData.status} | Job ID: ${job.id}`);
    console.log('='.repeat(120));
    
    console.log('┌──────────┬───────────────┬────────────┬──────────────┬───────────────┬──────────┬────────────────────────────────────────┐');
    console.log('│ Stage    │ Process       │ Status     │ Tokens In    │ Tokens Out    │ Duration │ Notes                                  │');
    console.log('├──────────┼───────────────┼────────────┼──────────────┼───────────────┼──────────┼────────────────────────────────────────┤');
    
    const stages = [];
    
    for (let gen = 1; gen <= job.gens; gen++) {
      const genKey = `generation_${gen}`;
      const genData = jobData.generations?.[genKey] || {};
      
      // Calculate tokens for this generation
      let variatorTokensIn = 0;
      let variatorTokensOut = 0;
      let enricherTokensIn = 0;
      let enricherTokensOut = 0;
      
      if (analytics.o3Calls?.breakdown?.variator > 0) {
        variatorTokensIn = Math.round((analytics.tokenUsage?.byPhase?.variator?.input || 0) / analytics.o3Calls.breakdown.variator);
        variatorTokensOut = Math.round((analytics.tokenUsage?.byPhase?.variator?.output || 0) / analytics.o3Calls.breakdown.variator);
      }
      
      if (analytics.o3Calls?.breakdown?.enricher > 0) {
        enricherTokensIn = Math.round((analytics.tokenUsage?.byPhase?.enricher?.input || 0) / analytics.o3Calls.breakdown.enricher);
        enricherTokensOut = Math.round((analytics.tokenUsage?.byPhase?.enricher?.output || 0) / analytics.o3Calls.breakdown.enricher);
      }
      
      // Variator stage
      let variatorStatus = 'pending';
      let variatorDuration = null;
      let variatorNotes = '';
      
      if (genData.variatorStartedAt) {
        if (genData.variatorComplete && genData.variatorCompletedAt) {
          variatorStatus = 'completed';
          variatorDuration = calculateDuration(genData.variatorStartedAt, genData.variatorCompletedAt);
        } else if (genData.variatorError) {
          variatorStatus = 'failed';
          variatorNotes = 'Error occurred';
        } else {
          variatorStatus = 'processing';
          variatorDuration = calculateDuration(genData.variatorStartedAt, new Date());
          variatorNotes = 'Still running';
        }
      }
      
      // Only show tokens if this generation was actually processed
      const showVariatorTokens = gen <= analytics.o3Calls?.breakdown?.variator;
      
      console.log(`│ Gen ${String(gen).padEnd(4)} │ Variator      │ ${variatorStatus.padEnd(10)} │ ${showVariatorTokens ? String(variatorTokensIn).padStart(12) : '-'.padStart(12)} │ ${showVariatorTokens ? String(variatorTokensOut).padStart(13) : '-'.padStart(13)} │ ${formatDuration(variatorDuration).padEnd(8)} │ ${variatorNotes.padEnd(38)} │`);
      
      // Enricher stage
      let enricherStatus = 'pending';
      let enricherDuration = null;
      let enricherNotes = '';
      
      if (genData.enricherStartedAt) {
        if (genData.enricherComplete && genData.enricherCompletedAt) {
          enricherStatus = 'completed';
          enricherDuration = calculateDuration(genData.enricherStartedAt, genData.enricherCompletedAt);
        } else if (genData.enricherError) {
          enricherStatus = 'failed';
          enricherNotes = genData.enricherError.includes('timeout') ? 'Request timeout' : 'Error occurred';
        } else {
          enricherStatus = 'processing';
          enricherDuration = calculateDuration(genData.enricherStartedAt, new Date());
          enricherNotes = 'Still running';
        }
      }
      
      // Only show tokens if this generation was actually processed
      const showEnricherTokens = gen <= analytics.o3Calls?.breakdown?.enricher;
      
      console.log(`│          │ Enricher      │ ${enricherStatus.padEnd(10)} │ ${showEnricherTokens ? String(enricherTokensIn).padStart(12) : '-'.padStart(12)} │ ${showEnricherTokens ? String(enricherTokensOut).padStart(13) : '-'.padStart(13)} │ ${formatDuration(enricherDuration).padEnd(8)} │ ${enricherNotes.padEnd(38)} │`);
      
      // Ranker stage (if enricher completed)
      if (genData.enricherComplete && genData.rankerComplete) {
        const genAnalytics = analytics.generationAnalytics?.[gen - 1];
        const scoreInfo = genAnalytics ? `Top: ${genAnalytics.topScore?.toFixed(2)}, Avg: ${genAnalytics.avgScore?.toFixed(2)}` : '';
        console.log(`│          │ Ranker        │ completed  │ ${'-'.padStart(12)} │ ${'-'.padStart(13)} │ ~0:00    │ ${scoreInfo.padEnd(38)} │`);
      }
      
      if (gen < job.gens) {
        console.log('├──────────┼───────────────┼────────────┼──────────────┼───────────────┼──────────┼────────────────────────────────────────┤');
      }
    }
    
    console.log('└──────────┴───────────────┴────────────┴──────────────┴───────────────┴──────────┴────────────────────────────────────────┘');
    
    // Summary statistics
    console.log('\nSummary:');
    console.log(`  • Total API Calls: ${analytics.o3Calls?.actual || 0} (Variator: ${analytics.o3Calls?.breakdown?.variator || 0}, Enricher: ${analytics.o3Calls?.breakdown?.enricher || 0})`);
    console.log(`  • Total Tokens: ${(analytics.tokenUsage?.total?.input || 0) + (analytics.tokenUsage?.total?.output || 0)} (In: ${analytics.tokenUsage?.total?.input || 0}, Out: ${analytics.tokenUsage?.total?.output || 0})`);
    console.log(`  • Elapsed Time: ${analytics.timing?.elapsedMinutes?.toFixed(2) || 'N/A'} minutes`);
    
    if (analytics.generationAnalytics?.length > 0) {
      const firstGen = analytics.generationAnalytics[0];
      const lastGen = analytics.generationAnalytics[analytics.generationAnalytics.length - 1];
      console.log(`  • Score Evolution: ${firstGen.topScore?.toFixed(2)} → ${lastGen.topScore?.toFixed(2)} (${lastGen.topScore > firstGen.topScore ? '+' : ''}${(lastGen.topScore - firstGen.topScore).toFixed(2)})`);
    }
    
  } catch (error) {
    console.error(`Error analyzing ${job.name}:`, error.message);
  }
}

async function main() {
  console.log('🔍 Stage-by-Stage Job Analysis');
  console.log(`Analysis Time: ${new Date().toLocaleString()}`);
  
  for (const job of jobs) {
    await analyzeJobStages(job);
  }
  
  console.log('\n' + '='.repeat(120));
  console.log('Analysis Complete');
}

main().catch(console.error);