---
type: Policy
title: Version 1.0 clone boundary
description: Defines what must be generalized before cloning this PE-specific brain to another roofer.
resource: /docs/knowledge-base/the-roofers-open-brain/
tags: [v1, clone, template, pro-exteriors]
timestamp: "2026-06-29T00:00:00Z"
---

# Decision

This repo is Pro Exteriors-specific until version 1.0. After v1.0, it can become the base for a cloned roofer brain.

# Before cloning

Generalize or template:

- Pro Exteriors credentials and tokens.
- Workspace IDs, Slack channel IDs, Linear team/project IDs.
- WorkOS tenant and service-token configuration.
- Supabase project references.
- Company-specific SOPs and thresholds.
- Agent identities that are PE-specific.

# Do not clone

- Raw secrets.
- Raw customer/private data.
- Local `.env` files.
- Kasm sessions or browser profiles.
- Agent memory that contains PE-only facts unless intentionally templated.

# Clone-ready signal

A v1.0 clone should be able to run `new-client.sh` or an equivalent deployment flow and generate a new isolated OKF bundle, Supabase project, Command Center, and agent fleet.

