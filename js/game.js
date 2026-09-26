// 코스 진행, 신호 표시, 간이 채점
import { signalGroup, classifyTurn, hasLeftTurn } from './net.js';
import { signalState, movementAllowed } from './signals.js';
import { project } from './course.js';

function setLamp(mat, on) {
  const c = on ? mat.userData.on : mat.userData.off;
  if (mat.color.getHex() !== c) mat.color.setHex(c);
}

const dot = (a, b) => a.x * b.x + a.z * b.z;
const SPEED_MARGIN = 20;

export class Game {
  constructor({ net, route, car, signals, hud, traffic, peds }) {
    Object.assign(this, { net, route, car, signals, hud, traffic, peds });
    this.reset();
  }

  setRoute(route) {
    this.route = route;
    this.reset();
  }

  reset() {
    const { start } = this.route;
    this.car.place(start.x, start.z, start.yaw);
    this.t = 0;
    this.score = 100;
    this.log = [];
    this.dq = null;
    this.finished = false;
    this.progress = 0;
    this.odo = 0;
    this.startChecked = false;
    this.lastBlink = { L: -1e9, R: -1e9 };
    this.lastEdge = null;
    this.entry = null;
    this.laneTrack = null;
    this.prevDEnd = null;
    this.speeding = false;
    this.offroadT = 0; this.offroadFlag = false; this.onroadT = 0;
    this.hitCool = 0;
    this.wrongT = 0;
    this.stopT = 0; this.stopPenalized = false; this.stopAt = null;
    this.limit = 50;
    this.checkpoint = { ...start, d: 0 };
    this.instrIdx = -1;
    this.hud.reset();
    this.peds.reset();
    this.traffic.reset(this.car);
  }

  penalize(reason, pts) {
    if (this.finished) return;
    this.score -= pts;
    this.log.unshift({ reason, pts, t: this.t });
    this.hud.flash(`${reason} −${pts}`);
  }

  disqualify(reason) {
    if (this.finished || this.dq) return;
    this.dq = reason;
    this.log.unshift({ reason: `실격: ${reason}`, pts: 0, t: this.t });
    this.hud.showDQ(reason);
  }

  updateSignals() {
    for (const n of this.signals) {
      for (const g of ['main', 'cross']) {
        const st = signalState(n, g, this.t);
        const s = n.sig.sets[g];
        setLamp(s.R, st === 'R' || st === 'L');
        setLamp(s.Y, st === 'Y');
        setLamp(s.G, st === 'G' || st === 'GL');
        if (s.A) setLamp(s.A, st === 'L' || st === 'GL');
        const p = n.sig.sets['p' + g];
        setLamp(p.G, st === 'R');
        setLamp(p.R, st !== 'R');
      }
    }
  }

