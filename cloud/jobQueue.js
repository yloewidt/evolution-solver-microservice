import { CloudTasksClient } from '@google-cloud/tasks';
import { ExecutionsClient, WorkflowsClient } from '@google-cloud/workflows';
import logger from '../src/utils/logger.js';

/**
 * Unified job queue that abstracts Cloud Tasks and Cloud Workflows
 * Uses strategy pattern to switch between implementations based on configuration
 */
class JobQueue {
  constructor(config = {}) {
    this.projectId = config.projectId || process.env.GCP_PROJECT_ID || 'evolutionsolver';
    this.location = config.location || process.env.GCP_LOCATION || 'us-central1';
    this.queueName = config.queueName || process.env.CLOUD_TASKS_QUEUE || 'evolution-jobs';
    this.workflowName = config.workflowName || process.env.WORKFLOW_NAME || 'evolution-job-workflow';
    this.environment = config.environment || process.env.ENVIRONMENT || 'production';
    
    // Choose strategy based on configuration
    const useWorkflows = process.env.USE_WORKFLOWS === 'true' || config.useWorkflows;
    
    if (useWorkflows) {
      this.strategy = new WorkflowStrategy(this);
    } else {
      this.strategy = new TaskStrategy(this);
    }
    
    logger.info(`JobQueue initialized with ${useWorkflows ? 'Workflow' : 'Task'} strategy`);
  }

  /**
   * Queue a job for processing
   */
  async queueJob(jobData) {
    return this.strategy.queueJob(jobData);
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId) {
    return this.strategy.getJobStatus(jobId);
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId) {
    return this.strategy.cancelJob(jobId);
  }

  /**
   * List recent jobs
   */
  async listJobs(limit = 50) {
    return this.strategy.listJobs(limit);
  }

  /**
   * Get queue statistics (Cloud Tasks only)
   */
  async getQueueStats() {
    if (this.strategy instanceof TaskStrategy) {
      return this.strategy.getQueueStats();
    }
    throw new Error('Queue stats only available for Cloud Tasks');
  }

  /**
   * Pause/Resume queue (Cloud Tasks only)
   */
  async pauseQueue() {
    if (this.strategy instanceof TaskStrategy) {
      return this.strategy.pauseQueue();
    }
    throw new Error('Queue control only available for Cloud Tasks');
  }

  async resumeQueue() {
    if (this.strategy instanceof TaskStrategy) {
      return this.strategy.resumeQueue();
    }
    throw new Error('Queue control only available for Cloud Tasks');
  }
}

/**
 * Cloud Tasks Strategy
 */
class TaskStrategy {
  constructor(queue) {
    this.queue = queue;
    this.client = new CloudTasksClient();
    this.queuePath = this.client.queuePath(
      queue.projectId,
      queue.location,
      queue.queueName
    );
    this.serviceAccountEmail = process.env.SERVICE_ACCOUNT_EMAIL || 
      `evolution-solver@${queue.projectId}.iam.gserviceaccount.com`;
  }

