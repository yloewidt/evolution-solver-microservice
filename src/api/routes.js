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
      // Support both 'parameters' and 'params' for backward compatibility
      const { problemContext, parameters, params, filters, selectedBottleneck } = req.body;
      const evolutionParams = parameters || params || {};

      logger.info('Received evolution parameters:', evolutionParams);

      let enrichedContext = '';

      if (selectedBottleneck) {
        enrichedContext = evolutionService.enrichContextWithBottleneck(selectedBottleneck, filters);
      } else if (!problemContext) {
        return res.status(400).json({ error: 'Either select a bottleneck or provide a problem context' });
      } else {
        enrichedContext = problemContext;
      }

      try {
        evolutionService.validateProblemContext(enrichedContext);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message });
      }

      // Validate monetary parameters if provided
      if (evolutionParams?.maxCapex !== undefined && evolutionParams.maxCapex > 10) {
        logger.warn(`maxCapex value ${evolutionParams.maxCapex} seems high. Expected units are millions USD (e.g., 0.1 = $100K)`);
      }
      if (evolutionParams?.diversificationUnit !== undefined && evolutionParams.diversificationUnit > 10) {
        logger.warn(`diversificationUnit value ${evolutionParams.diversificationUnit} seems high. Expected units are millions USD (e.g., 0.05 = $50K)`);
      }

      const evolutionConfig = {
        generations: evolutionParams?.generations || 10,
        populationSize: evolutionParams?.populationSize || 5,
        maxCapex: evolutionParams?.maxCapex || 100000,  // Default $100B in millions (effectively no limit)
        topSelectCount: evolutionParams?.topSelectCount || 3,
        offspringRatio: evolutionParams?.offspringRatio || 0.7,
        diversificationUnit: evolutionParams?.diversificationUnit || 0.05  // Default $50K in millions
      };

      // Only add optional parameters if they are defined
      if (evolutionParams?.dealTypes !== undefined) {
        evolutionConfig.dealTypes = evolutionParams.dealTypes;
      }
      if (evolutionParams?.minProfits !== undefined) {
        evolutionConfig.minProfits = evolutionParams.minProfits;
      }
      if (evolutionParams?.model !== undefined) {
        evolutionConfig.model = evolutionParams.model;
        logger.info(`Model set in evolutionConfig: ${evolutionConfig.model}`);
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

      // THEN create the workflow execution
      const useWorkflow = process.env.USE_WORKFLOWS === 'true' || process.env.ENVIRONMENT === 'production';

      if (useWorkflow) {
        const result = await workflowHandler.executeEvolutionWorkflow(jobData);

        res.json({
          jobId: jobId,
          executionName: result.executionName,
          status: 'queued',
          message: 'Evolution job queued for processing (workflow)'
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
        jobs: stats,
        queue: await taskHandler.getQueueStats()
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

  // Get user results
  router.get('/user/:userId/results', async (req, res) => {
    try {
      const { userId } = req.params;
      const { limit = 10 } = req.query;

      const results = await evolutionService.getUserResults(userId, parseInt(limit));

      res.json({ results });
    } catch (error) {
      logger.error('Get user results error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all solutions
  router.get('/solutions', async (req, res) => {
    try {
      const { limit = 100 } = req.query;

      const allResults = await evolutionService.getAllResults(parseInt(limit));

      const solutions = allResults.map(result => ({
        jobId: result.jobId || result.id,
        problemContext: result.problemContext,
        solutions: result.allSolutions || result.topSolutions || [],
        createdAt: result.createdAt,
        completedAt: result.completedAt,
        status: result.status || 'completed',
        totalSolutions: result.totalSolutions || (result.allSolutions || result.topSolutions || []).length,
        generationHistory: result.generationHistory || []
      }));

      let totalSolutionsCount = 0;
      let totalScore = 0;
      let scoreCount = 0;
      const uniqueBottlenecks = new Set();

      solutions.forEach(result => {
        if (result.solutions && Array.isArray(result.solutions)) {
          result.solutions.forEach(solution => {
            totalSolutionsCount++;
            if (solution.score) {
              totalScore += solution.score;
              scoreCount++;
            }
            if (result.problemContext) {
              uniqueBottlenecks.add(result.problemContext.substring(0, 100));
            }
          });
        }
      });

      const avgScore = scoreCount > 0 ? totalScore / scoreCount : 0;

      res.json({
        solutions,
        totalSolutions: totalSolutionsCount,
        totalBottlenecks: uniqueBottlenecks.size,
        avgScore: avgScore,
        totalJobs: solutions.length
      });
    } catch (error) {
      logger.error('Get all solutions error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get bottleneck solutions
  router.get('/bottleneck-solutions', async (req, res) => {
    try {
      const { industryName, problem } = req.query;

      if (!industryName || !problem) {
        return res.status(400).json({
          error: 'Both industryName and problem parameters are required'
        });
      }

      const result = await evolutionService.getBottleneckSolutions(industryName, problem);

      res.json(result);
    } catch (error) {
      logger.error('Get bottleneck solutions error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  

  return router;
}
