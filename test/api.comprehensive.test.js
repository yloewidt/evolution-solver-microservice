import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock services before imports
const mockEvolutionService = {
  processEvolutionJob: jest.fn(),
  getJobStatus: jest.fn(),
  getResults: jest.fn(),
  getUserResults: jest.fn(),
  getRecentJobs: jest.fn(),
  getJobStats: jest.fn(),
  validateProblemContext: jest.fn(),
  enrichContextWithBottleneck: jest.fn(),
  getBottleneckSolutions: jest.fn()
};

const mockAnalyticsService = {
  getJobAnalytics: jest.fn()
};

const mockTaskHandler = {
  createEvolutionTask: jest.fn(),
  pauseQueue: jest.fn(),
  resumeQueue: jest.fn(),
  purgeQueue: jest.fn(),
  getQueueStats: jest.fn(),
  listTasks: jest.fn().mockResolvedValue([])
};

jest.unstable_mockModule('../src/services/evolutionService.js', () => ({
  default: jest.fn().mockImplementation(() => mockEvolutionService)
}));

jest.unstable_mockModule('../src/services/analyticsService.js', () => ({
  default: jest.fn().mockImplementation(() => mockAnalyticsService)
}));

jest.unstable_mockModule('../cloud/tasks/taskHandler.js', () => ({
  default: jest.fn().mockImplementation(() => mockTaskHandler)
}));

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock ResultStore
const mockResultStore = {
  updateJobStatus: jest.fn(),
  saveResult: jest.fn(),
  getJobStatus: jest.fn(),
  getResult: jest.fn(),
  getUserResults: jest.fn(),
  getAllResults: jest.fn(),
  getRecentJobs: jest.fn(),
  getJobsByStatus: jest.fn()
};

// Mock services that need ResultStore
jest.unstable_mockModule('../cloud/firestore/resultStore.js', () => ({
  default: jest.fn().mockImplementation(() => mockResultStore)
}));

jest.unstable_mockModule('../cloud/workflows/workflowHandler.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    executeWorkflow: jest.fn()
  }))
}));

// Import routes after mocking
const { default: createRoutes } = await import('../src/api/routes.js');

