"use client";

import { useId, useState } from "react";
import styles from "./ActionReview.module.css";

const DENSITY_OPTIONS = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
] as const;

type TableDensity = (typeof DENSITY_OPTIONS)[number]["value"];

export interface ActionReviewChange {
  label: string;
  current: string;
  proposed: string;
}

interface ActionReviewProps {
  title: string;
  network: string;
  signer: string;
  requiredAuthority: string;
  timelock: string;
  changes: ActionReviewChange[];
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A focused, read-only review of the exact values the caller will submit. */
export function ActionReview({
  title,
  network,
  signer,
  requiredAuthority,
  timelock,
  changes,
  loading = false,
  onConfirm,
  onCancel,
}: ActionReviewProps) {
  const densityGroup = useId();
  const [density, setDensity] = useState<TableDensity>("comfortable");

  return (
    <section
      role="group"
      aria-label={`Review ${title}`}
      className="mt-4 rounded-lg border-2 border-amber-500 bg-amber-950/30 p-4"
    >
      <h4 className="text-lg font-semibold text-amber-100">Review before signing: {title}</h4>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-400">Network</dt><dd className="font-medium text-slate-100">{network}</dd></div>
        <div><dt className="text-slate-400">Required signer role</dt><dd className="font-medium text-slate-100">{requiredAuthority}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-400">Signing account</dt><dd className="break-all font-mono text-slate-100">{signer}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-400">Timelock</dt><dd className="font-medium text-slate-100">{timelock}</dd></div>
      </dl>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-slate-100">Table density</legend>
        <div className="flex flex-wrap gap-x-2">
          {DENSITY_OPTIONS.map(({ value, label }) => (
            <label key={value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm text-slate-100">
              <input
                type="radio"
                name={densityGroup}
                value={value}
                checked={density === value}
                onChange={() => setDensity(value)}
                className="accent-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="overflow-x-auto">
        <table data-density={density} className={`${styles.table} w-full table-fixed border-collapse text-left text-sm`}>
          <caption className="sr-only">Settings under review</caption>
          <thead>
            <tr className="border-b border-slate-600 align-top text-slate-300">
              <th scope="col" className="pr-3">Setting</th>
              <th scope="col" className="pr-3">Current value</th>
              <th scope="col">Proposed value</th>
            </tr>
          </thead>
          <tbody>
            {changes.map(change => (
              <tr key={change.label} className="border-b border-slate-800 align-top">
                <th scope="row" className="pr-3 font-medium text-slate-100">{change.label}</th>
                <td className="pr-3 font-mono text-slate-300">{change.current}</td>
                <td className="font-mono text-amber-100">{change.proposed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onConfirm} disabled={loading} className="button-danger px-4 py-2 disabled:opacity-50">
          {loading ? "Submitting reviewed change..." : "Confirm reviewed change"}
        </button>
        <button type="button" onClick={onCancel} disabled={loading} className="button-secondary px-4 py-2 disabled:opacity-50">
          Cancel
        </button>
      </div>
    </section>
  );
}
