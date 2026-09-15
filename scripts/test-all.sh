#!/bin/bash
# Usage: ./scripts/test-all.sh [HUB_PROFILE] [REGION] [STACK_NAME]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "\n${CYAN}============================================================${NC}"
echo -e "${CYAN} Jungle Tools Automated Test Suite Runner ${NC}"
echo -e "${CYAN}============================================================${NC}"

# 1. Run Unit Tests
echo -e "\n${YELLOW}[Phase 1] Running Backend Unit Tests (node:test)...${NC}"
npm test --prefix "$ROOT_DIR/backend"

# 2. Run Live Cloud E2E Integration Tests
echo -e "\n${YELLOW}[Phase 2] Running Live Cloud E2E Integration Tests...${NC}"
node "$ROOT_DIR/scripts/test-all.mjs" "$@"
