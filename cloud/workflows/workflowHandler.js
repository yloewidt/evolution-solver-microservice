import { ExecutionsClient, WorkflowsClient } from '@google-cloud/workflows';
import logger from '../../src/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

class WorkflowHandler {
  constructor() {
    // Detect if running in Cloud Run
    const isCloudRun = process.env.K_SERVICE !== undefined;
    
    // Configure clients based on environment
    const clientConfig = {};
    if (!isCloudRun && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      clientConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    
    this.executionsClient = new ExecutionsClient(clientConfig);
    this.workflowsClient = new WorkflowsClient(clientConfig);
    
    this.projectId = process.env.GCP_PROJECT_ID || 'evolutionsolver';
    this.location = process.env.GCP_LOCATION || 'us-central1';
    this.workflowName = process.env.WORKFLOW_NAME || 'evolution-job-workflow';
    this.environment = process.env.ENVIRONMENT || 'production';
  }

  getWorkflowPath() {
    return this.workflowsClient.workflowPath(
      this.projectId,
      this.location,
      `${this.workflowName}-${this.environment}`
    );
  }

  async executeEvolutionWorkflow(jobData) {
    try {
      const executionId = `job-${jobData.jobId}-${Date.now()}`;
      
      const request = {
        parent: this.getWorkflowPath(),
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

  async getExecutionStatus(executionName) {
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
      logger.error('Error getting execution status:', error);
      throw error;
    }
  }

  async cancelExecution(executionName) {
    try {
      const [operation] = await this.executionsClient.cancelExecution({
        name: executionName
      });
      
      logger.info(`Cancelled execution: ${executionName}`);
      
      return operation;
    } catch (error) {
      logger.error('Error cancelling execution:', error);
      throw error;
    }
  }

  async listExecutions(limit = 50) {
    try {
      const request = {
        parent: this.getWorkflowPath(),
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

export default WorkflowHandler;