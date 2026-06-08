class SeededRandom {
  constructor(seed) { this.seed = seed >>> 0; }
  next() {
    this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
    return this.seed / 0xFFFFFFFF;
  }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
}

function makeSeed() {
  const now = new Date();
  let s = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  s = s * 31337 + now.getDate() * 997 + (now.getMonth() + 1) * 73;
  return (s >>> 0) || 12345;
}

let SEED = makeSeed();
let rng = new SeededRandom(SEED);
document.getElementById('seed-display').textContent =
  'Seed · ' + SEED.toString(16).toUpperCase().padStart(8, '0');

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 300);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 0.5;
container.appendChild(renderer.domElement);

function generatePalette(rng) {
  const baseHue = rng.range(0, 360);
  const schemes = [
    [baseHue, baseHue + 30, baseHue + 60],
    [baseHue, baseHue + 120, baseHue + 240],
    [baseHue, baseHue + 180, baseHue + 190],
  ];
  const hues = rng.pick(schemes);
  return {
    hues,
    ambient: `hsl(${hues[0]}, 15%, 4%)`,
    stone: new THREE.Color().setHSL(hues[0] / 360, 0.12, rng.range(0.10, 0.18)),
    floor: new THREE.Color().setHSL(hues[0] / 360, 0.14, rng.range(0.07, 0.13)),
    light1: new THREE.Color().setHSL(hues[1] / 360, 0.9, 0.65),
    light2: new THREE.Color().setHSL(hues[2] / 360, 0.85, 0.6),
    glass: hues.map(h => new THREE.Color().setHSL(h / 360, 1.0, 0.6)),
    fog: new THREE.Color().setHSL(hues[0] / 360, 0.18, 0.04),
  };
}

let allObjects = [];
let lights = [];
let windowMeshes = [];
let palette;

function clearScene() {
  allObjects.forEach(o => {
    scene.remove(o);
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material.dispose();
    }
  });
  lights.forEach(l => scene.remove(l));
  allObjects = []; lights = []; windowMeshes = [];
}

function buildCathedral() {
  clearScene();
  rng = new SeededRandom(SEED);
  palette = generatePalette(rng);
  const navLength = rng.range(40, 80);
  const navWidth = rng.range(18, 30);
  const navHeight = rng.range(20, 35);
  const aisleW = rng.range(6, 10);
  const pillarRows = rng.int(4, 9);
  const hasCrossing = rng.next() > 0.3;
  const archStyle = rng.pick(['gothic', 'romanesque', 'baroque']);
  scene.background = palette.fog;
  scene.fog = new THREE.FogExp2(palette.fog, 0.006);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: palette.stone,
    roughness: 0.9,
    metalness: 0.05,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: palette.floor,
    roughness: 0.9,
    metalness: 0.02,
  });
  const floorGeo = new THREE.PlaneGeometry(navWidth + aisleW * 2 + 4, navLength + 10);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  allObjects.push(floor);
  addFloorTiles(navWidth + aisleW * 2, navLength, stoneMat);
  buildWalls(navWidth, navLength, navHeight, aisleW, stoneMat);
  buildPillars(navWidth, navLength, navHeight, aisleW, pillarRows, archStyle, stoneMat);
  buildCeiling(navWidth, navLength, navHeight, pillarRows, archStyle, stoneMat);
  buildWindows(navWidth, navLength, navHeight, aisleW, pillarRows);
  buildAltar(navLength, navHeight, stoneMat);
  if (hasCrossing) buildCrossing(navHeight, stoneMat);
  buildCandles(navWidth, navLength);
  const amblight = new THREE.AmbientLight(palette.fog, 0.08);
  scene.add(amblight); lights.push(amblight);
  const dirLight = new THREE.DirectionalLight(palette.light1, 0.18);
  dirLight.position.set(0, navHeight * 0.9, -navLength * 0.2);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  scene.add(dirLight); lights.push(dirLight);
  const fillLight = new THREE.DirectionalLight(palette.light2, 0.1);
  fillLight.position.set(0, navHeight * 0.5, navLength * 0.5);
  scene.add(fillLight);
  lights.push(fillLight);
  const hemi = new THREE.HemisphereLight(palette.light1, palette.fog, 0.06);
  scene.add(hemi);
  lights.push(hemi);
  buildWaypoints(navLength);
  updateAudio(palette);
}

