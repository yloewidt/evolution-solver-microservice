import logger from '../../src/utils/logger.js';
import EvolutionarySolver from '../../src/core/evolutionarySolver.js';
import SingleIdeaEnricher from '../../src/services/singleIdeaEnricher.js';
import EnricherCacheStore from '../../src/services/enricherCacheStore.js';
import { LLMClient } from '../../src/services/llmClient.js';
// ResponseParser not needed in this branch

export async function processVariator({ jobId, generation, problemContext, topPerformers, evolutionConfig }, resultStore) {
  try {
    logger.info(`Starting variator for job ${jobId}, generation ${generation}`);
    
    // Check if already complete
    const currentGen = await resultStore.getJobStatus(jobId);
    if (currentGen?.generations?.[`generation_${generation}`]?.variatorComplete) {
      logger.info(`Variator already complete for job ${jobId}, generation ${generation}`);
      return { success: true, message: 'Already complete' };
    }
    
    // Create solver instance
    const solver = new EvolutionarySolver();
    solver.config = { 
      ...solver.config, 
      ...evolutionConfig,
      model: evolutionConfig.model || 'o3'  // Ensure model is always set
    };
    solver.currentGeneration = generation;
    
    // Set up progress tracker for telemetry
    solver.progressTracker = { resultStore, jobId };
    
    // Extract top performer IDs to preserve them
    const topPerformerIds = new Set(topPerformers ? topPerformers.map(p => p.idea_id).filter(id => id) : []);
    logger.info(`Variator: Preserving ${topPerformerIds.size} top performer IDs for generation ${generation}`);
    
    // Implement elitism: preserve top 2 performers unchanged in generation 2+
    let eliteCount = 0;
    let eliteIdeas = [];
    if (generation > 1 && topPerformers && topPerformers.length > 0) {
      eliteCount = Math.min(2, Math.floor(evolutionConfig.populationSize * 0.2)); // Top 20% or 2, whichever is smaller
      eliteIdeas = topPerformers.slice(0, eliteCount);
      logger.info(`Preserving top ${eliteCount} elite performers unchanged`);
    }

    // Generate new ideas for remaining slots
    const newIdeaCount = evolutionConfig.populationSize - eliteCount;
    const ideas = await solver.variator(
      topPerformers,
      newIdeaCount,
      problemContext,
      generation,
      jobId
    );

    // Combine elite performers with new ideas
    const allIdeas = [...eliteIdeas, ...ideas];
    logger.info(`Combined ${eliteIdeas.length} elite + ${ideas.length} new = ${allIdeas.length} total ideas`);
    
    // Save results
    await resultStore.savePhaseResults(jobId, generation, 'variator', {
      generation,  // Include generation field for consistency
      ideas: allIdeas,
      variatorComplete: true,
      variatorCompletedAt: new Date()
    });
    
    logger.info(`Variator complete for job ${jobId}, generation ${generation}. Generated ${allIdeas.length} total ideas (${eliteCount} elite + ${ideas.length} new)`);
    
    return { 
      success: true, 
      message: `Generated ${allIdeas.length} ideas (${eliteCount} elite + ${ideas.length} new)`,
      ideasCount: allIdeas.length,
      ideas: allIdeas  // Return combined ideas for workflow to pass to enricher
    };
    
  } catch (error) {
    logger.error(`Variator error for job ${jobId}, generation ${generation}:`, error);
    
    // Update error state
    await resultStore.savePhaseResults(jobId, generation, 'variator', {
      variatorError: error.message,
      variatorFailedAt: new Date()
    });
    
    throw error;
  }
}

