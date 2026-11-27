(() => {
  "use strict";

  const LIVES0 = 5;
  const PLAYER_SPEED = 5.1;
  const ENEMY_SPEED = { chase: 3.05, ambush: 2.9, random: 2.55, patrol: 2.75, fright: 1.95, eyes: 7.2 };
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
    racecourse: "はんしんけいばじょう",
    mcdonalds: "マクドナルド",
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
    hit() { beep(300, 0.16, "sawtooth", 0.07); beep(180, 0.28, "sawtooth", 0.07, 0.12); },
    clear() { beep(523, 0.12, "square", 0.07, 0); beep(659, 0.12, "square", 0.07, 0.12); beep(784, 0.12, "square", 0.07, 0.24); beep(1046, 0.3, "square", 0.07, 0.36); },
    over() { beep(392, 0.2, "sawtooth", 0.07); beep(311, 0.25, "sawtooth", 0.07, 0.2); beep(196, 0.45, "sawtooth", 0.07, 0.4); },
  };

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
      dir: DIRS.left,
      stuck: false,
    };
    wantDir = DIRS.left;
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

  function updatePlayer(dt) {
    if (dying) return;
    // reverse immediately
    if (wantDir && player.dir && wantDir.x === -player.dir.x && wantDir.y === -player.dir.y) {
      player.dir = wantDir;
    }
    if (nearCenter(player, 0.22) && wantDir && openAhead(player, wantDir, "player")) {
      snapCenter(player);
      player.dir = wantDir;
    }
    const r = moveActor(player, player.dir, PLAYER_SPEED, dt, "player");
    if (r === "blocked") {
      // stay put; if wantDir is open, turn
      if (wantDir && openAhead(player, wantDir, "player")) player.dir = wantDir;
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

  function updateEnemies(dt) {
    const scatterCycle = !powerT && graceT <= 0 && (Math.floor((performance.now() / 1000) % 16) < 4);
    for (const e of enemies) {
      const who = e.eaten ? "eyes" : "enemy";
      const speed = e.eaten
        ? ENEMY_SPEED.eyes
        : powerT > 0
          ? ENEMY_SPEED.fright
          : graceT > 0
            ? 1.2
            : ENEMY_SPEED[e.id] || ENEMY_SPEED.chase;
      e.mode = scatterCycle ? "scatter" : "chase";

      if (nearCenter(e, 0.2)) {
        snapCenter(e);
        const opts = validDirs(e, who, false);
        const tgt = targetFor(e);
        if (tgt && tgt.flee) {
          // maximize distance from player
          const px = Math.round(player.x), py = Math.round(player.y);
          let best = opts[0], bestD = -1;
          for (const d of opts) {
            const nx = e.x + d.x, ny = e.y + d.y;
            const dist = Math.abs(nx - px) + Math.abs(ny - py);
            if (dist > bestD) { bestD = dist; best = d; }
          }
          if (best) e.dir = best;
        } else if (e.id === "random" && !e.eaten && powerT <= 0) {
          e.dir = opts[Math.floor(Math.random() * opts.length)] || e.dir;
        } else if (tgt) {
          e.dir = pickClosest(opts, e, tgt.x, tgt.y) || e.dir;
        } else {
          e.dir = opts[0] || e.dir;
        }
      }
      moveActor(e, e.dir, speed, dt, who);
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
    if (dying || mode !== "play") return;
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

  function layout() {
    const stage = document.getElementById("stage");
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    viewW = Math.max(200, Math.floor(el.canvas.clientWidth || r.width));
    viewH = Math.max(200, Math.floor(el.canvas.clientHeight || r.height));
    el.canvas.width = Math.max(1, Math.floor(viewW * dpr));
    el.canvas.height = Math.max(1, Math.floor(viewH * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (level) {
      if (level.fitAll) {
        tile = Math.floor(Math.min(viewW / level.w, viewH / level.h));
        tile = Math.max(14, tile);
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
    ctx.fillStyle = wallFill;
    for (let y = top; y <= bot; y++) {
      for (let x = left; x <= right; x++) {
        if (level.cells[y][x] !== "#") continue;
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
    ctx.strokeStyle = wallEdge;
    ctx.lineWidth = Math.max(2, tile * 0.12);
    ctx.lineCap = "round";
    for (let y = top; y <= bot; y++) {
      for (let x = left; x <= right; x++) {
        if (level.cells[y][x] !== "#") continue;
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
      } else {
        ctx.fillStyle = lm.visited ? "#ffd9a0" : "#ff9f4a";
        ctx.beginPath();
        rounded(-r * 0.85, -r * 0.7, r * 1.7, r * 1.4, 5);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillRect(-r * 0.35, -r * 0.1, r * 0.7, r * 0.55);
      }
      ctx.restore();
      // label
      const fs = Math.max(15, Math.min(22, tile * 0.62));
      ctx.font = "bold " + fs + "px 'Hiragino Maru Gothic ProN', 'Hiragino Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(8,16,36,0.85)";
      ctx.fillStyle = "#fff8e8";
      const label = lm.name;
      ctx.strokeText(label, px, py - tile * 0.58);
      ctx.fillText(label, px, py - tile * 0.58);
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
    let ang = 0;
    if (player.dir === DIRS.right) ang = 0;
    else if (player.dir === DIRS.down) ang = Math.PI / 2;
    else if (player.dir === DIRS.left) ang = Math.PI;
    else if (player.dir === DIRS.up) ang = -Math.PI / 2;
    ctx.save();
    ctx.translate(px, py);
    if (dying) ctx.globalAlpha = Math.max(0, dieT);
    ctx.fillStyle = "#ffe14a";
    ctx.beginPath();
    ctx.arc(0, 0, r, ang + chomp, ang + Math.PI * 2 - chomp);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    // eye
    const ex = Math.cos(ang - 0.9) * r * 0.45;
    const ey = Math.sin(ang - 0.9) * r * 0.45;
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

  function updateCamera() {
    if (!level) return;
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
  function setWant(name) {
    if (DIRS[name]) wantDir = DIRS[name];
  }

  window.addEventListener("keydown", (e) => {
    const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down" };
    if (map[e.key] || map[e.key.toLowerCase()]) {
      e.preventDefault();
      unlockAudio();
      setWant(map[e.key] || map[e.key.toLowerCase()]);
    }
  }, { passive: false });

  el.dpad.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest("[data-dir]");
    if (!btn) return;
    e.preventDefault();
    unlockAudio();
    const dir = btn.getAttribute("data-dir");
    heldPads.add(dir);
    btn.classList.add("held");
    setWant(dir);
  });
  function clearPad(e) {
    const btn = e.target.closest ? e.target.closest("[data-dir]") : null;
    if (btn) {
      heldPads.delete(btn.getAttribute("data-dir"));
      btn.classList.remove("held");
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
    if (Math.abs(dx) > Math.abs(dy)) setWant(dx > 0 ? "right" : "left");
    else setWant(dy > 0 ? "down" : "up");
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

  window.addEventListener("resize", () => { layout(); draw(); });
  window.addEventListener("orientationchange", () => { setTimeout(() => { layout(); draw(); }, 200); });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

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
