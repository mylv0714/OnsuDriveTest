// 모바일 터치 조작: 왼쪽 아래 핸들(좌우 드래그), 오른쪽 아래 페달(브레이크·가속), 기어·방향지시등·기능 버튼
// 휴대폰·태블릿에서만 켜진다 (주소 뒤 ?touch=1 강제 켬, ?touch=0 강제 끔). PC 화면·조작은 그대로다.
const q = new URLSearchParams(location.search).get('touch');

// 주 입력이 손가락이거나 모바일 UA면 터치 모드. S펜 기기(갤럭시 울트라 등)는 '정밀 포인터'도 함께 보고하므로
// any-pointer로 거르면 안 된다. 터치스크린 노트북은 주 입력이 마우스(fine)라 PC 모드로 남는다.
export function detectTouch() {
  if (q !== null) return q !== '0';
  const ua = navigator.userAgent;
  return matchMedia('(pointer: coarse)').matches
    || /Android|iPhone|iPad|iPod|Mobile|SamsungBrowser/i.test(ua)
    || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)); // iPadOS는 데스크톱 UA를 쓴다
}

// 판별이 빗나가도(데스크톱 모드 등) 실제로 손가락 터치가 들어오면 그때 터치 모드로 전환
export function onFirstTouch(cb) {
  if (q === '0') return;
  const h = (e) => { if (e.pointerType !== 'touch') return; removeEventListener('pointerdown', h, true); cb(); };
  addEventListener('pointerdown', h, true);
}

const $ = (id) => document.getElementById(id);
const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* 이미 끝난 포인터 */ } };

export class TouchControls {
  // onAction(code): 키보드 단축키와 같은 코드('KeyD', 'Digit1' 등)를 넘긴다
  constructor(onAction) {
    this.throttle = 0; this.brake = 0; this.steer = 0;
    this.steerRate = 1.15; // 핸들이 꺾이는 속도 (PC 키보드 대비 15% 빠르게)
    document.body.classList.add('touch');
    $('touch-ui').hidden = false;
    // 브라우저 기본 동작(길게 눌러 메뉴, 두 번 탭 확대) 막기
    addEventListener('contextmenu', (e) => e.preventDefault());

    this.pedal($('pedal-brake'), 'brake');
    this.pedal($('pedal-gas'), 'throttle');
    this.wheel($('steer'));
    document.querySelectorAll('#touch-ui [data-act]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); onAction(b.dataset.act); });
    });
    $('bigmap-wrap').addEventListener('pointerdown', () => onAction('KeyM')); // 큰 지도는 탭하면 닫힘
    $('fullscreen').onclick = () => enterFullscreen();
  }

  // 누르는 동안 1, 떼면 0 (손가락이 밖으로 미끄러져도 뗄 때까지 유지)
  pedal(el, key) {
    const up = (e) => { if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId); this[key] = 0; el.classList.remove('on'); };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this[key] = 1; el.classList.add('on');
      capture(el, e.pointerId);
    });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // 핸들: 누른 곳에서 좌우로 끈 만큼 조향 (-1~1), 손을 떼면 가운데로 복귀
  wheel(el) {
    const img = el.querySelector('.wheel-img');
    let id = null, x0 = 0;
    const set = (v) => { this.steer = v; img.style.transform = `rotate(${v * 135}deg)`; };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId; x0 = e.clientX;
      capture(el, id);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      // 끝까지 꺾는 데 필요한 드래그 거리 (0.625 → 0.54: 감도 15% ↑). 핸들이 화면 왼쪽 끝에 붙어 있어
      // 가운데를 누르고 왼쪽으로 끌면 손가락이 화면 끝에 먼저 닿으므로, 남은 거리 안에서 끝까지 꺾이게 줄인다
      const dx = e.clientX - x0, room = dx < 0 ? x0 - 6 : innerWidth - x0 - 6;
      const range = Math.max(20, Math.min(el.clientWidth * 0.54, room));
      set(Math.max(-1, Math.min(1, dx / range)));
    });
    const up = (e) => { if (e.pointerId !== id) return; id = null; set(0); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // 현재 기어·방향지시등을 버튼에 표시
  sync(car) {
    document.querySelectorAll('#touch-ui [data-gear]').forEach((b) => b.classList.toggle('on', b.dataset.gear === car.gear));
    $('tb-l').classList.toggle('on', car.blinker === -1);
    $('tb-r').classList.toggle('on', car.blinker === 1);
  }
}

// 전체화면 + 가로 고정 (iOS Safari는 지원하지 않아 조용히 무시)
export function enterFullscreen() {
  const d = document.documentElement;
  if (!document.fullscreenElement && d.requestFullscreen) {
    d.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  }
}
