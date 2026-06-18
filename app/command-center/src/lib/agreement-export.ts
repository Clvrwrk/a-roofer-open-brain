// Shared export model for the Price Agreement Builder (Item 3, slice 3).
// Flattens the per-branch builder into export rows. Final price per item =
// proposed price (the negotiated target) → else prior price → else 0.

import { loadAgreementBuilder } from "@lib/agreement-package";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export interface ExportRow {
  itemNumber: string;
  familyName: string;
  description: string;
  uom: string;
  reviewClass: string;
  priorPrice: number | null;
  priorSource: string;
  finalPrice: number;
}

export interface AgreementExport {
  ok: boolean;
  branch: { number: string; name: string; office: string } | null;
  recipient: { name: string; email: string };
  generatedAt: string;
  rows: ExportRow[];
}

export async function buildAgreementExport(branchNumber?: string, env: RuntimeEnv = getRuntimeEnv()): Promise<AgreementExport> {
  const data = await loadAgreementBuilder(branchNumber, env);
  const rows: ExportRow[] = [];
  for (const fam of data.families) {
    for (const v of fam.variations) {
      if (v.excluded) continue;
      const finalPrice = v.proposedPrice != null ? v.proposedPrice : v.priorPrice != null ? v.priorPrice : 0;
      rows.push({
        itemNumber: v.itemNumber,
        familyName: fam.familyName,
        description: v.description,
        uom: v.uom,
        reviewClass: v.reviewClass,
        priorPrice: v.priorPrice,
        priorSource: v.priorPriceSource ?? "",
        finalPrice,
      });
    }
  }
  return {
    ok: data.status === "live" && !!data.branch,
    branch: data.branch,
    recipient: data.recipient,
    generatedAt: data.generatedAt,
    rows,
  };
}

export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