function addFloorTiles(w, l, mat) {
  const tileSize = rng.range(1.5, 3);
  const cols = Math.floor(w / tileSize);
  const rows = Math.floor(l / tileSize);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0) {
        const tg = new THREE.PlaneGeometry(tileSize * 0.98, tileSize * 0.98);
        const tm = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(palette.stone.getHSL({}).h, 0.05, rng.range(0.18, 0.28)), roughness: 0.8,
        });
        const tile = new THREE.Mesh(tg, tm);
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(
          (c - cols / 2 + 0.5) * tileSize, 0.001,
          (r - rows / 2 + 0.5) * tileSize
        );
        tile.receiveShadow = true;
        scene.add(tile);
        allObjects.push(tile);
      }
    }
  }
}

function buildWalls(nw, nl, nh, aw, mat) {
  const totalW = nw + aw * 2;
  const walls = [
    { w: totalW + 1, h: nh, x: 0, z: -nl / 2, ry: 0 },
    { w: totalW + 1, h: nh, x: 0, z:  nl / 2, ry: Math.PI },
    { w: nl, h: nh, x: -totalW / 2, z: 0, ry: Math.PI / 2 },
    { w: nl, h: nh, x:  totalW / 2, z: 0, ry: -Math.PI / 2 },
  ];
  walls.forEach(w => {
    const geo = new THREE.BoxGeometry(w.w, w.h, 0.5);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(w.x, w.h / 2, w.z);
    mesh.rotation.y = w.ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    allObjects.push(mesh);
  });
}

function buildPillars(nw, nl, nh, aw, rows, style, mat) {
  const spacing = nl / (rows + 1);
  const px = nw / 2;
  const pillarR = rng.range(0.5, 1.0);
  const pillarH = nh * rng.range(0.55, 0.75);
  for (let i = 1; i <= rows; i++) {
    const z = -nl / 2 + spacing * i;
    [-px, px].forEach(x => {
      addBox(pillarR * 2.2, 0.5, pillarR * 2.2, x, 0.25, z, mat);
      const seg = style === 'gothic' ? 8 : (style === 'romanesque' ? 6 : 10);
      const geo = new THREE.CylinderGeometry(pillarR, pillarR * 1.1, pillarH, seg);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, pillarH / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      allObjects.push(m);
      const cGeo = new THREE.CylinderGeometry(pillarR * 1.6, pillarR * 1.1, 0.8, seg);
      const cap = new THREE.Mesh(cGeo, mat);
      cap.position.set(x, pillarH + 0.4, z);
      scene.add(cap);
      allObjects.push(cap);
      if (style === 'gothic') {
        for (let a = 0; a < 4; a++) {
          const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
          const sr = pillarR * 0.3;
          const sg = new THREE.CylinderGeometry(sr, sr, pillarH * 0.9, 6);
          const sm = new THREE.Mesh(sg, mat);
          sm.position.set(
            x + Math.cos(ang) * pillarR * 1.2,
            pillarH * 0.45,
            z + Math.sin(ang) * pillarR * 1.2
          );
          scene.add(sm);
          allObjects.push(sm);
        }
      }
      buildRib(x, pillarH + 0.8, z, 0, nh, nw / 2, style, mat);
    });
  }
}

function buildRib(x, y, z, tx, ty, tw, style, mat) {
  const points = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px2 = x + (Math.sign(-x) * tw * 0.5) * t;
    const curve = style === 'gothic'
      ? Math.sin(t * Math.PI) * (ty - y) * 0.5
      : Math.sin(t * Math.PI * 0.8) * (ty - y) * 0.4;
    points.push(new THREE.Vector3(px2, y + curve, z));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 16, 0.12, 5, false);
  const m = new THREE.Mesh(geo, mat);
  scene.add(m);
  allObjects.push(m);
}

