#!/usr/bin/env node

import EvolutionarySolver from './src/core/evolutionarySolver.js';
import EvolutionResultStore from './cloud/firestore/resultStore.js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

async function testEvolution() {
  console.log('Starting local evolution test...');
  
  const solver = new EvolutionarySolver();
  const resultStore = new EvolutionResultStore();
  const jobId = uuidv4();
  
  // Configure solver
  solver.config = {
    ...solver.config,
    generations: 2,
    populationSize: 2,
    maxCapex: 0.1
  };
  
  // Set up progress tracker
  solver.progressTracker = { resultStore, jobId };
  
  const problemContext = "Test: Generate solutions for reducing cloud infrastructure costs";
  
  try {
    // Create job
    await resultStore.saveResult({
      jobId,
      problemContext,
      evolutionConfig: solver.config,
      status: 'processing',
      userId: 'test-user',
      sessionId: 'test-session'
    });
    
    console.log(`Created job: ${jobId}`);
    
    // Run evolution
    for (let generation = 1; generation <= solver.config.generations; generation++) {
      console.log(`\n=== Generation ${generation} ===`);
      solver.currentGeneration = generation;
      
      // Get top performers from previous generation
      let topPerformers = [];
      if (generation > 1) {
        const prevGen = await resultStore.getResult(jobId);
        topPerformers = prevGen.generations?.[`generation_${generation - 1}`]?.topPerformers || [];
      }
      
      // Variator
      console.log('Running variator...');
      const ideas = await solver.variator(topPerformers, solver.config.populationSize, problemContext);
      console.log(`Generated ${ideas.length} ideas`);
      
      await resultStore.savePhaseResults(jobId, generation, 'variator', {
        ideas,
        variatorComplete: true
      });
      
      // Enricher
      console.log('Running enricher...');
      const enrichedIdeas = await solver.enricher(ideas);
      const formattedIdeas = await solver.formatEnrichedData(enrichedIdeas);
      console.log(`Enriched ${formattedIdeas.length} ideas`);
      
      await resultStore.savePhaseResults(jobId, generation, 'enricher', {
        enrichedIdeas: formattedIdeas,
        enricherComplete: true
      });
      
      // Ranker
      console.log('Running ranker...');
      const { rankedIdeas, filteredIdeas } = await solver.ranker(formattedIdeas);
      const topScore = rankedIdeas[0]?.score || 0;
      const avgScore = rankedIdeas.length > 0 
        ? rankedIdeas.reduce((sum, idea) => sum + idea.score, 0) / rankedIdeas.length 
        : 0;
      
      console.log(`Ranked ${rankedIdeas.length} ideas, filtered ${filteredIdeas.length}`);
      console.log(`Top score: ${topScore}, Avg score: ${avgScore}`);
      
      await resultStore.savePhaseResults(jobId, generation, 'ranker', {
        solutions: [...rankedIdeas, ...filteredIdeas],
        rankedIdeas,
        filteredIdeas,
        topPerformers: rankedIdeas.slice(0, solver.config.topSelectCount || 3),
        topScore,
        avgScore,
        rankerComplete: true,
        generationComplete: true
      });
    }
    
    // Complete job
    await resultStore.updateJobStatus(jobId, 'completed');
    console.log(`\nJob completed successfully: ${jobId}`);
    
    // Get final results
    const finalResults = await resultStore.getResult(jobId);
    console.log('\nAPI Calls Summary:');
    console.log(`Total calls: ${finalResults.apiCalls?.length || 0}`);
    
    if (finalResults.apiCalls && finalResults.apiCalls.length > 0) {
      const phases = {};
      finalResults.apiCalls.forEach(call => {
        const key = `Gen${call.generation}_${call.phase}`;
        phases[key] = (phases[key] || 0) + 1;
      });
      
      console.log('\nCalls by phase:');
      Object.entries(phases).forEach(([phase, count]) => {
        console.log(`  ${phase}: ${count} call(s)`);
      });
    }
    
  } catch (error) {
    console.error('Test failed:', error);
    await resultStore.updateJobStatus(jobId, 'failed', error.message);
  }
  
  process.exit(0);
}

testEvolution();