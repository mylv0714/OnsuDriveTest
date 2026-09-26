// 3D 월드 생성: 도로/차선/신호등/건물/철도/고가차도/가로수 등
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toWorld, RAIL, STATIONS, OVERPASS, FOOTBRIDGE, SPEED_SIGNS, LANDMARKS, GUIDE_SIGNS, S } from './map.js';
import { CW_W, signalGroup, hasLeftTurn } from './net.js';
import { COURSES } from './course.js';
import { makeTerrain } from './terrain.js';

// 지형: buildWorld에서 설정. 모든 정적 지오메트리는 만들어진 뒤 지형 높이만큼 올린다
let TER = null;

// ---------------------------------------------------------------- 유틸
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260703);
const R = (a, b) => a + (b - a) * rand();
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";

const _o = new THREE.Object3D();
function mtx(x, y, z, yaw = 0, pitch = 0) {
  _o.position.set(x, y, z);
  _o.rotation.set(pitch, yaw, 0, 'YXZ');
  _o.updateMatrix();
  return _o.matrix.clone();
}
const yawX = (u) => Math.atan2(-u.z, u.x); // 로컬 +X를 u 방향으로
const yawZ = (d) => Math.atan2(d.x, d.z); // 로컬 +Z를 d 방향으로

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function speckle(g, w, h, n, colors) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = pick(colors);
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => clamp(v + amt, 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---------------------------------------------------------------- 텍스처 & 재질
const TEX = {
  asphalt: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#56585b'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, ['#4b4d50', '#606266', '#45474a', '#6a6c70']);
  }),
  sidewalk: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b3a79b'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = shade('#b3a79b', Math.round(R(-14, 10)));
      g.fillRect(x * 64 + (y % 2) * 32 + 2, y * 32 + 2, 60, 28);
    }
  }),
  ground: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8f8c84'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 5000, ['#85827a', '#99968e', '#7d7a72']);
  }),
  ballast: canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#6d6862'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2500, ['#5e5954', '#7c776f', '#57524c']);
    g.fillStyle = '#5a4a3c';
    for (let y = 0; y < h; y += 32) { g.fillRect(8, y, 48, 12); g.fillRect(72, y, 48, 12); }
  }),
  corrugated: canvasTex(128, 64, (g, w, h) => {
    for (let x = 0; x < w; x += 8) { g.fillStyle = x % 16 ? '#8fa3b3' : '#a7b8c6'; g.fillRect(x, 0, 8, h); }
  }),
  stone: canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#8d877c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -12 : 0; x < w; x += 24) {
      g.fillStyle = shade('#9a9386', Math.round(R(-25, 15))); g.fillRect(x + 1, y + 1, 22, 14);
    }
  }),
  railWall: canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#c9ccc9'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b3b7b4'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h);
    g.fillStyle = '#5a7fa6'; g.fillRect(0, h * 0.62, w, h * 0.38);
    g.fillStyle = 'rgba(255,255,255,0.35)'; for (let x = 10; x < w; x += 64) { g.beginPath(); g.arc(x + 20, h * 0.8, 12, 0, Math.PI * 2); g.fill(); }
  }),
  grass: canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3000, ['#e6e6e6', '#f4f4f4', '#d9d9d9']);
  }),
  fencePost: canvasTex(16, 64, (g, w, h) => {
    for (let y = 0; y < h; y += 16) { g.fillStyle = '#f2c500'; g.fillRect(0, y, w, 8); g.fillStyle = '#1b1b1b'; g.fillRect(0, y + 8, w, 8); }
  }),
};

// 건물 외벽: 가로 6m × 한 층 3.3m 타일
function facadeTex({ wall, glass, frame, kind }) {
  return canvasTex(256, 144, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    g.fillStyle = shade(wall, -22); g.fillRect(0, h - 12, w, 12); // 층 슬래브 (지붕색으로도 쓰임)
    const win = (x, y, ww, hh) => {
      const gr = g.createLinearGradient(0, y, 0, y + hh);
      gr.addColorStop(0, shade(glass, 30)); gr.addColorStop(1, glass);
      g.fillStyle = frame; g.fillRect(x - 4, y - 4, ww + 8, hh + 8);
      g.fillStyle = gr; g.fillRect(x, y, ww, hh);
    };
    if (kind === 'apt') {
      win(14, 20, 228, 80);
      g.fillStyle = frame; [90, 166].forEach((x) => g.fillRect(x - 2, 20, 4, 80));
      g.fillStyle = 'rgba(250,250,250,0.9)'; g.fillRect(8, 92, 240, 10);
    } else if (kind === 'curtain') {
      win(0, 0, w, h - 14);
      g.fillStyle = frame; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 4, h);
    } else {
      win(24, 30, 86, 70); win(146, 30, 86, 70);
    }
  });
}