  update(dt) {
    this.t += dt;
    this.updateSignals();
    const car = this.car;
    this.peds.update(dt, this.t, car);
    this.traffic.update(dt, this.t, car, this.peds.active);
    if (car.blinker === -1) this.lastBlink.L = this.t;
    if (car.blinker === 1) this.lastBlink.R = this.t;
    this.odo += Math.abs(car.v) * dt;
    if (this.finished) return;

    const f = car.fwd;
    const moving = Math.abs(car.v) > 0.5;
    const loc = this.net.locate(car.x, car.z, car.ground);

    // 출발 시 좌측 방향지시등
    if (!this.startChecked && this.odo > 4) {
      this.startChecked = true;
      if (this.lastBlink.L < 0) this.penalize('출발 시 방향지시등 미작동', 5);
    }

    // 정지 5초 이상 D 기어 유지 → 중립(N) 미전환
    if (car.gear === 'D' && Math.abs(car.v) < 0.05 && this.odo > 1) {
      this.stopT += dt;
      if (this.stopT > 5 && !this.stopPenalized) { this.stopPenalized = true; this.penalize('정지 시 기어 중립(N) 미전환', 5); }
    } else {
      this.stopT = 0;
      if (moving) this.stopPenalized = false;
    }

    // 제한속도: 표지는 그대로(50/30), 감점은 제한속도 +20km/h 이상일 때 (50 구간 → 70km/h)
    if (loc && loc.edge) this.limit = this.net.speedLimit(loc);
    const over = this.limit + SPEED_MARGIN;
    if (car.kmh >= over) {
      if (!this.speeding) { this.speeding = true; this.penalize(`속도위반 (${this.limit}km/h 구간 ${over}km/h 이상)`, 10); }
    } else if (car.kmh < over - 3) this.speeding = false;

    // 충돌
    if (car.hitCar) this.disqualify('교통사고 (차량 충돌)');
    this.hitCool -= dt;
    if (car.hit && !car.hitCar && this.hitCool <= 0) { this.hitCool = 3; this.penalize('충돌', 10); }
    this.checkPedestrians(moving);

    // 도로 이탈
    if (!loc && moving) {
      this.offroadT += dt; this.onroadT = 0;
      if (this.offroadT > 0.4 && !this.offroadFlag) { this.offroadFlag = true; this.penalize('도로 이탈(연석·보도 침범)', 10); }
    } else if (loc) {
      this.offroadT = 0; this.onroadT += dt;
      if (this.onroadT > 2) this.offroadFlag = false;
    }

    if (loc && loc.edge) this.checkEdge(loc, f, moving);
    this.updateSignalHud(loc);

    // 코스 진행 / 이탈
    const pr = project(this.route, car.x, car.z, this.progress);
    if (pr.dist < 30) this.progress = pr.d;
    else if (moving) this.disqualify('코스 이탈');
    if (pr.dir && car.gear === 'D' && car.v > 2 && dot(f, pr.dir) < -0.3) {
      this.wrongT += dt;
      if (this.wrongT > 3) this.disqualify('코스 이탈(진행 방향 반대)');
    } else this.wrongT = 0;
    const nd = this.route.nodeDist;
    for (let i = nd.length - 1; i >= 0; i--) {
      if (this.progress > nd[i] + 30) {
        if (this.checkpoint.d < nd[i] + 30) this.checkpoint = { ...this.pointAt(nd[i] + 30), d: nd[i] + 30, y: car.ground };
        break;
      }
    }

    this.checkFinish(loc);
    this.updateInstruction();
  }

  // 보행자: 부딪히거나, 보행자가 건너는 횡단보도에 진입하면 실격
  checkPedestrians(moving) {
    const car = this.car, f = car.fwd;
    for (const p of this.peds.active) {
      if (Math.abs(p.y - car.ground) > 2) continue;
      for (const k of [-1.35, 0, 1.35]) {
        if (Math.hypot(car.x + f.x * k - p.x, car.z + f.z * k - p.z) < 1.3) { this.disqualify('교통사고 (보행자 충돌)'); return; }
      }
      if (!moving || !p.onRoad || p.delay > 0) continue;
      const cw = p.cw, dx = car.x - cw.x, dz = car.z - cw.z;
      if (Math.abs(dx * cw.u.x + dz * cw.u.z) < 2.5 + 2.2 && Math.abs(dx * cw.r.x + dz * cw.r.z) < cw.hw + 0.5) {
        this.disqualify('보행자 보호의무 위반 (횡단 중인 보행자)');
        return;
      }
    }
  }

  // 전방 신호등 (계기판 표시)
  updateSignalHud(loc) {
    const le = this.lastEdge;
    if (loc && loc.edge && le && le.edge === loc.edge) {
      const e = le.edge, node = le.dir > 0 ? e.b : e.a, end = e.endFor(le.dir);
      const dEnd = le.dir > 0 ? e.L - loc.s : loc.s;
      if (node.sig && dEnd < 160 && dEnd > end.stop - 2) {
        const four = node.kind === 'signal' && hasLeftTurn(this.net, e, node);
        return this.hud.setSignal(signalState(node, signalGroup(e, node), this.t), four);
      }
    }
    this.hud.setSignal(null);
  }

