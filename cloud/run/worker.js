import express from 'express';
import EvolutionService from '../../src/services/evolutionService.js';
import EvolutionResultStore from '../firestore/resultStore.js';
import logger from '../../src/utils/logger.js';
import os from 'os';

const app = express();
app.use(express.json({ limit: '50mb' }));

const resultStore = new EvolutionResultStore();
const evolutionService = new EvolutionService(resultStore);

const ENVIRONMENT = process.env.ENVIRONMENT || 'development';
const SERVICE_VERSION = process.env.K_REVISION || 'unknown';

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

app.post('/process-evolution', async (req, res) => {
  const jobData = req.body;
  
  logger.info(`Processing evolution job ${jobData.jobId}`, {
    environment: ENVIRONMENT,
    userId: jobData.userId,
    sessionId: jobData.sessionId,
    evolutionConfig: jobData.evolutionConfig
  });
  
  try {
    const result = await evolutionService.processEvolutionJob(jobData);
    
    res.json({ 
      status: 'completed', 
      jobId: jobData.jobId,
      resultId: result.resultId,
      solutionCount: result.result.topSolutions.length 
    });
    
  } catch (error) {
    logger.error(`Evolution job ${jobData.jobId} failed:`, error);
    
    res.status(500).json({ 
      status: 'failed', 
      jobId: jobData.jobId,
      error: error.message 
    });
  }
});

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

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    requestId: req.headers['x-cloud-trace-context'] || 'unknown'
  });
});

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