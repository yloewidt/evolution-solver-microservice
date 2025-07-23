import logger from '../../src/utils/logger.js';
import EvolutionarySolver from '../../src/core/evolutionarySolver.js';
import SingleIdeaEnricher from '../../src/services/singleIdeaEnricher.js';
import EnricherCacheStore from '../../src/services/enricherCacheStore.js';
import { LLMClient } from '../../src/services/llmClient.js';
import { ResponseParser } from '../../src/utils/responseParser.js';

export async function handleVariator({ jobId, generation, problemContext, topPerformers, evolutionConfig, resultStore }) {
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
    solver.config = { ...solver.config, ...evolutionConfig };
    solver.currentGeneration = generation;
    
    // Set up progress tracker for telemetry
    solver.progressTracker = { resultStore, jobId };
    
    // Generate new ideas
    const ideas = await solver.variator(
      topPerformers,
      evolutionConfig.populationSize,
      problemContext
    );
    
    // Save results
    await resultStore.savePhaseResults(jobId, generation, 'variator', {
      ideas,
      variatorComplete: true,
      variatorCompletedAt: new Date()
    });
    
    logger.info(`Variator complete for job ${jobId}, generation ${generation}. Generated ${ideas.length} ideas`);
    
    return { 
      success: true, 
      message: `Generated ${ideas.length} ideas`,
      ideasCount: ideas.length,
      ideas  // Return ideas for workflow to pass to enricher
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

export async function handleEnricher({ jobId, generation, ideas, problemContext, evolutionConfig, resultStore }) {
  try {
    logger.info(`Starting enricher for job ${jobId}, generation ${generation} with ${ideas.length} ideas`);
    
    // Check if already complete
    const currentGen = await resultStore.getJobStatus(jobId);
    if (currentGen?.generations?.[`generation_${generation}`]?.enricherComplete) {
      logger.info(`Enricher already complete for job ${jobId}, generation ${generation}`);
      return { success: true, message: 'Already complete' };
    }
    
    // Initialize LLM client
    const llmClient = new LLMClient({
      model: evolutionConfig.model || 'o3',
      fallbackModel: evolutionConfig.fallbackModel || 'gpt-4o'
    });
    
    // Initialize cache store
    const cacheStore = new EnricherCacheStore(resultStore);
    
    // Initialize single-idea enricher
    const enricher = new SingleIdeaEnricher(llmClient, cacheStore);
    
    // Process ideas in parallel with max concurrency
    const maxConcurrency = evolutionConfig.enricherConcurrency || 25;
    const { enrichedIdeas, failedIdeas } = await enricher.enrichIdeasParallel(
      ideas,
      problemContext,
      jobId,
      generation,
      maxConcurrency
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

export async function handleRanker({ jobId, generation, enrichedIdeas, evolutionConfig, resultStore }) {
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
    const { rankedIdeas, filteredIdeas } = await solver.ranker(enrichedIdeas);
    
    // Calculate generation statistics
    const topScore = rankedIdeas.length > 0 ? rankedIdeas[0].score : 0;
    const avgScore = rankedIdeas.length > 0 
      ? rankedIdeas.reduce((sum, idea) => sum + idea.score, 0) / rankedIdeas.length 
      : 0;
    
    // Save results
    await resultStore.savePhaseResults(jobId, generation, 'ranker', {
      solutions: [...rankedIdeas, ...filteredIdeas], // Include all ideas
      rankerComplete: true,
      rankerCompletedAt: new Date(),
      topScore,
      avgScore,
      solutionCount: rankedIdeas.length + filteredIdeas.length
    });
    
    logger.info(`Ranker complete for job ${jobId}, generation ${generation}. Ranked ${rankedIdeas.length} ideas`);
    
    // Get top performers for next generation
    const topPerformers = rankedIdeas.slice(0, evolutionConfig.topSelectCount || 3);
    
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