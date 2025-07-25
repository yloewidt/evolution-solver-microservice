import { jest } from '@jest/globals';
import { TestResultStore, MockResultStore } from './testResultStore.js';

/**
 * Common mock implementations for testing
 */

// Mock logger for all tests
export const createMockLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
});

// Mock LLM Client
export const createMockLLMClient = () => ({
  client: {
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  },
  createVariatorRequest: jest.fn().mockResolvedValue({
    model: 'test-model',
    messages: []
  }),
  getApiStyle: jest.fn().mockReturnValue('openai')
});

// Mock Task Handler
export const createMockTaskHandler = () => ({
  createEvolutionTask: jest.fn().mockResolvedValue({
    taskName: 'test-task',
    status: 'queued'
  }),
  createOrchestratorTask: jest.fn().mockResolvedValue({
    jobId: 'test-job',
    taskName: 'test-task',
    status: 'queued'
  }),
  createWorkerTask: jest.fn().mockResolvedValue({
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
});

// Mock Firestore components
export const createMockFirestore = () => {
  const mockServerTimestamp = { _seconds: 1234567890 };
  const mockFieldValue = {
    serverTimestamp: jest.fn().mockReturnValue(mockServerTimestamp),
    arrayUnion: jest.fn((value) => value),
    delete: jest.fn().mockReturnValue(null)
  };

  const mockDoc = {
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  };

  const mockQuery = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn()
  };

  const mockCollection = {
    doc: jest.fn().mockReturnValue(mockDoc),
    where: jest.fn().mockReturnValue(mockQuery),
    get: jest.fn(),
    limit: jest.fn().mockReturnValue(mockQuery)
  };

  const mockBatch = {
    set: jest.fn(),
    update: jest.fn(),
    commit: jest.fn()
  };

  const mockTransaction = {
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn()
  };

  const mockFirestore = {
    collection: jest.fn().mockReturnValue(mockCollection),
    batch: jest.fn().mockReturnValue(mockBatch),
    runTransaction: jest.fn((callback) => callback(mockTransaction)),
    FieldValue: mockFieldValue
  };

  return {
    mockFirestore,
    mockCollection,
    mockDoc,
    mockQuery,
    mockBatch,
    mockTransaction,
    mockFieldValue,
    mockServerTimestamp
  };
};

// Common test data
export const createTestJob = (overrides = {}) => ({
  jobId: 'test-job-123',
  problemContext: 'Test problem context',
  status: 'pending',
  userId: 'test-user',
  sessionId: 'test-session',
  evolutionConfig: {
    generations: 5,
    populationSize: 3,
    model: 'test-model',
    maxCapex: 10,
    minProfits: 1,
    topPerformerRatio: 0.3,
    offspringRatio: 0.7,
    diversificationFactor: 0.05
  },
  generations: {},
  apiCalls: [],
  createdAt: new Date(),
  ...overrides
});

export const createTestIdea = (overrides = {}) => ({
  idea_id: `idea-${Math.random().toString(36).substr(2, 9)}`,
  title: 'Test Business Idea',
  description: 'A test business idea description',
  core_mechanism: 'Test mechanism for value creation',
  is_offspring: false,
  ...overrides
});

export const createTestEnrichedIdea = (overrides = {}) => ({
  ...createTestIdea(),
  business_case: {
    npv_success: 5.0,
    capex_est: 1.0,
    likelihood: 0.7,
    timeframe: '2-3 years',
    risks: ['Market risk', 'Execution risk'],
    advantages: ['First mover', 'Strong partnerships']
  },
  score: 0,
  rank: 0,
  ...overrides
});

// Test utilities
export const waitForAsync = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

export const expectApiCall = (mockFn, expectedParams) => {
  expect(mockFn).toHaveBeenCalledWith(
    expect.objectContaining(expectedParams)
  );
};

// Export the store implementations
export { TestResultStore, MockResultStore };