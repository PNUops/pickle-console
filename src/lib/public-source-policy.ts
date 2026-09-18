/** The source-policy controls stay absent unless a build opts in explicitly. */
export function publicSourcePolicyEnabled(): boolean {
  return import.meta.env.VITE_PUBLIC_SOURCE_POLICY_ENABLED === '1'
}