const STYLE_DEFS = {
  white: { wall: '#e4e0d8', glass: '#56646f', frame: '#cbc6bc' },
  beige: { wall: '#d8c29e', glass: '#4f5b63', frame: '#c0aa86' },
  brick: { wall: '#8c4e3b', glass: '#3f4a52', frame: '#d5cfc5' },
  gray: { wall: '#a0a4a8', glass: '#3e4c59', frame: '#cbcdd0' },
  glass: { wall: '#7894aa', glass: '#44647e', frame: '#a4b6c4', kind: 'curtain' },
  apt: { wall: '#f0eee8', glass: '#6f808e', frame: '#dcd8cf', kind: 'apt' },
  apt2: { wall: '#ebe3d2', glass: '#72818b', frame: '#d6cdbb', kind: 'apt' },
  school: { wall: '#efe7d3', glass: '#5a6e66', frame: '#d9cfb8' },
};
const STYLES = {};
for (const [k, d] of Object.entries(STYLE_DEFS)) {
  STYLES[k] = new THREE.MeshStandardMaterial({ map: facadeTex(d), roughness: 0.85 });
}
STYLES.corrugated = new THREE.MeshStandardMaterial({ map: TEX.corrugated, roughness: 0.7, metalness: 0.2 });

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
const MAT = {
  asphalt: std(0xffffff, { map: TEX.asphalt, roughness: 0.95 }),
  sidewalk: std(0xffffff, { map: TEX.sidewalk }),
  ground: std(0xffffff, { map: TEX.ground, roughness: 1 }),
  white: std(0xf4f4f0, { roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  yellow: std(0xf2b705, { roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  blue: std(0x1f5fd6, { roughness: 0.7 }),
  school: std(0xb8433a, { roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  concrete: std(0xb9b7b1),
  darkConcrete: std(0x8d8b86),
  curb: std(0xc9c6bf),
  metal: std(0x5d6166, { metalness: 0.5, roughness: 0.5 }),
  darkMetal: std(0x2d3033, { metalness: 0.4, roughness: 0.6 }),
  fencePost: std(0xffffff, { map: TEX.fencePost }),
  rail: std(0x8a8f96, { metalness: 0.8, roughness: 0.35 }),
  ballast: std(0xffffff, { map: TEX.ballast, roughness: 1 }),
  wall: std(0xd2d0c8, { side: THREE.DoubleSide }),
  railWall: std(0xffffff, { map: TEX.railWall, side: THREE.DoubleSide }),
  stone: std(0xffffff, { map: TEX.stone, side: THREE.DoubleSide, roughness: 1 }),
  hedge: std(0x3f6e34, { roughness: 1 }),
  guard: std(0xb9bec4, { metalness: 0.6, roughness: 0.4 }),
  orange: std(0xff7a1a, { roughness: 0.6 }),
  hill: new THREE.MeshStandardMaterial({ map: TEX.grass, vertexColors: true, roughness: 1 }),
  mountain: new THREE.MeshStandardMaterial({ color: 0x55704a, roughness: 1, flatShading: true }),
  bark: std(0x5b4636),
  leaf: std(0x4f7a3a),
  leaf2: std(0x3f6b33),
  yellowPaint: std(0xf2c230),
  green: std(0x2e6b3a),
  glassDark: std(0x2a3540, { metalness: 0.3, roughness: 0.2 }),
  sand: std(0xc9b48a, { roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  net: new THREE.MeshStandardMaterial({ color: 0x3f7f45, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  bus: std(0x2c9a5a),
  red: std(0xc0392b),
};
MAT.sidewalk.polygonOffset = true; MAT.sidewalk.polygonOffsetFactor = -0.5; MAT.sidewalk.polygonOffsetUnits = -0.5;

// ---------------------------------------------------------------- 지오메트리 도우미
class Buf {
  constructor() { this.p = []; this.uv = []; }
  tri(a, b, c, ua = [0, 0], ub = [0, 0], uc = [0, 0], up = true) {
    if (up) {
      const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      if (ny < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    }
    this.p.push(...a, ...b, ...c);
    this.uv.push(...ua, ...ub, ...uc);
  }
  quad(a, b, c, d, ua, ub, uc, ud, up = true) {
    this.tri(a, b, c, ua, ub, uc, up);
    this.tri(a, c, d, ua, uc, ud, up);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    displace(g, 'road');
    g.computeVertexNormals();
    return g;
  }
}

// 지형 반영: road = 정점마다 도로 기복(roadT), building = 바닥 네 모서리 중 가장 낮은 땅에 맞춤,
// auto = 길쭉한 것(25m 초과)은 정점마다, 작은 것은 중심 땅높이만큼 통째로
function displace(g, mode = 'auto') {
  if (!TER || mode === 'none') return g;
  g.computeBoundingBox();
  const b = g.boundingBox;
  const ext = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  if (mode === 'road' || (mode === 'auto' && ext > 25)) {
    tessellate(g, 20); // 긴 면은 20m 간격으로 잘라 기복을 따라가게 (곡률 오차 1cm 미만)
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + TER.roadT(pos.getX(i), pos.getZ(i)));
    pos.needsUpdate = true;
    g.computeBoundingBox();
    return g;
  }
  const dy = mode === 'building'
    ? Math.min(...[[b.min.x, b.min.z], [b.max.x, b.min.z], [b.min.x, b.max.z], [b.max.x, b.max.z]].map(([x, z]) => TER.groundY(x, z)))
    : TER.groundY((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2);
  g.translate(0, dy, 0);
  return g;
}

// 비색인 지오메트리에서 가로(xz) 길이가 maxLen보다 긴 삼각형을, 가장 긴 변 방향으로 maxLen 간격의 평면으로 잘라
// 지형 기복을 따라가게 한다 (position/uv/normal). 짧은 삼각형은 그대로 복사.
function tessellate(g, maxLen) {
  if (g.index) return;
  const names = ['position', 'uv', 'normal'].filter((n) => g.attributes[n]);
  const src = names.map((n) => g.attributes[n].array), sizes = names.map((n) => g.attributes[n].itemSize);
  const P = src[0], n = P.length / 9, m2 = maxLen * maxLen;
  const d2 = (i, j) => { const dx = P[i * 3] - P[j * 3], dz = P[i * 3 + 2] - P[j * 3 + 2]; return dx * dx + dz * dz; };
  let long = false;
  for (let t = 0; t < n && !long; t++) { const v = t * 3; if (d2(v, v + 1) > m2 || d2(v + 1, v + 2) > m2 || d2(v + 2, v) > m2) long = true; }
  if (!long) return;
  const out = names.map(() => []);
  const vert = (vi) => names.map((_, a) => { const k = sizes[a], r = new Array(k); for (let i = 0; i < k; i++) r[i] = src[a][vi * k + i]; return r; });
  const mix = (A, B, f) => A.map((arr, a) => arr.map((v, i) => v + (B[a][i] - v) * f));
  const emit = (V) => V.forEach((arr, a) => { for (const v of arr) out[a].push(v); });
  const fan = (poly) => { for (let i = 1; i < poly.length - 1; i++) { emit(poly[0]); emit(poly[i]); emit(poly[i + 1]); } };
  for (let t = 0; t < n; t++) {
    const v = t * 3;
    const e0 = d2(v, v + 1), e1 = d2(v + 1, v + 2), e2 = d2(v + 2, v);
    if (e0 <= m2 && e1 <= m2 && e2 <= m2) {
      for (let a = 0; a < names.length; a++) { const k = sizes[a], arr = src[a], o = out[a]; for (let i = v * k; i < (v + 3) * k; i++) o.push(arr[i]); }
      continue;
    }
    const V = [vert(v), vert(v + 1), vert(v + 2)];
    const [i, j] = e0 >= e1 && e0 >= e2 ? [0, 1] : e1 >= e2 ? [1, 2] : [2, 0];
    let ax = V[j][0][0] - V[i][0][0], az = V[j][0][2] - V[i][0][2];
    const al = Math.hypot(ax, az); ax /= al; az /= al;
    const T = (p) => p[0][0] * ax + p[0][2] * az;
    const ts = V.map(T), tmin = Math.min(...ts), tmax = Math.max(...ts);
    let poly = V;
    for (let c = tmin + maxLen; c < tmax - 0.01; c += maxLen) {
      const below = [], above = [];
      for (let k = 0; k < poly.length; k++) {
        const A = poly[k], B = poly[(k + 1) % poly.length], ta = T(A), tb = T(B);
        if (ta <= c) below.push(A);
        if (ta >= c) above.push(A);
        if ((ta - c) * (tb - c) < 0) { const I = mix(A, B, (c - ta) / (tb - ta)); below.push(I); above.push(I); }
      }
      if (below.length >= 3) fan(below);
      poly = above;
      if (poly.length < 3) break;
    }
    if (poly.length >= 3) fan(poly);
  }
  names.forEach((nm, a) => g.setAttribute(nm, new THREE.Float32BufferAttribute(out[a], sizes[a])));
}

// 재질별로 정적 지오메트리를 모아 하나의 메시로 병합
class Batcher {
  constructor() { this.map = new Map(); }
  add(mat, geo, m, mode = 'auto') {
    if (m) geo.applyMatrix4(m);
    if (geo.index) geo = geo.toNonIndexed();
    displace(geo, mode);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(geo);
  }
  box(mat, w, h, d, m, mode) { this.add(mat, new THREE.BoxGeometry(w, h, d), m, mode); }
  build(parent, { cast = true } = {}) {
    for (const [mat, list] of this.map) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = cast && !mat.transparent;
      mesh.receiveShadow = true;
      mesh.userData.fixed = true;
      parent.add(mesh);
    }
    this.map.clear();
  }
}

// 외벽 타일 UV를 실제 크기에 맞춘 박스 (지붕은 슬래브 색)
function boxGeo(w, h, d, tileW = 6) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(i, 0.01, 0.01); continue; }
      const span = f < 2 ? d : w;
      uv.setXY(i, (uv.getX(i) * span) / tileW, (uv.getY(i) * h) / 3.3);
    }
  }
  return g;
}

// 구간 위 사각형 (고가 구간은 4m 간격으로 쪼개 높이를 따라감)
function edgeQuad(buf, e, s0, s1, o0, o1, dy, uvs = 6) {
  if (s1 - s0 < 0.01) return;
  const n = e.profile ? Math.max(1, Math.ceil((s1 - s0) / 4)) : 1;
  const P = (s, o, y) => { const p = e.pt(s, o); return [p.x, y, p.z]; };
  for (let i = 0; i < n; i++) {
    const sa = s0 + ((s1 - s0) * i) / n, sb = s0 + ((s1 - s0) * (i + 1)) / n;
    const ya = e.h(sa) + dy, yb = e.h(sb) + dy;
    buf.quad(P(sa, o0, ya), P(sb, o0, yb), P(sb, o1, yb), P(sa, o1, ya),
      [o0 / uvs, sa / uvs], [o0 / uvs, sb / uvs], [o1 / uvs, sb / uvs], [o1 / uvs, sa / uvs]);
  }
}
function lineMark(buf, e, s0, s1, o, w, dash) {
  if (!dash) return edgeQuad(buf, e, s0, s1, o - w / 2, o + w / 2, 0.035);
  for (let s = s0; s < s1; s += dash[0] + dash[1]) edgeQuad(buf, e, s, Math.min(s + dash[0], s1), o - w / 2, o + w / 2, 0.035);
}
// 점선이되 solid 구간([a,b])에서는 실선 (교차로 앞 진로변경제한선)
function dividedLine(buf, e, s0, s1, o, w, solid) {
  if (!solid) return lineMark(buf, e, s0, s1, o, w, [3, 5]);
  const [a, b] = solid;
  lineMark(buf, e, s0, Math.min(s1, a), o, w, [3, 5]);
  lineMark(buf, e, Math.max(s0, a), Math.min(s1, b), o, w, null);
  lineMark(buf, e, Math.max(s0, b), s1, o, w, [3, 5]);
}

const ARROWS = {
  straight: { rects: [[0, 3.4, -0.15, 0.15]], tris: [[[3.4, -0.5], [3.4, 0.5], [5.2, 0]]] },
  left: { rects: [[0, 2.4, -0.15, 0.15], [2.1, 2.4, -1.0, 0.15]], tris: [[[1.6, -1.0], [2.9, -1.0], [2.25, -1.9]]] },
  uturn: {
    rects: [[0, 3.2, -0.15, 0.15], [2.9, 3.2, -1.3, 0.15], [1.6, 3.2, -1.3, -1.0]],
    tris: [[[1.6, -1.7], [1.6, -0.6], [0.5, -1.15]]],
  },
};
ARROWS.right = {
  rects: ARROWS.left.rects.map(([a0, a1, b0, b1]) => [a0, a1, -b1, -b0]),
  tris: ARROWS.left.tris.map((t) => t.map(([a, b]) => [a, -b])),
};
function arrowMark(buf, e, s, o, dir, type) {
  const P = (a, b) => { const p = e.pt(s + dir * a, o + dir * b); return [p.x, e.h(s) + 0.036, p.z]; };
  const sh = ARROWS[type];
  for (const [a0, a1, b0, b1] of sh.rects) buf.quad(P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1));
  for (const t of sh.tris) buf.tri(P(...t[0]), P(...t[1]), P(...t[2]));
}

// ---------------------------------------------------------------- 간판 텍스처
function textTex(text, { bg = '#1d4e89', fg = '#fff', w = 512, h = 128, border = null, size = 0.62 } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = h * 0.08; g.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08); }
    g.fillStyle = fg;
    let fs = h * size;
    g.font = `bold ${fs}px ${FONT}`;
    while (g.measureText(text).width > w * 0.9 && fs > 10) { fs -= 2; g.font = `bold ${fs}px ${FONT}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + fs * 0.05);
  }, false);
}
function signMesh(tex, w, h, m, basic = false) {
  const mat = basic ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.applyMatrix4(m);
  return mesh;
}

// 상점 간판 아틀라스 (2열 × 16행)
const SHOP_WORDS = ['편의점', '약국', '부동산', '치킨', '카페', '김밥', '미용실', '태권도', '수학학원', '안경원', '내과의원', '치과',
  '정육점', '세탁소', 'PC방', '노래연습장', '분식', '한의원', '휴대폰', '꽃집', '중국집', '베이커리', '공인중개사', '철물점',
  '마트', '호프', '국밥', '피자', '헬스클럽', '영어학원', '떡집', '반찬가게'];
const SIGN_COLORS = ['#c62828', '#1d4e89', '#2a9d8f', '#e76f51', '#6a4c93', '#264653', '#d81b60', '#0077b6', '#588157', '#f4a261', '#3d405b', '#ffb703'];
const shopAtlas = canvasTex(1024, 1024, (g) => {
  SHOP_WORDS.forEach((word, i) => {
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 64;
    const bg = pick(SIGN_COLORS);
    g.fillStyle = bg; g.fillRect(x, y, 512, 64);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x, y, 512, 6);
    g.fillStyle = bg === '#ffb703' || bg === '#f4a261' ? '#222' : '#fff';
    g.font = `bold 44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(word, x + 256, y + 34);
  });
}, false);
const MAT_SHOPSIGN = new THREE.MeshStandardMaterial({ map: shopAtlas, emissive: 0xffffff, emissiveMap: shopAtlas, emissiveIntensity: 0.3, roughness: 0.6 });
function shopSignGeo(i, w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  const u0 = (i % 2) * 0.5, v0 = 1 - (Math.floor(i / 2) + 1) / 16;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.5, v0 + uv.getY(k) / 16);
  return g;
}

// ---------------------------------------------------------------- 충돌/배치 검사
function obbOverlap(A, B, gap = 0) {
  const axes = [[A.ux, A.uz], [-A.uz, A.ux], [B.ux, B.uz], [-B.uz, B.ux]];
  const dx = B.x - A.x, dz = B.z - A.z;
  for (const [ax, az] of axes) {
    const ra = A.hu * Math.abs(A.ux * ax + A.uz * az) + A.hr * Math.abs(-A.uz * ax + A.ux * az);
    const rb = B.hu * Math.abs(B.ux * ax + B.uz * az) + B.hr * Math.abs(-B.uz * ax + B.ux * az);
    if (Math.abs(dx * ax + dz * az) > ra + rb + gap) return false;
  }
  return true;
}
function segDist(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
  const t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / L2, 0, 1);
  return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
}
function polyDist(px, pz, pts) {
  let m = Infinity;
  for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(px, pz, pts[i - 1], pts[i]));
  return m;
}
function obbPoints(ob, n = 3) {
  const pts = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = (i / (n - 1) - 0.5) * 2 * ob.hu, b = (j / (n - 1) - 0.5) * 2 * ob.hr;
    pts.push({ x: ob.x + ob.ux * a - ob.uz * b, z: ob.z + ob.uz * a + ob.ux * b });
  }
  return pts;
}

