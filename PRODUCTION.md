# 🚀 Production Deployment Guide

This guide outlines the steps, best practices, and considerations for deploying Niyati to production.

## 📋 Table of Contents

1. [Pre-Production Checklist](#pre-production-checklist)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Environment Configuration](#environment-configuration)
4. [Database & Caching](#database--caching)
5. [Deployment Strategies](#deployment-strategies)
6. [Security Hardening](#security-hardening)
7. [Monitoring & Observability](#monitoring--observability)
8. [Performance Optimization](#performance-optimization)
9. [Disaster Recovery](#disaster-recovery)
10. [Scaling Considerations](#scaling-considerations)

---

## Pre-Production Checklist

### Code Quality
- [ ] All tests passing (`npm test` in BFF and UI)
- [ ] No ESLint errors or warnings
- [ ] Code formatted with Prettier
- [ ] Security audit clean (`npm audit`)
- [ ] No `console.log` statements in production code
- [ ] Error handling comprehensive
- [ ] Input validation on all endpoints

### Documentation
- [ ] API documentation complete
- [ ] Environment variables documented
- [ ] Deployment runbook created
- [ ] Incident response procedures defined
- [ ] Architecture diagrams updated

### Dependencies
- [ ] All dependencies up to date
- [ ] No critical vulnerabilities
- [ ] License compliance verified
- [ ] Unnecessary devDependencies removed from production builds

### Configuration
- [ ] Environment-specific configs tested (staging, production)
- [ ] Secrets management strategy defined
- [ ] CORS origins properly configured
- [ ] Rate limits appropriate for production traffic
- [ ] Logging levels appropriate (INFO or WARN in prod)

---

## Infrastructure Setup

### Cloud Provider Options

#### Option 1: AWS (Recommended for Enterprise)

**Architecture:**
```
┌────────────────────────────────────────────────────────┐
│                     AWS Region (us-east-1)             │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  CloudFront CDN (UI + Static Assets)             │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │                                    │
│  ┌────────────────▼─────────────────────────────────┐  │
│  │  Application Load Balancer (ALB)                 │  │
│  │  • SSL/TLS Termination                           │  │
│  │  • Health Checks                                 │  │
│  │  • Auto Scaling Groups                           │  │
│  └────────┬──────────────────────┬──────────────────┘  │
│           │                      │                     │
│  ┌────────▼────────┐    ┌───────▼────────┐             │
│  │  ECS Fargate    │    │  ECS Fargate   │             │
│  │  (BFF Service)  │    │  (BFF Service) │             │
│  │  Multi-AZ       │    │  Multi-AZ      │             │
│  └────────┬────────┘    └───────┬────────┘             │
│           │                     │                      │
│  ┌────────▼─────────────────────▼──────────┐           │
│  │  ElastiCache Redis (Session/Cache)      │           │
│  │  Multi-AZ with Automatic Failover       │           │
│  └─────────────────────────────────────────┘           │
│                                                        │
│  ┌──────────────────────────────────────────┐          │
│  │  S3 Bucket (UI Static Assets)            │          │
│  │  • Versioning Enabled                    │          │
│  │  • CloudFront Origin                     │          │
│  └──────────────────────────────────────────┘          │
│                                                        │
│  ┌──────────────────────────────────────────┐          │
│  │  CloudWatch (Logs + Metrics + Alarms)    │          │
│  └──────────────────────────────────────────┘          │
│                                                        │
│  ┌──────────────────────────────────────────┐          │
│  │  Secrets Manager (API Keys, Credentials) │          │
│  └──────────────────────────────────────────┘          │
└────────────────────────────────────────────────────────┘
```

**Services:**
- **ECS Fargate** - Container orchestration (no server management)
- **ALB** - Load balancing with health checks
- **CloudFront** - CDN for UI and static assets
- **S3** - Static file storage
- **ElastiCache Redis** - Distributed caching and sessions
- **RDS** - Database (if needed in future)
- **Secrets Manager** - Secure credential storage
- **CloudWatch** - Logging, metrics, and alerting
- **Route 53** - DNS management
- **ACM** - SSL/TLS certificates (free)

**Estimated Monthly Cost:**
- ECS Fargate (2 tasks): ~$50-100
- ALB: ~$20-30
- CloudFront: ~$10-50 (depends on traffic)
- ElastiCache (t4g.small): ~$15-30
- S3: ~$1-5
- CloudWatch: ~$5-10
- **Total: ~$100-225/month** (varies with traffic)

#### Option 2: Google Cloud Platform (GCP)

**Services:**
- **Cloud Run** - Serverless containers (auto-scaling)
- **Cloud Load Balancing** - Global load balancing
- **Cloud CDN** - Content delivery
- **Cloud Storage** - Static file hosting
- **Memorystore Redis** - Managed Redis
- **Secret Manager** - Credentials management
- **Cloud Logging** - Centralized logging

**Estimated Monthly Cost:** ~$80-200/month

#### Option 3: DigitalOcean (Budget-Friendly)

**Services:**
- **App Platform** - Managed container hosting
- **Spaces** - Object storage + CDN
- **Managed Redis** - Caching
- **Load Balancer** - Traffic distribution

**Estimated Monthly Cost:** ~$40-100/month

#### Option 4: Kubernetes (Self-Managed or Managed)

**Options:**
- **EKS** (AWS), **GKE** (GCP), **AKS** (Azure)
- **DigitalOcean Kubernetes**
- Self-hosted with **k3s** or **Rancher**

**Best For:** Large-scale deployments, multi-service architectures

---

## Environment Configuration

### Production Environment Variables

#### BFF (.env.bff.production)

```env
# Environment
NODE_ENV=production

# Server
PORT=3000

# API Keys (use Secrets Manager in production!)
ASTRO_API_URL=https://api.production-astrology.com/v1/compute
ASTRO_API_KEY=secret_from_secrets_manager
GEOCODE_MAPS_KEY=secret_from_secrets_manager

# Caching (Production values)
GEOCODE_CACHE_TTL=86400

# Logging (Production settings)
LOG_LEVEL=info
LOG_PRETTY_PRINT=false

# Rate Limiting (Stricter for production)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=50
STRICT_RATE_LIMIT_WINDOW_MS=60000
STRICT_RATE_LIMIT_MAX_REQUESTS=10

# Performance
COMPRESSION_THRESHOLD=1024
COMPRESSION_LEVEL=6
SLOW_REQUEST_MS=1000
VERY_SLOW_REQUEST_MS=3000

# Shutdown
SHUTDOWN_TIMEOUT_MS=30000
SHUTDOWN_GRACE_PERIOD_MS=5000
```

#### UI (.env.ui.production)

```env
# Production API endpoint
VITE_BFF_BASE_URL=https://api.yourdomain.com

# App version (from CI/CD)
VITE_APP_VERSION=${CI_COMMIT_SHA}

# Feature flags
VITE_DEBUG_MODE=false
VITE_VERBOSE_LOGGING=false
```

### Secrets Management

**Never commit production secrets!** Use a secrets manager:

#### AWS Secrets Manager

```bash
# Store secrets
aws secretsmanager create-secret \
  --name niyati/prod/astro-api-key \
  --secret-string "your_actual_key"

# Retrieve in application (or use ECS task role)
aws secretsmanager get-secret-value \
  --secret-id niyati/prod/astro-api-key \
  --query SecretString --output text
```

#### Docker Secrets (Swarm/Kubernetes)

```yaml
# docker-compose.prod.secrets.yml
secrets:
  astro_api_key:
    external: true
  geocode_api_key:
    external: true

services:
  bff-service:
    secrets:
      - astro_api_key
      - geocode_api_key
    environment:
      - ASTRO_API_KEY_FILE=/run/secrets/astro_api_key
```

#### Environment Variables from CI/CD

Use GitHub Actions secrets, GitLab CI/CD variables, or platform-specific secret injection.

---

## Database & Caching

### Redis for Caching & Sessions

**Why Redis?**
- Fast geocoding cache (current: in-memory, lost on restart)
- Session storage (for future auth)
- Rate limiting distributed state
- Real-time features (pub/sub)

**Production Setup:**

#### AWS ElastiCache

```terraform
resource "aws_elasticache_cluster" "niyati_redis" {
  cluster_id           = "niyati-prod-cache"
  engine               = "redis"
  node_type            = "cache.t4g.small"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  
  # Multi-AZ for high availability
  automatic_failover_enabled = true
  
  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}
```

**Update BFF to use Redis:**

```javascript
// src/lib/cache.js
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

module.exports = redis;
```

### Database (Future Consideration)

**When to add a database:**
- User accounts and authentication
- Storing chat history
- Personalized settings
- Analytics and tracking

**Options:**
- **PostgreSQL** - Relational data (AWS RDS, Cloud SQL)
- **MongoDB** - Document storage (Atlas, DocumentDB)
- **DynamoDB** - Serverless NoSQL (AWS)

---

## Deployment Strategies

### Option 1: Docker-Based Deployment (Recommended)

#### Using AWS ECS Fargate

**Step 1: Build and Push Images**

```bash
# Build production images
docker build -t niyati-bff:latest -f be/bff/Dockerfile --target production be/bff
docker build -t niyati-ui:latest -f ui/Dockerfile --target production ui

# Tag for ECR
docker tag niyati-bff:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/niyati-bff:latest
docker tag niyati-ui:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/niyati-ui:latest

# Push to ECR
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/niyati-bff:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/niyati-ui:latest
```

**Step 2: ECS Task Definition**

```json
{
  "family": "niyati-bff",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "bff",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/niyati-bff:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "ASTRO_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:niyati/prod/astro-api-key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/niyati-bff",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/api/v1/telemetry/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

**Step 3: ECS Service with Auto-Scaling**

```bash
# Create ECS service
aws ecs create-service \
  --cluster niyati-prod \
  --service-name niyati-bff \
  --task-definition niyati-bff \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=bff,containerPort=3000"
```

#### Using Docker Compose (Simpler, Single Server)

**docker-compose.production.yml:**

```yaml
services:
  bff-service:
    image: niyati-bff:${VERSION}
    restart: always
    ports:
      - "3000:3000"
    env_file:
      - .env.bff.production
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  ui-service:
    image: niyati-ui:${VERSION}
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/nginx/ssl:ro
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    deploy:
      resources:
        limits:
          memory: 256M

volumes:
  redis-data:
```

### Option 2: Platform-as-a-Service (PaaS)

#### Heroku

```bash
# Deploy BFF
cd be/bff
heroku create niyati-bff-prod
heroku config:set NODE_ENV=production ASTRO_API_KEY=xxx
git push heroku master

# Deploy UI
cd ui
heroku create niyati-ui-prod
heroku config:set VITE_BFF_BASE_URL=https://niyati-bff-prod.herokuapp.com
heroku buildpacks:set heroku/nodejs
git push heroku master
```

#### DigitalOcean App Platform

```yaml
# .do/app.yaml
name: niyati
services:
  - name: bff
    dockerfile_path: be/bff/Dockerfile
    source_dir: be/bff
    github:
      repo: vatsaaa/niyati
      branch: main
      deploy_on_push: true
    health_check:
      http_path: /api/v1/telemetry/health
    envs:
      - key: NODE_ENV
        value: production
      - key: ASTRO_API_KEY
        type: SECRET
    instance_count: 2
    instance_size_slug: basic-xs

  - name: ui
    dockerfile_path: ui/Dockerfile
    source_dir: ui
    github:
      repo: vatsaaa/niyati
      branch: main
    envs:
      - key: VITE_BFF_BASE_URL
        value: ${bff.PUBLIC_URL}
    instance_count: 1
    instance_size_slug: basic-xs
```

### Option 3: Serverless

#### AWS Lambda + API Gateway

**Convert BFF to Lambda:**

```javascript
// lambda-handler.js
const serverless = require('serverless-http');
const app = require('./src/index');

module.exports.handler = serverless(app);
```

**Deploy with Serverless Framework:**

```yaml
# serverless.yml
service: niyati-bff

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  environment:
    NODE_ENV: production
    ASTRO_API_KEY: ${ssm:/niyati/prod/astro-api-key}

functions:
  api:
    handler: lambda-handler.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
```

---

## Security Hardening

### SSL/TLS Certificates

**AWS:**
- Use **AWS Certificate Manager (ACM)** - free SSL certificates
- Attach to ALB or CloudFront

**Let's Encrypt (Self-Hosted):**

```bash
# Install certbot
apt-get install certbot

# Get certificate
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Auto-renewal cron job
0 3 * * * certbot renew --quiet
```

### Nginx SSL Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    
    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # ... rest of config
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### Environment-Specific CORS

**Update BFF config:**

```javascript
// config/production.js
module.exports = {
  cors: {
    origin: [
      'https://yourdomain.com',
      'https://www.yourdomain.com'
    ],
    credentials: true,
    maxAge: 86400
  },
  // ... rest
};
```

### Security Headers

**Already configured in Helmet, verify:**

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
}));
```

### Rate Limiting (Production)

```javascript
// Stricter limits in production
const strictLimiter = rateLimit({
  windowMs: 60000,
  max: 10, // 10 requests per minute
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/v1/astrology', strictLimiter);
app.use('/api/v1/geocode', strictLimiter);
```

### API Key Rotation

```bash
# Rotate keys quarterly
# 1. Generate new key
# 2. Update in Secrets Manager
# 3. Restart services
# 4. Invalidate old key after verification
```

---

## Monitoring & Observability

### Application Performance Monitoring (APM)

#### Option 1: New Relic

```bash
# Install agent
npm install newrelic --save

# Require at top of index.js
require('newrelic');
```

**newrelic.js:**

```javascript
exports.config = {
  app_name: ['Niyati BFF'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'info'
  }
};
```

#### Option 2: Datadog

```bash
npm install dd-trace --save
```

```javascript
// At very top of index.js
const tracer = require('dd-trace').init({
  service: 'niyati-bff',
  env: process.env.NODE_ENV,
});
```

#### Option 3: AWS CloudWatch (Built-in)

**Already logging with Pino - stream to CloudWatch:**

```javascript
const pino = require('pino');
const logger = pino({
  // CloudWatch-friendly JSON format
  formatters: {
    level: (label) => ({ level: label }),
  },
});
```

### Metrics to Monitor

**BFF Metrics:**
- Request rate (requests/sec)
- Response time (p50, p95, p99)
- Error rate (%)
- CPU usage (%)
- Memory usage (MB)
- Active connections
- Cache hit rate (%)

**UI Metrics:**
- Page load time
- Time to interactive
- Core Web Vitals (LCP, FID, CLS)
- JavaScript errors
- Network errors

### Logging Best Practices

**Structured Logging (Already Implemented):**

```javascript
logger.info({
  requestId: req.id,
  method: req.method,
  path: req.path,
  userId: req.user?.id,
  duration: responseTime,
  statusCode: res.statusCode,
}, 'Request completed');
```

**Log Aggregation:**
- **AWS CloudWatch Logs** - Built-in with ECS
- **Datadog** - Unified logs and metrics
- **ELK Stack** - Self-hosted (Elasticsearch, Logstash, Kibana)
- **Grafana Loki** - Lightweight alternative

### Alerts Configuration

**Critical Alerts:**
- Error rate > 5% for 5 minutes
- Response time p95 > 3 seconds
- Health check failing
- CPU > 80% for 10 minutes
- Memory > 90%

**Warning Alerts:**
- Error rate > 2%
- Response time p95 > 1 second
- Slow requests increasing

**Alert Channels:**
- PagerDuty (for on-call)
- Slack (for team notifications)
- Email (for non-urgent)

---

## Performance Optimization

### CDN Configuration

**CloudFront Distribution:**

```json
{
  "Origins": [
    {
      "Id": "niyati-ui-s3",
      "DomainName": "niyati-ui.s3.amazonaws.com",
      "S3OriginConfig": {
        "OriginAccessIdentity": "origin-access-identity/cloudfront/XXXXX"
      }
    }
  ],
  "DefaultCacheBehavior": {
    "TargetOriginId": "niyati-ui-s3",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": ["GET", "HEAD", "OPTIONS"],
    "CachedMethods": ["GET", "HEAD"],
    "Compress": true,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "MinTTL": 0
  }
}
```

### Caching Strategy

**UI Assets:**
```
/index.html          -> Cache-Control: no-cache (always fresh)
/assets/*.js         -> Cache-Control: max-age=31536000, immutable
/assets/*.css        -> Cache-Control: max-age=31536000, immutable
/assets/images/*     -> Cache-Control: max-age=31536000
```

**API Responses:**
```
GET /api/v1/telemetry/health -> Cache-Control: no-cache
POST /api/v1/geocode         -> Redis cache (24h)
POST /api/v1/astrology       -> No cache (personalized)
```

### Image Optimization

```bash
# Optimize images before deploying
npm install -g sharp-cli

# Convert and compress
sharp input.png -o output.webp --webp
```

### Bundle Size Optimization

**UI Production Build:**

```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          markdown: ['marked', 'dompurify'],
        },
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
};
```

### Database Query Optimization (Future)

- Use indexes on frequently queried fields
- Implement query result caching
- Use connection pooling
- Monitor slow queries

---

## Disaster Recovery

### Backup Strategy

**Configuration Backups:**
```bash
# Daily backup of environment configs
0 2 * * * tar -czf /backups/niyati-config-$(date +\%Y\%m\%d).tar.gz \
  .env.bff .env.ui docker-compose.yml
```

**Database Backups (Future):**
- Automated daily snapshots
- Point-in-time recovery enabled
- Cross-region replication
- 30-day retention

**Redis Backups:**
- Enable RDB snapshots
- AOF (Append-Only File) for durability

### Disaster Recovery Plan

**RTO (Recovery Time Objective):** 1 hour  
**RPO (Recovery Point Objective):** 15 minutes

**Steps:**

1. **Infrastructure Failure:**
   - Automatic failover to secondary region
   - DNS updated via Route 53
   - Health checks trigger failover

2. **Data Corruption:**
   - Restore from latest backup
   - Replay transaction logs
   - Verify data integrity

3. **Complete Outage:**
   - Deploy to backup region
   - Update DNS records
   - Notify users

**Runbook Location:** `docs/runbooks/disaster-recovery.md`

---

## Scaling Considerations

### Horizontal Scaling

**Auto-Scaling Rules (ECS):**

```json
{
  "TargetTrackingScalingPolicyConfiguration": {
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleOutCooldown": 60,
    "ScaleInCooldown": 300
  },
  "MinCapacity": 2,
  "MaxCapacity": 10
}
```

### Vertical Scaling

**Upgrade instance types when:**
- Consistent CPU > 70%
- Memory pressure
- Increased latency under load

**BFF Scaling:**
- Start: 512 CPU, 1GB RAM (2 tasks)
- Medium: 1024 CPU, 2GB RAM (2-5 tasks)
- Large: 2048 CPU, 4GB RAM (5-10 tasks)

### Database Scaling (Future)

- **Read Replicas** - Distribute read traffic
- **Sharding** - Partition data
- **Caching** - Reduce database load

### Load Testing

**Before Production:**

```bash
# Install artillery
npm install -g artillery

# Load test BFF
artillery quick --count 100 --num 10 https://api.yourdomain.com/api/v1/telemetry/health
```

**Expected Performance:**
- 100 requests/sec sustained
- p95 latency < 500ms
- p99 latency < 1000ms
- 0% error rate

---

## Cost Optimization

### Resource Right-Sizing

- Start with smallest instances
- Monitor actual usage
- Scale up based on metrics
- Use spot instances for non-critical workloads

### Reserved Instances

- 1-year commitment: ~30% savings
- 3-year commitment: ~50% savings
- Good for stable baseline load

### Serverless for Variable Load

- AWS Lambda: Pay per request
- Cloud Run: Pay per use
- Good for spiky traffic

### Monitoring Costs

**AWS Cost Explorer:**
- Set budgets and alerts
- Tag resources for tracking
- Review monthly reports

**Estimated Production Costs (AWS):**

| Service | Monthly Cost |
|---------|-------------|
| ECS Fargate (2 tasks) | $50-100 |
| ALB | $20-30 |
| CloudFront | $10-50 |
| ElastiCache | $15-30 |
| S3 + Data Transfer | $5-10 |
| CloudWatch | $5-10 |
| **Total** | **$105-230** |

---

## CI/CD Pipeline for Production

### GitHub Actions Production Deploy

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Build and push BFF image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/niyati-bff:$IMAGE_TAG \
            -f be/bff/Dockerfile --target production be/bff
          docker push $ECR_REGISTRY/niyati-bff:$IMAGE_TAG
      
      - name: Build and push UI image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/niyati-ui:$IMAGE_TAG \
            -f ui/Dockerfile --target production ui
          docker push $ECR_REGISTRY/niyati-ui:$IMAGE_TAG
      
      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster niyati-prod \
            --service niyati-bff \
            --force-new-deployment
      
      - name: Deploy UI to S3
        run: |
          aws s3 sync ui/dist s3://niyati-ui-prod --delete
          aws cloudfront create-invalidation \
            --distribution-id XXXXX --paths "/*"
      
      - name: Notify Slack
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "🚀 Deployed to production: ${{ github.sha }}"
            }
```

---

## Production Readiness Checklist

### Pre-Launch

- [ ] Load testing completed (100+ req/sec)
- [ ] Security audit passed
- [ ] SSL certificates installed
- [ ] Monitoring and alerting configured
- [ ] Backup and recovery tested
- [ ] Disaster recovery plan documented
- [ ] On-call rotation established
- [ ] Incident response procedures defined

### Launch Day

- [ ] DNS records updated
- [ ] SSL/TLS verified (A+ rating on SSLLabs)
- [ ] Health checks passing
- [ ] Monitoring dashboards ready
- [ ] Team alerted and ready
- [ ] Rollback plan prepared

### Post-Launch

- [ ] Monitor error rates (first 24h)
- [ ] Check performance metrics
- [ ] Review logs for issues
- [ ] Verify auto-scaling working
- [ ] Customer feedback collected
- [ ] Incident retrospective (if any)

---

## Support and Maintenance

### Regular Maintenance Tasks

**Daily:**
- Check error rates and alerts
- Review critical logs
- Monitor performance metrics

**Weekly:**
- Security patches review
- Dependency updates check
- Cost analysis

**Monthly:**
- Security audit
- Performance optimization review
- Backup verification
- Incident retrospective

**Quarterly:**
- API key rotation
- Architecture review
- Disaster recovery drill
- Capacity planning

---

## Resources

### Documentation
- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [Docker Production Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Node.js Production Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)

### Tools
- **Infrastructure as Code:** Terraform, CloudFormation, Pulumi
- **CI/CD:** GitHub Actions, GitLab CI, Jenkins
- **Monitoring:** CloudWatch, Datadog, New Relic, Grafana
- **Security:** Snyk, AWS Security Hub, OWASP ZAP

### Support Contacts
- **Cloud Provider:** AWS Support, GCP Support
- **On-Call:** PagerDuty
- **Team Chat:** Slack #niyati-prod
- **Incident Management:** Jira, Linear

---

**Next Steps:**

1. Choose your infrastructure provider
2. Set up staging environment first
3. Complete security hardening
4. Configure monitoring and alerts
5. Run load tests
6. Deploy to production
7. Monitor closely for first 48 hours

**Good luck with your production deployment! 🚀**
