import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ControlSidebar } from './components/ControlSidebar';
import { FloodSimulator } from './components/FloodSimulator';
import { MonteCarloPanel } from './components/MonteCarloPanel';
import { OverviewDashboard } from './components/OverviewDashboard';
import { RainfallForecast } from './components/RainfallForecast';
import { ResponderPanel } from './components/ResponderPanel';
import { TopBar } from './components/TopBar';
import { INITIAL_READINESS_CHECKLIST, SCENARIO_PRESETS } from './data/presets';
import {
  buildDemoPrediction,
  clamp,
  evaluateFloodRisk,
  generateBasinGrid,
  generateRainfallForecast,
  runMonteCarloSimulation,
} from './engine/floodModel';
import { DEFAULT_FASTAPI_URL, predictFloodRisk } from './services/mlApi';
import {
  buildSimulatedTamilNaduDistricts,
  fetchLiveTamilNaduDataset,
} from './services/openMeteoApi';
import {
  BackendConfig,
  ChecklistItem,
  DashboardSection,
  DataSourceMode,
  FloodInputs,
  GridCellData,
  LiveFeedStatus,
  MonteCarloConfig,
  OverviewMapMode,
  PredictionResult,
  StormPattern,
  TamilNaduDistrictData,
} from './types/flood';

const DEFAULT_PRESET = SCENARIO_PRESETS[0];

const DEFAULT_MONTE_CARLO_CONFIG: MonteCarloConfig = {
  iterations: 2500,
  rainfallUncertaintyPct: 20,
  terrainUncertaintyPct: 15,
  drainageUncertaintyPct: 15,
  highRiskThreshold: 0.65,
};

