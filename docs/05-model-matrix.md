# Model Matrix — Agent Roles to Model Tiers

> This matrix defines which model tier each agent role maps to, what the fallback path is, and how the mapping connects to the `config.model_tiers` keys in `config/roofer.config.yaml`. Update this document when you change tiers; the config is the source of truth at runtime.

---

## Model Tier Definitions

Four tiers are defined in `config/roofer.config.yaml` under `model_tiers`:

| Config key | Default value | What it means |
| --- | --- | --- |
| `model_tiers.reasoning` | `frontier` | The most capable available model; used for judgment-heavy, output-is-the-product tasks |
| `model_tiers.workhorse` | `standard` | A strong general-purpose model; balances capability and cost for high-frequency tasks |
| `model_tiers.capture` | `fast` | The cheapest model that reliably produces structured output; used for classification, dedup, and atomization where latency and volume matter |
| `model_tiers.embeddings` | `managed` | Managed cloud embeddings API; `ollama` in local deployment profile |

To change a tier globally, edit the value in `config/roofer.config.yaml`. All agent roles that reference that tier key pick up the change automatically — you do not need to edit individual agent configs.

---

## Agent Role Matrix

### Vertical Agents

| Agent | Role | Model tier | Tier key | Reasoning |
| --- | --- | --- | --- | --- |
| `@ob-ops` (Operations) | Day-to-day scheduling, daily logs, materials, crew coordination | `workhorse` | `model_tiers.workhorse` | High frequency; output reviewed by human before action. Standard model is cost-effective and sufficient. |
| `@ob-sales` (Sales) | Leads, estimates, insurance claims, proposals, follow-up | `workhorse` | `model_tiers.workhorse` | Proposals and estimates are reviewed by a human before sending to clients. Workhorse is appropriate for draft production. |
| `@ob-accounting` (Accounting) | Invoicing, AR/AP, change orders, supplements | `workhorse` | `model_tiers.workhorse` | Financial outputs are human-reviewed. Exception: final supplement strategy analysis benefits from reasoning tier (see override below). |
| `@ob-marketing` (Marketing) | Content, reviews, EEAT atoms, schema markup | `workhorse` | `model_tiers.workhorse` | Content drafts are always client-approved before publication. |
| `@ob-exec` (Executive/Strategy) | Dashboards, KPIs, strategic planning, hiring | `reasoning` | `model_tiers.reasoning` | Strategic outputs require synthesis across many data points and multi-step reasoning. Cost is justified by the decision quality. |

**Accounting supplement analysis override:** when `@ob-accounting` is running the insurance-supplement skill (`accounting:insurance-supplements`), the skill config can request the `reasoning` tier for the supplement scope analysis step. This is a per-skill override in the skill's `metadata.json`; it does not change the agent's default tier.

### Horizontal Agents

| Agent | Function | Model tier | Tier key | Reasoning |
| --- | --- | --- | --- | --- |
| Capture | Atomization, classification, dedup, dual-track split | `capture` | `model_tiers.capture` | Fast, structured, high volume. The fast model handles JSON-output atomization reliably. Context window is small per call; throughput matters more than depth. |
| Historian | Internal retrieval and synthesis over the brain | `workhorse` | `model_tiers.workhorse` | Retrieval synthesis requires coherent output; workhorse handles this well. Historian does not reason about novel problems — it retrieves and contextualizes. |
| Researcher | External retrieval and synthesis from web/APIs | `workhorse` | `model_tiers.workhorse` | Same profile as Historian. Researcher synthesizes external sources; it does not need frontier reasoning for most queries. |
| Conductor | Routing, digest composition, escalation | `workhorse` | `model_tiers.workhorse` | Digest composition is a structured writing task; workhorse is appropriate. Routing decisions are mostly rules-based. |
| Auditor | Per-work-product quality gate | `reasoning` | `model_tiers.reasoning` | Auditor must apply nuanced judgment against versioned standards, detect ambiguous compliance cases, and produce structured rejection rationale. Frontier model reduces pass/fail errors. |
| Quality Control | Cross-job pattern detection, DMAIC initiation, standard-setting | `reasoning` | `model_tiers.reasoning` | QC's output sets the standard that Auditor enforces for all future work. Wrong standards compound. Frontier model is the appropriate investment for this function. |
| Innovator | A3 proposal drafting, pattern detection | `reasoning` | `model_tiers.reasoning` | Innovator synthesizes pattern data across jobs and produces structured A3 proposals with ROI calculations. Reasoning tier improves proposal quality and reduces the back-and-forth in human review. |
| Maintenance | 5S hygiene, dedup, archive, embedding refresh | `capture` | `model_tiers.capture` | Most Maintenance tasks are classification and bookkeeping — is this a duplicate? Is this atom cold? Fast model is sufficient and the volume is high. The monthly Standardize audit uses `workhorse` (single call, not high volume). |

