import OpenAI from 'openai';
import https from 'https';
import http from 'http';
import logger from '../utils/logger.js';
import { ResponseParser } from '../utils/responseParser.js';

class EvolutionarySolver {
  constructor() {
    // API call tracking - ensure exactly 1 call per operation
    this.apiCallCounts = {
      variator: 0,
      enricher: 0,
      reformatter: 0,
      total: 0
    };
    // Create custom HTTP agent that forces HTTP/1.1
    // This is needed because Cloud Run's gVisor sandbox has issues with HTTP/2
    const httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 60000, // Keep connection alive for 1 minute
      timeout: 900000 // 15 minute timeout
    });

    const httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 60000, // Keep connection alive for 1 minute
      timeout: 900000, // 15 minute timeout
      // Disable HTTP/2 by not including 'h2' in ALPN protocols
      ALPNProtocols: ['http/1.1']
    });

    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      httpAgent: httpAgent,
      httpsAgent: httpsAgent,
      timeout: 900000, // 15 minute timeout for o3 model operations
      maxRetries: 0  // NO RETRIES - ensure exactly 1 API call per operation
    });

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
      dealTypes: 'creative partnerships and business models'
    };
  }

  async variator(currentSolutions = [], targetCount = 5, problemContext = '', generation = 1, jobId = null, attempt = 1) {
    const numNeeded = targetCount - currentSolutions.length;
    if (numNeeded <= 0) return currentSolutions;

    let startTime = Date.now(); // Define at method level for error handling

    // Get configuration
    const dealTypes = this.config.dealTypes || 'creative partnerships and business models';
    const maxCapex = this.config.maxCapex || 0.05;  // Default $50K in millions
    const offspringRatio = this.config.offspringRatio || 0.7;

    // Calculate offspring vs wildcard split
    const offspringCount = currentSolutions.length > 0 ? Math.floor(numNeeded * offspringRatio) : 0;
    const wildcardCount = numNeeded - offspringCount;

    const prompt = `Problem to solve: ${problemContext}

${currentSolutions.length > 0 ? `Top ${currentSolutions.length} performing solutions from previous generation:
${JSON.stringify(currentSolutions, null, 2)}

Generate ${numNeeded} new solutions as JSON array:
- ${offspringCount} OFFSPRING: Combine and evolve the top performers' best features. Mix their approaches, enhance strengths, fix weaknesses. Create true hybrids that build on what works.
- ${wildcardCount} WILDCARDS: Completely fresh approaches unrelated to previous solutions. Explore new angles, industries, or mechanisms.
` : `Generate ${numNeeded} new creative business solutions as JSON array.`}

Each solution must have:
- "idea_id": unique identifier (e.g., "he3_fusion_swap_v2")
- "description": Business model in plain terms. Focus on ${dealTypes}${maxCapex < 1000 ? ` with upfront costs under $${maxCapex}M` : ''}
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

      // Prepare API call for logging
      const apiCall = {
        model: this.config.model,
        input: [
          {
            role: 'developer',
            content: [{ type: 'input_text', text: 'You are an expert in creative business deal-making and solution generation. Generate innovative, low-risk, high-return solutions.' }]
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: prompt }]
          }
        ],
        text: { format: { type: 'text' } },
        reasoning: { effort: 'medium' },
        stream: false, // Avoid long SSE streams in Cloud Run
        store: true
      };

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

      const response = await this.client.responses.create(apiCall);

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

      const newIdeas = ResponseParser.parseVariatorResponse(response);

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

  async enricher(ideas, generation = 1, jobId = null, resultStore = null, attempt = 1) {
    logger.info('Enricher received ideas:', {
      count: ideas.length,
      firstIdea: ideas[0],
      allIds: ideas.map(i => i?.idea_id || 'NO_ID')
    });

    let startTime = Date.now(); // Define at method level for error handling

    const enrichPrompt = `Analyze each business idea and calculate key metrics:

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
- $50M = 50.0

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

      // Prepare API call for logging
      const apiCall = {
        model: this.config.model,
        input: [
          {
            role: 'developer',
            content: [{ type: 'input_text', text: 'You are a business strategist expert in financial modeling and deal structuring. Provide realistic, data-driven business cases.' }]
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: enrichPrompt }]
          }
        ],
        text: { format: { type: 'text' } },
        reasoning: { effort: 'high' },
        stream: false, // Avoid long SSE streams in Cloud Run
        store: true
      };

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

      const response = await this.client.responses.create(apiCall);

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

      const enrichedIdeas = ResponseParser.parseEnricherResponse(response);

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
          return this.enricher(ideas, generation, jobId, resultStore, currentAttempt + 1);
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

      // Apply user-defined filters
      let filtered = false;
      let filterReason = null;

      if (capex > maxCapex) {
        filtered = true;
        filterReason = `CAPEX ($${capex}M) exceeds maximum ($${maxCapex}M)`;
      } else if (npv < minProfits) {
        filtered = true;
        filterReason = `NPV ($${npv}M) below minimum ($${minProfits}M)`;
      }

      // Calculate risk-adjusted score
      let score = -Infinity;
      let expectedValue = null;

      if (!filtered) {
        // Expected value: p * NPV_success - (1-p) * CAPEX
        // All values now in millions USD
        expectedValue = p * npv - (1 - p) * capex;

        // Diversification penalty: sqrt(CAPEX/C0)
        const diversificationPenalty = Math.sqrt(capex / C0);

        // Risk-Adjusted NPV
        score = expectedValue / diversificationPenalty;
      }

      return {
        ...idea,
        score,
        filtered,
        filterReason,
        metrics: {
          npv: npv,
          capex: capex,
          likelihood: p,
          expectedValue: expectedValue
        }
      };
    });

    // Separate filtered and valid ideas
    const validIdeas = scoredIdeas.filter(idea => !idea.filtered);
    const filteredIdeas = scoredIdeas.filter(idea => idea.filtered);

    // Sort valid ideas by score
    validIdeas.sort((a, b) => b.score - a.score);

    // Assign ranks only to valid ideas
    validIdeas.forEach((idea, index) => {
      idea.rank = index + 1;
    });

    // Log filtering results
    if (filteredIdeas.length > 0) {
      logger.info(`Filtered ${filteredIdeas.length} ideas:`,
        filteredIdeas.map(i => ({ id: i.idea_id, reason: i.filterReason }))
      );
    }

    return {
      rankedIdeas: validIdeas,
      filteredIdeas: filteredIdeas
    };
  }


  async formatEnrichedData(enrichedIdeas) {
    try {
      logger.info('Formatting enriched data for consistency');

      const formatPrompt = `Ensure the following business ideas have correctly formatted metrics.
      
For each idea, validate and reformat the business_case object to have (ALL monetary values in millions USD):
- npv_success: number in millions (e.g., 125.5 = $125.5M)
- capex_est: number in millions with MINIMUM 0.05 ($50K validation cost)
- timeline_months: number
- likelihood: number between 0 and 1
- risk_factors: array of strings
- yearly_cashflows: array of 5 numbers in millions

CRITICAL RULES:
1. If capex_est is less than 0.05, set it to 0.05 (minimum $50K to validate any idea)
2. If capex_est is negative or zero, set it to 0.05
3. If capex_est is not a valid number, set it to 0.05
4. Always ensure capex_est >= 0.05

Examples: $50K = 0.05, $100K = 0.1, $1M = 1.0, $50M = 50.0

Return ONLY the JSON array with corrected data. Do not wrap the output in markdown code blocks, do not add any explanations or text before/after the JSON. The response must start with [ and end with ].

Data to format:
${JSON.stringify(enrichedIdeas, null, 2)}`;

      const response = await this.client.chat.completions.create({
        model: this.config.fallbackModel,
        messages: [
          {
            role: 'system',
            content: 'You are a data formatting assistant. Return only valid JSON with properly typed numeric fields.'
          },
          {
            role: 'user',
            content: formatPrompt
          }
        ],
        temperature: 0,
        max_tokens: 4000
      });

      let formattedContent = response.choices[0].message.content.trim();

      // Remove markdown code blocks if present
      formattedContent = formattedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      // Try to extract JSON array if still having issues
      const jsonMatch = formattedContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        formattedContent = jsonMatch[0];
      }

      const formattedData = JSON.parse(formattedContent);

      logger.info('Successfully formatted enriched data');
      return formattedData;

    } catch (error) {
      logger.error('Data formatting failed:', error);
      // Return original data if formatting fails
      return enrichedIdeas;
    }
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
        currentGen = await this.variator(currentGen, config.populationSize, problemContext, gen, jobId);
      }

      if (progressTracker?.resultStore && progressTracker?.jobId) {
        await progressTracker.resultStore.updateGenerationProgress(
          progressTracker.jobId, gen, config.generations, 'enricher'
        );
      }

      const enriched = await this.enricher(currentGen, gen, jobId, progressTracker?.resultStore);

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
          apiCallCounts: this.apiCallCounts
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
