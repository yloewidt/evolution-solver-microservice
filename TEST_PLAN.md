# Evolution Solver Microservice - Comprehensive Test Plan

## Overview
This document outlines the complete test strategy for the evolution-solver-microservice, covering all core functionalities, edge cases, and integration points.

## Test Philosophy
- **No Mocks**: All tests use real implementations and services
- **Full Coverage**: Every function, branch, and edge case must be tested
- **Real-World Scenarios**: Tests simulate actual production usage
- **Deterministic**: Tests must be repeatable with consistent results

## 1. Core Algorithm Tests (evolutionarySolver.js)

### 1.1 Variator Phase Tests

#### Core Functionality
- **test_variator_generates_exact_count**: Verify generates exactly N ideas
- **test_variator_offspring_wildcard_ratio**: Verify 70% offspring, 30% wildcards
- **test_variator_first_generation_all_wildcards**: First gen has no parents
- **test_variator_uses_top_performers**: Later gens use previous top ideas
- **test_variator_prompt_includes_context**: Problem context in prompt
- **test_variator_saves_api_telemetry**: All API calls tracked

#### Edge Cases
- **test_variator_empty_population_size**: Handle populationSize = 0
- **test_variator_malformed_json_response**: Handle invalid LLM responses
- **test_variator_partial_json_response**: Handle incomplete JSON
- **test_variator_timeout_handling**: Handle API timeouts gracefully
- **test_variator_rate_limit_retry**: Retry on 429 errors
- **test_variator_excess_ideas_trimmed**: Trim if LLM returns too many
- **test_variator_insufficient_ideas_error**: Error if too few ideas
- **test_variator_duplicate_ideas_handled**: Handle duplicate titles
- **test_variator_null_top_performers**: Handle missing top performers

### 1.2 Enricher Phase Tests

#### Core Functionality
- **test_enricher_adds_all_fields**: NPV, CAPEX, risks, etc. added
- **test_enricher_monetary_values_millions**: All values in millions USD
- **test_enricher_capex_minimum_enforced**: Min 0.05M enforced
- **test_enricher_parallel_processing**: V2 processes in parallel
- **test_enricher_batch_processing**: V1 processes as batch
- **test_enricher_preserves_idea_data**: Original fields maintained
- **test_enricher_api_telemetry_saved**: Track all LLM calls

#### Edge Cases
- **test_enricher_empty_ideas_array**: Handle no ideas to enrich
- **test_enricher_malformed_response**: Handle invalid enrichment data
- **test_enricher_missing_required_fields**: Handle incomplete data
- **test_enricher_negative_npv_allowed**: Negative NPV is valid
- **test_enricher_zero_capex_corrected**: Zero CAPEX → 0.05M
- **test_enricher_likelihood_bounds**: 0 ≤ likelihood ≤ 1
- **test_enricher_partial_batch_failure**: Some succeed, some fail
- **test_enricher_timeout_mid_batch**: Handle timeouts gracefully
- **test_enricher_concurrency_limit**: Respect max concurrency

### 1.3 Ranker Phase Tests

#### Core Functionality
- **test_ranker_calculates_risk_adjusted_npv**: Correct formula applied
- **test_ranker_sorts_by_score_descending**: Highest score first
- **test_ranker_selects_top_n**: Returns topSelectCount items
- **test_ranker_diversification_penalty**: Similar ideas penalized
- **test_ranker_no_api_calls**: Pure logic, no external calls
- **test_ranker_filters_capex_limit**: Respect maxCapex parameter

#### Edge Cases
- **test_ranker_empty_ideas_array**: Handle no ideas to rank
- **test_ranker_all_ideas_same_score**: Stable sort behavior
- **test_ranker_insufficient_ideas**: Less than topSelectCount
- **test_ranker_invalid_financial_data**: Handle NaN/null values
- **test_ranker_zero_likelihood_score**: Score when p=0
- **test_ranker_extreme_capex_values**: Very high/low CAPEX
- **test_ranker_topselect_exceeds_population**: Request > available

## 2. Orchestrator Service Tests (orchestratorService.js)

### 2.1 State Machine Tests

