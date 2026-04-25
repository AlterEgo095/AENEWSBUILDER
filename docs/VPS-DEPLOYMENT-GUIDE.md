# 🚀 AENEWS BUILDER — Guide de Déploiement VPS

Guide complet pour déployer AENEWS BUILDER sur un VPS (Ubuntu 22.04 LTS recommandé).

---

## 📋 Prérequis

### 1. Serveur VPS
- **OS** : Ubuntu 22.04 LTS ou plus récent
- **RAM** : Minimum 8 GB (16 GB recommandé)
- **CPU** : Minimum 4 cores
- **Stockage** : Minimum 50 GB SSD
- **Ports ouverts** : 80, 443, 3000, 5173, 6379, 5432

### 2. Nom de domaine (optionnel mais recommandé)
- Enregistré chez un registrar (Namecheap, GoDaddy, etc.)
- DNS pointant vers l'IP du VPS

### 3. Accès SSH
```bash
ssh root@VOTRE_IP_VPS
```

---

## 🛠️ Installation (Première fois)

### Étape 1 : Mise à jour du système

```bash
# Mise à jour des paquets
sudo apt update && sudo apt upgrade -y

# Installation des dépendances de base
sudo apt install -y curl git build-essential ca-certificates gnupg lsb-release
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

# Installer Docker Engine
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Démarrer Docker
sudo systemctl start docker
sudo systemctl enable docker

# Vérifier l'installation
docker --version
docker compose version
```

### Étape 3 : Créer un utilisateur dédié

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

### Étape 4 : Cloner le repository

```bash
cd /opt/aenews-builder

# Cloner depuis GitHub
git clone https://github.com/AlterEgo095/AENEWSBUILDER.git .

# Vérifier les fichiers
ls -la
```

### Étape 5 : Configuration de l'environnement

```bash
# Copier le fichier d'exemple
cp .env.example .env

# Éditer avec nano ou vim
nano .env
```

**Configuration `.env` complète** :

```env
# ============================================
# Database Configuration
# ============================================
DATABASE_URL="postgresql://aenews:VOTRE_MOT_DE_PASSE@postgres:5432/aenews_db?schema=public"
POSTGRES_USER=aenews
POSTGRES_PASSWORD=VOTRE_MOT_DE_PASSE_SECURISE
POSTGRES_DB=aenews_db

# ============================================
# Redis Configuration
# ============================================
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=VOTRE_REDIS_PASSWORD

# ============================================
# JWT Configuration
# ============================================
JWT_SECRET=VOTRE_JWT_SECRET_ULTRA_SECURISE
JWT_EXPIRES_IN=7d

# ============================================
# API Keys - AI Providers
# ============================================
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...

# ============================================
# MCP Tool API Keys (Optionnel)
# ============================================
FIGMA_API_KEY=figd_...
NOTION_API_KEY=secret_...
VERCEL_API_TOKEN=...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
RAILWAY_API_TOKEN=...
REPLICATE_API_TOKEN=r8_...

# ============================================
# Monitoring (Optionnel)
# ============================================
SENTRY_DSN=https://...@sentry.io/...
SENTRY_ENVIRONMENT=production

# ============================================
# Application Configuration
# ============================================
NODE_ENV=production
PORT=3000
FRONTEND_URL=http://VOTRE_DOMAINE.COM
API_URL=http://VOTRE_DOMAINE.COM/api

# ============================================
# Security
# ============================================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CORS_ORIGIN=http://VOTRE_DOMAINE.COM
```

### Étape 6 : Générer les clés JWT RS256

```bash
# Créer le dossier keys
mkdir -p keys

# Générer la paire de clés RSA
ssh-keygen -t rsa -b 4096 -m PEM -f keys/jwtRS256.key -N ""
openssl rsa -in keys/jwtRS256.key -pubout -outform PEM -out keys/jwtRS256.key.pub

# Vérifier les clés
ls -la keys/
```

### Étape 7 : Initialiser la base de données

```bash
# Démarrer uniquement PostgreSQL
docker compose up -d postgres

# Attendre que PostgreSQL soit prêt (environ 10 secondes)
sleep 10

# Exécuter les migrations Prisma
docker compose run --rm api npx prisma migrate deploy
docker compose run --rm api npx prisma generate
```

### Étape 8 : Démarrer tous les services

```bash
# Construire et démarrer tous les conteneurs
docker compose up -d --build

# Vérifier les logs
docker compose logs -f

# Vérifier que tous les services sont actifs
docker compose ps
```

