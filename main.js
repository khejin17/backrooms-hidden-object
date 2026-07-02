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
// ---- 괴물 추격 파라미터 ----
const WARN_T = 35;           // 이 시각(초)부터 경고 표시
const SPAWN_T = 40;          // 이 시각(초)에 괴물 등장 & 추격 시작
const CATCH_DIST = 1.25;     // 이 거리 안으로 들어오면 잡힘(게임 오버)
const PLAYER_SPEED = 4.2;    // 플레이어 이동 속도
const MON_SPEED = PLAYER_SPEED * 0.90;  // 괴물 속도 = 플레이어의 90% (≈3.78) — 계속 달리면 따돌릴 수 있음
const HINT_T = 120;          // 2분까지 못 찾으면 첫 힌트 발동
const HINT_INTERVAL = 30;    // 첫 힌트 이후 30초마다 반복
const HINT_DUR = 7;          // 힌트(흰색 깜빡임 + 화살표) 지속 시간(초)

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
// 게임을 실행(로드)할 때마다 달라지는 세션 시드 → 매 판 숨은요소 배치가 랜덤
const SESSION_SEED = (Math.random() * 0x7fffffff) >>> 0;
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
  const rng = mulberry32((hash2(cx, cz) ^ SESSION_SEED) >>> 0);
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

  // 힌트용 흰색 발광 기둥(2분 힌트 때만 켜짐) — 안개 무시로 밝게 대비
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 5.4, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, fog: false,
    })
  );
  beacon.position.y = 2.7;
  beacon.name = "beacon";
  beacon.visible = false;
  g.add(beacon);

  return g;
}

// ============================================================
// 괴물(레퍼런스 이미지 기반) — 키 크고 검은 그림자 형상
// ============================================================
const matEntity = new THREE.MeshStandardMaterial({
  color: 0x080808, roughness: 1, metalness: 0,
  emissive: 0x120404, emissiveIntensity: 0.5,
});

// 관절 세그먼트 체인으로 만든 다리(촉수) — 관절마다 위상을 지연시켜 물결이 아래로 전파됨
function makeTentacle(phase) {
  const group = new THREE.Group();
  const SEGS = 7, SEG_LEN = 0.46;
  const joints = [];
  let parent = group;
  for (let i = 0; i < SEGS; i++) {
    const joint = new THREE.Group();
    joint.position.y = (i === 0) ? 0 : -SEG_LEN;      // 각 관절은 이전 세그먼트 끝(아래)에 연결
    const r0 = 0.05 * (1 - i / SEGS * 0.8);           // 위는 굵고 끝으로 갈수록 얇게
    const r1 = 0.05 * (1 - (i + 1) / SEGS * 0.8);
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.max(0.012, r1), Math.max(0.016, r0), SEG_LEN, 6),
      matEntity
    );
    seg.position.y = -SEG_LEN / 2;
    joint.add(seg);
    parent.add(joint);
    parent = joint;
    joints.push(joint);
  }
  group.userData = { joints, phase };
  return group;
}

// 검은 안개(연기) 스프라이트용 방사형 텍스처 — 중심 진한 검정 → 가장자리 투명
let _smokeTex = null;
function smokeTexture() {
  if (_smokeTex) return _smokeTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0.0, "rgba(0,0,0,0.95)");
  grd.addColorStop(0.45, "rgba(0,0,0,0.55)");
  grd.addColorStop(1.0, "rgba(0,0,0,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  _smokeTex = new THREE.CanvasTexture(c);
  return _smokeTex;
}

