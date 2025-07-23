import express from 'express';
import dotenv from 'dotenv';
import EvolutionService from '../../src/services/evolutionService.js';
import EvolutionResultStore from '../firestore/resultStore.js';
import CloudTaskHandler from '../tasks/taskHandler.js';
import OrchestratorService from '../../src/services/orchestratorService.js';
import { processVariator, processEnricher, processRanker } from './workerHandlersSelector.js';
import logger from '../../src/utils/logger.js';
import os from 'os';

dotenv.config();

// Validate required environment variables for worker
const validateEnvironment = () => {
  const required = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID
  };
  
  const missing = [];
  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    logger.error(`Worker: Missing required environment variables: ${missing.join(', ')}`);
    
    // Workers should always exit if environment is not properly configured
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
  
  logger.info('Worker environment configuration:', {
    NODE_ENV: process.env.NODE_ENV || 'development',
    ENVIRONMENT: process.env.ENVIRONMENT || 'development',
    K_SERVICE: process.env.K_SERVICE || 'local',
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || 'not-set',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'configured' : 'missing'
  });
};

// Validate environment on startup
validateEnvironment();

const app = express();
app.use(express.json({ limit: '50mb' }));

// Initialize services
const resultStore = new EvolutionResultStore();
const evolutionService = new EvolutionService(resultStore);
const taskHandler = new CloudTaskHandler();
const orchestratorService = new OrchestratorService(resultStore, taskHandler);

const ENVIRONMENT = process.env.ENVIRONMENT || 'development';
const SERVICE_VERSION = process.env.K_REVISION || 'unknown';

// Health check endpoints
app.get('/', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'evolution-worker',
    environment: ENVIRONMENT,
    version: SERVICE_VERSION,
    uptime: process.uptime()
  });
});

app.get('/ready', async (req, res) => {
  try {
    await resultStore.getCollection().limit(1).get();
    
    res.json({ 
      status: 'ready',
      firestore: 'connected',
      environment: ENVIRONMENT
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({ 
      status: 'not ready',
      error: error.message 
    });
  }
});

app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const healthStatus = {
    status: 'alive',
    timestamp: new Date().toISOString(),
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB'
    },
    cpu: process.cpuUsage()
  };
  
  res.json(healthStatus);
});

