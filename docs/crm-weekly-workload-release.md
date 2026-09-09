# Shared Sales workload lanes

Companion of CRM_PWA a931a9dbd2cc02904f8c9df2cf08c7cc82498813. Contracts/server0.1.19 and workspace0.1.32 provide one shared active-sales, cancellation-review and invoice-review interface. The desktop remains under /sales/wip-ar. Source balances remain immutable; held exceptions require explicit Ops and Accounting acknowledgment, while active Wednesday submission uses its own complete workload.

Independent CRM reviews cover exact SQL, contracts, UI and actual parent state transitions. Earlier stale-session and pending-feedback failures were fixed and retained in CRM reports. Desktop568 tests and build pass. This source package update does not claim hosted beta acceptance or activate canonical Friday. Existing exact HTTPS proxy allowlist and legacy guards remain unchanged.

Owning work: PEC-299 / PEC-300 / PEC-301; CAT-188 / CAT-189 / CAT-190. Canonical receipts remain in CODEX docs/linear/teams/PEC, linked from CRM docs/handoffs/linear-accounting.json.

Package hashes:
- proexteriors-contracts-0.1.19.tgz: 337fc44588e89e738b5fb4987da135d6b8ddc9da43d3b4d1a033ec7d70e596eb
- proexteriors-crm-server-0.1.19.tgz: 35d88f939de60d063b8452afcecb77e951baa90c7f6a9bc8395e270f64ecc6c9
- proexteriors-sales-workspace-0.1.19.tgz: c8fc85b848a8bd616168b0a2ab57e0f9b7133ee93e3ce6798404116ce5313f71
- proexteriors-sales-workspace-0.1.32.tgz: 3477ff2ca4fbadc86951b6b7f85de2fa6de301efc4af71176c97407d4c5e966f
