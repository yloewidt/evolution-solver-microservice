import { jest } from '@jest/globals';
import OrchestratorService from '../src/services/orchestratorService.js';
import EvolutionarySolver from '../src/core/evolutionarySolver.js';
import EvolutionResultStore from '../cloud/firestore/resultStore.js';
import { Firestore } from '@google-cloud/firestore';
import { ResponseParser } from '../src/utils/responseParser.js';

// Test all the fixes we implemented
describe('Production Fixes - Comprehensive Tests', () => {
  
  describe('1. Worker Failure Detection', () => {
    let orchestrator;
    let mockResultStore;
    let mockTaskHandler;
    
    beforeEach(() => {
      mockResultStore = {
        getJobStatus: jest.fn(),
        updatePhaseStatus: jest.fn().mockResolvedValue({ reset: true })
      };
      
      mockTaskHandler = {
        createWorkerTask: jest.fn().mockResolvedValue({ taskName: 'test-task' }),
        createOrchestratorTask: jest.fn().mockResolvedValue({ taskName: 'orch-task' })
      };
      
      orchestrator = new OrchestratorService(mockResultStore, mockTaskHandler);
    });
    
    test('should detect variator timeout and retry', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      
      mockResultStore.getJobStatus.mockResolvedValueOnce({
        jobId: 'test-job',
        status: 'processing',
        generations: {
          generation_1: {
            variatorStarted: true,
            variatorStartedAt: fiveMinutesAgo,
            variatorComplete: false
          }
        },
        evolutionConfig: { generations: 3 }
      });
      
      const action = orchestrator.determineNextAction({
        jobId: 'test-job',
        status: 'processing',
        generations: {
          generation_1: {
            variatorStarted: true,
            variatorStartedAt: fiveMinutesAgo,
            variatorComplete: false
          }
        },
        evolutionConfig: { generations: 3 }
      });
      
      expect(action).toEqual({
        type: 'RETRY_TASK',
        task: {
          type: 'variator',
          generation: 1,
          reason: 'timeout'
        }
      });
    });
    
    test('should detect enricher timeout and retry', async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      
      const job = {
        jobId: 'test-job',
        status: 'processing',
        generations: {
          generation_2: {
            variatorComplete: true,
            enricherStarted: true,
            enricherStartedAt: tenMinutesAgo,
            enricherComplete: false
          }
        },
        currentGeneration: 2,
        evolutionConfig: { generations: 5 }
      };
      
      const action = orchestrator.determineNextAction(job);
      
      expect(action).toEqual({
        type: 'RETRY_TASK',
        task: {
          type: 'enricher',
          generation: 2,
          reason: 'timeout'
        }
      });
    });
    
    test('should handle RETRY_TASK action', async () => {
      const job = {
        jobId: 'test-job',
        status: 'processing',
        evolutionConfig: { generations: 5, populationSize: 10 },
        problemContext: 'Test problem context'
      };
      
      const action = {
        type: 'RETRY_TASK',
        task: {
          type: 'variator',
          generation: 3,
          reason: 'timeout'
        }
      };
      
      await orchestrator.executeAction('test-job', job, action, { checkAttempt: 5 });
      
      // Should reset phase status
      expect(mockResultStore.updatePhaseStatus).toHaveBeenCalledWith(
        'test-job',
        3,
        'variator',
        'reset'
      );
      
      // Should create new worker task - orchestrator builds task payload
      expect(mockTaskHandler.createWorkerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          type: 'variator',
          generation: 3,
          evolutionConfig: { generations: 5, populationSize: 10 },
          problemContext: 'Test problem context',
          topPerformers: []
        })
      );
      
      // Should re-queue orchestrator
      expect(mockTaskHandler.createOrchestratorTask).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          checkAttempt: 6
        })
      );
    });
    
    test('should handle Firestore timestamp formats', () => {
      // Test Firestore timestamp format - more than 5 minutes ago
      const firestoreTimestamp = {
        _seconds: Math.floor(Date.now() / 1000) - 360, // 6 minutes ago
        _nanoseconds: 0
      };
      
      const job = {
        jobId: 'test-job',
        status: 'processing',
        currentGeneration: 1,
        generations: {
          generation_1: {
            variatorComplete: true,
            enricherComplete: true,
            rankerStarted: true,
            rankerStartedAt: firestoreTimestamp,
            rankerComplete: false
          }
        },
        evolutionConfig: { generations: 1 }
      };
      
      const action = orchestrator.determineNextAction(job);
      
      expect(action.type).toBe('RETRY_TASK');
      expect(action.task.type).toBe('ranker');
    });
  });

  describe('2. Retry Logic for LLM Calls', () => {
    let solver;
    let mockLLMClient;
    let mockResultStore;
    
    beforeEach(() => {
      mockResultStore = {
        saveApiCall: jest.fn(),
        addApiCallTelemetry: jest.fn()
      };
      
      mockLLMClient = {
        client: {
          chat: {
            completions: {
              create: jest.fn()
            }
          }
        },
        getApiStyle: jest.fn().mockReturnValue('openai'),
        createVariatorRequest: jest.fn().mockResolvedValue({
          model: 'gpt-4o',
          messages: []
        }),
        createEnricherRequest: jest.fn().mockResolvedValue({
          model: 'gpt-4o',
          messages: []
        })
      };
      
      solver = new EvolutionarySolver(null, mockResultStore);
      solver.config = {
        ...solver.config,
        enableRetries: true,
        maxRetries: 3,
        retryDelay: 100
      };
      solver.llmClient = mockLLMClient;
    });
    
    test('should retry on rate limit error', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      
      mockLLMClient.client.chat.completions.create
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify([
                { idea_id: '1', title: 'Test Idea', description: 'Test', core_mechanism: 'Test mechanism' }
              ])
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        });
      
      const result = await solver.variator([], 1, 'Test problem', 1, 'test-job');
      
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Idea');
      expect(mockLLMClient.client.chat.completions.create).toHaveBeenCalledTimes(3);
    });
    
    test('should retry on timeout error', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ETIMEDOUT';
      
      mockLLMClient.client.chat.completions.create
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify([
                { idea_id: '1', title: 'Success', description: 'Got through', core_mechanism: 'Success mechanism' }
              ])
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        });
      
      const result = await solver.variator([], 1, 'Test', 1, 'job-1');
      
      expect(result[0].title).toBe('Success');
      expect(mockLLMClient.client.chat.completions.create).toHaveBeenCalledTimes(2);
    });
    
    test('should not retry on client errors', async () => {
      const clientError = new Error('Invalid request');
      clientError.status = 400;
      
      mockLLMClient.client.chat.completions.create
        .mockRejectedValueOnce(clientError);
      
      solver.config.enableRetries = true;
      
      await expect(
        solver.variator([], 1, 'Test', 1, 'job-1')
      ).rejects.toThrow('Invalid request');
      
      expect(mockLLMClient.client.chat.completions.create).toHaveBeenCalledTimes(1);
    });
    
    test('should apply exponential backoff', async () => {
      const error = new Error('Server error');
      error.status = 500;
      
      mockLLMClient.client.chat.completions.create
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify([
                { idea_id: '1', title: 'Test', description: 'Test', core_mechanism: 'Test mechanism' }
              ])
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        });
      
      const startTime = Date.now();
      await solver.variator([], 1, 'Test', 1, 'job-1');
      const duration = Date.now() - startTime;
      
      // Should have delays: 100ms + 200ms = 300ms minimum
      expect(duration).toBeGreaterThanOrEqual(300);
      expect(mockLLMClient.client.chat.completions.create).toHaveBeenCalledTimes(3);
    });
    
    test('should work without retries when disabled', async () => {
      solver.config.enableRetries = false;
      
      const error = new Error('Server error');
      error.status = 500;
      
      mockLLMClient.client.chat.completions.create
        .mockRejectedValueOnce(error);
      
      await expect(
        solver.variator([], 1, 'Test', 1, 'job-1')
      ).rejects.toThrow('Server error');
      
      expect(mockLLMClient.client.chat.completions.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Atomic Operations for Race Conditions', () => {
    let resultStore;
    let mockFirestore;
    let mockTransaction;
    let mockDocRef;
    
    beforeEach(() => {
      mockTransaction = {
        get: jest.fn(),
        update: jest.fn()
      };
      
      mockDocRef = {
        update: jest.fn()
      };
      
      mockFirestore = {
        runTransaction: jest.fn(async (callback) => {
          return await callback(mockTransaction);
        })
      };
      
      resultStore = new EvolutionResultStore();
      resultStore.firestore = mockFirestore;
      resultStore.getCollection = jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef)
      });
    });
    
    test('should prevent duplicate phase starts', async () => {
      // Simulate phase already started
      mockTransaction.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          generations: {
            generation_1: {
              variatorStarted: true,
              variatorStartedAt: new Date()
            }
          }
        })
      });
      
      const result = await resultStore.updatePhaseStatus(
        'job-1',
        1,
        'variator',
        'started'
      );
      
      expect(result).toEqual({ alreadyStarted: true });
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });
    
    test('should handle concurrent updates atomically', async () => {
      // Simulate fresh phase
      mockTransaction.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          generations: {}
        })
      });
      
      const result = await resultStore.updatePhaseStatus(
        'job-1',
        1,
        'enricher',
        'started'
      );
      
      expect(result).toEqual({ updated: true });
      expect(mockTransaction.update).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          'generations.generation_1.enricherStarted': true,
          currentGeneration: 1,
          currentPhase: 'enricher'
        })
      );
    });
    
    test('should reset phase status atomically', async () => {
      mockTransaction.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          generations: {
            generation_2: {
              rankerStarted: true,
              rankerStartedAt: new Date()
            }
          }
        })
      });
      
      const result = await resultStore.updatePhaseStatus(
        'job-1',
        2,
        'ranker',
        'reset'
      );
      
      expect(result).toEqual({ reset: true });
      expect(mockTransaction.update).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          'generations.generation_2.rankerStarted': false,
          'generations.generation_2.rankerComplete': false
        })
      );
    });
    
    test('should handle transaction failures', async () => {
      mockFirestore.runTransaction.mockRejectedValueOnce(
        new Error('Transaction failed')
      );
      
      await expect(
        resultStore.updatePhaseStatus('job-1', 1, 'variator', 'started')
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('4. Graceful Degradation', () => {
    let solver;
    let mockLLMClient;
    let mockResultStore;
    
    beforeEach(() => {
      mockResultStore = {
        saveApiCall: jest.fn(),
        addApiCallTelemetry: jest.fn()
      };
      
      mockLLMClient = {
        client: {
          chat: {
            completions: {
              create: jest.fn()
            }
          }
        },
        getApiStyle: jest.fn().mockReturnValue('openai'),
        createEnricherRequest: jest.fn().mockResolvedValue({
          model: 'gpt-4o',
          messages: []
        })
      };
      
      solver = new EvolutionarySolver(null, mockResultStore);
      solver.config = {
        ...solver.config,
        enableGracefulDegradation: true
      };
      solver.llmClient = mockLLMClient;
    });
    
    test('should use default values on enricher failure', async () => {
      mockLLMClient.client.chat.completions.create
        .mockRejectedValueOnce(new Error('API Error'));
      
      const ideas = [
        { idea_id: '1', title: 'Idea 1', description: 'Test idea 1' },
        { idea_id: '2', title: 'Idea 2', description: 'Test idea 2' }
      ];
      
      const result = await solver.enricher(ideas, 'Test context', 1, {}, 'job-1');
      
      expect(result).toHaveLength(2);
      
      result.forEach(idea => {
        expect(idea.business_case).toBeDefined();
        expect(idea.business_case.npv_success).toBe(5.0);
        expect(idea.business_case.capex_est).toBe(1.0);
        expect(idea.business_case.likelihood).toBe(0.5);
        expect(idea.business_case.risk_factors).toContain('Unable to analyze - using defaults');
        expect(idea.enrichment_note).toBe('Default values used due to enrichment failure');
      });
    });
    
    test('should pass ranker validation with default values', async () => {
      mockLLMClient.client.chat.completions.create
        .mockRejectedValueOnce(new Error('API Error'));
      
      const ideas = [
        { idea_id: '1', title: 'Test', description: 'Test' }
      ];
      
      solver.config.enableGracefulDegradation = true;
      
      const enriched = await solver.enricher(ideas, 'Context', 1, {}, 'job-1');
      
      // Verify can be passed to ranker without errors
      const result = await solver.ranker(enriched);
      
      // Ranker now returns object with rankedIdeas and filteredIdeas
      expect(result.rankedIdeas).toHaveLength(1);
      expect(result.rankedIdeas[0].score).toBeDefined();
      expect(result.rankedIdeas[0].score).toBeGreaterThan(0);
    });
    
    test('should fail without graceful degradation', async () => {
      solver.config.enableGracefulDegradation = false;
      
      mockLLMClient.client.chat.completions.create
        .mockRejectedValueOnce(new Error('API Error'));
      
      const ideas = [{ idea_id: '1', title: 'Test', description: 'Test' }];
      
      await expect(
        solver.enricher(ideas, 'Context', 1, {}, 'job-1')
      ).rejects.toThrow('API Error');
    });
  });

  describe('5. Integration Test - All Fixes Together', () => {
    test('should handle complete failure recovery scenario', async () => {
      // Set up services with all fixes enabled
      const mockResultStore = {
        getJobStatus: jest.fn(),
        updatePhaseStatus: jest.fn().mockResolvedValue({ reset: true }),
        saveApiCall: jest.fn(),
        addApiCallTelemetry: jest.fn()
      };
      
      const mockTaskHandler = {
        createWorkerTask: jest.fn().mockResolvedValue({ taskName: 'test-task' }),
        createOrchestratorTask: jest.fn().mockResolvedValue({ taskName: 'orch-task' })
      };
      
      const orchestrator = new OrchestratorService(mockResultStore, mockTaskHandler);
      
      // Simulate timeout scenario
      const timeoutJob = {
        jobId: 'recovery-test',
        status: 'processing',
        generations: {
          generation_1: {
            variatorStarted: true,
            variatorStartedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
            variatorComplete: false
          }
        },
        evolutionConfig: { generations: 3 }
      };
      
      mockResultStore.getJobStatus.mockResolvedValue(timeoutJob);
      
      // Orchestrator should detect timeout
      const action = orchestrator.determineNextAction(timeoutJob);
      expect(action.type).toBe('RETRY_TASK');
      
      // Execute retry
      await orchestrator.executeAction('recovery-test', timeoutJob, action, { checkAttempt: 1 });
      
      // Verify recovery actions
      expect(mockResultStore.updatePhaseStatus).toHaveBeenCalledWith(
        'recovery-test',
        1,
        'variator',
        'reset'
      );
      expect(mockTaskHandler.createWorkerTask).toHaveBeenCalled();
    });
  });
});