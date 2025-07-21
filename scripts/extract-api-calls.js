#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extract API calls from a job and save them to local files
 * Usage: node scripts/extract-api-calls.js <jobId>
 */

async function extractApiCalls(jobId) {
  const API_URL = 'https://evolution-solver-production-871069696471.us-central1.run.app';
  
  console.log(`Extracting API calls for job: ${jobId}`);
  
  // Create debug directory
  const debugDir = path.join(__dirname, '..', 'debug', jobId);
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
  
  try {
    // Fetch job results
    const response = await fetch(`${API_URL}/api/evolution/results/${jobId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch job results: ${response.statusText}`);
    }
    
    const jobData = await response.json();
    
    if (!jobData.apiCalls || jobData.apiCalls.length === 0) {
      console.log('No API calls found in job data');
      return;
    }
    
    console.log(`Found ${jobData.apiCalls.length} API calls`);
    
    // Extract and save each API call
    jobData.apiCalls.forEach((call, index) => {
      const callId = `gen${call.generation}_${call.phase}_attempt${call.attempt}_${index}`;
      const callFile = path.join(debugDir, `${callId}.json`);
      
      // For now, we have the telemetry but not the full input/output
      // We'll need to get this from logs or implement better capture
      const callData = {
        callId,
        timestamp: call.timestamp,
        generation: call.generation,
        phase: call.phase,
        attempt: call.attempt,
        model: call.model,
        latencyMs: call.latencyMs,
        tokens: call.tokens,
        success: call.success,
        // These would need to be captured from logs
        input: null,
        output: null
      };
      
      fs.writeFileSync(callFile, JSON.stringify(callData, null, 2));
      console.log(`Saved: ${callFile}`);
    });
    
    // Save summary
    const summaryFile = path.join(debugDir, 'summary.json');
    const summary = {
      jobId,
      problemContext: jobData.problemContext,
      evolutionConfig: jobData.evolutionConfig,
      status: jobData.status,
      totalApiCalls: jobData.apiCalls.length,
      apiCallsByGeneration: {},
      duplicateCalls: []
    };
    
    // Analyze calls by generation
    jobData.apiCalls.forEach(call => {
      const key = `gen${call.generation}_${call.phase}`;
      if (!summary.apiCallsByGeneration[key]) {
        summary.apiCallsByGeneration[key] = [];
      }
      summary.apiCallsByGeneration[key].push({
        timestamp: call.timestamp,
        attempt: call.attempt,
        latencyMs: call.latencyMs
      });
    });
    
    // Find duplicates
    Object.entries(summary.apiCallsByGeneration).forEach(([key, calls]) => {
      if (calls.length > 1) {
        summary.duplicateCalls.push({
          key,
          count: calls.length,
          calls
        });
      }
    });
    
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`\nSaved summary to: ${summaryFile}`);
    
    if (summary.duplicateCalls.length > 0) {
      console.log('\nDuplicate calls detected:');
      summary.duplicateCalls.forEach(dup => {
        console.log(`  ${dup.key}: ${dup.count} calls`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Main
const jobId = process.argv[2];
if (!jobId) {
  console.error('Usage: node scripts/extract-api-calls.js <jobId>');
  process.exit(1);
}

extractApiCalls(jobId);