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

// 오류IC (경인로 × 남부순환로 입체교차) — 남부순환로가 경인로와 철길 위를 고가로 넘는다
const IX = (-40 - OX) * S, IZ = -210;
const IC = {
  D1: W(IX - 110, IZ), D2: W(IX - 70, IZ),
  R1a: W(IX - 110, -400), R1b: W(IX - 102.7, -417.7), R1c: W(IX - 85, -425), M1: W(IX, -425),
  NRS: W(IX, -950), M2: W(IX, -150), NRN: W(IX, 700),
  K1: W(IX - 45, -150), K2: W(IX - 62.7, -157.3), K3: W(IX - 70, -175),
};
// 노드(교차로) 노면 높이: 오류철도고가 3거리(J3)는 철길 위 고가 교차로
export const NODE_H = { M2: 7.5, K1: 4.4, K2: 2.7, K3: 1, J3: 7.5 };

export const NODES = {
  // 위쪽 큰길 경인로 (y=380)
  W0: [-170, 380], ...IC, NA: [90, 380], NB: [160, 380], J3: [272, 380], V1U: [436, 380],
  SG: [535, 380], YH: [648, 380], V2U: [786, 380], UT: [885, 380], YG: [989, 380], UTn: [860, 250], UTs: [912, 450],
  SS: [1173, 380], SC: [1372, 380], UT2: [1410, 380], E0: [1560, 380],
  // 아래쪽 온수역 앞 도로 (y=520)
  JB: [383, 520], V1L: [436, 520], CW1: [554, 520], CW2: [632, 520], AC: [652, 520],
  V2L: [786, 520], LE: [1070, 520],
  // 갈림길 끝점
  OR: [90, 335], NBn: [160, 348], NBs: [160, 432], V1n: [436, 150], V1s: [436, 760],
  YHn: [648, 150], V2n: [786, 150], V2s: [786, 760], SGs: [590, 452], JBs: [330, 600], ACs: [652, 650],
  YGn: [989, 170], YGs: [989, 440], SSn: [1173, 170], SSs: [1173, 620], SCn: [1372, 170],
};

export const SIGNAL_NODES = ['NB', 'J3', 'V1U', 'YH', 'V2U', 'UT', 'V1L', 'V2L', 'YG', 'SS', 'SC'];
export const CROSSWALK_NODES = ['CW1', 'CW2', 'UT2']; // 단일로 신호 횡단보도
// 우회전 신호가 24시간 적색인 진입로 [출발 노드, 교차로] — 정지선에서 반드시 일시정지 후 우회전
// (영상 확인: 오류철도고가 3거리, 철도고가차도 쪽에서 우회전)
export const RIGHT_STOP = [['JB', 'J3']];

