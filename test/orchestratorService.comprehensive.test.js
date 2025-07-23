import { jest } from '@jest/globals';

// Mock logger
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

const OrchestratorService = (await import('../src/services/orchestratorService.js')).default;

describe('OrchestratorService - Comprehensive Tests', () => {
  let orchestrator;
  let resultStore;
  let taskHandler;
  
  beforeEach(() => {
    // Create result store with all necessary methods
    resultStore = {
      getJobStatus: jest.fn(),
      updateJobStatus: jest.fn().mockResolvedValue(),
      updatePhaseStatus: jest.fn().mockResolvedValue(),
      updatePhaseData: jest.fn().mockResolvedValue(),
      completeJob: jest.fn().mockResolvedValue(),
      getResult: jest.fn().mockResolvedValue({
        generations: {},
        evolutionConfig: {}
      })
    };
    
    // Create task handler
    taskHandler = {
      createWorkerTask: jest.fn().mockResolvedValue({ taskName: 'test-task' }),
      createOrchestratorTask: jest.fn().mockResolvedValue({ taskName: 'orch-task' })
    };
    
    orchestrator = new OrchestratorService(resultStore, taskHandler);
  });

  describe('2.1 State Machine - Core Functionality', () => {
    test('test_orchestrator_initial_state_transitions', async () => {
      const jobData = {
        jobId: 'test-job',
        evolutionConfig: { generations: 3, populationSize: 5 },
        problemContext: 'Test context'
      };
      
      // Initial state: pending job
      resultStore.getJobStatus.mockResolvedValueOnce({
        status: 'pending',
        generations: {},
        evolutionConfig: jobData.evolutionConfig
      });
      
      await orchestrator.orchestrateJob(jobData);
      
      // For pending jobs, orchestrator doesn't update status directly
      // It creates the task and marks phase as started
      
      // Should create first variator task
      expect(taskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'variator',
          jobId: 'test-job',
          generation: 1
        })
      );
    });
    
    test('test_orchestrator_phase_sequence', async () => {
      const jobId = 'test-job';
      const jobData = { jobId };
      
      // Test each phase transition
      
      // 1. Variator started -> wait
      resultStore.getJobStatus.mockResolvedValueOnce({
        status: 'processing',
        generations: {
          generation_1: { variatorStarted: true }
        },
        evolutionConfig: { generations: 1 }
      });
      
      await orchestrator.orchestrateJob(jobData);
      expect(taskHandler.createWorkerTask).not.toHaveBeenCalled();
      
      // 2. Variator complete -> start enricher
      taskHandler.createWorkerTask.mockClear();
      resultStore.getJobStatus.mockResolvedValueOnce({
        status: 'processing',
        generations: {
          generation_1: { 
            variatorComplete: true,
            ideas: [{ title: 'Idea 1' }]
          }
        },
        evolutionConfig: { generations: 1 }
      });
      
      await orchestrator.orchestrateJob(jobData);
      expect(taskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'enricher',
          jobId,
          generation: 1
        })
      );
      
      // 3. Enricher complete -> start ranker
      taskHandler.createWorkerTask.mockClear();
      resultStore.getJobStatus.mockResolvedValueOnce({
        jobId: 'test-job',
        status: 'processing',
        generations: {
          generation_1: { 
            variatorComplete: true,
            enricherComplete: true,
            enrichedIdeas: [{ title: 'Idea 1', npv: 10 }]
          }
        },
        evolutionConfig: { generations: 1 }
      });
      
      await orchestrator.orchestrateJob(jobData);
      expect(taskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ranker',
          jobId,
          generation: 1
        })
      );
    });
    
    test('test_orchestrator_generation_progression', async () => {
      const jobData = { jobId: 'test-job' };
      
      // Generation 1 complete, should start generation 2
      resultStore.getJobStatus.mockResolvedValueOnce({
        jobId: 'test-job',
        status: 'processing',
        currentGeneration: 1,
        generations: {
          generation_1: {
            variatorComplete: true,
            enricherComplete: true,
            rankerComplete: true,
            topPerformers: [{ title: 'Top 1', score: 100 }]
          }
        },
        evolutionConfig: { 
          generations: 3,
          topSelectCount: 1 
        }
      });
      
      await orchestrator.orchestrateJob(jobData);
      
      expect(taskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'variator',
          jobId: 'test-job',
          generation: 2,
          topPerformers: [{ title: 'Top 1', score: 100 }],
          evolutionConfig: { generations: 3, topSelectCount: 1 }
        })
      );
    });
    
    test('test_orchestrator_job_completion', async () => {
      const jobData = { jobId: 'test-job' };
      
      // All generations complete
      const jobStatus = {
        jobId: 'test-job',
        status: 'processing',
        currentGeneration: 2,
        generations: {
          generation_1: {
            variatorComplete: true,
            enricherComplete: true,
            rankerComplete: true,
            solutions: [
              { title: 'Sol 1', score: 100 },
              { title: 'Sol 2', score: 90 }
            ],
            topScore: 100,
            avgScore: 95
          },
          generation_2: {
            variatorComplete: true,
            enricherComplete: true,
            rankerComplete: true,
            solutions: [
              { title: 'Sol 3', score: 110 },
              { title: 'Sol 4', score: 85 }
            ],
            topScore: 110,
            avgScore: 97.5
          }
        },
        evolutionConfig: { generations: 2 }
      };
      
      resultStore.getJobStatus.mockResolvedValueOnce(jobStatus);
      
      await orchestrator.orchestrateJob(jobData);
      
      expect(resultStore.completeJob).toHaveBeenCalledWith(
        'test-job',
        expect.objectContaining({
          topSolutions: expect.arrayContaining([
            expect.objectContaining({ title: 'Sol 3', score: 110 })
          ]),
          allSolutions: expect.any(Array),
          generationHistory: expect.any(Array),
          totalEvaluations: expect.any(Number),
          totalSolutions: 4
        })
      );
    });
    
    test('test_orchestrator_idempotent_operations', async () => {
      const jobData = { jobId: 'test-job' };
      
      // Phase already started
      resultStore.getJobStatus.mockResolvedValue({
        status: 'processing',
        generations: {
          generation_1: { 
            variatorStarted: true,
            variatorComplete: false
          }
        },
        evolutionConfig: { generations: 1 }
      });
      
      // Call multiple times
      await orchestrator.orchestrateJob(jobData);
      await orchestrator.orchestrateJob(jobData);
      await orchestrator.orchestrateJob(jobData);
      
      // Should not create duplicate tasks
      expect(taskHandler.createWorkerTask).not.toHaveBeenCalled();
      
      // Should re-queue orchestrator each time
      expect(taskHandler.createOrchestratorTask).toHaveBeenCalledTimes(3);
    });
  });

  describe('2.1 State Machine - Edge Cases', () => {
    test('test_orchestrator_missing_job', async () => {
      resultStore.getJobStatus.mockResolvedValueOnce(null);
      
      // When job is not found, orchestrator logs error and re-queues
      await orchestrator.orchestrateJob({ jobId: 'non-existent' });
      
      // Should re-queue orchestrator for retry
      expect(taskHandler.createOrchestratorTask).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'non-existent',
          checkAttempt: 1
        })
      );
    });
    
    test('test_orchestrator_concurrent_execution', async () => {
      const jobData = { jobId: 'test-job' };
      
      // Simulate concurrent orchestrators seeing same state
      resultStore.getJobStatus.mockResolvedValue({
        jobId: 'test-job',
        status: 'processing',
        generations: {
          generation_1: { variatorComplete: true, ideas: [{}] }
        },
        evolutionConfig: { generations: 1 }
      });
      
      // Both should try to start enricher
      const promises = [
        orchestrator.orchestrateJob(jobData),
        orchestrator.orchestrateJob(jobData)
      ];
      
      await Promise.all(promises);
      
      // Both will attempt to create task (race condition)
      expect(taskHandler.createWorkerTask).toHaveBeenCalledTimes(2);
      
      // In real implementation, only one should succeed due to atomic updates
    });
    
    test('test_orchestrator_max_attempts_exceeded', async () => {
      const jobData = { 
        jobId: 'test-job',
        checkAttempt: 100,
        maxCheckAttempts: 100
      };
      
      resultStore.getJobStatus.mockResolvedValueOnce({
        jobId: 'test-job',
        status: 'processing',
        generations: {},
        evolutionConfig: { generations: 1 }
      });
      
      // Mock error to trigger max attempts logic
      taskHandler.createWorkerTask.mockRejectedValueOnce(new Error('Task creation failed'));
      
      await orchestrator.orchestrateJob(jobData);
      
      expect(resultStore.updateJobStatus).toHaveBeenCalledWith(
        'test-job',
        'failed',
        'Max orchestration attempts exceeded'
      );
    });
    
    test('test_orchestrator_partial_generation_data', async () => {
      const jobData = { jobId: 'test-job' };
      
      // Missing ideas array
      resultStore.getJobStatus.mockResolvedValueOnce({
        status: 'processing',
        generations: {
          generation_1: { 
            variatorComplete: true
            // ideas array missing
          }
        },
        evolutionConfig: { generations: 1 }
      });
      
      await orchestrator.orchestrateJob(jobData);
      
      // Should still create enricher task with empty array
      expect(taskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'enricher',
          ideas: []
        })
      );
    });
    
    test('test_orchestrator_backoff_calculation', async () => {
      const jobData = { jobId: 'test-job' };
      
      // Job in wait state
      resultStore.getJobStatus.mockResolvedValue({
        status: 'processing',
        generations: {
          generation_1: { variatorStarted: true }
        },
        evolutionConfig: { generations: 1 }
      });
      
      // Test increasing check attempts
      for (let attempt = 0; attempt < 5; attempt++) {
        taskHandler.createOrchestratorTask.mockClear();
        
        await orchestrator.orchestrateJob({ 
          ...jobData, 
          checkAttempt: attempt 
        });
        
        const call = taskHandler.createOrchestratorTask.mock.calls[0][0];
        
        if (attempt > 0) {
          expect(call.scheduleTime).toBeDefined();
          // Verify exponential backoff
          const delay = call.scheduleTime.getTime() - Date.now();
          expect(delay).toBeGreaterThan(0);
        }
      }
    });
    
    test('test_orchestrator_already_complete_job', async () => {
      const jobData = { jobId: 'test-job' };
      
      resultStore.getJobStatus.mockResolvedValueOnce({
        jobId: 'test-job',
        status: 'completed',
        generations: {},
        evolutionConfig: {}
      });
      
      await orchestrator.orchestrateJob(jobData);
      
      // Should not create any tasks
      expect(taskHandler.createWorkerTask).not.toHaveBeenCalled();
      expect(taskHandler.createOrchestratorTask).not.toHaveBeenCalled();
      expect(resultStore.updateJobStatus).not.toHaveBeenCalled();
    });
  });

  describe('2.2 Worker Task Creation - Core Functionality', () => {
    test('test_create_variator_task_data', async () => {
      const jobData = { 
        jobId: 'test-job',
        evolutionConfig: { 
          generations: 3,
          populationSize: 10 
        },
        problemContext: 'Test problem'
      };
      
      // Pending status should trigger first generation variator
      resultStore.getJobStatus.mockResolvedValueOnce({
        jobId: 'test-job',
        status: 'pending',
        generations: {},
        evolutionConfig: jobData.evolutionConfig,
        problemContext: jobData.problemContext
      });
      
      await orchestrator.orchestrateJob(jobData);
      
      expect(taskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'variator',
          jobId: 'test-job',
          generation: 1,
          evolutionConfig: jobData.evolutionConfig,
          problemContext: jobData.problemContext
        })
      );
      // Verify topPerformers is NOT included for generation 1
      const call = taskHandler.createWorkerTask.mock.calls[0][0];
      expect(call.topPerformers).toBeUndefined();
    });
    
    test('test_create_enricher_task_data', async () => {
      const ideas = [
        { title: 'Idea 1', description: 'Desc 1' },
        { title: 'Idea 2', description: 'Desc 2' }
      ];
      
      resultStore.getJobStatus.mockResolvedValueOnce({
        jobId: 'test-job',
        status: 'processing',
        generations: {
          generation_1: {
            variatorComplete: true,
            ideas
          }
        },
        evolutionConfig: { generations: 1 },
        problemContext: 'Context'
      });
      
      await orchestrator.orchestrateJob({ jobId: 'test-job' });
      
      expect(taskHandler.createWorkerTask).toHaveBeenCalledWith({
        type: 'enricher',
        jobId: 'test-job',
        generation: 1,
        evolutionConfig: { generations: 1 },
        ideas,
        problemContext: 'Context'
      });
    });
    
    test('test_create_ranker_task_data', async () => {
      const enrichedIdeas = [
        { title: 'Idea 1', npv: 10, capex: 1 },
        { title: 'Idea 2', npv: 20, capex: 2 }
      ];
      
      resultStore.getJobStatus.mockResolvedValueOnce({
        status: 'processing',
        generations: {
          generation_1: {
            variatorComplete: true,
            enricherComplete: true,
            enrichedIdeas
          }
        },
        evolutionConfig: { generations: 1 },
        problemContext: 'Context'
      });
      
      await orchestrator.orchestrateJob({ jobId: 'test-job' });
      
      expect(taskHandler.createWorkerTask).toHaveBeenCalledWith({
        type: 'ranker',
        jobId: 'test-job',
        generation: 1,
        evolutionConfig: { generations: 1 },
        enrichedIdeas,
        problemContext: 'Context'
      });
    });
    
    test('test_task_includes_problem_context', async () => {
      const problemContext = 'Create innovative solutions for urban mobility';
      
      resultStore.getJobStatus.mockResolvedValueOnce({
        status: 'processing',
        generations: {},
        evolutionConfig: { generations: 1 },
        problemContext
      });
      
      await orchestrator.orchestrateJob({ jobId: 'test-job' });
      
      const taskCall = taskHandler.createWorkerTask.mock.calls[0][0];
      expect(taskCall.problemContext).toBe(problemContext);
    });
    
    test('test_task_includes_evolution_config', async () => {
      const evolutionConfig = {
        generations: 5,
        populationSize: 20,
        topSelectCount: 3,
        enricherConcurrency: 25,
        model: 'gpt-4o'
      };
      
      resultStore.getJobStatus.mockResolvedValueOnce({
        status: 'processing',
        generations: {},
        evolutionConfig,
        problemContext: 'Test'
      });
      
      await orchestrator.orchestrateJob({ jobId: 'test-job' });
      
      const taskCall = taskHandler.createWorkerTask.mock.calls[0][0];
      expect(taskCall.evolutionConfig).toEqual(evolutionConfig);
    });
  });

  describe('2.2 Worker Task Creation - Edge Cases', () => {
    test('test_create_task_missing_previous_data', async () => {
      // Enricher phase but no ideas from variator
      resultStore.getJobStatus.mockResolvedValueOnce({
        status: 'processing',
        generations: {
          generation_1: {
            variatorComplete: true
            // ideas missing
          }
        },
        evolutionConfig: { generations: 1 },
        problemContext: 'Test'
      });
      
      await orchestrator.orchestrateJob({ jobId: 'test-job' });
      
      // Should create task with empty array
      expect(taskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'enricher',
          ideas: []
        })
      );
    });
    
    test('test_create_task_network_failure', async () => {
      resultStore.getJobStatus.mockResolvedValueOnce({
        jobId: 'test-job',
        status: 'pending',
        generations: {},
        evolutionConfig: { generations: 1 },
        problemContext: 'Test'
      });
      
      taskHandler.createWorkerTask.mockRejectedValueOnce(
        new Error('Network error')
      );
      
      await orchestrator.orchestrateJob({ 
        jobId: 'test-job',
        checkAttempt: 0 
      });
      
      // Should re-queue orchestrator for retry
      expect(taskHandler.createOrchestratorTask).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          checkAttempt: 1
        })
      );
    });
  });

  describe('Job Completion Tests', () => {
    test('test_mark_job_complete_aggregation', async () => {
      const jobStatus = {
        jobId: 'test-job',
        status: 'processing',
        currentGeneration: 2,
        generations: {
          generation_1: {
            variatorComplete: true,
            enricherComplete: true,
            rankerComplete: true,
            solutions: [
              { title: 'Gen1 Sol1', score: 90 },
              { title: 'Gen1 Sol2', score: 85 }
            ],
            topScore: 90,
            avgScore: 87.5
          },
          generation_2: {
            variatorComplete: true,
            enricherComplete: true,
            rankerComplete: true,
            solutions: [
              { title: 'Gen2 Sol1', score: 95 },
              { title: 'Gen2 Sol2', score: 80 }
            ],
            topScore: 95,
            avgScore: 87.5
          }
        },
        evolutionConfig: { generations: 2 }
      };
      
      resultStore.getJobStatus.mockResolvedValueOnce(jobStatus);
      
      await orchestrator.orchestrateJob({ jobId: 'test-job' });
      
      // Verify job completion was called
      expect(resultStore.completeJob).toHaveBeenCalledWith(
        'test-job',
        expect.objectContaining({
          topSolutions: expect.arrayContaining([
            expect.objectContaining({ title: 'Gen2 Sol1', score: 95 })
          ]),
          allSolutions: expect.any(Array),
          generationHistory: expect.any(Array),
          totalEvaluations: expect.any(Number),
          totalSolutions: 4
        })
      );
    });
    
    test('test_mark_job_complete_metadata', async () => {
      const evolutionConfig = {
        generations: 1,
        populationSize: 5,
        model: 'gpt-4o'
      };
      
      const jobStatus = {
        jobId: 'test-job',
        status: 'processing',
        currentGeneration: 1,
        problemContext: 'Test context',
        evolutionConfig,
        generations: {
          generation_1: {
            variatorComplete: true,
            enricherComplete: true,
            rankerComplete: true,
            solutions: [{ title: 'Sol1', score: 100 }],
            topScore: 100,
            avgScore: 100
          }
        }
      };
      
      resultStore.getJobStatus.mockResolvedValueOnce(jobStatus);
      
      await orchestrator.orchestrateJob({ jobId: 'test-job' });
      
      // Verify job completion was called
      expect(resultStore.completeJob).toHaveBeenCalledWith(
        'test-job',
        expect.objectContaining({
          topSolutions: expect.arrayContaining([
            expect.objectContaining({ title: 'Sol1', score: 100 })
          ]),
          allSolutions: expect.any(Array),
          generationHistory: expect.any(Array),
          totalEvaluations: 5, // 1 generation * 5 population size
          totalSolutions: 1
        })
      );
    });
  });

  describe('Error Recovery Tests', () => {
    test('test_worker_failure_detection', async () => {
      // Simulate a worker that started but never completed
      const jobData = { 
        jobId: 'test-job',
        checkAttempt: 20 // High attempt count suggests stuck
      };
      
      resultStore.getJobStatus.mockResolvedValueOnce({
        jobId: 'test-job',
        status: 'processing',
        generations: {
          generation_1: {
            variatorStarted: true,
            variatorStartedAt: new Date(Date.now() - 6 * 60 * 1000) // 6 min ago - triggers timeout
          }
        },
        evolutionConfig: { generations: 1 }
      });
      
      await orchestrator.orchestrateJob(jobData);
      
      // Should detect timeout and create retry task
      expect(taskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'variator',
          generation: 1
        })
      );
      
      // Should reset phase status
      expect(resultStore.updatePhaseStatus).toHaveBeenCalledWith(
        'test-job',
        1,
        'variator',
        'reset'
      );
    });
    
    test('test_graceful_error_handling', async () => {
      const jobData = { jobId: 'test-job' };
      
      // Simulate various errors
      resultStore.getJobStatus.mockRejectedValueOnce(
        new Error('Database connection failed')
      );
      
      await orchestrator.orchestrateJob(jobData);
      
      // Should re-queue for retry
      expect(taskHandler.createOrchestratorTask).toHaveBeenCalledWith(
        expect.objectContaining({
          checkAttempt: 1
        })
      );
    });
  });
});