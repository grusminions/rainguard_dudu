import {
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  Crosshair,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CAMERA_PRESETS,
  CameraPresetId,
  TamilNadu3DController,
} from '../three/tamilNaduScene';
import { TamilNaduDistrictData } from '../types/flood';
import { formatPct, RISK_VISUALS } from '../utils/riskStyles';

interface TamilNadu3DMapProps {
  districts: TamilNaduDistrictData[];
  selectedDistrictId: string;
  onSelectDistrict: (id: string) => void;
  heightClass?: string;
  isSimulatedOverlay?: boolean;
}

export function TamilNadu3DMap({
  districts,
  selectedDistrictId,
  onSelectDistrict,
  heightClass = 'h-[520px]',
  isSimulatedOverlay = false,
}: TamilNadu3DMapProps) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<TamilNadu3DController | null>(null);
  const onSelectRef = useRef(onSelectDistrict);
  onSelectRef.current = onSelectDistrict;

  const [hoveredDistrictId, setHoveredDistrictId] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<CameraPresetId>('statewide');
  const [showRain, setShowRain] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [expandedView, setExpandedView] = useState<boolean>(false);
  const [webglError, setWebglError] = useState<boolean>(false);

  // Mount Three.js WebGL scene once inside stable ref container
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    try {
      const controller = new TamilNadu3DController(
        mountEl,
        districts,
        selectedDistrictId,
        {
          onSelectDistrict: (id) => onSelectRef.current(id),
          onHoverDistrict: (id) => setHoveredDistrictId(id),
        }
      );
      controllerRef.current = controller;
      setWebglError(false);

      return () => {
        controller.dispose();
        controllerRef.current = null;
      };
    } catch {
      setWebglError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push live district data & selection updates into the running WebGL scene without teardown
  useEffect(() => {
    controllerRef.current?.updateDistricts(districts, selectedDistrictId);
  }, [districts, selectedDistrictId]);

  useEffect(() => {
    controllerRef.current?.setShowRainOverlay(showRain);
  }, [showRain]);

  const activeDisplayDistrict = useMemo(() => {
    const targetId = hoveredDistrictId ?? selectedDistrictId;
    return districts.find((d) => d.id === targetId) ?? districts[0];
  }, [districts, hoveredDistrictId, selectedDistrictId]);

  const handlePresetClick = (presetId: CameraPresetId) => {
    setActivePreset(presetId);
    controllerRef.current?.flyToPreset(presetId);
  };

  const handleFocusSelected = () => {
    controllerRef.current?.focusDistrict(selectedDistrictId);
  };

  const activeVis = activeDisplayDistrict
    ? RISK_VISUALS[activeDisplayDistrict.riskCategory]
    : RISK_VISUALS.Low;

  return (
    <div
      className={`relative w-full rounded-lg border border-[#3C351A] bg-[#161307] overflow-hidden transition-[height] duration-200 ${
        expandedView ? 'h-[680px]' : heightClass
      }`}
    >
      {/* Stable Isolated WebGL Mount Container */}
      <div
        ref={canvasMountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        aria-label="Interactive 3D topographic flood-risk map of Tamil Nadu"
      />

      {/* Graceful Fallback if WebGL Unavailable */}
      {webglError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#161307]">
          <p className="font-display text-base font-semibold text-[#FACC15]">
            3D WebGL Context Unavailable
          </p>
          <p className="text-xs text-[#C8BE9C] mt-2 max-w-md">
            Switch to the 2D Grid view or select any of the 16 Tamil Nadu districts below to inspect
            live telemetry.
          </p>
        </div>
      )}

      {/* Compact Top-Left Spec Readout (solid rgba surface, ZERO backdrop-filter over WebGL) */}
      {activeDisplayDistrict && !webglError && (
        <div
          className="pointer-events-none absolute top-3.5 left-3.5 z-10 px-3.5 py-2.5 rounded-md border border-[#3C351A] max-w-[300px]"
          style={{ backgroundColor: 'rgba(22, 19, 7, 0.90)' }}
        >
          <div className="flex items-center justify-between gap-3 text-[11px] font-mono text-[#C4B5FD]">
            <span>
              {hoveredDistrictId ? 'Hovering' : 'Selected'} · {activeDisplayDistrict.code}
            </span>
            <span className="tabular-nums text-[#968D6D]">
              {isSimulatedOverlay || activeDisplayDistrict.weatherSource === 'simulated-scenario'
                ? 'Simulated Live'
                : 'Open-Meteo Live'}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="font-display text-sm font-bold text-[#FBF7E8] truncate">
              {activeDisplayDistrict.name}
            </span>
            <span className={`font-mono tabular-nums text-xs font-semibold ${activeVis.textClass}`}>
              {activeVis.symbol} {formatPct(activeDisplayDistrict.riskProbability)}
            </span>
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-[#C8BE9C]">
            Rain {activeDisplayDistrict.inputs.rainfall.toFixed(1)} mm/h · Soil{' '}
            {activeDisplayDistrict.inputs.soil_saturation.toFixed(2)} · Drain{' '}
            {activeDisplayDistrict.inputs.drainage_risk.toFixed(2)}
          </div>
        </div>
      )}

      {/* Compact Non-Hue-Only Risk Scale Legend (Top-Right, unobtrusive single strip) */}
      {!webglError && (
        <div
          className="pointer-events-none hidden sm:flex absolute top-3.5 right-3.5 z-10 items-center gap-3 px-3 py-1.5 rounded-md border border-[#3C351A] text-[10px] font-mono"
          style={{ backgroundColor: 'rgba(22, 19, 7, 0.88)' }}
        >
          <span className="text-[#86EFAC]">● Low</span>
          <span className="text-[#FDE047]">◆ Mod</span>
          <span className="text-[#FDBA74]">▲ High</span>
          <span className="text-[#FCA5A5]">✖ Very High</span>
        </div>
      )}

      {/* Unified Collapsible Bottom Control Dock (Zero Viewport Occlusion, No backdrop-filter) */}
      {!webglError && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center max-w-[95%]">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono text-[#C8BE9C] hover:text-[#FACC15] rounded-t-md border border-b-0 border-[#3C351A] cursor-pointer transition-colors"
            style={{ backgroundColor: 'rgba(22, 19, 7, 0.92)' }}
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>Show 3D Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>Hide Controls</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div
              className="flex flex-wrap items-center justify-center gap-1.5 px-2.5 py-2 rounded-md border border-[#3C351A]"
              style={{ backgroundColor: 'rgba(22, 19, 7, 0.93)' }}
            >
              {/* Camera Presets */}
              <div className="inline-flex items-center gap-1 pr-2 border-r border-[#352F17]">
                <Compass className="w-3.5 h-3.5 text-[#968D6D] mr-0.5 hidden sm:block" />
                {CAMERA_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetClick(preset.id)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      activePreset === preset.id
                        ? 'bg-[#FACC15] text-[#161307] font-semibold'
                        : 'text-[#C8BE9C] hover:text-[#FBF7E8] hover:bg-[#282310]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Focus Selected District */}
              <button
                type="button"
                onClick={handleFocusSelected}
                title="Focus camera on selected district"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded text-[#C4B5FD] hover:bg-[#282310] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Focus</span>
              </button>

              {/* Rain Particle Overlay Toggle */}
              <button
                type="button"
                onClick={() => setShowRain((r) => !r)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  showRain
                    ? 'bg-[#2B2510] text-[#C4B5FD] border border-[#C4B5FD]/40'
                    : 'text-[#968D6D] hover:text-[#FBF7E8]'
                }`}
              >
                <CloudRain className="w-3.5 h-3.5" />
                <span>Rain FX</span>
              </button>

              {/* Expand Viewport Height Toggle */}
              <button
                type="button"
                onClick={() => setExpandedView((e) => !e)}
                title={expandedView ? 'Compact height' : 'Expand 3D viewport'}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-[#C8BE9C] hover:text-[#FACC15] hover:bg-[#282310] transition-colors cursor-pointer whitespace-nowrap"
              >
                {expandedView ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
