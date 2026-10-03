/**
 * First-person sword swing: when a line ability is released, a real 3D sword (built from geometry,
 * lit and reflecting a studio environment) sweeps across the painting along the aimed line, as if
 * swung from the player's seat in front of the screen. It is tinted to the ability's element and
 * comes toward the camera mid-swing. Presentation only: it listens to the `lineFire` event and
 * never touches the World, so replays are unaffected.
 *
 * Rendering is on demand: one transparent WebGL canvas over the painting, drawn only while a swing
 * is in flight.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { World } from '../core/world';
import { lineColor } from '../sim/lineAbility';
import '../sim/events';

const SWING_MS = 460;
const FOV = 34;

interface Look {
  blade: number;
  /** Self-lit glow of the blade. */
  glow: number;
  glowStrength: number;
  metalness: number;
  roughness: number;
  wrap: number;
  trim: number;
  /** Blade half-width, in model units (blade length is 1). */
  half: number;
  opacity: number;
}

const STEEL: Look = { blade: 0xd3dae1, glow: 0x3a0a0a, glowStrength: 0.25, metalness: 1, roughness: 0.22, wrap: 0x7d1f23, trim: 0xd8b868, half: 0.045, opacity: 1 };

const LOOKS: Record<string, Look> = {
  slash: STEEL,
  push: { blade: 0x80868f, glow: 0x0f1a15, glowStrength: 0.2, metalness: 1, roughness: 0.38, wrap: 0x3f6b5c, trim: 0x9a9486, half: 0.07, opacity: 1 },
  fire: { blade: 0xff9a3c, glow: 0xff4a10, glowStrength: 1.2, metalness: 0.7, roughness: 0.3, wrap: 0x3a1008, trim: 0xf5c36a, half: 0.045, opacity: 1 },
  water: { blade: 0x8fd0f0, glow: 0x2c7ab0, glowStrength: 0.55, metalness: 0.6, roughness: 0.08, wrap: 0x1f4d73, trim: 0xcfe7ee, half: 0.045, opacity: 0.95 },
  null: { blade: 0xeef0fa, glow: 0x9a9db0, glowStrength: 0.5, metalness: 0.3, roughness: 0.2, wrap: 0x575a6e, trim: 0xe4e4ee, half: 0.045, opacity: 0.6 },
};

/** Look for an ability; unknown ones get steel tinted to their registered colour. */
function lookFor(id: string): Look {
  const known = LOOKS[id];
  if (known) return known;
  const [r, g, b] = lineColor(id).split(',').map((n) => Number(n) / 255);
  const tint = new Color(r, g, b);
  return { ...STEEL, blade: tint.clone().lerp(new Color(0xffffff), 0.5).getHex(), glow: tint.getHex(), glowStrength: 0.4 };
}

/**
 * A lenticular blade: diamond cross-sections along its length, slightly curved, tapering to a
 * point. Pointing +Y, base at y = 0, tip at y = 1.
 */
function bladeGeometry(half: number, thick: number, curve: number): BufferGeometry {
  const N = 16;
  const pos: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const w = half * (t < 0.86 ? 1 - 0.14 * t : 0.88 * (1 - (t - 0.86) / 0.14));
    const th = thick * (1 - 0.4 * t) * (t < 0.92 ? 1 : (1 - t) / 0.08);
    const cx = curve * t * t;
    pos.push(cx - w, t, 0, cx, t, th, cx + w, t, 0, cx, t, -th);
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < 4; j++) {
      const a = i * 4 + j;
      const b = i * 4 + ((j + 1) % 4);
      const c = (i + 1) * 4 + j;
      const d = (i + 1) * 4 + ((j + 1) % 4);
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** The whole sword: blade up from the guard at the origin, grip and pommel below. */
function buildSword(look: Look): Group {
  const sword = new Group();
  const fade = look.opacity < 1;
  const mat = (color: number, metalness: number, roughness: number, extra: Partial<MeshStandardMaterial> = {}) =>
    new MeshStandardMaterial({ color, metalness, roughness, transparent: fade, opacity: look.opacity, side: DoubleSide, ...extra });

  const blade = new Mesh(
    bladeGeometry(look.half, look.half * 0.32, 0.05),
    mat(look.blade, look.metalness, look.roughness, { emissive: new Color(look.glow), emissiveIntensity: look.glowStrength, flatShading: true }),
  );
  sword.add(blade);

  const guard = new Mesh(new CylinderGeometry(0.12, 0.12, 0.025, 28), mat(look.trim, 1, 0.3));
  guard.scale.set(1, 1, 0.55);
  sword.add(guard);

  const gripLen = 0.3;
  const grip = new Mesh(new CylinderGeometry(0.026, 0.026, gripLen, 14), mat(look.wrap, 0.1, 0.8));
  grip.position.y = -gripLen / 2 - 0.012;
  sword.add(grip);
  for (let i = 0; i < 7; i++) {
    const ring = new Mesh(new TorusGeometry(0.028, 0.0045, 6, 16), mat(look.trim, 0.9, 0.4));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.04 - i * 0.04;
    sword.add(ring);
  }
  const pommel = new Mesh(new SphereGeometry(0.04, 16, 12), mat(look.trim, 1, 0.3));
  pommel.position.y = -gripLen - 0.03;
  pommel.scale.set(1, 0.8, 1);
  sword.add(pommel);

  // origin at the middle of the whole sword, so it swings about its centre
  sword.children.forEach((c) => (c.position.y += -0.32));
  return sword;
}

function disposeSword(sword: Group): void {
  sword.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (o.material as MeshStandardMaterial).dispose();
    }
  });
}