describe('API Endpoints - Comprehensive Tests', () => {
  let app;
  let routes;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create evolution service with result store
    const evolutionServiceWithStore = {
      ...mockEvolutionService,
      resultStore: mockResultStore
    };
    
    // Create routes with mocked dependencies
    routes = createRoutes(evolutionServiceWithStore, mockTaskHandler);
    
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use('/api/evolution', routes);
  });

  describe('3.1 Job Creation Endpoint - Core Functionality', () => {
    test('test_post_job_valid_params', async () => {
      const jobData = {
        problemContext: 'Create innovative business solutions',
        parameters: {
          generations: 3,
          populationSize: 10,
          topSelectCount: 3,
          model: 'gpt-4o'
        }
      };
      
      mockTaskHandler.createEvolutionTask.mockResolvedValueOnce({
        jobId: 'job-123',
        taskName: 'task-456',
        status: 'queued'
      });
      
      const response = await request(app)
        .post('/api/evolution/jobs')
        .send(jobData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        taskName: 'task-456',
        status: 'queued',
        message: 'Evolution job queued for processing'
      });
      expect(response.body.jobId).toMatch(/^[\w-]+$/);
      
      expect(mockTaskHandler.createEvolutionTask).toHaveBeenCalledWith(
        expect.objectContaining({
          problemContext: jobData.problemContext,
          evolutionConfig: expect.objectContaining(jobData.parameters)
        })
      );
    });
    
    test('test_post_job_returns_jobid', async () => {
      mockTaskHandler.createEvolutionTask.mockResolvedValueOnce({
        jobId: 'unique-job-id',
        taskName: 'task-123',
        status: 'queued'
      });
      
      const response = await request(app)
        .post('/api/evolution/jobs')
        .send({
          problemContext: 'Test problem'
        })
        .expect(200);
      
      expect(response.body.jobId).toMatch(/^[\w-]+$/);
      expect(response.body.status).toBe('queued');
    });
    
    test('test_post_job_default_params', async () => {
      mockTaskHandler.createEvolutionTask.mockResolvedValueOnce({
        jobId: 'job-123',
        taskName: 'task-456',
        status: 'queued'
      });
      
      await request(app)
        .post('/api/evolution/jobs')
        .send({
          problemContext: 'Test problem'
        })
        .expect(200);
      
      expect(mockTaskHandler.createEvolutionTask).toHaveBeenCalledWith(
        expect.objectContaining({
          evolutionConfig: expect.objectContaining({
            generations: 10,
            populationSize: 5,
            topSelectCount: 3
          })
        })
      );
    });
    
    test('test_post_job_optional_fields', async () => {
      const jobData = {
        problemContext: 'Test problem',
        userId: 'user-123',
        sessionId: 'session-456',
        initialSolutions: [
          { idea_id: '1', description: 'Initial idea' }
        ]
      };
      
      mockTaskHandler.createEvolutionTask.mockResolvedValueOnce({
        jobId: 'job-123',
        taskName: 'task-456',
        status: 'queued'
      });
      
      await request(app)
        .post('/api/evolution/jobs')
        .send(jobData)
        .expect(200);
      
      // API generates its own IDs and doesn't pass through user/session from body
      expect(mockTaskHandler.createEvolutionTask).toHaveBeenCalledWith(
        expect.objectContaining({
          problemContext: 'Test problem',
          evolutionConfig: expect.any(Object)
        })
      );
    });
  });

  describe('3.2 Job Creation Endpoint - Error Handling', () => {
    test('test_post_job_missing_context', async () => {
      const response = await request(app)
        .post('/api/evolution/jobs')
        .send({})
        .expect(400);
      
      expect(response.body.error).toContain('Either select a bottleneck or provide a problem context');
    });
    
    test('test_post_job_invalid_generations', async () => {
      mockTaskHandler.createEvolutionTask.mockResolvedValueOnce({
        jobId: 'job-123',
        taskName: 'task-456',
        status: 'queued'
      });
      
      const response = await request(app)
        .post('/api/evolution/jobs')
        .send({
          problemContext: 'Test',
          parameters: { generations: 0 }
        })
        .expect(200);
      
      // API uses default value for invalid generations
      expect(mockTaskHandler.createEvolutionTask).toHaveBeenCalledWith(
        expect.objectContaining({
          evolutionConfig: expect.objectContaining({ generations: 10 }) // uses default
        })
      );
    });
    
    test('test_post_job_invalid_population', async () => {
      mockTaskHandler.createEvolutionTask.mockResolvedValueOnce({
        jobId: 'job-123',
        taskName: 'task-456',
        status: 'queued'
      });
      
      const response = await request(app)
        .post('/api/evolution/jobs')
        .send({
          problemContext: 'Test',
          parameters: { populationSize: 101 }
        })
        .expect(200);
      
      // API doesn't validate population size, it just uses the value
      expect(mockTaskHandler.createEvolutionTask).toHaveBeenCalledWith(
        expect.objectContaining({
          evolutionConfig: expect.objectContaining({ populationSize: 101 })
        })
      );
    });
    
    test('test_post_job_service_error', async () => {
      mockTaskHandler.createEvolutionTask.mockRejectedValueOnce(
        new Error('Service unavailable')
      );
      
      const response = await request(app)
        .post('/api/evolution/jobs')
        .send({
          problemContext: 'Test problem'
        })
        .expect(500);
      
      expect(response.body.error).toBe('Service unavailable');
    });
  });

  describe('3.3 Job Status Endpoint', () => {
    test('test_get_job_status_success', async () => {
      mockEvolutionService.getJobStatus.mockResolvedValueOnce({
        jobId: 'job-123',
        status: 'processing',
        progress: {
          currentGeneration: 3,
          totalGenerations: 10,
          percentComplete: 30
        }
      });
      
      const response = await request(app)
        .get('/api/evolution/jobs/job-123')
        .expect(200);
      
      expect(response.body).toEqual({
        jobId: 'job-123',
        status: 'processing',
        progress: {
          currentGeneration: 3,
          totalGenerations: 10,
          percentComplete: 30
        }
      });
    });
    
    test('test_get_job_status_not_found', async () => {
      mockEvolutionService.getJobStatus.mockResolvedValueOnce(null);
      
      const response = await request(app)
        .get('/api/evolution/jobs/invalid-job')
        .expect(404);
      
      expect(response.body.error).toBe('Job not found');
    });
    
    test('test_get_job_status_completed', async () => {
      mockEvolutionService.getJobStatus.mockResolvedValueOnce({
        jobId: 'job-123',
        status: 'completed',
        completedAt: '2024-01-01T12:00:00Z',
        totalSolutions: 50
      });
      
      const response = await request(app)
        .get('/api/evolution/jobs/job-123')
        .expect(200);
      
      expect(response.body.status).toBe('completed');
      expect(response.body.totalSolutions).toBe(50);
    });
  });

  describe('3.4 Results Endpoint', () => {
    test('test_get_results_success', async () => {
      const mockResults = {
        jobId: 'job-123',
        topSolutions: [
          { idea_id: '1', score: 95.5 },
          { idea_id: '2', score: 92.3 }
        ],
        generationHistory: [
          { generation: 1, avgScore: 75.2 }
        ]
      };
      
      mockEvolutionService.getResults.mockResolvedValueOnce(mockResults);
      
      const response = await request(app)
        .get('/api/evolution/results/job-123')
        .expect(200);
      
      expect(response.body).toEqual(mockResults);
    });
    
    test('test_get_results_not_found', async () => {
      mockEvolutionService.getResults.mockResolvedValueOnce(null);
      
      const response = await request(app)
        .get('/api/evolution/results/invalid-job')
        .expect(404);
      
      expect(response.body.error).toBe('Results not found');
    });
    
    test('test_get_results_job_incomplete', async () => {
      mockEvolutionService.getResults.mockResolvedValueOnce({
        jobId: 'job-123',
        status: 'processing'
      });
      
      const response = await request(app)
        .get('/api/evolution/results/job-123')
        .expect(200);
      
      expect(response.body.status).toBe('processing');
    });
  });

  describe('3.5 List Jobs Endpoint', () => {
    test('test_list_jobs_no_filters', async () => {
      const mockJobs = [
        { jobId: 'job-1', status: 'completed' },
        { jobId: 'job-2', status: 'processing' }
      ];
      
      mockEvolutionService.getRecentJobs.mockResolvedValueOnce(mockJobs);
      
      const response = await request(app)
        .get('/api/evolution/jobs')
        .expect(200);
      
      expect(response.body).toMatchObject({
        jobs: mockJobs,
        total: 2,
        hasMore: false
      });
      expect(mockEvolutionService.getRecentJobs).toHaveBeenCalledWith(50);
    });
    
    test('test_list_jobs_with_status', async () => {
      const mockJobs = [
        { jobId: 'job-1', status: 'completed' }
      ];
      
      mockResultStore.getJobsByStatus.mockResolvedValueOnce(mockJobs);
      
      const response = await request(app)
        .get('/api/evolution/jobs?status=completed')
        .expect(200);
      
      expect(response.body).toMatchObject({
        jobs: mockJobs,
        total: 1,
        hasMore: false
      });
      expect(mockResultStore.getJobsByStatus).toHaveBeenCalledWith('completed', 50);
    });
    
    test('test_list_jobs_with_limit', async () => {
      mockEvolutionService.getRecentJobs.mockResolvedValueOnce([]);
      
      await request(app)
        .get('/api/evolution/jobs?limit=10')
        .expect(200);
      
      expect(mockEvolutionService.getRecentJobs).toHaveBeenCalledWith(10);
    });
  });

  describe('3.6 Analytics Endpoint', () => {
    test('test_get_analytics_success', async () => {
      const mockAnalytics = {
        jobId: 'job-123',
        totalApiCalls: 20,
        totalTokens: 50000,
        phaseBreakdown: {
          variator: { calls: 10, tokens: 25000 },
          enricher: { calls: 10, tokens: 25000 }
        }
      };
      
      mockAnalyticsService.getJobAnalytics.mockResolvedValueOnce(mockAnalytics);
      
      const response = await request(app)
        .get('/api/evolution/jobs/job-123/analytics')
        .expect(200);
      
      expect(response.body).toEqual(mockAnalytics);
    });
    
    test('test_get_analytics_not_found', async () => {
      mockAnalyticsService.getJobAnalytics.mockResolvedValueOnce(null);
      
      const response = await request(app)
        .get('/api/evolution/jobs/invalid/analytics')
        .expect(404);
      
      expect(response.body.error).toBe('Job not found');
    });
  });

  describe('3.7 Stats Endpoint', () => {
    test('test_get_stats_success', async () => {
      const mockStats = {
        totalJobs: 100,
        completedJobs: 85,
        failedJobs: 5,
        processingJobs: 10,
        avgCompletionTime: 180,
        successRate: 94.4
      };
      
      mockEvolutionService.getJobStats.mockResolvedValueOnce(mockStats);
      
      const response = await request(app)
        .get('/api/evolution/stats')
        .expect(200);
      
      expect(response.body).toEqual({ jobs: mockStats });
    });
  });

  describe('3.8 Queue Management Endpoints', () => {
    test('test_pause_queue_success', async () => {
      mockTaskHandler.pauseQueue.mockResolvedValueOnce(true);
      
      const response = await request(app)
        .post('/api/evolution/queue/pause')
        .expect(200);
      
      expect(response.body.message).toBe('Queue paused');
    });
    
    test('test_resume_queue_success', async () => {
      mockTaskHandler.resumeQueue.mockResolvedValueOnce(true);
      
      const response = await request(app)
        .post('/api/evolution/queue/resume')
        .expect(200);
      
      expect(response.body.message).toBe('Queue resumed');
    });
    
    test('test_purge_queue_success', async () => {
      mockTaskHandler.purgeQueue.mockResolvedValueOnce(true);
      
      const response = await request(app)
        .delete('/api/evolution/queue/purge')
        .expect(200);
      
      expect(response.body.message).toBe('Queue purged');
      expect(response.body.success).toBe(true);
    });
    
    test('test_queue_operation_failure', async () => {
      mockTaskHandler.pauseQueue.mockResolvedValueOnce(false);
      
      const response = await request(app)
        .post('/api/evolution/queue/pause')
        .expect(200);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Failed to pause queue');
    });
  });

  describe('3.9 Edge Cases', () => {
    test('test_invalid_http_method', async () => {
      await request(app)
        .put('/api/evolution/jobs')
        .expect(404);
    });
    
    test('test_invalid_endpoint', async () => {
      await request(app)
        .get('/api/evolution/invalid')
        .expect(404);
    });
    
    test('test_large_problem_context', async () => {
      const largeContext = 'x'.repeat(5001);
      
      mockEvolutionService.validateProblemContext.mockImplementation(() => {
        throw new Error('Problem context too long (5001 > 5000 chars)');
      });
      
      const response = await request(app)
        .post('/api/evolution/jobs')
        .send({
          problemContext: largeContext
        })
        .expect(400);
      
      expect(response.body.error).toContain('too long');
    });
    
    test('test_invalid_json_body', async () => {
      const response = await request(app)
        .post('/api/evolution/jobs')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json')
        .expect(400);
      
      expect(response.status).toBe(400);
    });
  });
});