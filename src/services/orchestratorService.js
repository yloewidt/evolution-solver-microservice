import logger from '../utils/logger.js';

/**
 * Orchestrator Service - Manages the workflow of evolution jobs
 *
 * Responsibilities:
 * - Determine next phase based on job state
 * - Create appropriate worker tasks
 * - Handle job completion and failure
 * - Provide idempotent state transitions
 */
class OrchestratorService {
  constructor(resultStore, taskHandler) {
    this.resultStore = resultStore;
    this.taskHandler = taskHandler;
  }

  /**
   * Main orchestration logic - called by orchestrator task
   */
  async orchestrateJob(taskData) {
    const { jobId, checkAttempt = 0, maxCheckAttempts = 100 } = taskData;

    logger.info(`Orchestrating job ${jobId}, attempt ${checkAttempt}`);

    try {
      // Get current job state
      const job = await this.resultStore.getJobStatus(jobId);

      if (!job) {
        logger.error(`Job ${jobId} not found`);
        throw new Error(`Job ${jobId} not found`);
      }

      // Determine next action
      const nextAction = this.determineNextAction(job);
      logger.info(`Next action for job ${jobId}:`, nextAction);

      // Execute action
      await this.executeAction(jobId, job, nextAction, taskData);

    } catch (error) {
      logger.error(`Orchestration error for job ${jobId}:`, error);

      if (checkAttempt >= maxCheckAttempts) {
        await this.markJobFailed(jobId, 'Max orchestration attempts exceeded');
      } else {
        // Re-queue orchestrator with backoff
        await this.requeueOrchestrator(jobId, checkAttempt + 1);
      }
    }
  }

  /**
   * Determine next action based on job state
   */
  determineNextAction(job) {
    // Handle terminal states
    if (job.status === 'completed' || job.status === 'failed') {
      return { type: 'ALREADY_COMPLETE' };
    }

    // New job - start generation 1 variator
    if (job.status === 'pending') {
      return {
        type: 'CREATE_TASK',
        task: {
          type: 'variator',
          generation: 1
        }
      };
    }

    // Check current generation progress
    const currentGen = job.currentGeneration || 1;
    const genData = job.generations?.[`generation_${currentGen}`] || {};

    // Determine current phase state with timeout detection
    if (!genData.variatorComplete) {
      if (genData.variatorStarted) {
        // Check for timeout (5 minutes)
        const startTime = genData.variatorStartedAt?._seconds 
          ? new Date(genData.variatorStartedAt._seconds * 1000)
          : new Date(genData.variatorStartedAt);
        const elapsed = Date.now() - startTime.getTime();
        
        if (elapsed > 300000) { // 5 minutes
          logger.warn(`Variator timeout detected for job ${job.jobId}, generation ${currentGen}`);
          return {
            type: 'RETRY_TASK',
            task: {
              type: 'variator',
              generation: currentGen,
              reason: 'timeout'
            }
          };
        }
        return { type: 'WAIT', reason: 'Variator in progress' };
      }
      return {
        type: 'CREATE_TASK',
        task: {
          type: 'variator',
          generation: currentGen
        }
      };
    }

    if (!genData.enricherComplete) {
      if (genData.enricherStarted) {
        // Check for timeout (5 minutes)
        const startTime = genData.enricherStartedAt?._seconds 
          ? new Date(genData.enricherStartedAt._seconds * 1000)
          : new Date(genData.enricherStartedAt);
        const elapsed = Date.now() - startTime.getTime();
        
        if (elapsed > 300000) { // 5 minutes
          logger.warn(`Enricher timeout detected for job ${job.jobId}, generation ${currentGen}`);
          return {
            type: 'RETRY_TASK',
            task: {
              type: 'enricher',
              generation: currentGen,
              reason: 'timeout'
            }
          };
        }
        return { type: 'WAIT', reason: 'Enricher in progress' };
      }
      return {
        type: 'CREATE_TASK',
        task: {
          type: 'enricher',
          generation: currentGen
        }
      };
    }

    if (!genData.rankerComplete) {
      if (genData.rankerStarted) {
        // Check for timeout (5 minutes)
        const startTime = genData.rankerStartedAt?._seconds 
          ? new Date(genData.rankerStartedAt._seconds * 1000)
          : new Date(genData.rankerStartedAt);
        const elapsed = Date.now() - startTime.getTime();
        
        if (elapsed > 300000) { // 5 minutes
          logger.warn(`Ranker timeout detected for job ${job.jobId}, generation ${currentGen}`);
          return {
            type: 'RETRY_TASK',
            task: {
              type: 'ranker',
              generation: currentGen,
              reason: 'timeout'
            }
          };
        }
        return { type: 'WAIT', reason: 'Ranker in progress' };
      }
      return {
        type: 'CREATE_TASK',
        task: {
          type: 'ranker',
          generation: currentGen
        }
      };
    }

    // Generation complete - check if more generations needed
    const totalGenerations = job.evolutionConfig?.generations || 10;

    if (currentGen < totalGenerations) {
      // Start next generation
      return {
        type: 'CREATE_TASK',
        task: {
          type: 'variator',
          generation: currentGen + 1
        }
      };
    }

    // All generations complete
    return { type: 'MARK_COMPLETE' };
  }

