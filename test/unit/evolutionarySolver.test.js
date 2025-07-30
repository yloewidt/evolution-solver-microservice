import { jest } from '@jest/globals';

// Mock LLMClient
const mockLLMClient = {
  client: {
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  },
  getApiStyle: jest.fn().mockReturnValue('openai'),
  createVariatorRequest: jest.fn(),
  executeRequest: jest.fn((request) => {
    // Return the mocked response from create method
    return mockLLMClient.client.chat.completions.create(request);
  }),
  parseResponse: jest.fn((response) => {
    // Extract ideas from the mocked response
    const content = response.choices?.[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return parsed.ideas || parsed;
    }
    return [];
  })
};

jest.unstable_mockModule('../../src/services/llmClient.js', () => ({
  LLMClient: jest.fn().mockImplementation(() => mockLLMClient)
}));

// Mock ResponseParser
jest.unstable_mockModule('../../src/utils/responseParser.js', () => ({
  ResponseParser: {
    parseOpenAIResponse: jest.fn((response, context) => {
      // Extract ideas from the mocked response
      const content = response.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        return parsed.ideas || parsed;
      }
      return [];
    }),
    parseVariatorResponse: jest.fn()
  }
}));

// Import after mocking
import logger from '../../src/utils/logger.js';
const { default: EvolutionarySolver } = await import('../../src/core/evolutionarySolver.js');

