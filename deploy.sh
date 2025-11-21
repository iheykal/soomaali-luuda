#!/bin/bash

# Deployment script for Ludo Game
# This script helps deploy the application without modifying game logic or login

set -e

echo "🚀 Ludo Game Deployment Script"
echo "================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from env.example..."
    cp env.example .env
    echo "⚠️  Please edit .env file with your configuration before continuing!"
    echo "   Important: Set CONNECTION_URI, JWT_SECRET, and FRONTEND_URL"
    read -p "Press Enter after editing .env file to continue..."
fi

echo "🔨 Building Docker images..."
docker-compose build

echo "🚀 Starting services..."
docker-compose up -d

echo "⏳ Waiting for services to be healthy..."
sleep 10

echo "📊 Service Status:"
docker-compose ps

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Services are running:"
echo "  - Frontend: http://localhost:80"
echo "  - Backend API: http://localhost:5000/api"
echo "  - Health Check: http://localhost:5000/api/health"
echo ""
echo "View logs: docker-compose logs -f"
echo "Stop services: docker-compose down"
echo ""
echo "⚠️  IMPORTANT: Game logic and login functionality have NOT been modified."

