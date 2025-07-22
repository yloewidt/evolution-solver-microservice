#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';
const WORKER_URL = 'https://evolution-solver-worker-production-871069696471.us-central1.run.app';

async function fixIncompleteJob(jobId) {
  console.log(`\n🔧 Fixing incomplete job: ${jobId}`);
  console.log('='.repeat(80));
  
  try {
    // Get job data
    const jobResponse = await fetch(`${API_URL}/api/evolution/jobs/${jobId}`);
    const jobData = await jobResponse.json();
    
    console.log(`Status: ${jobData.status}`);
    console.log(`Has result data: ${!!jobData.topSolutions}`);
    
    if (jobData.topSolutions) {
      console.log('Job already has result data');
      return;
    }
    
    // Check if it has generation data
    if (!jobData.generations) {
      console.log('No generation data found');
      return;
    }
    
    const genCount = Object.keys(jobData.generations).length;
    console.log(`Generations found: ${genCount}`);
    
    // Trigger the complete-job endpoint
    console.log('\nTriggering job completion...');
    const completeResponse = await fetch(`${WORKER_URL}/complete-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId })
    });
    
    if (!completeResponse.ok) {
      throw new Error(`HTTP ${completeResponse.status}: ${await completeResponse.text()}`);
    }
    
    const completeData = await completeResponse.json();
    console.log('✅ Job completion triggered:', completeData);
    
    // Verify the fix
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const verifyResponse = await fetch(`${API_URL}/api/evolution/jobs/${jobId}`);
    const verifyData = await verifyResponse.json();
    
    if (verifyData.topSolutions) {
      console.log('\n✅ Job successfully fixed!');
      console.log(`Total solutions: ${verifyData.totalSolutions}`);
      console.log(`Top solutions: ${verifyData.topSolutions.length}`);
      console.log(`Top score: ${verifyData.topSolutions[0]?.score}`);
    } else {
      console.log('\n❌ Job still incomplete');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Fix the 1x17 job
fixIncompleteJob('398ff829-5e8b-430b-989f-ebbe5214b670').catch(console.error);