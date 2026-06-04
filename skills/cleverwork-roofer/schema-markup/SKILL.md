---
name: schema-markup
description: >
  Emits valid schema.org JSON-LD structured data for a roofer's web content.
  Supports LocalBusiness, Service, Review, Article, and Person schema types.
  Designed to run alongside eeat-publishing (one combined deliverable) and
  periodically to audit and refresh site-wide structured data.
when_to_use: >
  Trigger when @ob-marketing requests "add schema markup", "generate JSON-LD
  for this page", or when eeat-publishing completes and routes a schema_markup_request.
  Also triggers for periodic site-wide schema audit when Researcher reports
  that the structured data is stale or incomplete. Run for every new page
  published through the EEAT flywheel.
inputs:
  - name: page_type
    type: string
    required: true
    description: >
      localbusiness | service | review | article | person — the primary
      schema.org type for the page being marked up. Multiple types may
      be needed for a single page; specify the primary one and the skill
      will add secondary types automatically based on context.
  - name: job_id
    type: uuid
    required: false
    description: >
      FK to the job record. Used for Review and Article schema when the page
      is based on a specific project. Provides location, date, and project context.
  - name: person_atom_id
    type: uuid
    required: false
    description: >
      FK to a practitioner atom. Used for Person schema when a crew member
      is named with consent on a page.
  - name: page_content_summary
    type: string
    required: false
    description: >
      A plain-text summary of the page content. Used to populate @description,
      headline, and articleBody fields when a job_id is not applicable
      (e.g., a general service page).
outputs:
  - name: json_ld_block
    type: draft
    description: >
      A valid JSON-LD <script type="application/ld+json"> block ready
      for insertion into the page <head>. Includes all applicable types
      and nested entities.
  - name: markup_atom
    type: atom
    description: >
      Atom written to the brain recording the schema type, fields populated,
      the page URL (when available), and the date generated.
trust_tier_of_output: evidence
bound_agents:
  - ob-marketing
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: null
  license: MIT
  a3_ref: null
---

# Schema Markup

Structured data that tells generative search engines exactly what this roofer did,
where they did it, and what the client said about it — in a format that compounds
search authority over time.

---

## Context Required

- Company data from `config/roofer.config.yaml`: name, address, phone, website, service area, license number, founding year, social profiles
- Page type and purpose
- Job record (for project-specific pages): city + state, project type, completion date, materials, manufacturer, warranty tier
- Review/testimonial content: reviewer name (if consented), rating, review text, date
- Practitioner data (if Person schema): name (if consented), role, years tenure

---

## Process

### Step 1 — Determine Required Schema Types

Every page on the roofer's site should include LocalBusiness at minimum. Additional types stack based on page content:

| Page Type | Required Schema | Optional Additional |
|---|---|---|
| Home page | LocalBusiness | Service (primary service) |
| Service page | Service | LocalBusiness (nested) |
| Project case study | Article | Review, Person (crew), LocalBusiness |
| Testimonial page | Review | LocalBusiness |
| Team / about page | Person | LocalBusiness |
| Blog post | Article | Person (author), LocalBusiness |

### Step 2 — Populate LocalBusiness (All Pages)

Pull from `config/roofer.config.yaml`:

```json
{
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "Contractor"],
  "@id": "[website_url]/#business",
  "name": "[company.name]",
  "description": "[company.description]",
  "url": "[company.website]",
  "telephone": "[company.phone]",
  "email": "[company.email]",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[company.address.street]",
    "addressLocality": "[company.address.city]",
    "addressRegion": "[company.address.state]",
    "postalCode": "[company.address.zip]",
    "addressCountry": "US"
  },
  "areaServed": [
    {"@type": "City", "name": "[service_area_city_1]"},
    {"@type": "City", "name": "[service_area_city_2]"}
  ],
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "[company.lat]",
    "longitude": "[company.lng]"
  },
  "openingHoursSpecification": [],
  "priceRange": "[company.price_range]",
  "currenciesAccepted": "USD",
  "paymentAccepted": "[company.payment_methods]",
  "image": "[company.logo_url]",
  "sameAs": ["[social_profile_urls]"],
  "hasCredential": [
    {"@type": "EducationalOccupationalCredential",
     "credentialCategory": "License",
     "name": "[company.license_type]",
     "identifier": "[company.license_number]",
     "recognizedBy": {"@type": "Organization", "name": "[state_licensing_board]"}
    }
  ]
}
```

