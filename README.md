# DriveTassist — 온수 도로주행 연습

## https://onsudrivetest.vercel.app

<br>

- `js/map.js` — 안내도 픽셀 좌표로 옮긴 도로망·건물 데이터 (1px = 3m)
- `js/course.js` — 코스별 경로와 구간 안내
- `js/net.js` — 도로망 기하 (차로, 교차로, 입체교차 높이)
- `js/terrain.js` — 지형 (도로의 완만한 오르내림, 도로에서 떨어진 언덕·산)
- `js/world.js` — 도로·차선·신호등·건물·철도·고가차도·오류IC 등 3D 생성
- `js/signals.js` — 신호 주기 (좌회전 화살표, 전적색 포함)
- `js/traffic.js`, `js/peds.js` — 다른 차량, 보행자
- `js/game.js` — 진행·채점, `js/car.js` — 차량, `js/hud.js` — 화면 표시, `js/main.js` — 메인 루프
