// API Configuration
const ensureApiPath = (url: string) => {
  if (!url) return url;
  // If the URL already contains '/api' return as-is
  if (url.includes('/api')) return url.replace(/\/+$/g, '');
  // Otherwise append '/api' without duplicating slashes
  return url.replace(/\/+$/g, '') + '/api';
};

const getApiUrl = () => {
  try {
    // If explicitly set in environment variable, use it
    if (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.trim() !== '') {
      let envUrl = import.meta.env.VITE_API_URL.trim();

      // If it's a full URL, ensure it includes '/api'
      if (envUrl.startsWith('http://') || envUrl.startsWith('https://')) {
        const finalUrl = ensureApiPath(envUrl);
        console.log('🔧 Using VITE_API_URL from env:', finalUrl);
        return finalUrl;
      }

      // If it's a relative URL, check if we should convert it
      if (envUrl.startsWith('/')) {
        // In production mode, use relative URL (ensure /api present)
        if (import.meta.env.PROD) {
          const finalUrl = ensureApiPath(envUrl);
          console.log('🔧 Using relative API URL (prod):', finalUrl);
          return finalUrl;
        }
        // In development, if accessed via network IP, convert to full URL
        if (typeof window !== 'undefined') {
          const hostname = window.location.hostname;
          if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            const fullUrl = `http://${hostname}:5000${envUrl}`;
            const finalUrl = ensureApiPath(fullUrl);
            console.log('🔧 Using network IP API URL:', finalUrl);
            return finalUrl;
          }
        }
        const finalUrl = ensureApiPath(envUrl);
        console.log('🔧 Using relative API URL (localhost):', finalUrl);
        return finalUrl;
      }
    }

    // Auto-detect based on current hostname (only if VITE_API_URL not set)
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;

      // In production mode, use the correct backend URL
      if (import.meta.env.PROD) {
        const url = 'https://som-bet-backend.onrender.com/api';
        console.log('🔧 Using hardcoded production API URL:', url);
        return url;
      }

      // Auto-detect Render backend URL pattern
      // If frontend is on Render, use the same origin for the API
      if (hostname.includes('onrender.com')) {
        const url = ensureApiPath(`${window.location.origin}`);
        console.log('🔧 Using same origin API URL for Render:', url);
        return url;
      }

      // If accessed via network IP (mobile/remote), use network IP for backend
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        // Use same hostname but port 5000 for backend
        const url = `${protocol}//${hostname}:5000`;
        const finalUrl = ensureApiPath(url);
        console.log('🔧 Auto-detected network API URL:', finalUrl);
        return finalUrl;
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
    // For production builds, explicitly use the new backend URL
    if (import.meta.env.PROD) {
      // If explicitly set in environment variable, use it
      if (import.meta.env.VITE_SOCKET_URL && import.meta.env.VITE_SOCKET_URL.trim() !== '') {
        const envUrl = import.meta.env.VITE_SOCKET_URL.trim();
        console.log('🔧 Using VITE_SOCKET_URL from env for production:', envUrl);
        return envUrl;
      }

      // Hardcoded fallback to the correct backend URL
      const productionUrl = 'https://som-bet-backend.onrender.com';
      console.log('🔧 Using hardcoded production Socket URL:', productionUrl);
      return productionUrl;
    }

    // --- DEVELOPMENT LOGIC ---

    // If explicitly set in environment variable, use it
    if (import.meta.env.VITE_SOCKET_URL && import.meta.env.VITE_SOCKET_URL.trim() !== '') {
      const envUrl = import.meta.env.VITE_SOCKET_URL.trim();
      console.log('🔧 Using VITE_SOCKET_URL from env for development:', envUrl);
      return envUrl;
    }

    // Auto-detect for mobile/network development
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;

      // If accessed via network IP (mobile/remote), use that IP for the socket
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        const url = `${protocol}//${hostname}:5000`;
        console.log('🔧 Auto-detected network Socket URL:', url);
        console.warn('⚠️ NETWORK ACCESS DETECTED! Make sure backend is running on:', url);
        console.warn('⚠️ If connection fails, ensure:');
        console.warn('   1. Backend server is running: npm run dev');
        console.warn('   2. Backend is accessible on your network (check firewall)');
        console.warn('   3. OR access via http://localhost:5173 instead');
        return url;
      }
    }

    // Default: localhost for development
    const defaultUrl = 'http://localhost:5000';
    console.log('🔧 Using default development Socket URL:', defaultUrl);
    return defaultUrl;
  } catch (error) {
    console.error('❌ Error determining Socket URL, using default:', error);
    return 'http://localhost:5000';
  }
};

export const API_URL = getApiUrl();
export const SOCKET_URL = getSocketUrl();

// Log configuration on module load
console.log('🔧 API Configuration:', { API_URL, SOCKET_URL });

