"use client";

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
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead><tr className="border-b border-slate-600 text-slate-300"><th className="py-2 pr-3">Setting</th><th className="py-2 pr-3">Current value</th><th className="py-2">Proposed value</th></tr></thead>
          <tbody>
            {changes.map(change => (
              <tr key={change.label} className="border-b border-slate-800 align-top">
                <th scope="row" className="py-2 pr-3 font-medium text-slate-100">{change.label}</th>
                <td className="break-all py-2 pr-3 font-mono text-slate-300">{change.current}</td>
                <td className="break-all py-2 font-mono text-amber-100">{change.proposed}</td>
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
