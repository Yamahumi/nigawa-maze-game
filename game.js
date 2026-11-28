(() => {
  "use strict";

  const LIVES0 = 5;
  const PLAYER_SPEED = 5.1;
  const ENEMY_SPEED = { chase: 2.20, ambush: 2.09, random: 1.84, patrol: 1.98, fright: 1.40, eyes: 7.2 };
  const POWER_SECS = 11;
  const GRACE_SECS = 2.4;
  const EAT_POINTS = [200, 400, 800, 1600];
  const LANDMARK_BONUS_DEFAULT = 500;

  const DIRS = {
    left: { x: -1, y: 0, name: "left" },
    right: { x: 1, y: 0, name: "right" },
    up: { x: 0, y: -1, name: "up" },
    down: { x: 0, y: 1, name: "down" },
  };
  const DIR_LIST = [DIRS.left, DIRS.right, DIRS.up, DIRS.down];

  const CLASSIC_ROWS = [
    "###################",
    "#........#........#",
    "#o##.###.#.###.##o#",
    "#.................#",
    "#.##.#.#####.#.##.#",
    "#....#...#...#....#",
    "####.###.#.###.####",
    "####.#.......#.####",
    "####.#.## ##.#.####",
    "     ..#HHH#..     ",
    "####.#.#####.#.####",
    "####.#.......#.####",
    "####.#.#####.#.####",
    "#........#........#",
    "#.##.###.#.###.##.#",
    "#o.#...........#.o#",
    "##.#.#.#####.#.#.##",
    "#....#...#...#....#",
    "#.######.#.######.#",
    "#.................#",
    "###################",
  ];

  const LANDMARK_DISPLAY = {
    station: "にがわえき",
    nursery: "ウエルほいくえん",
    mandai: "マンダイ",
    cocokara: "ココカラファイン",
    piano: "ピアノきょうしつ",
    racecourse: "はんしんけいばじょう",
    mcdonalds: "マクドナルド",
    bigboy: "ビッグボーイ",
    benten: "べんてんいけ",
    coop: "コープ",
    ohsho: "おおさかおうしょう",
    school: "にがわしょうがっこう",
    jhs: "たからづかちゅうがっこう",
    hoshi: "ホシのびょういん",
    laundry: "コインランドリー",
    dentist: "はいしゃ",
    home: "いえ",
    pannel: "パンネル",
    kumon: "くもん",
    lawson: "ローソン",
    kumano: "くまのじんじゃ",
  };

  const ENEMY_META = [
    { id: "chase", color: "#ff5a5a", scare: "#7ad0ff", corner: [1, 1] },
    { id: "ambush", color: "#59c7ff", scare: "#7ad0ff", corner: [0, 0] },
    { id: "random", color: "#7dff7a", scare: "#7ad0ff", corner: [0, 1] },
    { id: "patrol", color: "#e08cff", scare: "#7ad0ff", corner: [1, 0] },
  ];

  const el = {
    app: document.getElementById("app"),
    hud: document.getElementById("hud"),
    score: document.getElementById("score"),
    lives: document.getElementById("lives"),
    stageName: document.getElementById("stage-name"),
    message: document.getElementById("message"),
    canvas: document.getElementById("game"),
    overlay: document.getElementById("overlay"),
    titleScreen: document.getElementById("title-screen"),
    endScreen: document.getElementById("end-screen"),
    endTitle: document.getElementById("end-title"),
    endSub: document.getElementById("end-sub"),
    endScore: document.getElementById("end-score"),
    btnRetry: document.getElementById("btn-retry"),
    btnTitle: document.getElementById("btn-title"),
    dpad: document.getElementById("dpad"),
    fx: document.getElementById("landmark-fx"),
    fxCanvas: document.querySelector("#landmark-fx .fx-particles"),
    fxLabel: document.querySelector("#landmark-fx .fx-label"),
  };
  const ctx = el.canvas.getContext("2d", { alpha: false });

  let audioCtx = null;
  let nigawaData = null;
  let mode = "title"; // title | play | end
  let stageId = "classic";
  let level = null;
  let player = null;
  let enemies = [];
  let score = 0;
  let lives = LIVES0;
  let powerT = 0;
  let eatStreak = 0;
  let graceT = 0;
  let msgT = 0;
  let mouth = 0;
  let flash = 0;
  let lastTs = 0;
  let raf = 0;
  let wantDir = null;
  let camX = 0;
  let camY = 0;
  let viewW = 390;
  let viewH = 520;
  let tile = 18;
  let heldPads = new Set();
  let dying = false;
  let dieT = 0;

  function unlockAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function beep(freq, dur, type, vol, delay) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol || 0.07, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  const sfx = {
    start() { beep(523, 0.12, "square", 0.07, 0); beep(659, 0.12, "square", 0.07, 0.12); beep(784, 0.2, "square", 0.07, 0.24); },
    dot() { beep(420 + (score % 2) * 160, 0.05, "square", 0.04); },
    power() { beep(220, 0.15, "sawtooth", 0.06); beep(330, 0.18, "sawtooth", 0.06, 0.12); beep(440, 0.22, "square", 0.06, 0.26); },
    eat() { beep(523, 0.1, "square", 0.07); beep(659, 0.1, "square", 0.07, 0.1); beep(784, 0.16, "square", 0.07, 0.2); },
    bonus() { beep(660, 0.1, "triangle", 0.07); beep(880, 0.18, "triangle", 0.07, 0.1); },
    arrive() { beep(523, 0.08, "sine", 0.05); beep(784, 0.1, "sine", 0.05, 0.07); beep(1046, 0.16, "triangle", 0.06, 0.14); },
    hit() { beep(300, 0.16, "sawtooth", 0.07); beep(180, 0.28, "sawtooth", 0.07, 0.12); },
    clear() { beep(523, 0.12, "square", 0.07, 0); beep(659, 0.12, "square", 0.07, 0.12); beep(784, 0.12, "square", 0.07, 0.24); beep(1046, 0.3, "square", 0.07, 0.36); },
    over() { beep(392, 0.2, "sawtooth", 0.07); beep(311, 0.25, "sawtooth", 0.07, 0.2); beep(196, 0.45, "sawtooth", 0.07, 0.4); },
  };

  const FX_MS = 1500;
  const FX_COOLDOWN_MS = 4000;
  const FX_COLORS = ["#ffe566", "#ff6b8a", "#7dffb3", "#59c7ff", "#ff9f4a", "#e08cff", "#fff8e8"];
  let occupyingLm = null;
  let horses = [];
  let lmFxAt = new Map();
  let fxAnim = 0;
  let fxHideTimer = 0;
  let fxParts = [];
  let fxStart = 0;
  let fxDraw = null;
  let fxLastTick = 0;
  let fxActiveUntil = 0;

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function landmarkNameLines(name) {
    if (name === "たからづかちゅうがっこう") return ["たからづか", "ちゅうがっこう"];
    if (name === "ココカラファイン") return ["ココカラ", "ファイン"];
    if (name === "ピアノきょうしつ") return ["ピアノ", "きょうしつ"];
    return [name];
  }

  function hideLandmarkFx() {
    if (fxHideTimer) { clearTimeout(fxHideTimer); fxHideTimer = 0; }
    if (fxAnim) { cancelAnimationFrame(fxAnim); fxAnim = 0; }
    if (el.fx) el.fx.classList.remove("active");
    if (el.fxCanvas) {
      const c = el.fxCanvas.getContext("2d");
      if (c) c.clearRect(0, 0, el.fxCanvas.width, el.fxCanvas.height);
    }
    fxParts = [];
    fxDraw = null;
    fxActiveUntil = 0;
  }

  function sizeFxCanvas() {
    const c = el.fxCanvas;
    if (!c) return null;
    const vv = window.visualViewport;
    const w = Math.max(1, Math.floor(vv ? vv.width : window.innerWidth));
    const h = Math.max(1, Math.floor(vv ? vv.height : window.innerHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) {
      c.style.width = w + "px";
      c.style.height = h + "px";
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
    }
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxDraw = { ctx: ctx, w: w, h: h };
    return fxDraw;
  }

  function drawFxStar(ctx, s) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 0.8;
      const b = a + Math.PI * 0.4;
      const r = s, r2 = s * 0.4;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(b) * r2, Math.sin(b) * r2);
    }
    ctx.closePath();
    ctx.fill();
  }

  function tickFxParticles(now) {
    if (!fxDraw) {
      fxAnim = 0;
      return;
    }
    const dt = Math.min(0.05, (now - fxLastTick) / 1000);
    fxLastTick = now;
    const t = (now - fxStart) / FX_MS;
    const ctx = fxDraw.ctx, w = fxDraw.w, h = fxDraw.h;
    ctx.clearRect(0, 0, w, h);
    const fade = t < 0.65 ? 1 : Math.max(0, 1 - (t - 0.65) / 0.35);
    for (const p of fxParts) {
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.kind === "star") drawFxStar(ctx, p.size);
      else ctx.fillRect(-p.size * 0.55, -p.size * 0.22, p.size, p.size * 0.44);
      ctx.restore();
    }
    if (t < 1 && el.fx && el.fx.classList.contains("active")) {
      fxAnim = requestAnimationFrame(tickFxParticles);
    } else {
      ctx.clearRect(0, 0, w, h);
      fxAnim = 0;
    }
  }

  function startFxParticles() {
    if (prefersReducedMotion() || !el.fxCanvas) return;
    const sz = sizeFxCanvas();
    if (!sz) return;
    const w = sz.w, h = sz.h;
    const n = 32;
    fxParts = [];
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.5;
      const spd = 150 + Math.random() * 240;
      fxParts.push({
        x: w * 0.5,
        y: h * 0.46,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 90,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 8,
        size: 7 + Math.random() * 8,
        color: FX_COLORS[i % FX_COLORS.length],
        kind: i % 3 === 0 ? "star" : "confetti",
      });
    }
    fxStart = performance.now();
    fxLastTick = fxStart;
    if (fxAnim) cancelAnimationFrame(fxAnim);
    fxAnim = requestAnimationFrame(tickFxParticles);
  }

  function playLandmarkFx(lm) {
    if (!el.fx || !el.fxLabel || !lm) return;
    const lines = landmarkNameLines(lm.name || "");
    el.fxLabel.replaceChildren();
    for (const s of lines) {
      const span = document.createElement("span");
      span.textContent = s;
      el.fxLabel.appendChild(span);
    }
    el.fx.classList.remove("active");
    void el.fx.offsetWidth;
    el.fx.classList.add("active");
    if (fxAnim) { cancelAnimationFrame(fxAnim); fxAnim = 0; }
    if (prefersReducedMotion()) {
      if (el.fxCanvas) {
        const c = el.fxCanvas.getContext("2d");
        if (c) c.clearRect(0, 0, el.fxCanvas.width, el.fxCanvas.height);
      }
    } else {
      startFxParticles();
    }
    sfx.arrive();
    fxActiveUntil = performance.now() + FX_MS;
    if (fxHideTimer) clearTimeout(fxHideTimer);
    fxHideTimer = setTimeout(() => {
      hideLandmarkFx();
    }, FX_MS + 40);
  }

  function resetLandmarkFxState() {
    hideLandmarkFx();
    occupyingLm = null;
    lmFxAt = new Map();
    if (level && player && level.landmarks) {
      const tx = Math.round(player.x), ty = Math.round(player.y);
      for (const lm of level.landmarks) {
        if (lm.x === tx && lm.y === ty) {
          occupyingLm = lm.id;
          break;
        }
      }
    }
  }

  function checkLandmarkArrival() {
    if (mode !== "play" || !level || !player || !level.landmarks) return;
    const tx = Math.round(player.x), ty = Math.round(player.y);
    let here = null;
    for (const lm of level.landmarks) {
      if (lm.x === tx && lm.y === ty) { here = lm; break; }
    }
    if (!here) {
      occupyingLm = null;
      return;
    }
    if (occupyingLm === here.id) return;
    occupyingLm = here.id;
    const now = performance.now();
    const last = lmFxAt.get(here.id);
    if (last != null && now - last < FX_COOLDOWN_MS) return;
    lmFxAt.set(here.id, now);
    playLandmarkFx(here);
  }

  function opposite(d) {
    if (!d) return null;
    return DIR_LIST.find((x) => x.x === -d.x && x.y === -d.y) || null;
  }

  function wrapTile(level, x, y) {
    let tx = x, ty = y;
    if (level.wrap) {
      if (tx < 0) tx += level.w;
      if (tx >= level.w) tx -= level.w;
    }
    return [tx, ty];
  }

  function cellAt(level, x, y) {
    const [tx, ty] = wrapTile(level, x, y);
    if (ty < 0 || ty >= level.h || tx < 0 || tx >= level.w) return "#";
    return level.cells[ty][tx];
  }

  function isWallFor(level, x, y, who) {
    const c = cellAt(level, x, y);
    if (c === "#") return true;
    if (c === "H") return who !== "enemy" && who !== "eyes";
    if (c === "-") return who === "player"; // ドアはこどもはとおれない
    if (level.safe && who !== "player" && who !== "eyes") {
      const [tx, ty] = wrapTile(level, x, y);
      if (level.safe.has(tx + "," + ty)) return true;
    }
    return false;
  }

  function buildClassic() {
    const rows = CLASSIC_ROWS;
    const h = rows.length, w = rows[0].length;
    if (rows.some((r) => r.length !== w)) throw new Error("classic map width");
    const cells = rows.map((r) => r.split(""));
    const dots = new Set();
    const power = new Set();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = cells[y][x];
        if (c === ".") dots.add(x + "," + y);
        if (c === "o") power.add(x + "," + y);
      }
    }
    const start = { x: 9, y: 15 };
    const house = [
      { x: 9, y: 9 },
      { x: 8, y: 9 },
      { x: 10, y: 9 },
      { x: 9, y: 8 },
    ];
    return {
      id: "classic",
      name: "クラシックステージ",
      w, h, cells, dots, power,
      start,
      enemyStarts: house,
      wrap: true,
      house,
      landmarks: [],
      safe: new Set(),
      fitAll: true,
      attrib: false,
    };
  }

  function buildNigawa(data) {
    const w = data.width, h = data.height;
    const cells = data.grid.map((row) => row.split("").map((c) => (c === "#" ? "#" : " ")));
    const dots = new Set(data.dots.map(([x, y]) => x + "," + y));
    const power = new Set(data.powerPellets.map(([x, y]) => x + "," + y));
    const landmarks = data.landmarks.map((lm) => ({
      id: lm.id,
      name: LANDMARK_DISPLAY[lm.id] || lm.name,
      x: lm.cell[0],
      y: lm.cell[1],
      kind: lm.kind,
      role: lm.role,
      bonus: lm.bonus || LANDMARK_BONUS_DEFAULT,
      visited: false,
      lat: lm.lat,
      lon: lm.lon,
    }));
    const safe = new Set();
    for (const lm of landmarks) {
      if (lm.role === "safe" || lm.role === "start_safe") safe.add(lm.x + "," + lm.y);
      cells[lm.y][lm.x] = " ";
    }
    const areaFillCells = new Map();
    for (const fill of (data.areaFills || [])) {
      for (const run of fill.runs) {
        const y = run[0], x0 = run[1], x1 = run[2];
        for (let x = x0; x <= x1; x++) areaFillCells.set(x + "," + y, fill);
      }
    }
    return {
      id: "nigawa",
      name: "にがわステージ",
      w, h, cells, dots, power,
      start: { x: data.playerStart[0], y: data.playerStart[1] },
      enemyStarts: data.enemyStarts.map(([x, y]) => ({ x, y })),
      wrap: false,
      house: [],
      landmarks,
      safe,
      areaFillCells,
      areaLabels: data.areaLabels || [],
      fitAll: false,
      attrib: true,
    };
  }

  function connectedOk(level, start) {
    const seen = new Set();
    const q = [[start.x, start.y]];
    seen.add(start.x + "," + start.y);
    while (q.length) {
      const [x, y] = q.pop();
      for (const d of DIR_LIST) {
        let nx = x + d.x, ny = y + d.y;
        if (level.wrap) {
          if (nx < 0) nx += level.w;
          if (nx >= level.w) nx -= level.w;
        }
        const k = nx + "," + ny;
        if (seen.has(k)) continue;
        const c = cellAt(level, nx, ny);
        if (c === "#" || c === "H" || c === "-") continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    for (const k of level.dots) if (!seen.has(k)) return false;
    for (const k of level.power) if (!seen.has(k)) return false;
    return seen.size > 0;
  }

  function resetActors() {
    player = {
      x: level.start.x,
      y: level.start.y,
      dir: null,
      face: DIRS.right,
      stuck: false,
    };
    wantDir = null;
    enemies = ENEMY_META.map((meta, i) => {
      const spawn = level.enemyStarts[i] || level.enemyStarts[0] || level.start;
      const corner = {
        x: meta.corner[0] ? level.w - 2 : 1,
        y: meta.corner[1] ? level.h - 2 : 1,
      };
      return {
        id: meta.id,
        color: meta.color,
        x: spawn.x,
        y: spawn.y,
        dir: DIRS.up,
        home: { x: spawn.x, y: spawn.y },
        corner,
        mode: "scatter",
        eaten: false,
        passedThisTile: false,
      };
    });
    powerT = 0;
    eatStreak = 0;
    graceT = GRACE_SECS;
    dying = false;
    dieT = 0;
    camX = player.x;
    camY = player.y;
  }

  function showMsg(text, t) {
    el.message.textContent = text || "";
    msgT = t || 0;
  }

  function updateHud() {
    el.score.textContent = String(score);
    el.lives.innerHTML = "<span>♥</span>".repeat(Math.max(0, lives));
    el.stageName.textContent = level ? level.name : "";
  }

  function setUI(which) {
    mode = which;
    if (which === "title") {
      el.hud.hidden = true;
      el.dpad.hidden = true;
      el.overlay.hidden = false;
      el.overlay.classList.remove("play");
      el.titleScreen.hidden = false;
      el.endScreen.hidden = true;
    } else if (which === "play") {
      el.hud.hidden = false;
      el.dpad.hidden = false;
      el.overlay.hidden = false;
      el.overlay.classList.add("play");
      el.titleScreen.hidden = true;
      el.endScreen.hidden = true;
    } else if (which === "end") {
      el.hud.hidden = false;
      el.dpad.hidden = false;
      el.overlay.hidden = false;
      el.overlay.classList.remove("play");
      el.titleScreen.hidden = true;
      el.endScreen.hidden = false;
    }
    if (which !== "play") hideLandmarkFx();
    layout();
  }

  function startStage(id) {
    stageId = id;
    score = 0;
    lives = LIVES0;
    level = id === "nigawa" ? buildNigawa(nigawaData) : buildClassic();
    if (!connectedOk(level, level.start)) console.warn("maze connectivity warning");
    resetActors();
    if (level.landmarks) {
      for (const lm of level.landmarks) {
        if (lm.role === "start_safe" && lm.x === level.start.x && lm.y === level.start.y) {
          lm.visited = true; // スタート地点ははじめからいるのでボーナスは出さない
        }
      }
    }
    initHorses();
    resetLandmarkFxState();
    showMsg("スタート！", 1.4);
    updateHud();
    setUI("play");
    layout();
    sfx.start();
    lastTs = 0;
    if (!raf) raf = requestAnimationFrame(frame);
    requestAnimationFrame(() => { layout(); draw(); });
  }

  function endGame(won) {
    setUI("end");
    if (won) {
      el.endTitle.textContent = "やったね！";
      el.endSub.textContent = "エサを ぜんぶ たべたよ";
      sfx.clear();
    } else {
      el.endTitle.textContent = "ゲームオーバー";
      el.endSub.textContent = "また あそぼう";
      sfx.over();
    }
    el.endScore.textContent = String(score);
  }

  function nearCenter(a, eps) {
    const e = eps == null ? 0.18 : eps;
    return Math.abs(a.x - Math.round(a.x)) < e && Math.abs(a.y - Math.round(a.y)) < e;
  }

  function snapCenter(a) {
    a.x = Math.round(a.x);
    a.y = Math.round(a.y);
  }

  function openAhead(a, dir, who) {
    const tx = Math.round(a.x) + dir.x;
    const ty = Math.round(a.y) + dir.y;
    return !isWallFor(level, tx, ty, who);
  }

  function moveActor(a, dir, speed, dt, who) {
    if (!dir) return;
    // wrap for tunnels
    if (level.wrap) {
      if (a.x < -0.5) a.x += level.w;
      if (a.x >= level.w - 0.5) a.x -= level.w;
    }
    const cx = Math.round(a.x), cy = Math.round(a.y);
    const nx = a.x + dir.x * speed * dt;
    const ny = a.y + dir.y * speed * dt;
    const crossed =
      (dir.x !== 0 && (Math.sign(a.x - cx) !== Math.sign(nx - cx) || Math.abs(a.x - cx) < 1e-6)) ||
      (dir.y !== 0 && (Math.sign(a.y - cy) !== Math.sign(ny - cy) || Math.abs(a.y - cy) < 1e-6));
    const nextWall = isWallFor(level, cx + dir.x, cy + dir.y, who);
    if (nextWall && crossed) {
      a.x = cx;
      a.y = cy;
      return "blocked";
    }
    a.x = nx;
    a.y = ny;
    return "moved";
  }

  function settleToCenter(dt) {
    if (nearCenter(player, 0.15)) {
      snapCenter(player);
      player.dir = null;
      return;
    }
    if (!player.dir) {
      const cx = Math.round(player.x), cy = Math.round(player.y);
      const dx = cx - player.x, dy = cy - player.y;
      const dist = Math.hypot(dx, dy) || 1;
      const step = Math.min(dist, PLAYER_SPEED * dt);
      player.x += (dx / dist) * step;
      player.y += (dy / dist) * step;
      if (nearCenter(player, 0.15)) {
        snapCenter(player);
        player.dir = null;
      }
      return;
    }
    const r = moveActor(player, player.dir, PLAYER_SPEED, dt, "player");
    if (r === "blocked" || nearCenter(player, 0.15)) {
      snapCenter(player);
      player.dir = null;
    }
  }

  // おしたほうこうにだけすすむ（こどものそうさ：ちがうほうこうへすべらない）
  // 直進中はマス中心にスナップし直さない（毎フレーム引き戻されて動けなくなるのを防ぐ）
  function updatePlayer(dt) {
    if (dying) return;
    if (wantDir) player.face = wantDir;

    // reverse immediately when the opposite way is requested
    if (wantDir && player.dir && wantDir.x === -player.dir.x && wantDir.y === -player.dir.y) {
      player.dir = wantDir;
      player.face = wantDir;
    }

    const goingWanted = !!(wantDir && player.dir && player.dir.x === wantDir.x && player.dir.y === wantDir.y);

    if (!wantDir) {
      settleToCenter(dt);
    } else if (goingWanted) {
      const r = moveActor(player, player.dir, PLAYER_SPEED, dt, "player");
      if (r === "blocked") {
        snapCenter(player);
        player.dir = null;
      }
    } else if (nearCenter(player, 0.2)) {
      snapCenter(player);
      if (openAhead(player, wantDir, "player")) {
        player.dir = wantDir;
        player.face = wantDir;
        const r = moveActor(player, player.dir, PLAYER_SPEED, dt, "player");
        if (r === "blocked") {
          snapCenter(player);
          player.dir = null;
        }
      } else {
        // 壁なら止まる。バッファは残し、空きができたらすぐ曲がる。
        // 別方向へ走り続けない（5歳児にわかりやすく）。
        player.dir = null;
        player.face = wantDir;
      }
    } else if (player.dir) {
      // 横方向キー：次のマス中心までだけ進み、そこで曲げるか止まる
      const r = moveActor(player, player.dir, PLAYER_SPEED, dt, "player");
      if (r === "blocked" || nearCenter(player, 0.2)) {
        snapCenter(player);
        if (openAhead(player, wantDir, "player")) {
          player.dir = wantDir;
          player.face = wantDir;
        } else {
          player.dir = null;
          player.face = wantDir;
        }
      }
    } else {
      settleToCenter(dt);
    }

    if (level.wrap) {
      if (player.x < -0.5) player.x += level.w;
      if (player.x >= level.w - 0.5) player.x -= level.w;
    }

    const tx = Math.round(player.x), ty = Math.round(player.y);
    if (nearCenter(player, 0.35)) {
      const k = tx + "," + ty;
      if (level.dots.has(k)) {
        level.dots.delete(k);
        score += 10;
        sfx.dot();
        updateHud();
      }
      if (level.power.has(k)) {
        level.power.delete(k);
        powerT = POWER_SECS;
        eatStreak = 0;
        score += 50;
        showMsg("パワー！", 1.2);
        sfx.power();
        updateHud();
        for (const e of enemies) {
          if (!e.eaten) e.dir = opposite(e.dir) || e.dir;
        }
      }
      for (const lm of level.landmarks) {
        if (!lm.visited && lm.x === tx && lm.y === ty) {
          lm.visited = true;
          score += lm.bonus;
          showMsg("ボーナス！ " + lm.name, 1.8);
          sfx.bonus();
          updateHud();
        }
      }
      checkLandmarkArrival();
      if (level.dots.size === 0 && level.power.size === 0) {
        endGame(true);
      }
    }
  }

  function validDirs(e, who, allowReverse) {
    const out = [];
    const cx = Math.round(e.x), cy = Math.round(e.y);
    for (const d of DIR_LIST) {
      if (!allowReverse && e.dir && d.x === -e.dir.x && d.y === -e.dir.y) continue;
      if (!isWallFor(level, cx + d.x, cy + d.y, who)) out.push(d);
    }
    if (!out.length) {
      for (const d of DIR_LIST) {
        if (!isWallFor(level, cx + d.x, cy + d.y, who)) out.push(d);
      }
    }
    return out;
  }

  function pickClosest(dirs, e, tx, ty) {
    let best = dirs[0], bestD = Infinity;
    const cx = Math.round(e.x), cy = Math.round(e.y);
    for (const d of dirs) {
      const dx = cx + d.x - tx;
      const dy = cy + d.y - ty;
      // prefer no wrap issues; classic tunnel is ok with raw
      let dist = dx * dx + dy * dy;
      if (level.wrap) {
        const dx2 = Math.min(Math.abs(dx), level.w - Math.abs(dx));
        dist = dx2 * dx2 + dy * dy;
      }
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  function targetFor(e) {
    const px = Math.round(player.x), py = Math.round(player.y);
    if (e.eaten) return e.home;
    if (powerT > 0) {
      // にげる
      return { x: e.corner.x, y: e.corner.y, flee: true };
    }
    if (graceT > 0 || e.mode === "scatter") return e.corner;
    if (e.id === "chase") return { x: px, y: py };
    if (e.id === "ambush") {
      const d = player.dir || DIRS.left;
      return { x: px + d.x * 3, y: py + d.y * 3 };
    }
    if (e.id === "random") return null;
    // patrol: ちかいと にげて、とおいと おいかける（やさしい）
    const dist = Math.abs(Math.round(e.x) - px) + Math.abs(Math.round(e.y) - py);
    if (dist < 7) return e.corner;
    return { x: px, y: py };
  }

  function isDeadEndCell(x, y, who) {
    let n = 0;
    for (const d of DIR_LIST) {
      if (!isWallFor(level, x + d.x, y + d.y, who)) n++;
    }
    return n <= 1;
  }

  function chooseEnemyDir(e, who) {
    let opts = validDirs(e, who, false);
    if (!opts.length) return;
    // 行き止まりにむかいこまない（往復で止まるのを防ぐ）
    const open = opts.filter((d) => !isDeadEndCell(Math.round(e.x) + d.x, Math.round(e.y) + d.y, who));
    if (open.length) opts = open;
    // ハウスの中にいるときはドア／そとへ出る
    const ecx = Math.round(e.x), ecy = Math.round(e.y);
    const here = cellAt(level, ecx, ecy);
    if (here === "H" || here === "-") {
      const door = opts.filter((d) => cellAt(level, ecx + d.x, ecy + d.y) === "-");
      const out = opts.filter((d) => {
        const c = cellAt(level, ecx + d.x, ecy + d.y);
        return c !== "H" && c !== "#" && c !== "-";
      });
      if (door.length) opts = door;
      else if (out.length) opts = out;
    }
    const tgt = targetFor(e);
    if (tgt && tgt.flee) {
      const px = Math.round(player.x), py = Math.round(player.y);
      let best = opts[0], bestD = -1;
      for (const d of opts) {
        const nx = e.x + d.x, ny = e.y + d.y;
        const dist = Math.abs(nx - px) + Math.abs(ny - py);
        if (dist > bestD) { bestD = dist; best = d; }
      }
      e.dir = best;
    } else if (e.id === "random" && !e.eaten && powerT <= 0) {
      e.dir = opts[Math.floor(Math.random() * opts.length)] || e.dir;
    } else if (tgt) {
      e.dir = pickClosest(opts, e, tgt.x, tgt.y) || e.dir;
    } else {
      e.dir = opts[0] || e.dir;
    }
  }

  function updateEnemies(dt) {
    if (debugFreezeEnemies) return;
    const scatterCycle = !powerT && graceT <= 0 && (Math.floor((performance.now() / 1000) % 16) < 4);
    for (const e of enemies) {
      const who = e.eaten ? "eyes" : "enemy";
      const speed = e.eaten
        ? ENEMY_SPEED.eyes
        : powerT > 0
          ? ENEMY_SPEED.fright
          : graceT > 0
            ? 0.86
            : ENEMY_SPEED[e.id] || ENEMY_SPEED.chase;
      e.mode = scatterCycle ? "scatter" : "chase";

      // てきがマス中心に吸い戻されない：このマスで未決定のときだけ向きを選ぶ
      const cx = Math.round(e.x), cy = Math.round(e.y);
      if (nearCenter(e, 0.18) && !e.passedThisTile) {
        snapCenter(e);
        chooseEnemyDir(e, who);
        e.passedThisTile = true;
        e.decidedX = cx;
        e.decidedY = cy;
      }
      const r = moveActor(e, e.dir, speed, dt, who);
      if (r === "blocked") {
        snapCenter(e);
        e.passedThisTile = false;
        chooseEnemyDir(e, who);
        e.passedThisTile = true;
        e.decidedX = Math.round(e.x);
        e.decidedY = Math.round(e.y);
      } else if (!nearCenter(e, 0.2)) {
        e.passedThisTile = false;
      }
      if (level.wrap) {
        if (e.x < -0.5) e.x += level.w;
        if (e.x >= level.w - 0.5) e.x -= level.w;
      }
      if (e.eaten && nearCenter(e, 0.3) && Math.round(e.x) === e.home.x && Math.round(e.y) === e.home.y) {
        e.eaten = false;
      }
    }
  }

  function collide() {
    if (debugInvincible || dying || mode !== "play") return;
    const hitR = 0.42; // すこし やさしめ
    for (const e of enemies) {
      if (e.eaten) continue;
      let dx = e.x - player.x, dy = e.y - player.y;
      if (level.wrap) {
        if (dx > level.w / 2) dx -= level.w;
        if (dx < -level.w / 2) dx += level.w;
      }
      if (dx * dx + dy * dy > hitR * hitR) continue;
      if (powerT > 0) {
        e.eaten = true;
        const pts = EAT_POINTS[Math.min(eatStreak, EAT_POINTS.length - 1)];
        eatStreak += 1;
        score += pts;
        showMsg("やった！ +" + pts, 1.1);
        sfx.eat();
        updateHud();
      } else if (graceT <= 0) {
        dying = true;
        dieT = 1.15;
        sfx.hit();
        showMsg("いてて！", 1.1);
        break;
      }
    }
  }

  function afterDeath(dt) {
    dieT -= dt;
    if (dieT > 0) return;
    lives -= 1;
    updateHud();
    if (lives <= 0) {
      dying = false;
      endGame(false);
      return;
    }
    resetActors();
    showMsg("スタート！", 1.2);
  }

  function syncShell() {
    const vv = window.visualViewport;
    const w = vv ? vv.width : window.innerWidth;
    const h = vv ? vv.height : window.innerHeight;
    const landscape = w > h;
    document.documentElement.classList.toggle("landscape", landscape);
    if (el.app) el.app.classList.toggle("landscape", landscape);
  }

  function layout() {
    syncShell();
    const stage = document.getElementById("stage");
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    // ステージの中にキャンバスをぴったり置く。CSSで引き伸ばさない。
    viewW = Math.max(160, Math.floor(r.width));
    viewH = Math.max(160, Math.floor(r.height));
    el.canvas.style.width = viewW + "px";
    el.canvas.style.height = viewH + "px";
    el.canvas.width = Math.max(1, Math.floor(viewW * dpr));
    el.canvas.height = Math.max(1, Math.floor(viewH * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (level) {
      if (level.fitAll) {
        tile = Math.floor(Math.min(viewW / level.w, viewH / level.h));
        tile = Math.max(14, tile);
      } else if (document.documentElement.classList.contains("landscape")) {
        tile = Math.max(26, Math.min(36, Math.floor(Math.min(viewW / 13, viewH / 9))));
      } else {
        tile = Math.max(26, Math.min(36, Math.floor(Math.min(viewW / 11, viewH / 13))));
      }
    }
  }

  function drawWalls() {
    const left = Math.max(0, Math.floor(camX - 1));
    const right = Math.min(level.w - 1, Math.ceil(camX + viewW / tile + 1));
    const top = Math.max(0, Math.floor(camY - 1));
    const bot = Math.min(level.h - 1, Math.ceil(camY + viewH / tile + 1));
    const wallFill = level.id === "nigawa" ? "#24386c" : "#1a3a86";
    const wallEdge = level.id === "nigawa" ? "#6ea0ff" : "#5aa0ff";
    ctx.fillStyle = "#0a1430";
    ctx.fillRect(0, 0, viewW, viewH);

    const ox = -camX * tile, oy = -camY * tile;
    // walls (buildings / blocks) filled first
    for (let y = top; y <= bot; y++) {
      for (let x = left; x <= right; x++) {
        if (level.cells[y][x] !== "#") continue;
        const fill = level.areaFillCells && level.areaFillCells.get(x + "," + y);
        ctx.fillStyle = fill ? (fill.color || "#2b5d3a") : wallFill;
        ctx.fillRect(ox + x * tile, oy + y * tile, tile + 0.5, tile + 0.5);
      }
    }
    // floor / roads
    for (let y = top; y <= bot; y++) {
      for (let x = left; x <= right; x++) {
        const c = level.cells[y][x];
        if (c === "#") continue;
        const px = ox + x * tile, py = oy + y * tile;
        ctx.fillStyle = (x + y) % 2 === 0 ? "#1a2f66" : "#162a5c";
        ctx.fillRect(px, py, tile, tile);
      }
    }
    // bright edges where a wall meets a corridor, so paths are easy to see
    ctx.lineWidth = Math.max(2, tile * 0.12);
    ctx.lineCap = "round";
    for (let y = top; y <= bot; y++) {
      for (let x = left; x <= right; x++) {
        if (level.cells[y][x] !== "#") continue;
        const fill = level.areaFillCells && level.areaFillCells.get(x + "," + y);
        ctx.strokeStyle = fill ? (fill.edge || "#8fd4a0") : wallEdge;
        const px = ox + x * tile, py = oy + y * tile;
        const open = (tx, ty) => ty >= 0 && ty < level.h && tx >= 0 && tx < level.w && level.cells[ty][tx] !== "#";
        ctx.beginPath();
        if (open(x, y - 1)) { ctx.moveTo(px + 1, py); ctx.lineTo(px + tile - 1, py); }
        if (open(x, y + 1)) { ctx.moveTo(px + 1, py + tile); ctx.lineTo(px + tile - 1, py + tile); }
        if (open(x - 1, y)) { ctx.moveTo(px, py + 1); ctx.lineTo(px, py + tile - 1); }
        if (open(x + 1, y)) { ctx.moveTo(px + tile, py + 1); ctx.lineTo(px + tile, py + tile - 1); }
        ctx.stroke();
      }
    }
  }

  function drawDots() {
    const ox = -camX * tile, oy = -camY * tile;
    const r = Math.max(2.2, tile * 0.12);
    ctx.fillStyle = "#ffe9a8";
    for (const k of level.dots) {
      const [xs, ys] = k.split(",");
      const x = +xs, y = +ys;
      const px = ox + (x + 0.5) * tile;
      const py = oy + (y + 0.5) * tile;
      if (px < -tile || py < -tile || px > viewW + tile || py > viewH + tile) continue;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const pr = Math.max(5, tile * 0.28) + Math.sin(flash * 6) * 1.4;
    ctx.fillStyle = "#fff4c8";
    for (const k of level.power) {
      const [xs, ys] = k.split(",");
      const x = +xs, y = +ys;
      const px = ox + (x + 0.5) * tile;
      const py = oy + (y + 0.5) * tile;
      if (px < -tile || py < -tile || px > viewW + tile || py > viewH + tile) continue;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd24a";
      ctx.beginPath();
      ctx.arc(px, py, pr * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff4c8";
    }
  }

  function drawLandmarks() {
    const ox = -camX * tile, oy = -camY * tile;
    for (const lm of level.landmarks) {
      const px = ox + (lm.x + 0.5) * tile;
      const py = oy + (lm.y + 0.5) * tile;
      if (px < -tile * 3 || py < -tile * 3 || px > viewW + tile * 3 || py > viewH + tile * 3) continue;
      const r = tile * 0.46;
      ctx.save();
      ctx.translate(px, py);
      if (lm.kind === "station") {
        ctx.fillStyle = lm.visited ? "#8fd0ff" : "#4aa4ff";
        ctx.beginPath();
        rounded(-r, -r * 0.7, r * 2, r * 1.4, 4);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold " + Math.max(9, tile * 0.42) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("えき", 0, 0);
      } else if (lm.kind === "nursery") {
        ctx.fillStyle = lm.visited ? "#b8f0a8" : "#6adf6a";
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(r * 0.75, 0);
        ctx.lineTo(r * 0.75, r * 0.8);
        ctx.lineTo(-r * 0.75, r * 0.8);
        ctx.lineTo(-r * 0.75, 0);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.fill();
      } else if (lm.kind === "racecourse") {
        ctx.fillStyle = lm.visited ? "#c8b4ff" : "#9b7dff";
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.6, r * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (lm.id === "mcdonalds") {
        ctx.fillStyle = lm.visited ? "#ffd36a" : "#ffb020";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#7a3a10";
        ctx.fillRect(-r * 0.55, -r * 0.1, r * 1.1, r * 0.35);
        ctx.beginPath();
        ctx.arc(0, -r * 0.05, r * 0.55, Math.PI, 0);
        ctx.fill();
      } else if (lm.kind === "pond") {
        ctx.fillStyle = lm.visited ? "#9de8ff" : "#3dc6ff";
        ctx.beginPath();
        ctx.ellipse(0, r * 0.1, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.beginPath();
        ctx.ellipse(-r * 0.2, -r * 0.05, r * 0.35, r * 0.18, -0.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (lm.kind === "school") {
        ctx.fillStyle = lm.visited ? "#c9e6ff" : "#5aa0ff";
        ctx.beginPath();
        rounded(-r * 0.85, -r * 0.15, r * 1.7, r * 0.95, 3);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r, -r * 0.1);
        ctx.lineTo(-r, -r * 0.1);
        ctx.closePath();
        ctx.fillStyle = lm.visited ? "#7ed0ff" : "#2f6ed6";
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillRect(-r * 0.18, r * 0.15, r * 0.36, r * 0.55);
      } else if (lm.id === "bigboy") {
        // シンプルなハンバーガー（オリジナル）
        ctx.fillStyle = lm.visited ? "#ffd4a0" : "#e89040";
        ctx.beginPath();
        ctx.arc(0, -r * 0.22, r * 0.72, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = lm.visited ? "#c07038" : "#8a3a12";
        ctx.fillRect(-r * 0.72, -r * 0.12, r * 1.44, r * 0.28);
        ctx.fillStyle = lm.visited ? "#f0c070" : "#d4a04a";
        ctx.beginPath();
        ctx.ellipse(0, r * 0.32, r * 0.72, r * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (lm.id === "ohsho") {
        ctx.fillStyle = lm.visited ? "#ffc9a0" : "#ff7a45";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(0, r * 0.1, r * 0.5, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#b33a12";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, r * 0.05, r * 0.38, 0.15, Math.PI - 0.15);
        ctx.stroke();
      } else if (lm.kind === "hospital") {
        ctx.fillStyle = lm.visited ? "#b8f0d8" : "#3ecf8a";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillRect(-r * 0.18, -r * 0.62, r * 0.36, r * 1.24);
        ctx.fillRect(-r * 0.62, -r * 0.18, r * 1.24, r * 0.36);
      } else if (lm.kind === "dentist") {
        ctx.fillStyle = lm.visited ? "#d0f0ff" : "#4ec4e8";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, -r * 0.35);
        ctx.quadraticCurveTo(-r * 0.55, r * 0.15, -r * 0.2, r * 0.55);
        ctx.lineTo(0, r * 0.15);
        ctx.lineTo(r * 0.2, r * 0.55);
        ctx.quadraticCurveTo(r * 0.55, r * 0.15, r * 0.4, -r * 0.35);
        ctx.quadraticCurveTo(0, -r * 0.55, -r * 0.4, -r * 0.35);
        ctx.fill();
      } else if (lm.kind === "home") {
        ctx.fillStyle = lm.visited ? "#ffd9a8" : "#ffb060";
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.95, -r * 0.05);
        ctx.lineTo(r * 0.7, -r * 0.05);
        ctx.lineTo(r * 0.7, r * 0.85);
        ctx.lineTo(-r * 0.7, r * 0.85);
        ctx.lineTo(-r * 0.7, -r * 0.05);
        ctx.lineTo(-r * 0.95, -r * 0.05);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#7a3a10";
        ctx.fillRect(-r * 0.18, r * 0.15, r * 0.36, r * 0.7);
        ctx.fillStyle = "#fff6c8";
        ctx.fillRect(-r * 0.55, r * 0.05, r * 0.28, r * 0.28);
      } else if (lm.kind === "bakery") {
        ctx.fillStyle = lm.visited ? "#ffe0a8" : "#e89a3a";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff0c8";
        ctx.beginPath();
        ctx.ellipse(0, r * 0.1, r * 0.62, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#b86a18";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, r * 0.05, r * 0.42, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else if (lm.kind === "juku") {
        ctx.fillStyle = lm.visited ? "#c8e8ff" : "#4a9cff";
        ctx.beginPath();
        rounded(-r * 0.85, -r * 0.7, r * 1.7, r * 1.4, 4);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillRect(-r * 0.55, -r * 0.2, r * 1.1, r * 0.7);
        ctx.fillStyle = "#2a5aaa";
        ctx.font = "bold " + Math.max(8, tile * 0.32) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("く", 0, r * 0.12);
      } else if (lm.kind === "convenience") {
        ctx.fillStyle = lm.visited ? "#9ad0ff" : "#1a6ad6";
        ctx.beginPath();
        rounded(-r * 0.85, -r * 0.7, r * 1.7, r * 1.4, 4);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillRect(-r * 0.85, -r * 0.22, r * 1.7, r * 0.28);
        ctx.fillStyle = lm.visited ? "#c8ecff" : "#7ec8ff";
        ctx.fillRect(-r * 0.45, r * 0.18, r * 0.9, r * 0.42);
      } else if (lm.kind === "laundry") {
        ctx.fillStyle = lm.visited ? "#c8e8ff" : "#5ab4e8";
        ctx.beginPath();
        rounded(-r * 0.7, -r * 0.75, r * 1.4, r * 1.5, 4);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(0, -r * 0.08, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#2a6a90";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#2a6a90";
        ctx.fillRect(-r * 0.55, r * 0.48, r * 1.1, r * 0.16);
      } else if (lm.kind === "piano") {
        ctx.fillStyle = lm.visited ? "#e8d2a8" : "#8a5a2a";
        ctx.beginPath();
        rounded(-r * 0.85, -r * 0.55, r * 1.7, r * 1.25, 3);
        ctx.fill();
        ctx.fillStyle = "#fff8e8";
        ctx.fillRect(-r * 0.72, r * 0.08, r * 1.44, r * 0.48);
        ctx.fillStyle = "#2a1a10";
        for (const kx of [-0.4, -0.08, 0.24]) {
          ctx.fillRect(r * kx, r * 0.08, r * 0.22, r * 0.3);
        }
        ctx.fillStyle = lm.visited ? "#c8e8ff" : "#5aa0ff";
        ctx.beginPath();
        ctx.arc(r * 0.55, -r * 0.72, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = lm.visited ? "#c8e8ff" : "#5aa0ff";
        ctx.beginPath();
        ctx.moveTo(r * 0.68, -r * 0.72);
        ctx.quadraticCurveTo(r * 0.95, -r * 0.55, r * 0.7, -r * 0.2);
        ctx.stroke();
      } else if (lm.kind === "pharmacy") {
        ctx.fillStyle = lm.visited ? "#c8f0e0" : "#3cbf9a";
        ctx.beginPath();
        rounded(-r * 0.8, -r * 0.7, r * 1.6, r * 1.5, 4);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillRect(-r * 0.16, -r * 0.48, r * 0.32, r * 0.96);
        ctx.fillRect(-r * 0.42, -r * 0.16, r * 0.84, r * 0.32);
      } else if (lm.kind === "shrine") {
        // とりい
        ctx.fillStyle = lm.visited ? "#ffb0a0" : "#e24a3a";
        const tw = r * 0.28;
        ctx.fillRect(-r * 0.62, -r * 0.15, tw, r * 0.95);
        ctx.fillRect(r * 0.62 - tw, -r * 0.15, tw, r * 0.95);
        ctx.fillRect(-r * 0.85, -r * 0.55, r * 1.7, r * 0.22);
        ctx.fillRect(-r * 0.72, -r * 0.18, r * 1.44, r * 0.14);
        ctx.fillStyle = lm.visited ? "#5a2a20" : "#3a1810";
        ctx.fillRect(-r * 0.88, -r * 0.62, r * 1.76, r * 0.08);
      } else {
        ctx.fillStyle = lm.visited ? "#ffd9a0" : "#ff9f4a";
        ctx.beginPath();
        rounded(-r * 0.85, -r * 0.7, r * 1.7, r * 1.4, 5);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillRect(-r * 0.35, -r * 0.1, r * 0.7, r * 0.55);
      }
      ctx.restore();
    }
    const fontFamily = "'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Noto Sans CJK JP', sans-serif";
    const fs = Math.max(15, Math.min(22, tile * 0.62));
    ctx.font = "bold " + fs + "px " + fontFamily;
    const boxes = [];
    const prefer = { home: "left", lawson: "left", kumon: "down", pannel: "up", school: "down", jhs: "right", nursery: "down", station: "down", hoshi: "left", laundry: "up", mcdonalds: "up", bigboy: "down", mandai: "up", cocokara: "down", piano: "up", dentist: "down", benten: "down", kumano: "up" };
    function nameLines(name) {
      return landmarkNameLines(name);
    }
    function boxFrom(lines, x, y, align, base) {
      const w = Math.max(...lines.map((s) => ctx.measureText(s).width));
      const h = lines.length * (fs + 3);
      let l = x, top = y;
      if (align === "center") l = x - w / 2;
      else if (align === "right") l = x - w;
      if (base === "bottom") top = y - h;
      else if (base === "middle") top = y - h / 2;
      return { l, t: top, r: l + w, b: top + h };
    }
    function overlaps(a, b, pad) {
      return a.l < b.r + pad && a.r > b.l - pad && a.t < b.b + pad && a.b > b.t - pad;
    }
    const iconBoxes = [];
    for (const lm of level.landmarks) {
      const ix = ox + (lm.x + 0.5) * tile;
      const iy = oy + (lm.y + 0.5) * tile;
      const ir = tile * 0.5;
      iconBoxes.push({ l: ix - ir, t: iy - ir, r: ix + ir, b: iy + ir });
    }
    for (const lm of level.landmarks) {
      const px = ox + (lm.x + 0.5) * tile;
      const py = oy + (lm.y + 0.5) * tile;
      if (px < -tile * 5 || py < -tile * 5 || px > viewW + tile * 5 || py > viewH + tile * 5) continue;
      const label = lm.name;
      const lines = nameLines(label);
      const gap = tile * 0.58;
      const cands = [
        { key: "up", x: px, y: py - gap, align: "center", base: "bottom" },
        { key: "down", x: px, y: py + gap + 2, align: "center", base: "top" },
        { key: "left", x: px - gap, y: py, align: "right", base: "middle" },
        { key: "right", x: px + gap, y: py, align: "left", base: "middle" },
        { key: "upleft", x: px - tile * 0.4, y: py - gap, align: "right", base: "bottom" },
        { key: "upright", x: px + tile * 0.4, y: py - gap, align: "left", base: "bottom" },
        { key: "downleft", x: px - tile * 0.4, y: py + gap + 2, align: "right", base: "top" },
        { key: "downright", x: px + tile * 0.4, y: py + gap + 2, align: "left", base: "top" },
      ];
      const pref = prefer[lm.id];
      if (pref) cands.sort((a, b) => (a.key === pref ? -1 : b.key === pref ? 1 : 0));
      let best = cands[0], bestHits = 99;
      for (const c of cands) {
        const box = boxFrom(lines, c.x, c.y, c.align, c.base);
        let hits = 0;
        for (const b of boxes) if (overlaps(box, b, 4)) hits += 3;
        for (const b of iconBoxes) if (overlaps(box, b, 2)) hits += 1;
        if (box.l < 6 || box.r > viewW - 6 || box.t < 6 || box.b > viewH - 6) hits += 5;
        if (hits < bestHits) { bestHits = hits; best = c; if (hits === 0) break; }
      }
      const placed = boxFrom(lines, best.x, best.y, best.align, best.base);
      boxes.push(placed);
      ctx.textAlign = best.align;
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(8,16,36,0.85)";
      ctx.fillStyle = "#fff8e8";
      const lineH = fs + 3;
      for (let i = 0; i < lines.length; i++) {
        const ly = placed.t + lineH * (i + 0.5);
        ctx.strokeText(lines[i], best.x, ly);
        ctx.fillText(lines[i], best.x, ly);
      }
    }
  }

  function drawHorseIcon(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#fff6d8";
    ctx.strokeStyle = "rgba(8,16,36,0.85)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.05, s * 0.55, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(s * 0.48, -s * 0.28, s * 0.22, s * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-s * 0.4, s * 0.2, s * 0.12, s * 0.38);
    ctx.fillRect(-s * 0.08, s * 0.2, s * 0.12, s * 0.38);
    ctx.fillRect(s * 0.18, s * 0.2, s * 0.12, s * 0.38);
    ctx.fillRect(s * 0.38, s * 0.2, s * 0.12, s * 0.38);
    ctx.restore();
  }

  const HORSE_COLORS = ["#f3dd9a", "#e2c06a", "#cda56a", "#f7e8c4"];

  function cellInFill(x, y) {
    return !!(level && level.areaFillCells && level.areaFillCells.has(x + "," + y));
  }

  function buildHorseTrack() {
    const interior = new Set();
    if (!level || !level.areaFillCells) return null;
    const keys = [];
    for (const key of level.areaFillCells.keys()) keys.push(key);
    for (const key of keys) {
      const p = key.split(",");
      const x = +p[0], y = +p[1];
      let ok = true;
      for (let dx = -1; dx <= 1 && ok; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!cellInFill(x + dx, y + dy)) { ok = false; break; }
        }
      }
      if (ok) interior.add(key);
    }
    function edgeIn(x0, y0, x1, y1) {
      if (x1 - x0 < 10 || y1 - y0 < 8) return false;
      for (let x = x0; x <= x1; x++) {
        if (!interior.has(x + "," + y0) || !interior.has(x + "," + y1)) return false;
      }
      for (let y = y0; y <= y1; y++) {
        if (!interior.has(x0 + "," + y) || !interior.has(x1 + "," + y)) return false;
      }
      return true;
    }
    const tries = [[46, 10, 74, 27], [44, 9, 75, 28], [44, 9, 82, 21], [46, 8, 75, 28], [51, 14, 78, 23]];
    let box = null;
    for (const t of tries) {
      if (edgeIn(t[0], t[1], t[2], t[3])) { box = t; break; }
    }
    if (!box) return { interior: interior, loop: null };
    const x0 = box[0], y0 = box[1], x1 = box[2], y1 = box[3];
    const loop = [];
    for (let x = x0; x < x1; x++) loop.push({ x: x, y: y0, dx: 1, dy: 0 });
    for (let y = y0; y < y1; y++) loop.push({ x: x1, y: y, dx: 0, dy: 1 });
    for (let x = x1; x > x0; x--) loop.push({ x: x, y: y1, dx: -1, dy: 0 });
    for (let y = y1; y > y0; y--) loop.push({ x: x0, y: y, dx: 0, dy: -1 });
    return { interior: interior, loop: loop };
  }

  function initHorses() {
    horses = [];
    if (!level || !level.areaFillCells || !level.areaFillCells.size) return;
    const track = buildHorseTrack();
    if (track && track.loop && track.loop.length >= 16) {
      const n = 4;
      const loop = track.loop;
      const L = loop.length;
      for (let i = 0; i < n; i++) {
        horses.push({
          s: (i * L) / n,
          speed: 0.85 + i * 0.08,
          phase: i * 1.3,
          face: 1,
          color: HORSE_COLORS[i % HORSE_COLORS.length],
          loop: loop,
        });
      }
      placeHorsesOnLoop();
      return;
    }
    // ループが作れないときだけ、エリアの中を折り返して歩く
    const cells = [];
    if (track) {
      for (const key of track.interior) {
        const p = key.split(",");
        cells.push({ x: +p[0], y: +p[1] });
      }
    }
    if (cells.length < 8) return;
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    for (let i = 0; i < 4; i++) {
      const c = cells[(i * 17 + 5) % cells.length];
      horses.push({
        x: c.x, y: c.y,
        dir: dirs[i],
        speed: 0.8 + i * 0.1,
        phase: i * 1.3,
        face: dirs[i].x < 0 ? -1 : 1,
        color: HORSE_COLORS[i % HORSE_COLORS.length],
        interior: track.interior,
      });
    }
  }

  function placeHorsesOnLoop() {
    for (const h of horses) {
      if (!h.loop) continue;
      const L = h.loop.length;
      let s = h.s % L;
      if (s < 0) s += L;
      const i = Math.floor(s) % L;
      const t = s - Math.floor(s);
      const a = h.loop[i];
      const b = h.loop[(i + 1) % L];
      h.x = a.x + (b.x - a.x) * t;
      h.y = a.y + (b.y - a.y) * t;
      if (a.dx) h.face = a.dx;
    }
  }

  function updateHorses(dt) {
    if (!horses.length) return;
    for (const h of horses) {
      h.phase += dt * 9;
      if (h.loop) {
        h.s += h.speed * dt;
        placeHorsesOnLoop();
        continue;
      }
      if (!h.dir) continue;
      h.x += h.dir.x * h.speed * dt;
      h.y += h.dir.y * h.speed * dt;
      if (h.dir.x) h.face = h.dir.x < 0 ? -1 : 1;
      const nx = Math.round(h.x + h.dir.x * 0.55);
      const ny = Math.round(h.y + h.dir.y * 0.55);
      if (!h.interior || !h.interior.has(nx + "," + ny)) {
        h.x = Math.round(h.x);
        h.y = Math.round(h.y);
        const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
        const opts = dirs.filter((d) => d.x !== -h.dir.x || d.y !== -h.dir.y);
        let found = null;
        for (const d of opts) {
          if (h.interior.has(Math.round(h.x + d.x) + "," + Math.round(h.y + d.y))) { found = d; break; }
        }
        if (!found) {
          for (const d of dirs) {
            if (h.interior.has(Math.round(h.x + d.x) + "," + Math.round(h.y + d.y))) { found = d; break; }
          }
        }
        if (found) {
          h.dir = found;
          if (found.x) h.face = found.x < 0 ? -1 : 1;
        } else {
          h.dir = { x: -h.dir.x, y: -h.dir.y };
          if (h.dir.x) h.face = h.dir.x < 0 ? -1 : 1;
        }
      }
    }
  }

  function drawWalkingHorse(h) {
    const ox = -camX * tile, oy = -camY * tile;
    const px = ox + (h.x + 0.5) * tile;
    const bob = Math.sin(h.phase) * tile * 0.06;
    const py = oy + (h.y + 0.5) * tile + bob;
    if (px < -tile * 2 || py < -tile * 2 || px > viewW + tile * 2 || py > viewH + tile * 2) return;
    const s = tile * 0.74;
    ctx.save();
    ctx.translate(px, py);
    if (h.face < 0) ctx.scale(-1, 1);
    const swing = Math.sin(h.phase) * s * 0.16;
    ctx.fillStyle = h.color || "#f0d8a0";
    ctx.strokeStyle = "rgba(8,16,36,0.75)";
    ctx.lineWidth = 1.2;
    // あし（あるく）
    const legs = [
      [-s * 0.32, swing],
      [-s * 0.08, -swing],
      [s * 0.14, swing * 0.85],
      [s * 0.36, -swing * 0.85],
    ];
    ctx.fillStyle = "#6a4a20";
    for (const L of legs) {
      ctx.fillRect(L[0] - s * 0.05, s * 0.12, s * 0.1, s * 0.38 + L[1] * 0.15);
    }
    ctx.fillStyle = h.color || "#f0d8a0";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.02, s * 0.52, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(s * 0.46, -s * 0.26, s * 0.2, s * 0.16, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#5a3a18";
    ctx.beginPath();
    ctx.ellipse(s * 0.58, -s * 0.34, s * 0.08, s * 0.1, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.04);
    ctx.quadraticCurveTo(-s * 0.8, s * 0.04, -s * 0.58, s * 0.28);
    ctx.quadraticCurveTo(-s * 0.42, s * 0.08, -s * 0.42, 0);
    ctx.fill();
    ctx.restore();
  }

  function drawHorses() {
    if (!horses.length) return;
    for (const h of horses) drawWalkingHorse(h);
  }

  function drawAreaLabels() {
    if (!level.areaLabels || !level.areaLabels.length) return;
    const ox = -camX * tile, oy = -camY * tile;
    const fontFamily = "'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Noto Sans CJK JP', sans-serif";
    const fs = Math.max(20, Math.min(32, tile * 0.85));
    ctx.font = "bold " + fs + "px " + fontFamily;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const lb of level.areaLabels) {
      const px = ox + (lb.x + 0.5) * tile;
      const py = oy + (lb.y + 0.5) * tile;
      if (px < -tile * 6 || py < -tile * 5 || px > viewW + tile * 6 || py > viewH + tile * 5) continue;
      const lines = lb.name === "はんしんけいばじょう" ? ["はんしん", "けいばじょう"] : [lb.name];
      const lineH = fs * 1.05;
      const totalH = lineH * lines.length;
      if (lb.icon === "horse") {
        drawHorseIcon(px, py - totalH * 0.5 - tile * 0.45, tile * 0.42);
      }
      const startY = py - (totalH - lineH) / 2 + (lb.icon === "horse" ? tile * 0.12 : 0);
      ctx.lineWidth = Math.max(5, tile * 0.16);
      ctx.strokeStyle = "rgba(8,20,12,0.8)";
      ctx.fillStyle = "#fff8e0";
      for (let i = 0; i < lines.length; i++) {
        const y = startY + i * lineH;
        ctx.strokeText(lines[i], px, y);
        ctx.fillText(lines[i], px, y);
      }
    }
  }

  function rounded(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawPlayer() {
    const ox = -camX * tile, oy = -camY * tile;
    const px = ox + (player.x + 0.5) * tile;
    const py = oy + (player.y + 0.5) * tile;
    const r = tile * 0.42;
    const chomp = dying ? 0.15 : (0.15 + 0.35 * (0.5 + 0.5 * Math.sin(mouth * 14)));
    const face = player.face || player.dir || DIRS.right;
    ctx.save();
    ctx.translate(px, py);
    if (dying) ctx.globalAlpha = Math.max(0, dieT);
    // 左むきは回転せずよこに反転（目は上のまま）
    if (face === DIRS.left) ctx.scale(-1, 1);
    // 口だけ向きを変える。左右は +x、下は +y、上は -y。
    let ang = 0;
    if (face === DIRS.down) ang = Math.PI / 2;
    else if (face === DIRS.up) ang = -Math.PI / 2;
    ctx.fillStyle = "#ffe14a";
    ctx.beginPath();
    ctx.arc(0, 0, r, ang + chomp, ang + Math.PI * 2 - chomp);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    // 目は常にスプライトの上側（左反転後も画面の上）
    let ex, ey;
    if (face === DIRS.up) {
      ex = r * 0.32;
      ey = -r * 0.28;
    } else if (face === DIRS.down) {
      ex = r * 0.2;
      ey = -r * 0.42;
    } else {
      ex = r * 0.2;
      ey = -r * 0.42;
    }
    ctx.fillStyle = "#203060";
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e) {
    const ox = -camX * tile, oy = -camY * tile;
    const px = ox + (e.x + 0.5) * tile;
    const py = oy + (e.y + 0.5) * tile;
    if (px < -tile || py < -tile || px > viewW + tile || py > viewH + tile) return;
    const r = tile * 0.4;
    const frightened = powerT > 0 && !e.eaten;
    const blink = frightened && powerT < 2.2 && Math.floor(flash * 8) % 2 === 0;
    let body = e.color;
    if (e.eaten) body = "rgba(220,230,255,0.0)";
    else if (frightened) body = blink ? "#fff4d0" : "#6aa8ff";
    ctx.save();
    ctx.translate(px, py);
    if (!e.eaten) {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r, Math.PI, 0);
      ctx.lineTo(r, r * 0.75);
      const scallop = 3;
      for (let i = scallop; i >= 0; i--) {
        const sx = -r + (i / scallop) * (r * 2);
        const sy = r * (i % 2 === 0 ? 0.75 : 0.4);
        ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
      // smile when not frightened
      if (!frightened) {
        ctx.strokeStyle = "rgba(40,20,40,0.35)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, r * 0.15, r * 0.28, 0.15, Math.PI - 0.15);
        ctx.stroke();
      }
    }
    // eyes
    const eyesDX = (e.dir && e.dir.x) * r * 0.12;
    const eyesDY = (e.dir && e.dir.y) * r * 0.12;
    const ew = r * 0.22, eh = r * 0.26;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-r * 0.28 + eyesDX, -r * 0.22 + eyesDY, ew, eh, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.28 + eyesDX, -r * 0.22 + eyesDY, ew, eh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = e.eaten || frightened ? "#203060" : "#243a80";
    const pr = r * 0.1;
    ctx.beginPath();
    ctx.arc(-r * 0.28 + eyesDX * 2, -r * 0.22 + eyesDY * 2, pr, 0, Math.PI * 2);
    ctx.arc(r * 0.28 + eyesDX * 2, -r * 0.22 + eyesDY * 2, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMinimap() {
    if (level.fitAll) return;
    const mw = Math.min(128, viewW * 0.32);
    const mh = mw * (level.h / level.w);
    const x0 = viewW - mw - 8;
    const y0 = 8;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = "rgba(6,12,28,0.75)";
    ctx.strokeStyle = "rgba(255,229,102,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    rounded(x0 - 3, y0 - 3, mw + 6, mh + 6, 8);
    ctx.fill();
    ctx.stroke();
    const sx = mw / level.w, sy = mh / level.h;
    if (level.areaFillCells && level.areaFillCells.size) {
      ctx.fillStyle = "#2b5d3a";
      for (const key of level.areaFillCells.keys()) {
        const parts = key.split(",");
        const ax = +parts[0], ay = +parts[1];
        ctx.fillRect(x0 + ax * sx, y0 + ay * sy, sx + 0.4, sy + 0.4);
      }
    }
    ctx.fillStyle = "#2c4c9a";
    for (let y = 0; y < level.h; y++) {
      for (let x = 0; x < level.w; x++) {
        if (level.cells[y][x] === "#") continue;
        ctx.fillRect(x0 + x * sx, y0 + y * sy, sx + 0.4, sy + 0.4);
      }
    }
    for (const lm of level.landmarks) {
      ctx.fillStyle = "#ffe566";
      ctx.fillRect(x0 + lm.x * sx - 1, y0 + lm.y * sy - 1, 3, 3);
    }
    ctx.fillStyle = "#ffe14a";
    ctx.beginPath();
    ctx.arc(x0 + (player.x + 0.5) * sx, y0 + (player.y + 0.5) * sy, 3.2, 0, Math.PI * 2);
    ctx.fill();
    for (const e of enemies) {
      if (e.eaten) continue;
      ctx.fillStyle = powerT > 0 ? "#6aa8ff" : e.color;
      ctx.beginPath();
      ctx.arc(x0 + (e.x + 0.5) * sx, y0 + (e.y + 0.5) * sy, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function worldToScreen(x, y) {
    return { x: (x + 0.5 - camX) * tile, y: (y + 0.5 - camY) * tile };
  }

  let debugFreezeCam = false;
  let debugFreezeEnemies = false;
  let debugInvincible = false;

  function updateCamera() {
    if (!level) return;
    if (debugFreezeCam) return;
    if (level.fitAll) {
      const mazeW = level.w * tile, mazeH = level.h * tile;
      camX = -(viewW - mazeW) / 2 / tile;
      camY = -(viewH - mazeH) / 2 / tile;
      return;
    }
    const vw = viewW / tile, vh = viewH / tile;
    let cx = player.x + 0.5 - vw / 2;
    let cy = player.y + 0.5 - vh / 2;
    cx = Math.max(0, Math.min(level.w - vw, cx));
    cy = Math.max(0, Math.min(level.h - vh, cy));
    if (level.w * tile < viewW) cx = -(viewW - level.w * tile) / 2 / tile;
    if (level.h * tile < viewH) cy = -(viewH - level.h * tile) / 2 / tile;
    camX += (cx - camX) * 0.18;
    camY += (cy - camY) * 0.18;
  }

  function draw() {
    const cw = el.canvas.clientWidth, ch = el.canvas.clientHeight;
    if (cw && ch && (Math.abs(cw - viewW) > 1 || Math.abs(ch - viewH) > 1)) {
      layout();
    }
    if (!level) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0d1b3a";
      ctx.fillRect(0, 0, el.canvas.width, el.canvas.height);
      return;
    }
    updateCamera();
    drawWalls();
    drawAreaLabels();
    drawHorses();
    drawDots();
    drawLandmarks();
    for (const e of enemies) drawEnemy(e);
    drawPlayer();
    drawMinimap();
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    flash += dt;
    mouth += dt;
    if (msgT > 0) {
      msgT -= dt;
      if (msgT <= 0) el.message.textContent = "";
    }
    if (mode === "play" && level) {
      updateHorses(dt);
      if (dying) {
        afterDeath(dt);
      } else {
        if (graceT > 0) graceT -= dt;
        if (powerT > 0) {
          powerT -= dt;
          if (powerT <= 0) eatStreak = 0;
        }
        updatePlayer(dt);
        if (mode === "play") {
          updateEnemies(dt);
          collide();
        }
      }
    }
    draw();
  }

  // ------- input -------
  const KEY_MAP = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down" };
  const heldKeys = new Set();
  let inputSource = null; // "key" | "pad" | "swipe"

  function setWant(name, source) {
    if (!DIRS[name]) return;
    wantDir = DIRS[name];
    if (player) player.face = wantDir;
    if (source) inputSource = source;
  }

  function releaseHeldMove(source) {
    if (source === "key" && heldKeys.size) {
      const last = [...heldKeys][heldKeys.size - 1];
      setWant(last, "key");
      return;
    }
    if (source === "pad" && heldPads.size) {
      const last = [...heldPads][heldPads.size - 1];
      setWant(last, "pad");
      return;
    }
    if (inputSource === source) {
      wantDir = null;
      inputSource = null;
    }
  }

  window.addEventListener("keydown", (e) => {
    const name = KEY_MAP[e.key] || KEY_MAP[e.key.toLowerCase()];
    if (!name) return;
    e.preventDefault();
    unlockAudio();
    heldKeys.add(name);
    setWant(name, "key");
  }, { passive: false });

  window.addEventListener("keyup", (e) => {
    const name = KEY_MAP[e.key] || KEY_MAP[e.key.toLowerCase()];
    if (!name) return;
    heldKeys.delete(name);
    releaseHeldMove("key");
  });

  el.dpad.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest("[data-dir]");
    if (!btn) return;
    e.preventDefault();
    unlockAudio();
    const dir = btn.getAttribute("data-dir");
    heldPads.add(dir);
    btn.classList.add("held");
    setWant(dir, "pad");
  });
  function clearPad(e) {
    const btn = e.target.closest ? e.target.closest("[data-dir]") : null;
    if (btn) {
      const dir = btn.getAttribute("data-dir");
      heldPads.delete(dir);
      btn.classList.remove("held");
      releaseHeldMove("pad");
    }
  }
  el.dpad.addEventListener("pointerup", clearPad);
  el.dpad.addEventListener("pointercancel", clearPad);
  el.dpad.addEventListener("pointerleave", clearPad);

  let swipeX = 0, swipeY = 0, swipeOn = false;
  function onStart(e) {
    unlockAudio();
    const t = e.touches ? e.touches[0] : e;
    swipeOn = true;
    swipeX = t.clientX;
    swipeY = t.clientY;
  }
  function onMove(e) {
    if (!swipeOn) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - swipeX;
    const dy = t.clientY - swipeY;
    if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
    if (Math.abs(dx) > Math.abs(dy)) setWant(dx > 0 ? "right" : "left", "swipe");
    else setWant(dy > 0 ? "down" : "up", "swipe");
    swipeX = t.clientX;
    swipeY = t.clientY;
  }
  function onEnd() { swipeOn = false; }

  const stage = document.getElementById("stage");
  stage.addEventListener("touchstart", onStart, { passive: true });
  stage.addEventListener("touchmove", onMove, { passive: true });
  stage.addEventListener("touchend", onEnd, { passive: true });
  stage.addEventListener("mousedown", onStart);
  window.addEventListener("mousemove", (e) => { if (e.buttons) onMove(e); });
  window.addEventListener("mouseup", onEnd);

  document.addEventListener("touchmove", (e) => {
    if (e.target.closest && e.target.closest(".btn")) return;
    e.preventDefault();
  }, { passive: false });
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault());

  document.querySelectorAll("[data-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      unlockAudio();
      startStage(btn.getAttribute("data-start"));
    });
  });
  el.btnRetry.addEventListener("click", () => { unlockAudio(); startStage(stageId); });
  el.btnTitle.addEventListener("click", () => { unlockAudio(); setUI("title"); draw(); });

  function onViewport() {
    layout();
    if (level) updateCamera();
    draw();
    if (el.fx && el.fx.classList.contains("active") && !prefersReducedMotion()) {
      sizeFxCanvas();
    }
  }
  window.addEventListener("resize", onViewport);
  window.addEventListener("orientationchange", () => {
    setTimeout(onViewport, 50);
    setTimeout(onViewport, 250);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onViewport);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  window.__mazeDebug = {
    triggerLandmarkFx(id) {
      if (!level || !level.landmarks) return false;
      const lm = level.landmarks.find((x) => x.id === id || x.name === id);
      if (!lm) return false;
      playLandmarkFx(lm);
      return true;
    },
    getHorses() {
      return horses.map((h) => ({ x: h.x, y: h.y, face: h.face, speed: h.speed, onLoop: !!h.loop }));
    },
    getFxState() {
      return {
        active: !!(el.fx && el.fx.classList.contains("active")),
        label: el.fxLabel ? el.fxLabel.innerText : "",
        occupying: occupyingLm,
        until: fxActiveUntil,
        reduced: prefersReducedMotion(),
      };
    },
    getLayout() {
      const c = el.canvas;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const cssW = c.clientWidth;
      const cssH = c.clientHeight;
      return {
        landscape: document.documentElement.classList.contains("landscape"),
        viewW: viewW,
        viewH: viewH,
        tile: tile,
        cssW: cssW,
        cssH: cssH,
        bufW: c.width,
        bufH: c.height,
        dpr: dpr,
        stretchX: cssW && c.width ? cssW / (c.width / dpr) : 0,
        stretchY: cssH && c.height ? cssH / (c.height / dpr) : 0,
      };
    },
    getState() {
      if (!player || !level) return null;
      const scr = worldToScreen(player.x, player.y);
      return {
        mode: mode,
        stageId: stageId,
        x: player.x,
        y: player.y,
        dir: player.dir && player.dir.name,
        face: player.face && player.face.name,
        want: wantDir && wantDir.name,
        screenX: scr.x,
        screenY: scr.y,
        camX: camX,
        camY: camY,
        tile: tile,
        viewW: viewW,
        viewH: viewH,
        graceT: graceT,
        enemies: enemies.map((en) => ({
          id: en.id,
          x: en.x,
          y: en.y,
          dir: en.dir && en.dir.name,
        })),
      };
    },
    place(x, y) {
      if (!player) return;
      player.x = x;
      player.y = y;
      player.dir = null;
      wantDir = null;
      inputSource = null;
    },
    setWant(name) { setWant(name, "key"); },
    clearWant() { wantDir = null; inputSource = null; },
    freezeCamera(on) { debugFreezeCam = !!on; },
    snapCamera() {
      if (!level || !player) return;
      const saved = debugFreezeCam;
      debugFreezeCam = false;
      const vw = viewW / tile, vh = viewH / tile;
      let cx = player.x + 0.5 - vw / 2;
      let cy = player.y + 0.5 - vh / 2;
      cx = Math.max(0, Math.min(level.w - vw, cx));
      cy = Math.max(0, Math.min(level.h - vh, cy));
      if (level.w * tile < viewW) cx = -(viewW - level.w * tile) / 2 / tile;
      if (level.h * tile < viewH) cy = -(viewH - level.h * tile) / 2 / tile;
      camX = cx;
      camY = cy;
      debugFreezeCam = saved;
    },
    freezeEnemies(on) { debugFreezeEnemies = !!on; },
    invincible(on) { debugInvincible = !!on; },
    isWalkable(x, y, who) {
      if (!level) return false;
      return !isWallFor(level, Math.round(x), Math.round(y), who || "player");
    },
    canMove(x, y, name) {
      const d = DIRS[name];
      if (!d || !level) return false;
      return !isWallFor(level, Math.round(x) + d.x, Math.round(y) + d.y, "player");
    },
    findCell(name, run) {
      const d = DIRS[name];
      if (!d || !level) return null;
      const need = run == null ? 2 : run;
      const sx = Math.round(level.start.x), sy = Math.round(level.start.y);
      let best = null, bestD = 1e9;
      for (let y = 0; y < level.h; y++) {
        for (let x = 0; x < level.w; x++) {
          if (isWallFor(level, x, y, "player")) continue;
          let ok = true;
          for (let i = 1; i <= need; i++) {
            if (isWallFor(level, x + d.x * i, y + d.y * i, "player")) { ok = false; break; }
          }
          if (!ok) continue;
          const dist = Math.abs(x - sx) + Math.abs(y - sy);
          if (dist < bestD) {
            bestD = dist;
            best = { x: x, y: y };
          }
        }
      }
      return best;
    },
    findTurn(along, turn) {
      const a = DIRS[along], t = DIRS[turn];
      if (!a || !t || !level) return null;
      const sx = Math.round(level.start.x), sy = Math.round(level.start.y);
      let best = null, bestD = 1e9;
      for (let y = 0; y < level.h; y++) {
        for (let x = 0; x < level.w; x++) {
          if (isWallFor(level, x, y, "player")) continue;
          if (isWallFor(level, x + a.x, y + a.y, "player")) continue;
          // along is open on this cell, turn is blocked here, but open on the next along cell
          if (!isWallFor(level, x + t.x, y + t.y, "player")) continue;
          if (isWallFor(level, x + a.x + t.x, y + a.y + t.y, "player")) continue;
          const dist = Math.abs(x - sx) + Math.abs(y - sy);
          if (dist < bestD) {
            bestD = dist;
            best = { x: x, y: y };
          }
        }
      }
      return best;
    },
    worldToScreen: worldToScreen,
    setFace(name) {
      if (!player || !DIRS[name]) return;
      player.face = DIRS[name];
      player.dir = null;
      wantDir = null;
    },
    setMouth(t) { mouth = t; },
    setDying(on, t) { dying = !!on; dieT = t == null ? 1 : t; },
    redraw() { draw(); },
    step(seconds) {
      let left = seconds;
      const slice = 1 / 60;
      while (left > 0.0001) {
        const dt = Math.min(slice, left);
        if (msgT > 0) {
          msgT -= dt;
          if (msgT <= 0 && el.message) el.message.textContent = "";
        }
        if (mode === "play" && level) {
          updateHorses(dt);
          if (dying) {
            afterDeath(dt);
          } else {
            if (graceT > 0) graceT -= dt;
            if (powerT > 0) {
              powerT -= dt;
              if (powerT <= 0) eatStreak = 0;
            }
            updatePlayer(dt);
            if (mode === "play") {
              updateEnemies(dt);
              collide();
            }
            if (!debugFreezeCam) updateCamera();
          }
        }
        left -= dt;
      }
      draw();
    },
  };

  function boot() {
    layout();
    setUI("title");
    draw();
    raf = requestAnimationFrame(frame);
    // じどうスタート（がぞうさつえいよう）
    const q = new URLSearchParams(location.search);
    const auto = q.get("stage");
    if (auto === "classic" || auto === "nigawa") {
      setTimeout(() => startStage(auto), 80);
    }
  }

  fetch("nigawa-maze.json")
    .then((r) => {
      if (!r.ok) throw new Error("maze json " + r.status);
      return r.json();
    })
    .then((data) => {
      nigawaData = data;
      boot();
    })
    .catch((err) => {
      console.error(err);
      nigawaData = null;
      boot();
    });
})();