function buildMonster() {
  const g = new THREE.Group();
  const bodyH = 2.7;
  const headY = bodyH;

  // 중심 몸통(가는 척추) — 실루엣 유지
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, bodyH, 8), matEntity);
  spine.position.y = bodyH / 2; g.add(spine);

  // 머리 (모자 없이 작은 구체) — 눈이 뜬 자리를 자연스럽게
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), matEntity);
  head.position.y = headY + 0.05; head.scale.set(1, 1.15, 0.9); g.add(head);

  // 붉은 눈 두 개 (발광)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), eyeMat);
    eye.position.set(s * 0.075, headY + 0.07, 0.16);
    g.add(eye);
  }

  // ---- 머리 부분에서 시작해 바닥까지 늘어지며 물결치는 다리(촉수) ----
  const N = 9;
  const tentacles = [];
  for (let k = 0; k < N; k++) {
    const angle = (k / N) * Math.PI * 2;
    const aim = new THREE.Group();
    aim.position.set(0, headY - 0.12, 0);   // 머리 바로 아래에서 시작
    aim.rotation.y = angle;                  // 머리 주위로 방사형 분포
    const lean = 0.26 + (k % 3) * 0.06;      // 바깥으로 살짝 벌어져 늘어짐
    const tent = makeTentacle(k * 1.35);
    tent.rotation.x = lean;
    tent.userData.lean = lean;
    aim.add(tent);
    g.add(aim);
    tentacles.push(tent);
  }

  g.userData.tentacles = tentacles;
  g.userData.bodyH = bodyH;

  // ---- 검은 안개(연기) 아우라 — 발밑은 짙게 바닥을 가리고, 몸 1/3 높이까지만 피어오름 ----
  const smoke = [];
  const tex = smokeTexture();
  const half = bodyH / 3;   // 안개가 오르는 최대 높이 ≈ 몸의 1/3

  function addSmoke(base, y, opacity, bob, spread) {
    const mat = new THREE.SpriteMaterial({
      map: tex, color: 0x000000, transparent: true,
      opacity, depthWrite: false, fog: false,
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(base, base, 1);
    // 방사형으로 배치 — spread가 클수록 바닥 옆으로 넓게 퍼짐
    const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
    s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    s.userData = {
      base, bob,
      spin: (Math.random() - 0.5) * 0.4,
      pulse: 0.5 + Math.random() * 1.3,
      phase: Math.random() * Math.PI * 2,
      cx: s.position.x, cz: s.position.z, cy: s.position.y,
      maxY: half,
      radius: 0.25 + Math.random() * 0.4 + spread * 0.3,   // 드리프트 반경도 퍼짐에 비례
    };
    g.add(s);
    smoke.push(s);
  }

  // 바닥 안개: 넓고 낮고 짙게 + 옆으로 자연스럽게 퍼짐 → 발밑 바닥이 잘 안 보이도록
  for (let k = 0; k < 5; k++) addSmoke(3.4 + Math.random() * 1.8, 0.06 + Math.random() * 0.2, 0.62, 0.06, 1.5);
  // 몸통 안개: 1/3 높이까지만, 옅게 완만하게 피어오름
  for (let k = 0; k < 3; k++) addSmoke(1.4 + Math.random() * 0.8, 0.3 + Math.random() * (half - 0.3), 0.26, 0.12, 0.5);

  g.userData.smoke = smoke;

  g.visible = false;
  scene.add(g);
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

// ---- 추격 상태 ----
let gameOver = false;        // 잡혀서 종료
let gameWon = false;         // 8개 다 찾아 우승
let warned = false;          // 경고 배너 표시됨
let monster = null;          // 괴물 그룹
let monsterActive = false;   // 추격 중
let monsterSpawnTime = 0;    // 괴물 등장 시각(performance.now)
let hintEndsAt = 0;          // 현재 힌트 종료 시각(performance.now)
let hintWasOn = false;       // 힌트 진행 중 플래그
let nextHintAt = HINT_T;     // 다음 힌트 발동 시각(초) — 이후 HINT_INTERVAL마다 반복
const warningEl = document.getElementById("warning");
const dangerEl = document.getElementById("dangerVignette");
const chaseHudEl = document.getElementById("chaseHud");
const chaseDirEl = document.getElementById("chaseDir");
const chaseDistEl = document.getElementById("chaseDist");
// 바닥에 눕는 3D 힌트 화살표 (가장 가까운 미발견 요소 방향)
let hintArrow3D = null;
function buildHintArrow() {
  const s = new THREE.Shape();          // +y 방향을 가리키는 화살표 도형
  s.moveTo(-0.2, -0.75);
  s.lineTo(0.2, -0.75);
  s.lineTo(0.2, 0.15);
  s.lineTo(0.5, 0.15);
  s.lineTo(0, 0.85);
  s.lineTo(-0.5, 0.15);
  s.lineTo(-0.2, 0.15);
  s.closePath();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9,
    side: THREE.DoubleSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(s), mat);
  mesh.rotation.x = Math.PI / 2;        // 바닥에 눕힘: 도형 +y → 월드 +z
  mesh.scale.setScalar(1.3);
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.mat = mat;
  group.visible = false;
  group.renderOrder = 6;
  scene.add(group);
  return group;
}

// ---- 간단한 WebAudio 심장박동 / 드론 ----
const audio = {
  ctx: null, drone: null, gain: null, beatOn: false, beatTimer: 0,
  start() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0.0;
      this.gain.connect(this.ctx.destination);
      this.drone = this.ctx.createOscillator();
      this.drone.type = "sawtooth";
      this.drone.frequency.value = 42;
      const df = this.ctx.createGain(); df.gain.value = 0.06;
      this.drone.connect(df); df.connect(this.gain);
      this.drone.start();
    } catch (e) { /* 오디오 미지원 무시 */ }
  },
  // 근접도(0~1)에 따라 드론 세기 조절
  setTension(x) {
    if (!this.ctx) return;
    this.gain.gain.setTargetAtTime(0.02 + x * 0.5, this.ctx.currentTime, 0.2);
  },
  beat(intensity) {           // 심장박동 한 번
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * intensity, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.32);
  },
  roar() {                    // 등장 순간 굉음
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sawtooth"; o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 1.2);
  },
};

