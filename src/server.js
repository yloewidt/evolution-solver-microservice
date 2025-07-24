import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import EvolutionService from './services/evolutionService.js';
import EvolutionResultStore from '../cloud/firestore/resultStore.js';

import createRoutes from './api/routes.js';
import logger from './utils/logger.js';

dotenv.config();

// Validate required environment variables
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
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    logger.error('Please check your .env file or environment configuration');
    
    // In production, exit. In development/test, just warn
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
  
  // Log configuration (without sensitive values)
  logger.info('Environment configuration:', {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 8080,
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || 'not-set',
    CLOUD_TASKS_QUEUE: process.env.CLOUD_TASKS_QUEUE || 'evolution-jobs',
    EVOLUTION_WORKER_URL: process.env.EVOLUTION_WORKER_URL ? 'configured' : 'using-default',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'configured' : 'missing'
  });
};

// Validate environment on startup
validateEnvironment();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Initialize services
const resultStore = new EvolutionResultStore();
const evolutionService = new EvolutionService(resultStore);

// Health check endpoints
app.get('/', (req, res) => {
  res.json({
    service: 'Evolution Solver Microservice',
    version: '1.0.0',
    status: 'healthy',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      api: '/api/evolution',
      health: '/health',
      ready: '/ready'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get('/ready', async (req, res) => {
  try {
    // Check Firestore connection
    await resultStore.getCollection().limit(1).get();

    res.json({
      status: 'ready',
      services: {
        firestore: 'connected',
        openai: !!process.env.OPENAI_API_KEY,
        cloudTasks: !!process.env.GCP_PROJECT_ID
      }
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not ready',
      error: error.message
    });
  }
});

// API routes
const apiRouter = createRoutes(evolutionService);
app.use('/api/evolution', apiRouter);

// Error handling
app.use((err, req, res, _next) => {
  logger.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Cannot ${req.method} ${req.path}`
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

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Evolution Solver Microservice listening on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  });
});

export default app;
