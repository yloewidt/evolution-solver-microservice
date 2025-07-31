#!/bin/bash

# Load test environment variables if .env.test exists
if [ -f .env.test ]; then
    export $(cat .env.test | grep -v '^#' | xargs)
fi

# Run the test suite with the provided config
node scripts/business-testing/run-test-suite.js "$@"