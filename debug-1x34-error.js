#!/usr/bin/env node

console.log('Debugging 1x34 job enricher failure...\n');

console.log('The 1x34 job shows:');
console.log('- Status: pending');
console.log('- variatorComplete: true (34 ideas generated)');
console.log('- enricherComplete: true');
console.log('- solutions: 0 (enricher failed to parse response)');
console.log('\nThe enricher marked itself complete but produced 0 solutions.');
console.log('This indicates the LLM response parsing failed.');
console.log('\nFrom the logs we see two enricher attempts:');
console.log('1. 04:40:06 - First attempt');
console.log('2. 04:45:07 - Second attempt');
console.log('3. 04:49:58 - Response received but parsing failed');
console.log('\nThe error "Failed to parse LLM response" suggests the o3 model');
console.log('returned invalid JSON or a response that didn\'t match expected format.');
console.log('\nTo investigate further, we need to:');
console.log('1. Extract the full LLM response from logs');
console.log('2. Identify why JSON parsing failed');
console.log('3. Potentially retry with better error handling');