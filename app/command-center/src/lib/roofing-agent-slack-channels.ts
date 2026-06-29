export type RoofingOpsChannelCategory = "human_operational" | "ops_conductor_only" | "deployment_validation" | "dev_only";

export interface RoofingOpsSlackChannel {
  name: string;
  id: string;
  category: RoofingOpsChannelCategory;
  purpose: string;
}

export const ROOFING_OPS_SLACK_CHANNELS: RoofingOpsSlackChannel[] = [
  {
    name: "accounting-vendor-intake",
    id: "C0BCUF29G1H",
    category: "human_operational",
    purpose: "Vendor intake, invoice/AP/AR document flow, and general accounting intake.",
  },
  {
    name: "accounting-credit-memos",
    id: "C0BD4EW4RU4",
    category: "human_operational",
    purpose: "Credit memo packets, vendor dispute drafts, and human review.",
  },
  {
    name: "accounting-product-catalog-review",
    id: "C0BCYNW98RL",
    category: "human_operational",
    purpose: "Product catalog, SKU/UOM, price agreements, research approvals, and marketing proof review.",
  },
  {
    name: "ob-agents-internal",
    id: "C0BD8U44HL3",
    category: "ops_conductor_only",
    purpose: "Raw Roofing-Ops agent cron output. Ops Conductor only; not human-facing.",
  },
  {
    name: "ob-ops-conductor",
    id: "C0BDF8QRF8A",
    category: "ops_conductor_only",
    purpose: "Chris and Ops Conductor private channel for curated routing/escalation.",
  },
  {
    name: "agent-deploy-validation",
    id: "C0BD7L43PC2",
    category: "deployment_validation",
    purpose: "Agent deployment validation reports.",
  },
  {
    name: "agent-profile-builder",
    id: "C0BD7L0M02W",
    category: "deployment_validation",
    purpose: "First-run agent introductions and profile summaries.",
  },
  {
    name: "ob-dev-internal",
    id: "C0BDJTVMRE0",
    category: "dev_only",
    purpose: "Raw DevTeam agent output. Roofing-Ops agents must not join.",
  },
  {
    name: "ob-dev-conductor",
    id: "C0BDD623DQW",
    category: "dev_only",
    purpose: "Chris and Dev Conductor private channel. Roofing-Ops agents must not join.",
  },
];

export const HUMAN_OPERATIONAL_CHANNEL_IDS = new Set(
  ROOFING_OPS_SLACK_CHANNELS.filter((channel) => channel.category === "human_operational").map((channel) => channel.id),
);

export const OPS_CONDUCTOR_ONLY_CHANNEL_IDS = new Set(
  ROOFING_OPS_SLACK_CHANNELS.filter((channel) => channel.category === "ops_conductor_only").map((channel) => channel.id),
);

export function isHumanOperationalChannel(channelId: string): boolean {
  return HUMAN_OPERATIONAL_CHANNEL_IDS.has(channelId);
}
