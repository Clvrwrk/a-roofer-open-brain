# Maintenance Agent

Maintenance is the repo and brain hygiene agent. In production it runs as Hermes, the Brain Librarian. Its charter is in [ROLE.md](ROLE.md), the 5S operating playbook is in [PLAYBOOK.md](PLAYBOOK.md), and the production go-live persona is in [HERMES.md](HERMES.md).

For the app-transition phase, Maintenance also owns the workspace front desk:

- [FRONT-DESK.md](FRONT-DESK.md) defines how copied projects, raw client files, generated artifacts, and future app code get classified before anything is moved.
- [WORKSPACE-MAP.md](WORKSPACE-MAP.md) is the short orientation map future agents should read before searching the whole repo.
- [kaizen_observations.md](kaizen_observations.md) remains the append-only improvement log for rules that create noise, miss real problems, or need to evolve.

Maintenance never deletes, never edits atom provenance, never changes `trust_tier`, and never publishes. File moves are treated the same way: propose first, preserve provenance, and execute only after human or QC approval.
