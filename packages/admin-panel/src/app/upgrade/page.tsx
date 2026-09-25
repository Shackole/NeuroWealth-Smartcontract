"use client";

/**
 * /upgrade — Dedicated upgrade management page (Issue #18).
 *
 * Shows the upgrade timelock banner/controls for the contract owner.
 * Non-owners receive an Access Denied message.
 */

import { useState, useEffect } from "react";
import { VaultClient } from "@neurowealth/vault-client";
import { useStore } from "@/lib/store";
import { getSorobanServer, NETWORKS } from "@/lib/stellar";
import { WalletConnect } from "@/components/WalletConnect";
import { UpgradeTimelock } from "@/components/UpgradeTimelock";
import { ContractUpgrade } from "@/components/ContractUpgrade";
import { GitBranch, ShieldOff, Settings, ArrowLeft } from "lucide-react";
import * as StellarSdk from "@stellar/stellar-sdk";
import Link from "next/link";

export default function UpgradePage() {
  const { publicKey, isConnected, network, contractId } = useStore();
  const [client, setClient] = useState<VaultClient | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [currentLedger, setCurrentLedger] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !publicKey || !contractId) return;

    const init = async () => {
      setLoading(true);
      setError(null);

      try {
        const vaultClient = new VaultClient({
          contractId,
          rpcUrl: NETWORKS[network].rpcUrl,
          networkPassphrase: NETWORKS[network].networkPassphrase,
        });
        setClient(vaultClient);

        const tempKey = StellarSdk.Keypair.random();

        try {
          const contractOwner = await vaultClient.get_owner(tempKey.publicKey());
          setOwner(contractOwner);
        } catch (err) {
          setError(`Failed to fetch contract owner: ${err}`);
        }

        try {
          const server = getSorobanServer(network);
          const latestLedger = await server.getLatestLedger();
          setCurrentLedger(latestLedger.sequence);
        } catch {
          // non-critical
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize client");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [isConnected, publicKey, network, contractId]);

  // Refresh ledger number every 30 s so the banner time remaining stays accurate
  useEffect(() => {
    if (!isConnected || !network) return;

    const update = async () => {
      try {
        const server = getSorobanServer(network);
        const latest = await server.getLatestLedger();
        setCurrentLedger(latest.sequence);
      } catch {
        // ignore
      }
    };

    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [isConnected, network]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold gradient-text">
            NeuroWealth Admin
          </h1>
          <p className="text-slate-400">Connect your wallet to manage upgrades</p>
          <WalletConnect />
        </div>
      </div>
    );
  }

  const isOwner = !!owner && publicKey === owner;
  const tempSigner = StellarSdk.Keypair.random();

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="glass-effect border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                aria-label="Back to admin dashboard"
              >
                <ArrowLeft size={16} />
                Admin
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <GitBranch size={20} className="text-amber-400" />
                  Contract Upgrade
                </h1>
                <p className="text-xs text-slate-400">24-hour timelock upgrade management</p>
              </div>
            </div>
            <WalletConnect />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {loading && (
          <div className="mb-6 p-4 rounded-lg bg-blue-900/20 border border-blue-700 text-sm text-blue-300">
            Loading contract information…
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-700 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Access denied for non-owners */}
        {!loading && client && owner && !isOwner && (
          <div className="card border-2 border-red-700 text-center py-12">
            <ShieldOff className="mx-auto mb-4 text-red-500" size={48} />
            <h2 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h2>
            <p className="text-slate-300 mb-1">
              Only the contract owner can manage upgrades.
            </p>
            <p className="text-xs text-slate-500 font-mono mt-3">
              Owner: {owner}
            </p>
            <p className="text-xs text-slate-500 font-mono">
              Connected: {publicKey}
            </p>
          </div>
        )}

        {/* Owner view */}
        {!loading && client && owner && isOwner && (
          <div className="space-y-8">
            {/* Prominent timelock banner at the top */}
            <UpgradeTimelock
              client={client}
              signer={tempSigner}
              currentLedger={currentLedger}
              ownerPublicKey={owner}
              connectedPublicKey={publicKey!}
            />

            {/* Full upgrade management widget */}
            <ContractUpgrade
              client={client}
              signer={tempSigner}
              currentLedger={currentLedger}
            />

            {/* Info card */}
            <div className="card bg-slate-800/40 border border-slate-700">
              <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                <Settings size={16} className="text-slate-400" />
                Upgrade Process
              </h3>
              <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
                <li>Schedule an upgrade by selecting a compiled .wasm file — starts the 24 h timelock.</li>
                <li>Wait for the timelock to elapse (~17,280 ledgers ≈ 24 hours).</li>
                <li>Once the banner shows "Ready to execute", click Execute Upgrade.</li>
                <li>Cancel at any time before execution to abort the pending upgrade.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Not connected / no contract configured */}
        {!loading && !client && !error && (
          <div className="card text-center py-12 text-slate-400">
            <p>Configure the contract ID in the admin dashboard first.</p>
            <Link href="/" className="mt-4 inline-block text-emerald-400 hover:underline text-sm">
              Go to Admin Dashboard →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
