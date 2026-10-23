"use client";

import { useState, useEffect } from "react";
import { VaultClient, DECIMAL_PLACES } from "@neurowealth/vault-client";
import { useStore } from "@/lib/store";
import { getSorobanServer } from "@/lib/stellar";
import { TrendingUp, DollarSign } from "lucide-react";
import * as StellarSdk from "@stellar/stellar-sdk";
import { ActionReview, type ActionReviewChange } from "./ActionReview";

type CapReview = {
  kind: "tvl" | "user" | "limits";
  title: string;
  changes: ActionReviewChange[];
  values: string[];
};

interface CapsConfigurationProps {
  client: VaultClient;
  signer: StellarSdk.Keypair;
}

export function CapsConfiguration({ client, signer }: CapsConfigurationProps) {
  const { network } = useStore();
  const [tvlCap, setTvlCap] = useState<bigint | null>(null);
  const [userDepositCap, setUserDepositCap] = useState<bigint | null>(null);
  const [minDeposit, setMinDeposit] = useState<bigint | null>(null);
  const [maxDeposit, setMaxDeposit] = useState<bigint | null>(null);

  const [newTvlCap, setNewTvlCap] = useState("");
  const [newUserCap, setNewUserCap] = useState("");
  const [newMinDeposit, setNewMinDeposit] = useState("");
  const [newMaxDeposit, setNewMaxDeposit] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tvl" | "user" | "limits">("tvl");
  const [review, setReview] = useState<CapReview | null>(null);

  useEffect(() => {
    fetchCaps();
  }, [client]);

  const fetchCaps = async () => {
    try {
      const [tvl, userCap, min, max] = await Promise.all([
        client.get_tvl_cap(signer.publicKey()),
        client.get_user_deposit_cap(signer.publicKey()),
        client.get_min_deposit(signer.publicKey()),
        client.get_max_deposit(signer.publicKey()),
      ]);

      setTvlCap(tvl);
      setUserDepositCap(userCap);
      setMinDeposit(min);
      setMaxDeposit(max);

      // Initialize form fields
      setNewTvlCap((tvl / BigInt(10 ** DECIMAL_PLACES)).toString());
      setNewUserCap((userCap / BigInt(10 ** DECIMAL_PLACES)).toString());
      setNewMinDeposit((min / BigInt(10 ** DECIMAL_PLACES)).toString());
      setNewMaxDeposit((max / BigInt(10 ** DECIMAL_PLACES)).toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch caps");
    }
  };

  const handleSetTvlCap = async (reviewedValue: string) => {
    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const capInBaseUnits = BigInt(reviewedValue) * BigInt(10 ** DECIMAL_PLACES);
      const result = await client.set_tvl_cap(
        signer,
        signer.publicKey(),
        capInBaseUnits,
      );
      setTxHash(result.hash);
      setTvlCap(capInBaseUnits);

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
      setError(err instanceof Error ? err.message : "Failed to set TVL cap");
    } finally {
      setLoading(false);
    }
  };

  const handleSetUserCap = async (reviewedValue: string) => {
    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const capInBaseUnits = BigInt(reviewedValue) * BigInt(10 ** DECIMAL_PLACES);
      const result = await client.set_user_deposit_cap(
        signer,
        signer.publicKey(),
        capInBaseUnits,
      );
      setTxHash(result.hash);
      setUserDepositCap(capInBaseUnits);

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
      setError(err instanceof Error ? err.message : "Failed to set user cap");
    } finally {
      setLoading(false);
    }
  };

  const handleSetLimits = async (reviewedMin: string, reviewedMax: string) => {
    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const minInBaseUnits =
        BigInt(reviewedMin) * BigInt(10 ** DECIMAL_PLACES);
      const maxInBaseUnits =
        BigInt(reviewedMax) * BigInt(10 ** DECIMAL_PLACES);

      const result = await client.set_deposit_limits(
        signer,
        signer.publicKey(),
        minInBaseUnits,
        maxInBaseUnits,
      );
      setTxHash(result.hash);
      setMinDeposit(minInBaseUnits);
      setMaxDeposit(maxInBaseUnits);

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
      setError(err instanceof Error ? err.message : "Failed to set limits");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
        <DollarSign size={24} className="text-emerald-400" />
        Caps & Limits Configuration
      </h3>

      <div className="flex gap-2 mb-6 border-b border-slate-700">
        {(["tvl", "user", "limits"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === tab
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-300"
            }`}
          >
            {tab === "tvl" && "TVL Cap"}
            {tab === "user" && "User Deposit Cap"}
            {tab === "limits" && "Transaction Limits"}
          </button>
        ))}
      </div>

      {activeTab === "tvl" && tvlCap !== null && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 p-4 rounded">
            <div className="text-sm text-slate-400 mb-1">Current TVL Cap</div>
            <div className="text-2xl font-mono font-bold text-emerald-400">
              ${(tvlCap / BigInt(10 ** DECIMAL_PLACES)).toString()} USDC
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              New TVL Cap (USDC)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={newTvlCap}
                onChange={(e) => setNewTvlCap(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100"
                placeholder="Enter amount in USDC"
              />
              <button
                onClick={() => setReview({
                  kind: "tvl",
                  title: "TVL cap",
                  values: [newTvlCap],
                  changes: [{ label: "TVL cap (USDC)", current: (tvlCap / BigInt(10 ** DECIMAL_PLACES)).toString(), proposed: newTvlCap }],
                })}
                disabled={loading}
                className="button-primary px-6 py-2 disabled:opacity-50"
              >
                {loading ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "user" && userDepositCap !== null && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 p-4 rounded">
            <div className="text-sm text-slate-400 mb-1">
              Current User Deposit Cap
            </div>
            <div className="text-2xl font-mono font-bold text-emerald-400">
              ${(userDepositCap / BigInt(10 ** DECIMAL_PLACES)).toString()} USDC
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              New User Deposit Cap (USDC)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={newUserCap}
                onChange={(e) => setNewUserCap(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100"
                placeholder="Enter amount in USDC"
              />
              <button
                onClick={() => setReview({
                  kind: "user",
                  title: "Per-user deposit cap",
                  values: [newUserCap],
                  changes: [{ label: "Per-user deposit cap (USDC)", current: (userDepositCap / BigInt(10 ** DECIMAL_PLACES)).toString(), proposed: newUserCap }],
                })}
                disabled={loading}
                className="button-primary px-6 py-2 disabled:opacity-50"
              >
                {loading ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "limits" && minDeposit !== null && maxDeposit !== null && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-800/50 p-4 rounded">
              <div className="text-sm text-slate-400 mb-1">Min Deposit</div>
              <div className="text-xl font-mono font-bold text-emerald-400">
                ${(minDeposit / BigInt(10 ** DECIMAL_PLACES)).toString()}
              </div>
            </div>
            <div className="bg-slate-800/50 p-4 rounded">
              <div className="text-sm text-slate-400 mb-1">Max Deposit</div>
              <div className="text-xl font-mono font-bold text-emerald-400">
                ${(maxDeposit / BigInt(10 ** DECIMAL_PLACES)).toString()}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Min Per-Tx Deposit (USDC)
              </label>
              <input
                type="number"
                value={newMinDeposit}
                onChange={(e) => setNewMinDeposit(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Max Per-Tx Deposit (USDC)
              </label>
              <input
                type="number"
                value={newMaxDeposit}
                onChange={(e) => setNewMaxDeposit(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100"
              />
            </div>
          </div>

          <button
            onClick={() => setReview({
              kind: "limits",
              title: "Transaction deposit limits",
              values: [newMinDeposit, newMaxDeposit],
              changes: [
                { label: "Minimum deposit (USDC)", current: (minDeposit / BigInt(10 ** DECIMAL_PLACES)).toString(), proposed: newMinDeposit },
                { label: "Maximum deposit (USDC)", current: (maxDeposit / BigInt(10 ** DECIMAL_PLACES)).toString(), proposed: newMaxDeposit },
              ],
            })}
            disabled={loading}
            className="button-primary w-full py-3 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update Limits"}
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
          title={review.title}
          network={String(network)}
          signer={signer.publicKey()}
          requiredAuthority="Contract owner"
          timelock="No additional timelock is used for this cap update."
          changes={review.changes}
          loading={loading}
          onCancel={() => setReview(null)}
          onConfirm={() => {
            const proposal = review;
            setReview(null);
            if (proposal.kind === "tvl") void handleSetTvlCap(proposal.values[0]);
            if (proposal.kind === "user") void handleSetUserCap(proposal.values[0]);
            if (proposal.kind === "limits") void handleSetLimits(proposal.values[0], proposal.values[1]);
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
