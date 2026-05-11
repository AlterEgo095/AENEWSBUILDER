#!/bin/bash

################################################################################
# CHAOS TEST 2: Worker Crash During GENERATE State
# Test que l'auto-healing reprend un job après crash d'un worker
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/../.."
LOG_FILE="/tmp/chaos-worker-$(date +%s).log"

echo "🔥 CHAOS TEST 2: Worker Crash During GENERATE" | tee "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

START_TIME=$(date +%s)
JOB_ID=""
WORKER_PID=""

################################################################################
# Fonctions
################################################################################

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

get_job_state() {
    local job_id=$1
    curl -sf "http://localhost:3001/api/projects/$job_id" | jq -r '.state' 2>/dev/null || echo "UNKNOWN"
}

wait_for_state() {
    local job_id=$1
    local target_state=$2
    local max_wait=${3:-60}
    local waited=0
    
    while [ $waited -lt $max_wait ]; do
        local current_state=$(get_job_state "$job_id")
        
        if [ "$current_state" = "$target_state" ]; then
            log_info "Job atteint l'état $target_state après ${waited}s"
            return 0
        fi
        
        sleep 2
        ((waited+=2))
    done
    
    log_error "Job n'a pas atteint $target_state après ${max_wait}s"
    return 1
}

kill_worker_process() {
    # Trouve le processus Node.js du worker BullMQ
    WORKER_PID=$(docker exec aenews-api ps aux | grep 'node.*worker' | grep -v grep | awk '{print $2}' | head -1)
    
    if [ -z "$WORKER_PID" ]; then
        log_error "Aucun worker trouvé dans le container"
        return 1
    fi
    
    log_warn "Worker PID trouvé: $WORKER_PID"
    
    # Kill brutal du worker
    docker exec aenews-api kill -9 "$WORKER_PID" 2>/dev/null || true
    
    log_warn "Worker tué (PID $WORKER_PID)"
    return 0
}

################################################################################
# PHASE 1: Création d'un job et attente état GENERATE
################################################################################

log_info "Phase 1/5: Création job de test..."

JOB_RESPONSE=$(curl -sf -X POST http://localhost:3001/api/projects \
    -H "Content-Type: application/json" \
    -d '{
        "name": "chaos-worker-test",
        "description": "Test crash worker",
        "prompt": "Créer une page HTML simple avec un titre et un paragraphe"
    }' 2>/dev/null || echo "{}")

JOB_ID=$(echo "$JOB_RESPONSE" | jq -r '.id' 2>/dev/null || echo "")

if [ -z "$JOB_ID" ] || [ "$JOB_ID" = "null" ]; then
    log_error "Impossible de créer un job de test"
    exit 1
fi

log_info "✅ Job créé: $JOB_ID"

# Attendre que le job entre en état GENERATE
log_info "Attente état GENERATE..."

max_wait=30
waited=0
while [ $waited -lt $max_wait ]; do
    current_state=$(get_job_state "$JOB_ID")
    
    log_info "État actuel: $current_state"
    
    if [ "$current_state" = "GENERATE" ] || [ "$current_state" = "PLANNING" ]; then
        log_info "✅ Job en état $current_state"
        break
    fi
    
    if [ "$current_state" = "FAILED" ] || [ "$current_state" = "DONE" ]; then
        log_error "Job terminé trop vite: $current_state"
        exit 1
    fi
    
    sleep 2
    ((waited+=2))
done

if [ $waited -ge $max_wait ]; then
    log_warn "⚠️  Job n'a pas atteint GENERATE, on kill quand même"
fi

################################################################################
# PHASE 2: KILL WORKER (simulation crash)
################################################################################

log_info ""
log_warn "Phase 2/5: 🔪 KILLING WORKER PROCESS..."

sleep 1 # Petit délai pour être sûr que le worker traite le job

if ! kill_worker_process; then
    log_error "Échec kill worker"
    exit 1
fi

