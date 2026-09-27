// 도로망: 노드(교차로)와 구간(도로) 기하 계산
import { NODES, NODE_H, EDGES, ROAD_TYPES, SIGNAL_NODES, CROSSWALK_NODES, ZEBRA_NODES, TAPER_NODES, SCHOOL_ZONES, RIGHT_STOP, RIGHT_SIGNALS, LANE_USE, SIGNAL_HEADS, GUIDE_LINES, SAFETY_ZONES, toWorld } from './map.js';

export const CW_W = 5; // 횡단보도 폭(m)

export class Edge {
  constructor(a, b, type, opt = {}) {
    Object.assign(this, ROAD_TYPES[type]);
    this.id = `${a.id}-${b.id}`;
    this.type = type;
    this.a = a; this.b = b;
    const dx = b.x - a.x, dz = b.z - a.z;
    this.L = Math.hypot(dx, dz);
    this.u = { x: dx / this.L, z: dz / this.L }; // a→b 방향
    this.r = { x: -this.u.z, z: this.u.x }; // a→b 진행 시 오른쪽 (우측통행: +o 쪽이 a→b 차로)
    this.oneway = !!this.oneway;
    // 방향별 차로 수: lanesP = a→b(+o 쪽), lanesN = b→a(-o 쪽). 한쪽만 늘어난 구간(3거리 앞 3차로 등)
    if (opt.median !== undefined) this.median = opt.median;
    this.lanesP = opt.lanesP || this.lanes;
    this.lanesN = opt.lanesN || this.lanes;
    this.lanes = Math.max(this.lanesP, this.lanesN);
    this.hw = this.oneway ? (this.lanes * this.laneW) / 2 : this.median / 2 + this.lanes * this.laneW; // 넓은 쪽 기준
    // 중앙선을 +o 쪽으로 옮기는 거리(m). 좌측에 차로가 새로 생기는 구간은 바깥 가장자리를 이웃 구간과 맞춘다
    // shiftAB: [a 쪽, b 쪽] 차로 수 — 사이는 서서히 옮긴다 (교차로 건너편 차로가 어긋난 곳)
    const [sa, sb] = opt.shiftAB || [opt.shiftLanes || 0, opt.shiftLanes || 0];
    this.shiftA = sa * this.laneW; this.shiftB = sb * this.laneW;
    this.profile = opt.profile || null;
    this.linear = !!opt.linear;
    this.pocketA = opt.pocketA || 0;
    this.pocketB = opt.pocketB || 0;
    this.uturn = (opt.uturn || '') + (opt.uturn2 || '') || null; // 'a' | 'b' | 'ab' : 유턴 허용 전용차로가 있는 쪽
    this.bus = !!opt.bus; // 버스전용차로 (바깥 차로)
    this.merge = !!opt.merge;
    this.medianStyle = opt.medianStyle || this.medianStyle || null;
    this.centerPosts = opt.centerPosts || null;
    this.centerGuard = !!opt.centerGuard; // 전용차로 구간까지 중앙 가드레일
    this.curve = !!opt.curve; // 미니맵에는 안내도대로 꺾인 모양으로 그리는 곡선 구간
    this.uturnPlate = opt.uturnPlate || null;
    this.name = opt.name || '';
  }
  pt(s, o) {
    o += this.shiftS(s);
    return { x: this.a.x + this.u.x * s + this.r.x * o, z: this.a.z + this.u.z * s + this.r.z * o };
  }
  // 노드 n에서 바깥쪽을 볼 때 기준의 중앙선 이동량
  shiftAt(n) { return n === this.a ? this.shiftA : -this.shiftB; }
  shiftS(s) { return this.shiftA + ((this.shiftB - this.shiftA) * s) / this.L; }
  // dir(+1/-1) 방향 차로 수, sg(+1/-1) 쪽 가장자리까지 거리
  nl(dir) { return this.oneway ? this.lanes : dir > 0 ? this.lanesP : this.lanesN; }
  hwS(sg) { return this.oneway ? this.hw : this.median / 2 + this.nl(sg) * this.laneW; }
  local(x, z) {
    const dx = x - this.a.x, dz = z - this.a.z;
    const s = dx * this.u.x + dz * this.u.z;
    return { s, o: dx * this.r.x + dz * this.r.z - this.shiftS(s) };
  }
  h(s) {
    const p = this.profile;
    if (!p) return 0;
    if (s <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) {
      if (s <= p[i][0]) {
        const t = (s - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
        return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (this.linear ? t : t * t * (3 - 2 * t));
      }
    }
    return p[p.length - 1][1];
  }
  // dir: +1 = a→b, -1 = b→a. 진행방향 기준 차로 중심의 o (lane 0 = 좌회전 전용차로)
  laneO(dir, lane) {
    if (this.oneway) return 0;
    return dir * (lane === 0 ? 0 : this.median / 2 + (lane - 0.5) * this.laneW);
  }
  // dir 방향으로 도착하는 노드 쪽 끝 정보
  endFor(dir) { return dir > 0 ? this.ends.b : this.ends.a; }
  // 노드 중심에서 d만큼 떨어진 지점의 s (dir 방향 도착 노드 기준)
  sFromEnd(dir, d) { return dir > 0 ? this.L - d : d; }
  // dir 방향 좌회전 전용차로 구간 [s0, s1]
  pocket(dir) {
    if (dir > 0 && this.pocketB) { const e = this.ends.b.stop; return [this.L - e - this.pocketB, this.L - e]; }
    if (dir < 0 && this.pocketA) { const e = this.ends.a.stop; return [e, e + this.pocketA]; }
    return null;
  }
  // 유턴 허용 구간 (전용차로 끝 28m) [s0, s1]
  uturnAt(side) { return !!this.uturn && this.uturn.includes(side); }
  uturnZones() {
    const zs = [];
    if (this.uturnAt('b')) { const p = this.pocket(1); zs.push([p[1] - 28, p[1] + 1]); }
    if (this.uturnAt('a')) { const p = this.pocket(-1); zs.push([p[0] - 1, p[0] + 28]); }
    return zs;
  }
  uturnZone() {
    return this.uturnZones()[0] || null;
    return null;
  }
  inUturnZone(s) {
    return this.uturnZones().some((z) => s > z[0] && s < z[1]);
  }
}

function endInfo(node, t) {
  if (node.kind === 'signal') {
    const cw0 = t + 0.5, cw1 = cw0 + CW_W;
    return { t, cw: [cw0, cw1], stop: cw1 + 1.2, mark: cw1 + 1.7 };
  }
  if (node.kind === 'crosswalk' || node.kind === 'zebra') return { t, cw: [0, CW_W / 2], stop: CW_W / 2 + 1.5, mark: CW_W / 2 + 2 };
  return { t, cw: null, stop: 0, mark: t + 0.5 };
}

function cross(a, b) { return a.x * b.z - a.z * b.x; }
function dot(a, b) { return a.x * b.x + a.z * b.z; }

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(sub(lower.at(-1), lower.at(-2)), sub(q, lower.at(-2))) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(sub(upper.at(-1), upper.at(-2)), sub(q, upper.at(-2))) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function sub(a, b) { return { x: a.x - b.x, z: a.z - b.z }; }

function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export class Net {
  constructor() {
    this.nodes = {};
    for (const [id, [px, py]] of Object.entries(NODES)) {
      const p = toWorld(px, py);
      // zebra: 신호등 없는 횡단보도
      const kind = SIGNAL_NODES.includes(id) ? 'signal' : CROSSWALK_NODES.includes(id) ? 'crosswalk' : ZEBRA_NODES.includes(id) ? 'zebra' : 'plain';
      this.nodes[id] = { id, x: p.x, z: p.z, h: NODE_H[id] || 0, edges: [], kind, taper: TAPER_NODES.includes(id) };
    }
    this.edges = EDGES.map(([a, b, type, opt]) => {
      const e = new Edge(this.nodes[a], this.nodes[b], type, opt);
      this.nodes[a].edges.push(e);
      this.nodes[b].edges.push(e);
      return e;
    });
    for (const n of Object.values(this.nodes)) this.computeTrims(n);
    for (const e of this.edges) e.ends = { a: endInfo(e.a, e.ta), b: endInfo(e.b, e.tb) };
    for (const n of Object.values(this.nodes)) {
      n.poly = this.nodePoly(n);
      n.fillets = [];
      n.returns = [];
      if (n.poly) this.nodeFillets(n);
    }
    this.elevated = this.edges.filter((e) => e.profile);
    this.highNodes = Object.values(this.nodes).filter((n) => n.h > 0 && n.poly);
    // 어린이보호구역 → 구간별 s 범위
    this.zones = SCHOOL_ZONES.map((z) => {
      const e = this.edgeBetween(...z.edge);
      let s0, s1;
      if (z.x) [s0, s1] = z.x.map((px) => e.local(toWorld(px, 0).x, e.a.z).s).sort((a, b) => a - b);
      else [s0, s1] = [0, e.L];
      return { edge: e, s0: Math.max(s0, e.ta), s1: Math.min(s1, e.L - e.tb), limit: z.limit, paint: z.paint !== false };
    });
    // 우회전 시 일시정지가 필요한 진입로: `${edge.id}>${node.id}`
    const key = (from, to) => `${this.edgeBetween(from, to).id}>${to}`;
    this.rightStop = new Set(RIGHT_STOP.map(([from, to]) => key(from, to)));
    this.rightSignals = new Set(RIGHT_SIGNALS.map(([from, to]) => key(from, to)));
    this.laneUseMap = new Map(LANE_USE.map(([from, to, use]) => [key(from, to), use]));
    this.signalHeads = new Map(SIGNAL_HEADS.map(([from, to, far, near]) => [key(from, to), { far, near }]));
    // 노면 유도선: 교차로 via를 from → to로 직진하는 차로를 잇는다
    this.guides = GUIDE_LINES.map(([from, via, to, type]) => {
      const n = this.nodes[via], eIn = this.edgeBetween(from, via), eOut = this.edgeBetween(via, to);
      return { node: n, eIn, dIn: n === eIn.b ? 1 : -1, eOut, dOut: n === eOut.a ? 1 : -1, left: type === 'left' };
    });
    // 백색 안전지대 (빗금, 진입 금지): dir 방향 lane 차로 자리, 앞쪽 노드 끝에서 from m ~ 뒤쪽 노드 끝에서 toEnd m
    this.safety = SAFETY_ZONES.map((z) => {
      const e = this.edgeBetween(...z.edge);
      const [s0, s1] = z.dir > 0 ? [e.ta + z.from, e.L - e.tb - z.toEnd] : [e.ta + z.toEnd, e.L - e.tb - z.from];
      return { edge: e, dir: z.dir, lane: z.lane, s0, s1 };
    });
  }

  // 교차로 n을 eIn → eOut으로 직진할 때 노면 유도선(같은 번호 차로로 잇는 선)이 있는지
  hasGuide(n, eIn, eOut) { return this.guides.some((g) => !g.left && g.node === n && g.eIn === eIn && g.eOut === eOut); }

  // 교차로 n으로 들어가는 구간 e에 우회전 전용 신호등이 있는지
  hasRightSignal(e, n) { return this.rightSignals.has(`${e.id}>${n.id}`); }

  // 교차로 n으로 들어가는 구간 e의 차로별 진행방향 (지정이 없으면 null)
  laneUse(e, n) { return this.laneUseMap.get(`${e.id}>${n.id}`) || null; }

  // 차로 lane(1..)에서 mv 진행이 허용되는지 (지정 없으면 null)
  laneAllows(e, n, lane, mv) {
    const use = this.laneUse(e, n);
    if (!use || lane < 1) return null;
    const t = use[Math.min(lane, use.length) - 1];
    if (mv === 'left') return t === 'left' || t === 'sl';
    if (mv === 'right') return t === 'right' || t === 'sr';
    return t === 'straight' || t === 'sl' || t === 'sr';
  }

  // 위치(locate 결과)의 제한속도
  speedLimit(loc) {
    if (loc && loc.edge) for (const z of this.zones) if (z.edge === loc.edge && loc.s >= z.s0 && loc.s <= z.s1) return z.limit;
    return 50;
  }

  // 노드 n에서 구간 e를 따라 멀어지는 방향
  away(e, n) { return n === e.a ? e.u : { x: -e.u.x, z: -e.u.z }; }

  edgeBetween(a, b) {
    return this.edges.find((e) => (e.a.id === a && e.b.id === b) || (e.a.id === b && e.b.id === a));
  }

  computeTrims(n) {
    // 굽은 길 (교차로가 아닌 꺾임점): 이음매만큼만 잘라낸다
    if (n.edges.length === 2 && n.kind === 'plain') {
      const [e1, e2] = n.edges, w1 = this.away(e1, n), w2 = this.away(e2, n);
      const defl = Math.PI - Math.acos(Math.max(-1, Math.min(1, dot(w1, w2))));
      const t = n.taper ? 14 : defl < 0.05 ? 0 : (Math.max(e1.hw, e2.hw) + 0.5) * Math.tan(defl / 2);
      for (const e of n.edges) if (n === e.a) e.ta = t; else e.tb = t;
      return;
    }
    for (const e of n.edges) {
      const w = this.away(e, n);
      let t = 0;
      for (const o of n.edges) {
        if (o === e) continue;
        const v = this.away(o, n);
        const sin = Math.abs(cross(w, v)), cos = w.x * v.x + w.z * v.z;
        if (sin < 0.25) continue; // 일직선으로 이어지는 도로
        t = Math.max(t, (o.hw + 1.5) / sin + ((e.hw + 1.5) * Math.abs(cos)) / sin);
      }
      if (n === e.a) e.ta = t; else e.tb = t;
    }
  }

  nodePoly(n) {
    if (n.edges.length < 2 || n.kind === 'crosswalk' || n.kind === 'zebra') return null;
    const pts = [];
    for (const e of n.edges) {
      const w = this.away(e, n), t = n === e.a ? e.ta : e.tb;
      if (t === 0) return null;
      const r = { x: -w.z, z: w.x };
      for (const sgn of [-1, 1]) {
        const hw = e.hwS(n === e.a ? sgn : -sgn) + e.shiftAt(n) * sgn;
        pts.push({ x: n.x + w.x * t + r.x * hw * sgn, z: n.z + w.z * t + r.z * hw * sgn });
      }
    }
    return convexHull(pts);
  }

  // 이웃한 두 도로 사이 모서리까지 포장하고, 모서리는 반지름 R의 곡선 연석으로 깎는다
  nodeFillets(n, R = 8) {
    const arms = n.edges.map((e) => {
      const w = this.away(e, n), t = n === e.a ? e.ta : e.tb;
      return { e, w, t, r: { x: -w.z, z: w.x }, ang: Math.atan2(w.z, w.x) };
    }).sort((a, b) => a.ang - b.ang);
    const out = [];
    for (let i = 0; i < arms.length; i++) {
      const A = arms[i], B = arms[(i + 1) % arms.length];
      let gap = B.ang - A.ang;
      if (gap <= 0) gap += Math.PI * 2;
      if (gap > Math.PI * 0.95) continue; // 반대편이 트인 쪽 (T자 윗변 등)
      const sa = Math.sign(dot(A.r, B.w)) || 1, sb = Math.sign(dot(B.r, A.w)) || 1;
      const ha = A.e.hwS(n === A.e.a ? sa : -sa) + A.e.shiftAt(n) * sa, hb = B.e.hwS(n === B.e.a ? sb : -sb) + B.e.shiftAt(n) * sb;
      const ca = { x: n.x + A.w.x * A.t + A.r.x * sa * ha, z: n.z + A.w.z * A.t + A.r.z * sa * ha };
      const cb = { x: n.x + B.w.x * B.t + B.r.x * sb * hb, z: n.z + B.w.z * B.t + B.r.z * sb * hb };
      // 두 도로 경계선의 교점
      const den = cross(A.w, B.w);
      if (Math.abs(den) < 1e-3) continue;
      const k = cross(sub(cb, ca), B.w) / den;
      const X = { x: ca.x + A.w.x * k, z: ca.z + A.w.z * k };
      if (Math.hypot(X.x - n.x, X.z - n.z) > 80) continue;
      n.fillets.push([ca, X, cb]);
      // 곡선 연석: 두 경계선에 접하는 원호와 모서리 X 사이를 포장
      const tl = Math.min(25, R / Math.tan(gap / 2));
      const PA = { x: X.x + A.w.x * tl, z: X.z + A.w.z * tl }, PB = { x: X.x + B.w.x * tl, z: X.z + B.w.z * tl };
      const bis = { x: A.w.x + B.w.x, z: A.w.z + B.w.z }, bl = Math.hypot(bis.x, bis.z);
      const rr = tl * Math.tan(gap / 2), cd = Math.hypot(tl, rr);
      const C = { x: X.x + (bis.x / bl) * cd, z: X.z + (bis.z / bl) * cd };
      const a0 = Math.atan2(PA.z - C.z, PA.x - C.x), a1 = Math.atan2(PB.z - C.z, PB.x - C.x);
      let da = a1 - a0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const ret = [X, PA];
      for (let k = 1; k < 8; k++) { const a = a0 + (da * k) / 8; ret.push({ x: C.x + Math.cos(a) * rr, z: C.z + Math.sin(a) * rr }); }
      ret.push(PB);
      n.returns.push(ret);
      // 연석·가로수는 곡선이 끝나는 곳부터
      for (const [arm, P] of [[A, PA], [B, PB]]) {
        const sT = (P.x - n.x) * arm.w.x + (P.z - n.z) * arm.w.z;
        if (n === arm.e.a) arm.e.curbA = Math.max(arm.e.curbA || 0, sT); else arm.e.curbB = Math.max(arm.e.curbB || 0, sT);
      }
    }
  }

  inNode(n, x, z) {
    return n.poly && (inPoly(n.poly, x, z) || n.fillets.some((f) => inPoly(f, x, z)) || n.returns.some((f) => inPoly(f, x, z)));
  }

  // 위치가 어느 도로(구간/교차로) 위인지 (y: 현재 높이 — 입체교차에서 위/아래 구분)
  locate(x, z, y = 0) {
    let best = null;
    for (const e of this.edges) {
      const { s, o } = e.local(x, z);
      if (s < e.ta - 0.5 || s > e.L - e.tb + 0.5 || o > e.hwS(1) + 0.3 || o < -e.hwS(-1) - 0.3) continue;
      if (Math.abs(e.h(s) - y) > 2.5) continue;
      if (!best || Math.abs(o) - e.hw < Math.abs(best.o) - best.edge.hw) best = { edge: e, s, o };
    }
    if (best) return best;
    for (const n of Object.values(this.nodes)) {
      if (Math.abs(n.h - y) <= 2.5 && this.inNode(n, x, z)) return { node: n };
    }
    return null;
  }

  // 노면 높이: 현재 높이 y에서 올라설 수 있는 면(y+1m 이하) 중 가장 높은 면
  height(x, z, y = 0) {
    let best = 0;
    const take = (h) => { if (h <= y + 1 && h > best) best = h; };
    for (const e of this.elevated) {
      const { s, o } = e.local(x, z);
      if (s >= 0 && s <= e.L && Math.abs(o) <= e.hw + 2) take(e.h(s));
    }
    for (const n of this.highNodes) if (this.inNode(n, x, z)) take(n.h);
    return best;
  }

  // 고가 구간 e의 (x,z) 아래에 다른 도로가 지나가는지
  roadBelow(e, x, z) {
    return this.edges.some((o) => {
      if (o === e || o.a === e.a || o.a === e.b || o.b === e.a || o.b === e.b) return false;
      const l = o.local(x, z);
      return l.s > -2 && l.s < o.L + 2 && Math.abs(l.o) < o.hw + 4 && o.h(l.s) < e.h(e.local(x, z).s) - 3;
    });
  }

  // 점과 도로 중심선 사이 최단거리 - 도로 반폭 (음수면 차도 안)
  roadClearance(x, z) {
    let m = Infinity;
    for (const e of this.edges) {
      const { s, o } = e.local(x, z);
      const cs = Math.max(0, Math.min(e.L, s));
      const d = Math.hypot(s - cs, o) - e.hw;
      if (d < m) m = d;
    }
    return m;
  }
}

// 진입 방향 h1 → 진출 방향 h2 의 진행 종류
export function classifyTurn(h1, h2, node) {
  const ang = Math.atan2(cross(h1, h2), dot(h1, h2));
  const deg = (Math.abs(ang) * 180) / Math.PI;
  const straightMax = node && node.kind === 'signal' ? 45 : 60;
  return deg < straightMax ? 'straight' : deg > 150 ? 'U' : ang > 0 ? 'right' : 'left';
}

// 구간 e로 노드 n에 들어올 때 좌회전 가능한 길이 있는지 (좌회전 신호등 여부)
export function hasLeftTurn(net, e, n) {
  const dirIn = n === e.b ? 1 : -1;
  const h1 = { x: e.u.x * dirIn, z: e.u.z * dirIn };
  return n.edges.some((o) => o !== e && (!o.oneway || o.a === n) && classifyTurn(h1, net.away(o, n), n) === 'left');
}

export function signalGroup(e, node) {
  // 동서 방향(큰길)이 주도로
  return Math.abs(e.u.x) > 0.7 ? 'main' : 'cross';
}