// ================================================================ 월드 생성
export function buildWorld(scene, net) {
  const ctx = {
    scene, net, batch: new Batcher(),
    colliders: [], obbs: [], reserved: [],
    rail: RAIL.map(([x, y]) => toWorld(x, y)),
    ov: { x: toWorld(OVERPASS.x, 0).x, z0: toWorld(0, OVERPASS.y0).z, z1: toWorld(0, OVERPASS.y1).z },
  };
  ctx.fits = (ob) => {
    const n = Math.max(ob.hu, ob.hr) > 20 ? 5 : 3;
    for (const p of obbPoints(ob, n)) {
      if (net.roadClearance(p.x, p.z) < 5.2) return false;
      if (polyDist(p.x, p.z, ctx.rail) < 11) return false;
      if (Math.abs(p.x - ctx.ov.x) < 7 && p.z > ctx.ov.z0 && p.z < ctx.ov.z1) return false;
      for (const r of ctx.reserved) if (Math.hypot(p.x - r.x, p.z - r.z) < r.r) return false;
    }
    for (const o of ctx.nearObbs(ob)) if (obbOverlap(ob, o, 1.5)) return false;
    return true;
  };
  // 배치 검사용 공간 해시 (50m 격자)
  const grid = new Map(), CELL = 50;
  const cells = (ob, fn) => {
    const r = Math.hypot(ob.hu, ob.hr) + 2;
    for (let i = Math.floor((ob.x - r) / CELL); i <= Math.floor((ob.x + r) / CELL); i++)
      for (let j = Math.floor((ob.z - r) / CELL); j <= Math.floor((ob.z + r) / CELL); j++) fn(`${i},${j}`);
  };
  ctx.nearObbs = (ob) => {
    const set = new Set();
    cells(ob, (k) => grid.get(k)?.forEach((o) => set.add(o)));
    return set;
  };
  ctx.addObb = (ob, collide = true) => {
    ctx.obbs.push(ob);
    cells(ob, (k) => (grid.get(k) || grid.set(k, []).get(k)).push(ob));
    if (collide) ctx.colliders.push(ob);
  };
  TER = ctx.T = makeTerrain(net, (x, z) => polyDist(x, z, ctx.rail));
  const n0 = scene.children.length;

  buildGround(ctx);
  buildRoads(ctx);
  buildElevated(ctx);
  buildOverpass(ctx);
  buildRail(ctx);
  buildFootbridge(ctx);
  const signals = buildSignals(ctx);
  buildRoadSigns(ctx);
  buildStreetFurniture(ctx);
  for (const L of LANDMARKS) placeLandmark(ctx, L);
  buildFillers(ctx);
  buildForest(ctx);
  buildSkyline(ctx);
  ctx.batch.build(scene);
  // 따로 만든 표지판·신호등 등은 제자리 땅높이만큼 올린다
  for (const o of scene.children.slice(n0)) {
    if (!o.userData.fixed) o.position.y += TER.groundY(o.position.x, o.position.z);
  }
  return { colliders: ctx.colliders, signals, sky: ctx.skyDome };
}

// ---------------------------------------------------------------- 지면 & 하늘
function buildGround(ctx) {
  const T = ctx.T;
  // 기본 지면: 도로와 같은 완만한 기복
  const size = 14000;
  const g = new THREE.PlaneGeometry(size, size, 280, 280);
  g.rotateX(-Math.PI / 2);
  g.translate(800, 0, 0);
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * size / 8, uv.getY(i) * size / 8);
    pos.setY(i, T.roadT(pos.getX(i), pos.getZ(i)) - 0.02);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, MAT.ground);
  m.receiveShadow = true;
  m.userData.fixed = true;
  ctx.scene.add(m);

  // 언덕: 도로에서 떨어진 곳만 솟은 풀밭/산비탈 (5m 격자)
  for (const H of T.hills) {
    const step = 5, n = Math.ceil((H.r * 2) / step);
    const P = [], C = [], U = [], idx = (i, j) => i * (n + 1) + j;
    const hv = [];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = H.x - H.r + i * step, z = H.z - H.r + j * step;
      const hh = T.hill(x, z);
      hv.push(hh);
      P.push(x, T.roadT(x, z) + hh + 0.04, z);
      U.push(x / 6, z / 6);
      const k = Math.min(1, hh / 1.5);
      C.push(0.62 + (0.36 - 0.62) * k, 0.6 + (0.5 - 0.6) * k, 0.56 + (0.27 - 0.56) * k);
    }
    const ind = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      if (hv[a] > 0.03 && hv[b] > 0.03 && hv[c] > 0.03) ind.push(a, c, b);
      if (hv[a] > 0.03 && hv[c] > 0.03 && hv[d] > 0.03) ind.push(a, d, c);
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    hg.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    hg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    hg.setIndex(ind);
    hg.computeVertexNormals();
    const hm = new THREE.Mesh(hg, MAT.hill);
    hm.receiveShadow = true; hm.castShadow = true; hm.userData.fixed = true;
    ctx.scene.add(hm);
  }

  // 먼 산 (서울 외곽 산세)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + R(-0.15, 0.15), rad = R(3600, 5200);
    const cone = new THREE.ConeGeometry(R(700, 1400), R(160, 340), 9, 3);
    const pp = cone.attributes.position;
    for (let k = 0; k < pp.count; k++) if (pp.getY(k) < 0) pp.setX(k, pp.getX(k) * R(0.85, 1.15));
    cone.computeVertexNormals();
    const mt = new THREE.Mesh(cone, MAT.mountain);
    mt.position.set(800 + Math.cos(a) * rad * 1.2, cone.parameters.height / 2 - 30, Math.sin(a) * rad * 0.8);
    mt.scale.set(1, 1, R(0.6, 1.2));
    mt.userData.fixed = true;
    ctx.scene.add(mt);
  }

  // 하늘 돔 (세로 그라데이션)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(7000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x5d8fc9) }, bottom: { value: new THREE.Color(0xd4dde6) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = clamp(vP.y*2.2,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, t),1.0); }',
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  sky.userData.fixed = true;
  ctx.skyDome = sky;
  ctx.scene.add(sky);
}

// ---------------------------------------------------------------- 도로
function buildRoads(ctx) {
  const { net } = ctx;
  ctx.text = new Buf(); ctx.stone = new Buf();
  const asphalt = new Buf(), white = new Buf(), yellow = new Buf(), side = new Buf(), red = new Buf(), blue = new Buf();

  for (const n of Object.values(net.nodes)) {
    if (!n.poly) continue;
    const P = n.poly, y = n.h + 0.018;
    const cx = P.reduce((s, p) => s + p.x, 0) / P.length, cz = P.reduce((s, p) => s + p.z, 0) / P.length;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      asphalt.tri([cx, y, cz], [a.x, y, a.z], [b.x, y, b.z], [cx / 6, cz / 6], [a.x / 6, a.z / 6], [b.x / 6, b.z / 6]);
    }
    for (const [a, x, b] of n.fillets) asphalt.tri([a.x, y - 0.002, a.z], [x.x, y - 0.002, x.z], [b.x, y - 0.002, b.z], [a.x / 6, a.z / 6], [x.x / 6, x.z / 6], [b.x / 6, b.z / 6]);
    // 곡선 연석 안쪽 포장 (보도보다 살짝 위)
    for (const R of n.returns) {
      for (let i = 1; i < R.length - 1; i++) {
        const [a, b, c] = [R[0], R[i], R[i + 1]];
        asphalt.tri([a.x, y + 0.016, a.z], [b.x, y + 0.016, b.z], [c.x, y + 0.016, c.z], [a.x / 6, a.z / 6], [b.x / 6, b.z / 6], [c.x / 6, c.z / 6]);
      }
    }
    if (n.h > 0.5) {
      const xs = P.map((p) => p.x), zs = P.map((p) => p.z);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (polyDist(mx, mz, ctx.rail) < 45) {
        // 철길 위 고가 교차로: 상판 + 교각 (아래로 열차가 지나감)
        ctx.batch.box(MAT.darkConcrete, x1 - x0 - 2, 1.2, z1 - z0 - 2, mtx(mx, n.h - 0.6, mz), 'road');
        for (const [px, pz] of [[x0 + 3, z0 + 3], [x1 - 3, z0 + 3], [x0 + 3, z1 - 3], [x1 - 3, z1 - 3]]) {
          if (polyDist(px, pz, ctx.rail) < 7) continue;
          ctx.batch.box(MAT.darkConcrete, 1.6, n.h - 1.2, 1.6, mtx(px, (n.h - 1.2) / 2, pz));
        }
      } else {
        // 고가 위 분기점 아래를 받치는 구조물
        ctx.batch.box(MAT.darkConcrete, x1 - x0 - 2, n.h - 0.3, z1 - z0 - 2, mtx(mx, (n.h - 0.3) / 2, mz), 'road');
      }
    }
  }

  for (const e of net.edges) {
    const s0 = e.ends.a.mark, s1 = e.L - e.ends.b.mark;
    edgeQuad(asphalt, e, e.ta, e.L - e.tb, -e.hw, e.hw, 0.02);
    // 보도
    const sw = e.profile ? 1.5 : 4.5;
    for (const sg of [-1, 1]) {
      edgeQuad(side, e, e.ta, e.L - e.tb, sg * (e.hw + 0.25), sg * (e.hw + sw), 0.03, 3);
      if (!e.profile) {
        const c0 = Math.max(e.ta, e.curbA || 0), c1 = e.L - Math.max(e.tb, e.curbB || 0);
        const len = c1 - c0, m = e.pt(c0 + len / 2, sg * (e.hw + 0.15));
        if (len > 1) ctx.batch.box(MAT.curb, len, 0.14, 0.22, mtx(m.x, 0.07, m.z, yawX(e.u)));
      }
    }

    if (e.oneway) {
      for (const sg of [-1, 1]) lineMark(white, e, s0, s1, sg * (e.hw - 0.25), 0.15, null);
      continue;
    }
    for (const dir of [1, -1]) {
      const end = e.endFor(dir);
      const pk = e.pocket(dir);
      const uturnHere = e.uturn === (dir > 0 ? 'b' : 'a');
      const solid = end.stop ? (dir > 0 ? [e.L - end.stop - 30, s1] : [s0, end.stop + 30]) : null;
      for (let i = 1; i < e.lanes; i++) {
        // 버스전용차로(바깥 차로) 경계는 파란 점선 (영상: 시간제 버스전용차로)
        const bus = e.bus && i === e.lanes - 1;
        dividedLine(bus ? blue : white, e, s0, s1, dir * (e.median / 2 + i * e.laneW), bus ? 0.2 : 0.15, bus ? null : solid);
      }
      lineMark(white, e, s0, s1, dir * (e.hw - 0.25), 0.15, null);
      if (pk) {
        dividedLine(white, e, Math.max(pk[0], s0), Math.min(pk[1], s1), dir * (e.median / 2), 0.15, solid);
        const as = e.sFromEnd(dir, end.stop + 9);
        arrowMark(white, e, as, 0, dir, uturnHere ? 'uturn' : 'left');
        arrowMark(white, e, e.sFromEnd(dir, end.stop + 40), 0, dir, uturnHere ? 'uturn' : 'left');
      }
      if (end.stop && e.L - e.ta - e.tb > 80) {
        // 횡단보도 예고 표시(◇) — 정지선 30m 앞 각 차로
        for (let i = 1; i <= e.lanes; i++) diamondMark(white, e, e.sFromEnd(dir, end.stop + 30), e.laneO(dir, i), dir);
      }
      if (end.stop) {
        const stopS = e.sFromEnd(dir, end.stop);
        const inner = pk ? -dir * e.median / 2 : dir * (e.median >= 1 ? e.median / 2 : 0.3);
        edgeQuad(white, e, stopS - 0.25, stopS + 0.25, Math.min(inner, dir * e.hw), Math.max(inner, dir * e.hw), 0.036);
        const ca = e.sFromEnd(dir, end.cw[0]), cb = e.sFromEnd(dir, end.cw[1]);
        for (let o = -e.hw + 0.4; o < e.hw - 0.4; o += 1.0) edgeQuad(white, e, Math.min(ca, cb), Math.max(ca, cb), o, o + 0.5, 0.035);
        // 차로 화살표
        const node = dir > 0 ? e.b : e.a;
        if (node.kind === 'signal' && e.lanes >= 2) {
          const tv = { x: e.u.x * dir, z: e.u.z * dir };
          const straight = node.edges.some((o) => o !== e && dot(net.away(o, node), tv) > 0.9);
          for (let i = 1; i <= e.lanes; i++) {
            const type = straight ? 'straight' : i === 1 ? 'left' : i === e.lanes ? 'right' : 'straight';
            arrowMark(white, e, e.sFromEnd(dir, end.stop + 12), e.laneO(dir, i), dir, type);
          }
        }
      }
    }

    // 노면 글자 (제한속도 / 어린이보호구역) — 긴 구간 가운데
    if (!e.profile && e.lanes >= 2 && s1 - s0 > 200) {
      for (const dir of [1, -1]) {
        const sm = (s0 + s1) / 2 - dir * 20;
        const z = net.zones.find((q) => q.edge === e && sm > q.s0 && sm < q.s1);
        for (let i = 1; i <= e.lanes; i++) textMark(ctx.text, e, sm, e.laneO(dir, i), dir, z ? (z.limit === 30 ? '30' : 'zone') : '50');
      }
    }
    for (const z of net.zones) {
      if (z.edge !== e || !z.paint) continue;
      for (const dir of [1, -1]) {
        const sz = dir > 0 ? z.s0 + 8 : z.s1 - 8;
        for (let i = 1; i <= e.lanes; i++) { textMark(ctx.text, e, sz, e.laneO(dir, i), dir, 'zone'); textMark(ctx.text, e, sz + dir * 9, e.laneO(dir, i), dir, z.limit === 30 ? '30' : '50'); }
      }
    }

    // 석축: 보도 뒤 땅이 솟은 곳 (영상: 출발지 남쪽, 육교 부근)
    if (!e.profile) {
      for (const sg of [-1, 1]) {
        for (let s = e.ta; s < e.L - e.tb; s += 6) {
          const sb = Math.min(e.L - e.tb, s + 6);
          const ha = ctx.T.hill(...xz(e.pt(s, sg * (e.hw + 13)))), hb = ctx.T.hill(...xz(e.pt(sb, sg * (e.hw + 13))));
          if (ha < 1.2 && hb < 1.2) continue;
          const a = e.pt(s, sg * (e.hw + 4.7)), b = e.pt(sb, sg * (e.hw + 4.7));
          ctx.stone.quad([a.x, 0, a.z], [b.x, 0, b.z], [b.x, hb + 0.4, b.z], [a.x, ha + 0.4, a.z], [0, 0], [(sb - s) / 3, 0], [(sb - s) / 3, (hb + 0.4) / 3], [0, (ha + 0.4) / 3], false);
        }
      }
    }

    // 중앙
    if (e.median < 1) {
      for (const o of [-0.18, 0.18]) lineMark(yellow, e, s0, s1, o, 0.13, null);
      if (e.centerPosts) centerPosts(ctx, e, s0 + 3, s1 - 3);
    } else {
      const pa = e.pocket(-1), pb = e.pocket(1);
      const m0 = pa ? pa[1] : s0 + 1, m1 = pb ? pb[0] : s1 - 1;
      if (m1 > m0) buildMedian(ctx, e, m0, m1);
      const uSide = e.uturn === 'b' ? -1 : 1; // 유턴구역선이 그려지는 쪽 (유턴 차로 반대편 경계)
      for (const sg of [-1, 1]) {
        const own = e.pocket(sg);
        const o = sg * (e.median / 2 - 0.1);
        const skip = own || (e.uturn && sg === uSide ? e.uturnZone() : null);
        if (!skip) { lineMark(yellow, e, s0, s1, o, 0.15, null); continue; }
        lineMark(yellow, e, s0, skip[0], o, 0.15, null);
        lineMark(yellow, e, skip[1], s1, o, 0.15, null);
        if (!own) lineMark(white, e, skip[0], skip[1], o, 0.2, [1.5, 1.5]); // 유턴구역선
      }
    }
  }

  // 어린이보호구역 (붉은 포장)
  for (const z of net.zones) if (z.paint) edgeQuad(red, z.edge, z.s0, z.s1, -z.edge.hw + 0.3, z.edge.hw - 0.3, 0.028);

  // 코스 종료 지점: 정차 가능 구간 (노란 점선)
  for (const c of Object.values(COURSES)) {
    const { end } = c;
    const e = net.edgeBetween(end.a, end.b);
    const [sa, sb] = end.zone.map((px) => e.local(toWorld(px, 0).x, e.a.z).s);
    lineMark(yellow, e, Math.min(sa, sb), Math.max(sa, sb), end.dir * (e.hw - 0.05), 0.15, [1, 1]);
  }

  const add = (buf, mat, cast = false) => {
    const m = new THREE.Mesh(buf.geometry(), mat);
    m.receiveShadow = true; m.castShadow = cast;
    m.userData.fixed = true;
    ctx.scene.add(m);
  };
  add(asphalt, MAT.asphalt); add(side, MAT.sidewalk); add(white, MAT.white); add(yellow, MAT.yellow); add(red, MAT.school); add(blue, MAT.blue);
  add(ctx.text, MAT_TEXT); add(ctx.stone, MAT.stone, true);
}
function dot(a, b) { return a.x * b.x + a.z * b.z; }
const xz = (p) => [p.x, p.z];

