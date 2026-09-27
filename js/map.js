// 온수역자동차전문학원 도로주행 A·B·C·D 코스 공통 도로망 데이터.
// 좌표는 학원 공식 안내도(2026.07.03판, 1024×724px) A코스 그림의 픽셀 좌표를 기준으로 삼고,
// B·C·D 코스 그림에만 나오는 구간(오류IC, 역곡역~소사구청)은 같은 축척으로 이어 붙였다.
// 안내도는 위쪽이 남쪽이므로 월드도 안내도 화면 방향 그대로(x → 오른쪽, z → 아래쪽) 둔다.

export const S = 3; // 1px = 3m → A코스 총 길이 약 5.9km (안내도 표기와 일치)
const OX = 436, OY = 450; // 월드 원점 = 오류고가차도
export const toWorld = (x, y) => ({ x: (x - OX) * S, z: (y - OY) * S });
const W = (x, z) => [x / S + OX, z / S + OY]; // 월드 좌표(m) → 안내도 px

export const ROAD_TYPES = {
  arterial: { lanes: 3, laneW: 3.3, median: 3.4, medianStyle: 'fence' }, // 경인로 (오류IC ↔ 부천) / 남부순환로
  urban: { lanes: 2, laneW: 3.2, median: 0.5 },
  underpass: { lanes: 2, laneW: 3.2, median: 9 }, // 오류고가차도 하부 도로
  local: { lanes: 1, laneW: 3.2, median: 0.3 },
  ramp: { lanes: 1, laneW: 4.5, median: 0, oneway: true }, // 오류IC 연결로 (일방통행)
};

// 오류IC (경인로 × 남부순환로 입체교차) — 남부순환로가 경인로와 철길 위를 고가로 넘는다 (영상: C코스 7:00~9:10)
//  경인로를 서쪽으로 가다 NA를 지나면 왼쪽(중앙분리대 쪽)에 차로가 생겨 4차로 → 4차로는 SX에서 시흥IC 연결로로 빠져
//  다시 3차로 (영상 C코스 7:00~7:20) → 남부순환로 고가 밑(DX)에서 오른쪽에 4차로가 다시 생겨 D1에서 우회전 (7:27) → 무신호 횡단보도 → 암벽을 끼고 도는 루프(R) → 무신호 횡단보도 → 남부순환로 합류(M1).
//  남부순환로로 경인로를 넘은 뒤(M2) 오른쪽으로 빠져 내리막 연결로 → 루프(K) → 무신호 횡단보도 → 경인로 합류(D2).
//  연결로는 본선과 45°로 만나게 해 합류·분기 모서리가 자연스럽게 한다.
const IX = (-40 - OX) * S, IZ = -210;
const ring = (pre, [cx, cz, r], a0, a1, n) => Object.fromEntries(Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / n;
  return [`${pre}${i}`, W(cx + r * Math.cos(a), cz + r * Math.sin(a))];
}));
const RC = [IX - 60, -380, 40]; // 진입 루프 (경인로 → 남부순환로 북쪽 방향)
const KC = [IX - 159.5, -89.5, 70]; // 진출 루프 (남부순환로 → 경인로 동쪽 방향)
const R_ = ring('R', RC, Math.PI, Math.PI * 1.75, 6), K_ = ring('K', KC, Math.PI / 4, Math.PI * 1.25, 8);
// 루프 안쪽은 건물 없이 나무 숲 (월드 좌표 m)
export const IC_GREEN = [RC, KC].map(([x, z, r]) => ({ x, z, r }));
const midP = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
const IC = {
  SX: W(IX + 90, IZ), S1: W(IX + 62, IZ - 40), S2: W(IX + 40, -336.6), // 시흥IC 연결로
  DX: W(IX + 30, IZ), D1: W(IX - 100, IZ), D2: W(IX - 138, IZ),
  ZR1: W(IX - 100, IZ - 45), ...R_, ZR2: midP(R_.R4, R_.R5), M1: W(IX, -376.6),
  NRS: W(IX, -950), M2: W(IX, -150), NRN: W(IX, 700),
  ...K_, ZK: W(IX - 169.8, -178.2),
};
// 노드(교차로) 노면 높이: 오류철도고가 3거리(J3)는 철길 위 고가 교차로
// 철도고가차도 높이: 3거리(J3)에서 7.5m, 40m 평탄 후 280m 지점까지 내려간다
const ss = (t) => t * t * (3 - 2 * t);
const diagH = (s) => (s <= 40 ? 7.5 : s >= 280 ? 0 : 7.5 * (1 - ss((s - 40) / 240)));
// 오류철도고가 오르막 (NB에서 거리 s): 130m까지 평지, 300m에서 7.5m
const nbH = (s) => (s <= 130 ? 0 : s >= 300 ? 7.5 : 7.5 * ss((s - 130) / 170));
const sampled = (f, s0, s1, step = 10) => {
  const out = [];
  for (let s = s0; s < s1; s += step) out.push([s - s0, f(s)]);
  out.push([s1 - s0, f(s1)]);
  return out;
};
const JF_S = 250; // 3거리에서 신호 횡단보도(차로가 3개로 늘어나는 지점)까지 거리(m) — 영상 1:45~1:52
// 온수역 앞 도로 → 철도고가차도: 안내도는 꺾임점(383,520)에서 45°쯤 꺾이지만 실제 도로는 조금씩 오른쪽으로 휘며
// 3거리로 이어진다 (영상: A·C코스 초반 쭉 직진). 꺾임점을 반지름 약 236m 원호(8구간)로 다듬고, 갈림길 JB는 원호 가운데에 둔다.
// 미니맵은 안내도대로 꺾인 모양을 그린다 (MAP_BEND).
const BEND = (() => {
  const C = [383, 520], L2 = Math.hypot(272 - 383, 380 - 520), d2 = [(272 - 383) / L2, (380 - 520) / L2];
  const th = Math.acos(-d2[0]), T = 38, R = T / Math.tan(th / 2); // 온수역 앞 도로(서쪽 방향)와 대각선 사이 각, 접선 길이 T(px)
  const O = [C[0] + T, C[1] - R], a0 = Math.PI / 2, a1 = a0 + th;
  const at = (r, a) => [O[0] + r * Math.cos(a), O[1] + r * Math.sin(a)];
  return { C, d2, T, R, O, a0, a1, at, L2 };
})();
const BEND_N = 8;
const BEND_NODES = Object.fromEntries(Array.from({ length: BEND_N + 1 }, (_, i) =>
  [i === BEND_N / 2 ? 'JB' : `JC${i}`, BEND.at(BEND.R, BEND.a0 + ((BEND.a1 - BEND.a0) * i) / BEND_N)]));
