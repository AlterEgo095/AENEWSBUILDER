# 📋 POST-DEPLOYMENT INSTRUCTIONS

## ✅ Code Successfully Pushed to GitHub!

Repository: **https://github.com/AlterEgo095/AENEWSBUILDER**

---

## 🔧 ÉTAPES SUIVANTES (IMPORTANTES!)

### 1️⃣ Ajouter le Workflow CI/CD Manuellement

Le workflow GitHub Actions n'a pas pu être pushé automatiquement car le token n'a pas le scope `workflow`.

**Solution :**

1. Aller sur GitHub : https://github.com/AlterEgo095/AENEWSBUILDER
2. Créer le fichier manuellement :
   - Cliquer sur "Add file" → "Create new file"
   - Nom du fichier : `.github/workflows/ci-cd.yml`
   - Copier le contenu depuis le fichier local (voir ci-dessous)
   - Commit

**Contenu du workflow :**

```yaml
name: AENEWS Builder CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    name: Lint & Test
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm build

  security:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/secrets
            p/owasp-top-ten

  build:
    name: Build Docker Images
    runs-on: ubuntu-latest
    needs: [test, security]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: ./apps/api/Dockerfile
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/api:latest

  deploy:
    name: Deploy to VPS
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.VPS_SSH_KEY }}
      - run: |
          ssh-keyscan -H ${{ secrets.VPS_HOST }} >> ~/.ssh/known_hosts
          scp docker-compose.yml ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }}:${{ secrets.VPS_DEPLOY_PATH }}/
          ssh ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'EOF'
            cd ${{ secrets.VPS_DEPLOY_PATH }}
            docker-compose pull
            docker-compose up -d --remove-orphans
          EOF
```

---

### 2️⃣ Configurer les Secrets GitHub

**Important pour le CI/CD !**

Aller sur : **Settings → Secrets and variables → Actions → New repository secret**

Ajouter ces secrets :

```
VPS_HOST          → Votre IP VPS ou domaine
VPS_USER          → Utilisateur SSH (ex: aenews)
VPS_SSH_KEY       → Votre clé privée SSH complète
VPS_DEPLOY_PATH   → Chemin de déploiement (ex: /opt/aenews-builder)
```

**Générer une clé SSH dédiée :**

```bash
ssh-keygen -t ed25519 -C "github-actions-aenews" -f ~/.ssh/aenews_deploy
# Copier la clé publique sur le VPS
ssh-copy-id -i ~/.ssh/aenews_deploy.pub user@your-vps
# Copier la clé privée dans GitHub Secrets (VPS_SSH_KEY)
cat ~/.ssh/aenews_deploy
```

---

### 3️⃣ Préparer le VPS

**Sur votre VPS :**

```bash
# Connexion SSH
ssh root@your-vps-ip

# Créer l'utilisateur dédié
useradd -m -s /bin/bash aenews
usermod -aG docker aenews

# Créer le dossier de déploiement
mkdir -p /opt/aenews-builder
chown aenews:aenews /opt/aenews-builder

# Se connecter en tant qu'utilisateur aenews
su - aenews
cd /opt/aenews-builder

# Cloner le repository
git clone https://github.com/AlterEgo095/AENEWSBUILDER.git .

# Copier et configurer .env
cp .env.example .env
nano .env  # IMPORTANT: Remplir toutes les variables!
```

---

### 4️⃣ Générer les Clés JWT

**Sur le VPS :**

```bash
cd /opt/aenews-builder

# Créer le dossier secrets
mkdir -p secrets

# Générer les clés RSA
openssl genrsa -out secrets/jwt-private.pem 2048
openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem

# Sécuriser les permissions
chmod 600 secrets/jwt-private.pem
chmod 644 secrets/jwt-public.pem
```

---

### 5️⃣ Configurer le Fichier .env

**Variables CRITIQUES à remplir :**