CRASH_TIME=$(date +%s)
log_warn "Worker tué à $(date -d @$CRASH_TIME +%H:%M:%S)"

# Vérifier que le job est marqué FAILED ou en retry
sleep 5

current_state=$(get_job_state "$JOB_ID")
log_info "État job après crash: $current_state"

if [ "$current_state" != "FAILED" ] && [ "$current_state" != "INIT" ]; then
    log_warn "⚠️  Job dans état inattendu: $current_state"
fi

################################################################################
# PHASE 3: Validation auto-healing
################################################################################

log_info ""
log_info "Phase 3/5: Test auto-healing (retry automatique)..."

# Le système devrait:
# 1. Détecter le crash
# 2. Relancer un nouveau worker
# 3. Reprendre le job (retry 1/3)

log_info "Attente reprise automatique (max 60s)..."

if wait_for_state "$JOB_ID" "ANALYSIS" 60 || wait_for_state "$JOB_ID" "PLANNING" 60 || wait_for_state "$JOB_ID" "GENERATE" 60; then
    RECOVERY_TIME=$(($(date +%s) - CRASH_TIME))
    log_info "✅ Job repris après ${RECOVERY_TIME}s"
else
    log_error "❌ Job NON repris après 60s"
    exit 1
fi

################################################################################
# PHASE 4: Vérification intégrité données (Event Store)
################################################################################

log_info ""
log_info "Phase 4/5: Vérification Event Store..."

# L'Event Store doit contenir:
# - L'événement de crash
# - L'événement de retry
# - L'historique complet préservé

EVENT_COUNT=$(curl -sf "http://localhost:3001/api/projects/$JOB_ID/events" | jq 'length' 2>/dev/null || echo "0")

log_info "Événements enregistrés: $EVENT_COUNT"

if [ "$EVENT_COUNT" -ge 3 ]; then
    log_info "✅ Event Store préservé ($EVENT_COUNT events)"
else
    log_warn "⚠️  Event Store incomplet ($EVENT_COUNT events)"
fi

################################################################################
# PHASE 5: Validation fin du job
################################################################################

log_info ""
log_info "Phase 5/5: Attente fin du job..."

# Le job devrait se terminer normalement malgré le crash
if wait_for_state "$JOB_ID" "DONE" 120; then
    log_info "✅ Job terminé avec succès après recovery"
elif wait_for_state "$JOB_ID" "FAILED" 120; then
    log_warn "⚠️  Job échoué après retry"
    
    # Vérifier le nombre de retries
    retry_count=$(curl -sf "http://localhost:3001/api/projects/$JOB_ID" | jq '.metadata.retryCount' 2>/dev/null || echo "0")
    log_info "Nombre de retries: $retry_count"
    
    if [ "$retry_count" -ge 1 ]; then
        log_info "✅ Auto-healing a tenté $retry_count fois"
    else
        log_error "❌ Auto-healing n'a PAS fonctionné"
        exit 1
    fi
else
    log_error "❌ Job bloqué dans un état invalide"
    exit 1
fi

################################################################################
# RAPPORT FINAL
################################################################################

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

echo "" | tee -a "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "📊 RAPPORT CHAOS TEST 2 - Worker Crash & Auto-Healing" | tee -a "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "⏱️  Durée totale : ${TOTAL_TIME}s" | tee -a "$LOG_FILE"
echo "🔄 Temps de recovery : ${RECOVERY_TIME}s" | tee -a "$LOG_FILE"
echo "📊 Événements préservés : $EVENT_COUNT" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

if [ ${RECOVERY_TIME:-999} -le 60 ] && [ ${EVENT_COUNT:-0} -ge 3 ]; then
    echo -e "${GREEN}✅ SUCCÈS : Auto-healing opérationnel${NC}" | tee -a "$LOG_FILE"
    exit 0
else
    echo -e "${RED}❌ ÉCHEC : Auto-healing défaillant${NC}" | tee -a "$LOG_FILE"
    exit 1
fi
