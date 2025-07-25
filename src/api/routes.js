import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import AnalyticsService from '../services/analyticsService.js';
import JobQueue from '../../cloud/jobQueue.js';
import logger from '../utils/logger.js';
import { asyncHandler, ValidationError, NotFoundError } from '../utils/errors.js';

const router = express.Router();

export default function createRoutes(evolutionService) {
  const analyticsService = new AnalyticsService(evolutionService.resultStore);
  const jobQueue = new JobQueue();
  // Submit new evolution job
  router.post('/jobs', asyncHandler(async (req, res) => {
    // Support both 'parameters', 'params', and 'evolutionConfig' for backward compatibility
    const { problemContext, parameters, params, evolutionConfig: bodyEvolutionConfig } = req.body;
    const evolutionParams = bodyEvolutionConfig || parameters || params || {};

    logger.info('Request body:', JSON.stringify(req.body));
    logger.info('Received evolution parameters:', JSON.stringify(evolutionParams));

    if (!problemContext) {
      throw new ValidationError('Problem context is required');
    }

    const enrichedContext = problemContext;

    evolutionService.validateProblemContext(enrichedContext);

    // Validate monetary parameters if provided
    if (evolutionParams?.maxCapex !== undefined && evolutionParams.maxCapex > 10) {
      logger.warn(`maxCapex value ${evolutionParams.maxCapex} seems high. Expected units are millions USD (e.g., 0.1 = $100K)`);
    }
    if (evolutionParams?.diversificationFactor !== undefined && evolutionParams.diversificationFactor > 10) {
      logger.warn(`diversificationFactor value ${evolutionParams.diversificationFactor} seems high. Expected units are millions USD (e.g., 0.05 = $50K)`);
    }

    const evolutionConfig = {
      generations: evolutionParams?.generations || 10,
      populationSize: evolutionParams?.populationSize || 5,
      maxCapex: evolutionParams?.maxCapex || 100000,  // Default $100B in millions (effectively no limit)
      topPerformerRatio: evolutionParams?.topPerformerRatio || 0.3,
      offspringRatio: evolutionParams?.offspringRatio || 0.7,
      diversificationFactor: evolutionParams?.diversificationFactor || 0.05,  // Default $50K in millions
      model: evolutionParams?.model || 'o3'  // Default to o3 model
    };

    // Only add optional parameters if they are defined
    if (evolutionParams?.dealTypes !== undefined) {
      evolutionConfig.dealTypes = evolutionParams.dealTypes;
    }
    if (evolutionParams?.minProfits !== undefined) {
      evolutionConfig.minProfits = evolutionParams.minProfits;
    }
    if (evolutionParams?.fallbackModel !== undefined) {
      evolutionConfig.fallbackModel = evolutionParams.fallbackModel;
    }
    if (evolutionParams?.useSingleIdeaEnricher !== undefined) {
      evolutionConfig.useSingleIdeaEnricher = evolutionParams.useSingleIdeaEnricher;
    }
    if (evolutionParams?.enricherConcurrency !== undefined) {
      evolutionConfig.enricherConcurrency = evolutionParams.enricherConcurrency;
    }

    const jobId = uuidv4();
    const jobData = {
      jobId,
      problemContext: enrichedContext,
      initialSolutions: [],
      evolutionConfig,
      userId: req.user?.id || 'anonymous',
      sessionId: req.sessionId || uuidv4()
    };

    // Check if job already exists (prevent duplicates)
    const existingJob = await evolutionService.resultStore.getJobStatus(jobId);
    if (existingJob) {
      logger.info(`Job ${jobId} already exists with status: ${existingJob.status}`);
      return res.json({
        jobId: jobId,
        status: existingJob.status,
        message: 'Job already exists',
        existingJob: true
      });
    }

    // Create document FIRST
    logger.info('Saving job with evolutionConfig:', JSON.stringify(jobData.evolutionConfig));
    await evolutionService.resultStore.saveResult({
      jobId: jobId,
      userId: jobData.userId,
      sessionId: jobData.sessionId,
      problemContext: enrichedContext,
      evolutionConfig: jobData.evolutionConfig,
      status: 'pending'
    });

    // Queue the job for processing
    const result = await jobQueue.queueJob(jobData);

    res.json({
      jobId: jobId,
      executionName: result.executionName,
      status: 'queued',
      message: 'Evolution job queued for processing'
    });
  }));

  // Get job status
  router.get('/jobs/:jobId', asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const status = await evolutionService.getJobStatus(jobId);

    if (!status) {
      throw new NotFoundError('Job not found');
    }

    res.json(status);
  }));

  // Get job results
  router.get('/results/:jobId', asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const results = await evolutionService.getResults(jobId);

    if (!results) {
      throw new NotFoundError('Results not found');
    }

    res.json(results);
  }));

  // List jobs
  router.get('/jobs', asyncHandler(async (req, res) => {
    const { status, limit = 50 } = req.query;

    const jobs = await evolutionService.getRecentJobs(parseInt(limit));

    res.json({
      jobs: jobs,
      total: jobs.length,
      hasMore: jobs.length >= limit
    });
  }));

  // Get job statistics
  router.get('/stats', asyncHandler(async (req, res) => {
    const stats = await evolutionService.getJobStats();

    res.json({
      jobs: stats
    });
  }));

  // Get detailed job analytics
  router.get('/jobs/:jobId/analytics', asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const analytics = await analyticsService.getJobAnalytics(jobId);

    if (!analytics) {
      throw new NotFoundError('Job not found');
    }

    res.json(analytics);
  }));

  // Direct job processing endpoint - bypasses workflow/queue
  router.post('/direct', asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const { problemContext, evolutionConfig = {} } = req.body;

    if (!problemContext) {
      throw new ValidationError('problemContext is required');
    }

    // Generate job ID
    const jobId = `direct-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Initialize resultStore
    const resultStore = evolutionService.resultStore;

    try {
      logger.info(`Starting direct job ${jobId}`);

      // Import required services for direct execution
      const { LLMClient } = await import('../services/llmClient.js');
      const SingleIdeaEnricher = (await import('../services/singleIdeaEnricher.js')).default;
      const EnricherCacheStore = (await import('../services/enricherCacheStore.js')).default;
      const EvolutionarySolver = (await import('../core/evolutionarySolver.js')).default;

      // Initialize services
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

      // Re-throw to let error handler handle it
      throw error;
    }
  }));

  return router;
}
