// 온수역자동차전문학원 도로주행 A·B·C·D 코스: 경로(차로 중심선 폴리라인)와 구간별 안내
import { toWorld } from './map.js';
import { classifyTurn } from './net.js';

// route: 지나가는 노드와, 그 노드를 떠나 다음 노드까지 유지할 차로 (0 = 좌회전/유턴 전용차로)
// instr: [route 인덱스('start'면 출발점), 노드 기준 거리(m, 음수=노드 전), 제목, 설명]
const END_WORLDVILLA = { a: 'CW1', b: 'CW2', px: 611, dir: 1, lane: 2, zone: [598, 624], label: '월드빌라 앞' };
const END_YEOKGOK = { a: 'AC', b: 'VW', px: 684, dir: -1, lane: 2, zone: [668, 700], label: '역곡주유소 지나' };
const START_DONGJIN = { a: 'AC', b: 'VW', px: 688, dir: 1, lane: 2 };

export const COURSES = {
  A: {
    legend: [2, 1, 6, 5, 5.9],
    summary: [
      '온수역 앞 출발 → 오류고가차도 교차로 직진 → 철도고가차도 → 3거리 <b>우회전</b>',
      '경인로 직진 (육교·유한대 앞·역곡고가교 4거리) → <b>유턴</b>',
      '되돌아와 3거리 <b>좌회전</b> → 철도고가차도 → 월드빌라 앞 <b>종료</b>',
    ],
    start: { a: 'CW1', b: 'CW2', px: 575, dir: -1, lane: 2 },
    end: END_WORLDVILLA,
    route: [
      ['CW1', 2], ['V1L', 2], ['JB', 2], ['J3', 2], ['V1U', 2], ['SG', 1], ['YH', 1], ['V2U', 0],
      ['UT', 2], ['V2U', 2], ['YH', 2], ['SG', 1], ['V1U', 0], ['J3', 1], ['JB', 2], ['V1L', 2], ['CW1', 2],
    ],
    instr: [
      ['start', 0, '출발', 'D 기어 · 좌측 방향지시등을 켜고 출발 · 2차로 진행'],
      [0, -30, '횡단보도 통과', '보행자 신호가 녹색이면 정지선 앞 정지'],
      [1, -170, '오류고가차도 교차로 직진', '1차로는 좌회전 차로 — 2차로로 직진'],
      [2, -10, '철도고가차도 방면 직진', '철길 옆 오르막 — 2차로 유지'],
      [3, -230, '오류철도고가 3거리 우회전', '신호 횡단보도 지나 늘어난 3차로(우회전 차로)로 · 우측 방향지시등 · 정지선에서 반드시 일시정지'],
      [3, 45, '2차로로 차로변경', '좌측 방향지시등 · 점선 구간에서 변경'],
      [4, -160, '오류고가차도 교차로 직진', '신호 확인 · 2차로 유지'],
      [5, 145, '1차로로 차로변경', '육교 통과 후 · 좌측 방향지시등 · 어린이보호구역 50km/h'],
      [6, -150, '교차로 직진', '유한대학교 앞 · 1차로 유지'],
      [7, -160, '역곡고가교 4거리 직진', '1차로 유지'],
      [8, -200, '유턴차로 진입', '좌측 방향지시등 · 1차로 → 유턴 전용차로'],
      [8, -60, '유턴 (보행신호시)', '보행 신호일 때(차량 적색) 유턴 전용차로에서 유턴 → 2차로'],
      [9, -320, '역곡고가교 4거리 직진', '2차로 진행'],
      [10, -160, '교차로 직진', '유한대학교 앞'],
      [11, -115, '1차로로 차로변경', '육교 통과 후 · 좌측 방향지시등'],
      [12, -160, '오류고가차도 교차로 직진', '1차로 유지'],
      [13, -230, '좌회전 전용차로 진입', '좌측 방향지시등 · 1차로 → 좌회전 차로'],
      [13, -70, '3거리 좌회전', '좌회전 신호(←)에 좌회전 · 철도고가차도 방면'],
      [15, -160, '오류고가차도 교차로 직진', '내리막 후 2차로 진행'],
      [16, -40, '종료 지점 접근', '우측 방향지시등 · 월드빌라 앞 노란 점선 구간에 정차'],
    ],
  },
  B: {
    legend: [3, 2, 11, 5, 4.9],
    summary: [
      '동진택시 앞 출발 → 동곡초교 4거리 <b>좌회전</b> → 역곡고가교 → 역곡고가교 4거리 <b>좌회전</b>',
      '경인로 직진 (유한대·육교·오류고가차도·철도고가차도 3거리) → 오류동 3거리 앞 <b>유턴</b>',
      '되돌아와 역곡고가교 4거리 <b>우회전</b> → 동곡초교 4거리 <b>우회전</b> → 역곡주유소 지나 <b>종료</b>',
    ],
    start: START_DONGJIN,
    end: END_YEOKGOK,
    route: [
      ['V2L', 1], ['V2U', 2], ['YH', 2], ['SG', 1], ['V1U', 1], ['J3', 0], ['NB', 2],
      ['J3', 2], ['V1U', 2], ['SG', 2], ['YH', 3], ['V2U', 2], ['V2L', 2],
    ],
    instr: [
      ['start', 0, '출발', 'D 기어 · 좌측 방향지시등 · 어린이보호구역 30km/h'],
      [0, -80, '1차로로 차로변경', '좌측 방향지시등 · 동곡초교 4거리 좌회전 준비'],
      [0, -35, '동곡초교 4거리 좌회전', '좌회전 신호(←)에 좌회전 · 역곡고가교 방면'],
      [1, -130, '역곡고가교 4거리 좌회전', '왼쪽에 좌회전 차로가 생김 · 1차로(좌회전)·2차로(좌회전·직진) · 유도선 따라'],
      [2, -150, '교차로 직진', '유한대학교 앞 · 2차로'],
      [3, -115, '1차로로 차로변경', '육교 통과 후 · 좌측 방향지시등 · 어린이보호구역 50km/h'],
      [4, -160, '오류고가차도 교차로 직진', '1차로 유지 · 오류철도고가 오르막'],
      [5, -120, '3거리 직진', '오류철도고가 3거리 통과 · 내리막'],
      [6, -180, '유턴차로 진입', '좌측 방향지시등 · 1차로 → 유턴 전용차로'],
      [6, -60, '유턴 (보행신호시)', '보행 신호일 때(차량 적색) 유턴 → 2차로'],
      [7, -150, '차로가 늘어남', '왼쪽에 차로가 생겨 4차로가 됨 · 지금 3차로 → 좌측 방향지시등 · 2차로로 변경'],
      [7, -60, '3거리 직진', '2차로 유지'],
      [8, -160, '오류고가차도 교차로 직진', '2차로 유지'],
      [9, 145, '3차로로 차로변경', '육교 통과 후 · 우측 방향지시등'],
      [10, -150, '교차로 직진', '3차로 유지 · 역곡고가교 4거리 우회전 준비'],
      [11, -120, '역곡고가교 4거리 우회전', '우측 방향지시등 · 보행자 확인 후 우회전'],
      [12, -110, '동곡초교 4거리 우회전', '우측 방향지시등 · 보행자 확인 · 30km/h'],
      [12, 35, '종료 지점 접근', '우측 방향지시등 · 역곡주유소 지나 노란 점선 구간에 정차'],
    ],
  },
  C: {
    legend: [1, 3, 8, 6, 5.7],
    summary: [
      '카센타 앞 출발 → 온수역 앞 직진 → 철도고가차도 → 3거리 <b>좌회전</b> (오류IC 방면)',
      '오류IC 연결로 <b>우회전</b> → 남부순환로 → 연결로 <b>우회전</b> → 경인로 합류',
      '되돌아와 3거리 <b>우회전</b> → 철도고가차도 → 월드빌라 앞 <b>종료</b>',
    ],
    start: { a: 'AC', b: 'VW', px: 700, dir: -1, lane: 2 },
    end: END_WORLDVILLA,
    route: [
      ['AC', 2], ['CW2', 2], ['CW1', 2], ['V1L', 2], ['JB', 1], ['J3', 2], ['NB', 2], ['NA', 3], ['SX', 3],
      ['D1', 1], ['M1', 3], ['M2', 1], ['D2', 4], ['D1', 3], ['SX', 3], ['NA', 2], ['NB', 3], ['J3', 2], ['JB', 2], ['V1L', 2], ['CW1', 2],
    ],
    instr: [
      ['start', 0, '출발', 'D 기어 · 좌측 방향지시등을 켜고 출발 · 2차로'],
      [1, -40, '횡단보도 통과', '보행자 신호 확인'],
      [3, -170, '오류고가차도 교차로 직진', '1차로는 좌회전 차로 — 2차로로 직진'],
      [4, -5, '철도고가차도 방면 직진', '오르막 · 1차로로 차로변경 (좌측 방향지시등)'],
      [5, -150, '3거리 좌회전', '좌측 방향지시등 · 좌회전 신호에 오류IC 방면'],
      [5, 60, '2차로로 차로변경', '우측 방향지시등 · 오류동 3거리 지나 오류IC 방면 · 2차로로 계속 진행'],
      [6, -120, '오류지하차도 앞 3거리 직진', '노면 유도선을 따라 2차로 유지 (건너편 차로가 어긋나 있음)'],
      [7, 25, '왼쪽에 차로가 생김', '1차로가 새로 생겨 4차로가 됨 (포켓차로 아님) · 차로 그대로 → 지금 3차로'],
      [8, -150, '시흥IC 방면 진입 금지', '4차로는 시흥IC 연결로 — 3차로 유지 (빠지면 코스 이탈)'],
      [8, 15, '4차로 없어짐', '4차로가 시흥IC로 빠져 3차로가 됨 · 지금 맨 끝 3차로 · 약 300m 앞 우회전'],
      [9, -115, '4차로로 차로변경', '남부순환로 고가 밑에서 오른쪽에 4차로(우회전 차로)가 생김 · 우측 방향지시등 · 3→4차로'],
      [9, -40, '오류IC 연결로 우회전', '우측 방향지시등 · 김포공항 방면 연결로'],
      [9, 20, '신호등 없는 횡단보도', '건너거나 건너려는 보행자가 있으면 정지선 앞 정지 · 없으면 멈추지 말 것'],
      [10, -110, '신호등 없는 횡단보도', '우측 방향지시등 유지 · 보행자 확인 후 통과'],
      [10, -40, '남부순환로 합류', '좌측 방향지시등 · 김포공항 방면 3차로로 합류'],
      [11, -170, '우측 백색 안전지대', '빗금 안으로 들어가지 말 것 · 안전지대 지나 4차로로 차로변경'],
      [11, -60, '연결로 진출', '우측 방향지시등 · 구로·오류 방면 (진출이 끝날 때까지 지시등 유지)'],
      [12, -80, '신호등 없는 횡단보도', '보행자 확인 — 건너려는 사람이 없으면 멈추지 말 것'],
      [12, -30, '경인로 합류 (4차로)', '좌측 방향지시등 · 한 차로씩 3차로 → 2차로 (지시등 켠 채 두 차로 연속 변경 금지)'],
      [17, -230, '3차로로 차로변경', '우측 방향지시등 · 앞에서 왼쪽에 차로가 늘어 4차로(우회전 차로)가 됨'],
      [17, -70, '오류철도고가차도 3거리 우회전', '우회전 전용 신호등(오른쪽 별도 1개) 녹색 화살표에만 우회전 · 적색이면 정지선 앞 대기'],
      [19, -160, '오류고가차도 교차로 직진', '2차로 진행'],
      [20, -40, '종료 지점 접근', '우측 방향지시등 · 월드빌라 앞 노란 점선 구간에 정차'],
    ],
  },
  D: {
    legend: [3, 2, 8, 8, 4.9],
    summary: [
      '동진택시 앞 출발 → 동곡초교 4거리 <b>좌회전</b> → 역곡고가교 → 역곡고가교 4거리 <b>우회전</b>',
      '경인로(버스전용차로) 직진 (역곡역·성심고가·소사구청 3거리) → <b>유턴</b>',
      '되돌아와 역곡고가교 4거리 <b>좌회전</b> → 동곡초교 4거리 <b>우회전</b> → 역곡주유소 지나 <b>종료</b>',
    ],
    start: START_DONGJIN,
    end: END_YEOKGOK,
    route: [
      ['V2L', 1], ['V2U', 2], ['UT', 2], ['YG', 2], ['SS', 1], ['SC', 0], ['UT2', 2], ['SC', 2],
      ['SS', 1], ['YG', 1], ['UT', 1], ['UC', 0], ['V2U', 2], ['V2L', 2],
    ],
    instr: [
      ['start', 0, '출발', 'D 기어 · 좌측 방향지시등 · 어린이보호구역 30km/h'],
      [0, -80, '1차로로 차로변경', '좌측 방향지시등 · 동곡초교 4거리 좌회전 준비'],
      [0, -35, '동곡초교 4거리 좌회전', '좌회전 신호(←)에 좌회전 · 역곡고가교 방면'],
      [1, -150, '2차로로 차로변경', '우측 방향지시등 · 내리막 · 앞에서 왼쪽에 좌회전 차로가 생겨 3차로(직진·우회전)가 됨'],
      [1, -60, '역곡고가교 4거리 우회전', '우측 방향지시등 · 보행자 확인 · 버스전용차로 주의'],
      [2, -80, '횡단보도 통과', '2차로 유지'],
      [3, -150, '역곡역 교차로 직진', '2차로 유지'],
      [4, -160, '타이어뱅크 지나 차로변경', '좌측 방향지시등 · 성심고가 4거리 지나 1차로로'],
      [5, -120, '소사구청 3거리 직진', '통과 후 유턴차로 진입'],
      [6, -80, '유턴차로 진입', '좌측 방향지시등 · 1차로 → 유턴 전용차로'],
      [6, -40, '유턴 (보행신호시)', '보행 신호일 때(차량 적색) 유턴 → 2차로'],
      [7, -120, '소사구청 3거리 직진', '2차로 유지'],
      [8, -150, '성심고가 4거리 직진', '통과 후 1차로로 차로변경 (좌측 방향지시등)'],
      [9, -150, '역곡역 교차로 직진', '1차로 유지'],
      [11, -120, '1차로는 유턴 전용', '직진 금지 — 유턴 차로에 들어가지 말고 2차로 유지'],
      [11, 15, '좌회전 차로 생김', '횡단보도 지나 왼쪽에 좌회전 차로 · 좌측 방향지시등 · 1차로로'],
      [12, -60, '역곡고가교 4거리 좌회전', '좌회전 신호(←)에 좌회전 · 역곡고가교 방면'],
      [12, 120, '2차로로 차로변경', '우측 방향지시등 · 동곡초교 4거리 우회전 준비'],
      [13, -60, '동곡초교 4거리 우회전', '우측 방향지시등 · 보행자 확인 · 30km/h'],
      [13, 35, '종료 지점 접근', '우측 방향지시등 · 역곡주유소 지나 노란 점선 구간에 정차'],
    ],
  },
};

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

