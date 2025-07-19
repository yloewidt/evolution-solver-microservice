import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import EvolutionService from './services/evolutionService.js';
import EvolutionResultStore from '../cloud/firestore/resultStore.js';
import CloudTaskHandler from '../cloud/tasks/taskHandler.js';
import createRoutes from './api/routes.js';
import logger from './utils/logger.js';

dotenv.config();

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
const taskHandler = new CloudTaskHandler();

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
const apiRouter = createRoutes(evolutionService, taskHandler);
app.use('/api/evolution', apiRouter);

// Error handling
app.use((err, req, res, next) => {
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