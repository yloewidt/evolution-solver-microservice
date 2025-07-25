import EvolutionResultStore from '../../cloud/firestore/resultStore.js';
import { Firestore } from '@google-cloud/firestore';

// Mock Firestore FieldValue for tests
if (!Firestore.FieldValue) {
  Firestore.FieldValue = {
    serverTimestamp: () => new Date(),
    arrayUnion: (value) => value,
    delete: () => null
  };
}

/**
 * Test adapter for ResultStore that provides compatibility methods
 * for tests written against older API versions
 */
export class TestResultStore extends EvolutionResultStore {
  constructor() {
    super();
    // Override with test-friendly Firestore config
    this.firestore = new Firestore({
      projectId: process.env.GCP_PROJECT_ID || 'test-project',
      databaseId: process.env.FIRESTORE_DATABASE || '(default)'
    });
  }

  /**
   * Adapter method for tests expecting createJob
   */
  async createJob(jobId, data) {
    return this.saveResult({
      jobId,
      status: 'pending',
      generations: {},
      apiCalls: [],
      createdAt: new Date(),
      ...data
    });
  }

  /**
   * Adapter method for tests expecting updatePhaseData
   */
  async updatePhaseData(jobId, generation, phase, data) {
    const genKey = `generations.generation_${generation}`;
    const updates = {
      updatedAt: Firestore.FieldValue.serverTimestamp()
    };

    // Map data fields to generation structure
    Object.keys(data).forEach(key => {
      updates[`${genKey}.${key}`] = data[key];
    });

    try {
      await this.getCollection().doc(jobId).update(updates);
      return true;
    } catch (error) {
      // If document doesn't exist, create it first
      if (error.code === 5) { // NOT_FOUND
        await this.createJob(jobId, {});
        await this.getCollection().doc(jobId).update(updates);
        return true;
      }
      throw error;
    }
  }

  /**
   * Adapter method for tests expecting saveApiCall
   */
  async saveApiCall(callData, jobId) {
    const callId = `${callData.phase}-${callData.generation}-${Date.now()}`;

    // Save to apiCalls array
    await this.addApiCallTelemetry(jobId, {
      ...callData,
      callId
    });

    // Also save to debug subcollection
    return this.saveApiCallDebug(jobId, callId, callData);
  }

  /**
   * Helper to ensure generation structure exists
   */
  async ensureGenerationStructure(jobId, generation) {
    const genKey = `generations.generation_${generation}`;
    const defaultStructure = {
      generation,
      variatorStarted: false,
      variatorComplete: false,
      enricherStarted: false,
      enricherComplete: false,
      rankerStarted: false,
      rankerComplete: false,
      solutions: [],
      ideas: [], // Support both 'ideas' and 'solutions'
      topScore: 0,
      avgScore: 0,
      solutionCount: 0
    };

    const updates = {};
    updates[genKey] = defaultStructure;

    await this.getCollection().doc(jobId).update(updates);
  }

  /**
   * Override getJobStatus to ensure consistent structure
   */
  async getJobStatus(jobId) {
    const status = await super.getJobStatus(jobId);
    if (!status) return null;

    // Ensure generations structure exists
    if (!status.generations) {
      status.generations = {};
    }

    // Normalize generation data
    Object.keys(status.generations).forEach(genKey => {
      const gen = status.generations[genKey];
      // Support both 'ideas' and 'solutions' fields
      if (gen.ideas && !gen.solutions) {
        gen.solutions = gen.ideas;
      }
      if (gen.solutions && !gen.ideas) {
        gen.ideas = gen.solutions;
      }
    });

    return status;
  }
}

/**
 * Mock implementation for tests that don't need real Firestore
 */
export class MockResultStore {
  constructor() {
    this.jobs = new Map();
    this.apiCalls = new Map();
  }

  async createJob(jobId, data) {
    this.jobs.set(jobId, {
      jobId,
      status: 'pending',
      generations: {},
      apiCalls: [],
      createdAt: new Date(),
      ...data
    });
    return jobId;
  }

  async saveResult(data) {
    this.jobs.set(data.jobId, data);
    return data.jobId;
  }

  async getJobStatus(jobId) {
    return this.jobs.get(jobId) || null;
  }

  async getResult(jobId) {
    return this.jobs.get(jobId) || null;
  }