const JF_PX = [272 + (111 / 178.7) * (JF_S / S), 380 + (140 / 178.7) * (JF_S / S)];
const JC8_JF = Math.hypot(BEND_NODES.JC8[0] - JF_PX[0], BEND_NODES.JC8[1] - JF_PX[1]) * S; // 원호 끝 ~ 신호 횡단보도(m)
export const MAP_BEND = {
  O: toWorld(...BEND.O), R: BEND.R * S, a0: BEND.a0, a1: BEND.a1,
  corner: [BEND_NODES.JC0, BEND.C, BEND_NODES.JC8].map((p) => toWorld(...p)),
};
export const NODE_H = { M2: 7.5, J3: 7.5, JF: diagH(JF_S) };

export const NODES = {
  // 위쪽 큰길 경인로 (y=380)
  W0: [-170, 380], ...IC, NA: [90, 380], NB: [160, 380], N1: [160 + 110 / S, 380], J3: [272, 380], V1U: [436, 380],
  SG: [535, 380], YH: [648, 380], V2U: [786, 380], UC: [786 + 150 / S, 380], UT: [885, 380], YG: [989, 380], UTn: [860, 250], UTs: [905, 405],
  SS: [1173, 380], SC: [1372, 380], UT2: [1410, 380], E0: [1560, 380],
  // 아래쪽 온수역 앞 도로 (y=520)
  ...BEND_NODES, JF: JF_PX, V1L: [436, 520], CW1: [554, 520], CW2: [632, 520], AC: [652, 520],
  // 동곡초교 4거리(V2L) ~ 역곡고가교 4거리(V2U) 약 220m: 동곡초교 언덕(BUMPS)을 내려가며 철길(파인 땅 아래)을 건너고,
  // 4거리 앞 100m(V2B)에서 왼쪽에 좌회전 차로가 생겨 3차로 (영상 B코스 1:31~2:00)
  V2L: [786, 380 + 220 / S], V2B: [786, 380 + 100 / S], LE: [1070, 520],
  VW: [745, 380 + 220 / S], VE: [830, 380 + 220 / S], // 동곡초교 4거리는 동서 도로가 곧게 들어오는 반듯한 네거리 (영상 B코스 1:25)
  // 갈림길 끝점
  OR: [90, 335], NBn: [160, 348], NBs: [160, 432], V1n: [436, 150], V1s: [436, 760],
  YHn: [648, 150], V2n: [786, 150], V2s: [786, 760], SGs: [590, 452], JBs: [330, 600], ACs: [652, 650],
  YGn: [989, 170], YGs: [989, 408], SSn: [1173, 170], SSs: [1173, 620], SCn: [1372, 170],
};