  checkEdge(loc, f, moving) {
    const { edge: e, s, o } = loc;
    const d = dot(f, e.u);
    const dir = e.oneway ? (d > 0 ? 1 : 0) : d > 0.3 ? 1 : d < -0.3 ? -1 : 0;
    const t = this.t;

    // 교차로 통과 판정 (진입 구간 → 진출 구간)
    if (dir) {
      const le = this.lastEdge;
      if (le && le.edge !== e) {
        const n = [e.a, e.b].find((x) => x === le.edge.a || x === le.edge.b);
        if (n) this.onNodePassed(n, le, { edge: e, dir });
        this.lastEdge = { edge: e, dir };
        this.prevDEnd = null;
      } else if (!le) this.lastEdge = { edge: e, dir };
      else if (dir !== le.dir && Math.abs(d) > 0.7) {
        this.onUturn(e, s, le.dir);
        this.lastEdge = { edge: e, dir };
        this.prevDEnd = null;
      }
    }

    const cur = this.lastEdge;
    if (!cur || cur.edge !== e) return;
    const cdir = cur.dir;
    const end = e.endFor(cdir);
    const dEnd = cdir > 0 ? e.L - s : s;

    // 정지선 앞 일시정지 기록 (우회전 일시정지 판정용)
    if (end.stop && dEnd > end.stop - 0.5 && dEnd < end.stop + 8 && Math.abs(this.car.v) < 0.3) this.stopAt = { edge: e, t };
    // 정지선 통과 시 신호·차로 기록
    if (end.stop && this.prevDEnd !== null && this.prevDEnd > end.stop && dEnd <= end.stop) {
      const node = cdir > 0 ? e.b : e.a;
      const ql = (o * cdir - e.median / 2) / e.laneW;
      this.entry = {
        node, edge: e, dir: cdir, time: t, lane: ql < 0 ? 0 : Math.min(e.lanes, Math.floor(ql) + 1),
        state: node.sig ? signalState(node, signalGroup(e, node), t) : null,
      };
    }
    this.prevDEnd = dEnd;

    if (!moving || e.oneway) return;
    const inEnds = s < e.ends.a.mark || s > e.L - e.ends.b.mark;
    const q = o * cdir;

    // 중앙선 침범
    if (Math.abs(d) > 0.7 && !inEnds && !e.inUturnZone(s) && q < -e.median / 2 - 0.1) this.disqualify('중앙선 침범');

    // 차로 변경
    if (Math.abs(d) > 0.85 && s > e.ends.a.mark + 3 && s < e.L - e.ends.b.mark - 3) {
      const fl = (q - e.median / 2) / e.laneW;
      const lane = fl < 0 ? 0 : Math.floor(fl) + 1;
      const frac = fl - Math.floor(fl);
      const pk = e.pocket(cdir);
      const valid = lane > 0 || (pk && s >= pk[0] && s <= pk[1]);
      if (valid && frac > 0.2 && frac < 0.8 && lane <= e.lanes) {
        const lt = this.laneTrack;
        if (lt && lt.edge === e && lt.dir === cdir && lt.lane !== lane) {
          const need = lane < lt.lane ? 'L' : 'R';
          if (this.lastBlink[need] < t - 4) this.penalize('진로변경 시 방향지시등 미작동', 5);
          if (end.stop && dEnd < end.stop + 30) this.penalize('진로변경 제한선(실선) 위반', 5);
        }
        this.laneTrack = { edge: e, dir: cdir, lane };
      }
    }
  }

