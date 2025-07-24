import { CloudTasksClient } from '@google-cloud/tasks';
import logger from '../../src/utils/logger.js';

export default class CloudTaskHandler {
  constructor(config) {
    this.projectId = config.projectId;
    this.location = config.location;
    this.queueName = config.queueName;
    this.serviceAccountEmail = config.serviceAccountEmail;
    this.client = new CloudTasksClient();
    this.queuePath = this.client.queuePath(this.projectId, this.location, this.queueName);
  }

  async createEvolutionTask(jobId, workerUrl, payload) {
    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: `${workerUrl}/process`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify({ jobId, ...payload })).toString('base64'),
      },
    };

    if (this.serviceAccountEmail) {
      task.httpRequest.oidcToken = {
        serviceAccountEmail: this.serviceAccountEmail,
      };
    }

    const [response] = await this.client.createTask({
      parent: this.queuePath,
      task,
    });

    logger.info(`Created evolution task for job ${jobId}`, { taskName: response.name });
    return response;
  }

  async createOrchestratorTask(jobId, workerUrl, payload) {
    return this.createEvolutionTask(jobId, workerUrl, payload);
  }

  async createWorkerTask(workerUrl, payload) {
    return this.createEvolutionTask(payload.jobId, workerUrl, payload);
  }

  async listTasks() {
    const [tasks] = await this.client.listTasks({
      parent: this.queuePath,
    });
    return tasks;
  }

  async getQueueStats() {
    const [queue] = await this.client.getQueue({
      name: this.queuePath,
    });
    return queue;
  }

  async pauseQueue() {
    const [queue] = await this.client.pauseQueue({
      name: this.queuePath,
    });
    return queue;
  }

  async resumeQueue() {
    const [queue] = await this.client.resumeQueue({
      name: this.queuePath,
    });
    return queue;
  }

  async purgeQueue() {
    const [queue] = await this.client.purgeQueue({
      name: this.queuePath,
    });
    return queue;
  }
}