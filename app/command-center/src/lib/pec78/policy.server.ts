import {
  PEC78_CONTRACT_VERSION,
  PEC78_MAYA_PERSONA,
  PEC78_MAYA_SUBJECT,
  PEC78_ROUTE_CAPABILITIES,
  type Pec78Capability,
} from "./contract";

export interface Pec78PolicyInput {
  contractVersion?: string;
  subject?: string;
  personaId?: string;
  capability?: string;
  method: string;
  pathname: string;
}

export type Pec78PolicyDecision = { allow: true; capability: Pec78Capability } | { allow: false; code: string };

export function evaluatePec78Policy(input: Pec78PolicyInput): Pec78PolicyDecision {
  if (input.contractVersion !== PEC78_CONTRACT_VERSION) return { allow: false, code: "contract_version_denied" };
  if (input.subject !== PEC78_MAYA_SUBJECT || input.personaId !== PEC78_MAYA_PERSONA) {
    return { allow: false, code: "principal_denied" };
  }
  const capability = PEC78_ROUTE_CAPABILITIES.get(`${input.method.toUpperCase()} ${input.pathname}`);
  if (!capability || input.capability !== capability) return { allow: false, code: "capability_denied" };
  return { allow: true, capability };
}
