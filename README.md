# AENEWS BUILDER v3.0

![Banner](https://img.shields.io/badge/AENEWS-BUILDER-blueviolet?style=for-the-badge)
![Version](https://img.shields.io/badge/version-3.0.0-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square)
![Node](https://img.shields.io/badge/Node.js-%3E%3D20-green?style=flat-square)

**Systeme d'Exploitation IA Industriel (L4 + MCP + SCALE)**

> Systeme autonome de generation de projets web complets avec IA, orchestration intelligente, auto-reparation et deploiement automatise. Monorepo Turborepo avec 4 applications, 8 services Docker, et 163 outils MCP.

---

## Table des Matieres

- [Vision](#-vision)
- [Architecture](#-architecture)
- [Structure du Monorepo](#-structure-du-monorepo)
- [State Machine](#-state-machine--pipeline)
- [IA et Failover Cascade](#-ia-et-failover-cascade)
- [MCP Ecosystem](#-mcp-ecosystem--163-outils)
- [Templates Framework](#-templates-framework--10-starter)
- [Fonctionnalites](#-fonctionnalites)
- [Infrastructure Docker](#-infrastructure-docker)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Deploiement VPS](#-deploiement-vps)
- [Monitoring](#-monitoring)
- [Securite](#-securite)
- [CI/CD](#-cicd)
- [Contribution](#-contribution)

---

## Vision

AENEWS BUILDER n'est pas un simple "builder" de sites web. C'est un systeme d'exploitation IA qui combine :

```
AI CORE (L4 ENGINE)     → Orchestration IA avec failover cascade
+ TOOL ECOSYSTEM (MCP)  → 163 outils dans 17 categories
+ EXECUTION INFRA       → Docker, BullMQ, Redis Streams
+ ADMIN DASHBOARD       → Monitoring et gestion en temps reel
= AI OPERATING SYSTEM
```

### Cas d'usage

- **Generation de sites web complets** (landing, SaaS, e-commerce)
- **APIs REST production-ready** (Express, FastAPI)
- **Dashboards admin** avec authentification JWT RS256
- **Applications React/Next.js/Vue/Angular** optimisees
- **Auto-healing** avec 3 cycles max et escalation de modele
- **Deploiement multi-cible** (Vercel, Cloudflare, Railway)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND STUDIO (apps/studio)                    │
│          React 19 · Vite 5 · TailwindCSS · SSE · Zustand            │
│          Components: AuthForm, Terminal, Preview, JobManager         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS / SSE
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 ADMIN DASHBOARD (apps/admin)                        │
│          React 19 · Vite 6 · TailwindCSS · Recharts · Lucide         │
│          9 pages: Dashboard, Projects, Jobs, Users, MCPTools,        │
│          Monitoring, Costs, Settings, ProjectDetail                  │
│          Lazy loading · Auth protection · Mock + API fallback         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NGINX REVERSE PROXY                               │
│          / → studio:5173  /admin → admin:5174  /api → api:3001      │
│          SSE streaming · Rate limiting · Security headers             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API GATEWAY (apps/api)                            │
│          Fastify · JWT RS256 · Rate Limit (Redis) · Zod              │
│          Routes: /api/auth · /api/projects · /api/engine             │
│                  /api/stream · /api/admin · /api/health · /metrics    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  PostgreSQL   │ │    Redis     │ │   BullMQ     │
│  Prisma ORM   │ │ Cache+PubSub│ │  Job Queue   │
│  Migrations   │ │  Streams    │ │  Workers     │
└──────────────┘ └──────────────┘ └──────┬───────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  WORKER ENGINE (L4 Core)                            │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Orchestrator │  │ AI Failover  │  │     Generator            │   │
│  │ Classifier   │  │ Circuit Brkr │  │  Context-aware (1 file   │   │
│  │ Planner      │→ │ Smart Cache  │→ │  at a time, all prev     │   │
│  │ Decision Eng │  │ Cost Budget  │  │  files as context)       │   │
│  └─────────────┘  └──────────────┘  └──────────────────────────┘   │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ MCP Executor │  │Auto-Healing  │  │     Deployer             │   │
│  │ 163 tools    │  │ 3 cycles max │  │  Vercel/Cloudflare/      │   │
│  │ Parallel exec│  │ Model esc.   │  │  Railway + fallback      │   │
│  └─────────────┘  └──────────────┘  └──────────────────────────┘   │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │Sandbox Mgr  │  │Event Store   │  │   Context Memory         │   │
│  │Warm Pool    │  │ V1: Redis    │  │  Cross-project learning  │   │
│  │Docker isol. │  │ V2: PG+Redis │  │  Generation patterns     │   │
│  └─────────────┘  │  Streams     │  └──────────────────────────┘   │
│                    └──────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  MCP ECOSYSTEM (packages/mcp)                       │
│          163 catalog entries · 17 categories · 21 native tools       │
│          Universal Adapter · Registry · Security · Audit Log          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Structure du Monorepo

```
AENEWSBUILDER/
├── apps/
│   ├── api/                          # API Gateway (Fastify)
│   │   ├── src/
│   │   │   ├── index.ts              # Bootstrap Fastify + JWT + Helmet + CORS
│   │   │   ├── config/               # env.ts, logger.ts, prisma.ts
│   │   │   ├── routes/               # auth, project, engine, stream, admin, health
│   │   │   ├── services/             # ai-failover, orchestrator, redis, context-memory,
│   │   │   │                         # plan-versioning, security-engine
│   │   │   ├── workers/              # index (state machine), generator, auto-healing,
│   │   │   │                         # mcp-executor, deployer, cost-tracker, templates,
│   │   │   │                         # sandbox-manager, event-store, event-store-v2
│   │   │   ├── sandbox/              # warm-pool.ts
│   │   │   ├── observability/        # metrics (Prometheus), tracing (OpenTelemetry),
│   │   │   │                         # sentry.ts
│   │   │   ├── queue/                # bull-config.ts, project-queue.ts
│   │   │   └── middleware/           # error-handler.ts
│   │   ├── prisma/                   # schema.prisma + migrations
│   │   ├── tests/                    # e2e + load (k6)
│   │   └── Dockerfile
│   │
│   ├── studio/                       # Frontend utilisateur
│   │   ├── src/
│   │   │   ├── App.tsx               # Main app with auth + project creation + SSE
│   │   │   ├── components/           # AuthForm, Terminal, Preview, JobManager
│   │   │   └── hooks/                # useSSE.ts
│   │   └── Dockerfile
│   │
│   └── admin/                        # Dashboard administration premium
│       ├── src/
│       │   ├── App.tsx               # Router with lazy loading + protected routes
│       │   ├── pages/                # Dashboard, Projects, ProjectDetail, Jobs,
│       │   │                         # Users, MCPTools, Monitoring, Costs, Settings
│       │   ├── components/
│       │   │   ├── layout/           # Layout, Sidebar, Header
│       │   │   ├── charts/           # AreaChart, BarChart, DonutChart, Sparkline
│       │   │   └── ui/               # Button, Card, Modal, Table, Badge, Skeleton,
│       │   │                         # Toast, StatsCard, Progress
│       │   ├── hooks/                # useApi.ts, useAuth.ts
│       │   ├── data/                 # mock-data.ts, mcp-categories.ts
│       │   └── lib/                  # api.ts
│       └── Dockerfile
│
├── packages/
│   └── mcp/                          # MCP Ecosystem
│       ├── src/index.ts              # Point d'entree principal
│       ├── catalog.ts                # 163 entrees catalogue, 17 categories
│       ├── registry.ts               # Registre d'outils disponibles
│       ├── adapter.ts                # Interface d'execution universelle
│       ├── universal-adapter.ts      # Adaptateur universel MCP
│       ├── security.ts               # Signature + permissions
│       ├── audit-log.ts              # Journal d'audit
│       └── tools/                    # 21 fichiers d'outils natifs
│           ├── figma.ts, notion.ts, github.ts, slack.ts
│           ├── playwright.ts, browser-tools.ts, websearch.ts
│           ├── vercel.ts, cloud-tools.ts, deploy.ts
│           ├── database-tools.ts, prisma.ts, supabase.ts
│           ├── dev-tools.ts, communication-tools.ts
│           ├── multimedia-tools.ts, replicate.ts, prometheus.ts
│           └── ...
│
├── docker/
│   ├── nginx/nginx.conf              # Reverse proxy (/, /admin, /api, SSE)
│   └── prometheus/prometheus.yml     # Configuration scraping
│
├── .github/workflows/ci-cd.yml       # CI/CD 4 stages
├── docker-compose.yml                # 8 services
├── turbo.json                        # Turborepo pipeline
├── pnpm-workspace.yaml               # Workspaces config
├── scripts/deploy.sh                 # Script de deploiement VPS
└── package.json                      # Monorepo root (v3.0.0)
```

---

## State Machine & Pipeline

Le pipeline utilise une **State Machine deterministe avec auto-chaining**. Chaque job BullMQ execute la boucle complete dans une seule invocation, eliminant le bug critique de stalling.

```
INIT → ANALYSIS → PLANNING → EXECUTE_MCP → GENERATE → TEST → DEPLOY → DONE
                      ↓          ↓             ↓         ↓         ↓
                   FAILED     FAILED        FAILED    FIX → TEST  FAILED
                                                            ↓
                                                        (max 3 cycles)
```

### 11 etats avec transitions validees

| Etat | Role | Sortie |
|------|------|--------|
| `INIT` | Initialisation du contexte projet | → ANALYSIS |
| `ANALYSIS` | Orchestrator (Ghost Classifier + Planner + Decision Engine) | → PLANNING / FAILED |
| `PLANNING` | Sauvegarde plan v1, cross-project learning, routage MCP | → EXECUTE_MCP / GENERATE |
| `EXECUTE_MCP` | Execution parallele des outils MCP du plan | → GENERATE |
| `GENERATE` | Generation context-aware fichier par fichier | → TEST |
| `TEST` | Security scan + sandbox tests Docker | → DEPLOY / FIX |
| `FIX` | Auto-healing avec escalation de modele (max 3 cycles) | → TEST |
| `DEPLOY` | Deploiement multi-cible avec fallback URL | → DONE |
| `DONE` | Projet complete | (terminal) |
| `FAILED` | Erreur fatale → Dead Letter Queue | (terminal) |

### Auto-Chaining

Le systeme ne depend plus de BullMQ pour re-enqueue chaque etat. `runWorkflow()` boucle sur tous les etats avec un timeout global de **10 minutes** et une limite de **3 cycles FIX**.

### Generation Context-Aware

Le generateur ne produit pas un fichier isole. Chaque fichier est genere avec **tous les fichiers precedemment generes passes en contexte**, permettant la coherence cross-fichier (imports, types, composants partages).

---

## IA et Failover Cascade

### Cascade par defaut

```
gpt-4o-mini (fast) → claude-3-haiku (fast) → claude-3-sonnet (standard) → gpt-4o (standard)
```

### Modeles disponibles

| Modele | Provider | Tier | Max Tokens | Cout/1K (in/out) |
|--------|----------|------|-----------|------------------|
| `gpt-4o-mini` | OpenAI | fast | 128K | $0.00015 / $0.00060 |
| `claude-3-haiku` | Anthropic | fast | 200K | $0.00025 / $0.00125 |
| `claude-3-sonnet` | Anthropic | standard | 200K | $0.003 / $0.015 |
| `gpt-4o` | OpenAI | standard | 128K | $0.0025 / $0.01 |
| `gpt-4-turbo` | OpenAI | advanced | 128K | $0.01 / $0.03 |
| `claude-3-opus` | Anthropic | advanced | 200K | $0.015 / $0.075 |

### Hystrix Circuit Breaker

Chaque provider (OpenAI, Anthropic) dispose d'un circuit breaker independant avec 3 etats :

- **CLOSED** : requetes normales
- **OPEN** : 5 echecs consecutifs → bloque pendant 60s
- **HALF_OPEN** : test de recuperation (2 succès requis pour fermer)

### Smart Cache (LRU)

Cache semantique avec hash SHA256 des messages, TTL de 1 heure, capacite de 1000 entrees. Evite les appels redondants pour des prompts similaires.

### Cost Budget Manager

Protection contre les debordements de couts avec :
- **Budget horaire** : $100/heure max
- **Budget journalier** : $1000/jour max
- **Detection de spike** : alerte si > $10/minute
- **Detection de boucle infinie** : max 100 requetes/heure par projet
- **Alerte dedupliee** : chaque type d'alerte envoyee une seule fois

---

## MCP Ecosystem (163 outils)

### 17 categories

| Categorie | Description | Exemples |
|-----------|-------------|----------|
| `database` | Bases de donnees & stockage | PostgreSQL, MongoDB, Redis, Supabase, Prisma, Neon |
| `cloud` | Cloud & infrastructure | AWS, Cloudflare, Kubernetes, Terraform, Pulumi |
| `browser` | Navigation & automatisation | Playwright, Browserbase, BrowserMCP |
| `communication` | Messagerie & collaboration | Slack, Teams, Telegram, Gmail, WhatsApp |
| `code` | Code & execution | OpenAPI-MCP, VSCode, LeetCode, Serena (LSP) |
| `cli` | Terminal & line de commande | Shell Server, Python Executor, Desktop Commander |
| `search` | Recherche & extraction | WebSearch |
| `multimedia` | Multimedia & traitement | Replicate |
| `tools` | Outils & integration | Dev Tools |
| `monitoring` | Monitoring & observabilite | Prometheus |
| `data` | Donnees & clients | |
| `file` | Fichiers & stockage | |
| `aggregator` | Agregateur & proxy | |
| `translation` | Traduction & langues | |
| `social` | Reseaux sociaux | |
| `security` | Securite | |

### Architecture MCP

- **Catalog** (`catalog.ts`) : 163 entrees avec metadonnees completes (source, permissions, env vars, tags)
- **Registry** (`registry.ts`) : Registre d'outils disponibles pour le worker
- **Adapter** (`adapter.ts`) : Interface d'execution universelle
- **Universal Adapter** (`universal-adapter.ts`) : Adaptateur pour outils communautaires
- **Security** (`security.ts`) : Signature + validation des permissions
- **Audit Log** (`audit-log.ts`) : Journal d'audit des executions
- **21 outils natifs** dans `tools/` (Figma, Notion, GitHub, Slack, Playwright, Vercel, etc.)

---

## Templates Framework (10 starters)

Chaque template inclut : `package.json`, configs (Vite, TypeScript, Tailwind, PostCSS), fichiers source de demarrage, et structure de repertoires.

| Template | Category | Platform par defaut | Stack |
|----------|----------|--------------------|-------|
| **React** | SPA | Cloudflare | Vite + React 18 + TypeScript + Tailwind + shadcn/ui |
| **Next.js** | SSR | Vercel | App Router + TypeScript + Tailwind + shadcn/ui |
| **Vue 3** | SPA | Cloudflare | Vite + Vue 3 + TypeScript + Pinia |
| **SvelteKit** | SSR | Vercel | SvelteKit + TypeScript |
| **Angular** | SPA | Cloudflare | Angular 18+ + standalone components |
| **Nuxt 3** | SSR | Vercel | Nuxt 3 + TypeScript + Pinia |
| **Astro** | Static | Cloudflare | Astro + React islands + TypeScript |
| **Remix** | SSR | Vercel | Remix + TypeScript + Tailwind CSS |
| **Express** | API | Railway | Express + TypeScript + Prisma ORM |
| **FastAPI** | API | Railway | Python FastAPI + SQLAlchemy + Pydantic |

La selection du template se fait automatiquement via `detectTemplate()` qui analyse la classification de l'orchestrator (recommendedStack + type).

---

## Fonctionnalites

### Generation Intelligente

- **Classification automatique** du projet (complexite, type, stack) via Ghost Classifier
- **Planification detaillee** avec dependances et fichiers cibles
- **Generation context-aware** : chaque fichier genere connait tous les precedents
- **Template bootstrapping** : 10 frameworks avec fichiers de demarrage
- **Optimisation tokens** : contexte limite aux fichiers pertinents
- **Cache Redis** pour classification et plans

### Auto-Reparation

- **3 cycles max** FIX→TEST avant de declarer l'echec
- **Security scan** automatique (score/100, critical/high/medium/low)
- **Sandbox Docker** pour les tests (CPU/RAM limits, isolation reseau)
- **Warm Pool** de conteneurs pre-configures (<2s latence)
- **Model escalation** via AI Failover cascade
- **Plan versioning** : sauvegarde avant chaque tentative de fix

### Event Store (dual-layer)

- **V1** : Redis pub/sub pour streaming SSE temps reel vers le frontend
- **V2** : PostgreSQL + Redis Streams avec horloges de Lamport pour durabilite et replay

### Gestion des Couts

- **Tracking temps reel** : tokens + couts par operation et par projet
- **Budgets** : $100/heure, $1000/jour avec alertes
- **Spike detection** : alerte si > $10/minute
- **Runaway loop protection** : max 100 requetes/heure/projet
- **Smart Cache LRU** : evite les appels IA redondants

### Deploiement Multi-Cible

- **Vercel** : pour SSR/SSG (Next.js, Remix, Astro)
- **Cloudflare** : pour SPA et sites statiques (React, Vue, Angular)
- **Railway** : pour APIs backend (Express, FastAPI)
- **Fallback URL** : si le deploiement echoue, un URL placeholder est fourni

---

## Infrastructure Docker

### 8 services (docker-compose.yml)

| Service | Image | Port | Role |
|---------|-------|------|------|
| `postgres` | postgres:16-alpine | 5432 | Base de donnees (Prisma ORM) |
| `redis` | redis:7-alpine | 6379 | Cache + Queue BullMQ + Pub/Sub + Streams |
| `api` | (build) | 3001 | API Gateway Fastify |
| `studio` | (build) | 5173 | Frontend utilisateur |
| `admin` | (build) | 5174 | Dashboard administration |
| `nginx` | nginx:alpine | 80, 443 | Reverse proxy |
| `prometheus` | prom/prometheus | 9090 | Metriques |
| `grafana` | grafana/grafana | 3000 | Dashboards |

### Nginx - Routage

```nginx
/           → studio:5173      # Frontend utilisateur
/admin      → admin:5174       # Dashboard admin
/api        → api:3001         # API Gateway (rate limit: 10 req/s)
/api/stream → api:3001         # SSE streaming (buffering off, 24h timeout)
```

Nginx applique aussi les security headers (X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy) et le rate limiting (30 req/s general).

---

## Installation

### Prerequis

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Docker** >= 24.0.0
- **Docker Compose** >= 2.0.0

### Clone & Setup

```bash
# Cloner le repository
git clone https://github.com/AlterEgo095/AENEWSBUILDER.git
cd AENEWSBUILDER

# Installer les dependances (monorepo)
pnpm install

# Copier le fichier d'environnement
cp .env.example .env

# Generer les cles JWT RS256
mkdir -p secrets
openssl genrsa -out secrets/jwt-private.pem 2048
openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem
chmod 600 secrets/jwt-private.pem

# Configurer .env
nano .env
```

### Configuration `.env`

```env
# API Keys IA
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

## Configuration

### Developpement Local

```bash
# Demarrer l'infrastructure (PostgreSQL + Redis)
docker-compose up -d postgres redis

# Generer Prisma Client
cd apps/api && npx prisma generate

# Migrer la base de donnees
npx prisma migrate dev

# Demarrer en mode dev (Turborepo)
pnpm dev
```

**URLs locales :**
- Frontend Studio : `http://localhost:5173`
- Admin Dashboard : `http://localhost:5174`
- API Gateway : `http://localhost:3001`
- Health Check : `http://localhost:3001/api/health`
- Prometheus : `http://localhost:9090`
- Grafana : `http://localhost:3000`

### Production Build

```bash
# Build tous les packages (Turborepo)
pnpm build

# Demarrer tous les services
docker-compose up -d
```

---

## Deploiement VPS

### Prerequis VPS

- Ubuntu 22.04 LTS (recommande)
- 4GB RAM minimum (8GB recommande)
- 50GB disque SSD
- Docker + Docker Compose installes

### Deploiement Automatique (GitHub Actions)

Le workflow CI/CD (`.github/workflows/ci-cd.yml`) s'execute automatiquement sur push `main` avec 4 stages :

1. **Lint** : Prettier + ESLint
2. **Typecheck** : TypeScript strict mode
3. **Test** : Jest/Vitest
4. **Build** : Turborepo build

Pour le deploiement automatique vers VPS, configurer les secrets GitHub :

```
Settings → Secrets and variables → Actions → New repository secret
```

Secrets requis : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_DEPLOY_PATH`

### Deploiement Manuel

```bash
# Sur le VPS
ssh user@your-vps-ip
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

sudo mkdir -p /opt/aenews-builder
sudo chown $USER:$USER /opt/aenews-builder
cd /opt/aenews-builder

git clone https://github.com/AlterEgo095/AENEWSBUILDER.git .
cp .env.example .env && nano .env
docker-compose up -d
docker-compose logs -f
```

---

## Monitoring

### Stack d'observabilite

| Couche | Technologie | Role |
|--------|------------|------|
| Metriques | Prometheus + prom-client | Compteurs, histogrammes, gauges exposes sur `/metrics` |
| Tracing | OpenTelemetry | Traces distribues avec export OTLP |
| Erreurs | Sentry | Capture d'exceptions et alertes |
| Dashboard | Grafana | Visualisation des metriques |

### Metriques cles

- Temps de generation par projet
- Tokens consommes (total + par modele)
- Couts en temps reel (horaire + journalier)
- Taux de succes/echec par etat
- Latence API (histogrammes)
- Circuit breaker state par provider
- Cache hit/miss ratio

### Alertes automatiques

- Cout horaire depasse ($100/h)
- Cout journalier depasse ($1000/j)
- Spike de cout (> $10/minute)
- Erreurs critiques (> 10/min)
- Latence API > 2s
- Boucle infinie detectee (> 100 req/heure/projet)

---

## Securite

### Authentication

- **JWT RS256** (asymetrique) avec cles publiques/privées
- **Token revocation** via blacklist Redis
- **Claims validation** : sub, exp, aud avec tolerance horloge 5min
- **Clock skew tolerance** : 5 minutes

### API Protection

- **Rate Limiting** Redis-backed avec ban IP apres 10 violations
- **Helmet** : CSP, HSTS (max-age 1 an, includeSubDomains, preload)
- **CORS** : origins configurables, credentials support
- **Validation Zod** stricte sur tous les inputs
- **Body limit** : 10MB max (protection contre JSON bombs)
- **Param limit** : 500 caracteres max par param

### Infrastructure

- **Network isolation** des sandboxes Docker
- **CPU/RAM limits** sur les conteneurs
- **No root** dans les conteneurs
- **Secrets hors Git** (volume `secrets/` en read-only)
- **Nginx security headers** : X-Frame-Options, X-Content-Type-Options, XSS Protection

### Audit

- **MCP audit log** : journal de toutes les executions d'outils
- **Event Store V2** : replay complet des evenements de workflow
- **Error tracking** Sentry

---

## CI/CD

Le pipeline `.github/workflows/ci-cd.yml` s'execute sur push `main` et PR :

```
Lint → Typecheck → Test → Build → (Deploy)
```

| Stage | Outils | Role |
|-------|--------|------|
| **Lint** | Prettier, ESLint | Formattage et qualite du code |
| **Typecheck** | TypeScript (strict) | Verification des types |
| **Test** | Jest/Vitest, k6 | Tests unitaires + load testing |
| **Build** | Turborepo | Build parallele de tous les packages |
| **Deploy** | SSH + Docker | Deploiement automatique VPS |

---

## Contribution

### Guidelines

1. Fork le projet
2. Creer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

### Rapporter un Bug

Ouvrir une **Issue** avec :
- Description detaillee
- Steps to reproduce
- Logs pertinents
- Environnement (OS, versions)

---

## Contact & Support

**Createur** : Dieudonne MATANDA (ALTER EGO)

- **Email** : dieudonneematanda@gmail.com
- **WhatsApp** : +243 890 139 879
- **GitHub** : [AlterEgo095](https://github.com/AlterEgo095)

---

## Licence

MIT License - voir [LICENSE](LICENSE) pour plus de details.

---

<div align="center">

**Built with passion by ALTER EGO**

![Stargazers](https://img.shields.io/github/stars/AlterEgo095/AENEWSBUILDER?style=social)
![Forks](https://img.shields.io/github/forks/AlterEgo095/AENEWSBUILDER?style=social)

</div>
