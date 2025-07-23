#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

// Force using task-based orchestration instead of workflows
process.env.USE_WORKFLOWS = 'false';

async function directEvolutionTest() {
  console.log('🚀 Direct Evolution Test (No Workflows)\n');
  
  const jobConfig = {
    problemContext: `Create innovative business models for EV truck charging infrastructure 
    that focus on strategic deal-making and exploiting supply chain weak points as leverage.`,
    parameters: {
      generations: 2,  // Reduced to 2 for faster results
      populationSize: 8,  // Reduced from 13 to 8 for speed
      topSelectCount: 3,
      offspringRatio: 0.375,  // 3 offspring from 8
      useSingleIdeaEnricher: true,
      enricherConcurrency: 4
    }
  };
  
  console.log('Configuration:');
  console.log(`  Generations: ${jobConfig.parameters.generations}`);
  console.log(`  Population: ${jobConfig.parameters.populationSize}`);
  console.log(`  Top: ${jobConfig.parameters.topSelectCount} | Offspring: 3 | Wildcards: 2\n`);
  
  try {
    const createResponse = await fetch(`${API_URL}/api/evolution/jobs`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Skip-Workflows': 'true'  // Custom header to skip workflows
      },
      body: JSON.stringify(jobConfig)
    });
    
    const job = await createResponse.json();
    console.log(`Job created: ${job.jobId}\n`);
    
    // Simple monitoring
    const startTime = Date.now();
    let completed = false;
    
    while (!completed && (Date.now() - startTime) < 600000) {
      const statusResponse = await fetch(`${API_URL}/api/evolution/jobs/${job.jobId}`);
      const jobData = await statusResponse.json();
      
      const gen1 = jobData.generations?.generation_1;
      const gen2 = jobData.generations?.generation_2;
      
      process.stdout.write(`\r[${Math.round((Date.now() - startTime) / 1000)}s] `);
      process.stdout.write(`Gen1: ${gen1 ? '✓' : '⋯'} `);
      process.stdout.write(`Gen2: ${gen2 ? '✓' : '⋯'} `);
      process.stdout.write(`Status: ${jobData.status}`);
      
      if (jobData.status === 'completed' || jobData.status === 'failed') {
        completed = true;
        console.log('\n');
        
        if (jobData.status === 'completed') {
          const analyticsResponse = await fetch(`${API_URL}/api/evolution/jobs/${job.jobId}/analytics`);
          const analytics = await analyticsResponse.json();
          
          console.log('\n✅ Results:');
          console.log(`  Total Ideas: ${analytics.solutions?.all?.length || 0}`);
          console.log(`  Top Score: ${analytics.solutions?.all?.[0]?.score?.toFixed(3) || 'N/A'}`);
          console.log(`  Time: ${Math.round((Date.now() - startTime) / 1000)}s`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

directEvolutionTest();