interface Swing {
  sword: Group;
  materials: MeshStandardMaterial[];
  baseOpacity: number;
  start: number;
  /** Pixel path on the painting, with an extra z-depth bulge at the middle. */
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  /** Aim direction in screen space (radians, y up). */
  ang: number;
  scale: number;
  reach: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export class SlashFx {
  private unsub: (() => void) | null = null;
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 1, 5000);
  private swings: Swing[] = [];
  private raf = 0;
  private key = new DirectionalLight(0xffffff, 2.4);
  private rim = new DirectionalLight(0xffffff, 1.6);
  private width = 0;
  private height = 0;

  /** `layer` overlays the canvas exactly; `cellsWide` is the grid width the canvas shows. */
  constructor(
    private readonly layer: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly cellsWide: number,
  ) {
    try {
      const r = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      r.setClearColor(0x000000, 0);
      r.toneMapping = ACESFilmicToneMapping;
      r.domElement.className = 'slash-gl';
      const pmrem = new PMREMGenerator(r);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      this.key.position.set(-1, 1.6, 2);
      this.rim.position.set(1.5, 0.4, -1);
      this.scene.add(new AmbientLight(0xffffff, 0.35), this.key, this.rim);
      this.layer.append(r.domElement);
      this.renderer = r;
    } catch {
      this.renderer = null; // no WebGL: the swing is just skipped
    }
  }

  /** Listen to a world's events (call again whenever the page swaps in a new world). */
  attach(world: World): void {
    this.unsub?.();
    this.unsub = world.events.on('lineFire', (e) => this.swing(e.id, e.x0, e.y0, e.x1, e.y1, e.power));
  }

  detach(): void {
    this.unsub?.();
    this.unsub = null;
  }

  /** Tear down the GL context (page unmount). */
  dispose(): void {
    this.detach();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const s of this.swings) disposeSword(s.sword);
    this.swings = [];
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
  }

  private fit(): void {
    const r = this.renderer;
    if (!r) return;
    const w = this.canvas.clientWidth + this.canvas.clientLeft * 2;
    const h = this.canvas.clientHeight + this.canvas.clientTop * 2;
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(w, h, false);
    // 1 world unit = 1 css pixel on the plane z = 0
    this.camera.aspect = w / h;
    this.camera.position.set(0, 0, h / 2 / Math.tan((FOV * Math.PI) / 360));
    this.camera.updateProjectionMatrix();
  }

  private swing(id: string, x0: number, y0: number, x1: number, y1: number, power: number): void {
    if (!this.renderer) return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.fit();
    const k = this.canvas.clientWidth / this.cellsWide;
    const ox = this.canvas.clientLeft;
    const oy = this.canvas.clientTop;
    const toWorldX = (cx: number) => ox + cx * k - this.width / 2;
    const toWorldY = (cy: number) => this.height / 2 - (oy + cy * k);

    const look = lookFor(id);
    const sword = buildSword(look);
    const materials: MeshStandardMaterial[] = [];
    sword.traverse((o) => {
      if (o instanceof Mesh) materials.push(o.material as MeshStandardMaterial);
    });
    sword.rotation.order = 'ZXY';
    sword.visible = false;
    this.scene.add(sword);

    const sx = toWorldX(x0);
    const sy = toWorldY(y0);
    const ex = toWorldX(x1);
    const ey = toWorldY(y1);
    this.swings.push({
      sword,
      materials,
      baseOpacity: look.opacity,
      start: performance.now(),
      sx,
      sy,
      ex,
      ey,
      ang: Math.atan2(ey - sy, ex - sx),
      scale: this.canvas.clientHeight * 0.85 * (1 + 0.2 * (power - 1)),
      reach: Math.hypot(ex - sx, ey - sy),
    });
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    const r = this.renderer;
    if (!r) return;
    let keep = 0;
    for (const s of this.swings) {
      const t = (now - s.start) / SWING_MS;
      if (t >= 1) {
        this.scene.remove(s.sword);
        disposeSword(s.sword);
        continue;
      }
      this.pose(s, t);
      this.swings[keep++] = s;
    }
    this.swings.length = keep;
    r.render(this.scene, this.camera);
    this.raf = keep > 0 ? requestAnimationFrame(this.frame) : 0;
  };

  /** Place and turn one sword for swing progress t (0 to 1). */
  private pose(s: Swing, t: number): void {
    const e = smooth(t);
    // travels a little before and past the aimed line so it enters and leaves the frame
    const run = -0.12 + 1.24 * e;
    const x = s.sx + (s.ex - s.sx) * run;
    const y = s.sy + (s.ey - s.sy) * run;
    const lunge = Math.sin(Math.PI * Math.min(1, Math.max(0, e)));
    const z = lunge * Math.max(120, s.reach * 0.35);
    const g = s.sword;
    g.visible = true;
    g.position.set(x, y, z);
    // blade held across the line of travel; its edge turns toward us through the arc
    g.rotation.set(0.45, (1 - 2 * e) * 1.15, s.ang + (e - 0.5) * 0.9);
    g.scale.setScalar(s.scale * (0.75 + 0.5 * lunge));
    const a = Math.min(1, t / 0.12, (1 - t) / 0.2) * s.baseOpacity;
    for (const m of s.materials) {
      m.transparent = true;
      m.opacity = Math.max(0, a);
    }
  }
}
