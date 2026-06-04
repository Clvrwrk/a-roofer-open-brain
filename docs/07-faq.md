# FAQ — Questions Roofers and Operators Actually Ask

> Questions are drawn from real conversations during the Cleverwork discovery and onboarding process. They are answered plainly.

---

## The Basics

### Q: Is this just ChatGPT for roofers?

No — and the difference matters enough to explain carefully. ChatGPT (and most AI chat tools) reads what you give it in a conversation, answers your question, and forgets everything when the conversation ends. Nothing is built up. Ask the same question next month and it has no memory of your company, your properties, your past jobs, or your crew.

This brain is the opposite architecture. Every closed job is atomized into a persistent, structured knowledge base tied to the property where the work happened. When `@ob-ops` answers a question about 847 Ridgeline Drive, it is drawing on every prior job at that address, every inspector note from that jurisdiction, and every crew observation that was captured in post-op debriefs. That knowledge compounds over years. ChatGPT starts from zero every time. The brain starts from everything you have ever taught it.

### Q: What is an atom?

An atom is the smallest meaningful unit of knowledge in the brain. It is a row in the database with the knowledge content, an embedding (a mathematical representation that enables semantic search), and a set of metadata fields that describe where the knowledge came from, when, on which model, under which building code, and at what confidence level.

Not every fact deserves its own atom — Capture decides that automatically. But as a rough intuition: "the Henderson job inspector requires three nails per shingle in wind zone 115+" is one atom. "GAF Master Elite warranty on the Henderson job was transferred to the new owner on 2026-04-15" is another atom. Both are tagged with the property, the era, the job, and the practitioner who knew this.

### Q: What does "property-first" mean?

Most software organizes data around clients or users. This brain organizes data around properties — physical addresses where work was performed. The property is the primary key; clients, jobs, and atoms are attached to it.

This matters because roofing is genuinely property-bound at a level most industries are not. The roof on 847 Ridgeline Drive has a specific structure, a specific local inspector culture, specific HOA constraints, and a history of every contractor who has touched it. When your crew shows up for a gutter job in two years, the brain can brief them on the roof replacement that happened in 2024, the materials used, the warranty status, and what the last foreman said mattered at that address — before they arrive.

### Q: How is this different from just keeping good notes in AccuLynx?

AccuLynx (and any PM tool) stores the operational facts of a job: dates, costs, scope, status, contacts. It does not capture why decisions were made, what the inspector said off-the-record, what the homeowner mentioned that was outside scope, or what a 25-year foreman knew about a material that saved the job. And when you pull that foreman's record 3 years from now, AccuLynx will not surface the accumulated patterns across 200 jobs the way a vector-search brain can.

The brain does not replace AccuLynx. It reads from AccuLynx (via the bridge), enriches the facts with the knowledge layer that AccuLynx cannot store, and makes that enriched knowledge retrievable in ways a flat job record cannot be.

---

## Cost and Ownership

### Q: What does this cost to run?

Three cost components:

1. **Infrastructure.** Remote deployment uses Supabase (Pro tier: ~$25/month per project), Coolify (free or Pro tier), and a managed embeddings API. A typical small roofing company (1–3 crews, ~100 jobs/year) runs under $50/month in infrastructure.

2. **Model costs.** Every agent interaction uses token-based model APIs. Heavy usage (daily digests, multiple debrief atomizations per week, active Slack bot usage) for a 3-crew operation typically runs $30–$100/month. The model matrix in `docs/05-model-matrix.md` shows which agents use which tiers; switching workhorse agents from Sonnet to Haiku cuts this cost significantly if needed.

3. **Cleverwork engagement fee.** The ongoing account management, brain improvement, and quarterly kaizen reviews are Cleverwork's service layer — priced separately from the infrastructure.

The 10x ROI gate means no new skill is added unless it returns at least 10x its cost. The operating cost of the brain is always measured against the value it delivers, not treated as a fixed overhead.

### Q: Who owns the data?

