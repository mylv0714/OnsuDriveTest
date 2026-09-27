// 코스 진행, 신호 표시, 간이 채점
import { signalGroup, classifyTurn, hasLeftTurn } from './net.js';
import { signalState, movementAllowed, rightArrowState } from './signals.js';
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
    this.car.place(start.x, start.z, start.yaw, start.y || 0); // 출발 지점 노면 높이
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
    this.zebraStop = null; this.guideCheck = null; this.safetyIn = null;
    this.limit = 50;
    this.checkpoint = { ...start, d: 0 };
    this.instrIdx = -1;
    this.navIdx = 0; this.navStage = 0; this.navDone = false; this.navLimit = null;
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
        // 우회전 전용 신호가 녹색·황색이면 우회전 차량이 건너가는 횡단보도는 보행 적색
        const walk = st === 'R' && !(n.sig.right && n.sig.right.group !== g && rightArrowState(n, n.sig.right.group, this.t) !== 'R');
        setLamp(p.G, walk);
        setLamp(p.R, !walk);
      }
      if (n.sig.right) {
        const r = n.sig.sets.right, rs = rightArrowState(n, n.sig.right.group, this.t);
        setLamp(r.R, rs === 'R'); setLamp(r.Y, rs === 'Y'); setLamp(r.G, rs === 'G');
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
    // 어린이보호구역: 제한속도를 넘으면 바로 실격 (영상 B·D코스 안내)
    const zone = loc && loc.edge && this.net.zones.find((z) => z.edge === loc.edge && loc.s >= z.s0 && loc.s <= z.s1);
    if (zone && car.kmh >= zone.limit + 1) this.disqualify(`어린이보호구역 제한속도 초과 (${zone.limit}km/h 구간 ${Math.round(car.kmh)}km/h)`);
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
    this.updateNav(loc);
  }

  // 보행자: 부딪히거나, 보행자가 건너는 횡단보도에 진입하면 실격
  checkPedestrians(moving) {
    const car = this.car, f = car.fwd;
    for (const p of this.peds.active) {
      if (Math.abs(p.y - car.ground) > 2) continue;
      for (const k of moving ? [-1.35, 0, 1.35] : []) {
        if (Math.hypot(car.x + f.x * k - p.x, car.z + f.z * k - p.z) < 1.3) { this.disqualify('교통사고 (보행자 충돌)'); return; }
      }
      const waiting = p.cw.zebra && p.waiting; // 신호등 없는 횡단보도: 건너려는 보행자도 보호 대상
      if (!moving || (!waiting && (!p.onRoad || p.delay > 0))) continue;
      const cw = p.cw, dx = car.x - cw.x, dz = car.z - cw.z;
      if (Math.abs(dx * cw.u.x + dz * cw.u.z) < 2.5 + 2.2 && Math.abs(dx * cw.r.x + dz * cw.r.z) < cw.hw + 0.5) {
        this.disqualify(waiting ? '보행자 보호의무 위반 (건너려는 보행자 앞 통과)' : '보행자 보호의무 위반 (횡단 중인 보행자)');
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
        const tv = { x: e.u.x * le.dir, z: e.u.z * le.dir };
        const straight = node.edges.some((o) => o !== e && dot(this.net.away(o, node), tv) > 0.9);
        const rs = this.net.hasRightSignal(e, node) ? rightArrowState(node, signalGroup(e, node), this.t) : null;
        return this.hud.setSignal(signalState(node, signalGroup(e, node), this.t), four, four && !straight, rs);
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
        // 일방통행 연결로(무신호 횡단보도 앞)는 차로가 하나뿐 — 좌회전 전용차로(0)로 잘못 보지 않는다
        node, edge: e, dir: cdir, time: t, lane: e.oneway ? 1 : ql < 0 ? 0 : Math.min(e.nl(cdir), Math.floor(ql) + 1),
        state: node.sig ? signalState(node, signalGroup(e, node), t) : null,
        rstate: node.sig && this.net.hasRightSignal(e, node) ? rightArrowState(node, signalGroup(e, node), t) : null,
      };
    }
    this.prevDEnd = dEnd;

    // 신호등 없는 횡단보도: 보행자도 앞차도 없는데 3초 넘게 서 있으면 실격 (영상: 후방 추돌 위험)
    const ahead = cdir > 0 ? e.b : e.a;
    if (ahead.kind === 'zebra' && dEnd > end.stop - 1 && dEnd < end.stop + 15 && Math.abs(this.car.v) < 0.05) {
      if (!this.zebraStop || this.zebraStop.node !== ahead) this.zebraStop = { node: ahead, t0: t };
      const f = this.car.fwd;
      const busy = this.peds.active.some((p) => p.cw.node === ahead) || this.traffic.obbs().some((c) => {
        const dx = c.x - this.car.x, dz = c.z - this.car.z, a = dx * f.x + dz * f.z;
        return a > 0 && a < 15 && Math.abs(dx * f.z - dz * f.x) < 2.5;
      });
      if (busy) this.zebraStop.t0 = t;
      else if (t - this.zebraStop.t0 > 3) { this.zebraStop = null; this.disqualify('신호등 없는 횡단보도 불필요한 정지 (보행자 없음 — 후방 추돌 위험)'); }
    } else if (this.zebraStop && Math.abs(this.car.v) > 0.5) this.zebraStop = null;

    if (!moving || e.oneway) return;
    const inEnds = s < e.ends.a.mark || s > e.L - e.ends.b.mark;
    const q = o * cdir;

    // 중앙선 침범
    if (Math.abs(d) > 0.7 && !inEnds && !e.inUturnZone(s) && q < -e.median / 2 - 0.1) this.disqualify('중앙선 침범');

    // 노면 유도선: 교차로를 지난 직후 차로가 들어간 차로와 다르면 교차로 안에서 진로를 바꾼 것
    const gc = this.guideCheck;
    if (gc && gc.edge === e && gc.dir === cdir) {
      const from = cdir > 0 ? s : e.L - s;
      if (from > 35) this.guideCheck = null;
      else if (from > 12 && Math.abs(d) > 0.85) {
        const fl = (q - e.median / 2) / e.laneW, lane = fl < 0 ? 0 : Math.floor(fl) + 1;
        if (lane >= 1 && lane !== gc.lane) this.penalize(`노면 유도선 미준수 (교차로 안 진로변경 ${gc.lane}차로→${lane}차로)`, 10);
        this.guideCheck = null;
      }
    } else if (gc && gc.edge !== e) this.guideCheck = null;

    // 백색 안전지대 (빗금) 진입
    const sz = this.net.safety.find((z) => z.edge === e && z.dir === cdir && s > z.s0 && s < z.s1);
    if (sz && q > e.median / 2 + (sz.lane - 1) * e.laneW + 0.4) {
      if (this.safetyIn !== sz) { this.safetyIn = sz; this.penalize('안전지대 진입 (빗금 표시 구역)', 7); }
    } else if (!sz) this.safetyIn = null;

    // 차로 변경
    if (Math.abs(d) > 0.85 && s > e.ends.a.mark + 3 && s < e.L - e.ends.b.mark - 3) {
      const fl = (q - e.median / 2) / e.laneW;
      const lane = fl < 0 ? 0 : Math.floor(fl) + 1;
      const frac = fl - Math.floor(fl);
      const pk = e.pocket(cdir);
      const valid = lane > 0 || (pk && s >= pk[0] && s <= pk[1]);
      if (valid && frac > 0.2 && frac < 0.8 && lane <= e.nl(cdir)) {
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
    // 노면 유도선이 있는 교차로 직진: 진출 구간에서 차로를 확인한다
    if (entry && mv === 'straight' && this.net.guides.some((g) => g.node === n && g.eIn === from.edge && g.eOut === to.edge)) {
      this.guideCheck = { edge: to.edge, dir: to.dir, lane: entry.lane };
    }
    if (entry) {
      // 지정차로: 좌회전은 좌회전 전용차로(없으면 1차로), 우회전은 끝 차로, 좌회전 전용차로에서는 직진 금지
      const e = from.edge;
      const ok = this.net.laneAllows(e, n, entry.lane, mv); // 노면 화살표로 차로별 진행방향이 지정된 곳
      const name = { left: '좌회전', right: '우회전', straight: '직진' }[mv];
      if (ok === false) this.penalize(`지정차로 위반 (${entry.lane}차로에서 ${name} — 노면 화살표 확인)`, 10);
      else if (ok === null) {
        if (mv === 'left' && entry.lane !== (e.pocket(from.dir) ? 0 : 1)) this.penalize(e.pocket(from.dir) ? '좌회전 지정차로 위반 (좌회전 전용차로 아님)' : '좌회전 지정차로 위반 (1차로 아님)', 10);
        if (mv === 'right' && entry.lane < e.nl(from.dir)) this.penalize('우회전 지정차로 위반 (끝 차로 아님)', 10);
        if (mv === 'straight' && entry.lane === 0) this.penalize(e.uturnAt(from.dir > 0 ? 'b' : 'a') ? '유턴 전용차로에서 직진 (직진 금지)' : '좌회전 전용차로에서 직진', 10);
      }
      // 우회전 일시정지: 우회전 신호 24시간 적색 진입로는 실격, 그 외 적색 신호 우회전은 감점
      if (mv === 'right' && entry.rstate) {
        // 우회전 전용 신호등: 녹색 화살표에만 우회전 (적색에 일시정지 후 진입해도 실격, 황색·적색에 정지선 침범은 신호위반)
        if (entry.rstate !== 'G') this.disqualify(`신호위반 (우회전 전용신호 ${entry.rstate === 'Y' ? '황색' : '적색'})`);
      } else if (mv === 'right') {
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

  // 내비게이션 음성 (영상의 길안내 멘트): "약 300m 앞 좌회전입니다" → "약 150m 앞 …" → "좌회전입니다", 회전 뒤 "다음 안내시까지 직진입니다"
  updateNav(loc) {
    const man = this.route.maneuvers || [], pr = this.progress, say = (t) => this.hud.say(t, true);
    while (this.navIdx < man.length && man[this.navIdx].d < pr - 3) { this.navIdx++; this.navStage = 0; this.navDone = true; }
    const m = man[this.navIdx];
    if (m) {
      const dist = m.d - pr, name = { left: '좌회전', right: '우회전', U: '유턴' }[m.type];
      if (this.navStage < 1 && dist <= 320 && dist > 220) { this.navStage = 1; say(`약 300m 앞 ${name}입니다.`); }
      else if (this.navStage < 2 && dist <= 165 && dist > 70) { this.navStage = 2; say(`약 150m 앞 ${name}입니다.`); }
      else if (this.navStage < 3 && dist <= 25) { this.navStage = 3; say(`${name}입니다.`); }
    }
    const prev = man[this.navIdx - 1];
    if (this.navDone && prev && pr - prev.d > 30) { this.navDone = false; if (!m || m.d - pr > 450) say('다음 안내시까지 직진입니다.'); }
    // 제한속도·어린이보호구역 안내
    if (loc && loc.edge && this.odo > 5) {
      const zone = this.net.zones.find((z) => z.edge === loc.edge && loc.s >= z.s0 && loc.s <= z.s1);
      const key = zone ? `z${zone.limit}` : `${this.limit}`;
      // 구간이 3초 넘게 이어질 때만 안내 (교차로 경계에서 번갈아 말하지 않게)
      if (key !== this.navCand) { this.navCand = key; this.navCandT = this.t; }
      if (this.t - this.navCandT > 3 && key !== this.navLimit) {
        if (this.navLimit !== null) say(zone ? `어린이보호구역입니다. 제한속도 ${zone.limit}km 구간입니다.` : `제한속도 ${this.limit}km 구간입니다.`);
        this.navLimit = key;
      }
    }
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
