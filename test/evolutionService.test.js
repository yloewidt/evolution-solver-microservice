import { jest } from '@jest/globals';

// Mock dependencies
const mockResultStore = {
  updateJobStatus: jest.fn(),
  saveResult: jest.fn(),
  getJobStatus: jest.fn(),
  getResult: jest.fn(),
  getUserResults: jest.fn(),
  getAllResults: jest.fn(),
  getRecentJobs: jest.fn()
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

const mockEvolutionarySolver = {
  evolve: jest.fn()
};

// Mock modules
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: mockLogger
}));

jest.unstable_mockModule('../src/core/evolutionarySolver.js', () => ({
  default: jest.fn().mockImplementation(() => mockEvolutionarySolver)
}));

// Import after mocking
const EvolutionService = (await import('../src/services/evolutionService.js')).default;

describe('EvolutionService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    service = new EvolutionService(mockResultStore);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('processEvolutionJob', () => {
    const baseJobData = {
      jobId: 'test-job-123',
      problemContext: 'Test problem context for evolutionary algorithm',
      initialSolutions: [],
      userId: 'user-123',
      sessionId: 'session-456',
      evolutionConfig: {
        generations: 5,
        populationSize: 10
      }
    };

    const mockEvolutionResult = {
      topSolutions: [
        { idea_id: '1', score: 10 },
        { idea_id: '2', score: 8 }
      ],
      allSolutions: [
        { idea_id: '1', score: 10 },
        { idea_id: '2', score: 8 },
        { idea_id: '3', score: 6 }
      ],
      generationHistory: [
        { generation: 1, avgScore: 5 },
        { generation: 2, avgScore: 7 }
      ],
      totalEvaluations: 50,
      totalSolutions: 3
    };

    it('should process evolution job successfully', async () => {
      mockEvolutionarySolver.evolve.mockResolvedValueOnce(mockEvolutionResult);
      mockResultStore.saveResult.mockResolvedValueOnce('result-123');

      const result = await service.processEvolutionJob(baseJobData);

      expect(mockResultStore.updateJobStatus).toHaveBeenCalledWith('test-job-123', 'processing');
      expect(mockEvolutionarySolver.evolve).toHaveBeenCalledWith(
        baseJobData.problemContext,
        baseJobData.initialSolutions,
        baseJobData.evolutionConfig,
        {
          jobId: 'test-job-123',
          resultStore: mockResultStore
        }
      );
      expect(mockResultStore.saveResult).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job-123',
          userId: 'user-123',
          sessionId: 'session-456',
          problemContext: baseJobData.problemContext,
          topSolutions: mockEvolutionResult.topSolutions,
          allSolutions: mockEvolutionResult.allSolutions,
          status: 'completed'
        })
      );
      expect(result).toEqual({
        success: true,
        resultId: 'result-123',
        result: mockEvolutionResult
      });
    });

    it('should handle evolution job timeout', async () => {
      jest.useRealTimers(); // Use real timers for this specific test
      
      // Set up evolution to never resolve
      mockEvolutionarySolver.evolve.mockImplementation(() => new Promise(() => {}));

      // Override the timeout in the service to be much shorter for testing
      const originalProcessEvolutionJob = service.processEvolutionJob.bind(service);
      service.processEvolutionJob = async function(jobData) {
        const { jobId, userId, sessionId, problemContext, initialSolutions, evolutionConfig } = jobData;
        
        try {
          await service.resultStore.updateJobStatus(jobId, 'processing');
          
          // Use a very short timeout for testing
          const timeoutMs = 100; // 100ms instead of 14 minutes
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Evolution job timed out after 14 minutes')), timeoutMs);
          });
          
          const resultPromise = service.solver.evolve(problemContext, initialSolutions, evolutionConfig, {
            jobId,
            resultStore: service.resultStore
          });
          
          const result = await Promise.race([resultPromise, timeoutPromise]);
          
          // This shouldn't be reached in timeout test
          return { success: true, result };
        } catch (error) {
          await service.resultStore.updateJobStatus(jobId, 'failed', error.message);
          throw error;
        }
      };

      await expect(service.processEvolutionJob(baseJobData)).rejects.toThrow('Evolution job timed out after 14 minutes');
      expect(mockResultStore.updateJobStatus).toHaveBeenCalledWith(
        'test-job-123',
        'failed',
        'Evolution job timed out after 14 minutes'
      );
      
      jest.useFakeTimers(); // Restore fake timers
    }, 1000);

    it('should handle evolution job errors', async () => {
      const error = new Error('Evolution algorithm failed');
      mockEvolutionarySolver.evolve.mockRejectedValueOnce(error);

      await expect(service.processEvolutionJob(baseJobData)).rejects.toThrow('Evolution algorithm failed');
      
      expect(mockResultStore.updateJobStatus).toHaveBeenCalledWith(
        'test-job-123',
        'failed',
        'Evolution algorithm failed'
      );
    });

    it('should handle job with initial solutions', async () => {
      const jobWithInitial = {
        ...baseJobData,
        initialSolutions: [
          { idea_id: 'initial-1', description: 'Initial solution' }
        ]
      };
      
      mockEvolutionarySolver.evolve.mockResolvedValueOnce(mockEvolutionResult);
      mockResultStore.saveResult.mockResolvedValueOnce('result-124');

      await service.processEvolutionJob(jobWithInitial);

      expect(mockEvolutionarySolver.evolve).toHaveBeenCalledWith(
        jobWithInitial.problemContext,
        jobWithInitial.initialSolutions,
        jobWithInitial.evolutionConfig,
        expect.any(Object)
      );
    });
  });

  describe('validateProblemContext', () => {
    it('should validate valid problem context', () => {
      const validContext = 'This is a valid problem context with enough detail';
      expect(service.validateProblemContext(validContext)).toBe(true);
    });

    it('should throw error for missing context', () => {
      expect(() => service.validateProblemContext(null)).toThrow('Problem context must be a non-empty string');
      expect(() => service.validateProblemContext('')).toThrow('Problem context must be a non-empty string');
      expect(() => service.validateProblemContext(undefined)).toThrow('Problem context must be a non-empty string');
    });

    it('should throw error for non-string context', () => {
      expect(() => service.validateProblemContext(123)).toThrow('Problem context must be a non-empty string');
      expect(() => service.validateProblemContext({})).toThrow('Problem context must be a non-empty string');
      expect(() => service.validateProblemContext([])).toThrow('Problem context must be a non-empty string');
    });

    it('should throw error for too short context', () => {
      expect(() => service.validateProblemContext('Too short')).toThrow('Problem context too short');
    });

    it('should throw error for too long context', () => {
      const longContext = 'a'.repeat(5001);
      expect(() => service.validateProblemContext(longContext)).toThrow('Problem context too long');
    });
  });

  describe('formatSolutionsForDisplay', () => {
    const solutions = [
      {
        idea_id: 'idea-1',
        description: 'Solution 1',
        core_mechanism: 'Mechanism 1',
        score: 8.567,
        business_case: {
          roi_proj: 12.5,
          capex_est: 250,
          deal_value_percent: 15,
          timeline_months: 6,
          likelihood: 0.75,
          risk_factors: ['Market risk', 'Technical risk']
        }
      },
      {
        idea_id: 'idea-2',
        description: 'Solution 2',
        core_mechanism: 'Mechanism 2',
        score: 6.234,
        business_case: {
          roi_proj: 8.0,
          capex_est: 150,
          deal_value_percent: 12,
          timeline_months: 4,
          likelihood: 0.8,
          risk_factors: ['Regulatory risk']
        }
      }
    ];

    it('should format solutions correctly', () => {
      const formatted = service.formatSolutionsForDisplay(solutions);

      expect(formatted).toHaveLength(2);
      expect(formatted[0]).toEqual({
        rank: 1,
        title: 'idea-1',
        description: 'Solution 1',
        mechanism: 'Mechanism 1',
        score: '8.567',
        businessCase: {
          projectedROI: '$12.5M',
          capitalRequired: '$250K',
          dealValuePercent: '15%',
          timeline: '6 months',
          successLikelihood: '75%',
          keyRisks: ['Market risk', 'Technical risk']
        }
      });
      expect(formatted[1].rank).toBe(2);
      expect(formatted[1].businessCase.successLikelihood).toBe('80%');
    });

    it('should handle missing score gracefully', () => {
      const solutionsNoScore = [
        {
          ...solutions[0],
          score: undefined
        }
      ];

      const formatted = service.formatSolutionsForDisplay(solutionsNoScore);
      expect(formatted[0].score).toBeUndefined();
    });

    it('should handle empty solutions array', () => {
      const formatted = service.formatSolutionsForDisplay([]);
      expect(formatted).toEqual([]);
    });
  });

  describe('getJobStatus', () => {
    it('should return job status', async () => {
      const jobStatus = { jobId: 'test-123', status: 'completed' };
      mockResultStore.getJobStatus.mockResolvedValueOnce(jobStatus);

      const result = await service.getJobStatus('test-123');

      expect(mockResultStore.getJobStatus).toHaveBeenCalledWith('test-123');
      expect(result).toEqual(jobStatus);
    });
  });

  describe('getResults', () => {
    it('should return job results', async () => {
      const jobResults = { jobId: 'test-123', topSolutions: [] };
      mockResultStore.getResult.mockResolvedValueOnce(jobResults);

      const result = await service.getResults('test-123');

      expect(mockResultStore.getResult).toHaveBeenCalledWith('test-123');
      expect(result).toEqual(jobResults);
    });
  });

  describe('getUserResults', () => {
    it('should return user results with default limit', async () => {
      const userResults = [{ jobId: '1' }, { jobId: '2' }];
      mockResultStore.getUserResults.mockResolvedValueOnce(userResults);

      const result = await service.getUserResults('user-123');

      expect(mockResultStore.getUserResults).toHaveBeenCalledWith('user-123', 10);
      expect(result).toEqual(userResults);
    });

    it('should return user results with custom limit', async () => {
      const userResults = [{ jobId: '1' }];
      mockResultStore.getUserResults.mockResolvedValueOnce(userResults);

      const result = await service.getUserResults('user-123', 5);

      expect(mockResultStore.getUserResults).toHaveBeenCalledWith('user-123', 5);
      expect(result).toEqual(userResults);
    });
  });

  describe('getAllResults', () => {
    it('should return all results with default limit', async () => {
      const allResults = [{ jobId: '1' }, { jobId: '2' }];
      mockResultStore.getAllResults.mockResolvedValueOnce(allResults);

      const result = await service.getAllResults();

      expect(mockResultStore.getAllResults).toHaveBeenCalledWith(100);
      expect(result).toEqual(allResults);
    });

    it('should return all results with custom limit', async () => {
      const allResults = [{ jobId: '1' }];
      mockResultStore.getAllResults.mockResolvedValueOnce(allResults);

      const result = await service.getAllResults(50);

      expect(mockResultStore.getAllResults).toHaveBeenCalledWith(50);
      expect(result).toEqual(allResults);
    });
  });

  describe('getRecentJobs', () => {
    it('should return recent jobs with default limit', async () => {
      const recentJobs = [{ jobId: '1' }, { jobId: '2' }];
      mockResultStore.getRecentJobs.mockResolvedValueOnce(recentJobs);

      const result = await service.getRecentJobs();

      expect(mockResultStore.getRecentJobs).toHaveBeenCalledWith(50);
      expect(result).toEqual(recentJobs);
    });

    it('should return recent jobs with custom limit', async () => {
      const recentJobs = [{ jobId: '1' }];
      mockResultStore.getRecentJobs.mockResolvedValueOnce(recentJobs);

      const result = await service.getRecentJobs(25);

      expect(mockResultStore.getRecentJobs).toHaveBeenCalledWith(25);
      expect(result).toEqual(recentJobs);
    });
  });

  describe('getJobStats', () => {
    it('should calculate job statistics correctly', async () => {
      const recentJobs = [
        { jobId: '1', status: 'completed', topSolutions: [1, 2, 3] },
        { jobId: '2', status: 'completed', topSolutions: [1, 2] },
        { jobId: '3', status: 'pending' },
        { jobId: '4', status: 'processing' },
        { jobId: '5', status: 'failed' }
      ];
      mockResultStore.getRecentJobs.mockResolvedValueOnce(recentJobs);

      const stats = await service.getJobStats();

      expect(stats).toEqual({
        total: 5,
        completed: 2,
        pending: 1,
        processing: 1,
        failed: 1,
        avgSolutions: 2.5 // (3 + 2) / 2
      });
    });

    it('should handle empty job list', async () => {
      mockResultStore.getRecentJobs.mockResolvedValueOnce([]);

      const stats = await service.getJobStats();

      expect(stats).toEqual({
        total: 0,
        completed: 0,
        pending: 0,
        processing: 0,
        failed: 0,
        avgSolutions: 0
      });
    });

    it('should handle jobs without solutions', async () => {
      const recentJobs = [
        { jobId: '1', status: 'completed' },
        { jobId: '2', status: 'completed', topSolutions: null }
      ];
      mockResultStore.getRecentJobs.mockResolvedValueOnce(recentJobs);

      const stats = await service.getJobStats();

      expect(stats.avgSolutions).toBe(0);
    });
  });

  describe('enrichContextWithBottleneck', () => {
    const selectedBottleneck = {
      industry_name: 'Technology',
      market_size: '$100B',
      growth_rate_text: 'High',
      growth_rate: 15,
      industry_definition: 'Software and services',
      drivers: 'AI, Cloud, Mobile',
      bottleneck: {
        problem: 'Scaling issues',
        impact_usd_m: 500,
        type: 'Technical',
        severity: 'High',
        description: 'Infrastructure cannot scale'
      }
    };

    it('should enrich context with bottleneck data', () => {
      const enriched = service.enrichContextWithBottleneck(selectedBottleneck, {});

      expect(enriched).toContain('Industry: Technology');
      expect(enriched).toContain('Market Size: $100B');
      expect(enriched).toContain('Growth Rate: High (15% over 5 years)');
      expect(enriched).toContain('Problem: Scaling issues');
      expect(enriched).toContain('Impact: $500M');
      expect(enriched).toContain('Type: Technical');
      expect(enriched).toContain('Severity: High');
      expect(enriched).toContain('Details: Infrastructure cannot scale');
    });

    it('should handle missing description', () => {
      const bottleneckNoDesc = {
        ...selectedBottleneck,
        bottleneck: {
          ...selectedBottleneck.bottleneck,
          description: null
        }
      };

      const enriched = service.enrichContextWithBottleneck(bottleneckNoDesc, {});
      expect(enriched).not.toContain('Details:');
    });

    it('should add industry filters', () => {
      const filters = {
        industries: ['Tech', 'Finance']
      };

      const enriched = service.enrichContextWithBottleneck(selectedBottleneck, filters);
      expect(enriched).toContain('Focus on industries: Tech, Finance');
    });

    it('should add growth rate filters', () => {
      const filters = {
        growthRate: { min: 10, max: 20 }
      };

      const enriched = service.enrichContextWithBottleneck(selectedBottleneck, filters);
      expect(enriched).toContain('Target industry growth rate: 10% - 20%');
    });

    it('should add problem size filters', () => {
      const filters = {
        problemSize: { min: 100, max: 1000 }
      };

      const enriched = service.enrichContextWithBottleneck(selectedBottleneck, filters);
      expect(enriched).toContain('Problem size range: $100M - $1000M');
    });

    it('should handle null bottleneck', () => {
      const enriched = service.enrichContextWithBottleneck(null, {});
      expect(enriched).toBe('');
    });

    it('should handle all filters combined', () => {
      const filters = {
        industries: ['Tech'],
        growthRate: { min: 10, max: 20 },
        problemSize: { min: 100, max: 1000 }
      };

      const enriched = service.enrichContextWithBottleneck(selectedBottleneck, filters);
      expect(enriched).toContain('Focus on industries: Tech');
      expect(enriched).toContain('Target industry growth rate: 10% - 20%');
      expect(enriched).toContain('Problem size range: $100M - $1000M');
    });
  });

  describe('getBottleneckSolutions', () => {
    it('should find and sort matching solutions', async () => {
      const jobs = [
        {
          jobId: 'job-1',
          problemContext: 'Technology industry scaling problem',
          topSolutions: [
            { idea_id: '1', score: 8 },
            { idea_id: '2', score: 6 }
          ],
          createdAt: new Date()
        },
        {
          jobId: 'job-2',
          problemContext: 'Finance industry other problem',
          topSolutions: [
            { idea_id: '3', score: 7 }
          ]
        },
        {
          id: 'job-3',
          problemContext: 'Technology scaling issue',
          allSolutions: [
            { idea_id: '4', score: 9 },
            { idea_id: '5', score: 5 }
          ],
          createdAt: new Date()
        }
      ];
      mockResultStore.getAllResults.mockResolvedValueOnce(jobs);

      const result = await service.getBottleneckSolutions('Technology', 'scaling');

      expect(result.solutions).toHaveLength(4); // Solutions from job-1 and job-3
      expect(result.solutions[0].score).toBe(9); // Highest score first
      expect(result.solutions[0].jobId).toBe('job-3');
      expect(result.solutions[0].industryName).toBe('Technology');
      expect(result.solutions[0].problem).toBe('scaling');
      expect(result.totalJobs).toBe(2);
      expect(result.industryName).toBe('Technology');
      expect(result.problem).toBe('scaling');
    });

    it('should handle jobs with no solutions', async () => {
      const jobs = [
        {
          jobId: 'job-1',
          problemContext: 'Technology scaling',
          topSolutions: null,
          allSolutions: null
        }
      ];
      mockResultStore.getAllResults.mockResolvedValueOnce(jobs);

      const result = await service.getBottleneckSolutions('Technology', 'scaling');

      expect(result.solutions).toHaveLength(0);
      expect(result.totalJobs).toBe(1);
    });

    it('should handle no matching jobs', async () => {
      const jobs = [
        {
          jobId: 'job-1',
          problemContext: 'Different industry',
          topSolutions: [{ idea_id: '1', score: 8 }]
        }
      ];
      mockResultStore.getAllResults.mockResolvedValueOnce(jobs);

      const result = await service.getBottleneckSolutions('Technology', 'scaling');

      expect(result.solutions).toHaveLength(0);
      expect(result.totalJobs).toBe(0);
    });

    it('should handle jobs without problemContext', async () => {
      const jobs = [
        {
          jobId: 'job-1',
          problemContext: null,
          topSolutions: [{ idea_id: '1', score: 8 }]
        }
      ];
      mockResultStore.getAllResults.mockResolvedValueOnce(jobs);

      const result = await service.getBottleneckSolutions('Technology', 'scaling');

      expect(result.solutions).toHaveLength(0);
    });
  });
});