---

## Embeddings

Embeddings are not model-tier calls in the same sense as the agents above — they run through a dedicated endpoint, not the main LLM. The `model_tiers.embeddings` key controls which provider is used:

| Value | Endpoint | Notes |
| --- | --- | --- |
| `managed` | Cloud embeddings API (key in `EMBEDDINGS_API_KEY`) | Default for remote profile. Consistent vector space across all atoms. |
| `ollama` | `OLLAMA_BASE_URL/api/embeddings` | Required for local profile. Default model: `nomic-embed-text`. See `docs/04-going-local.md`. |

**Important:** mixing embedding providers across atoms in the same brain breaks similarity search. If you switch from `managed` to `ollama` (or vice versa), you must re-embed all existing atoms. `scripts/reembed-all.sh` handles this. It can take hours on a large brain; plan accordingly.

---

## Fallback Paths

When the primary model for a tier is unavailable (rate limit, outage, or budget exhaustion), agents fall back in this order:

| Tier | Primary | Fallback 1 | Fallback 2 |
| --- | --- | --- | --- |
| `reasoning` (`frontier`) | Claude Opus (latest) | Claude Sonnet (latest) | Queue and retry; do not silently downgrade reasoning tasks |
| `workhorse` (`standard`) | Claude Sonnet (latest) | Claude Haiku (latest) | Log degraded output; flag for Auditor re-check |
| `capture` (`fast`) | Claude Haiku (latest) | Claude Haiku (prior stable) | Retry; capture is idempotent |
| `embeddings` (`managed`) | Primary managed endpoint | Secondary managed endpoint | Ollama (if local stack is available); queue if not |

The Conductor posts a degraded-model alert to the internal Cleverwork channel when a fallback fires. Audit logs record which model tier was actually used for each agent call via the `model_card` field on every atom.

**Auditor and QC never silently downgrade.** If the `reasoning` tier is unavailable and an Auditor or QC task is queued, Conductor escalates to Chris rather than running the check on a workhorse model. The cost of a missed Auditor failure on a client proposal is higher than the cost of a brief delay.

---

## Local Profile Overrides

In `profile: local` (see `docs/04-going-local.md`), cloud model tiers may be replaced by local Ollama models. To configure local overrides without changing the tier keys, set the following in `.env`:

```
# Local model tier overrides (only read when deployment.profile = local)
LOCAL_REASONING_MODEL=gemma4:31b
LOCAL_WORKHORSE_MODEL=qwen3-coder:27b
LOCAL_CAPTURE_MODEL=qwen3:4b
```

These values override the cloud tier mappings when the local profile is active. The tier key structure in `config/roofer.config.yaml` does not change; the `.env` values inject the specific local model names at runtime.

---

## Updating This Matrix

When you change a model tier (either the global tier value in `config/roofer.config.yaml` or an agent-specific override in the agent's `ROLE.md`), update the matrix table above. The matrix is read by:

- Cleverwork operators reviewing cost and capability before a client deployment.
- The Innovator agent when drafting A3 proposals that involve new skills (model cost is an input to the ROI calculation).
- The `scripts/verify-deployment.sh` script, which checks that configured model tiers are reachable before reporting a passing deployment.