// 시작 화면 미리보기 그리드
for (const k of KINDS) {
  const cell = document.createElement("div");
  cell.className = "find-cell";
  cell.innerHTML = `<span class="ic">${k.ic}</span>${k.name}`;
  startGrid.appendChild(cell);
}
renderFoundList();

const introEl = document.getElementById("intro");
const introHintEl = document.getElementById("introHint");
const introContinueEl = document.getElementById("introContinue");
let usingCam = false;

// 배경 음악(업로드한 트랙) — 첫 클릭(사용자 제스처)에서 재생 시작
const bgmEl = document.getElementById("bgm");
function startBgm() {
  if (!bgmEl) return;
  bgmEl.volume = 0.45;
  const p = bgmEl.play();
  if (p && p.catch) p.catch(() => {});   // 자동재생 차단 시 조용히 무시
}

// 시작 → 인트로 시네마틱 재생(웹캠은 백그라운드에서 로딩)
function begin(withCam) {
  startScreen.style.display = "none";
  usingCam = withCam;
  startBgm();
  runIntro();
  if (withCam) {
    camWrap.classList.remove("cam-hidden");
    gestureLabel.textContent = "LOADING HAND TRACKING…";
    hands.init()
      .then(() => hands.startCamera())
      .then(() => { handsOn = true; camWrap.classList.add("cam-active"); })
      .catch((e) => {
        console.error(e);
        gestureLabel.textContent = "WEBCAM UNAVAILABLE — USE KEYBOARD";
        camWrap.classList.add("cam-idle");
      });
  } else {
    camWrap.classList.add("cam-hidden");
  }
}

