import samples from './chart-samples.json';
import { validateChartSample } from './validate-chart-sample.mjs';

export function SampleChart() {
  const sample = samples['compound-growth'];

  return (
    <figure className="mb-10 rounded-2xl border border-slate-700 p-6">
      <figcaption className="mb-4 font-bold text-white">
        Example growth at a constant 8% APY
      </figcaption>
      {validateChartSample(sample) ? (
        <p className="text-sm text-slate-300">The example chart is currently unavailable.</p>
      ) : (
        <table aria-label="Example USDC balances" className="w-full text-left text-sm text-slate-300">
          <thead>
            <tr>
              <th scope="col" className="pb-2">Period</th>
              <th scope="col" className="pb-2">Balance (USDC)</th>
            </tr>
          </thead>
          <tbody>
            {sample.map(({ label, balance }) => (
              <tr key={label}>
                <th scope="row" className="py-1 pr-4 font-normal">{label}</th>
                <td className="w-1/2 py-1 tabular-nums">
                  {balance.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  <span
                    aria-hidden="true"
                    className="block h-2 rounded bg-emerald-500"
                    style={{ width: `${balance / Math.max(...sample.map((point) => point.balance)) * 100}%` }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
