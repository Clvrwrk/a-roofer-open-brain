# Maya restore runbook

Restore state only from a receipt set whose runtime version, agent identifier, client identifier, and release digest match the accepted manifest. Queue claims and reserved or ambiguous effects require reconciliation; they are never replayed automatically.

After restore, start paused, run the health and integrity checks, verify one service owner and one schedule registry, confirm cross-agent/client denial, and use a new activation receipt. Destination credentials are re-injected from the approved secret plane; they are not restored from a computer image or template.
