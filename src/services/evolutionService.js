import logger from '../utils/logger.js';

import config from '../config.js';

class EvolutionService {
  constructor(resultStore) {
    this.resultStore = resultStore;
  }

  // processEvolutionJob removed - evolution is now orchestrated through Cloud Workflows

  validateProblemContext(problemContext) {
    if (!problemContext || typeof problemContext !== 'string') {
      throw new Error('Problem context must be a non-empty string');
    }

    if (problemContext.length < 10) {
      throw new Error('Problem context too short - please provide more detail');
    }

    if (problemContext.length > 5000) {
      throw new Error('Problem context too long - please keep under 5000 characters');
    }

    return true;
  }


  async getJobStatus(jobId) {
    return await this.resultStore.getJobStatus(jobId);
  }

  async getResults(jobId) {
    return await this.resultStore.getResult(jobId);
  }


  async getRecentJobs(limit = 50) {
    return await this.resultStore.getRecentJobs(limit);
  }

  async getJobStats() {
    const recentJobs = await this.resultStore.getRecentJobs(100);

    const stats = {
      total: recentJobs.length,
      completed: recentJobs.filter(j => j.status === 'completed').length,
      pending: recentJobs.filter(j => j.status === 'pending').length,
      processing: recentJobs.filter(j => j.status === 'processing').length,
      failed: recentJobs.filter(j => j.status === 'failed').length
    };

    return stats;
  }

}

export default EvolutionService;
