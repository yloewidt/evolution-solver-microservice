# Evolution Algorithm Issues Analysis

## Summary
The evolutionary algorithm has several critical issues causing incorrect behavior:

1. **All solutions being filtered out** - When maxCapex is too restrictive, ALL solutions get filtered
2. **Top scores showing as 0** - Filtered solutions don't get scored, leading to 0 scores
3. **No solution preservation** - Empty top performers list breaks the evolutionary process
4. **Token counts suspiciously stable** - Minimal variance suggests the prompts aren't truly dynamic

## Issue 1: Overly Restrictive CAPEX Filter

### Problem
In job `b1965536-9c4d-45ba-bbd1-91b9e4b567d6`:
- Configuration: `maxCapex: 0.2` ($200K limit)
- All solutions generated had CAPEX > $1M
- Result: 100% of solutions filtered out

### Code Location
`evolutionarySolver.js` lines 480-489:
```javascript
if (capex > maxCapex) {
  filtered = true;
  filterReason = `CAPEX ($${capex}M) exceeds maximum ($${maxCapex}M)`;
}
```

### Impact
- `rankedIdeas` array becomes empty
- `topScore` and `avgScore` default to 0
- No solutions carry forward to next generation

## Issue 2: Evolution Breaks When All Solutions Filtered

### Problem
When all solutions are filtered out:
```javascript
// Line 740-741
const topPerformers = rankedIdeas.slice(0, config.topSelectCount);
currentGen = topPerformers; // Empty array!
```

Next generation starts with empty `currentGen`, forcing the variator to generate all new solutions instead of evolving.

### Expected Behavior
Top solutions should ALWAYS be preserved, even if they exceed filters, to maintain evolutionary pressure.

## Issue 3: Score Calculation for Filtered Solutions

### Problem
Filtered solutions get `score: -Infinity` and are excluded from ranking:
```javascript
// Line 492-493
let score = -Infinity;
if (!filtered) {
  // Score calculation only happens for non-filtered
}
```

This makes it impossible to identify "best of the bad" solutions when all fail filters.

## Issue 4: Token Count Stability

### Analysis from job data:
- Generation 1: Input: 1869, Output: 1488
- Generation 2: Input: 1785, Output: 1404
- Variance: Only 84 tokens difference

This suggests the prompts aren't including dynamic solution data as expected.

## Recommended Fixes

### 1. Always Score Solutions
Calculate scores for ALL solutions, regardless of filter status:
```javascript
// Calculate score for all solutions
const expectedValue = p * npv - (1 - p) * capex;
const diversificationPenalty = Math.sqrt(capex / C0);
const score = expectedValue / diversificationPenalty;

// Then apply filter
if (capex > maxCapex) {
  filtered = true;
  filterReason = `CAPEX ($${capex}M) exceeds maximum ($${maxCapex}M)`;
}
```

### 2. Preserve Best Solutions Even If Filtered
When selecting top performers, include filtered solutions if no valid ones exist:
```javascript
// Select top performers for next generation
let topPerformers = rankedIdeas.slice(0, config.topSelectCount);

// If not enough valid solutions, include best filtered ones
if (topPerformers.length < config.topSelectCount && filteredIdeas.length > 0) {
  // Sort filtered ideas by score (they should have scores now)
  const sortedFiltered = filteredIdeas.sort((a, b) => b.score - a.score);
  const needed = config.topSelectCount - topPerformers.length;
  topPerformers = [...topPerformers, ...sortedFiltered.slice(0, needed)];
}

currentGen = topPerformers;
```

### 3. Add Warning for Overly Restrictive Filters
Log warnings when filter settings eliminate too many solutions:
```javascript
const filterRate = filteredIdeas.length / allIdeasThisGen.length;
if (filterRate > 0.8) {
  logger.warn(`Generation ${gen}: ${(filterRate * 100).toFixed(0)}% of solutions filtered out. Consider relaxing constraints.`);
}
```

### 4. Ensure Dynamic Prompts
Add logging to verify previous solutions are included in variator prompts:
```javascript
if (currentSolutions.length > 0) {
  logger.info(`Variator prompt includes ${currentSolutions.length} previous solutions`);
  logger.debug('Previous solution IDs:', currentSolutions.map(s => s.idea_id));
}
```

## Testing Recommendations

1. Test with various `maxCapex` values to ensure graceful handling
2. Verify that top solutions persist across generations
3. Monitor token usage variance as a proxy for prompt dynamism
4. Add unit tests for edge cases (all filtered, no valid solutions)

## Configuration Suggestions

For the delivery optimization problem, consider:
- Increase `maxCapex` to at least 5.0 ($5M) for realistic solutions
- Or explicitly prompt for "low-cost, minimal infrastructure" solutions
- Add a `minValidSolutions` parameter to ensure evolution continues