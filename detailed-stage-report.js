#!/usr/bin/env node
import fetch from 'node-fetch';
import fs from 'fs/promises';

const API_URL = 'https://evolution-solver-production-pfm22omnda-uc.a.run.app';

// Get job analytics with detailed API calls
async function getDetailedAnalytics(jobId) {
  const response = await fetch(`${API_URL}/api/evolution/jobs/${jobId}`);
  const jobData = await response.json();
  return jobData;
}

// Format time
function formatTime(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toTimeString().slice(0, 8);
}

// Format duration
function formatDuration(ms) {
  if (!ms) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  return `${seconds}s`;
}

// Create detailed stage report
async function createStageReport() {
  try {
    const jobInfo = JSON.parse(await fs.readFile('parallel-jobs.json', 'utf8'));
    
    console.log('📊 Detailed Stage-by-Stage Execution Report');
    console.log('==========================================');
    console.log(`Generated at: ${new Date().toISOString()}\n`);
    
    // Get all job details
    const allJobs = await Promise.all(
      jobInfo.map(async job => ({
        ...job,
        data: await getDetailedAnalytics(job.jobId)
      }))
    );
    
    // Table header
    console.log('Job Name         | Gen | Phase     | Status    | Tokens In | Tokens Out | Time Started | Duration | Model');
    console.log('-----------------|-----|-----------|-----------|-----------|------------|--------------|----------|-------');
    
    // Process each job
    for (const job of allJobs) {
      const jobData = job.data;
      let firstRow = true;
      
      // Get API calls for detailed timing
      const apiCalls = jobData.apiCalls || [];
      
      // Group API calls by generation and phase
      const callsByGenPhase = {};
      apiCalls.forEach(call => {
        if (call.generation !== undefined && call.phase) {
          const key = `${call.generation}-${call.phase}`;
          if (!callsByGenPhase[key]) {
            callsByGenPhase[key] = [];
          }
          callsByGenPhase[key].push(call);
        }
      });
      
      // Process generations
      const generations = jobData.generations || {};
      const genKeys = Object.keys(generations).sort((a, b) => parseInt(a) - parseInt(b));
      
      if (genKeys.length === 0 && apiCalls.length > 0) {
        // If no generation data but have API calls, use API calls
        apiCalls.forEach(call => {
          if (call.phase && call.generation !== undefined) {
            const jobName = firstRow ? job.name.padEnd(16) : ' '.repeat(16);
            firstRow = false;
            
            console.log(
              `${jobName} | ${call.generation.toString().padEnd(3)} | ${call.phase.padEnd(9)} | ${(call.status || 'completed').padEnd(9)} | ${(call.usage?.prompt_tokens || 0).toString().padEnd(9)} | ${(call.usage?.completion_tokens || 0).toString().padEnd(10)} | ${formatTime(call.timestamp)} | ${formatDuration(call.duration)} | ${call.model || 'o3'}`
            );
          }
        });
      } else {
        // Use generation data
        for (const genNum of genKeys) {
          const genData = generations[genNum];
          
          // Process each phase
          for (const phase of ['variator', 'enricher', 'ranker']) {
            if (genData[phase]) {
              const phaseData = genData[phase];
              const jobName = firstRow ? job.name.padEnd(16) : ' '.repeat(16);
              firstRow = false;
              
              // Find corresponding API call for token data
              const apiCall = apiCalls.find(c => 
                c.generation === parseInt(genNum) && 
                c.phase === phase
              );
              
              const tokensIn = apiCall?.usage?.prompt_tokens || phaseData.tokensIn || 0;
              const tokensOut = apiCall?.usage?.completion_tokens || phaseData.tokensOut || 0;
              const startTime = apiCall?.timestamp || phaseData.startTime;
              const duration = apiCall?.duration || phaseData.duration;
              
              console.log(
                `${jobName} | ${genNum.padEnd(3)} | ${phase.padEnd(9)} | ${(phaseData.status || 'completed').padEnd(9)} | ${tokensIn.toString().padEnd(9)} | ${tokensOut.toString().padEnd(10)} | ${formatTime(startTime)} | ${formatDuration(duration)} | ${apiCall?.model || 'o3'}`
              );
            }
          }
        }
      }
      
      // Add separator between jobs
      if (job !== allJobs[allJobs.length - 1]) {
        console.log('-'.repeat(120));
      }
    }
    
    // Summary statistics
    console.log('\n📈 Aggregate Statistics:');
    console.log('========================');
    
    let totalApiCalls = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let phaseCount = { variator: 0, enricher: 0, ranker: 0 };
    
    allJobs.forEach(job => {
      const apiCalls = job.data.apiCalls || [];
      totalApiCalls += apiCalls.length;
      
      apiCalls.forEach(call => {
        totalTokensIn += call.usage?.prompt_tokens || 0;
        totalTokensOut += call.usage?.completion_tokens || 0;
        if (call.phase) phaseCount[call.phase]++;
      });
    });
    
    console.log(`Total API Calls: ${totalApiCalls}`);
    console.log(`Total Tokens: ${totalTokensIn + totalTokensOut} (Input: ${totalTokensIn}, Output: ${totalTokensOut})`);
    console.log(`Calls by Phase: Variator: ${phaseCount.variator}, Enricher: ${phaseCount.enricher}, Ranker: ${phaseCount.ranker}`);
    
    // Job completion status
    console.log('\nJob Status:');
    allJobs.forEach(job => {
      const status = job.data.status;
      const progress = Object.keys(job.data.generations || {}).length;
      console.log(`${job.name}: ${status} (${progress}/${job.generations} generations)`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Make sure parallel-jobs.json exists from running submit-parallel-jobs.js');
  }
}

// Run report
createStageReport().catch(console.error);