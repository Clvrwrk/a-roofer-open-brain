#!/usr/local/lib/hermes-agent/venv/bin/python3
"""Run Hermes one-shot without its mandatory on-disk file handlers.

The Maya validation runtime deliberately keeps HERMES_HOME immutable. Hermes
currently initializes RotatingFileHandler twice; the second call is not
best-effort and fails before inference when the runtime cannot create agent.log.
This root-owned compatibility entrypoint replaces only setup_logging() in the
current Python process, then enters the pinned Hermes CLI normally.
"""

from pathlib import Path
import os
import sys

EXPECTED_HOME = Path("/opt/pe-cc-agents/maya-hermes-home")
EXPECTED_PROVIDER = "openrouter"
EXPECTED_MODEL = "google/gemini-3.1-flash-lite"


def validate_invocation() -> None:
    if os.environ.get("HERMES_HOME") != str(EXPECTED_HOME):
        raise SystemExit("Hermes compatibility boundary rejected the home")
    if len(sys.argv) != 7:
        raise SystemExit("Hermes compatibility boundary rejected the invocation")
    if sys.argv[1] != "--oneshot" or not sys.argv[2].strip():
        raise SystemExit("Hermes compatibility boundary requires one-shot mode")
    if sys.argv[3:7] != ["--provider", EXPECTED_PROVIDER, "--model", EXPECTED_MODEL]:
        raise SystemExit("Hermes compatibility boundary rejected provider or model")


def no_file_logging(*, hermes_home=None, **_kwargs):
    requested_home = Path(hermes_home) if hermes_home is not None else EXPECTED_HOME
    if requested_home != EXPECTED_HOME:
        raise RuntimeError("Hermes compatibility boundary rejected a logging path")
    return EXPECTED_HOME / "logs"


validate_invocation()

import hermes_logging  # noqa: E402

hermes_logging.setup_logging = no_file_logging

from hermes_cli.main import main  # noqa: E402

main()
