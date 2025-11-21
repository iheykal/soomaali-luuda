@echo off
REM Deployment script for Ludo Game (Windows)
REM This script helps deploy the application without modifying game logic or login

echo.
echo ================================
echo   Ludo Game Deployment Script
echo ================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed. Please install Docker Desktop first.
    pause
    exit /b 1
)

REM Check if .env file exists
if not exist .env (
    echo [INFO] Creating .env file from env.example...
    copy env.example .env
    echo.
    echo [WARNING] Please edit .env file with your configuration!
    echo           Important: Set CONNECTION_URI, JWT_SECRET, and FRONTEND_URL
    echo.
    pause
)

echo [INFO] Building Docker images...
docker-compose build

echo.
echo [INFO] Starting services...
docker-compose up -d

echo.
echo [INFO] Waiting for services to start...
timeout /t 10 /nobreak >nul

echo.
echo [INFO] Service Status:
docker-compose ps

echo.
echo ================================
echo   Deployment Complete!
echo ================================
echo.
echo Services are running:
echo   - Frontend: http://localhost:80
echo   - Backend API: http://localhost:5000/api
echo   - Health Check: http://localhost:5000/api/health
echo.
echo View logs: docker-compose logs -f
echo Stop services: docker-compose down
echo.
echo [IMPORTANT] Game logic and login functionality have NOT been modified.
echo.
pause

