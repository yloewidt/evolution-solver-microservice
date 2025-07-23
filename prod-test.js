#!/usr/bin/env node

import axios from 'axios';

const PROD_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

async function prodTest() {
  console.log('🧪 PRODUCTION TEST');
  console.log('==================\n');
  
  const startTime = Date.now();
  
  try {
    // Submit minimal job
    const response = await axios.post(`${PROD_URL}/api/evolution/jobs`, {
      problemContext: "Create innovative business models for sustainable urban transportation",
      parameters: {
        generations: 2,
        populationSize: 5,
        topSelectCount: 2,
        enricherConcurrency: 25,
        model: 'gpt-4o',
        useSingleIdeaEnricher: true
      }
    });

    const jobId = response.data.jobId;
    console.log(`Job ID: ${jobId}`);
    console.log('Monitoring (timeout: 5 minutes)...\n');
    
    // Monitor for up to 5 minutes
    let completed = false;
    let lastStatus = '';
    const timeout = setTimeout(() => {
      console.log('\n⏱️ Timeout after 5 minutes');
      process.exit(1);
    }, 300000);
    
    while (!completed) {
      await new Promise(r => setTimeout(r, 5000));
      
      const status = await axios.get(`${PROD_URL}/api/evolution/jobs/${jobId}`);
      const job = status.data;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      
      if (job.status !== lastStatus) {
        console.log(`[${elapsed}s] Status: ${job.status}`);
        lastStatus = job.status;
      }
      
      if (job.progress?.currentGeneration) {
        console.log(`  Generation ${job.progress.currentGeneration}/${job.progress.totalGenerations} (${job.progress.percentComplete}%)`);
      }
      
      if (job.status === 'completed') {
        clearTimeout(timeout);
        const totalTime = (Date.now() - startTime) / 1000;
        
        console.log(`\n✅ COMPLETED in ${totalTime.toFixed(1)}s!`);
        console.log(`Average per generation: ${(totalTime/2).toFixed(1)}s`);
        
        // Check for enricher usage
        try {
          const analytics = await axios.get(`${PROD_URL}/api/evolution/jobs/${jobId}/analytics`);
          const enricherTokens = analytics.data.tokenUsage?.byPhase?.enricher?.output || 0;
          
          if (enricherTokens > 0) {
            console.log('\n✅ Single-idea enricher CONFIRMED!');
            console.log(`Enricher tokens: ${enricherTokens}`);
          } else {
            console.log('\n⚠️ No enricher tokens - using old architecture');
          }
          
          // Calculate speedup
          const oldTime = 138; // seconds per generation
          const newTime = totalTime / 2;
          const speedup = oldTime / newTime;
          
          console.log(`\n🚀 Performance: ${speedup.toFixed(1)}x faster than old system`);
          
          if (speedup >= 3) {
            console.log('\n✅ PRODUCTION VALIDATION PASSED!');
          }
        } catch (e) {
          console.log('\nCould not fetch analytics');
        }
        
        completed = true;
      }
      
      if (job.status === 'failed') {
        clearTimeout(timeout);
        console.error(`\n❌ Failed: ${job.error}`);
        completed = true;
      }
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

console.log('Testing production deployment...\n');
prodTest();