import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Compass,
  Maximize2,
  Minimize2,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { CandidateSkill, RoadmapItem, SelectedJob } from '../types';
import { Button, StatusText, Surface } from './ui/Primitives';

interface Roadmap3DStudioProps {
  selectedJob: SelectedJob | null;
  roadmapItems: RoadmapItem[];
  skills?: CandidateSkill[];
  onOpenCourseForSkill?: (skillName: string) => void;
  onVerifySkill?: (skillName: string) => void;
}

interface StationData {
  index: number;
  phaseOrder: number;
  title: string;
  skill: string;
  category: string;
  durationHours: number;
  status: 'not_started' | 'in_progress' | 'completed';
  description: string;
  expectedOutcome: string;
  iconType: 'cloud' | 'terminal' | 'network' | 'shield' | 'database' | 'code';
}

type CameraPreset = 'overview' | 'side' | 'top';

function guessIconType(skill: string): StationData['iconType'] {
  const s = (skill || '').toLowerCase();
  if (s.includes('aws') || s.includes('cloud') || s.includes('azure') || s.includes('gcp')) return 'cloud';
  if (s.includes('linux') || s.includes('bash') || s.includes('docker') || s.includes('kuber')) return 'terminal';
  if (s.includes('tcp') || s.includes('dns') || s.includes('network')) return 'network';
  if (s.includes('iam') || s.includes('sec') || s.includes('auth')) return 'shield';
  if (s.includes('sql') || s.includes('data') || s.includes('mongo') || s.includes('postgres')) return 'database';
  return 'code';
}

function detectSoftwareGl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = (probe.getContext('webgl2') || probe.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    const isSoft = /swiftshader|llvmpipe|software|mesa offscreen/i.test(rendererStr);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return isSoft;
  } catch {
    return false;
  }
}

