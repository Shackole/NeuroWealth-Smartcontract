export interface PauseEvent {
  id: string;
  action: "PAUSED" | "UNPAUSED";
  timestamp: number; // unix ms
  txHash: string;
  triggeredBy: string;
}
