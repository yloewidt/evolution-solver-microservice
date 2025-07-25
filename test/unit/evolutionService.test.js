import { jest } from '@jest/globals';
import { MockResultStore } from '../helpers/index.js';

// Import service
const EvolutionService = (await import('../../src/services/evolutionService.js')).default;

describe('EvolutionService', () => {
  let service;
  let mockResultStore;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockResultStore = new MockResultStore();
    service = new EvolutionService(mockResultStore);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // processEvolutionJob tests removed - evolution now handled by workflows

  describe('validateProblemContext', () => {
    it('should validate valid problem context', () => {
      const validContext = 'This is a valid problem context with enough detail';
      expect(service.validateProblemContext(validContext)).toBe(true);
    });

    it('should throw error for missing context', () => {
      expect(() => service.validateProblemContext(null)).toThrow('Problem context must be a non-empty string');
      expect(() => service.validateProblemContext('')).toThrow('Problem context must be a non-empty string');
      expect(() => service.validateProblemContext(undefined)).toThrow('Problem context must be a non-empty string');
    });

    it('should throw error for non-string context', () => {
      expect(() => service.validateProblemContext(123)).toThrow('Problem context must be a non-empty string');
      expect(() => service.validateProblemContext({})).toThrow('Problem context must be a non-empty string');
      expect(() => service.validateProblemContext([])).toThrow('Problem context must be a non-empty string');
    });

    it('should throw error for too short context', () => {
      expect(() => service.validateProblemContext('Too short')).toThrow('Problem context too short');
    });

    it('should throw error for too long context', () => {
      const longContext = 'a'.repeat(5001);
      expect(() => service.validateProblemContext(longContext)).toThrow('Problem context too long');
    });
  });

  // formatSolutionsForDisplay tests removed - method no longer exists

  describe('getJobStatus', () => {
    it('should return job status', async () => {
      const jobStatus = { jobId: 'test-123', status: 'completed' };
      // Add job to the mock store
      await mockResultStore.saveResult(jobStatus);

      const result = await service.getJobStatus('test-123');

      expect(result).toEqual(jobStatus);
    });
  });

  describe('getResults', () => {
    it('should return job results', async () => {
      const jobResults = { jobId: 'test-123', topSolutions: [] };
      // Add job to the mock store
      await mockResultStore.saveResult(jobResults);

      const result = await service.getResults('test-123');

      expect(result).toEqual(jobResults);
    });
  });

  // getUserResults and getAllResults tests removed - methods no longer exist

  describe('getRecentJobs', () => {
    it('should return recent jobs with default limit', async () => {
      // Add jobs to the mock store
      await mockResultStore.saveResult({ jobId: '1', createdAt: new Date() });
      await mockResultStore.saveResult({ jobId: '2', createdAt: new Date() });

      const result = await service.getRecentJobs();

      expect(result).toHaveLength(2);
      expect(result[0].jobId).toBeDefined();
    });

    it('should return recent jobs with custom limit', async () => {
      // Add multiple jobs to the mock store
      await mockResultStore.saveResult({ jobId: '1', createdAt: new Date() });
      await mockResultStore.saveResult({ jobId: '2', createdAt: new Date() });
      await mockResultStore.saveResult({ jobId: '3', createdAt: new Date() });

      const result = await service.getRecentJobs(2);

      expect(result).toHaveLength(2);
    });
  });

  describe('getJobStats', () => {
    it('should calculate job statistics correctly', async () => {
      const recentJobs = [
        { jobId: '1', status: 'completed', topSolutions: [1, 2, 3] },
        { jobId: '2', status: 'completed', topSolutions: [1, 2] },
        { jobId: '3', status: 'pending' },
        { jobId: '4', status: 'processing' },
        { jobId: '5', status: 'failed' }
      ];
      mockResultStore.getRecentJobs.mockResolvedValueOnce(recentJobs);

      const stats = await service.getJobStats();

      expect(stats).toEqual({
        total: 5,
        completed: 2,
        pending: 1,
        processing: 1,
        failed: 1
      });
    });

    it('should handle empty job list', async () => {
      mockResultStore.getRecentJobs.mockResolvedValueOnce([]);

      const stats = await service.getJobStats();

      expect(stats).toEqual({
        total: 0,
        completed: 0,
        pending: 0,
        processing: 0,
        failed: 0
      });
    });

    // avgSolutions test removed - no longer tracked in stats
  });

  // enrichContextWithBottleneck and getBottleneckSolutions tests removed - methods no longer exist
});