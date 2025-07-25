import express from 'express';
import logger from '../utils/logger.js';
import EvolutionarySolver from '../core/evolutionarySolver.js';
import SingleIdeaEnricher from '../services/singleIdeaEnricher.js';
import EnricherCacheStore from '../services/enricherCacheStore.js';
import { LLMClient } from '../services/llmClient.js';
import EvolutionResultStore from '../../cloud/firestore/resultStore.js';

const router = express.Router();

// Direct job processing endpoint - bypasses workflow
router.post('/direct', async (req, res) => {
  const startTime = Date.now();
  const { problemContext, evolutionConfig = {} } = req.body;
  
  if (!problemContext) {
    return res.status(400).json({ error: 'problemContext is required' });
  }

  // Generate job ID
  const jobId = `direct-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    logger.info(`Starting direct job ${jobId}`);
    
    // Initialize services
    const resultStore = new EvolutionResultStore();
    const llmClient = new LLMClient({
      model: evolutionConfig.model || 'o3',
      fallbackModel: evolutionConfig.fallbackModel || 'gpt-4o'
    });
    const cacheStore = new EnricherCacheStore(resultStore);
    const enricher = new SingleIdeaEnricher(llmClient, cacheStore);
    
    // Create job record
    await resultStore.createJob(jobId, {
      problemContext,
      evolutionConfig: {
        generations: evolutionConfig.generations || 1,
        populationSize: evolutionConfig.populationSize || 3,
        model: evolutionConfig.model || 'o3',
        maxCapex: evolutionConfig.maxCapex || 100000,
        topPerformerRatio: 0.3,
        offspringRatio: 0.7,
        diversificationUnit: 0.05
      },
      status: 'processing'
    });

    // Initialize solver
    const solver = new EvolutionarySolver(resultStore, evolutionConfig);
    solver.progressTracker = { resultStore, jobId };
    
    const results = [];
    let topPerformers = [];
    
    // Process single generation for testing
    const generation = 1;
    
    // Variator phase
    logger.info(`Processing variator for generation ${generation}`);
    const ideas = await solver.variator(
      topPerformers,
      evolutionConfig.populationSize || 3,
      problemContext,
      generation,
      jobId
    );
    
    await resultStore.savePhaseResults(jobId, generation, 'variator', {
      ideas,
      variatorComplete: true,
      variatorCompletedAt: new Date()
    });
    
    // Enricher phase - parallel processing
    logger.info(`Processing enricher for generation ${generation} with ${ideas.length} ideas`);
    const { enrichedIdeas, failedIdeas } = await enricher.enrichIdeasParallel(
      ideas,
      problemContext,
      jobId,
      generation,
      evolutionConfig.enricherConcurrency || 5,
      resultStore
    );
    
    await resultStore.savePhaseResults(jobId, generation, 'enricher', {
      enrichedIdeas,
      enricherComplete: true,
      enricherCompletedAt: new Date(),
      enrichmentStats: {
        total: ideas.length,
        successful: enrichedIdeas.length,
        failed: failedIdeas.length
      }
    });
    
    // Ranker phase
    logger.info(`Processing ranker for generation ${generation}`);
    const { rankedIdeas, topPerformers: newTopPerformers } = await solver.ranker(enrichedIdeas);
    
    await resultStore.savePhaseResults(jobId, generation, 'ranker', {
      solutions: rankedIdeas,
      rankerComplete: true,
      rankerCompletedAt: new Date(),
      topScore: rankedIdeas[0]?.score || 0,
      avgScore: rankedIdeas.reduce((sum, idea) => sum + idea.score, 0) / rankedIdeas.length
    });
    
    // Complete job
    await resultStore.completeJob(jobId, {
      topSolutions: rankedIdeas.slice(0, 10),
      allSolutions: rankedIdeas,
      generationHistory: [{
        generation: 1,
        solutionCount: rankedIdeas.length,
        topScore: rankedIdeas[0]?.score || 0
      }],
      totalSolutions: rankedIdeas.length,
      metadata: {
        totalGenerations: 1,
        totalSolutions: rankedIdeas.length,
        processingTime: (Date.now() - startTime) / 1000,
        apiCalls: (await resultStore.getResult(jobId))?.apiCalls?.length || 0,
        topScore: rankedIdeas[0]?.score || 0
      }
    });
    
    res.json({
      jobId,
      status: 'completed',
      solutions: rankedIdeas.slice(0, 5),
      processingTime: (Date.now() - startTime) / 1000,
      enrichmentStats: {
        total: ideas.length,
        successful: enrichedIdeas.length,
        failed: failedIdeas.length
      }
    });
    
  } catch (error) {
    logger.error(`Direct job ${jobId} failed:`, error);
    
    await resultStore.updateJobStatus(jobId, 'failed', error.message);
    
    res.status(500).json({
      error: error.message,
      jobId
    });
  }
});

export default router;