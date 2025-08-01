# Baseline Testing Client Feedback Action Plan

## Overview
The client reviewed our baseline test report and provided specific feedback on improvements needed for the business testing suite. This action plan outlines the steps to implement their requirements.

## Key Requirements from Client

1. **Use Real Problem Set**: Replace our synthetic problems with 30 real industry problems from their database
2. **New Metrics Structure**: Implement three-tier metrics (per-problem, general stats, per-generation)
3. **Version Metadata**: Save version information alongside each result for future analysis
4. **Ideas Validity Metric**: Separate phase requiring solution evaluator microservice (out of scope)

## Implementation Timeline

### Phase 1: Data Migration (1-2 days)
- Replace synthetic problems in `test/business/problems.json` with client's real industry problems
- Update problem IDs to match client's format
- Ensure backwards compatibility with existing test infrastructure

### Phase 2: Metrics Refactoring (3-4 days)

#### 2.1 Per-Problem Metrics
- **Success Rate**: `Max(Generation)/Intended`
- **Find Good Ideas (Top Score)**: `Max(Score)`
- **Search Efficiently**: `Max(Score) * 1000 / SUM(Tokens)`
- **Have Variability in Ideas**: `AVG(STD(Score) by Generation)`
- **Think About Good Ideas (First Score)**: `AVG(Score) WHERE Generation = 1`
- **Good Improving Process**: `(Last Gen AVG Score - First Gen AVG Score) / SUM(Tokens from Gen 2 to Last)`

#### 2.2 General Statistics
- **Success Rate**: `AVG(Problem Success Rate)`
- **Find Good Ideas**: `MEDIAN(Problem Find Good Ideas)`
- **Search Efficiently**: `MEDIAN(Problem Search Efficiently)`
- **Think About Good Ideas**: `MEDIAN(...)`
- **Good Improving Process**: `MEDIAN(...)`

#### 2.3 Per-Generation Metrics
- **Success Rate**: `Count(Problems) / 30`
- **Median Token Usage**: `MEDIAN(Tokens by Problem)`
- **Find Good Ideas**: `MEDIAN(Max(Score) by Problem)`
- **Median Average Score**: `MEDIAN(AVG(Score) by Problem)`
- **Have Variability**: `MEDIAN(STD(Score) by Problem)`
- **Good Improving Process**: `(This Gen Median AVG - Last Gen Median AVG) / MEDIAN(Tokens by Problem)`

### Phase 3: Version Metadata Integration (1 day)
- Add version fields to result storage structure
- Include:
  - Model version (e.g., "o3-2024-12-17")
  - Service version (from package.json)
  - Test configuration version
  - Timestamp
- Update aggregation scripts to handle versioned data

### Phase 4: Script Updates (2 days)
- Modify `aggregate-results.js` to calculate new metrics
- Update `generate-baseline-report.js` to output new format
- Create comparison utilities for version-to-version analysis
- Add data validation for new metrics

### Phase 5: Testing & Validation (1 day)
- Run small-scale test with 3-5 problems
- Validate all metrics calculations
- Compare results with manual calculations
- Document any edge cases

## Technical Approach

### Data Structure Changes
```javascript
// New result structure
{
  jobId: "...",
  problemId: "...",
  version: {
    model: "o3-2024-12-17",
    service: "1.0.0",
    config: "baseline-v2",
    timestamp: "2025-08-01T00:00:00Z"
  },
  metrics: {
    perProblem: { ... },
    generations: [ ... ],
    raw: { ... }
  }
}
```

### Metric Calculation Functions
```javascript
// Example: Search Efficiency
function calculateSearchEfficiency(job) {
  const maxScore = Math.max(...job.scores);
  const totalTokens = job.apiCalls.reduce((sum, call) => 
    sum + call.tokens.total_tokens, 0);
  return (maxScore * 1000) / totalTokens;
}

// Example: Variability
function calculateVariability(job) {
  const variabilityByGen = [];
  for (const gen of job.generations) {
    const scores = gen.solutions.map(s => s.score);
    variabilityByGen.push(standardDeviation(scores));
  }
  return average(variabilityByGen);
}
```

## Next Steps

1. **Immediate Actions**:
   - Update todo list with new tasks
   - Create feature branch for metrics refactoring
   - Parse and integrate client's problem set

2. **Communication**:
   - Confirm understanding of metrics with client
   - Clarify any ambiguous calculations
   - Get approval on implementation approach

3. **Future Considerations**:
   - Design API for solution evaluator microservice
   - Plan integration of ideas validity metric
   - Consider automated regression testing

## Risk Mitigation

- **Data Loss**: Keep original baseline results for comparison
- **Calculation Errors**: Implement comprehensive unit tests
- **Performance**: Consider caching for complex metric calculations
- **Backwards Compatibility**: Maintain support for old report format

## Success Criteria

1. All 30 real problems successfully processed
2. New metrics match client's specifications exactly
3. Version metadata properly stored and retrievable
4. Reports generated in under 30 seconds
5. Clear documentation for future maintainers