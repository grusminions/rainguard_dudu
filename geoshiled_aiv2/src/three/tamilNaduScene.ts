import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  getTamilNaduTerrainHeight,
  projectLonLatToWorld,
  TAMIL_NADU_OUTLINE_LONLAT,
  TAMIL_NADU_RIVERS,
} from '../data/tamilNaduDistricts';
import { RiskCategory, TamilNaduDistrictData } from '../types/flood';

export type CameraPresetId = 'statewide' | 'chennai' | 'delta' | 'ghats' | 'south';

export interface CameraPresetSpec {
  id: CameraPresetId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_PRESETS: CameraPresetSpec[] = [
  {
    id: 'statewide',
    label: 'Statewide',
    position: [0.6, 11.2, 11.8],
    target: [0.0, 0.4, 0.1],
  },
  {
    id: 'chennai',
    label: 'Chennai Coast',
    position: [6.8, 4.9, -1.6],
    target: [3.8, 0.4, -5.2],
  },
  {
    id: 'delta',
    label: 'Cauvery Delta',
    position: [5.2, 4.8, 4.4],
    target: [2.2, 0.35, 0.0],
  },
  {
    id: 'ghats',
    label: 'Western Ghats',
    position: [-7.2, 5.4, 2.8],
    target: [-3.4, 0.65, -0.8],
  },
  {
    id: 'south',
    label: 'South Basin',
    position: [2.4, 5.2, 10.6],
    target: [-1.4, 0.35, 5.4],
  },
];

const RISK_HEX_MAP: Record<RiskCategory, number> = {
  Low: 0x4ade80,
  Moderate: 0xfacc15,
  High: 0xfb923c,
  'Very High': 0xf87171,
};

// Reusable scratch objects to prevent per-frame GC allocations
const _scratchVec3 = new THREE.Vector3();
const _scratchTarget = new THREE.Vector3();
const _scratchDummy = new THREE.Object3D();
const _scratchColor = new THREE.Color();

export function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createOceanGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#141106';
  ctx.fillRect(0, 0, size, size);