export const SIGNAL_NODES = ['NB', 'J3', 'V1U', 'YH', 'V2U', 'UT', 'V1L', 'V2L', 'YG', 'SS', 'SC'];
export const CROSSWALK_NODES = ['CW1', 'CW2', 'UT2', 'JF', 'UC'];
// 차선이 비스듬히 옮겨 가는 전환 구간 (앞뒤 14m를 포장면으로 잇고 차선을 곡선으로 긋는다)
export const TAPER_NODES = ['V2B', 'DX']; // V2B: 단일로 신호 횡단보도, DX: 남부순환로 고가 밑 우회전 차로 시작
// 신호등 없는 횡단보도 (영상: 오류IC 연결로 첫 번째·두 번째·세 번째)
export const ZEBRA_NODES = ['ZR1', 'ZR2', 'ZK'];
// 우회전 신호가 24시간 적색인 진입로 [출발 노드, 교차로] — 정지선에서 반드시 일시정지 후 우회전
// (영상 확인: 오류철도고가 3거리, 철도고가차도 쪽에서 우회전)
export const RIGHT_STOP = [['JF', 'J3']];
// 차로별 진행방향(노면 화살표) [출발 노드, 교차로, 1차로부터 순서대로] — left | straight | right | sl(직좌) | sr(직우)
export const LANE_USE = [
  ['CW1', 'V1L', ['left', 'straight']], // 오류고가차도 교차로 앞 (온수역 쪽): 1차로 좌회전
  ['JF', 'J3', ['left', 'left', 'right']], // 오류철도고가 3거리 앞: 1·2차로 좌회전, 3차로 우회전
  ['NA', 'SX', ['straight', 'straight', 'straight', 'right']], // 시흥IC 연결로 갈림: 4차로는 시흥IC 전용 (빠지면 코스 이탈)
  ['DX', 'D1', ['straight', 'straight', 'straight', 'right']], // 오류IC: 4차로에서 우회전 (남부순환로 김포공항 방면)
  ['M1', 'M2', ['straight', 'straight', 'straight', 'right']], // 남부순환로 → 경인로 진출: 4차로
  ['V2B', 'V2U', ['left', 'sl', 'sr']], // 역곡고가교 4거리 앞: 1차로 좌회전, 2차로 좌회전·직진, 3차로 직진·우회전 (영상 B코스 1:53)
  ['VW', 'V2L', ['left', 'sr']], // 동곡초교 4거리 앞: 1차로 좌회전, 2차로 직진·우회전 (영상 B코스 1:25)
  ['V2B', 'V2L', ['straight', 'sr']], // 역곡고가교에서 내려와 동곡초교 4거리 앞: 2차로 직진·우회전 (영상 B코스 11:15)
  ['YH', 'V2U', ['straight', 'straight', 'sr']], // 경인로 동쪽 역곡고가교 4거리 앞: 3차로 직진·우회전 (영상 B코스 9:45)
];
// 노면 유도선 [진입 노드, 교차로, 진출 노드] — 교차로 안에서 차로가 어긋나는 곳 (영상 5:40 오류지하차도 앞 3거리)
// 4번째 값 'left': 좌회전 유도선 (좌회전 차로마다 곡선 점선 — 영상 C코스 4:31~4:37 오류철도고가 3거리)
export const GUIDE_LINES = [['N1', 'NB', 'NA'], ['NA', 'NB', 'N1'], ['JF', 'J3', 'N1', 'left'], ['V1U', 'J3', 'JF', 'left'],
  // 동곡초교·역곡고가교 4거리 좌회전 (영상 B코스 1:31, 2:11)
  ['VW', 'V2L', 'V2B', 'left'], ['V2B', 'V2U', 'YH', 'left'], ['UC', 'V2U', 'V2B', 'left']];
