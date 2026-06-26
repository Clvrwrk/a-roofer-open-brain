# Stormwatch ZoomInfo App - Create App Step-by-Step

This guide is the exact setup path for your first ZoomInfo app in DevPortal.

Goal of this app:

1. Ingest property records from your Reonomy-connected pipeline.
2. Resolve management companies.
3. Trigger ZoomInfo enrichment to identify:
   - economic buyers / direct spend approvers
   - operational approvers
   - internal champions and influencers
4. Feed outputs into outreach workflows (campaigns + Vicidial call lists) for commercial appointment booking.

---

## Recommended App Design for V1

For this first Stormwatch build, use:

- **Authentication Method:** `Client Credentials`
- **Application Type:** `For internal use only`

Why:

- This is a server-to-server pipeline (Reonomy company list -> ZoomInfo enrichment -> outreach list generation).
- You do not need user-by-user sign-in to run batch discovery/enrichment jobs in V1.
- You can add a second app later (Authorization Code) if you need user-attributed actions in a UI.

---

## What To Prepare Before Clicking Create

Have these ready:

1. **App name**
   - Use: `Stormwatch ZoomInfo - Prod` (and later `- Staging`, `- Dev`)
2. **Environment callback policy**
   - If Client Credentials only, redirect URI is usually not required for runtime.
   - If DevPortal requires one in UI, add a safe placeholder URL you control (e.g. your internal auth callback URL standard).
3. **Scope list (least privilege for V1)**
   - Required:
     - `api:data:company`
     - `api:data:contact`
   - Optional (only if you will use these in V1):
     - `api:data:intent`
     - `api:data:news`
     - `api:data:scoops`
     - `api:recommendations:read`
4. **Secrets destination**
   - Decide exactly where `Client ID` and `Client Secret` will be stored (secret manager).
   - Do not paste creds into docs, chat logs, or repo files.

---

## Step-by-Step in DevPortal (From Your Current Screen)

You are currently on **API Apps / Create App** and seeing:

- `App Integration Name`
- `Authentication Method` with:
  - Authorization Code
  - Client Credentials

### Step 1 - App Integration Name

In `App Integration Name`, enter:

- `Stormwatch ZoomInfo - Prod`

Tip: create separate apps per environment; do not reuse one app across prod/staging/dev.

### Step 2 - Choose Authentication Method

Select:

- **`Client Credentials`**

Do not choose Authorization Code for this first pipeline unless you explicitly need user login context.

### Step 3 - Continue to App Details

Click through to the next section/page and set:

- **Application Type:** `For internal use only`
- **Logo:** optional
- **Redirect URI(s):** only if required by the form for this auth method

### Step 4 - Select Scopes

Start with minimum scopes:

- `api:data:company`
- `api:data:contact`

Add these only if your first workflow requires them immediately:

- `api:data:intent`
- `api:data:news`
- `api:data:scoops`
- `api:recommendations:read`

Do not add GTM manage/audience scopes unless you need those endpoints now.

### Step 5 - Create App

Click **Create**.

After creation, open app details and copy:

- `Client ID`
- `Client Secret`

Store both in your secret manager immediately.

---

## Immediate Post-Create Verification (10 Minutes)

### 1) Token Test (Client Credentials)

Request token from:

- `POST https://api.zoominfo.com/gtm/oauth/v1/token`
- `grant_type=client_credentials`

Use HTTP Basic auth with client credentials (recommended by ZoomInfo docs).

### 2) Smoke Test Endpoint Access

Run one safe, narrow test:

1. Company search for a known management company name.
2. Contact search constrained to title/seniority patterns.

Confirm:

- 200 response
- expected schema
- scope/entitlement success (no 403)

### 3) Fail-Safe Checks

Confirm your app handles:

- 401 (expired/invalid token -> re-auth)
- 429 (respect `Retry-After`)
- 403 (scope/entitlement -> stop and alert, do not blind retry)

---

## Stormwatch V1 Data Flow (Operational Sequence)

1. Receive property records from Reonomy-linked source.
2. Normalize and dedupe management company names/domains.
3. Search Companies in ZoomInfo to resolve company IDs.
4. Search Contacts by:
   - management level
   - department/function
   - title keywords
5. Rank contacts into buying roles:
   - **Approver / Economic buyer**
   - **Technical/operational approver**
   - **Champion / influencer**
6. Enrich only top-ranked contacts needed for activation (credit-controlled).
7. Export segmented call lists to Vicidial and campaign inputs.
8. Capture outcomes for feedback loop (booked, no answer, disqualified, won/lost).

---

## Suggested Title/Seniority Filters for First Pass

Use these as initial heuristics (tune over time by booked-meeting conversion):

- Economic buyer:
  - Owner, Principal, President, CEO
  - CFO, Controller (budget path)
  - VP Finance, VP Operations
- Operational approver:
  - Director/VP Facilities
  - Property Operations leadership
  - Asset/Portfolio management leadership
- Champion:
  - Property Manager
  - Facilities Manager
  - Regional Operations Manager

---

## V1 Guardrails (Use From Day 1)

- Enrich cap per run (example: 25-100 contacts max until ROI is proven).
- Always do Search before Enrich.
- Log projected worst-case credits before enrichment.
- Keep separate keys/apps for prod vs non-prod.
- Redact contact PII in internal logs where not operationally required.

---

## Naming and Environment Convention

Create these three apps:

- `Stormwatch ZoomInfo - Dev`
- `Stormwatch ZoomInfo - Staging`
- `Stormwatch ZoomInfo - Prod`

Keep secrets and traffic isolated by environment.

---

## If You See This At Create Time

- **"Insufficient permissions / no DevPortal access"**
  - Have ZoomInfo admin assign DevPortal subscription.
- **403 on data endpoints after token success**
  - Missing scope or endpoint entitlement; adjust app scopes or package.
- **429 rate limit**
  - Implement throttle and honor `Retry-After`; do not retry in tight loops.

---

## Build-Next (After App Creation)

Once the app is created successfully, next implementation block should be:

1. Build `zoominfoClient` (token + retries + headers + logging).
2. Implement company resolution from Reonomy management company list.
3. Implement contact discovery and role scoring.
4. Add enrich gate + export to Vicidial list format.

