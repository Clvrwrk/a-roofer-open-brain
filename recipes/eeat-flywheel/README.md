# Recipe: EEAT Flywheel

> **Purpose:** Turn consented soft atoms from post-op debriefs into published, schema-marked web content that compounds the client's search authority, homeowner trust, and qualified referral pipeline. The flywheel runs on a weekly cron but each cycle is triggered by the soft-atom queue, not a calendar.

- **Trigger:** Weekly cron (default: Monday 06:00 local time) + any post-debrief soft-atom queue flush.
- **Primary agents:** Auditor, Marketing (`@ob-marketing`), Conductor.
- **Supporting agents:** Historian (property context), Researcher (ranking data).
- **Success metric (v1):** Client one-click approval rate ≥ 60% on Marketing-proposed drafts.

---

## Why this flywheel is different from generic AI marketing

Competitors can generate content at volume. They cannot generate *this* content, because these atoms come from real work this contractor really did, captured from real clients in real debriefs with real attributable practitioners. The EEAT signals are unbuyable. Generative search engines (Google AI Overviews, Perplexity, etc.) increasingly distinguish authentic experience signals from synthetic volume. This flywheel is the architecture of that distinction.

---

## The loop — step by step

```
Post-op debrief (recipes/post-op-debrief)
        │
        ▼  Capture writes soft atoms with eeat_signal.publishable_with_consent = true
           eeat_signal.consent_recorded_at = null (not yet client-approved for publish)
        │
        ▼  [STEP 1] Marketing polls soft-atom queue: eeat_signal.value ≥ 0.7
           weekly + triggered after each debrief completes
        │
        ▼  [STEP 2] Auditor pre-screen:
           • PII check (no homeowner name, address, or identifying detail without explicit consent)
           • Consent check (consent_recorded_at = null → not yet approved; do not publish)
           • Competitive-info check (no pricing, no subcontractor names, no trade-competitive data)
           • Trust-tier check (only evidence-tier atoms; no inference-tier in EEAT content)
           PASS → Marketing proceeds
           FAIL → atom quarantined with rejection reason; QC notified if pattern repeats
        │
        ▼  [STEP 3] Marketing drafts publication candidate
           Format: case study | testimonial excerpt | blog post | photo caption + story
           Length: 200–600 words (case study) | 80–150 words (testimonial)
           Schema.org markup applied per defaults (see §Schema.org defaults below)
           Historian called for: property context, prior work on same address, era notes
        │
        ▼  [STEP 4] Auditor final pass:
           • PII clean re-check on the draft itself
           • Schema.org markup present and valid
           • No inference-tier content presented as fact
           PASS → routes to Conductor for client approval
           FAIL → returns to Marketing with structured rejection
        │
        ▼  [STEP 5] Client one-click approval via Slack (see §Approval flow below)
           • APPROVE → publish + record consent_recorded_at
           • EDIT    → Slack thread; Marketing revises; loops back to Step 4
           • SKIP    → consent_flags.publishable_external = false; expires_at recorded
        │
        ▼  [STEP 6] Marketing publishes to client's site
           • Content posted via configured CMS adapter (WordPress, Webflow, etc.)
           • Canonical URL recorded on the atom: eeat_signal.published_url
           • eeat_signal.consent_recorded_at stamped to now
           • Atom trust_tier remains evidence (publication does not promote trust tier)
        │
        ▼  [STEP 7] Researcher tracks ranking weekly
           Target keyword clusters pulled from roofer.config.yaml
           Ranking data written as inference-tier atoms on the published-content atom
           Conductor includes ranking gains in the weekly digest
        │
        ▼  New jobs → new post-op debriefs → new atoms → flywheel continues
```

---

## Schema.org markup defaults

Every published EEAT atom receives structured markup. The `marketing:schema-markup` skill enforces these defaults. All fields are config-driven; none are hard-coded.

### LocalBusiness (every page)

```json
{
  "@type": "RoofingContractor",
  "name": "config.company.name",
  "telephone": "config.company.phone",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "config.company.city",
    "addressRegion": "config.company.state",
    "postalCode": "config.company.zip"
  },
  "areaServed": "config.service_area.counties",
  "url": "config.company.website"
}
```

### Review (testimonial content)

