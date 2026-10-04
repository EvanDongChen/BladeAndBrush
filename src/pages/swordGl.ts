/**
 * The 3D sword for aiming and slashing, drawn with three.js into a transparent canvas over the
 * painting. Seen from the player's seat in front of the screen:
 *
 *   aim      the sword hangs at the midpoint of the aimed line, tip pointing into the painting and
 *            leaning along the line, with the hilt toward the camera (real perspective);
 *   stab     on release it plunges into the painting at the start of the line;
 *   drag     then it is dragged along the line to the end, and fades out.
 *
 * Presentation only: it never touches the World. It is loaded lazily by `slashFx.ts`.
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
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { aimTunables } from '../sim/lineAbility';

const FOV = 34;
const RAD = Math.PI / 180;

/** Tip of the model in its own units (blade length 1, centred on the whole sword). */
const TIP_X = 0.05;
const TIP_Y = 0.68;

const STAB_MS = 150;
const EXIT_MS = 150;
const HOLD_MS = 120; // how long a released sword waits for the shot to fire before giving up
const FADE_IN_MS = 110;

/** Angle between the blade and the screen's z axis: 0 points straight into the painting. */
const PHI_AIM = 62 * RAD;
const PHI_STAB = 26 * RAD;
const PHI_DRAG = 46 * RAD;

/** The same sword for every ability; only the blade takes the element's colour. */
interface Blade {
  color: number;
  glow: number;
  glowStrength: number;
  metalness: number;
  roughness: number;
}

const BLADES: Record<string, Blade> = {
  slash: { color: 0xd3dae1, glow: 0x3a0a0a, glowStrength: 0.2, metalness: 1, roughness: 0.22 },
  push: { color: 0x7d838c, glow: 0x0f1a15, glowStrength: 0.15, metalness: 1, roughness: 0.36 },
  fire: { color: 0xff9a3c, glow: 0xff4a10, glowStrength: 1.2, metalness: 0.7, roughness: 0.3 },
  water: { color: 0x8fd0f0, glow: 0x2c7ab0, glowStrength: 0.55, metalness: 0.6, roughness: 0.1 },
  null: { color: 0xe9ebf6, glow: 0x9a9db0, glowStrength: 0.45, metalness: 0.4, roughness: 0.2 },
};
const DEFAULT_BLADE = BLADES.slash;

/** A lenticular, slightly curved blade tapering to a point. Pointing +Y, base y = 0, tip y = 1. */
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

