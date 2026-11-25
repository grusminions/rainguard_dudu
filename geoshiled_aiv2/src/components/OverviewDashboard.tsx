import {
  ArrowRight,
  CloudDownload,
  Globe2,
  Grid,
  RotateCcw,
  Sliders,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DashboardSection,
  DataSourceMode,
  FloodInputs,
  ForecastPoint,
  GridCellData,
  LiveFeedStatus,
  OverviewMapMode,
  RiskCategory,
  TamilNaduDistrictData,
} from '../types/flood';
import { formatPct, RISK_VISUALS } from '../utils/riskStyles';
import { LiveTrendsChart } from './LiveTrendsChart';
import { TamilNadu3DMap } from './TamilNadu3DMap';

interface OverviewDashboardProps {
  mapMode: OverviewMapMode;
  onChangeMapMode: (mode: OverviewMapMode) => void;
  dataSourceMode: DataSourceMode;
  onChangeDataSourceMode: (mode: DataSourceMode) => void;
  hasSimulatorOverride: boolean;
  simulationScope: 'statewide' | 'selected';
  onChangeSimulationScope: (scope: 'statewide' | 'selected') => void;
  onRevertToLiveWeather: () => void;
  liveFeedStatus: LiveFeedStatus;
  onRefreshLiveFeed: () => void;
  districts: TamilNaduDistrictData[];
  liveBaselineDistricts: TamilNaduDistrictData[];
  selectedDistrictId: string;
  onSelectDistrict: (id: string) => void;
  onLoadDistrictIntoSimulator: (district: TamilNaduDistrictData) => void;
  onToggleDistrictMitigation: (districtId: string) => void;
  mitigatedDistricts: Record<string, boolean>;
  onResetAllDistrictMitigation: () => void;
  gridCells: GridCellData[];
  selectedCellId: string;
  onSelectCell: (id: string) => void;
  onLoadCellIntoSimulator: (cell: GridCellData) => void;
  onToggleCellMitigation: (cellId: string) => void;
  mitigatedCells: Record<string, boolean>;
  onResetAllCellOverrides: () => void;
  forecastPoints: ForecastPoint[];
  forecastHorizon: number;
  globalInputs: FloodInputs;
  onNavigate: (section: DashboardSection) => void;
}

const ROW_LABELS = ['A · Upland', 'B · Mid-Upper', 'C · Urban Core', 'D · Floodplain', 'E · Outfall'];
const COL_LABELS = ['Col 1 · W', 'Col 2', 'Col 3 · Center', 'Col 4', 'Col 5 · E'];