// 검은 화면 인트로: 한 줄씩 떠오른 뒤 안내 + 진입 버튼
function runIntro() {
  introEl.hidden = false;
  const lines = introEl.querySelectorAll(".il");
  lines.forEach((el, i) => setTimeout(() => el.classList.add("show"), 700 + i * 2000));
  const afterLines = 700 + lines.length * 2000 + 400;
  setTimeout(() => {
    // 키보드 전용 플레이어에게 ESC 안내
    introHintEl.textContent = usingCam
      ? "Raise a hand to the webcam to move — or use W A S D."
      : "Click to look around · Press ESC anytime to free the cursor and stop.";
    introHintEl.classList.add("show");
    introContinueEl.classList.add("show");
  }, afterLines);
}

function actuallyStart() {
  introEl.hidden = true;
  started = true;
  startTime = performance.now();
  audio.start();
  if (!usingCam) {
    try {
      const p = canvas.requestPointerLock && canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});   // 사용자 제스처 없을 때 조용히 무시
    } catch (e) { /* noop */ }
    showToast("Press ESC to free the cursor and stop the game");
  }
}
introContinueEl.addEventListener("click", actuallyStart);

document.getElementById("startBtn").addEventListener("click", () => begin(true));
document.getElementById("startNoCamBtn").addEventListener("click", () => begin(false));
document.getElementById("continueBtn").addEventListener("click", () => { winScreen.hidden = true; });
document.getElementById("winHomeBtn").addEventListener("click", () => location.reload());
document.getElementById("retryBtn").addEventListener("click", () => location.reload());

function win() {
  if (gameWon || gameOver) return;
  gameWon = true;
  // 괴물 추격 종료 — 살아남아 8개 모두 발견
  endChase();
  const secs = ((performance.now() - startTime) / 1000) | 0;
  const chased = monsterSpawnTime > 0;
  document.getElementById("winStats").innerHTML =
    `Time: <b>${(secs / 60 | 0)}m ${secs % 60}s</b><br>Depth reached: <b>${Math.abs(camera.position.z).toFixed(0)} m</b>` +
    (chased ? `<br><span style="color:#f2e27a">You outran the entity and found them all!</span>` : "");
  winScreen.hidden = false;
}

// 추격 시각 효과/사운드 정리
function endChase() {
  monsterActive = false;
  if (monster) monster.visible = false;
  document.body.classList.remove("chased", "shake");
  dangerEl.style.opacity = 0;
  chaseHudEl.classList.remove("show");
  warningEl.classList.remove("show");
  audio.setTension(0);
}

// 괴물 등장: 플레이어 뒤편 먼 곳에 배치
function spawnMonster() {
  if (!monster) monster = buildMonster();
  monsterActive = true;
  monsterSpawnTime = performance.now();
  warningEl.classList.remove("show");
  document.body.classList.add("chased");
  chaseHudEl.classList.add("show");
  // 카메라가 보는 반대 방향 20m 지점
  camera.getWorldDirection(_fwd);
  const bx = camera.position.x - _fwd.x * 20;
  const bz = camera.position.z - _fwd.z * 20;
  monster.position.set(bx, 0, bz);
  monster.visible = true;
  audio.roar();
  showToast("⚠ IT FOUND YOU — RUN");
}

// 잡힘 → 게임 오버
function lose() {
  if (gameOver || gameWon) return;
  gameOver = true;
  endChase();
  if (document.pointerLockElement) document.exitPointerLock();
  const secs = ((performance.now() - startTime) / 1000) | 0;
  document.getElementById("loseStats").innerHTML =
    `Survived: <b>${(secs / 60 | 0)}m ${secs % 60}s</b><br>` +
    `Objects found: <b>${foundKinds.size}/8</b>`;
  document.getElementById("loseScreen").hidden = false;
}

