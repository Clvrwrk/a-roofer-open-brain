// GET /api/accounting/qb-bank-csv?vendor=<slug>&mode=preview|export&since=YYYY-MM-DD
// QB bank-ledger CSV export (mig 226, Chris directive 2026-08-09).
//
// Generates the per-vendor CSV a HUMAN downloads and loads into QuickBooks — the
// agent never writes to QBO (hard rule 13, docs/74). Three row kinds:
//   invoice   — Description "<ACRONYM>-INV#<invoice#>", Spent = invoice total
//   cm_tbd    — Description "CM-TBD-INV#<original invoice#>", Received = total
//               requested credit for that invoice (all line CMs summed). The QA
//               line: when the real credit memo arrives it should replace/match
//               this pending amount, proving every requested CM was received.
//   cm_actual — Description "CMINV#<cm invoice#>-OriginalINV#<original#>",
//               Received = credit memo total
// Check No = the AccuLynx job number alone (e.g. "KS-131"), QB's usable cap is
// 12 chars (PEC-200); blank when no job match. The client's full name rides at
// the END of the Description instead. Dates are ISO YYYY-MM-DD.
//
// mode=preview (default) renders the CSV without recording anything.
// mode=export also stamps qb_bank_export_log (unique per vendor/kind/doc) so a
// row is only ever handed to QB once; re-running export skips stamped rows.
import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { cmVendorBySlug } from "@lib/cm-vendor-roster";
import { commercialCheckNo } from "@lib/qb-bank-job";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

const CHECK_NO_MAX = 12; // QB check-number field cap (PEC-200)

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// AccuLynx job number only (e.g. "KS-131"); "" when no job match — the client
// name lives at the end of the Description instead (PEC-200).
const checkNo = (job: string | null | undefined): string =>
  String(job ?? "").trim().slice(0, CHECK_NO_MAX);

// "<doc reference> - <Client Name>"; reference alone when the client is unknown.
const describe = (ref: string, client: string | null | undefined): string => {
  const c = String(client ?? "").trim().replace(/\s+/g, " ");
  return c ? `${ref} - ${c}` : ref;
};

// QB only accepts a real date; normalize to YYYY-MM-DD and reject anything else.
const isoDate = (v: unknown): string => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

interface CsvRow {
  kind: "invoice" | "cm_tbd" | "cm_actual";
  docNumber: string;
  date: string;
  checkNo: string;
  description: string;
  spent: number | null;
  received: number | null;
}