// Status update endpoint for workflows
app.post('/update-job-status', async (req, res) => {
  try {
    const { jobId, status, error } = req.body;
    
    logger.info(`Updating job status for ${jobId} to ${status}`);
    
    await resultStore.updateJobStatus(jobId, status, error);
    
    res.json({ success: true, jobId, status });
  } catch (error) {
    logger.error('Update job status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete job endpoint for workflows
app.post('/complete-job', async (req, res) => {
  try {
    const { jobId } = req.body;
    
    logger.info(`Completing job ${jobId}`);
    
    const job = await resultStore.getResult(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Gather all solutions from all generations
    const allSolutions = [];
    const generationHistory = [];
    
    const totalGenerations = job.evolutionConfig?.generations || 10;
    
    for (let gen = 1; gen <= totalGenerations; gen++) {
      const genData = job.generations?.[`generation_${gen}`];
      if (genData && genData.solutions) {
        genData.solutions.forEach(solution => {
          allSolutions.push({ ...solution, generation: gen });
        });
        generationHistory.push({
          generation: gen,
          solutionCount: genData.solutions.length,
          topScore: genData.topScore,
          avgScore: genData.avgScore
        });
      }
    }
    
    // Sort by score
    allSolutions.sort((a, b) => (b.score || 0) - (a.score || 0));
    
    await resultStore.completeJob(jobId, {
      topSolutions: allSolutions.slice(0, 10),
      allSolutions,
      generationHistory,
      totalSolutions: allSolutions.length
    });
    
    res.json({ success: true, jobId, totalSolutions: allSolutions.length });
  } catch (error) {
    logger.error('Complete job error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DEPRECATED: Orchestrator endpoint (kept for backward compatibility)
app.post('/orchestrate', async (req, res) => {
  const startTime = Date.now();
  const retryCount = req.headers['x-cloudtasks-taskretrycount'] || '0';
  
  logger.info('Processing orchestrator task', {
    jobId: req.body.jobId,
    checkAttempt: req.body.checkAttempt,
    retryCount
  });
  
  try {
    await orchestratorService.orchestrateJob(req.body);
    
    const duration = Date.now() - startTime;
    logger.info(`Orchestrator task completed in ${duration}ms`, {
      jobId: req.body.jobId,
      duration
    });
    
    res.json({ 
      success: true, 
      jobId: req.body.jobId,
      duration
    });
    
  } catch (error) {
    logger.error('Orchestrator task failed', {
      jobId: req.body.jobId,
      error: error.message
    });
    
    // Return 500 to trigger retry if needed
    res.status(500).json({ 
      error: error.message,
      jobId: req.body.jobId
    });
  }
});

// Variator endpoint
app.post('/process-variator', async (req, res) => {
  const startTime = Date.now();
  const retryCount = req.headers['x-cloudtasks-taskretrycount'] || '0';
  
  logger.info('Processing variator task', {
    jobId: req.body.jobId,
    generation: req.body.generation,
    retryCount
  });
  
  try {
    const result = await processVariator(req.body, resultStore);
    
    const duration = Date.now() - startTime;
    logger.info(`Variator task completed in ${duration}ms`, {
      jobId: req.body.jobId,
      generation: req.body.generation,
      duration,
      ideasCount: result.ideasCount
    });
    
    res.json({ 
      success: true, 
      ...result,
      duration
    });
    
  } catch (error) {
    logger.error('Variator task failed', {
      jobId: req.body.jobId,
      generation: req.body.generation,
      error: error.message,
      retryCount
    });
    
    res.status(500).json({ 
      error: error.message,
      jobId: req.body.jobId,
      generation: req.body.generation
    });
  }
});

// Enricher endpoint
app.post('/process-enricher', async (req, res) => {
  const startTime = Date.now();
  const retryCount = req.headers['x-cloudtasks-taskretrycount'] || '0';
  
  logger.info('Processing enricher task', {
    jobId: req.body.jobId,
    generation: req.body.generation,
    retryCount
  });
  
  try {
    const result = await processEnricher(req.body, resultStore);
    
    const duration = Date.now() - startTime;
    logger.info(`Enricher task completed in ${duration}ms`, {
      jobId: req.body.jobId,
      generation: req.body.generation,
      duration,
      ideasCount: result.ideasCount
    });
    
    res.json({ 
      success: true, 
      ...result,
      duration
    });
    
  } catch (error) {
    logger.error('Enricher task failed', {
      jobId: req.body.jobId,
      generation: req.body.generation,
      error: error.message,
      retryCount
    });
    
    res.status(500).json({ 
      error: error.message,
      jobId: req.body.jobId,
      generation: req.body.generation
    });
  }
});

// Ranker endpoint
app.post('/process-ranker', async (req, res) => {
  const startTime = Date.now();
  const retryCount = req.headers['x-cloudtasks-taskretrycount'] || '0';
  
  logger.info('Processing ranker task', {
    jobId: req.body.jobId,
    generation: req.body.generation,
    retryCount
  });
  
  try {
    const result = await processRanker(req.body, resultStore);
    
    const duration = Date.now() - startTime;
    logger.info(`Ranker task completed in ${duration}ms`, {
      jobId: req.body.jobId,
      generation: req.body.generation,
      duration,
      rankedCount: result.rankedCount,
      topScore: result.topScore
    });
    
    res.json({ 
      success: true, 
      ...result,
      duration
    });
    
  } catch (error) {
    logger.error('Ranker task failed', {
      jobId: req.body.jobId,
      generation: req.body.generation,
      error: error.message,
      retryCount
    });
    
    res.status(500).json({ 
      error: error.message,
      jobId: req.body.jobId,
      generation: req.body.generation
    });
  }
});

// Retry enricher endpoint for manual recovery
app.post('/retry-enricher', async (req, res) => {
  const { jobId, generation } = req.body;
  
  logger.info(`Manual retry-enricher request for job ${jobId}, generation ${generation}`);
  
  try {
    // Validate input
    if (!jobId || !generation) {
      return res.status(400).json({ error: 'jobId and generation are required' });
    }
    
    // Get current job status
    const job = await resultStore.getJobStatus(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const genData = job.generations?.[`generation_${generation}`];
    if (!genData) {
      return res.status(404).json({ error: `Generation ${generation} not found` });
    }
    
    // Check if variator is complete and enricher failed
    if (!genData.variatorComplete) {
      return res.status(400).json({ error: 'Variator not complete for this generation' });
    }
    
    if (genData.enricherComplete && genData.solutions?.length > 0) {
      return res.status(400).json({ error: 'Enricher already complete with valid solutions' });
    }
    
    // Get the ideas from this generation
    const ideas = genData.ideas;
    if (!ideas || ideas.length === 0) {
      return res.status(400).json({ error: 'No ideas found for this generation' });
    }
    
    logger.info(`Retrying enricher with ${ideas.length} ideas`);
    
    // Process enricher
    const taskData = {
      jobId,
      generation,
      evolutionConfig: job.evolutionConfig,
      ideas
    };
    
    const result = await processEnricher(taskData, resultStore);
    
    logger.info(`Enricher retry successful for job ${jobId}, generation ${generation}`);
    
    res.json({ 
      success: true,
      jobId,
      generation,
      enrichedCount: result.ideasCount,
      message: `Successfully enriched ${result.ideasCount} ideas`
    });
    
  } catch (error) {
    logger.error('Retry enricher error:', error);
    res.status(500).json({ 
      error: error.message,
      jobId,
      generation
    });
  }
});

// Legacy endpoint - create orchestrator task for backward compatibility
app.post('/process-evolution', async (req, res) => {
  const jobData = req.body;
  
  logger.info('Legacy evolution endpoint called, creating orchestrator task', {
    jobId: jobData.jobId
  });
  
  try {
    // Check if job exists
    const existingJob = await resultStore.getJobStatus(jobData.jobId);
    if (existingJob && existingJob.status === 'completed') {
      logger.info(`Job ${jobData.jobId} already completed`);
      return res.json({ 
        status: 'completed', 
        jobId: jobData.jobId,
        message: 'Job already completed'
      });
    }
    
    // If job doesn't exist or is not complete, start orchestration
    if (!existingJob || existingJob.status === 'pending') {
      // Update job to processing
      await resultStore.updateJobStatus(jobData.jobId, 'processing');
    }
    
    // Return success - orchestrator will handle the actual work
    res.json({ 
      status: 'accepted', 
      jobId: jobData.jobId,
      message: 'Job accepted for processing'
    });
    
  } catch (error) {
    logger.error('Legacy endpoint error:', error);
    res.status(500).json({ 
      error: error.message,
      jobId: jobData.jobId
    });
  }
});

// Cleanup endpoint
app.post('/cleanup', async (req, res) => {
  try {
    logger.info('Starting cleanup of old evolution results');
    
    const daysOld = req.body.daysOld || 30;
    const deletedCount = await resultStore.deleteOldResults(daysOld);
    
    logger.info(`Cleanup completed: deleted ${deletedCount} old results`);
    res.json({ 
      status: 'success',
      deletedCount,
      environment: ENVIRONMENT
    });
  } catch (error) {
    logger.error('Cleanup failed:', error);
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const stats = await evolutionService.getJobStats();
    
    const metrics = {
      environment: ENVIRONMENT,
      version: SERVICE_VERSION,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      jobs: stats,
      nodejs_version: process.version,
      platform: os.platform(),
      cpus: os.cpus().length
    };
    
    res.json(metrics);
  } catch (error) {
    logger.error('Metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    requestId: req.headers['x-cloud-trace-context'] || 'unknown'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  logger.info(`Evolution worker listening on port ${PORT}`, {
    environment: ENVIRONMENT,
    nodeVersion: process.version,
    memoryLimit: Math.round(os.totalmem() / 1024 / 1024) + ' MB'
  });
});

export default app;