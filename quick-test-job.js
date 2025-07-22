#!/usr/bin/env node

import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

async function quickTest() {
  console.log('🧪 Quick test of JSON parsing fix...\n');
  
  const jobPayload = {
    problemContext: 'Generate healthcare AI solutions',
    initialSolutions: [],
    evolutionConfig: {
      generations: 1,
      populationSize: 3,
      topSelectCount: 2,
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
    
    const result = await response.json();
    console.log('Job created:', result.jobId);
    console.log(`Check: ${API_URL}/api/evolution/jobs/${result.jobId}`);
    
    // Wait and check
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 10000));
      
      const status = await fetch(`${API_URL}/api/evolution/jobs/${result.jobId}`);
      const data = await status.json();
      
      console.log(`\n[${new Date().toLocaleTimeString()}] Status: ${data.status}`);
      
      if (data.generations?.generation_1) {
        const g1 = data.generations.generation_1;
        console.log(`Variator: ${g1.variatorComplete} (${g1.ideas?.length || 0} ideas)`);
        console.log(`Enricher: ${g1.enricherComplete} (${g1.solutions?.length || 0} solutions)`);
        
        if (g1.enricherComplete && g1.solutions?.length > 0) {
          console.log('\n✅ JSON PARSING FIX WORKS!');
          return;
        }
        
        if (g1.enricherComplete && g1.solutions?.length === 0) {
          console.log('\n❌ JSON PARSING STILL BROKEN!');
          return;
        }
      }
      
      if (data.status === 'completed' || data.status === 'failed') {
        console.log('Final status:', data.status);
        break;
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

quickTest();