// hands.js — mediapipe/tasks-vision 손 추적 → 이동/선택 의도로 변환
import { FilesetResolver, HandLandmarker }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];

export class HandController {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.landmarker = null;
    this.lastVideoTime = -1;
    this.enabled = false;

    // 연속 이동 의도 (0..1)
    this.state = { forward: 0, back: 0, left: 0, right: 0 };
    this.active = false;          // 손이 인식되는 중인지
    this._selPrev = false;

    // 콜백
    this.onSelect = () => {};
    this.onGesture = () => {};
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
  }

  async startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    this.video.srcObject = stream;
    await new Promise((r) => (this.video.onloadedmetadata = r));
    await this.video.play();
    this.canvas.width = this.video.videoWidth || 640;
    this.canvas.height = this.video.videoHeight || 480;
    this.enabled = true;
  }

  // 매 프레임 호출
  tick() {
    if (!this.enabled || !this.landmarker || this.video.readyState < 2) return;
    const now = performance.now();
    if (this.video.currentTime === this.lastVideoTime) { this._draw(null); return; }
    this.lastVideoTime = this.video.currentTime;

    let res;
    try { res = this.landmarker.detectForVideo(this.video, now); }
    catch (e) { return; }

    const lm = res && res.landmarks && res.landmarks[0];
    this._reset();

    if (!lm) {
      this.active = false;
      this._selPrev = false;
      this.onGesture("SHOW YOUR HAND");
      this._draw(null);
      return;
    }

    this.active = true;

    // 손 중심 x (거울 보정) — 좌/우 회전용
    const cx = 1 - (lm[0].x + lm[9].x) / 2;
    // 손 크기(원근) — 카메라에 가까울수록 커짐 → 속도 조절용
    const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
    const handSize = (d(0, 9) + d(5, 17)) / 2;

    const labels = [];

    // 손가락별 접힘 상태 [검지, 중지, 약지, 새끼]
    const f = this._fingerFolded(lm);
    const cnt = f[0] + f[1] + f[2] + f[3];

    // 꼬집기(엄지4 + 검지8)
    const dx = lm[4].x - lm[8].x, dy = lm[4].y - lm[8].y, dz = (lm[4].z||0) - (lm[8].z||0);
    const pinch = Math.hypot(dx, dy, dz) < 0.055;
    // 가리키기: 검지만 펴고 나머지는 접힘
    const pointing = !f[0] && f[1] && f[2] && f[3];

    // 선택 = 꼬집기 또는 검지 가리키기 (상승 엣지)
    const selectNow = pinch || pointing;
    if (selectNow && !this._selPrev) this.onSelect();
    this._selPrev = selectNow;
    if (selectNow) {
      this.onGesture("● SELECT!");
      this._draw(lm, true);
      return;
    }

    // 손날(손 옆)을 보이면 → 정지
    //   손바닥 폭(5↔17)이 손 길이(0↔9)보다 크게 좁아지면 옆으로 세운 것
    const palmW = d(5, 17), palmL = d(0, 9);
    if (palmL > 0.02 && palmW / palmL < 0.30) {
      this.onGesture("✋ STOP");
      this._draw(lm, false);
      return;
    }

    // 이동 속도 = 손바닥 원근 (카메라 쪽으로 내밀면 커짐→빠르게, 빼면 작아짐→느리게)
    const spd = Math.max(0.12, Math.min(1, (handSize - 0.12) / 0.13));
    const pct = Math.round(spd * 100);
    const fist = f[0] && cnt >= 3;

    if (fist) {
      // 주먹 → 후진
      this.state.back = spd;
      labels.push(`✊ BACK ${pct}%`);
    } else if (cnt <= 1) {
      // 손을 폄 → 전진
      this.state.forward = spd;
      labels.push(`🖐 FORWARD ${pct}%`);
    }
    // 가로 → 좌/우 회전
    if (cx < 0.38) { this.state.left = this._ramp(0.38 - cx, 0.30); labels.push("◀ TURN L"); }
    else if (cx > 0.62) { this.state.right = this._ramp(cx - 0.62, 0.30); labels.push("▶ TURN R"); }

    this.onGesture(labels.length ? labels.join("  ") : "◎ IDLE");

    this._draw(lm, false, fist);
  }

  _ramp(v, span) { return Math.min(1, v / span); }
  _reset() { this.state.forward = this.state.back = this.state.left = this.state.right = 0; }

  // 손가락별 접힘 여부 [검지, 중지, 약지, 새끼]
  //   끝(tip)이 중간관절(pip)보다 손목에 가까우면 접힘(1), 아니면 폄(0)
  _fingerFolded(lm) {
    const wrist = lm[0];
    const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]];
    return fingers.map(([tip, pip]) =>
      d2(lm[tip], wrist) < d2(lm[pip], wrist) * 1.05 ? 1 : 0
    );
  }

  _draw(lm, pinch, fist) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!lm) return;
    const W = canvas.width, H = canvas.height;
    ctx.lineWidth = 3;
    ctx.strokeStyle = fist ? "rgba(240,120,90,.95)"
      : pinch ? "rgba(242,226,122,.95)" : "rgba(242,226,122,.55)";
    for (const [a, b] of CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(lm[a].x * W, lm[a].y * H);
      ctx.lineTo(lm[b].x * W, lm[b].y * H);
      ctx.stroke();
    }
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff7c8";
      ctx.fill();
    }
  }
}
