import { CloudDownload, RotateCcw, Server, X } from 'lucide-react';
import { SCENARIO_PRESETS } from '../data/presets';
import {
  BackendConfig,
  DataSourceMode,
  FloodInputs,
  LiveFeedStatus,
  PredictionResult,
} from '../types/flood';

interface ControlSidebarProps {
  inputs: FloodInputs;
  activePresetId: string | null;
  onChangeInputs: (next: FloodInputs) => void;
  onApplyPreset: (presetId: string) => void;
  onResetDefaults: () => void;
  dataSourceMode: DataSourceMode;
  onChangeDataSourceMode: (mode: DataSourceMode) => void;
  liveFeedStatus: LiveFeedStatus;
  onRefreshLiveFeed: () => void;
  backendConfig: BackendConfig;
  onChangeBackendConfig: (next: BackendConfig) => void;
  onTestBackend: () => void;
  isPredicting: boolean;
  prediction: PredictionResult;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function ControlSidebar({
  inputs,
  activePresetId,
  onChangeInputs,
  onApplyPreset,
  onResetDefaults,
  dataSourceMode,
  onChangeDataSourceMode,
  liveFeedStatus,
  onRefreshLiveFeed,
  backendConfig,
  onChangeBackendConfig,
  onTestBackend,
  isPredicting,
  prediction,
  mobileOpen,
  onCloseMobile,
}: ControlSidebarProps) {
  const updateField = <K extends keyof FloodInputs>(key: K, value: FloodInputs[K]) => {
    onChangeInputs({ ...inputs, [key]: value });
  };

  const formattedSyncTime = liveFeedStatus.lastSyncedAt
    ? new Date(liveFeedStatus.lastSyncedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Pending';

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#1C180A] border-r border-[#3C351A]">
      <div className="px-5 py-4 border-b border-[#3C351A] flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold text-[#FBF7E8]">
            Simulation Controls
          </h2>
          <p className="text-xs text-[#968D6D] mt-0.5">
            Tamil Nadu 16-District & Basin Sync
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onResetDefaults}
            title="Reset to default scenario"
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#C8BE9C] hover:text-[#FACC15] rounded transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close simulation controls"
            className="lg:hidden p-1.5 text-[#C8BE9C] hover:text-[#FBF7E8]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {/* Live Dataset vs Simulated Stress Mode */}
        <section aria-labelledby="dataset-mode-heading" className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 id="dataset-mode-heading" className="text-xs font-semibold text-[#C8BE9C]">
              Tamil Nadu Dataset Source
            </h3>
            <span className="font-mono text-[10px] text-[#968D6D]">
              {liveFeedStatus.loading ? 'Syncing...' : formattedSyncTime}
            </span>
          </div>

          <div
            role="group"
            aria-label="Dataset source mode"
            className="grid grid-cols-2 gap-1 p-1 rounded-md bg-[#161307] border border-[#352F17]"
          >
            <button
              type="button"
              onClick={() => onChangeDataSourceMode('live')}
              className={`px-2 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                dataSourceMode === 'live'
                  ? 'bg-[#2B2510] text-[#FACC15]'
                  : 'text-[#968D6D] hover:text-[#FBF7E8]'
              }`}
            >
              Live Open-Meteo
            </button>
            <button
              type="button"
              onClick={() => onChangeDataSourceMode('simulated')}
              className={`px-2 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                dataSourceMode === 'simulated'
                  ? 'bg-[#2B2510] text-[#C4B5FD]'
                  : 'text-[#968D6D] hover:text-[#FBF7E8]'
              }`}
            >
              Stress Scenario
            </button>
          </div>

          <button
            type="button"
            onClick={onRefreshLiveFeed}
            disabled={liveFeedStatus.loading}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#3C351A] bg-[#161307] text-[#E8DFC0] hover:border-[#FACC15]/60 hover:text-[#FACC15] disabled:opacity-50 transition-colors cursor-pointer"
          >
            <CloudDownload className="w-3.5 h-3.5" />
            <span>
              {liveFeedStatus.loading ? 'Fetching 16 Districts...' : 'Refresh Open-Meteo Feed'}
            </span>
          </button>

          <p className="text-[11px] leading-snug text-[#968D6D]">
            {dataSourceMode === 'live'
              ? liveFeedStatus.source === 'open-meteo-live'
                ? 'Active: Live Open-Meteo weather across 16 TN districts.'
                : liveFeedStatus.errorNote ?? 'Using synthetic Tamil Nadu fallback dataset.'
              : 'Active: Stress-testing all 16 TN districts using the sliders & presets below.'}
          </p>
        </section>

        <hr className="border-[#352F17]" />

        {/* Scenario Presets */}
        <section aria-labelledby="preset-heading">
          <h3 id="preset-heading" className="text-xs font-semibold text-[#C8BE9C] mb-2.5">
            Stress-Test Scenarios
          </h3>
          <div className="space-y-1.5">
            {SCENARIO_PRESETS.map((preset) => {
              const selected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyPreset(preset.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#2B2510] border-[#FACC15]/60 text-[#FBF7E8]'
                      : 'bg-transparent border-[#352F17] text-[#C8BE9C] hover:bg-[#24200E] hover:text-[#FBF7E8]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold truncate">{preset.name}</span>
                    <span className="font-mono tabular-nums text-[11px] text-[#FACC15] shrink-0">
                      {preset.inputs.rainfall} mm/h
                    </span>
                  </div>
                  <p className="text-[11px] text-[#968D6D] mt-1 leading-snug line-clamp-2">
                    {preset.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <hr className="border-[#352F17]" />

        {/* Live Hydrological Inputs */}
        <section aria-labelledby="inputs-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 id="inputs-heading" className="text-xs font-semibold text-[#C8BE9C]">
              Simulator Parameters
            </h3>
            <span className="text-[11px] text-[#968D6D]">Live sync</span>
          </div>

          {/* Rainfall Intensity */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="sb-rainfall" className="text-xs font-medium text-[#E8DFC0]">
                Rainfall Intensity
              </label>
              <span className="font-mono tabular-nums text-xs font-semibold text-[#FACC15]">
                {inputs.rainfall.toFixed(1)}{' '}
                <span className="text-[10px] font-normal text-[#968D6D]">mm/hr</span>
              </span>
            </div>
            <input
              id="sb-rainfall"
              type="range"
              min={0}
              max={180}
              step={1}
              value={inputs.rainfall}
              onChange={(e) => updateField('rainfall', Number(e.target.value))}
              className="rg-slider"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#857D5E] mt-1">
              <span>0</span>
              <span>90</span>
              <span>180 mm/hr</span>
            </div>
          </div>

          {/* Terrain Slope */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="sb-slope" className="text-xs font-medium text-[#E8DFC0]">
                Terrain Slope
              </label>
              <span className="font-mono tabular-nums text-xs font-semibold text-[#FACC15]">
                {inputs.slope.toFixed(0)}°
              </span>
            </div>
            <input
              id="sb-slope"
              type="range"
              min={0}
              max={45}
              step={1}
              value={inputs.slope}
              onChange={(e) => updateField('slope', Number(e.target.value))}
              className="rg-slider"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#857D5E] mt-1">
              <span>0° Flat</span>
              <span>22°</span>
              <span>45° Steep</span>
            </div>
          </div>

          {/* Soil Saturation */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="sb-soil" className="text-xs font-medium text-[#E8DFC0]">
                Soil Saturation
              </label>
              <span className="font-mono tabular-nums text-xs font-semibold text-[#C4B5FD]">
                {inputs.soil_saturation.toFixed(2)}
              </span>
            </div>
            <input
              id="sb-soil"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={inputs.soil_saturation}
              onChange={(e) => updateField('soil_saturation', Number(e.target.value))}
              className="rg-slider rg-slider-lavender"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#857D5E] mt-1">
              <span>0.00 Dry</span>
              <span>0.50</span>
              <span>1.00 Saturated</span>
            </div>
          </div>

          {/* Drainage Risk */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="sb-drainage" className="text-xs font-medium text-[#E8DFC0]">
                Drainage Risk
              </label>
              <span className="font-mono tabular-nums text-xs font-semibold text-[#C4B5FD]">
                {inputs.drainage_risk.toFixed(2)}
              </span>
            </div>
            <input
              id="sb-drainage"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={inputs.drainage_risk}
              onChange={(e) => updateField('drainage_risk', Number(e.target.value))}
              className="rg-slider rg-slider-lavender"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#857D5E] mt-1">
              <span>0.00 Clear</span>
              <span>0.50</span>
              <span>1.00 Obstructed</span>
            </div>
          </div>

          {/* Relative Elevation */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="sb-elevation" className="text-xs font-medium text-[#E8DFC0]">
                Relative Elevation
              </label>
              <span className="font-mono tabular-nums text-xs font-semibold text-[#FACC15]">
                {inputs.elevation.toFixed(0)}{' '}
                <span className="text-[10px] font-normal text-[#968D6D]">/ 100</span>
              </span>
            </div>
            <input
              id="sb-elevation"
              type="range"
              min={0}
              max={100}
              step={1}
              value={inputs.elevation}
              onChange={(e) => updateField('elevation', Number(e.target.value))}
              className="rg-slider"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#857D5E] mt-1">
              <span>0 Basin Floor</span>
              <span>50</span>
              <span>100 Ridge</span>
            </div>
          </div>
        </section>

        <hr className="border-[#352F17]" />

        {/* FastAPI ML Integration Layer Controls */}
        <section aria-labelledby="ml-backend-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 id="ml-backend-heading" className="text-xs font-semibold text-[#C8BE9C]">
              ML Inference Layer
            </h3>
            <span className="font-mono text-[11px] text-[#C4B5FD]">POST /predict</span>
          </div>

          <div
            role="group"
            aria-label="Inference mode"
            className="grid grid-cols-2 gap-1 p-1 rounded-md bg-[#161307] border border-[#352F17]"
          >
            <button
              type="button"
              onClick={() => onChangeBackendConfig({ ...backendConfig, mode: 'demo' })}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                backendConfig.mode === 'demo'
                  ? 'bg-[#2B2510] text-[#FACC15]'
                  : 'text-[#968D6D] hover:text-[#FBF7E8]'
              }`}
            >
              Demo Engine
            </button>
            <button
              type="button"
              onClick={() => onChangeBackendConfig({ ...backendConfig, mode: 'fastapi' })}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                backendConfig.mode === 'fastapi'
                  ? 'bg-[#2B2510] text-[#C4B5FD]'
                  : 'text-[#968D6D] hover:text-[#FBF7E8]'
              }`}
            >
              FastAPI Live
            </button>
          </div>

          {backendConfig.mode === 'fastapi' && (
            <div className="space-y-2">
              <label htmlFor="fastapi-url" className="block text-[11px] text-[#968D6D]">
                FastAPI Endpoint URL
              </label>
              <input
                id="fastapi-url"
                type="url"
                value={backendConfig.endpointUrl}
                onChange={(e) =>
                  onChangeBackendConfig({ ...backendConfig, endpointUrl: e.target.value })
                }
                placeholder="http://localhost:8000/predict"
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#161307] border border-[#3C351A] rounded-md text-[#FBF7E8] focus:border-[#C4B5FD] focus:outline-none"
              />
              <button
                type="button"
                onClick={onTestBackend}
                disabled={isPredicting}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-[#C4B5FD]/40 bg-[#C4B5FD]/10 text-[#C4B5FD] hover:bg-[#C4B5FD]/20 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Server className="w-3.5 h-3.5" />
                <span>{isPredicting ? 'Calling /predict...' : 'Send POST /predict'}</span>
              </button>
            </div>
          )}

          <div className="text-[11px] leading-relaxed text-[#968D6D]">
            {prediction.source === 'fastapi-backend' && (
              <p className="text-[#86EFAC]">
                Connected to FastAPI backend ({prediction.latencyMs}ms).
              </p>
            )}
            {prediction.source === 'fallback-demo' && (
              <p className="text-[#FDBA74]">
                Fallback active: {prediction.fallbackReason}
              </p>
            )}
            {prediction.source === 'demo-engine' && (
              <p>
                Running local prototype risk model. Switch to FastAPI Live to query an external
                Python server.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Honest Transparency Disclosure */}
      <div className="px-5 py-3.5 border-t border-[#3C351A] bg-[#161307]/60 text-[11px] leading-relaxed text-[#968D6D]">
        Weather feed via Open-Meteo (with synthetic fallback). Flood-risk scores are prototype model
        estimates — not live IMD, MOSDAC, NWP, AWS, ESP32, or satellite feeds.
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[296px] shrink-0 sticky top-16 h-[calc(100vh-4rem)]">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-[304px] max-w-[88vw] h-full z-10">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
