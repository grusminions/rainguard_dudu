import { Check, Code2, Copy, RefreshCw, RotateCcw, Server } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
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
import {
  computeScenarioEnvelope,
  computeSensitivityAnalysis,
} from '../engine/floodModel';
import { FASTAPI_REFERENCE_CODE, formatPredictPayload } from '../services/mlApi';
import {
  BackendConfig,
  DataSourceMode,
  FloodInputs,
  LiveFeedStatus,
  MonteCarloResult,
  PredictionResult,
  TamilNaduDistrictData,
} from '../types/flood';
import { formatPct, RISK_VISUALS } from '../utils/riskStyles';
import { LiveTrendsChart } from './LiveTrendsChart';
import { TamilNadu3DMap } from './TamilNadu3DMap';

interface FloodSimulatorProps {
  inputs: FloodInputs;
  onChangeInputs: (next: FloodInputs) => void;
  prediction: PredictionResult;
  isPredicting: boolean;
  backendConfig: BackendConfig;
  onChangeBackendConfig: (next: BackendConfig) => void;
  onTriggerPredict: () => void;
  monteCarlo: MonteCarloResult;
  onRerunMonteCarlo: () => void;
  loadedSectorLabel: string | null;
  districts: TamilNaduDistrictData[];
  liveBaselineDistricts: TamilNaduDistrictData[];
  selectedDistrictId: string;
  onSelectDistrict: (id: string) => void;
  onSelectDistrictBaseline: (district: TamilNaduDistrictData) => void;
  dataSourceMode: DataSourceMode;
  hasSimulatorOverride: boolean;
  simulationScope: 'statewide' | 'selected';
  onChangeSimulationScope: (scope: 'statewide' | 'selected') => void;
  onRevertToLiveWeather: () => void;
  liveFeedStatus: LiveFeedStatus;
}

