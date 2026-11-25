import { Activity } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { clamp, evaluateFloodRisk, classifyRisk } from '../engine/floodModel';
import { DistrictHourlyPoint, FloodInputs, TamilNaduDistrictData } from '../types/flood';
import { RISK_VISUALS } from '../utils/riskStyles';

export interface LiveTrendsChartProps {
  mode: 'dashboard' | 'simulator';
  districts: TamilNaduDistrictData[];
  liveBaselineDistricts: TamilNaduDistrictData[];
  selectedDistrict: TamilNaduDistrictData;
  simulatorInputs: FloodInputs;
  isSimulatedActive: boolean;
  weatherSourceLabel: string;
}

interface TrendDatum {
  hourOffset: number;
  label: string;
  clockTime: string;
  phase: 'observed' | 'forecast';
  liveRainfall: number;
  liveRiskPct: number;
  activeRainfall: number;
  activeRiskPct: number;
  deltaRiskPct: number;
}

type WindowMode = 'next-24h' | 'rolling-24h';

function formatClockLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function select24HourSlice(series: DistrictHourlyPoint[], windowMode: WindowMode): DistrictHourlyPoint[] {
  if (series.length <= 24) return series;

  const nowIdx = series.findIndex((p) => p.hourOffset === 0);
  const safeNow = nowIdx >= 0 ? nowIdx : Math.min(12, series.length - 1);

  if (windowMode === 'next-24h') {
    const start = Math.min(safeNow, Math.max(0, series.length - 24));
    return series.slice(start, start + 24);
  }

  // Rolling 24h centered on recent past + upcoming horizon (-6h to +17h)
  const start = clamp(safeNow - 6, 0, Math.max(0, series.length - 24));
  return series.slice(start, start + 24);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: TrendDatum }>;
  showComparison: boolean;
}

