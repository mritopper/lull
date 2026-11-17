/**
 * Lull: a seated, hands-first wind-down ritual for the end of the day.
 *
 *   arrive  → pinch the ember to begin
 *   unload  → pinch thoughts out of the air and drop them into three jars
 *             sitting on your real desk (Tomorrow / Let it rest / Not mine to carry)
 *   breathe → open and close your hands around a lantern while the room dims
 *   close   → tonight's star joins your constellation; goodnight
 */
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Entity,
  Grabbed,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OneHandGrabbable,
  Points,
  PointsMaterial,
  Pressed,
  RayInteractable,
  RingGeometry,
  SphereGeometry,
  Quaternion,
  TorusGeometry,
  Vector3,
  VisibilityState,
  XRPlane,
  createSystem,
} from '@iwsdk/core';
import { audio } from './audio.js';
import { LullButton, Mote } from './lull-components.js';
import {
  JAR_KEYS,
  type JarKey,
  STARS_PER_CONSTELLATION,
  loadProgress,
  recordNight,
  saveProgress,
  skyState,
  streak,
} from './progress.js';
import { Label, getGlowTexture, glows, makeGlow } from './text.js';

type Phase = 'arrive' | 'unload' | 'breathe' | 'close';
type MoteState = 'float' | 'held' | 'filing' | 'filed' | 'gone';

const THOUGHTS = [
  'Unanswered messages',
  "Tomorrow's to-do list",
  'Something I said',
  'Money stuff',
  "Someone I'm worried about",
  "Work that isn't done",
  "A decision I'm avoiding",
  'Just background noise',
];
const MOTES_PER_NIGHT = 6;

const MOTE_COLORS = [0xffc98b, 0xffa9a9, 0xd7b8ff, 0x9fd8ff, 0xa8f0c6, 0xfff0a0];

const JAR_DEFS: { key: JarKey; title: string; color: number; note: number }[] = [
  { key: 'tomorrow', title: 'Tomorrow', color: 0xffc77a, note: 76 },
  { key: 'rest', title: 'Let it rest', color: 0x9ab8ff, note: 72 },
  { key: 'release', title: 'Not mine to carry', color: 0xc9ffe0, note: 79 },
];

const JAR_RADIUS = 0.048;
const JAR_HEIGHT = 0.11;
const JAR_SPACING = 0.165;
const FILE_RANGE = 0.12;

const BREATHS = 5;
const INHALE = 4;
const EXHALE = 6;
const CYCLE = INHALE + EXHALE;

interface MoteData {
  entity: Entity;
  text: string;
  state: MoteState;
  home: Vector3;
  from: Vector3;
  jar: number;
  t: number;
  core: Mesh;
  glow: Mesh;
  label: Label;
  phase: number;
  selected: boolean;
  /** Hand carrying this thought after a ray pinch (null when grabbed near-field). */
  carryHand: 'left' | 'right' | null;
}

interface JarData {
  entity: Entity;
  group: Group;
  rim: Mesh;
  glow: Mesh;
  glass: Mesh;
  label: Label;
  count: number;
  target: Vector3;
  pulse: number;
  inside: Mesh[];
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class LullSystem extends createSystem({
  buttonsPressed: { required: [LullButton, Pressed] },
  buttonsGrabbed: { required: [LullButton, Grabbed] },
  motesPressed: { required: [Mote, Pressed] },
  motesHeld: { required: [Mote, Grabbed] },
  planes: { required: [XRPlane] },
}) {
  private phase: Phase = 'arrive';
  private phaseTime = 0;
  private paused = false;
  private inXR = false;
  private layoutPending = 0;

  // Layout frame (seated user's head at ritual start).
  private origin = new Vector3(0, 1.2, 0);
  private fwd = new Vector3(0, 0, -1);
  private right = new Vector3(1, 0, 0);
  private up = new Vector3(0, 1, 0);
  private deskY = 0.78;
  private deskCenter = new Vector3();
  private deskFound = false;
  private deskLocked = false;
  private deskScanTimer = 0;

  private progress = loadProgress();
  private motes: MoteData[] = [];
  private jars: JarData[] = [];
  private filed: Record<JarKey, number> = { tomorrow: 0, rest: 0, release: 0 };
  private tomorrowTexts: string[] = [];
  private selectedMote: MoteData | null = null;

  // Objects
  private decor!: Group;
  private ember!: Entity;
  private emberCore!: Mesh;
  private emberGlow!: Mesh;
  private enough!: Entity;
  private enoughLabel!: Label;
  private moon!: Entity;
  private moonLabel!: Label;
  private prompt!: Label;
  private subPrompt!: Label;
  private shelf!: Mesh;
  private deskHalo!: Mesh;
  private dimmer!: Mesh;
  private dimMat!: MeshBasicMaterial;
  private stars!: Points;
  private starMat!: PointsMaterial;
  private lantern!: Group;
  private lanternCore!: Mesh;
  private lanternGlow!: Mesh;
  private guideRing!: Mesh;
  private guideMat!: MeshBasicMaterial;
  private sky!: Group;
  private skyStars: Mesh[] = [];
  private skyLines!: LineSegments;
  private skyLabel!: Label;
  private flyingStar: Mesh | null = null;
  private flyT = 0;
  private flyFrom = new Vector3();

  // Fireflies
  private ffPos!: Float32Array;
  private ffCol!: Float32Array;
  private ffVel!: Float32Array;
  private ffLife!: Float32Array;
  private ffPoints!: Points;
  private ffNext = 0;

  // Breathing
  private breathT = 0;
  private followErr = 0;
  private followSamples = 0;
  private userBreath = 0;
  private darkness = 0;
  private calm = -1;

  // Temps
  private v1 = new Vector3();
  private v2 = new Vector3();
  private v3 = new Vector3();
  private headPos = new Vector3();
  private m4 = new Matrix4();
  private col = new Color();

  init(): void {
    this.decor = new Group();
    this.world.createTransformEntity(this.decor, { persistent: true });

    this.buildEnvironment();
    this.buildPrompts();
    this.buildEmber();
    this.buildJars();
    this.buildMotes();
    this.buildButtons();
    this.buildLantern();
    this.buildSky();
    this.buildFireflies();

    this.queries.buttonsPressed.subscribe('qualify', (e) =>
      this.onButton(e.getValue(LullButton, 'action') ?? ''),
    );
    // A near pinch on a button arrives as a grab; treat it as a press.
    this.queries.buttonsGrabbed.subscribe('qualify', (e) => {
      this.onButton(e.getValue(LullButton, 'action') ?? '');
    });
    this.queries.motesPressed.subscribe('qualify', (e) => this.onMotePressed(e));
    this.queries.motesHeld.subscribe('qualify', (e) => {
      const m = this.moteFor(e);
      if (!m) return;
      if (m.state === 'held' && m.carryHand) m.carryHand = null; // grab takes over
      if (m.state === 'float') {
        m.state = 'held';
        audio.chime(84, 0.05);
      }
    });
    this.queries.motesHeld.subscribe('disqualify', (e) => {
      const m = this.moteFor(e);
      if (m && m.state === 'held' && !m.carryHand) this.onRelease(m);
    });

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((s) => {
        const wasXR = this.inXR;
        this.inXR = s !== VisibilityState.NonImmersive;
        this.paused = s === VisibilityState.VisibleBlurred;
        if (this.paused) audio.suspend();
        else audio.resume();
        if (this.inXR && !wasXR) {
          // Wait a few frames for the first real head pose, then lay out.
          this.layoutPending = 0.35;
        }
        if (!this.inXR && wasXR) this.layoutPending = 0.01;
      }),
    );

    this.layout();
    this.enterPhase('arrive');
    (window as unknown as { lull: LullSystem }).lull = this;
  }