export const GET: APIRoute = async ({ locals, url }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot export QB bank files." }, { status: 403 });
  }

  const vendor = cmVendorBySlug(url.searchParams.get("vendor"));
  if (!vendor) {
    return jsonApiResponse({ error: "invalid_request", error_description: "vendor=<abc-supply|srs|qxo> is required." }, { status: 400 });
  }
  const mode = url.searchParams.get("mode") === "export" ? "export" : "preview";
  const sinceParam = url.searchParams.get("since");
  const since = /^\d{4}-\d{2}-\d{2}$/.test(sinceParam ?? "") ? (sinceParam as string) : "2026-08-01";

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  // Rows already handed to QB — never export twice.
  const exported = new Set<string>();
  {
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from("qb_bank_export_log")
        .select("row_kind, doc_number")
        .eq("vendor_slug", vendor.slug)
        .range(from, from + 999);
      if (error) return jsonApiResponse({ error: "qb_bank_export_log", error_description: error.message }, { status: 409 });
      for (const r of data ?? []) exported.add(`${r.row_kind}:${r.doc_number}`);
      if (!data || data.length < 1000) break;
      from += 1000;
    }
  }

  const rows: CsvRow[] = [];
  // job/client resolution maps, filled per vendor below
  const jobByInvoice = new Map<string, { job: string | null; client: string | null }>();

  if (vendor.slug === "abc-supply") {
    // ABC job/customer resolution rides the PO-driven match view. PEC-186 follow-up
    // (Chris 2026-08-09): do NOT require matched=true — the audit surface shows the
    // job number for every invoice whose PO carries one (pe_job_number), and recent
    // invoices sit matched=false until the AccuLynx link lands. Job precedence:
    // pe_job_number, then canonical_po (the corrected job-shaped PO).
    // Paginate: the view exceeds PostgREST's 1000-row cap, and an un-ranged read
    // silently drops the NEWEST invoices from the map (playbook: exactly-1000).
    for (let from = 0; ; from += 1000) {
      const { data: matches } = await client
        .from("v_invoice_acculynx_match")
        .select("invoice_number, pe_job_number, canonical_po, client_name, matched")
        .order("invoice_number")
        .range(from, from + 999);
      for (const m of matches ?? []) {
        const job = String(m.pe_job_number ?? m.canonical_po ?? "").trim().toUpperCase() || null;
        jobByInvoice.set(String(m.invoice_number), { job, client: m.client_name ?? null });
      }
      if (!matches || matches.length < 1000) break;
    }

    const { data: invs, error } = await client
      .from("abc_invoices")
      .select("invoice_number, invoice_date, total_amount, is_credit_memo, purchase_order_number, ship_to_name")
      .gte("invoice_date", since)
      .order("invoice_date")
      .limit(5000);
    if (error) return jsonApiResponse({ error: "abc_invoices", error_description: error.message }, { status: 409 });

    // PEC-208: when the match view lacks a job-shaped number (sloppy ABC POs like
    // "ks191", "KS 178", "tx450" fall back to the ship-to ACCOUNT name, e.g.
    // "Storm/wichita"), try to recover the job from the raw PO: normalize to
    // XX-123 shape, then only trust it if that job actually exists in AccuLynx.
    const JOB_SHAPE = /^[A-Z]{2,3}-\d{1,5}$/;
    const normalizePo = (po: string): string | null => {
      const m = po.trim().toUpperCase().replace(/\s+/g, "").match(/^([A-Z]{2,3})-?(\d{1,5})$/);
      return m ? `${m[1]}-${m[2]}` : null;
    };
    const candidates = new Map<string, string>(); // invoice_number → normalized job candidate
    for (const i of invs ?? []) {
      const n = String(i.invoice_number);
      const cur = jobByInvoice.get(n);
      const curJob = String(cur?.job ?? "");
      if (JOB_SHAPE.test(curJob) || JOB_SHAPE.test(curJob.replace(/-\d+$/, ""))) continue;
      const cand = normalizePo(String((i as any).purchase_order_number ?? ""));
      if (cand) candidates.set(n, cand);
    }
    if (candidates.size) {
      const uniq = [...new Set(candidates.values())];
      const verified = new Set<string>();
      for (let i = 0; i < uniq.length; i += 200) {
        const { data: jobs } = await client
          .from("acculynx_jobs")
          .select("job_number, job_name")
          .in("job_number", uniq.slice(i, i + 200));
        for (const j of jobs ?? []) {
          verified.add(String(j.job_number).toUpperCase());
          const name = String(j.job_name ?? "").replace(new RegExp(`^${String(j.job_number)}\\s*:\\s*`, "i"), "").trim();
          for (const [inv, cand] of candidates) {
            if (cand === String(j.job_number).toUpperCase()) {
              jobByInvoice.set(inv, { job: cand, client: name || jobByInvoice.get(inv)?.client || null });
            }
          }
        }
      }
    }

    // Commercial override (Chris 2026-08-18, PEC-214). Commercial work is not
    // tracked as an AccuLynx job, so the match view falls back to the ship-to
    // ACCOUNT name and every commercial invoice used to export Check No
    // "Commercial" — useless for job costing. The Customer PO# is where PE
    // actually records the commercial job reference, so for these invoices it
    // IS the job number and takes precedence over everything above.
    //
    // Detection uses the ship-to NAME (mig 231 generated column) rather than the
    // ship-to number 2036874-17, so a second Commercial ship-to would still be
    // caught. Value is used verbatim (trim + uppercase, then the shared 12-char
    // QB cap) — including freeform references like "SERVICE STOCK"; we do NOT
    // try to normalize job-shaped POs such as "TX454" into "TX-454", because on
    // a commercial invoice the PO as written is the reference accounting uses.
    // A blank Customer PO# falls through to the standard resolution above.
    for (const i of invs ?? []) {
      const po = commercialCheckNo((i as any).ship_to_name, (i as any).purchase_order_number);
      if (!po) continue; // not commercial, or blank PO → keep the standard resolution
      const n = String(i.invoice_number);
      jobByInvoice.set(n, { job: po, client: jobByInvoice.get(n)?.client ?? null });
    }

    const cmNumbers = (invs ?? []).filter((i) => i.is_credit_memo).map((i) => String(i.invoice_number));
    const originalByCm = new Map<string, string | null>();
    if (cmNumbers.length) {
      const { data: cmAudit } = await client
        .from("v_credit_memo_audit")
        .select("invoice_number, original_invoice_number")
        .in("invoice_number", cmNumbers.slice(0, 1000));
      for (const c of cmAudit ?? []) originalByCm.set(String(c.invoice_number), c.original_invoice_number);
    }

    for (const i of invs ?? []) {
      const n = String(i.invoice_number);
      const total = Math.abs(Number(i.total_amount ?? 0));
      const jc = jobByInvoice.get(n) ?? { job: null, client: null };
      if (i.is_credit_memo) {
        if (exported.has(`cm_actual:${n}`)) continue;
        const orig = originalByCm.get(n);
        const origJc = orig ? (jobByInvoice.get(String(orig)) ?? jc) : jc;
        rows.push({
          kind: "cm_actual", docNumber: n, date: isoDate(i.invoice_date),
          checkNo: checkNo(origJc.job),
          description: describe(`CMINV#${n}${orig ? `-OriginalINV#${orig}` : ""}`, origJc.client),
          spent: null, received: total,
        });
      } else {
        if (exported.has(`invoice:${n}`)) continue;
        rows.push({
          kind: "invoice", docNumber: n, date: isoDate(i.invoice_date),
          checkNo: checkNo(jc.job),
          description: describe(`${vendor.acronym}-INV#${n}`, jc.client),
          spent: total, received: null,
        });
      }
    }
  } else {
    // SRS / QXO: vendor_invoices carries the PE job number in po_number.
    const { data: vrow } = await client.from("vendors").select("id").eq("slug", vendor.slug).maybeSingle();
    if (!vrow) return jsonApiResponse({ error: "vendor_not_found", error_description: vendor.slug }, { status: 404 });
    const { data: invs, error } = await client
      .from("vendor_invoices")
      .select("invoice_number, invoice_date, total_due, doc_type, po_number, raw")
      .eq("vendor_id", (vrow as any).id)
      .gte("invoice_date", since)
      .order("invoice_date")
      .limit(5000);
    if (error) return jsonApiResponse({ error: "vendor_invoices", error_description: error.message }, { status: 409 });

    const pos = [...new Set((invs ?? []).map((i) => String(i.po_number ?? "").trim().toUpperCase()).filter(Boolean))];
    const clientByJob = new Map<string, string>();
    if (pos.length) {
      const { data: jobs } = await client
        .from("acculynx_jobs")
        .select("job_number, job_name")
        .in("job_number", pos)
        .limit(2000);
      for (const j of jobs ?? []) {
        // job_name is "<JOB#>: <Customer Name>" — strip the job prefix.
        const name = String(j.job_name ?? "").replace(new RegExp(`^${String(j.job_number)}\\s*:\\s*`, "i"), "").trim();
        clientByJob.set(String(j.job_number).toUpperCase(), name);
      }
    }

    for (const i of invs ?? []) {
      const n = String(i.invoice_number);
      const total = Math.abs(Number(i.total_due ?? 0));
      const job = String(i.po_number ?? "").trim().toUpperCase() || null;
      const clientName = job ? (clientByJob.get(job) ?? null) : null;
      // Feed the shared map so cm_tbd rows resolve job/client for SRS/QXO too
      // (pre-PEC-200 this map was ABC-only and SRS CM-TBD rows went blank).
      jobByInvoice.set(n, { job, client: clientName });
      if (i.doc_type === "credit") {
        if (exported.has(`cm_actual:${n}`)) continue;
        const orig = String((i.raw as any)?.original_invoice_number ?? (i.raw as any)?.originalInvoiceNumber ?? "").trim() || null;
        rows.push({
          kind: "cm_actual", docNumber: n, date: isoDate(i.invoice_date),
          checkNo: checkNo(job),
          description: describe(`CMINV#${n}${orig ? `-OriginalINV#${orig}` : ""}`, clientName),
          spent: null, received: total,
        });
      } else {
        if (exported.has(`invoice:${n}`)) continue;
        rows.push({
          kind: "invoice", docNumber: n, date: isoDate(i.invoice_date),
          checkNo: checkNo(job),
          description: describe(`${vendor.acronym}-INV#${n}`, clientName),
          spent: total, received: null,
        });
      }
    }
  }

  // cm_tbd — one pending Received line per invoice whose requested CM email went
  // out (status 'sent'), amount = total requested credit for that invoice. The
  // QA marker that the vendor's credit memo eventually arrives.
  {
    const { data: reqs, error } = await client
      .from("credit_memo_requests")
      .select("invoice_number, expected_credit, sent_at")
      .eq("request_kind", "requested")
      .eq("vendor_slug", vendor.slug)
      .eq("status", "sent")
      .limit(2000);
    if (error) return jsonApiResponse({ error: "credit_memo_requests", error_description: error.message }, { status: 409 });
    for (const r of reqs ?? []) {
      const n = String(r.invoice_number);
      if (exported.has(`cm_tbd:${n}`)) continue;
      const jc = jobByInvoice.get(n) ?? { job: null, client: null };
      rows.push({
        kind: "cm_tbd", docNumber: n,
        date: isoDate(r.sent_at),
        checkNo: checkNo(jc.job),
        description: describe(`CM-TBD-INV#${n}`, jc.client),
        spent: null, received: Math.abs(Number(r.expected_credit ?? 0)),
      });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  if (mode === "export" && rows.length) {
    const batchId = crypto.randomUUID();
    const who = actor.displayName ?? "operator";
    // Partitioned inserts (PostgREST batch discipline): 500 rows per call.
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({
        vendor_slug: vendor.slug,
        row_kind: r.kind,
        doc_number: r.docNumber,
        txn_date: r.date || null,
        check_no: r.checkNo || null,
        bank_description: r.description,
        spent: r.spent,
        received: r.received,
        batch_id: batchId,
        exported_by: who,
      }));
      const { error } = await client.from("qb_bank_export_log").upsert(chunk, { onConflict: "vendor_slug,row_kind,doc_number", ignoreDuplicates: true });
      if (error) return jsonApiResponse({ error: "export_stamp_failed", error_description: error.message }, { status: 500 });
    }
  }

  let csv = "Date,Check No,Description,Spent,Received\n";
  for (const r of rows) {
    csv += [r.date, r.checkNo, r.description, r.spent != null ? r.spent.toFixed(2) : "", r.received != null ? r.received.toFixed(2) : ""].map(csvCell).join(",") + "\n";
  }
  const name = `qb_bank_${vendor.slug.replace(/[^a-z0-9]+/gi, "_")}_${mode}_${today}.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
};
