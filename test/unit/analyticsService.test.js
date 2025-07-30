import { jest } from '@jest/globals';

// Mock dependencies
const mockResultStore = {
  getResult: jest.fn()
};

// Import after mocking
import logger from '../../src/utils/logger.js';
const AnalyticsService = (await import('../../src/services/analyticsService.js')).default;

describe('AnalyticsService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService(mockResultStore);
  });

  describe('getJobAnalytics', () => {
    const baseResult = {
      jobId: 'test-job-123',
      status: 'completed',
      problemContext: 'Test problem context',
      evolutionConfig: {
        generations: 5,
        populationSize: 20
      },
      createdAt: new Date('2024-01-01T10:00:00Z'),
      updatedAt: new Date('2024-01-01T10:30:00Z'),
      completedAt: new Date('2024-01-01T11:00:00Z'),
      progress: { percent: 100 },
      currentGeneration: 5,
      generations: {
        generation_1: {
          generation: 1,
          solutionCount: 20,
          topScore: 8.5,
          avgScore: 6.2,
          completedAt: { _seconds: 1704104400 }, // 2024-01-01T10:20:00Z
          solutions: [
            {
              idea_id: 'idea-1',
              score: 8.5,
              description: 'Solution 1',
              business_case: {
                roi_proj: 12.5,
                capex_est: 0.5,
                likelihood: 0.75
              }
            },
            {
              idea_id: 'idea-2',
              score: 6.0,
              description: 'Solution 2',
              business_case: {
                roi_proj: 8.0,
                capex_est: 0.3,
                likelihood: 0.6
              }
            }
          ]
        },
        generation_2: {
          generation: 2,
          solutionCount: 15,
          topScore: 9.2,
          avgScore: 7.1,
          completedAt: { _seconds: 1704105600 }, // 2024-01-01T10:40:00Z
          solutions: [
            {
              idea_id: 'idea-3',
              score: 9.2,
              description: 'Solution 3',
              business_case: {
                roi_proj: 15.0,
                capex_est: 0.8,
                likelihood: 0.8
              }
            }
          ]
        }
      },
      apiCalls: [
        {
          phase: 'variator',
          generation: 1,
          model: 'o3-mini',
          attempt: 1,
          tokens: {
            prompt_tokens: 1000,
            completion_tokens: 500,
            reasoning_tokens: 200,
            cached_tokens: 100
          }
        },
        {
          phase: 'enricher',
          generation: 1,
          model: 'o3-mini',
          attempt: 1,
          tokens: {
            input_tokens: 1500,
            output_tokens: 800,
            reasoning_tokens: 300
          }
        },
        {
          phase: 'variator',
          generation: 2,
          model: 'o3-mini',
          attempt: 2, // Retry
          tokens: {
            prompt_tokens: 1200,
            completion_tokens: 600
          }
        }
      ]
    };

    it('should return analytics for completed job', async () => {
      mockResultStore.getResult.mockResolvedValueOnce(baseResult);

      const analytics = await service.getJobAnalytics('test-job-123');

      expect(mockResultStore.getResult).toHaveBeenCalledWith('test-job-123');
      expect(analytics).toMatchObject({
        jobId: 'test-job-123',
        status: 'completed',
        problemContext: 'Test problem context',
        timing: {
          elapsedMinutes: 60, // 1 hour
          averageGenerationTime: expect.any(Number)
        },
        generationAnalytics: expect.arrayContaining([
          expect.objectContaining({
            generation: 1,
            solutionCount: 20,
            topScore: 8.5,
            avgScore: 6.2
          }),
          expect.objectContaining({
            generation: 2,
            solutionCount: 15,
            topScore: 9.2,
            avgScore: 7.1
          })
        ]),
        o3Calls: {
          actual: 3,
          breakdown: {
            variator: 2,
            enricher: 1,
            ranker: 0
          }
        },
        tokenUsage: {
          total: {
            input: 3700, // 1000 + 1500 + 1200
            output: 1900, // 500 + 800 + 600
            reasoning: 500, // 200 + 300
            cached: 100
          },
          byModel: {
            'o3-mini': {
              input: 3700,
              output: 1900,
              reasoning: 500,
              cached: 100
            }
          }
        },
        retries: {
          count: 1,
          failedCalls: expect.arrayContaining([
            expect.objectContaining({
              phase: 'variator',
              generation: 2,
              attempt: 2
            })
          ])
        },
        solutions: {
          topScores: expect.arrayContaining([
            expect.objectContaining({
              ideaId: 'idea-3',
              score: 9.2
            })
          ]),
          overallAverageScore: 6.65 // (6.2 + 7.1) / 2
        }
      });
    });

    it('should return null for non-existent job', async () => {
      mockResultStore.getResult.mockResolvedValueOnce(null);

      const analytics = await service.getJobAnalytics('non-existent');

      expect(analytics).toBeNull();
    });

    it('should handle job without completedAt', async () => {
      const inProgressResult = {
        ...baseResult,
        completedAt: null,
        status: 'processing'
      };
      mockResultStore.getResult.mockResolvedValueOnce(inProgressResult);

      const analytics = await service.getJobAnalytics('test-job-123');

      expect(analytics.timing.elapsedMinutes).toBeGreaterThan(0);
    });

    it('should handle job without generations data', async () => {
      const noGenResult = {
        ...baseResult,
        generations: null
      };
      mockResultStore.getResult.mockResolvedValueOnce(noGenResult);

      const analytics = await service.getJobAnalytics('test-job-123');

      expect(analytics.generationAnalytics).toEqual([]);
      expect(analytics.solutions.all).toEqual([]);
    });

    it('should handle job without API call telemetry', async () => {
      const noTelemetryResult = {
        ...baseResult,
        apiCalls: null
      };
      mockResultStore.getResult.mockResolvedValueOnce(noTelemetryResult);

      const analytics = await service.getJobAnalytics('test-job-123');

      // Should fall back to estimates
      expect(analytics.o3Calls.actual).toBe(4); // 2 generations * (variator + enricher)
      expect(analytics.o3Calls.breakdown.variator).toBe(2);
      expect(analytics.o3Calls.breakdown.enricher).toBe(2);
    });

    it('should handle empty apiCalls array', async () => {
      const emptyApiCallsResult = {
        ...baseResult,
        apiCalls: []
      };
      mockResultStore.getResult.mockResolvedValueOnce(emptyApiCallsResult);

      const analytics = await service.getJobAnalytics('test-job-123');

      expect(analytics.o3Calls.actual).toBe(0);
      expect(analytics.tokenUsage.total.input).toBe(0);
    });

    it('should handle generation without solutions', async () => {
      const noSolutionsResult = {
        ...baseResult,
        generations: {
          generation_1: {
            generation: 1,
            solutionCount: 0,
            topScore: 0,
            avgScore: 0,
            completedAt: { _seconds: 1704105600 },
            solutions: null
          }
        }
      };
      mockResultStore.getResult.mockResolvedValueOnce(noSolutionsResult);

      const analytics = await service.getJobAnalytics('test-job-123');

      expect(analytics.solutions.all).toEqual([]);
      expect(analytics.solutions.topScores).toEqual([]);
    });

    it('should handle API calls with missing token data', async () => {
      const missingTokensResult = {
        ...baseResult,
        apiCalls: [
          {
            phase: 'variator',
            generation: 1,
            model: 'o3-mini',
            attempt: 1
            // No tokens field
          },
          {
            phase: 'enricher',
            generation: 1,
            model: 'o3-mini',
            attempt: 1,
            tokens: {} // Empty tokens
          }
        ]
      };
      mockResultStore.getResult.mockResolvedValueOnce(missingTokensResult);

      const analytics = await service.getJobAnalytics('test-job-123');

      expect(analytics.tokenUsage.total.input).toBe(0);
      expect(analytics.tokenUsage.total.output).toBe(0);
      expect(analytics.o3Calls.actual).toBe(2);
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database error');
      mockResultStore.getResult.mockRejectedValueOnce(error);

      await expect(service.getJobAnalytics('test-job-123')).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('Error calculating job analytics:', error);
    });

    it('should calculate generation timing correctly', async () => {
      mockResultStore.getResult.mockResolvedValueOnce(baseResult);

      const analytics = await service.getJobAnalytics('test-job-123');

      expect(analytics.timing.generationTimes).toHaveLength(2);
      expect(analytics.timing.generationTimes[0]).toMatchObject({
        generation: 1,
        durationMinutes: 20 // createdAt (10:00) to gen1 (10:20)
      });
      expect(analytics.timing.generationTimes[1]).toMatchObject({
        generation: 2,
        durationMinutes: 20 // gen1 (10:20) to gen2 (10:40)
      });
      expect(analytics.timing.averageGenerationTime).toBe(20);
    });

    it('should sort solutions by score', async () => {
      mockResultStore.getResult.mockResolvedValueOnce(baseResult);

      const analytics = await service.getJobAnalytics('test-job-123');

      expect(analytics.solutions.all[0].score).toBe(9.2);
      expect(analytics.solutions.all[1].score).toBe(8.5);
      expect(analytics.solutions.all[2].score).toBe(6.0);
      expect(analytics.solutions.topScores).toHaveLength(3); // Only 3 solutions total
    });

    it('should handle different token field names', async () => {
      const mixedTokenFormatResult = {
        ...baseResult,
        apiCalls: [
          {
            phase: 'variator',
            tokens: {
              prompt_tokens: 1000,
              completion_tokens: 500
            }
          },
          {
            phase: 'enricher',
            tokens: {
              input_tokens: 800,
              output_tokens: 400
            }
          }
        ]
      };
      mockResultStore.getResult.mockResolvedValueOnce(mixedTokenFormatResult);

      const analytics = await service.getJobAnalytics('test-job-123');

      expect(analytics.tokenUsage.total.input).toBe(1800); // 1000 + 800
      expect(analytics.tokenUsage.total.output).toBe(900); // 500 + 400
    });

    it('should track token usage by phase', async () => {
      mockResultStore.getResult.mockResolvedValueOnce(baseResult);

      const analytics = await service.getJobAnalytics('test-job-123');

      expect(analytics.tokenUsage.byPhase.variator).toMatchObject({
        input: 2200, // 1000 + 1200
        output: 1100, // 500 + 600
        reasoning: 200,
        cached: 100
      });
      expect(analytics.tokenUsage.byPhase.enricher).toMatchObject({
        input: 1500,
        output: 800,
        reasoning: 300,
        cached: 0
      });
    });

    it('should handle unknown phase in breakdown', async () => {
      const unknownPhaseResult = {
        ...baseResult,
        apiCalls: [
          {
            phase: 'unknown-phase',
            tokens: { prompt_tokens: 100 }
          }
        ]
      };
      mockResultStore.getResult.mockResolvedValueOnce(unknownPhaseResult);

      const analytics = await service.getJobAnalytics('test-job-123');

      expect(analytics.o3Calls.breakdown.unknown).toBeUndefined();
      expect(analytics.tokenUsage.total.input).toBe(100);
    });
  });

  describe('processGenerationData', () => {
    it('should process multiple generations correctly', () => {
      const analytics = {
        generationAnalytics: [],
        solutions: {
          all: [],
          topScores: [],
          averageScoreByGeneration: {},
          overallAverageScore: 0
        }
      };

      const generations = {
        generation_1: {
          generation: 1,
          solutionCount: 10,
          topScore: 8.0,
          avgScore: 6.0,
          completedAt: new Date(),
          solutions: [
            { idea_id: '1', score: 8.0, description: 'Test' }
          ]
        }
      };

      service.processGenerationData(generations, analytics);

      expect(analytics.generationAnalytics).toHaveLength(1);
      expect(analytics.solutions.all).toHaveLength(1);
      expect(analytics.solutions.overallAverageScore).toBe(6.0);
    });
  });

  describe('processApiCallTelemetry', () => {
    it('should aggregate token usage correctly', () => {
      const analytics = {
        o3Calls: {
          actual: 0,
          breakdown: { variator: 0, enricher: 0, ranker: 0 }
        },
        tokenUsage: {
          total: { input: 0, output: 0, reasoning: 0, cached: 0 },
          byModel: {},
          byPhase: {
            variator: { input: 0, output: 0, reasoning: 0, cached: 0 },
            enricher: { input: 0, output: 0, reasoning: 0, cached: 0 },
            ranker: { input: 0, output: 0, reasoning: 0, cached: 0 }
          }
        },
        retries: { count: 0, failedCalls: [] }
      };

      const apiCalls = [
        {
          phase: 'variator',
          model: 'o3-mini',
          attempt: 1,
          tokens: { prompt_tokens: 100, completion_tokens: 50 }
        }
      ];

      service.processApiCallTelemetry(apiCalls, analytics);

      expect(analytics.o3Calls.actual).toBe(1);
      expect(analytics.o3Calls.breakdown.variator).toBe(1);
      expect(analytics.tokenUsage.total.input).toBe(100);
      expect(analytics.tokenUsage.total.output).toBe(50);
    });
  });

  describe('estimateApiCalls', () => {
    it('should estimate calls based on generation count', () => {
      const analytics = {
        generationAnalytics: [{ generation: 1 }, { generation: 2 }],
        o3Calls: {
          actual: 0,
          breakdown: { variator: 0, enricher: 0, ranker: 0 }
        }
      };

      service.estimateApiCalls({}, analytics);

      expect(analytics.o3Calls.breakdown.variator).toBe(2);
      expect(analytics.o3Calls.breakdown.enricher).toBe(2);
      expect(analytics.o3Calls.actual).toBe(4);
    });
  });

  describe('calculateGenerationTiming', () => {
    it('should calculate timing for generations with completedAt', () => {
      const analytics = {
        generationAnalytics: [
          {
            generation: 1,
            completedAt: { _seconds: 1704104400 } // 2024-01-01T10:20:00Z = 20 minutes after 10:00:00Z
          }
        ],
        timing: {
          generationTimes: [],
          averageGenerationTime: null
        }
      };

      const createdAt = new Date('2024-01-01T10:00:00Z');

      service.calculateGenerationTiming(createdAt, analytics);

      expect(analytics.timing.generationTimes).toHaveLength(1);
      expect(analytics.timing.generationTimes[0].durationMinutes).toBeCloseTo(20, 1);
      expect(analytics.timing.averageGenerationTime).toBeCloseTo(20, 1);
    });

    it('should handle generations without completedAt', () => {
      const analytics = {
        generationAnalytics: [
          { generation: 1, completedAt: null }
        ],
        timing: {
          generationTimes: [],
          averageGenerationTime: null
        }
      };

      service.calculateGenerationTiming(new Date(), analytics);

      expect(analytics.timing.generationTimes).toHaveLength(0);
      expect(analytics.timing.averageGenerationTime).toBeNull();
    });
  });
});