// 백색 안전지대 (빗금, 진입 금지) — 영상 8:22 남부순환로 합류 후 우측
export const SAFETY_ZONES = [{ edge: ['M1', 'M2'], dir: 1, lane: 4, from: 30, toEnd: 95 }];
// 신호등 개수 [출발 노드, 교차로, 교차로 건너편, 정지선 쪽] — 기본은 건너편 1개
export const SIGNAL_HEADS = [['V1U', 'J3', 3, 3], ['N1', 'J3', 3, 0]]; // 되돌아오는 길 3거리 좌회전: 앞 3개, 뒤 3개
// 우회전 전용 신호등 (직진 신호 오른쪽 별도 1개) [출발 노드, 교차로] — 녹색 화살표일 때만 우회전 (영상 C코스 11:41)
export const RIGHT_SIGNALS = [['N1', 'J3']];

// 서쪽 방향 왼쪽에 차로가 생긴 경인로 구간 (NA~D1): 분리대를 좁히고 중앙선을 옮긴다
const LEFT_LANE = { median: 0.5, shiftLanes: 1.45 / 3.3 };

// [a, b, 도로종류, 옵션]
// pocketA/pocketB: a/b 쪽으로 가는 차로의 좌회전(유턴) 전용차로 길이(m), uturn: 유턴이 허용되는 쪽('a'|'b')
// profile: [a로부터 거리, 높이] — 철도/도로를 넘는 고가 구간 (linear: 직선 경사)
// merge: 연결로가 합류하는 구간 — 본선 통과 차량은 바깥 차로를 비워 둔다
// medianStyle: 중앙분리대 형태 fence(황흑 기둥 펜스) | planted(화단) | guardrail(가드레일) — 영상 확인
// centerPosts: 중앙선 위 시선유도봉 posts(황흑) | bollard(주황 규제봉)
// uturnPlate: 유턴 표지 보조판 — '보행신호시'면 보행 신호(차량 적색)일 때만 유턴
export const EDGES = [
  // 서쪽 방향 (영상 C코스 7:00~7:27): NA를 지나면 왼쪽에 차로가 생겨 4차로 (주행 차로 2 → 3차로, 포켓차로 아님)
  //   → 4차로는 SX에서 시흥IC 연결로로 빠져 3차로 → 남부순환로 고가 밑(DX)에서 오른쪽에 4차로(오류IC 우회전 차로)가 생긴다
  //   왼쪽 차로는 중앙분리대를 중앙선으로 좁혀(median 0.5) 만들고, 중앙선을 옮겨 동쪽 방향 차로는 그대로 둔다 (N1~J3과 같은 방식)
  // 동쪽 방향: 진출 루프가 합류해 NA까지 4차로 (영상 9:12)
  ['W0', 'D2', 'arterial', { merge: true }], ['D2', 'D1', 'arterial', { merge: true, lanesP: 4 }],
  ['D1', 'DX', 'arterial', { merge: true, lanesN: 4, lanesP: 4, ...LEFT_LANE }], ['DX', 'SX', 'arterial', { merge: true, lanesP: 4, ...LEFT_LANE }],
  ['SX', 'NA', 'arterial', { merge: true, lanesN: 4, lanesP: 4, ...LEFT_LANE }],
  // 오류지하차도 앞 3거리(NB) 건너편은 차로가 한 칸 바깥으로 어긋나 있다 → 노면 유도선 (영상 5:40)
  ['NA', 'NB', 'arterial', { shiftAB: [0, -1] }],
  // 오류철도고가: 경인로가 3거리(J3) 부근에서 철길 위로 올라간다
  // NB 유턴 뒤 동쪽 방향 (영상 B코스 6:15~6:26): 바로 3차로 → 유턴차로가 끝나는 곳(N1)부터 중앙분리대 자리에 왼쪽 차로가 생겨 4차로
  //   N1~J3: 분리대를 중앙선으로 좁히고(median 0.5) 서쪽 방향 차로는 그대로 두도록 중앙선을 옮긴다
  ['NB', 'N1', 'arterial', { pocketA: 80, uturn: 'a', uturnPlate: '보행신호시', name: '오류철도고가' }],
  ['N1', 'J3', 'arterial', { median: 0.5, lanesP: 4, shiftLanes: -1.45 / 3.3, name: '오류철도고가', profile: sampled((s) => nbH(110 + s), 0, 226), linear: true }],
  ['J3', 'V1U', 'arterial', { pocketA: 90, name: '오류철도고가', profile: [[0, 7.5], [40, 7.5], [230, 0]] }],
  ['V1U', 'SG', 'arterial'], ['SG', 'YH', 'arterial'], ['YH', 'V2U', 'arterial', { medianStyle: 'planted' }],
  // 서쪽 방향 (영상 D코스 9:12~9:33): UT를 지나면 왼쪽 1차로가 유턴 전용 차로(직진 금지) → 신호 횡단보도(UC)에서 유턴하며 끝남
  //   → 횡단보도를 지나 다시 왼쪽에 좌회전 차로가 생김 (역곡고가교 4거리 좌회전은 이 차로에서) — 좌회전 차로를 헷갈리게 하는 곳
  ['V2U', 'UC', 'arterial', { pocketA: 110, medianStyle: 'guardrail', centerGuard: true }],
  ['UC', 'UT', 'arterial', { pocketA: 60, uturn: 'a', pocketB: 60, uturn2: 'b', uturnPlate: '보행신호시', medianStyle: 'guardrail', centerGuard: true }],
  ['UT', 'YG', 'arterial', { bus: true, medianStyle: 'planted' }], ['YG', 'SS', 'arterial', { bus: true, medianStyle: 'guardrail' }],
  ['SS', 'SC', 'arterial', { bus: true, medianStyle: 'guardrail' }],
  ['SC', 'UT2', 'arterial', { pocketB: 70, uturn: 'b', uturnPlate: '보행신호시', bus: true, medianStyle: 'guardrail' }],
  ['UT2', 'E0', 'arterial', { bus: true, medianStyle: 'guardrail' }],

  // 철도고가차도: 3거리(고가)에서 철길 옆을 따라 온수역 앞 도로로 내려간다
  // 3거리 앞 신호 횡단보도(JF)를 지나면 3거리 방향이 3차로로 늘어난다:
  // 중앙선 쪽(좌측)에 차로가 새로 생기고 바깥 가장자리는 그대로 (shiftLanes)
  ...[['JB', 'JC5'], ['JC5', 'JC6'], ['JC6', 'JC7'], ['JC7', 'JC8']].map(([a, b]) => [a, b, 'urban', { name: '오류철도고가차도', centerPosts: 'bollard', curve: true }]),
  ['JC8', 'JF', 'urban', { name: '오류철도고가차도', centerPosts: 'bollard', profile: sampled((s) => diagH(JF_S + JC8_JF - s), 0, JC8_JF), linear: true }],
  ['JF', 'J3', 'urban', { name: '오류철도고가차도', centerPosts: 'bollard', lanesP: 3, shiftLanes: -1, profile: sampled((s) => diagH(JF_S - s), 0, JF_S), linear: true }],
  // 4거리 앞 3차로: 왼쪽에 좌회전 차로가 생기므로 중앙선을 반대쪽으로 한 차로 옮긴다 (V2B는 차선이 비스듬히 옮겨 가는 전환 구간)
  ['V2U', 'V2B', 'urban', { name: '역곡고가교', lanesN: 3, shiftLanes: 1 }], ['V2B', 'V2L', 'urban', { name: '역곡고가교' }],
  ['SS', 'SSs', 'urban', { name: '성심고가교', profile: [[0, 0], [15, 0], [85, 8], [160, 8], [260, 0]] }],
  ['UT', 'UTn', 'urban'], ['UT', 'UTs', 'local'],

  ...[['JC0', 'V1L'], ['JC1', 'JC0'], ['JC2', 'JC1'], ['JC3', 'JC2'], ['JB', 'JC3']].map(([a, b]) => [a, b, 'urban', { centerPosts: 'posts', curve: a !== 'JC0' }]), ['V1L', 'CW1', 'urban', { centerPosts: 'posts' }],
  ['CW1', 'CW2', 'urban', { centerPosts: 'posts' }], ['CW2', 'AC', 'urban', { centerPosts: 'posts' }],
  ['AC', 'VW', 'urban'], ['VW', 'V2L', 'urban'], ['V2L', 'VE', 'urban'], ['VE', 'LE', 'urban'],

  ['NA', 'OR', 'local'], ['NB', 'NBn', 'urban'], ['NB', 'NBs', 'local'],
  ['V1U', 'V1n', 'underpass'], ['V1L', 'V1s', 'underpass'],
  ['YH', 'YHn', 'urban'], ['V2U', 'V2n', 'urban'], ['V2L', 'V2s', 'urban'],
  ['SG', 'SGs', 'local'], ['JB', 'JBs', 'urban'], ['AC', 'ACs', 'local'],
  ['YG', 'YGn', 'urban'], ['YG', 'YGs', 'local'], ['SS', 'SSn', 'urban'], ['SC', 'SCn', 'urban'],

  // 오류IC: 남부순환로 + 연결로
  ['NRS', 'M1', 'arterial', { merge: true, name: '남부순환로', profile: [[0, 0], [250, 0], [335, 7.5], [415, 7.5], [480, 0]] }],
  // 합류 후 북쪽 방향은 4차로: 합류 차로 → 백색 안전지대 → 진출 차로 (영상 8:14~8:26)
  ['M1', 'M2', 'arterial', { merge: true, lanesP: 4, name: '남부순환로', profile: [[0, 0], [40, 0], [140, 7.5]] }],
  ['M2', 'NRN', 'arterial', { name: '남부순환로', profile: [[0, 7.5], [190, 7.5], [300, 0]] }],
  ['SX', 'S1', 'ramp'], ['S1', 'S2', 'ramp'], ['S2', 'M1', 'ramp'],
  ['D1', 'ZR1', 'ramp'], ['ZR1', 'R0', 'ramp'], ['R0', 'R1', 'ramp'], ['R1', 'R2', 'ramp'], ['R2', 'R3', 'ramp'], ['R3', 'R4', 'ramp'],
  ['R4', 'ZR2', 'ramp'], ['ZR2', 'R5', 'ramp'], ['R5', 'R6', 'ramp'], ['R6', 'M1', 'ramp'],
  ['M2', 'K0', 'ramp', { profile: [[0, 7.5], [20, 7.5], [130, 0]], linear: true }],
  ...Array.from({ length: 8 }, (_, i) => [`K${i}`, `K${i + 1}`, 'ramp']),
  ['K8', 'ZK', 'ramp'], ['ZK', 'D2', 'ramp'],
];

