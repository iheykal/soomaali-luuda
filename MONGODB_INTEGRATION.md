# MongoDB Integration Guide

## Overview
The authentication system is now fully integrated with MongoDB. Users stored in MongoDB can be used for login.

## Features

✅ **MongoDB Authentication**
- Login with username or phone number
- Passwords stored securely with bcrypt hashing
- Supports both hashed and plain text passwords (auto-upgrades plain text)
- JWT token-based authentication

✅ **User Management Scripts**
- View all users in MongoDB
- Hash existing plain text passwords

## Setup

### 1. Install Backend Dependencies

```bash
cd backend
npm install bcryptjs jsonwebtoken
```

### 2. Start Backend Server

```bash
cd backend
npm run dev
```

The server will run on `http://localhost:5000`

### 3. View Users in MongoDB

To see what users exist in your MongoDB database:

```bash
cd backend
npm run view-users
```

This will display:
- All users in the database
- Username, phone, email, role, status, balance
- Password status (hashed or plain text)

### 4. Hash Existing Passwords

If you have users with plain text passwords, hash them:

```bash
cd backend
npm run hash-passwords
```

This will:
- Find all users with plain text passwords
- Hash them with bcrypt
- Save the hashed passwords

**Note:** The login system will automatically hash plain text passwords on first login, but it's better to hash them all at once.

## Login Flow

### Existing MongoDB Users

1. **Plain Text Passwords:**
   - Login with username/phone and password
   - System detects plain text password
   - Compares directly
   - Auto-upgrades to hashed password
   - Saves hashed password to MongoDB

2. **Hashed Passwords:**
   - Login with username/phone and password
   - System detects bcrypt hash
   - Uses bcrypt.compare() for verification
   - Login succeeds

### New Users (Registration)

- Registration creates new user in MongoDB
- Password is automatically hashed with bcrypt
- User gets sign-up bonus (100 balance)
- JWT token returned for authentication

## API Endpoints

### POST `/api/auth/login`
Login with username/phone and password
```json
{
  "phoneOrUsername": "username or phone",
  "password": "password"
}
```

### POST `/api/auth/register`
Register new user
```json
{
  "phoneOrUsername": "username or phone",
  "password": "password",
  "email": "email@example.com" // optional
}
```

### GET `/api/auth/me`
Get current user (requires Bearer token)
```
Authorization: Bearer <token>
```

## Frontend Integration

The frontend is already configured to use MongoDB authentication:

1. **Login Component** (`components/auth/Login.tsx`)
   - Uses `authAPI.login()` to authenticate
   - Stores JWT token in localStorage
   - Redirects to game setup on success

2. **Register Component** (`components/auth/Register.tsx`)
   - Uses `authAPI.register()` to create user
   - Stores JWT token in localStorage
   - Redirects to game setup on success

3. **Auth Context** (`context/AuthContext.tsx`)
   - Manages authentication state
   - Validates JWT tokens
   - Provides user data throughout the app

## Environment Variables

Make sure your `backend/.env` file has:

```env
NODE_ENV=development
CONNECTION_URI=mongodb+srv://username:password@cluster.mongodb.net/ludo?retryWrites=true&w=majority&appName=ludo
JWT_SECRET=your-secret-key-here
FRONTEND_URL=http://localhost:3000
PORT=5000
```

## Troubleshooting

### "Failed to fetch" Error

1. **Check if backend is running:**
   ```bash
   cd backend
   npm run dev
   ```
   Should see: `Server running on port 5000` and `MongoDB Connected`

2. **Check if dependencies are installed:**
   ```bash
   cd backend
   npm install bcryptjs jsonwebtoken
   ```

3. **Check MongoDB connection:**
   - Verify `CONNECTION_URI` in `backend/.env`
   - Test connection: `npm run view-users`

### "Invalid phone number or password" Error

1. **Check if user exists:**
   ```bash
   npm run view-users
   ```

2. **Verify password:**
   - If password is plain text, try the original password
   - If password is hashed, the system uses bcrypt comparison

3. **Check user status:**
   - Make sure user status is "Active" (not "Suspended")

### Users Not Showing Up

1. **Check MongoDB connection:**
   ```bash
   npm run view-users
   ```

2. **Verify database name:**
   - Check `CONNECTION_URI` in `.env` file
   - Make sure database name matches

## Testing

### Test Login with Existing User

1. View users:
   ```bash
   npm run view-users
   ```

2. Use username/phone and password from MongoDB to login

3. Check browser console for API calls:
   - Should see: `🔧 Auth API Configuration:`
   - Should see successful login response

### Test Registration

1. Register new user through UI
2. Check MongoDB:
   ```bash
   npm run view-users
   ```
3. Should see new user with hashed password