---

## 🔒 Configuration SSL/TLS avec Let's Encrypt

### Étape 1 : Installer Certbot

```bash
# Retour en root
exit

# Installer Certbot
sudo apt install -y certbot python3-certbot-nginx

# Générer le certificat
sudo certbot --nginx -d VOTRE_DOMAINE.COM -d www.VOTRE_DOMAINE.COM
```

### Étape 2 : Configuration Nginx pour HTTPS

Éditer `/opt/aenews-builder/docker/nginx/nginx.conf` :

```nginx
server {
    listen 443 ssl http2;
    server_name VOTRE_DOMAINE.COM;

    ssl_certificate /etc/letsencrypt/live/VOTRE_DOMAINE.COM/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/VOTRE_DOMAINE.COM/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # API Proxy
    location /api {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend
    location / {
        proxy_pass http://studio:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}

server {
    listen 80;
    server_name VOTRE_DOMAINE.COM;
    return 301 https://$server_name$request_uri;
}
```

Redémarrer Nginx :

```bash
sudo su - aenews
cd /opt/aenews-builder
docker compose restart nginx
```

---

## 📊 Monitoring et Maintenance

### Vérifier la santé des services

```bash
# Vérifier tous les conteneurs
docker compose ps

# Logs en temps réel
docker compose logs -f api

# Vérifier l'API
curl http://localhost:3000/api/health
```

### Sauvegardes automatiques

```bash
# Créer un script de backup
cat > /opt/aenews-builder/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/aenews-builder/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker compose exec -T postgres pg_dump -U aenews aenews_db | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# Backup Redis
docker compose exec -T redis redis-cli --rdb $BACKUP_DIR/redis_$DATE.rdb

# Supprimer les backups de plus de 7 jours
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.rdb" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /opt/aenews-builder/backup.sh

# Ajouter au cron (tous les jours à 2h du matin)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/aenews-builder/backup.sh") | crontab -
```

### Mise à jour du système

```bash
cd /opt/aenews-builder

# Pull les dernières modifications
git pull origin main

# Rebuild et redémarrer
docker compose up -d --build

# Nettoyer les images inutilisées
docker system prune -af
```

---

## 🔥 Dépannage

### Les conteneurs ne démarrent pas

```bash
# Vérifier les logs détaillés
docker compose logs api
docker compose logs postgres
docker compose logs redis

# Redémarrer tous les services
docker compose down
docker compose up -d --build
```

### Erreur de connexion PostgreSQL

```bash
# Vérifier que PostgreSQL est démarré
docker compose ps postgres

# Tester la connexion
docker compose exec postgres psql -U aenews -d aenews_db -c "SELECT 1;"

# Réinitialiser la DB (⚠️ ATTENTION: supprime toutes les données)
docker compose down -v
docker compose up -d postgres
sleep 10
docker compose run --rm api npx prisma migrate deploy
```

### Problèmes de performances

```bash
# Vérifier l'utilisation des ressources
docker stats

# Redémarrer Redis pour vider le cache
docker compose restart redis

# Nettoyer les logs Docker
sudo sh -c "truncate -s 0 /var/lib/docker/containers/*/*-json.log"
```

---

## 📞 Support

**Créé par** : Dieudonné MATANDA (ALTER EGO)  
**Email** : dieudonneematanda@gmail.com  
**WhatsApp** : +243 890 139 879  
**GitHub** : https://github.com/AlterEgo095

---

## 🎯 Checklist post-déploiement

- [ ] Docker et Docker Compose installés
- [ ] Repository cloné dans `/opt/aenews-builder`
- [ ] Fichier `.env` configuré avec toutes les clés
- [ ] Clés JWT RS256 générées
- [ ] Base de données PostgreSQL initialisée
- [ ] Migrations Prisma exécutées
- [ ] Tous les services démarrés (`docker compose ps`)
- [ ] API accessible sur `http://VPS_IP:3000/api/health`
- [ ] Frontend accessible sur `http://VPS_IP:5173`
- [ ] SSL/TLS configuré avec Let's Encrypt
- [ ] Sauvegardes automatiques configurées
- [ ] Monitoring Grafana accessible sur `http://VPS_IP:3001`
- [ ] GitHub Actions secrets configurés

**Félicitations ! 🎉 AENEWS BUILDER est maintenant en production.**
