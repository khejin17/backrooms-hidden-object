// main.js — THE BACKROOMS 숨은그림 찾기 (Three.js)
import * as THREE from "three";
import { HandController } from "./hands.js";

// ============================================================
// 상수 & 월드 파라미터
// ============================================================
const COL_SPACING = 10;      // 기둥 격자 간격
const PILLAR_HALF = 1.15;    // 기둥 절반 폭
const CHUNK_CELLS = 4;       // 청크당 격자 셀 수
const CHUNK_SIZE = CHUNK_CELLS * COL_SPACING;
const VIEW_RADIUS = 2;       // 유지할 청크 반경
const WALL_H = 6.2;          // 천장 높이
const PLAYER_R = 0.55;
const EYE_H = 1.65;
const REACH = 5.2;           // 요소 선택 사거리
const AISLE_HALF = COL_SPACING / 2 - PILLAR_HALF; // 통로 반폭
const LIMIT = 100;           // 시작점 기준 사방 이동 제한(걸음)

// 찾아야 할 8가지 요소 (2번째 이미지 기준)
const KINDS = [
  { id: "light",   name: "Fluorescent Light", ic: "💡" },
  { id: "wall",    name: "Backrooms Wallpaper", ic: "🟨" },
  { id: "carpet",  name: "Damp Carpet",       ic: "🟫" },
  { id: "shelf",   name: "Metal Shelf",       ic: "🗄️" },
  { id: "chair",   name: "Office Chair",      ic: "🪑" },
  { id: "sign",    name: "Backrooms Sign",    ic: "⚠️" },
  { id: "cabinet", name: "File Cabinet",      ic: "🗃️" },
  { id: "door",    name: "Backrooms Door",    ic: "🚪" },
];
const KIND_IDS = KINDS.map((k) => k.id);

