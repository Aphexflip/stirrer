/* Foundry: an Opus-Magnum-flavored puzzle mode for the Stirrer melt.
   Same point-vortex coil physics as the sandbox, plus:
   - obstacles (refractory blocks) particles bounce off
   - one or more spouts pouring colored melt
   - mold zones that must hold a sustained fill of the right color
   - a coil budget, and cost/time/area scoring against a par, like
     Opus Magnum's cost/cycles/area readout.
   Sim runs continuously from level load; there's no separate "verify"
   phase, you just watch your design work (or not) in real time. */
(function () {
  'use strict';

  var MAT = { A: '#ffb03a', B: '#7ee787' };   // material colors (kept apart from coil pos/neg colors)
  var POS = '#5ad1ff', NEG = '#c58bff';
  var BRICK = '#4a3a2d', BRICK_LINE = '#6b5642';
  var DENSITY = 0.18;     // how concentrated a mold must be, relative to tank average, to read "full"
  var HOLD_FRAMES = 60;   // ~1s at 60fps of sustained fill to lock a mold
  var FILL_THRESHOLD = 0.15; // fillEMA needed before hold time accrues
  var CONSUME_FRAMES = 50; // how long a particle lingers in its mold before being "delivered" and recycled
  var MAX_LIFE = 9000;    // hard respawn cap so a lost particle can't wander forever (transit can legitimately take 20-30s+)

  var LEVELS = [
    {
      id: 'first-pour', name: 'First Pour', budget: 3,
      hint: 'The melt pours in top-left and needs to land in the mold bottom-right. Click empty tank to drop a coil, drag to move it, tap to flip its spin.',
      spouts: [{ x: .20, y: .28, color: MAT.A }],
      molds: [{ x: .70, y: .70, r: .17, color: MAT.A }],
      obstacles: [],
      par: { cost: 2, cycles: 10, area: 6 }
    },
    {
      id: 'around-the-pillar', name: 'Around the Pillar', budget: 3,
      hint: 'A refractory pillar blocks the straight line. Route the flow around it.',
      spouts: [{ x: .18, y: .5, color: MAT.A }],
      molds: [{ x: .64, y: .5, r: .19, color: MAT.A }],
      obstacles: [{ x: .42, y: .22, w: .14, h: .56 }],
      par: { cost: 3, cycles: 14, area: 10 }
    },
    {
      id: 'thread-the-needle', name: 'Thread the Needle', budget: 3,
      hint: 'Weave the pour through the gap between the blocks.',
      spouts: [{ x: .20, y: .20, color: MAT.A }],
      molds: [{ x: .60, y: .60, r: .19, color: MAT.A }],
      obstacles: [
        { x: .32, y: 0, w: .12, h: .38 },
        { x: .56, y: .62, w: .12, h: .38 }
      ],
      par: { cost: 3, cycles: 16, area: 8 }
    },
    {
      id: 'two-metals', name: 'Two Metals', budget: 5,
      hint: 'Two pours, two molds, opposite colors. Keep them apart or the molds read contaminated and never fill.',
      spouts: [{ x: .18, y: .30, color: MAT.A }, { x: .18, y: .70, color: MAT.B }],
      molds: [{ x: .70, y: .30, r: .15, color: MAT.A }, { x: .70, y: .70, r: .15, color: MAT.B }],
      obstacles: [
        { x: .44, y: 0, w: .06, h: .44 },
        { x: .44, y: .56, w: .06, h: .44 }
      ],
      par: { cost: 5, cycles: 18, area: 16 }
    },
    {
      id: 'the-long-pour', name: 'The Long Pour', budget: 1,
      hint: 'One coil. A single coil doesn’t pull melt toward it, it sweeps melt around it in a circle. Find the spot equally far from the spout and the mold, so that circle passes through both.',
      spouts: [{ x: .32, y: .32, color: MAT.A }],
      molds: [{ x: .77, y: .80, r: .20, color: MAT.A }],
      obstacles: [],
      par: { cost: 1, cycles: 20, area: 2 }
    },
    {
      id: 'split-stream', name: 'Split Stream', budget: 4,
      hint: 'One spout, two molds, same metal. Split the pour so both fill at once, not one after the other.',
      spouts: [{ x: .20, y: .5, color: MAT.A }],
      molds: [{ x: .70, y: .30, r: .15, color: MAT.A }, { x: .70, y: .70, r: .15, color: MAT.A }],
      obstacles: [],
      par: { cost: 4, cycles: 22, area: 18 }
    }
  ];

  var PROGRESS_KEY = 'foundry:progress';
  function loadProgress() { try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch (e) { return {}; } }
  function saveProgress(p) { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) {} }
  var progress = loadProgress();

  var stage = document.getElementById('stage');
  var trail = document.getElementById('trail'), ui = document.getElementById('ui');
  var tctx = trail.getContext('2d'), uctx = ui.getContext('2d');
  var hintEl = document.getElementById('hint');
  var coilStat = document.getElementById('coilStat');
  var timerEl = document.getElementById('timer');
  var moldChips = document.getElementById('moldChips');
  var levelSelect = document.getElementById('levelSelect');
  var winPanel = document.getElementById('winPanel');
  var resetBtn = document.getElementById('resetRun');
  var clearBtn = document.getElementById('clearCoils');
  var levelsBtn = document.getElementById('levelsBtn');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, dpr = 1, pad = 20, innerW = 1, innerH = 1;
  var t = 0, levelIdx = 0, level = null;
  var coils = [], particles = [], moldState = [];
  var runFrames = 0, solved = false;
  var selected = -1, drag = null;

  function toPx(nx, ny) { return { x: pad + nx * innerW, y: pad + ny * innerH }; }
  function obstaclePx(o) { return { x: pad + o.x * innerW, y: pad + o.y * innerH, w: o.w * innerW, h: o.h * innerH }; }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    [trail, ui].forEach(function (c) { c.width = W * dpr; c.height = H * dpr; });
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    uctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    innerW = Math.max(1, W - 2 * pad); innerH = Math.max(1, H - 2 * pad);
    tctx.fillStyle = '#0a0807'; tctx.fillRect(0, 0, W, H);
  }

  function particleCount() {
    return Math.max(600, Math.min(2200, Math.round(W * H / 260)));
  }

  function spawnAt(spoutIdx) {
    var s = level.spouts[spoutIdx];
    var p0 = toPx(s.x, s.y);
    return {
      x: p0.x + (Math.random() - .5) * 6, y: p0.y + (Math.random() - .5) * 6,
      px: p0.x, py: p0.y, vx: (Math.random() - .5) * .6, vy: (Math.random() - .5) * .6,
      color: s.color, spout: spoutIdx, life: MAX_LIFE * (.4 + Math.random() * .6), consumeT: 0
    };
  }

  function loadLevel(idx) {
    levelIdx = Math.max(0, Math.min(LEVELS.length - 1, idx));
    level = LEVELS[levelIdx];
    coils = [];
    selected = -1; drag = null;
    runFrames = 0; solved = false;
    t = 0;
    moldState = level.molds.map(function () { return { fillEMA: 0, hold: 0, locked: false }; });
    winPanel.hidden = true;
    hintEl.textContent = level.hint;
    buildMoldChips();
    // hint/mold-chip text can change header or controls height, which resizes
    // the stage; re-measure the canvas against that *before* placing anything
    // in tank coordinates, or every toPx() in this level is silently wrong.
    resize();
    var N = particleCount();
    particles = [];
    for (var i = 0; i < N; i++) particles.push(spawnAt(i % level.spouts.length));
    updateHUD();
  }

  function buildMoldChips() {
    moldChips.innerHTML = '';
    level.molds.forEach(function (m, i) {
      var chip = document.createElement('div');
      chip.className = 'moldchip';
      chip.innerHTML = '<i class="swatch" style="background:' + m.color + '"></i><span class="bar"><span class="fill" id="mfill' + i + '"></span></span>';
      moldChips.appendChild(chip);
    });
  }

  function updateHUD() {
    coilStat.textContent = coils.length + '/' + level.budget;
    var secs = (runFrames / 60);
    timerEl.textContent = secs.toFixed(1) + 's';
    for (var i = 0; i < moldState.length; i++) {
      var el = document.getElementById('mfill' + i);
      if (!el) continue;
      var pct = Math.round(Math.min(1, moldState[i].fillEMA) * 100);
      el.style.width = pct + '%';
      el.style.background = moldState[i].locked ? '#8fffb0' : level.molds[i].color;
    }
  }

  function insideObstacle(x, y, margin) {
    margin = margin || 0;
    for (var i = 0; i < level.obstacles.length; i++) {
      var b = obstaclePx(level.obstacles[i]);
      if (x > b.x - margin && x < b.x + b.w + margin && y > b.y - margin && y < b.y + b.h + margin) return true;
    }
    return false;
  }

  function resolveObstacles(p) {
    for (var i = 0; i < level.obstacles.length; i++) {
      var b = obstaclePx(level.obstacles[i]);
      if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) {
        var left = p.x - b.x, right = (b.x + b.w) - p.x, top = p.y - b.y, bottom = (b.y + b.h) - p.y;
        var m = Math.min(left, right, top, bottom);
        if (m === left) { p.x = b.x; p.vx = -Math.abs(p.vx) * .4; }
        else if (m === right) { p.x = b.x + b.w; p.vx = Math.abs(p.vx) * .4; }
        else if (m === top) { p.y = b.y; p.vy = -Math.abs(p.vy) * .4; }
        else { p.y = b.y + b.h; p.vy = Math.abs(p.vy) * .4; }
      }
    }
  }

  function step() {
    if (!level) return;
    t += 1;
    if (!solved) runFrames += 1;
    var G = 2000, c2 = 56 * 56;
    var cp = coils.map(function (c) { return toPx(c.x, c.y); });
    var mp = level.molds.map(function (m) { return { p: toPx(m.x, m.y), r: m.r * Math.min(innerW, innerH), color: m.color }; });
    var tankArea = innerW * innerH;
    var moldCounts = mp.map(function () { return 0; });

    var buckets = { dim: [], bright: [] };
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var tx = 0, ty = 0;
      for (var j = 0; j < cp.length; j++) {
        var dx = p.x - cp[j].x, dy = p.y - cp[j].y;
        var d2 = dx * dx + dy * dy + 1;
        var f = G * coils[j].s * (0.5 + 0.5 * Math.exp(-d2 / (c2 * 25))) / (d2 + c2);
        tx += -dy * f; ty += dx * f;
      }
      tx += 0.10 * Math.sin(p.y * 0.017 + t * 0.011);
      ty += 0.10 * Math.cos(p.x * 0.017 - t * 0.009);
      p.vx += (tx - p.vx) * 0.08 + (Math.random() - .5) * 0.02;
      p.vy += (ty - p.vy) * 0.08 + (Math.random() - .5) * 0.02;
      p.px = p.x; p.py = p.y;
      p.x += p.vx; p.y += p.vy;

      if (p.x < pad) { p.x = pad; p.vx = Math.abs(p.vx) * .4; }
      else if (p.x > pad + innerW) { p.x = pad + innerW; p.vx = -Math.abs(p.vx) * .4; }
      if (p.y < pad) { p.y = pad; p.vy = Math.abs(p.vy) * .4; }
      else if (p.y > pad + innerH) { p.y = pad + innerH; p.vy = -Math.abs(p.vy) * .4; }
      resolveObstacles(p);

      var inMold = false;
      for (var k = 0; k < mp.length; k++) {
        var mdx = p.x - mp[k].p.x, mdy = p.y - mp[k].p.y;
        if (mdx * mdx + mdy * mdy <= mp[k].r * mp[k].r && mp[k].color === p.color) {
          moldCounts[k]++;
          inMold = true;
          p.consumeT++;
          if (p.consumeT > CONSUME_FRAMES) {
            var q = spawnAt(p.spout);
            for (var kk in q) p[kk] = q[kk];
          }
          break;
        }
      }
      if (!inMold) p.consumeT = Math.max(0, p.consumeT - 1);

      if (--p.life < 0) { var q2 = spawnAt(p.spout); for (var kk2 in q2) p[kk2] = q2[kk2]; }

      var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      (sp > 1.1 ? buckets.bright : buckets.dim).push(p);
    }

    tctx.fillStyle = reduce ? 'rgba(10,8,7,0.3)' : 'rgba(10,8,7,0.1)';
    tctx.fillRect(0, 0, W, H);
    tctx.lineWidth = 1.3; tctx.lineCap = 'round';
    ['dim', 'bright'].forEach(function (key) {
      var arr = buckets[key];
      if (!arr.length) return;
      var byColor = {};
      arr.forEach(function (p) { (byColor[p.color] = byColor[p.color] || []).push(p); });
      Object.keys(byColor).forEach(function (col) {
        tctx.globalAlpha = key === 'bright' ? 1 : .55;
        tctx.strokeStyle = col;
        tctx.beginPath();
        byColor[col].forEach(function (p) { tctx.moveTo(p.px, p.py); tctx.lineTo(p.x + 0.01, p.y); });
        tctx.stroke();
      });
    });
    tctx.globalAlpha = 1;

    var allLocked = true;
    for (var m = 0; m < mp.length; m++) {
      var moldAreaPx = Math.PI * mp[m].r * mp[m].r;
      var desired = Math.max(5, particles.length * (moldAreaPx / tankArea) * DENSITY);
      var instant = Math.min(1.15, moldCounts[m] / desired);
      var st = moldState[m];
      st.fillEMA += (instant - st.fillEMA) * 0.05;
      if (st.fillEMA >= FILL_THRESHOLD) st.hold = Math.min(HOLD_FRAMES, st.hold + 1);
      else st.hold = Math.max(0, st.hold - 0.4);
      if (st.hold >= HOLD_FRAMES) st.locked = true;
      if (!st.locked) allLocked = false;
    }
    if (allLocked && !solved) onSolved();

    if (t % 6 === 0) updateHUD();
    window.__dbg = { t: t, moldCounts: moldCounts, moldState: moldState, particles: particles.length, coils: coils, mp: mp, sample: { x: particles[0].x, y: particles[0].y, vx: particles[0].vx, vy: particles[0].vy } };
  }

  function onSolved() {
    solved = true;
    var xs = coils.map(function (c) { return c.x; }), ys = coils.map(function (c) { return c.y; });
    var area = coils.length ? ((Math.max.apply(null, xs) - Math.min.apply(null, xs) + .04) *
      (Math.max.apply(null, ys) - Math.min.apply(null, ys) + .04) * 100) : 1;
    var cost = coils.length, cycles = runFrames / 60;
    var ratio = 0.5 * (cost / level.par.cost) + 0.5 * (cycles / level.par.cycles);
    if (area > level.par.area * 1.5) ratio = Math.max(ratio, area / (level.par.area * 2));
    var stars = ratio <= 0.85 ? 3 : ratio <= 1.15 ? 2 : 1;

    var prev = progress[level.id];
    if (!prev || stars > prev.stars || (stars === prev.stars && cost + cycles < prev.cost + prev.cycles)) {
      progress[level.id] = { stars: stars, cost: cost, cycles: Math.round(cycles * 10) / 10, area: Math.round(area * 10) / 10 };
      saveProgress(progress);
    }
    showWin(stars, cost, cycles, area);
  }

  function showWin(stars, cost, cycles, area) {
    var starStr = '★★★'.slice(0, stars) + '☆☆☆'.slice(0, 3 - stars);
    winPanel.innerHTML =
      '<div class="panelCard">' +
      '<div class="stars">' + starStr + '</div>' +
      '<h2>' + level.name + ' — poured!</h2>' +
      '<div class="metrics">' +
      '<div><b>' + cost + '</b><span>coils · par ' + level.par.cost + '</span></div>' +
      '<div><b>' + cycles.toFixed(1) + 's</b><span>time · par ' + level.par.cycles + 's</span></div>' +
      '<div><b>' + area.toFixed(1) + '</b><span>area · par ' + level.par.area + '</span></div>' +
      '</div>' +
      '<div class="winRow">' +
      '<button id="retryBtn">Retry</button>' +
      (levelIdx < LEVELS.length - 1 ? '<button id="nextBtn">Next level</button>' : '') +
      '<button id="levelsBtn2">Levels</button>' +
      '</div></div>';
    winPanel.hidden = false;
    document.getElementById('retryBtn').onclick = function () { loadLevel(levelIdx); };
    document.getElementById('levelsBtn2').onclick = openLevelSelect;
    var nb = document.getElementById('nextBtn');
    if (nb) nb.onclick = function () { loadLevel(levelIdx + 1); };
  }

  function drawUI() {
    uctx.clearRect(0, 0, W, H);
    if (!level) return;
    uctx.strokeStyle = 'rgba(255,106,19,0.22)'; uctx.lineWidth = 2;
    uctx.beginPath();
    if (uctx.roundRect) uctx.roundRect(pad - 4, pad - 4, innerW + 8, innerH + 8, 22); else uctx.rect(pad - 4, pad - 4, innerW + 8, innerH + 8);
    uctx.stroke();

    level.obstacles.forEach(function (o) {
      var b = obstaclePx(o);
      uctx.fillStyle = BRICK; uctx.strokeStyle = BRICK_LINE; uctx.lineWidth = 1.5;
      uctx.beginPath();
      if (uctx.roundRect) uctx.roundRect(b.x, b.y, b.w, b.h, 6); else uctx.rect(b.x, b.y, b.w, b.h);
      uctx.fill(); uctx.stroke();
    });

    level.spouts.forEach(function (s) {
      var p = toPx(s.x, s.y);
      var g = uctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 26);
      g.addColorStop(0, s.color + 'aa'); g.addColorStop(1, s.color + '00');
      uctx.fillStyle = g; uctx.beginPath(); uctx.arc(p.x, p.y, 26, 0, 7); uctx.fill();
      uctx.fillStyle = s.color; uctx.beginPath(); uctx.arc(p.x, p.y, 5, 0, 7); uctx.fill();
      uctx.strokeStyle = s.color; uctx.lineWidth = 1.5;
      uctx.beginPath(); uctx.moveTo(p.x - 8, p.y - 12); uctx.lineTo(p.x, p.y - 2); uctx.lineTo(p.x + 8, p.y - 12); uctx.stroke();
    });

    level.molds.forEach(function (m, i) {
      var p = toPx(m.x, m.y), r = m.r * Math.min(innerW, innerH);
      var st = moldState[i];
      uctx.setLineDash([5, 5]);
      uctx.strokeStyle = m.color + (st.locked ? 'ff' : '88'); uctx.lineWidth = 2;
      uctx.beginPath(); uctx.arc(p.x, p.y, r, 0, 7); uctx.stroke();
      uctx.setLineDash([]);
      uctx.strokeStyle = st.locked ? '#8fffb0' : m.color; uctx.lineWidth = 4;
      uctx.beginPath(); uctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + Math.min(1, st.fillEMA) * 2 * Math.PI);
      uctx.stroke();
      if (st.locked) {
        uctx.fillStyle = '#8fffb0'; uctx.font = '700 16px sans-serif'; uctx.textAlign = 'center'; uctx.textBaseline = 'middle';
        uctx.fillText('✓', p.x, p.y);
      }
    });

    for (var i = 0; i < coils.length; i++) {
      var c = coils[i], p = toPx(c.x, c.y);
      var col = c.s > 0 ? POS : NEG;
      var pulse = 0.5 + 0.5 * Math.sin(t * 0.12 + i);
      var g = uctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 30 + pulse * 8);
      g.addColorStop(0, col + '66'); g.addColorStop(1, col + '00');
      uctx.fillStyle = g; uctx.beginPath(); uctx.arc(p.x, p.y, 30 + pulse * 8, 0, 7); uctx.fill();
      uctx.strokeStyle = col; uctx.lineWidth = 2;
      uctx.beginPath(); uctx.arc(p.x, p.y, 15, 0, 7); uctx.stroke();
      uctx.beginPath(); uctx.arc(p.x, p.y, 9, 0, 7); uctx.stroke();
      uctx.fillStyle = col; uctx.beginPath(); uctx.arc(p.x, p.y, 3, 0, 7); uctx.fill();
      var a = c.s > 0 ? -0.6 : -2.55;
      var ax = p.x + Math.cos(a) * 15, ay = p.y + Math.sin(a) * 15;
      var d = c.s > 0 ? 1 : -1;
      var tvx = -Math.sin(a) * d, tvy = Math.cos(a) * d;
      uctx.beginPath();
      uctx.moveTo(ax + tvx * 6, ay + tvy * 6);
      uctx.lineTo(ax - tvx * 1 + Math.cos(a) * 4, ay - tvy * 1 + Math.sin(a) * 4);
      uctx.lineTo(ax - tvx * 1 - Math.cos(a) * 4, ay - tvy * 1 - Math.sin(a) * 4);
      uctx.closePath(); uctx.fill();

      if (i === selected) {
        uctx.strokeStyle = '#ff6a13'; uctx.lineWidth = 1.5; uctx.setLineDash([3, 3]);
        uctx.beginPath(); uctx.arc(p.x, p.y, 22, 0, 7); uctx.stroke(); uctx.setLineDash([]);
        var tp = trashPx(i);
        uctx.fillStyle = '#2a1410'; uctx.strokeStyle = '#ff6a13'; uctx.lineWidth = 1.5;
        uctx.beginPath(); uctx.arc(tp.x, tp.y, 11, 0, 7); uctx.fill(); uctx.stroke();
        uctx.strokeStyle = '#ff6a13'; uctx.lineWidth = 2; uctx.lineCap = 'round';
        uctx.beginPath(); uctx.moveTo(tp.x - 4, tp.y - 4); uctx.lineTo(tp.x + 4, tp.y + 4);
        uctx.moveTo(tp.x + 4, tp.y - 4); uctx.lineTo(tp.x - 4, tp.y + 4); uctx.stroke();
      }
    }
  }

  function trashPx(i) {
    var p = toPx(coils[i].x, coils[i].y);
    return { x: p.x + 24, y: p.y - 24 };
  }

  function loop() { step(); drawUI(); requestAnimationFrame(loop); }

  // ---- input ----
  function pos(e) { var r = ui.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function hitCoil(m) {
    for (var i = coils.length - 1; i >= 0; i--) {
      var p = toPx(coils[i].x, coils[i].y);
      if ((m.x - p.x) * (m.x - p.x) + (m.y - p.y) * (m.y - p.y) < 30 * 30) return i;
    }
    return -1;
  }
  function hitTrash(m) {
    if (selected < 0) return false;
    var tp = trashPx(selected);
    return (m.x - tp.x) * (m.x - tp.x) + (m.y - tp.y) * (m.y - tp.y) < 14 * 14;
  }

  ui.addEventListener('pointerdown', function (e) {
    if (!level || !winPanel.hidden) return;
    var m = pos(e);
    if (hitTrash(m)) {
      coils.splice(selected, 1); selected = -1; updateHUD();
      return;
    }
    var i = hitCoil(m);
    if (i >= 0) {
      drag = { i: i, sx: m.x, sy: m.y, moved: false };
      ui.classList.add('drag');
      try { ui.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    if (coils.length >= level.budget) return;
    if (m.x < pad || m.x > pad + innerW || m.y < pad || m.y > pad + innerH) return;
    if (insideObstacle(m.x, m.y, 16)) return;
    var nx = (m.x - pad) / innerW, ny = (m.y - pad) / innerH;
    coils.push({ x: nx, y: ny, s: 1 });
    selected = coils.length - 1;
    updateHUD();
  });
  ui.addEventListener('pointermove', function (e) {
    if (!level) return;
    var m = pos(e);
    if (!drag) { ui.style.cursor = (hitCoil(m) >= 0 || hitTrash(m)) ? 'grab' : 'default'; return; }
    if (Math.abs(m.x - drag.sx) + Math.abs(m.y - drag.sy) > 4) drag.moved = true;
    if (insideObstacle(m.x, m.y, 16)) return;
    var c = coils[drag.i];
    c.x = Math.max(0, Math.min(1, (m.x - pad) / innerW));
    c.y = Math.max(0, Math.min(1, (m.y - pad) / innerH));
  });
  function end() {
    if (drag) {
      if (!drag.moved) coils[drag.i].s *= -1;
      selected = drag.i;
    }
    drag = null; ui.classList.remove('drag');
  }
  ui.addEventListener('pointerup', end);
  ui.addEventListener('pointercancel', function () { drag = null; ui.classList.remove('drag'); });

  resetBtn.addEventListener('click', function () {
    runFrames = 0; solved = false; t = 0;
    moldState = level.molds.map(function () { return { fillEMA: 0, hold: 0, locked: false }; });
    var N = particleCount();
    particles = [];
    for (var i = 0; i < N; i++) particles.push(spawnAt(i % level.spouts.length));
    tctx.fillStyle = '#0a0807'; tctx.fillRect(0, 0, W, H);
    winPanel.hidden = true;
    updateHUD();
  });
  clearBtn.addEventListener('click', function () { coils = []; selected = -1; updateHUD(); });
  levelsBtn.addEventListener('click', openLevelSelect);

  function openLevelSelect() {
    winPanel.hidden = true;
    levelSelect.innerHTML = '<div class="panelCard"><h2>Foundry</h2><p class="sub">Steer molten metal with coils, like the sandbox — but now the melt needs to land somewhere.</p><div class="levelGrid" id="levelGrid"></div></div>';
    var grid = document.getElementById('levelGrid');
    LEVELS.forEach(function (lv, i) {
      var best = progress[lv.id];
      var card = document.createElement('button');
      card.className = 'levelCard';
      var starStr = best ? ('★★★'.slice(0, best.stars) + '☆☆☆'.slice(0, 3 - best.stars)) : '☆☆☆';
      card.innerHTML = '<span class="lvNum">' + (i + 1) + '</span><span class="lvName">' + lv.name + '</span><span class="lvStars">' + starStr + '</span>';
      card.addEventListener('click', function () { levelSelect.hidden = true; loadLevel(i); });
      grid.appendChild(card);
    });
    levelSelect.hidden = false;
  }

  window.addEventListener('resize', resize);
  resize();
  openLevelSelect();
  loop();
})();
