# Maya broad Composio capability promotion (PEC-113)

## Outcome

Promote Maya's live Orgo runtime from intake/conversation-only behavior to a
multi-step work executor across her existing Composio Gmail, Slack, and
PE-CC-Dev Linear connections.

## Authorized actions

| System | Read/work actions | External effects |
| --- | --- | --- |
| Gmail | search messages, read messages/threads, retrieve attachments, list labels | reply, send, create draft, add/remove labels, move to Trash |
| Linear | search/list/get issues | create PE-CC-Dev issues, update issues, add comments |
| Slack | search, list accessible channels, read history/threads | send/update Maya messages, share generated text files |

Hermes remains inference-only. It selects one friendly action at a time from a
fixed catalog. The outer executor validates the arguments, supplies the exact
versioned Composio tool slug and pinned account, executes it, bounds/redacts the
provider result, and returns that result for the next reasoning turn. A request
may use at most eight tool actions before it must finish or fail closed.

## Removed restrictions

- mailbox intake no longer stops at `ignore`, `track`, or `block`;
- Maya may acknowledge and reply to senders;
- Maya may send new email and create drafts;
- Maya may retrieve attachments for task work;
- Linear is no longer create-only;
- Slack is no longer limited to conversational replies or the owner channel.

## Irreducible controls

- exact Maya Composio user and connected-account IDs remain release-pinned;
- new Linear issues remain pinned to PE-CC-DevTeam;
- every email adds `admin@cc.proexteriorsus.net` to CC in code;
- every email, Slack message, and Linear contribution receives Maya attribution
  in code;
- credentials and protected authentication language cannot be emitted;
- permanent deletion, payment execution, credential disclosure, and access
  administration are not in the action catalog;
- every provider-confirmed write appends a hashed action/reference receipt;
- uncertain writes are terminally ambiguous and are not automatically retried;
- the existing Composio trigger and Supervisor program remain the kill switch.

## Activation and rollback

1. Run the complete listener tests and three-track Ringer gate locally.
2. Disable and confirm the exact Maya Composio Slack trigger.
3. Stop and confirm the Supervisor program.
4. Install the root-owned `0.3.0` release with the existing disabled installer.
5. Verify trust chain and Hermes zero-tool boundary while stopped.
6. Enable the exact trigger, start the exact program, and verify stable health.
7. Execute an owner-safe live Slack capability validation; do not create a
   synthetic third-party email or destructive effect.

Rollback is trigger-first: disable and confirm the exact trigger, stop the
program, retain ambiguous receipts, and restore the private prior release only
through the existing operator rollback procedure.

## Known operational limit

Composio attachment retrieval is exposed. Binary PDF/XLSX semantic extraction
still depends on what the provider returns and the parsers present on the Orgo
image; the current image has Python but no system PDF/office converter. Maya must
surface `[BLOCKED]` rather than pretend she analyzed bytes she could not decode.
