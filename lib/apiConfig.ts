// API Configuration
const getApiUrl = () => {
  try {
    // If explicitly set in environment variable, use it
    if (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.trim() !== '') {
      const envUrl = import.meta.env.VITE_API_URL.trim();
      
      // If it's a full URL, use it as-is
      if (envUrl.startsWith('http://') || envUrl.startsWith('https://')) {
        console.log('🔧 Using VITE_API_URL from env:', envUrl);
        return envUrl;
      }
      
      // If it's a relative URL, check if we should convert it
      if (envUrl.startsWith('/')) {
        // In production mode, use relative URL
        if (import.meta.env.VITE_USE_REAL_API === 'true') {
          console.log('🔧 Using relative API URL:', envUrl);
          return envUrl;
        }
        // In development, if accessed via network IP, convert to full URL
        if (typeof window !== 'undefined') {
          const hostname = window.location.hostname;
          if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            const fullUrl = `http://${hostname}:5000${envUrl}`;
            console.log('🔧 Using network IP API URL:', fullUrl);
            return fullUrl;
          }
        }
        console.log('🔧 Using relative API URL (localhost):', envUrl);
        return envUrl;
      }
    }
    
    // Auto-detect based on current hostname
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;
      
      // In production mode, use same origin
      if (import.meta.env.VITE_USE_REAL_API === 'true') {
        const url = `${window.location.origin}`;
        console.log('🔧 Using same origin API URL:', url);
        return url;
      }
      
      // Auto-detect Render backend URL pattern
      // If frontend is on Render, use the same origin for the API
      if (hostname.includes('onrender.com')) {
        const url = `${window.location.origin}/api`;
        console.log('🔧 Using same origin API URL for Render:', url);
        return url;
      }
      
      // If accessed via network IP (mobile/remote), use network IP for backend
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        // Use same hostname but port 5000 for backend
        const url = `${protocol}//${hostname}:5000/api`;
        console.log('🔧 Auto-detected network API URL:', url);
        return url;
      }
    }
    
    // Default: localhost for development
    const defaultUrl = 'http://localhost:5000/api';
    console.log('🔧 Using default API URL:', defaultUrl);
    return defaultUrl;
  } catch (error) {
    console.error('❌ Error determining API URL, using default:', error);
    return 'http://localhost:5000/api';
  }
};

const getSocketUrl = () => {
  try {
    // If explicitly set in environment variable, use it
    if (import.meta.env.VITE_SOCKET_URL && import.meta.env.VITE_SOCKET_URL.trim() !== '') {
      const envUrl = import.meta.env.VITE_SOCKET_URL.trim();
      
      // If it's a full URL, use it as-is
      if (envUrl.startsWith('http://') || envUrl.startsWith('https://') || envUrl.startsWith('ws://') || envUrl.startsWith('wss://')) {
        console.log('🔧 Using VITE_SOCKET_URL from env:', envUrl);
        return envUrl;
      }
    }
    
      // Auto-detect based on current hostname
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        
        // In production mode, use same origin
        if (import.meta.env.VITE_USE_REAL_API === 'true') {
          const url = window.location.origin;
          console.log('🔧 Using same origin Socket URL:', url);
          return url;
        }
        
        // If accessed via network IP (mobile/remote), use network IP for backend
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
          // Use same hostname but port 5000 for backend
          const url = `${protocol}//${hostname}:5000`;
          console.log('🔧 Auto-detected network Socket URL:', url);
          return url;
        }
      }
    
    // Default: localhost for development
    const defaultUrl = 'ws://localhost:5000';
    console.log('🔧 Using default Socket URL:', defaultUrl);
    return defaultUrl;
  } catch (error) {
    console.error('❌ Error determining Socket URL, using default:', error);
    return 'ws://localhost:5000';
  }
};

export const API_URL = getApiUrl();
export const SOCKET_URL = getSocketUrl();

// Log configuration on module load
console.log('🔧 API Configuration:', { API_URL, SOCKET_URL });

