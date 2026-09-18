/** VM firewall controls stay absent unless a build opts in explicitly. */
export function vmNetworkPolicyEnabled(): boolean {
  return import.meta.env.VITE_VM_NETWORK_POLICY_ENABLED === '1'
}
