import { jest } from '@jest/globals';

// Mock logger
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

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
  createEnricherRequest: jest.fn()
};

jest.unstable_mockModule('../src/services/llmClient.js', () => ({
  LLMClient: jest.fn().mockImplementation(() => mockLLMClient)
}));

// Import after mocking
const { default: EvolutionarySolver } = await import('../src/core/evolutionarySolver.js');

describe('EvolutionarySolver', () => {
  let solver;

  beforeEach(() => {
    jest.clearAllMocks();
    solver = new EvolutionarySolver();
    // Set up LLM client
    solver.llmClient = mockLLMClient;
    
    // Default config
    solver.config = {
      ...solver.config,
      enableRetries: false,
      enableGracefulDegradation: false
    };
  });

  describe('variator', () => {
    beforeEach(() => {
      mockLLMClient.createVariatorRequest.mockResolvedValue({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'test prompt' }]
      });
    });

    it('should generate new solutions when needed', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify([
              {
                idea_id: 'test-1',
                title: 'Test Solution 1',
                description: 'Test solution 1',
                core_mechanism: 'Test mechanism 1'
              },
              {
                idea_id: 'test-2',
                title: 'Test Solution 2',
                description: 'Test solution 2',
                core_mechanism: 'Test mechanism 2'
              }
            ])
          }
        }],
        usage: { prompt_tokens: 100, completion_tokens: 200 }
      };

      mockLLMClient.client.chat.completions.create.mockResolvedValueOnce(mockResponse);

      const result = await solver.variator([], 2, 'Test problem', 1, 'test-job');

      expect(result).toHaveLength(2);
      expect(result[0].idea_id).toBe('test-1');
      expect(result[1].idea_id).toBe('test-2');
      expect(mockLLMClient.client.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('should not generate new solutions when population is full', async () => {
      const existingSolutions = [
        { idea_id: '1', description: 'Solution 1' },
        { idea_id: '2', description: 'Solution 2' },
        { idea_id: '3', description: 'Solution 3' }
      ];

      const result = await solver.variator(existingSolutions, 3, 'Test problem', 1, 'test-job');

      expect(result).toEqual(existingSolutions);
      expect(mockLLMClient.client.chat.completions.create).not.toHaveBeenCalled();
    });

    it('should handle API errors without retries when disabled', async () => {
      mockLLMClient.client.chat.completions.create.mockRejectedValueOnce(
        new Error('API Error')
      );

      await expect(
        solver.variator([], 1, 'Test problem', 1, 'test-job')
      ).rejects.toThrow('API Error');
      
      expect(mockLLMClient.client.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('should retry on rate limit errors when enabled', async () => {
      solver.config.enableRetries = true;
      solver.config.maxRetries = 3;
      solver.config.retryDelay = 10;

      const rateLimitError = new Error('Rate limit');
      rateLimitError.status = 429;

      mockLLMClient.client.chat.completions.create
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify([{
                idea_id: 'test-1',
                title: 'Test',
                description: 'Test solution',
                core_mechanism: 'Test mechanism'
              }])
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        });

      const result = await solver.variator([], 1, 'Test problem', 1, 'test-job');

      expect(result).toHaveLength(1);
      expect(mockLLMClient.client.chat.completions.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('enricher', () => {
    beforeEach(() => {
      mockLLMClient.createEnricherRequest.mockResolvedValue({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'test enricher prompt' }]
      });
    });

    it('should enrich ideas with business cases', async () => {
      const ideas = [
        { idea_id: 'test-1', description: 'Test solution 1', core_mechanism: 'Test mechanism' }
      ];

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify([
              {
                idea_id: 'test-1',
                description: 'Test solution 1',
                core_mechanism: 'Test mechanism',
                business_case: {
                  npv_success: 5.2,
                  capex_est: 0.45,
                  risk_factors: ['Market risk', 'Technical risk'],
                  timeline_months: 4,
                  likelihood: 0.7,
                  yearly_cashflows: [-0.45, 1.2, 1.8, 2.2, 2.5]
                }
              }
            ])
          }
        }],
        usage: { prompt_tokens: 100, completion_tokens: 200 }
      };

      mockLLMClient.client.chat.completions.create.mockResolvedValueOnce(mockResponse);

      const result = await solver.enricher(ideas, 1, {}, 'test-job');

      expect(result).toHaveLength(1);
      expect(result[0].business_case).toBeDefined();
      expect(result[0].business_case.npv_success).toBe(5.2);
      expect(result[0].business_case.capex_est).toBe(0.45);
      expect(result[0].business_case.yearly_cashflows).toHaveLength(5);
    });

    it('should use default values on enricher failure when graceful degradation enabled', async () => {
      solver.config.enableGracefulDegradation = true;
      
      const ideas = [
        { idea_id: 'test-1', title: 'Test', description: 'Test solution' }
      ];

      mockLLMClient.client.chat.completions.create.mockRejectedValueOnce(
        new Error('API Error')
      );

      const result = await solver.enricher(ideas, 1, {}, 'test-job');

      expect(result).toHaveLength(1);
      expect(result[0].business_case).toBeDefined();
      expect(result[0].business_case.npv_success).toBe(5.0);
      expect(result[0].business_case.capex_est).toBe(1.0);
      expect(result[0].business_case.likelihood).toBe(0.5);
      expect(result[0].enrichment_note).toBe('Default values used due to enrichment failure');
    });
  });

  describe('ranker', () => {
    it('should rank ideas by score', async () => {
      const enrichedIdeas = [
        {
          idea_id: 'low-score',
          description: 'Low score idea',
          core_mechanism: 'Low mechanism',
          business_case: {
            likelihood: 0.3,
            capex_est: 0.40,
            npv_success: 2,
            risk_factors: ['Risk 1'],
            timeline_months: 6,
            yearly_cashflows: [0.2, 0.4, 0.6, 0.8, 1.0]
          }
        },
        {
          idea_id: 'high-score',
          description: 'High score idea',
          core_mechanism: 'High mechanism',
          business_case: {
            likelihood: 0.8,
            capex_est: 0.20,
            npv_success: 10,
            risk_factors: ['Risk 1'],
            timeline_months: 3,
            yearly_cashflows: [1, 2, 3, 4, 5]
          }
        }
      ];

      const result = await solver.ranker(enrichedIdeas);

      expect(result.rankedIdeas).toHaveLength(2);
      expect(result.filteredIdeas).toHaveLength(0);
      expect(result.rankedIdeas[0].idea_id).toBe('high-score');
      expect(result.rankedIdeas[1].idea_id).toBe('low-score');
      expect(result.rankedIdeas[0].rank).toBe(1);
      expect(result.rankedIdeas[1].rank).toBe(2);
      expect(result.rankedIdeas[0].score).toBeGreaterThan(result.rankedIdeas[1].score);
    });

    it('should validate required fields', async () => {
      const invalidIdeas = [
        {
          idea_id: 'missing-business-case',
          description: 'Missing business case'
        }
      ];

      await expect(
        solver.ranker(invalidIdeas)
      ).rejects.toThrow('Data validation failed in ranker');
    });

    it('should handle ideas with preferences', async () => {
      solver.config.maxCapex = 0.5; // $500K max
      solver.config.minProfits = 3; // $3M min NPV
      
      const enrichedIdeas = [
        {
          idea_id: 'violates-capex',
          business_case: {
            likelihood: 0.7,
            capex_est: 1.0, // Exceeds max
            npv_success: 5,
            risk_factors: ['Risk'],
            timeline_months: 4
          }
        },
        {
          idea_id: 'violates-npv',
          business_case: {
            likelihood: 0.7,
            capex_est: 0.3,
            npv_success: 2, // Below min
            risk_factors: ['Risk'],
            timeline_months: 4
          }
        },
        {
          idea_id: 'meets-preferences',
          business_case: {
            likelihood: 0.7,
            capex_est: 0.4,
            npv_success: 4,
            risk_factors: ['Risk'],
            timeline_months: 4
          }
        }
      ];

      const result = await solver.ranker(enrichedIdeas);

      // All ideas should still be ranked (not filtered)
      expect(result.rankedIdeas).toHaveLength(3);
      expect(result.filteredIdeas).toHaveLength(0);
      
      // Check preference violations are noted
      const violatesCapex = result.rankedIdeas.find(i => i.idea_id === 'violates-capex');
      const violatesNpv = result.rankedIdeas.find(i => i.idea_id === 'violates-npv');
      const meetsPrefs = result.rankedIdeas.find(i => i.idea_id === 'meets-preferences');
      
      expect(violatesCapex.violatesPreferences).toBe(true);
      expect(violatesNpv.violatesPreferences).toBe(true);
      expect(meetsPrefs.violatesPreferences).toBe(false);
    });
  });

  describe('evolve', () => {
    it('should run complete evolution cycle', async () => {
      const problemContext = 'Test problem context';
      const customConfig = {
        generations: 2,
        populationSize: 2,
        topSelectCount: 1
      };

      // Mock variator responses
      mockLLMClient.createVariatorRequest.mockResolvedValue({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'variator prompt' }]
      });

      // Generation 1 variator
      mockLLMClient.client.chat.completions.create
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify([
                { idea_id: 'gen1-1', title: 'Idea 1', description: 'Gen 1 Idea 1', core_mechanism: 'Mechanism 1' },
                { idea_id: 'gen1-2', title: 'Idea 2', description: 'Gen 1 Idea 2', core_mechanism: 'Mechanism 2' }
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
                  title: 'Idea 1',
                  description: 'Gen 1 Idea 1',
                  core_mechanism: 'Mechanism 1',
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
                  title: 'Idea 2',
                  description: 'Gen 1 Idea 2',
                  core_mechanism: 'Mechanism 2',
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
        // Generation 2 variator (offspring from gen1-1)
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify([
                { idea_id: 'gen2-1', title: 'Evolved 1', description: 'Gen 2 Idea 1', core_mechanism: 'Evolved Mechanism' }
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
                  title: 'Evolved 1',
                  description: 'Gen 2 Idea 1',
                  core_mechanism: 'Evolved Mechanism',
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

      // Mock enricher requests
      mockLLMClient.createEnricherRequest.mockResolvedValue({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'enricher prompt' }]
      });

      const result = await solver.evolve(problemContext, [], customConfig);

      expect(result.topSolutions).toBeDefined();
      expect(result.allSolutions).toBeDefined();
      expect(result.generationHistory).toHaveLength(2);
      expect(result.totalEvaluations).toBe(4); // 2 generations * 2 population size
      expect(result.apiCallCounts.variator).toBe(2);
      expect(result.apiCallCounts.enricher).toBe(2);
      expect(result.apiCallCounts.total).toBe(4);
    });
  });

  describe('retryLLMCall', () => {
    it('should not retry when retries disabled', async () => {
      solver.config.enableRetries = false;
      
      const operation = jest.fn().mockRejectedValueOnce(new Error('API Error'));
      
      await expect(
        solver.retryLLMCall(operation, 'test', 1, 'job-1')
      ).rejects.toThrow('API Error');
      
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      solver.config.enableRetries = true;
      solver.config.maxRetries = 3;
      solver.config.retryDelay = 10;
      
      const error500 = new Error('Server Error');
      error500.status = 500;
      
      const operation = jest.fn()
        .mockRejectedValueOnce(error500)
        .mockResolvedValueOnce({ success: true });
      
      const result = await solver.retryLLMCall(operation, 'test', 1, 'job-1');
      
      expect(result).toEqual({ success: true });
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on client errors', async () => {
      solver.config.enableRetries = true;
      
      const error400 = new Error('Bad Request');
      error400.status = 400;
      
      const operation = jest.fn().mockRejectedValueOnce(error400);
      
      await expect(
        solver.retryLLMCall(operation, 'test', 1, 'job-1')
      ).rejects.toThrow('Bad Request');
      
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});