function buildCeiling(nw, nl, nh, rows, style, mat) {
  const ceilingGeo = new THREE.BoxGeometry(nw + 1, 0.5, nl);
  const ceil = new THREE.Mesh(ceilingGeo, mat);
  ceil.position.set(0, nh, 0);
  scene.add(ceil);
  allObjects.push(ceil);
  const spacing = nl / (rows + 1);
  for (let i = 1; i <= rows; i++) {
    const z = -nl / 2 + spacing * i;
    const kgeo = new THREE.SphereGeometry(0.3, 6, 6);
    const km = new THREE.Mesh(kgeo, mat);
    km.position.set(0, nh - 0.3, z);
    scene.add(km);
    allObjects.push(km);
  }
}

function buildWindows(nw, nl, nh, aw, rows) {
  const spacing = nl / (rows + 1);
  const wHeight = rng.range(4, 8);
  const wWidth = rng.range(1.5, 3);
  const totalW = nw + aw * 2;
  const sides = [-totalW / 2 - 0.1, totalW / 2 + 0.1];
  for (let i = 1; i <= rows; i++) {
    const z = -nl / 2 + spacing * i;
    sides.forEach((x, si) => {
      const col = palette.glass[i % palette.glass.length];
      const col2 = palette.glass[(i + 1) % palette.glass.length];
      buildStainedWindow(x, nh * 0.55, z, wWidth, wHeight, col, col2, si === 0 ? Math.PI / 2 : -Math.PI / 2);
    });
  }
  buildRoseWindow(0, nh * 0.65, -nl / 2 - 0.1, rng.range(4, 7), palette.glass);
}

function buildStainedWindow(x, y, z, w, h, col1, col2, ry) {
  const divisions = rng.int(2, 5);
  const segH = h / divisions;
  for (let d = 0; d < divisions; d++) {
    const segs = rng.int(1, 4);
    for (let s = 0; s < segs; s++) {
      const sw = w / segs;
      const col = d % 2 === 0 ? col1 : col2;
      const opacity = rng.range(0.6, 0.9);
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide,
        roughness: 0.1,
        metalness: 0.0,
      });
      const shape = rng.next() > 0.5
        ? new THREE.PlaneGeometry(sw * 0.88, segH * 0.9)
        : buildArchShape(sw * 0.88, segH * 0.9);
      const mesh = new THREE.Mesh(shape, mat);
      mesh.userData.baseOpacity = opacity;
      mesh.position.set(x, y - h / 2 + segH * d + segH / 2, z + (s - segs / 2 + 0.5) * sw);
      mesh.rotation.y = ry;
      const pl = new THREE.PointLight(col, rng.range(2.0, 3.5), rng.range(14, 28));
      pl.position.copy(mesh.position);
      pl.position.x += (ry > 0 ? 1 : -1) * 2.5;
      scene.add(pl);
      lights.push(pl);
      scene.add(mesh);
      windowMeshes.push(mesh);
      allObjects.push(mesh);
    }
    const leadMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (let ld = 1; ld < divisions; ld++) {
      const geo = new THREE.PlaneGeometry(w, 0.06);
      const lead = new THREE.Mesh(geo, leadMat);
      lead.position.set(x, y - h / 2 + segH * ld, z);
      lead.rotation.y = ry;
      scene.add(lead);
      allObjects.push(lead);
    }
  }
}

function buildArchShape(w, h) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(-w / 2, h * 0.6);
  shape.quadraticCurveTo(0, h * 1.1, w / 2, h * 0.6);
  shape.lineTo(w / 2, 0);
  shape.lineTo(-w / 2, 0);
  return new THREE.ShapeGeometry(shape);
}

