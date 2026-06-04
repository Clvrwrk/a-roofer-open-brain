# Philosophy — Why This Brain Is Built the Way It Is

> "The wiki stays maintained because the cost of maintenance is near zero."
> — Andrej Karpathy, *LLM Wiki* pattern (cited below)

---

## The Karpathy Pattern: Build the Wiki Once

Most software that puts AI on top of a document collection works like this: you keep raw documents somewhere, and at query time the system retrieves relevant chunks and hands them to a language model to answer from. Nothing is built up between queries. Ask a question that requires synthesizing five documents, and the model assembles the answer from scratch — and then that synthesis disappears into chat history.

Andrej Karpathy described a more powerful alternative in his *LLM Wiki* gist (available at [karpathy-gist/llm-wiki.md](../karpathy-gist/llm-wiki.md); Cleverwork cites this as a philosophical anchor, not a copy): instead of retrieving from raw sources at query time, an LLM **incrementally builds and maintains a persistent, structured knowledge base** — what he calls a wiki. When new information arrives, the model does not just index it. It reads it, integrates it into the existing wiki, updates the entities and concepts, flags contradictions, strengthens the synthesis. "The knowledge is compiled once and then kept current, not re-derived on every query."

Karpathy's framing was about personal knowledge management — tracking a research topic, reading a book, or building an internal team wiki. Cleverwork's application is more specific and higher-stakes: **a roofer's institutional knowledge, bound to real properties, stamped with the code in effect when each fact was true, and designed to stay reliable for 5–20 years as models, codes, and team members change.**

The atoms in `public.thoughts` are Cleverwork's wiki entries. The `era_of_practice`, `regulatory_snapshot_id`, and `recontextualization_notes` fields are what turn those entries from "things we know" into "things we know, in context, with decay rates." The Maintenance agent is the disciplined wiki-maintainer that humans abandon because the bookkeeping burden grows faster than the value — except Maintenance does not get bored.

**The economic case:** a roofer who runs post-op debriefs every job for five years builds a compounding asset that no competitor can buy. The knowledge exists nowhere else in that form — not in AccuLynx, not in their Google Drive, not in any foreman's head. The wiki is the moat.

---

## Demming and Toyota: Quality Is a System Property

W. Edwards Demming's core insight was that quality problems are almost always system problems, not people problems. The 85/15 rule: roughly 85% of quality failures are attributable to the system; only 15% to individual performance. Blaming individuals for system failures does not fix the system. Fixing the system produces results that persist after the individual leaves.

For a roofing brain, this means:

- The post-op debrief is blameless by design. Q2 ("what did we get wrong?") is not a performance review. It is a system audit. The framing script in [`docs/02-debrief-script.md`](02-debrief-script.md) enforces this.
- The Auditor vs. Quality Control separation (see [`docs/00-architecture-brief.md`](00-architecture-brief.md) §4.2) is a direct implementation of Demming's distinction between checking quality on individual work products and changing the system that produces all future work products. Mixing those roles corrupts both.
- When QC initiates a DMAIC cycle (triggered at 3+ repeats of the same failure mode), it is performing Demming's PDCA loop at the system level. The defect threshold (3 repeats in a rolling 90-day window) is configurable in `config/roofer.config.yaml`; the default is deliberately conservative to catch patterns early.

Toyota's manufacturing system adds the physical discipline of **Kaizen** — small, continuous improvements rather than periodic large overhauls — and **Jidoka**, the principle of stopping the line when a defect is detected rather than passing it downstream. In this brain:

- Kaizen runs through the Innovator → A3 → build pipeline. New skill proposals are small, measured improvements, not platform rebuilds.
- Jidoka runs through the Auditor. Every artifact that fails the current standard is rejected and returned to its producer — not passed downstream to a client, not silently dropped.
- `scripts/kaizen-review.sh` is the monthly rhythm that surfaces Innovator's proposals and QC's DMAIC candidates for Chris and the account manager's review.

---

## Kaizen 5S Applied to the Brain

Toyota's 5S workplace organization discipline (Sort, Set in Order, Shine, Standardize, Sustain) maps directly to the Maintenance agent's playbook:

| 5S Step | Cadence | What it means in the brain |
| --- | --- | --- |
| Sort (Seiri) | Daily | Deduplicate new atoms; set `cold_archive_status = archived` on atoms that are superseded but not wrong |
| Set in Order (Seiton) | Weekly | Reconcile contradictions; verify cross-references; check `source_link_broken` flags |
| Shine (Seiso) | Weekly | Refresh embeddings for atoms older than the embedding-model version cutoff |
| Standardize (Seiketsu) | Monthly | Audit `atom_access_log` for anomalies; verify Auditor is enforcing all required fields; update `regulatory_snapshot` table for any code changes |
| Sustain (Shitsuke) | Quarterly | Disaster-recovery drill (restore from backup, validate integrity); check `consent_flags.expires_at` for expirations; Maintenance improves its own playbook |

Maintenance **never deletes, never modifies provenance, never changes `trust_tier`, never publishes.** These constraints are not bureaucratic — they preserve the chain of custody that makes a 2031 retrieval of a 2026 atom trustworthy. Removing them would save a few hours of Maintenance time and cost years of brain integrity.

---

