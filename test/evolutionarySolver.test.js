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
        output_text: JSON.stringify([
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

    it('should incorporate feedback into prompt', async () => {
      const mockResponse = {
        output_text: JSON.stringify([{ idea_id: 'test-1', description: 'Test', core_mechanism: 'Test' }])
      };

      mockOpenAI.responses.create.mockResolvedValueOnce(mockResponse);

      await solver.variator([], 1, 'Test problem', 'Improve creativity');

      const call = mockOpenAI.responses.create.mock.calls[0][0];
      expect(call.input[1].content[0].text).toContain('EVOLVE THIS PROMPT based on feedback: Improve creativity');
    });
  });

  describe('enricher', () => {
    it('should enrich ideas with business cases', async () => {
      const ideas = [
        { idea_id: 'test-1', description: 'Test solution 1' }
      ];

      const mockResponse = {
        output_text: JSON.stringify([
          {
            ...ideas[0],
            business_case: {
              roi_proj: 5.2,
              capex_est: 45,
              risk_factors: ['Market risk', 'Technical risk'],
              deal_value_percent: 75,
              timeline_months: 4,
              likelihood: 0.7
            }
          }
        ])
      };

      mockOpenAI.responses.create.mockResolvedValueOnce(mockResponse);

      const result = await solver.enricher(ideas);

      expect(result).toHaveLength(1);
      expect(result[0].business_case).toBeDefined();
      expect(result[0].business_case.roi_proj).toBe(5.2);
      expect(result[0].business_case.capex_est).toBe(45);
    });
  });

  describe('ranker', () => {
    it('should rank ideas by score', () => {
      const enrichedIdeas = [
        {
          idea_id: 'low-score',
          business_case: {
            likelihood: 0.3,
            roi_proj: 2,
            capex_est: 40,
            deal_value_percent: 70,
            npv_success: 2
          }
        },
        {
          idea_id: 'high-score',
          business_case: {
            likelihood: 0.8,
            roi_proj: 10,
            capex_est: 20,
            deal_value_percent: 85,
            npv_success: 10
          }
        }
      ];

      const { rankedIdeas, feedback } = solver.ranker(enrichedIdeas);

      expect(rankedIdeas[0].idea_id).toBe('high-score');
      expect(rankedIdeas[1].idea_id).toBe('low-score');
      expect(rankedIdeas[0].rank).toBe(1);
      expect(rankedIdeas[1].rank).toBe(2);
    });

    it('should provide feedback when average score is low', () => {
      const enrichedIdeas = [
        {
          idea_id: 'low-1',
          business_case: {
            likelihood: 0.1,
            roi_proj: 1,
            capex_est: 45,
            deal_value_percent: 60,
            npv_success: 1
          }
        }
      ];

      const { feedback } = solver.ranker(enrichedIdeas);

      expect(feedback).toContain('Boost low-risk filters');
    });
  });

  describe('evolve', () => {
    it('should run complete evolution cycle', async () => {
      const problemContext = 'Test bottleneck problem';
      const customConfig = { generations: 2 };

      // Mock variator response
      const variatorResponse = {
        output_text: JSON.stringify([
          { idea_id: 'gen1-1', description: 'Solution 1', core_mechanism: 'Mechanism 1' },
          { idea_id: 'gen1-2', description: 'Solution 2', core_mechanism: 'Mechanism 2' },
          { idea_id: 'gen1-3', description: 'Solution 3', core_mechanism: 'Mechanism 3' },
          { idea_id: 'gen1-4', description: 'Solution 4', core_mechanism: 'Mechanism 4' },
          { idea_id: 'gen1-5', description: 'Solution 5', core_mechanism: 'Mechanism 5' }
        ])
      };

      // Mock enricher response
      const enricherResponse = {
        output_text: JSON.stringify([
          {
            idea_id: 'gen1-1',
            description: 'Solution 1',
            core_mechanism: 'Mechanism 1',
            business_case: {
              roi_proj: 5, capex_est: 30, risk_factors: [], 
              deal_value_percent: 75, timeline_months: 4, likelihood: 0.7,
              npv_success: 5
            }
          },
          {
            idea_id: 'gen1-2',
            description: 'Solution 2',
            core_mechanism: 'Mechanism 2',
            business_case: {
              roi_proj: 8, capex_est: 25, risk_factors: [], 
              deal_value_percent: 80, timeline_months: 3, likelihood: 0.8,
              npv_success: 8
            }
          },
          {
            idea_id: 'gen1-3',
            description: 'Solution 3',
            core_mechanism: 'Mechanism 3',
            business_case: {
              roi_proj: 3, capex_est: 40, risk_factors: [], 
              deal_value_percent: 70, timeline_months: 5, likelihood: 0.5,
              npv_success: 3
            }
          },
          {
            idea_id: 'gen1-4',
            description: 'Solution 4',
            core_mechanism: 'Mechanism 4',
            business_case: {
              roi_proj: 6, capex_est: 35, risk_factors: [], 
              deal_value_percent: 75, timeline_months: 4, likelihood: 0.6,
              npv_success: 6
            }
          },
          {
            idea_id: 'gen1-5',
            description: 'Solution 5',
            core_mechanism: 'Mechanism 5',
            business_case: {
              roi_proj: 4, capex_est: 45, risk_factors: [], 
              deal_value_percent: 70, timeline_months: 6, likelihood: 0.4,
              npv_success: 4
            }
          }
        ])
      };

      // Mock refiner response for generation 1
      const refinerResponse = {
        output_text: JSON.stringify([
          { idea_id: 'gen2-1', description: 'Refined 1', core_mechanism: 'Refined mechanism 1' },
          { idea_id: 'gen2-2', description: 'Refined 2', core_mechanism: 'Refined mechanism 2' },
          { idea_id: 'gen2-3', description: 'Refined 3', core_mechanism: 'Refined mechanism 3' },
          { idea_id: 'gen2-4', description: 'Refined 4', core_mechanism: 'Refined mechanism 4' },
          { idea_id: 'gen2-5', description: 'Refined 5', core_mechanism: 'Refined mechanism 5' }
        ])
      };

      // Mock enricher response for generation 2
      const enricherResponse2 = {
        output_text: JSON.stringify([
          {
            idea_id: 'gen2-1',
            description: 'Refined 1',
            core_mechanism: 'Refined mechanism 1',
            business_case: {
              roi_proj: 10, capex_est: 20, risk_factors: [], 
              deal_value_percent: 85, timeline_months: 3, likelihood: 0.9,
              npv_success: 10
            }
          },
          {
            idea_id: 'gen2-2',
            description: 'Refined 2',
            core_mechanism: 'Refined mechanism 2',
            business_case: {
              roi_proj: 9, capex_est: 22, risk_factors: [], 
              deal_value_percent: 82, timeline_months: 3, likelihood: 0.85,
              npv_success: 9
            }
          },
          {
            idea_id: 'gen2-3',
            description: 'Refined 3',
            core_mechanism: 'Refined mechanism 3',
            business_case: {
              roi_proj: 7, capex_est: 28, risk_factors: [], 
              deal_value_percent: 78, timeline_months: 4, likelihood: 0.75,
              npv_success: 7
            }
          },
          {
            idea_id: 'gen2-4',
            description: 'Refined 4',
            core_mechanism: 'Refined mechanism 4',
            business_case: {
              roi_proj: 6, capex_est: 32, risk_factors: [], 
              deal_value_percent: 76, timeline_months: 4, likelihood: 0.7,
              npv_success: 6
            }
          },
          {
            idea_id: 'gen2-5',
            description: 'Refined 5',
            core_mechanism: 'Refined mechanism 5',
            business_case: {
              roi_proj: 5, capex_est: 38, risk_factors: [], 
              deal_value_percent: 72, timeline_months: 5, likelihood: 0.65,
              npv_success: 5
            }
          }
        ])
      };

      mockOpenAI.responses.create
        .mockResolvedValueOnce(variatorResponse)    // Gen 1 variator
        .mockResolvedValueOnce(enricherResponse)    // Gen 1 enricher
        .mockResolvedValueOnce(refinerResponse)     // Gen 1 refiner
        .mockResolvedValueOnce(enricherResponse2);  // Gen 2 enricher

      const result = await solver.evolve(problemContext, [], customConfig);

      expect(result.topSolutions).toHaveLength(5);
      expect(result.allSolutions.length).toBeGreaterThan(0);
      expect(result.generationHistory).toHaveLength(2);
      expect(result.totalEvaluations).toBe(10); // 2 generations * 5 population size
      expect(result.topSolutions[0].score).toBeDefined();
      expect(result.topSolutions[0].rank).toBe(1);
    });
  });

  describe('parseResponse', () => {
    it('should parse various response formats', async () => {
      const testCases = [
        {
          name: 'output_text format',
          response: { output_text: '[{"id": 1}]' },
          expected: [{ id: 1 }]
        },
        {
          name: 'content array format',
          response: { content: [{ type: 'text', text: '[{"id": 2}]' }] },
          expected: [{ id: 2 }]
        },
        {
          name: 'message content format',
          response: { message: { content: '[{"id": 3}]' } },
          expected: [{ id: 3 }]
        }
      ];

      for (const testCase of testCases) {
        const result = await solver.parseResponse(testCase.response);
        expect(result).toEqual(testCase.expected);
      }
    });

    it('should handle malformed JSON with GPT-4o fallback', async () => {
      const malformedResponse = {
        output_text: 'Here is the JSON: [{"id": 1, "broken'
      };

      const reformattedResponse = {
        choices: [{
          message: {
            content: '[{"id": 1, "fixed": true}]'
          }
        }]
      };

      mockOpenAI.chat.completions.create.mockResolvedValueOnce(reformattedResponse);

      const result = await solver.parseResponse(malformedResponse, 'test prompt');

      expect(result).toEqual([{ id: 1, fixed: true }]);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });
  });
});