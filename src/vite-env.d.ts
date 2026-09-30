/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Backend URL (Railway). Defaults to http://localhost:3001 in development.
  // API keys live on the backend only - never add them here.
  readonly VITE_BACKEND_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
