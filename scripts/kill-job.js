#!/usr/bin/env node

import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

async function killJob(jobId) {
  console.log(`Killing job: ${jobId}`);
  
  // First check job status
  const statusResponse = await fetch(`${API_URL}/api/evolution/jobs/${jobId}`);
  const status = await statusResponse.json();
  
  console.log('Current status:', status.status);
  
  // We'll need to add a kill endpoint or update the job directly in Firestore
  // For now, let's at least check the status
  
  return status;
}

const jobId = process.argv[2] || 'e6afbcfc-0cad-454b-a578-0022a37dc26f';
killJob(jobId).then(console.log).catch(console.error);