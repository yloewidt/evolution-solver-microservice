# Parallel Processing Test Guide

This guide explains how to run the high-concurrency evolution solver test.

## Test Configuration

The test (`test-parallel-25-concurrency.js`) is configured with:
- **3 generations**
- **13 ideas per generation**
- **Top 3 ideas selected** to pass to the next generation
- **Concurrency: 25** (processes all 13 ideas in parallel)
- **Expected completion time: ~90 seconds** (30s per generation)

## Running the Test

### Option 1: Local Server

1. Start the local server:
   ```bash
   npm start
   ```

2. In another terminal, run the test:
   ```bash
   ./test-parallel-25-concurrency.js
   ```

### Option 2: Production Server

Run the test against the production server:
```bash
USE_PRODUCTION=true ./test-parallel-25-concurrency.js
```

### Option 3: Custom Server

Specify a custom API URL:
```bash
API_URL=http://your-server:8080 ./test-parallel-25-concurrency.js
```

## What to Expect

The test will:
1. Submit a job with the drone delivery market as the problem context
2. Monitor progress in real-time, showing:
   - Current generation and phase
   - Time per generation
   - Overall progress percentage
3. Display the top 3 solutions when complete
4. Provide performance analysis

### Performance Indicators

- **🚀 Excellent**: < 120 seconds (parallel processing working effectively)
- **✓ Good**: 120-180 seconds (some optimization possible)
- **⚠️ Slow**: > 180 seconds (check for bottlenecks)

## Key Changes Made

1. **Updated default concurrency** in `workerHandlersV2.js` from 5 to 25
2. **Created test** with 13 ideas per generation to test parallel processing
3. **Real-time monitoring** shows generation timing and progress

## Troubleshooting

If the test takes longer than expected:
1. Check API rate limits
2. Verify network connectivity
3. Monitor server logs for errors
4. Ensure the LLM API keys are properly configured