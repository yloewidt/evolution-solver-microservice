# Test Coverage Improvement Plan

## Current State
- Overall coverage: 25.58% (Target: 80%)
- Files with 0% coverage: 5 critical files
- Total test gap: ~55% coverage needed

## Priority 1: Core Services (0% Coverage)

### 1. llmClient.js (252 lines, 0% coverage)
**Functions to test:**
- `constructor()` - Client initialization with different configs
- `getApiStyle()` - Model detection logic
- `createVariatorRequest()` - Anthropic/OpenAI API formatting
- `createEnricherRequest()` - Request building
- `makeRequest()` - API calls with retries
- `parseResponse()` - Response parsing and validation
- `handleApiError()` - Error classification

**Test scenarios:**
- Different model types (o3, o1, gpt-4)
- API style detection
- Request formatting for both APIs
- Response parsing success/failure
- Retry logic
- Error handling

### 2. orchestratorService.js (272 lines, 0% coverage)
**Functions to test:**
- `orchestrateJob()` - Main orchestration flow
- `determineNextAction()` - State machine logic
- `executeAction()` - Task creation
- `isGenerationComplete()` - Phase completion checks
- `createWorkerTask()` - Task payload creation
- `markJobComplete()` - Job finalization
- `markJobFailed()` - Error handling

**Test scenarios:**
- Job state transitions
- Phase completion detection
- Task creation for each phase
- Error recovery
- Idempotency checks

### 3. workerHandlers.js (243 lines, 0% coverage)
**Functions to test:**
- `processVariator()` - Idea generation
- `processEnricher()` - Business case enrichment
- `processRanker()` - Solution ranking

**Test scenarios:**
- Successful processing
- Idempotent operations
- Error handling
- Phase result saving

## Priority 2: Partially Covered Files

### 4. resultStore.js (18.05% coverage)
**Missing coverage:**
- Error handling paths
- Query filtering logic
- Batch operations
- Transaction handling

### 5. taskHandler.js (27.84% coverage)
**Missing coverage:**
- Cloud Tasks error scenarios
- Retry configuration
- Queue management operations
- Task scheduling logic

### 6. routes.js (43.67% coverage)
**Missing coverage:**
- Error response paths
- Query parameter validation
- Queue management endpoints
- Analytics endpoints

## Priority 3: Utility Files

### 7. jsonParser.js (0% coverage)
- JSON extraction from text
- Markdown code block parsing
- Error recovery

### 8. apiDebugger.js (0% coverage)
- Debug data saving
- Firestore integration

### 9. analyticsService.js (1.23% coverage)
- Job analytics
- Telemetry collection
- Metrics aggregation

## Implementation Strategy

### Week 1: Core Services (Target: +30% coverage)
1. **Day 1-2**: llmClient.js tests
2. **Day 3-4**: orchestratorService.js tests
3. **Day 5**: workerHandlers.js tests

### Week 2: Integration & Cloud Services (Target: +20% coverage)
1. **Day 1-2**: resultStore.js completion
2. **Day 3**: taskHandler.js completion
3. **Day 4-5**: routes.js API tests

### Week 3: Utilities & E2E (Target: +5% coverage)
1. **Day 1**: Utility files (jsonParser, apiDebugger)
2. **Day 2-3**: analyticsService.js
3. **Day 4-5**: End-to-end integration tests

## Test Structure Guidelines

### Unit Tests
```javascript
describe('ServiceName', () => {
  let service;
  let mockDependency;

  beforeEach(() => {
    mockDependency = createMock();
    service = new ServiceName(mockDependency);
  });

  describe('methodName', () => {
    it('should handle success case', async () => {
      // Arrange
      mockDependency.method.mockResolvedValue(data);
      
      // Act
      const result = await service.methodName();
      
      // Assert
      expect(result).toEqual(expected);
    });

    it('should handle error case', async () => {
      // Test error scenarios
    });
  });
});
```

### Integration Tests
- Use test containers for Firestore emulator
- Mock only external APIs (OpenAI)
- Test complete workflows

### E2E Tests
- Test job submission through completion
- Verify all phases execute correctly
- Check data persistence

## Success Metrics
- All test files achieve >80% coverage
- No failing tests
- Tests run in <30 seconds
- Clear test names and documentation

## Risks & Mitigation
1. **Risk**: Complex async flows hard to test
   - **Mitigation**: Use proper async/await patterns, test timeouts

2. **Risk**: External service dependencies
   - **Mitigation**: Consistent mocking strategy, integration test suite

3. **Risk**: Test maintenance burden
   - **Mitigation**: DRY test utilities, clear test structure

## Next Steps
1. Set up test utilities and helpers
2. Start with llmClient.js tests
3. Track progress daily
4. Run coverage reports after each file