// ============================================================
// 유틸: 시드 난수
// ============================================================
function hash2(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// 텍스처 (캔버스 절차 생성)
// ============================================================
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
function wallpaperTexture() {
  const c = makeCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#c3b24e"; g.fillRect(0, 0, 256, 256);
  // 세로 줄무늬
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = x % 32 === 0 ? "rgba(150,132,45,.35)" : "rgba(210,196,110,.35)";
    g.fillRect(x, 0, 8, 256);
  }
  // 작은 다이아몬드 무늬
  g.fillStyle = "rgba(120,104,32,.4)";
  for (let y = 0; y < 256; y += 32)
    for (let x = 0; x < 256; x += 32) {
      const ox = (y / 32) % 2 ? 16 : 0;
      g.beginPath();
      g.moveTo(x + ox, y + 8); g.lineTo(x + ox + 6, y + 14);
      g.lineTo(x + ox, y + 20); g.lineTo(x + ox - 6, y + 14);
      g.closePath(); g.fill();
    }
  // 얼룩
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(90,76,20,${Math.random() * 0.06})`;
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 40, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function carpetTexture() {
  const c = makeCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#8f7f36"; g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 46;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.6;
  }
  g.putImageData(img, 0, 0);
  // 얼룩진 습기 자국
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(60,50,15,${0.05 + Math.random() * 0.08})`;
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 50, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function ceilingTexture() {
  const c = makeCanvas(128, 128), g = c.getContext("2d");
  g.fillStyle = "#b3a559"; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(70,60,20,.5)"; g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 124);
  g.strokeStyle = "rgba(70,60,20,.25)"; g.lineWidth = 1;
  g.strokeRect(20, 20, 88, 88);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function signTexture() {
  const c = makeCanvas(256, 320), g = c.getContext("2d");
  g.fillStyle = "#d8c23a"; g.fillRect(0, 0, 256, 320);
  g.strokeStyle = "#3a3208"; g.lineWidth = 10;
  g.strokeRect(10, 10, 236, 300);
  g.fillStyle = "#2a2405";
  g.font = "bold 40px 'Courier New', monospace";
  g.textAlign = "center";
  g.fillText("THE", 128, 70);
  g.fillText("BACKROOMS", 128, 118);
  // 위 화살표
  g.beginPath();
  g.moveTo(128, 150); g.lineTo(128, 235);
  g.lineWidth = 22; g.strokeStyle = "#2a2405"; g.stroke();
  g.beginPath();
  g.moveTo(128, 138); g.lineTo(96, 178); g.lineTo(160, 178);
  g.closePath(); g.fill();
  g.font = "bold 20px 'Courier New', monospace";
  g.fillText("KEEP MOVING", 128, 272);
  g.fillText("NO CLIPPING", 128, 298);
  return new THREE.CanvasTexture(c);
}

// ============================================================
// 렌더러 / 씬 / 카메라
// ============================================================
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const FOG = new THREE.Color(0x9c8a2e);
scene.background = FOG;
scene.fog = new THREE.Fog(FOG, 8, 46);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, EYE_H, 0);

// 조명
scene.add(new THREE.AmbientLight(0xd8c96a, 0.9));
const hemi = new THREE.HemisphereLight(0xf2e27a, 0x6b5d22, 0.7);
scene.add(hemi);
const playerLight = new THREE.PointLight(0xf2e27a, 0.6, 22, 1.5);
scene.add(playerLight);

// 공유 지오메트리 / 머티리얼
const texWall = wallpaperTexture();
const texCarpet = carpetTexture();
const texCeil = ceilingTexture();
const texSign = signTexture();

const pillarGeo = new THREE.BoxGeometry(PILLAR_HALF * 2, WALL_H, PILLAR_HALF * 2);
const pillarMat = new THREE.MeshStandardMaterial({ map: wallCopy(1, Math.round(WALL_H / 1.1)), roughness: 0.95 });
function wallCopy(rx, ry) {
  const t = texWall.clone(); t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  return t;
}

// ============================================================
// 청크 관리
// ============================================================
const chunks = new Map();               // key "cx,cz" -> {group, items:[]}
const activeItems = [];                 // 현재 씬에 있는 숨은 요소
const collected = new Set();            // 이미 주운 인스턴스 id
const foundKinds = new Set();           // 찾은 종류 id

function chunkKey(cx, cz) { return cx + "," + cz; }

function buildChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  if (chunks.has(key)) return;
  const group = new THREE.Group();
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;

  // 바닥
  const floorMat = new THREE.MeshStandardMaterial({ map: carpetCopy(), roughness: 1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ox + CHUNK_SIZE / 2, 0, oz + CHUNK_SIZE / 2);
  group.add(floor);

  // 천장
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilCopy(), roughness: 1, side: THREE.FrontSide });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(ox + CHUNK_SIZE / 2, WALL_H, oz + CHUNK_SIZE / 2);
  group.add(ceil);

  // 기둥 + 천장 조명
  const rng = mulberry32(hash2(cx, cz));
  for (let i = 0; i < CHUNK_CELLS; i++) {
    for (let j = 0; j < CHUNK_CELLS; j++) {
      const gx = ox + i * COL_SPACING + COL_SPACING / 2;
      const gz = oz + j * COL_SPACING + COL_SPACING / 2;
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(gx, WALL_H / 2, gz);
      group.add(pillar);

      // 천장 형광등 패널 (일부는 꺼짐)
      const lit = rng() > 0.25;
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(3.0, 3.0),
        new THREE.MeshBasicMaterial({ color: lit ? 0xfff4c0 : 0x6a5f28 })
      );
      panel.rotation.x = Math.PI / 2;
      panel.position.set(gx, WALL_H - 0.02, gz);
      panel.userData.flicker = lit && rng() > 0.82;
      panel.userData.baseLit = lit;
      group.add(panel);
    }
  }

  // 숨은 요소 배치 (청크당 최대 1개)
  const items = [];
  if (rng() > 0.35) {
    const kind = KIND_IDS[(rng() * KIND_IDS.length) | 0];
    // 통로 위치: 격자 셀 하나 골라 가운데 통로에 배치
    const ci = (rng() * CHUNK_CELLS) | 0;
    const cj = (rng() * CHUNK_CELLS) | 0;
    const px = ox + ci * COL_SPACING;                     // 기둥 경계(통로 중앙)
    const pz = oz + cj * COL_SPACING + COL_SPACING / 2;
    const item = buildItem(kind, px, pz, rng);
    const id = key + ":" + kind;
    item.userData = { kind, id, base: item.position.y, t: rng() * 6 };
    if (!collected.has(id)) {
      group.add(item);
      items.push(item);
      activeItems.push(item);
    }
  }

  scene.add(group);
  chunks.set(key, { group, items });
}
function carpetCopy() {
  const t = texCarpet.clone(); t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(CHUNK_CELLS * 2, CHUNK_CELLS * 2);
  return t;
}
function ceilCopy() {
  const t = texCeil.clone(); t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(CHUNK_CELLS, CHUNK_CELLS);
  return t;
}