function buildRoseWindow(x, y, z, radius, colors) {
  const petals = rng.int(8, 16);
  for (let i = 0; i < petals; i++) {
    const ang = (i / petals) * Math.PI * 2;
    const col = colors[i % colors.length];
    const roseOpacity = rng.range(0.6, 0.85);
    const mat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: roseOpacity,
      side: THREE.DoubleSide,
      roughness: 0.1,
      metalness: 0.0,
    });
    const pw = (2 * Math.PI * radius / petals) * 0.85;
    const ph = radius * 0.42;
    const geo = new THREE.PlaneGeometry(pw, ph);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(
      x + Math.cos(ang) * radius * 0.55,
      y + Math.sin(ang) * radius * 0.55,
      z
    );
    m.rotation.z = ang;
    scene.add(m);
    windowMeshes.push(m);
    allObjects.push(m);
    if (i === 0) {
      const pl = new THREE.PointLight(colors[0], 4.0, 38);
      pl.position.set(x, y, z + 3);
      scene.add(pl); lights.push(pl);
    }
  }
  const centerMat = new THREE.MeshStandardMaterial({
    color: colors[0],
    emissive: colors[0],
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    roughness: 0.1,
    metalness: 0.0,
  });
  const centerGeo = new THREE.CircleGeometry(radius * 0.18, 16);
  const center = new THREE.Mesh(centerGeo, centerMat);
  center.position.set(x, y, z);
  scene.add(center);
  allObjects.push(center);
}

function buildAltar(nl, nh, mat) {
  const altarZ = -nl / 2 + rng.range(3, 7);
  const altarH = rng.range(1.2, 2.5);
  const altarW = rng.range(3, 6);
  const altarD = rng.range(1.5, 3);
  addBox(altarW, altarH, altarD, 0, altarH / 2, altarZ, mat);
  const redH = rng.range(5, 10);
  addBox(altarW * 1.1, redH, 0.4, 0, altarH + redH / 2, altarZ - altarD / 2, mat);
  const niches = rng.int(1, 4);
  for (let n = 0; n < niches; n++) {
    const nx = (n - (niches - 1) / 2) * (altarW / niches);
    const ng = buildArchShape(altarW / niches * 0.7, redH * 0.5);
    const nm = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(palette.hues[1] / 360, 0.3, 0.15), roughness: 0.8,
    }));
    nm.position.set(nx, altarH + redH * 0.3, altarZ - altarD / 2 - 0.21);
    scene.add(nm);
    allObjects.push(nm);
  }
  for (let c = -2; c <= 2; c++) {
    const cx = c * (altarW * 0.18);
    addCandle(cx, altarH, altarZ + altarD * 0.1, rng.range(0.3, 0.9));
  }
}

function buildCrossing(nh, mat) {
  const ch = nh * 1.2;
  const cr = rng.range(4, 7);
  const drum = new THREE.CylinderGeometry(cr, cr, nh * 0.2, 12, 1, true);
  const dm = new THREE.Mesh(drum, mat);
  dm.position.set(0, ch * 0.85, 0);
  scene.add(dm);
  allObjects.push(dm);
  const dome = new THREE.SphereGeometry(cr, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const dom = new THREE.Mesh(dome, mat);
  dom.position.set(0, ch, 0);
  scene.add(dom);
  allObjects.push(dom);
  const ll = new THREE.PointLight(palette.light1, 3.5, 55);
  ll.position.set(0, ch + cr * 0.5, 0);
  scene.add(ll);
  lights.push(ll);
}

function buildCandles(nw, nl) {
  const count = rng.int(8, 20);
  for (let i = 0; i < count; i++) {
    const cx = rng.range(-nw / 2 + 1, nw / 2 - 1);
    const cz = rng.range(-nl / 2 + 2, nl / 2 - 2);
    addCandle(cx, 0, cz, rng.range(0.1, 0.6));
  }
}

function addCandle(x, baseY, z, brightness) {
  const h = rng.range(0.3, 1.2);
  const r = rng.range(0.04, 0.12);
  const geo = new THREE.CylinderGeometry(r, r * 1.1, h, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf5e6c8,
    roughness: 0.7
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, baseY + h / 2, z);
  scene.add(m);
  allObjects.push(m);
  const fgeo = new THREE.SphereGeometry(r * 1.5, 6, 6);
  const fmat = new THREE.MeshBasicMaterial({
    color: 0xffcc44,
    transparent: true,
    opacity: 0.9
  });
  const flame = new THREE.Mesh(fgeo, fmat);
  flame.position.set(x, baseY + h + r * 1.5, z);
  flame.userData.isFlame = true;
  scene.add(flame);
  allObjects.push(flame);
  const pl = new THREE.PointLight(0xff8822,
    brightness * 2.5, rng.range(6, 16)
  );
  pl.position.set(x, baseY + h + 0.2, z);
  pl.userData.baseIntensity = brightness;
  pl.castShadow = false;
  scene.add(pl);
  lights.push(pl);
}

function addBox(w, h, d, x, y, z, mat) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  allObjects.push(m);
  return m;
}


