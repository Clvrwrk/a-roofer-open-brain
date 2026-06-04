# @ob-marketing — Skill Pack

> Default pack runs the EEAT flywheel and reputation loop — the two marketing motions with the clearest 10x ROI for a residential roofer. Social media management and paid media are dormant; they require a separate A3 because their ROI is client-dependent and the human labor cost is often lower than agent operation when volume is low.
> Toggle in `config/roofer.config.yaml` under `agents.vertical.marketing.skills`.

---

## Default Skill Pack (enabled by default)

| Skill ID | Purpose | Maps to |
|---|---|---|
| `content` | Produce EEAT-flywheel content (case studies, project stories, neighborhood authority posts) from consented soft atoms; enforce the one-atom-one-story discipline | `skills/cleverwork-roofer/content/` |
| `reviews` | Draft review request messages at job close; draft responses to new Google/Yelp reviews within 24 hours; atomize every review as EEAT evidence | `skills/cleverwork-roofer/reviews/` |
| `photo-handling` | Curate CompanyCam photos for EEAT publication (3–5 per job); manage consent flags; organize damage-documentation photos for claim support | `skills/cleverwork-roofer/photo-handling/` |
| `eeat-publishing` | Manage the full EEAT flywheel cycle: atom selection → draft → client one-click approval → publish; enforce consent checks at every step; track approval rate | `skills/cleverwork-roofer/eeat-publishing/` |
| `schema-markup` | Apply and validate schema.org structured markup (`LocalBusiness`, `Service`, `Review`, `Article`, `Person`, `Place`) on every published page | `skills/cleverwork-roofer/schema-markup/` |

---

## Dormant Skills — Pending A3 Approval

| Skill ID | Purpose | A3 status | Activation condition |
|---|---|---|---|
| `social-media` | Schedule and post content to Facebook, Instagram, and Nextdoor from approved EEAT drafts; tailor copy by platform; track engagement | Not yet filed | Client has an active social presence with ≥500 followers or is in a canvassing-heavy market where Nextdoor reach justifies it |
| `email-newsletter` | Produce a monthly neighborhood-targeting email newsletter from the month's published content and referral-network atoms | Not yet filed | Client has an email list ≥250 contacts and a designated email tool (Mailchimp, Klaviyo) |
| `ranking-tracking` | Weekly keyword-rank monitoring for target terms (roofing + city, storm damage repair, manufacturer name + city); report on rank movement post-publish | Not yet filed | Client site has been live ≥3 months with ≥5 EEAT atoms published |
| `competitor-content-analysis` | Researcher-driven quarterly analysis of top 3 local competitors' published content; identify authority gaps the client can fill | Not yet filed | Client is in a competitive market (≥3 active local competitors with maintained websites) |
| `manufacturer-cert-badges` | Maintain structured atoms for GAF/OC/CertainTeed cert status; display badges on the client site with schema markup; monitor renewal dates | Not yet filed | Client holds at least one manufacturer certification |
| `warranty-registration-workflow` | After each job using a certifiable product, produce and track the warranty registration packet for the homeowner; confirm portal submission | Not yet filed | Client uses GAF, OC, or CertainTeed products and offers manufacturer warranty to homeowners |
| `video-content` | Curate CompanyCam time-lapses and job-progress video clips into short-form content (30–60 sec); apply schema VideoObject markup | Not yet filed | Client uses CompanyCam video capture on ≥50% of jobs |

---

## Skill Format Notes

Every skill in `skills/cleverwork-roofer/` ships with:
- `SKILL.md` — frontmatter + prompt/instructions (Cleverwork-original prose)
- `metadata.json` — `{ "name", "version", "origin": "cleverwork", "bound_agents": ["marketing"], "a3_ref": null }`

The `eeat-publishing` skill enforces the consent check at the skill level — it will not generate a publish action without both `eeat_signal.publishable_with_consent = true` AND `consent_flags.publishable_external = true` confirmed. This is not configurable. The consent boundary is mission-grade infrastructure per CONVENTIONS.md §7.

The `content` skill is the only marketing skill that produces externally-facing text. Every output it generates is `inference`-tier until it passes Auditor and the client one-click approval flow; only after both does it become `evidence`-tier in the brain.