If a config field is absent, omit that key rather than leaving a placeholder value.

### Step 3 — Populate Service Schema (Service Pages)

```json
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "[service_name]",
  "provider": {"@id": "[website_url]/#business"},
  "description": "[service_description]",
  "serviceType": "[service_type]",
  "areaServed": [{"@type": "City", "name": "[city]"}],
  "category": "Roofing",
  "offers": {
    "@type": "Offer",
    "availability": "https://schema.org/InStock",
    "priceCurrency": "USD"
  }
}
```

### Step 4 — Populate Article Schema (Case Studies / Blog Posts)

Pull from job record and publication atom:

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "[page_title]",
  "description": "[page_description]",
  "datePublished": "[publication_date]",
  "dateModified": "[last_modified_date]",
  "author": {
    "@type": "Organization",
    "name": "[company.name]",
    "@id": "[website_url]/#business"
  },
  "publisher": {"@id": "[website_url]/#business"},
  "mainEntityOfPage": {"@type": "WebPage", "@id": "[page_url]"},
  "image": "[featured_image_url]",
  "about": {
    "@type": "HomeImprovement",
    "name": "[project_type]",
    "location": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "[city]",
        "addressRegion": "[state]"
      }
    }
  }
}
```

### Step 5 — Populate Review Schema (Testimonial Pages)

Only when `original_practitioner.consent_to_attribute = true` on the reviewer atom:

```json
{
  "@context": "https://schema.org",
  "@type": "Review",
  "itemReviewed": {
    "@type": "LocalBusiness",
    "@id": "[website_url]/#business"
  },
  "author": {
    "@type": "Person",
    "name": "[reviewer_name]"
  },
  "reviewBody": "[review_text]",
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": "[rating]",
    "bestRating": "5",
    "worstRating": "1"
  },
  "datePublished": "[consent_recorded_at date]",
  "publisher": {"@id": "[website_url]/#business"}
}
```

### Step 6 — Populate Person Schema (Named Crew Members)

Only when the practitioner atom has `consent_to_attribute = true`:

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "[practitioner.name]",
  "jobTitle": "[practitioner.role]",
  "worksFor": {"@id": "[website_url]/#business"},
  "description": "[optional: role description if present in atom]"
}
```

### Step 7 — Assemble and Validate

Combine all applicable JSON-LD blocks into a single `<script>` tag or multiple `<script>` tags (both are valid). Check:
- All required fields for each type are populated
- No placeholder strings remain (a missed `[field]` token indicates a missing config value — report it)
- JSON is syntactically valid
- No PII appears (street address of homeowner, email, phone of any private individual)

Emit the final block and a short validation summary.

---

## Output Format

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { ... LocalBusiness ... },
    { ... Service / Article / Review / Person ... }
  ]
}
</script>
```

Using `@graph` is the recommended pattern when multiple schema types apply to the same page.

---

## Judgment Rules

- Never fabricate a geo coordinate or license number. If absent from config, omit the field.
- Service area cities must come from the configured `jurisdictions` list in `roofer.config.yaml`, not inferred from job history.
- Review schema requires a human reviewer name — do not substitute "Anonymous" or "Happy Customer". If no attributed reviewer is available, omit the Review type.
- Person schema for crew members requires documented consent. Do not include a crew member's full name without a practitioner atom with `consent_to_attribute = true`.

---

## Works Well With

- `eeat-publishing` — always runs together as one deliverable; the publication draft and JSON-LD ship as a pair
- `ob-marketing` — the agent that maintains the site and schedules the markup for CMS injection

---

## Notes

- Google's structured data guidelines change periodically. The Researcher agent should monitor Google's Search Central changelog and the schema.org changelog; Maintenance flags outdated markup fields in the quarterly Standardize phase.
- AggregateRating schema (for overall star ratings) is a separate composition exercise — it requires the full review set, not just one review. Flag for a dedicated markup run when the roofer has 10+ published reviews.
- `@id` anchors (the `/#business` pattern) allow schema entities to be reused across pages. Maintain a consistent `@id` for the LocalBusiness entity across the entire site.
