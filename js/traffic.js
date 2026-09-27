// 다른 차량(NPC): 차로를 따라 달리며 신호·앞차·보행자를 보고 멈춘다
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { signalGroup, classifyTurn } from './net.js';
import { signalState, movementAllowed, rightArrowState } from './signals.js';
import { roadT } from './terrain.js';

const COUNT = 42;
const SPAWN_MIN = 320, ACTIVE_R = 650, DESPAWN_R = 760;
const COLORS = [0xf2f2f2, 0xf2f2f2, 0xe8e8e8, 0x1c1c1c, 0x1c1c1c, 0x9aa0a6, 0x6b7075, 0x1f3a5f, 0x8b1e1e, 0xf2a33a, 0x2f4f3a];

function carGeometry(color) {
  const parts = [];
  const add = (g, c, x, y, z) => {
    g = g.toNonIndexed();
    g.translate(x, y, z);
    const col = new THREE.Color(c), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  add(new THREE.BoxGeometry(1.8, 0.62, 4.5), color, 0, 0.6, 0);
  add(new THREE.BoxGeometry(1.6, 0.56, 2.3), 0x1b242b, 0, 1.19, -0.25);
  const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10).rotateZ(Math.PI / 2);
  for (const [x, z] of [[0.82, 1.38], [-0.82, 1.38], [0.82, -1.38], [-0.82, -1.38]]) add(wheel, 0x151515, x, 0.33, z);
  for (const x of [-0.6, 0.6]) {
    add(new THREE.BoxGeometry(0.4, 0.14, 0.05), 0xfff7d6, x, 0.72, 2.26);
    add(new THREE.BoxGeometry(0.42, 0.14, 0.05), 0xb01010, x, 0.74, -2.26);
  }
  return mergeGeometries(parts);
}

function bezier(p0, c1, c2, p1, n) {
  const out = [];
  for (let i = 1; i < n; i++) {
    const t = i / n, u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
      z: u * u * u * p0.z + 3 * u * u * t * c1.z + 3 * u * t * t * c2.z + t * t * t * p1.z,
    });
  }
  return out;
}

