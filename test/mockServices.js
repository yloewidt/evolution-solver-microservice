import { jest } from '@jest/globals';

// Create mock services for testing
export const createMockServices = () => {
  // Mock EvolutionService
  const mockEvolutionService = {
    processEvolutionJob: jest.fn().mockResolvedValue({
      jobId: 'test-job-id',
      status: 'completed'
    }),
    getJobStatus: jest.fn().mockResolvedValue({
      jobId: 'test-job-id',
      status: 'processing',
      progress: { currentGeneration: 1, totalGenerations: 3 }
    }),
    getResults: jest.fn().mockResolvedValue({
      jobId: 'test-job-id',
      topSolutions: []
    }),
    getUserResults: jest.fn().mockResolvedValue([]),
    getRecentJobs: jest.fn().mockResolvedValue([]),
    getAllResults: jest.fn().mockResolvedValue([]),
    getJobStats: jest.fn().mockResolvedValue({
      totalJobs: 0,
      completedJobs: 0
    }),
    validateProblemContext: jest.fn(),
    enrichContextWithBottleneck: jest.fn().mockReturnValue('enriched context'),
    getBottleneckSolutions: jest.fn().mockResolvedValue({ solutions: [] }),
    
    // Add resultStore
    resultStore: {
      saveResult: jest.fn().mockResolvedValue(),
      getJobStatus: jest.fn().mockResolvedValue(null),
      getResult: jest.fn().mockResolvedValue(null),
      updateJobStatus: jest.fn().mockResolvedValue(),
      getJobsByStatus: jest.fn().mockResolvedValue([]),
      getRecentJobs: jest.fn().mockResolvedValue([]),
      getAllResults: jest.fn().mockResolvedValue([])
    }
  };

  // Mock CloudTaskHandler
  const mockTaskHandler = {
    createEvolutionTask: jest.fn().mockResolvedValue({
      jobId: 'test-job-id',
      taskName: 'test-task',
      status: 'queued'
    }),
    listTasks: jest.fn().mockResolvedValue([]),
    getQueueStats: jest.fn().mockResolvedValue({
      name: 'test-queue',
      tasksCount: 0
    }),
    pauseQueue: jest.fn().mockResolvedValue(true),
    resumeQueue: jest.fn().mockResolvedValue(true),
    purgeQueue: jest.fn().mockResolvedValue(true)
  };

  // Mock LLMClient responses
  const mockLLMResponses = {
    variator: {
      ideas: [
        {
          idea_id: 'test-idea-1',
          title: 'Test Idea 1',
          description: 'Test description 1',
          core_mechanism: 'Test mechanism 1'
        },
        {
          idea_id: 'test-idea-2',
          title: 'Test Idea 2',
          description: 'Test description 2',
          core_mechanism: 'Test mechanism 2'
        }
      ]
    },
    enricher: {
      enriched_ideas: [
        {
          idea_id: 'test-idea-1',
          business_case: {
            npv_success: 10,
            capex_est: 1,
            timeline_months: 6,
            likelihood: 0.7,
            risk_factors: ['test risk'],
            yearly_cashflows: [1, 2, 3, 4, 5]
          }
        }
      ]
    }
  };

  return {
    mockEvolutionService,
    mockTaskHandler,
    mockLLMResponses
  };
};

// Mock OpenAI client creator
export const createMockOpenAIClient = (responses = {}) => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify(responses.variator || { ideas: [] })
            }
          }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 200
          }
        })
      }
    },
    responses: {
      create: jest.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(responses.enricher || { enriched_ideas: [] })
          }
        }],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 250
        }
      })
    }
  }));
};