// 경인선(1호선) 철길 — 영상 확인: 온수역 앞 도로 북쪽에 방음벽이 바로 붙어 가다가, 철도고가차도 동쪽을 따라
// 오류철도고가 3거리(경인로 고가) 밑을 지나 오류동역으로 간다
// 온수역 앞 도로가 휘는 곳은 철길도 같은 중심의 원호로 휜다
const RAIL_BEND = Array.from({ length: BEND_N + 1 }, (_, i) => BEND.at(BEND.R - 7.3, BEND.a1 - ((BEND.a1 - BEND.a0) * i) / BEND_N));
export const RAIL = [[-400, 200], [-60, 250], [90, 312], [277.7, 375.5], ...RAIL_BEND, [650, 512.7], [700, 470, 0], [745, 440, 2], [786, 424, 5], [830, 418, 3.5], [879, 418, 0], [1750, 418]];
// 3번째 값: 땅을 파고 들어간 깊이(m) — 역곡고가교 밑은 5m 아래로 지난다 (사이는 직선 보간, 없으면 0).
// 언덕(BUMPS) 위를 지날 때는 그만큼 더 깊이 파서 철길은 수평을 유지한다
// side: 역 입구가 있는 쪽 (+1 = 철길 진행방향(x 증가) 오른쪽, -1 = 왼쪽)
export const STATIONS = [
  { name: '오류동역', en: 'Oryu-dong', x: 85, side: 1, lines: [['1', '#0052a4']] },
  { name: '온수역', en: 'Onsu', x: 600, side: -1, lines: [['1', '#0052a4'], ['7', '#747f00']] },
  { name: '역곡역', en: 'Yeokgok', x: 989, side: -1, lines: [['1', '#0052a4']] },
  { name: '소사역', en: 'Sosa', x: 1494, side: -1, lines: [['1', '#0052a4'], ['서해', '#8fc31f']] },
];