```env
# API Keys (OBLIGATOIRES)
OPENAI_API_KEY=sk-your-actual-openai-key
ANTHROPIC_API_KEY=sk-ant-your-actual-anthropic-key

# Database
DATABASE_URL=postgresql://aenews:CHANGE_THIS_PASSWORD@localhost:5432/aenews_builder

# Redis
REDIS_PASSWORD=CHANGE_THIS_REDIS_PASSWORD

# JWT
JWT_SECRET=generate-a-64-char-random-string-here

# Admin User
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD=choose-secure-admin-password

# Frontend
FRONTEND_URL=http://your-domain.com
CORS_ORIGINS=http://your-domain.com,https://your-domain.com
```

**Générer un JWT_SECRET sécurisé :**

```bash
openssl rand -base64 48
```

---

### 6️⃣ Premier Déploiement

```bash
cd /opt/aenews-builder

# Lancer l'infrastructure
docker-compose up -d postgres redis

# Attendre que PostgreSQL soit prêt
sleep 10

# Générer Prisma Client
docker-compose run --rm api npx prisma generate

# Créer les tables
docker-compose run --rm api npx prisma migrate deploy

# Démarrer tous les services
docker-compose up -d

# Vérifier les logs
docker-compose logs -f
```

---

### 7️⃣ Configurer Nginx + SSL (Optionnel mais Recommandé)

**Installer Nginx et Certbot :**

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# Créer la config Nginx
sudo nano /etc/nginx/sites-available/aenews
```

**Contenu :**

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Activer et obtenir SSL :**

```bash
# Activer le site
sudo ln -s /etc/nginx/sites-available/aenews /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtenir certificat SSL
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

---

### 8️⃣ Vérification Finale

**Tester les endpoints :**

```bash
# Health check
curl http://your-vps-ip/api/health

# Devrait retourner:
# {"status":"healthy","timestamp":"...","services":{"api":"up","redis":"up","database":"up"}}
```

**Ouvrir dans le navigateur :**

- Frontend : `http://your-domain.com`
- API Health : `http://your-domain.com/api/health`
- Grafana : `http://your-domain.com:3000` (admin / admin)
- Prometheus : `http://your-domain.com:9090`

---

### 9️⃣ Monitoring & Logs

**Commandes utiles :**

```bash
# Voir les logs en temps réel
docker-compose logs -f

# Logs d'un service spécifique
docker-compose logs -f api

# Status des conteneurs
docker-compose ps

# Redémarrer un service
docker-compose restart api

# Voir l'utilisation des ressources
docker stats
```

---

### 🔟 Backup Automatique (Recommandé)

**Créer un script de backup :**

```bash
nano /opt/aenews-builder/scripts/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/aenews-backups"
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker-compose exec -T postgres pg_dump -U aenews aenews_builder > $BACKUP_DIR/db_$DATE.sql

# Backup Redis
docker-compose exec -T redis redis-cli --rdb /data/dump.rdb SAVE
cp /var/lib/docker/volumes/aenews-builder_redis_data/_data/dump.rdb $BACKUP_DIR/redis_$DATE.rdb

# Nettoyer les backups > 7 jours
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.rdb" -mtime +7 -delete
```

**Ajouter au crontab :**

```bash
chmod +x /opt/aenews-builder/scripts/backup.sh
crontab -e

# Ajouter cette ligne (backup quotidien à 3h du matin)
0 3 * * * /opt/aenews-builder/scripts/backup.sh
```

---

## 🎉 FÉLICITATIONS !

Votre **AENEWS BUILDER v3.0** est maintenant déployé !

### 📞 Support

En cas de problème :

- 📧 **Email** : dieudonneematanda@gmail.com
- 📱 **WhatsApp** : +243 890 139 879
- 🔗 **GitHub Issues** : https://github.com/AlterEgo095/AENEWSBUILDER/issues

---

## 📚 Prochaines Étapes (Roadmap)

- [ ] Implémenter le frontend Studio complet
- [ ] Ajouter plus de MCP tools (GitHub, Linear, Stripe)
- [ ] Intégration Sentry pour monitoring erreurs
- [ ] Dashboard analytics temps réel
- [ ] API rate limiting par utilisateur
- [ ] Multi-tenancy
- [ ] Marketplace de templates

---

**⚡ Built with passion by Dieudonné MATANDA (ALTER EGO) ⚡**