function createFloorTexture(isDark: boolean, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = isDark ? '#111827' : '#e6ebf3';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle procedural stone/paper micro-variation
    for (let i = 0; i < 1600; i++) {
      const x = (i * 197) % 512;
      const y = (i * 353) % 512;
      ctx.fillStyle = isDark
        ? i % 2 === 0
          ? 'rgba(255,255,255,0.018)'
          : 'rgba(0,0,0,0.08)'
        : i % 2 === 0
        ? 'rgba(255,255,255,0.35)'
        : 'rgba(15,23,42,0.025)';
      ctx.fillRect(x, y, 2, 2);
    }

    // Architectural grid lines
    ctx.strokeStyle = isDark ? 'rgba(99, 102, 241, 0.14)' : 'rgba(67, 56, 202, 0.10)';
    ctx.lineWidth = 1.5;
    for (let p = 0; p <= 512; p += 64) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(512, p);
      ctx.stroke();
    }

    // Subtle cross-ticks at intersections
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.24)';
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= 512; x += 128) {
      for (let y = 0; y <= 512; y += 128) {
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y);
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y + 6);
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
    grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.16)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createNameplateTexture(
  station: StationData,
  isDark: boolean,
  isSelected: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const accent =
      station.status === 'completed'
        ? '#10B981'
        : station.status === 'in_progress'
        ? '#4F46E5'
        : '#64748B';

    // Rounded card background
    const r = 20;
    ctx.beginPath();
    ctx.moveTo(r, 4);
    ctx.lineTo(508 - r, 4);
    ctx.quadraticCurveTo(508, 4, 508, 4 + r);
    ctx.lineTo(508, 156 - r);
    ctx.quadraticCurveTo(508, 156, 508 - r, 156);
    ctx.lineTo(r, 156);
    ctx.quadraticCurveTo(4, 156, 4, 156 - r);
    ctx.lineTo(4, 4 + r);
    ctx.quadraticCurveTo(4, 4, r, 4);
    ctx.closePath();

    ctx.fillStyle = isDark ? '#0F172A' : '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = isSelected ? 6 : 3;
    ctx.strokeStyle = isSelected ? '#4F46E5' : accent;
    ctx.stroke();

    // Top accent strip
    ctx.fillStyle = accent;
    ctx.fillRect(28, 22, 10, 116);

    // Phase label
    ctx.fillStyle = accent;
    ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
    const statusText =
      station.status === 'completed'
        ? 'COMPLETED'
        : station.status === 'in_progress'
        ? 'IN PROGRESS'
        : 'UP NEXT';
    ctx.fillText(`PHASE 0${station.phaseOrder} · ${statusText}`, 54, 52);

    // Skill title
    ctx.fillStyle = isDark ? '#F8FAFC' : '#0F172A';
    ctx.font = '700 34px "Plus Jakarta Sans", system-ui, sans-serif';
    const label = station.skill.length > 20 ? `${station.skill.slice(0, 19)}…` : station.skill;
    ctx.fillText(label, 54, 98);

    // Duration & category
    ctx.fillStyle = isDark ? '#94A3B8' : '#475569';
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillText(`${station.durationHours} hrs · ${station.category}`, 54, 134);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

function buildDomainSculpture(
  iconType: StationData['iconType'],
  accentColor: number,
  metalMat: THREE.MeshStandardMaterial,
  accentMat: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: accentColor,
    roughness: 0.14,
    metalness: 0.1,
    transmission: 0.35,
    thickness: 0.4,
    ior: 1.45,
  });

  if (iconType === 'cloud') {
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), accentMat);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), accentMat);
    s2.position.set(-0.36, -0.06, 0.04);
    const s3 = new THREE.Mesh(new THREE.SphereGeometry(0.30, 20, 16), accentMat);
    s3.position.set(0.36, -0.08, -0.03);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.24, 0.46), metalMat);
    base.position.set(0, -0.18, 0);
    group.add(s1, s2, s3, base);
  } else if (iconType === 'terminal') {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.64, 0.22), metalMat);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.48, 0.05), glassMat);
    screen.position.z = 0.11;
    const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.04), accentMat);
    bar1.position.set(-0.12, 0.08, 0.14);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.04), accentMat);
    bar2.position.set(-0.18, -0.08, 0.14);
    group.add(chassis, screen, bar1, bar2);
  } else if (iconType === 'shield') {
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), glassMat);
    core.scale.set(0.95, 1.18, 0.55);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.055, 12, 6), metalMat);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), accentMat);
    gem.position.z = 0.24;
    group.add(core, frame, gem);
  } else if (iconType === 'database') {
    for (let i = -1; i <= 1; i++) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.18, 24), i === 0 ? accentMat : metalMat);
      disc.position.y = i * 0.28;
      group.add(disc);
    }
    const coreRod = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.78, 16), glassMat);
    group.add(coreRod);
  } else if (iconType === 'network') {
    const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), accentMat);
    group.add(hub);
    const offsets: Array<[number, number, number]> = [
      [0.48, 0.22, 0.18],
      [-0.48, 0.22, -0.18],
      [0, -0.44, 0.26],
    ];
    offsets.forEach(([x, y, z]) => {
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), metalMat);
      node.position.set(x, y, z);
      group.add(node);
      const dir = new THREE.Vector3(x, y, z);
      const len = dir.length();
      const link = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, len, 8), glassMat);
      link.position.copy(dir).multiplyScalar(0.5);
      link.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      group.add(link);
    });
  } else {
    const outer = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), glassMat);
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.04, 12, 36), metalMat);
    ring1.rotation.x = Math.PI / 3;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.04, 12, 36), accentMat);
    ring2.rotation.y = Math.PI / 3;
    group.add(outer, ring1, ring2);
  }

  return group;
}

