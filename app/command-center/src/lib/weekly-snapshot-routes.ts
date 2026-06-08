import type { SnapshotRecord, SnapshotRow, WeeklySnapshot } from "@lib/weekly-snapshot";

export type WeeklySnapshotSlice = "leads" | "jobs-sold" | "sales" | "ar" | "payments" | "claims" | "activity";

export interface WeeklySnapshotSliceView {
  title: string;
  description: string;
  rows: SnapshotRow[];
  records: SnapshotRecord[];
}

const sliceLabels: Record<WeeklySnapshotSlice, { title: string; description: string }> = {
  activity: {
    title: "Activity",
    description: "Activity atoms captured in the selected snapshot window.",
  },
  ar: {
    title: "Accounts Receivable",
    description: "Open AR balances and receivable records surfaced by the mirror.",
  },
  claims: {
    title: "Insurance Claims",
    description: "Claims and supplement paths in motion during the snapshot window.",
  },
  "jobs-sold": {
    title: "Jobs Sold",
    description: "Jobs approved, won, or moved into production in the snapshot window.",
  },
  leads: {
    title: "New Leads",
    description: "Lead records created or moved into the lead phase in the snapshot window.",
  },
  payments: {
    title: "Payments Received",
    description: "Payment atoms and payment-like activity in the snapshot window.",
  },
  sales: {
    title: "Sales Leaderboard",
    description: "Sales records grouped by representative in the snapshot window.",
  },
};

export function allWeeklySnapshotRows(snapshot: WeeklySnapshot) {
  return [
    ...snapshot.sections.newLeads,
    ...snapshot.sections.jobsSold,
    ...snapshot.sections.salesLeaderboard,
    ...snapshot.sections.accountsReceivable,
    ...snapshot.sections.claims,
    ...snapshot.sections.activity,
  ];
}

export function allWeeklySnapshotRecords(snapshot: WeeklySnapshot) {
  const records = new Map<string, SnapshotRecord>();
  for (const metric of snapshot.metrics) {
    for (const record of metric.records) records.set(`${record.type}-${record.id}`, record);
  }
  for (const row of allWeeklySnapshotRows(snapshot)) {
    for (const record of row.records) records.set(`${record.type}-${record.id}`, record);
  }
  return Array.from(records.values());
}

export function getWeeklySnapshotSlice(snapshot: WeeklySnapshot, slice: string | undefined): WeeklySnapshotSliceView | null {
  if (!slice || !(slice in sliceLabels)) return null;
  const typedSlice = slice as WeeklySnapshotSlice;
  const label = sliceLabels[typedSlice];

  if (typedSlice === "leads") {
    return { ...label, rows: snapshot.sections.newLeads, records: snapshot.sections.newLeads.flatMap((row) => row.records) };
  }
  if (typedSlice === "jobs-sold") {
    return { ...label, rows: snapshot.sections.jobsSold, records: snapshot.sections.jobsSold.flatMap((row) => row.records) };
  }
  if (typedSlice === "sales") {
    return { ...label, rows: snapshot.sections.salesLeaderboard, records: snapshot.sections.salesLeaderboard.flatMap((row) => row.records) };
  }
  if (typedSlice === "ar") {
    return { ...label, rows: snapshot.sections.accountsReceivable, records: snapshot.sections.accountsReceivable.flatMap((row) => row.records) };
  }
  if (typedSlice === "claims") {
    return { ...label, rows: snapshot.sections.claims, records: snapshot.sections.claims.flatMap((row) => row.records) };
  }
  if (typedSlice === "activity") {
    return { ...label, rows: snapshot.sections.activity, records: snapshot.sections.activity.flatMap((row) => row.records) };
  }
  if (typedSlice === "payments") {
    const metric = snapshot.metrics.find((item) => item.id === "payments-received" || item.id === "reference-payments");
    return { ...label, rows: [], records: metric?.records ?? [] };
  }
  return null;
}

export function getWeeklySnapshotRep(snapshot: WeeklySnapshot, repSlug: string | undefined): WeeklySnapshotSliceView | null {
  if (!repSlug) return null;
  const row = snapshot.sections.salesLeaderboard.find((item) => item.href.endsWith(`/rep/${encodeURIComponent(repSlug)}`));
  if (!row) return null;
  return {
    title: row.label,
    description: `Sales leaderboard detail for ${row.label}.`,
    rows: [row],
    records: row.records,
  };
}

export function findWeeklySnapshotRecord(snapshot: WeeklySnapshot, encodedRecordKey: string | undefined) {
  if (!encodedRecordKey) return null;
  const decoded = decodeURIComponent(encodedRecordKey);
  return allWeeklySnapshotRecords(snapshot).find((record) => `${record.type}-${record.id}` === decoded) ?? null;
}
