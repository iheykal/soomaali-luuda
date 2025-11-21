# Deployment Guide for Ludo Game

This guide helps you deploy the Ludo game web application without modifying the game logic or login functionality.

## Prerequisites

- Docker and Docker Compose installed
- MongoDB (or MongoDB Atlas account for cloud database)
- Domain name (optional, for production)

## Quick Start with Docker Compose

1. **Clone and navigate to the project directory**
   ```bash
   cd ludo-master
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` file with your configuration**
   - Set `CONNECTION_URI` to your MongoDB connection string
   - Change `JWT_SECRET` to a secure random string
   - Set `FRONTEND_URL` to your domain (or leave as localhost for local testing)

4. **Start all services**
   ```bash
   docker-compose up -d
   ```

5. **Check service status**
   ```bash
   docker-compose ps
   ```

6. **View logs**
   ```bash
   docker-compose logs -f
   ```

## Individual Service Deployment

### Backend Only

```bash
# Build backend image
docker build -f Dockerfile.backend -t ludo-backend .

# Run backend container
docker run -d \
  --name ludo-backend \
  -p 5000:5000 \
  -e CONNECTION_URI=mongodb://your-mongodb-uri \
  -e JWT_SECRET=your-secret-key \
  -e FRONTEND_URL=https://yourdomain.com \
  ludo-backend
```

### Frontend Only

```bash
# Build frontend image
docker build -f Dockerfile.frontend -t ludo-frontend .

# Run frontend container
docker run -d \
  --name ludo-frontend \
  -p 80:80 \
  ludo-frontend
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `CONNECTION_URI` | MongoDB connection string | Yes | `mongodb://localhost:27017/ludo-master` |
| `JWT_SECRET` | Secret key for JWT tokens | Yes | Random string (change in production!) |
| `FRONTEND_URL` | Frontend URL for CORS | Yes | `http://localhost:3000` |
| `PORT` | Backend server port | No | `5000` |
| `HOST` | Backend server host | No | `0.0.0.0` |
| `NODE_ENV` | Environment mode | No | `production` |
| `GEMINI_API_KEY` | Gemini API key (if using AI features) | No | - |

## Production Deployment Checklist

- [ ] Change `JWT_SECRET` to a secure random string
- [ ] Set `FRONTEND_URL` to your production domain
- [ ] Use MongoDB Atlas or secure MongoDB instance
- [ ] Enable HTTPS/SSL certificates
- [ ] Set up reverse proxy (nginx) if needed
- [ ] Configure firewall rules
- [ ] Set up monitoring and logging
- [ ] Configure automatic backups for MongoDB

## Important Notes

⚠️ **Game Logic and Login Preserved**: The deployment configuration does NOT modify:
- Game engine logic (`backend/logic/gameEngine.js`)
- Login authentication routes (`/api/auth/login`)
- Game state management
- Socket.IO game events

## Troubleshooting

### Backend won't start
- Check MongoDB connection string
- Verify environment variables are set correctly
- Check logs: `docker-compose logs backend`

### Frontend can't connect to backend
- Verify `FRONTEND_URL` matches your frontend domain
- Check CORS configuration in backend
- Ensure backend is accessible from frontend

### Database connection issues
- Verify MongoDB is running and accessible
- Check connection string format
- Ensure network connectivity between containers

## Manual Deployment (Without Docker)

### Backend

1. Install Node.js dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Set environment variables (create `.env` file or export them)

3. Start server:
   ```bash
   npm start
   ```

### Frontend

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build for production:
   ```bash
   npm run build
   ```

3. Serve the `dist` folder using a web server (nginx, Apache, etc.)

## Support

For issues related to:
- **Game logic**: Check `backend/logic/gameEngine.js` (not modified during deployment)
- **Login**: Check `backend/server.js` login routes (not modified during deployment)
- **Deployment**: Review this guide and Docker logs

