// acculynx-sync — resources/contacts.ts (Phase 2, plan 02-03; contact channels, migration 320)
//
// Full-sweep contacts sync using pageStartIndex pagination.
// Endpoint: GET /contacts?pageSize=50&pageStartIndex={N}&includes=emailAddress,phoneNumber
//
// Behavioral contracts (asserted by contacts.test.ts):
//   - URL pagination param: pageStartIndex (NOT recordStartIndex — Pitfall 2)
//   - Stamps account_key AND market on every upserted row (no cross-account bleed, T-02-04)
//   - Sets last_seen_by_api on every upserted row (feeds diff detection)
//   - Budget-stop: stops the page loop when Date.now() >= deadline
//   - apiKey is an explicit parameter — never a module-level constant (Pitfall 3)
//
// Contact channels (migration 320, 2026-10-01). Without `includes`, GET /contacts returns every phone and email
// child as a stub ({id, _link}); that is why acculynx_contact_phones / acculynx_contact_emails stayed empty
// ("INTENTIONALLY UNSYNCED in Phase 2", mig 169). The sweep now asks for includes=emailAddress,phoneNumber — the
// same page call, no extra request — and upserts each full child. A contact whose children all came back in full is
// stamped channels_synced_at and any child it no longer has is archived 'removed_from_contact' (never deleted).
// A contact with a stub child left over is not stamped; enrichContactChannels() reads it by id later, within
// whatever run budget is left. If the API ever rejects `includes` (HTTP 400) the sweep re-reads the page without
// it, so contacts keep syncing and the fallback carries the channels.
//
// trust_tier is never written: the column default ('evidence') applies on insert and a tier changed by Quality
// Control is never overwritten (hard rule 4).
//
// Fix (Rule 1 — 2026-06-30): map camelCase API fields to snake_case DB columns;
// removed ...item spread (PostgREST rejects unknown camelCase columns).
// Fix (Rule 1 — 2026-06-30): onConflict changed from "id,account_key" to "id"
// (table PK is id only; no composite unique constraint exists).

// deno-lint-ignore-file no-explicit-any

const ACCULYNX_BASE = "https://api.acculynx.com/api/v2";
const PACE_MS = 130; // ~8 req/s; keeps us well under the 30 req/s IP limit
const MAX_RETRIES = 3;
export const CONTACT_INCLUDES = "emailAddress,phoneNumber";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a URL with 429 retry + exponential backoff.
 * apiKey is an explicit parameter to prevent cross-account key bleed (T-02-04).
 */
