import { jest } from '@jest/globals';

// Create mocks before imports
const mockResultStore = {
  getJobStatus: jest.fn(),
  updateJobStatus: jest.fn(),
  savePhaseResults: jest.fn(),
  completeJob: jest.fn(),
  updatePhaseStatus: jest.fn()
};

const mockTaskHandler = {
  createWorkerTask: jest.fn(),
  createTask: jest.fn(),
  createOrchestratorTask: jest.fn()
};

// Mock modules
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Import after mocking
const OrchestratorService = (await import('../src/services/orchestratorService.js')).default;

describe('OrchestratorService', () => {
  let orchestrator;

  beforeEach(() => {
    jest.clearAllMocks();
    orchestrator = new OrchestratorService(mockResultStore, mockTaskHandler);
    
    // Spy on internal methods
    jest.spyOn(orchestrator, 'createWorkerTask');
    jest.spyOn(orchestrator, 'requeueOrchestrator');
    jest.spyOn(orchestrator, 'markJobComplete');
    jest.spyOn(orchestrator, 'markJobFailed');
  });

  describe('orchestrateJob', () => {
    it('should handle job not found', async () => {
      mockResultStore.getJobStatus.mockResolvedValueOnce(null);

      await expect(orchestrator.orchestrateJob({ jobId: 'test-job' }))
        .rejects.toThrow('Job test-job not found');
    });

    it('should process pending job', async () => {
      const job = {
        jobId: 'test-job',
        status: 'pending',
        evolutionConfig: { generations: 10 }
      };
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);
      mockTaskHandler.createWorkerTask.mockResolvedValueOnce({ name: 'task-1' });

      await orchestrator.orchestrateJob({ jobId: 'test-job' });

      expect(mockTaskHandler.createWorkerTask).toHaveBeenCalledWith(
        'variator',
        expect.objectContaining({
          jobId: 'test-job',
          generation: 1
        })
      );
    });

    it('should handle completed job', async () => {
      const job = {
        jobId: 'test-job',
        status: 'completed'
      };
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);

      await orchestrator.orchestrateJob({ jobId: 'test-job' });

      expect(mockTaskHandler.createWorkerTask).not.toHaveBeenCalled();
    });

    it('should handle max check attempts', async () => {
      const job = { jobId: 'test-job', status: 'processing' };
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);

      await orchestrator.orchestrateJob({ 
        jobId: 'test-job', 
        checkAttempt: 100,
        maxCheckAttempts: 100 
      });

      expect(mockResultStore.updateJobStatus).toHaveBeenCalledWith(
        'test-job',
        'failed',
        'Max orchestration attempts exceeded'
      );
    });
  });

  describe('determineNextAction', () => {
    it('should return CREATE_TASK for pending job', () => {
      const job = { status: 'pending' };
      const action = orchestrator.determineNextAction(job);
      expect(action.type).toBe('CREATE_TASK');
      expect(action.task.type).toBe('variator');
      expect(action.task.generation).toBe(1);
    });

    it('should return ALREADY_COMPLETE for completed job', () => {
      const job = { status: 'completed' };
      const action = orchestrator.determineNextAction(job);
      expect(action.type).toBe('ALREADY_COMPLETE');
    });

    it('should return ALREADY_COMPLETE for failed job', () => {
      const job = { status: 'failed' };
      const action = orchestrator.determineNextAction(job);
      expect(action.type).toBe('ALREADY_COMPLETE');
    });

    it('should return CREATE_TASK for variator when not complete', () => {
      const job = {
        status: 'processing',
        evolutionConfig: { generations: 10 },
        currentGeneration: 1,
        generations: {
          generation_1: { variatorComplete: false }
        }
      };
      const action = orchestrator.determineNextAction(job);
      expect(action.type).toBe('CREATE_TASK');
      expect(action.task.type).toBe('variator');
      expect(action.task.generation).toBe(1);
    });

    it('should advance to next generation when current is complete', () => {
      const job = {
        status: 'processing',
        evolutionConfig: { generations: 10 },
        currentGeneration: 1,
        generations: {
          generation_1: {
            variatorComplete: true,
            enricherComplete: true,
            rankerComplete: true
          }
        }
      };
      const action = orchestrator.determineNextAction(job);
      expect(action.type).toBe('CREATE_TASK');
      expect(action.task.type).toBe('variator');
      expect(action.task.generation).toBe(2);
    });

    it('should complete job when all generations done', () => {
      const job = {
        status: 'processing',
        evolutionConfig: { generations: 2 },
        currentGeneration: 2,
        generations: {
          generation_1: {
            variatorComplete: true,
            enricherComplete: true,
            rankerComplete: true
          },
          generation_2: {
            variatorComplete: true,
            enricherComplete: true,
            rankerComplete: true
          }
        }
      };
      const action = orchestrator.determineNextAction(job);
      expect(action.type).toBe('MARK_COMPLETE');
    });
  });

  describe('executeAction', () => {
    const job = {
      jobId: 'test-job',
      status: 'processing',
      evolutionConfig: { generations: 10 }
    };

    it('should handle CREATE_TASK action', async () => {
      const action = {
        type: 'CREATE_TASK',
        task: { type: 'variator', generation: 1 }
      };
      const taskData = { checkAttempt: 0 };

      await orchestrator.executeAction('test-job', job, action, taskData);

      expect(orchestrator.createWorkerTask).toHaveBeenCalledWith(
        'test-job',
        job,
        action.task
      );
      expect(orchestrator.requeueOrchestrator).toHaveBeenCalledWith('test-job', 1);
    });

    it('should handle WAIT action', async () => {
      const action = { type: 'WAIT', reason: 'Test reason' };
      const taskData = { checkAttempt: 2 };

      await orchestrator.executeAction('test-job', job, action, taskData);

      expect(orchestrator.requeueOrchestrator).toHaveBeenCalledWith('test-job', 3);
    });

    it('should handle MARK_COMPLETE action', async () => {
      const action = { type: 'MARK_COMPLETE' };

      await orchestrator.executeAction('test-job', job, action, {});

      expect(orchestrator.markJobComplete).toHaveBeenCalledWith('test-job', job);
    });

    it('should handle ALREADY_COMPLETE action', async () => {
      const action = { type: 'ALREADY_COMPLETE' };

      await orchestrator.executeAction('test-job', job, action, {});

      // Should not call any methods, just log
      expect(mockTaskHandler.createWorkerTask).not.toHaveBeenCalled();
      expect(mockResultStore.updateJobStatus).not.toHaveBeenCalled();
    });

    it('should handle unknown action type', async () => {
      const action = { type: 'UNKNOWN' };

      await orchestrator.executeAction('test-job', job, action, {});

      // Should not throw, just log error
      expect(mockTaskHandler.createWorkerTask).not.toHaveBeenCalled();
    });
  });

  describe('createWorkerTask', () => {
    const job = {
      jobId: 'test-job',
      problemContext: 'Test problem',
      evolutionConfig: { 
        generations: 10,
        populationSize: 20
      },
      generations: {}
    };

    it('should create variator task for generation 1', async () => {
      const taskConfig = { type: 'variator', generation: 1 };
      mockResultStore.updatePhaseStatus = jest.fn();

      await orchestrator.createWorkerTask('test-job', job, taskConfig);

      expect(mockTaskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          type: 'variator',
          generation: 1,
          problemContext: 'Test problem'
        })
      );
      expect(mockResultStore.updatePhaseStatus).toHaveBeenCalledWith(
        'test-job', 1, 'variator', 'started'
      );
    });

    it('should include top performers for variator generation > 1', async () => {
      const jobWithGen = {
        ...job,
        generations: {
          generation_1: {
            topPerformers: [{ idea_id: '1' }, { idea_id: '2' }]
          }
        }
      };
      const taskConfig = { type: 'variator', generation: 2 };
      mockResultStore.updatePhaseStatus = jest.fn();

      await orchestrator.createWorkerTask('test-job', jobWithGen, taskConfig);

      expect(mockTaskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          topPerformers: [{ idea_id: '1' }, { idea_id: '2' }]
        })
      );
    });

    it('should include ideas for enricher task', async () => {
      const jobWithIdeas = {
        ...job,
        generations: {
          generation_1: {
            ideas: [{ idea_id: '1' }, { idea_id: '2' }]
          }
        }
      };
      const taskConfig = { type: 'enricher', generation: 1 };
      mockResultStore.updatePhaseStatus = jest.fn();

      await orchestrator.createWorkerTask('test-job', jobWithIdeas, taskConfig);

      expect(mockTaskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          ideas: [{ idea_id: '1' }, { idea_id: '2' }]
        })
      );
    });

    it('should include enrichedIdeas for ranker task', async () => {
      const jobWithEnriched = {
        ...job,
        generations: {
          generation_1: {
            enrichedIdeas: [{ idea_id: '1', business_case: {} }]
          }
        }
      };
      const taskConfig = { type: 'ranker', generation: 1 };
      mockResultStore.updatePhaseStatus = jest.fn();

      await orchestrator.createWorkerTask('test-job', jobWithEnriched, taskConfig);

      expect(mockTaskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          enrichedIdeas: [{ idea_id: '1', business_case: {} }]
        })
      );
    });
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      const delay1 = orchestrator.calculateBackoff(0);
      const delay2 = orchestrator.calculateBackoff(1);
      const delay3 = orchestrator.calculateBackoff(2);
      
      expect(delay1).toBeGreaterThanOrEqual(5000);
      expect(delay1).toBeLessThan(6000);
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('should cap delay at max delay', () => {
      const delay = orchestrator.calculateBackoff(20);
      expect(delay).toBeLessThanOrEqual(61000); // 60s max + 1s jitter
    });
  });

  describe('requeueOrchestrator', () => {
    it('should create orchestrator task with backoff', async () => {
      mockTaskHandler.createOrchestratorTask = jest.fn();
      
      await orchestrator.requeueOrchestrator('test-job', 3);

      expect(mockTaskHandler.createOrchestratorTask).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          checkAttempt: 3,
          scheduleTime: expect.any(Date)
        })
      );
    });
  });

  describe('markJobComplete', () => {
    it('should gather results and complete job', async () => {
      const job = {
        jobId: 'test-job',
        evolutionConfig: { generations: 2 },
        generations: {
          generation_1: {
            rankedSolutions: [{ idea_id: '1', score: 10 }]
          },
          generation_2: {
            rankedSolutions: [{ idea_id: '2', score: 12 }]
          }
        }
      };
      
      mockResultStore.completeJob = jest.fn();

      await orchestrator.markJobComplete('test-job', job);

      expect(mockResultStore.completeJob).toHaveBeenCalledWith(
        'test-job',
        expect.objectContaining({
          topSolutions: expect.any(Array),
          allSolutions: expect.any(Array)
        })
      );
    });
  });

  describe('markJobFailed', () => {
    it('should update job status to failed with error', async () => {
      await orchestrator.markJobFailed('test-job', 'Test error');

      expect(mockResultStore.updateJobStatus).toHaveBeenCalledWith(
        'test-job',
        'failed',
        'Test error'
      );
    });
  });

  describe('requeueOrchestrator', () => {
    it('should create orchestrator task with delay', async () => {
      await orchestrator.requeueOrchestrator('test-job', 5);

      expect(mockTaskHandler.createTask).toHaveBeenCalledWith(
        '/orchestrate',
        {
          jobId: 'test-job',
          checkAttempt: 5
        },
        { inSeconds: 25 } // 5 * 5
      );
    });

    it('should cap delay at 300 seconds', async () => {
      await orchestrator.requeueOrchestrator('test-job', 100);

      expect(mockTaskHandler.createTask).toHaveBeenCalledWith(
        '/orchestrate',
        {
          jobId: 'test-job',
          checkAttempt: 100
        },
        { inSeconds: 300 }
      );
    });
  });

  describe('determineNextAction - additional cases', () => {
    it('should return WAIT when variator started but not complete', () => {
      const job = {
        status: 'processing',
        currentGeneration: 1,
        generations: {
          generation_1: {
            variatorStarted: true,
            variatorComplete: false
          }
        }
      };
      
      const action = orchestrator.determineNextAction(job);
      expect(action.type).toBe('WAIT');
      expect(action.reason).toContain('Variator in progress');
    });

    it('should return CREATE_TASK for enricher when variator complete', () => {
      const job = {
        status: 'processing',
        currentGeneration: 1,
        generations: {
          generation_1: {
            variatorComplete: true,
            enricherComplete: false
          }
        }
      };
      
      const action = orchestrator.determineNextAction(job);
      expect(action.type).toBe('CREATE_TASK');
      expect(action.task.type).toBe('enricher');
    });

    it('should return WAIT when enricher started but not complete', () => {
      const job = {
        status: 'processing',
        currentGeneration: 1,
        generations: {
          generation_1: {
            variatorComplete: true,
            enricherStarted: true,
            enricherComplete: false
          }
        }
      };
      
      const action = orchestrator.determineNextAction(job);
      expect(action.type).toBe('WAIT');
      expect(action.reason).toContain('Enricher in progress');
    });

    it('should return CREATE_TASK for ranker when enricher complete', () => {
      const job = {
        status: 'processing',
        currentGeneration: 1,
        generations: {
          generation_1: {
            variatorComplete: true,
            enricherComplete: true,
            rankerComplete: false
          }
        }
      };
      
      const action = orchestrator.determineNextAction(job);
      expect(action.type).toBe('CREATE_TASK');
      expect(action.task.type).toBe('ranker');
    });
  });
});