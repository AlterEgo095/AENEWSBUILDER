# 🚀 AENEWS BUILDER — Guide de Déploiement VPS

Guide complet pour déployer AENEWS BUILDER sur un VPS (Ubuntu 22.04 LTS recommandé).

---

## 📋 Prérequis

### 1. Serveur VPS
- **OS** : Ubuntu 22.04 LTS ou plus récent
- **RAM** : Minimum 8 GB (16 GB recommandé)
- **CPU** : Minimum 4 cores
- **Stockage** : Minimum 50 GB SSD
- **Port ouvert** : 80 (HTTP), 443 (HTTPS)

> ⚠️ **Important** : Tous les autres ports (PostgreSQL 5432, Redis 6379, API 3001, Grafana 3000, Prometheus 9090) sont accessibles uniquement via le réseau Docker interne. Seul Nginx expose les ports 80/443 au public.

### 2. Nom de domaine (recommandé)
- Enregistré chez un registrar (Namecheap, GoDaddy, etc.)
- DNS A record pointant vers l'IP du VPS

### 3. Accès SSH
```bash
ssh root@VOTRE_IP_VPS
```

---

## 🛠️ Installation (Première fois)

### Étape 1 : Mise à jour du système

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential ca-certificates gnupg lsb-release software-properties-common
```

### Étape 2 : Installation de Docker

```bash
# Ajouter la clé GPG officielle de Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Configurer le repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Installer Docker Engine + Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Démarrer et activer Docker
sudo systemctl start docker
sudo systemctl enable docker

# Vérifier
docker --version
docker compose version
```

### Étape 3 : Configuration du Firewall (UFW)

```bash
# Réinitialiser UFW
sudo ufw --force reset

# Autoriser SSH (important : ne pas se bloquer!)
sudo ufw allow 22/tcp

# Autoriser HTTP et HTTPS (Nginx reverse proxy)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Refuser tout le reste par défaut
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Activer le firewall
sudo ufw --force enable

# Vérifier
sudo ufw status verbose
```

> ⚠️ **Règle** : Seuls les ports 22, 80, et 443 sont ouverts. PostgreSQL (5432), Redis (6379), API (3001), Grafana (3000), Prometheus (9090) sont tous inaccessibles de l'extérieur — ils communiquent uniquement via le réseau Docker interne `aenews_network`.

### Étape 4 : Créer un utilisateur dédié

```bash
# Créer l'utilisateur aenews
sudo useradd -m -s /bin/bash aenews

# Ajouter au groupe docker
sudo usermod -aG docker aenews

# Créer le dossier de déploiement
sudo mkdir -p /opt/aenews-builder
sudo chown -R aenews:aenews /opt/aenews-builder

# Passer à l'utilisateur aenews
sudo su - aenews
```

### Étape 5 : Cloner le repository

```bash
cd /opt/aenews-builder
git clone https://github.com/AlterEgo095/AENEWSBUILDER.git .
```

### Étape 6 : Configuration de l'environnement

```bash
# Copier le template de production
cp .env.production.example .env

# Éditer — RENSEIGNEZ TOUS LES CHAMPS REQUIRED
nano .env
```

**Champs obligatoires à remplir dans `.env`** :

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Clé API OpenAI (sk-proj-...) |
| `ANTHROPIC_API_KEY` | Clé API Anthropic (sk-ant-...) |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL (fort) |
| `REDIS_PASSWORD` | Mot de passe Redis (fort) |
| `JWT_SECRET` | Secret JWT (min 32 caractères) |
| `FRONTEND_URL` | URL de votre domaine (https://...) |
| `CORS_ORIGINS` | Origins autorisées (même domaine) |

### Étape 7 : Déploiement

```bash
# Exécuter le script de déploiement automatisé
./scripts/deploy.sh
```

Ce script effectue automatiquement :
1. Vérification des prérequis (Docker, .env)
2. Génération des clés JWT RS256 dans `secrets/`
3. Build des images Docker
4. Démarrage de PostgreSQL et Redis (avec health checks)
5. Exécution des migrations Prisma
6. Démarrage de tous les services
7. Vérification santé de l'API

---

## 🔒 Configuration SSL/TLS avec Let's Encrypt

### Étape 1 : Installer Certbot

```bash
# Retourner en root
exit

sudo apt install -y certbot python3-certbot-nginx

