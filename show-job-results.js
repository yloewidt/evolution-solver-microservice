#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

const jobs = [
  { name: '1x17', jobId: '398ff829-5e8b-430b-989f-ebbe5214b670', config: { generations: 1, populationSize: 17 } },
  { name: '1x34', jobId: 'd46666ff-ec03-4197-b9f4-a3fb58de306c', config: { generations: 1, populationSize: 34 } },
  { name: '2x12', jobId: '0d2d4124-f74e-434f-b10c-da58969a3136', config: { generations: 2, populationSize: 12 } },
  { name: '20x20', jobId: '65e35e10-dd8d-407f-86ba-0a69b09e8626', config: { generations: 20, populationSize: 20 } }
];

async function showJobResults() {
  console.log('\n📊 JOB RESULTS SUMMARY');
  console.log('='.repeat(80));
  
  for (const job of jobs) {
    const response = await fetch(`${API_URL}/api/evolution/jobs/${job.jobId}`);
    const jobData = await response.json();
    
    console.log(`\n${job.name} (${job.config.generations}x${job.config.populationSize})`);
    console.log('-'.repeat(40));
    console.log(`Status: ${jobData.status}`);
    
    // Extract all solutions from generation data
    const allSolutions = [];
    if (jobData.generations) {
      Object.entries(jobData.generations).forEach(([gen, genData]) => {
        if (genData.solutions && genData.solutions.length > 0) {
          genData.solutions.forEach(sol => {
            if (sol.score > 0) {
              allSolutions.push({
                ...sol,
                generation: gen
              });
            }
          });
        }
      });
    }
    
    if (allSolutions.length === 0) {
      console.log('No scored solutions found');
      continue;
    }
    
    // Sort by score
    allSolutions.sort((a, b) => (b.score || 0) - (a.score || 0));
    
    // Show stats
    const avgScore = allSolutions.reduce((sum, sol) => sum + sol.score, 0) / allSolutions.length;
    console.log(`Total Solutions: ${allSolutions.length}`);
    console.log(`Average Score: ${avgScore.toFixed(3)}`);
    console.log(`Top Score: ${allSolutions[0].score.toFixed(3)}`);
    
    // Show top 3 solutions
    console.log('\nTop 3 Solutions:');
    allSolutions.slice(0, 3).forEach((sol, idx) => {
      console.log(`\n${idx + 1}. ${sol.idea_id} (Score: ${sol.score.toFixed(3)})`)
      console.log(`   ${sol.description.substring(0, 80)}...`);
      if (sol.business_case) {
        console.log(`   NPV: $${sol.business_case.npv_success}M | CAPEX: $${sol.business_case.capex_est}M | Success: ${(sol.business_case.likelihood * 100).toFixed(0)}%`);
      }
    });
  }
  
  console.log('\n' + '='.repeat(80));
}

showJobResults().catch(console.error);