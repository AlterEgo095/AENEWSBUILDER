# 🚀 AENEWS BUILDER v3.0

![Banner](https://img.shields.io/badge/AENEWS-BUILDER-blueviolet?style=for-the-badge)
![Version](https://img.shields.io/badge/version-3.0.0-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

**Industrial AI Operating System (L4 + MCP + SCALE)**

> Système autonome de génération de projets web complets avec IA, orchestration intelligente, auto-réparation et déploiement automatisé.

---

## 📋 TABLE DES MATIÈRES

- [🎯 Vision](#-vision)
- [🏗️ Architecture](#️-architecture)
- [⚡ Fonctionnalités](#-fonctionnalités)
- [🚀 Installation](#-installation)
- [🔧 Configuration](#-configuration)
- [📦 Déploiement VPS](#-déploiement-vps)
- [📊 Monitoring](#-monitoring)
- [🛡️ Sécurité](#️-sécurité)
- [🤝 Contribution](#-contribution)

---

## 🎯 VISION

AENEWS BUILDER n'est pas un simple "builder" de sites web.

**C'est un système d'exploitation IA** qui combine :

```
AI CORE (L4 ENGINE)
+ TOOL ECOSYSTEM (MCP)
+ EXECUTION INFRA
= AI OPERATING SYSTEM
```

### 💡 Cas d'usage

- 🌐 **Génération de sites web complets** (landing, SaaS, e-commerce)
- ⚡ **APIs REST/GraphQL** production-ready
- 📊 **Dashboards admin** avec authentification
- 🎨 **Applications React/Next.js** optimisées
- 🔄 **Auto-healing** et tests automatisés

---

## 🏗️ ARCHITECTURE

### 📐 Vue d'ensemble

```
┌──────────────────────────────────────────────┐
│         FRONTEND (AENEWS STUDIO)             │
│    React 19 • Vite • Tailwind • SSE          │
└───────────────────┬──────────────────────────┘
                    │ HTTPS / SSE
                    ▼
┌──────────────────────────────────────────────┐
│           API GATEWAY (Fastify)              │
│    JWT RS256 • Rate Limit • Zod             │
└───────────────────┬──────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│        ORCHESTRATOR (AI Control Plane)       │
│  • Ghost Classifier (GPT-4o-mini)            │
│  • Planner (Claude Sonnet)                   │
│  • Decision Engine                           │
│  • Cost Estimator                            │
└───────────────────┬──────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│           WORKER ENGINE (L4 CORE)            │
│  STATE MACHINE:                              │
│  INIT → ANALYSIS → PLANNING → EXECUTE_MCP    │
│       → GENERATE → TEST → FIX → DEPLOY       │
└───────────────────┬──────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│          MCP ECOSYSTEM (TOOLS)               │
│  Figma • Notion • Playwright • Cloudflare    │
└──────────────────────────────────────────────┘
```

### 🧬 Composants principaux

#### 1. **Orchestrator** (Cerveau du système)
- **Ghost Classifier** : Classification ultra-rapide (GPT-4o-mini)
- **Planner** : Génération de plans détaillés (Claude Sonnet)
- **Decision Engine** : Sélection intelligente de modèles
- **Cost Estimator** : Prévision des coûts avant exécution

#### 2. **Worker Engine** (Moteur d'exécution)
- **State Machine déterministe** : 9 états avec transitions validées
- **Generator incrémental** : 1 fichier à la fois, contexte optimisé
- **Sandbox Warm Pool** : Conteneurs pré-chargés (<2s latence)
- **Auto-Healing** : 3 tentatives + escalation de modèle
- **Context Memory** : Graph des relations entre fichiers
- **Event Store** : Redis (real-time) + PostgreSQL (persistent)

#### 3. **MCP Ecosystem** (Extensions)
- **Adapter** : Interface d'exécution universelle
- **Registry** : Catalogue de tools disponibles
- **Execution** : Parallèle + isolation Docker
- **Security** : Signature + permissions

---

## ⚡ FONCTIONNALITÉS

### 🎯 Génération Intelligente

- ✅ **Classification automatique** du projet (complexité, type, stack)
- ✅ **Planification détaillée** avec dépendances et étapes
- ✅ **Génération incrémentale** fichier par fichier
- ✅ **Optimisation tokens** avec contexte limité
- ✅ **Cache Redis** pour classification et plans

### 🔄 Auto-Réparation

- ✅ **Détection automatique** des erreurs (syntax, runtime, imports)
- ✅ **3 tentatives** avec escalation de modèle :
  - Retry 1 : GPT-4o-mini
  - Retry 2 : Claude Sonnet
  - Retry 3 : Claude Opus
- ✅ **Correction intelligente** via IA
- ✅ **Replay d'événements** pour debug

### 🧪 Testing Automatisé

- ✅ **Sandbox isolés** (Docker) avec limits CPU/RAM
- ✅ **Warm Pool** de conteneurs pré-configurés
- ✅ **Détection de stack** automatique (React, Next, Express)
- ✅ **Exécution <2s** grâce au warm pool

### 💰 Gestion des Coûts

- ✅ **Tracking en temps réel** des tokens et coûts
- ✅ **Prévision** avant génération
- ✅ **Alertes** sur seuils quotidiens/mensuels
- ✅ **Breakdown par opération**

### 🔒 Sécurité Enterprise

- ✅ **JWT RS256** avec clés publiques/privées
- ✅ **Rate Limiting** Redis-backed
- ✅ **Helmet** + CSP + HSTS
- ✅ **Validation Zod** sur tous les inputs
- ✅ **Audit Semgrep** automatique
- ✅ **Network isolation** des sandboxes

---

## 🚀 INSTALLATION

### 📋 Prérequis

- **Node.js** ≥ 20.0.0
- **pnpm** ≥ 9.0.0
- **Docker** ≥ 24.0.0
- **Docker Compose** ≥ 2.0.0

### 📥 Clone & Setup

```bash
# Clone le repository
git clone https://github.com/AlterEgo095/AENEWSBUILDER.git
cd AENEWSBUILDER

# Installer les dépendances
pnpm install

# Copier le fichier d'environnement
cp .env.example .env

# Générer les clés JWT RS256
mkdir -p secrets
openssl genrsa -out secrets/jwt-private.pem 2048
openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem
chmod 600 secrets/jwt-private.pem

# Configurer .env (IMPORTANT!)
nano .env
```

### ⚙️ Configuration `.env`

Remplir **obligatoirement** :

```env
# API Keys
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Database
DATABASE_URL=postgresql://aenews:password@localhost:5432/aenews_builder

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-redis-password

# JWT
JWT_SECRET=your-super-secure-secret-min-64-chars
```

---

## 🔧 CONFIGURATION

### 🏃 Développement Local

```bash
# Démarrer l'infrastructure (PostgreSQL + Redis)
docker-compose up -d postgres redis

# Générer Prisma Client
cd apps/api && npx prisma generate

# Migrer la base de données
npx prisma migrate dev

# Démarrer en mode dev
pnpm dev
```

**URLs locales :**
- API Gateway : `http://localhost:3001`
- Frontend Studio : `http://localhost:5173`
- Health Check : `http://localhost:3001/api/health`

### 🏗️ Production Build

```bash
# Build tous les packages
pnpm build

# Démarrer en production
docker-compose up -d
```

---

## 📦 DÉPLOIEMENT VPS

### 🎯 Prérequis VPS

- Ubuntu 22.04 LTS (recommandé)
- 4GB RAM minimum (8GB recommandé)
- 50GB disque SSD
- Docker + Docker Compose installés

### 🚀 Déploiement Automatique (GitHub Actions)

1. **Configurer les secrets GitHub** :

```
Settings → Secrets and variables → Actions → New repository secret
```

Ajouter :
- `VPS_HOST` : IP ou domaine du VPS
- `VPS_USER` : Utilisateur SSH (ex: `aenews`)
- `VPS_SSH_KEY` : Clé privée SSH
- `VPS_DEPLOY_PATH` : Chemin déploiement (ex: `/opt/aenews-builder`)

2. **Push sur `main`** → Déploiement automatique

### 🔧 Déploiement Manuel

```bash
# Sur le VPS
ssh user@your-vps-ip

# Installer Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Créer le dossier de déploiement
sudo mkdir -p /opt/aenews-builder
sudo chown $USER:$USER /opt/aenews-builder
cd /opt/aenews-builder

# Cloner le repo
git clone https://github.com/AlterEgo095/AENEWSBUILDER.git .

# Configurer .env
cp .env.example .env
nano .env

# Démarrer
docker-compose up -d

# Vérifier les logs
docker-compose logs -f
```

### 🌐 Configuration Nginx (Optionnel)

Pour exposer sur un domaine :

```nginx
server {
    listen 80;
    server_name aenews.ai;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Activer SSL :

```bash
sudo certbot --nginx -d aenews.ai
```

---

## 📊 MONITORING

### 🔍 Services Disponibles

- **API Health** : `http://your-domain/api/health`
- **Prometheus** : `http://your-domain:9090`
- **Grafana** : `http://your-domain:3000` (admin / admin)

### 📈 Métriques Clés

- Temps de génération par projet
- Tokens consommés (total + par modèle)
- Coûts en temps réel
- Taux de succès/échec
- Temps de réponse API
- Utilisation CPU/RAM des workers

### 🚨 Alertes

Configurées automatiquement pour :
- Coût quotidien dépassé
- Erreurs critiques (>10/min)
- Latence API >2s
- Workers down

---

## 🛡️ SÉCURITÉ

### 🔐 Mesures Implémentées

#### Authentication
- ✅ JWT RS256 (asymétrique)
- ✅ Tokens expirables (7j par défaut)
- ✅ Refresh tokens (à implémenter)

#### API Protection
- ✅ Rate Limiting (100 req/min par IP)
- ✅ Helmet (headers sécurisés)
- ✅ CORS configuré
- ✅ Validation Zod stricte

#### Infrastructure
- ✅ Network isolation sandboxes
- ✅ CPU/RAM limits conteneurs
- ✅ No root dans conteneurs
- ✅ Secrets hors Git

#### Audit
- ✅ Semgrep scan auto (CI/CD)
- ✅ Dependency check
- ✅ Event logging complet

### 🚨 Checklist Avant Production

- [ ] Générer nouvelles clés JWT
- [ ] Changer tous les mots de passe
- [ ] Configurer Cloudflare WAF
- [ ] Activer SSL/TLS
- [ ] Backups PostgreSQL quotidiens
- [ ] Monitoring Sentry actif
- [ ] Rate limits ajustés

---

## 🤝 CONTRIBUTION

### 📝 Guidelines

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

### 🐛 Rapporter un Bug

Ouvrir une **Issue** avec :
- Description détaillée
- Steps to reproduce
- Logs pertinents
- Environnement (OS, versions)

---

## 📞 CONTACT & SUPPORT

**Créateur** : Dieudonné MATANDA (ALTER EGO)

- 📧 **Email** : dieudonneematanda@gmail.com
- 📱 **WhatsApp** : +243 890 139 879
- 🔗 **GitHub** : [AlterEgo095](https://github.com/AlterEgo095)

---

## 📄 LICENCE

MIT License - voir [LICENSE](LICENSE) pour plus de détails.

---

## 🙏 REMERCIEMENTS

- OpenAI (GPT-4o, GPT-4o-mini)
- Anthropic (Claude Sonnet, Opus)
- Communauté Open Source

---

<div align="center">

**⚡ Built with passion by ALTER EGO ⚡**

![Stargazers](https://img.shields.io/github/stars/AlterEgo095/AENEWSBUILDER?style=social)
![Forks](https://img.shields.io/github/forks/AlterEgo095/AENEWSBUILDER?style=social)

</div>