async function acculynxGet(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<{ status: number; body: unknown }> {
  let attempt = 0;
  while (true) {
    let res: Response;
    try {
      res = await fetchFn(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
    } catch (e) {
      return { status: 0, body: { fetchError: String(e) } };
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep((Number.isFinite(ra) && ra > 0 ? ra : Math.pow(2, attempt)) * 1000 + Math.random() * 250);
      attempt++;
      continue;
    }
    const ct = res.headers.get("content-type") ?? "";
    const body = ct.includes("json") ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    return { status: res.status, body };
  }
}

/**
 * Map a camelCase AccuLynx contact API item to snake_case DB columns.
 * Only maps fields that exist in the acculynx_contacts table schema.
 */
function mapContact(item: any, acct: any, now: string): Record<string, unknown> {
  const mailing = item.mailingAddress ?? {};
  const billing = item.billingAddress ?? {};
  return {
    id: item.id,
    first_name: item.firstName ?? null,
    last_name: item.lastName ?? null,
    salutation: item.salutation ?? null,
    cross_reference: item.crossReference ?? null,
    company_name: item.companyName ?? null,
    mailing_street1: mailing.street1 ?? null,
    mailing_street2: mailing.street2 ?? null,
    mailing_city: mailing.city ?? null,
    mailing_state: mailing.state?.abbreviation ?? mailing.state ?? null,
    mailing_zip: mailing.zipCode ?? null,
    mailing_country: mailing.country?.abbreviation ?? mailing.country ?? null,
    billing_street1: billing.street1 ?? null,
    billing_street2: billing.street2 ?? null,
    billing_city: billing.city ?? null,
    billing_state: billing.state?.abbreviation ?? billing.state ?? null,
    billing_zip: billing.zipCode ?? null,
    billing_country: billing.country?.abbreviation ?? billing.country ?? null,
    raw: item,
    synced_at: now,
    account_key: acct.account_key,
    market: acct.market,
    last_seen_by_api: now,
  };
}

// ---------------------------------------------------------------------------
// Contact channels (migration 320)
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const typeName = (v: unknown): string | null => str(v) ?? (isObj(v) ? str(v.name) : null);

/** A phone child carries its value only when the response included it in full (`number` present). */
export const isFullPhone = (p: unknown): boolean => isObj(p) && typeof p.id === "string" && "number" in p;
/** An email child carries its value only when the response included it in full (`address` present). */
export const isFullEmail = (e: unknown): boolean => isObj(e) && typeof e.id === "string" && "address" in e;

export function mapPhone(p: any, contactId: string, acct: any, now: string): Record<string, unknown> {
  return {
    id: p.id,
    contact_id: contactId,
    phone_number: str(p.number),
    phone_ext: str(p.ext),
    phone_type: typeName(p.type),
    is_primary: bool(p.primary),
    sms_opt_out: bool(p.smsOptOut),
    raw: p,
    synced_at: now,
    account_key: acct.account_key,
    market: acct.market,
    last_seen_by_api: now,
    // Seen on the contact again → no longer archived (only the sync archives channel rows).
    archived_at: null,
    archive_reason: null,
  };
}

export function mapEmail(e: any, contactId: string, acct: any, now: string): Record<string, unknown> {
  const address = str(e.address);
  return {
    id: e.id,
    contact_id: contactId,
    // A value with no '@' cannot be an address (four such values in the July backfill); raw keeps the source.
    email_address: address && address.includes("@") ? address : null,
    email_type: typeName(e.type),
    is_primary: bool(e.primary),
    raw: e,
    synced_at: now,
    account_key: acct.account_key,
    market: acct.market,
    last_seen_by_api: now,
    archived_at: null,
    archive_reason: null,
  };
}

/**
 * Split a contact's phone and email children into upsertable rows.
 * `complete` is true when every child came back in full (an empty or absent list counts as complete: the contact
 * has no such channel). Stub children produce no row — a stub has no value, and writing one would null a good row.
 */
export function extractChannels(
  contact: any,
  acct: any,
  now: string,
  phonesIn: unknown = contact?.phoneNumbers,
  emailsIn: unknown = contact?.emailAddresses,
): { phones: Record<string, unknown>[]; emails: Record<string, unknown>[]; complete: boolean } {
  const phoneList = Array.isArray(phonesIn) ? phonesIn : [];
  const emailList = Array.isArray(emailsIn) ? emailsIn : [];
  const phones = phoneList.filter(isFullPhone).map((p: any) => mapPhone(p, contact.id, acct, now));
  const emails = emailList.filter(isFullEmail).map((e: any) => mapEmail(e, contact.id, acct, now));
  const complete = phones.length === phoneList.length && emails.length === emailList.length;
  return { phones, emails, complete };
}

/**
 * Upsert channel rows and archive the children the given contacts no longer have.
 * `completeContactIds` must list only contacts whose children were ALL read in full at `now`: any of their channel
 * rows not stamped at `now` was dropped in AccuLynx. Archive, never delete (hard rule 1).
 */
async function writeChannels(
  sb: any,
  acct: any,
  now: string,
  phones: Record<string, unknown>[],
  emails: Record<string, unknown>[],
  completeContactIds: string[],
): Promise<void> {
  if (phones.length) {
    const { error } = await sb.from("acculynx_contact_phones").upsert(phones, { onConflict: "id" });
    if (error) console.warn(`[contacts] phone upsert: ${error.message}`);
  }
  if (emails.length) {
    const { error } = await sb.from("acculynx_contact_emails").upsert(emails, { onConflict: "id" });
    if (error) console.warn(`[contacts] email upsert: ${error.message}`);
  }
  if (!completeContactIds.length) return;
  for (const table of ["acculynx_contact_phones", "acculynx_contact_emails"]) {
    const { error } = await sb
      .from(table)
      .update({ archived_at: now, archive_reason: "removed_from_contact" })
      .eq("account_key", acct.account_key)
      .in("contact_id", completeContactIds)
      .is("archived_at", null)
      .lt("last_seen_by_api", now);
    if (error) console.warn(`[contacts] ${table} archive: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// List sweep
// ---------------------------------------------------------------------------

export interface ContactSweepResult {
  /** API-reported total count (for the last_api_count watermark), or null if no page was read. */
  apiCount: number | null;
  /** True when the sweep reached the last page this run (safe to archive rows the cycle never saw). */
  complete: boolean;
  /** First page NOT read this run — the resume point when !complete. */
  nextPage: number;
  /** Channel rows upserted this run. */
  phones: number;
  emails: number;
  /** Contacts whose children all came back in full (stamped channels_synced_at). */
  channelsComplete: number;
  /** True when the API refused `includes` and the sweep fell back to stub-only pages. */
  includesRejected: boolean;
}

/**
 * Sync contacts for a single account via a page loop starting at watermark.last_page_index (0 when absent).
 * Endpoint: GET /contacts?pageSize=50&pageStartIndex={N}&includes=emailAddress,phoneNumber
 *
 * @param sb         - Supabase client (service role)
 * @param acct       - account row (account_key, market stamped on every upserted row)
 * @param apiKey     - explicit per-account Bearer key (not module-level — Pitfall 3)
 * @param deadline   - epoch ms budget limit (Date.now() >= deadline → stop)
 * @param watermark  - current watermark row (null = first run); last_page_index is the start page
 * @param fetchFn    - injectable fetch function (defaults to global fetch for prod)
 */
export async function syncContacts(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  watermark: any,
  fetchFn: typeof fetch = fetch,
): Promise<ContactSweepResult> {
  // pageStartIndex is a PAGE NUMBER (0-based), NOT a record offset — the AccuLynx
  // pagination quirk (jobs use a record offset; contacts/estimates use a page number;
  // docs/knowledge-base/acculynx/api/read-capability.md). Advance ONE page at a time and
  // stop on the last (short/empty) page. (Observed 2026-07-01: advancing by items.length
  // left wichita contacts stuck at 64 of 1314.)
  const PAGE_SIZE = 50;
  let pageNo: number = watermark?.last_page_index ?? 0;
  const now = new Date().toISOString();
  const result: ContactSweepResult = {
    apiCount: null,
    complete: false,
    nextPage: pageNo,
    phones: 0,
    emails: 0,
    channelsComplete: 0,
    includesRejected: false,
  };
  let useIncludes = true;

  while (Date.now() < deadline) {
    const inc = useIncludes ? `&includes=${CONTACT_INCLUDES}` : "";
    const url = `${ACCULYNX_BASE}/contacts?pageSize=${PAGE_SIZE}&pageStartIndex=${pageNo}${inc}`;
    await sleep(PACE_MS);
    const { status, body } = await acculynxGet(url, apiKey, fetchFn);

    if (status === 400 && useIncludes) {
      // Keep contacts syncing without channels; enrichContactChannels() covers them by id.
      console.warn(`[contacts] ${acct.account_key}: includes rejected (400) — sweeping without channels`);
      useIncludes = false;
      result.includesRejected = true;
      continue;
    }
    if (status !== 200) {
      console.warn(`[contacts] unexpected status ${status} for ${acct.account_key}`);
      break;
    }

    const typedBody = body as { items?: unknown[]; count?: number };
    const items: unknown[] = typedBody?.items ?? [];

    // Capture the API-reported total count (present on every page response).
    if (typeof typedBody?.count === "number") result.apiCount = typedBody.count;

    if (items.length === 0) {
      result.complete = true; // empty page — sweep complete
      break;
    }

    // Contacts whose channels were read in full carry channels_synced_at; the others must not (a batch upsert
    // fills a column missing from some rows with NULL — so the two groups are written separately).
    const withChannels: Record<string, unknown>[] = [];
    const withoutChannels: Record<string, unknown>[] = [];
    const phones: Record<string, unknown>[] = [];
    const emails: Record<string, unknown>[] = [];
    const completeIds: string[] = [];
    for (const item of items as any[]) {
      const row = mapContact(item, acct, now);
      const ch = extractChannels(item, acct, now);
      phones.push(...ch.phones);
      emails.push(...ch.emails);
      if (ch.complete && typeof item?.id === "string") {
        withChannels.push({ ...row, channels_synced_at: now });
        completeIds.push(item.id);
      } else {
        withoutChannels.push(row);
      }
    }

    for (const rows of [withChannels, withoutChannels]) {
      if (!rows.length) continue;
      const { error } = await sb.from("acculynx_contacts").upsert(rows, { onConflict: "id" });
      if (error) console.warn(`[contacts] upsert: ${error.message}`);
    }
    await writeChannels(sb, acct, now, phones, emails, completeIds);
    result.phones += phones.length;
    result.emails += emails.length;
    result.channelsComplete += completeIds.length;

    pageNo += 1; // advance ONE page (page-number semantics)
    result.nextPage = pageNo;
    if (items.length < PAGE_SIZE) {
      result.complete = true; // last (partial) page — sweep complete
      break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Per-contact fallback
// ---------------------------------------------------------------------------

const CHANNEL_REFRESH_MS = 7 * 24 * 3600 * 1000; // re-read a contact's channels by id at most weekly
const CHANNEL_BATCH = 50; // per account per run — this pass only spends budget the rest of the run left over

/**
 * Fallback pass: read channels by id for this account's live contacts the list sweep could not complete
 * (channels_synced_at NULL — a stub child, or a page the budget never reached) or last read over a week ago.
 * GET /contacts/{id}?includes=emailAddress,phoneNumber; a child still returned as a stub is read from
 * /contacts/{id}/phone-numbers or /email-addresses. A 404 stamps channels_synced_at so a deleted contact is not
 * re-read every hour. Returns how many contacts were completed.
 */
export async function enrichContactChannels(
  sb: any,
  acct: any,
  apiKey: string,
  deadline: number,
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  if (Date.now() >= deadline) return 0;
  const stale = new Date(Date.now() - CHANNEL_REFRESH_MS).toISOString();
  const { data, error } = await sb
    .from("acculynx_contacts")
    .select("id")
    .eq("account_key", acct.account_key)
    .is("archived_at", null)
    .or(`channels_synced_at.is.null,channels_synced_at.lt.${stale}`)
    .order("channels_synced_at", { ascending: true, nullsFirst: true })
    .limit(CHANNEL_BATCH);
  if (error) {
    console.warn(`[contacts] channel candidates: ${error.message}`);
    return 0;
  }

  let done = 0;
  for (const { id } of (data ?? []) as { id: string }[]) {
    if (Date.now() >= deadline) break;
    const base = `${ACCULYNX_BASE}/contacts/${encodeURIComponent(id)}`;
    await sleep(PACE_MS);
    const { status, body } = await acculynxGet(`${base}?includes=${CONTACT_INCLUDES}`, apiKey, fetchFn);
    const now = new Date().toISOString();
    if (status === 404) {
      const { error: e } = await sb.from("acculynx_contacts").update({ channels_synced_at: now })
        .eq("id", id).eq("account_key", acct.account_key);
      if (e) console.warn(`[contacts] channel stamp: ${e.message}`);
      continue;
    }
    if (status !== 200 || !isObj(body)) {
      console.warn(`[contacts] channel detail ${status} for ${acct.account_key}`);
      continue;
    }

    let phonesIn: unknown = body.phoneNumbers;
    let emailsIn: unknown = body.emailAddresses;
    let readable = true;
    for (const [kind, list, isFull] of [
      ["phone-numbers", phonesIn, isFullPhone],
      ["email-addresses", emailsIn, isFullEmail],
    ] as const) {
      if (!Array.isArray(list) || list.every(isFull)) continue;
      if (Date.now() >= deadline) { readable = false; break; }
      await sleep(PACE_MS);
      const sub = await acculynxGet(`${base}/${kind}`, apiKey, fetchFn);
      const items = isObj(sub.body) ? sub.body.items : undefined;
      if (sub.status !== 200 || !Array.isArray(items)) { readable = false; break; }
      if (kind === "phone-numbers") phonesIn = items; else emailsIn = items;
    }
    if (!readable) continue;

    const ch = extractChannels({ id }, acct, now, phonesIn, emailsIn);
    await writeChannels(sb, acct, now, ch.phones, ch.emails, ch.complete ? [id] : []);
    if (!ch.complete) continue; // a child the API would not return in full — try again next run
    const { error: e } = await sb.from("acculynx_contacts").update({ channels_synced_at: now })
      .eq("id", id).eq("account_key", acct.account_key);
    if (e) console.warn(`[contacts] channel stamp: ${e.message}`);
    else done++;
  }
  return done;
}
