#!/bin/bash
# ============================================
# AENEWS BUILDER - k6 Load Test Suite
# ============================================
# Usage: ./run-tests.sh [smoke|load|stress|spike|soak|pipeline|all]
#
# Environment Variables:
#   BASE_URL  - API base URL (default: http://localhost:3181)
#
# Examples:
#   ./run-tests.sh smoke          # Quick smoke test
#   ./run-tests.sh load           # Standard load test
#   ./run-tests.sh stress         # Stress test up to 10K users
#   ./run-tests.sh spike          # Spike test (instant 10K)
#   ./run-tests.sh soak           # Soak test (1K users, 1hr)
#   ./run-tests.sh pipeline       # AI pipeline test
#   ./run-tests.sh all            # Run smoke + load + pipeline
#   ./run-tests.sh full           # Run ALL tests including stress/spike/soak
# ============================================

set -euo pipefail

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3181}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[FAIL]${NC} $1"; }

banner() {
  echo -e "\n${CYAN}======================================================${NC}"
  echo -e "${CYAN}       AENEWS BUILDER - k6 Load Test Suite             ${NC}"
  echo -e "${CYAN}======================================================${NC}\n"
}

check_prerequisites() {
  info "Checking prerequisites..."
  if ! command -v k6 &> /dev/null; then
    error "k6 is not installed!"
    exit 1
  fi
  success "k6 version: $(k6 version 2>/dev/null || echo 'unknown')"

  info "Checking API at $BASE_URL..."
  local health_status
  health_status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health" 2>/dev/null || echo "000")
  if [ "$health_status" = "200" ]; then
    success "API is healthy at $BASE_URL"
  elif [ "$health_status" = "503" ]; then
    warning "API is reachable but unhealthy (503)"
  else
    error "API is not reachable at $BASE_URL (HTTP $health_status)"
    exit 1
  fi
  echo ""
}

run_test() {
  local test_name=$1
  local test_file=$2
  local test_description=$3

  echo -e "\n${CYAN}============================================================${NC}"
  info "Running: $test_name"
  info "Description: $test_description"
  echo -e "${CYAN}============================================================${NC}\n"

  local start_time
  start_time=$(date +%s)
  local k6_exit_code=0

  k6 run \
    --env BASE_URL="$BASE_URL" \
    --out json="$RESULTS_DIR/${test_name}.json" \
    --summary-export="$RESULTS_DIR/${test_name}-summary.json" \
    "$SCRIPT_DIR/$test_file" \
    2>&1 | tee "$RESULTS_DIR/${test_name}.log" || k6_exit_code=$?

  local end_time
  end_time=$(date +%s)
  local duration=$((end_time - start_time))

  echo ""
  if [ $k6_exit_code -eq 0 ]; then
    success "$test_name completed successfully (${duration}s)"
  else
    warning "$test_name completed with exit code $k6_exit_code (${duration}s)"
  fi

  echo ""
  return $k6_exit_code
}

generate_report() {
  info "Generating summary report..."
  python3 "$SCRIPT_DIR/generate-report.py" "$RESULTS_DIR"
  success "Report saved to $RESULTS_DIR/summary-report.txt"
}

# Main
banner
check_prerequisites

TEST_TYPE="${1:-all}"
EXIT_CODE=0

case "$TEST_TYPE" in
  smoke)
    run_test "smoke" "k6-smoke.js" "Quick smoke test (1 user, 30s)"
    ;;
  load)
    run_test "load" "k6-load.js" "Standard load test (100 users, 5min)"
    ;;
  stress)
    run_test "stress" "k6-stress.js" "Stress test (ramp to 10K users)"
    ;;
  spike)
    run_test "spike" "k6-spike.js" "Spike test (instant 10K users)"
    ;;
  soak)
    run_test "soak" "k6-soak.js" "Soak test (1K users, 1 hour)"
    ;;
  pipeline)
    run_test "pipeline" "k6-ai-pipeline.js" "AI pipeline test (1K simultaneous pipelines)"
    ;;
  all)
    run_test "smoke" "k6-smoke.js" "Quick smoke test (1 user, 30s)" || EXIT_CODE=1
    if [ $EXIT_CODE -eq 0 ]; then
      run_test "load" "k6-load.js" "Standard load test (100 users, 5min)" || EXIT_CODE=1
    fi
    if [ $EXIT_CODE -eq 0 ]; then
      run_test "pipeline" "k6-ai-pipeline.js" "AI pipeline test" || EXIT_CODE=1
    fi
    ;;
  full)
    run_test "smoke" "k6-smoke.js" "Quick smoke test (1 user, 30s)" || EXIT_CODE=1
    run_test "load" "k6-load.js" "Standard load test (100 users, 5min)" || EXIT_CODE=1
    run_test "stress" "k6-stress.js" "Stress test (ramp to 10K users)" || EXIT_CODE=1
    run_test "spike" "k6-spike.js" "Spike test (instant 10K users)" || EXIT_CODE=1
    run_test "pipeline" "k6-ai-pipeline.js" "AI pipeline test" || EXIT_CODE=1
    warning "Soak test (1 hour) not included in 'full'. Run './run-tests.sh soak' separately."
    ;;
  *)
    echo "Usage: $0 [smoke|load|stress|spike|soak|pipeline|all|full]"
    echo "  smoke     - Quick smoke test (1 user, 30s)"
    echo "  load      - Standard load test (100 users, 5min)"
    echo "  stress    - Stress test (ramp to 10K users, ~13min)"
    echo "  spike     - Spike test (instant 10K users, ~2.5min)"
    echo "  soak      - Soak test (1K users, 1 hour)"
    echo "  pipeline  - AI pipeline test (1K simultaneous pipelines, ~6min)"
    echo "  all       - Run smoke + load + pipeline"
    echo "  full      - Run ALL tests except soak"
    exit 1
    ;;
esac

generate_report

echo -e "\n${CYAN}======================================================${NC}"
success "Test suite completed!"
info "Results saved to: $RESULTS_DIR"
echo -e "${CYAN}======================================================${NC}\n"

exit $EXIT_CODE
