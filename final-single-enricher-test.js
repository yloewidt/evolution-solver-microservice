#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

async function finalTest() {
  console.log('🎯 Final Test: Single-Idea Enricher in Production\n');
  
  const jobConfig = {
    problemContext: `Create innovative business models for EV truck charging infrastructure 
    that focus on strategic deal-making and exploiting supply chain weak points as leverage.`,
    parameters: {
      generations: 1,
      populationSize: 5,
      useSingleIdeaEnricher: true,
      enricherConcurrency: 3
    }
  };
  
  console.log('Configuration:');
  console.log(`  Generations: ${jobConfig.parameters.generations}`);
  console.log(`  Population Size: ${jobConfig.parameters.populationSize}`);
  console.log(`  Single-Idea Enricher: ✅`);
  console.log(`  Enricher Concurrency: ${jobConfig.parameters.enricherConcurrency}\n`);
  
  try {
    // Create job
    console.log('Creating job...');
    const createResponse = await fetch(`${API_URL}/api/evolution/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobConfig)
    });
    
    const job = await createResponse.json();
    console.log(`Job created: ${job.jobId}\n`);
    
    // Monitor for up to 3 minutes
    const startTime = Date.now();
    let completed = false;
    
    while (!completed && (Date.now() - startTime) < 180000) {
      const statusResponse = await fetch(`${API_URL}/api/evolution/jobs/${job.jobId}`);
      const jobData = await statusResponse.json();
      
      if (jobData.status === 'completed') {
        completed = true;
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`✅ Job completed in ${elapsed} seconds!\n`);
        
        // Get analytics
        const analyticsResponse = await fetch(`${API_URL}/api/evolution/jobs/${job.jobId}/analytics`);
        const analytics = await analyticsResponse.json();
        
        console.log('Results:');
        console.log(`  Total Ideas: ${analytics.solutions?.all?.length || 0}`);
        console.log(`  Top Score: ${analytics.solutions?.all?.[0]?.score?.toFixed(2) || 'N/A'}`);
        console.log(`  API Calls: ${analytics.o3Calls?.actual || 0}`);
        console.log(`  Total Tokens: ${(analytics.tokenUsage?.total?.input || 0) + (analytics.tokenUsage?.total?.output || 0)}`);
        
        // Check enricher success
        const gen1 = jobData.generations?.generation_1;
        if (gen1?.enrichedIdeas?.length > 0) {
          console.log(`\n✅ Enricher Success: ${gen1.enrichedIdeas.length} ideas enriched!`);
          console.log(`Sample enriched idea: ${gen1.enrichedIdeas[0].idea_id}`);
        }
        
        break;
      } else if (jobData.status === 'failed') {
        console.log(`❌ Job failed: ${jobData.error}`);
        break;
      }
      
      // Show progress
      const gen1 = jobData.generations?.generation_1;
      if (gen1) {
        process.stdout.write(`\r[${Math.round((Date.now() - startTime) / 1000)}s] Status: ${jobData.status}, ` +
          `Variator: ${gen1.variatorComplete ? '✓' : '⋯'}, ` +
          `Enricher: ${gen1.enricherComplete ? '✓' : '⋯'}, ` +
          `Ideas: ${gen1.enrichedIdeas?.length || 0}/${jobConfig.parameters.populationSize}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    if (!completed) {
      console.log('\n⚠️  Test timed out after 3 minutes');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

finalTest();