export class Traffic {
  constructor(scene, net) {
    this.net = net;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 });
    this.cars = [];
    for (let i = 0; i < COUNT; i++) {
      const mesh = new THREE.Mesh(carGeometry(COLORS[i % COLORS.length]), mat);
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      this.cars.push({ mesh, alive: false, x: 0, z: 0, y: 0, yaw: 0, v: 0 });
    }
    // 출현 구간 (길이 가중치)
    this.spawnEdges = net.edges.filter((e) => e.L - e.ta - e.tb > 70);
    this.totalL = this.spawnEdges.reduce((s, e) => s + e.L, 0);
  }

  reset(player) {
    for (const c of this.cars) { c.alive = false; c.mesh.visible = false; }
    for (const c of this.cars) this.spawn(c, player, 60, ACTIVE_R);
  }

  // 플레이어 충돌 판정용 OBB 목록
  obbs() {
    return this.cars.filter((c) => c.alive).map((c) => ({
      x: c.x, z: c.z, y: c.y, ux: Math.sin(c.yaw), uz: Math.cos(c.yaw), hu: 2.25, hr: 0.9,
    }));
  }

  spawn(c, player, minR, maxR) {
    for (let tries = 0; tries < 25; tries++) {
      let r = Math.random() * this.totalL, e = this.spawnEdges[0];
      for (const x of this.spawnEdges) { if ((r -= x.L) <= 0) { e = x; break; } }
      const dir = e.oneway ? 1 : Math.random() < 0.5 ? 1 : -1;
      const lane = 1 + Math.floor(Math.random() * (e.bus || e.merge ? e.nl(dir) - 1 : e.nl(dir)));
      const s = e.ta + 15 + Math.random() * (e.L - e.ta - e.tb - 55);
      const p = e.pt(s, e.laneO(dir, lane));
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < minR || d > maxR) continue;
      if (this.cars.some((o) => o.alive && Math.hypot(o.x - p.x, o.z - p.z) < 18)) continue;
      Object.assign(c, { alive: true, v: 7 + Math.random() * 4, v0: 11 + Math.random() * 3, y: e.h(s), x: p.x, z: p.z });
      this.planLeg(c, e, dir, lane, s);
      c.mesh.visible = true;
      return true;
    }
    return false;
  }

  // 현재 구간을 따라 교차로까지 + 교차로 통과 곡선
  planLeg(c, e, dir, lane, sStart) {
    const net = this.net, node = dir > 0 ? e.b : e.a;
    const h1 = { x: e.u.x * dir, z: e.u.z * dir };
    const opts = [];
    for (const o of node.edges) {
      if (o === e || (o.oneway && o.a !== node)) continue;
      const far = o.a === node ? o.b : o.a;
      if (far.edges.length === 1 && o.L < 400) continue; // 짧은 막다른 길은 들어가지 않음
      const mv = classifyTurn(h1, net.away(o, node), node);
      if (mv === 'U') continue;
      opts.push({ o, mv, w: mv === 'straight' ? 5 : mv === 'right' ? 1.5 : 1 });
    }
    let next = null;
    if (opts.length) {
      let r = Math.random() * opts.reduce((s, x) => s + x.w, 0);
      next = opts.find((x) => (r -= x.w) <= 0) || opts[0];
    }
    const mv = next ? next.mv : 'straight';
    const nl = e.nl(dir);
    lane = Math.min(lane, nl);
    let use = mv === 'right' ? nl : mv === 'left' ? 1 : lane;
    if ((e.bus || e.merge) && use === nl && mv !== 'right' && !(e.merge && lane === nl)) use = nl - 1;
    // 노면 화살표로 진행방향이 지정된 차로는 따른다
    if (next && net.laneUse(e, node) && !net.laneAllows(e, node, use, mv)) {
      for (let l = 1; l <= nl; l++) if (net.laneAllows(e, node, l, mv)) { use = l; if (mv !== 'right') break; }
    }
    const end = e.endFor(dir);
    const sEnd = e.sFromEnd(dir, end.mark);
    const pk = mv === 'left' ? e.pocket(dir) : null;
    const len = Math.abs(sEnd - sStart);
    const oAt = (s) => {
      const k = Math.min(1, Math.abs(s - sStart) / 50);
      let o = e.laneO(dir, lane) * (1 - k) + e.laneO(dir, use) * k;
      if (pk) { const into = dir > 0 ? s - pk[0] : pk[1] - s; if (into > 0) o = o * Math.max(0, 1 - into / 20); }
      return o;
    };
    const pts = [];
    const n = Math.max(1, Math.ceil(len / 6));
    for (let k = 0; k <= n; k++) { const s = sStart + ((sEnd - sStart) * k) / n; pts.push({ ...e.pt(s, oAt(s)), s }); }
    let nx = null;
    if (next) {
      const e2 = next.o, dir2 = e2.a === node ? 1 : -1;
      let lane2 = mv === 'right' ? e2.nl(dir2) : mv === 'left' ? 1 : Math.min(use, e2.nl(dir2));
      const s2 = e2.sFromEnd(-dir2, e2.endFor(-dir2).mark);
      if (mv === 'straight' && !net.hasGuide(node, e, e2)) {
        // 직진은 실제 위치가 가장 가까운 차로로 (노면 유도선이 있는 교차로는 유도선대로 같은 번호 차로) (왼쪽에 차로가 생기는 곳에서 번호가 밀린다)
        const a = pts.at(-1);
        let bd = Infinity;
        for (let l = 1; l <= e2.nl(dir2); l++) { const q = e2.pt(s2, e2.laneO(dir2, l)), dd = Math.hypot(q.x - a.x, q.z - a.z); if (dd < bd) { bd = dd; lane2 = l; } }
      }
      if ((e2.bus || (e2.merge && mv === 'straight')) && lane2 === e2.nl(dir2)) lane2 = e2.nl(dir2) - 1;
      const P2 = e2.pt(s2, e2.laneO(dir2, lane2)), d2 = { x: e2.u.x * dir2, z: e2.u.z * dir2 };
      const a = pts.at(-1), dist = Math.hypot(P2.x - a.x, P2.z - a.z);
      const turn = Math.acos(Math.max(-1, Math.min(1, h1.x * d2.x + h1.z * d2.z)));
      const kk = Math.max(Math.min(3, dist), dist * (turn > 1.9 ? 0.8 : 0.5));
      for (const p of bezier(a, { x: a.x + h1.x * kk, z: a.z + h1.z * kk }, { x: P2.x - d2.x * kk, z: P2.z - d2.z * kk }, P2, 10)) pts.push(p);
      nx = { e: e2, dir: dir2, lane: lane2, s: s2, d: d2, exit: e2.pt(s2 + dir2 * 7, e2.laneO(dir2, lane2)) };
    }
    let d = 0;
    pts.forEach((p, i) => { if (i) d += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); p.d = d; });
    const zones = net.zones.filter((z) => z.edge === e);
    c.plan = {
      e, dir, node, mv, next: nx, pts, total: d, legLen: len, sStart, zones,
      stopD: end.stop && node.sig ? Math.abs(e.sFromEnd(dir, end.stop) - sStart) : null,
      group: signalGroup(e, node),
    };
    c.pd = 0; c.committed = false; c.seg = 1;
  }

  update(dt, t, player, peds) {
    const net = this.net;
    for (const c of this.cars) {
      if (!c.alive) continue;
      if (Math.hypot(c.x - player.x, c.z - player.z) > DESPAWN_R) { c.alive = false; c.mesh.visible = false; }
    }
    for (const c of this.cars) if (!c.alive && Math.random() < 0.05) this.spawn(c, player, SPAWN_MIN, ACTIVE_R);

    const others = this.cars.filter((c) => c.alive);
    const player3 = { x: player.x, z: player.z, y: player.ground || 0 };
    for (const c of others) {
      const P = c.plan, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      // 목표 속도
      let v0 = c.v0;
      if (P.e.type === 'local' || P.e.oneway) v0 = Math.min(v0, 9);
      if (P.mv !== 'straight' && c.pd > P.legLen - 25) v0 = Math.min(v0, 5.5);
      const sNow = P.sStart + P.dir * Math.min(c.pd, P.legLen);
      for (const z of P.zones) if (sNow > z.s0 - 20 && sNow < z.s1) v0 = Math.min(v0, (z.limit / 3.6) * 0.95);
      // 앞 장애물까지 간격
      let gap = Infinity;
      const look = (o, range, lat, back) => {
        const dx = o.x - c.x, dz = o.z - c.z;
        const a = dx * fx + dz * fz;
        // 나란히 겹친 차량은 앞차로 보지 않는다 (서로 기다리는 교착 방지)
        if (a <= 1.5 || a > range || Math.abs(dx * fz - dz * fx) > lat || Math.abs((o.y || 0) - c.y) > 2) return;
        gap = Math.min(gap, a - back);
      };
      // 교차로 안(정지선 통과 후)에서는 같은 방향으로 가는 차만 앞차로 본다 — 서로 길을 막는 교착 방지
      const inBox = c.committed || c.pd > P.legLen - 2;
      c.stuck = c.v < 0.1 ? (c.stuck || 0) + dt : 0;
      if (c.stuck > 15) { c.ghost = 4; c.stuck = 0; } // 오래 막히면 잠시 무시하고 빠져나감
      c.ghost = Math.max(0, (c.ghost || 0) - dt);
      if (!c.ghost) {
        for (const o of others) {
          if (o === c || (inBox && Math.cos(o.yaw - c.yaw) < 0.7)) continue;
          look(o, 45, 1.9, 4.8);
        }
      }
      // 끼어드는 플레이어 차량은 조금 더 넓게 본다 (교차로 안에서 방향이 다르면 제외 — 교착 방지)
      if (!(inBox && Math.cos(player.yaw - c.yaw) < 0.7)) look(player3, 45, 2.6, 4.8);
      for (const p of peds) look(p, 26, 2.6, 3);
      // 신호
      if (P.stopD !== null && !c.committed) {
        if (c.pd > P.stopD) c.committed = true;
        else {
          // 우회전 전용 신호등이 있으면 녹색 화살표에만 우회전
          const rs = P.mv === 'right' && net.hasRightSignal(P.e, P.node) ? rightArrowState(P.node, P.group, t) : null;
          const st = rs || signalState(P.node, P.group, t);
          const toStop = P.stopD - c.pd;
          let go = rs ? rs === 'G' : movementAllowed(st, P.mv);
          if (st === 'Y') go = toStop < (c.v * c.v) / (2 * 3.5); // 멈출 수 없으면 통과
          // 꼬리물기 금지: 교차로 건너편 출구가 막혀 있으면 진입하지 않는다
          // (진출로 쪽으로 가는 차만 본다 — 바로 옆 반대 차로에서 신호 대기 중인 차 때문에 교착되지 않게)
          if (go && P.next && toStop < 25 && others.some((o) => o !== c && o.v < 2 && Math.hypot(o.x - P.next.exit.x, o.z - P.next.exit.z) < 6
            && Math.sin(o.yaw) * P.next.d.x + Math.cos(o.yaw) * P.next.d.z > 0.5)) go = false;
          if (!go) gap = Math.min(gap, toStop - 0.8);
          else if (st === 'Y' || toStop < 3) c.committed = true;
        }
      }
      // IDM
      const sStar = 2.5 + c.v * 1.4;
      let acc = 1.8 * (1 - Math.pow(c.v / v0, 4));
      if (gap < Infinity) acc -= 1.8 * Math.pow(sStar / Math.max(gap, 0.3), 2);
      acc = Math.max(-9, Math.min(1.8, acc));
      c.v = Math.max(0, c.v + acc * dt);
      c.pd += c.v * dt;
      while (c.pd >= P.total) {
        if (!P.next) { c.alive = false; c.mesh.visible = false; break; }
        const extra = c.pd - P.total, n = P.next;
        this.planLeg(c, n.e, n.dir, n.lane, n.s);
        c.pd = extra;
      }
      if (!c.alive) continue;
      // 경로 위 위치/방향
      const pts = c.plan.pts;
      while (c.seg < pts.length - 1 && pts[c.seg].d < c.pd) c.seg++;
      const a = pts[c.seg - 1], b = pts[c.seg], k = (c.pd - a.d) / (b.d - a.d || 1);
      c.x = a.x + (b.x - a.x) * k; c.z = a.z + (b.z - a.z) * k;
      c.yaw = Math.atan2(b.x - a.x, b.z - a.z);
      c.y = net.height(c.x, c.z, c.y);
      const fx2 = Math.sin(c.yaw) * 2.2, fz2 = Math.cos(c.yaw) * 2.2;
      const hf = net.height(c.x + fx2, c.z + fz2, c.y) + roadT(c.x + fx2, c.z + fz2), hb = net.height(c.x - fx2, c.z - fz2, c.y) + roadT(c.x - fx2, c.z - fz2);
      c.mesh.position.set(c.x, c.y + roadT(c.x, c.z), c.z);
      c.mesh.rotation.set((hb - hf) / 4.4, c.yaw, 0, 'YXZ');
    }
  }
}
