# Evolution Algorithm Investigation Report

## Executive Summary

The investigation revealed critical issues in the evolutionary algorithm that cause incorrect behavior when solutions are filtered due to constraint violations:

1. **Complete Evolution Breakdown**: When `maxCapex` is set too low, ALL solutions get filtered out, causing scores to be 0 and breaking the evolutionary process
2. **No Solution Preservation**: Filtered solutions are not carried forward to the next generation, forcing the algorithm to start fresh each time
3. **Incorrect Score Reporting**: The system reports 0 scores instead of actual calculated scores for filtered solutions
4. **Token Count Stability**: Suspiciously consistent token usage suggests prompts aren't including previous generation data when all solutions are filtered

## Detailed Findings

### 1. The Filter Problem

**Example Job**: `b1965536-9c4d-45ba-bbd1-91b9e4b567d6`
- Problem: "Generate solutions for optimizing last-mile delivery costs"
- Configuration: `maxCapex: 0.2` ($200K limit)
- Result: ALL solutions had CAPEX > $1M and were filtered out

**Data Evidence**:
```json
{
  "idea_id": "shared_hub_network_v1",
  "score": null,
  "filtered": true,
  "filterReason": "CAPEX ($3M) exceeds maximum ($0.2M)",
  "business_case": {
    "capex_est": 3,
    "npv_success": 240,
    "likelihood": 0.35
  }
}
```

### 2. Evolution Breakdown

**Code Analysis** (`evolutionarySolver.js` lines 740-741):
```javascript
const topPerformers = rankedIdeas.slice(0, config.topSelectCount);
currentGen = topPerformers; // Empty array when all filtered!
```

**Consequence**: 
- Generation 1: Produces 5 solutions, all filtered
- Generation 2: Starts with empty `currentGen`, generates 5 new unrelated solutions
- No evolutionary improvement occurs

### 3. Score Calculation Issue

**Current Logic**:
```javascript
let score = -Infinity;
if (!filtered) {
  // Score calculation only for non-filtered
  expectedValue = p * npv - (1 - p) * capex;
  score = expectedValue / diversificationPenalty;
}
```

**Problem**: Filtered solutions never get scored, making it impossible to identify the "best of the filtered" solutions.

### 4. API Call Patterns

**Observed**:
- Generation 1: 10 API calls (3 variator, 1 enricher, 6 reformatter retries)
- Generation 2: 10 API calls (same pattern)
- High reformatter usage suggests response parsing issues

**Token Usage**:
- Generation 1: Input 1869, Output 1488
- Generation 2: Input 1785, Output 1404
- Variance: Only 84 tokens (4.5%) - suspiciously low for dynamic content

## Root Cause Analysis

The algorithm assumes at least some solutions will pass filters. When this assumption fails:

1. `rankedIdeas` becomes empty
2. `topPerformers` selection yields empty array
3. Next generation starts without parent solutions
4. Variator generates completely new solutions instead of evolving
5. No evolutionary pressure or improvement occurs

## Recommended Solutions

### 1. Always Calculate Scores
```javascript
// Calculate score for ALL solutions first
const expectedValue = p * npv - (1 - p) * capex;
const diversificationPenalty = Math.sqrt(capex / C0);
const score = expectedValue / diversificationPenalty;

// Then apply filter
if (capex > maxCapex) {
  filtered = true;
  filterReason = `CAPEX exceeds maximum`;
}
```

### 2. Preserve Best Solutions Even If Filtered
```javascript
let topPerformers = rankedIdeas.slice(0, config.topSelectCount);

// If insufficient valid solutions, include best filtered ones
if (topPerformers.length < config.topSelectCount && filteredIdeas.length > 0) {
  const sortedFiltered = filteredIdeas.sort((a, b) => b.score - a.score);
  const needed = config.topSelectCount - topPerformers.length;
  topPerformers = [...topPerformers, ...sortedFiltered.slice(0, needed)];
  
  logger.warn(`Including ${needed} filtered solutions to maintain evolution`);
}
```

### 3. Add Configuration Validation
```javascript
// Warn if constraints might be too restrictive
if (config.maxCapex < 1.0) { // Less than $1M
  logger.warn(`Low maxCapex ($${config.maxCapex}M) may filter out all solutions`);
}
```

### 4. Improve Prompt Engineering
When maxCapex is low, explicitly request low-cost solutions:
```javascript
const costGuidance = maxCapex < 1 
  ? `CRITICAL: Solutions must have upfront costs under $${maxCapex}M. Focus on partnerships, revenue-sharing, and minimal infrastructure.`
  : `with upfront costs under $${maxCapex}M`;
```

## Impact Assessment

**Current Impact**:
- Jobs with restrictive filters show 0% improvement across generations
- Wasted API calls generating unrelated solutions
- No evolutionary optimization occurring

**After Fix**:
- Evolution will continue even with restrictive filters
- Best solutions (even if over budget) will influence next generation
- Gradual convergence toward constraint-satisfying solutions

## Testing Recommendations

1. **Unit Tests**: Add tests for all-filtered scenario
2. **Integration Tests**: Verify evolution continues with various maxCapex values
3. **Monitoring**: Track filter rates and warn when >80%
4. **Validation**: Ensure top solutions persist across generations

## Configuration Guidelines

For different problem types:
- **Tech Innovation**: maxCapex > 10 ($10M) for R&D
- **Service Models**: maxCapex 1-5 ($1-5M) for platforms
- **Partnership Models**: maxCapex 0.5-2 ($500K-2M)
- **Minimal Infrastructure**: maxCapex 0.1-0.5 ($100K-500K)

When using low maxCapex (<1), always include explicit cost constraints in the problem context.