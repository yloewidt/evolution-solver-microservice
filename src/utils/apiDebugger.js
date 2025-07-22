import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * API Debugger for capturing and saving API calls for local replay
 */
class APIDebugger {
  constructor() {
    this.debugDir = path.join(__dirname, '../../debug');
    this.enabled = process.env.API_DEBUG === 'true';

    if (this.enabled) {
      // Ensure debug directory exists
      if (!fs.existsSync(this.debugDir)) {
        fs.mkdirSync(this.debugDir, { recursive: true });
      }
    }
  }

  saveCall(callId, phase, request, response = null) {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const filename = `${callId}.json`;
    const filepath = path.join(this.debugDir, filename);

    const data = {
      callId,
      phase,
      timestamp,
      request,
      response,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        model: process.env.MODEL || 'o3',
        jobId: callId.split('_')[0]
      }
    };

    try {
      // If file exists, update with response
      if (fs.existsSync(filepath) && response) {
        const existing = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        existing.response = response;
        existing.completedAt = timestamp;
        fs.writeFileSync(filepath, JSON.stringify(existing, null, 2));
      } else {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.error('Failed to save debug data:', error);
    }
  }

  static extractPromptFromStructured(apiCall) {
    // Extract the user prompt from the structured API call
    const userMessage = apiCall.input?.find(msg => msg.role === 'user');
    if (userMessage?.content?.[0]?.text) {
      return userMessage.content[0].text;
    }
    return null;
  }

  static formatForReplay(callId, phase, prompt, model = 'o3') {
    // Format a simple structure for easy replay
    return {
      callId,
      phase,
      model,
      prompt,
      timestamp: new Date().toISOString(),
      replayCommand: `node scripts/replay-api-calls.js debug/${callId}.json`
    };
  }
}

export default APIDebugger;
