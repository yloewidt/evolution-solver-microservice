import { Firestore } from '@google-cloud/firestore';
import logger from '../../src/utils/logger.js';

class EvolutionResultStore {
  constructor() {
    // Detect if running in Cloud Run
    const isCloudRun = process.env.K_SERVICE !== undefined;
    
    // Configure Firestore based on environment
    const firestoreConfig = {
      projectId: process.env.GCP_PROJECT_ID || 'evolutionsolver',
      databaseId: process.env.FIRESTORE_DATABASE || '(default)'
    };
    
    // Only add keyFilename for local development
    if (!isCloudRun && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firestoreConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    
    this.firestore = new Firestore(firestoreConfig);
    this.collectionName = process.env.FIRESTORE_COLLECTION || 'evolution-results';
  }

  getCollection() {
    return this.firestore.collection(this.collectionName);
  }

  async saveResult(resultData) {
    try {
      const docRef = this.getCollection().doc(resultData.jobId);
      
      const dataToSave = {
        ...resultData,
        createdAt: Firestore.FieldValue.serverTimestamp(),
        completedAt: resultData.status === 'completed' ? Firestore.FieldValue.serverTimestamp() : null,
        updatedAt: Firestore.FieldValue.serverTimestamp(),
        // Initialize arrays to ensure they exist
        apiCalls: resultData.apiCalls || [],
        generations: resultData.generations || {}
      };
      
      await docRef.set(dataToSave, { merge: true });
      
      logger.info(`Saved evolution result for job ${resultData.jobId}`);
      return resultData.jobId;
    } catch (error) {
      logger.error('Error saving evolution result:', error);
      throw error;
    }
  }

  async getResult(jobId) {
    try {
      const doc = await this.getCollection().doc(jobId).get();
      
      if (!doc.exists) {
        return null;
      }
      
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        completedAt: data.completedAt?.toDate?.() || data.completedAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
      };
    } catch (error) {
      logger.error('Error getting evolution result:', error);
      throw error;
    }
  }

  async updateJobStatus(jobId, status, errorMessage = null) {
    try {
      const updateData = {
        status,
        updatedAt: Firestore.FieldValue.serverTimestamp()
      };
      
      if (status === 'completed') {
        updateData.completedAt = Firestore.FieldValue.serverTimestamp();
      }
      
      if (status === 'failed' && errorMessage) {
        updateData.error = errorMessage;
      }
      
      await this.getCollection().doc(jobId).update(updateData);
      
      logger.info(`Updated job ${jobId} status to ${status}`);
    } catch (error) {
      logger.error('Error updating job status:', error);
      throw error;
    }
  }

  async getJobStatus(jobId) {
    try {
      const doc = await this.getCollection().doc(jobId).get();
      
      if (!doc.exists) {
        return null;
      }
      
      const data = doc.data();
      return {
        status: data.status,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        completedAt: data.completedAt?.toDate?.() || data.completedAt,
        error: data.error,
        progress: data.progress,
        currentGeneration: data.currentGeneration,
        generations: data.generations,
        // Include all job configuration data
        evolutionConfig: data.evolutionConfig,
        problemContext: data.problemContext,
        userId: data.userId,
        sessionId: data.sessionId,
        // Include results if available
        topSolutions: data.topSolutions,
        totalSolutions: data.totalSolutions,
        allSolutions: data.allSolutions,
        apiCalls: data.apiCalls || []
      };
    } catch (error) {
      logger.error('Error getting job status:', error);
      throw error;
    }
  }

