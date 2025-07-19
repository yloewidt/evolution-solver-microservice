import EvolutionarySolver from '../core/evolutionarySolver.js';
import logger from '../utils/logger.js';

class EvolutionService {
  constructor(resultStore) {
    this.solver = new EvolutionarySolver();
    this.resultStore = resultStore;
  }

  async processEvolutionJob(jobData) {
    const { jobId, problemContext, initialSolutions, userId, sessionId, evolutionConfig } = jobData;
    
    try {
      logger.info(`Starting evolutionary solution generation for job ${jobId}`);
      logger.info(`Problem context length: ${problemContext?.length}`);
      logger.info(`Initial solutions: ${initialSolutions?.length || 0}`);
      logger.info(`User ID: ${userId}, Session ID: ${sessionId}`);
      logger.info(`Evolution config:`, evolutionConfig);
      
      await this.resultStore.updateJobStatus(jobId, 'processing');

      const result = await this.solver.evolve(problemContext, initialSolutions, evolutionConfig);
      
      const resultData = {
        jobId,
        userId,
        sessionId,
        problemContext,
        topSolutions: result.topSolutions,
        allSolutions: result.allSolutions,
        generationHistory: result.generationHistory,
        totalEvaluations: result.totalEvaluations,
        totalSolutions: result.totalSolutions,
        status: 'completed'
      };
      
      const resultId = await this.resultStore.saveResult(resultData);
      
      logger.info(`Evolution job ${jobId} completed, result saved as ${resultId}`);
      
      return { success: true, resultId, result };
    } catch (error) {
      logger.error(`Evolution job ${jobId} failed:`, error);
      
      await this.resultStore.updateJobStatus(jobId, 'failed', error.message);
      
      throw error;
    }
  }

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

  formatSolutionsForDisplay(solutions) {
    return solutions.map((solution, index) => ({
      rank: index + 1,
      title: solution.idea_id,
      description: solution.description,
      mechanism: solution.core_mechanism,
      score: solution.score?.toFixed(3),
      businessCase: {
        projectedROI: `$${solution.business_case.roi_proj}M`,
        capitalRequired: `$${solution.business_case.capex_est}K`,
        dealValuePercent: `${solution.business_case.deal_value_percent}%`,
        timeline: `${solution.business_case.timeline_months} months`,
        successLikelihood: `${(solution.business_case.likelihood * 100).toFixed(0)}%`,
        keyRisks: solution.business_case.risk_factors
      }
    }));
  }

  async getJobStatus(jobId) {
    return await this.resultStore.getJobStatus(jobId);
  }

  async getResults(jobId) {
    return await this.resultStore.getResult(jobId);
  }

  async getUserResults(userId, limit = 10) {
    return await this.resultStore.getUserResults(userId, limit);
  }

  async getAllResults(limit = 100) {
    return await this.resultStore.getAllResults(limit);
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
      failed: recentJobs.filter(j => j.status === 'failed').length,
      avgSolutions: recentJobs.reduce((sum, j) => 
        sum + (j.topSolutions?.length || 0), 0) / (recentJobs.filter(j => j.status === 'completed').length || 1)
    };
    
    return stats;
  }

  enrichContextWithBottleneck(selectedBottleneck, filters) {
    let enrichedContext = '';
    
    if (selectedBottleneck) {
      enrichedContext = `Industry: ${selectedBottleneck.industry_name}
Market Size: ${selectedBottleneck.market_size}
Growth Rate: ${selectedBottleneck.growth_rate_text} (${selectedBottleneck.growth_rate}% over 5 years)
Industry Definition: ${selectedBottleneck.industry_definition}

Key Growth Drivers: ${selectedBottleneck.drivers}

BOTTLENECK TO SOLVE:
Problem: ${selectedBottleneck.bottleneck.problem}
Impact: $${selectedBottleneck.bottleneck.impact_usd_m}M
Type: ${selectedBottleneck.bottleneck.type}
Severity: ${selectedBottleneck.bottleneck.severity}
${selectedBottleneck.bottleneck.description ? `Details: ${selectedBottleneck.bottleneck.description}` : ''}

Generate innovative solutions that:
- Address this specific bottleneck in the ${selectedBottleneck.industry_name} industry
- Leverage the ${selectedBottleneck.growth_rate}% growth rate opportunity
- Target the $${selectedBottleneck.bottleneck.impact_usd_m}M problem size
- Use creative partnerships and deal structures with minimal CapEx`;
    }
    
    if (filters?.industries?.length > 0) {
      enrichedContext += `\n\nFocus on industries: ${filters.industries.join(', ')}`;
    }
    
    if (filters?.growthRate) {
      enrichedContext += `\n\nTarget industry growth rate: ${filters.growthRate.min}% - ${filters.growthRate.max}%`;
    }
    
    if (filters?.problemSize) {
      enrichedContext += `\n\nProblem size range: $${filters.problemSize.min}M - $${filters.problemSize.max}M`;
    }
    
    return enrichedContext;
  }

  async getBottleneckSolutions(industryName, problem) {
    const jobs = await this.resultStore.getAllResults();
    
    const matchingJobs = jobs.filter(job => {
      const context = job.problemContext || '';
      return context.includes(industryName) && context.includes(problem);
    });
    
    const allSolutions = [];
    matchingJobs.forEach(job => {
      const solutionsToUse = job.allSolutions || job.topSolutions || [];
      
      solutionsToUse.forEach(solution => {
        allSolutions.push({
          ...solution,
          jobId: job.jobId || job.id,
          jobCreatedAt: job.createdAt,
          industryName: industryName,
          problem: problem
        });
      });
    });
    
    allSolutions.sort((a, b) => (b.score || 0) - (a.score || 0));
    
    return {
      solutions: allSolutions,
      totalJobs: matchingJobs.length,
      industryName,
      problem
    };
  }
}

export default EvolutionService;