let audioCtx = null;
let audioNodes = [];
let soundEnabled = true;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function updateAudio(pal) {
  if (!audioCtx || !soundEnabled) return;
  audioNodes.forEach(n => {
    try { n.stop(); } catch(e) {}
  });
  audioNodes = [];
  const hsl = {};
  pal.light1.getHSL(hsl);
  const baseFreq = 80 + hsl.h * 3;
  const chordIntervals = hsl.h < 0.3
    ? [1, 1.2, 1.5, 1.8]
    : (hsl.h < 0.6 ? [1, 1.25, 1.5, 2.0] : [1, 1.125, 1.5, 1.75]);
  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0, audioCtx.currentTime);
  master.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 4);
  master.connect(audioCtx.destination);
  const reverb = audioCtx.createConvolver();
  const len = audioCtx.sampleRate * 6;
  const buffer = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  }
  reverb.buffer = buffer;
  reverb.connect(master);
  chordIntervals.forEach((interval, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = i === 0 ? 'sine' : (i === 1 ? 'triangle' : 'sine');
    osc.frequency.value = baseFreq * interval + (i * 0.3);
    gain.gain.value = i === 0 ? 0.8 : (0.5 / (i + 1));
    osc.connect(gain);
    gain.connect(reverb);
    osc.start();
    audioNodes.push(osc);
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.frequency.value = 0.1 + i * 0.05;
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();
    audioNodes.push(lfo);
  });
}

function stopAudio() {
  audioNodes.forEach(n => { try { n.stop(); } catch(e) {} });
  audioNodes = [];
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  document.getElementById('sound-btn').textContent = 'Sound: ' + (soundEnabled ? 'On' : 'Off');
  if (!soundEnabled) stopAudio();
  else if (audioCtx) updateAudio(palette);
}

let pressureSeed = 0;
document.addEventListener('touchstart', e => {
  const t = e.touches[0];
  const force = t.force || t.webkitForce || 0.5;
  pressureSeed = Math.floor(force * 9999);
  if (pressureSeed > 0) {
    SEED = (SEED ^ pressureSeed) >>> 0 || 1;
  }
}, { passive: true });

let autoWalk = true;
let walkT = 0;
let walkSegment = 0;
let walkWaypoints = [];
let walkOrigin = new THREE.Vector3();
let walkDest = new THREE.Vector3();

function buildWaypoints(navLength) {
  const nl = navLength || 50;
  walkWaypoints = [
    new THREE.Vector3(0, 2.2,  nl * 0.45),
    new THREE.Vector3(0, 2.5,  nl * 0.15),
    new THREE.Vector3(0, 2.8,  0),
    new THREE.Vector3(0, 2.5, -nl * 0.2),
    new THREE.Vector3(0, 2.2, -nl * 0.4),
    new THREE.Vector3(0, 2.5, -nl * 0.2),
    new THREE.Vector3(0, 2.8,  0),
    new THREE.Vector3(0, 2.5,  nl * 0.15),
  ];
  walkSegment = 0;
  walkT = 0;
  walkOrigin.copy(walkWaypoints[0]);
  walkDest.copy(walkWaypoints[1]);
  camera.position.copy(walkOrigin);
}

