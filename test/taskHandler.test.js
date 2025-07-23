import { jest } from '@jest/globals';

// Mock Cloud Tasks client
const mockCreateTask = jest.fn();
const mockListTasks = jest.fn();
const mockDeleteTask = jest.fn();
const mockGetQueue = jest.fn();
const mockUpdateQueue = jest.fn();
const mockPurgeQueue = jest.fn();
const mockQueuePath = jest.fn();

class MockCloudTasksClient {
  constructor(config) {
    this.config = config;
  }
  
  createTask = mockCreateTask;
  listTasks = mockListTasks;
  deleteTask = mockDeleteTask;
  getQueue = mockGetQueue;
  updateQueue = mockUpdateQueue;
  purgeQueue = mockPurgeQueue;
  queuePath = mockQueuePath;
}

// Mock modules
jest.unstable_mockModule('@google-cloud/tasks', () => ({
  CloudTasksClient: MockCloudTasksClient
}));

jest.unstable_mockModule('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-123')
}));

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Import after mocking
const CloudTaskHandler = (await import('../cloud/tasks/taskHandler.js')).default;
const logger = (await import('../src/utils/logger.js')).default;

describe('CloudTaskHandler', () => {
  let handler;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Clear any environment variables that might affect tests
    delete process.env.K_SERVICE;
    delete process.env.SERVICE_ACCOUNT_EMAIL;
    delete process.env.EVOLUTION_WORKER_URL;
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GCP_LOCATION;
    delete process.env.CLOUD_TASKS_QUEUE;
    
    mockQueuePath.mockReturnValue('projects/evolutionsolver/locations/us-central1/queues/evolution-jobs');
    handler = new CloudTaskHandler();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      // In test environment, it defaults to localhost
      expect(handler.projectId).toBe('evolutionsolver');
      expect(handler.location).toBe('us-central1');
      expect(handler.queueName).toBe('evolution-jobs');
      expect(handler.workerUrl).toBe('http://localhost:8081');
    });

    it('should use production URL in production', () => {
      process.env.NODE_ENV = 'production';
      const prodHandler = new CloudTaskHandler();
      expect(prodHandler.workerUrl).toBe('https://evolution-worker-prod-xxxx.run.app');
    });

    it('should use environment variables when available', () => {
      process.env.GCP_PROJECT_ID = 'test-project';
      process.env.GCP_LOCATION = 'europe-west1';
      process.env.CLOUD_TASKS_QUEUE = 'test-queue';
      process.env.EVOLUTION_WORKER_URL = 'https://test-worker.run.app';

      const customHandler = new CloudTaskHandler();

      expect(customHandler.projectId).toBe('test-project');
      expect(customHandler.location).toBe('europe-west1');
      expect(customHandler.queueName).toBe('test-queue');
      expect(customHandler.workerUrl).toBe('https://test-worker.run.app');
    });

    it('should handle local development environment', () => {
      process.env.NODE_ENV = 'development';
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';

      const localHandler = new CloudTaskHandler();

      expect(localHandler.workerUrl).toBe('http://localhost:8081');
    });

    it('should handle test environment', () => {
      process.env.NODE_ENV = 'test';

      const testHandler = new CloudTaskHandler();

      expect(testHandler.workerUrl).toBe('http://localhost:8081');
    });

    it('should handle Cloud Run environment', () => {
      process.env.K_SERVICE = 'my-service';
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';

      const cloudHandler = new CloudTaskHandler();

      expect(cloudHandler.client).toBeDefined();
    });
  });

  describe('getQueuePath', () => {
    it('should return queue path', () => {
      const path = handler.getQueuePath();

      expect(mockQueuePath).toHaveBeenCalledWith('evolutionsolver', 'us-central1', 'evolution-jobs');
      expect(path).toBe('projects/evolutionsolver/locations/us-central1/queues/evolution-jobs');
    });
  });

  describe('createEvolutionTask', () => {
    it('should create orchestrator task with jobId', async () => {
      const jobData = {
        jobId: 'existing-job-123',
        evolutionConfig: { generations: 5 },
        problemContext: 'Test problem',
        userId: 'user-123',
        sessionId: 'session-456'
      };

      mockCreateTask.mockResolvedValueOnce([{
        name: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs/tasks/1234567890'
      }]);

      const result = await handler.createEvolutionTask(jobData);

      expect(mockCreateTask).toHaveBeenCalledWith({
        parent: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs',
        task: expect.objectContaining({
          httpRequest: expect.objectContaining({
            httpMethod: 'POST',
            url: 'http://localhost:8081/orchestrate',
            headers: { 'Content-Type': 'application/json' }
          })
        })
      });

      expect(result).toEqual({
        jobId: 'existing-job-123',
        taskName: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs/tasks/1234567890',
        status: 'queued'
      });
    });

    it('should generate jobId if not provided', async () => {
      const jobData = {
        evolutionConfig: { generations: 5 },
        problemContext: 'Test problem',
        userId: 'user-123',
        sessionId: 'session-456'
      };

      mockCreateTask.mockResolvedValueOnce([{
        name: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs/tasks/1234567890'
      }]);

      const result = await handler.createEvolutionTask(jobData);

      expect(result.jobId).toBe('mock-uuid-123');
    });
  });

  describe('createOrchestratorTask', () => {
    it('should create orchestrator task', async () => {
      const taskData = {
        jobId: 'test-job-123',
        evolutionConfig: { generations: 5 },
        problemContext: 'Test problem'
      };

      mockCreateTask.mockResolvedValueOnce([{
        name: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs/tasks/1234567890'
      }]);

      const result = await handler.createOrchestratorTask(taskData);

      const createTaskCall = mockCreateTask.mock.calls[0][0];
      const bodyJson = JSON.parse(Buffer.from(createTaskCall.task.httpRequest.body, 'base64').toString());

      expect(bodyJson).toMatchObject({
        type: 'orchestrator',
        jobId: 'test-job-123',
        evolutionConfig: { generations: 5 },
        problemContext: 'Test problem'
      });
      expect(bodyJson.taskCreatedAt).toBeDefined();

      expect(createTaskCall.task.dispatchDeadline).toEqual({ seconds: 60 });
      expect(result).toEqual({
        jobId: 'test-job-123',
        taskName: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs/tasks/1234567890',
        status: 'queued'
      });
    });

    it('should add schedule time if provided', async () => {
      const scheduleTime = new Date('2024-01-01T12:00:00Z');
      const taskData = {
        jobId: 'test-job-123',
        scheduleTime
      };

      mockCreateTask.mockResolvedValueOnce([{
        name: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs/tasks/1234567890'
      }]);

      await handler.createOrchestratorTask(taskData);

      const createTaskCall = mockCreateTask.mock.calls[0][0];
      expect(createTaskCall.task.scheduleTime).toEqual({
        seconds: Math.floor(scheduleTime.getTime() / 1000)
      });
    });

    it('should add OIDC token for HTTPS URLs with service account', async () => {
      process.env.SERVICE_ACCOUNT_EMAIL = 'test-sa@project.iam.gserviceaccount.com';
      process.env.EVOLUTION_WORKER_URL = 'https://secure-worker.run.app';
      handler = new CloudTaskHandler();

      const taskData = { jobId: 'test-job-123' };

      mockCreateTask.mockResolvedValueOnce([{
        name: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs/tasks/1234567890'
      }]);

      await handler.createOrchestratorTask(taskData);

      const createTaskCall = mockCreateTask.mock.calls[0][0];
      expect(createTaskCall.task.httpRequest.oidcToken).toEqual({
        serviceAccountEmail: 'test-sa@project.iam.gserviceaccount.com',
        audience: 'https://secure-worker.run.app'
      });
    });

    it('should not add OIDC token for HTTP URLs', async () => {
      process.env.SERVICE_ACCOUNT_EMAIL = 'test-sa@project.iam.gserviceaccount.com';
      process.env.NODE_ENV = 'development';
      handler = new CloudTaskHandler();

      const taskData = { jobId: 'test-job-123' };

      mockCreateTask.mockResolvedValueOnce([{
        name: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs/tasks/1234567890'
      }]);

      await handler.createOrchestratorTask(taskData);

      const createTaskCall = mockCreateTask.mock.calls[0][0];
      expect(createTaskCall.task.httpRequest.oidcToken).toBeUndefined();
    });

    it('should handle create errors', async () => {
      const error = new Error('Task creation failed');
      mockCreateTask.mockRejectedValueOnce(error);

      await expect(handler.createOrchestratorTask({ jobId: 'test-job' }))
        .rejects.toThrow('Task creation failed');

      expect(logger.error).toHaveBeenCalledWith('Error creating orchestrator task:', error);
    });
  });

  describe('createWorkerTask', () => {
    it('should create worker task for variator', async () => {
      const taskData = {
        type: 'variator',
        jobId: 'test-job-123',
        generation: 1,
        problemContext: 'Test problem',
        evolutionConfig: { populationSize: 20 }
      };

      mockCreateTask.mockResolvedValueOnce([{
        name: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs/tasks/1234567890'
      }]);

      const result = await handler.createWorkerTask(taskData);

      const createTaskCall = mockCreateTask.mock.calls[0][0];
      expect(createTaskCall.task.httpRequest.url).toBe('http://localhost:8081/process-variator');
      expect(createTaskCall.task.dispatchDeadline).toEqual({ seconds: 300 });
      
      const bodyJson = JSON.parse(Buffer.from(createTaskCall.task.httpRequest.body, 'base64').toString());
      expect(bodyJson).toMatchObject(taskData);
      expect(bodyJson.taskCreatedAt).toBeDefined();

      expect(result).toEqual({
        taskName: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs/tasks/1234567890',
        status: 'queued'
      });
    });

    it('should create worker task for enricher', async () => {
      const taskData = {
        type: 'enricher',
        jobId: 'test-job-123',
        generation: 2,
        ideas: [{ id: 1 }]
      };

      mockCreateTask.mockResolvedValueOnce([{
        name: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs/tasks/1234567890'
      }]);

      const result = await handler.createWorkerTask(taskData);

      const createTaskCall = mockCreateTask.mock.calls[0][0];
      expect(createTaskCall.task.httpRequest.url).toBe('http://localhost:8081/process-enricher');
    });

    it('should handle worker task errors', async () => {
      const error = new Error('Worker task creation failed');
      mockCreateTask.mockRejectedValueOnce(error);

      await expect(handler.createWorkerTask({ type: 'variator', jobId: 'test-job', generation: 1 }))
        .rejects.toThrow('Worker task creation failed');
    });
  });

  describe('listTasks', () => {
    it('should list tasks successfully', async () => {
      const mockTasks = [
        {
          name: 'task1',
          createTime: { toDate: () => new Date('2024-01-01') },
          scheduleTime: { toDate: () => new Date('2024-01-02') },
          httpRequest: { url: 'https://example.com' },
          status: 'RUNNING'
        },
        {
          name: 'task2',
          createTime: new Date('2024-01-03'),
          scheduleTime: new Date('2024-01-04'),
          httpRequest: { url: 'https://example.com' }
        }
      ];

      mockListTasks.mockResolvedValueOnce([mockTasks]);

      const tasks = await handler.listTasks();

      expect(mockListTasks).toHaveBeenCalledWith({
        parent: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs',
        pageSize: 100
      });

      expect(tasks).toEqual([
        {
          name: 'task1',
          createTime: new Date('2024-01-01'),
          scheduleTime: new Date('2024-01-02'),
          httpRequest: { url: 'https://example.com' },
          status: 'RUNNING'
        },
        {
          name: 'task2',
          createTime: new Date('2024-01-03'),
          scheduleTime: new Date('2024-01-04'),
          httpRequest: { url: 'https://example.com' },
          status: 'pending'
        }
      ]);
    });

    it('should handle custom page size', async () => {
      mockListTasks.mockResolvedValueOnce([[]]);

      await handler.listTasks(50);

      expect(mockListTasks).toHaveBeenCalledWith({
        parent: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs',
        pageSize: 50
      });
    });

    it('should handle list errors gracefully', async () => {
      const error = new Error('List failed');
      mockListTasks.mockRejectedValueOnce(error);

      const tasks = await handler.listTasks();

      expect(logger.error).toHaveBeenCalledWith('Error listing tasks:', error);
      expect(tasks).toEqual([]);
    });
  });

  describe('deleteTask', () => {
    it('should delete task successfully', async () => {
      mockDeleteTask.mockResolvedValueOnce();

      const result = await handler.deleteTask('task-name-123');

      expect(mockDeleteTask).toHaveBeenCalledWith({ name: 'task-name-123' });
      expect(logger.info).toHaveBeenCalledWith('Deleted task: task-name-123');
      expect(result).toBe(true);
    });

    it('should handle delete errors gracefully', async () => {
      const error = new Error('Delete failed');
      mockDeleteTask.mockRejectedValueOnce(error);

      const result = await handler.deleteTask('task-name-123');

      expect(logger.error).toHaveBeenCalledWith('Error deleting task:', error);
      expect(result).toBe(false);
    });
  });

  describe('pauseQueue', () => {
    it('should pause queue successfully', async () => {
      const mockQueue = {
        name: 'queue-path',
        state: 'RUNNING'
      };
      mockGetQueue.mockResolvedValueOnce(mockQueue);
      mockUpdateQueue.mockResolvedValueOnce();

      const result = await handler.pauseQueue();

      expect(mockGetQueue).toHaveBeenCalledWith({
        name: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs'
      });
      expect(mockUpdateQueue).toHaveBeenCalledWith({
        queue: expect.objectContaining({ state: 'PAUSED' }),
        updateMask: { paths: ['state'] }
      });
      expect(result).toBe(true);
    });

    it('should handle pause errors gracefully', async () => {
      const error = new Error('Pause failed');
      mockGetQueue.mockRejectedValueOnce(error);

      const result = await handler.pauseQueue();

      expect(logger.error).toHaveBeenCalledWith('Error pausing queue:', error);
      expect(result).toBe(false);
    });
  });

  describe('resumeQueue', () => {
    it('should resume queue successfully', async () => {
      const mockQueue = {
        name: 'queue-path',
        state: 'PAUSED'
      };
      mockGetQueue.mockResolvedValueOnce(mockQueue);
      mockUpdateQueue.mockResolvedValueOnce();

      const result = await handler.resumeQueue();

      expect(mockUpdateQueue).toHaveBeenCalledWith({
        queue: expect.objectContaining({ state: 'RUNNING' }),
        updateMask: { paths: ['state'] }
      });
      expect(result).toBe(true);
    });

    it('should handle resume errors gracefully', async () => {
      const error = new Error('Resume failed');
      mockGetQueue.mockRejectedValueOnce(error);

      const result = await handler.resumeQueue();

      expect(logger.error).toHaveBeenCalledWith('Error resuming queue:', error);
      expect(result).toBe(false);
    });
  });

  describe('getQueueStats', () => {
    it('should get queue stats successfully', async () => {
      const mockQueue = {
        name: 'queue-path',
        state: 'RUNNING',
        rateLimits: { maxBurstSize: 10 },
        retryConfig: { maxAttempts: 3 },
        stats: { tasksCount: 5 }
      };
      mockGetQueue.mockResolvedValueOnce([mockQueue]);

      const stats = await handler.getQueueStats();

      expect(mockGetQueue).toHaveBeenCalledWith({
        name: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs'
      });
      expect(stats).toEqual({
        name: 'queue-path',
        state: 'RUNNING',
        rateLimits: { maxBurstSize: 10 },
        retryConfig: { maxAttempts: 3 },
        stats: { tasksCount: 5 }
      });
    });

    it('should handle stats errors', async () => {
      const error = new Error('Stats failed');
      mockGetQueue.mockRejectedValueOnce(error);

      await expect(handler.getQueueStats()).rejects.toThrow('Stats failed');
      expect(logger.error).toHaveBeenCalledWith('Error getting queue stats:', error);
    });
  });

  describe('purgeQueue', () => {
    it('should purge queue successfully', async () => {
      mockPurgeQueue.mockResolvedValueOnce();

      const result = await handler.purgeQueue();

      expect(mockPurgeQueue).toHaveBeenCalledWith({
        name: 'projects/evolutionsolver/locations/us-central1/queues/evolution-jobs'
      });
      expect(logger.info).toHaveBeenCalledWith('Queue purged successfully');
      expect(result).toBe(true);
    });

    it('should handle purge errors gracefully', async () => {
      const error = new Error('Purge failed');
      mockPurgeQueue.mockRejectedValueOnce(error);

      const result = await handler.purgeQueue();

      expect(logger.error).toHaveBeenCalledWith('Error purging queue:', error);
      expect(result).toBe(false);
    });
  });
});