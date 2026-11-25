import { useMemo } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ForecastPoint, StormPattern } from '../types/flood';
import { formatPct } from '../utils/riskStyles';

interface RainfallForecastProps {
  forecastPoints: ForecastPoint[];
  horizonHours: number;
  onChangeHorizon: (hours: number) => void;
  stormPattern: StormPattern;
  onChangeStormPattern: (pattern: StormPattern) => void;
}

const HORIZON_OPTIONS = [6, 12, 24, 48];

const PATTERN_OPTIONS: Array<{ id: StormPattern; label: string; caption: string }> = [
  { id: 'steady', label: 'Steady Monsoon', caption: 'Sustained moderate-heavy band' },
  { id: 'intensifying', label: 'Intensifying Front', caption: 'Building convective cell' },
  { id: 'peak_decay', label: 'Peak & Decay', caption: 'Early peak followed by tapering' },
  { id: 'double_squall', label: 'Double Squall', caption: 'Two successive rainfall pulses' },
];

export function RainfallForecast({
  forecastPoints,
  horizonHours,
  onChangeHorizon,
  stormPattern,
  onChangeStormPattern,
}: RainfallForecastProps) {
  const stats = useMemo(() => {
    const historical = forecastPoints.filter((p) => p.phase === 'historical');
    const future = forecastPoints.filter((p) => p.phase === 'forecast');

    const histTotal = historical.reduce((acc, p) => acc + (p.observedRainfall ?? 0), 0);
    const forecastTotal = future.reduce((acc, p) => acc + (p.predictedRainfall ?? 0), 0);
    const peakPredicted = future.length
      ? Math.max(...future.map((p) => p.predictedRainfall ?? 0))
      : 0;
    const peakRisk = future.length ? Math.max(...future.map((p) => p.estimatedRisk)) : 0;

    return {
      histTotal,
      forecastTotal,
      peakPredicted,
      peakRisk,
    };
  }, [forecastPoints]);

  const chartData = useMemo(
    () =>
      forecastPoints.map((pt) => ({
        ...pt,
        riskPct: Number((pt.estimatedRisk * 100).toFixed(1)),
        bandRange:
          pt.forecastLower !== null && pt.forecastUpper !== null
            ? [pt.forecastLower, pt.forecastUpper]
            : null,
      })),
    [forecastPoints]
  );

  return (
    <div className="space-y-8">
      {/* Section Header & Experimental Disclaimer */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-[#3C351A]">
        <div>
          <p className="text-xs font-medium text-[#C4B5FD]">
            Experimental Estimate · Synthetic Rainfall Trajectory · Not Operational NWP / IMD Data
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#FBF7E8] tracking-tight mt-1.5 text-balance">
            Rainfall Forecasting & Accumulation Module
          </h1>
          <p className="text-sm text-[#C8BE9C] mt-2 max-w-3xl leading-relaxed">
            Compares recent 12-hour synthetic rainfall history against experimental projected
            intensity curves across adjustable horizons. Projections are illustrative demonstration
            estimates with synthetic uncertainty envelopes.
          </p>
        </div>

        {/* Forecast Horizon Selector */}
        <div className="space-y-1.5 shrink-0">
          <div className="text-xs font-medium text-[#968D6D]">Experimental Forecast Horizon</div>
          <div
            role="group"
            aria-label="Forecast horizon selector"
            className="inline-flex items-center gap-1 p-1 rounded-md bg-[#1F1B0B] border border-[#3C351A]"
          >
            {HORIZON_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onChangeHorizon(h)}
                className={`px-3.5 py-1.5 text-xs font-mono font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                  horizonHours === h
                    ? 'bg-[#FACC15] text-[#161307]'
                    : 'text-[#C8BE9C] hover:text-[#FBF7E8]'
                }`}
              >
                +{h}h
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Storm Trajectory Controls & Summary Metrics */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[#FBF7E8]">
              Experimental Storm Trajectory
            </h2>
            <span className="font-mono text-xs text-[#C4B5FD] tabular-nums">
              Horizon: {horizonHours} hours
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {PATTERN_OPTIONS.map((opt) => {
              const active = stormPattern === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeStormPattern(opt.id)}
                  className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#2B2510] border-[#C4B5FD] text-[#FBF7E8]'
                      : 'bg-[#161307] border-[#352F17] text-[#C8BE9C] hover:border-[#524824]'
                  }`}
                >
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div className="text-[11px] text-[#968D6D] mt-0.5">{opt.caption}</div>
                </button>
              );
            })}
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="horizon-slider" className="text-[#C8BE9C]">
                Fine-Tune Horizon Window
              </label>
              <span className="font-mono tabular-nums text-[#FACC15]">+{horizonHours} hours</span>
            </div>
            <input
              id="horizon-slider"
              type="range"
              min={6}
              max={48}
              step={2}
              value={horizonHours}
              onChange={(e) => onChangeHorizon(Number(e.target.value))}
              className="rg-slider rg-slider-lavender"
            />
          </div>
        </div>

        <div className="xl:col-span-7 grid grid-cols-2 gap-4">
          <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
            <p className="text-xs text-[#968D6D]">Recent 12h Total (Synthetic)</p>
            <div className="mt-2 font-mono tabular-nums text-2xl sm:text-3xl font-semibold text-[#FACC15]">
              {stats.histTotal.toFixed(0)} <span className="text-xs text-[#968D6D]">mm</span>
            </div>
            <p className="text-xs text-[#C8BE9C] mt-1.5">Simulated antecedent basin rainfall</p>
          </div>

          <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
            <p className="text-xs text-[#968D6D]">
              Next {horizonHours}h Total (Experimental)
            </p>
            <div className="mt-2 font-mono tabular-nums text-2xl sm:text-3xl font-semibold text-[#C4B5FD]">
              {stats.forecastTotal.toFixed(0)} <span className="text-xs text-[#968D6D]">mm</span>
            </div>
            <p className="text-xs text-[#C8BE9C] mt-1.5">Experimental synthetic accumulation</p>
          </div>

          <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
            <p className="text-xs text-[#968D6D]">Projected Peak Rate</p>
            <div className="mt-2 font-mono tabular-nums text-2xl sm:text-3xl font-semibold text-[#FBF7E8]">
              {stats.peakPredicted.toFixed(1)}{' '}
              <span className="text-xs text-[#968D6D]">mm/hr</span>
            </div>
            <p className="text-xs text-[#C8BE9C] mt-1.5">Experimental forecast maximum</p>
          </div>

          <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
            <p className="text-xs text-[#968D6D]">Peak Estimated Risk</p>
            <div className="mt-2 font-mono tabular-nums text-2xl sm:text-3xl font-semibold text-[#FDBA74]">
              {formatPct(stats.peakRisk)}
            </div>
            <p className="text-xs text-[#C8BE9C] mt-1.5">Model risk response along forecast</p>
          </div>
        </div>
      </section>

      {/* Primary Chart: Historical vs. Experimental Predicted Rainfall */}
      <section className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#352F17]">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#FBF7E8]">
              Historical vs. Experimental Predicted Rainfall
            </h2>
            <p className="text-xs text-[#968D6D] mt-0.5">
              Yellow bars: recent 12h synthetic history · Lavender curve & band: experimental estimate
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-[#C8BE9C]">
            <span className="text-[#FACC15]">■ Synthetic Historical</span>
            <span className="text-[#C4B5FD]">━ Experimental Forecast</span>
          </div>
        </div>

        <div className="mt-5 h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#352F17" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#968D6D"
                tick={{ fill: '#C8BE9C', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#968D6D"
                tick={{ fill: '#C8BE9C', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                unit=" mm/h"
                width={66}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#161307',
                  borderColor: '#524824',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono',
                  color: '#FBF7E8',
                }}
                formatter={(value, name) => {
                  const label = String(name ?? 'Value');
                  if (Array.isArray(value)) {
                    return [`${value[0]} – ${value[1]} mm/hr`, 'Experimental Spread'];
                  }
                  if (typeof value === 'number') {
                    return [`${value.toFixed(1)} mm/hr`, label];
                  }
                  return ['—', label];
                }}
              />
              <ReferenceLine
                x="Now"
                stroke="#FACC15"
                strokeDasharray="4 4"
                label={{
                  value: 'Now (T=0)',
                  position: 'top',
                  fill: '#FACC15',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono',
                }}
              />
              <Bar
                dataKey="observedRainfall"
                name="Synthetic Historical"
                fill="#FACC15"
                fillOpacity={0.78}
                radius={[3, 3, 0, 0]}
                maxBarSize={22}
              />
              <Area
                type="monotone"
                dataKey="bandRange"
                name="Experimental Spread"
                fill="#C4B5FD"
                fillOpacity={0.18}
                stroke="none"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="predictedRainfall"
                name="Experimental Forecast"
                stroke="#C4B5FD"
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: '#C4B5FD', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#FACC15', stroke: '#161307', strokeWidth: 2 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Secondary Chart: Cumulative Rainfall & Estimated Flood-Risk Trend */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6">
          <div className="pb-4 border-b border-[#352F17]">
            <h2 className="font-display text-base font-semibold text-[#FBF7E8]">
              Cumulative Accumulation & Estimated Risk Pressure
            </h2>
            <p className="text-xs text-[#968D6D] mt-0.5">
              Experimental tracking of cumulative synthetic rainfall (mm) against model risk (%)
            </p>
          </div>
          <div className="mt-4 h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#352F17" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#968D6D"
                  tick={{ fill: '#C8BE9C', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="mm"
                  stroke="#FACC15"
                  tick={{ fill: '#FACC15', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  width={54}
                />
                <YAxis
                  yAxisId="risk"
                  orientation="right"
                  domain={[0, 100]}
                  stroke="#C4B5FD"
                  tick={{ fill: '#C4B5FD', fontSize: 11, fontFamily: 'JetBrains Mono' }}
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
                />
                <ReferenceLine x="Now" yAxisId="mm" stroke="#524824" strokeDasharray="3 3" />
                <Area
                  yAxisId="mm"
                  type="monotone"
                  dataKey="cumulativeMm"
                  name="Cumulative mm"
                  stroke="#FACC15"
                  fill="#FACC15"
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="risk"
                  type="monotone"
                  dataKey="riskPct"
                  name="Estimated Risk %"
                  stroke="#C4B5FD"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabular Hourly Log */}
        <div className="xl:col-span-5 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6 flex flex-col">
          <div className="pb-4 border-b border-[#352F17]">
            <h2 className="font-display text-base font-semibold text-[#FBF7E8]">
              Hourly Synthetic & Experimental Schedule
            </h2>
            <p className="text-xs text-[#968D6D] mt-0.5">
              Showing key intervals across the selected +{horizonHours}h window
            </p>
          </div>

          <div className="mt-3 overflow-y-auto max-h-[255px]">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#1F1B0B] border-b border-[#3C351A] text-[11px] font-mono text-[#968D6D]">
                <tr>
                  <th className="py-2 pr-2 font-medium">Offset</th>
                  <th className="py-2 px-2 font-medium">Series</th>
                  <th className="py-2 px-2 font-medium text-right">Rate</th>
                  <th className="py-2 pl-2 font-medium text-right">Est. Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#352F17] text-xs font-mono tabular-nums">
                {forecastPoints.map((pt) => {
                  const rate =
                    pt.phase === 'historical' ? pt.observedRainfall : pt.predictedRainfall;
                  return (
                    <tr key={pt.hourOffset} className="hover:bg-[#282310] transition-colors">
                      <td className="py-2 pr-2 text-[#FBF7E8] font-medium">{pt.label}</td>
                      <td
                        className={`py-2 px-2 text-[11px] ${
                          pt.phase === 'historical' ? 'text-[#FACC15]' : 'text-[#C4B5FD]'
                        }`}
                      >
                        {pt.phase === 'historical' ? 'Synthetic Hist.' : 'Exp. Forecast'}
                      </td>
                      <td className="py-2 px-2 text-right text-[#E8DFC0]">
                        {rate !== null ? `${rate.toFixed(1)} mm/h` : '—'}
                      </td>
                      <td className="py-2 pl-2 text-right text-[#FBF7E8]">
                        {formatPct(pt.estimatedRisk)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
