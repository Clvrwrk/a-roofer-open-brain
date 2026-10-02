// syncCrmPipeline(..., onlyJobIds) — the walk-only run's scoped rebuild (2026-10-02).
// Run: deno test supabase/functions/acculynx-sync/resources/crm-pipeline-scoped.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { syncCrmPipeline } from "./crm-pipeline.ts";

const ACCT = { account_key: "wichita" };

function makeSb(jobCount: number) {
  const jobs = Array.from({ length: jobCount }, (_, i) => ({
    id: `job-${i}`, job_name: `KS-${i}: Client ${i}`, job_number: `KS-${i}`, current_milestone: "Closed",
    milestone_date: "2026-07-04T16:38:13Z", modified_date: "2026-07-04T16:38:13Z", raw: {},
  }));
  const inCalls: { table: string; n: number }[] = [];
  const upserts: Record<string, unknown>[][] = [];
  const sb = {
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        like: () => q,
        order: () => q,
        limit: () => Promise.resolve({ data: [], error: null }),
        range: () => Promise.resolve({ data: [], error: null }),
        in: (_col: string, ids: string[]) => {
          inCalls.push({ table, n: ids.length });
          const data = table === "acculynx_jobs"
            ? jobs.filter((j) => ids.includes(j.id))
            : table === "acculynx_job_financials"
            ? ids.map((id) => ({ job_id: id, approved_job_value: 100, balance_due: 0 }))
            : [];
          // Chainable AND awaitable, like the PostgREST builder.
          const res = { data, error: null };
          const chain: any = {
            order: () => chain,
            limit: () => chain,
            range: () => chain,
            then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, bad),
          };
          return chain;
        },
        upsert: (rows: Record<string, unknown>[]) => {
          upserts.push(rows);
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  };
  return { sb, inCalls, upserts, ids: jobs.map((j) => j.id) };
}

Deno.test("syncCrmPipeline onlyJobIds — rebuilds just those jobs, .in() lists capped at 100", async () => {
  const { sb, inCalls, upserts, ids } = makeSb(230);
  const res = await syncCrmPipeline(sb, ACCT, Date.now() + 60_000, new Map([["job-1", "Bob Smolek"]]), "batch-1", ids);
  assertEquals(res.error, undefined);
  assertEquals(res.upserted, 230);
  const jobIns = inCalls.filter((c) => c.table === "acculynx_jobs").map((c) => c.n);
  assertEquals(jobIns, [100, 100, 30]);
  const all = upserts.flat();
  assertEquals(all.length, 230);
  assertEquals(all.find((r) => r.acculynx_job_id === "job-0")?.current_milestone, "closed");
  // Rep partitioning: the one row with a rep travels alone, never mixed with rep-less rows.
  const withRep = upserts.find((p) => p.some((r) => "primary_salesperson" in r))!;
  assertEquals(withRep.every((r) => "primary_salesperson" in r), true);
});

Deno.test("syncCrmPipeline onlyJobIds — empty list is a no-op", async () => {
  const { sb, upserts } = makeSb(5);
  const res = await syncCrmPipeline(sb, ACCT, Date.now() + 60_000, new Map(), "batch-1", []);
  assertEquals(res.upserted, 0);
  assertEquals(upserts.length, 0);
});
