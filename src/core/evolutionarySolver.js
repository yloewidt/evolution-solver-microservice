import logger from '../utils/logger.js';
import { ResponseParser } from '../utils/responseParser.js';
import { LLMClient } from '../services/llmClient.js';
import Joi from 'joi';

const solutionSchema = Joi.object({
  description: Joi.string(),
  core_mechanism: Joi.string(),
  title: Joi.string(),
  business_case: Joi.object(),
  score: Joi.number(),
  rank: Joi.number(),
  filtered: Joi.boolean(),
  filterReason: Joi.string().allow(null),
  violatesPreferences: Joi.boolean(),
  preferenceNote: Joi.string().allow(null),
  metrics: Joi.object(),
}).unknown(true);

const ideasSchema = Joi.array().items(solutionSchema);


class EvolutionarySolver {
  constructor(resultStore = null, config = {}) {
    // API call tracking - ensure exactly 1 call per operation
    this.apiCallCounts = {
      variator: 0,
      enricher: 0,
      total: 0
    };
    // Initialize LLM client - it will handle API style detection
    this.llmClient = null; // Will be initialized with model config
    
    this.resultStore = resultStore;

    this.config = {
      ...config.evolution,
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
    const { error } = ideasSchema.validate(currentSolutions);
    if (error) {
      throw new Error(`Invalid currentSolutions: ${error.message}`);
    }
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

    // System prompt includes problem context and requirements
    const systemPrompt = `You are an expert in creative business solution generation.

Problem to solve: ${problemContext}${guidanceText}

Focus on ${dealTypes}

Generate ${numNeeded} new solutions:
${currentSolutions.length > 0 ? `- ${offspringCount} OFFSPRING: Evolve the top performers' best features OR find creative ways to lower direct CAPEX(getting a non-investor to bear costs, or lower costs in general), Greatly reduce risk factors of the solution, or increase NPV of the solution. BE CREATIVE AND BOLD HERE.
- ${wildcardCount} WILDCARDS: Completely fresh approaches` : `- ${numNeeded} WILDCARDS: All new creative solutions`}

Each solution must have:
- "title": Short, catchy title
- "description": Business model in plain terms
- "core_mechanism": How value is created and captured
- "is_offspring": true for offspring, false for wildcards

Requirements:
- Business models must be realistic and implementable
- Explain complex ideas simply (avoid jargon)
- Focus on partnerships that reduce capital requirements
- Consider timing advantages (why now?)
- When doing an evolution, do describe each solution fully, as other functions looking at each idea wont have context about other ideas.`;

    // User prompt contains previous solutions if any
    const userPrompt = currentSolutions.length > 0 
      ? `Previous top performers:\n${JSON.stringify(currentSolutions, null, 2)}`
      : 'Generate new creative business solutions.';

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
      const apiCall = await this.llmClient.createVariatorRequest(null, systemPrompt, userPrompt);

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
          promptLength: systemPrompt.length + userPrompt.length,
          promptPreview: systemPrompt.substring(0, 200) + '...',
          fullPrompt: { systemPrompt, userPrompt }  // Full prompts for replay
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

      // Extract top performer IDs from current solutions
      const topPerformerIds = new Set(currentSolutions.map(s => s.idea_id).filter(id => id));
      
      // Parse response based on API style
      const newIdeas = this.llmClient.getApiStyle() === 'openai' 
        ? ResponseParser.parseOpenAIResponse(response, 'variator', generation, jobId, topPerformerIds)
        : ResponseParser.parseVariatorResponse(response, generation, jobId, topPerformerIds);

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
            systemPrompt,
            userPrompt,
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
      return ideasArray;
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

  // Enricher method removed - now handled by distributed processing in workerHandlersV2.js

  async ranker(enrichedIdeas) {
    // Get config parameters (all in millions USD)
    const C0 = this.config.diversificationFactor || 0.05; // Default $50K in millions
    const topPerformerRatio = this.config.topPerformerRatio || 0.3; // Default 30%
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

    // Select top performers for next generation
    const topPerformerCount = Math.ceil(rankedIdeas.length * topPerformerRatio);
    const topPerformers = rankedIdeas.slice(0, topPerformerCount);

    return {
      rankedIdeas: rankedIdeas,
      filteredIdeas: [],  // No ideas are filtered anymore
      topPerformers: topPerformers
    };
  }



  // Evolve method removed - evolution is now orchestrated through Cloud Workflows and distributed workers

  // reformatWithGPT4o method removed - no longer needed with ResponseParser
}

export default EvolutionarySolver;