  // ---------------------------------------------------------------- builders

  private buildEnvironment(): void {
    // Dimmer: the real room gently "goes to sleep" during the breathing phase.
    this.dimMat = new MeshBasicMaterial({
      color: 0x05040b,
      side: BackSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.dimmer = new Mesh(new SphereGeometry(3, 32, 16), this.dimMat);
    this.dimmer.renderOrder = -10;
    this.dimmer.visible = false;
    this.decor.add(this.dimmer);

    // Night sky that appears as the room dims.
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(1 - Math.random() * 1.15); // upper hemisphere + a little below
      const r = 2.7;
      pos[i * 3] = r * Math.sin(v) * Math.cos(u);
      pos[i * 3 + 1] = r * Math.cos(v);
      pos[i * 3 + 2] = r * Math.sin(v) * Math.sin(u);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    this.starMat = new PointsMaterial({
      size: 0.02,
      map: getGlowTexture(),
      color: 0xfff1d6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.stars = new Points(g, this.starMat);
    this.stars.renderOrder = -9;
    this.stars.visible = false;
    this.decor.add(this.stars);

    // Fallback shelf (when no desk is detected) and halo (when one is).
    this.shelf = new Mesh(
      new CylinderGeometry(0.26, 0.26, 0.006, 48),
      new MeshBasicMaterial({ color: 0x2a2240, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.decor.add(this.shelf);
    this.deskHalo = new Mesh(
      new RingGeometry(0.2, 0.32, 64),
      new MeshBasicMaterial({
        color: 0xffd9a8,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    this.deskHalo.rotation.x = -Math.PI / 2;
    this.decor.add(this.deskHalo);
  }

  private buildPrompts(): void {
    this.prompt = new Label('', { lineHeight: 0.026, weight: 600, maxWidthChars: 30 });
    this.subPrompt = new Label('', {
      lineHeight: 0.017,
      color: '#e9ddff',
      maxWidthChars: 54,
    });
    this.decor.add(this.prompt.mesh, this.subPrompt.mesh);
  }

  private buildEmber(): void {
    const g = new Group();
    this.emberCore = new Mesh(
      new SphereGeometry(0.03, 24, 16),
      new MeshBasicMaterial({ color: 0xffc27a, toneMapped: false }),
    );
    this.emberGlow = makeGlow(0xff9b4a, 0.22, 0.9);
    g.add(this.emberCore, this.emberGlow);
    g.name = 'ember';
    this.ember = this.world.createTransformEntity(g, { persistent: true });
    this.ember.addComponent(RayInteractable);
    this.ember.addComponent(LullButton, { action: 'begin' });
    this.ember.addComponent(OneHandGrabbable, { rotate: false, translate: false });
  }

  private buildJars(): void {
    JAR_DEFS.forEach((def, i) => {
      const group = new Group();
      const glass = new Mesh(
        new CylinderGeometry(JAR_RADIUS, JAR_RADIUS * 0.92, JAR_HEIGHT, 32, 1, true),
        new MeshBasicMaterial({
          color: def.color,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          side: BackSide,
        }),
      );
      glass.position.y = JAR_HEIGHT / 2;
      const front = new Mesh(
        glass.geometry,
        new MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.08,
          depthWrite: false,
        }),
      );
      front.position.y = JAR_HEIGHT / 2;
      const base = new Mesh(
        new CylinderGeometry(JAR_RADIUS * 0.92, JAR_RADIUS * 0.92, 0.006, 32),
        new MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.45 }),
      );
      base.position.y = 0.003;
      const rim = new Mesh(
        new TorusGeometry(JAR_RADIUS, 0.004, 8, 40),
        new MeshBasicMaterial({ color: def.color, toneMapped: false }),
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = JAR_HEIGHT;
      const glow = makeGlow(def.color, 0.2, 0.35);
      glow.position.y = JAR_HEIGHT * 0.55;
      const label = new Label(def.title, { lineHeight: 0.016, weight: 600 });
      label.mesh.position.y = JAR_HEIGHT + 0.045;
      group.add(glass, front, base, rim, glow, label.mesh);
      group.name = `jar-${def.key}`;
      const entity = this.world.createTransformEntity(group, { persistent: true });
      entity.addComponent(RayInteractable);
      entity.addComponent(LullButton, { action: `jar${i}` });
      this.jars.push({
        entity,
        group,
        rim,
        glow,
        glass,
        label,
        count: 0,
        target: new Vector3(),
        pulse: 0,
        inside: [],
      });
    });
  }

  private buildMotes(): void {
    // A gently shuffled selection so each night feels slightly different.
    const day = new Date().getDate();
    const order = THOUGHTS.map((t, i) => ({ t, k: (i * 7 + day * 3) % THOUGHTS.length }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.t)
      .slice(0, MOTES_PER_NIGHT);
    order.forEach((text, slot) => {
      const g = new Group();
      const color = MOTE_COLORS[slot % MOTE_COLORS.length];
      const core = new Mesh(
        new SphereGeometry(0.017, 20, 14),
        new MeshBasicMaterial({ color, toneMapped: false }),
      );
      const glow = makeGlow(color, 0.13, 0.75);
      const label = new Label(text, { lineHeight: 0.0135, maxWidthChars: 16 });
      label.mesh.position.y = -0.052;
      g.add(core, glow, label.mesh);
      g.name = `mote-${slot}`;
      const entity = this.world.createTransformEntity(g, { persistent: true });
      entity.addComponent(Mote, { slot });
      entity.addComponent(RayInteractable);
      entity.addComponent(OneHandGrabbable, { rotate: false, translate: true });
      g.visible = false;
      this.motes.push({
        entity,
        text,
        state: 'float',
        home: new Vector3(),
        from: new Vector3(),
        jar: -1,
        t: 0,
        core,
        glow,
        label,
        phase: slot * 1.7,
        selected: false,
        carryHand: null,
      });
    });
  }

  private buildButtons(): void {
    const eg = new Group();
    eg.add(
      new Mesh(
        new SphereGeometry(0.016, 16, 12),
        new MeshBasicMaterial({ color: 0xe8dcff, toneMapped: false }),
      ),
      makeGlow(0xb79cff, 0.09, 0.7),
    );
    this.enoughLabel = new Label("That's enough for tonight", {
      lineHeight: 0.013,
      maxWidthChars: 14,
    });
    this.enoughLabel.mesh.position.y = -0.045;
    eg.add(this.enoughLabel.mesh);
    eg.visible = false;
    eg.name = 'enough';
    this.enough = this.world.createTransformEntity(eg, { persistent: true });
    this.enough.addComponent(RayInteractable);
    this.enough.addComponent(LullButton, { action: 'enough' });
    this.enough.addComponent(OneHandGrabbable, { rotate: false, translate: false });

    const mg = new Group();
    const moonCore = new Mesh(
      new SphereGeometry(0.026, 24, 16),
      new MeshBasicMaterial({ color: 0xf4f0ff, toneMapped: false }),
    );
    const shadow = new Mesh(
      new SphereGeometry(0.0262, 24, 16),
      new MeshBasicMaterial({ color: 0x15122a }),
    );
    shadow.position.set(0.012, 0.006, 0.006);
    mg.add(moonCore, shadow, makeGlow(0xdcd6ff, 0.16, 0.55));
    this.moonLabel = new Label('Pinch the moon to say goodnight', {
      lineHeight: 0.013,
      maxWidthChars: 18,
    });
    this.moonLabel.mesh.position.y = -0.055;
    mg.add(this.moonLabel.mesh);
    mg.visible = false;
    mg.name = 'moon';
    this.moon = this.world.createTransformEntity(mg, { persistent: true });
    this.moon.addComponent(RayInteractable);
    this.moon.addComponent(LullButton, { action: 'goodnight' });
    this.moon.addComponent(OneHandGrabbable, { rotate: false, translate: false });
  }

  private buildLantern(): void {
    this.lantern = new Group();
    this.lanternCore = new Mesh(
      new SphereGeometry(0.03, 24, 16),
      new MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }),
    );
    this.lanternGlow = makeGlow(0xffa65a, 0.25, 0.85);
    this.guideMat = new MeshBasicMaterial({
      color: 0xcbb8ff,
      transparent: true,
      opacity: 0.8,
      toneMapped: false,
      depthWrite: false,
    });
    this.guideRing = new Mesh(new TorusGeometry(0.075, 0.0025, 8, 64), this.guideMat);
    this.lantern.add(this.lanternCore, this.lanternGlow, this.guideRing);
    this.lantern.visible = false;
    this.decor.add(this.lantern);
  }

  private buildSky(): void {
    this.sky = new Group();
    for (let i = 0; i < STARS_PER_CONSTELLATION; i++) {
      const s = makeGlow(0xffffff, 0.05, 0.25);
      this.skyStars.push(s);
      this.sky.add(s);
    }
    const lg = new BufferGeometry();
    lg.setAttribute('position', new BufferAttribute(new Float32Array(16 * 6), 3));
    this.skyLines = new LineSegments(
      lg,
      new LineBasicMaterial({ color: 0xffe2b8, transparent: true, opacity: 0.45 }),
    );
    this.sky.add(this.skyLines);
    this.skyLabel = new Label('', {
      lineHeight: 0.02,
      backing: true,
      color: '#ffe9c9',
      maxWidthChars: 40,
    });
    this.skyLabel.mesh.position.set(0, -0.15, 0);
    this.sky.add(this.skyLabel.mesh);
    this.decor.add(this.sky);
    this.refreshSky(false);
  }

  private buildFireflies(): void {
    const n = 180;
    this.ffPos = new Float32Array(n * 3);
    this.ffCol = new Float32Array(n * 4);
    this.ffVel = new Float32Array(n * 3);
    this.ffLife = new Float32Array(n);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.ffPos, 3));
    g.setAttribute('color', new BufferAttribute(this.ffCol, 4));
    this.ffPoints = new Points(
      g,
      new PointsMaterial({
        size: 0.018,
        map: getGlowTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.ffPoints.frustumCulled = false;
    this.decor.add(this.ffPoints);
  }

  // ------------------------------------------------------------------ layout

  /** Anchor the whole ritual to where the (seated) user is looking now. */
  private layout(): void {
    const cam = this.world.camera;
    cam.updateWorldMatrix(true, false);
    if (this.inXR) {
      cam.getWorldPosition(this.origin);
      cam.getWorldDirection(this.fwd);
    } else {
      // Browser preview: a seated viewer at the origin, camera set back a bit.
      this.origin.set(0, 1.2, 0);
      this.fwd.set(0, 0, -1);
    }
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-4) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    this.right.crossVectors(this.fwd, this.up).normalize();

    if (!this.deskLocked) {
      this.deskFound = false;
      this.deskY = this.origin.y - 0.38;
      this.at(this.deskCenter, 0.48, 0, 0);
      this.deskCenter.y = this.deskY;
    }
    this.placeJars(true);

    // Thought motes: an arc within comfortable seated reach (≈ 2 ft).
    const n = this.motes.length;
    this.motes.forEach((m, i) => {
      const a = ((i - (n - 1) / 2) / (n - 1)) * 1.05; // ±30°: inside a narrow FoV
      const r = 0.4;
      const y = (i % 2 === 0 ? -0.1 : -0.17) + 0;
      m.home
        .copy(this.origin)
        .addScaledVector(this.fwd, Math.cos(a) * r)
        .addScaledVector(this.right, Math.sin(a) * r);
      m.home.y += y;
      if (m.state === 'float' && m.entity.object3D) m.entity.object3D.position.copy(m.home);
    });

    this.at(this.ember.object3D!.position, 0.45, 0, -0.1);
    this.at(this.enough.object3D!.position, 0.36, 0.28, -0.33);
    this.at(this.moon.object3D!.position, 0.5, 0, -0.14);
    this.at(this.prompt.mesh.position, 0.62, 0, 0.065);
    this.at(this.subPrompt.mesh.position, 0.62, 0, 0.02);
    this.at(this.sky.position, 1.1, 0, 0.3);
    this.at(this.lantern.position, 0.34, 0, -0.14);
  }

  /** out = origin + fwd*f + right*r + up*u */
  private at(out: Vector3, f: number, r: number, u: number): Vector3 {
    return out
      .copy(this.origin)
      .addScaledVector(this.fwd, f)
      .addScaledVector(this.right, r)
      .addScaledVector(this.up, u);
  }

  private placeJars(snap: boolean): void {
    this.jars.forEach((jar, i) => {
      jar.target
        .copy(this.deskCenter)
        .addScaledVector(this.right, (i - 1) * JAR_SPACING);
      jar.target.y = this.deskY;
      if (snap) jar.group.position.copy(jar.target);
    });
    this.shelf.position.copy(this.deskCenter);
    this.shelf.position.y = this.deskY - 0.006;
    this.shelf.visible = !this.deskFound;
    this.deskHalo.position.copy(this.deskCenter);
    this.deskHalo.position.y = this.deskY + 0.002;
    this.deskHalo.visible = this.deskFound;
  }

  /**
   * Find a real horizontal surface (desk / table) below the user's head and
   * within reach, and set the jars on it. Uses WebXR plane detection via
   * IWSDK's SceneUnderstandingSystem.
   */
  private scanForDesk(): void {
    if (this.deskLocked || !this.inXR) return;
    let best = Infinity;
    let bestY = 0;
    const desired = this.at(this.v1, 0.48, 0, 0);
    for (const e of this.queries.planes.entities) {
      const plane = e.getValue(XRPlane, '_plane') as XRPlane | undefined;
      const obj = e.object3D;
      if (!plane || !obj || plane.orientation !== 'horizontal') continue;
      const label = (plane as unknown as { semanticLabel?: string }).semanticLabel;
      if (label === 'floor' || label === 'ceiling') continue;
      obj.updateWorldMatrix(true, false);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, y = 0;
      for (const p of plane.polygon) {
        this.v2.set(p.x, p.y, p.z).applyMatrix4(obj.matrixWorld);
        minX = Math.min(minX, this.v2.x);
        maxX = Math.max(maxX, this.v2.x);
        minZ = Math.min(minZ, this.v2.z);
        maxZ = Math.max(maxZ, this.v2.z);
        y = this.v2.y;
      }
      const drop = this.origin.y - y;
      if (drop < 0.18 || drop > 0.95) continue;
      const inset = 0.08;
      if (maxX - minX < inset * 2 || maxZ - minZ < inset * 2) continue;
      this.v3.set(
        Math.min(maxX - inset, Math.max(minX + inset, desired.x)),
        y,
        Math.min(maxZ - inset, Math.max(minZ + inset, desired.z)),
      );
      const dx = this.v3.x - desired.x;
      const dz = this.v3.z - desired.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.4) continue;
      if (d < best) {
        best = d;
        bestY = y;
        this.v2.copy(this.v3);
      }
    }
    if (best < Infinity) {
      const isNew = !this.deskFound;
      this.deskFound = true;
      this.deskY = bestY;
      this.deskCenter.copy(this.v2);
      this.placeJars(false);
      if (isNew) {
        audio.chime(88, 0.06);
        if (this.phase === 'arrive') this.subPrompt.set('Found your desk. Your jars are waiting there.');
      }
    }
  }

  // ------------------------------------------------------------------ phases

  private enterPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
    const emberObj = this.ember.object3D!;
    emberObj.visible = p === 'arrive';
    this.enough.object3D!.visible = false;
    this.moon.object3D!.visible = p === 'close';
    this.lantern.visible = p === 'breathe';

    if (p === 'arrive') {
      const nights = this.progress.nights.length;
      const s = streak(this.progress);
      if (nights === 0) {
        this.prompt.set('Pinch the ember to begin');
        this.subPrompt.set('Five quiet minutes to put the day down.');
      } else {
        this.prompt.set(`Welcome back. Night ${nights + 1}.`);
        const carried = this.progress.tomorrow;
        this.subPrompt.set(
          carried.length
            ? `Waiting in Tomorrow: ${carried.slice(0, 3).join(', ')}${carried.length > 3 ? '…' : ''}.\nPinch the ember to begin.`
            : `${s > 1 ? `${s} nights in a row. ` : ''}Pinch the ember to begin.`,
        );
      }
      // Last night's "Tomorrow" thoughts sit in the jar as small embers.
      this.fillJarFromMemory();
    }

    if (p === 'unload') {
      this.deskScanTimer = 0;
      this.prompt.set("What's still on your mind?");
      this.subPrompt.set('Pinch a thought, carry it to a jar, and let go.');
      this.motes.forEach((m, i) => {
        const o = m.entity.object3D!;
        o.visible = true;
        o.position.copy(this.ember.object3D!.position);
        m.from.copy(o.position);
        m.t = -i * 0.12; // staggered bloom outwards
        m.state = 'float';
      });
    }

    if (p === 'breathe') {
      this.deskLocked = true;
      this.breathT = -3;
      this.followErr = 0;
      this.followSamples = 0;
      this.prompt.set('Now, breathe with the lantern');
      this.subPrompt.set('Open your hands to breathe in. Bring them together to breathe out.');
      this.dimmer.visible = true;
      this.stars.visible = true;
      this.motes.forEach((m) => {
        if (m.state === 'float' || m.state === 'held') {
          // Unfiled thoughts drift quietly into "Let it rest".
          this.fileMote(m, 1);
        }
      });
    }

    if (p === 'close') {
      audio.setBreath(0, false);
      this.calm =
        this.followSamples > 30 ? clamp01(this.followErr / this.followSamples) : -1;
      const before = this.progress.nights.length;
      const { progress, newStar } = recordNight(
        this.progress,
        this.filed,
        Math.max(0, this.calm),
        [...this.tomorrowTexts],
      );
      this.progress = progress;
      saveProgress(progress);
      const total = progress.nights.length;
      const sky = skyState(total);
      this.prompt.set(newStar ? 'Tonight joins your sky' : 'Your sky, tonight');
      const parts: string[] = [];
      if (this.filed.tomorrow > 0)
        parts.push(
          `${this.filed.tomorrow} ${this.filed.tomorrow === 1 ? 'thought is' : 'thoughts are'} waiting in Tomorrow. You don't have to hold ${this.filed.tomorrow === 1 ? 'it' : 'them'} tonight.`,
        );
      if (this.filed.release > 0) parts.push(`You let ${this.filed.release} go.`);
      if (this.calm >= 0.4) parts.push(`Your breath moved with the lantern ${Math.round(this.calm * 100)}% of the time.`);
      this.subPrompt.set(parts.join(' ') || 'A quiet night. That counts too.');
      if (newStar) {
        // The new star rises out of the lantern to its place in the constellation.
        const idx = (total - 1) % STARS_PER_CONSTELLATION;
        const completedNow = sky.earned === 0 && total > 0;
        this.refreshSky(true, completedNow ? STARS_PER_CONSTELLATION : sky.earned, completedNow);
        this.flyingStar = this.skyStars[idx];
        this.flyFrom.copy(this.lantern.position);
        this.sky.worldToLocal(this.flyFrom);
        this.flyT = 0;
      } else {
        this.refreshSky(true);
      }
      void before;
    }
  }

  private fillJarFromMemory(): void {
    const jar = this.jars[0];
    jar.inside.forEach((s) => jar.group.remove(s));
    jar.inside = [];
    const carried = this.progress.tomorrow.length;
    for (let i = 0; i < Math.min(carried, 6); i++) this.addInside(jar, 0xffc77a, 0.5);
  }

  private addInside(jar: JarData, color: number, opacity: number): void {
    const k = jar.inside.length;
    const s = makeGlow(color, 0.05, opacity);
    const a = k * 2.3;
    s.position.set(Math.cos(a) * 0.02, 0.02 + (k % 4) * 0.02, Math.sin(a) * 0.02);
    jar.group.add(s);
    jar.inside.push(s);
  }

  // ------------------------------------------------------------------ events

  private lastAction = '';
  private lastActionAt = 0;

  private onButton(action: string): void {
    // A ray press and a near pinch can both fire for one gesture.
    const now = performance.now();
    if (action === this.lastAction && now - this.lastActionAt < 800) return;
    this.lastAction = action;
    this.lastActionAt = now;
    audio.start();
    if (action === 'begin' && this.phase === 'arrive') {
      audio.chime(69, 0.12);
      audio.chime(76, 0.08);
      this.burst(this.ember.object3D!.position, 0xffc27a, 26);
      this.enterPhase('unload');
    } else if (action === 'enough' && this.phase === 'unload') {
      audio.chime(64, 0.1);
      this.enterPhase('breathe');
    } else if (action === 'goodnight' && this.phase === 'close') {
      audio.chime(64, 0.1);
      audio.chime(71, 0.07);
      audio.fadeOut(3);
      if (this.inXR) setTimeout(() => this.world.exitXR(), 1800);
      setTimeout(() => this.restart(), 2200);
    } else if (action.startsWith('jar') && this.phase === 'unload' && this.selectedMote) {
      // Point-and-pinch path: pinch a thought from afar, then pinch a jar.
      const m = this.selectedMote;
      this.selectedMote = null;
      m.selected = false;
      if (m.state === 'float') this.fileMote(m, Number(action.slice(3)));
    }
  }

  private onMotePressed(e: Entity): void {
    audio.start();
    if (this.phase !== 'unload') return;
    const m = this.moteFor(e);
    if (!m || m.state !== 'float') return;
    if (this.inXR) {
      // Pinched from a distance: the thought flies to the pinching hand and
      // follows it until the pinch opens.
      const hand = this.pinchingHand(m.entity.object3D!.position);
      if (hand) {
        if (m.entity.hasComponent(Grabbed)) return;
        m.state = 'held';
        m.carryHand = hand;
        audio.chime(84, 0.05);
        return;
      }
    }
    if (this.selectedMote) this.selectedMote.selected = false;
    m.selected = true;
    this.selectedMote = m;
    audio.chime(81, 0.05);
    this.subPrompt.set(`Now pinch a jar for "${m.text}".`);
  }

  private pinchingHand(near: Vector3): 'left' | 'right' | null {
    const l = this.input.xr.getSelectState('left').active;
    const r = this.input.xr.getSelectState('right').active;
    if (l && r) {
      this.player.indexTipSpaces.left.getWorldPosition(this.v1);
      this.player.indexTipSpaces.right.getWorldPosition(this.v2);
      return this.v1.distanceTo(near) < this.v2.distanceTo(near) ? 'left' : 'right';
    }
    return l ? 'left' : r ? 'right' : null;
  }

  private onRelease(m: MoteData): void {
    m.carryHand = null;
    const o = m.entity.object3D!;
    let best = -1;
    let bestD = FILE_RANGE;
    this.jars.forEach((jar, i) => {
      this.v1.copy(jar.group.position);
      this.v1.y += JAR_HEIGHT * 0.8;
      const d = this.v1.distanceTo(o.position);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) {
      this.fileMote(m, best);
    } else {
      m.state = 'float';
      m.from.copy(o.position);
      m.t = 0;
    }
  }

  private fileMote(m: MoteData, jarIndex: number): void {
    if (m.entity.hasComponent(OneHandGrabbable)) m.entity.removeComponent(OneHandGrabbable);
    if (m.entity.hasComponent(RayInteractable)) m.entity.removeComponent(RayInteractable);
    if (this.selectedMote === m) this.selectedMote = null;
    m.selected = false;
    m.state = 'filing';
    m.jar = jarIndex;
    m.t = 0;
    m.from.copy(m.entity.object3D!.position);
    const def = JAR_DEFS[jarIndex];
    this.filed[def.key]++;
    if (def.key === 'tomorrow') this.tomorrowTexts.push(m.text);
    audio.chime(def.note, 0.14);
    if (def.key === 'release') setTimeout(() => audio.chime(def.note + 5, 0.08), 180);
  }

  private restart(): void {
    // Fresh session state, keep progress (sky + tomorrow list).
    this.filed = { tomorrow: 0, rest: 0, release: 0 };
    this.tomorrowTexts = [];
    this.darkness = 0;
    this.deskLocked = false;
    this.flyingStar = null;
    this.jars.forEach((j) => {
      j.count = 0;
    });
    this.motes.forEach((m) => {
      m.state = 'float';
      m.selected = false;
      m.carryHand = null;
      m.label.opacity = 1;
      m.entity.object3D!.visible = false;
      m.entity.object3D!.scale.setScalar(1);
      if (!m.entity.hasComponent(OneHandGrabbable))
        m.entity.addComponent(OneHandGrabbable, { rotate: false, translate: true });
      if (!m.entity.hasComponent(RayInteractable)) m.entity.addComponent(RayInteractable);
    });
    this.refreshSky(false);
    audio.fadeIn();
    this.layout();
    this.enterPhase('arrive');
  }

  private moteFor(e: Entity): MoteData | undefined {
    return this.motes.find((m) => m.entity === e);
  }

  // ------------------------------------------------------------------ sky

  private refreshSky(bright: boolean, earnedOverride?: number, completedNow = false): void {
    const total = this.progress.nights.length;
    const sky = skyState(completedNow ? total - 1 : total);
    const def = sky.constellation;
    const earned = earnedOverride ?? sky.earned;
    const w = 0.52;
    const h = 0.32;
    def.stars.forEach(([x, y], i) => {
      const s = this.skyStars[i];
      s.position.set((x - 0.5) * w, (y - 0.5) * h + 0.05, 0);
      const mat = s.material as MeshBasicMaterial;
      const on = i < earned;
      mat.color.setHex(on ? def.color : 0x8a86a8);
      mat.opacity = on ? (bright ? 1 : 0.75) : bright ? 0.45 : 0.3;
      s.scale.setScalar(on ? 0.075 : 0.04);
    });
    const arr = this.skyLines.geometry.getAttribute('position') as BufferAttribute;
    let k = 0;
    for (const [a, b] of def.lines) {
      if (a < earned && b < earned) {
        const pa = this.skyStars[a].position;
        const pb = this.skyStars[b].position;
        arr.setXYZ(k++, pa.x, pa.y, pa.z);
        arr.setXYZ(k++, pb.x, pb.y, pb.z);
      }
    }
    this.skyLines.geometry.setDrawRange(0, k);
    arr.needsUpdate = true;
    (this.skyLines.material as LineBasicMaterial).color.setHex(def.color);
    (this.skyLines.material as LineBasicMaterial).opacity = bright ? 0.55 : 0.25;
    const shown = Math.min(earned, STARS_PER_CONSTELLATION);
    this.skyLabel.set(
      total === 0 && !bright
        ? 'Each night you finish adds a star.'
        : `${def.name} · ${shown} of ${STARS_PER_CONSTELLATION} nights${sky.completed > 0 ? ` · ${sky.completed} ${sky.completed === 1 ? 'constellation' : 'constellations'} complete` : ''}`,
    );
    this.skyLabel.opacity = bright ? 1 : 0.6;
  }

  // ------------------------------------------------------------------ fx

  private burst(at: Vector3, color: number, count: number, upward = 0.05): void {
    this.col.setHex(color);
    const n = this.ffLife.length;
    for (let c = 0; c < count; c++) {
      const i = this.ffNext;
      this.ffNext = (this.ffNext + 1) % n;
      this.ffPos[i * 3] = at.x;
      this.ffPos[i * 3 + 1] = at.y;
      this.ffPos[i * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2;
      const sp = 0.03 + Math.random() * 0.08;
      this.ffVel[i * 3] = Math.cos(a) * sp;
      this.ffVel[i * 3 + 1] = upward + Math.random() * 0.08;
      this.ffVel[i * 3 + 2] = Math.sin(a) * sp;
      this.ffLife[i] = 1.6 + Math.random() * 1.6;
      this.ffCol[i * 4] = this.col.r;
      this.ffCol[i * 4 + 1] = this.col.g;
      this.ffCol[i * 4 + 2] = this.col.b;
      this.ffCol[i * 4 + 3] = 1;
    }
  }

  private updateFireflies(dt: number, time: number): void {
    const n = this.ffLife.length;
    for (let i = 0; i < n; i++) {
      if (this.ffLife[i] <= 0) {
        this.ffCol[i * 4 + 3] = 0;
        continue;
      }
      this.ffLife[i] -= dt;
      const wob = Math.sin(time * 3 + i) * 0.02;
      this.ffPos[i * 3] += (this.ffVel[i * 3] + wob) * dt;
      this.ffPos[i * 3 + 1] += this.ffVel[i * 3 + 1] * dt;
      this.ffPos[i * 3 + 2] += (this.ffVel[i * 3 + 2] - wob) * dt;
      this.ffVel[i * 3] *= 0.985;
      this.ffVel[i * 3 + 2] *= 0.985;
      this.ffVel[i * 3 + 1] += 0.012 * dt;
      this.ffCol[i * 4 + 3] = Math.min(1, this.ffLife[i] / 0.9);
    }
    (this.ffPoints.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.ffPoints.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }

  // ------------------------------------------------------------------ frame

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.05);
    if (this.layoutPending > 0) {
      this.layoutPending -= dt;
      if (this.layoutPending <= 0) {
        this.layoutPending = 0;
        this.layout();
      }
    }
    if (this.paused) return;
    this.phaseTime += dt;
    this.world.camera.getWorldPosition(this.headPos);

    // Before the ritual starts, follow the user if they sit down or turn
    // to face their desk, so everything stays within a seated reach.
    if (this.phase === 'arrive' && this.inXR && this.layoutPending === 0) {
      this.world.camera.getWorldDirection(this.v1);
      this.v1.y = 0;
      const turned = this.v1.lengthSq() > 1e-4 && this.v1.normalize().dot(this.fwd) < 0.82;
      if (this.headPos.distanceTo(this.origin) > 0.2 || turned) this.layout();
    }

    if (!this.deskLocked) {
      this.deskScanTimer -= dt;
      if (this.deskScanTimer <= 0) {
        this.deskScanTimer = 0.5;
        this.scanForDesk();
      }
    }

    // Prompts fade in after each change and face the viewer.
    this.billboard(this.prompt.mesh);
    this.billboard(this.subPrompt.mesh);
    this.billboard(this.skyLabel.mesh);

    this.faceGlows();
    this.updateJars(dt, time);
    this.updateMotes(dt, time);
    this.updateFireflies(dt, time);

    if (this.phase === 'arrive') {
      const pulse = 1 + Math.sin(time * 2.2) * 0.08;
      this.emberCore.scale.setScalar(pulse);
      this.emberGlow.scale.setScalar(0.22 * (1 + Math.sin(time * 2.2 + 0.6) * 0.15));
    }

    if (this.phase === 'unload') {
      const filedCount = this.motes.filter((m) => m.state === 'filing' || m.state === 'filed' || m.state === 'gone').length;
      const showEnough = filedCount > 0 && filedCount < this.motes.length;
      this.enough.object3D!.visible = showEnough;
      this.enoughLabel.opacity = showEnough ? 1 : 0;
      this.billboard(this.enoughLabel.mesh);
      if (filedCount === this.motes.length && this.motes.every((m) => m.state === 'filed' || m.state === 'gone')) {
        if (this.phaseTime > 1) this.enterPhase('breathe');
      }
    }

    if (this.phase === 'breathe') this.updateBreath(dt);
    else if (this.darkness > 0 && this.phase !== 'close') {
      this.darkness = Math.max(0, this.darkness - dt * 0.3);
    }

    if (this.phase === 'close') {
      this.updateClose(dt, time);
    }

    // Night falls: dim the real room, reveal the sky.
    this.dimMat.opacity = this.darkness * 0.82;
    this.starMat.opacity = Math.min(1, this.darkness * 1.3);
    this.dimmer.visible = this.darkness > 0.001;
    this.stars.visible = this.dimmer.visible;
    this.dimmer.position.copy(this.headPos);
    this.stars.position.copy(this.headPos);
    this.stars.rotation.y = time * 0.004;
    audio.setCalm(this.darkness);
  }

  private qCam = new Quaternion();
  private qParent = new Quaternion();

  private faceGlows(): void {
    this.world.camera.getWorldQuaternion(this.qCam);
    for (const g of glows) {
      const parent = g.parent;
      if (!parent || !g.visible) continue;
      parent.getWorldQuaternion(this.qParent);
      g.quaternion.copy(this.qParent.invert().multiply(this.qCam));
    }
  }

  private billboard(o: { position: Vector3; lookAt: (v: Vector3) => void; parent: unknown }): void {
    (o as unknown as Mesh).lookAt(this.headPos);
  }

  private updateJars(dt: number, time: number): void {
    let heldPos: Vector3 | null = null;
    for (const m of this.motes) if (m.state === 'held') heldPos = m.entity.object3D!.position;
    const sel = this.selectedMote != null;
    this.jars.forEach((jar, i) => {
      jar.group.position.lerp(jar.target, 1 - Math.exp(-dt * 4));
      let near = 0;
      if (heldPos) {
        this.v1.copy(jar.group.position);
        this.v1.y += JAR_HEIGHT * 0.8;
        near = clamp01(1 - (this.v1.distanceTo(heldPos) - 0.05) / 0.15);
      }
      if (sel && this.phase === 'unload') near = Math.max(near, 0.35 + 0.25 * Math.sin(time * 4 + i));
      jar.pulse = Math.max(0, jar.pulse - dt * 1.5);
      const glowAmt = 0.3 + near * 0.6 + jar.pulse;
      (jar.glow.material as MeshBasicMaterial).opacity = Math.min(1, glowAmt);
      jar.glow.scale.setScalar(0.18 + near * 0.08 + jar.pulse * 0.1);
      jar.rim.scale.setScalar(1 + near * 0.12);
      this.billboard(jar.label.mesh);
      for (let k = 0; k < jar.inside.length; k++) {
        const s = jar.inside[k];
        s.position.y = 0.02 + (k % 4) * 0.02 + Math.sin(time * 1.3 + k) * 0.004;
      }
    });
  }

  private updateMotes(dt: number, time: number): void {
    for (const m of this.motes) {
      const o = m.entity.object3D!;
      if (!o.visible) continue;
      this.billboard(m.label.mesh);
      if (m.state === 'float') {
        m.t += dt;
        const bloom = clamp01(m.t / 1.1);
        const bob = Math.sin(time * 1.1 + m.phase) * 0.008;
        this.v1.copy(m.home);
        this.v1.y += bob;
        if (bloom < 1) {
          o.position.lerpVectors(m.from, this.v1, ease(Math.max(0, bloom)));
          m.label.opacity = Math.max(0, bloom);
        } else {
          o.position.lerp(this.v1, 1 - Math.exp(-dt * 3));
          m.label.opacity = 1;
        }
        const s = m.selected ? 1.35 + Math.sin(time * 6) * 0.08 : 1;
        m.core.scale.setScalar(s);
        m.glow.scale.setScalar(0.13 * s);
      } else if (m.state === 'held') {
        m.label.opacity = 1;
        m.core.scale.setScalar(1.15);
        if (m.carryHand) {
          if (!this.input.xr.getSelectState(m.carryHand).active) {
            this.onRelease(m);
            continue;
          }
          this.player.indexTipSpaces[m.carryHand].getWorldPosition(this.v1);
          o.position.lerp(this.v1, 1 - Math.exp(-dt * 12));
        }
      } else if (m.state === 'filing') {
        m.t += dt;
        const jar = this.jars[m.jar];
        const k = clamp01(m.t / 0.9);
        // Arc up over the rim, then sink in.
        this.v1.copy(jar.group.position);
        this.v1.y += JAR_HEIGHT + 0.05;
        this.v2.copy(jar.group.position);
        this.v2.y += 0.035;
        if (k < 0.55) {
          o.position.lerpVectors(m.from, this.v1, ease(k / 0.55));
        } else {
          o.position.lerpVectors(this.v1, this.v2, ease((k - 0.55) / 0.45));
        }
        m.label.opacity = 1 - k;
        o.scale.setScalar(1 - k * 0.55);
        if (k >= 1) this.finishFiling(m);
      }
    }
  }

  private finishFiling(m: MoteData): void {
    const jar = this.jars[m.jar];
    const def = JAR_DEFS[m.jar];
    jar.pulse = 0.8;
    jar.count++;
    m.entity.object3D!.visible = false;
    if (def.key === 'release') {
      m.state = 'gone';
      // Released thoughts become fireflies and drift up and away.
      this.v1.copy(jar.group.position);
      this.v1.y += JAR_HEIGHT;
      this.burst(this.v1, 0xd9ffe6, 30, 0.12);
    } else {
      m.state = 'filed';
      this.addInside(jar, MOTE_COLORS[m.entity.getValue(Mote, 'slot') ?? 0], def.key === 'rest' ? 0.45 : 0.85);
    }
    const remaining = this.motes.filter((x) => x.state === 'float' || x.state === 'held').length;
    if (this.phase === 'unload') {
      this.subPrompt.set(
        remaining > 0
          ? def.key === 'release'
            ? 'Released. Not yours to carry tonight.'
            : def.key === 'tomorrow'
              ? 'Saved for tomorrow. It will be here.'
              : 'Resting. It can wait.'
          : 'Everything is set down.',
      );
    }
  }

  private updateBreath(dt: number): void {
    this.breathT += dt;
    const t = this.breathT;
    // Guide value: 0 = empty lungs, 1 = full.
    let g = 0;
    let inhaling = true;
    let breathIndex = 0;
    if (t >= 0) {
      breathIndex = Math.floor(t / CYCLE);
      const c = t % CYCLE;
      if (c < INHALE) {
        g = ease(c / INHALE);
      } else {
        inhaling = false;
        g = 1 - ease((c - INHALE) / EXHALE);
      }
    }

    // User value from hands: distance between hands, or one hand's height.
    const leftOk = this.inXR && this.input.xr.getPrimaryInputSource('left') != null;
    const rightOk = this.inXR && this.input.xr.getPrimaryInputSource('right') != null;
    const L = this.player.gripSpaces.left;
    const R = this.player.gripSpaces.right;
    let u = g;
    let measured = false;
    // A hand only counts while it is raised in front of you; a hand resting
    // in your lap is ignored, so one-handed breathing works naturally.
    L.getWorldPosition(this.v1);
    R.getWorldPosition(this.v2);
    const leftUp = leftOk && this.handRaised(this.v1);
    const rightUp = rightOk && this.handRaised(this.v2);
    if (leftUp && rightUp) {
      u = clamp01((this.v1.distanceTo(this.v2) - 0.12) / 0.32);
      measured = true;
      // Lantern floats between your hands.
      this.v3.addVectors(this.v1, this.v2).multiplyScalar(0.5);
      this.lantern.position.lerp(this.v3, 1 - Math.exp(-dt * 3));
    } else if (leftUp || rightUp) {
      // One-handed: raise your hand to breathe in, lower to breathe out.
      const hand = leftUp ? this.v1 : this.v2;
      u = clamp01((hand.y - (this.origin.y - 0.5)) / 0.3);
      measured = true;
    }
    this.userBreath += (u - this.userBreath) * (1 - Math.exp(-dt * 6));
    if (measured && t >= 0) {
      if (Math.abs(this.userBreath - g) < 0.3) this.followErr++;
      this.followSamples++;
    }

    this.lanternCore.scale.setScalar(0.7 + this.userBreath * 1.1);
    this.lanternGlow.scale.setScalar(0.18 + this.userBreath * 0.22);
    this.guideRing.scale.setScalar(0.7 + g * 1.1);
    this.guideRing.lookAt(this.headPos);
    this.guideMat.opacity = t < 0 ? 0.3 : 0.85;
    audio.setBreath(this.userBreath, t >= 0);

    if (t < 0) {
      this.prompt.set('Now, breathe with the lantern');
    } else if (breathIndex < BREATHS) {
      this.prompt.set(inhaling ? 'Breathe in…' : '…and slowly out');
      this.subPrompt.set(
        `${measured ? (inhaling ? 'Open your hands.' : 'Bring them together.') : 'Follow the ring.'}  Breath ${breathIndex + 1} of ${BREATHS}`,
      );
    }
    // Room dims over the course of the breathing.
    this.darkness = clamp01((t + 1) / (BREATHS * CYCLE * 0.75));
    if (t >= BREATHS * CYCLE) this.enterPhase('close');
  }

  private handRaised(p: Vector3): boolean {
    return p.y > this.headPos.y - 0.55 && p.distanceTo(this.headPos) < 0.75;
  }

  private updateClose(dt: number, time: number): void {
    this.darkness = Math.min(1, this.darkness + dt * 0.05);
    this.billboard(this.moonLabel.mesh);
    this.sky.lookAt(this.headPos);
    if (this.flyingStar) {
      this.flyT += dt / 2.6;
      const k = ease(clamp01(this.flyT));
      const target = this.v2;
      const idx = this.skyStars.indexOf(this.flyingStar);
      const def = skyState(this.progress.nights.length - 1).constellation;
      const [x, y] = def.stars[idx];
      target.set((x - 0.5) * 0.52, (y - 0.5) * 0.32 + 0.05, 0);
      this.flyingStar.position.lerpVectors(this.flyFrom, target, k);
      this.flyingStar.position.z += Math.sin(k * Math.PI) * 0.15;
      this.flyingStar.scale.setScalar(0.075 + Math.sin(k * Math.PI) * 0.08);
      if (this.flyT >= 1) {
        this.flyingStar.position.copy(target);
        this.flyingStar = null;
        audio.chime(81, 0.12);
        audio.chime(88, 0.07);
        this.sky.localToWorld(this.v3.copy(target));
        this.burst(this.v3, def.color, 20, 0.02);
      }
    }
    const moon = this.moon.object3D!;
    moon.position.y += Math.sin(time * 0.9) * 0.00008;
  }
}
