import EvolutionarySolver from '../../src/core/evolutionarySolver.js';
import logger from '../../src/utils/logger.js';

/**
 * Worker handlers for each phase of the evolution algorithm
 * Each handler is stateless and idempotent
 */

/**
 * Process variator phase
 */
export async function processVariator(taskData, resultStore) {
  const { jobId, generation, evolutionConfig, problemContext, topPerformers = [] } = taskData;
  
  logger.info(`Processing variator for job ${jobId}, generation ${generation}`);
  logger.info('Variator task data:', JSON.stringify(taskData));
  
  try {
    // Check if already complete (idempotency)
    const job = await resultStore.getJobStatus(jobId);
    const genData = job.generations?.[`generation_${generation}`];
    
    if (genData?.variatorComplete) {
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

/**
 * Process enricher phase
 */
export async function processEnricher(taskData, resultStore) {
  const { jobId, generation, evolutionConfig, ideas } = taskData;
  
  logger.info(`Processing enricher for job ${jobId}, generation ${generation}`);
  
  try {
    // Check if already complete (idempotency)
    const job = await resultStore.getJobStatus(jobId);
    const genData = job.generations?.[`generation_${generation}`];
    
    if (genData?.enricherComplete) {
      logger.info(`Enricher already complete for job ${jobId}, generation ${generation}`);
      return { success: true, message: 'Already complete' };
    }
    
    // Validate input
    if (!ideas || ideas.length === 0) {
      logger.error(`No ideas provided for enrichment - job ${jobId}, generation ${generation}`);
      throw new Error('No ideas provided for enrichment');
    }
    
    // Additional validation to ensure ideas have required fields
    const validIdeas = ideas.filter(idea => idea && idea.idea_id && idea.description);
    if (validIdeas.length === 0) {
      logger.error(`No valid ideas found - job ${jobId}, generation ${generation}`, { ideas });
      throw new Error('No valid ideas found (missing idea_id or description)');
    }
    
    logger.info(`Processing ${validIdeas.length} valid ideas out of ${ideas.length} total`);
    
    // Use only valid ideas
    ideas = validIdeas;
    
    // Create solver instance
    const solver = new EvolutionarySolver();
    solver.config = { ...solver.config, ...evolutionConfig };
    solver.currentGeneration = generation;
    
    // Set up progress tracker for telemetry
    solver.progressTracker = { resultStore, jobId };
    
    // Enrich ideas
    const enrichedIdeas = await solver.enricher(ideas);
    
    // Format enriched data
    const formattedIdeas = await solver.formatEnrichedData(enrichedIdeas);
    
    // Save results
    await resultStore.savePhaseResults(jobId, generation, 'enricher', {
      enrichedIdeas: formattedIdeas,
      enricherComplete: true,
      enricherCompletedAt: new Date()
    });
    
    logger.info(`Enricher complete for job ${jobId}, generation ${generation}. Enriched ${formattedIdeas.length} ideas`);
    
    return { 
      success: true, 
      message: `Enriched ${formattedIdeas.length} ideas`,
      ideasCount: formattedIdeas.length,
      enrichedIdeas: formattedIdeas  // Return enriched ideas for workflow to pass to ranker
    };
    
  } catch (error) {
    logger.error(`Enricher error for job ${jobId}, generation ${generation}:`, error);
    
    // Update error state
    await resultStore.savePhaseResults(jobId, generation, 'enricher', {
      enricherError: error.message,
      enricherFailedAt: new Date()
    });
    
    throw error;
  }
}

/**
 * Process ranker phase
 */
export async function processRanker(taskData, resultStore) {
  const { jobId, generation, evolutionConfig, enrichedIdeas } = taskData;
  
  logger.info(`Processing ranker for job ${jobId}, generation ${generation}`);
  
  try {
    // Check if already complete (idempotency)
    const job = await resultStore.getJobStatus(jobId);
    const genData = job.generations?.[`generation_${generation}`];
    
    if (genData?.rankerComplete) {
      logger.info(`Ranker already complete for job ${jobId}, generation ${generation}`);
      return { success: true, message: 'Already complete' };
    }
    
    // Validate input
    if (!enrichedIdeas || enrichedIdeas.length === 0) {
      throw new Error('No enriched ideas provided for ranking');
    }
    
    // Create solver instance
    const solver = new EvolutionarySolver();
    solver.config = { ...solver.config, ...evolutionConfig };
    solver.currentGeneration = generation;
    
    // Rank ideas
    const { rankedIdeas, filteredIdeas } = await solver.ranker(enrichedIdeas);
    
    // Select top performers for next generation
    const topPerformers = rankedIdeas.slice(0, evolutionConfig.topSelectCount || 3);
    
    // Calculate generation stats
    const topScore = rankedIdeas[0]?.score || 0;
    const avgScore = rankedIdeas.length > 0 
      ? rankedIdeas.reduce((sum, idea) => sum + idea.score, 0) / rankedIdeas.length 
      : 0;
    
    // Save results
    await resultStore.savePhaseResults(jobId, generation, 'ranker', {
      solutions: [...rankedIdeas, ...filteredIdeas],
      rankedIdeas,
      filteredIdeas,
      topPerformers,
      topScore,
      avgScore,
      rankerComplete: true,
      rankerCompletedAt: new Date(),
      generationComplete: true,
      generationCompletedAt: new Date()
    });
    
    // Update current generation (will be handled by savePhaseResults above)
    
    logger.info(`Ranker complete for job ${jobId}, generation ${generation}. Ranked ${rankedIdeas.length} ideas, filtered ${filteredIdeas.length}`);
    
    return { 
      success: true, 
      message: `Ranked ${rankedIdeas.length} ideas`,
      rankedCount: rankedIdeas.length,
      filteredCount: filteredIdeas.length,
      topScore,
      avgScore,
      topPerformers  // Return top performers for next generation
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