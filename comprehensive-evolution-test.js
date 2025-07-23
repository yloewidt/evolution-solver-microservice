#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';

async function comprehensiveEvolutionTest() {
  console.log('🧬 Comprehensive Evolution Test\n');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  const jobConfig = {
    problemContext: `Create innovative business models for EV truck charging infrastructure 
    that focus on strategic deal-making and exploiting supply chain weak points as leverage.
    Consider partnerships, exclusive deals, regulatory arbitrage, and financial engineering.`,
    parameters: {
      generations: 3,
      populationSize: 13,
      topSelectCount: 3,      // Pass top 3 ideas to next generation
      offspringRatio: 0.46,   // 6 offspring from 13 total = 0.46
      // This gives us: 3 top + 6 offspring + 4 wildcards = 13
      useSingleIdeaEnricher: true,
      enricherConcurrency: 5
    }
  };
  
  console.log('📋 Evolution Configuration:');
  console.log(`  Generations: ${jobConfig.parameters.generations}`);
  console.log(`  Population Size: ${jobConfig.parameters.populationSize}`);
  console.log(`  Top Performers Passed: ${jobConfig.parameters.topSelectCount}`);
  console.log(`  Offspring Count: ${Math.floor(jobConfig.parameters.populationSize * jobConfig.parameters.offspringRatio)} (${jobConfig.parameters.offspringRatio * 100}%)`)
  console.log(`  Wildcard Count: ${jobConfig.parameters.populationSize - jobConfig.parameters.topSelectCount - Math.floor(jobConfig.parameters.populationSize * jobConfig.parameters.offspringRatio)}`);
  console.log(`  Single-Idea Enricher: ✅`);
  console.log(`  Enricher Concurrency: ${jobConfig.parameters.enricherConcurrency}\n`);
  
  const metrics = {
    startTime: Date.now(),
    apiCalls: [],
    generationMetrics: [],
    phaseTimings: {}
  };
  
  try {
    // Create job
    console.log('🚀 Creating evolution job...');
    const createResponse = await fetch(`${API_URL}/api/evolution/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobConfig)
    });
    
    const job = await createResponse.json();
    console.log(`✅ Job created: ${job.jobId}\n`);
    console.log('═══════════════════════════════════════════════════════════════════\n');
    
    // Monitor job progress
    let completed = false;
    let lastGenProcessed = 0;
    const maxWaitTime = 600000; // 10 minutes
    
    while (!completed && (Date.now() - metrics.startTime) < maxWaitTime) {
      const statusResponse = await fetch(`${API_URL}/api/evolution/jobs/${job.jobId}`);
      const jobData = await statusResponse.json();
      
      // Track generation progress
      for (let gen = 1; gen <= jobConfig.parameters.generations; gen++) {
        const genKey = `generation_${gen}`;
        if (jobData.generations?.[genKey] && gen > lastGenProcessed) {
          const genData = jobData.generations[genKey];
          
          if (genData.rankerComplete) {
            lastGenProcessed = gen;
            
            const genMetrics = {
              generation: gen,
              variatorTime: genData.variatorCompletedAt?._seconds - genData.variatorStartedAt?._seconds || 0,
              enricherTime: genData.enricherCompletedAt?._seconds - genData.enricherStartedAt?._seconds || 0,
              rankerTime: genData.rankerCompletedAt?._seconds - genData.rankerStartedAt?._seconds || 0,
              ideasGenerated: genData.ideas?.length || 0,
              ideasEnriched: genData.enrichedIdeas?.length || 0,
              topScore: genData.topScore,
              avgScore: genData.avgScore
            };
            
            metrics.generationMetrics.push(genMetrics);
            
            console.log(`📊 Generation ${gen} Complete:`);
            console.log(`   Ideas Generated: ${genMetrics.ideasGenerated}`);
            console.log(`   Ideas Enriched: ${genMetrics.ideasEnriched}`);
            console.log(`   Top Score: ${genMetrics.topScore?.toFixed(3) || 'N/A'}`);
            console.log(`   Avg Score: ${genMetrics.avgScore?.toFixed(3) || 'N/A'}`);
            console.log(`   Phase Times: V:${genMetrics.variatorTime}s E:${genMetrics.enricherTime}s R:${genMetrics.rankerTime}s`);
            console.log('');
          }
        }
      }
      
      if (jobData.status === 'completed') {
        completed = true;
        metrics.endTime = Date.now();
        console.log('═══════════════════════════════════════════════════════════════════');
        console.log(`\n✅ Evolution completed in ${Math.round((metrics.endTime - metrics.startTime) / 1000)} seconds!\n`);
        
        // Get detailed analytics
        const analyticsResponse = await fetch(`${API_URL}/api/evolution/jobs/${job.jobId}/analytics`);
        const analytics = await analyticsResponse.json();
        
        // Store API call data
        metrics.apiCalls = jobData.apiCalls || [];
        metrics.analytics = analytics;
        
        // Display final results
        console.log('🏆 Final Results:');
        console.log(`   Total Ideas Generated: ${analytics.solutions?.all?.length || 0}`);
        console.log(`   Unique Ideas: ${new Set(analytics.solutions?.all?.map(s => s.idea_id)).size}`);
        console.log(`   Top Solution Score: ${analytics.solutions?.all?.[0]?.score?.toFixed(3) || 'N/A'}`);
        console.log(`   Total API Calls: ${analytics.o3Calls?.actual || 0}`);
        console.log(`   Total Tokens: ${(analytics.tokenUsage?.total?.input || 0) + (analytics.tokenUsage?.total?.output || 0)}`);
        
        // Display top 3 solutions
        console.log('\n🥇 Top 3 Solutions:');
        analytics.solutions?.all?.slice(0, 3).forEach((solution, i) => {
          console.log(`\n${i + 1}. ${solution.idea_id} (Score: ${solution.score?.toFixed(3)})`);
          console.log(`   ${solution.description.substring(0, 150)}...`);
          console.log(`   NPV: $${solution.metrics?.npv?.toFixed(1)}M | CAPEX: $${solution.metrics?.capex?.toFixed(1)}M | Likelihood: ${(solution.metrics?.likelihood * 100)?.toFixed(0)}%`);
        });
        
        break;
      } else if (jobData.status === 'failed') {
        console.log(`\n❌ Job failed: ${jobData.error}`);
        break;
      }
      
      // Progress indicator
      process.stdout.write(`\r⏳ Processing... [${Math.round((Date.now() - metrics.startTime) / 1000)}s] `);
      process.stdout.write(`Gen ${lastGenProcessed}/${jobConfig.parameters.generations}`);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Save metrics for analysis
    return { jobId: job.jobId, metrics, config: jobConfig };
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    throw error;
  }
}

// Run the test and save results
comprehensiveEvolutionTest()
  .then(results => {
    console.log('\n\n📊 Test completed successfully!');
    console.log(`Job ID: ${results.jobId}`);
    
    // Save results for analysis
    import('fs').then(fs => {
      fs.promises.writeFile(
        `evolution-test-results-${Date.now()}.json`,
        JSON.stringify(results, null, 2)
      );
    });
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });