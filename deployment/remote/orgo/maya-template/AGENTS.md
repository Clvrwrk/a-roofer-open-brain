---
type: RuntimeLaw
title: Maya paused runtime package law
version: 1.0.0
status: build-only
---

# Maya paused runtime package law

This tree is a build artifact for Maya Chen's next runtime. It is not an activation receipt and must remain safe to install and restart without provider credentials.

## Non-negotiable rules

1. The service may auto-start, but Maya remains paused until a valid Ed25519 activation receipt verifies against an injected public key.
2. No destination identifier, credential value, provider account, client data, queue cursor, schedule cursor, receipt, or effect state may enter source or the template.
3. No test may access the network or a business provider.
4. Every effect requires complete issue, run, occurrence, agent, client, trust, approval, cost, idempotency, and runtime context plus a durable reservation.
5. One task lease and one schedule registry are the maximum. Three identical failures park work; a fourth call is prohibited.
6. The default state is disabled. Missing or invalid configuration fails closed while leaving a local health receipt.
7. Runtime files use only the Node.js standard library unless a reviewed dependency is added with a lockfile, license, and software bill of materials update.
8. Expand every acronym on first use in documentation.

## Verification

Run the package's Node.js test suite, the negative secret scan, manifest validation, and release digest check before proposing a candidate. A provider-reported template or computer state is never sufficient by itself.
