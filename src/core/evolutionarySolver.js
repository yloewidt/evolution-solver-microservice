import logger from '../utils/logger.js';
import { ResponseParser } from '../utils/responseParser.js';
import { LLMClient } from '../services/llmClient.js';

class EvolutionarySolver {
  constructor(apiDebugger = null, resultStore = null, config = {}) {
    // API call tracking - ensure exactly 1 call per operation
    this.apiCallCounts = {
      variator: 0,
      enricher: 0,
      total: 0
    };
    // Initialize LLM client - it will handle API style detection
    this.llmClient = null; // Will be initialized with model config
    
    // Store dependencies
    this.apiDebugger = apiDebugger;
    this.resultStore = resultStore;

    this.config = {
      generations: process.env.EVOLUTION_GENERATIONS ? parseInt(process.env.EVOLUTION_GENERATIONS) : 10,
      populationSize: 5,
      topSelectCount: 3,
      maxCapex: 100000,  // $100B in millions (effectively no limit)
      minProfits: 0,     // No minimum NPV filter
      diversificationUnit: 0.05,  // $50K in millions
      model: 'o3',
      fallbackModel: 'gpt-4o',
      offspringRatio: 0.7,
      dealTypes: 'creative partnerships and business models',
      maxRetries: process.env.EVOLUTION_MAX_RETRIES ? parseInt(process.env.EVOLUTION_MAX_RETRIES) : 3,
      retryDelay: 1000,
      enableRetries: process.env.EVOLUTION_ENABLE_RETRIES === 'true' || false,
      enableGracefulDegradation: process.env.EVOLUTION_GRACEFUL_DEGRADATION === 'true' || false,
      ...config  // Override with passed config
    };
  }

  /**
   * Retry wrapper for LLM calls
   */
  async retryLLMCall(operation, phase, generation, jobId) {
    if (!this.config.enableRetries) {
      // Original behavior - no retries
      return await operation();
    }
    
    const maxRetries = this.config.maxRetries || 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`${phase} API call - attempt ${attempt}/${maxRetries}`);
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        const isRetryable = error.status === 429 || // Rate limit
                          error.status === 500 || // Server error
                          error.status === 502 || // Bad gateway
                          error.status === 503 || // Service unavailable
                          error.status === 504 || // Gateway timeout
                          error.code === 'ECONNRESET' ||
                          error.code === 'ETIMEDOUT';
        
        if (!isRetryable || attempt === maxRetries) {
          logger.error(`${phase} failed after ${attempt} attempts:`, error);
          throw error;
        }
        
        // Exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
        logger.warn(`${phase} attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  async variator(currentSolutions = [], targetCount = 5, problemContext = '', generation = 1, jobId = null, attempt = 1) {
    const numNeeded = targetCount - currentSolutions.length;
    if (numNeeded <= 0) return currentSolutions;

    let startTime = Date.now(); // Define at method level for error handling

    // Get configuration
    const dealTypes = this.config.dealTypes || 'creative partnerships and business models';
    const maxCapex = this.config.maxCapex || 100000;  // Default: no limit
    const minProfits = this.config.minProfits || 0;
    const offspringRatio = this.config.offspringRatio || 0.7;

    // Calculate offspring vs wildcard split
    const offspringCount = currentSolutions.length > 0 ? Math.floor(numNeeded * offspringRatio) : 0;
    const wildcardCount = numNeeded - offspringCount;

    // Build guidance text based on preferences
    let guidanceText = '';
    if (maxCapex < 100) {
      guidanceText += `\n\nPREFERRED APPROACH: Focus on capital-efficient solutions with initial investment under $${maxCapex}M. Low-cost, high-impact strategies are especially valued.`;
    }
    if (minProfits > 0) {
      guidanceText += `\nTARGET OUTCOME: Aim for solutions with 5-year NPV potential above $${minProfits}M.`;
    }

    const prompt = `Problem to solve: ${problemContext}${guidanceText}

${currentSolutions.length > 0 ? `Top ${currentSolutions.length} performing solutions from previous generation:
${JSON.stringify(currentSolutions, null, 2)}

Generate ${numNeeded} new solutions as JSON array:
- ${offspringCount} OFFSPRING: Combine and evolve the top performers' best features. Mix their approaches, enhance strengths, fix weaknesses. Create true hybrids that build on what works.
- ${wildcardCount} WILDCARDS: Completely fresh approaches unrelated to previous solutions. Explore new angles, industries, or mechanisms.
` : `Generate EXACTLY ${numNeeded} new creative business solutions as JSON array. IMPORTANT: Return exactly ${numNeeded} ideas, no more, no less.`}

Each solution must have:
- "idea_id": unique identifier (e.g., "he3_fusion_swap_v2")
- "description": Business model in plain terms. Focus on ${dealTypes}
- "core_mechanism": How value is created and captured

Requirements:
- Business models must be realistic and implementable
- Explain complex ideas simply (avoid jargon)
- Focus on partnerships that reduce capital requirements
- Consider timing advantages (why now?)

IMPORTANT: Return ONLY the raw JSON array. Do not wrap the output in markdown code blocks, do not add any explanations or text before/after the JSON. The response must start with [ and end with ]`;

    // NO RETRIES - exactly 1 API call
    try {
      logger.info('Variator API call - NO RETRIES ALLOWED');

      // Initialize LLM client if not already done
      if (!this.llmClient) {
        this.llmClient = new LLMClient({
          model: this.config.model,
          fallbackModel: this.config.fallbackModel,
          apiKey: this.config.apiKey
        });
      }

      // Prepare API call using LLM client
      const apiCall = await this.llmClient.createVariatorRequest(prompt);

      // Log the full API call for replay
      const callId = `${this.progressTracker?.jobId || 'unknown'}_gen${this.currentGeneration || 0}_variator_${Date.now()}`;
      logger.info('API_CALL_REPLAY:', {
        callId,
        phase: 'variator',
        generation: this.currentGeneration || 0,
        attempt: 1,  // Always 1 - no retries
        timestamp: new Date().toISOString(),
        request: {
          model: apiCall.model,
          promptLength: prompt.length,
          promptPreview: prompt.substring(0, 200) + '...',
          fullPrompt: prompt  // Full prompt for replay
        }
      });

      startTime = Date.now();

      // Track API call BEFORE making it
      this.apiCallCounts.variator++;
      this.apiCallCounts.total++;
      logger.info(`VARIATOR API CALL #${this.apiCallCounts.variator} (Total: ${this.apiCallCounts.total})`);

      const response = await this.retryLLMCall(
        () => this.llmClient.client.chat.completions.create(apiCall),
        'variator',
        generation,
        jobId
      );

      logger.info('Variator response received');

      // Log the full response for replay
      logger.info('API_RESPONSE_REPLAY:', {
        callId,
        phase: 'variator',
        generation: this.currentGeneration || 0,
        latencyMs: Date.now() - startTime,
        usage: response.usage,
        responseStructure: {
          hasOutput: !!response.output,
          outputTypes: response.output?.map(o => o.type),
          outputCount: response.output?.length
        },
        fullResponse: JSON.stringify(response)  // Full response for replay
      });

      // Parse response based on API style
      const newIdeas = this.llmClient.getApiStyle() === 'openai' 
        ? ResponseParser.parseOpenAIResponse(response, 'variator')
        : ResponseParser.parseVariatorResponse(response);

      // Track API call telemetry
      if (this.progressTracker?.resultStore && this.progressTracker?.jobId && response) {
        const telemetry = {
          timestamp: new Date().toISOString(),
          phase: 'variator',
          generation: this.currentGeneration || 1,
          model: this.config.model,
          attempt: 1,  // Always 1 - no retries
          latencyMs: Date.now() - startTime,
          tokens: response.usage || { prompt_tokens: 0, completion_tokens: 0 },
          success: true
        };
        await this.progressTracker.resultStore.addApiCallTelemetry(this.progressTracker.jobId, telemetry);

        // Save full debug data
        await this.progressTracker.resultStore.saveApiCallDebug(
          this.progressTracker.jobId,
          callId,
          {
            phase: 'variator',
            generation: this.currentGeneration || 0,
            attempt: 1,  // Always 1 - no retries
            prompt,
            fullResponse: response,
            parsedResponse: newIdeas,
            usage: response.usage,
            latencyMs: Date.now() - startTime
          }
        );
      }

      logger.info('ParseResponse returned:', {
        type: typeof newIdeas,
        isArray: Array.isArray(newIdeas),
        length: Array.isArray(newIdeas) ? newIdeas.length : 'N/A',
        sample: Array.isArray(newIdeas) && newIdeas.length > 0 ? newIdeas[0] : newIdeas
      });

      const ideasArray = Array.isArray(newIdeas) ? newIdeas : [newIdeas];

      // Validate count and trim if necessary
      if (ideasArray.length > numNeeded) {
        logger.warn(`Variator returned ${ideasArray.length} ideas but only ${numNeeded} were requested. Trimming to requested count.`);
        ideasArray.splice(numNeeded);
      } else if (ideasArray.length < numNeeded) {
        logger.warn(`Variator returned only ${ideasArray.length} ideas but ${numNeeded} were requested.`);
      }

      logger.info(`Working with ${ideasArray.length} new ideas`);
      return [...currentSolutions, ...ideasArray];
    } catch (error) {
      logger.error('Variator failed - NO RETRIES:', error.message);
      logger.error('Error details:', error.stack);

      // Track failed attempt
      if (this.progressTracker?.resultStore && this.progressTracker?.jobId) {
        const telemetry = {
          timestamp: new Date().toISOString(),
          phase: 'variator',
          generation: this.currentGeneration || 1,
          model: this.config.model,
          attempt: 1,  // Always 1 - no retries
          latencyMs: Date.now() - startTime,
          tokens: { prompt_tokens: 0, completion_tokens: 0 },
          success: false,
          error: error.message
        };
        await this.progressTracker.resultStore.addApiCallTelemetry(this.progressTracker.jobId, telemetry);
      }

      // Check if it's a retriable error (timeouts or server errors)
      const isTimeout = error.message && error.message.includes('timed out');
      const isServerError = error.message && (
        error.message.includes('502') ||
          error.message.includes('503') ||
          error.message.includes('504') ||
          error.message.includes('Bad gateway') ||
          error.message.includes('Service unavailable') ||
          error.message.includes('Gateway timeout')
      );

      if (isTimeout || isServerError) {
        const errorType = isTimeout ? 'timeout' : 'server error';
        logger.warn(`Retriable ${errorType} detected - allowing retry`);
        // For retriable errors, we allow up to 3 attempts total
        if (attempt < 3) {
          logger.info(`Retrying variator due to ${errorType} (attempt ${attempt + 1}/3)`);
          this.apiCallCounts.variator++; // Count the retry
          this.apiCallCounts.total++;
          // Add a small delay before retry for server errors
          if (isServerError) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
          }
          return this.variator(currentSolutions, targetCount, problemContext, generation, jobId, attempt + 1);
        }
      }

