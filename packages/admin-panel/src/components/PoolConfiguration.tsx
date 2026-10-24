"use client";

import { useState, useEffect } from "react";
import { VaultClient } from "@neurowealth/vault-client";
import { useStore } from "@/lib/store";
import { getSorobanServer } from "@/lib/stellar";
import { Network } from "lucide-react";
import * as StellarSdk from "@stellar/stellar-sdk";
import { ActionReview, type ActionReviewChange } from "./ActionReview";

type PoolReview = { kind: "blend" | "dex"; value: string; change: ActionReviewChange };

interface PoolConfigurationProps {
  client: VaultClient;
  signer: StellarSdk.Keypair;
}

export function PoolConfiguration({ client, signer }: PoolConfigurationProps) {
  const { network } = useStore();
  const [blendPool, setBlendPool] = useState<string | null>(null);
  const [dexPool, setDexPool] = useState<string | null>(null);
  const [newBlendPool, setNewBlendPool] = useState("");
  const [newDexPool, setNewDexPool] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"blend" | "dex">("blend");
  const [review, setReview] = useState<PoolReview | null>(null);

  useEffect(() => {
    fetchPools();
  }, [client]);

  const fetchPools = async () => {
    try {
      const [blend, dex] = await Promise.all([
        client.get_blend_pool(signer.publicKey()),
        client.get_dex_pool(signer.publicKey()),
      ]);

      setBlendPool(blend);
      setDexPool(dex);
      setNewBlendPool(blend || "");
      setNewDexPool(dex || "");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch pool addresses",
      );
    }
  };

  const handleSetBlendPool = async (reviewedAddress: string) => {
    if (!reviewedAddress.startsWith("C")) {
      setError("Invalid Soroban contract address (must start with C)");
      return;
    }

    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const result = await client.set_blend_pool(
        signer,
        signer.publicKey(),
        reviewedAddress,
      );
      setTxHash(result.hash);
      setBlendPool(reviewedAddress);

      // Poll for confirmation
      const server = getSorobanServer(network);
      for (let i = 0; i < 60; i++) {
        try {
          const tx = await server.getTransaction(result.hash);
          if (tx.status === "SUCCESS") break;
        } catch {
          // Not confirmed yet
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set Blend pool");
    } finally {
      setLoading(false);
    }
  };

  const handleSetDexPool = async (reviewedAddress: string) => {
    if (!reviewedAddress.startsWith("C")) {
      setError("Invalid Soroban contract address (must start with C)");
      return;
    }

    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const result = await client.set_dex_pool(
        signer,
        signer.publicKey(),
        reviewedAddress,
      );
      setTxHash(result.hash);
      setDexPool(reviewedAddress);

      // Poll for confirmation
      const server = getSorobanServer(network);
      for (let i = 0; i < 60; i++) {
        try {
          const tx = await server.getTransaction(result.hash);
          if (tx.status === "SUCCESS") break;
        } catch {
          // Not confirmed yet
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set DEX pool");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Network size={24} className="text-emerald-400" />
        Protocol Pool Configuration
      </h3>

      <div className="flex gap-2 mb-6 border-b border-slate-700">
        {(["blend", "dex"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === tab
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-300"
            }`}
          >
            {tab === "blend" && "Blend Pool"}
            {tab === "dex" && "DEX Pool"}
          </button>
        ))}
      </div>

      {activeTab === "blend" && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 p-4 rounded">
            <div className="text-sm text-slate-400 mb-1">
              Current Blend Pool Address
            </div>
            {blendPool ? (
              <div className="text-sm font-mono text-emerald-400 break-all">
                {blendPool}
              </div>
            ) : (
              <div className="text-sm text-slate-500">Not configured</div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              New Blend Pool Address
            </label>
            <textarea
              value={newBlendPool}
              onChange={(e) => setNewBlendPool(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 font-mono text-sm"
              rows={2}
              placeholder="Enter Soroban contract address (starts with C...)"
            />
            <p className="text-xs text-slate-500 mt-1">
              Blend protocol address for lending strategy deployment
            </p>
          </div>

          <button
            onClick={() => setReview({
              kind: "blend",
              value: newBlendPool,
              change: { label: "Blend pool contract", current: blendPool || "Not configured", proposed: newBlendPool },
            })}
            disabled={loading}
            className="button-primary w-full py-3 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update Blend Pool"}
          </button>
        </div>
      )}

      {activeTab === "dex" && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 p-4 rounded">
            <div className="text-sm text-slate-400 mb-1">
              Current DEX Pool Address
            </div>
            {dexPool ? (
              <div className="text-sm font-mono text-emerald-400 break-all">
                {dexPool}
              </div>
            ) : (
              <div className="text-sm text-slate-500">Not configured</div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              New DEX Pool Address
            </label>
            <textarea
              value={newDexPool}
              onChange={(e) => setNewDexPool(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 font-mono text-sm"
              rows={2}
              placeholder="Enter Soroban contract address (starts with C...)"
            />
            <p className="text-xs text-slate-500 mt-1">
              Stellar DEX pool address for liquidity provision strategy
            </p>
          </div>

          <button
            onClick={() => setReview({
              kind: "dex",
              value: newDexPool,
              change: { label: "DEX pool contract", current: dexPool || "Not configured", proposed: newDexPool },
            })}
            disabled={loading}
            className="button-primary w-full py-3 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update DEX Pool"}
          </button>
        </div>
      )}

      {txHash && (
        <div className="mt-4 p-3 bg-emerald-900/20 border border-emerald-700 rounded text-sm text-emerald-300">
          <p className="font-mono break-all">Tx: {txHash}</p>
        </div>
      )}

      {review && (
        <ActionReview
          title={review.kind === "blend" ? "Blend pool update" : "DEX pool update"}
          network={String(network)}
          signer={signer.publicKey()}
          requiredAuthority="Contract owner"
          timelock="No additional timelock is used for this pool update."
          changes={[review.change]}
          loading={loading}
          onCancel={() => setReview(null)}
          onConfirm={() => {
            const proposal = review;
            setReview(null);
            if (proposal.kind === "blend") void handleSetBlendPool(proposal.value);
            else void handleSetDexPool(proposal.value);
          }}
        />
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