// [a, b, 도로종류, 옵션]
// pocketA/pocketB: a/b 쪽으로 가는 차로의 좌회전(유턴) 전용차로 길이(m), uturn: 유턴이 허용되는 쪽('a'|'b')
// profile: [a로부터 거리, 높이] — 철도/도로를 넘는 고가 구간 (linear: 직선 경사)
// merge: 연결로가 합류하는 구간 — 본선 통과 차량은 바깥 차로를 비워 둔다
// medianStyle: 중앙분리대 형태 fence(황흑 기둥 펜스) | planted(화단) | guardrail(가드레일) — 영상 확인
// centerPosts: 중앙선 위 시선유도봉 posts(황흑) | bollard(주황 규제봉)
// uturnPlate: 유턴 표지 보조판 — '보행신호시'면 보행 신호(차량 적색)일 때만 유턴
export const EDGES = [
  ['W0', 'D1', 'arterial', { merge: true }], ['D1', 'D2', 'arterial', { merge: true }], ['D2', 'NA', 'arterial', { merge: true }],
  ['NA', 'NB', 'arterial'],
  // 오류철도고가: 경인로가 3거리(J3) 부근에서 철길 위로 올라간다
  ['NB', 'J3', 'arterial', { pocketA: 80, uturn: 'a', uturnPlate: '보행신호시', name: '오류철도고가', profile: [[0, 0], [130, 0], [300, 7.5], [336, 7.5]] }],
  ['J3', 'V1U', 'arterial', { pocketA: 90, name: '오류철도고가', profile: [[0, 7.5], [40, 7.5], [230, 0]] }],
  ['V1U', 'SG', 'arterial'], ['SG', 'YH', 'arterial'], ['YH', 'V2U', 'arterial', { medianStyle: 'planted' }],
  ['V2U', 'UT', 'arterial', { pocketA: 70, pocketB: 80, uturn: 'b', uturnPlate: '보행신호시', medianStyle: 'planted' }],
  ['UT', 'YG', 'arterial', { bus: true, medianStyle: 'planted' }], ['YG', 'SS', 'arterial', { bus: true, medianStyle: 'guardrail' }],
  ['SS', 'SC', 'arterial', { bus: true, medianStyle: 'guardrail' }],
  ['SC', 'UT2', 'arterial', { pocketB: 70, uturn: 'b', uturnPlate: '보행신호시', bus: true, medianStyle: 'guardrail' }],
  ['UT2', 'E0', 'arterial', { bus: true, medianStyle: 'guardrail' }],

  // 철도고가차도: 3거리(고가)에서 철길 옆을 따라 온수역 앞 도로로 내려간다
  ['J3', 'JB', 'urban', { name: '오류철도고가차도', centerPosts: 'bollard', profile: [[0, 7.5], [40, 7.5], [280, 0]] }],
  ['V2U', 'V2L', 'urban', { name: '역곡고가교', profile: [[0, 0], [25, 0], [180, 8.5], [300, 8.5], [400, 0]] }],
  ['SS', 'SSs', 'urban', { name: '성심고가교', profile: [[0, 0], [25, 0], [180, 8.5], [330, 8.5], [480, 0]] }],
  ['UT', 'UTn', 'urban'], ['UT', 'UTs', 'local'],

  ['JB', 'V1L', 'urban', { centerPosts: 'posts' }], ['V1L', 'CW1', 'urban', { centerPosts: 'posts' }],
  ['CW1', 'CW2', 'urban', { centerPosts: 'posts' }], ['CW2', 'AC', 'urban', { centerPosts: 'posts' }],
  ['AC', 'V2L', 'urban'], ['V2L', 'LE', 'urban'],

  ['NA', 'OR', 'local'], ['NB', 'NBn', 'urban'], ['NB', 'NBs', 'local'],
  ['V1U', 'V1n', 'underpass'], ['V1L', 'V1s', 'underpass'],
  ['YH', 'YHn', 'urban'], ['V2U', 'V2n', 'urban'], ['V2L', 'V2s', 'urban'],
  ['SG', 'SGs', 'local'], ['JB', 'JBs', 'urban'], ['AC', 'ACs', 'local'],
  ['YG', 'YGn', 'urban'], ['YG', 'YGs', 'local'], ['SS', 'SSn', 'urban'], ['SC', 'SCn', 'urban'],

  // 오류IC: 남부순환로 + 연결로
  ['NRS', 'M1', 'arterial', { merge: true, name: '남부순환로', profile: [[0, 0], [250, 0], [335, 7.5], [415, 7.5], [480, 0]] }],
  ['M1', 'M2', 'arterial', { merge: true, name: '남부순환로', profile: [[0, 0], [40, 0], [145, 7.5]] }],
  ['M2', 'NRN', 'arterial', { name: '남부순환로', profile: [[0, 7.5], [190, 7.5], [300, 0]] }],
  ['D1', 'R1a', 'ramp'], ['R1a', 'R1b', 'ramp'], ['R1b', 'R1c', 'ramp'], ['R1c', 'M1', 'ramp'],
  ['M2', 'K1', 'ramp', { profile: [[0, 7.5], [15, 7.5], [45, 4.4]], linear: true }],
  ['K1', 'K2', 'ramp', { profile: [[0, 4.4], [19.1, 2.7]], linear: true }],
  ['K2', 'K3', 'ramp', { profile: [[0, 2.7], [19.1, 1]], linear: true }],
  ['K3', 'D2', 'ramp', { profile: [[0, 1], [22, 0]], linear: true }],
];

// 경인선(1호선) 철길 — 영상 확인: 온수역 앞 도로 북쪽에 방음벽이 바로 붙어 가다가, 철도고가차도 동쪽을 따라
// 오류철도고가 3거리(경인로 고가) 밑을 지나 오류동역으로 간다
export const RAIL = [[-400, 200], [-60, 250], [90, 312], [277.7, 375.5], [386.5, 512.7], [650, 512.7], [730, 500], [800, 468], [1750, 468]];
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
  { edge: ['SG', 'YH'], x: [560, 605], limit: 30 }, // 오정초 (영상: 어린이보호구역 30)
  { edge: ['CW1', 'CW2'], x: [560, 600], limit: 50 },
  { edge: ['AC', 'V2L'], x: [700, 786], limit: 30 }, // 동곡초교
  { edge: ['V2U', 'V2L'], all: true, limit: 30, paint: false }, // 역곡고가교 (영상: 30)
];
// 언덕 [안내도 x, y, 반지름(px), 높이(m)] — 도로·철길에서 떨어진 땅만 솟는다 (영상: 출발지 남쪽 석축 언덕,
// 육교 부근 경인로 북쪽 산비탈, 오류IC 옆 암벽 산)
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
  { name: '타이어뱅크', at: [1120, 340], type: 'garage', w: 24, d: 16, h: 7 },
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
  ['UT', 'V2U', '역곡고가교', '오류IC', '옥길동'],
  ['NA', 'D2', '', '구로·개봉', '오류IC 남부순환로'],
  ['YG', 'SS', '범박동', '부천역', '성심고가교'],
];
