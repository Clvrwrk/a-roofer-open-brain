import { validateEffectContext } from "./effect-ledger.mjs";

export function authorizeTool({ permissions, router, activation, context }) {
  validateEffectContext(context);
  if (!activation?.active) throw new Error("tool_activation_required");
  if (permissions.default !== "deny" || router.default !== "deny") throw new Error("tool_default_deny_required");
  if (permissions.provider_adapters.length === 0 || router.adapters.length === 0) throw new Error("tool_adapter_not_installed");
  const adapter = router.adapters.find((item) => item.name === context.tool && item.enabled === true);
  if (!adapter) throw new Error("tool_not_allowlisted");
  return Object.freeze(adapter);
}
