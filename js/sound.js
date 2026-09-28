// 엔진·주행 소리 (Web Audio 합성): 회전수에 따라 높아지는 엔진음 + 폭발 맥동 + 속도에 따른 타이어·노면 소음
// 브라우저 정책상 사용자 입력 안에서 만든 AudioContext를 start()로 넘겨받아 켠다
export class EngineSound {
  constructor() { this.ctx = null; this.on = true; }

  start(a) {
    if (this.ctx) return;
    this.ctx = a;
    this.master = a.createGain();
    this.master.gain.value = 0;
    this.master.connect(a.destination);

    // 엔진: 4기통 폭발 주파수(rpm/30)를 기본음으로, 반음·배음을 섞어 저역 필터로 둔하게
    this.lp = a.createBiquadFilter();
    this.lp.type = 'lowpass'; this.lp.frequency.value = 300; this.lp.Q.value = 0.4;
    // 부드러운 저음 강조 + 귀에 거슬리는 중고역(2~4kHz) 살짝 깎기
    this.warm = a.createBiquadFilter(); this.warm.type = 'lowshelf'; this.warm.frequency.value = 180; this.warm.gain.value = 5;
    this.soft = a.createBiquadFilter(); this.soft.type = 'peaking'; this.soft.frequency.value = 2800; this.soft.Q.value = 0.8; this.soft.gain.value = -8;
    this.pulse = a.createGain(); // 폭발 맥동 (진폭 변조)
    this.pulse.gain.value = 0.85;
    this.lp.connect(this.warm).connect(this.soft).connect(this.pulse).connect(this.master);
    const mk = (type, mul, gain) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = type; g.gain.value = gain;
      o.connect(g).connect(this.lp); o.start();
      return { o, mul };
    };
    // 낮은 사인파 울림 중심, 배음은 조금만 (날카로운 톱니파 비중을 줄여 듣기 편하게)
    this.osc = [mk('sine', 0.5, 0.55), mk('triangle', 1, 0.3), mk('sine', 1, 0.25), mk('sawtooth', 2, 0.035), mk('sine', 0.25, 0.35)];
    this.lfo = a.createOscillator();
    this.lfo.type = 'sine';
    const depth = a.createGain(); depth.gain.value = 0.12;
    this.lfo.connect(depth).connect(this.pulse.gain); this.lfo.start();

    // 타이어·노면 소음: 흰 잡음을 대역 필터로
    const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    this.road = a.createGain(); this.road.gain.value = 0;
    src.connect(bp).connect(this.road).connect(this.master); src.start();
  }

  // throttle: 0~1, active: 주행 중(일시정지·메뉴가 아님)
  update(car, throttle, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.06;
    const fire = car.rpm / 30; // 4기통: 한 바퀴에 두 번 폭발
    for (const { o, mul } of this.osc) o.frequency.setTargetAtTime(fire * mul, t, k);
    this.lfo.frequency.setTargetAtTime(fire / 2, t, k);
    this.lp.frequency.setTargetAtTime(220 + throttle * 650 + car.rpm * 0.09, t, 0.12);
    const vol = this.on && active ? 0.08 + throttle * 0.05 + Math.min(0.05, car.rpm / 90000) : 0;
    this.master.gain.setTargetAtTime(vol, t, 0.15);
    this.road.gain.setTargetAtTime(Math.min(0.9, Math.abs(car.v) / 16) * 0.28, t, 0.3);
  }
}
