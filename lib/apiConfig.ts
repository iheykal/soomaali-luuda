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
        const url = `${window.location.origin}/api`;
        console.log('🔧 Using same origin API URL:', url);
        return url;
      }
      
      // Auto-detect Render backend URL pattern
      // If frontend is on Render (soomaali-ludda.onrender.com), try backend (soomaali-luuda-backend.onrender.com)
      if (hostname.includes('onrender.com')) {
        // Try common backend naming patterns
        const baseName = hostname.replace('.onrender.com', '');
        
        // Special case: handle spelling variations (ludda vs luuda)
        let backendBaseName = baseName;
        if (baseName.includes('ludda')) {
          backendBaseName = baseName.replace('ludda', 'luuda');
        }
        
        // Try: baseName-backend
        const backendUrl = `https://${backendBaseName}-backend.onrender.com/api`;
        console.log('🔧 Auto-detected Render backend URL:', backendUrl);
        console.log('⚠️ If this is wrong, set VITE_API_URL environment variable in Render');
        return backendUrl;
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
    // If nothing else matches, prefer the deployed backend URL (Render). This avoids frontend attempting to reach :5000 in production.
    const defaultUrl = 'https://soomaali-ludda-backend.onrender.com/api';
    console.log('🔧 Using default API URL (deployed):', defaultUrl);
    return defaultUrl;
  } catch (error) {
    console.error('❌ Error determining API URL, using default:', error);
    return 'https://soomaali-ludda-backend.onrender.com/api';
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
        
        // Auto-detect Render backend URL pattern
        // If frontend is on Render (soomaali-ludda.onrender.com), try backend (soomaali-luuda-backend.onrender.com)
        if (hostname.includes('onrender.com')) {
          // Try common backend naming patterns
          const baseName = hostname.replace('.onrender.com', '');
          
          // Special case: handle spelling variations (ludda vs luuda)
          let backendBaseName = baseName;
          if (baseName.includes('ludda')) {
            backendBaseName = baseName.replace('ludda', 'luuda');
          }
          
          const backendUrl = `https://${backendBaseName}-backend.onrender.com`;
          console.log('🔧 Auto-detected Render backend Socket URL:', backendUrl);
          console.log('⚠️ If this is wrong, set VITE_SOCKET_URL environment variable in Render');
          return backendUrl;
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
    // Default to deployed backend domain for sockets to avoid :5000 in production
    const defaultUrl = 'https://soomaali-ludda-backend.onrender.com';
    console.log('🔧 Using default Socket URL (deployed):', defaultUrl);
    return defaultUrl;
  } catch (error) {
    console.error('❌ Error determining Socket URL, using default:', error);
    return 'https://soomaali-ludda-backend.onrender.com';
  }
};

export const API_URL = getApiUrl();
export const SOCKET_URL = getSocketUrl();

// Log configuration on module load
console.log('🔧 API Configuration:', { API_URL, SOCKET_URL });

