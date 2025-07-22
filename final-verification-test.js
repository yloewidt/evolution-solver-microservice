#!/usr/bin/env node

import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

const testJobs = [
  { name: '1x17 Retry', generations: 1, populationSize: 17 },
  { name: '1x34 Retry', generations: 1, populationSize: 34 },
  { name: '20x20 Mini', generations: 5, populationSize: 10 }
];

async function runJob(config) {
  console.log(`\n🚀 Starting ${config.name} (${config.generations}x${config.populationSize})...`);
  
  const jobPayload = {
    problemContext: `Industry: Healthcare Technology
Market Size: $250B
Growth Rate: 15% annually

BOTTLENECK TO SOLVE:
Problem: Healthcare data interoperability
Impact: $30B in annual inefficiencies
Type: Technical and regulatory
Severity: High

Generate innovative solutions that leverage AI and partnerships.`,
    initialSolutions: [],
    evolutionConfig: {
      generations: config.generations,
      populationSize: config.populationSize,
      topSelectCount: Math.floor(config.populationSize * 0.3),
      model: 'o3',
      temperature: 0.7
    }
  };
  
  try {
    const response = await fetch(`${API_URL}/api/evolution/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobPayload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    console.log(`Job ID: ${result.jobId}`);
    
    // Monitor job
    let enricherFailures = 0;
    let enricherSuccesses = 0;
    let completed = false;
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes
    
    while (!completed && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 10000));
      attempts++;
      
      const statusRes = await fetch(`${API_URL}/api/evolution/jobs/${result.jobId}`);
      const jobData = await statusRes.json();
      
      if (jobData.generations) {
        for (const [gen, genData] of Object.entries(jobData.generations)) {
          if (genData.enricherComplete && genData.enricherFailures === undefined) {
            if (genData.solutions?.length === 0) {
              genData.enricherFailures = true;
              enricherFailures++;
              console.log(`❌ ${gen}: Enricher parsing FAILED`);
            } else if (genData.solutions?.length > 0) {
              genData.enricherSuccesses = true;
              enricherSuccesses++;
              console.log(`✅ ${gen}: Enricher parsed ${genData.solutions.length} solutions`);
            }
          }
        }
      }
      
      if (jobData.status === 'completed') {
        completed = true;
        console.log(`\n✅ ${config.name} COMPLETED`);
        console.log(`Total solutions: ${jobData.totalSolutions || 0}`);
        console.log(`Enricher success rate: ${enricherSuccesses}/${enricherSuccesses + enricherFailures}`);
      } else if (jobData.status === 'failed') {
        completed = true;
        console.log(`\n❌ ${config.name} FAILED: ${jobData.error}`);
      }
    }
    
    if (!completed) {
      console.log(`\n⏱️ ${config.name} timed out`);
    }
    
    return {
      config,
      enricherFailures,
      enricherSuccesses,
      completed,
      jobId: result.jobId
    };
    
  } catch (error) {
    console.error(`Error in ${config.name}:`, error.message);
    return {
      config,
      error: error.message
    };
  }
}

async function runFinalVerification() {
  console.log('🧪 FINAL VERIFICATION TEST');
  console.log('Testing JSON parsing fix with jobs similar to stuck ones...\n');
  
  const results = [];
  
  for (const job of testJobs) {
    const result = await runJob(job);
    results.push(result);
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Summary
  console.log('\n\n📊 FINAL RESULTS:');
  console.log('='.repeat(80));
  
  let totalEnricherAttempts = 0;
  let totalEnricherSuccesses = 0;
  
  results.forEach(r => {
    if (r.enricherSuccesses !== undefined) {
      totalEnricherAttempts += r.enricherSuccesses + r.enricherFailures;
      totalEnricherSuccesses += r.enricherSuccesses;
    }
    
    console.log(`\n${r.config.name}:`);
    console.log(`- Job ID: ${r.jobId || 'N/A'}`);
    console.log(`- Status: ${r.completed ? 'Completed' : r.error || 'Incomplete'}`);
    console.log(`- Enricher Success Rate: ${r.enricherSuccesses || 0}/${(r.enricherSuccesses || 0) + (r.enricherFailures || 0)}`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log(`OVERALL ENRICHER SUCCESS RATE: ${totalEnricherSuccesses}/${totalEnricherAttempts}`);
  console.log(`SUCCESS PERCENTAGE: ${totalEnricherAttempts > 0 ? (totalEnricherSuccesses / totalEnricherAttempts * 100).toFixed(1) : 0}%`);
  
  if (totalEnricherSuccesses === totalEnricherAttempts && totalEnricherAttempts > 0) {
    console.log('\n🎉 PERFECT SUCCESS! JSON parsing fix is working flawlessly!');
  } else if (totalEnricherSuccesses > 0) {
    console.log('\n⚠️ PARTIAL SUCCESS - Some enricher calls still failing');
  } else {
    console.log('\n❌ NO SUCCESS - JSON parsing fix not working');
  }
}

runFinalVerification().catch(console.error);