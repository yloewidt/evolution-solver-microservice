import { jest } from '@jest/globals';

// Mock Firestore
const mockServerTimestamp = { _seconds: 1234567890 };
const mockFieldValue = {
  serverTimestamp: jest.fn().mockReturnValue(mockServerTimestamp)
};

const mockDoc = {
  set: jest.fn(),
  get: jest.fn(),
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
  orderBy: jest.fn().mockReturnValue(mockQuery),
  limit: jest.fn().mockReturnValue(mockQuery),
  get: jest.fn()
};

const mockBatch = {
  delete: jest.fn(),
  commit: jest.fn()
};

const mockFirestore = {
  collection: jest.fn().mockReturnValue(mockCollection),
  batch: jest.fn().mockReturnValue(mockBatch)
};

// Create mock Firestore class
class MockFirestore {
  constructor() {
    this.collection = mockFirestore.collection;
    this.batch = mockFirestore.batch;
  }
}

// Add static property
MockFirestore.FieldValue = mockFieldValue;

// Mock modules
jest.unstable_mockModule('@google-cloud/firestore', () => ({
  Firestore: MockFirestore,
  FieldValue: mockFieldValue
}));

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Import after mocking
const { default: EvolutionResultStore } = await import('../cloud/firestore/resultStore.js');

