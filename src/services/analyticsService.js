import logger from '../utils/logger.js';

class AnalyticsService {
  constructor(resultStore) {
    this.resultStore = resultStore;
  }

  async getJobAnalytics(jobId) {
    try {
      const result = await this.resultStore.getResult(jobId);

      if (!result) {
        return null;
      }

      // Initialize analytics structure
      const analytics = {
        jobId,
        status: result.status,
        problemContext: result.problemContext,
        evolutionConfig: result.evolutionConfig,
        timing: {
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          completedAt: result.completedAt,
          elapsedMinutes: null,
          generationTimes: [],
          averageGenerationTime: null
        },
        progress: result.progress,
        currentGeneration: result.currentGeneration,
        generationAnalytics: [],
        o3Calls: {
          actual: 0,
          breakdown: {
            variator: 0,
            enricher: 0,
            ranker: 0,
            reformatter: 0
          }
        },
        tokenUsage: {
          total: {
            input: 0,
            output: 0,
            reasoning: 0,
            cached: 0
          },
          byModel: {},
          byPhase: {
            variator: { input: 0, output: 0, reasoning: 0, cached: 0 },
            enricher: { input: 0, output: 0, reasoning: 0, cached: 0 },
            ranker: { input: 0, output: 0, reasoning: 0, cached: 0 },
            reformatter: { input: 0, output: 0, reasoning: 0, cached: 0 }
          }
        },
        retries: {
          count: 0,
          failedCalls: []
        },
        solutions: {
          all: [],
          topScores: [],
          averageScoreByGeneration: {},
          overallAverageScore: 0
        }
      };

      // Calculate elapsed time
      if (result.createdAt) {
        const start = new Date(result.createdAt);
        const end = result.completedAt ? new Date(result.completedAt) : new Date();
        analytics.timing.elapsedMinutes = (end - start) / 1000 / 60;
      }

      // Process generation data
      if (result.generations) {
        this.processGenerationData(result.generations, analytics);
      }

      // Process actual API call telemetry
      if (result.apiCalls && Array.isArray(result.apiCalls)) {
        this.processApiCallTelemetry(result.apiCalls, analytics);
      } else {
        // Fallback to estimates if no telemetry data
        this.estimateApiCalls(result.evolutionConfig, analytics);
      }

      // Calculate generation timing
      if (analytics.generationAnalytics.length > 0) {
        this.calculateGenerationTiming(result.createdAt, analytics);
      }

      return analytics;
    } catch (error) {
      logger.error('Error calculating job analytics:', error);
      throw error;
    }
  }

  processGenerationData(generations, analytics) {
    let totalScore = 0;
    let completedGenerations = 0;

    Object.keys(generations).forEach(genKey => {
      const gen = generations[genKey];
      completedGenerations++;

      const genAnalytics = {
        generation: gen.generation,
        solutionCount: gen.solutionCount,
        topScore: gen.topScore,
        avgScore: gen.avgScore,
        completedAt: gen.completedAt
      };

      analytics.generationAnalytics.push(genAnalytics);
      analytics.solutions.averageScoreByGeneration[gen.generation] = gen.avgScore;

      totalScore += gen.avgScore;

      // Add solutions to the all solutions list
      if (gen.solutions && Array.isArray(gen.solutions)) {
        gen.solutions.forEach(solution => {
          analytics.solutions.all.push({
            generation: gen.generation,
            ideaId: solution.idea_id,
            score: solution.score,
            description: solution.description,
            roi: solution.business_case?.roi_proj,
            capex: solution.business_case?.capex_est,
            likelihood: solution.business_case?.likelihood
          });
        });
      }
    });

    analytics.solutions.overallAverageScore = completedGenerations > 0 ? totalScore / completedGenerations : 0;

    // Sort solutions by score and get top 10
    analytics.solutions.all.sort((a, b) => (b.score || 0) - (a.score || 0));
    analytics.solutions.topScores = analytics.solutions.all.slice(0, 10);
  }

  processApiCallTelemetry(apiCalls, analytics) {
    apiCalls.forEach(call => {
      const phase = call.phase;

      // Count calls by phase
      if (analytics.o3Calls.breakdown[phase] !== undefined) {
        analytics.o3Calls.breakdown[phase]++;
      }

      // Aggregate token usage
      if (call.tokens) {
        const tokens = call.tokens;
        // Handle different token formats from responses.create
        const inputTokens = tokens.prompt_tokens || tokens.input_tokens || 0;
        const outputTokens = tokens.completion_tokens || tokens.output_tokens || 0;
        const reasoningTokens = tokens.reasoning_tokens || 0;
        const cachedTokens = tokens.cached_tokens || 0;

        // Update total tokens
        analytics.tokenUsage.total.input += inputTokens;
        analytics.tokenUsage.total.output += outputTokens;
        analytics.tokenUsage.total.reasoning += reasoningTokens;
        analytics.tokenUsage.total.cached += cachedTokens;

        // Update tokens by phase
        if (analytics.tokenUsage.byPhase[phase]) {
          analytics.tokenUsage.byPhase[phase].input += inputTokens;
          analytics.tokenUsage.byPhase[phase].output += outputTokens;
          analytics.tokenUsage.byPhase[phase].reasoning += reasoningTokens;
          analytics.tokenUsage.byPhase[phase].cached += cachedTokens;
        }

        // Update tokens by model
        const model = call.model || 'unknown';
        if (!analytics.tokenUsage.byModel[model]) {
          analytics.tokenUsage.byModel[model] = { input: 0, output: 0, reasoning: 0, cached: 0 };
        }
        analytics.tokenUsage.byModel[model].input += inputTokens;
        analytics.tokenUsage.byModel[model].output += outputTokens;
        analytics.tokenUsage.byModel[model].reasoning += reasoningTokens;
        analytics.tokenUsage.byModel[model].cached += cachedTokens;
      }

      // Track retries
      if (call.attempt > 1) {
        analytics.retries.count++;
        analytics.retries.failedCalls.push({
          phase: call.phase,
          generation: call.generation,
          attempt: call.attempt
        });
      }
    });

    // Calculate total actual calls
    analytics.o3Calls.actual = apiCalls.length;
  }

  estimateApiCalls(evolutionConfig, analytics) {
    const generations = analytics.generationAnalytics.length;

    analytics.o3Calls.breakdown.variator = generations;
    analytics.o3Calls.breakdown.enricher = generations;
    analytics.o3Calls.actual =
      analytics.o3Calls.breakdown.variator +
      analytics.o3Calls.breakdown.enricher;
  }

  calculateGenerationTiming(createdAt, analytics) {
    let prevTime = new Date(createdAt);

    analytics.generationAnalytics.forEach((gen, _idx) => {
      if (gen.completedAt) {
        const genTime = new Date(gen.completedAt._seconds * 1000);
        const duration = (genTime - prevTime) / 1000 / 60;
        analytics.timing.generationTimes.push({
          generation: gen.generation,
          durationMinutes: duration
        });
        prevTime = genTime;
      }
    });

    if (analytics.timing.generationTimes.length > 0) {
      const avgTime = analytics.timing.generationTimes.reduce((sum, g) => sum + g.durationMinutes, 0) /
                      analytics.timing.generationTimes.length;
      analytics.timing.averageGenerationTime = avgTime;
    }
  }
}

export default AnalyticsService;
