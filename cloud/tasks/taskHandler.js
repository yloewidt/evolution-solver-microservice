import { CloudTasksClient } from '@google-cloud/tasks';
import logger from '../../src/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

class CloudTaskHandler {
  constructor() {
    // Detect if running in Cloud Run
    const isCloudRun = process.env.K_SERVICE !== undefined;
    
    // Configure Cloud Tasks client based on environment
    const clientConfig = {};
    if (!isCloudRun && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      clientConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    
    this.client = new CloudTasksClient(clientConfig);
    this.projectId = process.env.GCP_PROJECT_ID || 'evolutionsolver';
    this.location = process.env.GCP_LOCATION || 'us-central1';
    this.queueName = process.env.CLOUD_TASKS_QUEUE || 'evolution-jobs';
    this.workerUrl = process.env.EVOLUTION_WORKER_URL || 'https://evolution-worker-prod-xxxx.run.app';
  }

  getQueuePath() {
    return this.client.queuePath(this.projectId, this.location, this.queueName);
  }

  async createEvolutionTask(jobData) {
    try {
      const jobId = jobData.jobId || uuidv4();
      
      const task = {
        httpRequest: {
          httpMethod: 'POST',
          url: `${this.workerUrl}/process-evolution`,
          headers: {
            'Content-Type': 'application/json',
          },
          body: Buffer.from(JSON.stringify({
            ...jobData,
            jobId,
            taskCreatedAt: new Date().toISOString()
          })).toString('base64'),
        },
        // Set dispatch deadline for the task (timeout per attempt)
        dispatchDeadline: { seconds: 900 }, // 15 minutes timeout per attempt
      };

      if (process.env.SERVICE_ACCOUNT_EMAIL) {
        task.httpRequest.oidcToken = {
          serviceAccountEmail: process.env.SERVICE_ACCOUNT_EMAIL,
        };
      }

      const request = {
        parent: this.getQueuePath(),
        task: task,
      };

      const [response] = await this.client.createTask(request);
      
      logger.info(`Created evolution task: ${response.name}`);
      
      return {
        jobId,
        taskName: response.name,
        status: 'queued'
      };
    } catch (error) {
      logger.error('Error creating evolution task:', error);
      throw error;
    }
  }

  async listTasks(pageSize = 100) {
    try {
      const request = {
        parent: this.getQueuePath(),
        pageSize,
      };

      const [tasks] = await this.client.listTasks(request);
      
      return tasks.map(task => ({
        name: task.name,
        createTime: task.createTime?.toDate?.() || task.createTime,
        scheduleTime: task.scheduleTime?.toDate?.() || task.scheduleTime,
        httpRequest: task.httpRequest,
        status: task.status || 'pending'
      }));
    } catch (error) {
      logger.error('Error listing tasks:', error);
      return [];
    }
  }

  async deleteTask(taskName) {
    try {
      await this.client.deleteTask({ name: taskName });
      logger.info(`Deleted task: ${taskName}`);
      return true;
    } catch (error) {
      logger.error('Error deleting task:', error);
      return false;
    }
  }

  async pauseQueue() {
    try {
      const queue = await this.client.getQueue({
        name: this.getQueuePath(),
      });

      queue.state = 'PAUSED';
      
      await this.client.updateQueue({
        queue,
        updateMask: {
          paths: ['state'],
        },
      });

      logger.info('Queue paused successfully');
      return true;
    } catch (error) {
      logger.error('Error pausing queue:', error);
      return false;
    }
  }

  async resumeQueue() {
    try {
      const queue = await this.client.getQueue({
        name: this.getQueuePath(),
      });

      queue.state = 'RUNNING';
      
      await this.client.updateQueue({
        queue,
        updateMask: {
          paths: ['state'],
        },
      });

      logger.info('Queue resumed successfully');
      return true;
    } catch (error) {
      logger.error('Error resuming queue:', error);
      return false;
    }
  }

  async getQueueStats() {
    try {
      const [queue] = await this.client.getQueue({
        name: this.getQueuePath(),
      });

      return {
        name: queue.name,
        state: queue.state,
        rateLimits: queue.rateLimits,
        retryConfig: queue.retryConfig,
        stats: queue.stats
      };
    } catch (error) {
      logger.error('Error getting queue stats:', error);
      throw error;
    }
  }

  async purgeQueue() {
    try {
      await this.client.purgeQueue({
        name: this.getQueuePath(),
      });

      logger.info('Queue purged successfully');
      return true;
    } catch (error) {
      logger.error('Error purging queue:', error);
      return false;
    }
  }
}

export default CloudTaskHandler;