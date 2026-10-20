#!/usr/bin/env python3
"""Send an actionable PagerDuty event when the backup workflow fails."""

import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    routing_key = os.environ.get("PAGERDUTY_ROUTING_KEY", "")
    if not routing_key:
        print("PAGERDUTY_ROUTING_KEY is required to alert on a failed backup", file=sys.stderr)
        return 1

    repository = os.environ.get("GITHUB_REPOSITORY", "unknown/unknown")
    run_url = os.environ.get("GITHUB_RUN_URL", "")
    revision = os.environ.get("GITHUB_SHA", "unknown")
    message = f"Database backup workflow failed for {repository} at revision {revision}. Run: {run_url}"
    event = {
        "routing_key": routing_key,
        "event_action": "trigger",
        "payload": {
            "summary": f"[NeuroWealth] {message}",
            "severity": "critical",
            "source": "neurowealth-backup-workflow",
            "custom_details": {"repository": repository, "revision": revision, "workflow_run": run_url},
        },
    }
    request = urllib.request.Request(
        "https://events.pagerduty.com/v2/enqueue",
        data=json.dumps(event).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status >= 300:
                print(f"PagerDuty rejected backup failure event (HTTP {response.status})", file=sys.stderr)
                return 1
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"Failed to send PagerDuty backup failure event: {error}", file=sys.stderr)
        return 1
    print(f"PagerDuty notified for failed backup workflow at revision {revision}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
