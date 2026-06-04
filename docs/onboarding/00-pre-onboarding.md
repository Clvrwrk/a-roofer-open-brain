# Pre-Onboarding — Open Brain

> Read this before the worksheet. It explains what pre-onboarding is, what we'll ask you for, how your credentials stay safe, and what you'll have at the end. This is a **done-for-you** service: Cleverwork configures, runs, and supports your brain — you provide the business context and access, we do the build.

## What "the brain" is, in one paragraph

Open Brain is a private, dedicated memory layer for your roofing business, with a small workforce of AI agents as its interface. The agents live in Slack and handle real work — leads, estimates, claims and supplements, scheduling, daily logs, follow-up, content — while the brain quietly remembers every job, every property, every customer conversation, with the era and code it happened under. The agents are the interface; **the brain is the asset.** Nothing is shared with anyone else unless you explicitly opt in.

## The pre-onboarding journey

```
1. Discovery call ──▶ 2. This worksheet ──▶ 3. Secure credential handoff
        (30 min, with your AM)   (45–60 min, guided)      (OAuth / encrypted vault)
                                                                    │
                                                                    ▼
6. 30-day white-glove ◀── 5. Go-live: agents in Slack ◀── 4. We provision your brain
   (we watch + tune)          + dashboard + Obsidian            (~1 hour, our side)
```

You only do steps 1–3. Step 4 onward is us.

## What we'll ask you for (the worksheet, 11 sections)

The worksheet is the one form that captures everything needed to stand up your brain. Each answer maps directly to a setting in your configuration, so there's no wasted question:

1. **Company profile** — the basics + your primary contact.
2. **Service area & jurisdictions** — where you work and the building code in effect (so knowledge is era-stamped).
3. **Manufacturers & certifications** — GAF / Owens Corning / CertainTeed, for warranty registration and your cert badges.
4. **Current systems inventory** — what you run today (GHL, AccuLynx, QuickBooks, CompanyCam, EagleView, Google/MS, Slack).
5. **Access & credentials checklist** — *which* systems we need and *who* owns them (not the keys themselves — see security below).
6. **Agent scope** — which agents go live first (we start with your biggest pain, usually Operations + Sales).
7. **Consent decisions** — cross-client property sharing, debrief recording, content publication. All opt-in.
8. **People & roles** — who uses the agents in Slack and who approves published content.
9. **Goals & week-0 baseline** — what "working" means to you, and today's numbers so we can prove the lift.
10. **Expectations & support** — how the done-for-you support model works.
11. **Sign-offs** — the authorizations that let us proceed.

## How your credentials stay safe

**We never ask you to write a password or API key on this worksheet.** The worksheet only records *which* systems we need access to, *who* owns each account, and *how* the key will be handed over. Keys themselves move only through a secure channel:

- **OAuth** wherever the tool supports it (Slack, Google/MS, GHL, QuickBooks) — you click "approve," we never see the password.
- **An encrypted vault link** (e.g. a one-time secure share) for the few systems that use API keys (AccuLynx, CompanyCam, EagleView).
- **Cleverwork-provisioned** for the brain itself (your dedicated Supabase project) — those secrets live in our secret store, never on a laptop or in this document.

Your brain is **isolated** — a dedicated database, one per client, with row-level security. Your data is never pooled with another client's, except the specific non-trade-competitive property facts you opt to share in Section 7.

## What you'll have at go-live

- Agents in your Slack you can mention by name (`@ob-ops`, `@ob-sales`, …) that actually do the work.
- A dashboard (we host it) showing your pipeline, the brain's activity, and the validation scorecard.
- Obsidian as your team's read surface — SOPs and the knowledge graph of your business.
- Your first post-op debrief captured, and the EEAT flywheel ready to turn happy jobs into website authority.

Then 30 days of white-glove: we watch the agents daily, tune the standards, and hold a 30-day review against the goals you set in Section 9.

## Where this is headed: Open Brain as a Service

This worksheet is the first version of something bigger. It's generated from a single schema (`onboarding/intake-schema.yaml`), and that same schema becomes the **self-serve signup wizard** in the web app we're building — so the questions you answer on paper today are exactly the questions the app will ask tomorrow, with OAuth buttons instead of a credentials checklist. Nothing you do now gets thrown away.

---

_Next: the Pre-Onboarding Worksheet (`01-onboarding-worksheet.md`, or the PDF). Bring your AM; budget about an hour._