// 중앙분리대: 영상에서 본 구간별 형태 (황흑 기둥 펜스 / 화단 / 가드레일)
function buildMedian(ctx, e, m0, m1) {
  const style = e.type === 'underpass' ? 'grass' : e.medianStyle || 'fence';
  const yaw = yawX(e.u), step = 6;
  for (let s = m0; s < m1; s += step) {
    const sb = Math.min(m1, s + step), ha = e.h(s), hb = e.h(sb), hm = (ha + hb) / 2, c = e.pt((s + sb) / 2, 0), len = sb - s;
    const M = (y) => mtx(c.x, hm + y, c.z, yaw).multiply(new THREE.Matrix4().makeRotationZ(Math.atan2(hb - ha, len)));
    const curbH = style === 'planted' ? 0.45 : 0.25;
    ctx.batch.box(style === 'grass' ? MAT.green : MAT.concrete, len, curbH, e.median - 0.4, M(curbH / 2));
    ctx.colliders.push({ x: c.x, z: c.z, ux: e.u.x, uz: e.u.z, hu: len / 2, hr: e.median / 2 - 0.3, ...(hm > 1 ? { ymin: hm - 1.5 } : { ymax: hm + 2 }) });
    if (style === 'fence') {
      for (let k = 0; k < len - 0.5; k += 2.5) { const p = e.pt(s + k, 0); ctx.batch.add(MAT.fencePost, new THREE.CylinderGeometry(0.07, 0.07, 1.0, 6), mtx(p.x, e.h(s + k) + 0.75, p.z)); }
      for (const y of [0.55, 1.15]) ctx.batch.box(MAT.yellowPaint, len, 0.06, 0.06, M(y));
    } else if (style === 'planted') {
      ctx.batch.box(MAT.hedge, len - 0.3, 0.25, e.median - 0.8, M(0.55));
      for (let k = 1; k < len; k += 3) {
        const p = e.pt(s + k, R(-0.4, 0.4)), g = new THREE.IcosahedronGeometry(R(0.45, 0.7), 0);
        g.scale(1, 0.8, 1);
        ctx.batch.add(MAT.hedge, g, mtx(p.x, e.h(s + k) + 0.85, p.z));
      }
    } else if (style === 'guardrail') {
      for (const o of [-0.35, 0.35]) {
        const q = e.pt((s + sb) / 2, o);
        ctx.batch.box(MAT.guard, len, 0.32, 0.06, mtx(q.x, hm + 0.75, q.z, yaw).multiply(new THREE.Matrix4().makeRotationZ(Math.atan2(hb - ha, len))));
      }
      for (let k = 0; k < len; k += 4) { const p = e.pt(s + k, 0); ctx.batch.box(MAT.guard, 0.12, 0.8, 0.9, mtx(p.x, e.h(s + k) + 0.5, p.z, yaw)); }
    }
  }
}

// 중앙선 위 시선유도봉 (황흑 / 주황 규제봉)
function centerPosts(ctx, e, s0, s1) {
  const orange = e.centerPosts === 'bollard';
  const gap = orange ? 3 : 4;
  const list = [];
  for (let s = s0; s < s1; s += gap) {
    const p = e.pt(s, 0), g = new THREE.CylinderGeometry(orange ? 0.07 : 0.05, orange ? 0.09 : 0.05, orange ? 0.75 : 0.9, 6);
    g.applyMatrix4(mtx(p.x, e.h(s) + (orange ? 0.375 : 0.45), p.z));
    list.push(g.toNonIndexed());
  }
  if (list.length) ctx.batch.add(orange ? MAT.orange : MAT.fencePost, mergeGeometries(list), null, 'road');
}

// 횡단보도 예고 표시(◇)
function diamondMark(buf, e, s, o, dir) {
  const P = (a, b) => { const p = e.pt(s + dir * a, o + dir * b); return [p.x, e.h(s) + 0.036, p.z]; };
  const pts = [[0, 0], [1.6, -0.75], [3.2, 0], [1.6, 0.75], [0, 0]];
  for (let i = 0; i < 4; i++) {
    const [a0, b0] = pts[i], [a1, b1] = pts[i + 1];
    const la = a1 - a0, lb = b1 - b0, L = Math.hypot(la, lb), na = (-lb / L) * 0.08, nb = (la / L) * 0.08;
    buf.quad(P(a0 + na, b0 + nb), P(a1 + na, b1 + nb), P(a1 - na, b1 - nb), P(a0 - na, b0 - nb));
  }
}