// Unit tests without external dependencies
describe('EvolutionarySolver - Unit Tests', () => {
  let solver;
  let mockResultStore;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock result store
    mockResultStore = {
      saveApiCall: jest.fn(),
      addApiCallTelemetry: jest.fn(),
      saveApiCallDebug: jest.fn(),
      updateGenerationProgress: jest.fn(),
      savePartialResult: jest.fn()
    };

    // Create solver with mocked dependencies
    solver = new EvolutionarySolver(null, mockResultStore);
    solver.llmClient = mockLLMClient;
    solver.currentGeneration = 1; // Set generation for ID generation
    solver.config = {
      ...solver.config,
      maxCapex: 10,
      minProfits: 1,
      enableRetries: false,
      enableGracefulDegradation: false
    };
  });

  describe('Variator Logic Tests', () => {
    beforeEach(() => {
      mockLLMClient.createVariatorRequest.mockResolvedValue({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'test prompt' }]
      });
    });

    test('should return current solutions when target count reached', async () => {
      const currentSolutions = [
        { idea_id: '1', title: 'Idea 1' },
        { idea_id: '2', title: 'Idea 2' },
        { idea_id: '3', title: 'Idea 3' }
      ];

      const result = await solver.variator(currentSolutions, 3, 'context', 1, 'job-1');

      expect(result).toEqual(currentSolutions);
      expect(mockLLMClient.client.chat.completions.create).not.toHaveBeenCalled();
    });

    test('should generate new ideas when needed', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              ideas: [
                { title: 'New 1', description: 'Desc 1', core_mechanism: 'Mech 1', is_offspring: false },
                { title: 'New 2', description: 'Desc 2', core_mechanism: 'Mech 2', is_offspring: false }
              ]
            })
          }
        }],
        usage: { prompt_tokens: 100, completion_tokens: 200 }
      };

      mockLLMClient.client.chat.completions.create.mockResolvedValueOnce(mockResponse);

      const result = await solver.variator([], 2, 'test context', 1, 'job-1');

      expect(result).toHaveLength(2);
      expect(result[0].idea_id).toBe('VAR_GEN1_001');
      expect(result[1].idea_id).toBe('VAR_GEN1_002');
    });

    test('should include top performers in prompt for generation > 1', async () => {
      const currentSolutions = [
        { idea_id: 'top-1', title: 'Top Performer', score: 100 }
      ];

      solver.config.offspringRatio = 0.7;
      solver.currentGeneration = 2; // Set generation for test

      mockLLMClient.client.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              ideas: [
                { title: 'New 1', description: 'Desc 1', core_mechanism: 'Mech 1', is_offspring: true }
              ]
            })
          }
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50 }
      });

      await solver.variator(currentSolutions, 11, 'context', 2, 'job-1');

      // Check that the request was created with the current solutions
      expect(mockLLMClient.createVariatorRequest).toHaveBeenCalled();
      const [_, systemPrompt, userPrompt] = mockLLMClient.createVariatorRequest.mock.calls[0];
      expect(userPrompt).toContain('Top Performer');
      expect(systemPrompt).toContain('7 OFFSPRING'); // 70% of 10 needed
      expect(systemPrompt).toContain('3 WILDCARDS'); // 30% of 10 needed
    });
  });

  // Enricher tests removed - enrichment now handled by singleIdeaEnricher service

  describe('Enricher Logic Tests (removed)', () => {
    test.skip('enricher method has been removed from evolutionarySolver', () => {
      // Enrichment is now handled by the singleIdeaEnricher service
    });
  });

  describe('Ranker Logic Tests', () => {
    test('should calculate risk-adjusted NPV correctly', async () => {
      const ideas = [
        {
          idea_id: '1',
          title: 'Idea 1',
          business_case: {
            npv_success: 10,
            capex_est: 2,
            likelihood: 0.8,
            risk_factors: ['Test risk'],
            timeline_months: 12
          }
        }
      ];

      const result = await solver.ranker(ideas);

      expect(result.rankedIdeas).toHaveLength(1);
      expect(result.filteredIdeas).toHaveLength(0);

      const idea = result.rankedIdeas[0];
      const p = 0.8;
      const expectedValue = p * 10 - (1 - p) * 2;
      const diversificationPenalty = Math.sqrt(2 / 0.05);
      const expectedScore = expectedValue / diversificationPenalty;

      expect(idea.score).toBeCloseTo(expectedScore, 6);
    });

    test('should sort by score descending', async () => {
      const ideas = [
        {
          idea_id: '1',
          title: 'Low Score',
          business_case: { npv_success: 2, capex_est: 2, likelihood: 0.3, risk_factors: [], timeline_months: 12 }
        },
        {
          idea_id: '2',
          title: 'High Score',
          business_case: { npv_success: 20, capex_est: 2, likelihood: 0.9, risk_factors: [], timeline_months: 12 }
        },
        {
          idea_id: '3',
          title: 'Medium Score',
          business_case: { npv_success: 10, capex_est: 2, likelihood: 0.6, risk_factors: [], timeline_months: 12 }
        }
      ];

      const result = await solver.ranker(ideas);

      expect(result.rankedIdeas[0].title).toBe('High Score');
      expect(result.rankedIdeas[1].title).toBe('Medium Score');
      expect(result.rankedIdeas[2].title).toBe('Low Score');
    });

    test('should mark ideas that violate preferences', async () => {
      const ideas = [
        {
          idea_id: '1',
          title: 'Over CAPEX',
          business_case: { npv_success: 50, capex_est: 15, likelihood: 0.8, risk_factors: [], timeline_months: 12 }
        },
        {
          idea_id: '2',
          title: 'Under Profit',
          business_case: { npv_success: 0.5, capex_est: 1, likelihood: 0.8, risk_factors: [], timeline_months: 12 }
        }
      ];

      solver.config.maxCapex = 10;
      solver.config.minProfits = 1;

      const result = await solver.ranker(ideas);

      const overCapex = result.rankedIdeas.find(i => i.title === 'Over CAPEX');
      expect(overCapex.violatesPreferences).toBe(true);
      expect(overCapex.preferenceNote).toContain('exceeds preference');

      const underProfit = result.rankedIdeas.find(i => i.title === 'Under Profit');
      expect(underProfit.violatesPreferences).toBe(true);
      expect(underProfit.preferenceNote).toContain('below preference');
    });

    test('should validate business_case fields', async () => {
      const invalidIdeas = [
        {
          idea_id: '1',
          title: 'Missing business_case'
        }
      ];

      await expect(solver.ranker(invalidIdeas)).rejects.toThrow('Data validation failed in ranker');
    });
  });

  describe('Evolution Process Tests (removed)', () => {
    test.skip('evolution process test removed - enrichment now handled separately', async () => {
      solver.config.generations = 2;
      solver.config.populationSize = 2;
      solver.config.topSelectCount = 1;

      // Mock variator requests
      mockLLMClient.createVariatorRequest.mockResolvedValue({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'variator prompt' }]
      });

      // Mock enricher requests
      mockLLMClient.createEnricherRequest.mockResolvedValue({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'enricher prompt' }]
      });

      // Generation 1 variator
      mockLLMClient.client.chat.completions.create
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify([
                { idea_id: 'gen1-1', title: 'G1-1', description: 'Gen 1 Idea 1', core_mechanism: 'M1' },
                { idea_id: 'gen1-2', title: 'G1-2', description: 'Gen 1 Idea 2', core_mechanism: 'M2' }
              ])
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 100 }
        })
        // Generation 1 enricher
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify([
                {
                  idea_id: 'gen1-1',
                  title: 'G1-1',
                  description: 'Gen 1 Idea 1',
                  core_mechanism: 'M1',
                  business_case: {
                    npv_success: 5,
                    capex_est: 1,
                    likelihood: 0.7,
                    timeline_months: 6,
                    risk_factors: ['Risk'],
                    yearly_cashflows: [-1, 1, 2, 2, 2]
                  }
                },
                {
                  idea_id: 'gen1-2',
                  title: 'G1-2',
                  description: 'Gen 1 Idea 2',
                  core_mechanism: 'M2',
                  business_case: {
                    npv_success: 3,
                    capex_est: 0.5,
                    likelihood: 0.6,
                    timeline_months: 4,
                    risk_factors: ['Risk'],
                    yearly_cashflows: [-0.5, 0.5, 1, 1, 1.5]
                  }
                }
              ])
            }
          }],
          usage: { prompt_tokens: 150, completion_tokens: 150 }
        })
        // Generation 2 variator
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify([
                { idea_id: 'gen2-1', title: 'G2-1', description: 'Gen 2 Idea 1', core_mechanism: 'M3' }
              ])
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        })
        // Generation 2 enricher
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify([
                {
                  idea_id: 'gen2-1',
                  title: 'G2-1',
                  description: 'Gen 2 Idea 1',
                  core_mechanism: 'M3',
                  business_case: {
                    npv_success: 8,
                    capex_est: 1.5,
                    likelihood: 0.8,
                    timeline_months: 8,
                    risk_factors: ['Risk'],
                    yearly_cashflows: [-1.5, 1.5, 3, 3, 3]
                  }
                }
              ])
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 100 }
        });

      const progressTracker = {
        jobId: 'test-job',
        resultStore: mockResultStore
      };

      const result = await solver.evolve('Test problem', [], solver.config, progressTracker);

      expect(result.generationHistory).toHaveLength(2);
      expect(result.allSolutions).toHaveLength(3); // 2 from gen1 + 1 from gen2
      expect(result.apiCallCounts.variator).toBe(2);
      expect(result.apiCallCounts.enricher).toBe(2);
      expect(result.apiCallCounts.total).toBe(4);
    });
  });

  describe('Retry Logic Tests', () => {
    test('should retry on rate limit error when enabled', async () => {
      solver.config.enableRetries = true;
      solver.config.maxRetries = 3;
      solver.config.retryDelay = 10;

      const rateLimitError = new Error('Rate limit');
      rateLimitError.status = 429;

      const operation = jest.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({ success: true });

      const result = await solver.retryLLMCall(operation, 'test', 1, 'job-1');

      expect(result).toEqual({ success: true });
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('should not retry when disabled', async () => {
      solver.config.enableRetries = false;

      const operation = jest.fn().mockRejectedValueOnce(new Error('API Error'));

      await expect(
        solver.retryLLMCall(operation, 'test', 1, 'job-1')
      ).rejects.toThrow('API Error');

      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
