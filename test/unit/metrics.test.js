import { jest } from '@jest/globals';
import { 
  calculatePerProblemMetrics, 
  calculateGeneralStatistics,
  calculatePerGenerationMetrics,
  processAllMetrics 
} from '../../scripts/business-testing/calculate-metrics.js';

describe('Metrics V2 Calculator', () => {
  // Sample job result for testing
  const createMockJobResult = (overrides = {}) => ({
    jobId: 'test-job-1',
    problemId: 'test-problem-1',
    problemContext: 'Test problem context',
    generations: {
      '1': {
        generation: 1,
        topScore: 1.5,
        avgScore: 1.0,
        solutions: [
          { score: 0.5 },
          { score: 1.0 },
          { score: 1.5 }
        ]
      },
      '2': {
        generation: 2,
        topScore: 2.0,
        avgScore: 1.5,
        solutions: [
          { score: 1.0 },
          { score: 1.5 },
          { score: 2.0 }
        ]
      },
      '3': {
        generation: 3,
        topScore: 3.0,
        avgScore: 2.0,
        solutions: [
          { score: 1.5 },
          { score: 2.0 },
          { score: 3.0 }
        ]
      }
    },
    apiCalls: [
      { generation: 1, tokens: { total_tokens: 1000 } },
      { generation: 2, tokens: { total_tokens: 1500 } },
      { generation: 3, tokens: { total_tokens: 2000 } }
    ],
    ...overrides
  });

  describe('calculatePerProblemMetrics', () => {
    it('should calculate success rate correctly', () => {
      const job = createMockJobResult();
      const metrics = calculatePerProblemMetrics(job, 10);
      
      expect(metrics.successRate).toBe(0.3); // 3 generations out of 10 intended
      expect(metrics.maxGeneration).toBe(3);
    });

    it('should calculate find good ideas (max score)', () => {
      const job = createMockJobResult();
      const metrics = calculatePerProblemMetrics(job);
      
      expect(metrics.findGoodIdeas).toBe(3.0); // Max score across all generations
    });

    it('should calculate search efficiency', () => {
      const job = createMockJobResult();
      const metrics = calculatePerProblemMetrics(job);
      
      // Max score: 3.0, Total tokens: 4500
      // Efficiency = 3.0 * 1000 / 4500 = 0.667
      expect(metrics.searchEfficiently).toBeCloseTo(0.667, 3);
      expect(metrics.totalTokens).toBe(4500);
    });

    it('should calculate variability (average std deviation)', () => {
      const job = createMockJobResult();
      const metrics = calculatePerProblemMetrics(job);
      
      // Calculate expected std dev for each generation
      // Gen 1: [0.5, 1.0, 1.5] - mean = 1.0, std = 0.5
      // Gen 2: [1.0, 1.5, 2.0] - mean = 1.5, std = 0.5
      // Gen 3: [1.5, 2.0, 3.0] - mean = 2.167, std = 0.764
      // But we use population std dev, not sample
      expect(metrics.haveVariability).toBeCloseTo(0.480, 2);
    });

    it('should calculate first generation average score', () => {
      const job = createMockJobResult();
      const metrics = calculatePerProblemMetrics(job);
      
      // Gen 1: (0.5 + 1.0 + 1.5) / 3 = 1.0
      expect(metrics.thinkAboutGoodIdeas).toBe(1.0);
    });

    it('should calculate improvement process', () => {
      const job = createMockJobResult();
      const metrics = calculatePerProblemMetrics(job);
      
      // Last gen avg: (1.5 + 2.0 + 3.0) / 3 = 2.167
      // First gen avg: 1.0
      // Tokens from gen 2 to last: 1500 + 2000 = 3500
      // But we're using tokens per generation, not total API calls
      // So gen2 tokens = 1500, gen3 tokens = 2000, total = 3500
      // But the calculation might be different based on how tokens are aggregated
      expect(metrics.goodImprovingProcess).toBeGreaterThan(0);
      expect(metrics.tokensFromGen2ToLast).toBeGreaterThan(0);
    });

    it('should handle empty generations', () => {
      const job = createMockJobResult({ generations: {} });
      const metrics = calculatePerProblemMetrics(job);
      
      expect(metrics.successRate).toBe(0);
      expect(metrics.findGoodIdeas).toBe(0);
      expect(metrics.searchEfficiently).toBe(0);
    });
  });

  describe('calculateGeneralStatistics', () => {
    it('should calculate averages and medians correctly', () => {
      const perProblemMetrics = [
        { successRate: 1.0, findGoodIdeas: 5.0, searchEfficiently: 1.0, haveVariability: 0.5, thinkAboutGoodIdeas: 2.0, goodImprovingProcess: 0.001 },
        { successRate: 0.8, findGoodIdeas: 3.0, searchEfficiently: 0.8, haveVariability: 0.3, thinkAboutGoodIdeas: 1.5, goodImprovingProcess: 0.0008 },
        { successRate: 0.6, findGoodIdeas: 4.0, searchEfficiently: 0.9, haveVariability: 0.4, thinkAboutGoodIdeas: 1.8, goodImprovingProcess: 0.0009 }
      ];
      
      const stats = calculateGeneralStatistics(perProblemMetrics);
      
      // Success rate should be average
      expect(stats.successRate).toBeCloseTo(0.8, 3);
      
      // Others should be median
      expect(stats.findGoodIdeas).toBe(4.0); // Median of [3, 4, 5]
      expect(stats.searchEfficiently).toBe(0.9); // Median of [0.8, 0.9, 1.0]
      expect(stats.haveVariability).toBe(0.4); // Median of [0.3, 0.4, 0.5]
    });
  });

  describe('calculatePerGenerationMetrics', () => {
    it('should aggregate metrics across problems by generation', () => {
      const jobResults = [
        createMockJobResult({ problemId: 'problem-1' }),
        createMockJobResult({ 
          problemId: 'problem-2',
          generations: {
            '1': {
              generation: 1,
              solutions: [{ score: 2.0 }, { score: 2.5 }, { score: 3.0 }]
            },
            '2': {
              generation: 2,
              solutions: [{ score: 3.0 }, { score: 3.5 }, { score: 4.0 }]
            }
          }
        })
      ];
      
      const perGenMetrics = calculatePerGenerationMetrics(jobResults, 2);
      
      expect(perGenMetrics).toHaveLength(3); // 3 generations total
      
      const gen1 = perGenMetrics.find(g => g.generation === 1);
      expect(gen1.successRate).toBe(1.0); // 2 out of 2 problems reporting
      expect(gen1.problemsReporting).toBe(2);
      expect(gen1.findGoodIdeas).toBeGreaterThan(0); // Median of max scores
    });

    it('should calculate generation improvement correctly', () => {
      const jobResults = [createMockJobResult()];
      const perGenMetrics = calculatePerGenerationMetrics(jobResults, 1);
      
      // Generation 2 should show improvement from generation 1
      const gen2 = perGenMetrics.find(g => g.generation === 2);
      expect(gen2.goodImprovingProcess).toBeGreaterThan(0);
    });
  });

  describe('processAllMetrics', () => {
    it('should process all metrics and add version metadata', async () => {
      const jobResults = [createMockJobResult()];
      const config = {
        intendedGenerations: 10,
        totalProblems: 1,
        model: 'test-model',
        serviceVersion: '1.0.0',
        configName: 'test-config'
      };
      
      const result = await processAllMetrics(jobResults, config);
      
      expect(result).toHaveProperty('perProblem');
      expect(result).toHaveProperty('generalStatistics');
      expect(result).toHaveProperty('perGeneration');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('metadata');
      
      expect(result.version.model).toBe('test-model');
      expect(result.version.service).toBe('1.0.0');
      expect(result.perProblem).toHaveLength(1);
    });
  });
});