export function FloodSimulator({
  inputs,
  onChangeInputs,
  prediction,
  isPredicting,
  backendConfig,
  onChangeBackendConfig,
  onTriggerPredict,
  monteCarlo,
  onRerunMonteCarlo,
  loadedSectorLabel,
  districts,
  liveBaselineDistricts,
  selectedDistrictId,
  onSelectDistrict,
  onSelectDistrictBaseline,
  dataSourceMode,
  hasSimulatorOverride,
  simulationScope,
  onChangeSimulationScope,
  onRevertToLiveWeather,
  liveFeedStatus,
}: FloodSimulatorProps) {
  const [showFastApiCode, setShowFastApiCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const selectedDistrict = useMemo(
    () => districts.find((d) => d.id === selectedDistrictId) ?? districts[0],
    [districts, selectedDistrictId]
  );

  const selectedLiveDistrict = useMemo(
    () =>
      liveBaselineDistricts.find((d) => d.id === selectedDistrictId) ??
      liveBaselineDistricts[0] ??
      selectedDistrict,
    [liveBaselineDistricts, selectedDistrictId, selectedDistrict]
  );

  const isSimulatedOn3D = dataSourceMode === 'simulated' || hasSimulatorOverride;

  const envelope = useMemo(() => computeScenarioEnvelope(inputs), [inputs]);
  const sensitivity = useMemo(() => computeSensitivityAnalysis(inputs), [inputs]);
  const requestPayload = useMemo(() => formatPredictPayload(inputs), [inputs]);

  const visual = RISK_VISUALS[prediction.risk_category];
  const liveDistVisual = RISK_VISUALS[selectedLiveDistrict.riskCategory];
  const activeDistVisual = RISK_VISUALS[selectedDistrict.riskCategory];

  const riskDeltaPct = Math.round(
    (selectedDistrict.riskProbability - selectedLiveDistrict.riskProbability) * 100
  );

  const updateInput = <K extends keyof FloodInputs>(key: K, value: FloodInputs[K]) => {
    onChangeInputs({ ...inputs, [key]: value });
  };

  const handleCopyFastApi = async () => {
    try {
      await navigator.clipboard.writeText(FASTAPI_REFERENCE_CODE);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const weatherSourceCaption =
    liveFeedStatus.source === 'open-meteo-live'
      ? 'Live Open-Meteo Baseline vs. Interactive Simulator Override'
      : 'Synthetic Fallback Baseline vs. Interactive Simulator Override';

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-[#3C351A]">
        <div>
          <p className="text-xs font-medium text-[#C4B5FD]">
            Interactive What-If Engine ·{' '}
            {loadedSectorLabel
              ? `Loaded from ${loadedSectorLabel}`
              : `Tamil Nadu Target: ${selectedDistrict.name}`}{' '}
            ·{' '}
            {isSimulatedOn3D
              ? `Live on 3D Map (${simulationScope === 'statewide' ? 'All 16 Districts' : `${selectedDistrict.name} Only`})`
              : 'Synced to Live Open-Meteo'}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#FBF7E8] tracking-tight mt-1.5 text-balance">
            Flood-Risk Simulator & Live 3D Map Response
          </h1>
          <p className="text-sm text-[#C8BE9C] mt-2 max-w-3xl leading-relaxed">
            Adjust rainfall, slope, soil saturation, drainage risk, or elevation below to watch the
            3D Tamil Nadu flood towers, inundation rings, and rainfall particles respond in real
            time alongside the 36-hour Open-Meteo baseline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <select
            aria-label="Load Tamil Nadu district live baseline"
            value={selectedLiveDistrict.id}
            onChange={(e) => {
              const found = liveBaselineDistricts.find((d) => d.id === e.target.value);
              if (found) onSelectDistrictBaseline(found);
            }}
            className="px-3 py-2 text-xs font-medium bg-[#1F1B0B] border border-[#3C351A] rounded-md text-[#FBF7E8] focus:border-[#FACC15] focus:outline-none cursor-pointer"
          >
            {liveBaselineDistricts.map((dist) => (
              <option key={dist.id} value={dist.id}>
                Load Live Baseline: {dist.name} ({dist.inputs.rainfall.toFixed(1)} mm/h)
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onTriggerPredict}
            disabled={isPredicting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md border border-[#C4B5FD]/45 bg-[#C4B5FD]/10 text-[#C4B5FD] hover:bg-[#C4B5FD]/20 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPredicting ? 'animate-spin' : ''}`} />
            <span>
              {backendConfig.mode === 'fastapi' ? 'Query FastAPI /predict' : 'Recalculate Model'}
            </span>
          </button>
        </div>
      </div>

      {/* Top Split: Parameter Controls (5 cols) + Live Synchronized 3D Tamil Nadu Map (7 cols) */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: 5 Input Controls (5 cols) */}
        <div className="xl:col-span-5 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6 space-y-5">
          <div className="pb-3 border-b border-[#352F17] flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[#FBF7E8]">
              Input Parameters
            </h2>
            <span className="text-xs font-mono text-[#968D6D]">5 model features</span>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="sim-rain" className="text-xs font-medium text-[#E8DFC0]">
                  Rainfall Intensity (mm/hour)
                </label>
                <input
                  type="number"
                  min={0}
                  max={180}
                  step={1}
                  value={inputs.rainfall}
                  onChange={(e) =>
                    updateInput('rainfall', Math.min(180, Math.max(0, Number(e.target.value) || 0)))
                  }
                  aria-label="Rainfall intensity value"
                  className="w-20 px-2 py-1 text-right font-mono tabular-nums text-xs bg-[#161307] border border-[#3C351A] rounded text-[#FACC15] focus:border-[#FACC15] focus:outline-none"
                />
              </div>
              <input
                id="sim-rain"
                type="range"
                min={0}
                max={180}
                step={1}
                value={inputs.rainfall}
                onChange={(e) => updateInput('rainfall', Number(e.target.value))}
                className="rg-slider"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="sim-slope" className="text-xs font-medium text-[#E8DFC0]">
                  Terrain Slope (degrees)
                </label>
                <input
                  type="number"
                  min={0}
                  max={45}
                  step={1}
                  value={inputs.slope}
                  onChange={(e) =>
                    updateInput('slope', Math.min(45, Math.max(0, Number(e.target.value) || 0)))
                  }
                  aria-label="Terrain slope value"
                  className="w-20 px-2 py-1 text-right font-mono tabular-nums text-xs bg-[#161307] border border-[#3C351A] rounded text-[#FACC15] focus:border-[#FACC15] focus:outline-none"
                />
              </div>
              <input
                id="sim-slope"
                type="range"
                min={0}
                max={45}
                step={1}
                value={inputs.slope}
                onChange={(e) => updateInput('slope', Number(e.target.value))}
                className="rg-slider"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="sim-soil" className="text-xs font-medium text-[#E8DFC0]">
                  Soil Saturation (0–1)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={inputs.soil_saturation}
                  onChange={(e) =>
                    updateInput(
                      'soil_saturation',
                      Math.min(1, Math.max(0, Number(e.target.value) || 0))
                    )
                  }
                  aria-label="Soil saturation value"
                  className="w-20 px-2 py-1 text-right font-mono tabular-nums text-xs bg-[#161307] border border-[#3C351A] rounded text-[#C4B5FD] focus:border-[#C4B5FD] focus:outline-none"
                />
              </div>
              <input
                id="sim-soil"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={inputs.soil_saturation}
                onChange={(e) => updateInput('soil_saturation', Number(e.target.value))}
                className="rg-slider rg-slider-lavender"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="sim-drain" className="text-xs font-medium text-[#E8DFC0]">
                  Drainage Risk (0–1)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={inputs.drainage_risk}
                  onChange={(e) =>
                    updateInput(
                      'drainage_risk',
                      Math.min(1, Math.max(0, Number(e.target.value) || 0))
                    )
                  }
                  aria-label="Drainage risk value"
                  className="w-20 px-2 py-1 text-right font-mono tabular-nums text-xs bg-[#161307] border border-[#3C351A] rounded text-[#C4B5FD] focus:border-[#C4B5FD] focus:outline-none"
                />
              </div>
              <input
                id="sim-drain"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={inputs.drainage_risk}
                onChange={(e) => updateInput('drainage_risk', Number(e.target.value))}
                className="rg-slider rg-slider-lavender"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="sim-elev" className="text-xs font-medium text-[#E8DFC0]">
                  Relative Elevation (0–100)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={inputs.elevation}
                  onChange={(e) =>
                    updateInput(
                      'elevation',
                      Math.min(100, Math.max(0, Number(e.target.value) || 0))
                    )
                  }
                  aria-label="Relative elevation value"
                  className="w-20 px-2 py-1 text-right font-mono tabular-nums text-xs bg-[#161307] border border-[#3C351A] rounded text-[#FACC15] focus:border-[#FACC15] focus:outline-none"
                />
              </div>
              <input
                id="sim-elev"
                type="range"
                min={0}
                max={100}
                step={1}
                value={inputs.elevation}
                onChange={(e) => updateInput('elevation', Number(e.target.value))}
                className="rg-slider"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#352F17] flex items-center justify-between gap-2 text-[11px] text-[#968D6D]">
            <span>
              Live {selectedLiveDistrict.name}: {selectedLiveDistrict.inputs.rainfall.toFixed(1)}{' '}
              mm/hr
            </span>
            <button
              type="button"
              onClick={() => onSelectDistrictBaseline(selectedLiveDistrict)}
              className="text-[#FACC15] hover:underline cursor-pointer whitespace-nowrap"
            >
              Reset to live district
            </button>
          </div>

          {/* Compact Live Risk Output directly below sliders for immediate visual pairing */}
          <div className="pt-4 border-t border-[#352F17]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-[#968D6D]">Simulator Risk Estimate</span>
              <span className={`font-display text-sm font-bold ${visual.textClass}`}>
                {visual.symbol} {prediction.risk_category} Risk
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="font-mono tabular-nums text-3xl font-bold text-[#FBF7E8]">
                {isPredicting ? '...' : formatPct(prediction.risk_probability)}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-[#C8BE9C]">
                P10–P90: {formatPct(monteCarlo.p10)} – {formatPct(monteCarlo.p90)}
              </span>
            </div>
            <div className="mt-2.5 relative h-2.5 w-full rounded-full bg-[#161307] border border-[#3C351A] overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${visual.barFill}`}
                style={{ width: `${Math.round(prediction.risk_probability * 100)}%` }}
              />
              <span aria-hidden="true" className="absolute top-0 bottom-0 left-[30%] w-px bg-[#FBF7E8]/30" />
              <span aria-hidden="true" className="absolute top-0 bottom-0 left-[55%] w-px bg-[#FBF7E8]/30" />
              <span aria-hidden="true" className="absolute top-0 bottom-0 left-[75%] w-px bg-[#FBF7E8]/30" />
            </div>
          </div>
        </div>

        {/* Right: Synchronized 3D Tamil Nadu Map Viewport (7 cols) */}
        <div className="xl:col-span-7 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#FBF7E8]">
                Live 3D Tamil Nadu Simulation Map
              </h2>
              <p className="text-xs text-[#968D6D]">
                Towers, inundation rings & rain streaks update live as you drag sliders · Click any
                district tower
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="3D simulation reflection scope"
                className="inline-flex items-center gap-1 p-0.5 rounded-md bg-[#1F1B0B] border border-[#3C351A]"
              >
                <button
                  type="button"
                  onClick={() => onChangeSimulationScope('statewide')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    simulationScope === 'statewide'
                      ? 'bg-[#FACC15] text-[#161307] font-semibold'
                      : 'text-[#C8BE9C] hover:text-[#FBF7E8]'
                  }`}
                >
                  All 16 Districts
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSimulationScope('selected')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    simulationScope === 'selected'
                      ? 'bg-[#C4B5FD] text-[#161307] font-semibold'
                      : 'text-[#C8BE9C] hover:text-[#FBF7E8]'
                  }`}
                >
                  {selectedDistrict.name} Only
                </button>
              </div>

              {isSimulatedOn3D && (
                <button
                  type="button"
                  onClick={onRevertToLiveWeather}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md border border-[#3C351A] bg-[#1F1B0B] text-[#C4B5FD] hover:border-[#FACC15]/60 hover:text-[#FACC15] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Revert to Live</span>
                </button>
              )}
            </div>
          </div>

          <TamilNadu3DMap
            districts={districts}
            selectedDistrictId={selectedDistrict.id}
            onSelectDistrict={onSelectDistrict}
            heightClass="h-[465px]"
            isSimulatedOverlay={isSimulatedOn3D}
          />

          {/* Compact Selected District Live vs. Simulated Impact Strip */}
          <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-[11px] text-[#968D6D]">Selected 3D Node</div>
              <div className="font-display font-semibold text-[#FBF7E8] mt-0.5 truncate">
                {selectedDistrict.name} ({selectedDistrict.code})
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#968D6D]">Live Baseline Risk</div>
              <div className={`font-mono tabular-nums font-semibold mt-0.5 ${liveDistVisual.textClass}`}>
                {liveDistVisual.symbol} {formatPct(selectedLiveDistrict.riskProbability)} (
                {selectedLiveDistrict.inputs.rainfall.toFixed(1)} mm/h)
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#968D6D]">Active on 3D Map</div>
              <div className={`font-mono tabular-nums font-semibold mt-0.5 ${activeDistVisual.textClass}`}>
                {activeDistVisual.symbol} {formatPct(selectedDistrict.riskProbability)} (
                {selectedDistrict.inputs.rainfall.toFixed(1)} mm/h)
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#968D6D]">Simulated Delta</div>
              <div
                className={`font-mono tabular-nums font-semibold mt-0.5 ${
                  riskDeltaPct > 0
                    ? 'text-[#FCA5A5]'
                    : riskDeltaPct < 0
                      ? 'text-[#86EFAC]'
                      : 'text-[#C8BE9C]'
                }`}
              >
                {riskDeltaPct > 0 ? `+${riskDeltaPct}%` : `${riskDeltaPct}%`} ·{' '}
                {isSimulatedOn3D ? 'Override Active' : 'Live Synced'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Second Row: Scenario Envelope (5 cols) + Monte Carlo Probability Distribution (7 cols) */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-5 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#352F17]">
            <div>
              <h2 className="font-display text-base font-semibold text-[#FBF7E8]">
                Scenario Risk Envelope
              </h2>
              <p className="text-xs text-[#968D6D] mt-0.5">
                Best, expected, and worst-case perturbation bounds
              </p>
            </div>
            <div className="text-right text-[11px] font-mono text-[#FACC15]">
              {prediction.source === 'fastapi-backend'
                ? `FastAPI (${prediction.latencyMs}ms)`
                : prediction.source === 'fallback-demo'
                  ? 'Fallback Demo'
                  : 'Synthetic Demo'}
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-[#352F17]">
              <div>
                <p className="text-xs text-[#968D6D]">Best-Case Scenario</p>
                <p className="text-[11px] text-[#C8BE9C] mt-0.5">
                  {RISK_VISUALS[envelope.bestCase.category].symbol} {envelope.bestCase.category} ·
                  Rain {envelope.bestCase.inputs.rainfall} mm/h
                </p>
              </div>
              <span className="font-mono tabular-nums text-2xl font-bold text-[#86EFAC]">
                {formatPct(envelope.bestCase.probability)}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-[#352F17]">
              <div>
                <p className="text-xs text-[#968D6D]">Expected Scenario</p>
                <p className="text-[11px] text-[#C8BE9C] mt-0.5">
                  {RISK_VISUALS[envelope.expected.category].symbol} {envelope.expected.category} ·
                  Active simulator sliders
                </p>
              </div>
              <span className="font-mono tabular-nums text-2xl font-bold text-[#FACC15]">
                {formatPct(envelope.expected.probability)}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-xs text-[#968D6D]">Worst-Case Scenario</p>
                <p className="text-[11px] text-[#C8BE9C] mt-0.5">
                  {RISK_VISUALS[envelope.worstCase.category].symbol} {envelope.worstCase.category} ·
                  Rain {envelope.worstCase.inputs.rainfall} mm/h
                </p>
              </div>
              <span className="font-mono tabular-nums text-2xl font-bold text-[#FCA5A5]">
                {formatPct(envelope.worstCase.probability)}
              </span>
            </div>
          </div>

          {prediction.fallbackReason && (
            <p className="mt-4 text-xs text-[#FDBA74] border-t border-[#352F17] pt-3">
              FastAPI fallback note: {prediction.fallbackReason}
            </p>
          )}
        </div>

        {/* Embedded Monte Carlo Distribution (7 cols) */}
        <div className="xl:col-span-7 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#352F17]">
            <div>
              <h3 className="font-display text-base font-semibold text-[#FBF7E8]">
                Monte Carlo Probability Distribution ({monteCarlo.iterations.toLocaleString()} runs)
              </h3>
              <p className="text-xs text-[#968D6D] mt-0.5">
                Uncalibrated synthetic sensitivity distribution — not a statistically validated
                confidence interval
              </p>
            </div>
            <button
              type="button"
              onClick={onRerunMonteCarlo}
              className="text-xs font-medium text-[#C4B5FD] hover:text-[#FACC15] transition-colors cursor-pointer whitespace-nowrap"
            >
              Resample distribution
            </button>
          </div>

          <div className="mt-4 h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monteCarlo.histogram}
                margin={{ top: 10, right: 10, left: -12, bottom: 4 }}
              >
                <CartesianGrid stroke="#352F17" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="rangeLabel"
                  stroke="#968D6D"
                  tick={{ fill: '#C8BE9C', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  interval={3}
                />
                <YAxis
                  stroke="#968D6D"
                  tick={{ fill: '#C8BE9C', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161307',
                    borderColor: '#524824',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontFamily: 'JetBrains Mono',
                  }}
                  formatter={(val) => [`${val ?? 0}% of runs`, 'Frequency']}
                />
                <ReferenceLine
                  x={
                    monteCarlo.histogram[Math.min(19, Math.floor(monteCarlo.median * 20))]
                      ?.rangeLabel
                  }
                  stroke="#C4B5FD"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                />
                <Bar dataKey="percent" radius={[2, 2, 0, 0]}>
                  {monteCarlo.histogram.map((bin) => (
                    <Cell key={bin.rangeLabel} fill={RISK_VISUALS[bin.category].chartHex} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 pt-3 border-t border-[#352F17] flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums text-[#C8BE9C]">
            <span>P10: {formatPct(monteCarlo.p10)}</span>
            <span className="text-[#C4B5FD]">Median: {formatPct(monteCarlo.median)}</span>
            <span>P90: {formatPct(monteCarlo.p90)}</span>
            <span className="text-[#FACC15]">
              ≥{Math.round(monteCarlo.highRiskThreshold * 100)}% Threshold:{' '}
              {monteCarlo.exceedingThresholdPct}%
            </span>
          </div>
        </div>
      </section>

      {/* Embedded 24-Hour Live Trends Chart inside Simulator */}
      <LiveTrendsChart
        mode="simulator"
        districts={districts}
        liveBaselineDistricts={liveBaselineDistricts}
        selectedDistrict={selectedDistrict}
        simulatorInputs={inputs}
        isSimulatedActive={isSimulatedOn3D}
        weatherSourceLabel={weatherSourceCaption}
      />

      {/* Bottom Split: Parameter Sensitivity + FastAPI /predict Integration Layer */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-5 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6">
          <div className="pb-3 border-b border-[#352F17]">
            <h2 className="font-display text-base font-semibold text-[#FBF7E8]">
              Input Sensitivity Range
            </h2>
            <p className="text-xs text-[#968D6D] mt-0.5">
              One-at-a-time perturbation span around current simulator settings
            </p>
          </div>

          <div className="mt-4 space-y-4">
            {sensitivity.map((item) => {
              const leftPct = Math.round(item.lowProb * 100);
              const widthPct = Math.max(3, Math.round((item.highProb - item.lowProb) * 100));
              const baseMarker = Math.round(item.baseProb * 100);
              return (
                <div key={item.key}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium text-[#E8DFC0]">{item.parameter}</span>
                    <span className="font-mono tabular-nums text-[#C4B5FD]">
                      {formatPct(item.lowProb, 0)} – {formatPct(item.highProb, 0)}
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-2.5 w-full rounded-full bg-[#161307] border border-[#352F17]">
                    <div
                      className="absolute top-0 bottom-0 rounded-full bg-[#C4B5FD]/75"
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    />
                    <div
                      className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-[#FACC15]"
                      style={{ left: `${baseMarker}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] text-[#968D6D]">
            Yellow tick indicates current expected probability ({formatPct(envelope.expected.probability)}).
          </p>
        </div>

        <div className="xl:col-span-7 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#352F17]">
            <div>
              <h2 className="font-display text-base font-semibold text-[#FBF7E8]">
                Python FastAPI ML Integration Layer
              </h2>
              <p className="text-xs text-[#968D6D] mt-0.5">
                Live contract for POST /predict with automatic synthetic fallback when offline
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowFastApiCode((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#3C351A] text-[#C4B5FD] hover:border-[#C4B5FD]/50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{showFastApiCode ? 'Hide FastAPI main.py' : 'View FastAPI main.py'}</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="inline-flex items-center gap-1 p-1 rounded-md bg-[#161307] border border-[#352F17] shrink-0">
              <button
                type="button"
                onClick={() => onChangeBackendConfig({ ...backendConfig, mode: 'demo' })}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  backendConfig.mode === 'demo'
                    ? 'bg-[#2B2510] text-[#FACC15]'
                    : 'text-[#968D6D] hover:text-[#FBF7E8]'
                }`}
              >
                Demo Fallback
              </button>
              <button
                type="button"
                onClick={() => onChangeBackendConfig({ ...backendConfig, mode: 'fastapi' })}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  backendConfig.mode === 'fastapi'
                    ? 'bg-[#2B2510] text-[#C4B5FD]'
                    : 'text-[#968D6D] hover:text-[#FBF7E8]'
                }`}
              >
                Live FastAPI
              </button>
            </div>

            <input
              type="url"
              value={backendConfig.endpointUrl}
              onChange={(e) =>
                onChangeBackendConfig({ ...backendConfig, endpointUrl: e.target.value })
              }
              aria-label="FastAPI predict endpoint URL"
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-[#161307] border border-[#3C351A] rounded-md text-[#FBF7E8] focus:border-[#C4B5FD] focus:outline-none"
            />

            <button
              type="button"
              onClick={onTriggerPredict}
              disabled={isPredicting}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[#FACC15] text-[#161307] hover:bg-[#FDE047] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Server className="w-3.5 h-3.5" />
              <span>{isPredicting ? 'Sending...' : 'Test POST'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-mono text-[#968D6D] mb-1.5">
                Request Body · POST /predict
              </div>
              <pre className="p-3 rounded-md bg-[#161307] border border-[#352F17] text-xs font-mono text-[#FACC15] overflow-x-auto leading-relaxed">
                {JSON.stringify(requestPayload, null, 2)}
              </pre>
            </div>
            <div>
              <div className="text-[11px] font-mono text-[#968D6D] mb-1.5">
                Current Output Schema ({prediction.source})
              </div>
              <pre className="p-3 rounded-md bg-[#161307] border border-[#352F17] text-xs font-mono text-[#C4B5FD] overflow-x-auto leading-relaxed">
                {JSON.stringify(
                  {
                    risk_probability: Number(prediction.risk_probability.toFixed(2)),
                    risk_category: prediction.risk_category,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>

          {showFastApiCode && (
            <div className="pt-2 border-t border-[#352F17]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-[#C8BE9C]">
                  Reference backend/main.py (Python FastAPI)
                </span>
                <button
                  type="button"
                  onClick={handleCopyFastApi}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#FACC15] hover:text-[#FDE047] cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Python'}</span>
                </button>
              </div>
              <pre className="p-3 rounded-md bg-[#161307] border border-[#352F17] text-[11px] font-mono text-[#E8DFC0] overflow-x-auto max-h-[240px] leading-relaxed">
                {FASTAPI_REFERENCE_CODE}
              </pre>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
