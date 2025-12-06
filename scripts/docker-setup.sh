#!/usr/bin/env bash
# Quick setup script for Docker environment
# Run this once before starting Docker services

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Niyati Docker Setup Script         ║${NC}"
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo ""

# Check Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker is not installed${NC}"
    echo "Please install Docker Desktop from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check Docker is running
if ! docker info &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker is not running${NC}"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo -e "${GREEN}✓ Docker is installed and running${NC}"

# Create .env.bff if it doesn't exist
if [ ! -f ".env.bff" ]; then
    echo -e "${YELLOW}→ Creating .env.bff from example...${NC}"
    cp .env.bff.example .env.bff
    echo -e "${GREEN}✓ Created .env.bff${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env.bff and add your API keys!${NC}"
else
    echo -e "${GREEN}✓ .env.bff already exists${NC}"
fi

# Create .env.ui if it doesn't exist
if [ ! -f ".env.ui" ]; then
    echo -e "${YELLOW}→ Creating .env.ui from example...${NC}"
    cp .env.ui.example .env.ui
    echo -e "${GREEN}✓ Created .env.ui${NC}"
else
    echo -e "${GREEN}✓ .env.ui already exists${NC}"
fi

# Make docker-dev.sh executable
if [ -f "scripts/docker-dev.sh" ]; then
    chmod +x scripts/docker-dev.sh
    echo -e "${GREEN}✓ Made docker-dev.sh executable${NC}"
fi

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Setup Complete!                     ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo ""
echo "1. Edit .env.bff and add your API keys:"
echo "   ${YELLOW}nano .env.bff${NC}"
echo ""
echo "2. Start the services:"
echo "   ${YELLOW}./scripts/docker-dev.sh up${NC}"
echo ""
echo "3. Access the application:"
echo "   UI:  ${BLUE}http://localhost:5173${NC}"
echo "   BFF: ${BLUE}http://localhost:3000${NC}"
echo ""
echo "4. View logs:"
echo "   ${YELLOW}./scripts/docker-dev.sh logs${NC}"
echo ""
echo "For more commands, run: ${YELLOW}./scripts/docker-dev.sh help${NC}"
echo ""
