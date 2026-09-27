// 지형 높이
// - roadT: 도로를 포함한 땅 전체의 완만한 오르내림 (경사 최대 약 3%) — 차량 물리/표시에 쓰인다
// - groundY: 도로·철길에서 떨어진 곳에만 솟는 언덕(석축/산비탈)을 더한 실제 땅 높이 — 건물·숲 배치에 쓰인다
// 게임 판정(차로/교차로/고가 높이)은 roadT를 뺀 평면 좌표 그대로 계산하고, 화면에 그릴 때만 roadT를 더한다.
import { HILLS, BUMPS, toWorld, S } from './map.js';

// 땅 자체가 솟은 완만한 언덕 (도로 포함) — 동곡초교 언덕, 소사구청 앞
const bumps = BUMPS.map(([px, py, r, h]) => ({ ...toWorld(px, py), r, h }));
export function bump(x, z) {
  let h = 0;
  for (const B of bumps) {
    const d = Math.hypot(x - B.x, z - B.z) / B.r;
    if (d < 1) { const t = 1 - d; h += B.h * t * t * (3 - 2 * t); }
  }
  return h;
}

export function roadT(x, z) {
  return bump(x, z) + (
    4.2 * Math.sin((x + 300) / 380) * Math.cos((z - 100) / 520) +
    2.6 * Math.sin((x * 0.7 - z * 0.5) / 230) +
    1.5 * Math.cos((x + z * 0.3) / 150)
  );
}

const hills = HILLS.map(([px, py, r, h]) => ({ ...toWorld(px, py), r: r * S, h }));

// 언덕 자체의 높이 (도로 영향 전)
export function hillRaw(x, z) {
  let h = 0;
  for (const H of hills) {
    const d = Math.hypot(x - H.x, z - H.z) / H.r;
    if (d < 1) { const t = 1 - d; h += H.h * t * t * (3 - 2 * t); }
  }
  return h;
}

export function makeTerrain(net, railDist) {
  // 도로·철길 옆: 보도 뒤로 최대 3m 석축, 그 뒤로는 약 30° 경사로 올라간다
  const cap = (x, z) => {
    const c = Math.min(net.roadClearance(x, z), railDist(x, z) - 11);
    if (c <= 5.5) return 0;
    return Math.min(3, (c - 5.5) * 1.5) + Math.max(0, c - 7.5) * 0.6;
  };
  const hill = (x, z) => {
    const h = hillRaw(x, z);
    return h > 0.01 ? Math.min(h, cap(x, z)) : 0;
  };
  return {
    roadT,
    hill,
    groundY: (x, z) => roadT(x, z) + hill(x, z),
    hills,
  };
}
