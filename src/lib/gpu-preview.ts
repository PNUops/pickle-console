/** GPU screens are available only in explicitly enabled development previews. */
export function gpuPreviewEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_GPU_PREVIEW === '1'
}