function toggleWalk() {
  autoWalk = !autoWalk;
  document.getElementById('walk-btn').textContent = 'Auto-Walk: ' + (autoWalk ? 'On' : 'Off');
  if (autoWalk) {
    walkT = 0;
    walkOrigin.copy(camera.position);
    walkDest.copy(walkWaypoints[(walkSegment + 1) % walkWaypoints.length]);
  }
}

let mouseX = 0, mouseY = 0;
document.addEventListener('mousemove', e => {
  mouseX = (e.clientX / innerWidth - 0.5) * 2;
  mouseY = (e.clientY / innerHeight - 0.5) * 2;
});

let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t += 0.01;
  allObjects.forEach(o => {
    if (o.userData.isFlame) {
      o.scale.setScalar(0.85 + Math.sin(t * 8 + o.position.x * 3) * 0.15);
    }
  });
  lights.forEach(l => {
    if (l.isPointLight && l.color.r > 0.9 && l.color.g > 0.5 && l.color.b < 0.3) {
      l.intensity = l.userData.baseIntensity !== undefined
        ? l.userData.baseIntensity * (0.85 + Math.sin(t * 7 + l.position.x) * 0.15)
        : l.intensity;
    }
  });
  windowMeshes.forEach((m, i) => {
    if (m.material) {
      m.material.opacity = m.userData.baseOpacity !== undefined
        ? m.userData.baseOpacity
        : (0.7 + Math.sin(t * 0.3 + i) * 0.08);
    }
  });
  if (autoWalk && walkWaypoints.length > 1) {
    walkT += 0.0018;
    if (walkT >= 1) {
      walkT = 0;
      walkSegment = (walkSegment + 1) % (walkWaypoints.length - 1);
      walkOrigin.copy(walkWaypoints[walkSegment]);
      walkDest.copy(walkWaypoints[walkSegment + 1]);
    }
    const eased = walkT < 0.5 ? 2 * walkT * walkT : -1 + (4 - 2 * walkT) * walkT;
    camera.position.lerpVectors(walkOrigin, walkDest, eased);
    const ahead = walkDest.clone().lerp(
      walkWaypoints[(walkSegment + 2) % walkWaypoints.length], 0.4
    );
    camera.lookAt(ahead.x + mouseX * 3, ahead.y + 1.5 + mouseY * -1.5, ahead.z);
  } else if (!autoWalk) {
    camera.rotation.y += (-mouseX * 0.3 - camera.rotation.y) * 0.05;
    camera.rotation.x += (-mouseY * 0.2 - camera.rotation.x) * 0.05;
  }
  renderer.render(scene, camera);
}

function regenerate() {
  SEED = makeSeed() ^ (Date.now() & 0xFFFFFF);
  rng = new SeededRandom(SEED);
  document.getElementById('seed-display').textContent = 'Seed · ' + SEED.toString(16).toUpperCase().padStart(8, '0');
  buildCathedral();
  if (audioCtx && soundEnabled) updateAudio(palette);
  walkSegment = 0;
  walkT = 0;
}

const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {
  initAudio();
  if (audioCtx) updateAudio(palette);
  overlay.classList.add('fade-out');
  document.getElementById('hud').classList.add('visible');
  document.getElementById('info').classList.add('visible');
  setTimeout(() => overlay.style.display = 'none', 1600);
});
overlay.addEventListener('touchend', e => {
  e.preventDefault();
  initAudio();
  if (audioCtx) updateAudio(palette);
  overlay.classList.add('fade-out');
  document.getElementById('hud').classList.add('visible');
  document.getElementById('info').classList.add('visible');
  setTimeout(() => overlay.style.display = 'none', 1600);
}, { passive: false });

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

buildCathedral();
animate();

const infoEl = document.getElementById('info');
setInterval(() => {
  const now = new Date();
  infoEl.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')} · Seed ${SEED.toString(16).toUpperCase().padStart(8, '0')}`;
}, 1000);
