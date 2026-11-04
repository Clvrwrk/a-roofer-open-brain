#!/usr/bin/env bash
# lint-design.sh — RETIRED 2026-11-04.
#
# This used to lint config/brand/DESIGN.md with the @google/design.md CLI. That
# file is now a pointer, the vendored spec is gone, and nothing calls this script
# (scripts/verify-deployment.sh no longer runs it). The design system is
# https://ds.proexteriorsus.net (@proexteriors/ds in Clvrwrk/CRM_PWA); its check is
#   node packages/ds/scripts/lint.mjs <app dir>      (run in CRM_PWA)
# Kept as a stub so old docs and muscle memory get a clear answer, not a failure.
echo "lint-design: retired 2026-11-04. Use the ds check in Clvrwrk/CRM_PWA: node packages/ds/scripts/lint.mjs <app dir> (see https://ds.proexteriorsus.net)." >&2
exit 0