// 오류고가차도(세로 방향, 두 큰길 위를 넘어감)
export const OVERPASS = { x: 436, y0: 270, y1: 650, ramp: 60, h: 7.5, width: 8 };
// 육교 (오정초등학교 앞)
export const FOOTBRIDGE = { x: 578, y: 380 };
// 어린이보호구역: 가로 구간은 안내도 x 범위, 세로 구간은 도착 노드 쪽 거리(m)
export const SCHOOL_ZONES = [
  { edge: ['SG', 'YH'], x: [560, 605], limit: 50 }, // 오정초 (육교 통과 후 어린이보호구역, 50km/h)
  { edge: ['CW1', 'CW2'], x: [560, 600], limit: 50 },
  { edge: ['AC', 'VW'], x: [700, 745], limit: 30 }, { edge: ['VW', 'V2L'], all: true, limit: 30 }, // 동곡초교
];
// 언덕 [안내도 x, y, 반지름(px), 높이(m)] — 도로·철길에서 떨어진 땅만 솟는다 (영상: 출발지 남쪽 석축 언덕,
// 육교 부근 경인로 북쪽 산비탈, 오류IC 옆 암벽 산)
// 땅 자체가 솟은 완만한 언덕 [안내도 x, y, 반지름(m), 높이(m)] — 도로·땅·건물이 함께 오르내린다
//  동곡초교 언덕: 서쪽 어린이보호구역에서 올라가고 역곡고가교 4거리까지 내리막 (영상 B코스 1:02, 1:48)
//  소사구청 앞: 유턴 300m 전부터 완만한 오르막, 150m 전부터 내리막 (영상 D코스 5:14, 5:20)
export const BUMPS = [[786, 380 + 205 / S, 220, 7], [1360, 380, 150, 4]];
export const HILLS = [[560, 553, 55, 18], [605, 330, 55, 14], [-95, 285, 70, 32], [1320, 240, 90, 16], [250, 620, 60, 9]];
// 안내도의 제한속도 표지 위치
export const SPEED_SIGNS = [
  [208, 372], [118, 390], [518, 372], [515, 390], [667, 372], [667, 390], [897, 372],
  [514, 514], [521, 528], [300, 440], [436, 600], [1000, 372], [1250, 390], [1400, 372],
];