export function OverviewDashboard({
  mapMode,
  onChangeMapMode,
  dataSourceMode,
  onChangeDataSourceMode,
  hasSimulatorOverride,
  simulationScope,
  onChangeSimulationScope,
  onRevertToLiveWeather,
  liveFeedStatus,
  onRefreshLiveFeed,
  districts,
  liveBaselineDistricts,
  selectedDistrictId,
  onSelectDistrict,
  onLoadDistrictIntoSimulator,
  onToggleDistrictMitigation,
  mitigatedDistricts,
  onResetAllDistrictMitigation,
  gridCells,
  selectedCellId,
  onSelectCell,
  onLoadCellIntoSimulator,
  onToggleCellMitigation,
  mitigatedCells,
  onResetAllCellOverrides,
  forecastPoints,
  forecastHorizon,
  globalInputs,
  onNavigate,
}: OverviewDashboardProps) {
  const [riskFilter, setRiskFilter] = useState<'All' | RiskCategory>('All');

  const selectedDistrict = useMemo(
    () => districts.find((d) => d.id === selectedDistrictId) ?? districts[0],
    [districts, selectedDistrictId]
  );

  const selectedCell = useMemo(
    () => gridCells.find((c) => c.id === selectedCellId) ?? gridCells[12],
    [gridCells, selectedCellId]
  );

  // Compute KPIs dynamically for whichever active map mode is displayed (16 TN districts vs 25 Grid sectors)
  const metrics = useMemo(() => {
    if (mapMode === 'tamilnadu-3d') {
      const total = districts.length;
      const avgRain = districts.reduce((acc, d) => acc + d.inputs.rainfall, 0) / total;
      const maxRain = Math.max(...districts.map((d) => d.inputs.rainfall));
      const avgRisk = districts.reduce((acc, d) => acc + d.riskProbability, 0) / total;
      const highOrVeryHigh = districts.filter(
        (d) => d.riskCategory === 'High' || d.riskCategory === 'Very High'
      ).length;
      const veryHighCount = districts.filter((d) => d.riskCategory === 'Very High').length;

      // Peak & total projected next 24h from selected district's Open-Meteo/fallback hourly series
      const futureHrs = selectedDistrict.hourlySeries.filter((p) => p.phase === 'forecast');
      const forecastPeak = futureHrs.length
        ? Math.max(...futureHrs.map((p) => p.rainfallMm))
        : 0;
      const forecastTotal = futureHrs.reduce((sum, p) => sum + p.rainfallMm, 0);

      let statusLabel = 'Nominal Watch';
      let statusCategory: RiskCategory = 'Low';
      if (veryHighCount >= 3 || avgRisk >= 0.68) {
        statusLabel = 'Severe Watch';
        statusCategory = 'Very High';
      } else if (highOrVeryHigh >= 4 || avgRisk >= 0.50) {
        statusLabel = 'Elevated Watch';
        statusCategory = 'High';
      } else if (highOrVeryHigh >= 1 || avgRisk >= 0.30) {
        statusLabel = 'Moderate Stress';
        statusCategory = 'Moderate';
      }

      return {
        total,
        unitLabel: 'TN districts',
        subtitleLocations: 'Coastal, Cauvery Delta, Western Ghats & South',
        avgRain,
        maxRain,
        avgRisk,
        highOrVeryHigh,
        veryHighCount,
        forecastPeak,
        forecastTotal,
        forecastWindowLabel: '24h',
        statusLabel,
        statusCategory,
      };
    }

    const total = gridCells.length;
    const avgRain = gridCells.reduce((acc, c) => acc + c.inputs.rainfall, 0) / total;
    const maxRain = Math.max(...gridCells.map((c) => c.inputs.rainfall));
    const avgRisk = gridCells.reduce((acc, c) => acc + c.riskProbability, 0) / total;
    const highOrVeryHigh = gridCells.filter(
      (c) => c.riskCategory === 'High' || c.riskCategory === 'Very High'
    ).length;
    const veryHighCount = gridCells.filter((c) => c.riskCategory === 'Very High').length;

    const futureOnly = forecastPoints.filter((p) => p.phase === 'forecast');
    const forecastPeak = futureOnly.length
      ? Math.max(...futureOnly.map((p) => p.predictedRainfall ?? 0))
      : 0;
    const forecastTotal = futureOnly.reduce((sum, p) => sum + (p.predictedRainfall ?? 0), 0);

    let statusLabel = 'Nominal Watch';
    let statusCategory: RiskCategory = 'Low';
    if (veryHighCount >= 5 || avgRisk >= 0.72) {
      statusLabel = 'Severe Simulation';
      statusCategory = 'Very High';
    } else if (highOrVeryHigh >= 7 || avgRisk >= 0.55) {
      statusLabel = 'Elevated Watch';
      statusCategory = 'High';
    } else if (highOrVeryHigh >= 2 || avgRisk >= 0.34) {
      statusLabel = 'Moderate Stress';
      statusCategory = 'Moderate';
    }

    return {
      total,
      unitLabel: '5×5 synthetic sectors',
      subtitleLocations: 'Upland crest to outfall weir catchment grid',
      avgRain,
      maxRain,
      avgRisk,
      highOrVeryHigh,
      veryHighCount,
      forecastPeak,
      forecastTotal,
      forecastWindowLabel: `${forecastHorizon}h`,
      statusLabel,
      statusCategory,
    };
  }, [mapMode, districts, selectedDistrict, gridCells, forecastPoints, forecastHorizon]);

  const statusMeta = RISK_VISUALS[metrics.statusCategory];
  const selectedDistVisual = RISK_VISUALS[selectedDistrict.riskCategory];
  const selectedCellVisual = RISK_VISUALS[selectedCell.riskCategory];

  const hasAnyCellMitigation = Object.values(mitigatedCells).some(Boolean);
  const isCellMitigated = Boolean(mitigatedCells[selectedCell.id]);
  const hasAnyDistMitigation = Object.values(mitigatedDistricts).some(Boolean);
  const isDistMitigated = Boolean(mitigatedDistricts[selectedDistrict.id]);

  const isSimulatedOn3D = dataSourceMode === 'simulated' || hasSimulatorOverride;

  const weatherSourceCaption = isSimulatedOn3D
    ? `Live Simulator Reflection Active (${
        simulationScope === 'statewide' ? 'All 16 Districts' : `${selectedDistrict.name} Only`
      })`
    : liveFeedStatus.source === 'open-meteo-live'
      ? 'Live Open-Meteo Weather API · Prototype Flood-Risk Model'
      : 'Synthetic Tamil Nadu Monsoon Fallback (Open-Meteo unavailable)';

  return (
    <div className="space-y-8">
      {/* Header & Workspace Mode Bar */}
      <div className="flex flex-col gap-5 pb-6 border-b border-[#3C351A]">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#C4B5FD]">
              {weatherSourceCaption} · Smart India Hackathon 2026
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#FBF7E8] tracking-tight mt-1.5 text-balance">
              {mapMode === 'tamilnadu-3d'
                ? 'Tamil Nadu 3D Flood-Risk Command Overview'
                : 'Basin 5×5 Flood-Risk Command Overview'}
            </h1>
            <p className="text-sm text-[#C8BE9C] mt-2 max-w-3xl leading-relaxed">
              Explore live Open-Meteo precipitation and soil moisture across 16 Tamil Nadu districts
              in an interactive 3D topographic relief map, or toggle to the 2D 5×5 sector grid for
              micro-catchment analysis. Flood-risk probabilities are prototype model estimates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('simulator')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#3C351A] bg-[#211D0C] hover:border-[#FACC15]/60 text-[#FBF7E8] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5 text-[#FACC15]" />
              <span>Open Simulator</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('responder')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#C4B5FD]/35 bg-[#C4B5FD]/10 hover:bg-[#C4B5FD]/20 text-[#C4B5FD] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Responder Desk</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Clean Workspace Switcher Bar: 3D Tamil Nadu vs 2D Grid + Live vs Stress Mode */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div
            role="group"
            aria-label="Map visualization mode"
            className="inline-flex items-center gap-1 p-1 rounded-md bg-[#1F1B0B] border border-[#3C351A]"
          >
            <button
              type="button"
              onClick={() => onChangeMapMode('tamilnadu-3d')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                mapMode === 'tamilnadu-3d'
                  ? 'bg-[#FACC15] text-[#161307]'
                  : 'text-[#C8BE9C] hover:text-[#FBF7E8]'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span>3D Tamil Nadu Map</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeMapMode('grid-2d')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                mapMode === 'grid-2d'
                  ? 'bg-[#FACC15] text-[#161307]'
                  : 'text-[#C8BE9C] hover:text-[#FBF7E8]'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>2D 5×5 Grid</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div
              role="group"
              aria-label="Overview dataset mode"
              className="inline-flex items-center gap-1 p-1 rounded-md bg-[#1F1B0B] border border-[#3C351A]"
            >
              <button
                type="button"
                onClick={() => onChangeDataSourceMode('live')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  !isSimulatedOn3D
                    ? 'bg-[#2B2510] text-[#FACC15]'
                    : 'text-[#968D6D] hover:text-[#FBF7E8]'
                }`}
              >
                Live Open-Meteo
              </button>
              <button
                type="button"
                onClick={() => onChangeDataSourceMode('simulated')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  isSimulatedOn3D
                    ? 'bg-[#2B2510] text-[#C4B5FD]'
                    : 'text-[#968D6D] hover:text-[#FBF7E8]'
                }`}
              >
                Simulated Live
              </button>
            </div>

            <button
              type="button"
              onClick={onRefreshLiveFeed}
              disabled={liveFeedStatus.loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#3C351A] bg-[#1F1B0B] text-[#E8DFC0] hover:border-[#FACC15]/60 hover:text-[#FACC15] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <CloudDownload className="w-3.5 h-3.5" />
              <span>{liveFeedStatus.loading ? 'Syncing...' : 'Sync Weather'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 6 Dynamic KPI Metrics */}
      <section aria-label="Live command metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
          <p className="text-xs font-medium text-[#968D6D]">Total Monitored Locations</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-3xl font-semibold text-[#FBF7E8]">
              {metrics.total}
            </span>
            <span className="text-xs font-mono text-[#968D6D]">{metrics.unitLabel}</span>
          </div>
          <p className="text-xs text-[#C8BE9C] mt-2">{metrics.subtitleLocations}</p>
        </div>

        <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
          <p className="text-xs font-medium text-[#968D6D]">Current Rainfall Intensity</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-3xl font-semibold text-[#FACC15]">
              {metrics.avgRain.toFixed(1)}
            </span>
            <span className="text-xs font-mono text-[#968D6D]">mm/hr avg</span>
          </div>
          <p className="text-xs text-[#C8BE9C] mt-2 font-mono tabular-nums">
            Peak observed/modeled: {metrics.maxRain.toFixed(1)} mm/hr
          </p>
        </div>

        <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
          <p className="text-xs font-medium text-[#968D6D]">Overall Estimated Flood-Risk</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-3xl font-semibold text-[#FBF7E8]">
              {formatPct(metrics.avgRisk)}
            </span>
            <span className="text-xs font-mono text-[#968D6D]">mean estimate</span>
          </div>
          <p className="text-xs text-[#C8BE9C] mt-2">
            Computed across all {metrics.total} active monitored nodes
          </p>
        </div>

        <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
          <p className="text-xs font-medium text-[#968D6D]">High-Risk Locations</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-3xl font-semibold text-[#FDBA74]">
              {metrics.highOrVeryHigh}
            </span>
            <span className="text-xs font-mono text-[#968D6D]">/ {metrics.total} nodes</span>
          </div>
          <p className="text-xs text-[#C8BE9C] mt-2 font-mono tabular-nums">
            {metrics.veryHighCount} Very High · {metrics.highOrVeryHigh - metrics.veryHighCount} High
            risk
          </p>
        </div>

        <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
          <p className="text-xs font-medium text-[#968D6D]">
            Forecast Rainfall ({metrics.forecastWindowLabel})
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-3xl font-semibold text-[#C4B5FD]">
              {metrics.forecastPeak.toFixed(1)}
            </span>
            <span className="text-xs font-mono text-[#968D6D]">mm/hr peak</span>
          </div>
          <p className="text-xs text-[#C8BE9C] mt-2 font-mono tabular-nums">
            Projected {metrics.forecastWindowLabel} total: {metrics.forecastTotal.toFixed(1)} mm
          </p>
        </div>

        <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5">
          <p className="text-xs font-medium text-[#968D6D]">Current Scenario Status</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`font-display text-2xl font-bold ${statusMeta.textClass}`}>
              {statusMeta.symbol} {metrics.statusLabel}
            </span>
          </div>
          <p className="text-xs text-[#C8BE9C] mt-2">
            Tier: {statusMeta.label} ·{' '}
            {isSimulatedOn3D ? 'Simulator override live' : 'Live weather input'}
          </p>
        </div>
      </section>

      {/* Main Spatial Stage: Either 3D Three.js Tamil Nadu Map OR 2D 5x5 Heatmap */}
      {mapMode === 'tamilnadu-3d' ? (
        <section
          aria-labelledby="tn-3d-heading"
          className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
        >
          {/* Left: 3D Three.js Tamil Nadu Terrain Viewport + 16-District Quick Strip (7 cols) */}
          <div className="xl:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="tn-3d-heading" className="font-display text-lg font-semibold text-[#FBF7E8]">
                  3D Tamil Nadu Hydrological Terrain Map
                </h2>
                <p className="text-xs text-[#968D6D]">
                  Drag to orbit · Scroll to zoom · Click any district tower to inspect live telemetry
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isSimulatedOn3D && (
                  <>
                    <div
                      role="group"
                      aria-label="3D simulation scope"
                      className="inline-flex items-center gap-1 p-0.5 rounded-md bg-[#1F1B0B] border border-[#3C351A]"
                    >
                      <button
                        type="button"
                        onClick={() => onChangeSimulationScope('statewide')}
                        className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
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
                        className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                          simulationScope === 'selected'
                            ? 'bg-[#C4B5FD] text-[#161307] font-semibold'
                            : 'text-[#C8BE9C] hover:text-[#FBF7E8]'
                        }`}
                      >
                        {selectedDistrict.name} Only
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={onRevertToLiveWeather}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#C4B5FD] hover:text-[#FACC15] cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Revert to live</span>
                    </button>
                  </>
                )}
                {hasAnyDistMitigation && (
                  <button
                    type="button"
                    onClick={onResetAllDistrictMitigation}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C4B5FD] hover:text-[#FBF7E8] cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset pump tests</span>
                  </button>
                )}
              </div>
            </div>

            <TamilNadu3DMap
              districts={districts}
              selectedDistrictId={selectedDistrict.id}
              onSelectDistrict={onSelectDistrict}
              isSimulatedOverlay={isSimulatedOn3D}
            />

            {/* Compact Interactive 16-District Selector Strip */}
            <div className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-3.5">
              <div className="flex items-center justify-between text-[11px] text-[#968D6D] mb-2">
                <span>16 Monitored Tamil Nadu Districts (click to select)</span>
                <span className="font-mono">Height & color scale with flood risk</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {districts.map((dist) => {
                  const active = dist.id === selectedDistrict.id;
                  const vis = RISK_VISUALS[dist.riskCategory];
                  return (
                    <button
                      key={dist.id}
                      type="button"
                      onClick={() => onSelectDistrict(dist.id)}
                      className={`px-2.5 py-1.5 rounded border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#2B2510] border-[#FACC15] text-[#FBF7E8]'
                          : 'bg-[#161307] border-[#352F17] text-[#C8BE9C] hover:border-[#524824]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="font-medium truncate">{dist.name}</span>
                        <span className={`font-mono tabular-nums font-semibold ${vis.textClass}`}>
                          {Math.round(dist.riskProbability * 100)}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Tamil Nadu District Telemetry Inspector (5 cols) */}
          <div className="xl:col-span-5 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#352F17]">
              <div>
                <div className="text-xs font-mono text-[#C4B5FD]">
                  {selectedDistrict.code} · {selectedDistrict.region} ·{' '}
                  {selectedDistrict.lat.toFixed(2)}°N, {selectedDistrict.lon.toFixed(2)}°E
                </div>
                <h3 className="font-display text-xl font-bold text-[#FBF7E8] mt-1">
                  {selectedDistrict.name}
                </h3>
                <p className="text-xs text-[#968D6D] mt-1">{selectedDistrict.basinNote}</p>
              </div>

              <div className="text-right shrink-0">
                <div className="font-mono tabular-nums text-3xl font-bold text-[#FBF7E8]">
                  {formatPct(selectedDistrict.riskProbability)}
                </div>
                <div className={`text-xs font-semibold mt-0.5 ${selectedDistVisual.textClass}`}>
                  {selectedDistVisual.symbol} {selectedDistrict.riskCategory} Risk
                </div>
              </div>
            </div>

            {/* Live Weather + Terrain Readouts */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-[#C8BE9C]">
                  District Weather & Hydrological Inputs
                </h4>
                <span className="text-[11px] font-mono text-[#968D6D]">
                  {selectedDistrict.weatherSource === 'open-meteo-live'
                    ? 'Open-Meteo Live'
                    : selectedDistrict.weatherSource === 'simulated-scenario'
                      ? 'Stress Override'
                      : 'Synthetic Fallback'}
                </span>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 py-3 border-y border-[#352F17]">
                <div>
                  <dt className="text-[11px] text-[#968D6D]">Rainfall</dt>
                  <dd className="font-mono tabular-nums text-sm font-semibold text-[#FACC15] mt-0.5">
                    {selectedDistrict.inputs.rainfall.toFixed(1)} mm/hr
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#968D6D]">Temp / Humidity</dt>
                  <dd className="font-mono tabular-nums text-sm font-semibold text-[#FBF7E8] mt-0.5">
                    {selectedDistrict.temperatureC}°C · {selectedDistrict.humidityPct}%
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#968D6D]">Elevation</dt>
                  <dd className="font-mono tabular-nums text-sm font-semibold text-[#FBF7E8] mt-0.5">
                    {selectedDistrict.elevationMeters} m
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#968D6D]">Terrain Slope</dt>
                  <dd className="font-mono tabular-nums text-sm font-semibold text-[#E8DFC0] mt-0.5">
                    {selectedDistrict.inputs.slope.toFixed(1)}°
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#968D6D]">Soil Saturation</dt>
                  <dd className="font-mono tabular-nums text-sm font-semibold text-[#C4B5FD] mt-0.5">
                    {selectedDistrict.inputs.soil_saturation.toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#968D6D]">Drainage Risk</dt>
                  <dd className="font-mono tabular-nums text-sm font-semibold text-[#C4B5FD] mt-0.5">
                    {selectedDistrict.inputs.drainage_risk.toFixed(2)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Factor Contribution Breakdown */}
            <div>
              <h4 className="text-xs font-semibold text-[#C8BE9C] mb-3">
                Estimated Flood-Risk Driver Breakdown
              </h4>
              <div className="space-y-3">
                {selectedDistrict.contributions.map((driver) => (
                  <div key={driver.key}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium text-[#E8DFC0]">{driver.factor}</span>
                      <span className="font-mono tabular-nums text-[#FACC15]">
                        {driver.weightPercent}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#352F17] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#FACC15] transition-all duration-200"
                        style={{ width: `${Math.max(4, driver.weightPercent)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-[#968D6D] mt-1">{driver.summary}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive District Actions */}
            <div className="pt-3 border-t border-[#352F17] flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => onLoadDistrictIntoSimulator(selectedDistrict)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-md bg-[#FACC15] text-[#161307] hover:bg-[#FDE047] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Load {selectedDistrict.name} into Simulator</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleDistrictMitigation(selectedDistrict.id)}
                className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                  isDistMitigated
                    ? 'border-[#C4B5FD] bg-[#C4B5FD]/15 text-[#C4B5FD]'
                    : 'border-[#524824] bg-[#282310] text-[#E8DFC0] hover:border-[#C4B5FD]/60'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>{isDistMitigated ? 'Undo Relief' : 'Test Pump Relief'}</span>
              </button>
            </div>
          </div>
        </section>
      ) : (
        /* 2D 5x5 Interactive Flood-Risk Heatmap Mode */
        <section
          aria-labelledby="heatmap-heading"
          className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
        >
          <div className="xl:col-span-7 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#352F17]">
              <div>
                <h2 id="heatmap-heading" className="font-display text-lg font-semibold text-[#FBF7E8]">
                  Interactive 5×5 Flood-Risk Heatmap
                </h2>
                <p className="text-xs text-[#968D6D] mt-1">
                  Select any sector cell to inspect its simulated inputs and risk drivers
                </p>
              </div>

              {hasAnyCellMitigation && (
                <button
                  type="button"
                  onClick={onResetAllCellOverrides}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C4B5FD] hover:text-[#FBF7E8] cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear local cell edits</span>
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div
                role="group"
                aria-label="Filter heatmap by risk level"
                className="inline-flex items-center gap-1 p-1 rounded-md bg-[#161307] border border-[#352F17]"
              >
                {(['All', 'Very High', 'High', 'Moderate', 'Low'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setRiskFilter(tier)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      riskFilter === tier
                        ? 'bg-[#2B2510] text-[#FACC15]'
                        : 'text-[#968D6D] hover:text-[#FBF7E8]'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-[#C8BE9C]">
                <span className="text-[#86EFAC]">● Low &lt;30%</span>
                <span className="text-[#FDE047]">◆ Mod 30–54%</span>
                <span className="text-[#FDBA74]">▲ High 55–74%</span>
                <span className="text-[#FCA5A5]">✖ Very High ≥75%</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-[76px_1fr] gap-2 items-center">
              <div className="text-[10px] font-mono text-[#857D5E] text-right pr-2">N ↑ / S ↓</div>
              <div className="grid grid-cols-5 gap-2 text-center">
                {COL_LABELS.map((col) => (
                  <div key={col} className="text-[10px] font-mono text-[#968D6D] truncate">
                    {col}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-2 space-y-2">
              {[0, 1, 2, 3, 4].map((rowIndex) => {
                const rowCells = gridCells.filter((c) => c.row === rowIndex);
                return (
                  <div key={rowIndex} className="grid grid-cols-[76px_1fr] gap-2 items-stretch">
                    <div className="flex items-center justify-end pr-2 text-[10px] font-mono text-[#968D6D] text-right leading-tight">
                      {ROW_LABELS[rowIndex]}
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {rowCells.map((cell) => {
                        const visual = RISK_VISUALS[cell.riskCategory];
                        const isSelected = cell.id === selectedCell.id;
                        const dimmed = riskFilter !== 'All' && cell.riskCategory !== riskFilter;
                        const localMitigated = Boolean(mitigatedCells[cell.id]);
                        const isVeryHighPulse = cell.riskCategory === 'Very High' && !dimmed;

                        return (
                          <button
                            key={cell.id}
                            type="button"
                            onClick={() => onSelectCell(cell.id)}
                            aria-pressed={isSelected}
                            className={`group relative rounded-md border p-2.5 text-left transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#C4B5FD] focus-visible:outline-offset-2 ${
                              visual.cellBg
                            } ${visual.cellBorder} ${
                              isVeryHighPulse ? 'rg-cell-very-high-pulse' : ''
                            } ${
                              isSelected
                                ? 'ring-2 ring-[#FACC15] ring-offset-2 ring-offset-[#1F1B0B] z-10'
                                : ''
                            } ${dimmed ? 'opacity-25' : 'opacity-100'}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-[11px] font-semibold text-[#FBF7E8]">
                                {cell.id}
                              </span>
                              <span className={`text-[10px] font-mono ${visual.textClass}`}>
                                {visual.symbol}
                              </span>
                            </div>

                            <div
                              className={`mt-1.5 font-mono tabular-nums text-base sm:text-lg font-bold ${visual.cellText}`}
                            >
                              {Math.round(cell.riskProbability * 100)}%
                            </div>

                            <div className="mt-1 text-[10px] text-[#E8DFC0]/85 truncate">
                              {cell.name}
                            </div>

                            <div className="mt-1 flex items-center justify-between text-[9px] font-mono text-[#E8DFC0]/70">
                              <span>{visual.shortCode}</span>
                              {localMitigated && <span className="text-[#C4B5FD]">MIT</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="xl:col-span-5 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#352F17]">
              <div>
                <div className="text-xs font-mono text-[#C4B5FD]">
                  Sector {selectedCell.id} · {selectedCell.zone}
                </div>
                <h3 className="font-display text-xl font-bold text-[#FBF7E8] mt-1">
                  {selectedCell.name}
                </h3>
                <p className="text-xs text-[#968D6D] mt-1">
                  {selectedCell.populationEstimate} · {selectedCell.infrastructureNote}
                </p>
              </div>

              <div className="text-right shrink-0">
                <div className="font-mono tabular-nums text-3xl font-bold text-[#FBF7E8]">
                  {formatPct(selectedCell.riskProbability)}
                </div>
                <div className={`text-xs font-semibold mt-0.5 ${selectedCellVisual.textClass}`}>
                  {selectedCellVisual.symbol} {selectedCell.riskCategory} Risk
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-[#C8BE9C] mb-3">Simulated Sector Inputs</h4>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 py-3 border-y border-[#352F17]">
                <div>
                  <dt className="text-[11px] text-[#968D6D]">Rainfall</dt>
                  <dd className="font-mono tabular-nums text-sm font-semibold text-[#FACC15] mt-0.5">
                    {selectedCell.inputs.rainfall.toFixed(1)} mm/hr
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#968D6D]">Terrain Slope</dt>
                  <dd className="font-mono tabular-nums text-sm font-semibold text-[#FBF7E8] mt-0.5">
                    {selectedCell.inputs.slope.toFixed(1)}°
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#968D6D]">Soil Saturation</dt>
                  <dd className="font-mono tabular-nums text-sm font-semibold text-[#C4B5FD] mt-0.5">
                    {selectedCell.inputs.soil_saturation.toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#968D6D]">Drainage Risk</dt>
                  <dd className="font-mono tabular-nums text-sm font-semibold text-[#C4B5FD] mt-0.5">
                    {selectedCell.inputs.drainage_risk.toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#968D6D]">Relative Elevation</dt>
                  <dd className="font-mono tabular-nums text-sm font-semibold text-[#FBF7E8] mt-0.5">
                    {selectedCell.inputs.elevation.toFixed(0)} / 100
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#968D6D]">Local Status</dt>
                  <dd className="font-mono text-sm font-semibold text-[#E8DFC0] mt-0.5">
                    {isCellMitigated ? 'Drainage Mitigated' : 'Scenario Default'}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-[#C8BE9C] mb-3">
                Relative Risk Contribution Breakdown
              </h4>
              <div className="space-y-3">
                {selectedCell.contributions.map((driver) => (
                  <div key={driver.key}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium text-[#E8DFC0]">{driver.factor}</span>
                      <span className="font-mono tabular-nums text-[#FACC15]">
                        {driver.weightPercent}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#352F17] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#FACC15] transition-all duration-200"
                        style={{ width: `${Math.max(4, driver.weightPercent)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-[#968D6D] mt-1">{driver.summary}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-[#352F17] flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => onLoadCellIntoSimulator(selectedCell)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-md bg-[#FACC15] text-[#161307] hover:bg-[#FDE047] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Load Sector into Simulator</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleCellMitigation(selectedCell.id)}
                className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                  isCellMitigated
                    ? 'border-[#C4B5FD] bg-[#C4B5FD]/15 text-[#C4B5FD]'
                    : 'border-[#524824] bg-[#282310] text-[#E8DFC0] hover:border-[#C4B5FD]/60'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>{isCellMitigated ? 'Undo Mitigation' : 'Test Pump Relief'}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Embedded 24-Hour Live Trends Chart inside Overview Dashboard */}
      <LiveTrendsChart
        mode="dashboard"
        districts={districts}
        liveBaselineDistricts={liveBaselineDistricts}
        selectedDistrict={selectedDistrict}
        simulatorInputs={globalInputs}
        isSimulatedActive={isSimulatedOn3D || hasAnyDistMitigation}
        weatherSourceLabel={weatherSourceCaption}
      />
    </div>
  );
}
