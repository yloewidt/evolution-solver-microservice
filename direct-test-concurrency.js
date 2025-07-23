#!/usr/bin/env node

/**
 * Direct test of evolutionary solver with high concurrency
 * Tests the core algorithm without cloud infrastructure
 */

import { config } from 'dotenv';
import EvolutionarySolver from './src/core/evolutionarySolver.js';
import SingleIdeaEnricher from './src/services/singleIdeaEnricher.js';
import EnricherCacheStore from './src/services/enricherCacheStore.js';
import { LLMClient } from './src/services/llmClient.js';

config();

async function runDirectTest() {
  console.log('🚀 Direct Evolution Solver Test - High Concurrency');
  console.log('=================================================\n');
  
  const problemContext = `We are exploring opportunities in the rapidly evolving autonomous drone delivery market.
  The market is projected to reach $30 billion by 2030 with applications across:
  - Last-mile delivery for e-commerce
  - Medical supply delivery to remote areas
  - Food delivery in urban environments
  - Industrial inspections and monitoring
  
  Key challenges include:
  - Regulatory compliance and airspace management
  - Battery life and payload capacity limitations
  - Weather resilience and safety concerns
  - Public acceptance and privacy issues
  - Integration with existing logistics infrastructure
  
  We're seeking innovative business models, technical solutions, and strategic partnerships to capture 
  this emerging market opportunity with sustainable competitive advantages.`;

  const evolutionConfig = {
    generations: 3,
    populationSize: 13,
    topSelectCount: 3,
    model: 'gpt-4o',
    fallbackModel: 'gpt-3.5-turbo',
    enricherConcurrency: 25
  };

  console.log('Configuration:');
  console.log(`- Generations: ${evolutionConfig.generations}`);
  console.log(`- Ideas per generation: ${evolutionConfig.populationSize}`);
  console.log(`- Top select count: ${evolutionConfig.topSelectCount}`);
  console.log(`- Enricher concurrency: ${evolutionConfig.enricherConcurrency}`);
  console.log(`- Model: ${evolutionConfig.model}\n`);

  const startTime = Date.now();
  const solver = new EvolutionarySolver();
  solver.config = { ...solver.config, ...evolutionConfig };

  // Initialize LLM client and enricher
  const llmClient = new LLMClient({
    model: evolutionConfig.model,
    fallbackModel: evolutionConfig.fallbackModel
  });
  
  // Mock cache store
  const cacheStore = new EnricherCacheStore({
    getCachedIdea: async () => null,
    saveCachedIdea: async () => {}
  });
  
  const enricher = new SingleIdeaEnricher(llmClient, cacheStore);

  let allSolutions = [];
  let topPerformers = [];

  for (let generation = 1; generation <= evolutionConfig.generations; generation++) {
    console.log(`\n📊 Generation ${generation}/${evolutionConfig.generations}`);
    console.log('='.repeat(40));
    
    const genStartTime = Date.now();

    // 1. Variator Phase
    console.log('\n🧬 Variator Phase...');
    const varStartTime = Date.now();
    const ideas = await solver.variator(
      topPerformers,
      evolutionConfig.populationSize,
      problemContext
    );
    const varTime = (Date.now() - varStartTime) / 1000;
    console.log(`✅ Generated ${ideas.length} ideas in ${varTime.toFixed(1)}s`);

    // 2. Enricher Phase (Parallel)
    console.log('\n💡 Enricher Phase (Parallel)...');
    const enrichStartTime = Date.now();
    const { enrichedIdeas, failedIdeas } = await enricher.enrichIdeasParallel(
      ideas,
      problemContext,
      'test-job',
      generation,
      evolutionConfig.enricherConcurrency
    );
    const enrichTime = (Date.now() - enrichStartTime) / 1000;
    console.log(`✅ Enriched ${enrichedIdeas.length} ideas in ${enrichTime.toFixed(1)}s`);
    if (failedIdeas.length > 0) {
      console.log(`⚠️  ${failedIdeas.length} ideas failed enrichment`);
    }

    // 3. Ranker Phase
    console.log('\n🏆 Ranker Phase...');
    const rankStartTime = Date.now();
    const { rankedIdeas } = await solver.ranker(enrichedIdeas);
    const rankTime = (Date.now() - rankStartTime) / 1000;
    console.log(`✅ Ranked ${rankedIdeas.length} ideas in ${rankTime.toFixed(1)}s`);

    // Update for next generation
    topPerformers = rankedIdeas.slice(0, evolutionConfig.topSelectCount);
    allSolutions.push(...rankedIdeas);

    const genTime = (Date.now() - genStartTime) / 1000;
    console.log(`\n⏱️  Generation ${generation} completed in ${genTime.toFixed(1)}s`);
    console.log(`Top score: ${rankedIdeas[0]?.score?.toFixed(2) || 'N/A'}`);
  }

  const totalTime = (Date.now() - startTime) / 1000;

  console.log('\n' + '='.repeat(50));
  console.log('✅ Evolution Complete!');
  console.log('='.repeat(50));
  console.log(`Total time: ${totalTime.toFixed(1)}s`);
  console.log(`Average time per generation: ${(totalTime / evolutionConfig.generations).toFixed(1)}s`);
  console.log(`Total solutions generated: ${allSolutions.length}`);

  // Performance analysis
  if (totalTime < 120) {
    console.log('\n🚀 Excellent performance! Parallel processing is working effectively.');
  } else if (totalTime < 180) {
    console.log('\n✓ Good performance. Some optimization may be possible.');
  } else {
    console.log('\n⚠️  Performance slower than expected. Check for bottlenecks.');
  }

  // Top 3 solutions
  console.log('\n📈 Top 3 Solutions:');
  allSolutions.sort((a, b) => (b.score || 0) - (a.score || 0));
  allSolutions.slice(0, 3).forEach((solution, idx) => {
    console.log(`\n${idx + 1}. ${solution.title || solution.idea_id}`);
    console.log(`   Score: ${solution.score?.toFixed(2)}`);
    console.log(`   ${solution.description?.substring(0, 150)}...`);
  });
}

// Run the test
runDirectTest().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});