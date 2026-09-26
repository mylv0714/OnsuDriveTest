// 연습 차량: 단순 자전거 모델 물리 + 저폴리 모델 + 운전석/추적 시점
import * as THREE from 'three';
import { roadT } from './terrain.js';

const WHEELBASE = 2.7;
const HIT_R = 0.95; // 충돌 원 반지름 (차체 앞/가운데/뒤 3개)

function roofSignTex() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 80;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 80);
  g.fillStyle = '#1a4fa0'; g.font = "bold 44px 'Malgun Gothic',sans-serif";
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('연  습', 128, 42);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildMesh() {
  const car = new THREE.Group();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
  const paint = std(0xf2c417, { metalness: 0.3, roughness: 0.35 });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    car.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(1.8, 0.62, 4.5), paint, 0, 0.6, 0);
  add(new THREE.BoxGeometry(1.62, 0.66, 2.3), std(0x1d2830, { metalness: 0.4, roughness: 0.15 }), 0, 1.24, -0.28);
  add(new THREE.BoxGeometry(1.5, 0.05, 2.1), [paint, paint, paint, std(0x3a3d42), paint, paint], 0, 1.58, -0.23);
  const sign = add(new THREE.BoxGeometry(0.95, 0.3, 0.22), [std(0xffffff), std(0xffffff), std(0xffffff), std(0xffffff),
    new THREE.MeshStandardMaterial({ map: roofSignTex() }), new THREE.MeshStandardMaterial({ map: roofSignTex() })], 0, 1.76, -0.3);
  sign.castShadow = false;
  const tire = std(0x151515, { roughness: 0.9 });
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16).rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[0.82, 1.38], [-0.82, 1.38], [0.82, -1.38], [-0.82, -1.38]]) wheels.push(add(wheelGeo, tire, x, 0.33, z));
  // 전조등/후미등/방향지시등
  const lamp = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 });
  for (const x of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.4, 0.14, 0.05), lamp(0xffffee), x, 0.72, 2.26);
  const brake = lamp(0xcc1100);
  for (const x of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.42, 0.14, 0.05), brake, x, 0.74, -2.26);
  const blinkL = lamp(0xff8a00), blinkR = lamp(0xff8a00);
  // 로컬 +X가 차량 왼쪽
  for (const z of [2.24, -2.24]) {
    add(new THREE.BoxGeometry(0.16, 0.1, 0.06), blinkL, 0.82, 0.6, z);
    add(new THREE.BoxGeometry(0.16, 0.1, 0.06), blinkR, -0.82, 0.6, z);
  }
  // 실내: 대시보드 + 핸들 (운전석은 왼쪽)
  add(new THREE.BoxGeometry(1.6, 0.16, 0.5), std(0x2a2c2f, { roughness: 0.9 }), 0, 0.94, 1.05).castShadow = false;
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 8, 24), std(0x111111));
  wheel.position.set(0.37, 0.93, 0.62);
  wheel.rotation.x = -0.45;
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.02), std(0x222222));
  wheel.add(spoke);
  car.add(wheel);
  return { car, wheels, wheel, brake, blinkL, blinkR };
}

export class Car {
  constructor(scene) {
    const m = buildMesh();
    Object.assign(this, { mesh: m.car, wheelMeshes: m.wheels, steerWheel: m.wheel, brakeMat: m.brake, blinkMats: { L: m.blinkL, R: m.blinkR } });
    scene.add(this.mesh);
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0;
    this.v = 0; this.steer = 0; this.gear = 'D';
    this.blinker = 0; // -1 좌, +1 우
    this.blinkYaw0 = 0; this.blinkTurned = false;
    this.hit = false;
  }

  place(x, z, yaw, y = 0) {
    Object.assign(this, { x, z, yaw, y, v: 0, steer: 0, gear: 'N', blinker: 0 });
    this.ground = y;
    this.syncMesh(0);
  }

  get fwd() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  get kmh() { return Math.abs(this.v) * 3.6; }

  toggleBlinker(side) {
    this.blinker = this.blinker === side ? 0 : side;
    this.blinkYaw0 = this.yaw;
    this.blinkTurned = false;
  }

  // 기어는 언제든 바로 바뀐다 (주행 중 R로 바꾸면 구동력이 반대로 걸려 감속 후 후진)
  setGear(g) {
    this.gear = g;
  }

  // 노면 실제 높이 (고가 높이 + 지형 기복)
  surf(net, x, z) {
    return net.height(x, z, this.ground) + roadT(x, z);
  }

