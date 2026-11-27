#!/usr/bin/env python3
"""Validate promotion metadata and optionally verify the deployed WASM bytes."""

import argparse
import base64
import binascii
import hashlib
import json
from pathlib import Path
import re


NETWORK_BY_ENVIRONMENT = {"staging": "testnet", "production": "mainnet"}


def is_contract_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"C[A-Z2-7]{55}", value):
        return False
    decoded = base64.b32decode(value)
    # Stellar StrKey contract version byte, payload, and little-endian CRC16-XModem.
    payload, checksum = decoded[:-2], decoded[-2:]
    return payload[0] == 16 and binascii.crc_hqx(payload, 0).to_bytes(2, "little") == checksum


def validate(manifest, expected_environment, wasm):
    if not isinstance(manifest, dict):
        raise ValueError("manifest must be a JSON object")

    environment = manifest.get("environment")
    if environment != expected_environment:
        raise ValueError(f"environment must be {expected_environment}")
    if manifest.get("network") != NETWORK_BY_ENVIRONMENT[expected_environment]:
        raise ValueError(f"network must be {NETWORK_BY_ENVIRONMENT[expected_environment]}")
    if not is_contract_id(manifest.get("contract_id")):
        raise ValueError("contract_id must be a valid Stellar contract StrKey")

    checksum = manifest.get("wasm_sha256")
    if not isinstance(checksum, str) or not re.fullmatch(r"[0-9a-f]{64}", checksum):
        raise ValueError("wasm_sha256 must be a lowercase SHA-256 hex digest")
    if wasm is not None and hashlib.sha256(wasm.read_bytes()).hexdigest() != checksum:
        raise ValueError("wasm_sha256 does not match the supplied WASM file")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--environment", required=True, choices=NETWORK_BY_ENVIRONMENT)
    parser.add_argument("--wasm", type=Path)
    args = parser.parse_args()
    try:
        validate(json.loads(args.manifest.read_text(encoding="utf-8")), args.environment, args.wasm)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Invalid deployment manifest: {error}\n")
    print(f"Deployment manifest valid for {args.environment}")


if __name__ == "__main__":
    main()
