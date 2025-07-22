import { jest } from '@jest/globals';

// Mock OpenAI before any imports
jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    responses: {
      create: jest.fn()
    },
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }))
}));

// Import after mocking
const { default: EvolutionarySolver } = await import('../src/core/evolutionarySolver.js');

describe('EvolutionarySolver', () => {
  let solver;
  let mockOpenAI;

  beforeEach(() => {
    solver = new EvolutionarySolver();
    mockOpenAI = solver.client;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('variator', () => {
    it('should generate new solutions when needed', async () => {
      const mockResponse = {
        output: [
          {
            type: 'text',
            content: JSON.stringify([
              {
                idea_id: 'test-1',
                description: 'Test solution 1',
                core_mechanism: 'Test mechanism 1'
              },
              {
                idea_id: 'test-2',
                description: 'Test solution 2',
                core_mechanism: 'Test mechanism 2'
              }
            ])
          }
        ],
        usage: { prompt_tokens: 100, completion_tokens: 200 }
      };

      mockOpenAI.responses.create.mockResolvedValueOnce(mockResponse);

      const result = await solver.variator([], 2, 'Test problem');

      expect(result).toHaveLength(2);
      expect(result[0].idea_id).toBe('test-1');
      expect(result[1].idea_id).toBe('test-2');
      expect(mockOpenAI.responses.create).toHaveBeenCalledTimes(1);
    });

    it('should not generate new solutions when population is full', async () => {
      const existingSolutions = [
        { idea_id: '1', description: 'Solution 1' },
        { idea_id: '2', description: 'Solution 2' },
        { idea_id: '3', description: 'Solution 3' }
      ];

      const result = await solver.variator(existingSolutions, 3, 'Test problem');

      expect(result).toEqual(existingSolutions);
      expect(mockOpenAI.responses.create).not.toHaveBeenCalled();
    });

    it('should include problem context in prompt', async () => {
      const mockResponse = {
        output: [
          {
            type: 'text',
            content: JSON.stringify([{ idea_id: 'test-1', description: 'Test', core_mechanism: 'Test' }])
          }
        ],
        usage: { prompt_tokens: 100, completion_tokens: 200 }
      };

      mockOpenAI.responses.create.mockResolvedValueOnce(mockResponse);

      await solver.variator([], 1, 'Test problem context');

      const call = mockOpenAI.responses.create.mock.calls[0][0];
      expect(call.input[1].content[0].text).toContain('Test problem context');
    });
  });

  describe('enricher', () => {
    it('should enrich ideas with business cases', async () => {
      const ideas = [
        { idea_id: 'test-1', description: 'Test solution 1', core_mechanism: 'Test mechanism' }
      ];

      const mockResponse = {
        output: [
          {
            type: 'text',
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
                  yearly_cashflows: [0.5, 1.2, 1.8, 2.2, 2.5]
                }
              }
            ])
          }
        ],
        usage: { prompt_tokens: 100, completion_tokens: 200 }
      };

      mockOpenAI.responses.create.mockResolvedValueOnce(mockResponse);

      const result = await solver.enricher(ideas);

      expect(result).toHaveLength(1);
      expect(result[0].business_case).toBeDefined();
      expect(result[0].business_case.npv_success).toBe(5.2);
      expect(result[0].business_case.capex_est).toBe(0.45);
      expect(result[0].business_case.yearly_cashflows).toHaveLength(5);
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

      const { rankedIdeas, filteredIdeas } = await solver.ranker(enrichedIdeas);

      expect(rankedIdeas).toHaveLength(2);
      expect(filteredIdeas).toHaveLength(0);
      expect(rankedIdeas[0].idea_id).toBe('high-score');
      expect(rankedIdeas[1].idea_id).toBe('low-score');
      expect(rankedIdeas[0].rank).toBe(1);
      expect(rankedIdeas[1].rank).toBe(2);
      expect(rankedIdeas[0].score).toBeGreaterThan(rankedIdeas[1].score);
    });

    it('should filter ideas exceeding max capex', async () => {
      solver.config.maxCapex = 0.5; // Set max to 0.5 million
      
      const enrichedIdeas = [
        {
          idea_id: 'within-budget',
          description: 'Within budget',
          core_mechanism: 'Good mechanism',
          business_case: {
            likelihood: 0.7,
            capex_est: 0.3,
            npv_success: 5,
            risk_factors: ['Risk 1'],
            timeline_months: 4,
            yearly_cashflows: [0.5, 1, 1.5, 2, 2.5]
          }
        },
        {
          idea_id: 'over-budget',
          description: 'Over budget',
          core_mechanism: 'Expensive mechanism',
          business_case: {
            likelihood: 0.8,
            capex_est: 1.0, // Over the 0.5 limit
            npv_success: 10,
            risk_factors: ['Risk 1'],
            timeline_months: 6,
            yearly_cashflows: [1, 2, 3, 4, 5]
          }
        }
      ];

      const { rankedIdeas, filteredIdeas } = await solver.ranker(enrichedIdeas);

      expect(rankedIdeas).toHaveLength(1);
      expect(filteredIdeas).toHaveLength(1);
      expect(rankedIdeas[0].idea_id).toBe('within-budget');
      expect(filteredIdeas[0].idea_id).toBe('over-budget');
      expect(filteredIdeas[0].filterReason).toContain('exceeds maximum');
    });
  });

  describe('evolve', () => {
    it('should run complete evolution cycle', async () => {
      const problemContext = 'Test bottleneck problem';
      const customConfig = { 
        generations: 2, 
        populationSize: 3,
        topSelectCount: 2  // Keep only 2, so gen 2 needs 1 new idea
      };

      // Mock variator response for generation 1
      const variatorResponse1 = {
        output: [
          {
            type: 'text',
            content: JSON.stringify([
              { idea_id: 'gen1-1', description: 'Solution 1', core_mechanism: 'Mechanism 1' },
              { idea_id: 'gen1-2', description: 'Solution 2', core_mechanism: 'Mechanism 2' },
              { idea_id: 'gen1-3', description: 'Solution 3', core_mechanism: 'Mechanism 3' }
            ])
          }
        ],
        usage: { prompt_tokens: 100, completion_tokens: 200 }
      };

      // Mock enricher response for generation 1
      const enricherResponse1 = {
        output: [
          {
            type: 'text',
            content: JSON.stringify([
              {
                idea_id: 'gen1-1',
                description: 'Solution 1',
                core_mechanism: 'Mechanism 1',
                business_case: {
                  npv_success: 5,
                  capex_est: 0.30,
                  risk_factors: ['Risk 1'],
                  timeline_months: 4,
                  likelihood: 0.7,
                  yearly_cashflows: [0.5, 1, 1.5, 2, 2.5]
                }
              },
              {
                idea_id: 'gen1-2',
                description: 'Solution 2',
                core_mechanism: 'Mechanism 2',
                business_case: {
                  npv_success: 8,
                  capex_est: 0.25,
                  risk_factors: ['Risk 2'],
                  timeline_months: 3,
                  likelihood: 0.8,
                  yearly_cashflows: [0.8, 1.6, 2.4, 3.2, 4]
                }
              },
              {
                idea_id: 'gen1-3',
                description: 'Solution 3',
                core_mechanism: 'Mechanism 3',
                business_case: {
                  npv_success: 3,
                  capex_est: 0.40,
                  risk_factors: ['Risk 3'],
                  timeline_months: 5,
                  likelihood: 0.5,
                  yearly_cashflows: [0.3, 0.6, 0.9, 1.2, 1.5]
                }
              }
            ])
          }
        ],
        usage: { prompt_tokens: 300, completion_tokens: 400 }
      };

      // Mock variator response for generation 2
      // With topSelectCount=2, we have 2 ideas already, need 1 more for populationSize=3
      const variatorResponse2 = {
        output: [
          {
            type: 'text',
            content: JSON.stringify([
              { idea_id: 'gen2-1', description: 'Refined 1', core_mechanism: 'Refined mechanism 1' }
            ])
          }
        ],
        usage: { prompt_tokens: 150, completion_tokens: 250 }
      };

      // Mock enricher response for generation 2
      const enricherResponse2 = {
        output: [
          {
            type: 'text',
            content: JSON.stringify([
              {
                idea_id: 'gen2-1',
                description: 'Refined 1',
                core_mechanism: 'Refined mechanism 1',
                business_case: {
                  npv_success: 10,
                  capex_est: 0.20,
                  risk_factors: ['Risk 1'],
                  timeline_months: 3,
                  likelihood: 0.9,
                  yearly_cashflows: [1, 2, 3, 4, 5]
                }
              },
              {
                idea_id: 'gen1-2',
                description: 'Solution 2',
                core_mechanism: 'Mechanism 2',
                business_case: {
                  npv_success: 8,
                  capex_est: 0.25,
                  risk_factors: ['Risk 2'],
                  timeline_months: 3,
                  likelihood: 0.8,
                  yearly_cashflows: [0.8, 1.6, 2.4, 3.2, 4]
                }
              },
              {
                idea_id: 'gen1-1',
                description: 'Solution 1',
                core_mechanism: 'Mechanism 1',
                business_case: {
                  npv_success: 5,
                  capex_est: 0.30,
                  risk_factors: ['Risk 1'],
                  timeline_months: 4,
                  likelihood: 0.7,
                  yearly_cashflows: [0.5, 1, 1.5, 2, 2.5]
                }
              }
            ])
          }
        ],
        usage: { prompt_tokens: 350, completion_tokens: 450 }
      };

      // Set up the mock responses in order
      mockOpenAI.responses.create
        .mockResolvedValueOnce(variatorResponse1)    // Gen 1 variator
        .mockResolvedValueOnce(enricherResponse1)    // Gen 1 enricher  
        .mockResolvedValueOnce(variatorResponse2)    // Gen 2 variator (1 new idea)
        .mockResolvedValueOnce(enricherResponse2);   // Gen 2 enricher

      const result = await solver.evolve(problemContext, [], customConfig);

      expect(result.topSolutions).toBeDefined();
      expect(result.topSolutions.length).toBeGreaterThan(0);
      expect(result.allSolutions.length).toBeGreaterThan(0);
      expect(result.generationHistory).toHaveLength(2);
      expect(result.totalEvaluations).toBe(6); // 2 generations * 3 population size
      expect(result.topSolutions[0].score).toBeDefined();
      expect(result.topSolutions[0].rank).toBe(1);
      expect(result.apiCallCounts).toEqual({
        variator: 2,
        enricher: 2,
        reformatter: 0,
        total: 4
      });
    });

    it('should handle evolution with initial solutions', async () => {
      const initialSolutions = [
        {
          idea_id: 'initial-1',
          description: 'Initial solution',
          core_mechanism: 'Initial mechanism',
          business_case: {
            npv_success: 4,
            capex_est: 0.35,
            risk_factors: ['Risk 1'],
            timeline_months: 4,
            likelihood: 0.6,
            yearly_cashflows: [0.4, 0.8, 1.2, 1.6, 2]
          }
        }
      ];

      const customConfig = { generations: 1, populationSize: 2 };

      // Only need one new solution to reach population size of 2
      const variatorResponse = {
        output: [
          {
            type: 'text',
            content: JSON.stringify([
              { idea_id: 'new-1', description: 'New solution', core_mechanism: 'New mechanism' }
            ])
          }
        ],
        usage: { prompt_tokens: 100, completion_tokens: 200 }
      };

      const enricherResponse = {
        output: [
          {
            type: 'text',
            content: JSON.stringify([
              {
                idea_id: 'initial-1',
                description: 'Initial solution',
                core_mechanism: 'Initial mechanism',
                business_case: {
                  npv_success: 4,
                  capex_est: 0.35,
                  risk_factors: ['Risk 1'],
                  timeline_months: 4,
                  likelihood: 0.6,
                  yearly_cashflows: [0.4, 0.8, 1.2, 1.6, 2]
                }
              },
              {
                idea_id: 'new-1',
                description: 'New solution',
                core_mechanism: 'New mechanism',
                business_case: {
                  npv_success: 6,
                  capex_est: 0.25,
                  risk_factors: ['Risk 2'],
                  timeline_months: 3,
                  likelihood: 0.75,
                  yearly_cashflows: [0.6, 1.2, 1.8, 2.4, 3]
                }
              }
            ])
          }
        ],
        usage: { prompt_tokens: 200, completion_tokens: 300 }
      };

      mockOpenAI.responses.create
        .mockResolvedValueOnce(variatorResponse)
        .mockResolvedValueOnce(enricherResponse);

      const result = await solver.evolve('Test problem', initialSolutions, customConfig);

      expect(result.topSolutions).toBeDefined();
      expect(result.allSolutions.length).toBeGreaterThanOrEqual(2);
      expect(result.generationHistory).toHaveLength(1);
    });
  });
});