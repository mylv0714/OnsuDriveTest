import * as THREE from 'three';
import { Net } from './net.js';
import { buildWorld } from './world.js';
import { Car } from './car.js';
import { buildRoute, COURSES } from './course.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { RAIL, toWorld } from './map.js';
import { EngineSound } from './sound.js';
import { detectTouch, onFirstTouch, TouchControls, enterFullscreen } from './touch.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- 렌더러/장면
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcdd8e2, 350, 5200);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 9000);

scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x6f6a5e, 1.1));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 400 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(-0.45, 0.8, 0.35).normalize();

// ---------------------------------------------------------------- 월드/차량/게임
const net = new Net();
const world = buildWorld(scene, net);
const routes = {};
const routeOf = (id) => (routes[id] ||= buildRoute(net, COURSES[id]));
const car = new Car(scene);
const hud = new Hud(net, routeOf('A'), RAIL.map(([x, y]) => toWorld(x, y)));
const traffic = new Traffic(scene, net);
const peds = new Peds(scene, net);
const game = new Game({ net, route: routeOf('A'), car, signals: world.signals, hud, traffic, peds });

// ---------------------------------------------------------------- 룸미러
const MIRROR = { w: 360, h: 90 };
const mirrorRT = new THREE.WebGLRenderTarget(512, 128);
const mirrorCam = new THREE.PerspectiveCamera(20, MIRROR.w / MIRROR.h, 0.5, 1500);
const hudScene = new THREE.Scene();
const hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
const mirrorGeo = new THREE.PlaneGeometry(MIRROR.w, MIRROR.h);
const muv = mirrorGeo.attributes.uv;
for (let i = 0; i < muv.count; i++) muv.setX(i, 1 - muv.getX(i)); // 좌우 반전
const mirror = new THREE.Mesh(mirrorGeo, new THREE.MeshBasicMaterial({ map: mirrorRT.texture, toneMapped: false, depthTest: false }));
hudScene.add(mirror);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  Object.assign(hudCam, { right: innerWidth, top: innerHeight });
  hudCam.updateProjectionMatrix();
  const ms = touch ? 0.6 : 1; // 모바일은 작은 화면에 맞춰 룸미러 축소 (216×54)
  mirror.scale.setScalar(ms);
  mirror.position.set(innerWidth / 2, innerHeight - (touch ? 8 : 14) - (MIRROR.h * ms) / 2, 0);
  const bm = $('bigmap');
  bm.width = Math.min(innerWidth - (touch ? 40 : 80), 1400); bm.height = Math.min(innerHeight - (touch ? 40 : 120), 800);
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- 입력
const keys = new Set();
let running = false, camMode = 'chase'; // 기본은 차 전체가 보이는 3인칭 (C로 운전석 전환)
const blinkAudio = { ctx: null, phase: -1 };
function tick() {
  if (!blinkAudio.ctx) blinkAudio.ctx = new AudioContext();
  const a = blinkAudio.ctx, o = a.createOscillator(), g = a.createGain();
  o.type = 'square'; o.frequency.value = 1800;
  g.gain.setValueAtTime(0.05, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.03);
  o.connect(g).connect(a.destination);
  o.start(); o.stop(a.currentTime + 0.04);
}