function removeChunk(key) {
  const ch = chunks.get(key);
  if (!ch) return;
  for (const it of ch.items) {
    const idx = activeItems.indexOf(it);
    if (idx >= 0) activeItems.splice(idx, 1);
  }
  scene.remove(ch.group);
  ch.group.traverse((o) => {
    if (o.geometry && o.geometry !== pillarGeo) o.geometry.dispose();
  });
  chunks.delete(key);
}

// ============================================================
// 숨은 요소 3D 모델
// ============================================================
const matMetal = new THREE.MeshStandardMaterial({ color: 0x8a8472, roughness: 0.6, metalness: 0.5 });
const matDrawer = new THREE.MeshStandardMaterial({ color: 0xa39d7d, roughness: 0.7, metalness: 0.3 });
const matChair = new THREE.MeshStandardMaterial({ color: 0x7a6a3c, roughness: 0.9 });
const matDark = new THREE.MeshStandardMaterial({ color: 0x2b2409, roughness: 1 });
const matWood = new THREE.MeshStandardMaterial({ color: 0xb0a052, roughness: 0.85, map: wallCopy(1, 2) });

function buildItem(kind, x, z, rng) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rng() * Math.PI * 2;

  switch (kind) {
    case "shelf": {
      const w = 2, h = 2.2, d = 0.6;
      const bar = new THREE.BoxGeometry(0.08, h, 0.08);
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const post = new THREE.Mesh(bar, matMetal);
        post.position.set(sx * w / 2, h / 2, sz * d / 2);
        g.add(post);
      }
      for (const sy of [0.2, 0.9, 1.6, 2.15]) {
        const sh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), matMetal);
        sh.position.set(0, sy, 0); g.add(sh);
      }
      break;
    }
    case "chair": {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.6), matChair);
      seat.position.y = 0.55; g.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.12), matChair);
      back.position.set(0, 0.95, -0.26); g.add(back);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4), matDark);
      stem.position.y = 0.32; g.add(stem);
      const baseLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), matDark);
      for (let a = 0; a < 5; a++) {
        const leg = baseLeg.clone();
        leg.rotation.z = Math.PI / 2;
        leg.rotation.y = (a / 5) * Math.PI * 2;
        leg.position.set(Math.cos(a / 5 * 7) * 0.22, 0.08, Math.sin(a / 5 * 7) * 0.22);
        g.add(leg);
      }
      break;
    }
    case "cabinet": {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.7), matDrawer);
      body.position.y = 0.7; g.add(body);
      for (let d = 0; d < 4; d++) {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.03), matDark);
        handle.position.set(0, 0.28 + d * 0.34, 0.36); g.add(handle);
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.01), matDark);
        line.position.set(0, 0.12 + d * 0.34, 0.351); g.add(line);
      }
      break;
    }
    case "door": {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.4, 0.25), matWood);
      frame.position.y = 1.2; g.add(frame);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.15, 0.1), matChair);
      door.position.set(0, 1.12, 0.12); g.add(door);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), matMetal);
      knob.position.set(0.4, 1.1, 0.2); g.add(knob);
      break;
    }
    case "sign": {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5), matMetal);
      post.position.y = 0.75; g.add(post);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.12, 0.06),
        new THREE.MeshStandardMaterial({ map: texSign, roughness: 0.8 })
      );
      plate.position.y = 1.55; g.add(plate);
      break;
    }
    case "light": {
      // 바닥에 떨어진 형광등 기구
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.5), matMetal);
      box.position.y = 0.4; box.rotation.z = 0.25; g.add(box);
      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.08, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xfff4c0 })
      );
      tube.position.y = 0.47; tube.rotation.z = 0.25; g.add(tube);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), matDark);
      stand.position.y = 0.2; g.add(stand);
      break;
    }
    case "wall": {
      // 벗겨진 벽지 조각 (이젤에 세워진 패널)
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.5, 0.08),
        new THREE.MeshStandardMaterial({ map: wallCopy(1, 1.4), roughness: 0.95 })
      );
      panel.position.y = 1.0; panel.rotation.z = 0.04; g.add(panel);
      // 말려 벗겨진 모서리
      const curl = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.05), matWood);
      curl.position.set(0, 1.7, 0.06); curl.rotation.x = -0.6; g.add(curl);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), matDark);
      leg.position.set(0, 0.25, -0.2); leg.rotation.x = 0.3; g.add(leg);
      break;
    }
    case "carpet": {
      // 바닥의 짙게 젖은 카펫 얼룩 + 접힌 조각
      const stain = new THREE.Mesh(
        new THREE.CircleGeometry(1.1, 24),
        new THREE.MeshStandardMaterial({ color: 0x4a3f12, roughness: 1 })
      );
      stain.rotation.x = -Math.PI / 2; stain.position.y = 0.02; g.add(stain);
      const fold = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.12, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x6b5d24, roughness: 1 })
      );
      fold.position.set(0.3, 0.08, 0.2); fold.rotation.z = 0.12; g.add(fold);
      break;
    }
  }

  // 발견 강조용 헤일로 링
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.3, 1.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xf2e27a, transparent: true, opacity: 0, side: THREE.DoubleSide })
  );
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05;
  halo.name = "halo";
  g.add(halo);

  return g;
}

