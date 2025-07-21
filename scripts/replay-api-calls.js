#!/usr/bin/env node

import fs from 'fs';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import logger from '../src/utils/logger.js';

dotenv.config();

/**
 * Replay API calls from production logs locally for debugging
 * 
 * Usage: 
 *   node scripts/replay-api-calls.js <log-file> [callId]
 *   
 * Examples:
 *   node scripts/replay-api-calls.js logs/production.log
 *   node scripts/replay-api-calls.js logs/production.log "jobId123_gen1_variator_1234567890"
 */

class APICallReplayer {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 900000, // 15 minute timeout
      maxRetries: 0, // No retries for replay
    });
    this.calls = new Map();
  }

  extractCallsFromLog(logContent) {
    const lines = logContent.split('\n');
    
    for (const line of lines) {
      try {
        // Look for API_CALL_REPLAY and API_RESPONSE_REPLAY logs
        if (line.includes('API_CALL_REPLAY:') || line.includes('API_RESPONSE_REPLAY:')) {
          const jsonMatch = line.match(/{.*}$/);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            
            if (line.includes('API_CALL_REPLAY:')) {
              // Initialize call data
              if (!this.calls.has(data.callId)) {
                this.calls.set(data.callId, {});
              }
              this.calls.get(data.callId).request = data;
            } else if (line.includes('API_RESPONSE_REPLAY:')) {
              // Add response data
              if (!this.calls.has(data.callId)) {
                this.calls.set(data.callId, {});
              }
              this.calls.get(data.callId).response = data;
            }
          }
        }
      } catch (error) {
        // Skip malformed lines
        continue;
      }
    }
    
    console.log(`Extracted ${this.calls.size} API calls from logs`);
  }

  async replayCall(callId) {
    const callData = this.calls.get(callId);
    if (!callData || !callData.request) {
      console.error(`No request data found for callId: ${callId}`);
      return;
    }

    const { request } = callData;
    console.log('\n' + '='.repeat(80));
    console.log(`Replaying API call: ${callId}`);
    console.log(`Phase: ${request.phase}`);
    console.log(`Generation: ${request.generation}`);
    console.log(`Timestamp: ${request.timestamp}`);
    console.log('='.repeat(80));

    // Reconstruct the API call based on phase
    let apiCall;
    
    if (request.phase === 'variator' || request.phase === 'enricher') {
      apiCall = {
        model: request.request.model || 'o3',
        input: [
          {
            role: "developer",
            content: [{ 
              type: "input_text", 
              text: request.phase === 'variator' 
                ? "You are an expert in creative business deal-making and solution generation. Generate innovative, low-risk, high-return solutions."
                : "You are a business strategist expert in financial modeling and deal structuring. Provide realistic, data-driven business cases."
            }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: request.request.fullPrompt }]
          }
        ],
        text: { format: { type: "text" } },
        reasoning: { effort: request.phase === 'enricher' ? "high" : "medium" },
        stream: false,
        store: true
      };
    }

    try {
      console.log('\nSending API request...');
      const startTime = Date.now();
      
      const response = await this.client.responses.create(apiCall);
      
      const latency = Date.now() - startTime;
      console.log(`\nResponse received in ${latency}ms`);
      
      // Compare with original response if available
      if (callData.response) {
        console.log('\nOriginal response stats:');
        console.log(`  Latency: ${callData.response.latencyMs}ms`);
        console.log(`  Usage:`, callData.response.usage);
        
        console.log('\nReplay response stats:');
        console.log(`  Latency: ${latency}ms`);
        console.log(`  Usage:`, response.usage);
      }
      
      // Parse and display the response
      const parsedResponse = await this.parseResponse(response);
      console.log('\nParsed response:');
      console.log(JSON.stringify(parsedResponse, null, 2));
      
      // Save full response for debugging
      const outputFile = `replay_${callId}.json`;
      fs.writeFileSync(outputFile, JSON.stringify({
        callId,
        originalRequest: callData.request,
        originalResponse: callData.response,
        replayResponse: {
          latency,
          usage: response.usage,
          fullResponse: response,
          parsedResponse
        }
      }, null, 2));
      
      console.log(`\nFull response saved to: ${outputFile}`);
      
    } catch (error) {
      console.error('\nError replaying API call:', error);
      
      // Check if this is a parsing error
      if (error.message.includes('parse')) {
        console.log('\nThis appears to be a parsing error - likely the same issue seen in production');
      }
    }
  }

  async parseResponse(response) {
    // Simplified version of the parsing logic from evolutionarySolver.js
    let content = '';
    
    if (response.output && Array.isArray(response.output)) {
      const textOutput = response.output.find(item => item.type === 'text');
      const messageOutput = response.output.find(item => item.type === 'message');
      
      if (textOutput && textOutput.content) {
        content = textOutput.content;
      } else if (messageOutput && messageOutput.content && messageOutput.content[0] && messageOutput.content[0].text) {
        content = messageOutput.content[0].text;
      }
    }
    
    if (!content) {
      throw new Error('No content in response');
    }
    
    // Clean up JSON
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      console.log('Failed to parse JSON, raw content:');
      console.log(content.substring(0, 500) + '...');
      throw error;
    }
  }

  listCalls() {
    console.log('\nAvailable API calls:');
    console.log('='.repeat(80));
    
    const calls = Array.from(this.calls.entries())
      .filter(([_, data]) => data.request)
      .sort((a, b) => {
        const aTime = new Date(a[1].request.timestamp);
        const bTime = new Date(b[1].request.timestamp);
        return aTime - bTime;
      });
    
    for (const [callId, data] of calls) {
      const { request } = data;
      console.log(`\nCall ID: ${callId}`);
      console.log(`  Phase: ${request.phase}`);
      console.log(`  Generation: ${request.generation}`);
      console.log(`  Timestamp: ${request.timestamp}`);
      console.log(`  Has Response: ${data.response ? 'Yes' : 'No'}`);
      if (data.response) {
        console.log(`  Original Latency: ${data.response.latencyMs}ms`);
      }
    }
    console.log('\n' + '='.repeat(80));
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: node scripts/replay-api-calls.js <log-file> [callId]');
    process.exit(1);
  }
  
  const logFile = args[0];
  const specificCallId = args[1];
  
  if (!fs.existsSync(logFile)) {
    console.error(`Log file not found: ${logFile}`);
    process.exit(1);
  }
  
  const replayer = new APICallReplayer();
  
  console.log(`Reading log file: ${logFile}`);
  const logContent = fs.readFileSync(logFile, 'utf8');
  
  replayer.extractCallsFromLog(logContent);
  
  if (specificCallId) {
    // Replay specific call
    await replayer.replayCall(specificCallId);
  } else {
    // List all calls
    replayer.listCalls();
    console.log('\nTo replay a specific call, run:');
    console.log(`  node scripts/replay-api-calls.js ${logFile} <callId>`);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});