  onNodePassed(n, from, to) {
    const h1 = { x: from.edge.u.x * from.dir, z: from.edge.u.z * from.dir };
    const h2 = { x: to.edge.u.x * to.dir, z: to.edge.u.z * to.dir };
    const mv = classifyTurn(h1, h2, n);
    const entry = this.entry && this.entry.node === n ? this.entry : null;
    this.entry = null;
    if (mv === 'U') { this.disqualify('유턴 금지 장소 유턴 (교차로 안 유턴)'); return; }
    if (entry && entry.state && !movementAllowed(entry.state, mv)) {
      this.disqualify(mv === 'left' ? '신호위반 (좌회전 신호 아님)' : '신호위반 (적색 신호 진행)');
    }
    if (entry) {
      // 지정차로: 좌회전은 좌회전 전용차로(없으면 1차로), 우회전은 끝 차로, 좌회전 전용차로에서는 직진 금지
      const e = from.edge;
      if (mv === 'left' && entry.lane !== (e.pocket(from.dir) ? 0 : 1)) this.penalize(e.pocket(from.dir) ? '좌회전 지정차로 위반 (좌회전 전용차로 아님)' : '좌회전 지정차로 위반 (1차로 아님)', 10);
      if (mv === 'right' && entry.lane < e.lanes) this.penalize('우회전 지정차로 위반 (끝 차로 아님)', 10);
      if (mv === 'straight' && entry.lane === 0) this.penalize('좌회전 전용차로에서 직진', 10);
      // 우회전 일시정지: 우회전 신호 24시간 적색 진입로는 실격, 그 외 적색 신호 우회전은 감점
      if (mv === 'right') {
        const stopped = this.stopAt && this.stopAt.edge === e && this.t - this.stopAt.t < 60;
        if (!stopped && this.net.rightStop.has(`${e.id}>${n.id}`)) this.disqualify('신호위반 (우회전 적색 신호 일시정지 불이행)');
        else if (!stopped && entry.state && (entry.state === 'R' || entry.state === 'L')) this.penalize('적색 신호 우회전 시 일시정지 불이행', 10);
      }
    }
    if (mv !== 'straight') {
      const need = mv === 'right' ? 'R' : 'L';
      const since = (entry ? entry.time : this.t - 6) - 3;
      if (this.lastBlink[need] < since) this.penalize(`${mv === 'right' ? '우' : '좌'}회전 시 방향지시등 미작동`, 5);
    }
  }

  // 유턴: 유턴 표지(노면 유턴구역선) 구간에서만, 보조판 조건(보행신호시)을 지켜, 유턴 전용차로에서
  onUturn(e, s, prevDir) {
    if (!e.inUturnZone(s)) { this.disqualify('유턴 금지 장소 유턴'); return; }
    const node = prevDir > 0 ? e.b : e.a;
    // 보행신호(차량 적색)일 때 유턴을 시작했어야 한다 — 돌아나오는 몇 초 사이 신호가 바뀌는 것은 허용
    const g = node.sig ? signalGroup(e, node) : null;
    if (e.uturnPlate === '보행신호시' && node.sig && signalState(node, g, this.t) !== 'R' && signalState(node, g, this.t - 4) !== 'R') {
      this.disqualify('유턴 신호위반 (보행신호시에만 유턴)');
    }
    const lt = this.laneTrack;
    if (lt && lt.edge === e && lt.lane !== 0) this.penalize('유턴 지정차로 위반 (유턴 전용차로 아님)', 10);
    if (this.lastBlink.L < this.t - 8) this.penalize('유턴 시 방향지시등 미작동', 5);
  }

  checkFinish(loc) {
    const { end, total } = this.route;
    if (this.progress < total - 90 || Math.abs(this.car.v) > 0.05 || !loc || loc.edge !== end.edge) return;
    const q = loc.o * end.dir - end.edge.median / 2;
    if (loc.s < end.s0 || loc.s > end.s1 || q < end.edge.laneW) return;
    this.finished = true;
    this.hud.showResult(this);
  }

  pointAt(d) {
    const pts = this.route.pts;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].d >= d) {
        const a = pts[i - 1], b = pts[i];
        return { x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
      }
    }
    return this.route.start;
  }

  toCheckpoint() {
    const c = this.checkpoint;
    this.car.place(c.x, c.z, c.yaw, c.y || 0);
    this.progress = c.d;
    this.lastEdge = null; this.laneTrack = null; this.entry = null; this.prevDEnd = null; this.stopAt = null;
  }

  updateInstruction() {
    const list = this.route.instr;
    let idx = -1;
    for (let i = 0; i < list.length; i++) if (list[i].d <= this.progress + 1) idx = i;
    const next = list[idx + 1];
    if (idx !== this.instrIdx) {
      this.instrIdx = idx;
      if (idx >= 0) this.hud.announce(list[idx]);
    }
    this.hud.setNext(next ? { ...next, dist: next.d - this.progress } : null, this.progress / this.route.total);
    this.hud.setLimit(this.limit);
  }
}
