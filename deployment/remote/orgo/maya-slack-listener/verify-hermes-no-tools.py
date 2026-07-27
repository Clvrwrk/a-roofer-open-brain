#!/usr/bin/python3
import json
import sys

from hermes_cli.tools_config import _get_platform_tools


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: verify-hermes-no-tools.py CONFIG")
    with open(sys.argv[1], encoding="utf-8") as handle:
        config = json.load(handle)
    enabled = sorted(_get_platform_tools(config, "cli"))
    if enabled:
        raise SystemExit("Hermes CLI tools are not disabled")
    print("hermes_toolsets=0")


if __name__ == "__main__":
    main()
