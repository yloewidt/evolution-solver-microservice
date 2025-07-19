import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import EvolutionService from '../services/evolutionService.js';
import CloudTaskHandler from '../../cloud/tasks/taskHandler.js';
import logger from '../utils/logger.js';

const router = express.Router();

export default function createRoutes(evolutionService, taskHandler) {
  // Submit new evolution job
  router.post('/jobs', async (req, res) => {
    try {
      const { problemContext, parameters, filters, selectedBottleneck } = req.body;
      
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
      
      const jobData = {
        problemContext: enrichedContext,
        initialSolutions: [],
        evolutionConfig: {
          generations: parameters?.generations || 10,
          populationSize: parameters?.populationSize || 5,
          maxCapex: parameters?.maxCapex || 50000,
          targetROI: parameters?.targetROI || 10
        },
        userId: req.user?.id || 'anonymous',
        sessionId: req.sessionId || uuidv4()
      };
      
      const result = await taskHandler.createEvolutionTask(jobData);
      
      await evolutionService.resultStore.saveResult({
        jobId: result.jobId,
        userId: jobData.userId,
        sessionId: jobData.sessionId,
        problemContext: enrichedContext,
        evolutionConfig: jobData.evolutionConfig,
        status: 'pending'
      });
      
      res.json({
        jobId: result.jobId,
        taskName: result.taskName,
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
      const { status, limit = 50, offset = 0 } = req.query;
      
      let jobs;
      if (status) {
        jobs = await evolutionService.resultStore.getJobsByStatus(status, parseInt(limit));
      } else {
        jobs = await evolutionService.getRecentJobs(parseInt(limit));
      }
      
      const pendingTasks = await taskHandler.listTasks();
      
      const pendingJobs = pendingTasks.map(task => {
        let jobId = 'pending';
        let problemContext = 'Pending in Cloud Tasks';
        
        try {
          if (task.httpRequest?.body) {
            const decodedBody = JSON.parse(Buffer.from(task.httpRequest.body, 'base64').toString());
            jobId = decodedBody.jobId || jobId;
            problemContext = decodedBody.problemContext || problemContext;
          }
        } catch (e) {
          // Ignore parsing errors
        }
        
        return {
          jobId,
          status: 'pending',
          createdAt: task.createTime,
          scheduledAt: task.scheduleTime,
          problemContext,
          isPendingTask: true
        };
      });
      
      const allJobs = [...pendingJobs, ...jobs];
      
      res.json({
        jobs: allJobs.sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        ).slice(0, limit),
        total: allJobs.length,
        hasMore: allJobs.length > limit
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

  // Queue management endpoints (admin only)
  router.post('/queue/pause', async (req, res) => {
    try {
      const success = await taskHandler.pauseQueue();
      res.json({ success, message: success ? 'Queue paused' : 'Failed to pause queue' });
    } catch (error) {
      logger.error('Pause queue error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/queue/resume', async (req, res) => {
    try {
      const success = await taskHandler.resumeQueue();
      res.json({ success, message: success ? 'Queue resumed' : 'Failed to resume queue' });
    } catch (error) {
      logger.error('Resume queue error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/queue/purge', async (req, res) => {
    try {
      const success = await taskHandler.purgeQueue();
      res.json({ success, message: success ? 'Queue purged' : 'Failed to purge queue' });
    } catch (error) {
      logger.error('Purge queue error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}