// 노면 글자 (아틀라스: 50 / 30 / 어린이보호구역)
const TEXT_UV = { 50: [0, 0.5, 0.5, 1], 30: [0.5, 0.5, 1, 1], zone: [0, 0, 1, 0.5] };
const textAtlas = canvasTex(512, 512, (g) => {
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 200px Arial';
  g.fillText('50', 128, 128); g.fillText('30', 384, 128);
  g.font = `bold 118px ${FONT}`;
  g.save(); g.translate(256, 384); g.scale(0.62, 1.9); g.fillText('어린이보호구역', 0, 0); g.restore();
}, false);
const MAT_TEXT = new THREE.MeshStandardMaterial({ map: textAtlas, transparent: true, alphaTest: 0.4, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
function textMark(buf, e, s, o, dir, key) {
  const [u0, v0, u1, v1] = TEXT_UV[key];
  const len = key === 'zone' ? 4 : 5, wid = key === 'zone' ? 2.8 : 2.4;
  const P = (a, b) => { const p = e.pt(s + dir * a, o + dir * b); return [p.x, e.h(s) + 0.037, p.z]; };
  // 운전자 쪽에서 읽히도록: 글자 위쪽이 진행방향
  buf.quad(P(-len / 2, -wid / 2), P(len / 2, -wid / 2), P(len / 2, wid / 2), P(-len / 2, wid / 2), [u0, v1 - (v1 - v0)], [u0, v1], [u1, v1], [u1, v0]);
}

// ---------------------------------------------------------------- 철도를 넘는 고가 구간 (옹벽/난간/교각)
function buildElevated(ctx) {
  const walls = new Buf();
  for (const e of ctx.net.elevated) {
    // 교차 구역(노드) 안에는 난간·옹벽을 두지 않는다
    for (let s = e.ta; s < e.L - e.tb; s += 4) {
      const s2 = Math.min(e.L - e.tb, s + 4), hm = e.h((s + s2) / 2);
      if (hm < 0.05) continue;
      const mid = e.pt((s + s2) / 2, 0);
      const overRail = polyDist(mid.x, mid.z, ctx.rail) < 12 || ctx.net.roadBelow(e, mid.x, mid.z);
      for (const sg of [-1, 1]) {
        const o = sg * (e.hw + 1.9);
        const a = e.pt(s, o), b = e.pt(s2, o), ha = e.h(s), hb = e.h(s2);
        // 난간 (콘크리트 방호벽)
        walls.quad([a.x, ha, a.z], [b.x, hb, b.z], [b.x, hb + 0.9, b.z], [a.x, ha + 0.9, a.z], [0, 0], [1, 0], [1, 1], [0, 1], false);
        // 옹벽
        if (!overRail) walls.quad([a.x, 0, a.z], [b.x, 0, b.z], [b.x, hb, b.z], [a.x, ha, a.z], [0, 0], [1, 0], [1, 1], [0, 1], false);
        if (hm > 1) {
          // 아래가 트인 교량 구간은 상판 위 차량만 막는다
          const c = e.pt((s + s2) / 2, o);
          ctx.colliders.push({ x: c.x, z: c.z, ux: e.u.x, uz: e.u.z, hu: 2.1, hr: 0.3, ...(overRail ? { ymin: hm - 1.5 } : {}) });
        }
      }
      if (overRail) {
        // 교량 상판 하부
        const top = e.pt((s + s2) / 2, 0);
        ctx.batch.box(MAT.darkConcrete, s2 - s, 1.2, e.hw * 2 + 4, mtx(top.x, hm - 0.65, top.z, yawX(e.u)));
      }
    }
    // 교량 구간 양 끝 교각 (철길/도로 위가 트이는 곳)
    let prevOpen = null;
    for (let s = 0; s < e.L; s += 2) {
      const p = e.pt(s, 0), h = e.h(s);
      const open = h > 3 && (polyDist(p.x, p.z, ctx.rail) < 12 || ctx.net.roadBelow(e, p.x, p.z));
      if (prevOpen !== null && open !== prevOpen) {
        const ps = open ? s - 3 : s + 1;
        const hh = e.h(ps);
        for (const o of [-e.hw + 1, 0, e.hw - 1]) {
          const q = e.pt(ps, o);
          ctx.batch.box(MAT.darkConcrete, 1.4, hh - 1.2, 1.4, mtx(q.x, (hh - 1.2) / 2, q.z, yawX(e.u)));
        }
      }
      prevOpen = open;
    }
  }
  const m = new THREE.Mesh(walls.geometry(), MAT.wall);
  m.userData.fixed = true;
  m.castShadow = true; m.receiveShadow = true;
  ctx.scene.add(m);
}

// ---------------------------------------------------------------- 오류고가차도
function buildOverpass(ctx) {
  const { x, z0, z1 } = ctx.ov;
  const ramp = OVERPASS.ramp * S, H = OVERPASS.h, W = OVERPASS.width;
  const h = (z) => {
    const t = Math.min(clamp((z - z0) / ramp, 0, 1), clamp((z1 - z) / ramp, 0, 1));
    return H * t * t * (3 - 2 * t);
  };
  const seg = 6;
  const mainRoads = ctx.net.edges.filter((e) => e.type !== 'underpass');
  for (let z = z0; z < z1; z += seg) {
    const za = z, zb = Math.min(z1, z + seg), ha = h(za), hb = h(zb), hm = (ha + hb) / 2;
    const pitch = -Math.atan2(hb - ha, zb - za);
    ctx.batch.box(MAT.concrete, W, 1.1, zb - za + 0.1, mtx(x, hm - 0.55, (za + zb) / 2, 0, pitch));
    for (const sx of [-1, 1]) ctx.batch.box(MAT.concrete, 0.3, 0.9, zb - za + 0.1, mtx(x + sx * (W / 2 - 0.15), hm + 0.45, (za + zb) / 2, 0, pitch));
    if (hm < 5.5 && hm > 0.3) ctx.colliders.push({ x, z: (za + zb) / 2, ux: 0, uz: 1, hu: seg / 2, hr: W / 2 });
  }
  for (let z = z0 + ramp; z < z1 - ramp; z += 24) {
    const onMain = mainRoads.some((e) => { const l = e.local(x, z); return l.s > -2 && l.s < e.L + 2 && Math.abs(l.o) < e.hw + 5; });
    if (onMain || polyDist(x, z, ctx.rail) < 7) continue;
    ctx.batch.box(MAT.darkConcrete, 2.2, H - 1.1, 1.6, mtx(x, (H - 1.1) / 2, z));
    ctx.colliders.push({ x, z, ux: 1, uz: 0, hu: 1.1, hr: 0.8 });
  }
  // 이름판 (두 큰길에서 보이도록 상판 양옆)
  const plate = textTex('오류고가차도', { bg: '#1f5f3a', h: 96 });
  for (const zz of [ctx.net.nodes.V1U.z, ctx.net.nodes.V1L.z]) {
    for (const sx of [-1, 1]) ctx.scene.add(signMesh(plate, 7, 1.2, mtx(x + sx * (W / 2 + 0.05), H - 0.55, zz, yawZ({ x: sx, z: 0 }))));
  }
}

// ---------------------------------------------------------------- 철도 & 온수역
function buildRail(ctx) {
  const pts = ctx.rail, ballast = new Buf(), b = ctx.batch;
  for (let i = 1; i < pts.length; i++) {
    const A = pts[i - 1], B = pts[i];
    const L = Math.hypot(B.x - A.x, B.z - A.z), u = { x: (B.x - A.x) / L, z: (B.z - A.z) / L }, r = { x: -u.z, z: u.x };
    const P = (s, o, y) => [A.x + u.x * s + r.x * o, y, A.z + u.z * s + r.z * o];
    for (const tc of [-2.1, 2.1]) {
      ballast.quad(P(-0.5, tc - 1.6, 0.06), P(L + 0.5, tc - 1.6, 0.06), P(L + 0.5, tc + 1.6, 0.06), P(-0.5, tc + 1.6, 0.06),
        [0, 0], [0, (L + 1) / 2.4], [1, (L + 1) / 2.4], [1, 0]);
      for (const rr of [-0.75, 0.75]) {
        const m = P(L / 2, tc + rr, 0.14);
        b.box(MAT.rail, L + 0.4, 0.14, 0.09, mtx(m[0], m[1], m[2], yawX(u)));
        const w = P(L / 2, tc, 5.6);
        if (rr > 0) b.box(MAT.darkMetal, L, 0.03, 0.03, mtx(w[0], w[1], w[2], yawX(u)));
      }
    }
    // 방음벽
    for (const sg of [-1, 1]) {
      const m = P(L / 2, sg * 9, 1.6);
      const wg = new THREE.BoxGeometry(L + 0.6, 3.2, 0.3);
      const wuv = wg.attributes.uv;
      for (let k = 0; k < wuv.count; k++) wuv.setX(k, wuv.getX(k) * (L + 0.6) / 12);
      b.add(MAT.railWall, wg, mtx(m[0], m[1], m[2], yawX(u)));
      ctx.colliders.push({ x: m[0], z: m[2], ux: u.x, uz: u.z, hu: L / 2 + 0.3, hr: 0.4, ymax: 3.2 });
    }
    // 전차선 기둥
    for (let s = 20; s < L; s += 45) {
      const c = P(s, 0, 0);
      if (ctx.net.roadClearance(c[0], c[2]) < 4 || Math.abs(c[0] - ctx.ov.x) < 12) continue;
      for (const sg of [-1, 1]) { const q = P(s, sg * 5.6, 3.6); b.box(MAT.metal, 0.3, 7.2, 0.3, mtx(q[0], q[1], q[2], yawX(u))); }
      const q = P(s, 0, 6.9); b.box(MAT.metal, 0.25, 0.25, 11.5, mtx(q[0], q[1], q[2], yawX(u)));
    }
  }
  const m = new THREE.Mesh(ballast.geometry(), MAT.ballast);
  m.userData.fixed = true;
  m.receiveShadow = true;
  ctx.scene.add(m);

  for (const st of STATIONS) buildStation(ctx, st);
}

// 선상역사: 철길 위 대합실 + 한쪽 출입구 건물
function buildStation(ctx, st) {
  const pts = ctx.rail, b = ctx.batch;
  const sx = toWorld(st.x, 0).x;
  let seg = null;
  for (let i = 1; i < pts.length; i++) if (pts[i - 1].x <= sx && pts[i].x >= sx) seg = [pts[i - 1], pts[i]];
  const [A, B] = seg;
  const L = Math.hypot(B.x - A.x, B.z - A.z), u = { x: (B.x - A.x) / L, z: (B.z - A.z) / L }, r = { x: -u.z, z: u.x };
  const t = (sx - A.x) / (B.x - A.x), C = { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t };
  const P = (s, o) => ({ x: C.x + u.x * s + r.x * o, z: C.z + u.z * s + r.z * o });
  const yaw = yawX(u), sd = st.side;
  for (const sg of [-1, 1]) {
    const p = P(0, sg * 4.9); b.box(MAT.concrete, 150, 1.0, 2.4, mtx(p.x, 0.5, p.z, yaw));
    const q = P(0, sg * 5.0); b.box(MAT.darkMetal, 110, 0.2, 3.2, mtx(q.x, 4.4, q.z, yaw));
    for (let s = -50; s <= 50; s += 12.5) { const c = P(s, sg * 5.6); b.box(MAT.metal, 0.2, 3.4, 0.2, mtx(c.x, 2.7, c.z, yaw)); }
  }
  const hall = P(0, 0);
  b.add(STYLES.glass, boxGeo(36, 7, 26), mtx(hall.x, 11.5, hall.z, yaw));
  for (const [s, o] of [[-15, -7.4], [15, -7.4], [-15, 7.4], [15, 7.4]]) { const c = P(s, o); b.box(MAT.concrete, 1.6, 8, 1.6, mtx(c.x, 4, c.z, yaw)); }
  const ent = P(0, sd * 18);
  b.add(STYLES.gray, boxGeo(22, 16.5, 12), mtx(ent.x, 8.25, ent.z, yaw));
  ctx.addObb({ x: ent.x, z: ent.z, ux: u.x, uz: u.z, hu: 11, hr: 6 });
  const plaza = P(0, sd * 32);
  ctx.reserved.push({ x: plaza.x, z: plaza.z, r: 16 }); // 역 앞 광장
  // 역명판 + 노선 표시
  const face = P(0, sd * 24.08), fy = yawZ({ x: r.x * sd, z: r.z * sd });
  ctx.scene.add(signMesh(textTex(`${st.name}  ${st.en}`, { bg: '#ffffff', fg: '#1a1a1a', border: '#0052a4', w: 768 }), 12, 2, mtx(face.x, 13.5, face.z, fy)));
  st.lines.forEach(([txt, color], i) => {
    const p = P((i - (st.lines.length - 1) / 2) * 2.4 * sd, sd * 24.1);
    ctx.scene.add(signMesh(canvasTex(128, 128, (g) => {
      g.fillStyle = color; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = `bold ${txt.length > 1 ? 50 : 84}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 64, 70);
    }, false), 1.8, 1.8, mtx(p.x, 10.8, p.z, fy), true));
  });
}

// ---------------------------------------------------------------- 육교
function buildFootbridge(ctx) {
  const p = toWorld(FOOTBRIDGE.x, FOOTBRIDGE.y);
  const e = ctx.net.edgeBetween('SG', 'YH');
  const span = e.hw + 6, b = ctx.batch;
  b.box(MAT.yellowPaint, 3.2, 0.5, span * 2, mtx(p.x, 5.6, p.z));
  for (const sx of [-1.5, 1.5]) b.box(MAT.yellowPaint, 0.12, 1.2, span * 2, mtx(p.x + sx, 6.45, p.z));
  for (const sz of [-1, 1]) {
    const z = p.z + sz * (span + 1.5);
    b.box(MAT.yellowPaint, 3.2, 5.8, 3, mtx(p.x, 2.9, z));
    // 계단 (도로와 나란히)
    b.box(MAT.concrete, 12, 0.5, 2.2, mtx(p.x + 7, 2.9, z).multiply(new THREE.Matrix4().makeRotationZ(-Math.atan2(5.6, 12))));
    ctx.addObb({ x: p.x + 4, z, ux: 1, uz: 0, hu: 9, hr: 1.8 });
    b.box(MAT.yellowPaint, 0.5, 5.6, 0.5, mtx(p.x, 2.8, p.z + sz * (e.hw + 2.5)));
  }
  ctx.scene.add(signMesh(textTex('어린이보호구역', { bg: '#f7d117', fg: '#c1121f', h: 96 }), 6, 1, mtx(p.x - 1.62, 5.6, p.z + 0, -Math.PI / 2)));
  ctx.scene.add(signMesh(textTex('어린이보호구역', { bg: '#f7d117', fg: '#c1121f', h: 96 }), 6, 1, mtx(p.x + 1.62, 5.6, p.z + 0, Math.PI / 2)));
}

// ---------------------------------------------------------------- 신호등
const LAMP = {
  R: [0xff2d1a, 0x3a0f0a], Y: [0xffb300, 0x3a2a06], G: [0x14e38a, 0x06301d], A: [0x14e38a, 0x06301d],
};
const arrowTex = canvasTex(64, 64, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff'; g.fillRect(24, 26, 32, 12);
  g.beginPath(); g.moveTo(8, 32); g.lineTo(28, 14); g.lineTo(28, 50); g.fill();
}, false);
const pedTex = (walk) => canvasTex(64, 64, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(32, 12, 7, 0, Math.PI * 2); g.fill();
  g.fillRect(26, 21, 12, 22);
  if (walk) { g.save(); g.translate(30, 42); g.rotate(0.4); g.fillRect(-3, 0, 6, 18); g.restore(); g.save(); g.translate(34, 42); g.rotate(-0.4); g.fillRect(-3, 0, 6, 18); g.restore(); }
  else { g.fillRect(26, 42, 5, 18); g.fillRect(33, 42, 5, 18); }
}, false);
const PED_TEX = { R: pedTex(false), G: pedTex(true) };

function lampMat(kind) {
  const mat = new THREE.MeshBasicMaterial({ color: LAMP[kind][1], toneMapped: false });
  if (kind === 'A') mat.map = arrowTex;
  mat.userData = { on: LAMP[kind][0], off: LAMP[kind][1] };
  return mat;
}
function pedMat(kind) {
  const c = kind === 'R' ? [0xff3322, 0x2a0a08] : [0x22ee88, 0x06281a];
  const mat = new THREE.MeshBasicMaterial({ color: c[1], map: PED_TEX[kind], toneMapped: false });
  mat.userData = { on: c[0], off: c[1] };
  return mat;
}

function buildSignals(ctx) {
  const { net, batch } = ctx;
  const out = [];
  let k = 0;
  for (const n of Object.values(net.nodes)) {
    if (n.kind === 'plain') continue;
    const sets = {};
    for (const g of ['main', 'cross']) {
      sets[g] = { R: lampMat('R'), Y: lampMat('Y'), G: lampMat('G'), A: n.kind === 'signal' ? lampMat('A') : null };
      sets['p' + g] = { R: pedMat('R'), G: pedMat('G') };
    }
    n.sig = { sets, offset: (k++ * 17) % 60 };
    out.push(n);

    for (const e of n.edges) {
      const g = signalGroup(e, n);
      const dirIn = n === e.b ? 1 : -1;
      if (e.oneway && dirIn < 0) continue;
      const four = n.kind === 'signal' && hasLeftTurn(net, e, n); // 좌회전 가능한 방향만 좌회전 화살표 신호등
      const uturnHere = e.uturn === (dirIn > 0 ? 'b' : 'a');
      const end = dirIn > 0 ? e.ends.b : e.ends.a;
      const tv = { x: e.u.x * dirIn, z: e.u.z * dirIn }, rv = { x: -tv.z, z: tv.x };
      const cont = n.edges.find((o) => o !== e && dot(net.away(o, n), tv) > 0.9);
      let fd, farHw = e.hw;
      if (n.kind === 'crosswalk') fd = CW_W / 2 + 2.5;
      else if (cont) { fd = (n === cont.a ? cont.ends.a : cont.ends.b).cw[1] + 1.5; farHw = cont.hw; }
      else fd = Math.max(...n.edges.map((o) => (n === o.a ? o.ta : o.tb))) + 3;
      const base = { x: n.x + tv.x * fd, z: n.z + tv.z * fd };
      const poleO = farHw + 1.2;
      const headO = e.median / 2 + e.laneW * Math.min(1.5, e.lanes / 2);
      const armStart = uturnHere ? -0.5 : headO - 1.2;
      const pole = { x: base.x + rv.x * poleO, z: base.z + rv.z * poleO };
      const nh = n.h;
      batch.add(MAT.darkMetal, new THREE.CylinderGeometry(0.16, 0.2, 6.8, 10), mtx(pole.x, nh + 3.4, pole.z));
      const armLen = poleO - armStart, armMid = poleO - armLen / 2;
      batch.box(MAT.darkMetal, 0.16, 0.16, armLen, mtx(base.x + rv.x * armMid, nh + 6.5, base.z + rv.z * armMid, yawZ(rv)));
      ctx.reserved.push({ x: pole.x, z: pole.z, r: 3 });

      const head = { x: base.x + rv.x * headO, z: base.z + rv.z * headO };
      const yaw = yawZ({ x: -tv.x, z: -tv.z });
      const lamps = four ? ['R', 'Y', 'A', 'G'] : ['R', 'Y', 'G'];
      const hw = lamps.length * 0.5 + 0.16;
      batch.box(MAT.darkMetal, hw, 0.58, 0.34, mtx(head.x, nh + 6.1, head.z, yaw));
      lamps.forEach((l, i) => {
        const lx = (i - (lamps.length - 1) / 2) * 0.5;
        const m = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18), sets[g][l]);
        m.applyMatrix4(mtx(head.x, nh + 6.1, head.z, yaw).multiply(mtx(lx, 0, 0.18)));
        ctx.scene.add(m);
        batch.box(MAT.darkMetal, 0.4, 0.06, 0.22, mtx(head.x, nh + 6.1, head.z, yaw).multiply(mtx(lx, 0.2, 0.28)));
      });
      if (uturnHere) {
        const us = { x: base.x + rv.x * 0.3, z: base.z + rv.z * 0.3 };
        ctx.scene.add(signMesh(uturnTex, 1.0, 1.0, mtx(us.x, nh + 6.0, us.z, yaw)));
        if (e.uturnPlate) ctx.scene.add(signMesh(textTex(e.uturnPlate, { bg: '#1f5fbf', fg: '#fff', w: 320, h: 96, border: '#fff' }), 1.1, 0.33, mtx(us.x, nh + 5.3, us.z, yaw)));
      }

      // 보행 신호등 (횡단보도 양끝)
      if (!end.cw) continue;
      const scw = e.sFromEnd(dirIn, (end.cw[0] + end.cw[1]) / 2);
      for (const sg of [-1, 1]) {
        if (n.kind === 'crosswalk' && dirIn < 0) continue; // 단일로 횡단보도는 한쪽 구간에서만
        const p = e.pt(scw, sg * (e.hw + 1.0));
        const f = { x: -e.r.x * sg, z: -e.r.z * sg };
        const ph = e.h(scw);
        batch.add(MAT.darkMetal, new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8), mtx(p.x, ph + 1.3, p.z));
        batch.box(MAT.darkMetal, 0.42, 0.84, 0.26, mtx(p.x, ph + 2.9, p.z, yawZ(f)));
        for (const [l, dy] of [['R', 0.19], ['G', -0.19]]) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), sets['p' + g][l]);
          m.applyMatrix4(mtx(p.x, ph + 2.9 + dy, p.z, yawZ(f)).multiply(mtx(0, 0, 0.14)));
          ctx.scene.add(m);
        }
      }
    }
  }
  return out;
}
const uturnTex = canvasTex(128, 128, (g) => {
  g.fillStyle = '#1f5fbf'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 12; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(80, 104); g.lineTo(80, 56); g.arc(62, 56, 18, 0, Math.PI, true); g.lineTo(44, 80); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(30, 76); g.lineTo(58, 76); g.lineTo(44, 98); g.fill();
}, false);

// ---------------------------------------------------------------- 표지판 (제한속도/이정표/어린이보호구역)
const speedTex = canvasTex(128, 128, (g) => {
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d62020'; g.lineWidth = 14; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#111'; g.font = `bold 58px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('50', 64, 68);
}, false);

function guideTex(left, straight, right) {
  return canvasTex(768, 320, (g, w, h) => {
    g.fillStyle = '#0e7a43'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    g.font = `bold 50px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    // 직진 화살표 + 좌/우 갈래
    g.lineWidth = 22; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(384, 300); g.lineTo(384, 110); g.stroke();
    if (left) { g.beginPath(); g.moveTo(384, 200); g.lineTo(230, 200); g.stroke(); }
    if (right) { g.beginPath(); g.moveTo(384, 200); g.lineTo(538, 200); g.stroke(); }
    const tri = (pts) => { g.beginPath(); g.moveTo(...pts[0]); g.lineTo(...pts[1]); g.lineTo(...pts[2]); g.fill(); };
    tri([[354, 112], [414, 112], [384, 70]]);
    if (left) tri([[232, 172], [232, 228], [196, 200]]);
    if (right) tri([[536, 172], [536, 228], [572, 200]]);
    g.fillText(straight, 384, 40);
    g.fillText(left, 110, 200);
    g.fillText(right, 660, 200);
  }, false);
}

function buildRoadSigns(ctx) {
  const { net, batch, scene } = ctx;
  const nearest = (p) => {
    let best = null;
    for (const e of net.edges) {
      const l = e.local(p.x, p.z);
      if (l.s < e.ta + 3 || l.s > e.L - e.tb - 3) continue;
      const d = Math.abs(l.o);
      if (!best || d < best.d) best = { e, ...l, d };
    }
    return best;
  };
  for (const [x, y] of SPEED_SIGNS) {
    const n = nearest(toWorld(x, y));
    if (!n) continue;
    const sg = n.o >= 0 ? 1 : -1, e = n.e;
    const p = e.pt(n.s, sg * (e.hw + 1.3)), h = e.h(n.s);
    batch.add(MAT.metal, new THREE.CylinderGeometry(0.05, 0.05, 3, 8), mtx(p.x, h + 1.5, p.z));
    scene.add(signMesh(speedTex, 0.9, 0.9, mtx(p.x, h + 3.1, p.z, yawZ({ x: -e.u.x * sg, z: -e.u.z * sg }))));
  }
  for (const [from, to, L, St, Rt] of GUIDE_SIGNS) {
    const e = net.edgeBetween(from, to);
    const dir = e.b.id === to ? 1 : -1;
    const end = e.endFor(dir);
    const s = e.sFromEnd(dir, end.stop + 70);
    const pole = e.pt(s, dir * (e.hw + 1.5));
    const panelO = dir * (e.median / 2 + e.laneW * 1.6);
    const panel = e.pt(s, panelO);
    const gh = e.h(s);
    batch.add(MAT.metal, new THREE.CylinderGeometry(0.25, 0.3, 8.4, 10), mtx(pole.x, gh + 4.2, pole.z));
    const armLen = Math.abs(e.hw + 1.5 - Math.abs(panelO)) + 3, mid = e.pt(s, dir * (e.hw + 1.5) - dir * armLen / 2);
    batch.box(MAT.metal, 0.3, 0.3, armLen, mtx(mid.x, gh + 8, mid.z, yawZ(e.r)));
    scene.add(signMesh(guideTex(L, St, Rt), 7.2, 3, mtx(panel.x, gh + 7.4, panel.z, yawZ({ x: -e.u.x * dir, z: -e.u.z * dir })), true));
    ctx.reserved.push({ x: pole.x, z: pole.z, r: 3 });
  }
  const zoneTex = textTex('어린이 보호구역', { bg: '#f7d117', fg: '#c1121f', w: 384, h: 128, border: '#c1121f' });
  const tex30 = canvasTex(128, 128, (g) => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d62020'; g.lineWidth = 14; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 58px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('30', 64, 68);
  }, false);
  for (const z of net.zones) {
    const e = z.edge;
    for (const [s, dir] of [[z.s0, 1], [z.s1, -1]]) {
      const p = e.pt(s - dir * 4, dir * (e.hw + 1.3)), h = e.h(s);
      const fy = yawZ({ x: -e.u.x * dir, z: -e.u.z * dir });
      batch.add(MAT.metal, new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8), mtx(p.x, h + 1.7, p.z));
      scene.add(signMesh(zoneTex, 1.8, 0.6, mtx(p.x, h + 2.6, p.z, fy)));
      if (z.limit !== 50) scene.add(signMesh(tex30, 0.9, 0.9, mtx(p.x, h + 3.5, p.z, fy)));
    }
  }
}

// ---------------------------------------------------------------- 가로등, 가로수, 전봇대
function buildStreetFurniture(ctx) {
  const { net, batch } = ctx;
  const trunks = [], leaves = [], leaves2 = [], lights = [], heads = [], poles = [];
  for (const e of net.edges) {
    if (e.type === 'local' && e.L < 150) continue;
    const s0 = Math.max(e.ta, e.curbA || 0) + 8, s1 = e.L - Math.max(e.tb, e.curbB || 0) - 8;
    for (const sg of [-1, 1]) {
      // 가로등
      if (e.type !== 'local') {
        for (let s = s0 + 5; s < s1; s += 36) {
          if (e.h(s) > 0.05) continue;
          const p = e.pt(s, sg * (e.hw + 0.9)), q = e.pt(s, sg * (e.hw - 1.4));
          lights.push(new THREE.CylinderGeometry(0.1, 0.14, 9, 8).applyMatrix4(mtx(p.x, 4.5, p.z)));
          const mid = e.pt(s, sg * (e.hw - 0.25));
          lights.push(new THREE.BoxGeometry(0.1, 0.1, 2.3).applyMatrix4(mtx(mid.x, 8.9, mid.z, yawZ(e.r))));
          heads.push(new THREE.BoxGeometry(0.35, 0.14, 0.7).applyMatrix4(mtx(q.x, 8.8, q.z, yawZ(e.r))));
        }
      }
      // 가로수 (플라타너스/은행나무)
      for (let s = s0 + 18 + R(0, 4); s < s1; s += R(9, 13)) {
        if (e.h(s) > 0.05 || rand() < 0.12) continue;
        const p = e.pt(s, sg * (e.hw + 2.8));
        const th = R(2.6, 3.4), cr = R(1.8, 2.8);
        trunks.push(new THREE.CylinderGeometry(0.15, 0.22, th, 6).applyMatrix4(mtx(p.x, th / 2, p.z)));
        const c = new THREE.IcosahedronGeometry(cr, 1);
        c.scale(1, R(1.1, 1.5), 1);
        c.applyMatrix4(mtx(p.x, th + cr * 0.9, p.z, rand() * 6));
        (rand() < 0.5 ? leaves : leaves2).push(c);
      }
      // 전봇대 + 전선
      if (e.type === 'urban' || e.type === 'local') {
        let prev = null;
        for (let s = s0; s < s1; s += 40) {
          if (e.h(s) > 0.05) { prev = null; continue; }
          const p = e.pt(s, sg * (e.hw + 3.9));
          poles.push(new THREE.CylinderGeometry(0.13, 0.19, 10, 8).applyMatrix4(mtx(p.x, 5, p.z)));
          poles.push(new THREE.BoxGeometry(1.8, 0.12, 0.12).applyMatrix4(mtx(p.x, 9.3, p.z, yawZ(e.u))));
          if (prev) {
            const L = Math.hypot(p.x - prev.x, p.z - prev.z);
            for (const dx of [-0.7, 0, 0.7]) {
              const m = e.pt(s - L / 2, sg * (e.hw + 3.9) + dx);
              poles.push(new THREE.BoxGeometry(0.025, 0.025, L).applyMatrix4(mtx(m.x, 9.35, m.z, yawZ(e.u))));
            }
          }
          prev = p;
        }
      }
    }
  }
  batch.add(MAT.bark, mergeGeometries(trunks.map((g) => g.toNonIndexed())));
  batch.add(MAT.leaf, mergeGeometries(leaves.map((g) => g.index ? g.toNonIndexed() : g)));
  batch.add(MAT.leaf2, mergeGeometries(leaves2.map((g) => g.index ? g.toNonIndexed() : g)));
  batch.add(MAT.metal, mergeGeometries(lights.map((g) => g.toNonIndexed())));
  batch.add(std(0xeeeeea, { emissive: 0x777766 }), mergeGeometries(heads.map((g) => g.toNonIndexed())));
  batch.add(MAT.concrete, mergeGeometries(poles.map((g) => g.toNonIndexed())));
}

// ---------------------------------------------------------------- 안내도 속 주요 건물
function placeLandmark(ctx, L) {
  const { net } = ctx;
  const p = toWorld(...L.at);
  let best = null;
  for (const e of net.edges) {
    const l = e.local(p.x, p.z), cs = clamp(l.s, 0, e.L), d = Math.hypot(l.s - cs, l.o);
    if (!best || d < best.d) best = { e, s: cs, o: l.o, d };
  }
  const { e } = best, side = best.o >= 0 ? 1 : -1;
  const lo = e.ta + L.w / 2 + 6, hi = e.L - e.tb - L.w / 2 - 6;
  for (const extra of [0, 12, 30]) {
    for (const ds of [0, 15, -15, 30, -30, 50, -50, 80, -80]) {
      const s = lo < hi ? clamp(best.s + ds, lo, hi) : e.L / 2;
      const c = e.pt(s, side * (e.hw + 6 + L.d / 2 + extra));
      const ob = { x: c.x, z: c.z, ux: e.u.x, uz: e.u.z, hu: L.w / 2, hr: L.d / 2 };
      if (ctx.fits(ob)) return buildLandmark(ctx, L, ob, e, side, s, extra);
    }
  }
  console.warn('랜드마크 배치 실패:', L.name);
}

function buildLandmark(ctx, L, ob, e, side, s, extra) {
  const { batch, scene } = ctx;
  const M = mtx(ob.x, 0, ob.z, yawX(e.u));
  const at = (x, y, z, yaw = 0) => M.clone().multiply(mtx(x, y, z, yaw));
  const f = -side; // 도로 쪽 (로컬 z)
  const faceYaw = f > 0 ? 0 : Math.PI;
  const { w, d, h } = L;
  const sign = (text, sw, sh, y, opts, x = 0, z = f * (d / 2 + 0.08)) =>
    scene.add(signMesh(textTex(text, opts), sw, sh, at(x, y, z, faceYaw)));
  const body = (style, bw, bh, bd, x = 0, z = 0, tile) => {
    batch.add(style, boxGeo(bw, bh, bd, tile), at(x, bh / 2, z), 'building');
  };
  ctx.addObb(ob);

  switch (L.type) {
    case 'school': {
      body(STYLES.school, w, h, d);
      sign(L.name, Math.min(w * 0.6, 22), 2.2, h - 1.6, { bg: '#efe7d3', fg: '#1d3f8f' });
      // 운동장은 건물 앞 보도 쪽이 아닌 뒤편
      const pg = new THREE.PlaneGeometry(w, 30); pg.rotateX(-Math.PI / 2);
      batch.add(MAT.sand, pg, at(0, 0.03, -f * (d / 2 + 17)));
      break;
    }
    case 'univ':
      body(STYLES.brick, w, h, d);
      body(STYLES.brick, w * 0.5, h + 6.6, d * 0.8, -w * 0.2, -f * (d + 8));
      sign(L.name, Math.min(w * 0.7, 20), 2.2, h - 1.6, { bg: '#7a3b2c', fg: '#fff' });
      break;
    case 'apt': {
      const count = L.count || 1;
      body(STYLES.apt, w, h, d);
      sign(L.name.replace('아파트', ''), 16, 3, h - 2.5, { bg: '#f0eee8', fg: '#2b4c7e' });
      for (let i = 1; i < count; i++) {
        const z = -f * i * (d + 26), x = (i % 2 ? 1 : -1) * 12;
        const sub = { x: 0, z: 0, ux: e.u.x, uz: e.u.z, hu: w / 2, hr: d / 2 };
        const c = e.pt(s + x, side * (e.hw + 6 + d / 2 + extra + i * (d + 26)));
        Object.assign(sub, { x: c.x, z: c.z });
        if (!ctx.fits(sub)) continue;
        ctx.addObb(sub);
        body(i % 2 ? STYLES.apt2 : STYLES.apt, w, h - 3.3 * (i % 3), d, x, z);
        sign(`${100 + i + 1}동`, 6, 3, h - 3.3 * (i % 3) - 3, { bg: '#f0eee8', fg: '#2b4c7e' }, x, z + f * (d / 2 + 0.08));
      }
      sign('101동', 6, 3, h - 7, { bg: '#f0eee8', fg: '#2b4c7e' }, w / 2 - 5);
      break;
    }
    case 'church':
      body(STYLES.white, w, h, d);
      body(STYLES.white, 10, h + 16, 10, w / 2 - 6, 0);
      batch.box(MAT.red, 0.6, 7, 0.6, at(w / 2 - 6, h + 19.5, 0));
      batch.box(MAT.red, 4, 0.6, 0.6, at(w / 2 - 6, h + 21, 0));
      sign(L.name, 26, 3.2, h - 3, { bg: '#5b2a86', fg: '#fff' });
      break;
    case 'warehouse':
      body(STYLES.corrugated, w, h, d, 0, 0, 8);
      sign(L.name, 24, 2.6, h - 2, { bg: '#1d4e89', fg: '#fff' });
      break;
    case 'gas': {
      batch.box(std(0xf4f4f4), w * 0.8, 1.0, d * 0.62, at(0, 5.6, f * d * 0.1));
      batch.box(std(L.color), w * 0.8 + 0.1, 0.4, d * 0.62 + 0.1, at(0, 5.3, f * d * 0.1));
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) batch.box(MAT.concrete, 0.5, 5.2, 0.5, at(x * w * 0.3, 2.6, f * d * 0.1 + z * d * 0.2));
      for (const x of [-0.2, 0.2]) batch.box(std(L.color), 0.9, 1.8, 0.6, at(x * w, 0.9, f * d * 0.1));
      body(STYLES.white, w * 0.45, 4.2, d * 0.3, 0, -f * d * 0.33);
      const px = w / 2 - 1.5;
      batch.box(MAT.metal, 0.4, 8, 0.4, at(px, 4, f * (d / 2 - 1)));
      sign(L.name, 5.5, 1.8, 7.6, { bg: L.color, fg: '#fff' }, px, f * (d / 2 - 0.7));
      sign('셀프 주유', 3.5, 1, 5.8, { bg: '#fff', fg: '#333', h: 96 }, px, f * (d / 2 - 0.7));
      break;
    }
    case 'golf':
      body(STYLES.white, w * 0.5, 6.6, 12, 0, f * (d / 2 - 6));
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) batch.box(MAT.metal, 0.5, h, 0.5, at(x * w / 2, h / 2, z * d / 2));
      for (const [x, z, ww, yaw] of [[0, d / 2, w, 0], [0, -d / 2, w, 0], [w / 2, 0, d, Math.PI / 2], [-w / 2, 0, d, Math.PI / 2]]) {
        const g = new THREE.PlaneGeometry(ww, h);
        batch.add(MAT.net, g, at(x, h / 2, z, yaw));
      }
      sign(L.name, 14, 2.2, 5.2, { bg: '#2e7d32', fg: '#fff' }, 0, f * (d / 2 + 0.1));
      break;
    case 'showroom':
      body(STYLES.glass, w, h, d);
      sign(L.name, 18, 2, h - 1.4, { bg: '#002c5f', fg: '#fff' });
      break;
    case 'market':
      body(STYLES.beige, w, h, d);
      for (let x = -w / 2 + 3; x < w / 2 - 2; x += 6) batch.box(std(pick([0xc0392b, 0x2e86c1, 0x27ae60, 0xf39c12])), 5.4, 0.2, 2.2, at(x + 2.7, 3.3, f * (d / 2 + 1.1)));
      sign(L.name, 16, 2.4, h - 1.4, { bg: '#e67e22', fg: '#fff' });
      break;
    case 'busdepot':
      body(STYLES.gray, 14, h, d * 0.5, -w / 2 + 7, -f * d * 0.25);
      for (let i = 0; i < 4; i++) {
        batch.box(MAT.bus, 2.5, 3.1, 11, at(-2 + i * 4, 1.8, f * 2, 0));
        batch.box(MAT.glassDark, 2.55, 1.0, 10.6, at(-2 + i * 4, 2.3, f * 2, 0));
      }
      sign(L.name, 8, 1.6, h - 1, { bg: '#2c9a5a', fg: '#fff' }, -w / 2 + 7, f * 0.08);
      break;
    case 'station':
      body(STYLES.gray, w, h, d);
      sign(L.name, 10, 2, h - 1.5, { bg: '#fff', fg: '#1a1a1a', border: '#0052a4' });
      break;
    case 'academy':
      body(STYLES.white, w, h, d);
      sign(L.name, Math.min(w * 0.9, 24), 2.4, h - 1.6, { bg: '#0b6e4f', fg: '#fff' });
      break;
    default: // shop, garage, villa, inspection
      body(L.type === 'villa' ? STYLES.brick : STYLES.white, w, h, d);
      if (L.type === 'garage' || L.type === 'inspection') {
        for (let x = -w / 2 + 4; x < w / 2 - 3; x += 7) batch.box(MAT.glassDark, 5, 4.2, 0.2, at(x + 2.5, 2.1, f * (d / 2 + 0.05)));
      }
      sign(L.name, Math.min(w * 0.9, 16), 1.8, Math.min(h - 1.2, 5.5), { bg: L.type === 'villa' ? '#f3efe6' : '#c0392b', fg: L.type === 'villa' ? '#333' : '#fff' });
  }
}

// ---------------------------------------------------------------- 일반 건물 채우기
function buildFillers(ctx) {
  const { net, batch } = ctx;
  const signs = [];
  const commercial = [STYLES.white, STYLES.beige, STYLES.gray, STYLES.brick, STYLES.white, STYLES.glass];
  for (const e of net.edges) {
    for (const side of [-1, 1]) {
      for (const row of [0, 1, 2]) {
        let s = e.ta + 8 + R(0, 6);
        while (s < e.L - e.tb - 8) {
          const apt = row === 2 && rand() < 0.55;
          const w = apt ? R(36, 54) : R(11, 26), d = apt ? R(12, 15) : R(11, 20);
          const floors = apt ? Math.round(R(12, 22)) : row === 0 ? Math.round(R(2, 6)) : Math.round(R(3, 10));
          const h = floors * 3.3 + 0.4;
          const o = side * (e.hw + 5.8 + row * 28 + d / 2 + R(0, 2));
          const c = e.pt(s + w / 2, o);
          const ob = { x: c.x, z: c.z, ux: e.u.x, uz: e.u.z, hu: w / 2, hr: d / 2 };
          if (c.x < -2000 || c.x > 3600 || Math.abs(c.z) > 1200 || !ctx.fits(ob)) { s += 5; continue; }
          ctx.addObb(ob);
          const style = apt ? pick([STYLES.apt, STYLES.apt2]) : pick(commercial);
          batch.add(style, boxGeo(w, h, d), mtx(c.x, h / 2, c.z, yawX(e.u)), 'building');
          if (rand() < 0.3) batch.box(MAT.concrete, R(3, 6), 2.6, R(3, 5), mtx(c.x + R(-3, 3), h + 1.3, c.z + R(-2, 2), yawX(e.u)));
          // 1열 저층 상가 간판
          if (row === 0 && floors <= 6 && !apt) {
            const M = mtx(c.x, 0, c.z, yawX(e.u));
            const f = -side;
            for (let k = 1; k <= Math.min(floors - 1, 3); k++) {
              if (rand() < 0.25) continue;
              const sw = Math.min(w * R(0.55, 0.9), 12);
              const g = shopSignGeo(Math.floor(rand() * SHOP_WORDS.length), sw, sw / 8);
              g.applyMatrix4(M.clone().multiply(mtx(R(-1, 1) * (w - sw) / 2, 3.3 * k - 0.6, f * (d / 2 + 0.1), f > 0 ? 0 : Math.PI)));
              signs.push(g.toNonIndexed());
            }
          }
          s += w + R(2, 7);
        }
      }
    }
  }
  if (signs.length) {
    const sg = mergeGeometries(signs);
    displace(sg, 'road');
    const m = new THREE.Mesh(sg, MAT_SHOPSIGN);
    m.userData.fixed = true;
    ctx.scene.add(m);
  }

  // 블록 안쪽: 다세대 빌라 + 아파트 단지
  const nearestDir = (x, z) => {
    let best = null;
    for (const e of net.edges) {
      const l = e.local(x, z), d = Math.hypot(l.s - clamp(l.s, 0, e.L), l.o);
      if (!best || d < best.d) best = { d, u: e.u };
    }
    return best.u;
  };
  for (let x = -1900; x < 3500; x += 31) {
    for (let z = -760; z < 980; z += 31) {
      const jx = x + R(-5, 5), jz = z + R(-5, 5);
      if (ctx.T.hill(jx, jz) > 2.5) continue; // 언덕은 숲
      const apt = Math.sin(jx * 0.0045 + 0.7) + Math.cos(jz * 0.006 + 2.1) > 0.9;
      const u = nearestDir(jx, jz);
      const w = apt ? R(40, 56) : R(12, 20), d = apt ? 14 : R(10, 16);
      const floors = apt ? Math.round(R(13, 25)) : Math.round(R(3, 5));
      const ob = { x: jx, z: jz, ux: u.x, uz: u.z, hu: w / 2, hr: d / 2 };
      if (!ctx.fits(ob)) continue;
      ctx.addObb(ob);
      const h = floors * 3.3 + 0.4;
      batch.add(apt ? pick([STYLES.apt, STYLES.apt2]) : pick([STYLES.brick, STYLES.brick, STYLES.beige, STYLES.white]), boxGeo(w, h, d), mtx(jx, h / 2, jz, yawX(u)), 'building');
      if (!apt && rand() < 0.5) batch.box(MAT.concrete, 3, 2.4, 3, mtx(jx, h + 1.2, jz, yawX(u)));
    }
  }
}

// 언덕 위 숲
function buildForest(ctx) {
  const trunks = [], leaves = [];
  for (const H of ctx.T.hills) {
    for (let x = H.x - H.r; x < H.x + H.r; x += 9) {
      for (let z = H.z - H.r; z < H.z + H.r; z += 9) {
        const px = x + R(-3.5, 3.5), pz = z + R(-3.5, 3.5);
        const hh = ctx.T.hill(px, pz);
        if (hh < 2) continue;
        if ([...ctx.nearObbs({ x: px, z: pz, ux: 1, uz: 0, hu: 2, hr: 2 })].some((o) => obbOverlap({ x: px, z: pz, ux: 1, uz: 0, hu: 2, hr: 2 }, o))) continue;
        const y = ctx.T.groundY(px, pz), th = R(2.5, 4), cr = R(2.2, 3.6);
        trunks.push(new THREE.CylinderGeometry(0.18, 0.26, th, 5).toNonIndexed().translate(px, y + th / 2, pz));
        const c = new THREE.IcosahedronGeometry(cr, 0);
        c.scale(1, R(1.1, 1.6), 1);
        c.translate(px, y + th + cr * 0.9, pz);
        leaves.push(c);
      }
    }
  }
  if (trunks.length) {
    ctx.batch.add(MAT.bark, mergeGeometries(trunks), null, 'none');
    ctx.batch.add(MAT.leaf2, mergeGeometries(leaves), null, 'none');
  }
}

// 먼 배경의 아파트 단지
function buildSkyline(ctx) {
  const cx = 800, cz = 0;
  for (let i = 0; i < 90; i++) {
    const ang = rand() * Math.PI * 2, rad = R(1700, 2600);
    const bx = cx + Math.cos(ang) * rad * 1.6, bz = cz + Math.sin(ang) * rad * 0.8;
    const yaw = rand() * Math.PI, n = Math.round(R(3, 6));
    for (let k = 0; k < n; k++) {
      const h = Math.round(R(15, 30)) * 3.3, w = R(40, 60);
      const ox = (k % 3) * 70 - 70, oz = Math.floor(k / 3) * 50;
      const x = bx + Math.cos(yaw) * ox + Math.sin(yaw) * oz, z = bz - Math.sin(yaw) * ox + Math.cos(yaw) * oz;
      ctx.batch.add(pick([STYLES.apt, STYLES.apt2]), boxGeo(w, h, 14), mtx(x, h / 2, z, yaw), 'building');
    }
  }
}
