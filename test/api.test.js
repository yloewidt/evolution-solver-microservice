import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/server.js';

// Mock dependencies
jest.mock('../cloud/firestore/resultStore.js', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      getCollection: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true })
        })
      }),
      saveResult: jest.fn().mockResolvedValue('test-job-id'),
      getResult: jest.fn(),
      updateJobStatus: jest.fn(),
      getJobStatus: jest.fn(),
      getAllResults: jest.fn().mockResolvedValue([]),
      getUserResults: jest.fn().mockResolvedValue([]),
      getRecentJobs: jest.fn().mockResolvedValue([]),
      getJobsByStatus: jest.fn().mockResolvedValue([])
    }))
  };
});

jest.mock('../cloud/tasks/taskHandler.js', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      createEvolutionTask: jest.fn().mockResolvedValue({
        jobId: 'test-job-id',
        taskName: 'test-task-name',
        status: 'queued'
      }),
      listTasks: jest.fn().mockResolvedValue([]),
      getQueueStats: jest.fn().mockResolvedValue({
        name: 'test-queue',
        state: 'RUNNING'
      }),
      pauseQueue: jest.fn().mockResolvedValue(true),
      resumeQueue: jest.fn().mockResolvedValue(true),
      purgeQueue: jest.fn().mockResolvedValue(true)
    }))
  };
});

jest.mock('../src/core/evolutionarySolver.js', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      evolve: jest.fn().mockResolvedValue({
        topSolutions: [
          { idea_id: 'test-1', score: 0.9 },
          { idea_id: 'test-2', score: 0.8 }
        ],
        allSolutions: [
          { idea_id: 'test-1', score: 0.9, generation: 1 },
          { idea_id: 'test-2', score: 0.8, generation: 1 }
        ],
        generationHistory: [{ generation: 1, topScore: 0.9 }],
        totalEvaluations: 5,
        totalSolutions: 2
      })
    }))
  };
});