// 조작: ←→ 핸들, E 가속, W 브레이크, D·R·N 기어, 1·2 방향지시등
const engine = new EngineSound();
addEventListener('pointerdown', () => engine.start());
addEventListener('keydown', (e) => {
  engine.start();
  if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  action(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// 키보드 단축키와 모바일 버튼이 같이 쓰는 기능
function action(code) {
  if (!running) return;
  switch (code) {
    case 'Digit1': case 'Numpad1': car.toggleBlinker(-1); break;
    case 'Digit2': case 'Numpad2': car.toggleBlinker(1); break;
    case 'KeyD': car.setGear('D'); break;
    case 'KeyR': car.setGear('R'); break;
    case 'KeyN': car.setGear('N'); break;
    case 'KeyC': camMode = camMode === 'driver' ? 'chase' : 'driver'; $('mirror-frame').hidden = camMode !== 'driver'; break;
    case 'KeyM': hud.big = !hud.big; $('bigmap-wrap').hidden = !hud.big; break;
    case 'KeyT': game.toCheckpoint(); break;
    case 'KeyV': hud.voice = !hud.voice; hud.flash(hud.voice ? '음성 안내 켬' : '음성 안내 끔'); break;
    case 'KeyX': engine.on = !engine.on; hud.flash(engine.on ? '엔진 소리 켬' : '엔진 소리 끔'); break;
    case 'Menu': showMenu(); break;
  }
}

// 모바일 터치 모드: 처음부터 판별되면 바로, 아니면 첫 손가락 터치 때 켠다
let touch = null;
function enableTouch() {
  if (touch) return;
  touch = new TouchControls(action);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // 해상도·그림자 품질을 낮춰 프레임 확보
  sun.shadow.mapSize.set(1024, 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  resize();
}
if (detectTouch()) enableTouch(); else onFirstTouch(enableTouch);
resize();

function readInput() {
  const keySteer = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  return {
    throttle: Math.max(keys.has('KeyE') ? 1 : 0, touch ? touch.throttle : 0),
    brake: Math.max(keys.has('KeyW') ? 1 : 0, touch ? touch.brake : 0),
    steer: keySteer || (touch ? touch.steer : 0),
  };
}

// ---------------------------------------------------------------- 화면 버튼
function startCourse(id) {
  const route = routeOf(id);
  hud.setRoute(route);
  game.setRoute(route);
  $('start').hidden = true;
  $('dq').hidden = true;
  $('result').hidden = true;
  $('course-name').textContent = `${id}코스`;
  running = true;
  if (touch) enterFullscreen();
}
function showMenu() {
  running = false;
  if (touch) { hud.big = false; $('bigmap-wrap').hidden = true; }
  $('dq').hidden = true;
  $('result').hidden = true;
  $('start').hidden = false;
}
$('courses').innerHTML = Object.entries(COURSES).map(([id, c]) => `
  <div class="course"><h3>${id}코스</h3>
    <table><tr><th>좌·U턴</th><th>우회전</th><th>직진</th><th>차로변경</th><th>거리</th></tr>
    <tr>${c.legend.map((v, i) => `<td>${v}${i === 4 ? 'km' : '회'}</td>`).join('')}</tr></table>
    <ol>${c.summary.map((x) => `<li>${x}</li>`).join('')}</ol>
    <button data-course="${id}">${id}코스 주행</button></div>`).join('');
document.querySelectorAll('[data-course]').forEach((b) => { b.onclick = () => startCourse(b.dataset.course); });
$('dq-continue').onclick = () => { $('dq').hidden = true; };
$('dq-restart').onclick = () => { game.reset(); };
$('dq-menu').onclick = showMenu;
$('result-restart').onclick = () => { game.reset(); };
$('result-menu').onclick = showMenu;

// ---------------------------------------------------------------- 루프
const clock = new THREE.Clock();
const idle = { throttle: 0, brake: 0, steer: 0 };
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const paused = !running || !$('dq').hidden;
  let input = idle;
  if (!paused) {
    input = game.finished ? { ...idle, brake: 1 } : readInput();
    car.update(dt, input, net, world.colliders, traffic.obbs());
    game.update(dt);
  }
  // 방향지시등 소리
  const ph = car.blinker ? Math.floor(performance.now() / 400) % 2 : -1;
  if (ph !== blinkAudio.phase && ph >= 0 && running) tick();
  blinkAudio.phase = ph;

  car.updateCamera(camera, camMode);
  engine.update(car, input.throttle, !paused);
  sun.position.set(car.x + SUN_DIR.x * 200, SUN_DIR.y * 200, car.z + SUN_DIR.z * 200);
  sun.target.position.set(car.x, 0, car.z);
  world.sky.position.copy(camera.position);

  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  if (camMode === 'driver') {
    car.updateMirror(mirrorCam);
    renderer.setRenderTarget(mirrorRT);
    renderer.render(scene, mirrorCam);
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(hudScene, hudCam);
    renderer.autoClear = true;
  }
  hud.update(car, game);
  if (touch) touch.sync(car);
}
frame();
window.__ready = true; // index.html 로딩 오류 표시용
