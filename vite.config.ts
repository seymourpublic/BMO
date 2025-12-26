import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    // Code splitting for better performance
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom'],
          // Separate large dependencies
          'lucide': ['lucide-react']
        }
      }
    },
    // Minification options
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep for debugging, set true for production
        drop_debugger: true,
        pure_funcs: ['console.log'] // Remove console.logs in production
      }
    },
    // Chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Target modern browsers for smaller bundle
    target: 'es2020'
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'lucide-react']
  }
})
