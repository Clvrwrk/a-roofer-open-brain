// Per-invoice header context for the credit-memo workspaces (Weekly CM + Sent CM).
//
// A claim header used to read "Invoice 0050033202-002 — credit requested: $92.25". That
// is not enough to act on or to answer a vendor's first question. Chris asked for the
// PE office, the vendor, the vendor branch (name + id), the job and the invoice date.
//
// Both surfaces load this through the SAME function so their headers cannot drift.
//
// Perf: v_invoice_audit_invoice is the heavy pricing view, but a filtered
// `invoice_number IN (...)` pushes down to an index scan — 55ms for a page's worth of
// invoices. Chunked anyway, because a long URL filter is its own truncation trap.

const CHUNK = 200;

export interface CmRequestHeader {
  office: string;
  branchNumber: string;
  branchName: string;
  invoiceDate: string;
  jobNumber: string;
  acculynxJobId: string | null;
  clientName: string;
}

const ACCULYNX_JOB_BASE_URL = "https://my.acculynx.com/jobs";

export function acculynxJobHref(jobId: string | null): string | null {
  return jobId ? `${ACCULYNX_JOB_BASE_URL}/${encodeURIComponent(jobId)}` : null;
}

export async function loadCmRequestHeaders(
  client: any,
  invoiceNumbers: string[],
): Promise<Map<string, CmRequestHeader>> {
  const out = new Map<string, CmRequestHeader>();
  if (!client || !invoiceNumbers.length) return out;

  for (let i = 0; i < invoiceNumbers.length; i += CHUNK) {
    const slice = invoiceNumbers.slice(i, i + CHUNK);
    // Job lookup spans BOTH matchers: v_invoice_acculynx_match covers abc_invoices only,
    // so SRS/QXO claims need the vendor_invoices counterpart (migration 250) or the header
    // prints "no job on the PO" against a PO that plainly reads KS-189.
    const [{ data: invRows }, { data: abcJobs }, { data: vendorJobs }] = await Promise.all([
      client
        .from("v_invoice_audit_invoice")
        .select("invoice_number,invoice_date,branch_number,branch_name,office")
        .in("invoice_number", slice),
      client
        .from("v_invoice_acculynx_match")
        .select("invoice_number,pe_job_number,acculynx_job_id,client_name")
        .in("invoice_number", slice),
      client
        .from("v_vendor_invoice_acculynx_match")
        .select("invoice_number,pe_job_number,acculynx_job_id,client_name")
        .in("invoice_number", slice),
    ]);

    const jobByInvoice = new Map<string, any>();
    for (const j of (vendorJobs as any[] | null) ?? []) if (j?.pe_job_number) jobByInvoice.set(String(j.invoice_number), j);
    // ABC wins on a collision — its matcher has three tiers, the vendor one has a single
    // PO-token tier.
    for (const j of (abcJobs as any[] | null) ?? []) if (j?.pe_job_number) jobByInvoice.set(String(j.invoice_number), j);

    for (const r of (invRows as any[] | null) ?? []) {
      const key = String(r.invoice_number);
      const j = jobByInvoice.get(key);
      out.set(key, {
        office: r.office ?? "",
        branchNumber: r.branch_number ?? "",
        branchName: r.branch_name ?? "",
        invoiceDate: r.invoice_date ? String(r.invoice_date).slice(0, 10) : "",
        jobNumber: j?.pe_job_number ?? "",
        // Only a real AccuLynx id becomes a link — a bare PE job number stays text
        // rather than a dead href.
        acculynxJobId: j?.acculynx_job_id ?? null,
        clientName: j?.client_name ?? "",
      });
    }
  }
  return out;
}
