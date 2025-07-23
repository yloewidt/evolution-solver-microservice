#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-pfm22omnda-uc.a.run.app';
const JOB_ID = '4cdcb28f-ee17-43bd-b0e3-f84479c3b27f';

async function quickStatus() {
  const response = await fetch(`${API_URL}/api/evolution/jobs/${JOB_ID}`);
  const jobData = await response.json();
  
  const gen1 = jobData.generations?.generation_1;
  console.log('Job Status:', jobData.status);
  console.log('Current Generation:', jobData.currentGeneration || 'N/A');
  console.log('Current Phase:', jobData.currentPhase || 'N/A');
  
  if (gen1) {
    console.log('\nGeneration 1:');
    console.log('  Variator:', gen1.variatorComplete ? '✅' : '⏳', `(${gen1.ideas?.length || 0} ideas)`);
    console.log('  Enricher:', gen1.enricherComplete ? '✅' : '⏳', `(${gen1.enrichedIdeas?.length || 0} ideas)`);
    console.log('  Ranker:', gen1.rankerComplete ? '✅' : '⏳', `(${gen1.solutions?.length || 0} solutions)`);
    
    // Sample first few ideas
    if (gen1.ideas?.length > 0) {
      console.log('\nFirst 3 ideas:');
      gen1.ideas.slice(0, 3).forEach((idea, idx) => {
        console.log(`${idx + 1}. ${idea.idea_id}: ${idea.description.substring(0, 80)}...`);
      });
    }
  }
  
  // Check for errors
  if (jobData.error) {
    console.log('\nError:', jobData.error);
  }
}

quickStatus().catch(console.error);