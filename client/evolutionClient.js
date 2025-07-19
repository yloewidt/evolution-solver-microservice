import fetch from 'node-fetch';

class EvolutionClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl || process.env.EVOLUTION_SERVICE_URL || 'http://localhost:8080';
    this.apiKey = options.apiKey || process.env.EVOLUTION_API_KEY;
    this.timeout = options.timeout || 30000;
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}/api/evolution${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      ...options.headers
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      
      throw error;
    }
  }

  // Submit a new evolution job
  async submitJob(problemContext, options = {}) {
    const { parameters, filters, selectedBottleneck } = options;
    
    return this.request('/jobs', {
      method: 'POST',
      body: JSON.stringify({
        problemContext,
        parameters,
        filters,
        selectedBottleneck
      })
    });
  }

  // Get job status
  async getJobStatus(jobId) {
    return this.request(`/jobs/${jobId}`);
  }

  // Get job results
  async getResults(jobId) {
    return this.request(`/results/${jobId}`);
  }

  // List jobs
  async listJobs(options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    const params = new URLSearchParams();
    
    if (status) params.append('status', status);
    params.append('limit', limit);
    params.append('offset', offset);
    
    return this.request(`/jobs?${params}`);
  }

  // Get statistics
  async getStats() {
    return this.request('/stats');
  }

  // Get user results
  async getUserResults(userId, limit = 10) {
    return this.request(`/user/${userId}/results?limit=${limit}`);
  }

  // Get all solutions
  async getAllSolutions(limit = 100) {
    return this.request(`/solutions?limit=${limit}`);
  }

  // Get bottleneck solutions
  async getBottleneckSolutions(industryName, problem) {
    const params = new URLSearchParams({
      industryName,
      problem
    });
    
    return this.request(`/bottleneck-solutions?${params}`);
  }

  // Queue management (admin only)
  async pauseQueue() {
    return this.request('/queue/pause', { method: 'POST' });
  }

  async resumeQueue() {
    return this.request('/queue/resume', { method: 'POST' });
  }

  async purgeQueue() {
    return this.request('/queue/purge', { method: 'DELETE' });
  }

  // Health check
  async health() {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.json();
  }

  // Ready check
  async ready() {
    const response = await fetch(`${this.baseUrl}/ready`);
    return response.json();
  }

  // Convenience method: Submit job and wait for completion
  async submitAndWait(problemContext, options = {}, pollInterval = 5000, maxWaitTime = 600000) {
    const result = await this.submitJob(problemContext, options);
    const jobId = result.jobId;
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      const status = await this.getJobStatus(jobId);
      
      if (status.status === 'completed') {
        return await this.getResults(jobId);
      }
      
      if (status.status === 'failed') {
        throw new Error(`Job ${jobId} failed: ${status.error || 'Unknown error'}`);
      }
    }
    
    throw new Error(`Job ${jobId} timed out after ${maxWaitTime}ms`);
  }
}

export default EvolutionClient;