  async getAllResults(limit = 100) {
    try {
      const snapshot = await this.getCollection()
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      
      const results = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        results.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          completedAt: data.completedAt?.toDate?.() || data.completedAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
        });
      });
      
      return results;
    } catch (error) {
      logger.error('Error getting all results:', error);
      throw error;
    }
  }

  async getUserResults(userId, limit = 10) {
    try {
      const snapshot = await this.getCollection()
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      
      const results = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        results.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          completedAt: data.completedAt?.toDate?.() || data.completedAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
        });
      });
      
      return results;
    } catch (error) {
      logger.error('Error getting user results:', error);
      throw error;
    }
  }

  async getRecentJobs(limit = 50) {
    try {
      const snapshot = await this.getCollection()
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      
      const jobs = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        jobs.push({
          jobId: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          completedAt: data.completedAt?.toDate?.() || data.completedAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
        });
      });
      
      return jobs;
    } catch (error) {
      logger.error('Error getting recent jobs:', error);
      throw error;
    }
  }

  async deleteOldResults(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      const snapshot = await this.getCollection()
        .where('createdAt', '<', cutoffDate)
        .get();
      
      const batch = this.firestore.batch();
      let count = 0;
      
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
        count++;
      });
      
      if (count > 0) {
        await batch.commit();
        logger.info(`Deleted ${count} old evolution results`);
      }
      
      return count;
    } catch (error) {
      logger.error('Error deleting old results:', error);
      throw error;
    }
  }

  async getJobsByStatus(status, limit = 50) {
    try {
      const snapshot = await this.getCollection()
        .where('status', '==', status)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      
      const jobs = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        jobs.push({
          jobId: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          completedAt: data.completedAt?.toDate?.() || data.completedAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
        });
      });
      
      return jobs;
    } catch (error) {
      logger.error(`Error getting jobs by status ${status}:`, error);
      throw error;
    }
  }

  async savePartialResult(jobId, generation, generationData) {
    try {
      const docRef = this.getCollection().doc(jobId);
      
      const updateData = {
        [`generations.generation_${generation}`]: {
          generation,
          topScore: generationData.topScore,
          avgScore: generationData.avgScore,
          solutionCount: generationData.solutionCount,
          solutions: generationData.solutions || [],
          completedAt: Firestore.FieldValue.serverTimestamp()
        },
        currentGeneration: generation,
        lastUpdateAt: Firestore.FieldValue.serverTimestamp(),
        updatedAt: Firestore.FieldValue.serverTimestamp()
      };
      
      await docRef.update(updateData);
      
      logger.info(`Saved partial result for job ${jobId}, generation ${generation}`);
      return true;
    } catch (error) {
      logger.error('Error saving partial result:', error);
      throw error;
    }
  }

  async updateGenerationProgress(jobId, generation, totalGenerations, phase = 'processing') {
    try {
      const updateData = {
        progress: {
          currentGeneration: generation,
          totalGenerations: totalGenerations,
          phase: phase,
          percentComplete: Math.round((generation / totalGenerations) * 100),
          lastUpdateAt: Firestore.FieldValue.serverTimestamp()
        },
        updatedAt: Firestore.FieldValue.serverTimestamp()
      };
      
      await this.getCollection().doc(jobId).update(updateData);
      
      logger.info(`Updated progress for job ${jobId}: generation ${generation}/${totalGenerations}, phase: ${phase}`);
      return true;
    } catch (error) {
      logger.error('Error updating generation progress:', error);
      throw error;
    }
  }

  async addApiCallTelemetry(jobId, telemetry) {
    try {
      const docRef = this.getCollection().doc(jobId);
      
      // Add telemetry to array
      await docRef.update({
        apiCalls: Firestore.FieldValue.arrayUnion(telemetry),
        updatedAt: Firestore.FieldValue.serverTimestamp()
      });
      
      logger.info(`Added API call telemetry for job ${jobId}, phase: ${telemetry.phase}`);
      return true;
    } catch (error) {
      logger.error('Error adding API call telemetry:', error);
      throw error;
    }
  }
  
  async saveApiCallDebug(jobId, callId, debugData) {
    try {
      // Save full API call data in a separate subcollection for debugging
      const debugRef = this.getCollection().doc(jobId).collection('apiDebug').doc(callId);
      
      await debugRef.set({
        ...debugData,
        createdAt: Firestore.FieldValue.serverTimestamp()
      });
      
      logger.info(`Saved API debug data for job ${jobId}, callId: ${callId}`);
      return true;
    } catch (error) {
      logger.error('Error saving API debug data:', error);
      // Don't throw - this is optional debug data
      return false;
    }
  }
  
  async updatePhaseStatus(jobId, generation, phase, status) {
    try {
      const docRef = this.getCollection().doc(jobId);
      
      // Use transaction for atomic update
      const result = await this.firestore.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        
        if (!doc.exists) {
          throw new Error(`Job ${jobId} not found`);
        }
        
        const data = doc.data();
        const genKey = `generation_${generation}`;
        const phaseStartedKey = `${phase}Started`;
        
        // Check if phase already started (prevent race condition)
        if (status === 'started' && data.generations?.[genKey]?.[phaseStartedKey]) {
          logger.warn(`Phase ${phase} already started for job ${jobId}, gen ${generation}`);
          return { alreadyStarted: true };
        }
        
        // Reset phase if requested
        if (status === 'reset') {
          const updates = {
            [`generations.${genKey}.${phaseStartedKey}`]: false,
            [`generations.${genKey}.${phase}Complete`]: false,
            [`generations.${genKey}.${phase}StartedAt`]: Firestore.FieldValue.delete(),
            updatedAt: Firestore.FieldValue.serverTimestamp()
          };
          transaction.update(docRef, updates);
          return { reset: true };
        }
        
        // Normal status update
        const updates = {
          [`generations.${genKey}.${phaseStartedKey}`]: status === 'started',
          [`generations.${genKey}.${phase}StartedAt`]: Firestore.FieldValue.serverTimestamp(),
          currentGeneration: generation,
          currentPhase: phase,
          updatedAt: Firestore.FieldValue.serverTimestamp()
        };
        
        transaction.update(docRef, updates);
        return { updated: true };
      });
      
      logger.info(`Updated phase status for job ${jobId}: gen ${generation}, ${phase} ${status}`, result);
      return result;
    } catch (error) {
      logger.error('Error updating phase status:', error);
      throw error;
    }
  }
  
  async savePhaseResults(jobId, generation, phase, results) {
    try {
      const genKey = `generations.generation_${generation}`;
      const updates = {
        [`${genKey}.${phase}Complete`]: true,
        [`${genKey}.${phase}CompletedAt`]: Firestore.FieldValue.serverTimestamp(),
        updatedAt: Firestore.FieldValue.serverTimestamp()
      };
      
      // Add phase-specific results
      Object.keys(results).forEach(key => {
        updates[`${genKey}.${key}`] = results[key];
      });
      
      await this.getCollection().doc(jobId).update(updates);
      
      logger.info(`Saved ${phase} results for job ${jobId}, generation ${generation}`);
      return true;
    } catch (error) {
      logger.error('Error saving phase results:', error);
      throw error;
    }
  }
  
  async completeJob(jobId, finalResults) {
    try {
      await this.getCollection().doc(jobId).update({
        status: 'completed',
        completedAt: Firestore.FieldValue.serverTimestamp(),
        updatedAt: Firestore.FieldValue.serverTimestamp(),
        ...finalResults
      });
      
      logger.info(`Job ${jobId} marked as completed`);
      return true;
    } catch (error) {
      logger.error('Error completing job:', error);
      throw error;
    }
  }
}

export default EvolutionResultStore;