The client owns their data. Full stop. Cleverwork provisions and manages the brain but does not claim ownership of any client data. The Supabase project that holds the brain is under the client's control (or Cleverwork's account on the client's behalf, depending on the engagement structure — this is spelled out in the service agreement).

When an engagement ends, Cleverwork exports a full data dump in a portable format (SQL or JSON) and hands it to the client. Nothing is retained on Cleverwork's systems after the export is confirmed.

### Q: What if I stop using Cleverwork?

You keep your data. Cleverwork exports the full atom set, property records, and job history in a documented format before offboarding. The export is readable without any Cleverwork software — it is standard Postgres SQL and JSON. If you want to continue using the brain without Cleverwork, the local deployment path (see `docs/04-going-local.md`) is designed for exactly this scenario.

You lose the ongoing management, the kaizen reviews, the Cleverwork operator who notices when the brain needs attention. The brain itself — the data — is yours.

---

## Integrations and Compatibility

### Q: What if I leave AccuLynx for a different PM tool?

The AccuLynx bridge is the default because it is the dominant PM tool in residential and storm roofing. But it is one bridge among several in `integrations/bridges/`. Each bridge is an independent adapter that reads from a source system and writes atoms to the brain.

If you move to JobTread, Buildertrend, or another system, a new bridge is an A3 proposal away. The brain itself does not change. Every atom already captured from AccuLynx stays in the brain with its full provenance. You are not locked in by the PM tool choice; you are locked in by the property history, which is yours regardless.

### Q: Is my data shared with other Cleverwork clients?

Only with your explicit consent, only across non-competitive trades, and only at the property level.

The default at onboarding is `opt_in` — meaning a remodeler (a different trade) working on 847 Ridgeline Drive next year can see that you replaced the roof in 2024, what materials you used, and the warranty status. They cannot see your pricing, your client list, your financials, or anything tagged as competitive information. Two roofers never share with each other; only trade-orthogonal contractors can see each other's property atoms.

You can change this default to `opt_out` at any time. You can also override at the individual-atom level during a debrief ("don't share this"). If you opt out globally, you also lose the ability to see other Cleverwork contractors' property atoms when you are working on properties they have previously touched.

### Q: What about CompanyCam / EagleView / QuickBooks?

These are toggle-on integrations in `config/roofer.config.yaml`. Enable them by setting `enabled: true` for each one and filling in the corresponding API key in `.env`. Each integration is independent; you can add them one at a time as you are ready.

CompanyCam photos become EEAT evidence atoms tagged to the job and property. EagleView measurements become takeoff-baseline atoms that feed the estimating skill. QuickBooks financial data feeds the job-costing and AR-aging skills in `@ob-accounting`.

---

## The Brain and Trust

### Q: How do I know the brain is giving me accurate information?

Every atom carries its provenance: who said it, when, on which model, against which building code version. When `@ob-historian` surfaces an atom in response to a question, it includes this context: "captured 2024-08-12 from a post-op debrief with foreman Dave (18 years experience), describing IRC-2021 practice in Travis County. Current code is IRC-2021 with no relevant amendments as of 2026-05-29."

Atoms with `trust_tier = inference` (model-generated conclusions) are labeled as such and never auto-promoted to the instruction tier without human confirmation. Only Quality Control can change a trust tier, and only after human review.

The brain does not lie — but it does decay. An atom from 2019 describing a code practice that has since changed will be flagged with a recontextualization note once the Maintenance agent detects the code update. The `era_of_practice` and `regulatory_snapshot_id` fields are what prevent the brain from confidently stating outdated information as current fact.

### Q: What happens when the AI is wrong?

