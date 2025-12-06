# 🌟 Niyati

AI-powered astrology chatbot with geocoding and personalized readings.

## 📋 Overview

Niyati is a full-stack application that provides personalized astrological readings through an intuitive chat interface. It combines:

- **React UI** - Modern, responsive chat interface with real-time interactions
- **Express BFF** - Backend for Frontend service handling API orchestration
- **Astrology APIs** - Integration with external astrology calculation services
- **Geocoding** - Location-based birth chart calculations

## 🚀 Quick Start

### Using Docker (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/vatsaaa/niyati.git
cd niyati

# 2. Run setup script
./scripts/docker-setup.sh

# 3. Edit .env.bff with your API keys
nano .env.bff

# 4. Start services
./scripts/docker-dev.sh up

# 5. Access the application
# UI: http://localhost:5173
# BFF: http://localhost:3000
```

**📖 Documentation:**
- [Docker Quick Reference](DOCKER_QUICKSTART.md) - Common commands
- [Complete Docker Guide](DOCKER.md) - Detailed setup and usage

### Manual Setup

<details>
<summary>Click to expand manual setup instructions</summary>

#### Prerequisites

- Node.js 18.x or 20.x
- npm 9.x+

#### BFF Setup

```bash
cd be/bff

# Install dependencies
npm install

# Copy environment file and add your API keys
cp .env.example .env
# Edit .env with your API keys

# Start development server
npm run dev
```

#### UI Setup

```bash
cd ui

# Install dependencies
npm install

# Start development server
npm run dev
```

</details>

## 📁 Project Structure

```
niyati/
├── be/bff/                  # Backend for Frontend
│   ├── src/
│   │   ├── index.js        # Server entry point
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   └── lib/            # Utilities, logging, validation
│   ├── config/             # Environment-specific configs
│   ├── Dockerfile          # Multi-stage Docker build
│   └── package.json
├── ui/                     # React Frontend
│   ├── src/
│   │   ├── App.jsx        # Main component
│   │   ├── components/    # Reusable UI components
│   │   └── hooks/         # Custom React hooks
│   ├── Dockerfile         # Multi-stage Docker build
│   └── package.json
├── docker-compose.yml      # Development environment
├── docker-compose.prod.yml # Production overrides
├── scripts/
│   └── docker-dev.sh      # Docker helper script
└── .github/workflows/     # CI/CD pipelines
```

## 🛠️ Technology Stack

### Backend (BFF)
- **Node.js 20.x** - JavaScript runtime
- **Express 4.x** - Web framework
- **Pino** - Structured logging
- **Axios** - HTTP client
- **Helmet** - Security headers
- **Compression** - Response compression
- **Rate Limiting** - API protection

### Frontend (UI)
- **React 19.x** - UI library
- **Vite 7.x** - Build tool & dev server
- **TailwindCSS 3.x** - Utility-first CSS
- **Marked** - Markdown parsing
- **DOMPurify** - XSS protection
- **Lucide React** - Icon library

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **GitHub Actions** - CI/CD pipelines
- **Nginx** - Production web server
- **ESLint** - Code linting
- **Prettier** - Code formatting

## 🔧 Development

### Available Scripts

#### BFF
```bash
npm run dev              # Start dev server with hot reload
npm start                # Start production server
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm run format           # Format with Prettier
npm test                 # Run tests
npm run audit:security   # Security audit
```

#### UI
```bash
npm run dev              # Start Vite dev server
npm run build            # Build for production
npm run preview          # Preview production build
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm run format           # Format with Prettier
npm test                 # Run tests
```

### Docker Commands

```bash
# Start development environment
./scripts/docker-dev.sh up

# View logs
./scripts/docker-dev.sh logs

# Restart services
./scripts/docker-dev.sh restart

# Stop services
./scripts/docker-dev.sh down

# Clean rebuild
./scripts/docker-dev.sh clean
./scripts/docker-dev.sh build
./scripts/docker-dev.sh up
```

See [DOCKER.md](DOCKER.md) for complete Docker documentation.

## 🔒 Security

- **Environment variables** - Secrets stored in `.env` files (not committed)
- **API key validation** - Fail-fast if critical keys missing
- **Rate limiting** - Protection against abuse
- **Helmet.js** - Security headers
- **CORS** - Configured per environment
- **Input sanitization** - XSS and injection protection
- **Dependency scanning** - Automated security audits

## 📊 API Endpoints

### BFF Service (http://localhost:3000)

- `POST /api/v1/geocode` - Geocode location to coordinates
- `POST /api/v1/astrology/compute` - Calculate birth chart
- `GET /api/v1/telemetry/health` - Health check
- `GET /api/v1/telemetry/info` - System information

See API documentation for detailed request/response schemas.

## 🌍 Environment Variables

### BFF (.env.bff)
```env
NODE_ENV=development
PORT=3000
ASTRO_API_KEY=your_astrology_api_key
GEOCODE_MAPS_KEY=your_geocode_api_key
LOG_LEVEL=debug
```

### UI (.env.ui)
```env
VITE_BFF_BASE_URL=http://localhost:3000
VITE_APP_VERSION=0.1.0-dev
VITE_DEBUG_MODE=true
```

See `.env.example` files for complete variable lists.

## 🧪 Testing

```bash
# Run tests in Docker
docker-compose exec bff-service npm test
docker-compose exec ui-service npm test

# Run tests locally
cd be/bff && npm test
cd ui && npm test
```

## 🚢 Production Deployment

### Docker Production Build

```bash
# Build production images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Production Checklist

- [ ] Update `.env.bff` with production API keys
- [ ] Set `NODE_ENV=production`
- [ ] Configure production CORS origins
- [ ] Set up SSL/TLS termination
- [ ] Configure log aggregation
- [ ] Set up monitoring and alerting
- [ ] Enable health checks
- [ ] Use Docker secrets for sensitive data

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Code of conduct
- Development workflow
- Commit message conventions
- Pull request process
- Code style guidelines

## 📝 Documentation

- [DOCKER.md](DOCKER.md) - Complete Docker setup guide
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [TODO.md](TODO.md) - Project roadmap and tasks

## 📄 License

This project is private and proprietary.

## 🙏 Acknowledgments

- Astrology calculation APIs
- Geocoding services
- Open source community

---

**Built with ❤️ using React, Node.js, and Docker**
