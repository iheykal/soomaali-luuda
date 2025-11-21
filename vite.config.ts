import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // Increase chunk size warning limit
        chunkSizeWarningLimit: 600,
        rollupOptions: {
          output: {
            // Manual chunking to split vendor libraries from app code
            manualChunks(id) {
              // React and React DOM
              if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
                return 'react-vendor';
              }
              // Socket.IO client
              if (id.includes('node_modules/socket.io-client')) {
                return 'socket-vendor';
              }
              // Google GenAI - only if actually bundled (not loaded via CDN)
              if (id.includes('node_modules/@google/genai')) {
                return 'genai-vendor';
              }
              // Other node_modules go into vendor chunk
              if (id.includes('node_modules')) {
                return 'vendor';
              }
            }
          }
        }
      }
    };
});
