/**
 * The 3D sword for aiming and slashing, drawn with three.js into a transparent canvas over the
 * painting. Seen from the player's seat in front of the screen:
 *
 *   aim      the sword is held a little way off the line, beside it and toward the camera, with its
 *            tip aimed at the start of the line: poised to cut (real perspective);
 *   swing    on release the hand stays put and the blade whips through one quick arc, so the point
 *            where it pierces the painting runs from the start of the line to the end;
 *   exit     it follows through a little past the end and fades out.
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

/** Where the hand holds the model, and where its tip is, in model units (blade length 1). */
const HAND_Y = -0.5;
const TIP_Y = 0.68;

const EXIT_MS = 150;
const HOLD_MS = 120; // how long a released sword waits for the shot to fire before giving up
const FADE_IN_MS = 110;

/** How far the held sword sits from the line: sideways, and toward the camera (css pixels). */
const OFFSET_SIDE = 90;
const OFFSET_NEAR = 170;

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

const easeInOut = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

type State = 'idle' | 'aim' | 'held' | 'swing' | 'exit';

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
  private swingMs = 200;

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
    if (this.state === 'swing' || this.state === 'exit') return; // let the last swing finish
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

  /** The shot fired along (x0, y0) to (x1, y1) (clamped aim, in grid cells): swing through it. */
  fire(id: string, x0: number, y0: number, x1: number, y1: number): void {
    if (!this.renderer) return;
    this.fit();
    this.setLook(id);
    this.setLine(x0, y0, x1, y1);
    if (this.state === 'idle') this.opacity = 1;
    this.begin('swing');
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
    this.swingMs = Math.min(260, Math.max(130, len / 2.6));
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
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    // the side of the line nearer the player: below it on screen (right of it for a vertical line)
    const sign = Math.cos(ang) >= 0 ? -1 : 1;
    const nx = -Math.sin(ang) * sign;
    const ny = Math.cos(ang) * sign;

    // the hand: beside the middle of the line and toward the camera
    const hand = new Vector3((s.x + e.x) / 2 + nx * OFFSET_SIDE, (s.y + e.y) / 2 + ny * OFFSET_SIDE, OFFSET_NEAR);
    // where the blade pierces the painting: poised at the start, then runs along the line
    let k = 0;
    let alpha = 1;
    const t = now - this.since;

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
      case 'swing':
        k = easeInOut(t / this.swingMs);
        if (t >= this.swingMs) this.begin('exit');
        break;
      case 'exit': {
        const x = Math.min(1, t / EXIT_MS);
        k = 1 + 0.12 * x;
        alpha = 1 - x;
        if (t >= EXIT_MS) this.state = 'idle';
        break;
      }
      case 'idle':
        return;
    }

    // the hand drifts a little with the swing and pushes forward, like a real cut
    const follow = Math.min(1, k);
    hand.x += dx * 0.18 * follow;
    hand.y += dy * 0.18 * follow;
    hand.z -= OFFSET_NEAR * 0.2 * follow;

    const tip = new Vector3(s.x + dx * k, s.y + dy * k, 0);
    this.dir.subVectors(tip, hand).normalize();
    // broad face toward the camera
    this.up.set(0, 0, 1);
    this.up.addScaledVector(this.dir, -this.dir.z).normalize();
    this.side.crossVectors(this.dir, this.up).normalize();
    this.up.crossVectors(this.side, this.dir);
    this.basis.makeBasis(this.side, this.dir, this.up);

    // long enough that the tip still reaches the painting from the hand to either end of the line
    const reach = Math.max(hand.distanceTo(new Vector3(s.x, s.y, 0)), hand.distanceTo(new Vector3(e.x, e.y, 0))) * 1.2 + len * 0.05;
    const g = this.anchor;
    g.visible = true;
    g.quaternion.setFromRotationMatrix(this.basis);
    g.scale.setScalar(Math.max(260, reach) / (TIP_Y - HAND_Y));
    g.position.copy(hand);
    this.sword?.position.set(0, -HAND_Y, 0); // the hand, not the middle, sits at the anchor
    for (const m of this.materials) m.opacity = Math.max(0, Math.min(1, alpha));
  }
}
