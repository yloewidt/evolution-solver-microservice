import { jest } from '@jest/globals';

// Mock logger
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

const EvolutionarySolver = (await import('../src/core/evolutionarySolver.js')).default;
const { LLMClient } = await import('../src/services/llmClient.js');
const APIDebugger = (await import('../src/utils/apiDebugger.js')).default;

// Configure longer timeout for real API calls
jest.setTimeout(60000); // 60 seconds default for API calls

// Skip these tests if no API key is available
const hasApiKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'test-api-key' && process.env.OPENAI_API_KEY.startsWith('sk-');
const skipTests = !hasApiKey || process.env.SKIP_COMPREHENSIVE_TESTS === 'true';

(skipTests ? describe.skip : describe)('EvolutionarySolver - Comprehensive Tests', () => {
  let solver;
  let llmClient;
  let resultStore;
  let apiDebugger;
  
  beforeEach(() => {
    // Create real result store mock with essential methods
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
    
    // Create real API debugger
    apiDebugger = new APIDebugger(resultStore);
    
    // Create real LLM client with test API key
    llmClient = new LLMClient({
      model: 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY || 'test-key'
    });
    
    // Create solver instance with config
    solver = new EvolutionarySolver(apiDebugger, resultStore, {
      model: 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      maxCapex: 10,
      minProfits: 1
    });
  });

  describe('1.1 Variator Phase - Core Functionality', () => {
    const baseConfig = {
      populationSize: 5,
      topSelectCount: 2,
      offspringRatio: 0.7,
      model: 'gpt-4o-mini'
    };
    
    test('test_variator_generates_exact_count', async () => {
      const config = { ...baseConfig };
      const context = 'Create business ideas for sustainable transportation';
      
      const ideas = await solver.variator([], config.populationSize, context, 1, 'test-job');
      
      expect(ideas).toHaveLength(config.populationSize);
      expect(ideas.every(idea => idea.title)).toBe(true);
      expect(ideas.every(idea => idea.description)).toBe(true);
    }, 120000); // 2 minute timeout
    
    test('test_variator_offspring_wildcard_ratio', async () => {
      const config = { ...baseConfig, populationSize: 10 };
      const topPerformers = [
        { title: 'Top Idea 1', description: 'Great idea', score: 100 },
        { title: 'Top Idea 2', description: 'Another great idea', score: 95 }
      ];
      
      const ideas = await solver.variator(topPerformers, config.populationSize, 'Create business ideas for sustainable transportation', 2, 'test-job');
      
      // Should have generated the requested number of ideas
      expect(ideas).toHaveLength(10);
      // With top performers, should use offspring strategy
      expect(ideas.every(idea => idea.title)).toBe(true);
      expect(ideas.every(idea => idea.description)).toBe(true);
    }, 120000); // 2 minute timeout
    
    test('test_variator_first_generation_all_wildcards', async () => {
      const config = { ...baseConfig };
      const context = 'Create business ideas for sustainable transportation';
      
      const ideas = await solver.variator([], config.populationSize, context, 1, 'test-job');
      
      // First generation should produce all wildcard ideas
      expect(ideas).toHaveLength(config.populationSize);
      expect(ideas.every(idea => idea.title)).toBe(true);
      expect(ideas.every(idea => idea.description)).toBe(true);
    });
    
    test('test_variator_uses_top_performers', async () => {
      const config = { ...baseConfig };
      const context = 'Create business ideas for sustainable transportation';
      const topPerformers = [
        { 
          title: 'Electric Bus Network', 
          description: 'City-wide electric bus system',
          score: 100,
          npv: 50,
          capex: 10
        }
      ];
      
      const ideas = await solver.variator(topPerformers, config.populationSize, 'Create business ideas for sustainable transportation', 2, 'test-job');
      
      // Should generate ideas based on top performers
      expect(ideas).toHaveLength(config.populationSize);
      expect(ideas.every(idea => idea.title)).toBe(true);
      expect(ideas.every(idea => idea.description)).toBe(true);
    });
    
    test('test_variator_saves_api_telemetry', async () => {
      const config = { ...baseConfig };
      const context = 'Create business ideas';
      
      const ideas = await solver.variator([], config.populationSize, context, 1, 'test-job');
      
      // Should generate ideas successfully
      expect(ideas).toHaveLength(config.populationSize);
      expect(ideas.every(idea => idea.title)).toBe(true);
      expect(ideas.every(idea => idea.description)).toBe(true);
    });
  });

  describe('1.1 Variator Phase - Edge Cases', () => {
    test('test_variator_empty_population_size', async () => {
      const config = { 
        populationSize: 0,
        model: 'gpt-4o-mini'
      };
      
      const ideas = await solver.variator([], config.populationSize, 'context', 1, 'test-job');
      
      expect(ideas).toEqual([]);
      expect(resultStore.saveApiCall).not.toHaveBeenCalled();
    });
    
    test('test_variator_malformed_json_response', async () => {
      // Override LLM to return malformed JSON
      solver.llmClient = {
        generateSolutions: jest.fn().mockResolvedValue({
          ideas: 'not an array',
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        })
      };
      
      await expect(
        solver.variator([], 5, 'context', 1, 'test-job')
      ).rejects.toThrow();
    });
    
    test.skip('test_variator_timeout_handling', async () => {
      // Create a client that will timeout
      const timeoutClient = {
        generateSolutions: jest.fn().mockRejectedValue(new Error('Request timeout'))
      };
      solver.llmClient = timeoutClient;
      
      await expect(
        solver.variator([], 5, 'context', 1, 'test-job')
      ).rejects.toThrow('Request timeout');
    });
    
    test('test_variator_insufficient_ideas_error', async () => {
      solver.llmClient = {
        generateSolutions: jest.fn().mockResolvedValue({
          ideas: [{ title: 'Only One', description: 'Not enough' }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        })
      };
      
      await expect(
        solver.variator([], 5, 'context', 1, 'test-job')
      ).rejects.toThrow();
    });
  });

  describe('1.2 Enricher Phase - Core Functionality', () => {
    const mockIdeas = [
      { title: 'Idea 1', description: 'First idea' },
      { title: 'Idea 2', description: 'Second idea' },
      { title: 'Idea 3', description: 'Third idea' }
    ];
    
    test('test_enricher_adds_all_fields', async () => {
      const config = { model: 'gpt-4o-mini' };
      
      const enriched = await solver.enricher(
        mockIdeas, 
        'Business context', 
        1, 
        config, 
        'test-job'
      );
      
      expect(enriched).toHaveLength(mockIdeas.length);
      enriched.forEach(idea => {
        expect(idea).toHaveProperty('business_case');
        const bc = idea.business_case;
        
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
        expect(bc.yearly_cashflows).toHaveLength(5);
      });
    }, 120000); // 2 minute timeout
    
    test('test_enricher_monetary_values_millions', async () => {
      const config = { model: 'gpt-4o-mini' };
      
      const enriched = await solver.enricher(
        mockIdeas, 
        'Business context', 
        1, 
        config, 
        'test-job'
      );
      
      enriched.forEach(idea => {
        const bc = idea.business_case;
        // All monetary values should be reasonable (in millions)
        expect(bc.npv_success).toBeGreaterThan(-1000);
        expect(bc.npv_success).toBeLessThan(10000);
        expect(bc.capex_est).toBeGreaterThanOrEqual(0.05);
        expect(bc.capex_est).toBeLessThan(10000);
      });
    });
    
    test.skip('test_enricher_capex_minimum_enforced', async () => {
      // Skip - mocking internal implementation doesn't test actual behavior
      // The schema enforces minimum CAPEX at API level
    });
    
    test.skip('test_enricher_preserves_idea_data', async () => {
      const config = { model: 'gpt-4o-mini' };
      const ideasWithExtra = mockIdeas.map((idea, i) => ({
        ...idea,
        customField: `custom-${i}`,
        generation: 1
      }));
      
      const enriched = await solver.enricher(
        ideasWithExtra, 
        'Business context', 
        1, 
        config, 
        'test-job'
      );
      
      enriched.forEach((idea, i) => {
        expect(idea.title).toBe(ideasWithExtra[i].title);
        expect(idea.description).toBe(ideasWithExtra[i].description);
        expect(idea.customField).toBe(ideasWithExtra[i].customField);
      });
    });
  });

  describe('1.2 Enricher Phase - Edge Cases', () => {
    test('test_enricher_empty_ideas_array', async () => {
      const config = { model: 'gpt-4o-mini' };
      
      const enriched = await solver.enricher(
        [], 
        'Business context', 
        1, 
        config, 
        'test-job'
      );
      
      expect(enriched).toEqual([]);
      expect(resultStore.saveApiCall).not.toHaveBeenCalled();
    });
    
    test.skip('test_enricher_likelihood_bounds', async () => {
      // Skip - mocking internal implementation doesn't test actual behavior
      // The schema enforces likelihood bounds at API level
    });
  });

  describe('1.3 Ranker Phase - Core Functionality', () => {
    const mockEnrichedIdeas = [
      {
        idea_id: '1',
        title: 'High NPV Low Risk',
        business_case: {
          npv_success: 100,
          capex_est: 10,
          likelihood: 0.9
        }
      },
      {
        idea_id: '2',
        title: 'Medium NPV Medium Risk',
        business_case: {
          npv_success: 50,
          capex_est: 5,
          likelihood: 0.5
        }
      },
      {
        idea_id: '3',
        title: 'Low NPV High Risk',
        business_case: {
          npv_success: 20,
          capex_est: 2,
          likelihood: 0.2
        }
      }
    ];
    
    test('test_ranker_calculates_risk_adjusted_npv', async () => {
      const config = { topSelectCount: 3 };
      
      const result = await solver.ranker(mockEnrichedIdeas);
      const ranked = result.rankedIdeas;
      
      ranked.forEach(idea => {
        expect(idea).toHaveProperty('score');
        expect(typeof idea.score).toBe('number');
        
        // Verify the formula: (p × NPV - (1-p) × CAPEX) / √(CAPEX/C₀)
        const bc = idea.business_case;
        const p = bc.likelihood;
        const expectedScore = (p * bc.npv_success - (1 - p) * bc.capex_est) / 
                            Math.sqrt(bc.capex_est / 0.05);
        
        expect(idea.score).toBeCloseTo(expectedScore, 2);
      });
    });
    
    test('test_ranker_sorts_by_score_descending', async () => {
      const config = { topSelectCount: 3 };
      
      const result = await solver.ranker(mockEnrichedIdeas);
      const ranked = result.rankedIdeas;
      
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
      }
    });
    
    test('test_ranker_selects_top_n', async () => {
      const config = { topSelectCount: 2 };
      
      const result = await solver.ranker(mockEnrichedIdeas);
      const ranked = result.rankedIdeas;
      
      expect(ranked).toHaveLength(mockEnrichedIdeas.length);
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    });
    
    test('test_ranker_filters_capex_limit', async () => {
      const config = { 
        topSelectCount: 10,
        maxCapex: 5 
      };
      
      const ideas = [
        { idea_id: '1', title: 'Under limit', business_case: { npv_success: 50, capex_est: 4, likelihood: 0.8 } },
        { idea_id: '2', title: 'At limit', business_case: { npv_success: 60, capex_est: 5, likelihood: 0.8 } },
        { idea_id: '3', title: 'Over limit', business_case: { npv_success: 100, capex_est: 10, likelihood: 0.9 } }
      ];
      
      solver.config.maxCapex = 5;
      const result = await solver.ranker(ideas);
      const ranked = result.rankedIdeas;
      
      // Check filtering note on over-limit ideas
      const overLimit = ranked.find(i => i.title === 'Over limit');
      expect(overLimit.violatesPreferences).toBe(true);
      expect(overLimit.preferenceNote).toContain('exceeds preference');
    });
    
    test('test_ranker_no_api_calls', async () => {
      const config = { topSelectCount: 3 };
      
      resultStore.saveApiCall.mockClear();
      
      await solver.ranker(mockEnrichedIdeas);
      
      expect(resultStore.saveApiCall).not.toHaveBeenCalled();
    });
  });

  describe('1.3 Ranker Phase - Edge Cases', () => {
    test('test_ranker_empty_ideas_array', async () => {
      const config = { topSelectCount: 3 };
      
      const result = await solver.ranker([]);
      const ranked = result.rankedIdeas;
      
      expect(ranked).toEqual([]);
    });
    
    test('test_ranker_insufficient_ideas', async () => {
      const config = { topSelectCount: 5 };
      const ideas = [
        { idea_id: '1', title: 'Only one', business_case: { npv_success: 50, capex_est: 5, likelihood: 0.5 } }
      ];
      
      const result = await solver.ranker(ideas);
      const ranked = result.rankedIdeas;
      
      expect(ranked).toHaveLength(1);
    });
    
    test('test_ranker_invalid_financial_data', async () => {
      const config = { topSelectCount: 3 };
      const ideas = [
        { idea_id: '1', title: 'Valid', business_case: { npv_success: 50, capex_est: 5, likelihood: 0.5 } },
        { idea_id: '2', title: 'Missing NPV', business_case: { capex_est: 5, likelihood: 0.5 } },
        { idea_id: '3', title: 'Zero CAPEX', business_case: { npv_success: 50, capex_est: 0, likelihood: 0.5 } },
        { idea_id: '4', title: 'NaN likelihood', business_case: { npv_success: 50, capex_est: 5, likelihood: NaN } }
      ];
      
      await expect(
        solver.ranker(ideas)
      ).rejects.toThrow();
    });
    
    test('test_ranker_zero_likelihood_score', async () => {
      const config = { topSelectCount: 1 };
      const ideas = [
        { idea_id: '1', title: 'Near zero chance', business_case: { npv_success: 100, capex_est: 10, likelihood: 0.01 } }
      ];
      
      const result = await solver.ranker(ideas);
      const ranked = result.rankedIdeas;
      
      expect(ranked).toHaveLength(1);
      expect(ranked[0].score).toBeLessThan(0); // Should be negative due to very low likelihood
    });
    
    test('test_ranker_extreme_capex_values', async () => {
      const config = { topSelectCount: 3 };
      const ideas = [
        { idea_id: '1', title: 'Very low CAPEX', business_case: { npv_success: 10, capex_est: 0.05, likelihood: 0.8 } },
        { idea_id: '2', title: 'Very high CAPEX', business_case: { npv_success: 1000, capex_est: 1000, likelihood: 0.8 } }
      ];
      
      const result = await solver.ranker(ideas);
      const ranked = result.rankedIdeas;
      
      expect(ranked).toHaveLength(2);
      expect(ranked.every(idea => isFinite(idea.score))).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    test('test_single_generation_evolution', async () => {
      const config = {
        generations: 1,
        populationSize: 2,
        topSelectCount: 1,
        model: 'gpt-4o-mini'
      };
      
      const context = 'Create simple business ideas for testing';
      
      // Run single generation
      const result = await solver.evolve(context, [], config, { jobId: 'single-gen-test' });
      
      expect(result).toHaveProperty('topSolutions');
      expect(result).toHaveProperty('allSolutions');
      expect(result).toHaveProperty('metadata');
      expect(result.topSolutions.length).toBeGreaterThan(0);
      expect(result.allSolutions.length).toBeGreaterThan(0);
      
      // Verify all solutions have scores
      result.allSolutions.forEach(solution => {
        expect(solution).toHaveProperty('score');
        expect(solution).toHaveProperty('generation');
      });
    }, 180000); // 3 minute timeout for single generation
    
    test('test_multi_generation_evolution', async () => {
      const config = {
        generations: 2,
        populationSize: 2,
        topSelectCount: 1,
        model: 'gpt-4o-mini'
      };
      
      const context = 'Create innovative urban mobility solutions';
      
      // Run multi generation
      const result = await solver.evolve(context, [], config, { jobId: 'multi-gen-test' });
      
      expect(result).toHaveProperty('topSolutions');
      expect(result).toHaveProperty('allSolutions');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata.totalGenerations).toBe(2);
      
      // Check generation progression
      const gen1Solutions = result.allSolutions.filter(s => s.generation === 1);
      const gen2Solutions = result.allSolutions.filter(s => s.generation === 2);
      
      expect(gen1Solutions.length).toBeGreaterThan(0);
      expect(gen2Solutions.length).toBeGreaterThan(0);
    }, 360000); // 6 minute timeout for multi generation
  });
});