  // others: 다른 차량 OBB 목록 (부딪히면 hitCar)
  update(dt, input, net, colliders, others = []) {
    // 조향: 속도가 빠를수록 최대 조향각 감소
    const maxSteer = 0.6 / (1 + (this.v * this.v) / 300);
    const target = input.steer * maxSteer;
    const rate = input.steer === 0 ? 3.0 : 1.8;
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));

    const sgn = this.gear === 'R' ? -1 : 1;
    let a = 0;
    if (this.gear !== 'N') {
      const along = sgn * this.v; // 기어 방향 속도
      if (input.throttle > 0) a += sgn * 3.2 * input.throttle * Math.max(0, 1 - Math.max(0, along) / (this.gear === 'R' ? 5 : 33));
      else if (!input.brake && along < 1.8) a += sgn * 0.8; // 자동변속기 크리핑
    }
    // 경사: 오르막은 느려지고 내리막은 빨라진다 (N이나 브레이크를 떼면 굴러감)
    const f0 = this.fwd;
    const slope = (this.surf(net, this.x + f0.x * 1.35, this.z + f0.z * 1.35) - this.surf(net, this.x - f0.x * 1.35, this.z - f0.z * 1.35)) / 2.7;
    a -= 9.81 * slope;
    if (Math.abs(this.v) < 0.05 && this.gear === 'N' && Math.abs(9.81 * slope) < 0.15) { this.v = 0; a = 0; } // 완만하면 멈춰 있음
    a -= Math.sign(this.v) * (0.12 + 0.0009 * this.v * this.v);
    if (input.brake > 0) {
      const b = 7.5 * input.brake;
      if (Math.abs(this.v) <= b * dt) { this.v = 0; a = 0; } else a -= Math.sign(this.v) * b;
    }
    this.v += a * dt;

    const yaw = this.yaw - ((this.v * Math.tan(this.steer)) / WHEELBASE) * dt;
    const f = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const nx = this.x + f.x * this.v * dt, nz = this.z + f.z * this.v * dt;
    const h = net.height(nx, nz, this.ground);
    this.hit = false;
    this.hitCar = false;
    const carHit = this.collides(nx, nz, f, others, 0.9);
    if (Math.abs(h - this.ground) > 0.9 || carHit || this.collides(nx, nz, f, colliders)) {
      this.hit = Math.abs(this.v) > 0.5;
      this.hitCar = carHit;
      this.v = 0;
    } else {
      this.x = nx; this.z = nz; this.yaw = yaw; this.ground = h;
    }

    // 방향지시등 자동 복귀 (회전 후 핸들을 풀면 꺼짐)
    if (this.blinker) {
      let dy = this.yaw - this.blinkYaw0;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      if (Math.abs(dy) > 1.0) this.blinkTurned = true;
      if (this.blinkTurned && Math.abs(this.steer) < 0.05) this.blinker = 0;
    }
    this.syncMesh(dt, input, net);
  }

  collides(x, z, f, colliders, r = HIT_R) {
    for (const k of [-1.35, 0, 1.35]) {
      const px = x + f.x * k, pz = z + f.z * k;
      for (const c of colliders) {
        if (c.ymax !== undefined && this.ground > c.ymax) continue; // 고가 위에서는 아래 구조물 무시
        if (c.ymin !== undefined && this.ground < c.ymin) continue; // 교량 난간은 상판 위 차량만
        if (c.y !== undefined && Math.abs(c.y - this.ground) > 2) continue; // 다른 높이의 차량
        const dx = px - c.x, dz = pz - c.z;
        if (Math.abs(dx * c.ux + dz * c.uz) < c.hu + r && Math.abs(-dx * c.uz + dz * c.ux) < c.hr + r) return true;
      }
    }
    return false;
  }

  syncMesh(dt, input = { brake: 0 }, net = null) {
    this.y += (this.ground - this.y) * Math.min(1, dt * 12 || 1);
    this.mesh.position.set(this.x, this.y + roadT(this.x, this.z), this.z);
    let pitch = 0, roll = 0;
    if (net) {
      const f = this.fwd, l = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; // 차량 왼쪽
      pitch = (this.surf(net, this.x - f.x * 1.35, this.z - f.z * 1.35) - this.surf(net, this.x + f.x * 1.35, this.z + f.z * 1.35)) / 2.7;
      roll = (this.surf(net, this.x + l.x * 0.8, this.z + l.z * 0.8) - this.surf(net, this.x - l.x * 0.8, this.z - l.z * 0.8)) / 1.6;
    }
    this.mesh.rotation.set(pitch, this.yaw, roll, 'YXZ');
    for (let i = 0; i < 2; i++) this.wheelMeshes[i].rotation.y = -this.steer;
    this.steerWheel.rotation.z = this.steer * 6;
    this.brakeMat.emissiveIntensity = input.brake > 0 ? 1.6 : 0.25;
    const on = Math.floor(performance.now() / 400) % 2 === 0;
    this.blinkMats.L.emissiveIntensity = this.blinker === -1 && on ? 2 : 0.1;
    this.blinkMats.R.emissiveIntensity = this.blinker === 1 && on ? 2 : 0.1;
  }

  updateCamera(cam, mode) {
    const m = this.mesh;
    m.updateMatrixWorld();
    if (mode === 'driver') {
      cam.position.copy(m.localToWorld(new THREE.Vector3(0.37, 1.3, 0.1)));
      cam.lookAt(m.localToWorld(new THREE.Vector3(0.37, 1.1, 12)));
    } else {
      const f = this.fwd;
      const y = this.mesh.position.y;
      const want = new THREE.Vector3(this.x - f.x * 8, y + 3.4, this.z - f.z * 8);
      cam.position.lerp(want, 0.15);
      cam.lookAt(this.x + f.x * 4, y + 1.2, this.z + f.z * 4);
    }
  }

  updateMirror(cam) {
    const m = this.mesh;
    cam.position.copy(m.localToWorld(new THREE.Vector3(0, 1.3, 0.4)));
    cam.lookAt(m.localToWorld(new THREE.Vector3(0, 1.1, -20)));
  }
}
