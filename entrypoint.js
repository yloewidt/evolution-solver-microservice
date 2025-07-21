/**
 * Entry point that determines whether to run API or Worker based on environment
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine which server to run
const isWorker = process.env.IS_WORKER === 'true';
const scriptPath = isWorker 
  ? join(__dirname, 'cloud', 'run', 'worker.js')
  : join(__dirname, 'src', 'server.js');

console.log(`Starting ${isWorker ? 'Worker' : 'API'} server...`);
console.log(`Script path: ${scriptPath}`);

// Start the appropriate server
const serverProcess = spawn('node', [scriptPath], {
  stdio: 'inherit',
  env: process.env
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  serverProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  serverProcess.kill('SIGINT');
});

serverProcess.on('exit', (code) => {
  console.log(`Server process exited with code ${code}`);
  process.exit(code);
});