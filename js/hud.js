// 화면 표시: 안내, 계기판, 감점 기록, 미니맵, 결과창
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(net, route, railPts) {
    this.net = net;
    this.route = route;
    this.voice = true;
    this.big = false;
    this.railPts = railPts;
    this.buildMap(railPts);
    this.sigKey = null;
  }

  setRoute(route) {
    this.route = route;
    this.buildMap(this.railPts);
  }

  setLimit(limit) {
    if (this.limitShown !== limit) { this.limitShown = limit; $('limit').textContent = limit; }
  }

  // 전방 신호등: state = G/Y/R/L/GL, four = 좌회전 화살표 등 있음
  setSignal(state, four) {
    const key = state ? state + four : '';
    if (key === this.sigKey) return;
    this.sigKey = key;
    $('sig').hidden = !state;
    if (!state) return;
    $('sig-a').hidden = !four;
    $('sig-r').classList.toggle('on', state === 'R' || state === 'L');
    $('sig-y').classList.toggle('on', state === 'Y');
    $('sig-a').classList.toggle('on', state === 'L' || state === 'GL');
    $('sig-g').classList.toggle('on', state === 'G' || state === 'GL');
  }

  reset() {
    $('log').innerHTML = '';
    $('score').textContent = '100';
    $('dq').hidden = true;
    $('result').hidden = true;
    this.lastAnnounce = null;
  }

  flash(msg) {
    const el = document.createElement('div');
    el.className = 'pen';
    el.textContent = msg;
    $('log').prepend(el);
    while ($('log').children.length > 6) $('log').lastChild.remove();
    const f = $('toast');
    f.textContent = msg;
    f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
  }

  say(text) {
    if (!this.voice || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR'; u.rate = 1.05;
    speechSynthesis.speak(u);
  }

  announce(ins) {
    $('instr-title').textContent = ins.title;
    $('instr-sub').textContent = ins.sub;
    const box = $('instr');
    box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse');
    this.say(ins.title);
  }

  setNext(next, frac) {
    $('instr-next').textContent = next ? `다음 · ${next.title} (${Math.max(0, Math.round(next.dist))}m)` : '';
    $('progress').style.width = `${Math.min(100, frac * 100).toFixed(1)}%`;
  }

  showDQ(reason) {
    $('dq-reason').textContent = reason;
    $('dq').hidden = false;
    this.say(`실격. ${reason}`);
  }

  showResult(game) {
    const pass = !game.dq && game.score >= 70;
    $('result-title').textContent = game.dq ? '실격' : pass ? '합격' : '불합격';
    $('result-title').className = pass ? 'pass' : 'fail';
    const m = Math.floor(game.t / 60), s = Math.floor(game.t % 60);
    $('result-score').textContent = game.dq ? `사유: ${game.dq}` : `${game.score}점 (70점 이상 합격)`;
    $('result-time').textContent = `주행 시간 ${m}분 ${s}초 · 주행 거리 ${(game.odo / 1000).toFixed(2)}km`;
    $('result-log').innerHTML = game.log.length
      ? game.log.slice().reverse().map((l) => `<li>${l.reason}${l.pts ? ` <b>−${l.pts}</b>` : ''}</li>`).join('')
      : '<li>감점 없음</li>';
    $('result').hidden = false;
    this.say(pass ? '합격입니다' : game.dq ? '실격입니다' : '불합격입니다');
  }

  update(car, game) {
    $('speed').textContent = Math.round(car.kmh);
    $('speed').classList.toggle('over', car.kmh > (this.limitShown || 50) + 0.5);
    $('gear').textContent = car.gear;
    $('score').textContent = game.dq ? '실격' : String(game.score);
    const on = Math.floor(performance.now() / 400) % 2 === 0;
    $('blink-l').classList.toggle('on', car.blinker === -1 && on);
    $('blink-r').classList.toggle('on', car.blinker === 1 && on);
    this.drawMap(car);
  }

  // ---------------------------------------------------------- 미니맵 (안내도와 같은 방향: 위 = 남)
  buildMap(railPts) {
    const xs = [], zs = [];
    for (const n of Object.values(this.net.nodes)) { xs.push(n.x); zs.push(n.z); }
    this.bounds = { x0: Math.min(...xs) - 60, z0: Math.min(...zs) - 60, x1: Math.max(...xs) + 60, z1: Math.max(...zs) + 60 };
    const k = (this.scale = 0.5);
    const c = document.createElement('canvas');
    c.width = (this.bounds.x1 - this.bounds.x0) * k;
    c.height = (this.bounds.z1 - this.bounds.z0) * k;
    const g = c.getContext('2d');
    const X = (x) => (x - this.bounds.x0) * k, Z = (z) => (z - this.bounds.z0) * k;
    g.fillStyle = '#20252b'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#6c737c'; g.lineWidth = 5; g.setLineDash([10, 8]);
    g.beginPath(); railPts.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z)))); g.stroke();
    g.setLineDash([]);
    g.lineCap = 'round';
    for (const e of this.net.edges) {
      g.strokeStyle = '#5d646d'; g.lineWidth = Math.max(4, e.hw * 2 * k);
      g.beginPath(); g.moveTo(X(e.a.x), Z(e.a.z)); g.lineTo(X(e.b.x), Z(e.b.z)); g.stroke();
    }
    g.strokeStyle = '#3fa9ff'; g.lineWidth = 3; g.lineJoin = 'round';
    g.beginPath(); this.route.pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z)))); g.stroke();
    const flag = (p, color, label) => {
      g.fillStyle = color; g.beginPath(); g.arc(X(p.x), Z(p.z), 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = "bold 13px 'Malgun Gothic',sans-serif"; g.fillText(label, X(p.x) + 9, Z(p.z) - 8);
    };
    flag(this.route.start, '#e63946', '출발');
    flag(this.route.pts.at(-1), '#2a9d8f', '종료');
    this.mapCanvas = c;
    this.X = X; this.Z = Z;
  }

  drawMap(car) {
    const cv = this.big ? $('bigmap') : $('minimap');
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height, mc = this.mapCanvas;
    g.fillStyle = '#20252b'; g.fillRect(0, 0, W, H);
    let px, pz, s;
    if (this.big) {
      s = Math.min(W / mc.width, H / mc.height);
      const ox = (W - mc.width * s) / 2, oy = (H - mc.height * s) / 2;
      g.drawImage(mc, ox, oy, mc.width * s, mc.height * s);
      px = ox + this.X(car.x) * s; pz = oy + this.Z(car.z) * s;
    } else {
      s = 1;
      g.drawImage(mc, this.X(car.x) - W / 2, this.Z(car.z) - H / 2, W, H, 0, 0, W, H);
      px = W / 2; pz = H / 2;
    }
    g.save();
    g.translate(px, pz);
    g.rotate(-car.yaw + Math.PI);
    g.fillStyle = '#ffd60a'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
