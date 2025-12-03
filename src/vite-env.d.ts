/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY: string
  // Add more frontend env variables here as needed
  // Note: FISH_AUDIO_API_KEY is on backend only, not here
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
