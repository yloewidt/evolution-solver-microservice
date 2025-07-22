# Evolution Solver Microservice - Fix List

Based on comprehensive testing and analysis, here are the issues that need to be addressed:

## 🚨 Critical Issues

### 1. Test Suite Failures (21/28 tests failing)
- **Issue**: Unit tests are failing due to mock implementation issues
- **Files affected**: 
  - `test/evolutionarySolver.test.js`
  - `test/api.test.js`
- **Root causes**:
  - Mocks don't match actual class/function signatures
  - `parseResponse` method doesn't exist on EvolutionarySolver
  - Missing `feedback` property in ranker response
  - Mock setup for Cloud services is incorrect
- **Priority**: HIGH

### 2. Cloud Tasks HTTPS Requirement
- **Issue**: Cloud Tasks requires HTTPS URLs but local development uses HTTP
- **Error**: `HttpRequest.url must start with 'https://' for request with HttpRequest.authorization_header`
- **Files affected**: `cloud/tasks/taskHandler.js`
- **Fix needed**: Add environment-based URL scheme detection
- **Priority**: HIGH

### 3. Test Coverage Below Threshold
- **Current coverage**: 21.64% (threshold: 80%)
- **Most uncovered files**:
  - `src/services/llmClient.js` (0% coverage)
  - `src/services/orchestratorService.js` (0% coverage)
  - `src/utils/apiDebugger.js` (0% coverage)
  - `src/utils/jsonParser.js` (0% coverage)
  - `cloud/firestore/resultStore.js` (6.94% coverage)
- **Priority**: HIGH

## ⚠️ Major Issues

### 4. Missing Error Handling
- **Issue**: Several async operations lack proper error handling
- **Files affected**:
  - Worker endpoints don't handle job processing failures gracefully
  - API routes missing try-catch blocks in some places
- **Priority**: MEDIUM

### 5. Memory Leaks in Tests
- **Issue**: "Worker process has failed to exit gracefully"
- **Cause**: Tests not properly cleaning up resources
- **Fix needed**: Add proper afterEach/afterAll cleanup
- **Priority**: MEDIUM

### 6. Mock Implementation Gaps
- **Issue**: Test mocks don't align with actual implementations
- **Examples**:
  - `EvolutionResultStore` methods not properly mocked
  - `CloudTaskHandler` mock missing required methods
- **Priority**: MEDIUM

## 📝 Code Quality Issues

### 7. Inconsistent Response Formats
- **Issue**: Ranker returns `{rankedIdeas, filteredIdeas}` but tests expect `{rankedIdeas, feedback}`
- **Files affected**: 
  - `src/core/evolutionarySolver.js`
  - `test/evolutionarySolver.test.js`
- **Priority**: LOW

### 8. Missing Method in EvolutionarySolver
- **Issue**: Tests call `solver.parseResponse()` but method doesn't exist
- **Fix**: Either remove test or add method that delegates to ResponseParser
- **Priority**: LOW

### 9. Environment Variable Handling
- **Issue**: Missing validation for required environment variables
- **Fix needed**: Add startup validation for critical env vars
- **Priority**: LOW

## 🔧 Recommended Fixes

### Immediate Actions:
1. **Fix test mocks** to match actual implementations
2. **Add HTTPS/HTTP detection** in taskHandler based on environment
3. **Remove or update** obsolete test cases (parseResponse, feedback)
4. **Add missing test coverage** for critical services

### Medium-term Actions:
1. **Implement proper test cleanup** to prevent memory leaks
2. **Add comprehensive error handling** in worker and API routes
3. **Create integration test suite** with proper mocking strategy
4. **Add environment variable validation** on startup

### Long-term Actions:
1. **Refactor test architecture** to use dependency injection
2. **Add end-to-end tests** for complete job lifecycle
3. **Implement proper logging** for debugging production issues
4. **Add monitoring and alerting** for job failures

## 📊 Test Strategy Recommendations

1. **Unit Tests**: Focus on pure functions and business logic
2. **Integration Tests**: Test service interactions with mocked external dependencies
3. **E2E Tests**: Test complete job flow in a test environment
4. **Contract Tests**: Ensure API contracts are maintained

## 🎯 Priority Order

1. Fix failing tests (blocks CI/CD)
2. Fix Cloud Tasks HTTPS issue (blocks local development)
3. Increase test coverage to 80%
4. Add proper error handling
5. Improve code quality and consistency

## 📈 Success Metrics

- All tests passing ✅
- Test coverage > 80% ✅
- Zero memory leaks in tests ✅
- Proper error handling throughout ✅
- Local development works seamlessly ✅