  // Subtle bathymetric grain & latitude/longitude graticules
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.075)';
  ctx.lineWidth = 1;
  const step = 64;
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Finer secondary subdivisions
  ctx.strokeStyle = 'rgba(196, 181, 253, 0.035)';
  for (let i = 32; i < size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Subtle tick crosshairs at grid intersections
  ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
  for (let x = 0; x <= size; x += step) {
    for (let y = 0; y <= size; y += step) {
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createTerrainSurfaceTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Warm dark-bronze / ochre cartographic relief gradient (west highlands -> east coastal plains)
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#493D1B');
  grad.addColorStop(0.45, '#352D14');
  grad.addColorStop(1, '#26210E');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Topographic contour rings (procedural organic isolines)
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.14)';
  ctx.lineWidth = 1.25;
  for (let r = 28; r < size * 0.9; r += 26) {
    ctx.beginPath();
    ctx.ellipse(size * 0.28, size * 0.44, r * 0.72, r * 1.15, -0.22, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Subtle surface micro-grain for physical matte mineral texture
  for (let i = 0; i < 1800; i++) {
    const gx = (i * 73) % size;
    const gy = (i * 197 + Math.floor(i / 7) * 19) % size;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,244,210,0.035)' : 'rgba(10,8,3,0.06)';
    ctx.fillRect(gx, gy, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.11, 0.11);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(6, 5, 2, 0.72)');
  grad.addColorStop(0.55, 'rgba(6, 5, 2, 0.28)');
  grad.addColorStop(1, 'rgba(6, 5, 2, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface DistrictTowerRig {
  districtId: string;
  root: THREE.Group;
  columnMesh: THREE.Mesh;
  columnMaterial: THREE.MeshStandardMaterial;
  crownGroup: THREE.Group;
  beaconMaterial: THREE.MeshStandardMaterial;
  selectionRing: THREE.Mesh;
  selectionRingMat: THREE.MeshBasicMaterial;
  floodAuraMesh: THREE.Mesh;
  floodAuraMat: THREE.MeshBasicMaterial;
  currentAuraScale: number;
  targetAuraScale: number;
  hitProxy: THREE.Mesh;
  currentHeight: number;
  targetHeight: number;
  baseY: number;
}

interface RainDropState {
  districtIdx: number;
  offsetX: number;
  offsetZ: number;
  y: number;
  speed: number;
}

export interface TamilNaduSceneCallbacks {
  onSelectDistrict: (districtId: string) => void;
  onHoverDistrict: (districtId: string | null) => void;
}

export class TamilNadu3DController {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private callbacks: TamilNaduSceneCallbacks;

  private towers = new Map<string, DistrictTowerRig>();
  private hitProxies: THREE.Object3D[] = [];
  private districts: TamilNaduDistrictData[] = [];
  private selectedDistrictId = 'chennai';
  private hoveredDistrictId: string | null = null;
  private showRainOverlay = true;

  // Instanced rain particles
  private rainMesh: THREE.InstancedMesh;
  private rainDrops: RainDropState[] = [];

  // Smooth camera transition state
  private cameraGoalPos: THREE.Vector3 | null = null;
  private cameraGoalTarget: THREE.Vector3 | null = null;

  // Animation / lifecycle
  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;
  private lastHoverCheckMs = 0;
  private pointerDownPos = { x: 0, y: 0 };
  private resizeObserver: ResizeObserver;
  private disposables: Array<{ dispose: () => void }> = [];

  constructor(
    container: HTMLElement,
    initialDistricts: TamilNaduDistrictData[],
    initialSelectedId: string,
    callbacks: TamilNaduSceneCallbacks
  ) {
    this.container = container;
    this.districts = initialDistricts;
    this.selectedDistrictId = initialSelectedId;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);

    // 1. Modern PBR Renderer with Software-WebGL guard
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 2. Scene, Horizon-Matched Fog & Studio RoomEnvironment
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x161307);
    this.scene.fog = new THREE.FogExp2(0x161307, 0.023);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = envRT.texture;
    this.disposables.push(envRT);
    pmremGenerator.dispose();

    // 3. Camera & Damped OrbitControls
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 140);
    const defaultPreset = CAMERA_PRESETS[0];
    this.camera.position.set(...defaultPreset.position);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...defaultPreset.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 24;
    this.controls.minPolarAngle = 0.22;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.12;
    this.controls.update();

    // Cancel any scripted camera flight immediately when user interacts
    this.controls.addEventListener('start', () => {
      this.cameraGoalPos = null;
      this.cameraGoalTarget = null;
    });

    // 4. Studio 3-Point Warm/Cool Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xd8ccff, 0x2a220d, 0.85);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffe9b8, 2.2);
    keyLight.position.set(10, 16, 8);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 42;
      keyLight.shadow.camera.left = -11;
      keyLight.shadow.camera.right = 11;
      keyLight.shadow.camera.top = 11;
      keyLight.shadow.camera.bottom = -11;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc4b5fd, 0.72);
    rimLight.position.set(-11, 8, -9);
    this.scene.add(rimLight);

    // 5. Build Ocean Shelf, Sculpted Tamil Nadu Landmass, Hills, Rivers, Towers & Rain
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.buildOceanFloor(maxAniso);
    this.buildTamilNaduLandmass(maxAniso);
    this.buildTopographicRidges();
    this.buildRiverCorridors();
    this.buildDistrictTowers(initialDistricts);
    this.rainMesh = this.buildRainParticles();

    // Restrict raycaster strictly to proxy layer 1
    this.raycaster.layers.set(1);

    // Pre-warm shaders on GPU devices
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind pointer & resize listeners
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    // Sync initial visual state & launch paced render loop
    this.updateDistricts(initialDistricts, initialSelectedId);
    this.startLoop();
  }

  private buildOceanFloor(maxAniso: number) {
    const oceanTex = createOceanGridTexture(maxAniso);
    this.disposables.push(oceanTex);

    const oceanGeo = new THREE.PlaneGeometry(86, 86);
    const oceanMat = new THREE.MeshStandardMaterial({
      map: oceanTex,
      roughness: 0.78,
      metalness: 0.16,
    });
    this.disposables.push(oceanGeo, oceanMat);

    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.rotation.x = -Math.PI / 2;
    oceanMesh.position.y = -0.02;
    oceanMesh.receiveShadow = true;
    this.scene.add(oceanMesh);

    // Subtle Bay of Bengal / Gulf shelf halo ring around Tamil Nadu
    const compassGeo = new THREE.RingGeometry(8.6, 8.66, 96);
    const compassMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.disposables.push(compassGeo, compassMat);
    const compassRing = new THREE.Mesh(compassGeo, compassMat);
    compassRing.rotation.x = -Math.PI / 2;
    compassRing.position.y = 0.005;
    this.scene.add(compassRing);
  }

  private buildTamilNaduLandmass(maxAniso: number) {
    // Construct 2D shape in (x, -z) plane because rotateX(-PI/2) maps +Y_shape -> -Z_world
    const shape = new THREE.Shape();
    TAMIL_NADU_OUTLINE_LONLAT.forEach(([lon, lat], index) => {
      const { x, z } = projectLonLatToWorld(lon, lat);
      const sy = -z;
      if (index === 0) shape.moveTo(x, sy);
      else shape.lineTo(x, sy);
    });
    shape.closePath();

    const extrudeDepth = 0.34;
    const landGeo = new THREE.ExtrudeGeometry(shape, {
      depth: extrudeDepth,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 3,
      curveSegments: 8,
    });
    landGeo.rotateX(-Math.PI / 2);

    const terrainTex = createTerrainSurfaceTexture(maxAniso);
    const topMat = new THREE.MeshStandardMaterial({
      map: terrainTex,
      roughness: 0.72,
      metalness: 0.14,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: 0x5c4b1e,
      roughness: 0.42,
      metalness: 0.52,
    });
    this.disposables.push(landGeo, terrainTex, topMat, sideMat);

    const landMesh = new THREE.Mesh(landGeo, [topMat, sideMat]);
    landMesh.position.y = 0.02;
    landMesh.castShadow = true;
    landMesh.receiveShadow = true;
    this.scene.add(landMesh);

    // Crisp luminous golden coastline border tracing top edge
    const borderPoints: THREE.Vector3[] = TAMIL_NADU_OUTLINE_LONLAT.map(([lon, lat]) => {
      const { x, z } = projectLonLatToWorld(lon, lat);
      return new THREE.Vector3(x, extrudeDepth + 0.095, z);
    });
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    const borderMat = new THREE.LineBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.72,
    });
    this.disposables.push(borderGeo, borderMat);
    const borderLoop = new THREE.LineLoop(borderGeo, borderMat);
    this.scene.add(borderLoop);
  }

  private buildTopographicRidges() {
    // Sculpted Western Ghats & Eastern Ghats highland mounds seated flush on landmass top
    const ridgeSpecs: Array<{
      lon: number;
      lat: number;
      rx: number;
      rz: number;
      height: number;
    }> = [
      { lon: 76.72, lat: 11.42, rx: 0.92, rz: 0.98, height: 0.62 }, // Nilgiris massif
      { lon: 77.12, lat: 10.30, rx: 0.72, rz: 1.08, height: 0.46 }, // Anaimalai & Palani hills
      { lon: 77.32, lat: 9.05, rx: 0.56, rz: 1.15, height: 0.36 },  // Agasthyamalai / Courtallam
      { lon: 78.22, lat: 11.80, rx: 0.66, rz: 0.62, height: 0.30 }, // Shevaroy (Yercaud)
      { lon: 78.88, lat: 12.56, rx: 0.68, rz: 0.56, height: 0.24 }, // Javadi hills
    ];

    const ridgeMat = new THREE.MeshStandardMaterial({
      color: 0x615024,
      roughness: 0.86,
      metalness: 0.06,
      flatShading: true,
    });
    this.disposables.push(ridgeMat);

    const baseGeo = new THREE.ConeGeometry(1, 1, 7, 2);
    // Shift pivot to bottom-center
    baseGeo.translate(0, 0.5, 0);
    this.disposables.push(baseGeo);

    for (const spec of ridgeSpecs) {
      const { x, z } = projectLonLatToWorld(spec.lon, spec.lat);
      const ridge = new THREE.Mesh(baseGeo, ridgeMat);
      ridge.position.set(x, 0.39, z);
      ridge.scale.set(spec.rx, spec.height, spec.rz);
      ridge.castShadow = true;
      ridge.receiveShadow = true;
      this.scene.add(ridge);
    }
  }

  private buildRiverCorridors() {
    const riverMat = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      emissive: 0x7c66c4,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.3,
    });
    this.disposables.push(riverMat);

    for (const river of TAMIL_NADU_RIVERS) {
      const pts = river.coords.map(([lon, lat]) => {
        const { x, z } = projectLonLatToWorld(lon, lat);
        const terrainLift = Math.min(0.16, getTamilNaduTerrainHeight(x, z) * 0.16);
        return new THREE.Vector3(x, 0.415 + terrainLift, z);
      });
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(curve, 36, 0.042, 6, false);
      this.disposables.push(tubeGeo);
      const mesh = new THREE.Mesh(tubeGeo, riverMat);
      this.scene.add(mesh);
    }
  }

  private buildDistrictTowers(districts: TamilNaduDistrictData[]) {
    // Shared geometries across all 16 composite 7-part district monitoring towers
    const plinthGeo = new THREE.CylinderGeometry(0.24, 0.30, 0.12, 6);
    plinthGeo.translate(0, 0.06, 0);

    const collarGeo = new THREE.TorusGeometry(0.22, 0.028, 10, 24);
    collarGeo.rotateX(Math.PI / 2);

    const coreShaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8);
    coreShaftGeo.translate(0, 0.5, 0);

    const columnGeo = new THREE.CylinderGeometry(0.135, 0.165, 1.0, 6);
    columnGeo.translate(0, 0.5, 0);

    const crownRingGeo = new THREE.TorusGeometry(0.155, 0.024, 10, 18);
    crownRingGeo.rotateX(Math.PI / 2);

    // LatheGeometry instrument finial dome cap atop each tower
    const finialProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.14, 0.0),
      new THREE.Vector2(0.12, 0.07),
      new THREE.Vector2(0.06, 0.14),
      new THREE.Vector2(0.015, 0.22),
      new THREE.Vector2(0.0, 0.24),
    ];
    const finialGeo = new THREE.LatheGeometry(finialProfile, 14);

    const selRingGeo = new THREE.RingGeometry(0.32, 0.40, 32);
    selRingGeo.rotateX(-Math.PI / 2);

    const floodAuraGeo = new THREE.CircleGeometry(0.92, 28);
    floodAuraGeo.rotateX(-Math.PI / 2);

    const shadowGeo = new THREE.PlaneGeometry(0.85, 0.85);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowTex = createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    // Proxy cylinder on layer 1 for effortless click & hover raycasting
    const hitGeo = new THREE.CylinderGeometry(0.36, 0.36, 2.8, 10);
    hitGeo.translate(0, 1.4, 0);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    // Shared structural materials with strong roughness/metalness contrast
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x2d2611,
      roughness: 0.62,
      metalness: 0.28,
    });
    const brassCollarMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.2,
      metalness: 0.88,
    });
    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.48,
      metalness: 0.72,
    });

    this.disposables.push(
      plinthGeo,
      collarGeo,
      coreShaftGeo,
      columnGeo,
      crownRingGeo,
      finialGeo,
      selRingGeo,
      floodAuraGeo,
      shadowGeo,
      shadowTex,
      shadowMat,
      hitGeo,
      hitMat,
      plinthMat,
      brassCollarMat,
      shaftMat
    );

    for (const dist of districts) {
      const root = new THREE.Group();
      const terrainLift =
        dist.region === 'Western Ghats'
          ? 0.26
          : dist.region === 'Interior Plateau'
            ? 0.12
            : 0.0;
      const baseY = 0.415 + terrainLift;
      root.position.set(dist.mapX, baseY, dist.mapZ);

      // Part 0: Soft contact shadow directly beneath plinth
      const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
      contactShadow.position.y = 0.008;
      root.add(contactShadow);

      // Part 1: Hexagonal stepped plinth
      const plinth = new THREE.Mesh(plinthGeo, plinthMat);
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      root.add(plinth);

      // Part 2: Brushed gold collar ring
      const collar = new THREE.Mesh(collarGeo, brassCollarMat);
      collar.position.y = 0.125;
      root.add(collar);

      // Part 3: Inner structural core shaft
      const coreShaft = new THREE.Mesh(coreShaftGeo, shaftMat);
      coreShaft.position.y = 0.12;
      root.add(coreShaft);

      // Part 4: Risk-scaled flood column (per-district dynamic material)
      const colColor = RISK_HEX_MAP[dist.riskCategory];
      const columnMaterial = new THREE.MeshStandardMaterial({
        color: colColor,
        emissive: colColor,
        emissiveIntensity: 0.28,
        roughness: 0.26,
        metalness: 0.18,
      });
      this.disposables.push(columnMaterial);

      const columnMesh = new THREE.Mesh(columnGeo, columnMaterial);
      columnMesh.position.y = 0.13;
      columnMesh.castShadow = true;
      root.add(columnMesh);

      // Part 5 & 6: Upper sensor crown collar + LatheGeometry telemetry beacon cap
      const crownGroup = new THREE.Group();
      const crownRing = new THREE.Mesh(crownRingGeo, brassCollarMat);
      crownGroup.add(crownRing);

      const beaconMaterial = new THREE.MeshStandardMaterial({
        color: 0xfbf7e8,
        emissive: colColor,
        emissiveIntensity: 0.45,
        roughness: 0.18,
        metalness: 0.65,
      });
      this.disposables.push(beaconMaterial);
      const finialMesh = new THREE.Mesh(finialGeo, beaconMaterial);
      finialMesh.position.y = 0.02;
      crownGroup.add(finialMesh);

      crownGroup.position.y = 0.9;
      root.add(crownGroup);

      // Part 7: Ground selection / hover halo ring
      const selectionRingMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      this.disposables.push(selectionRingMat);
      const selectionRing = new THREE.Mesh(selRingGeo, selectionRingMat);
      selectionRing.position.y = 0.025;
      root.add(selectionRing);

      // Part 8: Dynamic floodwater inundation aura disc expanding with risk & rainfall
      const floodAuraMat = new THREE.MeshBasicMaterial({
        color: colColor,
        transparent: true,
        opacity: 0.14 + dist.riskProbability * 0.24,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      this.disposables.push(floodAuraMat);
      const floodAuraMesh = new THREE.Mesh(floodAuraGeo, floodAuraMat);
      floodAuraMesh.position.y = 0.014;
      const initialAura = 0.38 + dist.riskProbability * 0.78;
      floodAuraMesh.scale.set(initialAura, 1, initialAura);
      root.add(floodAuraMesh);

      // Raycast hit proxy (layer 1)
      const hitProxy = new THREE.Mesh(hitGeo, hitMat);
      hitProxy.layers.set(1);
      hitProxy.userData.districtId = dist.id;
      root.add(hitProxy);
      this.hitProxies.push(hitProxy);

      const initialHeight = this.computeTowerHeight(dist);
      columnMesh.scale.y = initialHeight;
      coreShaft.scale.y = initialHeight;
      crownGroup.position.y = 0.13 + initialHeight;

      this.scene.add(root);
      this.towers.set(dist.id, {
        districtId: dist.id,
        root,
        columnMesh,
        columnMaterial,
        crownGroup,
        beaconMaterial,
        selectionRing,
        selectionRingMat,
        floodAuraMesh,
        floodAuraMat,
        currentAuraScale: initialAura,
        targetAuraScale: initialAura,
        hitProxy,
        currentHeight: initialHeight,
        targetHeight: initialHeight,
        baseY,
      });
    }
  }

  private buildRainParticles(): THREE.InstancedMesh {
    const count = 160;
    const dropGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.34, 4);
    const dropMat = new THREE.MeshBasicMaterial({
      color: 0xc4b5fd,
      transparent: true,
      opacity: 0.58,
    });
    this.disposables.push(dropGeo, dropMat);

    const mesh = new THREE.InstancedMesh(dropGeo, dropMat, count);
    mesh.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      const distIdx = i % Math.max(1, this.districts.length);
      const angle = (i * 2.39996) % (Math.PI * 2);
      const radius = 0.18 + ((i * 0.37) % 0.72);
      this.rainDrops.push({
        districtIdx: distIdx,
        offsetX: Math.cos(angle) * radius,
        offsetZ: Math.sin(angle) * radius,
        y: 0.8 + ((i * 0.43) % 3.6),
        speed: 2.2 + (i % 5) * 0.45,
      });
    }

    this.scene.add(mesh);
    return mesh;
  }

  private computeTowerHeight(district: TamilNaduDistrictData): number {
    // 0.35 base + up to 2.15 dynamic height driven by flood-risk probability
    return 0.35 + district.riskProbability * 2.15;
  }

  public updateDistricts(districts: TamilNaduDistrictData[], selectedId: string) {
    this.districts = districts;
    this.selectedDistrictId = selectedId;

    for (const dist of districts) {
      const rig = this.towers.get(dist.id);
      if (!rig) continue;

      rig.targetHeight = this.computeTowerHeight(dist);
      rig.targetAuraScale =
        0.34 + dist.riskProbability * 0.84 + Math.min(0.28, dist.inputs.rainfall / 280);
      const riskHex = RISK_HEX_MAP[dist.riskCategory];
      _scratchColor.setHex(riskHex);
      rig.columnMaterial.color.copy(_scratchColor);
      rig.columnMaterial.emissive.copy(_scratchColor);
      rig.beaconMaterial.emissive.copy(_scratchColor);
      rig.floodAuraMat.color.copy(_scratchColor);
      rig.floodAuraMat.opacity = 0.1 + dist.riskProbability * 0.28;

      const isSelected = dist.id === selectedId;
      const isHovered = dist.id === this.hoveredDistrictId;

      if (isSelected) {
        rig.selectionRingMat.color.setHex(0xfacc15);
        rig.selectionRingMat.opacity = 0.92;
        rig.columnMaterial.emissiveIntensity = 0.56;
        rig.floodAuraMat.opacity = Math.min(0.46, rig.floodAuraMat.opacity + 0.1);
      } else if (isHovered) {
        rig.selectionRingMat.color.setHex(0xc4b5fd);
        rig.selectionRingMat.opacity = 0.65;
        rig.columnMaterial.emissiveIntensity = 0.4;
      } else {
        rig.selectionRingMat.opacity = 0.0;
        rig.columnMaterial.emissiveIntensity = 0.24;
      }
    }
  }

  public setShowRainOverlay(show: boolean) {
    this.showRainOverlay = show;
    this.rainMesh.visible = show;
  }

  public flyToPreset(presetId: CameraPresetId) {
    const preset = CAMERA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    this.cameraGoalPos = new THREE.Vector3(...preset.position);
    this.cameraGoalTarget = new THREE.Vector3(...preset.target);
  }

  public focusDistrict(districtId: string) {
    const dist = this.districts.find((d) => d.id === districtId);
    if (!dist) return;
    this.cameraGoalTarget = new THREE.Vector3(dist.mapX, 0.9, dist.mapZ);
    this.cameraGoalPos = new THREE.Vector3(dist.mapX + 3.2, 4.6, dist.mapZ + 4.4);
  }

  private bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.handlePointerDown);
    el.addEventListener('pointerup', this.handlePointerUp);
    el.addEventListener('pointermove', this.handlePointerMove);
    el.addEventListener('pointerleave', this.handlePointerLeave);
    el.addEventListener('webglcontextlost', this.handleContextLost);
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  };

  private updatePointerNdc(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.pointerDownPos.x = e.clientX;
    this.pointerDownPos.y = e.clientY;
  };

  private handlePointerUp = (e: PointerEvent) => {
    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    // Ignore orbit drags
    if (dx * dx + dy * dy > 36) return;

    this.updatePointerNdc(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitProxies, false);
    if (hits.length > 0) {
      const id = hits[0].object.userData.districtId as string | undefined;
      if (id) {
        this.callbacks.onSelectDistrict(id);
      }
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    const now = performance.now();
    if (now - this.lastHoverCheckMs < 45) return;
    this.lastHoverCheckMs = now;

    this.updatePointerNdc(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitProxies, false);
    const nextHover =
      hits.length > 0 ? ((hits[0].object.userData.districtId as string) ?? null) : null;

    if (nextHover !== this.hoveredDistrictId) {
      this.hoveredDistrictId = nextHover;
      this.renderer.domElement.style.cursor = nextHover ? 'pointer' : 'grab';
      this.callbacks.onHoverDistrict(nextHover);
      this.updateDistricts(this.districts, this.selectedDistrictId);
    }
  };

  private handlePointerLeave = () => {
    if (this.hoveredDistrictId !== null) {
      this.hoveredDistrictId = null;
      this.renderer.domElement.style.cursor = 'grab';
      this.callbacks.onHoverDistrict(null);
      this.updateDistricts(this.districts, this.selectedDistrictId);
    }
  };

  private handleResize() {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 280);
    const height = Math.max(this.container.clientHeight, 280);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private startLoop() {
    const tick = () => {
      if (this.disposed) return;
      const dt = Math.min(this.clock.getDelta(), 0.08);
      const dampFactor = 1 - Math.exp(-6.5 * dt);

      // 1. Smoothly animate tower heights and floodwater inundation aura discs
      for (const rig of this.towers.values()) {
        if (Math.abs(rig.targetHeight - rig.currentHeight) > 0.002) {
          rig.currentHeight += (rig.targetHeight - rig.currentHeight) * dampFactor;
          rig.columnMesh.scale.y = rig.currentHeight;
          rig.crownGroup.position.y = 0.13 + rig.currentHeight;
        }
        if (Math.abs(rig.targetAuraScale - rig.currentAuraScale) > 0.002) {
          rig.currentAuraScale += (rig.targetAuraScale - rig.currentAuraScale) * dampFactor;
          rig.floodAuraMesh.scale.set(rig.currentAuraScale, 1, rig.currentAuraScale);
        }
      }

      // 2. Smoothly glide camera preset transitions (exponential damping)
      if (this.cameraGoalPos && this.cameraGoalTarget) {
        const camDamp = 1 - Math.exp(-5.0 * dt);
        _scratchVec3.copy(this.cameraGoalPos);
        _scratchTarget.copy(this.cameraGoalTarget);
        this.camera.position.lerp(_scratchVec3, camDamp);
        this.controls.target.lerp(_scratchTarget, camDamp);

        if (
          this.camera.position.distanceToSquared(this.cameraGoalPos) < 0.005 &&
          this.controls.target.distanceToSquared(this.cameraGoalTarget) < 0.005
        ) {
          this.cameraGoalPos = null;
          this.cameraGoalTarget = null;
        }
      }

      // 3. Animate instanced rainfall streaks above active/elevated districts
      if (this.showRainOverlay && this.districts.length > 0) {
        for (let i = 0; i < this.rainDrops.length; i++) {
          const drop = this.rainDrops[i];
          const dist = this.districts[drop.districtIdx];
          if (!dist) continue;

          // Scale visibility by rainfall or moderate+ flood risk
          const intensity = Math.max(dist.inputs.rainfall / 40, dist.riskProbability > 0.45 ? 0.55 : 0);
          if (intensity < 0.08) {
            _scratchDummy.scale.set(0, 0, 0);
            _scratchDummy.updateMatrix();
            this.rainMesh.setMatrixAt(i, _scratchDummy.matrix);
            continue;
          }

          drop.y -= drop.speed * (0.65 + Math.min(1.6, intensity)) * dt;
          if (drop.y < 0.55) {
            drop.y = 3.6 + (i % 7) * 0.25;
          }

          _scratchDummy.position.set(
            dist.mapX + drop.offsetX,
            drop.y,
            dist.mapZ + drop.offsetZ
          );
          _scratchDummy.rotation.set(0, 0, 0.06);
          const stretch = Math.min(1.8, 0.55 + intensity * 0.65);
          _scratchDummy.scale.set(1, stretch, 1);
          _scratchDummy.updateMatrix();
          this.rainMesh.setMatrixAt(i, _scratchDummy.matrix);
        }
        this.rainMesh.instanceMatrix.needsUpdate = true;
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.renderer.render(this.scene, this.camera);
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();

    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.handlePointerDown);
    el.removeEventListener('pointerup', this.handlePointerUp);
    el.removeEventListener('pointermove', this.handlePointerMove);
    el.removeEventListener('pointerleave', this.handlePointerLeave);
    el.removeEventListener('webglcontextlost', this.handleContextLost);

    this.controls.dispose();
    for (const item of this.disposables) {
      item.dispose();
    }
    this.renderer.dispose();
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }
}