Wrong atoms become learning events, not silent failures. The Auditor catches downstream artifacts produced from wrong atoms (a proposal based on incorrect data fails the Auditor's standard check). The Quality Control agent aggregates these failures and initiates a DMAIC cycle when a failure mode repeats 3+ times.

When a wrong atom is identified, Quality Control (the only authorized role) corrects the `trust_tier` and adds a `recontextualization_note`. The original atom is preserved for provenance; it is not deleted. Maintenance marks it `cold_archive_status = deprecated` so it is not retrieved but remains auditable.

### Q: Is there a risk the AI gives advice on something it should not — like code compliance or legal matters?

The brain captures and retrieves knowledge; it does not make legal or code-compliance determinations on behalf of the client. Atoms about code requirements are tagged with the `regulatory_snapshot_id` in effect when they were captured and include recontextualization notes when the code has since changed. `@ob-ops` can surface what the brain knows about wind-zone requirements in Travis County under IRC-2021 — but a permit inspector's decision is always the authority.

The Auditor enforces this boundary on work products. Any proposal, supplement, or scope document that states code compliance as a guarantee (rather than as a reference to the applicable snapshot) fails the Auditor's standard.

---

## Debrief and Capture

### Q: What if the homeowner doesn't want to participate in the debrief?

The debrief is most valuable with all three parties present (PM, foreman, homeowner/client). But it still works with two. Run it without the homeowner if they decline — you get the hard technical atoms from the PM and foreman. The soft atoms and the "flowers question" answers will be missing; that is a meaningful loss over time, but it does not break the system.

Consent for recording was given at onboarding, not per-debrief. If the homeowner was the consent-giver and declines to participate but did not withdraw recording consent, the call can still be recorded. If there is any ambiguity about recording consent, do not record — take notes manually and upload them instead.

### Q: How long does a debrief take to show up in the brain?

Capture processes the debrief transcript automatically after it is delivered (from Granola/Fireflies) or uploaded. For a typical 25-minute debrief, atomization takes 3–5 minutes. The atoms appear in the brain within 10 minutes of transcript delivery under normal load.

You can verify by checking: `SELECT count(*) FROM public.thoughts WHERE job_id = '<job-id>' AND created_at > now() - interval '1 hour';`

### Q: What if we run a debrief but forgot to record it?

Upload typed or written notes to the job record in AccuLynx and tag them as "debrief notes." The AccuLynx bridge picks them up and sends them through Capture. The atom quality will be lower than a verbatim transcript — structured notes miss the nuance that full transcription preserves — but it is far better than no debrief at all.

The Capture agent marks atoms derived from manual notes with `model_card.source_type = "manual_notes"` so the lower provenance fidelity is visible in any future retrieval.

---

## Operations

### Q: What is Conductor doing every day?

Conductor is the PM of the agent workforce. Each morning it posts a digest to the designated Cleverwork/internal channel: a summary of yesterday's atoms captured, today's scheduled jobs from AccuLynx, any open escalations requiring human decisions, and any Auditor-flagged work products waiting for review.

Through the day, Conductor routes mentions of `@ob-ops` and `@ob-sales` to the right vertical agent, ensures their outputs pass through Auditor before delivery, and queues anything that needs a human decision (a proposed change order above a threshold, an insurance supplement dispute, a scope question outside the agent's confidence).

End of day, Conductor posts the closing digest and queues tomorrow's work.

### Q: Can crew members interact with the brain directly?

The Slack bots are the interface. Any crew member in the client's Slack workspace can mention `@ob-ops` or `@ob-sales`. The Conductor routes their query to the appropriate agent.

What they get back depends on their role and the question. `@ob-ops` can tell a crew member what materials are allocated to tomorrow's job; it will not tell them a client's financial information. The permission model is at the Slack workspace level — control who is in the workspace, and you control who can query the brain.

### Q: What is a "kaizen review" and how often should we do one?

The kaizen review (`scripts/kaizen-review.sh`) is a monthly operational check: atom volume and quality stats, any patterns Innovator has flagged as A3 candidates, any Quality Control DMAIC cycles in progress, the Maintenance health report, and any Auditor failure rates that are trending the wrong direction.

The output is a one-page summary that Chris reviews with the account manager. It takes 15 minutes to run and 30 minutes to review. It is the primary mechanism for catching problems before they become expensive and for deciding which new skills to add to the engagement.

Monthly is the right cadence for most clients. If a client is in rapid growth (adding crews, entering new markets, seeing high job volume), run it every two weeks.