function LiveTrendsTooltip({ active, payload, showComparison }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;

  const activeCategory = classifyRisk(datum.activeRiskPct / 100);
  const activeVisual = RISK_VISUALS[activeCategory];

  return (
    <div className="rounded-md border border-[#524824] bg-[#161307] px-3.5 py-2.5 text-xs font-mono shadow-xl min-w-[215px]">
      <div className="flex items-center justify-between gap-3 pb-1.5 border-b border-[#352F17]">
        <span className="font-semibold text-[#FACC15]">
          {datum.label} {datum.clockTime ? `· ${datum.clockTime}` : ''}
        </span>
        <span className="text-[10px] text-[#968D6D] uppercase">
          {datum.phase === 'observed' ? 'Observed' : 'Projected'}
        </span>
      </div>

      <div className="mt-2 space-y-1.5 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C8BE9C]">
            {showComparison ? 'Simulated Rain' : 'Hourly Rain'}
          </span>
          <span className="font-semibold text-[#FACC15]">
            {datum.activeRainfall.toFixed(1)} mm/hr
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C8BE9C]">
            {showComparison ? 'Simulated Risk' : 'Flood Risk'}
          </span>
          <span className={`font-semibold ${activeVisual.textClass}`}>
            {activeVisual.symbol} {datum.activeRiskPct.toFixed(1)}%
          </span>
        </div>

        {showComparison && (
          <>
            <div className="pt-1.5 mt-1 border-t border-[#352F17] flex items-center justify-between gap-4 text-[11px]">
              <span className="text-[#968D6D]">Live Baseline Rain</span>
              <span className="text-[#C8BE9C]">{datum.liveRainfall.toFixed(1)} mm/hr</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-[11px]">
              <span className="text-[#968D6D]">Live Baseline Risk</span>
              <span className="text-[#C8BE9C]">{datum.liveRiskPct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-[11px]">
              <span className="text-[#968D6D]">Slider Impact</span>
              <span
                className={
                  datum.deltaRiskPct > 0.4
                    ? 'text-[#FCA5A5] font-semibold'
                    : datum.deltaRiskPct < -0.4
                      ? 'text-[#86EFAC] font-semibold'
                      : 'text-[#C8BE9C]'
                }
              >
                {datum.deltaRiskPct > 0 ? `+${datum.deltaRiskPct.toFixed(1)}%` : `${datum.deltaRiskPct.toFixed(1)}%`}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function LiveTrendsChart({
  mode,
  districts,
  liveBaselineDistricts,
  selectedDistrict,
  simulatorInputs,
  isSimulatedActive,
  weatherSourceLabel,
}: LiveTrendsChartProps) {
  const [scope, setScope] = useState<'district' | 'statewide'>('district');
  const [windowMode, setWindowMode] = useState<WindowMode>('next-24h');

  const showComparison = mode === 'simulator' || isSimulatedActive;

  const liveSelectedDistrict = useMemo(
    () =>
      liveBaselineDistricts.find((d) => d.id === selectedDistrict.id) ??
      liveBaselineDistricts[0] ??
      selectedDistrict,
    [liveBaselineDistricts, selectedDistrict]
  );

  const trendData = useMemo<TrendDatum[]>(() => {
    // 1. Statewide 16-district 24-hour mean profile (Dashboard mode when 16-District Avg is selected)
    if (mode === 'dashboard' && scope === 'statewide') {
      const refSlice = select24HourSlice(liveSelectedDistrict.hourlySeries, windowMode);
      return refSlice.map((refPt) => {
        let liveRainSum = 0;
        let liveRiskSum = 0;
        let activeRainSum = 0;
        let activeRiskSum = 0;
        let count = 0;

        for (let i = 0; i < liveBaselineDistricts.length; i++) {
          const liveDist = liveBaselineDistricts[i];
          const activeDist = districts[i] ?? liveDist;
          const pt = liveDist.hourlySeries.find((h) => h.hourOffset === refPt.hourOffset);
          if (!pt) continue;

          liveRainSum += pt.rainfallMm;
          liveRiskSum += pt.estimatedRisk;

          if (isSimulatedActive) {
            // Reflect active district's simulated inputs modulated by hourly storm profile
            const wave = 1 + Math.sin((refPt.hourOffset + 4) * 0.34) * 0.22;
            const liveRatio =
              liveDist.inputs.rainfall > 1.5
                ? clamp(pt.rainfallMm / liveDist.inputs.rainfall, 0.35, 1.85)
                : refPt.hourOffset === 0
                  ? 1
                  : clamp(wave, 0.45, 1.35);

            const simRain = Number(clamp(activeDist.inputs.rainfall * liveRatio, 0, 180).toFixed(1));
            const simSoil = clamp(
              activeDist.inputs.soil_saturation +
                (pt.soilSaturation - liveDist.inputs.soil_saturation) * 0.5,
              0.05,
              0.99
            );
            const simEval = evaluateFloodRisk({
              ...activeDist.inputs,
              rainfall: simRain,
              soil_saturation: simSoil,
            });
            activeRainSum += simRain;
            activeRiskSum += simEval.probability;
          } else {
            activeRainSum += pt.rainfallMm;
            activeRiskSum += pt.estimatedRisk;
          }
          count++;
        }

        const n = Math.max(1, count);
        const liveRain = Number((liveRainSum / n).toFixed(1));
        const liveRiskPct = Number(((liveRiskSum / n) * 100).toFixed(1));
        const activeRain = Number((activeRainSum / n).toFixed(1));
        const activeRiskPct = Number(((activeRiskSum / n) * 100).toFixed(1));

        return {
          hourOffset: refPt.hourOffset,
          label: refPt.label,
          clockTime: formatClockLabel(refPt.timeIso),
          phase: refPt.phase,
          liveRainfall: liveRain,
          liveRiskPct,
          activeRainfall: activeRain,
          activeRiskPct,
          deltaRiskPct: Number((activeRiskPct - liveRiskPct).toFixed(1)),
        };
      });
    }

    // 2. Selected District 24-hour Live Trends (reacts immediately to every simulator slider)
    const slice = select24HourSlice(liveSelectedDistrict.hourlySeries, windowMode);
    const baselineNowRain = liveSelectedDistrict.inputs.rainfall;

    // In Simulator mode, always reflect simulatorInputs live.
    // In Dashboard mode, reflect selectedDistrict.inputs (which updates when sliders or pump tests change).
    const targetInputs = mode === 'simulator' ? simulatorInputs : selectedDistrict.inputs;

    return slice.map((pt) => {
      const liveRiskPct = Number((pt.estimatedRisk * 100).toFixed(1));

      if (!showComparison) {
        return {
          hourOffset: pt.hourOffset,
          label: pt.label,
          clockTime: formatClockLabel(pt.timeIso),
          phase: pt.phase,
          liveRainfall: pt.rainfallMm,
          liveRiskPct,
          activeRainfall: pt.rainfallMm,
          activeRiskPct: liveRiskPct,
          deltaRiskPct: 0,
        };
      }

      // Anchor hourOffset === 0 exactly to targetInputs so slider changes match 1:1 at "Now",
      // while shaping the surrounding 24h trajectory smoothly from Open-Meteo's temporal curve
      let simRain: number;
      if (pt.hourOffset === 0) {
        simRain = Number(clamp(targetInputs.rainfall, 0, 180).toFixed(1));
      } else if (baselineNowRain > 2) {
        const temporalFactor = clamp(pt.rainfallMm / baselineNowRain, 0.3, 1.9);
        simRain = Number(clamp(targetInputs.rainfall * temporalFactor, 0, 180).toFixed(1));
      } else {
        // Synthetic storm envelope when live rain is ~0 mm/hr so a user dragging rainfall up sees a realistic 24h wave
        const stormProfile =
          0.76 +
          Math.cos(pt.hourOffset * 0.24) * 0.24 +
          Math.sin((pt.hourOffset + 5) * 0.41) * 0.1;
        simRain = Number(
          clamp(targetInputs.rainfall * stormProfile + pt.rainfallMm * 0.5, 0, 180).toFixed(1)
        );
      }

      const soilDelta = (pt.soilSaturation - liveSelectedDistrict.inputs.soil_saturation) * 0.55;
      const rollingSoil = clamp(
        targetInputs.soil_saturation + soilDelta + (simRain - targetInputs.rainfall) * 0.0008,
        0.05,
        0.99
      );

      const simEval = evaluateFloodRisk({
        ...targetInputs,
        rainfall: simRain,
        soil_saturation: rollingSoil,
      });

      const activeRiskPct = Number((simEval.probability * 100).toFixed(1));

      return {
        hourOffset: pt.hourOffset,
        label: pt.label,
        clockTime: formatClockLabel(pt.timeIso),
        phase: pt.phase,
        liveRainfall: pt.rainfallMm,
        liveRiskPct,
        activeRainfall: simRain,
        activeRiskPct,
        deltaRiskPct: Number((activeRiskPct - liveRiskPct).toFixed(1)),
      };
    });
  }, [
    mode,
    scope,
    windowMode,
    districts,
    liveBaselineDistricts,
    liveSelectedDistrict,
    selectedDistrict,
    simulatorInputs,
    isSimulatedActive,
    showComparison,
  ]);

  const summary = useMemo(() => {
    const peakRain = Math.max(...trendData.map((d) => d.activeRainfall), 0);
    const peakRisk = Math.max(...trendData.map((d) => d.activeRiskPct), 0);
    const highRiskHours = trendData.filter((d) => d.activeRiskPct >= 65).length;
    const nowPt = trendData.find((d) => d.hourOffset === 0) ?? trendData[0];
    const nowDelta = nowPt ? nowPt.deltaRiskPct : 0;
    const peakCategory = classifyRisk(peakRisk / 100);
    return { peakRain, peakRisk, highRiskHours, nowDelta, peakCategory };
  }, [trendData]);

  const peakVisual = RISK_VISUALS[summary.peakCategory];
  const hasNowTick = trendData.some((d) => d.label === 'Now');

  return (
    <section
      aria-labelledby={`live-trends-heading-${mode}`}
      className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6"
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#352F17]">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#C4B5FD]">
            <Activity className="w-3.5 h-3.5 text-[#FACC15]" />
            <span>
              Live Trends · 24-Hour Window ·{' '}
              {showComparison ? 'Real-Time Slider Feedback Active' : 'Live Telemetry Stream'}
            </span>
          </div>
          <h2
            id={`live-trends-heading-${mode}`}
            className="font-display text-base sm:text-lg font-semibold text-[#FBF7E8] mt-1"
          >
            {mode === 'dashboard' && scope === 'statewide'
              ? 'Live Trends — Tamil Nadu 16-District 24h Average'
              : `Live Trends — ${selectedDistrict.name} (${selectedDistrict.code}) 24h Outlook`}
          </h2>
          <p className="text-xs text-[#968D6D] mt-0.5">
            {weatherSourceLabel} · Hourly rainfall intensity (mm/hr) and prototype flood-risk
            probability (%)
          </p>
        </div>

        {/* Controls: Scope (Dashboard only) + 24h Window Selector */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {mode === 'dashboard' && (
            <div
              role="group"
              aria-label="Live trends geographic scope"
              className="inline-flex items-center gap-1 p-1 rounded-md bg-[#161307] border border-[#352F17]"
            >
              <button
                type="button"
                onClick={() => setScope('district')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  scope === 'district'
                    ? 'bg-[#2B2510] text-[#FACC15]'
                    : 'text-[#968D6D] hover:text-[#FBF7E8]'
                }`}
              >
                {selectedDistrict.name}
              </button>
              <button
                type="button"
                onClick={() => setScope('statewide')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  scope === 'statewide'
                    ? 'bg-[#2B2510] text-[#C4B5FD]'
                    : 'text-[#968D6D] hover:text-[#FBF7E8]'
                }`}
              >
                16-District Avg
              </button>
            </div>
          )}

          <div
            role="group"
            aria-label="24-hour window alignment"
            className="inline-flex items-center gap-1 p-1 rounded-md bg-[#161307] border border-[#352F17]"
          >
            <button
              type="button"
              onClick={() => setWindowMode('next-24h')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                windowMode === 'next-24h'
                  ? 'bg-[#2B2510] text-[#FACC15]'
                  : 'text-[#968D6D] hover:text-[#FBF7E8]'
              }`}
            >
              Next 24h
            </button>
            <button
              type="button"
              onClick={() => setWindowMode('rolling-24h')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                windowMode === 'rolling-24h'
                  ? 'bg-[#2B2510] text-[#C4B5FD]'
                  : 'text-[#968D6D] hover:text-[#FBF7E8]'
              }`}
            >
              -6h to +17h
            </button>
          </div>
        </div>
      </div>

      {/* Live 24h KPI Strip */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pb-4 border-b border-[#352F17] text-xs">
        <div>
          <div className="text-[11px] text-[#968D6D]">24h Peak Rainfall</div>
          <div className="font-mono tabular-nums text-base font-semibold text-[#FACC15] mt-0.5">
            {summary.peakRain.toFixed(1)} mm/hr
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[#968D6D]">24h Peak Risk</div>
          <div className={`font-mono tabular-nums text-base font-semibold mt-0.5 ${peakVisual.textClass}`}>
            {peakVisual.symbol} {summary.peakRisk.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[#968D6D]">High-Risk Hours (≥65%)</div>
          <div className="font-mono tabular-nums text-base font-semibold text-[#FBF7E8] mt-0.5">
            {summary.highRiskHours} / {trendData.length} hrs
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[#968D6D]">Now vs. Live Baseline</div>
          <div
            className={`font-mono tabular-nums text-base font-semibold mt-0.5 ${
              !showComparison
                ? 'text-[#C8BE9C]'
                : summary.nowDelta > 0.4
                  ? 'text-[#FCA5A5]'
                  : summary.nowDelta < -0.4
                    ? 'text-[#86EFAC]'
                    : 'text-[#C8BE9C]'
            }`}
          >
            {!showComparison
              ? 'Live Synced'
              : `${summary.nowDelta > 0 ? '+' : ''}${summary.nowDelta.toFixed(1)}%`}
          </div>
        </div>
      </div>

      {/* Inline Chart Legend */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#C8BE9C]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="text-[#FACC15]">
            ■ {showComparison ? 'Simulated Rainfall (mm/hr)' : 'Hourly Rainfall (mm/hr)'}
          </span>
          <span className="text-[#C4B5FD]">
            ━ {showComparison ? 'Simulated Flood Risk (%)' : 'Estimated Flood Risk (%)'}
          </span>
          {showComparison && (
            <span className="text-[#968D6D]">╌ Live Baseline Risk (%)</span>
          )}
          <span className="text-[#FCA5A5]/80">┄ 65% High-Risk Threshold</span>
        </div>
        <span className="text-[#857D5E]">Updates live as sliders move</span>
      </div>

      {/* Recharts 24-Hour Dual-Axis Composed Chart */}
      <div className="mt-3 h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={trendData} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id={`riskAreaGrad-${mode}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#C4B5FD" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#C4B5FD" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#352F17" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#968D6D"
              tick={{ fill: '#C8BE9C', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              interval={2}
            />
            <YAxis
              yAxisId="rain"
              stroke="#FACC15"
              tick={{ fill: '#FACC15', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              unit=" mm"
              width={56}
              domain={[0, (dataMax: number) => Math.max(20, Math.ceil(dataMax * 1.15))]}
            />
            <YAxis
              yAxisId="risk"
              orientation="right"
              domain={[0, 100]}
              stroke="#C4B5FD"
              tick={{ fill: '#C4B5FD', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              unit="%"
              width={44}
            />

            <Tooltip
              cursor={{ fill: 'rgba(250, 204, 21, 0.06)' }}
              content={<LiveTrendsTooltip showComparison={showComparison} />}
            />

            {/* 65% High-Risk Threshold Reference */}
            <ReferenceLine
              y={65}
              yAxisId="risk"
              stroke="#FCA5A5"
              strokeOpacity={0.45}
              strokeDasharray="4 4"
            />

            {/* Current Hour Marker */}
            {hasNowTick && (
              <ReferenceLine
                x="Now"
                yAxisId="rain"
                stroke="#FACC15"
                strokeDasharray="3 3"
                label={{
                  value: 'Now',
                  position: 'top',
                  fill: '#FACC15',
                  fontSize: 10,
                  fontFamily: 'JetBrains Mono',
                }}
              />
            )}

            {/* Hourly Rainfall Intensity Bars (Left Axis) */}
            <Bar
              yAxisId="rain"
              dataKey="activeRainfall"
              name={showComparison ? 'Simulated Rainfall' : 'Hourly Rainfall'}
              fill="#FACC15"
              fillOpacity={0.62}
              radius={[2, 2, 0, 0]}
              maxBarSize={20}
              isAnimationActive={false}
            />

            {/* Optional Live Baseline Risk Curve when Simulator Override is Active */}
            {showComparison && (
              <Line
                yAxisId="risk"
                type="monotone"
                dataKey="liveRiskPct"
                name="Live Baseline Risk"
                stroke="#968D6D"
                strokeWidth={1.75}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            )}

            {/* Active / Simulated Flood-Risk Probability Area + Line (Right Axis) */}
            <Area
              yAxisId="risk"
              type="monotone"
              dataKey="activeRiskPct"
              name={showComparison ? 'Simulated Flood Risk' : 'Estimated Flood Risk'}
              stroke="#C4B5FD"
              strokeWidth={2.5}
              fill={`url(#riskAreaGrad-${mode})`}
              dot={false}
              activeDot={{ r: 4.5, fill: '#FACC15', stroke: '#161307', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