  async updateJobStatus(jobId, status, error = null) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.status = status;
    job.updatedAt = new Date();
    if (error) job.error = error;
    if (status === 'completed') job.completedAt = new Date();
  }

  async updatePhaseData(jobId, generation, phase, data) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    if (!job.generations[`generation_${generation}`]) {
      job.generations[`generation_${generation}`] = {
        generation,
        variatorStarted: false,
        variatorComplete: false,
        enricherStarted: false,
        enricherComplete: false,
        rankerStarted: false,
        rankerComplete: false
      };
    }

    Object.assign(job.generations[`generation_${generation}`], data);
  }

  async updatePhaseStatus(jobId, generation, phase, status) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const genKey = `generation_${generation}`;
    if (!job.generations[genKey]) {
      job.generations[genKey] = {};
    }

    const phaseKey = `${phase}Started`;
    job.generations[genKey][phaseKey] = (status === 'started');
    job.generations[genKey][`${phase}StartedAt`] = new Date();

    return { updated: true };
  }

  async savePhaseResults(jobId, generation, phase, results) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const genKey = `generation_${generation}`;
    if (!job.generations[genKey]) {
      job.generations[genKey] = {};
    }

    job.generations[genKey][`${phase}Complete`] = true;
    job.generations[genKey][`${phase}CompletedAt`] = new Date();
    Object.assign(job.generations[genKey], results);
  }

  async saveApiCall(callData, jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    if (!job.apiCalls) job.apiCalls = [];
    job.apiCalls.push(callData);

    // Store in separate map for subcollection simulation
    const callId = `${callData.phase}-${Date.now()}`;
    if (!this.apiCalls.has(jobId)) {
      this.apiCalls.set(jobId, new Map());
    }
    this.apiCalls.get(jobId).set(callId, callData);

    return callId;
  }

  async saveApiCallDebug(jobId, callId, debugData) {
    if (!this.apiCalls.has(jobId)) {
      this.apiCalls.set(jobId, new Map());
    }
    this.apiCalls.get(jobId).set(callId, debugData);
    return true;
  }

  getCollection() {
    const self = this;
    return {
      doc: (jobId) => ({
        get: async () => {
          const data = self.jobs.get(jobId);
          if (!data) return { exists: false };

          return {
            exists: true,
            data: () => data,
            id: jobId,
            ref: {
              collection: (name) => ({
                get: async () => {
                  if (name === 'apiDebug') {
                    const calls = self.apiCalls.get(jobId) || new Map();
                    const docs = Array.from(calls.entries()).map(([id, data]) => ({
                      id,
                      data: () => data
                    }));
                    return { size: docs.length, docs };
                  }
                  return { size: 0, docs: [] };
                }
              })
            }
          };
        },
        set: async (data, options) => {
          if (options?.merge) {
            const existing = self.jobs.get(jobId) || {};
            self.jobs.set(jobId, { ...existing, ...data });
          } else {
            self.jobs.set(jobId, data);
          }
        },
        update: async (updates) => {
          const existing = self.jobs.get(jobId);
          if (!existing) throw new Error('No document to update');

          // Apply dot notation updates
          Object.keys(updates).forEach(key => {
            if (key.includes('.')) {
              const parts = key.split('.');
              let obj = existing;
              for (let i = 0; i < parts.length - 1; i++) {
                if (!obj[parts[i]]) obj[parts[i]] = {};
                obj = obj[parts[i]];
              }
              obj[parts[parts.length - 1]] = updates[key];
            } else {
              existing[key] = updates[key];
            }
          });
        },
        delete: async () => {
          self.jobs.delete(jobId);
          return true;
        }
      }),
      where: (field, op, value) => {
        // Create a query builder that supports chaining
        const query = {
          conditions: [{ field, op, value }],
          where: function(field2, op2, value2) {
            this.conditions.push({ field: field2, op: op2, value: value2 });
            return this;
          },
          orderBy: function() {
            return this;
          },
          limit: function() {
            return this;
          },
          get: async function() {
            const results = [];
            self.jobs.forEach((job, id) => {
              let matches = true;

              for (const condition of this.conditions) {
                let fieldValue = job[condition.field];
                if (condition.field.includes('.')) {
                  const parts = condition.field.split('.');
                  fieldValue = job;
                  for (const part of parts) {
                    fieldValue = fieldValue?.[part];
                  }
                }

                let conditionMatches = false;
                switch (condition.op) {
                case '==':
                  conditionMatches = fieldValue === condition.value;
                  break;
                case '>=':
                  conditionMatches = fieldValue >= condition.value;
                  break;
                case '>':
                  conditionMatches = fieldValue > condition.value;
                  break;
                case '<':
                  conditionMatches = fieldValue < condition.value;
                  break;
                case '<=':
                  conditionMatches = fieldValue <= condition.value;
                  break;
                }

                if (!conditionMatches) {
                  matches = false;
                  break;
                }
              }

              if (matches) {
                results.push({
                  id,
                  data: () => job
                });
              }
            });

            return {
              docs: results,
              forEach: (fn) => results.forEach(fn)
            };
          }
        };

        return query;
      }
    };
  }

  // Additional helper methods
  async getRecentJobs(limit = 50) {
    const jobs = Array.from(this.jobs.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
    return jobs;
  }

  async getJobsByStatus(status, limit = 50) {
    const jobs = Array.from(this.jobs.values())
      .filter(job => job.status === status)
      .slice(0, limit);
    return jobs;
  }
}