// ============================================================
// 청크 스트리밍
// ============================================================
let curCX = null, curCZ = null;
function updateChunks() {
  const cx = Math.floor(camera.position.x / CHUNK_SIZE);
  const cz = Math.floor(camera.position.z / CHUNK_SIZE);
  if (cx === curCX && cz === curCZ) return;
  curCX = cx; curCZ = cz;

  for (let i = -VIEW_RADIUS; i <= VIEW_RADIUS; i++)
    for (let j = -VIEW_RADIUS; j <= VIEW_RADIUS; j++)
      buildChunk(cx + i, cz + j);

  for (const key of [...chunks.keys()]) {
    const [kx, kz] = key.split(",").map(Number);
    if (Math.abs(kx - cx) > VIEW_RADIUS + 1 || Math.abs(kz - cz) > VIEW_RADIUS + 1)
      removeChunk(key);
  }
}

// ============================================================
// 충돌 (격자 기둥)
// ============================================================
function resolveCollision(px, pz) {
  // 가장 가까운 격자점(기둥 중심) 주변만 검사
  const gi = Math.round((px - COL_SPACING / 2) / COL_SPACING);
  const gj = Math.round((pz - COL_SPACING / 2) / COL_SPACING);
  for (let i = gi - 1; i <= gi + 1; i++)
    for (let j = gj - 1; j <= gj + 1; j++) {
      const cxp = i * COL_SPACING + COL_SPACING / 2;
      const czp = j * COL_SPACING + COL_SPACING / 2;
      const mind = PILLAR_HALF + PLAYER_R;
      const dx = px - cxp, dz = pz - czp;
      if (Math.abs(dx) < mind && Math.abs(dz) < mind) {
        // 밀어내기: 겹침이 작은 축으로
        const ox = mind - Math.abs(dx);
        const oz = mind - Math.abs(dz);
        if (ox < oz) px += Math.sign(dx || 1) * ox;
        else pz += Math.sign(dz || 1) * oz;
      }
    }
  return [px, pz];
}

// ============================================================
// 플레이어 컨트롤
// ============================================================
let yaw = 0, pitch = 0;
const keys = {};
const velocity = new THREE.Vector3();
addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "KeyE") trySelect(); });
addEventListener("keyup", (e) => { keys[e.code] = false; });

// 마우스 시점 (포인터 잠금)
canvas.addEventListener("click", () => {
  if (started && !document.pointerLockElement) canvas.requestPointerLock();
  else if (started) trySelect();
});
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === canvas) {
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = Math.max(-1.2, Math.min(1.2, pitch));
  }
});

// ============================================================
// 손동작
// ============================================================
const video = document.getElementById("webcam");
const handCanvas = document.getElementById("handCanvas");
const gestureLabel = document.getElementById("gestureLabel");
const camWrap = document.getElementById("camWrap");
const hands = new HandController(video, handCanvas);
hands.onGesture = (txt) => { gestureLabel.textContent = txt; };
hands.onSelect = () => trySelect();
let handsOn = false;