export default function App() {
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Overview Map Mode (default: 3D Tamil Nadu Map with 2D 5x5 Grid toggle)
  const [overviewMapMode, setOverviewMapMode] = useState<OverviewMapMode>('tamilnadu-3d');
  const [dataSourceMode, setDataSourceMode] = useState<DataSourceMode>('live');

  // Core reactive hydrological parameters (for simulator, presets & stress overrides)
  const [inputs, setInputs] = useState<FloodInputs>(DEFAULT_PRESET.inputs);
  const [activePresetId, setActivePresetId] = useState<string | null>(DEFAULT_PRESET.id);
  const [loadedSectorLabel, setLoadedSectorLabel] = useState<string | null>(null);

  // 16 Tamil Nadu Districts Live Open-Meteo State
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>('chennai');
  const [simulationScope, setSimulationScope] = useState<'statewide' | 'selected'>('statewide');
  const [hasSimulatorOverride, setHasSimulatorOverride] = useState<boolean>(false);
  const [mitigatedDistricts, setMitigatedDistricts] = useState<Record<string, boolean>>({});
  const [liveDistrictsRaw, setLiveDistrictsRaw] = useState<TamilNaduDistrictData[]>(() =>
    buildSimulatedTamilNaduDistricts(DEFAULT_PRESET.inputs, 'synthetic-fallback')
  );
  const [liveFeedStatus, setLiveFeedStatus] = useState<LiveFeedStatus>({
    loading: true,
    source: 'synthetic-fallback',
    lastSyncedAt: null,
    errorNote: null,
  });

  // 5x5 Heatmap state
  const [selectedCellId, setSelectedCellId] = useState<string>('C3');
  const [mitigatedCells, setMitigatedCells] = useState<Record<string, boolean>>({});

  // Rainfall Forecast state
  const [forecastHorizon, setForecastHorizon] = useState<number>(24);
  const [stormPattern, setStormPattern] = useState<StormPattern>(DEFAULT_PRESET.stormPattern);

  // Monte Carlo state
  const [mcConfig, setMcConfig] = useState<MonteCarloConfig>(DEFAULT_MONTE_CARLO_CONFIG);
  const [mcSeed, setMcSeed] = useState<number>(202604);

  // FastAPI ML integration state
  const [backendConfig, setBackendConfig] = useState<BackendConfig>({
    mode: 'demo',
    endpointUrl: DEFAULT_FASTAPI_URL,
  });
  const [prediction, setPrediction] = useState<PredictionResult>(() =>
    buildDemoPrediction(DEFAULT_PRESET.inputs)
  );
  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  const requestSeqRef = useRef<number>(0);

  // Responder Checklist state
  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_READINESS_CHECKLIST);

  // Fetch live Open-Meteo dataset across all 16 Tamil Nadu districts
  const refreshLiveDataset = useCallback(async (fallbackInputs: FloodInputs) => {
    setLiveFeedStatus((prev) => ({ ...prev, loading: true }));
    const res = await fetchLiveTamilNaduDataset(fallbackInputs);
    setLiveDistrictsRaw(res.districts);
    setLiveFeedStatus({
      loading: false,
      source: res.source,
      lastSyncedAt: res.syncedAtIso,
      errorNote: res.errorNote,
    });
  }, []);

  useEffect(() => {
    void refreshLiveDataset(DEFAULT_PRESET.inputs);
  }, [refreshLiveDataset]);

  // Active 16 Tamil Nadu Districts:
  // Reflects Simulator / Sidebar slider changes LIVE on the 3D map (either for the selected
  // district or statewide), while preserving untouched Live Open-Meteo when no override is active.
  const activeDistricts = useMemo<TamilNaduDistrictData[]>(() => {
    const isSimulatedActive = dataSourceMode === 'simulated' || hasSimulatorOverride;

    let baseList: TamilNaduDistrictData[];

    if (!isSimulatedActive) {
      baseList = liveDistrictsRaw;
    } else if (simulationScope === 'selected') {
      // Apply exact simulator inputs to the selected district; keep other 15 at live weather
      baseList = liveDistrictsRaw.map((dist) => {
        if (dist.id !== selectedDistrictId) return dist;
        const evaluated = evaluateFloodRisk(inputs);
        return {
          ...dist,
          weatherSource: 'simulated-scenario',
          observedRainfallMm: inputs.rainfall,
          inputs: { ...inputs },
          riskProbability: evaluated.probability,
          riskCategory: evaluated.category,
          contributions: evaluated.contributions,
        };
      });
    } else {
      // Statewide reactive simulation: all 16 districts respond dynamically to simulator inputs,
      // and the selected district matches the exact simulator sliders 1:1 while keeping live Open-Meteo telemetry series
      const rawById = new Map(liveDistrictsRaw.map((d) => [d.id, d]));
      const statewideSimulated = buildSimulatedTamilNaduDistricts(inputs, 'simulated-scenario');
      baseList = statewideSimulated.map((dist) => {
        const raw = rawById.get(dist.id);
        const preservedMeta = raw
          ? {
              temperatureC: raw.temperatureC,
              humidityPct: raw.humidityPct,
              hourlySeries: raw.hourlySeries,
            }
          : {};

        if (dist.id !== selectedDistrictId) {
          return { ...dist, ...preservedMeta };
        }
        const evaluated = evaluateFloodRisk(inputs);
        return {
          ...dist,
          ...preservedMeta,
          weatherSource: 'simulated-scenario',
          observedRainfallMm: inputs.rainfall,
          inputs: { ...inputs },
          riskProbability: evaluated.probability,
          riskCategory: evaluated.category,
          contributions: evaluated.contributions,
        };
      });
    }

    const hasMitigation = Object.values(mitigatedDistricts).some(Boolean);
    if (!hasMitigation) return baseList;

    return baseList.map((dist) => {
      if (!mitigatedDistricts[dist.id]) return dist;
      const reducedDrain = Number(clamp(dist.inputs.drainage_risk - 0.28, 0.05, 0.99).toFixed(2));
      const nextInputs: FloodInputs = { ...dist.inputs, drainage_risk: reducedDrain };
      const evaluated = evaluateFloodRisk(nextInputs);
      return {
        ...dist,
        inputs: nextInputs,
        riskProbability: evaluated.probability,
        riskCategory: evaluated.category,
        contributions: evaluated.contributions,
      };
    });
  }, [
    dataSourceMode,
    hasSimulatorOverride,
    simulationScope,
    liveDistrictsRaw,
    inputs,
    selectedDistrictId,
    mitigatedDistricts,
  ]);

  // Execute prediction (Demo Engine instantly, or debounced POST /predict in FastAPI mode)
  const runPrediction = useCallback(
    async (targetInputs: FloodInputs, targetConfig: BackendConfig) => {
      const seq = ++requestSeqRef.current;
      if (targetConfig.mode === 'demo') {
        setPrediction(buildDemoPrediction(targetInputs));
        setIsPredicting(false);
        return;
      }

      setIsPredicting(true);
      const result = await predictFloodRisk(targetInputs, targetConfig);
      if (seq === requestSeqRef.current) {
        setPrediction(result);
        setIsPredicting(false);
      }
    },
    []
  );

  useEffect(() => {
    if (backendConfig.mode === 'demo') {
      setPrediction(buildDemoPrediction(inputs));
      setIsPredicting(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void runPrediction(inputs, backendConfig);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [inputs, backendConfig, runPrediction]);

  // Derived 5x5 grid with optional per-cell pump relief mitigation test
  const gridCells = useMemo(() => {
    const baseGrid = generateBasinGrid(inputs);
    const overrides: Record<string, Partial<FloodInputs>> = {};
    for (const cell of baseGrid) {
      if (mitigatedCells[cell.id]) {
        overrides[cell.id] = {
          drainage_risk: Number(clamp(cell.inputs.drainage_risk - 0.28, 0.05, 0.99).toFixed(2)),
        };
      }
    }
    return Object.keys(overrides).length > 0 ? generateBasinGrid(inputs, overrides) : baseGrid;
  }, [inputs, mitigatedCells]);

  // Derived experimental rainfall forecast series
  const forecastPoints = useMemo(
    () => generateRainfallForecast(inputs, forecastHorizon, stormPattern),
    [inputs, forecastHorizon, stormPattern]
  );

  // Derived Monte Carlo simulation (1,000+ scenarios)
  const monteCarloResult = useMemo(
    () => runMonteCarloSimulation(inputs, mcConfig, mcSeed),
    [inputs, mcConfig, mcSeed]
  );

  // Handlers
  const handleManualInputChange = (next: FloodInputs) => {
    setInputs(next);
    setActivePresetId(null);
    setLoadedSectorLabel(null);
    setHasSimulatorOverride(true);
  };

  const handleChangeDataSourceMode = (mode: DataSourceMode) => {
    setDataSourceMode(mode);
    setHasSimulatorOverride(mode === 'simulated');
  };

  const handleRevertToLiveWeather = () => {
    setDataSourceMode('live');
    setHasSimulatorOverride(false);
    setMitigatedDistricts({});
    setActivePresetId(null);
    setLoadedSectorLabel(null);
    const liveSelected = liveDistrictsRaw.find((d) => d.id === selectedDistrictId);
    if (liveSelected) {
      setInputs(liveSelected.inputs);
    }
  };

  const handleApplyPreset = (presetId: string) => {
    const found = SCENARIO_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setInputs(found.inputs);
    setStormPattern(found.stormPattern);
    setActivePresetId(found.id);
    setLoadedSectorLabel(null);
    setDataSourceMode('simulated');
    setHasSimulatorOverride(true);
    setMitigatedCells({});
    setMitigatedDistricts({});
    setMobileSidebarOpen(false);
  };

  const handleResetDefaults = () => {
    setInputs(DEFAULT_PRESET.inputs);
    setActivePresetId(DEFAULT_PRESET.id);
    setStormPattern(DEFAULT_PRESET.stormPattern);
    setForecastHorizon(24);
    setDataSourceMode('live');
    setHasSimulatorOverride(false);
    setSimulationScope('statewide');
    setMitigatedCells({});
    setMitigatedDistricts({});
    setLoadedSectorLabel(null);
    setMcConfig(DEFAULT_MONTE_CARLO_CONFIG);
  };

  const handleRerunMonteCarlo = () => {
    setMcSeed((prev) => ((prev * 1664525 + 1013904223) % 900000) + 100000);
  };

  const handleRerunAll = () => {
    handleRerunMonteCarlo();
    void runPrediction(inputs, backendConfig);
    if (dataSourceMode === 'live') {
      void refreshLiveDataset(inputs);
    }
  };

  const handleLoadCellIntoSimulator = (cell: GridCellData) => {
    setInputs(cell.inputs);
    setActivePresetId(null);
    setLoadedSectorLabel(`Grid ${cell.id} · ${cell.name}`);
    setHasSimulatorOverride(true);
    setActiveSection('simulator');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLoadDistrictIntoSimulator = (district: TamilNaduDistrictData) => {
    setSelectedDistrictId(district.id);
    setInputs(district.inputs);
    setActivePresetId(null);
    setLoadedSectorLabel(`Tamil Nadu · ${district.name} (${district.code})`);
    setActiveSection('simulator');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectDistrictBaselineInSimulator = (district: TamilNaduDistrictData) => {
    const liveBaseline = liveDistrictsRaw.find((d) => d.id === district.id) ?? district;
    setSelectedDistrictId(liveBaseline.id);
    setInputs(liveBaseline.inputs);
    setActivePresetId(null);
    setDataSourceMode('live');
    setHasSimulatorOverride(false);
    setLoadedSectorLabel(`Tamil Nadu · ${liveBaseline.name} (${liveBaseline.code})`);
  };

  const handleToggleCellMitigation = (cellId: string) => {
    setMitigatedCells((prev) => ({
      ...prev,
      [cellId]: !prev[cellId],
    }));
  };

  const handleToggleDistrictMitigation = (districtId: string) => {
    setMitigatedDistricts((prev) => ({
      ...prev,
      [districtId]: !prev[districtId],
    }));
  };

  const handleInspectCellOnMap = (cellId: string) => {
    setSelectedCellId(cellId);
    setOverviewMapMode('grid-2d');
    setActiveSection('overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleInspectDistrictOn3DMap = (districtId: string) => {
    setSelectedDistrictId(districtId);
    setOverviewMapMode('tamilnadu-3d');
    setActiveSection('overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleChecklistItem = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  const handleAddChecklistItem = (label: string, category: ChecklistItem['category']) => {
    setChecklist((prev) => [
      ...prev,
      {
        id: `chk-${Date.now()}`,
        label,
        category,
        completed: false,
        priority: 'Standard',
      },
    ]);
  };

  const handleResetChecklist = () => {
    setChecklist(INITIAL_READINESS_CHECKLIST);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#161307] text-[#FBF7E8]">
      <TopBar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        onRerunAll={handleRerunAll}
        isPredicting={isPredicting || liveFeedStatus.loading}
        onToggleMobileSidebar={() => setMobileSidebarOpen(true)}
      />

      <div className="flex-1 flex items-start">
        <ControlSidebar
          inputs={inputs}
          activePresetId={activePresetId}
          onChangeInputs={handleManualInputChange}
          onApplyPreset={handleApplyPreset}
          onResetDefaults={handleResetDefaults}
          dataSourceMode={dataSourceMode}
          onChangeDataSourceMode={handleChangeDataSourceMode}
          liveFeedStatus={liveFeedStatus}
          onRefreshLiveFeed={() => void refreshLiveDataset(inputs)}
          backendConfig={backendConfig}
          onChangeBackendConfig={setBackendConfig}
          onTestBackend={() => void runPrediction(inputs, backendConfig)}
          isPredicting={isPredicting}
          prediction={prediction}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="max-w-[1280px] mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeSection === 'overview' && (
                  <OverviewDashboard
                    mapMode={overviewMapMode}
                    onChangeMapMode={setOverviewMapMode}
                    dataSourceMode={dataSourceMode}
                    onChangeDataSourceMode={handleChangeDataSourceMode}
                    hasSimulatorOverride={hasSimulatorOverride}
                    simulationScope={simulationScope}
                    onChangeSimulationScope={setSimulationScope}
                    onRevertToLiveWeather={handleRevertToLiveWeather}
                    liveFeedStatus={liveFeedStatus}
                    onRefreshLiveFeed={() => void refreshLiveDataset(inputs)}
                    districts={activeDistricts}
                    liveBaselineDistricts={liveDistrictsRaw}
                    selectedDistrictId={selectedDistrictId}
                    onSelectDistrict={setSelectedDistrictId}
                    onLoadDistrictIntoSimulator={handleLoadDistrictIntoSimulator}
                    onToggleDistrictMitigation={handleToggleDistrictMitigation}
                    mitigatedDistricts={mitigatedDistricts}
                    onResetAllDistrictMitigation={() => setMitigatedDistricts({})}
                    gridCells={gridCells}
                    selectedCellId={selectedCellId}
                    onSelectCell={setSelectedCellId}
                    onLoadCellIntoSimulator={handleLoadCellIntoSimulator}
                    onToggleCellMitigation={handleToggleCellMitigation}
                    mitigatedCells={mitigatedCells}
                    onResetAllCellOverrides={() => setMitigatedCells({})}
                    forecastPoints={forecastPoints}
                    forecastHorizon={forecastHorizon}
                    globalInputs={inputs}
                    onNavigate={setActiveSection}
                  />
                )}

                {activeSection === 'forecast' && (
                  <RainfallForecast
                    forecastPoints={forecastPoints}
                    horizonHours={forecastHorizon}
                    onChangeHorizon={setForecastHorizon}
                    stormPattern={stormPattern}
                    onChangeStormPattern={setStormPattern}
                  />
                )}

                {activeSection === 'simulator' && (
                  <FloodSimulator
                    inputs={inputs}
                    onChangeInputs={handleManualInputChange}
                    prediction={prediction}
                    isPredicting={isPredicting}
                    backendConfig={backendConfig}
                    onChangeBackendConfig={setBackendConfig}
                    onTriggerPredict={() => void runPrediction(inputs, backendConfig)}
                    monteCarlo={monteCarloResult}
                    onRerunMonteCarlo={handleRerunMonteCarlo}
                    loadedSectorLabel={loadedSectorLabel}
                    districts={activeDistricts}
                    liveBaselineDistricts={liveDistrictsRaw}
                    selectedDistrictId={selectedDistrictId}
                    onSelectDistrict={setSelectedDistrictId}
                    onSelectDistrictBaseline={handleSelectDistrictBaselineInSimulator}
                    dataSourceMode={dataSourceMode}
                    hasSimulatorOverride={hasSimulatorOverride}
                    simulationScope={simulationScope}
                    onChangeSimulationScope={setSimulationScope}
                    onRevertToLiveWeather={handleRevertToLiveWeather}
                    liveFeedStatus={liveFeedStatus}
                  />
                )}

                {activeSection === 'montecarlo' && (
                  <MonteCarloPanel
                    inputs={inputs}
                    config={mcConfig}
                    onChangeConfig={setMcConfig}
                    result={monteCarloResult}
                    onRerun={handleRerunMonteCarlo}
                  />
                )}

                {activeSection === 'responder' && (
                  <ResponderPanel
                    mapMode={overviewMapMode}
                    districts={activeDistricts}
                    gridCells={gridCells}
                    inputs={inputs}
                    monteCarlo={monteCarloResult}
                    checklist={checklist}
                    onToggleChecklistItem={handleToggleChecklistItem}
                    onAddChecklistItem={handleAddChecklistItem}
                    onResetChecklist={handleResetChecklist}
                    onInspectCellOnMap={handleInspectCellOnMap}
                    onInspectDistrictOn3DMap={handleInspectDistrictOn3DMap}
                    onLoadCellIntoSimulator={handleLoadCellIntoSimulator}
                    onLoadDistrictIntoSimulator={handleLoadDistrictIntoSimulator}
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {/* Quiet Honest Prototype Footer */}
            <footer className="mt-12 pt-6 border-t border-[#352F17] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#968D6D]">
              <p>
                RainGuard AI · Smart India Hackathon 2026 Prototype · Tamil Nadu weather via
                Open-Meteo with synthetic fallback.
              </p>
              <p>
                Prototype flood-risk model only · Not connected to live IMD, MOSDAC, NWP, AWS,
                ESP32, or satellite feeds · Does not issue official evacuation orders.
              </p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