      // NO FALLBACK - let it fail to ensure exactly 1 API call
      throw error;
    }
  }

  async enricher(ideas, problemContext, generation = 1, config = {}, jobId = null, attempt = 1) {
    // Handle empty ideas array
    if (!ideas || ideas.length === 0) {
      logger.info('Enricher: No ideas to enrich');
      return [];
    }
    
    logger.info('Enricher received ideas:', {
      count: ideas.length,
      firstIdea: ideas[0],
      allIds: Array.isArray(ideas) ? ideas.map(i => i?.idea_id || 'NO_ID') : 'NOT_AN_ARRAY',
      ideasType: typeof ideas,
      isArray: Array.isArray(ideas)
    });

    let startTime = Date.now(); // Define at method level for error handling

    // Get configuration for preferences
    const maxCapex = this.config.maxCapex || 100000;
    const minProfits = this.config.minProfits || 0;

    // Build preference guidance
    let preferenceGuidance = '';
    if (maxCapex < 100) {
      preferenceGuidance += `\n\nPREFERRED APPROACH: When analyzing these ideas, note that capital-efficient solutions under $${maxCapex}M initial investment are preferred. Consider creative ways to reduce upfront costs through partnerships, phased rollouts, or asset-light models.`;
    }
    if (minProfits > 0) {
      preferenceGuidance += `\nTARGET RETURNS: Solutions should ideally achieve 5-year NPV above $${minProfits}M. Look for high-impact, scalable opportunities.`;
    }

    const enrichPrompt = `Problem context: ${problemContext}

Analyze each business idea and calculate key metrics:

Required fields in business_case object (ALL monetary values in millions USD):
- "npv_success": 5-year NPV if successful in $M (discounted at 10% annually)
- "capex_est": Initial capital required in $M (e.g., 0.075 = $75K)
- "timeline_months": Time to first revenue
- "likelihood": Success probability (0-1)
- "risk_factors": Array of key risks (technical, market, regulatory, execution)
- "yearly_cashflows": Array of 5 yearly cash flows in $M

IMPORTANT: All monetary values must be in millions. Examples:
- $50K = 0.05
- $100K = 0.1
- $1M = 1.0
- $50M = 50.0${preferenceGuidance}

Analysis steps:
1. Market size and growth potential
2. Revenue projections by year (in $M)
3. Cost structure and capital requirements (in $M)
4. Risk assessment across all dimensions
5. NPV calculation using 10% discount rate

Ideas to analyze:
${JSON.stringify(ideas, null, 2)}

Return JSON array with original fields plus business_case object.

IMPORTANT: Return ONLY the raw JSON array. Do not wrap the output in markdown code blocks, do not add any explanations or text before/after the JSON. The response must start with [ and end with ]`;

    // NO RETRIES - exactly 1 API call
    try {
      logger.info('Enricher API call - NO RETRIES ALLOWED');

      // Initialize LLM client if not already done
      if (!this.llmClient) {
        this.llmClient = new LLMClient({
          model: this.config.model,
          fallbackModel: this.config.fallbackModel,
          apiKey: this.config.apiKey
        });
      }

      // Prepare API call using LLM client
      const apiCall = await this.llmClient.createEnricherRequest(enrichPrompt);

      // Log the full API call for replay
      const callId = `${this.progressTracker?.jobId || 'unknown'}_gen${this.currentGeneration || 0}_enricher_${Date.now()}`;
      logger.info('API_CALL_REPLAY:', {
        callId,
        phase: 'enricher',
        generation: this.currentGeneration || 0,
        attempt: 1,  // Always 1 - no retries
        timestamp: new Date().toISOString(),
        request: {
          model: apiCall.model,
          promptLength: enrichPrompt.length,
          promptPreview: enrichPrompt.substring(0, 200) + '...',
          fullPrompt: enrichPrompt  // Full prompt for replay
        }
      });

      startTime = Date.now();

      // Track API call BEFORE making it
      this.apiCallCounts.enricher++;
      this.apiCallCounts.total++;
      logger.info(`ENRICHER API CALL #${this.apiCallCounts.enricher} (Total: ${this.apiCallCounts.total})`);

      const response = await this.retryLLMCall(
        () => this.llmClient.client.chat.completions.create(apiCall),
        'enricher',
        generation,
        jobId
      );

      logger.info('Enricher response received');

      // Log the full response for replay
      logger.info('API_RESPONSE_REPLAY:', {
        callId,
        phase: 'enricher',
        generation: this.currentGeneration || 0,
        latencyMs: Date.now() - startTime,
        usage: response.usage,
        responseStructure: {
          hasOutput: !!response.output,
          outputTypes: response.output?.map(o => o.type),
          outputCount: response.output?.length
        },
        fullResponse: JSON.stringify(response)  // Full response for replay
      });

      // Parse response based on API style
      const enrichedIdeas = this.llmClient.getApiStyle() === 'openai'
        ? ResponseParser.parseOpenAIResponse(response, 'enricher')
        : ResponseParser.parseEnricherResponse(response);

      // Track API call telemetry
      if (this.progressTracker?.resultStore && this.progressTracker?.jobId && response) {
        const telemetry = {
          timestamp: new Date().toISOString(),
          phase: 'enricher',
          generation: this.currentGeneration || 1,
          model: this.config.model,
          attempt: 1,  // Always 1 - no retries
          latencyMs: Date.now() - startTime,
          tokens: response.usage || { prompt_tokens: 0, completion_tokens: 0 },
          success: true
        };
        await this.progressTracker.resultStore.addApiCallTelemetry(this.progressTracker.jobId, telemetry);

        // Save full debug data
        await this.progressTracker.resultStore.saveApiCallDebug(
          this.progressTracker.jobId,
          callId,
          {
            phase: 'enricher',
            generation: this.currentGeneration || 0,
            attempt: 1,  // Always 1 - no retries
            prompt: enrichPrompt,
            inputIdeas: ideas,
            fullResponse: response,
            parsedResponse: enrichedIdeas,
            usage: response.usage,
            latencyMs: Date.now() - startTime
          }
        );
      }

      return enrichedIdeas;
    } catch (error) {
      // Graceful degradation - return ideas with default business case
      if (this.config.enableGracefulDegradation) {
        logger.warn('Enricher failed, using default values for business case:', error.message);
        
        return ideas.map(idea => ({
          ...idea,
          business_case: {
            npv_success: 5.0, // Default $5M NPV
            capex_est: 1.0,   // Default $1M CAPEX
            timeline_months: 12,
            likelihood: 0.5,  // 50% default probability
            risk_factors: ['Unable to analyze - using defaults'],
            yearly_cashflows: [-1.0, 0.5, 1.5, 2.0, 2.5]
          },
          enrichment_note: 'Default values used due to enrichment failure'
        }));
      }
      
      logger.error('Enricher failed - NO RETRIES:', error.message);

      // Check if it's a retriable error (timeouts or server errors)
      const isTimeout = error.message && error.message.includes('timed out');
      const isServerError = error.message && (
        error.message.includes('502') ||
          error.message.includes('503') ||
          error.message.includes('504') ||
          error.message.includes('Bad gateway') ||
          error.message.includes('Service unavailable') ||
          error.message.includes('Gateway timeout')
      );

      if (isTimeout || isServerError) {
        const errorType = isTimeout ? 'timeout' : 'server error';
        logger.warn(`Retriable ${errorType} detected - allowing retry`);
        // For retriable errors, we allow up to 3 attempts total
        const currentAttempt = attempt || 1;
        if (currentAttempt < 3) {
          logger.info(`Retrying enricher due to ${errorType} (attempt ${currentAttempt + 1}/3)`);
          this.apiCallCounts.enricher++; // Count the retry
          this.apiCallCounts.total++;
          // Add a small delay before retry for server errors
          if (isServerError) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
          }
          return this.enricher(ideas, problemContext, generation, config, jobId, currentAttempt + 1);
        }
      }

      // NO FALLBACK - let it fail to ensure exactly 1 API call
      throw error;
    }
  }

  async ranker(enrichedIdeas) {
    // Get config parameters (all in millions USD)
    const C0 = this.config.diversificationUnit || 0.05; // Default $50K in millions
    const maxCapex = this.config.maxCapex || Infinity;
    const minProfits = this.config.minProfits || 0;

    // Validate all ideas have required fields
    const validationErrors = [];
    enrichedIdeas.forEach((idea, index) => {
      if (!idea.business_case) {
        validationErrors.push(`Idea ${idea.idea_id || index}: Missing business_case object`);
        return;
      }

      const bc = idea.business_case;

      // Check required fields exist
      if (bc.npv_success === undefined) {
        validationErrors.push(`Idea ${idea.idea_id || index}: Missing npv_success`);
      }
      if (bc.capex_est === undefined) {
        validationErrors.push(`Idea ${idea.idea_id || index}: Missing capex_est`);
      }
      if (bc.likelihood === undefined) {
        validationErrors.push(`Idea ${idea.idea_id || index}: Missing likelihood`);
      }

      // Validate data types and ranges
      if (typeof bc.npv_success !== 'number' || isNaN(bc.npv_success)) {
        validationErrors.push(`Idea ${idea.idea_id || index}: npv_success must be a number`);
      }
      if (typeof bc.capex_est !== 'number' || isNaN(bc.capex_est)) {
        validationErrors.push(`Idea ${idea.idea_id || index}: capex_est must be a number`);
      }
      if (typeof bc.likelihood !== 'number' || isNaN(bc.likelihood) || bc.likelihood <= 0 || bc.likelihood > 1) {
        validationErrors.push(`Idea ${idea.idea_id || index}: likelihood must be between 0 and 1`);
      }
    });

    if (validationErrors.length > 0) {
      logger.error('Ranker validation errors:', validationErrors);
      throw new Error(`Data validation failed in ranker:\n${validationErrors.join('\n')}`);
    }

    // Score and filter ideas
    const scoredIdeas = enrichedIdeas.map(idea => {
      const bc = idea.business_case;
      const p = bc.likelihood;
      const npv = bc.npv_success;
      const capex = bc.capex_est;

      // Calculate risk-adjusted score for ALL ideas (no filtering)
      // Expected value: p * NPV_success - (1-p) * CAPEX
      // All values now in millions USD
      const expectedValue = p * npv - (1 - p) * capex;

      // Diversification penalty: sqrt(CAPEX/C0)
      const diversificationPenalty = Math.sqrt(capex / C0);

      // Risk-Adjusted NPV
      const score = expectedValue / diversificationPenalty;

      // Track if idea violates preferences (for logging only)
      let violatesPreferences = false;
      let preferenceNote = null;

      if (maxCapex < 100 && capex > maxCapex) {
        violatesPreferences = true;
        preferenceNote = `CAPEX ($${capex}M) exceeds preference ($${maxCapex}M)`;
      } else if (minProfits > 0 && npv < minProfits) {
        violatesPreferences = true;
        preferenceNote = `NPV ($${npv}M) below preference ($${minProfits}M)`;
      }

      return {
        ...idea,
        score,
        filtered: false,  // Never filter ideas
        filterReason: null,
        violatesPreferences,
        preferenceNote,
        metrics: {
          npv: npv,
          capex: capex,
          likelihood: p,
          expectedValue: expectedValue
        }
      };
    });

    // Sort ALL ideas by score (no filtering)
    const rankedIdeas = [...scoredIdeas].sort((a, b) => b.score - a.score);

    // Assign ranks to all ideas
    rankedIdeas.forEach((idea, index) => {
      idea.rank = index + 1;
    });

    // Log preference violations if any
    const violatingIdeas = rankedIdeas.filter(idea => idea.violatesPreferences);
    if (violatingIdeas.length > 0) {
      logger.info(`${violatingIdeas.length} ideas violate preferences (but are NOT filtered):`,
        violatingIdeas.map(i => ({ id: i.idea_id, note: i.preferenceNote, score: i.score.toFixed(2) }))
      );
    }

    return {
      rankedIdeas: rankedIdeas,
      filteredIdeas: []  // No ideas are filtered anymore
    };
  }



  async evolve(problemContext, initialSolutions = [], customConfig = {}, progressTracker = null) {
    // Store custom config in this instance for use by other methods
    this.config = {
      ...this.config,
      ...customConfig
    };
    const config = this.config;
    const jobId = progressTracker?.jobId || null;

    logger.info('Starting evolution with:', {
      problemContext: problemContext.substring(0, 100) + '...',
      initialSolutionCount: initialSolutions.length,
      generations: config.generations,
      customConfig
    });

    // Store progressTracker for use in methods
    this.progressTracker = progressTracker;

    let currentGen = initialSolutions;
    let generationHistory = [];
    let allGenerationSolutions = [];

    for (let gen = 1; gen <= config.generations; gen++) {
      logger.info(`Generation ${gen}/${config.generations}`);

      // Store current generation for telemetry
      this.currentGeneration = gen;

      if (progressTracker?.resultStore && progressTracker?.jobId) {
        await progressTracker.resultStore.updateGenerationProgress(
          progressTracker.jobId, gen, config.generations, 'variator'
        );
      }

      if (currentGen.length < config.populationSize) {
        const newGen = await this.variator(currentGen, config.populationSize, problemContext, gen, jobId);
        if (!Array.isArray(newGen)) {
          logger.error('Variator did not return an array:', { type: typeof newGen, value: newGen });
          throw new Error('Variator must return an array');
        }
        currentGen = newGen;
      }

      if (progressTracker?.resultStore && progressTracker?.jobId) {
        await progressTracker.resultStore.updateGenerationProgress(
          progressTracker.jobId, gen, config.generations, 'enricher'
        );
      }

      const enriched = await this.enricher(currentGen, problemContext, gen, config, jobId);

      // NO FORMATTING - avoid extra API calls
      const formatted = enriched;

      if (progressTracker?.resultStore && progressTracker?.jobId) {
        await progressTracker.resultStore.updateGenerationProgress(
          progressTracker.jobId, gen, config.generations, 'ranker'
        );
      }

      const { rankedIdeas, filteredIdeas } = await this.ranker(formatted);

      // Log filtered ideas for visibility
      if (filteredIdeas && filteredIdeas.length > 0) {
        logger.info(`Generation ${gen}: Filtered ${filteredIdeas.length} ideas`,
          filteredIdeas.map(i => ({ id: i.idea_id, reason: i.filterReason }))
        );
      }

      // Save ALL ideas (both ranked and filtered) to generation history
      const allIdeasThisGen = [...rankedIdeas, ...filteredIdeas];
      allIdeasThisGen.forEach(solution => {
        allGenerationSolutions.push({
          ...solution,
          generation: gen,
          last_generation: gen,
          total_generations: config.generations,
          passed_filter: !solution.filtered
        });
      });

      const generationData = {
        generation: gen,
        topScore: rankedIdeas[0]?.score || 0,
        avgScore: rankedIdeas.length > 0 ? rankedIdeas.reduce((sum, idea) => sum + idea.score, 0) / rankedIdeas.length : 0,
        solutionCount: allIdeasThisGen.length,
        filteredCount: filteredIdeas.length,
        solutions: allIdeasThisGen  // Include all ideas, not just ranked ones
      };

      generationHistory.push(generationData);

      // Log API call counts after each generation
      logger.info(`Generation ${gen} API calls:`, {
        variator: this.apiCallCounts.variator,
        enricher: this.apiCallCounts.enricher,
        reformatter: this.apiCallCounts.reformatter,
        total: this.apiCallCounts.total,
        expectedTotal: gen * 2  // Should be exactly 2 calls per generation (variator + enricher)
      });

      if (progressTracker?.resultStore && progressTracker?.jobId) {
        await progressTracker.resultStore.savePartialResult(
          progressTracker.jobId, gen, generationData
        );
      }

      if (gen === config.generations) {
        // Final API call summary
        logger.info('FINAL API CALL SUMMARY:', {
          variator: this.apiCallCounts.variator,
          enricher: this.apiCallCounts.enricher,
          reformatter: this.apiCallCounts.reformatter,
          total: this.apiCallCounts.total,
          generations: config.generations,
          expectedCallsPerGeneration: 2,
          expectedTotal: config.generations * 2,
          efficiency: this.apiCallCounts.total === (config.generations * 2) ? 'PERFECT' : 'WASTED CALLS!'
        });

        return {
          topSolutions: rankedIdeas.slice(0, 5),
          allSolutions: allGenerationSolutions,
          generationHistory,
          totalEvaluations: gen * config.populationSize,
          totalSolutions: allGenerationSolutions.length,
          apiCallCounts: this.apiCallCounts,
          metadata: {
            totalGenerations: gen,
            finalPopulationSize: rankedIdeas.length,
            config: config,
            problemContext: problemContext
          }
        };
      }

      // Select top performers for next generation
      const topPerformers = rankedIdeas.slice(0, config.topSelectCount);
      currentGen = topPerformers;
    }
  }

  // reformatWithGPT4o method removed - no longer needed with ResponseParser
}

export default EvolutionarySolver;
