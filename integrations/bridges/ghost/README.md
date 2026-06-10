# Ghost Resource - Disposable Postgres Lab For Agents

Status: research/planned  
Tier: infrastructure/Postgres lab  
Primary agents: Innovator, Maintenance, Auditor, Quality Control

Ghost provides a CLI and MCP-accessible workflow for creating, forking, inspecting, querying, and
discarding Postgres databases. For the Open Brain, Ghost is best treated as an agent lab for schema
experiments and restore drills, not as the production database.

Source docs:

- Ghost docs: https://ghost.build/docs/#introduction
- Ghost MCP section: https://ghost.build/docs/#mcp-integration
- Ghost API reference: https://ghost.build/docs/#api-reference

## Best Fit For The Brain

| Use case | Fit |
| --- | --- |
| Disposable schema experiments | Strong. Create/fork/discard workflow is designed for agent iteration. |
| Restore drills from sanitized dumps | Strong. Good proving ground outside production. |
| Testing Postgres extensions/indexing | Strong when extension support matches target needs. |
| Long-lived staging with raw PII | Needs separate approval and retention policy. |
| Production Open Brain source of truth | Blocked. Supabase remains production. |

## Recommended Posture

Use Ghost as an experiment runner:

1. Create or fork a lab database.
2. Load sanitized schema/data or a reviewed backup sample.
3. Run migrations, advisors, query plans, or agent-generated SQL.
4. Export findings into docs, migrations, or review packets.
5. Delete the lab database unless a human names a retention reason.

## MCP Value

Ghost's MCP surface can expose database create/fork/list/schema/sql/log operations to agents. That is
useful for controlled experiments because the agent can inspect and mutate a lab database without being
given production Supabase write access.

## Data Rules

Allowed by default:

- Empty schema.
- Synthetic seed data.
- Masked/sampled rows approved for testing.
- Public reference data.

Blocked by default:

- Raw customer PII.
- Raw invoices.
- Live vendor account data.
- Production secrets.

## Decision

Adopt Ghost after CLI/API authentication is set up. Use it for experiments and restore drills, with
short retention and no default production data.