#### Core Functionality
- **test_orchestrator_initial_state_transitions**: pending → processing
- **test_orchestrator_phase_sequence**: variator → enricher → ranker
- **test_orchestrator_generation_progression**: gen N → gen N+1
- **test_orchestrator_job_completion**: Final state transitions
- **test_orchestrator_idempotent_operations**: Safe to call multiple times
- **test_orchestrator_task_creation**: Creates correct worker tasks

#### Edge Cases
- **test_orchestrator_missing_job**: Handle non-existent jobId
- **test_orchestrator_concurrent_execution**: Multiple orchestrators
- **test_orchestrator_max_attempts_exceeded**: Timeout handling
- **test_orchestrator_worker_task_failure**: Handle failed workers
- **test_orchestrator_partial_generation_data**: Missing phase data
- **test_orchestrator_backoff_calculation**: Exponential backoff
- **test_orchestrator_already_complete_job**: Skip completed jobs
- **test_orchestrator_race_condition_prevention**: Atomic updates

### 2.2 Worker Task Creation Tests

#### Core Functionality
- **test_create_variator_task_data**: Correct payload structure
- **test_create_enricher_task_data**: Ideas included in payload
- **test_create_ranker_task_data**: Enriched ideas included
- **test_task_includes_problem_context**: Context propagated
- **test_task_includes_evolution_config**: Config propagated
- **test_task_authentication_setup**: OIDC token configured

#### Edge Cases
- **test_create_task_missing_previous_data**: Handle missing deps
- **test_create_task_large_payload**: Handle size limits
- **test_create_task_network_failure**: Retry mechanism
- **test_create_task_queue_full**: Handle backpressure

## 3. API Endpoint Tests (routes.js)

### 3.1 Job Creation Endpoint

#### Core Functionality
- **test_post_job_valid_params**: Successful job creation
- **test_post_job_returns_jobid**: Immediate response with ID
- **test_post_job_queues_task**: Task/workflow created
- **test_post_job_saves_to_firestore**: Data persisted
- **test_post_job_default_params**: Defaults applied

#### Edge Cases
- **test_post_job_missing_context**: Require problemContext
- **test_post_job_invalid_model**: Reject unknown models
- **test_post_job_negative_generations**: Validate > 0
- **test_post_job_capex_validation**: Validate monetary values
- **test_post_job_population_limits**: Max population size
- **test_post_job_concurrent_requests**: Handle race conditions
- **test_post_job_malformed_json**: 400 for bad JSON
- **test_post_job_oversized_context**: Handle large inputs

### 3.2 Job Status Endpoint

#### Core Functionality
- **test_get_status_valid_job**: Return current status
- **test_get_status_progress_tracking**: Generation progress
- **test_get_status_completed_job**: Final status
- **test_get_status_failed_job**: Error information

#### Edge Cases
- **test_get_status_nonexistent_job**: 404 response
- **test_get_status_malformed_jobid**: 400 for bad ID
- **test_get_status_concurrent_updates**: Consistent reads

### 3.3 Results Endpoint

#### Core Functionality
- **test_get_results_completed_job**: Full solution set
- **test_get_results_sorted_solutions**: By score descending
- **test_get_results_includes_metadata**: Job config included
- **test_get_results_generation_history**: All generations

#### Edge Cases
- **test_get_results_pending_job**: 202 still processing
- **test_get_results_failed_job**: Error details
- **test_get_results_partial_completion**: Available data
- **test_get_results_empty_solutions**: No viable solutions

### 3.4 Analytics Endpoint

#### Core Functionality
- **test_analytics_token_usage**: API token counts
- **test_analytics_timing_metrics**: Phase durations
- **test_analytics_score_distribution**: Solution scores
- **test_analytics_generation_trends**: Progress over time

#### Edge Cases
- **test_analytics_incomplete_job**: Partial analytics
- **test_analytics_no_api_calls**: Handle missing data
- **test_analytics_calculation_errors**: Graceful failures

## 4. Cloud Integration Tests

### 4.1 Cloud Tasks Integration

#### Core Functionality
- **test_task_creation_success**: Tasks queued properly
- **test_task_authentication**: OIDC tokens work
- **test_task_retry_mechanism**: Failed tasks retry
- **test_task_queue_operations**: Pause/resume/purge

