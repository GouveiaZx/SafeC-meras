/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_WS_URL: string
  readonly VITE_BACKEND_URL: string
  readonly VITE_FRONTEND_URL: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_ZLM_BASE_URL: string
  readonly VITE_STREAM_QUALITY: string
  readonly VITE_ENABLE_DEBUG_STREAMING: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}