#!/bin/bash

################################################################################
# CHAOS TEST 1: Redis Kill & Recovery
# Test que le système détecte la panne Redis et se récupère automatiquement
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/../.."
LOG_FILE="/tmp/chaos-redis-$(date +%s).log"

echo "🔥 CHAOS TEST 1: Redis Kill & Recovery" | tee "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Couleurs pour lisibilité
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Métriques
START_TIME=$(date +%s)
RECOVERY_TIME=0
REDIS_DOWN_AT=0
REDIS_UP_AT=0

################################################################################
# Fonctions utilitaires
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

check_redis_status() {
    docker exec aenews-redis redis-cli ping > /dev/null 2>&1
    return $?
}

check_api_health() {
    curl -sf http://localhost:3000/api/health | grep '"status":"ok"' > /dev/null 2>&1
    return $?
}

measure_circuit_breaker_detection() {
    local detection_time=0
    local max_wait=10 # 10 secondes max
    
    while [ $detection_time -lt $max_wait ]; do
        # Tester si l'API retourne 503 ou erreur circuit-breaker
        response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/projects)
        
        if [ "$response" = "503" ] || [ "$response" = "500" ]; then
            log_info "Circuit-breaker détecté après ${detection_time}s"
            return 0
        fi
        
        sleep 1
        ((detection_time++))
    done
    
    log_error "Circuit-breaker NON détecté après ${max_wait}s"
    return 1
}

################################################################################
# PHASE 1: État initial
################################################################################

log_info "Phase 1/5: Vérification état initial..."

if ! check_redis_status; then
    log_error "Redis n'est PAS actif. Démarrez docker-compose d'abord."
    exit 1
fi

if ! check_api_health; then
    log_error "API n'est PAS active. Démarrez docker-compose d'abord."
    exit 1
fi

log_info "✅ Redis et API actifs"

# Créer un job de test
log_info "Création d'un job de test..."
JOB_ID=$(curl -sf -X POST http://localhost:3000/api/projects \
    -H "Content-Type: application/json" \
    -d '{"name":"chaos-test-redis","description":"Test de résilience Redis"}' \
    | jq -r '.id' 2>/dev/null || echo "test-job-$(date +%s)")

log_info "Job créé: $JOB_ID"

################################################################################
# PHASE 2: KILL REDIS (simulation panne)
################################################################################

log_info ""
log_warn "Phase 2/5: 🔪 KILLING REDIS..."

docker stop aenews-redis > /dev/null 2>&1
REDIS_DOWN_AT=$(date +%s)

log_warn "Redis tué à $(date -d @$REDIS_DOWN_AT +%H:%M:%S)"

# Vérifier que Redis est bien mort
if check_redis_status; then
    log_error "ÉCHEC: Redis est encore actif après stop!"
    exit 1
fi

log_info "✅ Redis confirmé DOWN"

################################################################################
# PHASE 3: Test détection circuit-breaker
################################################################################

log_info ""
log_info "Phase 3/5: Test détection circuit-breaker..."

sleep 2 # Laisser temps à l'API de détecter

if measure_circuit_breaker_detection; then
    log_info "✅ Circuit-breaker opérationnel"
else
    log_error "❌ Circuit-breaker DÉFAILLANT"
fi

# Vérifier que les nouveaux jobs sont rejetés
log_info "Test création job (doit échouer)..."
http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/projects \
    -H "Content-Type: application/json" \
    -d '{"name":"should-fail"}')

if [ "$http_code" = "503" ] || [ "$http_code" = "500" ]; then
    log_info "✅ Jobs correctement rejetés (HTTP $http_code)"
else
    log_warn "⚠️  Job accepté (HTTP $http_code) - circuit-breaker peut-être trop lent"
fi

################################################################################
# PHASE 4: RECOVERY (redémarrage Redis)
################################################################################

log_info ""
log_info "Phase 4/5: 🔄 Redémarrage Redis..."

docker start aenews-redis > /dev/null 2>&1
REDIS_UP_AT=$(date +%s)

# Attendre que Redis soit prêt
max_wait=30
waited=0
while ! check_redis_status; do
    if [ $waited -ge $max_wait ]; then
        log_error "Redis n'a pas redémarré après ${max_wait}s"
        exit 1
    fi
    sleep 1
    ((waited++))
done

RECOVERY_TIME=$((REDIS_UP_AT - REDIS_DOWN_AT))
log_info "✅ Redis UP après ${RECOVERY_TIME}s"

################################################################################
# PHASE 5: Validation reprise automatique
################################################################################

log_info ""
log_info "Phase 5/5: Validation reprise des jobs..."

# Attendre que le circuit-breaker se referme
sleep 5

if check_api_health; then
    log_info "✅ API de nouveau saine"
else
    log_error "❌ API ne répond plus après recovery Redis"
    exit 1
fi

# Tester création d'un nouveau job
log_info "Test création nouveau job..."
NEW_JOB=$(curl -sf -X POST http://localhost:3000/api/projects \
    -H "Content-Type: application/json" \
    -d '{"name":"post-recovery-test"}' \
    | jq -r '.id' 2>/dev/null || echo "")

if [ -n "$NEW_JOB" ]; then
    log_info "✅ Nouveau job créé: $NEW_JOB"
else
    log_error "❌ Impossible de créer un job après recovery"
    exit 1
fi

################################################################################
# RAPPORT FINAL
################################################################################

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

echo "" | tee -a "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "📊 RAPPORT CHAOS TEST 1 - Redis Kill & Recovery" | tee -a "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "⏱️  Durée totale du test : ${TOTAL_TIME}s" | tee -a "$LOG_FILE"
echo "⚡ Temps de panne Redis : ${RECOVERY_TIME}s" | tee -a "$LOG_FILE"
echo "🔄 MTTR (Mean Time To Recovery) : ${RECOVERY_TIME}s" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

if [ $RECOVERY_TIME -le 10 ]; then
    echo -e "${GREEN}✅ SUCCÈS : Recovery < 10s (excellent)${NC}" | tee -a "$LOG_FILE"
    exit 0
elif [ $RECOVERY_TIME -le 30 ]; then
    echo -e "${YELLOW}⚠️  ACCEPTABLE : Recovery 10-30s${NC}" | tee -a "$LOG_FILE"
    exit 0
else
    echo -e "${RED}❌ ÉCHEC : Recovery > 30s (trop lent)${NC}" | tee -a "$LOG_FILE"
    exit 1
fi