#### Edge Cases
- **test_task_creation_quota_exceeded**: Handle limits
- **test_task_malformed_payload**: Validation errors
- **test_task_dead_letter_queue**: Max retries
- **test_task_concurrent_processing**: Parallel execution

### 4.2 Firestore Integration

#### Core Functionality
- **test_firestore_job_creation**: Document created
- **test_firestore_status_updates**: Atomic updates
- **test_firestore_generation_data**: Nested data
- **test_firestore_api_telemetry**: Subcollection

#### Edge Cases
- **test_firestore_connection_loss**: Retry mechanism
- **test_firestore_concurrent_writes**: Consistency
- **test_firestore_large_documents**: Size limits
- **test_firestore_query_performance**: Indexed queries

### 4.3 Worker Service Integration

#### Core Functionality
- **test_worker_health_check**: Service alive
- **test_worker_phase_processing**: Each endpoint
- **test_worker_idempotency**: Duplicate safety
- **test_worker_error_responses**: Proper status codes

#### Edge Cases
- **test_worker_timeout_handling**: Long requests
- **test_worker_memory_limits**: Large payloads
- **test_worker_concurrent_requests**: Load handling
- **test_worker_graceful_shutdown**: SIGTERM handling

## 5. Utility Tests

### 5.1 LLM Client Tests

#### Core Functionality
- **test_llm_openai_integration**: GPT-4o calls
- **test_llm_o3_integration**: O3 model calls
- **test_llm_structured_output**: Schema validation
- **test_llm_retry_logic**: Transient failures

#### Edge Cases
- **test_llm_rate_limiting**: 429 handling
- **test_llm_timeout_handling**: Network issues
- **test_llm_invalid_api_key**: Auth errors
- **test_llm_response_parsing**: Malformed JSON

### 5.2 Response Parser Tests

#### Core Functionality
- **test_parser_valid_json**: Clean parsing
- **test_parser_json_repair**: Fix common issues
- **test_parser_field_validation**: Required fields
- **test_parser_type_coercion**: String → number

#### Edge Cases
- **test_parser_nested_errors**: Deep JSON issues
- **test_parser_unicode_handling**: Special chars
- **test_parser_extreme_nesting**: Depth limits
- **test_parser_circular_references**: Invalid structures

## 6. End-to-End Tests

### 6.1 Complete Job Lifecycle

#### Core Functionality
- **test_e2e_single_generation**: 1 gen job completes
- **test_e2e_multi_generation**: 10 gen job completes
- **test_e2e_solution_quality**: Sensible results
- **test_e2e_performance_baseline**: < 30s per gen

#### Edge Cases
- **test_e2e_job_recovery**: Resume after failure
- **test_e2e_concurrent_jobs**: Multiple jobs
- **test_e2e_resource_limits**: Memory/CPU bounds
- **test_e2e_graceful_degradation**: Partial failures

### 6.2 Load Tests

#### Core Functionality
- **test_load_concurrent_jobs**: 10+ simultaneous
- **test_load_sustained_traffic**: 1 hour run
- **test_load_burst_traffic**: Spike handling
- **test_load_queue_saturation**: Backpressure

## 7. Security Tests

### 7.1 Authentication/Authorization

#### Core Functionality
- **test_auth_valid_credentials**: Authorized access
- **test_auth_service_accounts**: IAM permissions
- **test_auth_api_key_validation**: OpenAI key secure

#### Edge Cases
- **test_auth_expired_tokens**: Token refresh
- **test_auth_malicious_input**: Injection attempts
- **test_auth_rate_limiting**: DDoS protection

## Test Implementation Strategy

1. **Phase 1**: Core algorithm tests (evolutionarySolver.js)
2. **Phase 2**: Service layer tests (orchestrator, services)
3. **Phase 3**: API endpoint tests
4. **Phase 4**: Cloud integration tests
5. **Phase 5**: End-to-end and load tests

## Success Criteria

- 100% code coverage (statements, branches, functions)
- All tests passing consistently
- No flaky tests
- Performance benchmarks met
- Security vulnerabilities addressed

## Test Data Management

- Standardized test fixtures
- Isolated test environments
- Cleanup after each test
- No test interdependencies