export function buildRoute(net, course) {
  const { start: START, end: END, route: ROUTE } = course;
  const pts = [];
  const nodeDist = [];
  const push = (p) => {
    const last = pts.at(-1);
    p.d = last ? last.d + Math.hypot(p.x - last.x, p.z - last.z) : 0;
    if (!last || p.d - last.d > 0.01) pts.push(p);
  };
  const pxS = (e, px) => e.local(toWorld(px, 0).x, e.a.z).s;

  // 구간 하나를 따라가는 점들 (from → to). from/to가 null이면 출발/종료 지점
  const legs = [];
  const seq = [{ id: null }, ...ROUTE.map(([id]) => ({ id })), { id: null }];
  // 두 노드 사이에 갈림길 없는 중간점(차로 수가 바뀌는 곳, 굽은 연결로, 횡단보도)이 이어져 있으면 경로에 자동으로 끼워 넣는다
  const hops = (from, to) => {
    if (net.edgeBetween(from, to)) return [to];
    for (const e0 of net.nodes[from].edges) {
      let e = e0, cur = e.a.id === from ? e.b : e.a;
      const path = [];
      while (cur.edges.length === 2 && cur.kind !== 'signal' && path.length < 40) {
        path.push(cur.id);
        if (net.edgeBetween(cur.id, to)) return [...path, to];
        e = cur.edges.find((x) => x !== e);
        cur = e.a === cur ? e.b : e.a;
      }
    }
    throw new Error(`코스 경로에 없는 구간: ${from} → ${to}`);
  };
  // 출발·종료 구간이 첫/마지막 ROUTE 노드에 바로 닿지 않으면 사이 중간점을 끼운다
  const se0 = net.edgeBetween(START.a, START.b), startNode = (START.dir > 0 ? se0.b : se0.a).id;
  const ee0 = net.edgeBetween(END.a, END.b), endNode = (END.dir > 0 ? ee0.a : ee0.b).id;
  for (let i = 0; i < seq.length - 1; i++) {
    const lane = i === 0 ? START.lane : ROUTE[i - 1][1];
    let ids = seq[i].id && seq[i + 1].id ? hops(seq[i].id, seq[i + 1].id) : [seq[i + 1].id];
    if (!seq[i].id && startNode !== seq[i + 1].id) ids = [startNode, ...hops(startNode, seq[i + 1].id)];
    if (!seq[i + 1].id && endNode !== seq[i].id) ids = [...hops(seq[i].id, endNode), null];
    ids.forEach((to, k) => {
      const from = k === 0 ? seq[i].id : ids[k - 1];
      let e, dir, s0, s1;
      if (!from) { e = net.edgeBetween(START.a, START.b); dir = START.dir; s0 = pxS(e, START.px); }
      else if (!to) { e = net.edgeBetween(END.a, END.b); dir = END.dir; s1 = pxS(e, END.px); }
      else e = net.edgeBetween(from, to);
      if (dir === undefined) dir = e.a.id === from ? 1 : -1;
      if (s0 === undefined) s0 = e.sFromEnd(-dir, e.endFor(-dir).mark);
      if (s1 === undefined) s1 = e.sFromEnd(dir, e.endFor(dir).mark);
      // ri: 이 구간이 출발하는 ROUTE 노드 번호 (중간점에서 출발하면 null)
      legs.push({ e, dir, s0, s1, lane, node: to ? (dir > 0 ? e.b : e.a) : null, ri: k === 0 && i > 0 ? i - 1 : null });
    });
  }
  // 유턴: 같은 구간을 되돌아오는 경우 정지선 14m 앞(유턴구역)에서 돈다
  legs.forEach((lg, i) => {
    const nx = legs[i + 1];
    if (lg.lane !== 0 || !nx || nx.e !== lg.e || nx.dir !== -lg.dir) return;
    const sU = lg.e.sFromEnd(lg.dir, lg.e.endFor(lg.dir).stop + 14);
    lg.s1 = sU; nx.s0 = sU; lg.node = null;
  });
  // 다음 교차로에서 좌회전이면 1차로, 우회전이면 바깥 차로로 들어가 있어야 한다
  legs.forEach((lg, i) => {
    const nx = legs[i + 1];
    lg.endLane = Math.min(lg.lane || 1, lg.e.nl(lg.dir));
    if (!nx || !lg.node || lg.lane === 0 || lg.e.oneway) return;
    const mv = classifyTurn({ x: lg.e.u.x * lg.dir, z: lg.e.u.z * lg.dir }, { x: nx.e.u.x * nx.dir, z: nx.e.u.z * nx.dir }, lg.node);
    if (mv === 'left') lg.endLane = 1;
    if (mv === 'right') lg.endLane = lg.e.nl(lg.dir);
    // 차로별 진행방향이 지정된 곳은 그 진행이 허용된 가장 가까운 차로로
    if (net.laneUse(lg.e, lg.node) && !net.laneAllows(lg.e, lg.node, lg.endLane, mv)) {
      for (let dl = 1; dl <= lg.e.nl(lg.dir); dl++) {
        const c = [lg.endLane + dl, lg.endLane - dl].find((l) => l >= 1 && l <= lg.e.nl(lg.dir) && net.laneAllows(lg.e, lg.node, l, mv));
        if (c) { lg.endLane = c; break; }
      }
    }
  });

  let prev = null;
  legs.forEach((lg, i) => {
    const { e, dir, s0, s1, lane, endLane } = lg;
    const pk = lane === 0 ? e.pocket(dir) : null;
    let target = Math.min(lane || 1, e.nl(dir));
    // 직진으로 이어지면 앞 구간 차로에서 시작해 구간 중간(점선 구간)에서 차로를 바꾼다
    const d0 = { x: e.u.x * dir, z: e.u.z * dir };
    const straight = prev && legs[i - 1].node && classifyTurn(prev.d, d0, legs[i - 1].node) === 'straight';
    // 이어지는 차로는 번호가 아니라 실제 위치로 찾는다 (왼쪽에 차로가 생기면 번호가 하나씩 밀린다)
    let near = Math.min(Math.max(prev ? prev.lane : 1, 1), e.nl(dir));
    if (straight && !net.hasGuide(legs[i - 1].node, legs[i - 1].e, e)) {
      let bd = Infinity;
      for (let l = 1; l <= e.nl(dir); l++) {
        const q = e.pt(s0, e.laneO(dir, l)), dd = Math.hypot(q.x - prev.p.x, q.z - prev.p.z);
        if (dd < bd) { bd = dd; near = l; }
      }
    }
    // 갈림 없는 중간점에서 이어지는 구간은 차로를 그대로 유지 (차로 변경은 ROUTE 노드 다음 첫 구간에서)
    if (straight && lg.ri === null && !e.oneway) target = near;
    // 연결로(일방통행)에서 본선으로 합류할 때는 지정 차로로 바로 들어간다
    const from = straight && !legs[i - 1].e.oneway ? near : Math.min(target, e.nl(dir));
    const oAt = (s) => {
      const f = Math.abs(s - s0) / (Math.abs(s1 - s0) || 1);
      // 짧은 구간(3거리 앞 등)은 교차로 앞 실선(진로변경 제한선) 전에 바꾸도록 앞쪽에서 차로 변경
      const short = Math.abs(s1 - s0) < 150;
      const k1 = Math.max(0, Math.min(1, short ? f / 0.15 : (f - 0.2) / 0.25)), k2 = Math.max(0, Math.min(1, short ? (f - 0.05) / 0.3 : (f - 0.55) / 0.25));
      const mid = e.laneO(dir, from) * (1 - k1) + e.laneO(dir, target) * k1;
      const o = mid * (1 - k2) + e.laneO(dir, endLane) * k2;
      if (!pk) return o;
      const into = dir > 0 ? s - pk[0] : pk[1] - s;
      return into > 20 ? 0 : into > 0 ? o * (1 - into / 20) : o;
    };
    const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 8));
    const legPts = [];
    for (let k = 0; k <= n; k++) {
      const s = s0 + ((s1 - s0) * k) / n;
      legPts.push({ ...e.pt(s, oAt(s)) });
    }
    const d = { x: e.u.x * dir, z: e.u.z * dir };
    if (prev) {
      const a = prev.p, b = legPts[0];
      // 급회전(예각 교차로)일수록 교차로 안쪽으로 깊게 돌아 모서리 연석을 피한다
      const turn = Math.acos(Math.max(-1, Math.min(1, prev.d.x * d.x + prev.d.z * d.z)));
      const gapD = Math.hypot(b.x - a.x, b.z - a.z), k = Math.max(Math.min(4, gapD), gapD * (turn > 1.9 ? 0.8 : 0.5));
      const curve = bezier(a, { x: a.x + prev.d.x * k, z: a.z + prev.d.z * k }, { x: b.x - d.x * k, z: b.z - d.z * k }, b, 12);
      curve.forEach((p, j) => { push(p); if (j === 5 && lg.ri !== null) nodeDist[lg.ri] = pts.at(-1).d; });
    }
    legPts.forEach(push);
    prev = { p: legPts.at(-1), d, lane: endLane };
  });

  const total = pts.at(-1).d;
  // 내비게이션 음성용 회전 지점: 경로 방향이 크게 바뀌는 곳 (좌·우회전 / 유턴)
  const at = (d) => { for (let i = 1; i < pts.length; i++) if (pts[i].d >= d) return pts[i]; return pts.at(-1); };
  const hd = (d0, d1) => { const a = at(d0), b = at(d1), l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; };
  const turnAt = (d) => { const h1 = hd(d - 12, d - 2), h2 = hd(d + 2, d + 12); return Math.atan2(h1.x * h2.z - h1.z * h2.x, h1.x * h2.x + h1.z * h2.z); };
  const maneuvers = [];
  for (let d = 30, g = null; d < total - 20; d += 3) {
    const a = Math.abs(turnAt(d));
    if (a > 0.35) { if (!g) g = { d0: d, best: d, a }; if (a > g.a) { g.a = a; g.best = d; } g.d1 = d; continue; }
    if (g && d - g.d1 > 15) {
      const h1 = hd(g.d0 - 25, g.d0 - 8), h2 = hd(g.d1 + 8, g.d1 + 25);
      const ang = Math.abs(Math.atan2(h1.x * h2.z - h1.z * h2.x, h1.x * h2.x + h1.z * h2.z));
      // 43° 넘게 꺾이면 회전으로 안내 (방향은 90° 꺾은 방향으로 판정 — 비스듬한 3거리 좌회전도 잡힘)
      const sg = Math.sign(h1.x * h2.z - h1.z * h2.x) || 1, h90 = { x: -sg * h1.z, z: sg * h1.x };
      const mv = ang > 2.5 ? 'U' : ang > 0.75 ? classifyTurn(h1, h90, null) : 'straight';
      if (mv !== 'straight') maneuvers.push({ d: g.best, type: mv });
      g = null;
    }
  }
  const instr = course.instr.map(([idx, off, title, sub]) => ({ d: idx === 'start' ? 0 : nodeDist[idx] + off, title, sub }));
  instr.sort((a, b) => a.d - b.d);
  const se = net.edgeBetween(START.a, START.b), ee = net.edgeBetween(END.a, END.b);
  const sp = se.pt(pxS(se, START.px), se.laneO(START.dir, START.lane));
  const [z0, z1] = END.zone.map((px) => pxS(ee, px)).sort((a, b) => a - b);
  return {
    pts, total, nodeDist, instr, maneuvers,
    start: { x: sp.x, z: sp.z, y: se.h(pxS(se, START.px)), yaw: Math.atan2(se.u.x * START.dir, se.u.z * START.dir) },
    end: { edge: ee, s0: z0, s1: z1, dir: END.dir, label: END.label },
  };
}

// 진행도(경로상 거리) 추적: 현재 진행도 근처에서만 찾아 왕복 구간 혼동을 막는다
export function project(route, x, z, near) {
  const { pts } = route;
  let best = { dist: Infinity, d: near, i: 0 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b.d < near - 60 || a.d > near + 160) continue;
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
    const px = a.x + dx * t, pz = a.z + dz * t, dist = Math.hypot(x - px, z - pz);
    if (dist < best.dist) best = { dist, d: a.d + (b.d - a.d) * t, i, dir: { x: dx / Math.sqrt(L2), z: dz / Math.sqrt(L2) }, x: px, z: pz };
  }
  return best;
}