// 안내도에 표시된 주요 건물 — 가장 가까운 도로변에 배치된다
export const LANDMARKS = [
  { name: '오류동시장', at: [60, 420], type: 'market', w: 60, d: 24, h: 7 },
  { name: '베르누이호텔', at: [20, 420], type: 'showroom', w: 30, d: 20, h: 30 },
  { name: 'SK 서서울주유소', at: [262, 340], type: 'gas', w: 30, d: 22, h: 6, color: '#e2231a' },
  { name: '현대자동차 영업소', at: [208, 420], type: 'showroom', w: 34, d: 20, h: 9 },
  { name: '올갱이해장국', at: [240, 420], type: 'shop', w: 16, d: 12, h: 6 },
  { name: '연세중앙교회', at: [300, 500], type: 'church', w: 90, d: 56, h: 26 },
  { name: '동부제강 물류센터', at: [378, 330], type: 'warehouse', w: 90, d: 46, h: 14 },
  { name: '구로자동차검사소', at: [360, 410], type: 'inspection', w: 44, d: 22, h: 8 },
  { name: '골프연습장', at: [480, 330], type: 'golf', w: 70, d: 46, h: 24 },
  { name: '서울가든아파트', at: [495, 420], type: 'apt', w: 56, d: 14, h: 45, count: 3 },
  { name: '오정초등학교', at: [585, 340], type: 'school', w: 70, d: 16, h: 14 },
  { name: '성공회대학교', at: [630, 300], type: 'univ', w: 56, d: 20, h: 18 },
  { name: '유한공업고등학교', at: [690, 340], type: 'school', w: 60, d: 16, h: 15 },
  { name: '유한대학교', at: [735, 340], type: 'univ', w: 60, d: 22, h: 20 },
  { name: 'e편한세상아파트', at: [668, 420], type: 'apt', w: 48, d: 14, h: 66, count: 3 },
  { name: '메디홀스의원', at: [853, 420], type: 'shop', w: 18, d: 14, h: 13 },
  { name: '카센타', at: [683, 490], type: 'garage', w: 20, d: 14, h: 6 },
  { name: '역곡주유소', at: [722, 490], type: 'gas', w: 28, d: 20, h: 6, color: '#00843d' },
  { name: '우신중·고등학교', at: [500, 560], type: 'school', w: 70, d: 16, h: 16 },
  { name: '온수초등학교', at: [575, 560], type: 'school', w: 56, d: 16, h: 13 },
  { name: '월드빌라', at: [618, 560], type: 'villa', w: 22, d: 14, h: 13 },
  { name: '버스종점', at: [690, 560], type: 'busdepot', w: 46, d: 30, h: 5 },
  { name: '동진택시', at: [724, 560], type: 'garage', w: 28, d: 18, h: 7 },
  { name: '온수자동차전문학원', at: [700, 620], type: 'academy', w: 40, d: 20, h: 12 },
  { name: '동곡초등학교', at: [820, 560], type: 'school', w: 56, d: 16, h: 13 },
  { name: '홈플러스', at: [930, 340], type: 'warehouse', w: 80, d: 50, h: 22 },
  { name: '역곡남부시장', at: [1030, 340], type: 'market', w: 50, d: 22, h: 7 },
  { name: '타이어뱅크', at: [1120, 340], type: 'tirebank', w: 36, d: 18, h: 42 }, // 영상 D코스 3:55 — 지나서 차로변경 (멀리서도 보이게 주변보다 높게)
  { name: '맥도날드', at: [1040, 420], type: 'shop', w: 20, d: 16, h: 8 },
  { name: '스타벅스', at: [1075, 420], type: 'shop', w: 18, d: 14, h: 9 },
  { name: 'GS 주유소', at: [1120, 420], type: 'gas', w: 30, d: 22, h: 6, color: '#0072bc' },
  { name: '승현교회', at: [1210, 420], type: 'church', w: 34, d: 22, h: 14 },
  { name: '가톨릭대학교', at: [1230, 560], type: 'univ', w: 70, d: 24, h: 20 },
  { name: 'S-OIL 주유소', at: [1320, 340], type: 'gas', w: 28, d: 20, h: 6, color: '#f2b100' },
  { name: '소사구청', at: [1350, 290], type: 'showroom', w: 50, d: 24, h: 30 },
  { name: 'mj컨벤션', at: [1400, 340], type: 'showroom', w: 34, d: 22, h: 16 },
  { name: '소사지구대', at: [1440, 420], type: 'shop', w: 18, d: 14, h: 8 },
];

// 큰 교차로 앞 도로 이정표 [진입 노드, 도착 노드, 좌, 직진, 우]
export const GUIDE_SIGNS = [
  ['J3', 'V1U', '광명·천왕', '부천·역곡', '궁동'],
  ['SG', 'V1U', '궁동', '오류IC', '광명·천왕'],
  ['YH', 'V2U', '옥길동', '부천역', '역곡고가교'],
  ['UC', 'V2U', '역곡고가교', '오류IC', '옥길동'],
  ['NA', 'SX', '', '김포공항·오류IC', '시흥IC'],
  ['YG', 'SS', '범박동', '부천역', '성심고가교'],
];