export async function processEnricher({ jobId, generation, ideas, problemContext, evolutionConfig }, resultStore) {
  try {
    // Multiple logging approaches to ensure visibility
    console.error(`[TRACE-ENRICHER] processEnricher V2 called for job ${jobId}`);
    process.stdout.write(`[STDOUT-TRACE] Enricher V2: ${jobId} gen:${generation} ideas:${ideas?.length}\n`);
    logger.error(`[LOGGER-ERROR-TRACE] processEnricher V2 called - jobId: ${jobId}, generation: ${generation}, ideas: ${ideas?.length}`);
    
    logger.info(`[WORKER V2] processEnricher called for job ${jobId}, generation ${generation} with ${ideas.length} ideas`);
    logger.info(`[WORKER V2] Using SingleIdeaEnricher with parallel processing`);
    
    // Check if already complete
    const currentGen = await resultStore.getJobStatus(jobId);
    if (currentGen?.generations?.[`generation_${generation}`]?.enricherComplete) {
      logger.info(`Enricher already complete for job ${jobId}, generation ${generation}`);
      return { success: true, message: 'Already complete' };
    }
    
    // Initialize LLM client
    const llmClient = new LLMClient({
      model: evolutionConfig.model || 'o3'
    });
    
    // Initialize cache store
    const cacheStore = new EnricherCacheStore(resultStore);
    
    // Initialize single-idea enricher
    const enricher = new SingleIdeaEnricher(llmClient, cacheStore);
    
    // Process ideas in parallel with max concurrency
    const maxConcurrency = evolutionConfig.enricherConcurrency || 25;
    
    // CRITICAL PATH MARKER
    console.log('[BEFORE PARALLEL ENRICHMENT]', {
      jobId,
      generation,
      ideasCount: ideas.length,
      maxConcurrency,
      enricherClass: enricher.constructor.name,
      timestamp: new Date().toISOString()
    });
    
    const { enrichedIdeas, failedIdeas } = await enricher.enrichIdeasParallel(
      ideas,
      problemContext,
      jobId,
      generation,
      maxConcurrency,
      resultStore  // Pass resultStore for telemetry tracking
    );
    
    // Check if we have enough successful enrichments
    if (enrichedIdeas.length === 0) {
      throw new Error('All ideas failed enrichment');
    }
    
    // Log any failures
    if (failedIdeas.length > 0) {
      logger.warn(`${failedIdeas.length} ideas failed enrichment:`, 
        failedIdeas.map(f => ({ id: f.idea.idea_id, error: f.error }))
      );
    }
    
    // Enriched ideas are already validated by singleIdeaEnricher
    const validatedIdeas = enrichedIdeas;
    
    // Save results
    await resultStore.savePhaseResults(jobId, generation, 'enricher', {
      enrichedIdeas: validatedIdeas,
      enricherComplete: true,
      enricherCompletedAt: new Date(),
      enrichmentStats: {
        total: ideas.length,
        successful: enrichedIdeas.length,
        failed: failedIdeas.length,
        validated: validatedIdeas.length
      }
    });
    
    logger.info(`Enricher complete for job ${jobId}, generation ${generation}. Enriched ${validatedIdeas.length} ideas`);
    
    return { 
      success: true, 
      message: `Enriched ${validatedIdeas.length} ideas`,
      enrichedIdeas: validatedIdeas
    };
    
  } catch (error) {
    logger.error(`Enricher error for job ${jobId}, generation ${generation}:`, error);
    
    // Save error state but DO NOT mark enricherComplete=true
    await resultStore.savePhaseResults(jobId, generation, 'enricher', {
      enricherError: error.message,
      enricherFailedAt: new Date(),
      enricherParseFailure: error.message.includes('parsing') || error.message.includes('timed out')
    });
    
    throw error;
  }
}

export async function processRanker({ jobId, generation, enrichedIdeas, evolutionConfig }, resultStore) {
  try {
    logger.info(`Starting ranker for job ${jobId}, generation ${generation} with ${enrichedIdeas.length} ideas`);
    
    // Check if already complete
    const currentGen = await resultStore.getJobStatus(jobId);
    if (currentGen?.generations?.[`generation_${generation}`]?.rankerComplete) {
      logger.info(`Ranker already complete for job ${jobId}, generation ${generation}`);
      return { success: true, message: 'Already complete' };
    }
    
    // Validate input
    if (!enrichedIdeas || enrichedIdeas.length === 0) {
      throw new Error('No enriched ideas provided for ranking');
    }
    
    // Create solver instance for ranking
    const solver = new EvolutionarySolver();
    solver.config = { ...solver.config, ...evolutionConfig };
    solver.currentGeneration = generation;
    
    // Rank the ideas
    const rankerResult = await solver.ranker(enrichedIdeas);
    const { rankedIdeas, filteredIdeas, topPerformers } = rankerResult;
    
    // Calculate generation statistics
    const topScore = rankedIdeas.length > 0 ? rankedIdeas[0].score : 0;
    const avgScore = rankedIdeas.length > 0 
      ? rankedIdeas.reduce((sum, idea) => sum + idea.score, 0) / rankedIdeas.length 
      : 0;
    
    // Save results
    await resultStore.savePhaseResults(jobId, generation, 'ranker', {
      generation,  // Include generation field for consistency
      solutions: [...rankedIdeas, ...filteredIdeas], // Include all ideas
      rankerComplete: true,
      rankerCompletedAt: new Date(),
      topScore,
      avgScore,
      solutionCount: rankedIdeas.length + filteredIdeas.length
    });
    
    logger.info(`Ranker complete for job ${jobId}, generation ${generation}. Ranked ${rankedIdeas.length} ideas`);
    
    // Top performers are already selected by the ranker based on topPerformerRatio
    
    return { 
      success: true, 
      message: `Ranked ${rankedIdeas.length} ideas`,
      rankedIdeas,
      topPerformers,
      topScore,
      avgScore
    };
    
  } catch (error) {
    logger.error(`Ranker error for job ${jobId}, generation ${generation}:`, error);
    
    // Update error state
    await resultStore.savePhaseResults(jobId, generation, 'ranker', {
      rankerError: error.message,
      rankerFailedAt: new Date()
    });
    
    throw error;
  }
}