describe('Evolution API', () => {
  describe('GET /', () => {
    it('should return service info', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.body.service).toBe('Evolution Solver Microservice');
      expect(response.body.status).toBe('healthy');
      expect(response.body.endpoints).toBeDefined();
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeDefined();
    });
  });

  describe('GET /ready', () => {
    it('should return ready status', async () => {
      const response = await request(app).get('/ready');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
      expect(response.body.services).toBeDefined();
    });
  });

  describe('POST /api/evolution/jobs', () => {
    it('should create a new evolution job', async () => {
      const jobData = {
        problemContext: 'Test bottleneck problem that needs solving',
        parameters: {
          generations: 5,
          populationSize: 3
        }
      };

      const response = await request(app)
        .post('/api/evolution/jobs')
        .send(jobData);
      
      expect(response.status).toBe(200);
      expect(response.body.jobId).toBe('test-job-id');
      expect(response.body.status).toBe('queued');
      expect(response.body.message).toBe('Evolution job queued for processing');
    });

    it('should validate problem context', async () => {
      const jobData = {
        problemContext: 'Too short'
      };

      const response = await request(app)
        .post('/api/evolution/jobs')
        .send(jobData);
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('too short');
    });

    it('should enrich context with bottleneck data', async () => {
      const jobData = {
        selectedBottleneck: {
          industry_name: 'Test Industry',
          market_size: '$100B',
          growth_rate: 15,
          growth_rate_text: 'High growth',
          industry_definition: 'Test definition',
          drivers: 'Test drivers',
          bottleneck: {
            problem: 'Test problem',
            impact_usd_m: 500,
            type: 'Technical',
            severity: 'High',
            description: 'Test description'
          }
        }
      };

      const response = await request(app)
        .post('/api/evolution/jobs')
        .send(jobData);
      
      expect(response.status).toBe(200);
      expect(response.body.jobId).toBeDefined();
    });
  });

  describe('GET /api/evolution/jobs/:jobId', () => {
    it('should get job status', async () => {
      const mockStatus = {
        status: 'processing',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const { default: EvolutionResultStore } = await import('../cloud/firestore/resultStore.js');
      const mockStore = new EvolutionResultStore();
      mockStore.getJobStatus.mockResolvedValueOnce(mockStatus);

      const response = await request(app)
        .get('/api/evolution/jobs/test-job-id');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('processing');
    });

    it('should return 404 for non-existent job', async () => {
      const { default: EvolutionResultStore } = await import('../cloud/firestore/resultStore.js');
      const mockStore = new EvolutionResultStore();
      mockStore.getJobStatus.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/evolution/jobs/non-existent');
      
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Job not found');
    });
  });

  describe('GET /api/evolution/results/:jobId', () => {
    it('should get job results', async () => {
      const mockResults = {
        id: 'test-job-id',
        topSolutions: [{ idea_id: 'test-1' }],
        allSolutions: [{ idea_id: 'test-1' }],
        status: 'completed'
      };

      const { default: EvolutionResultStore } = await import('../cloud/firestore/resultStore.js');
      const mockStore = new EvolutionResultStore();
      mockStore.getResult.mockResolvedValueOnce(mockResults);

      const response = await request(app)
        .get('/api/evolution/results/test-job-id');
      
      expect(response.status).toBe(200);
      expect(response.body.id).toBe('test-job-id');
      expect(response.body.status).toBe('completed');
    });
  });

  describe('GET /api/evolution/jobs', () => {
    it('should list jobs', async () => {
      const mockJobs = [
        { jobId: 'job-1', status: 'completed', createdAt: new Date() },
        { jobId: 'job-2', status: 'processing', createdAt: new Date() }
      ];

      const { default: EvolutionResultStore } = await import('../cloud/firestore/resultStore.js');
      const mockStore = new EvolutionResultStore();
      mockStore.getRecentJobs.mockResolvedValueOnce(mockJobs);

      const response = await request(app)
        .get('/api/evolution/jobs?limit=10');
      
      expect(response.status).toBe(200);
      expect(response.body.jobs).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });
  });

  describe('GET /api/evolution/stats', () => {
    it('should return job statistics', async () => {
      const mockJobs = [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'processing' },
        { status: 'failed' }
      ];

      const { default: EvolutionResultStore } = await import('../cloud/firestore/resultStore.js');
      const mockStore = new EvolutionResultStore();
      mockStore.getRecentJobs.mockResolvedValueOnce(mockJobs);

      const response = await request(app)
        .get('/api/evolution/stats');
      
      expect(response.status).toBe(200);
      expect(response.body.jobs.total).toBe(4);
      expect(response.body.jobs.completed).toBe(2);
      expect(response.body.queue).toBeDefined();
    });
  });

  describe('GET /api/evolution/solutions', () => {
    it('should return all solutions', async () => {
      const mockResults = [
        {
          jobId: 'job-1',
          problemContext: 'Test problem 1',
          allSolutions: [
            { idea_id: 'sol-1', score: 0.9 },
            { idea_id: 'sol-2', score: 0.8 }
          ],
          createdAt: new Date()
        }
      ];

      const { default: EvolutionResultStore } = await import('../cloud/firestore/resultStore.js');
      const mockStore = new EvolutionResultStore();
      mockStore.getAllResults.mockResolvedValueOnce(mockResults);

      const response = await request(app)
        .get('/api/evolution/solutions');
      
      expect(response.status).toBe(200);
      expect(response.body.totalSolutions).toBe(2);
      expect(response.body.totalJobs).toBe(1);
      expect(response.body.avgScore).toBeGreaterThan(0);
    });
  });

  describe('GET /api/evolution/bottleneck-solutions', () => {
    it('should return solutions for specific bottleneck', async () => {
      const mockResults = [
        {
          jobId: 'job-1',
          problemContext: 'Industry: Test Industry\nProblem: Supply chain issue',
          allSolutions: [{ idea_id: 'sol-1', score: 0.9 }]
        },
        {
          jobId: 'job-2',
          problemContext: 'Industry: Other Industry\nProblem: Different issue',
          allSolutions: [{ idea_id: 'sol-2', score: 0.7 }]
        }
      ];

      const { default: EvolutionResultStore } = await import('../cloud/firestore/resultStore.js');
      const mockStore = new EvolutionResultStore();
      mockStore.getAllResults.mockResolvedValueOnce(mockResults);

      const response = await request(app)
        .get('/api/evolution/bottleneck-solutions')
        .query({ industryName: 'Test Industry', problem: 'Supply chain issue' });
      
      expect(response.status).toBe(200);
      expect(response.body.solutions).toHaveLength(1);
      expect(response.body.totalJobs).toBe(1);
      expect(response.body.industryName).toBe('Test Industry');
    });

    it('should require both parameters', async () => {
      const response = await request(app)
        .get('/api/evolution/bottleneck-solutions')
        .query({ industryName: 'Test Industry' });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });
  });

  describe('Queue management endpoints', () => {
    it('should pause queue', async () => {
      const response = await request(app)
        .post('/api/evolution/queue/pause');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Queue paused');
    });

    it('should resume queue', async () => {
      const response = await request(app)
        .post('/api/evolution/queue/resume');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Queue resumed');
    });

    it('should purge queue', async () => {
      const response = await request(app)
        .delete('/api/evolution/queue/purge');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Queue purged');
    });
  });

  describe('Error handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/evolution/unknown');
      
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not found');
    });

    it('should handle server errors gracefully', async () => {
      const { default: CloudTaskHandler } = await import('../cloud/tasks/taskHandler.js');
      const mockHandler = new CloudTaskHandler();
      mockHandler.createEvolutionTask.mockRejectedValueOnce(new Error('Cloud Tasks error'));

      const response = await request(app)
        .post('/api/evolution/jobs')
        .send({ problemContext: 'Test problem that will fail' });
      
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Cloud Tasks error');
    });
  });
});