  async queueJob(jobData) {
    const workerUrl = process.env.EVOLUTION_WORKER_URL;
    if (!workerUrl) {
      throw new Error('EVOLUTION_WORKER_URL not configured');
    }

    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: `${workerUrl}/process`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify(jobData)).toString('base64'),
      },
    };

    if (this.serviceAccountEmail) {
      task.httpRequest.oidcToken = {
        serviceAccountEmail: this.serviceAccountEmail,
      };
    }

    try {
      const [response] = await this.client.createTask({
        parent: this.queuePath,
        task,
      });

      logger.info(`Created task for job ${jobData.jobId}`);
      
      return {
        jobId: jobData.jobId,
        taskName: response.name,
        status: 'queued',
        queueTime: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error creating task:', error);
      throw error;
    }
  }

  async getJobStatus(taskName) {
    try {
      const [task] = await this.client.getTask({ name: taskName });
      
      return {
        name: task.name,
        status: task.state || 'UNKNOWN',
        createTime: task.createTime,
        scheduleTime: task.scheduleTime,
        attempts: task.firstAttempt ? 1 : 0
      };
    } catch (error) {
      if (error.code === 5) { // NOT_FOUND
        return null;
      }
      throw error;
    }
  }

  async cancelJob(taskName) {
    try {
      await this.client.deleteTask({ name: taskName });
      logger.info(`Cancelled task: ${taskName}`);
      return true;
    } catch (error) {
      if (error.code === 5) { // NOT_FOUND
        return false;
      }
      throw error;
    }
  }

  async listJobs(limit) {
    const [tasks] = await this.client.listTasks({
      parent: this.queuePath,
      pageSize: limit,
    });
    
    return tasks.map(task => ({
      name: task.name,
      status: task.state,
      createTime: task.createTime,
      scheduleTime: task.scheduleTime
    }));
  }

  async getQueueStats() {
    const [queue] = await this.client.getQueue({ name: this.queuePath });
    
    return {
      name: queue.name,
      state: queue.state,
      rateLimits: queue.rateLimits,
      retryConfig: queue.retryConfig,
      stats: queue.stats
    };
  }

  async pauseQueue() {
    const [queue] = await this.client.pauseQueue({ name: this.queuePath });
    return { state: queue.state };
  }

  async resumeQueue() {
    const [queue] = await this.client.resumeQueue({ name: this.queuePath });
    return { state: queue.state };
  }
}

/**
 * Cloud Workflows Strategy
 */
class WorkflowStrategy {
  constructor(queue) {
    this.queue = queue;
    
    // Configure clients
    const clientConfig = {};
    const isCloudRun = process.env.K_SERVICE !== undefined;
    if (!isCloudRun && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      clientConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    
    this.executionsClient = new ExecutionsClient(clientConfig);
    this.workflowsClient = new WorkflowsClient(clientConfig);
    
    this.workflowPath = this.workflowsClient.workflowPath(
      queue.projectId,
      queue.location,
      `${queue.workflowName}-${queue.environment}`
    );
  }

  async queueJob(jobData) {
    try {
      const executionId = `job-${jobData.jobId}-${Date.now()}`;
      
      const request = {
        parent: this.workflowPath,
        execution: {
          argument: JSON.stringify(jobData)
        }
      };

      logger.info(`Starting workflow execution for job ${jobData.jobId}`);
      
      const [execution] = await this.executionsClient.createExecution(request);
      
      logger.info(`Created workflow execution: ${execution.name}`);
      
      return {
        jobId: jobData.jobId,
        executionName: execution.name,
        status: 'running',
        startTime: execution.startTime
      };
    } catch (error) {
      logger.error('Error creating workflow execution:', error);
      throw error;
    }
  }

  async getJobStatus(executionName) {
    try {
      const [execution] = await this.executionsClient.getExecution({
        name: executionName
      });
      
      return {
        name: execution.name,
        state: execution.state,
        result: execution.result ? JSON.parse(execution.result) : null,
        error: execution.error,
        startTime: execution.startTime,
        endTime: execution.endTime
      };
    } catch (error) {
      if (error.code === 5) { // NOT_FOUND
        return null;
      }
      throw error;
    }
  }

  async cancelJob(executionName) {
    try {
      const [operation] = await this.executionsClient.cancelExecution({
        name: executionName
      });
      
      logger.info(`Cancelled execution: ${executionName}`);
      return true;
    } catch (error) {
      if (error.code === 5) { // NOT_FOUND
        return false;
      }
      throw error;
    }
  }

  async listJobs(limit) {
    try {
      const request = {
        parent: this.workflowPath,
        pageSize: limit
      };

      const [executions] = await this.executionsClient.listExecutions(request);
      
      return executions.map(exec => ({
        name: exec.name,
        state: exec.state,
        startTime: exec.startTime,
        endTime: exec.endTime,
        workflowRevisionId: exec.workflowRevisionId
      }));
    } catch (error) {
      logger.error('Error listing executions:', error);
      return [];
    }
  }
}

export default JobQueue;
export { JobQueue };