const _mfwd = new THREE.Vector3();
// 매 프레임 괴물 추격 갱신
function updateMonster(dt, now) {
  const speed = MON_SPEED;

  // 플레이어를 향해 이동
  _mfwd.set(
    camera.position.x - monster.position.x,
    0,
    camera.position.z - monster.position.z
  );
  const dist = _mfwd.length();
  if (dist > 0.0001) _mfwd.multiplyScalar(1 / dist);

  let nx = monster.position.x + _mfwd.x * speed * dt;
  let nz = monster.position.z + _mfwd.z * speed * dt;
  [nx, nz] = resolveCollision(nx, nz);   // 기둥 회피(플레이어가 유리)
  monster.position.x = nx;
  monster.position.z = nz;

  // 플레이어를 바라보게 (좌우로 흔들리는 롤 모션은 제거)
  monster.rotation.y = Math.atan2(_mfwd.x, _mfwd.z);
  monster.rotation.z = 0;
  // 다리(촉수)들이 머리부터 아래로 진짜 물결치듯 출렁임 — 관절마다 위상 지연 → 파동 전파
  const wave = now * 0.009;
  for (const tent of monster.userData.tentacles) {
    const joints = tent.userData.joints;
    const ph = tent.userData.phase;
    const lean = tent.userData.lean;
    for (let i = 0; i < joints.length; i++) {
      const t = wave - i * 0.7 + ph;          // 관절 인덱스로 지연 → 아래로 흐르는 물결(S자 출렁임)
      const amp = 0.32 + i * 0.03;             // 끝으로 갈수록 크게 출렁
      joints[i].rotation.z = Math.sin(t) * amp;
      joints[i].rotation.x = (i === 0 ? lean * 0.2 : 0) + Math.cos(t * 0.9 + ph) * (amp * 0.7);
    }
  }
  // 검은 안개 아우라 — 천천히 회전·드리프트하며 크기 맥동
  if (monster.userData.smoke) {
    const ts = now * 0.001;
    for (const s of monster.userData.smoke) {
      const u = s.userData;
      const ang = ts * u.spin + u.phase;
      s.position.x = u.cx + Math.cos(ang) * u.radius;
      s.position.z = u.cz + Math.sin(ang) * u.radius;
      // 완만한 상하 유동 — 몸 절반(maxY)을 넘지 않도록 제한
      s.position.y = Math.min(u.maxY, u.cy + Math.abs(Math.sin(ts * 0.8 + u.phase)) * u.bob);
      const sc = u.base * (1 + Math.sin(ts * u.pulse + u.phase) * 0.12);
      s.scale.set(sc, sc, 1);
    }
  }
  // 아주 미세한 상하 부유(좌우 흔들림 아님)
  monster.position.y = Math.abs(Math.sin(now * 0.006)) * 0.07;

  // 근접도(0~1): 14m에서 0, 0m에서 1
  const prox = Math.max(0, Math.min(1, 1 - dist / 14));
  dangerEl.style.opacity = prox * 0.95;
  audio.setTension(prox);
  document.body.classList.toggle("shake", dist < 4);

  // 심장박동: 가까울수록 빠르게
  audio.beatTimer -= dt;
  if (audio.beatTimer <= 0) {
    audio.beat(0.4 + prox * 0.6);
    audio.beatTimer = 1.15 - prox * 0.75;   // 0.4s ~ 1.15s 간격
  }

  // 방향 지시기(카메라 기준 각도)
  camera.getWorldDirection(_fwd);
  const camAng = Math.atan2(_fwd.x, _fwd.z);
  const monAng = Math.atan2(monster.position.x - camera.position.x,
                            monster.position.z - camera.position.z);
  let rel = (monAng - camAng) * 180 / Math.PI;
  while (rel > 180) rel -= 360; while (rel < -180) rel += 360;
  chaseDirEl.style.transform = `rotate(${rel}deg)`;
  chaseDistEl.textContent = `${dist.toFixed(0)}m`;

  // 잡힘 판정
  if (dist < CATCH_DIST) lose();
}

