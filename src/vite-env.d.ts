interface ImportMetaEnv {
  readonly VITE_PUBLIC_SOURCE_POLICY_ENABLED?: string
  readonly VITE_VM_NETWORK_POLICY_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const PICKLE_DEPLOY_TARGET: 'production' | 'development'
declare const PICKLE_PUBLIC_HOST: string
declare const PICKLE_SSH_GATEWAY_HOST: string
declare const PICKLE_LLM_API_BASE_URL: string
