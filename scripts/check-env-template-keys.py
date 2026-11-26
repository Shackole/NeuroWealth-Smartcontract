#!/usr/bin/env python3
"""Compare committed environment templates with their runtime requirements."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
NAME = r"[A-Za-z_][A-Za-z0-9_]*"
ASSIGNMENT = re.compile(rf"^\s*(?:export\s+)?({NAME})\s*=")
SHELL_REQUIRED = re.compile(rf"\$\{{({NAME}):?\?")
PRISMA_REQUIRED = re.compile(rf'\benv\("({NAME})"\)')

PRISMA = ("agent/prisma/schema.prisma", PRISMA_REQUIRED)
TEMPLATES = {
    ".env.staging.template": (
        ("scripts/reset-staging-db.sh", SHELL_REQUIRED),
        PRISMA,
    ),
    "agent/.env.local.template": (PRISMA,),
}


def required_keys(source, pattern):
    lines = (ROOT / source).read_text(encoding="utf-8").splitlines()
    return {
        name
        for line in lines
        if not line.lstrip().startswith(("#", "//"))
        for name in pattern.findall(line)
    }


def main():
    failed = False
    for template, sources in TEMPLATES.items():
        declared = {
            match.group(1)
            for line in (ROOT / template).read_text(encoding="utf-8").splitlines()
            if (match := ASSIGNMENT.match(line))
        }
        for source, pattern in sources:
            required = required_keys(source, pattern)
            if not required:
                print(f"{source}: could not find any required keys")
                failed = True
            for key in sorted(required - declared):
                print(f"{template}: missing {key} (required by {source})")
                failed = True
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
