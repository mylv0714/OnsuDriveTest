// 횡단보도 보행자: 보행 신호가 켜지면 건너기 시작해 끝까지 건넌다
import * as THREE from 'three';
import { signalGroup } from './net.js';
import { signalTiming } from './signals.js';
import { roadT } from './terrain.js';

const POOL = 60;
const SHIRTS = [0xd94f4f, 0x3f6fd1, 0xf2c14e, 0x3b3b3b, 0xffffff, 0x5aa469, 0x9b59b6, 0xe67e22, 0x2c3e50];

function pedMesh(shirt) {
  const g = new THREE.Group();
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const legMat = m(Math.random() < 0.5 ? 0x2b3a55 : 0x333333);
  const legs = [];
  for (const x of [-0.1, 0.1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.8, 0.14).translate(0, -0.4, 0), legMat);
    leg.position.set(x, 0.85, 0);
    g.add(leg); legs.push(leg);
  }
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.24), m(shirt));
  body.position.y = 1.18;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), m(0xe0b48f));
  head.position.y = 1.62;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m(0x1a1410));
  hair.position.y = 1.64;
  g.add(body, head, hair);
  g.traverse((o) => { o.castShadow = true; });
  g.visible = false;
  return { g, legs };
}

export class Peds {
  constructor(scene, net) {
    this.net = net;
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const p = pedMesh(SHIRTS[i % SHIRTS.length]);
      scene.add(p.g);
      this.pool.push({ ...p, active: false });
    }
    // 신호 횡단보도 목록
    this.crosswalks = [];
    for (const n of Object.values(net.nodes)) {
      if (n.kind === 'plain') continue;
      for (const e of n.edges) {
        const dirIn = n === e.b ? 1 : -1;
        if (n.kind === 'crosswalk' && dirIn < 0) continue; // 단일로 횡단보도는 하나만
        const end = e.endFor(dirIn);
        if (!end.cw) continue;
        const s = n.kind === 'crosswalk' ? e.sFromEnd(dirIn, 0) : e.sFromEnd(dirIn, (end.cw[0] + end.cw[1]) / 2);
        const c = e.pt(s, 0);
        this.crosswalks.push({ node: n, edge: e, group: signalGroup(e, n), x: c.x, z: c.z, y: n.h, u: e.u, r: e.r, hw: e.hw, cycle: -1 });
      }
    }
  }

  reset() {
    for (const p of this.pool) { p.active = false; p.g.visible = false; }
    for (const cw of this.crosswalks) cw.cycle = -1;
  }

  get active() { return this.pool.filter((p) => p.active); }

  update(dt, t, player) {
    for (const cw of this.crosswalks) {
      if (Math.hypot(cw.x - player.x, cw.z - player.z) > 420) continue;
      const tm = signalTiming(cw.node, cw.group, t);
      // 차량 적색 = 보행 녹색. 한 번의 녹색마다 한 번만 건너기 시작
      if (tm.state !== 'R' || tm.cycle === cw.cycle) continue;
      cw.cycle = tm.cycle;
      const need = (2 * (cw.hw + 2.5)) / 1.35 + 2.5;
      if (tm.remaining < need) continue;
      const n = Math.random() < 0.3 ? 0 : 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const p = this.pool.find((q) => !q.active);
        if (!p) break;
        const side = Math.random() < 0.5 ? 1 : -1;
        Object.assign(p, {
          active: true, cw, side, o: side * (cw.hw + 2.5), a: (Math.random() - 0.5) * 3.6,
          speed: 1.3 + Math.random() * 0.35, delay: Math.random() * Math.min(2.5, tm.remaining - need), phase: Math.random() * 6,
        });
        p.g.visible = true;
      }
    }
    for (const p of this.pool) {
      if (!p.active) continue;
      const cw = p.cw;
      if (p.delay > 0) p.delay -= dt;
      else {
        p.o -= p.side * p.speed * dt;
        p.phase += dt * p.speed * 4.5;
      }
      if (-p.side * p.o > cw.hw + 2.5) { p.active = false; p.g.visible = false; continue; }
      p.x = cw.x + cw.u.x * p.a + cw.r.x * p.o;
      p.z = cw.z + cw.u.z * p.a + cw.r.z * p.o;
      p.y = cw.y;
      p.onRoad = Math.abs(p.o) < cw.hw + 0.3;
      p.g.position.set(p.x, p.y + roadT(p.x, p.z), p.z);
      p.g.rotation.y = Math.atan2(-p.side * cw.r.x, -p.side * cw.r.z);
      const sw = p.delay > 0 ? 0 : Math.sin(p.phase) * 0.45;
      p.legs[0].rotation.x = sw; p.legs[1].rotation.x = -sw;
    }
  }
}
