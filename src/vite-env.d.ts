interface ImportMetaEnv {
  readonly VITE_PUBLIC_SOURCE_POLICY_ENABLED?: string
  readonly VITE_VM_NETWORK_POLICY_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