// ============================================================
// 선택 / 발견 로직
// ============================================================
let targeted = null;
const _fwd = new THREE.Vector3();
const _toObj = new THREE.Vector3();

function updateTarget() {
  camera.getWorldDirection(_fwd);
  let best = null, bestScore = -1;
  for (const it of activeItems) {
    if (collected.has(it.userData.id)) continue;
    _toObj.copy(it.position).sub(camera.position);
    const dist = _toObj.length();
    if (dist > REACH) continue;
    _toObj.normalize();
    const dot = _fwd.dot(_toObj);
    if (dot < 0.72) continue;           // 시야 정면 근처만
    const score = dot - dist * 0.02;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  // 헤일로 표시 갱신
  for (const it of activeItems) {
    const halo = it.getObjectByName("halo");
    if (halo) halo.material.opacity = (it === best) ? 0.85 : 0;
  }
  targeted = best;

  const hint = document.getElementById("promptHint");
  const ret = document.getElementById("reticle");
  if (best) {
    const k = KINDS.find((x) => x.id === best.userData.kind);
    hint.innerHTML = `<b>${k.name}</b> — SELECT`;
    hint.classList.add("show");
    ret.classList.add("active");
  } else {
    hint.classList.remove("show");
    ret.classList.remove("active");
  }
}

let selCooldown = 0;
function trySelect() {
  if (!started || selCooldown > 0 || !targeted) return;
  selCooldown = 0.5;
  const it = targeted;
  collected.add(it.userData.id);
  const halo = it.getObjectByName("halo");
  if (halo) halo.material.opacity = 0;
  it.visible = false;

  const k = it.userData.kind;
  const first = !foundKinds.has(k);
  foundKinds.add(k);
  const info = KINDS.find((x) => x.id === k);
  showToast(first ? `✔ FOUND: ${info.name}  (${foundKinds.size}/8)` : `${info.name} — already collected`);
  renderFoundList();
  if (foundKinds.size === KINDS.length) win();
}

// ============================================================
// HUD
// ============================================================
const foundListEl = document.getElementById("foundList");
function renderFoundList() {
  foundListEl.innerHTML = "";
  for (const k of KINDS) {
    const line = document.createElement("div");
    line.className = "line" + (foundKinds.has(k.id) ? " got" : "");
    line.textContent = k.name;
    foundListEl.appendChild(line);
  }
}
const toastEl = document.getElementById("toast");
let toastTimer = 0;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  toastTimer = 2.2;
}

// ============================================================
// 시작 / 승리 화면
// ============================================================
const startScreen = document.getElementById("startScreen");
const startGrid = document.getElementById("startGrid");
const winScreen = document.getElementById("winScreen");
let started = false;
let startTime = 0;

// 시작 화면 미리보기 그리드
for (const k of KINDS) {
  const cell = document.createElement("div");
  cell.className = "find-cell";
  cell.innerHTML = `<span class="ic">${k.ic}</span>${k.name}`;
  startGrid.appendChild(cell);
}
renderFoundList();

async function begin(withCam) {
  startScreen.style.display = "none";
  started = true;
  startTime = performance.now();
  if (withCam) {
    camWrap.classList.remove("cam-hidden");
    gestureLabel.textContent = "LOADING HAND TRACKING…";
    try {
      await hands.init();
      await hands.startCamera();
      handsOn = true;
      camWrap.classList.add("cam-active");
    } catch (e) {
      console.error(e);
      gestureLabel.textContent = "WEBCAM UNAVAILABLE — USE KEYBOARD";
      camWrap.classList.add("cam-idle");
    }
  } else {
    camWrap.classList.add("cam-hidden");
  }
}
document.getElementById("startBtn").addEventListener("click", () => begin(true));
document.getElementById("startNoCamBtn").addEventListener("click", () => begin(false));
document.getElementById("continueBtn").addEventListener("click", () => { winScreen.hidden = true; });

function win() {
  const secs = ((performance.now() - startTime) / 1000) | 0;
  document.getElementById("winStats").innerHTML =
    `Time: <b>${(secs / 60 | 0)}m ${secs % 60}s</b><br>Depth reached: <b>${Math.abs(camera.position.z).toFixed(0)} m</b>`;
  winScreen.hidden = false;
}

