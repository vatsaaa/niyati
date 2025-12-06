# Production Deployment Guide - Step by Step

A complete guide for deploying Niyati to production, designed for complete beginners.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Step 1: Prepare nginx Configuration](#step-1-prepare-nginx-configuration)
- [Step 2: Create Production Environment Files](#step-2-create-production-environment-files)
- [Step 3: Create Production Docker Compose](#step-3-create-production-docker-compose)
- [Step 4: Update nginx for Production](#step-4-update-nginx-for-production)
- [Step 5: Build and Test Locally](#step-5-build-and-test-locally)
- [Step 6: Deploy to Production Server](#step-6-deploy-to-production-server)
- [Step 7: Set Up Domain and SSL](#step-7-set-up-domain-and-ssl-optional-but-recommended)
- [Step 8: Monitor and Maintain](#step-8-monitor-and-maintain)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:
- Docker and Docker Compose installed on your local machine
- A production server (VPS, cloud instance, etc.) with at least:
  - 2GB RAM
  - 2 CPU cores
  - 20GB storage
- Domain name (optional, can use IP address)
- SSH access to your production server

---

## Step 1: Prepare nginx Configuration

Move the nginx configuration file to the correct location:

```bash
cd /Users/ankur/projects/niyati
mv nginx.conf ui/nginx.conf
```

**Why?** The UI Dockerfile expects `nginx.conf` to be in the `ui/` directory during the production build.

---

## Step 2: Create Production Environment Files

### 2a. Create BFF Production Environment File

Create `.env.bff.production` in the project root:

```bash
cd /Users/ankur/projects/niyati
cat > .env.bff.production << 'EOF'
# BFF Production Environment Variables

# Server Configuration
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Logging
LOG_LEVEL=info
LOG_PRETTY_PRINT=false

# CORS - UPDATE WITH YOUR PRODUCTION DOMAIN
CORS_ORIGIN=https://yourdomain.com

# External APIs
GEOCODING_API_URL=https://geocode.maps.co/search
ASTROLOGY_API_URL=https://api.freeastrologyapi.com
ASTROLOGY_API_KEY=your-production-api-key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF
```

**Important:** Update these values:
- `CORS_ORIGIN`: Your production domain
- `ASTROLOGY_API_KEY`: Your production API key

### 2b. Create UI Production Environment File

Create `.env.ui.production` in the project root:

```bash
cat > .env.ui.production << 'EOF'
# UI Production Environment Variables

NODE_ENV=production

# API Endpoints - UPDATE WITH YOUR PRODUCTION URLS
VITE_BFF_BASE_URL=https://api.yourdomain.com
VITE_N8N_WEBHOOK_URL=https://your-n8n-url.com/webhook/chat

# Feature Flags
VITE_DEBUG_MODE=false
VITE_VERBOSE_LOGGING=false
EOF
```

**Important:** Update these values:
- `VITE_BFF_BASE_URL`: Your BFF API URL
- `VITE_N8N_WEBHOOK_URL`: Your N8N webhook URL

---

## Step 3: Create Production Docker Compose

Create `docker-compose.prod.yml` in the project root:

```bash
cat > docker-compose.prod.yml << 'EOF'
# Docker Compose for Niyati - Production Environment
# Usage: docker-compose -f docker-compose.prod.yml up -d

services:
  # BFF Service (Backend for Frontend) - Production
  bff-service:
    build:
      context: ./be/bff
      dockerfile: Dockerfile
      target: production
    container_name: niyati-bff-prod
    ports:
      - "3000:3000"
    env_file:
      - .env.bff.production
    environment:
      - NODE_ENV=production
      - LOG_PRETTY_PRINT=false
    networks:
      - niyati-prod
    restart: always
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/v1/telemetry/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # UI Service (React Frontend) - Production with Nginx
  ui-service:
    build:
      context: ./ui
      dockerfile: Dockerfile
      target: production
    container_name: niyati-ui-prod
    ports:
      - "80:80"
    env_file:
      - .env.ui.production
    environment:
      - NODE_ENV=production
    networks:
      - niyati-prod
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    depends_on:
      - bff-service

networks:
  niyati-prod:
    driver: bridge
    name: niyati-prod
EOF
```

**What this does:**
- Uses production build targets from Dockerfiles
- Exposes port 80 for UI (nginx)
- Exposes port 3000 for BFF
- Sets up health checks for both services
- Configures automatic restart on failure

---

## Step 4: Update nginx for Production

Edit `ui/nginx.conf` to enable API proxying (optional but recommended).

Find this commented section (around line 96):

```nginx
# API proxy (if BFF is on same network)
# Uncomment if you want nginx to proxy API requests
# location /api/ {
#     proxy_pass http://bff-service:3000;
```

**Uncomment it** to look like this:

```nginx
# API proxy to BFF service
location /api/ {
    proxy_pass http://bff-service:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

**Why?** This allows the UI to make API requests through nginx instead of directly to the BFF, simplifying CORS and providing better security.

---

## Step 5: Build and Test Locally

Before deploying to production, test the production build on your local machine.

### 5a. Stop Development Containers

```bash
cd /Users/ankur/projects/niyati
docker-compose down
```

### 5b. Build Production Images

```bash
docker-compose -f docker-compose.prod.yml build
```

**What happens:**
- UI: React app is built with Vite (`npm run build`)
- UI: Static files are copied to nginx container
- BFF: Production dependencies are installed
- Both: Non-root users are created for security

This may take 5-10 minutes on first build.

### 5c. Start Production Containers Locally

```bash
docker-compose -f docker-compose.prod.yml up -d
```

**Expected output:**
```
[+] Running 2/2
 ✔ Container niyati-bff-prod  Started
 ✔ Container niyati-ui-prod   Started
```

### 5d. Check Logs

```bash
docker-compose -f docker-compose.prod.yml logs -f
```

**Look for:**
- BFF: "Server listening on port 3000"
- UI: nginx access logs
- No error messages

Press `Ctrl+C` to stop viewing logs.

### 5e. Test the Application

Open your browser and navigate to:
- **UI:** http://localhost
- **BFF Health:** http://localhost:3000/api/v1/telemetry/health

You should see:
- Your app running normally
- Production-optimized assets (check Network tab in DevTools)
- Smaller bundle sizes compared to development

### 5f. Stop Local Production Test

```bash
docker-compose -f docker-compose.prod.yml down
```

### 5g. Restart Development Environment

```bash
docker-compose up -d
```

---

## Step 6: Deploy to Production Server

### Option A: Deploy to VPS (DigitalOcean, AWS EC2, Linode, etc.)

#### On Your Local Machine

**1. Package Your Code**

```bash
cd /Users/ankur/projects/niyati

# Create deployment archive
tar -czf niyati-deploy.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=dist \
  --exclude=be/bff/node_modules \
  --exclude=ui/node_modules \
  .
```

**2. Copy to Server**

```bash
# Replace with your server details
scp niyati-deploy.tar.gz user@your-server-ip:/home/user/
```

#### On Your Production Server

**3. SSH into Server**

```bash
ssh user@your-server-ip
```

**4. Install Docker (if not installed)**

```bash
# Update package index
sudo apt update

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (to run docker without sudo)
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version

# Log out and back in for group changes to take effect
exit
```

**5. SSH Back In and Extract Application**

```bash
# SSH back into server
ssh user@your-server-ip

# Create application directory
mkdir -p ~/niyati
cd ~/niyati

# Extract deployment archive
tar -xzf ~/niyati-deploy.tar.gz
```

**6. Update Environment Files**

```bash
# Edit BFF production environment
nano .env.bff.production
```

Update these values:
- `CORS_ORIGIN`: Your domain (e.g., https://niyati.example.com)
- `ASTROLOGY_API_KEY`: Your production API key

```bash
# Edit UI production environment
nano .env.ui.production
```

Update these values:
- `VITE_BFF_BASE_URL`: Your BFF URL (e.g., https://api.niyati.example.com)
- `VITE_N8N_WEBHOOK_URL`: Your N8N webhook URL

**7. Build and Start Application**

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps
```

**Expected output:**
```
NAME                IMAGE                  STATUS         PORTS
niyati-bff-prod     niyati-bff-service     Up (healthy)   0.0.0.0:3000->3000/tcp
niyati-ui-prod      niyati-ui-service      Up (healthy)   0.0.0.0:80->80/tcp
```

**8. Check Logs**

```bash
docker-compose -f docker-compose.prod.yml logs -f
```

Look for successful startup messages, then press `Ctrl+C`.

**9. Configure Firewall**

```bash
# Allow HTTP traffic
sudo ufw allow 80/tcp

# Allow HTTPS traffic (for later SSL setup)
sudo ufw allow 443/tcp

# Allow SSH (IMPORTANT: Don't lock yourself out!)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

**10. Test Your Application**

Open browser and navigate to `http://your-server-ip`

You should see your application running!

---

### Option B: Deploy to Cloud Platforms

For detailed instructions on deploying to:
- **AWS (Elastic Beanstalk, ECS, EC2)**
- **Google Cloud Platform (Cloud Run, GKE, Compute Engine)**
- **Azure (App Service, Container Instances)**
- **DigitalOcean App Platform**

See the **PRODUCTION.md** file in your project root.

---

## Step 7: Set Up Domain and SSL (Optional but Recommended)

### 7a. Point Domain to Your Server

1. Go to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)
2. Access DNS settings
3. Add/Update DNS records:

**For single domain setup:**
```
Type: A
Name: @
Value: your-server-ip
TTL: 3600
```

**For separate API subdomain:**
```
Type: A
Name: @
Value: your-server-ip

Type: A
Name: api
Value: your-server-ip
```

4. Wait for DNS propagation (can take 5 minutes to 48 hours)
5. Test: `ping yourdomain.com`

### 7b. Install SSL Certificate with Let's Encrypt

**On your production server:**

```bash
# Install certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx -y

# Stop nginx container temporarily
cd ~/niyati
docker-compose -f docker-compose.prod.yml stop ui-service

# Obtain SSL certificate
sudo certbot certonly --standalone -d yourdomain.com -d api.yourdomain.com

# Follow the prompts:
# - Enter email address
# - Agree to terms of service
# - Choose whether to share email with EFF

# Certificates will be saved at:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

**Set up automatic renewal:**

```bash
# Test renewal process
sudo certbot renew --dry-run

# Certbot automatically sets up a cron job for renewal
# Verify with:
sudo systemctl status certbot.timer
```

### 7c. Update nginx Configuration for HTTPS

**On your local machine,** edit `ui/nginx.conf`:

Add this **new server block** at the end, before the closing `}` of the `http` block:

```nginx
    # HTTPS server block
    server {
        listen 443 ssl http2;
        server_name yourdomain.com;
        root /usr/share/nginx/html;
        index index.html;

        # SSL Configuration
        ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "no-referrer-when-downgrade" always;
        add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline' 'unsafe-eval'" always;

        # Rate limiting
        limit_req zone=ui_limit burst=20 nodelay;

        # Root location - serve index.html
        location / {
            try_files $uri $uri/ /index.html;
            
            # Cache control for HTML (no cache)
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header Pragma "no-cache";
            add_header Expires "0";
        }

        # Static assets with versioning (cache aggressively)
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            access_log off;
        }

        # JSON files (moderate caching)
        location ~* \.json$ {
            expires 1h;
            add_header Cache-Control "public";
        }

        # API proxy to BFF service
        location /api/ {
            proxy_pass http://bff-service:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        # Deny access to hidden files
        location ~ /\. {
            deny all;
            access_log off;
            log_not_found off;
        }

        # Custom error pages
        error_page 404 /index.html;
        error_page 500 502 503 504 /index.html;
    }

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name yourdomain.com;
        return 301 https://$server_name$request_uri;
    }
```

**Replace** `yourdomain.com` with your actual domain in **both** server blocks.

### 7d. Update docker-compose.prod.yml to Mount SSL Certificates

Edit `docker-compose.prod.yml` and update the `ui-service` section:

```yaml
  ui-service:
    build:
      context: ./ui
      dockerfile: Dockerfile
      target: production
    container_name: niyati-ui-prod
    ports:
      - "80:80"
      - "443:443"  # Add HTTPS port
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro  # Mount SSL certificates as read-only
    env_file:
      - .env.ui.production
    environment:
      - NODE_ENV=production
    networks:
      - niyati-prod
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    depends_on:
      - bff-service
```

### 7e. Deploy Updated Configuration

**On your local machine:**

```bash
# Create new deployment archive
cd /Users/ankur/projects/niyati
tar -czf niyati-deploy-ssl.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=dist \
  --exclude=be/bff/node_modules \
  --exclude=ui/node_modules \
  .

# Copy to server
scp niyati-deploy-ssl.tar.gz user@your-server-ip:/home/user/
```

**On your production server:**

```bash
# Backup current deployment
cd ~/niyati
cp docker-compose.prod.yml docker-compose.prod.yml.backup
cp ui/nginx.conf ui/nginx.conf.backup

# Extract new configuration
tar -xzf ~/niyati-deploy-ssl.tar.gz

# Rebuild UI service with new nginx config
docker-compose -f docker-compose.prod.yml build ui-service

# Restart services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs ui-service
```

### 7f. Test HTTPS

Open browser and navigate to:
- `https://yourdomain.com` - Should work with valid SSL
- `http://yourdomain.com` - Should redirect to HTTPS

Check SSL certificate:
- Click the padlock icon in browser
- Certificate should be from "Let's Encrypt"
- Valid for 90 days

---

## Step 8: Monitor and Maintain

### Health Checks

**Check BFF health:**
```bash
curl http://localhost:3000/api/v1/telemetry/health
# Should return: {"status":"ok","timestamp":"...","uptime":...}
```

**Check UI health:**
```bash
curl http://localhost/health
# Should return: healthy
```

**Check from external:**
```bash
curl https://yourdomain.com/health
curl https://yourdomain.com/api/v1/telemetry/health
```

### View Logs

**All services:**
```bash
cd ~/niyati
docker-compose -f docker-compose.prod.yml logs -f
```

**Specific service:**
```bash
# BFF logs
docker-compose -f docker-compose.prod.yml logs -f bff-service

# UI logs
docker-compose -f docker-compose.prod.yml logs -f ui-service
```

**Last N lines:**
```bash
docker-compose -f docker-compose.prod.yml logs --tail=100 bff-service
```

**Save logs to file:**
```bash
docker-compose -f docker-compose.prod.yml logs > logs.txt
```

### Restart Services

**Restart all services:**
```bash
docker-compose -f docker-compose.prod.yml restart
```

**Restart specific service:**
```bash
docker-compose -f docker-compose.prod.yml restart bff-service
```

**Stop and start (full restart):**
```bash
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

### Update Application

**When you have new code:**

```bash
# On local machine - create deployment package
cd /Users/ankur/projects/niyati
git pull  # if using git
tar -czf niyati-update.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=dist \
  --exclude=be/bff/node_modules \
  --exclude=ui/node_modules \
  .

# Copy to server
scp niyati-update.tar.gz user@your-server-ip:/home/user/

# On production server
ssh user@your-server-ip
cd ~/niyati

# Backup current version
tar -czf niyati-backup-$(date +%Y%m%d-%H%M%S).tar.gz .

# Extract new version
tar -xzf ~/niyati-update.tar.gz

# Rebuild and restart
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Monitor Resource Usage

**Check container stats:**
```bash
docker stats
```

**Check disk usage:**
```bash
# Docker disk usage
docker system df

# Clean up old images/containers
docker system prune -a

# Server disk usage
df -h
```

**Check memory:**
```bash
free -h
```

**Check CPU:**
```bash
top
# Press 'q' to quit
```

### Backup

**Create full backup:**
```bash
cd ~/niyati
tar -czf ~/backups/niyati-backup-$(date +%Y%m%d).tar.gz .
```

**Backup database (if you add one later):**
```bash
# Example for MongoDB
docker exec niyati-db-prod mongodump --out=/backup
docker cp niyati-db-prod:/backup ~/backups/db-$(date +%Y%m%d)
```

### Security Updates

**Update system packages:**
```bash
sudo apt update
sudo apt upgrade -y
```

**Update Docker:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

**Renew SSL certificate:**
```bash
# Manual renewal
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run
```

---

## Troubleshooting

### Can't Access Application

**Problem:** Browser shows "Connection refused" or "This site can't be reached"

**Solutions:**

1. **Check if containers are running:**
   ```bash
   docker-compose -f docker-compose.prod.yml ps
   ```
   Both containers should show "Up (healthy)"

2. **Check firewall:**
   ```bash
   sudo ufw status
   ```
   Should show ports 80 and 443 as ALLOWED

3. **Check if ports are listening:**
   ```bash
   sudo netstat -tlnp | grep -E ':(80|3000|443)'
   ```

4. **Check logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs
   ```

5. **Restart services:**
   ```bash
   docker-compose -f docker-compose.prod.yml restart
   ```

### BFF Can't Reach External APIs

**Problem:** Geocoding or astrology features not working

**Solutions:**

1. **Check environment variables:**
   ```bash
   docker-compose -f docker-compose.prod.yml exec bff-service printenv | grep API
   ```

2. **Test API manually:**
   ```bash
   curl "https://geocode.maps.co/search?q=New+York"
   curl "https://api.freeastrologyapi.com/health"
   ```

3. **Check BFF logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs bff-service | grep -i error
   ```

4. **Verify API keys:**
   - Check `.env.bff.production`
   - Ensure API key is valid
   - Check if you've hit rate limits

### UI Shows Blank Page

**Problem:** Browser shows blank white page

**Solutions:**

1. **Check browser console (F12):**
   - Look for JavaScript errors
   - Look for failed API calls
   - Check for CORS errors

2. **Verify environment variables:**
   ```bash
   # Check if build-time env vars are correct
   docker-compose -f docker-compose.prod.yml exec ui-service cat /usr/share/nginx/html/index.html | grep VITE
   ```

3. **Check nginx logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs ui-service
   ```

4. **Verify nginx is serving files:**
   ```bash
   docker-compose -f docker-compose.prod.yml exec ui-service ls -la /usr/share/nginx/html
   ```

5. **Rebuild UI:**
   ```bash
   docker-compose -f docker-compose.prod.yml build ui-service
   docker-compose -f docker-compose.prod.yml up -d ui-service
   ```

### SSL Certificate Issues

**Problem:** "Your connection is not private" or SSL errors

**Solutions:**

1. **Check certificate exists:**
   ```bash
   sudo ls -la /etc/letsencrypt/live/yourdomain.com/
   ```

2. **Check certificate expiry:**
   ```bash
   sudo certbot certificates
   ```

3. **Renew certificate:**
   ```bash
   sudo certbot renew
   docker-compose -f docker-compose.prod.yml restart ui-service
   ```

4. **Check nginx SSL configuration:**
   ```bash
   docker-compose -f docker-compose.prod.yml exec ui-service nginx -t
   ```

### Container Keeps Restarting

**Problem:** Container status shows "Restarting"

**Solutions:**

1. **Check logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs --tail=50 bff-service
   ```

2. **Check health check:**
   ```bash
   docker inspect niyati-bff-prod | grep -A 10 Health
   ```

3. **Disable health check temporarily:**
   Comment out `healthcheck` in `docker-compose.prod.yml`, rebuild, and check logs

4. **Check for port conflicts:**
   ```bash
   sudo netstat -tlnp | grep -E ':(80|3000|443)'
   ```

### Out of Disk Space

**Problem:** Docker build fails or containers won't start

**Solutions:**

1. **Check disk usage:**
   ```bash
   df -h
   docker system df
   ```

2. **Clean up Docker resources:**
   ```bash
   # Remove unused containers
   docker container prune

   # Remove unused images
   docker image prune -a

   # Remove everything unused
   docker system prune -a --volumes
   ```

3. **Remove old backups:**
   ```bash
   ls -lh ~/backups/
   rm ~/backups/niyati-backup-old.tar.gz
   ```

### N8N Webhook Not Working

**Problem:** Chat messages not getting responses

**Solutions:**

1. **Check N8N is running:**
   ```bash
   curl https://your-n8n-url.com/webhook/chat
   ```

2. **Check UI environment:**
   ```bash
   cat .env.ui.production | grep N8N
   ```

3. **Check browser console:**
   - Look for webhook POST requests
   - Check response status codes
   - Verify webhook URL

4. **Test webhook manually:**
   ```bash
   curl -X POST https://your-n8n-url.com/webhook/chat \
     -H "Content-Type: application/json" \
     -d '{"message":"test","sessionId":"test123"}'
   ```

### High Memory Usage

**Problem:** Server running out of memory

**Solutions:**

1. **Check container memory:**
   ```bash
   docker stats
   ```

2. **Add swap space:**
   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

3. **Add memory limits to containers:**
   In `docker-compose.prod.yml`:
   ```yaml
   services:
     bff-service:
       deploy:
         resources:
           limits:
             memory: 512M
   ```

4. **Restart containers:**
   ```bash
   docker-compose -f docker-compose.prod.yml restart
   ```

---

## Getting Help

If you encounter issues not covered here:

1. **Check logs:** Most issues show up in container logs
2. **Search GitHub Issues:** Check if others have had similar problems
3. **Review Documentation:** See PRODUCTION.md for more advanced deployment options
4. **Contact Support:** Reach out to the development team

---

## Next Steps

After successful deployment:

1. **Set up monitoring:** Consider tools like Grafana, Prometheus, or cloud provider monitoring
2. **Configure backups:** Set up automated daily backups
3. **Enable logging:** Consider centralized logging with ELK stack or cloud logging
4. **Performance testing:** Use tools like Apache Bench or k6 to test load
5. **Security audit:** Run security scans and penetration tests
6. **Documentation:** Document your specific deployment configuration

---

**Congratulations! Your Niyati application is now running in production! 🎉**