// 힌트: 못 찾은 요소를 흰색 빛으로 7초간 깜빡이게 + 가장 가까운 요소 방향 화살표
// 첫 발동은 2분(HINT_T), 이후 HINT_INTERVAL(30초)마다 반복
function updateHint(now, elapsedSec) {
  if (!hintWasOn && elapsedSec >= nextHintAt && foundKinds.size < KINDS.length) {
    hintEndsAt = now + HINT_DUR * 1000;
    hintWasOn = true;
    nextHintAt += HINT_INTERVAL;                       // 다음 힌트 예약
    showToast("Hint — the remaining objects are glowing white");
  }
  if (!hintWasOn) return;

  if (now < hintEndsAt) {
    const blink = 0.5 + 0.5 * Math.sin(now * 0.018);   // 흰색 깜빡임
    let nearest = null, nd = Infinity;
    for (const it of activeItems) {
      const show = !collected.has(it.userData.id) && !foundKinds.has(it.userData.kind);
      const beacon = it.getObjectByName("beacon");
      const halo = it.getObjectByName("halo");
      if (beacon) { beacon.visible = show; if (show) beacon.material.opacity = 0.4 + blink * 0.5; }
      if (show && halo) { halo.material.color.setHex(0xffffff); halo.material.opacity = 0.4 + blink * 0.6; }
      if (show) {
        const d = it.position.distanceTo(camera.position);
        if (d < nd) { nd = d; nearest = it; }
      }
    }
    // 바닥 화살표 — 발밑 조금 앞 바닥에서 가장 가까운 미발견 요소 방향을 가리킴
    if (nearest) {
      if (!hintArrow3D) hintArrow3D = buildHintArrow();
      camera.getWorldDirection(_fwd);
      const fl = Math.hypot(_fwd.x, _fwd.z) || 1;      // 수평 전방 벡터
      hintArrow3D.position.set(
        camera.position.x + (_fwd.x / fl) * 1.8, 0.06,
        camera.position.z + (_fwd.z / fl) * 1.8
      );
      const dx = nearest.position.x - camera.position.x;
      const dz = nearest.position.z - camera.position.z;
      hintArrow3D.rotation.y = Math.atan2(dx, dz);      // 로컬 +z가 목표 방향을 향하도록
      hintArrow3D.userData.mat.opacity = 0.45 + blink * 0.55;
      hintArrow3D.visible = true;
    } else if (hintArrow3D) {
      hintArrow3D.visible = false;
    }
  } else {
    // 힌트 종료 — 원상복구
    hintWasOn = false;
    if (hintArrow3D) hintArrow3D.visible = false;
    for (const it of activeItems) {
      const beacon = it.getObjectByName("beacon");
      const halo = it.getObjectByName("halo");
      if (beacon) beacon.visible = false;
      if (halo) { halo.material.color.setHex(0xf2e27a); halo.material.opacity = 0; }
    }
  }
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

  if (started && !gameOver) {
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
    const speed = PLAYER_SPEED;
    const wishX = (-sinY * mf + cosY * ms) * speed;
    const wishZ = (-cosY * mf - sinY * ms) * speed;
    velocity.x += (wishX - velocity.x) * Math.min(1, dt * 10);
    velocity.z += (wishZ - velocity.z) * Math.min(1, dt * 10);

    let nx = camera.position.x + velocity.x * dt;
    let nz = camera.position.z + velocity.z * dt;
    [nx, nz] = resolveCollision(nx, nz);
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
    const elapsedSec = (now - startTime) / 1000;
    const elapsed = Math.floor(elapsedSec);
    document.getElementById("depth").textContent =
      `TIME ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

    // ---- 괴물 추격 상태 머신 ----
    if (!gameWon) {
      // 35초: 경고 표시
      if (!warned && elapsedSec >= WARN_T) {
        warned = true;
        warningEl.classList.add("show");
        showToast("⚠ Something is coming…");
      }
      // 40초: 등장 & 추격 시작
      if (!monsterActive && elapsedSec >= SPAWN_T) spawnMonster();
      // 추격 갱신
      if (monsterActive) updateMonster(dt, now);
      // 2분 힌트(못 찾은 요소 흰색 깜빡임)
      updateHint(now, elapsedSec);
    }
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

// 초기 청크
updateChunks();
loop();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
