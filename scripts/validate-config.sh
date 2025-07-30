#!/bin/bash
# Simple config validation script that doesn't require yq
# Uses basic grep/awk to validate YAML structure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${SCRIPT_DIR}/../config"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Validating Configuration Files${NC}"
echo "=============================="

# Function to check if a key exists in YAML
check_yaml_key() {
    local file="$1"
    local key="$2"
    if grep -q "^${key}:" "$file" || grep -q "^  ${key}:" "$file" || grep -q "^    ${key}:" "$file"; then
        return 0
    else
        return 1
    fi
}

# Validate environments.yaml
echo -e "\n${YELLOW}Checking environments.yaml${NC}"
ENV_FILE="${CONFIG_DIR}/environments.yaml"

if [[ -f "$ENV_FILE" ]]; then
    echo "✓ File exists"
    
    # Check required sections
    required_sections=("defaults" "environments")
    for section in "${required_sections[@]}"; do
        if check_yaml_key "$ENV_FILE" "$section"; then
            echo "✓ Section '$section' found"
        else
            echo -e "${RED}✗ Section '$section' missing${NC}"
            exit 1
        fi
    done
    
    # Check environments
    environments=("development" "staging" "production")
    for env in "${environments[@]}"; do
        if grep -q "  $env:" "$ENV_FILE"; then
            echo "✓ Environment '$env' defined"
        else
            echo -e "${RED}✗ Environment '$env' missing${NC}"
            exit 1
        fi
    done
else
    echo -e "${RED}✗ File not found${NC}"
    exit 1
fi

# Validate resources.yaml
echo -e "\n${YELLOW}Checking resources.yaml${NC}"
RES_FILE="${CONFIG_DIR}/resources.yaml"

if [[ -f "$RES_FILE" ]]; then
    echo "✓ File exists"
    
    # Check required sections
    required_sections=("services" "cloud_tasks" "firestore" "iam")
    for section in "${required_sections[@]}"; do
        if check_yaml_key "$RES_FILE" "$section"; then
            echo "✓ Section '$section' found"
        else
            echo -e "${RED}✗ Section '$section' missing${NC}"
            exit 1
        fi
    done
else
    echo -e "${RED}✗ File not found${NC}"
    exit 1
fi

# Validate deploy.yaml
echo -e "\n${YELLOW}Checking deploy.yaml${NC}"
DEPLOY_FILE="${CONFIG_DIR}/deploy.yaml"

if [[ -f "$DEPLOY_FILE" ]]; then
    echo "✓ File exists"
    
    # Check required sections
    required_sections=("build" "deployment" "cloudbuild")
    for section in "${required_sections[@]}"; do
        if check_yaml_key "$DEPLOY_FILE" "$section"; then
            echo "✓ Section '$section' found"
        else
            echo -e "${RED}✗ Section '$section' missing${NC}"
            exit 1
        fi
    done
else
    echo -e "${RED}✗ File not found${NC}"
    exit 1
fi

# Summary
echo -e "\n${GREEN}=============================="
echo "Configuration validation passed!"
echo "==============================${NC}"
echo -e "\nNote: This is a basic validation. For full YAML parsing, install yq:"
echo "  - macOS: brew install yq"
echo "  - Linux: sudo snap install yq or wget the binary"