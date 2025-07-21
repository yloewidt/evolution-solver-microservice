#!/usr/bin/env node

import EvolutionResultStore from './cloud/firestore/resultStore.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkJob() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error('Usage: node check-local-test.js <jobId>');
    process.exit(1);
  }
  
  const resultStore = new EvolutionResultStore();
  const result = await resultStore.getResult(jobId);
  
  if (!result) {
    console.error('Job not found');
    process.exit(1);
  }
  
  console.log(`Job ${jobId}`);
  console.log(`Status: ${result.status}`);
  console.log(`API Calls: ${result.apiCalls?.length || 0}`);
  
  if (result.apiCalls && result.apiCalls.length > 0) {
    const phases = {};
    result.apiCalls.forEach(call => {
      const key = `Gen${call.generation}_${call.phase}`;
      phases[key] = (phases[key] || 0) + 1;
    });
    
    console.log('\nCalls by phase:');
    Object.entries(phases).forEach(([phase, count]) => {
      console.log(`  ${phase}: ${count} call(s)`);
    });
  }
  
  // Check generation data
  console.log('\nGeneration data:');
  for (let gen = 1; gen <= 10; gen++) {
    const genData = result.generations?.[`generation_${gen}`];
    if (genData) {
      console.log(`  Generation ${gen}:`);
      console.log(`    - Variator: ${genData.variatorComplete ? 'Complete' : 'Incomplete'}`);
      console.log(`    - Enricher: ${genData.enricherComplete ? 'Complete' : 'Incomplete'}`);
      console.log(`    - Ranker: ${genData.rankerComplete ? 'Complete' : 'Incomplete'}`);
      if (genData.ideas) console.log(`    - Ideas: ${genData.ideas.length}`);
      if (genData.enrichedIdeas) console.log(`    - Enriched: ${genData.enrichedIdeas.length}`);
      if (genData.solutions) console.log(`    - Solutions: ${genData.solutions.length}`);
    }
  }
  
  process.exit(0);
}

checkJob();