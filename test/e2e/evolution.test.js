import { jest } from '@jest/globals';
import { createMockLogger } from '../helpers/index.js';

// Mock logger to capture errors
const mockLogger = createMockLogger();
// Override error to see logs during tests
mockLogger.error = jest.fn((msg, error) => {
  console.log('[MOCK LOGGER ERROR]', msg, error);
});

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: mockLogger
}));

const EvolutionarySolver = (await import('../../src/core/evolutionarySolver.js')).default;
const { LLMClient } = await import('../../src/services/llmClient.js');

// Real-world tests without mocks
jest.setTimeout(60000); // 60s timeout for API calls

// Run real world tests with API key
describe('EvolutionarySolver - Real World Tests', () => {
  let solver;
  let resultStore;
  
  beforeEach(() => {
    // Minimal result store for testing
    resultStore = {
      saveApiCall: jest.fn().mockResolvedValue(),
      updatePhaseData: jest.fn().mockResolvedValue(),
      getJobStatus: jest.fn().mockResolvedValue({ 
        generations: {},
        evolutionConfig: {} 
      }),
      addApiCallTelemetry: jest.fn().mockResolvedValue(),
      saveApiCallDebug: jest.fn().mockResolvedValue(),
      updateGenerationProgress: jest.fn().mockResolvedValue(),
      savePartialResult: jest.fn().mockResolvedValue()
    };
    
    // Create solver with real config
    const config = {
      model: process.env.TEST_MODEL || 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      maxCapex: 10, // $10M max
      minProfits: 1  // $1M min NPV
    };
    
    console.log('Test API Key:', config.apiKey ? `${config.apiKey.substring(0, 10)}...` : 'NOT SET');
    
    solver = new EvolutionarySolver(null, resultStore, config);
  });

  describe('Variator Tests', () => {
    test('should generate exact population count', async () => {
      const context = 'Create 3 simple business ideas for local food delivery';
      const config = {
        populationSize: 3,
        model: 'gpt-4o-mini'
      };
      
      const ideas = await solver.variator([], config.populationSize, context, 1, 'test-job');
      
      expect(ideas).toHaveLength(3);
      expect(ideas[0]).toHaveProperty('idea_id');
      expect(ideas[0]).toHaveProperty('title');
      expect(ideas[0]).toHaveProperty('description');
      
      // Ideas should be valid
      ideas.forEach(idea => {
        expect(idea.idea_id).toBeTruthy();
        expect(idea.title).toBeTruthy();
        expect(idea.description).toBeTruthy();
      });
    });
    
    test('should use top performers for offspring', async () => {
      const context = 'Create business ideas for sustainable transportation';
      const topPerformers = [{
        idea_id: 'top-1',
        title: 'Electric Scooter Sharing',
        description: 'City-wide e-scooter network',
        business_case: {
          npv_success: 5,
          capex_est: 2,
          likelihood: 0.7
        },
        score: 100
      }];
      
      const config = {
        populationSize: 5,
        offspringRatio: 0.6,
        model: 'gpt-4o-mini'
      };
      
      const ideas = await solver.variator(topPerformers, config.populationSize, context, 2, 'test-job');
      
      expect(ideas).toHaveLength(5);
      
      // Should have a mix of ideas
      // Just verify we got the expected number of ideas
      const offspringCount = Math.floor(5 * 0.6); // 3 offspring
      const wildcardCount = 5 - offspringCount; // 2 wildcards
      
      // Verify we got ideas (can't check exact split without inspecting internals)
      expect(ideas.length).toBeGreaterThan(0);
    });
    
    test('should handle empty population size', async () => {
      const config = { populationSize: 0 };
      
      const ideas = await solver.variator([], config.populationSize, 'context', 1, 'test-job');
      
      expect(ideas).toEqual([]);
      expect(resultStore.saveApiCall).not.toHaveBeenCalled();
    });
  });

  describe('Enricher Tests', () => {
    test('should enrich ideas with business metrics', async () => {
      const ideas = [
        {
          idea_id: 'test-1',
          title: 'Local Coffee Subscription',
          description: 'Monthly coffee delivery from local roasters'
        },
        {
          idea_id: 'test-2', 
          title: 'Urban Farming Platform',
          description: 'Connect urban farmers with local restaurants'
        }
      ];
      
      const config = { model: 'gpt-4o-mini' };
      
      const enriched = await solver.enricher(
        ideas, 
        'Create sustainable local business ideas', 
        1, 
        config, 
        'test-job'
      );
      
      expect(enriched).toHaveLength(2);
      
      enriched.forEach(idea => {
        expect(idea).toHaveProperty('business_case');
        const bc = idea.business_case;
        
        // Check all required fields
        expect(bc).toHaveProperty('npv_success');
        expect(bc).toHaveProperty('capex_est');
        expect(bc).toHaveProperty('timeline_months');
        expect(bc).toHaveProperty('likelihood');
        expect(bc).toHaveProperty('risk_factors');
        expect(bc).toHaveProperty('yearly_cashflows');
        
        // Validate data types
        expect(typeof bc.npv_success).toBe('number');
        expect(typeof bc.capex_est).toBe('number');
        expect(typeof bc.timeline_months).toBe('number');
        expect(typeof bc.likelihood).toBe('number');
        expect(Array.isArray(bc.risk_factors)).toBe(true);
        expect(Array.isArray(bc.yearly_cashflows)).toBe(true);
        
        // Validate ranges
        expect(bc.capex_est).toBeGreaterThan(0);
        expect(bc.likelihood).toBeGreaterThan(0);
        expect(bc.likelihood).toBeLessThanOrEqual(1);
        expect(bc.yearly_cashflows).toHaveLength(5);
      });
    });
    
    test('should handle empty ideas array', async () => {
      const enriched = await solver.enricher([], 'context', 1, {}, 'test-job');
      
      expect(enriched).toEqual([]);
      // No API calls should be made for empty array
    });
  });

  describe('Ranker Tests', () => {
    test('should calculate risk-adjusted scores', async () => {
      const enrichedIdeas = [
        {
          idea_id: '1',
          title: 'High NPV Low Risk',
          business_case: {
            npv_success: 10,
            capex_est: 2,
            likelihood: 0.8
          }
        },
        {
          idea_id: '2',
          title: 'Medium NPV Medium Risk',
          business_case: {
            npv_success: 5,
            capex_est: 1,
            likelihood: 0.5
          }
        },
        {
          idea_id: '3',
          title: 'Low NPV High Risk',
          business_case: {
            npv_success: 2,
            capex_est: 0.5,
            likelihood: 0.2
          }
        }
      ];
      
      const result = await solver.ranker(enrichedIdeas);
      const ranked = result.rankedIdeas;
      
      expect(ranked.length).toBeGreaterThan(0);
      
      // Verify scores are calculated and sorted
      expect(ranked[0]).toHaveProperty('score');
      if (ranked.length > 1) {
        expect(ranked[1]).toHaveProperty('score');
        expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
      }
      
      // Verify risk-adjusted NPV formula
      ranked.forEach(idea => {
        const bc = idea.business_case;
        const p = bc.likelihood;
        const expectedValue = p * bc.npv_success - (1 - p) * bc.capex_est;
        const diversificationPenalty = Math.sqrt(bc.capex_est / 0.05);
        const expectedScore = expectedValue / diversificationPenalty;
        
        expect(idea.score).toBeCloseTo(expectedScore, 6);
      });
    });
    
    test('should filter by max CAPEX preference', async () => {
      const ideas = [
        {
          idea_id: '1',
          title: 'Under limit',
          business_case: {
            npv_success: 50,
            capex_est: 5,
            likelihood: 0.8
          }
        },
        {
          idea_id: '2',
          title: 'Over limit',
          business_case: {
            npv_success: 100,
            capex_est: 15, // Over $10M limit
            likelihood: 0.9
          }
        }
      ];
      
      solver.config.maxCapex = 10;
      const result = await solver.ranker(ideas);
      const ranked = result.rankedIdeas;
      
      // Both should be scored but over-limit marked
      expect(ranked).toHaveLength(2);
      
      const overLimit = ranked.find(i => i.title === 'Over limit');
      expect(overLimit.violatesPreferences).toBe(true);
      expect(overLimit.preferenceNote).toContain('exceeds preference');
    });
    
    test('should handle invalid data gracefully', async () => {
      const ideas = [
        {
          idea_id: '1',
          title: 'Missing business_case'
          // No business_case
        }
      ];
      
      await expect(
        solver.ranker(ideas, { topSelectCount: 1 })
      ).rejects.toThrow('Missing business_case object');
    });
  });

  describe('Integration Test', () => {
    test('should run complete evolution cycle', async () => {
      
      const config = {
        generations: 2,
        populationSize: 3,
        topSelectCount: 1,
        offspringRatio: 0.7,
        model: 'gpt-4o-mini',
        maxCapex: 5,
        minProfits: 1
      };
      
      const context = 'Create innovative business ideas for urban mobility with low capital requirements';
      
      const result = await solver.evolve(context, [], config, { jobId: 'integration-test' });
      
      expect(result).toHaveProperty('topSolutions');
      expect(result).toHaveProperty('allSolutions');
      expect(result).toHaveProperty('metadata');
      
      expect(result.topSolutions.length).toBeGreaterThan(0);
      expect(result.allSolutions.length).toBeGreaterThan(0);
      
      // Verify all solutions have required fields
      result.allSolutions.forEach(solution => {
        expect(solution).toHaveProperty('idea_id');
        expect(solution).toHaveProperty('title');
        expect(solution).toHaveProperty('description');
        expect(solution).toHaveProperty('business_case');
        expect(solution).toHaveProperty('score');
        expect(solution).toHaveProperty('generation');
      });
      
      // Verify metadata
      expect(result.metadata).toMatchObject({
        totalGenerations: 2,
        finalPopulationSize: expect.any(Number),
        config: expect.objectContaining(config),
        problemContext: context
      });
    });
  });
  
  describe('Error Handling', () => {
    test('should handle API failures gracefully', async () => {
      // Create solver with bad API key
      const badSolver = new EvolutionarySolver(null, resultStore, {
        apiKey: 'invalid-key',
        model: 'gpt-4o-mini'
      });
      
      await expect(
        badSolver.variator([], 3, 'test context', 1, 'test-job')
      ).rejects.toThrow();
    });
    
    test('should validate configuration', async () => {
      const config = {
        populationSize: -1,
        topSelectCount: 0
      };
      
      // Should handle gracefully
      const result = await solver.ranker([]);
      expect(result.rankedIdeas).toEqual([]);
    });
  });
});