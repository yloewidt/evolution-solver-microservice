#!/usr/bin/env node

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const app = initializeApp({
  projectId: process.env.GCP_PROJECT_ID || 'evolutionsolver'
});

const db = getFirestore();

/**
 * Download full API debug data including prompts and responses
 * Usage: node scripts/download-api-debug.js <jobId>
 */
async function downloadApiDebug(jobId) {
  console.log(`Downloading API debug data for job: ${jobId}`);
  
  // Create debug directory
  const debugDir = path.join(__dirname, '..', 'debug', jobId);
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
  
  try {
    // Get the main job document
    const jobDoc = await db.collection('evolution-results').doc(jobId).get();
    
    if (!jobDoc.exists) {
      console.error('Job not found');
      return;
    }
    
    const jobData = jobDoc.data();
    console.log(`Job status: ${jobData.status}`);
    console.log(`Problem: ${jobData.problemContext}`);
    
    // Get the apiDebug subcollection
    const apiDebugSnapshot = await db.collection('evolution-results')
      .doc(jobId)
      .collection('apiDebug')
      .orderBy('createdAt')
      .get();
    
    console.log(`Found ${apiDebugSnapshot.size} API debug entries`);
    
    const debugData = [];
    const summary = {
      jobId,
      problemContext: jobData.problemContext,
      status: jobData.status,
      totalDebugEntries: apiDebugSnapshot.size,
      entries: []
    };
    
    // Process each debug entry
    apiDebugSnapshot.forEach((doc) => {
      const data = doc.data();
      const callId = doc.id;
      
      // Save full data to individual file
      const filename = `${callId}_full.json`;
      const filepath = path.join(debugDir, filename);
      
      const fullData = {
        callId,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt
      };
      
      fs.writeFileSync(filepath, JSON.stringify(fullData, null, 2));
      console.log(`Saved: ${filename}`);
      
      // Add to summary
      summary.entries.push({
        callId,
        phase: data.phase,
        generation: data.generation,
        attempt: data.attempt,
        latencyMs: data.latencyMs,
        promptLength: data.prompt?.length || 0,
        responseLength: JSON.stringify(data.fullResponse).length,
        hasPrompt: !!data.prompt,
        hasResponse: !!data.fullResponse,
        hasParsedResponse: !!data.parsedResponse,
        timestamp: data.createdAt?.toDate?.() || data.createdAt
      });
      
      // Extract prompt to separate file for easy viewing
      if (data.prompt) {
        const promptFile = `${callId}_prompt.txt`;
        fs.writeFileSync(path.join(debugDir, promptFile), data.prompt);
      }
      
      // Extract parsed response to separate file
      if (data.parsedResponse) {
        const responseFile = `${callId}_parsed.json`;
        fs.writeFileSync(
          path.join(debugDir, responseFile), 
          JSON.stringify(data.parsedResponse, null, 2)
        );
      }
    });
    
    // Group by generation and phase
    const grouped = {};
    summary.entries.forEach(entry => {
      const key = `gen${entry.generation}_${entry.phase}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(entry);
    });
    
    // Find duplicates
    summary.duplicates = [];
    Object.entries(grouped).forEach(([key, entries]) => {
      if (entries.length > 1) {
        summary.duplicates.push({
          key,
          count: entries.length,
          entries: entries.map(e => ({
            callId: e.callId,
            attempt: e.attempt,
            timestamp: e.timestamp,
            latencyMs: e.latencyMs
          }))
        });
      }
    });
    
    // Save summary
    const summaryFile = path.join(debugDir, 'debug_summary.json');
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('Download Summary:');
    console.log(`Total debug entries: ${summary.totalDebugEntries}`);
    console.log(`Files saved to: ${debugDir}`);
    
    if (summary.duplicates.length > 0) {
      console.log('\nDuplicate API calls detected:');
      summary.duplicates.forEach(dup => {
        console.log(`  ${dup.key}: ${dup.count} calls`);
        dup.entries.forEach(e => {
          console.log(`    - ${e.callId} (attempt ${e.attempt}) at ${new Date(e.timestamp).toLocaleTimeString()}`);
        });
      });
    }
    
    console.log('\nFiles created:');
    console.log('  - *_full.json: Complete API call data');
    console.log('  - *_prompt.txt: Raw prompts sent to OpenAI');
    console.log('  - *_parsed.json: Parsed responses');
    console.log('  - debug_summary.json: Overview and duplicate analysis');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('Error downloading debug data:', error);
  }
}

// Main
const jobId = process.argv[2];
if (!jobId) {
  console.error('Usage: node scripts/download-api-debug.js <jobId>');
  process.exit(1);
}

downloadApiDebug(jobId).then(() => process.exit(0));