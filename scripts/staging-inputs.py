#!/usr/bin/env python3
"""Validate staging dispatch inputs without contacting deployment services."""

import argparse
import json
from pathlib import Path


def staging_plan(mode: str, scope: str) -> str:
    if mode not in ("rehearse", "deploy"):
        raise ValueError(f"Unsupported staging mode {mode!r}")
    if scope not in ("full", "contract-only"):
        raise ValueError(f"Unsupported staging scope {scope!r}")
    if mode == "rehearse":
        return "validate-only"
    return "deploy-full" if scope == "full" else "deploy-contract"


def check_matrix(matrix: Path) -> None:
    cases = json.loads(matrix.read_text(encoding="utf-8"))
    if not cases:
        raise ValueError("The staging input matrix must contain cases")
    for case in cases:
        mode, scope, expected = case["mode"], case["scope"], case["expected"]
        try:
            result = staging_plan(mode, scope)
        except ValueError:
            result = "invalid"
        if result != expected:
            raise ValueError(
                f"mode={mode!r}, scope={scope!r}: expected {expected}, got {result}"
            )
        print(f"mode={mode!r}, scope={scope!r}: {result}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--matrix", type=Path)
    parser.add_argument("--mode")
    parser.add_argument("--scope")
    args = parser.parse_args()
    try:
        if args.matrix is not None and args.mode is None and args.scope is None:
            check_matrix(args.matrix)
        elif args.matrix is None and args.mode is not None and args.scope is not None:
            print(staging_plan(args.mode, args.scope))
        else:
            parser.error("provide --matrix or both --mode and --scope")
    except (OSError, ValueError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
