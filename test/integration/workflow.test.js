import { jest } from '@jest/globals';

// Mock dependencies
const mockResultStore = {
  getJobStatus: jest.fn(),
  savePhaseResults: jest.fn(),
  updatePhaseStatus: jest.fn(),
  updateJobStatus: jest.fn()
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

// Mock solver methods
const mockVariator = jest.fn();
const mockEnricher = jest.fn();
const mockRanker = jest.fn();
const mockFormatEnrichedData = jest.fn();

// Mock modules
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: mockLogger
}));

jest.unstable_mockModule('../../src/core/evolutionarySolver.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    config: {},
    currentGeneration: 1,
    progressTracker: null,
    variator: mockVariator,
    enricher: mockEnricher,
    ranker: mockRanker,
    formatEnrichedData: mockFormatEnrichedData
  }))
}));

// Import after mocking
const { processVariator, processEnricher, processRanker } = await import('../../cloud/run/workerHandlers.js');

describe('Worker Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processVariator', () => {
    const baseTaskData = {
      jobId: 'test-job',
      generation: 1,
      evolutionConfig: {
        populationSize: 20,
        generations: 10
      },
      problemContext: 'Test problem',
      topPerformers: []
    };

    it('should skip if variator already complete', async () => {
      const job = {
        generations: {
          generation_1: {
            variatorComplete: true
          }
        }
      };
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);

      const result = await processVariator(baseTaskData, mockResultStore);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Already complete');
      expect(mockVariator).not.toHaveBeenCalled();
    });

    it('should generate ideas and save results', async () => {
      const job = {
        generations: {
          generation_1: {
            variatorComplete: false
          }
        }
      };
      const ideas = [
        { idea_id: '1', description: 'Idea 1' },
        { idea_id: '2', description: 'Idea 2' }
      ];
      
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);
      mockVariator.mockResolvedValueOnce(ideas);

      const result = await processVariator(baseTaskData, mockResultStore);

      expect(mockVariator).toHaveBeenCalledWith(
        baseTaskData.topPerformers,
        baseTaskData.evolutionConfig.populationSize,
        baseTaskData.problemContext
      );
      
      expect(mockResultStore.savePhaseResults).toHaveBeenCalledWith(
        'test-job',
        1,
        'variator',
        expect.objectContaining({
          ideas,
          variatorComplete: true
        })
      );
      
      expect(result.success).toBe(true);
      expect(result.ideasCount).toBe(2);
    });

    it('should handle empty generation data', async () => {
      const job = { generations: {} };
      const ideas = [{ idea_id: '1' }];
      
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);
      mockVariator.mockResolvedValueOnce(ideas);

      const result = await processVariator(baseTaskData, mockResultStore);

      expect(result.success).toBe(true);
      expect(mockVariator).toHaveBeenCalled();
    });

    it('should handle variator errors', async () => {
      const job = { generations: {} };
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);
      mockVariator.mockRejectedValueOnce(new Error('Variator failed'));

      await expect(processVariator(baseTaskData, mockResultStore))
        .rejects.toThrow('Variator failed');

      expect(mockResultStore.savePhaseResults).toHaveBeenCalledWith(
        'test-job', 1, 'variator', 
        expect.objectContaining({
          variatorError: 'Variator failed',
          variatorFailedAt: expect.any(Date)
        })
      );
    });
  });

  describe('processEnricher', () => {
    const baseTaskData = {
      jobId: 'test-job',
      generation: 1,
      evolutionConfig: {
        populationSize: 20
      },
      ideas: [
        { idea_id: '1', description: 'Idea 1' },
        { idea_id: '2', description: 'Idea 2' }
      ]
    };

    it('should skip if enricher already complete', async () => {
      const job = {
        generations: {
          generation_1: {
            enricherComplete: true
          }
        }
      };
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);

      const result = await processEnricher(baseTaskData, mockResultStore);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Already complete');
      expect(mockEnricher).not.toHaveBeenCalled();
    });

    it('should enrich ideas and save results', async () => {
      const job = {
        generations: {
          generation_1: {
            enricherComplete: false
          }
        }
      };
      const enrichedIdeas = [
        {
          idea_id: '1',
          description: 'Idea 1',
          business_case: {
            npv_success: 5.0,
            capex_est: 0.5
          }
        },
        {
          idea_id: '2',
          description: 'Idea 2',
          business_case: {
            npv_success: 3.0,
            capex_est: 0.3
          }
        }
      ];
      
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);
      mockEnricher.mockResolvedValueOnce(enrichedIdeas);
      mockFormatEnrichedData.mockResolvedValueOnce(enrichedIdeas);

      const result = await processEnricher(baseTaskData, mockResultStore);

      expect(mockEnricher).toHaveBeenCalledWith(
        baseTaskData.ideas,
        baseTaskData.problemContext,
        baseTaskData.generation,
        baseTaskData.evolutionConfig,
        baseTaskData.jobId
      );
      
      expect(mockResultStore.savePhaseResults).toHaveBeenCalledWith(
        'test-job',
        1,
        'enricher',
        expect.objectContaining({
          enrichedIdeas,
          enricherComplete: true
        })
      );
      
      expect(result.success).toBe(true);
      expect(result.ideasCount).toBe(2);
    });

    it('should handle missing ideas gracefully', async () => {
      const job = { generations: {} };
      const taskDataNoIdeas = { ...baseTaskData, ideas: undefined };
      
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);

      await expect(processEnricher(taskDataNoIdeas, mockResultStore))
        .rejects.toThrow('No ideas provided for enrichment');

      expect(mockEnricher).not.toHaveBeenCalled();
    });

    it('should handle enricher errors', async () => {
      const job = { generations: {} };
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);
      mockEnricher.mockRejectedValueOnce(new Error('Enricher failed'));
      mockFormatEnrichedData.mockResolvedValueOnce([]);

      await expect(processEnricher(baseTaskData, mockResultStore))
        .rejects.toThrow('Enricher parsing failed: Enricher failed');

      expect(mockResultStore.savePhaseResults).toHaveBeenCalledWith(
        'test-job', 1, 'enricher', 
        expect.objectContaining({
          enricherError: 'Enricher failed',
          enricherParseFailure: true
        })
      );
    });
  });

  describe('processRanker', () => {
    const baseTaskData = {
      jobId: 'test-job',
      generation: 1,
      evolutionConfig: {
        topSelectCount: 5
      },
      enrichedIdeas: [
        {
          idea_id: '1',
          description: 'Idea 1',
          business_case: { npv_success: 5.0, capex_est: 0.5 }
        },
        {
          idea_id: '2',
          description: 'Idea 2',
          business_case: { npv_success: 3.0, capex_est: 0.3 }
        }
      ]
    };

    it('should skip if ranker already complete', async () => {
      const job = {
        generations: {
          generation_1: {
            rankerComplete: true
          }
        }
      };
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);

      const result = await processRanker(baseTaskData, mockResultStore);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Already complete');
      expect(mockRanker).not.toHaveBeenCalled();
    });

    it('should rank solutions and save results', async () => {
      const job = {
        generations: {
          generation_1: {
            rankerComplete: false
          }
        }
      };
      const rankerResult = {
        rankedIdeas: [
          { idea_id: '1', score: 10, rank: 1 },
          { idea_id: '2', score: 8, rank: 2 }
        ],
        filteredIdeas: []
      };
      
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);
      mockRanker.mockResolvedValueOnce(rankerResult);

      const result = await processRanker(baseTaskData, mockResultStore);

      expect(mockRanker).toHaveBeenCalledWith(baseTaskData.enrichedIdeas);
      
      expect(mockResultStore.savePhaseResults).toHaveBeenCalledWith(
        'test-job',
        1,
        'ranker',
        expect.objectContaining({
          solutions: [...rankerResult.rankedIdeas, ...rankerResult.filteredIdeas],
          rankedIdeas: rankerResult.rankedIdeas,
          filteredIdeas: rankerResult.filteredIdeas,
          rankerComplete: true,
          topPerformers: rankerResult.rankedIdeas.slice(0, 5),
          topScore: 10,
          avgScore: 9,
          generationComplete: true
        })
      );
      
      expect(result.success).toBe(true);
      expect(result.rankedCount).toBe(2);
      expect(result.topScore).toBe(10);
    });

    it('should handle last generation differently', async () => {
      const job = {
        generations: {
          generation_10: {
            rankerComplete: false
          }
        }
      };
      const taskData = { 
        ...baseTaskData, 
        generation: 10,
        evolutionConfig: { ...baseTaskData.evolutionConfig, generations: 10 }
      };
      const rankerResult = {
        rankedIdeas: [{ idea_id: '1', score: 10, rank: 1 }],
        filteredIdeas: []
      };
      
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);
      mockRanker.mockResolvedValueOnce(rankerResult);

      const result = await processRanker(taskData, mockResultStore);

      // The actual implementation doesn't update job status for last generation
      // It just marks the generation as complete
      expect(mockResultStore.savePhaseResults).toHaveBeenCalled();
      // Check that the result contains expected values
      expect(result.success).toBe(true);
      expect(result.rankedCount).toBe(1);
      expect(result.topScore).toBe(10);
    });

    it('should handle ranker errors', async () => {
      const job = { generations: {} };
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);
      mockRanker.mockRejectedValueOnce(new Error('Ranker failed'));

      await expect(processRanker(baseTaskData, mockResultStore))
        .rejects.toThrow('Ranker failed');

      expect(mockResultStore.savePhaseResults).toHaveBeenCalledWith(
        'test-job', 1, 'ranker', 
        expect.objectContaining({
          rankerError: 'Ranker failed',
          rankerFailedAt: expect.any(Date)
        })
      );
    });

    it('should handle missing solutions gracefully', async () => {
      const job = { generations: {} };
      const taskDataNoSolutions = { ...baseTaskData, enrichedIdeas: undefined };
      
      mockResultStore.getJobStatus.mockResolvedValueOnce(job);

      await expect(processRanker(taskDataNoSolutions, mockResultStore))
        .rejects.toThrow('No enriched ideas provided for ranking');

      expect(mockRanker).not.toHaveBeenCalled();
    });
  });
});