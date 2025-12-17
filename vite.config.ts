import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    // OPTIMIZATION: Code splitting for faster initial load
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Three.js into separate chunk (even though mostly unused now)
          // This keeps the main bundle smaller
          'three': ['three'],
          
          // Split React vendor code
          'react-vendor': ['react', 'react-dom'],
          
          // Split icon library (lucide-react)
          'icons': ['lucide-react'],
        }
      }
    },
    
    // Enable minification and compression
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console for debugging
        drop_debugger: true,
        pure_funcs: ['console.log'], // Optional: remove console.logs in production
      }
    },
    
    // Chunk size warnings
    chunkSizeWarningLimit: 1000, // Warn if chunks exceed 1MB
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'three', 'lucide-react'],
  },
})