/** Sword with its origin at the middle of the whole sword: blade up, guard, wrapped grip, pommel. */
function buildSword(blade: Blade, materials: MeshStandardMaterial[]): Group {
  const sword = new Group();
  const mat = (color: number, metalness: number, roughness: number, extra: Partial<MeshStandardMaterial> = {}) => {
    const m = new MeshStandardMaterial({ color, metalness, roughness, transparent: true, side: DoubleSide, ...extra });
    materials.push(m);
    return m;
  };
  const trim = 0xd8b868;
  sword.add(
    new Mesh(
      bladeGeometry(0.045, 0.045 * 0.32, 0.05),
      mat(blade.color, blade.metalness, blade.roughness, { emissive: new Color(blade.glow), emissiveIntensity: blade.glowStrength, flatShading: true }),
    ),
  );
  const guard = new Mesh(new CylinderGeometry(0.12, 0.12, 0.025, 28), mat(trim, 1, 0.3));
  guard.scale.set(1, 1, 0.55);
  sword.add(guard);
  const gripLen = 0.3;
  const grip = new Mesh(new CylinderGeometry(0.026, 0.026, gripLen, 14), mat(0x7d1f23, 0.1, 0.8));
  grip.position.y = -gripLen / 2 - 0.012;
  sword.add(grip);
  for (let i = 0; i < 7; i++) {
    const ring = new Mesh(new TorusGeometry(0.028, 0.0045, 6, 16), mat(trim, 0.9, 0.4));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.04 - i * 0.04;
    sword.add(ring);
  }
  const pommel = new Mesh(new SphereGeometry(0.04, 16, 12), mat(trim, 1, 0.3));
  pommel.position.y = -gripLen - 0.03;
  pommel.scale.set(1, 0.8, 1);
  sword.add(pommel);
  sword.children.forEach((c) => (c.position.y += -0.32));
  return sword;
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeInOut = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

type State = 'idle' | 'aim' | 'held' | 'stab' | 'drag' | 'exit';

interface Pt {
  x: number;
  y: number;
}

export class SwordStage {
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 1, 6000);
  private anchor = new Group();
  private sword: Group | null = null;
  private materials: MeshStandardMaterial[] = [];
  private look = '';
  private width = 0;
  private height = 0;
  private raf = 0;
  private state: State = 'idle';
  private since = 0;
  private aimStart = 0;
  private opacity = 0;

  // line in world pixels (y up), and the sword's size in pixels per model unit
  private s: Pt = { x: 0, y: 0 };
  private e: Pt = { x: 0, y: 0 };
  private length = 200;
  private dragMs = 300;

  private readonly basis = new Matrix4();
  private readonly dir = new Vector3();
  private readonly side = new Vector3();
  private readonly up = new Vector3();

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
      const key = new DirectionalLight(0xffffff, 2.4);
      key.position.set(-1, 1.6, 2);
      const rim = new DirectionalLight(0xffffff, 1.6);
      rim.position.set(1.5, 0.4, -1);
      this.scene.add(new AmbientLight(0xffffff, 0.35), key, rim, this.anchor);
      this.anchor.visible = false;
      layer.append(r.domElement);
      this.renderer = r;
    } catch {
      this.renderer = null; // no WebGL: the sword is simply skipped
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
  }

  /** Aiming: the pointer is held and the line runs (x0, y0) to (x1, y1), in grid cells. */
  aim(id: string, x0: number, y0: number, x1: number, y1: number): void {
    if (!this.renderer) return;
    if (this.state === 'stab' || this.state === 'drag' || this.state === 'exit') return; // let the last swing finish
    if (Math.hypot(x1 - x0, y1 - y0) < aimTunables.minLength) {
      if (this.state === 'aim') this.begin('held'); // dragged back to nothing: let it fade
      return;
    }
    this.fit();
    this.setLook(id);
    this.setLine(x0, y0, x1, y1);
    if (this.state !== 'aim') {
      this.state = 'aim';
      this.aimStart = performance.now();
    }
    this.run();
  }

  /** The pointer was released. The sword waits briefly for the shot to fire. */
  release(): void {
    if (this.state === 'aim') this.begin('held');
  }

  /** The shot fired along (x0, y0) to (x1, y1) (clamped aim, in grid cells): stab, then drag. */
  fire(id: string, x0: number, y0: number, x1: number, y1: number): void {
    if (!this.renderer) return;
    this.fit();
    this.setLook(id);
    this.setLine(x0, y0, x1, y1);
    if (this.state === 'idle') this.opacity = 1;
    this.begin('stab');
    this.run();
  }

  /** Drop everything (the level restarted). */
  cancel(): void {
    this.state = 'idle';
    if (this.anchor) this.anchor.visible = false;
    this.renderer?.clear();
  }

  private begin(state: State): void {
    this.state = state;
    this.since = performance.now();
  }

  private fit(): void {
    const r = this.renderer;
    if (!r) return;
    const w = this.layer.clientWidth;
    const h = this.layer.clientHeight;
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

  private setLook(id: string): void {
    if (this.look === id && this.sword) return;
    if (this.sword) {
      this.anchor.remove(this.sword);
      this.sword.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      this.materials.forEach((m) => m.dispose());
    }
    this.materials = [];
    this.sword = buildSword(BLADES[id] ?? DEFAULT_BLADE, this.materials);
    this.anchor.add(this.sword);
    this.look = id;
  }

  /** Grid cells to world pixels: 1 unit = 1 css pixel, origin at the middle of the layer, y up. */
  private setLine(x0: number, y0: number, x1: number, y1: number): void {
    const k = this.canvas.clientWidth / this.cellsWide;
    const ox = this.canvas.offsetLeft + this.canvas.clientLeft;
    const oy = this.canvas.offsetTop + this.canvas.clientTop;
    const toX = (c: number) => ox + c * k - this.width / 2;
    const toY = (c: number) => this.height / 2 - (oy + c * k);
    this.s = { x: toX(x0), y: toY(y0) };
    this.e = { x: toX(x1), y: toY(y1) };
    const len = Math.hypot(this.e.x - this.s.x, this.e.y - this.s.y);
    // as long as the line it hangs over, within reason
    this.length = Math.min(520, Math.max(150, len * 0.9));
    this.dragMs = Math.min(420, Math.max(220, len / 2.2));
  }

  private run(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    const r = this.renderer;
    if (!r) return;
    this.step(now);
    if (this.state === 'idle') {
      this.anchor.visible = false;
      r.clear();
      this.raf = 0;
      return;
    }
    r.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

  private step(now: number): void {
    const { s, e } = this;
    const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
    const t = now - this.since;
    let pos = mid;
    let z = 0;
    let phi = PHI_AIM;
    let tip = 0; // 0 = hang by the centre, 1 = hold by the tip
    let alpha = 1;

    switch (this.state) {
      case 'aim':
        alpha = Math.min(1, (now - this.aimStart) / FADE_IN_MS);
        this.opacity = alpha;
        break;
      case 'held':
        // the shot normally fires within a tick; if it never does (a cancelled aim), fade away
        alpha = this.opacity * (1 - Math.min(1, t / HOLD_MS));
        if (t >= HOLD_MS) this.state = 'idle';
        break;
      case 'stab': {
        const k = easeOut(t / STAB_MS);
        pos = { x: mid.x + (s.x - mid.x) * k, y: mid.y + (s.y - mid.y) * k };
        z = (1 - k) * this.length * 0.55; // thrust forward, away from the camera
        phi = PHI_AIM + (PHI_STAB - PHI_AIM) * k;
        tip = k;
        if (t >= STAB_MS) this.begin('drag');
        break;
      }
      case 'drag': {
        const k = easeInOut(t / this.dragMs);
        pos = { x: s.x + (e.x - s.x) * k, y: s.y + (e.y - s.y) * k };
        phi = PHI_STAB + (PHI_DRAG - PHI_STAB) * k;
        tip = 1;
        if (t >= this.dragMs) this.begin('exit');
        break;
      }
      case 'exit': {
        const k = Math.min(1, t / EXIT_MS);
        pos = { x: e.x + (e.x - s.x) * 0.1 * k, y: e.y + (e.y - s.y) * 0.1 * k };
        phi = PHI_DRAG;
        tip = 1;
        alpha = 1 - k;
        if (t >= EXIT_MS) this.state = 'idle';
        break;
      }
      case 'idle':
        return;
    }

    // blade axis: along the aim and into the screen; the broad face turned toward the camera
    const a = Math.atan2(e.y - s.y, e.x - s.x);
    const sp = Math.sin(phi);
    this.dir.set(Math.cos(a) * sp, Math.sin(a) * sp, -Math.cos(phi));
    this.side.set(-Math.sin(a), Math.cos(a), 0);
    this.up.crossVectors(this.side, this.dir);
    this.basis.makeBasis(this.side, this.dir, this.up);

    const g = this.anchor;
    g.visible = true;
    g.quaternion.setFromRotationMatrix(this.basis);
    g.scale.setScalar(this.length / 1.4);
    g.position.set(pos.x, pos.y, z);
    this.sword?.position.set(-TIP_X * tip, -TIP_Y * tip, 0);
    for (const m of this.materials) m.opacity = Math.max(0, Math.min(1, alpha));
  }
}
