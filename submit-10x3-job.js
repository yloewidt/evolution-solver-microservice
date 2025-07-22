#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

async function submitJob() {
  console.log('🚀 Submitting 10x3 Evolution Job');
  console.log('================================\n');
  
  try {
    const jobPayload = {
      problemContext: "Find innovative AI-powered business opportunities in healthcare that can be implemented with minimal regulatory barriers",
      parameters: {
        generations: 10,
        populationSize: 3,
        topSelectCount: 2,
        offspringRatio: 0.7
      }
    };
    
    console.log('Configuration:');
    console.log(`- Generations: ${jobPayload.parameters.generations}`);
    console.log(`- Population Size: ${jobPayload.parameters.populationSize}`);
    console.log(`- Top Select: ${jobPayload.parameters.topSelectCount}`);
    console.log(`- Problem: ${jobPayload.problemContext}\n`);
    
    const response = await fetch(`${API_URL}/api/evolution/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobPayload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    console.log('✅ Job submitted successfully!');
    console.log(`Job ID: ${data.jobId}`);
    console.log(`Status: ${data.status}\n`);
    
    console.log('Monitor with:');
    console.log(`node monitor-production-job.js ${data.jobId}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

submitJob().catch(console.error);