```json
{
  "@type": "Review",
  "author": {
    "@type": "Person",
    "name": "[client first name or 'Homeowner' if anonymized]"
  },
  "reviewBody": "[consented testimonial text]",
  "itemReviewed": {
    "@type": "RoofingContractor",
    "name": "config.company.name"
  },
  "datePublished": "[ISO 8601 publish date]",
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": "[if provided]",
    "bestRating": "5"
  }
}
```

### Article (case study)

```json
{
  "@type": "Article",
  "headline": "[article title]",
  "author": {
    "@type": "Organization",
    "name": "config.company.name"
  },
  "datePublished": "[ISO 8601]",
  "dateModified": "[ISO 8601]",
  "mainEntityOfPage": "[canonical URL]",
  "description": "[meta description, 150–160 chars]"
}
```

### Person (named practitioner with consent)

```json
{
  "@type": "Person",
  "name": "[practitioner name — only if original_practitioner.consent_to_attribute = true]",
  "jobTitle": "[practitioner role]",
  "worksFor": {
    "@type": "Organization",
    "name": "config.company.name"
  }
}
```

### Place (property reference with consent)

```json
{
  "@type": "Place",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "[city]",
    "addressRegion": "[state]"
  }
}
```

Note: Full street address is included in Place markup only if the client has consented to property-level identification (`consent_flags.publishable_external = true` on the property atom).

---

## Client one-click approval flow

The friction killer. A homeowner or business owner approving content from their phone in two minutes is the only viable UX for a construction client's approval cadence.

### Step-by-step

1. Conductor DMs the client's designated approver (set in `roofer.config.yaml`) in Slack.

   Message format:
   ```
   [Company Name] — Content ready for your review

   We prepared a short piece from your recent project at [property city/neighborhood].
   It takes about 2 minutes to review.

   [Preview link — opens a read-only draft page]

   Reply with one of:
   ✅ Approve — publish as-is
   ✏️  Edit — open a thread to make changes
   ⏭️  Skip — don't publish this one
   ```

2. **Approve:** Marketing publishes immediately. Conductor sends confirmation with the live URL. `consent_recorded_at` is stamped.

3. **Edit:** A Slack thread opens. The client types requested changes inline. Marketing revises the draft, re-presents in thread. If the revision is approved in thread, Auditor re-checks the changed text before publish. Loops a maximum of 3 times before Conductor escalates to the Cleverwork AM.

4. **Skip:** `consent_flags.publishable_external = false` is set on the atom. `consent_flags.expires_at` is recorded (default: 12 months; the flywheel can re-propose after the expiration if the window re-opens). The atom remains fully useful internally (Historian can retrieve it, QC can analyze it) but is never proposed for publication again until the expiry window passes.

---

## Success metric and adjustment trigger

**Target:** Client approval rate ≥ 60% on Marketing-proposed drafts over any rolling 90-day window.

If the approval rate drops below 60% for two consecutive 90-day windows:
1. Conductor alerts the Cleverwork AM.
2. Innovator analyzes the skip-and-edit patterns from the last 90 days and produces an A3 for QC review.
3. QC DMAIC cycle runs on the failure mode (wrong content type? wrong atom selection? too long? wrong tone?).
4. Marketing's atom-selection rubric or draft-writing prompt is revised by QC under the standard process.

The 60% threshold is a floor, not a ceiling. A well-tuned flywheel should reach 75–85% as the Marketing agent learns the client's voice over time.

---

## Cross-client EEAT propagation (deferred to Phase 3)

A future capability: Client A's published atom about Property X could be linked-to from Client B's site as a "prior work by [different trade] on this property" trust signal. This requires both clients to have consented to cross-client property sharing. Held in reserve until Phase 3. No implementation in v1.

---

## Atom outputs from this recipe

| Atom content | `soft_or_hard` | `trust_tier` | Notes |
|---|---|---|---|
| Published content text | `soft` | `evidence` | `eeat_signal.published_url` set; `consent_recorded_at` stamped |
| Schema.org markup blob | `hard` | `evidence` | Linked to published-content atom |
| Ranking snapshot | `hard` | `inference` | Written by Researcher weekly; `derived_from` → published-content atom |
| Skip record | `soft` | `evidence` | `consent_flags.publishable_external = false`; `expires_at` set |

---

## Changelog

| Date | Version | Summary |
|---|---|---|
| 2026-05-29 | v1 | Initial SOP. Loop diagram, schema.org defaults, one-click approval flow, 60% metric. |
