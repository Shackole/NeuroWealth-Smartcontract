import { NextResponse } from "next/server";
import type { PauseEvent } from "@/lib/pause-events";

/**
 * GET /api/pause-events
 *
 * Returns recent pause/unpause events for the activity log (Issue #19).
 * In production this would query the agent's PostgreSQL database for
 * contract events emitted by the vault (Paused / Unpaused events).
 *
 * The mock data below demonstrates the expected response shape.
 */

export async function GET() {
  // In production: query the agent DB for vault Paused/Unpaused events
  // e.g. SELECT * FROM contract_events WHERE topic = 'paused' OR topic = 'unpaused'
  //       ORDER BY ledger_sequence DESC LIMIT 20;
  const events: PauseEvent[] = [
    {
      id: "evt_003",
      action: "UNPAUSED",
      timestamp: Date.UTC(2026, 0, 3, 14)
      txHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      triggeredBy: "GABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234YZ",
    },
    {
      id: "evt_002",
      action: "PAUSED",
      timestamp: Date.UTC(2026, 0, 3, 12)
      txHash: "f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2",
      triggeredBy: "GABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234YZ",
    },
    {
      id: "evt_001",
      action: "UNPAUSED",
      timestamp: Date.UTC(2026, 0, 1, 16)
      txHash: "0a1b2c3d4e5f0a1b2c3d4e5f0a1b2c3d4e5f0a1b2c3d4e5f0a1b2c3d4e5f0a1b",
      triggeredBy: "GABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234YZ",
    },
  ];

  return NextResponse.json(events, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
