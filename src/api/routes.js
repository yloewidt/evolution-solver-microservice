import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import AnalyticsService from '../services/analyticsService.js';
import WorkflowHandler from '../../cloud/workflows/workflowHandler.js';
import logger from '../utils/logger.js';

const router = express.Router();

export default function createRoutes(evolutionService) {
  const analyticsService = new AnalyticsService(evolutionService.resultStore);
  const workflowHandler = new WorkflowHandler();
  // Submit new evolution job
  router.post('/jobs', async (req, res) => {
    try {
      // Support both 'parameters', 'params', and 'evolutionConfig' for backward compatibility
      const { problemContext, parameters, params, evolutionConfig: bodyEvolutionConfig } = req.body;
      const evolutionParams = bodyEvolutionConfig || parameters || params || {};

      logger.info('Request body:', JSON.stringify(req.body));
      logger.info('Received evolution parameters:', JSON.stringify(evolutionParams));

      if (!problemContext) {
        return res.status(400).json({ error: 'Problem context is required' });
      }

      const enrichedContext = problemContext;

      try {
        evolutionService.validateProblemContext(enrichedContext);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message });
      }

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
      logger.info(`Saving job with evolutionConfig:`, JSON.stringify(jobData.evolutionConfig));
      await evolutionService.resultStore.saveResult({
        jobId: jobId,
        userId: jobData.userId,
        sessionId: jobData.sessionId,
        problemContext: enrichedContext,
        evolutionConfig: jobData.evolutionConfig,
        status: 'pending'
      });

      // Create the workflow execution
      const result = await workflowHandler.executeEvolutionWorkflow(jobData);

      res.json({
        jobId: jobId,
        executionName: result.executionName,
        status: 'queued',
        message: 'Evolution job queued for processing'
      });
      
    } catch (error) {
      logger.error('Submit evolution job error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get job status
  router.get('/jobs/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;

      const status = await evolutionService.getJobStatus(jobId);

      if (!status) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json(status);
    } catch (error) {
      logger.error('Get job status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get job results
  router.get('/results/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;

      const results = await evolutionService.getResults(jobId);

      if (!results) {
        return res.status(404).json({ error: 'Results not found' });
      }

      res.json(results);
    } catch (error) {
      logger.error('Get results error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // List jobs
  router.get('/jobs', async (req, res) => {
    try {
      const { status, limit = 50 } = req.query;

      const jobs = await evolutionService.getRecentJobs(parseInt(limit));

      res.json({
        jobs: jobs,
        total: jobs.length,
        hasMore: jobs.length >= limit
      });
    } catch (error) {
      logger.error('List jobs error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get job statistics
  router.get('/stats', async (req, res) => {
    try {
      const stats = await evolutionService.getJobStats();

      res.json({
        jobs: stats
      });
    } catch (error) {
      logger.error('Get stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get detailed job analytics
  router.get('/jobs/:jobId/analytics', async (req, res) => {
    try {
      const { jobId } = req.params;

      const analytics = await analyticsService.getJobAnalytics(jobId);

      if (!analytics) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json(analytics);
    } catch (error) {
      logger.error('Get job analytics error:', error);
      res.status(500).json({ error: error.message });
    }
  });


  

  return router;
}