describe('EvolutionResultStore', () => {
  let store;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Clear any environment variables that might affect tests
    delete process.env.FIRESTORE_COLLECTION;
    delete process.env.GCP_PROJECT_ID;
    delete process.env.FIRESTORE_DATABASE;
    store = new EvolutionResultStore();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      expect(store.firestore).toBeDefined();
      expect(store.collectionName).toBe('evolution-results');
    });

    it('should use environment variables when available', () => {
      process.env.GCP_PROJECT_ID = 'test-project';
      process.env.FIRESTORE_DATABASE = 'test-db';
      process.env.FIRESTORE_COLLECTION = 'test-collection';

      const customStore = new EvolutionResultStore();

      expect(customStore.collectionName).toBe('test-collection');
    });

    it('should handle local development with credentials', () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';
      delete process.env.K_SERVICE;

      const localStore = new EvolutionResultStore();

      expect(localStore.firestore).toBeDefined();
    });
  });

  describe('getCollection', () => {
    it('should return firestore collection', () => {
      const collection = store.getCollection();

      expect(mockFirestore.collection).toHaveBeenCalledWith('evolution-results');
      expect(collection).toBe(mockCollection);
    });
  });

  describe('saveResult', () => {
    const resultData = {
      jobId: 'test-job-123',
      status: 'completed',
      topSolutions: [],
      apiCalls: [{ id: 1 }],
      generations: { gen1: {} }
    };

    it('should save result successfully', async () => {
      const result = await store.saveResult(resultData);

      expect(mockCollection.doc).toHaveBeenCalledWith('test-job-123');
      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          ...resultData,
          createdAt: mockServerTimestamp,
          completedAt: mockServerTimestamp,
          updatedAt: mockServerTimestamp
        }),
        { merge: true }
      );
      expect(result).toBe('test-job-123');
    });

    it('should not set completedAt for non-completed status', async () => {
      const pendingData = { ...resultData, status: 'processing' };
      
      await store.saveResult(pendingData);

      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          completedAt: null
        }),
        { merge: true }
      );
    });

    it('should initialize empty arrays when missing', async () => {
      const minimalData = {
        jobId: 'test-job-124',
        status: 'pending'
      };

      await store.saveResult(minimalData);

      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          apiCalls: [],
          generations: {}
        }),
        { merge: true }
      );
    });

    it('should handle save errors', async () => {
      const error = new Error('Firestore error');
      mockDoc.set.mockRejectedValueOnce(error);

      await expect(store.saveResult(resultData)).rejects.toThrow('Firestore error');
    });
  });

  describe('getResult', () => {
    it('should get result by jobId', async () => {
      const mockData = {
        jobId: 'test-job-123',
        status: 'completed'
      };
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockData
      });

      const result = await store.getResult('test-job-123');

      expect(mockCollection.doc).toHaveBeenCalledWith('test-job-123');
      expect(result).toEqual(mockData);
    });

    it('should return null for non-existent document', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: false
      });

      const result = await store.getResult('non-existent');

      expect(result).toBeNull();
    });

    it('should handle get errors', async () => {
      const error = new Error('Firestore error');
      mockDoc.get.mockRejectedValueOnce(error);

      await expect(store.getResult('test-job')).rejects.toThrow('Firestore error');
    });
  });

  describe('getJobStatus', () => {
    it('should return job document', async () => {
      const mockJobData = {
        status: 'processing',
        createdAt: { toDate: () => new Date('2023-01-01') },
        updatedAt: { toDate: () => new Date('2023-01-02') },
        completedAt: null,
        generations: { gen1: {} },
        evolutionConfig: { generations: 5 },
        problemContext: 'test context',
        userId: 'user-123',
        sessionId: 'session-456',
        topSolutions: [{ id: 1 }],
        totalSolutions: 10,
        allSolutions: [{ id: 1 }, { id: 2 }],
        apiCalls: [{ phase: 'variator' }]
      };
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockJobData
      });

      const result = await store.getJobStatus('test-job-123');

      expect(result).toEqual({
        status: 'processing',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-02'),
        completedAt: null,
        error: undefined,
        progress: undefined,
        currentGeneration: undefined,
        generations: { gen1: {} },
        evolutionConfig: { generations: 5 },
        problemContext: 'test context',
        userId: 'user-123',
        sessionId: 'session-456',
        topSolutions: [{ id: 1 }],
        totalSolutions: 10,
        allSolutions: [{ id: 1 }, { id: 2 }],
        apiCalls: [{ phase: 'variator' }]
      });
    });

    it('should return null for non-existent job', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: false
      });

      const result = await store.getJobStatus('non-existent');

      expect(result).toBeNull();
    });

    it('should handle errors', async () => {
      const error = new Error('Get failed');
      mockDoc.get.mockRejectedValueOnce(error);

      await expect(store.getJobStatus('test-job')).rejects.toThrow('Get failed');
    });
  });

  describe('updateJobStatus', () => {
    it('should update job status to completed', async () => {
      await store.updateJobStatus('test-job-123', 'completed');

      expect(mockDoc.update).toHaveBeenCalledWith({
        status: 'completed',
        completedAt: mockServerTimestamp,
        updatedAt: mockServerTimestamp
      });
    });

    it('should update job status with error', async () => {
      await store.updateJobStatus('test-job-123', 'failed', 'Test error');

      expect(mockDoc.update).toHaveBeenCalledWith({
        status: 'failed',
        error: 'Test error',
        updatedAt: mockServerTimestamp
      });
    });

    it('should handle update errors', async () => {
      const error = new Error('Update failed');
      mockDoc.update.mockRejectedValueOnce(error);

      await expect(store.updateJobStatus('test-job', 'failed'))
        .rejects.toThrow('Update failed');
    });
  });

  describe('savePhaseResults', () => {
    it('should save variator phase results', async () => {
      const phaseData = {
        ideas: [{ id: 1 }],
        variatorComplete: true
      };

      await store.savePhaseResults('test-job', 1, 'variator', phaseData);

      expect(mockDoc.update).toHaveBeenCalledWith({
        'generations.generation_1.variatorComplete': true,
        'generations.generation_1.variatorCompletedAt': mockServerTimestamp,
        'generations.generation_1.ideas': [{ id: 1 }],
        'generations.generation_1.variatorComplete': true,
        updatedAt: mockServerTimestamp
      });
    });

    it('should save enricher phase results', async () => {
      const phaseData = {
        enrichedIdeas: [{ id: 1 }],
        enricherComplete: true
      };

      await store.savePhaseResults('test-job', 2, 'enricher', phaseData);

      expect(mockDoc.update).toHaveBeenCalledWith({
        'generations.generation_2.enricherComplete': true,
        'generations.generation_2.enricherCompletedAt': mockServerTimestamp,
        'generations.generation_2.enrichedIdeas': [{ id: 1 }],
        'generations.generation_2.enricherComplete': true,
        updatedAt: mockServerTimestamp
      });
    });
  });

  describe('updatePhaseStatus', () => {
    it('should update phase status to started', async () => {
      await store.updatePhaseStatus('test-job', 1, 'variator', 'started');

      expect(mockDoc.update).toHaveBeenCalledWith({
        'generations.generation_1.variatorStarted': true,
        'generations.generation_1.variatorStartedAt': mockServerTimestamp,
        currentGeneration: 1,
        currentPhase: 'variator',
        updatedAt: mockServerTimestamp
      });
    });

    it('should update phase status to failed', async () => {
      // The actual method doesn't handle 'failed' status differently
      // It just sets started to false for any non-'started' status
      await store.updatePhaseStatus('test-job', 2, 'enricher', 'failed');

      expect(mockDoc.update).toHaveBeenCalledWith({
        'generations.generation_2.enricherStarted': false,
        'generations.generation_2.enricherStartedAt': mockServerTimestamp,
        currentGeneration: 2,
        currentPhase: 'enricher',
        updatedAt: mockServerTimestamp
      });
    });
  });

  describe('completeJob', () => {
    it('should complete job with results', async () => {
      const finalResults = {
        topSolutions: [{ id: 1 }],
        allSolutions: [{ id: 1 }, { id: 2 }]
      };

      await store.completeJob('test-job', finalResults);

      expect(mockDoc.update).toHaveBeenCalledWith({
        ...finalResults,
        status: 'completed',
        completedAt: mockServerTimestamp,
        updatedAt: mockServerTimestamp
      });
    });
  });

  describe('getUserResults', () => {
    it('should get user results with limit', async () => {
      const mockResults = [
        { jobId: '1', userId: 'user-123' },
        { jobId: '2', userId: 'user-123' }
      ];
      mockQuery.get.mockResolvedValueOnce({
        forEach: (callback) => mockResults.forEach(data => 
          callback({
            id: data.jobId,
            data: () => data
          })
        )
      });

      const results = await store.getUserResults('user-123', 5);

      expect(mockCollection.where).toHaveBeenCalledWith('userId', '==', 'user-123');
      expect(mockQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(mockQuery.limit).toHaveBeenCalledWith(5);
      expect(results).toHaveLength(2);
    });
  });

  describe('getAllResults', () => {
    it('should get all results with default limit', async () => {
      const mockResults = [{ jobId: '1' }];
      mockQuery.get.mockResolvedValueOnce({
        forEach: (callback) => mockResults.forEach(data => 
          callback({
            id: data.jobId,
            data: () => data
          })
        )
      });

      const results = await store.getAllResults();

      expect(mockCollection.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(mockQuery.limit).toHaveBeenCalledWith(100);
      expect(results).toEqual([{ id: '1', jobId: '1' }]);
    });

    it('should get all results with custom limit', async () => {
      mockQuery.get.mockResolvedValueOnce({ forEach: () => {} });

      await store.getAllResults(50);

      expect(mockQuery.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('getRecentJobs', () => {
    it('should get recent jobs', async () => {
      const mockJobs = [
        { jobId: '1', status: 'completed' },
        { jobId: '2', status: 'processing' }
      ];
      mockQuery.get.mockResolvedValueOnce({
        forEach: (callback) => mockJobs.forEach((data, idx) => 
          callback({
            id: data.jobId,
            data: () => data
          })
        )
      });

      const results = await store.getRecentJobs(10);

      expect(mockCollection.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      expect(results[0]).toMatchObject({ jobId: '1', status: 'completed' });
      expect(results[1]).toMatchObject({ jobId: '2', status: 'processing' });
    });
  });

  describe('getJobsByStatus', () => {
    it('should get jobs by status', async () => {
      const mockJobs = [
        { jobId: '1', status: 'completed' }
      ];
      mockQuery.get.mockResolvedValueOnce({
        forEach: (callback) => mockJobs.forEach(data => 
          callback({
            id: data.jobId,
            data: () => data
          })
        )
      });

      const results = await store.getJobsByStatus('completed', 20);

      expect(mockCollection.where).toHaveBeenCalledWith('status', '==', 'completed');
      expect(mockQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(mockQuery.limit).toHaveBeenCalledWith(20);
      expect(results).toEqual(mockJobs);
    });
  });

  describe('deleteOldResults', () => {
    it('should delete old results', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);
      
      const mockOldDocs = [
        { id: 'old-1', ref: {} },
        { id: 'old-2', ref: {} }
      ];
      
      mockQuery.get.mockResolvedValueOnce({
        forEach: (callback) => mockOldDocs.forEach(callback)
      });

      const count = await store.deleteOldResults(30);

      expect(mockCollection.where).toHaveBeenCalledWith(
        'createdAt',
        '<',
        expect.any(Date)
      );
      expect(mockBatch.delete).toHaveBeenCalledTimes(2);
      expect(mockBatch.delete).toHaveBeenCalledWith(mockOldDocs[0].ref);
      expect(mockBatch.delete).toHaveBeenCalledWith(mockOldDocs[1].ref);
      expect(mockBatch.commit).toHaveBeenCalled();
      expect(count).toBe(2);
    });

    it('should handle no old results', async () => {
      mockQuery.get.mockResolvedValueOnce({
        forEach: (callback) => {} // No documents
      });

      const count = await store.deleteOldResults(30);

      expect(mockBatch.commit).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });

    it('should handle deletion errors', async () => {
      const error = new Error('Delete failed');
      mockQuery.get.mockRejectedValueOnce(error);

      await expect(store.deleteOldResults(30)).rejects.toThrow('Delete failed');
    });
  });

  describe('savePartialResult', () => {
    it('should save partial result for generation', async () => {
      const generationData = {
        topScore: 9.5,
        avgScore: 7.2,
        solutionCount: 20,
        solutions: [{ id: 1 }, { id: 2 }]
      };

      await store.savePartialResult('test-job', 3, generationData);

      expect(mockDoc.update).toHaveBeenCalledWith({
        'generations.generation_3': {
          generation: 3,
          topScore: 9.5,
          avgScore: 7.2,
          solutionCount: 20,
          solutions: [{ id: 1 }, { id: 2 }],
          completedAt: mockServerTimestamp
        },
        currentGeneration: 3,
        lastUpdateAt: mockServerTimestamp,
        updatedAt: mockServerTimestamp
      });
    });

    it('should handle partial result errors', async () => {
      const error = new Error('Update failed');
      mockDoc.update.mockRejectedValueOnce(error);

      await expect(store.savePartialResult('test-job', 1, {})).rejects.toThrow('Update failed');
    });
  });

  describe('updateGenerationProgress', () => {
    it('should update generation progress', async () => {
      await store.updateGenerationProgress('test-job', 5, 10, 'enriching');

      expect(mockDoc.update).toHaveBeenCalledWith({
        progress: {
          currentGeneration: 5,
          totalGenerations: 10,
          phase: 'enriching',
          percentComplete: 50,
          lastUpdateAt: mockServerTimestamp
        },
        updatedAt: mockServerTimestamp
      });
    });

    it('should handle progress update errors', async () => {
      const error = new Error('Update failed');
      mockDoc.update.mockRejectedValueOnce(error);

      await expect(store.updateGenerationProgress('test-job', 1, 10)).rejects.toThrow('Update failed');
    });
  });

  describe('addApiCallTelemetry', () => {
    it('should add API call telemetry', async () => {
      const telemetry = {
        phase: 'variator',
        model: 'o3-mini',
        duration: 1500,
        tokensUsed: 2000
      };

      // Mock Firestore.FieldValue.arrayUnion
      const arrayUnionMock = jest.fn().mockReturnValue({ _arrayUnion: [telemetry] });
      MockFirestore.FieldValue.arrayUnion = arrayUnionMock;

      await store.addApiCallTelemetry('test-job', telemetry);

      expect(arrayUnionMock).toHaveBeenCalledWith(telemetry);
      expect(mockDoc.update).toHaveBeenCalledWith({
        apiCalls: { _arrayUnion: [telemetry] },
        updatedAt: mockServerTimestamp
      });
    });

    it('should handle telemetry errors', async () => {
      const error = new Error('Update failed');
      mockDoc.update.mockRejectedValueOnce(error);

      await expect(store.addApiCallTelemetry('test-job', {})).rejects.toThrow('Update failed');
    });
  });

  describe('saveApiCallDebug', () => {
    const mockDebugDoc = {
      set: jest.fn()
    };

    const mockDebugCollection = {
      doc: jest.fn().mockReturnValue(mockDebugDoc)
    };

    beforeEach(() => {
      mockDoc.collection = jest.fn().mockReturnValue(mockDebugCollection);
    });

    it('should save API call debug data', async () => {
      const debugData = {
        prompt: 'test prompt',
        response: 'test response',
        model: 'o3-mini'
      };

      await store.saveApiCallDebug('test-job', 'call-123', debugData);

      expect(mockDoc.collection).toHaveBeenCalledWith('apiDebug');
      expect(mockDebugCollection.doc).toHaveBeenCalledWith('call-123');
      expect(mockDebugDoc.set).toHaveBeenCalledWith({
        ...debugData,
        createdAt: mockServerTimestamp
      });
    });

    it('should handle debug save errors gracefully', async () => {
      const error = new Error('Save failed');
      mockDebugDoc.set.mockRejectedValueOnce(error);

      const result = await store.saveApiCallDebug('test-job', 'call-123', {});
      
      expect(result).toBe(false);
    });
  });

});