export default jest.fn().mockImplementation(() => ({
  createEvolutionTask: jest.fn().mockResolvedValue({
    taskName: 'test-task',
    status: 'queued'
  }),
  createOrchestratorTask: jest.fn().mockResolvedValue({
    jobId: 'test-job',
    taskName: 'test-task',
    status: 'queued'
  }),
  createWorkerTask: jest.fn().mockResolvedValue({
    taskName: 'test-task',
    status: 'queued'
  }),
  listTasks: jest.fn().mockResolvedValue([]),
  getQueueStats: jest.fn().mockResolvedValue({
    name: 'test-queue',
    tasksCount: 0
  }),
  pauseQueue: jest.fn().mockResolvedValue(true),
  resumeQueue: jest.fn().mockResolvedValue(true),
  purgeQueue: jest.fn().mockResolvedValue(true)
}));
