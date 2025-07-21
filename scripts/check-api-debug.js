#!/usr/bin/env node

import fetch from 'node-fetch';

async function checkApiDebug(jobId) {
  const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';
  
  console.log(`Checking API debug data for job: ${jobId}`);
  
  // Get job results which includes API calls
  const response = await fetch(`${API_URL}/api/evolution/results/${jobId}`);
  const jobData = await response.json();
  
  console.log('\nAPI Calls Summary:');
  console.log(`Total calls: ${jobData.apiCalls?.length || 0}`);
  
  if (jobData.apiCalls && jobData.apiCalls.length > 0) {
    console.log('\nLast API call:');
    const lastCall = jobData.apiCalls[jobData.apiCalls.length - 1];
    console.log(`- Phase: ${lastCall.phase}`);
    console.log(`- Generation: ${lastCall.generation}`);
    console.log(`- Timestamp: ${lastCall.timestamp}`);
    console.log(`- Latency: ${lastCall.latencyMs}ms`);
    
    // Note: We can't directly access the apiDebug subcollection via the API
    // We would need to add an endpoint for that or check via Firebase console
    console.log('\nTo view full debug data including prompts and responses:');
    console.log('Check Firestore > evolution-results > ' + jobId + ' > apiDebug subcollection');
  }
  
  return jobData.apiCalls;
}

const jobId = process.argv[2] || '4e591c6b-c34a-48d0-b7a0-8b900747e3bd';
checkApiDebug(jobId).catch(console.error);