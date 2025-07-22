#!/usr/bin/env node
import fetch from 'node-fetch';

const WORKER_URL = 'https://evolution-solver-worker-production-871069696471.us-central1.run.app';

async function triggerCompleteJob(jobId, name) {
  console.log(`\n🔧 Triggering complete-job for ${name} (${jobId})...`);
  
  try {
    const response = await fetch(`${WORKER_URL}/complete-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    console.log(`✅ ${name} completion triggered:`, result);
    
  } catch (error) {
    console.error(`❌ ${name} failed:`, error.message);
  }
}

async function main() {
  console.log('Fixing completed jobs that are missing final aggregation...\n');
  
  // Fix 1x17 job (completed but no topSolutions)
  await triggerCompleteJob('398ff829-5e8b-430b-989f-ebbe5214b670', '1x17');
  
  // Fix 2x12 job (completed but no topSolutions)  
  await triggerCompleteJob('0d2d4124-f74e-434f-b10c-da58969a3136', '2x12');
  
  console.log('\nWaiting 3 seconds before verification...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Verify the fixes
  console.log('\nRunning analysis to verify fixes...');
  const { exec } = await import('child_process');
  exec('node analyze-all-jobs.js', (error, stdout, stderr) => {
    if (error) {
      console.error('Error running analysis:', error);
      return;
    }
    console.log(stdout);
  });
}

main().catch(console.error);