export function Roadmap3DStudio({
  selectedJob,
  roadmapItems,
  skills = [],
  onOpenCourseForSkill,
  onVerifySkill,
}: Roadmap3DStudioProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const mountRef = useRef<HTMLDivElement>(null);

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [autoOrbit, setAutoOrbit] = useState<boolean>(true);
  const [controlsOpen, setControlsOpen] = useState<boolean>(true);
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('overview');

  // Build deterministic station array from live roadmap items (or sensible preview stations)
  const stations: StationData[] = useMemo(() => {
    if (roadmapItems.length > 0) {
      return roadmapItems.slice(0, 6).map((item, idx) => ({
        index: idx,
        phaseOrder: item.phaseOrder || idx + 1,
        title: item.title,
        skill: item.targetSkill,
        category: item.skillCategory || 'Technical',
        durationHours: item.durationHours || 6,
        status: item.status,
        description: item.description || `Hands-on engineering milestone for ${item.targetSkill}.`,
        expectedOutcome: item.expectedOutcome || `Complete lab & verification quiz for ${item.targetSkill}.`,
        iconType: guessIconType(item.targetSkill),
      }));
    }
    const fallbackSkills =
      skills.length > 0
        ? skills.slice(0, 5).map((s) => s.name)
        : ['Linux', 'AWS Fundamentals', 'IAM', 'TCP/IP', 'Docker'];
    return fallbackSkills.map((sk, idx) => ({
      index: idx,
      phaseOrder: idx + 1,
      title: `Master ${sk}`,
      skill: sk,
      category: 'Core Track',
      durationHours: 6 + idx * 2,
      status: idx === 0 ? 'in_progress' : 'not_started',
      description: `Build verified hands-on fluency in ${sk} aligned to your target role.`,
      expectedOutcome: `Finish video modules and pass ${sk} skill verification.`,
      iconType: guessIconType(sk),
    }));
  }, [roadmapItems, skills]);

  const activeStation = stations[selectedIndex] || stations[0];

  // Refs bridging React controls to Three.js render loop without tearing down WebGL
  const autoOrbitRef = useRef(autoOrbit);
  autoOrbitRef.current = autoOrbit;

  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  const cameraGoalRef = useRef<{
    pos: THREE.Vector3;
    target: THREE.Vector3;
    active: boolean;
  }>({
    pos: new THREE.Vector3(0, 10.5, 19),
    target: new THREE.Vector3(0, 1.4, 0),
    active: false,
  });

  const stationPositionsRef = useRef<THREE.Vector3[]>([]);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const nameplateMeshesRef = useRef<THREE.Mesh[]>([]);
  const maxAnisotropyRef = useRef<number>(4);

  const flyToStation = useCallback((idx: number) => {
    const pos = stationPositionsRef.current[idx];
    if (!pos) return;
    setSelectedIndex(idx);
    setAutoOrbit(false);
    cameraGoalRef.current.target.set(pos.x, 1.8, pos.z);
    cameraGoalRef.current.pos.set(pos.x + 3.6, 5.2, pos.z + 7.6);
    cameraGoalRef.current.active = true;
  }, []);

  const applyCameraPreset = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    if (preset === 'overview') {
      cameraGoalRef.current.target.set(0, 1.3, 0);
      cameraGoalRef.current.pos.set(0, 10.2, 18.8);
      cameraGoalRef.current.active = true;
    } else if (preset === 'side') {
      cameraGoalRef.current.target.set(0, 1.4, 0);
      cameraGoalRef.current.pos.set(-16.5, 6.2, 10.5);
      cameraGoalRef.current.active = true;
    } else {
      cameraGoalRef.current.target.set(0, 0, 0);
      cameraGoalRef.current.pos.set(0.01, 21.5, 5.5);
      cameraGoalRef.current.active = true;
    }
  }, []);

  // Update nameplate highlight textures when selection changes without rebuilding scene
  useEffect(() => {
    nameplateMeshesRef.current.forEach((mesh, idx) => {
      const station = stations[idx];
      if (!station) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.map) mat.map.dispose();
      mat.map = createNameplateTexture(station, isDark, idx === selectedIndex, maxAnisotropyRef.current);
      mat.needsUpdate = true;
    });
  }, [selectedIndex, stations, isDark]);

  // Main Three.js lifecycle
  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;

    const isSoftGl = detectSoftwareGl();

    const width = Math.max(320, host.clientWidth);
    const height = Math.max(360, host.clientHeight);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftGl,
      powerPreference: 'high-performance',
      alpha: false,
      preserveDrawingBuffer: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftGl ? 1 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDark ? 1.05 : 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    maxAnisotropyRef.current = renderer.capabilities.getMaxAnisotropy();

    // WebGL context loss safety
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    const bgHex = isDark ? 0x0b1120 : 0xeef2f8;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.017);
    sceneRef.current = scene;

    // Neutral studio IBL on every device
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 140);
    camera.position.set(0, 10.2, 18.8);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minPolarAngle = 0.16;
    controls.minDistance = 5.5;
    controls.maxDistance = 36;
    controls.target.set(0, 1.3, 0);
    controls.update();

    const onControlStart = () => {
      cameraGoalRef.current.active = false;
      setAutoOrbit(false);
    };
    controls.addEventListener('start', onControlStart);

    // Three-point studio lighting: warm key + cool hemisphere fill + subtle rim
    const hemi = new THREE.HemisphereLight(isDark ? 0x9bb8e8 : 0xdbeafe, isDark ? 0x1e293b : 0x64748b, isDark ? 0.68 : 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff3de, isDark ? 2.4 : 2.6);
    keyLight.position.set(11, 18, 12);
    if (!isSoftGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -18;
      keyLight.shadow.camera.right = 18;
      keyLight.shadow.camera.top = 18;
      keyLight.shadow.camera.bottom = -18;
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 48;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
    rimLight.position.set(-14, 10, -12);
    scene.add(rimLight);

    // Expansive architectural floor (open horizon, zero box walls)
    const floorTex = createFloorTexture(isDark, maxAnisotropyRef.current);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.9,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(68, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = !isSoftGl;
    scene.add(floor);

    // Compute scenic winding S-curve positions for stations
    const count = stations.length;
    const spanX = Math.max(10, (count - 1) * 4.4);
    const stationPositions: THREE.Vector3[] = stations.map((_, i) => {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = -spanX / 2 + t * spanX;
      const z = Math.sin(t * Math.PI * 1.45 - 0.5) * 3.8;
      return new THREE.Vector3(x, 0, z);
    });
    stationPositionsRef.current = stationPositions;

    // Build curved spline roadway connecting all stations
    const splinePoints =
      stationPositions.length >= 2
        ? stationPositions.map((p) => new THREE.Vector3(p.x, 0.24, p.z))
        : [new THREE.Vector3(-4, 0.24, 0), new THREE.Vector3(0, 0.24, 0), new THREE.Vector3(4, 0.24, 0)];
    const curve = new THREE.CatmullRomCurve3(splinePoints);

    const railMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x1e293b : 0xcbd5e1,
      roughness: 0.45,
      metalness: 0.55,
    });
    const railGeo = new THREE.TubeGeometry(curve, 96, 0.22, 12, false);
    const railMesh = new THREE.Mesh(railGeo, railMat);
    railMesh.castShadow = !isSoftGl;
    railMesh.receiveShadow = !isSoftGl;
    scene.add(railMesh);

    // Glowing inner guidance ribbon along the spline
    const ribbonPoints = curve.getPoints(96).map((p) => new THREE.Vector3(p.x, 0.43, p.z));
    const ribbonCurve = new THREE.CatmullRomCurve3(ribbonPoints);
    const ribbonGeo = new THREE.TubeGeometry(ribbonCurve, 96, 0.055, 8, false);
    const ribbonMat = new THREE.MeshStandardMaterial({
      color: 0x4f46e5,
      emissive: 0x4338ca,
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.2,
    });
    scene.add(new THREE.Mesh(ribbonGeo, ribbonMat));

    // Instanced structural pylons along the spline (properly calling computeBoundingSphere)
    const pylonCount = 22;
    const pylonGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.42, 10);
    const pylonMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x334155 : 0x94a3b8,
      metalness: 0.72,
      roughness: 0.28,
    });
    const pylons = new THREE.InstancedMesh(pylonGeo, pylonMat, pylonCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < pylonCount; i++) {
      const pt = curve.getPoint(i / (pylonCount - 1));
      dummy.position.set(pt.x, 0.21, pt.z);
      dummy.updateMatrix();
      pylons.setMatrixAt(i, dummy.matrix);
    }
    pylons.instanceMatrix.needsUpdate = true;
    pylons.computeBoundingSphere();
    pylons.castShadow = !isSoftGl;
    scene.add(pylons);

    // Shared pedestal LatheGeometry profile
    const lathePts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.64, 0.0),
      new THREE.Vector2(0.54, 0.16),
      new THREE.Vector2(0.32, 0.46),
      new THREE.Vector2(0.28, 1.05),
      new THREE.Vector2(0.46, 1.24),
      new THREE.Vector2(0.58, 1.34),
      new THREE.Vector2(0.0, 1.34),
    ];
    const columnGeo = new THREE.LatheGeometry(lathePts, 28);
    const plinthGeo = new THREE.CylinderGeometry(1.34, 1.5, 0.24, 8);
    const terraceGeo = new THREE.CylinderGeometry(1.06, 1.18, 0.14, 16);
    const ringGeo = new THREE.TorusGeometry(0.84, 0.055, 14, 48);
    const shadowTex = createContactShadowTexture();
    const shadowPlaneGeo = new THREE.PlaneGeometry(3.7, 3.7);
    const nameplateGeo = new THREE.PlaneGeometry(2.8, 0.88);
    const hitGeo = new THREE.BoxGeometry(2.8, 3.8, 2.8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    const plinthMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x1e293b : 0xf1f5f9,
      roughness: 0.72,
      metalness: 0.12,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x94a3b8 : 0x475569,
      roughness: 0.22,
      metalness: 0.88,
    });
    const shadowDiscMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const hitMeshes: THREE.Mesh[] = [];
    const floatingSculptures: Array<{ group: THREE.Group; baseY: number; phase: number }> = [];
    const nameplates: THREE.Mesh[] = [];

    stations.forEach((station, idx) => {
      const pos = stationPositions[idx];
      const stationGroup = new THREE.Group();
      stationGroup.position.set(pos.x, 0, pos.z);

      const accentHex =
        station.status === 'completed'
          ? 0x10b981
          : station.status === 'in_progress'
          ? 0x4f46e5
          : 0x64748b;

      const accentMat = new THREE.MeshStandardMaterial({
        color: accentHex,
        emissive: accentHex,
        emissiveIntensity: station.status === 'not_started' ? 0.15 : 0.45,
        roughness: 0.3,
        metalness: 0.35,
      });

      // 1. Contact shadow disc
      const shadowDisc = new THREE.Mesh(shadowPlaneGeo, shadowDiscMat);
      shadowDisc.rotation.x = -Math.PI / 2;
      shadowDisc.position.y = 0.018;
      stationGroup.add(shadowDisc);

      // 2. Stepped stone plinth
      const plinth = new THREE.Mesh(plinthGeo, plinthMat);
      plinth.position.y = 0.12;
      plinth.castShadow = !isSoftGl;
      plinth.receiveShadow = !isSoftGl;
      stationGroup.add(plinth);

      // 3. Upper terrace collar
      const terrace = new THREE.Mesh(terraceGeo, metalMat);
      terrace.position.y = 0.31;
      terrace.castShadow = !isSoftGl;
      stationGroup.add(terrace);

      // 4. Anodized Lathe pedestal column
      const column = new THREE.Mesh(columnGeo, metalMat);
      column.position.y = 0.38;
      column.castShadow = !isSoftGl;
      stationGroup.add(column);

      // 5. Status collar torus ring
      const ring = new THREE.Mesh(ringGeo, accentMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.66;
      stationGroup.add(ring);

      // 6. Floating composite domain sculpture
      const sculpture = buildDomainSculpture(station.iconType, accentHex, metalMat, accentMat);
      sculpture.position.y = 2.48;
      sculpture.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.castShadow = !isSoftGl;
      });
      stationGroup.add(sculpture);
      floatingSculptures.push({ group: sculpture, baseY: 2.48, phase: idx * 0.9 });

      // 7. Architectural high-DPI nameplate billboard
      const plateTex = createNameplateTexture(station, isDark, idx === selectedIndexRef.current, maxAnisotropyRef.current);
      const plateMat = new THREE.MeshStandardMaterial({
        map: plateTex,
        roughness: 0.45,
        metalness: 0.05,
      });
      const nameplate = new THREE.Mesh(nameplateGeo, plateMat);
      nameplate.position.set(0, 0.72, 1.56);
      nameplate.rotation.x = -0.34;
      stationGroup.add(nameplate);
      nameplates.push(nameplate);

      // 8. Invisible raycast collider box
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.y = 1.9;
      hitMesh.userData.stationIndex = idx;
      stationGroup.add(hitMesh);
      hitMeshes.push(hitMesh);

      scene.add(stationGroup);
    });
    nameplateMeshesRef.current = nameplates;

    // Raycasting pointer interaction (hover cursor + click fly-to)
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownX = 0;
    let pointerDownY = 0;

    const getHitIndex = (clientX: number, clientY: number): number | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);
      if (hits.length > 0 && typeof hits[0].object.userData.stationIndex === 'number') {
        return hits[0].object.userData.stationIndex as number;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      const hitIdx = getHitIndex(e.clientX, e.clientY);
      renderer.domElement.style.cursor = hitIdx !== null ? 'pointer' : 'grab';
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
      if (dist > 6) return; // drag orbit, not click
      const hitIdx = getHitIndex(e.clientX, e.clientY);
      if (hitIdx !== null) {
        flyToStation(hitIdx);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // ResizeObserver for crisp responsive viewport
    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width < 10 || rect.height < 10) return;
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height);
    });
    resizeObserver.observe(host);

    // Pacing helper for software WebGL fence sync
    const glCtx = renderer.getContext();
    const afterDraw = (cb: () => void) => {
      if (!isSoftGl) {
        requestAnimationFrame(cb);
        return;
      }
      if ('fenceSync' in glCtx) {
        const gl2 = glCtx as WebGL2RenderingContext;
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl2.flush();
          const poll = () => {
            if (gl2.getSyncParameter(sync, gl2.SYNC_STATUS) === gl2.SIGNALED) {
              gl2.deleteSync(sync);
              requestAnimationFrame(cb);
            } else {
              setTimeout(poll, 4);
            }
          };
          setTimeout(poll, 0);
          return;
        }
      }
      setTimeout(() => requestAnimationFrame(cb), 16);
    };

    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      elapsed += dt;

      // Animate domain sculptures smoothly
      for (let i = 0; i < floatingSculptures.length; i++) {
        const item = floatingSculptures[i];
        item.group.position.y = item.baseY + Math.sin(elapsed * 1.65 + item.phase) * 0.14;
        item.group.rotation.y += dt * (i === selectedIndexRef.current ? 0.95 : 0.42);
      }

      // Smooth damped camera fly-to
      const goal = cameraGoalRef.current;
      if (goal.active) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, goal.pos.x, 4.5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, goal.pos.y, 4.5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, goal.pos.z, 4.5, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, goal.target.x, 5.0, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, goal.target.y, 5.0, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, goal.target.z, 5.0, dt);
        if (
          camera.position.distanceTo(goal.pos) < 0.08 &&
          controls.target.distanceTo(goal.target) < 0.05
        ) {
          goal.active = false;
        }
      }

      controls.autoRotate = autoOrbitRef.current && !goal.active;
      controls.autoRotateSpeed = 0.65;
      controls.update();

      renderer.render(scene, camera);
      afterDraw(tick);
    };

    requestAnimationFrame(tick);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (!m) return;
            const std = m as THREE.MeshStandardMaterial;
            std.map?.dispose();
            m.dispose();
          });
        }
      });

      envTarget.dispose();
      pmrem.dispose();
      floorTex.dispose();
      shadowTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      nameplateMeshesRef.current = [];
    };
  }, [stations, isDark, flyToStation]);

  const handleSnapshotPng = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    // Render immediately before reading canvas so the buffer is populated
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `chokma-3d-roadmap-${(selectedJob?.jobTitle || 'career')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('3D Roadmap PNG snapshot saved');
  };

  return (
    <Surface
      className={
        fullscreen
          ? 'fixed inset-4 z-50 flex flex-col overflow-hidden shadow-2xl border-slate-300 dark:border-slate-700'
          : 'overflow-hidden'
      }
    >
      {/* Top Studio Header Bar (solid surface, outside WebGL canvas) */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              3D Interactive Roadmap Studio {selectedJob ? `· ${selectedJob.jobTitle}` : ''}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Drag to orbit · Scroll to zoom · Click any 3D milestone pedestal to inspect &amp; fly camera
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(['overview', 'side', 'top'] as CameraPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyCameraPreset(preset)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer whitespace-nowrap ${
                  cameraPreset === preset
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {preset === 'top' ? 'Blueprint' : preset}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant={autoOrbit ? 'secondary' : 'outline'}
            onClick={() => setAutoOrbit((v) => !v)}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {autoOrbit ? 'Orbit On' : 'Orbit Off'}
          </Button>

          <Button size="sm" variant="outline" onClick={handleSnapshotPng}>
            <Camera className="w-3.5 h-3.5" />
            Snapshot PNG
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setFullscreen((f) => !f)}
            aria-label={fullscreen ? 'Exit fullscreen 3D studio' : 'Fullscreen 3D studio'}
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Dedicated WebGL Stage (canvas mount kept clean; sibling solid HUD overlays with zero backdrop-blur) */}
      <div
        className={`relative w-full overflow-hidden select-none ${
          fullscreen ? 'flex-1 min-h-[460px]' : 'h-[480px] sm:h-[540px]'
        }`}
      >
        <div ref={mountRef} className="w-full h-full" />

        {contextLost && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center text-white gap-2 p-6 text-center">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <p className="text-sm font-semibold">3D WebGL context temporarily paused</p>
            <p className="text-xs text-slate-400">Restoring interactive 3D roadmap viewport...</p>
          </div>
        )}

        {/* Top-left compact legend (solid rgba surface, no backdrop-filter) */}
        <div
          className="absolute top-3 left-3 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium flex items-center gap-3 pointer-events-none"
          style={{ backgroundColor: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.94)' }}
        >
          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Completed
          </span>
          <span className="inline-flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            In Progress
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Planned
          </span>
        </div>

        {/* Collapsible Bottom Control Dock (solid rgba, zero backdrop-filter) */}
        <div className="absolute bottom-3 left-3 right-3 flex flex-col items-stretch gap-2 pointer-events-none">
          <div className="flex justify-end pointer-events-auto">
            <button
              type="button"
              onClick={() => setControlsOpen((o) => !o)}
              style={{ backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.96)' }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm cursor-pointer"
            >
              {controlsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              {controlsOpen ? 'Hide Dock' : 'Show Milestones'}
            </button>
          </div>

          {controlsOpen && activeStation && (
            <div
              style={{ backgroundColor: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.97)' }}
              className="pointer-events-auto rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 shadow-lg space-y-3"
            >
              {/* Station Jump Track */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {stations.map((st) => {
                  const active = st.index === selectedIndex;
                  return (
                    <button
                      key={`${st.skill}-${st.index}`}
                      type="button"
                      onClick={() => flyToStation(st.index)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                        active
                          ? 'bg-indigo-700 border-indigo-700 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                      }`}
                    >
                      <span className="font-mono mr-1.5">0{st.phaseOrder}</span>
                      {st.skill}
                    </button>
                  );
                })}
              </div>

              {/* Active Milestone Details + Direct Learning Launch */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-400">
                      Phase 0{activeStation.phaseOrder}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {activeStation.title}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {activeStation.durationHours} hrs
                    </span>
                    <span className="text-slate-400">·</span>
                    <StatusText
                      tone={
                        activeStation.status === 'completed'
                          ? 'success'
                          : activeStation.status === 'in_progress'
                          ? 'info'
                          : 'neutral'
                      }
                      label={
                        activeStation.status === 'completed'
                          ? 'Completed'
                          : activeStation.status === 'in_progress'
                          ? 'In Progress'
                          : 'Planned'
                      }
                    />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1">
                    {activeStation.expectedOutcome}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onOpenCourseForSkill && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenCourseForSkill(activeStation.skill)}
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      Video Course
                    </Button>
                  )}
                  {onVerifySkill && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onVerifySkill(activeStation.skill)}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Verify Skill
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Surface>
  );
}