  /**
   * Execute the determined action
   */
  async executeAction(jobId, job, action, taskData) {
    switch (action.type) {
    case 'CREATE_TASK':
      await this.createWorkerTask(jobId, job, action.task);
      // Re-queue orchestrator to check progress later
      await this.requeueOrchestrator(jobId, taskData.checkAttempt + 1);
      break;

    case 'WAIT':
      // Phase still processing, check again later
      logger.info(`Job ${jobId} waiting: ${action.reason}`);
      await this.requeueOrchestrator(jobId, taskData.checkAttempt + 1);
      break;

    case 'MARK_COMPLETE':
      await this.markJobComplete(jobId, job);
      break;

    case 'ALREADY_COMPLETE':
      logger.info(`Job ${jobId} already in terminal state: ${job.status}`);
      break;
      
    case 'RETRY_TASK':
      logger.info(`Retrying ${action.task.type} task for job ${jobId} due to ${action.task.reason}`);
      // Reset the phase status to allow retry
      await this.resultStore.updatePhaseStatus(
        jobId,
        action.task.generation,
        action.task.type,
        'reset'
      );
      // Create new task
      await this.createWorkerTask(jobId, job, action.task);
      await this.requeueOrchestrator(jobId, taskData.checkAttempt + 1);
      break;

    default:
      logger.error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Create a worker task for a specific phase
   */
  async createWorkerTask(jobId, job, taskConfig) {
    const { type, generation } = taskConfig;

    logger.info(`Creating ${type} task for job ${jobId}, generation ${generation}`);

    // Build task payload based on type
    const taskPayload = {
      jobId,
      type,
      generation,
      evolutionConfig: job.evolutionConfig,
      problemContext: job.problemContext
    };

    // Add phase-specific data
    if (type === 'variator' && generation > 1) {
      // Get top performers from previous generation
      const prevGen = job.generations?.[`generation_${generation - 1}`];
      taskPayload.topPerformers = prevGen?.topPerformers || [];
    } else if (type === 'enricher') {
      // Get ideas from current generation variator
      const currentGen = job.generations?.[`generation_${generation}`];
      taskPayload.ideas = currentGen?.ideas || [];
    } else if (type === 'ranker') {
      // Get enriched ideas from current generation
      const currentGen = job.generations?.[`generation_${generation}`];
      taskPayload.enrichedIdeas = currentGen?.enrichedIdeas || [];
    }

    // Create the task
    await this.taskHandler.createWorkerTask(taskPayload);

    // Mark phase as started
    await this.resultStore.updatePhaseStatus(jobId, generation, type, 'started');
  }

  /**
   * Re-queue orchestrator to check job progress later
   */
  async requeueOrchestrator(jobId, nextAttempt) {
    const delayMs = this.calculateBackoff(nextAttempt);

    logger.info(`Re-queuing orchestrator for job ${jobId}, attempt ${nextAttempt}, delay ${delayMs}ms`);

    await this.taskHandler.createOrchestratorTask({
      jobId,
      checkAttempt: nextAttempt,
      scheduleTime: new Date(Date.now() + delayMs)
    });
  }

  /**
   * Calculate exponential backoff with jitter
   */
  calculateBackoff(attempt) {
    const baseDelay = 5000; // 5 seconds
    const maxDelay = 60000; // 1 minute
    const jitter = Math.random() * 1000; // 0-1 second jitter

    const delay = Math.min(baseDelay * Math.pow(1.5, attempt), maxDelay);
    return Math.floor(delay + jitter);
  }

  /**
   * Mark job as complete
   */
  async markJobComplete(jobId, job) {
    logger.info(`Marking job ${jobId} as complete`);

    // Gather final results
    const allSolutions = [];
    const generationHistory = [];

    const totalGenerations = job.evolutionConfig?.generations || 10;

    for (let gen = 1; gen <= totalGenerations; gen++) {
      const genData = job.generations?.[`generation_${gen}`];
      if (genData) {
        // Add to history
        generationHistory.push({
          generation: gen,
          solutionCount: genData.solutions?.length || 0,
          topScore: genData.topScore,
          avgScore: genData.avgScore,
          completedAt: genData.completedAt
        });

        // Collect all solutions
        if (genData.solutions) {
          genData.solutions.forEach(solution => {
            allSolutions.push({
              ...solution,
              generation: gen
            });
          });
        }
      }
    }

    // Sort solutions by score
    allSolutions.sort((a, b) => (b.score || 0) - (a.score || 0));

    await this.resultStore.completeJob(jobId, {
      topSolutions: allSolutions.slice(0, 10),
      allSolutions,
      generationHistory,
      totalEvaluations: totalGenerations * (job.evolutionConfig?.populationSize || 5),
      totalSolutions: allSolutions.length
    });
  }

  /**
   * Mark job as failed
   */
  async markJobFailed(jobId, reason) {
    logger.error(`Marking job ${jobId} as failed: ${reason}`);

    await this.resultStore.updateJobStatus(jobId, 'failed', reason);
  }
}

export default OrchestratorService;