// ============================================================
// 메인 루프
// ============================================================
let last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (started) {
    if (handsOn) hands.tick();

    // ---- 이동 의도 결합 ----
    let mf = 0, ms = 0, turn = 0;
    if (keys["KeyW"] || keys["ArrowUp"]) mf += 1;
    if (keys["KeyS"] || keys["ArrowDown"]) mf -= 1;
    if (keys["KeyA"]) ms -= 1;
    if (keys["KeyD"]) ms += 1;
    if (keys["ArrowLeft"]) turn += 1;
    if (keys["ArrowRight"]) turn -= 1;

    if (handsOn && hands.active) {
      mf += hands.state.forward - hands.state.back;
      turn += hands.state.left - hands.state.right;
    }
    yaw += turn * 1.8 * dt;

    // 카메라 방향 벡터 (수평)
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    const speed = 4.2;
    const wishX = (-sinY * mf + cosY * ms) * speed;
    const wishZ = (-cosY * mf - sinY * ms) * speed;
    velocity.x += (wishX - velocity.x) * Math.min(1, dt * 10);
    velocity.z += (wishZ - velocity.z) * Math.min(1, dt * 10);

    let nx = camera.position.x + velocity.x * dt;
    let nz = camera.position.z + velocity.z * dt;
    [nx, nz] = resolveCollision(nx, nz);
    // 시작점 기준 사방 ±LIMIT 걸음으로 제한
    const B = LIMIT - PLAYER_R;
    if (nx > B) { nx = B; velocity.x = Math.min(0, velocity.x); }
    else if (nx < -B) { nx = -B; velocity.x = Math.max(0, velocity.x); }
    if (nz > B) { nz = B; velocity.z = Math.min(0, velocity.z); }
    else if (nz < -B) { nz = -B; velocity.z = Math.max(0, velocity.z); }
    camera.position.x = nx;
    camera.position.z = nz;

    // 미세한 걷기 흔들림
    const moving = Math.abs(mf) + Math.abs(ms) > 0.05;
    const bob = moving ? Math.sin(now * 0.009) * 0.035 : 0;
    camera.position.y = EYE_H + bob;

    camera.rotation.set(pitch, yaw, 0, "YXZ");
    playerLight.position.copy(camera.position);

    updateChunks();
    updateTarget();

    if (selCooldown > 0) selCooldown -= dt;
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove("show"); }

    // 요소 살짝 떠오르는 애니메이션 + 깊이 표시
    for (const it of activeItems) {
      if (!it.visible) continue;
      it.userData.t += dt;
      it.rotation.y += dt * 0.15;
    }
    const elapsed = Math.floor((now - startTime) / 1000);
    document.getElementById("depth").textContent =
      `TIME ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  }

  // 형광등 깜빡임
  flickerTime += dt;
  if (flickerTime > 0.08) {
    flickerTime = 0;
    scene.traverse((o) => {
      if (o.userData && o.userData.flicker) {
        o.material.color.setHex(Math.random() > 0.5 ? 0xfff4c0 : 0x5a4f20);
      }
    });
  }

  renderer.render(scene, camera);
}
let flickerTime = 0;

// 경계 벽 (시작점 기준 ±LIMIT) — 백룸 벽지로 마감
function buildBoundaryWalls() {
  const span = LIMIT * 2;
  const wallMat = new THREE.MeshStandardMaterial({
    map: (() => { const t = texWall.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(span / 3, WALL_H / 3); return t; })(),
    roughness: 0.95, side: THREE.DoubleSide,
  });
  const walls = [
    [new THREE.BoxGeometry(0.4, WALL_H, span), LIMIT, 0],
    [new THREE.BoxGeometry(0.4, WALL_H, span), -LIMIT, 0],
    [new THREE.BoxGeometry(span, WALL_H, 0.4), 0, LIMIT],
    [new THREE.BoxGeometry(span, WALL_H, 0.4), 0, -LIMIT],
  ];
  for (const [geo, x, z] of walls) {
    const w = new THREE.Mesh(geo, wallMat);
    w.position.set(x, WALL_H / 2, z);
    scene.add(w);
  }
}
buildBoundaryWalls();

// 초기 청크
updateChunks();
loop();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