## Six Sigma DMAIC and the 10x ROI Gate

Six Sigma's DMAIC framework (Define, Measure, Analyze, Improve, Control) is the diagnostic engine behind Quality Control's standard-setting cycle. It is also the framework behind the 10x ROI gate on every new skill proposal.

**Why 10x, not 2x or 5x?**

A 2-person Cleverwork team serving multiple clients has a limited build-and-maintain budget. A skill that saves 2x its cost frees up a little margin; it does not change the economics of the engagement. A skill that returns 10x pays for itself in weeks, generates surplus that funds the next 10x skill, and creates the compounding curve that makes a 2-person team capable of serving many clients without growing the team proportionally.

The 10x gate also acts as a filter against tooling-for-its-own-sake — the failure mode that kills AI agency practices. Building an agent skill because it is technically interesting, or because a client asked for it without a clear use case, is how scope creep happens. The A3 template in `proposals/_a3-template.md` requires a measured baseline (not an estimate; actual data from the brain's atoms where available), a projected new state with cost-of-agent-operation included, and an explicit ROI calculation. Innovator never invents the baseline — it cites atoms.

**"If the human is cheaper, the human remains."**

This is the most important sentence in the governance section. It is not a hedge. It is the decision rule. When the math in an A3 shows that the human performs the task at lower total cost (time + error rate + operating cost) than the agent alternative, the A3 is killed or deferred until conditions change. The goal is not to automate; the goal is to serve clients better at a cost structure that makes the Cleverwork business sustainable for 20 years.

Tasks that are **exempt from the 10x gate:**

- Mission-grade infrastructure: the debrief pipeline, era-stamping, property data model, EEAT flywheel. These are not optimizations; they are how the brain works. They do not have an alternative.
- High-error-cost tasks: when the cost of getting something wrong (a missed code requirement, a misrouted insurance supplement, an incorrect change order) is large enough that avoided-error cost pushes total ROI past 10x even if time savings alone do not.

---

## The 80/20 Principle and Phase Structure

The 80/20 rule (Vilfredo Pareto's observation, applied most consistently in quality management as the Pareto chart) states that roughly 80% of outcomes come from 20% of causes. For building a roofer's brain, this means:

- The first two agents (Operations + Sales) handle 80% of the daily interaction volume and value. The full 5+8 workforce is the eventual state; starting with all 13 agents enabled on day one creates noise before the capture rhythm is established.
- The first integration (AccuLynx) handles 80% of the operational data. CompanyCam, EagleView, and QuickBooks add incrementally; they are not prerequisites.
- The first 30 debriefs build 80% of the property and practitioner context the brain needs for the Historian to be reliably useful.

This is why `config/roofer.config.yaml` ships with most agents and integrations disabled. The config file is the 80/20 filter. Start with what moves the needle; add through the A3 gate.

---

## Five-Year Persistence: Why It Is Economically Viable

The combination of these principles is what makes the brain's 5-year persistence promise economically sound rather than aspirational:

1. **Karpathy's compiled wiki** eliminates the re-derivation cost on every query. The brain gets cheaper to query as it grows, not more expensive.
2. **Era-aware provenance** (the `era_of_practice`, `regulatory_snapshot_id`, and `recontextualization_notes` schema fields) makes atoms self-describing about their own decay. The brain doesn't have to be re-validated wholesale when codes change; atoms that reference outdated snapshots are flagged automatically and new atoms for the updated code are written alongside them.
3. **Demming-style system thinking** means the capture process itself improves over time. Each DMAIC cycle raises the floor on atom quality. Each 10x skill that ships raises the productivity of the team that feeds the brain.
4. **The Maintenance agent** does the bookkeeping that humans abandon. Karpathy's key insight applies directly: the reason personal knowledge bases die is maintenance burden, not content quality. Remove the burden and the wiki persists.
5. **The property as primary key** creates a compounding moat. Each property the brain touches gets richer over time and across clients. A competitor starting fresh in 2028 cannot replicate 5 years of property history at 123 Main Street regardless of how much they spend.

The brain is not a five-year subscription to a software product. It is a five-year construction of an institutional asset. The distinction matters for how clients value it and for how Cleverwork sustains it.

---

## Sources and Further Reading

- Karpathy, Andrej. *LLM Wiki* gist, 2024–2025. Available at `karpathy-gist/llm-wiki.md` in the Cleverwork reference library. Cleverwork re-expresses and extends the pattern; does not reproduce the text.
- Deming, W. Edwards. *Out of the Crisis*. MIT Press, 1982. The canonical statement of the system-quality argument and the 85/15 rule.
- Ohno, Taiichi. *Toyota Production System: Beyond Large-Scale Production*. Productivity Press, 1988. Primary source for Jidoka and the stop-the-line principle.
- Imai, Masaaki. *Kaizen: The Key to Japan's Competitive Success*. Random House, 1986. The 5S framework and the continuous-improvement philosophy.
- Harry, Mikel, and Richard Schroeder. *Six Sigma*. Doubleday, 2000. The DMAIC framework and the ROI-gate discipline.
- OB1 (Nate B. Jones). Persistent-memory spine and schema design. [natebjones.com](https://natebjones.com). The property-first extension and era-aware schema are Cleverwork-original additions to the OB1 base.