# Générer le certificat (remplacez VOTRE_DOMAINE.COM)
sudo certbot certonly --standalone -d VOTRE_DOMAINE.COM -d www.VOTRE_DOMAINE.COM
```

### Étape 2 : Configurer Nginx pour HTTPS

Éditer `/opt/aenews-builder/docker/nginx/nginx.conf` :

```nginx
events {
    worker_connections 1024;
}

http {
    upstream api {
        server api:3001;
    }

    upstream studio {
        server studio:5173;
    }

    upstream admin {
        server admin:5174;
    }

    upstream grafana {
        server grafana:3000;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=general_limit:10m rate=30r/s;

    # HTTPS Server
    server {
        listen 443 ssl http2;
        server_name VOTRE_DOMAINE.COM www.VOTRE_DOMAINE.COM;

        # SSL Certificates (Let's Encrypt)
        ssl_certificate /etc/letsencrypt/live/VOTRE_DOMAINE.COM/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/VOTRE_DOMAINE.COM/privkey.pem;

        # SSL Hardening
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 1d;

        # Security headers
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "no-referrer-when-downgrade" always;

        # API
        location /api {
            limit_req zone=api_limit burst=20 nodelay;

            proxy_pass http://api;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # SSE Streaming
        location /api/stream {
            proxy_pass http://api;
            proxy_http_version 1.1;
            proxy_set_header Connection '';
            proxy_buffering off;
            proxy_cache off;
            proxy_read_timeout 24h;
        }

        # Prometheus Metrics (internal only)
        location /metrics {
            proxy_pass http://api;
            allow 127.0.0.1;
            allow 10.0.0.0/8;
            allow 172.16.0.0/12;
            deny all;
        }

        # Admin Dashboard
        location /admin {
            limit_req zone=general_limit burst=50 nodelay;

            proxy_pass http://admin;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Grafana Monitoring (optional, protect with basic auth)
        # location /grafana {
        #     auth_basic "Grafana";
        #     auth_basic_user_file /etc/nginx/.htpasswd-grafana;
        #     proxy_pass http://grafana;
        #     proxy_set_header Host $host;
        #     proxy_set_header X-Real-IP $remote_addr;
        # }

        # Frontend Studio (default)
        location / {
            limit_req zone=general_limit burst=50 nodelay;

            proxy_pass http://studio;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }

    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name VOTRE_DOMAINE.COM www.VOTRE_DOMAINE.COM;
        return 301 https://$server_name$request_uri;
    }
}
```

### Étape 3 : Monter les certificats SSL dans docker-compose

Ajoutez ces volumes au service nginx dans `docker-compose.yml` :

```yaml
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
```

### Étape 4 : Redémarrer Nginx

```bash
sudo su - aenews
cd /opt/aenews-builder
docker compose restart nginx
```

### Étape 5 : Auto-renouvellement SSL (cron)

Les certificats Let's Encrypt expirent tous les 90 jours. Ajoutez un cron :

```bash
# Tester le renouvellement
sudo certbot renew --dry-run

# Ajouter au cron (2x par jour)
(sudo crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'docker exec aenews-nginx nginx -s reload'") | sudo crontab -
```

---

## 📊 Monitoring et Maintenance

### Accéder aux services

| Service | URL | Accès |
|---------|-----|-------|
| Studio | `https://yourdomain.com` | Public |
| Admin | `https://yourdomain.com/admin` | Public |
| API | `https://yourdomain.com/api/health` | Via Nginx |
| Grafana | SSH tunnel uniquement | `ssh -L 3000:localhost:3000 user@vps` |
| Prometheus | SSH tunnel uniquement | `ssh -L 9090:localhost:9090 user@vps` |

### Vérifier la santé

```bash
# Status de tous les conteneurs
docker compose ps

# Logs en temps réel
docker compose logs -f api
docker compose logs -f nginx

# Health check API
curl -s https://yourdomain.com/api/health | jq .

# Health check détaillé
curl -s https://yourdomain.com/api/health/detailed | jq .
```

### Sauvegardes automatiques

```bash
# Créer un script de backup
cat > /opt/aenews-builder/scripts/backup.sh << 'EOF'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/aenews-builder/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker compose exec -T postgres pg_dump -U aenews aenews_builder | gzip > "$BACKUP_DIR/postgres_$DATE.sql.gz"

# Backup Redis
docker compose exec -T redis redis-cli --rdb - > "$BACKUP_DIR/redis_$DATE.rdb" 2>/dev/null || \
docker compose exec -T -e REDISCLI_AUTH="${REDIS_PASSWORD:-aenews_redis_secure_password}" redis redis-cli BGSAVE

# Supprimer les backups de plus de 7 jours
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.rdb" -mtime +7 -delete

echo "✅ Backup completed: $DATE ($(du -sh $BACKUP_DIR | cut -f1))"
EOF

chmod +x /opt/aenews-builder/scripts/backup.sh

# Cron quotidien à 2h du matin
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/aenews-builder/scripts/backup.sh >> /opt/aenews-builder/backups/backup.log 2>&1") | crontab -
```

### Mise à jour

```bash
# Utiliser le script d'update (build avant stop = zero-downtime)
cd /opt/aenews-builder
./scripts/update.sh
```

Le script `update.sh` effectue :
1. `git pull origin main`
2. Build des nouvelles images (sans arrêter les anciennes)
3. Redémarrage avec les nouvelles images
4. Exécution des migrations Prisma
5. Health check automatique
6. Rollback automatique en cas d'échec

### Nettoyer l'espace disque

```bash
# Supprimer les images Docker inutilisées
docker system prune -af

# Supprimer les volumes inutilisés
docker volume prune -f

# Voir l'utilisation du disque
docker system df
```

---

## 🔥 Dépannage

### Les conteneurs ne démarrent pas

```bash
# Vérifier les logs détaillés
docker compose logs api
docker compose logs postgres
docker compose logs redis
docker compose logs nginx

# Redémarrer tous les services
docker compose down
docker compose up -d
```

### Erreur de connexion PostgreSQL

```bash
# Vérifier que PostgreSQL est démarré
docker compose ps postgres

# Tester la connexion
docker compose exec postgres psql -U aenews -d aenews_builder -c "SELECT 1;"

# Réinitialiser la DB (supprime toutes les données)
docker compose down -v
docker compose up -d postgres redis
sleep 10
docker compose run --rm api npx prisma migrate deploy
```

### Erreur de connexion Redis

```bash
docker compose exec -e REDISCLI_AUTH=YOUR_PASSWORD redis redis-cli ping
```

### Problèmes de performances

```bash
# Utilisation des ressources par conteneur
docker stats

# Redémarrer Redis pour vider le cache
docker compose restart redis

# Nettoyer les logs Docker
sudo sh -c "truncate -s 0 /var/lib/docker/containers/*/*-json.log"
```

### Erreur SSL / Nginx

```bash
# Vérifier la config Nginx
docker compose exec nginx nginx -t

# Voir les logs Nginx
docker compose logs nginx

# Tester le certificat SSL
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com </dev/null 2>/dev/null | openssl x509 -noout -dates
```

---

## 🚀 CI/CD Automatique (GitHub Actions)

Le déploiement peut être automatisé via GitHub Actions. Configurez ces secrets dans votre repo GitHub :

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | IP de votre VPS |
| `VPS_USER` | Utilisateur VPS (ex: `aenews`) |
| `VPS_SSH_KEY` | Clé privée SSH (contenu de `~/.ssh/id_rsa`) |

Quand vous poussez sur `main`, le pipeline s'exécute automatiquement :
1. **Lint + TypeCheck** → Vérification du code
2. **Build** → Compilation de tous les packages
3. **Test** → Tests avec PostgreSQL + Redis containers
4. **Deploy** → SSH vers le VPS, pull, build, restart, health check

---

## 🎯 Checklist Post-Déploiement

- [ ] Docker et Docker Compose installés
- [ ] Firewall UFW configuré (22, 80, 443 uniquement)
- [ ] Repository cloné dans `/opt/aenews-builder`
- [ ] Fichier `.env` configuré avec toutes les clés required
- [ ] Script `./scripts/deploy.sh` exécuté avec succès
- [ ] Tous les services actifs (`docker compose ps`)
- [ ] API accessible : `curl https://yourdomain.com/api/health`
- [ ] Studio accessible : `https://yourdomain.com`
- [ ] Admin accessible : `https://yourdomain.com/admin`
- [ ] SSL/TLS configuré avec Let's Encrypt
- [ ] Auto-renewal SSL configuré (cron)
- [ ] Sauvegardes automatiques configurées (cron)
- [ ] Monitoring via SSH tunnel (Grafana + Prometheus)
- [ ] GitHub Actions secrets configurés (CI/CD auto)

---

## 📞 Support

**Créé par** : Dieudonné MATANDA (ALTER EGO)
**Email** : dieudonneematanda@gmail.com
**WhatsApp** : +243 890 139 879
**GitHub** : https://github.com/AlterEgo095
