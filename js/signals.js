// 신호 주기
// [시간(s), 주도로(동서) 신호, 교차도로 신호] — G 녹색, Y 황색, R 적색, L 적색+좌회전, GL 녹색+좌회전
// 방향이 바뀌는 사이에는 교차로를 비우는 전적색(2초)
const SIG_CYCLE = [[22, 'G', 'R'], [3, 'Y', 'R'], [10, 'L', 'R'], [3, 'Y', 'R'], [2, 'R', 'R'], [18, 'R', 'GL'], [3, 'R', 'Y'], [2, 'R', 'R']];
// 교차도로가 양쪽에서 들어오는 네거리: 교차도로도 주도로처럼 직진 → 좌회전을 나눈다
// (녹색+좌회전을 양쪽에 같이 주면 좌회전 차가 맞은편 직진 차와 마주침 — B코스 역곡고가교 4거리)
const SIG_CYCLE_SPLIT = [[22, 'G', 'R'], [3, 'Y', 'R'], [10, 'L', 'R'], [3, 'Y', 'R'], [2, 'R', 'R'], [12, 'R', 'G'], [3, 'R', 'Y'], [8, 'R', 'L'], [3, 'R', 'Y'], [2, 'R', 'R']];
const CW_CYCLE = [[28, 'G', 'G'], [3, 'Y', 'Y'], [22, 'R', 'R']];

const cycleOf = (node) => (node.kind === 'crosswalk' ? CW_CYCLE : node.sig.split ? SIG_CYCLE_SPLIT : SIG_CYCLE);
const total = (cyc) => cyc.reduce((s, p) => s + p[0], 0);

export function signalState(node, group, t) {
  const cyc = cycleOf(node);
  let x = (t + node.sig.offset) % total(cyc);
  for (const p of cyc) {
    if (x < p[0]) return group === 'main' ? p[1] : p[2];
    x -= p[0];
  }
  return 'R';
}

// 현재 신호가 유지되는 남은 시간(s)과 주기 번호
export function signalTiming(node, group, t) {
  const cyc = cycleOf(node), T = total(cyc), col = group === 'main' ? 1 : 2;
  const tt = t + node.sig.offset;
  let x = tt % T, i = 0;
  while (x >= cyc[i][0]) { x -= cyc[i][0]; i++; }
  const st = cyc[i][col];
  let rem = cyc[i][0] - x;
  for (let k = 1; k < cyc.length && cyc[(i + k) % cyc.length][col] === st; k++) rem += cyc[(i + k) % cyc.length][0];
  return { state: st, remaining: rem, cycle: Math.floor(tt / T) };
}

// 우회전 전용 신호 (화살표): 같은 방향 직진 녹색 동안 녹색, 그 뒤 황색 동안 황색, 나머지는 적색
export function rightArrowState(node, group, t) {
  const st = signalState(node, group, t);
  if (st === 'G' || st === 'GL') return 'G';
  if (st !== 'Y') return 'R';
  let k = 0.5;
  while (k < 6 && signalState(node, group, t - k) === 'Y') k += 0.5;
  const before = signalState(node, group, t - k);
  return before === 'G' || before === 'GL' ? 'Y' : 'R';
}

// 정지선을 넘을 때 신호에 따라 해당 진행이 허용되는지 (우회전·유턴은 신호와 무관, 황색은 진입 허용)
export function movementAllowed(state, mv) {
  if (mv === 'right' || mv === 'U' || state === 'Y') return true;
  if (mv === 'left') return state === 'L' || state === 'GL';
  return state === 'G' || state === 'GL';
}
