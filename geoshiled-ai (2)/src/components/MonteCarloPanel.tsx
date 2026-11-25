import { Play } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FloodInputs, MonteCarloConfig, MonteCarloResult } from '../types/flood';
import { formatPct, RISK_VISUALS } from '../utils/riskStyles';

interface MonteCarloPanelProps {
  inputs: FloodInputs;
  config: MonteCarloConfig;
  onChangeConfig: (next: MonteCarloConfig) => void;
  result: MonteCarloResult;
  onRerun: () => void;
}

const ITERATION_CHOICES = [1000, 2500, 5000, 10000];

export function MonteCarloPanel({
  inputs,
  config,
  onChangeConfig,
  result,
  onRerun,
}: MonteCarloPanelProps) {
  const thresholdLabel =
    result.histogram[Math.min(19, Math.floor(config.highRiskThreshold * 20))]?.rangeLabel;
  const medianLabel =
    result.histogram[Math.min(19, Math.floor(result.median * 20))]?.rangeLabel;
  const p10Label = result.histogram[Math.min(19, Math.floor(result.p10 * 20))]?.rangeLabel;
  const p90Label = result.histogram[Math.min(19, Math.floor(result.p90 * 20))]?.rangeLabel;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#3C351A]">
        <div>
          <p className="text-xs font-medium text-[#C4B5FD]">
            Stochastic Uncertainty Analysis · Seed #{result.seed} · Computed in {result.runtimeMs}ms
            on CPU
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#FBF7E8] tracking-tight mt-1.5 text-balance">
            Monte Carlo Flood-Risk Simulation
          </h1>
          <p className="text-sm text-[#C8BE9C] mt-2 max-w-3xl leading-relaxed">
            Executes {result.iterations.toLocaleString()} perturbed hydrological scenarios around
            the current baseline (Rain {inputs.rainfall} mm/hr · Soil{' '}
            {inputs.soil_saturation.toFixed(2)} · Drainage {inputs.drainage_risk.toFixed(2)}) to
            map output dispersion under input uncertainty.
          </p>
        </div>

        <button
          type="button"
          onClick={onRerun}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-md bg-[#FACC15] text-[#161307] hover:bg-[#FDE047] transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Rerun {config.iterations.toLocaleString()} Scenarios</span>
        </button>
      </div>

      {/* 4 Key Percentile & Threshold KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
          <p className="text-xs text-[#968D6D]">10th Percentile (P10)</p>
          <div className="mt-2 font-mono tabular-nums text-3xl font-bold text-[#86EFAC]">
            {formatPct(result.p10)}
          </div>
          <p className="text-xs text-[#C8BE9C] mt-1.5">Lower-tail synthetic scenario</p>
        </div>

        <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
          <p className="text-xs text-[#968D6D]">Median Risk (P50)</p>
          <div className="mt-2 font-mono tabular-nums text-3xl font-bold text-[#FACC15]">
            {formatPct(result.median)}
          </div>
          <p className="text-xs text-[#C8BE9C] mt-1.5 font-mono tabular-nums">
            Mean: {formatPct(result.mean)} · SD: ±{formatPct(result.stdDev)}
          </p>
        </div>

        <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
          <p className="text-xs text-[#968D6D]">90th Percentile (P90)</p>
          <div className="mt-2 font-mono tabular-nums text-3xl font-bold text-[#C4B5FD]">
            {formatPct(result.p90)}
          </div>
          <p className="text-xs text-[#C8BE9C] mt-1.5">Upper-tail synthetic scenario</p>
        </div>

        <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
          <p className="text-xs text-[#968D6D]">
            Exceeding High-Risk Threshold (≥{Math.round(config.highRiskThreshold * 100)}%)
          </p>
          <div className="mt-2 font-mono tabular-nums text-3xl font-bold text-[#FCA5A5]">
            {result.exceedingThresholdPct.toFixed(1)}%
          </div>
          <p className="text-xs text-[#C8BE9C] mt-1.5 font-mono tabular-nums">
            {result.exceedingThresholdCount.toLocaleString()} / {result.iterations.toLocaleString()}{' '}
            runs
          </p>
        </div>
      </section>

      {/* Main Split: Configuration Controls + Distribution Histogram */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Uncertainty Controls (4 cols) */}
        <div className="xl:col-span-4 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6 space-y-5">
          <div className="pb-3 border-b border-[#352F17]">
            <h2 className="font-display text-base font-semibold text-[#FBF7E8]">
              Uncertainty Configuration
            </h2>
            <p className="text-xs text-[#968D6D] mt-0.5">
              Perturbation ranges applied across all simulated scenarios
            </p>
          </div>

          {/* Iteration Count Selector */}
          <div>
            <div className="text-xs font-medium text-[#E8DFC0] mb-2">Scenario Count</div>
            <div className="grid grid-cols-2 gap-1.5">
              {ITERATION_CHOICES.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => onChangeConfig({ ...config, iterations: count })}
                  className={`py-2 text-xs font-mono font-semibold rounded-md border transition-colors cursor-pointer ${
                    config.iterations === count
                      ? 'bg-[#2B2510] border-[#FACC15] text-[#FACC15]'
                      : 'bg-[#161307] border-[#352F17] text-[#C8BE9C] hover:text-[#FBF7E8]'
                  }`}
                >
                  {count.toLocaleString()} runs
                </button>
              ))}
            </div>
          </div>

          {/* Rainfall Uncertainty */}
          <div>
            <div className="flex items-baseline justify-between text-xs mb-1.5">
              <label htmlFor="mc-rain" className="text-[#E8DFC0]">
                Rainfall Uncertainty
              </label>
              <span className="font-mono tabular-nums text-[#FACC15]">
                ±{config.rainfallUncertaintyPct}%
              </span>
            </div>
            <input
              id="mc-rain"
              type="range"
              min={5}
              max={50}
              step={1}
              value={config.rainfallUncertaintyPct}
              onChange={(e) =>
                onChangeConfig({ ...config, rainfallUncertaintyPct: Number(e.target.value) })
              }
              className="rg-slider"
            />
          </div>

          {/* Terrain & Soil Uncertainty */}
          <div>
            <div className="flex items-baseline justify-between text-xs mb-1.5">
              <label htmlFor="mc-terrain" className="text-[#E8DFC0]">
                Terrain & Soil Uncertainty
              </label>
              <span className="font-mono tabular-nums text-[#C4B5FD]">
                ±{config.terrainUncertaintyPct}%
              </span>
            </div>
            <input
              id="mc-terrain"
              type="range"
              min={5}
              max={40}
              step={1}
              value={config.terrainUncertaintyPct}
              onChange={(e) =>
                onChangeConfig({ ...config, terrainUncertaintyPct: Number(e.target.value) })
              }
              className="rg-slider rg-slider-lavender"
            />
          </div>

          {/* Drainage Uncertainty */}
          <div>
            <div className="flex items-baseline justify-between text-xs mb-1.5">
              <label htmlFor="mc-drain" className="text-[#E8DFC0]">
                Drainage Uncertainty
              </label>
              <span className="font-mono tabular-nums text-[#C4B5FD]">
                ±{config.drainageUncertaintyPct}%
              </span>
            </div>
            <input
              id="mc-drain"
              type="range"
              min={5}
              max={40}
              step={1}
              value={config.drainageUncertaintyPct}
              onChange={(e) =>
                onChangeConfig({ ...config, drainageUncertaintyPct: Number(e.target.value) })
              }
              className="rg-slider rg-slider-lavender"
            />
          </div>

          {/* High-Risk Threshold */}
          <div>
            <div className="flex items-baseline justify-between text-xs mb-1.5">
              <label htmlFor="mc-thresh" className="text-[#E8DFC0]">
                Demo High-Risk Threshold
              </label>
              <span className="font-mono tabular-nums text-[#FCA5A5]">
                {Math.round(config.highRiskThreshold * 100)}%
              </span>
            </div>
            <input
              id="mc-thresh"
              type="range"
              min={0.4}
              max={0.9}
              step={0.05}
              value={config.highRiskThreshold}
              onChange={(e) =>
                onChangeConfig({ ...config, highRiskThreshold: Number(e.target.value) })
              }
              className="rg-slider"
            />
          </div>

          <p className="pt-3 border-t border-[#352F17] text-[11px] text-[#968D6D] leading-relaxed">
            Methodological note: Percentiles (P10, Median, P90) reflect uncalibrated synthetic
            parameter perturbation and are not statistically validated hydrological confidence
            intervals.
          </p>
        </div>

        {/* Distribution Histogram (8 cols) */}
        <div className="xl:col-span-8 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#352F17]">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#FBF7E8]">
                Simulated Flood-Risk Probability Distribution
              </h2>
              <p className="text-xs text-[#968D6D] mt-0.5">
                20 probability bins across {result.iterations.toLocaleString()} runs · Min{' '}
                {formatPct(result.min)} to Max {formatPct(result.max)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-[#C8BE9C]">
              <span className="text-[#86EFAC]">¦ P10</span>
              <span className="text-[#FACC15]">¦ Median</span>
              <span className="text-[#C4B5FD]">¦ P90</span>
              <span className="text-[#FCA5A5]">¦ Threshold</span>
            </div>
          </div>

          <div className="mt-5 h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={result.histogram}
                margin={{ top: 18, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid stroke="#352F17" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="rangeLabel"
                  stroke="#968D6D"
                  tick={{ fill: '#C8BE9C', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  interval={1}
                  angle={-25}
                  textAnchor="end"
                  height={48}
                />
                <YAxis
                  stroke="#968D6D"
                  tick={{ fill: '#C8BE9C', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  unit="%"
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161307',
                    borderColor: '#524824',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontFamily: 'JetBrains Mono',
                  }}
                  formatter={(value, _name, item) => {
                    const binPayload = item?.payload as
                      | { count?: number; category?: string }
                      | undefined;
                    return [
                      `${value ?? 0}% (${binPayload?.count ?? 0} scenarios · ${binPayload?.category ?? ''})`,
                      'Share',
                    ];
                  }}
                />
                {p10Label && (
                  <ReferenceLine x={p10Label} stroke="#86EFAC" strokeDasharray="3 3" strokeWidth={1.5} />
                )}
                {medianLabel && (
                  <ReferenceLine
                    x={medianLabel}
                    stroke="#FACC15"
                    strokeWidth={2}
                    label={{
                      value: 'Median',
                      position: 'top',
                      fill: '#FACC15',
                      fontSize: 10,
                      fontFamily: 'JetBrains Mono',
                    }}
                  />
                )}
                {p90Label && (
                  <ReferenceLine x={p90Label} stroke="#C4B5FD" strokeDasharray="3 3" strokeWidth={1.5} />
                )}
                {thresholdLabel && (
                  <ReferenceLine
                    x={thresholdLabel}
                    stroke="#FCA5A5"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                )}
                <Bar dataKey="percent" name="Share of Runs" radius={[3, 3, 0, 0]}>
                  {result.histogram.map((bin) => (
                    <Cell key={bin.rangeLabel} fill={RISK_VISUALS[bin.category].chartHex} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Secondary Visualization: Exceedance Probability Curve */}
      <section className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6">
        <div className="pb-4 border-b border-[#352F17]">
          <h2 className="font-display text-base font-semibold text-[#FBF7E8]">
            Threshold Exceedance Curve
          </h2>
          <p className="text-xs text-[#968D6D] mt-0.5">
            Percentage of simulated scenarios whose estimated flood risk meets or exceeds each
            probability threshold
          </p>
        </div>

        <div className="mt-4 h-[230px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={result.exceedanceCurve}
              margin={{ top: 10, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid stroke="#352F17" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="thresholdPct"
                stroke="#968D6D"
                tick={{ fill: '#C8BE9C', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                unit="%"
              />
              <YAxis
                stroke="#968D6D"
                tick={{ fill: '#C8BE9C', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                domain={[0, 100]}
                unit="%"
                width={48}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#161307',
                  borderColor: '#524824',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono',
                }}
                labelFormatter={(label) => `Risk ≥ ${label}%`}
                formatter={(val: unknown) => [`${val}% of scenarios`, 'Exceedance Rate']}
              />
              <ReferenceLine
                x={Math.round(config.highRiskThreshold * 100)}
                stroke="#FACC15"
                strokeDasharray="4 4"
                label={{
                  value: `Threshold (${Math.round(config.highRiskThreshold * 100)}%)`,
                  position: 'insideTopRight',
                  fill: '#FACC15',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono',
                }}
              />
              <Area
                type="monotone"
                dataKey="exceedancePct"
                stroke="#C4B5FD"
                fill="#C4B5FD"
                fillOpacity={0.2}
                strokeWidth={2.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
