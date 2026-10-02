/* 2D incompressible flow in a rectangular liquid-metal bath (side view).
   Stable Fluids (semi-Lagrangian advection + pressure projection) with:
   - a traveling-wave body force along the floor whose strength decays as exp(-2d/delta)
   - vorticity confinement and weak bulk drag as stand-ins for turbulent mixing
   - a passive dye (alloy / temperature) to measure homogenization.
   Qualitative only. Not validated CFD. */
(function (root) {
  var MU0 = 4e-7 * Math.PI;

  function skinDepth(freqHz, sigma) {
    return Math.sqrt(1 / (Math.PI * freqHz * MU0 * sigma));
  }


  // Force decay rate a (1/m) and skin depth for a field of frequency f.
  // Skin depth only: a = 1/delta. With the pole-pitch limit: alpha^2 = k^2 + i*2/delta^2, k = pi/tau, a = Re(alpha).
  function decay(freq, sigma, pitch, usePitch, slip) {
    var delta = skinDepth(freq, sigma);
    // A melt that is already moving sees a lower slip frequency s*f, so the field penetrates as if delta were 1/sqrt(s) larger.
    var sl = slip > 0 ? Math.min(1, slip) : 1;
    var a = Math.sqrt(sl) / delta;
    if (usePitch) {
      var k2 = Math.pow(Math.PI / pitch, 2), q = 2 * sl / (delta * delta);
      a = Math.sqrt((Math.sqrt(k2 * k2 + q * q) + k2) / 2);
    }
    return { delta: delta, a: a };
  }

  function FluidSim(nx, ny, dx) {
    this.nx = nx; this.ny = ny; this.dx = dx;
    this.W = nx + 2; this.Hh = ny + 2;
    var n = this.W * this.Hh;
    this.u = new Float32Array(n); this.v = new Float32Array(n);
    this.u0 = new Float32Array(n); this.v0 = new Float32Array(n);
    this.c = new Float32Array(n); this.c0 = new Float32Array(n);
    this.p = new Float32Array(n); this.div = new Float32Array(n);
    this.w = new Float32Array(n);
    this.fx = new Float32Array(n); this.fy = new Float32Array(n);
    this.time = 0;
    this.dir = 1;
    this.sharpDye = true;
    this.params = { sigma: 3.8e6, freq: 5, power: 1, drag: 0.03, eps: 3, accel: 0.5, pitch: 0.20, usePitch: false, gap: 0, gapNorm: 1, slip: 1 };
    this.winA = 0.08; this.winB = 0.50;
    this.buildProfile();
    this.resetDye(0.25);
  }

  FluidSim.prototype.IX = function (i, j) { return i + this.W * j; };

  FluidSim.prototype.buildProfile = function () {
    var nx = this.nx, ny = this.ny, dx = this.dx;
    var dr = decay(this.params.freq, this.params.sigma, this.params.pitch, this.params.usePitch, this.params.slip);
    var delta = dr.delta, a = dr.a;
    this.delta = delta;
    this.pen = 1 / a;
    var gf = Math.exp(-2 * a * (this.params.gap || 0)) * (this.params.gapNorm || 1);
    this.gapFactor = gf;
    this.thrustCoef = (delta / 2) * gf * (1 - Math.exp(-2 * a * ny * dx));
    this.profY = new Float32Array(ny + 2);
    for (var j = 1; j <= ny; j++) {
      var d = (j - 0.5) * dx;
      // same thrust normalisation as the 3D model: delta/2 per unit depth at the reference
      this.profY[j] = delta * a * gf * Math.exp(-2 * d * a);
    }
    this.winX = new Float32Array(nx + 2);
    var a = this.winA * nx, b = this.winB * nx, e = 0.04 * nx;
    for (var i = 1; i <= nx; i++) {
      var s1 = smooth((i - a) / e), s2 = smooth((b - i) / e);
      this.winX[i] = s1 * s2;
    }
  };

  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  FluidSim.prototype.resetDye = function (topFraction) {
    var nx = this.nx, ny = this.ny;
    this.topFraction = topFraction;
    this.c.fill(0);
    for (var j = 1; j <= ny; j++) {
      var val = (j > ny * (1 - topFraction)) ? 1 : 0;
      for (var i = 1; i <= nx; i++) this.c[i + this.W * j] = val;
    }
    this.mixTime = 0;
  };

  FluidSim.prototype.setBnd = function (b, x) {
    var nx = this.nx, ny = this.ny, W = this.W, i, j;
    for (j = 1; j <= ny; j++) {
      // left and right walls
      x[0 + W * j] = (b === 1 || b === 2) ? -x[1 + W * j] : x[1 + W * j];
      x[nx + 1 + W * j] = (b === 1 || b === 2) ? -x[nx + W * j] : x[nx + W * j];
    }
    for (i = 1; i <= nx; i++) {
      // floor: no slip
      x[i + W * 0] = (b === 1 || b === 2) ? -x[i + W * 1] : x[i + W * 1];
      // free surface: no penetration, free slip
      x[i + W * (ny + 1)] = (b === 2) ? -x[i + W * ny] : x[i + W * ny];
    }
    x[0] = 0.5 * (x[1] + x[W]);
    x[nx + 1] = 0.5 * (x[nx] + x[nx + 1 + W]);
    x[W * (ny + 1)] = 0.5 * (x[1 + W * (ny + 1)] + x[W * ny]);
    x[nx + 1 + W * (ny + 1)] = 0.5 * (x[nx + W * (ny + 1)] + x[nx + 1 + W * ny]);
  };

  FluidSim.prototype.project = function (iters) {
    var nx = this.nx, ny = this.ny, W = this.W, u = this.u, v = this.v, p = this.p, div = this.div, i, j, k;
    for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var id = i + W * j;
      div[id] = -0.5 * (u[id + 1] - u[id - 1] + v[id + W] - v[id - W]);
    }
    this.setBnd(0, div);
    this.setBnd(0, p);
    for (k = 0; k < iters; k++) {
      for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
        var q = i + W * j;
        p[q] = (div[q] + p[q - 1] + p[q + 1] + p[q - W] + p[q + W]) * 0.25;
      }
      this.setBnd(0, p);
    }
    for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var r = i + W * j;
      u[r] -= 0.5 * (p[r + 1] - p[r - 1]);
      v[r] -= 0.5 * (p[r + W] - p[r - W]);
    }
    this.setBnd(1, u); this.setBnd(2, v);
  };

  FluidSim.prototype.advect = function (b, d, d0, dt) {
    var nx = this.nx, ny = this.ny, W = this.W, u = this.u, v = this.v, i, j;
    var k = dt / this.dx;
    for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var id = i + W * j;
      var x = i - k * u[id], y = j - k * v[id];
      if (x < 0.5) x = 0.5; if (x > nx + 0.5) x = nx + 0.5;
      if (y < 0.5) y = 0.5; if (y > ny + 0.5) y = ny + 0.5;
      var i0 = x | 0, j0 = y | 0, s1 = x - i0, t1 = y - j0, s0 = 1 - s1, t0 = 1 - t1;
      var a = i0 + W * j0;
      d[id] = s0 * (t0 * d0[a] + t1 * d0[a + W]) + s1 * (t0 * d0[a + 1] + t1 * d0[a + 1 + W]);
    }
    this.setBnd(b, d);
  };


  /* MacCormack dye advection with min/max limiter: far less numerical diffusion. */
  FluidSim.prototype.advectMC = function (d, d0, dt) {
    var nx = this.nx, ny = this.ny, W = this.W, u = this.u, v = this.v, n = d.length, i, j;
    if (!this.cf) { this.cf = new Float32Array(n); this.lo = new Float32Array(n); this.hi = new Float32Array(n); }
    var cf = this.cf, lo = this.lo, hi = this.hi, k = dt / this.dx;
    for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var id = i + W * j;
      var x = i - k * u[id], y = j - k * v[id];
      if (x < 0.5) x = 0.5; if (x > nx + 0.5) x = nx + 0.5;
      if (y < 0.5) y = 0.5; if (y > ny + 0.5) y = ny + 0.5;
      var i0 = x | 0, j0 = y | 0, s1 = x - i0, t1 = y - j0, s0 = 1 - s1, t0 = 1 - t1, a = i0 + W * j0;
      var c00 = d0[a], c01 = d0[a + W], c10 = d0[a + 1], c11 = d0[a + 1 + W];
      cf[id] = s0 * (t0 * c00 + t1 * c01) + s1 * (t0 * c10 + t1 * c11);
      lo[id] = Math.min(c00, c01, c10, c11); hi[id] = Math.max(c00, c01, c10, c11);
    }
    this.setBnd(0, cf);
    for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var q = i + W * j;
      var x2 = i + k * u[q], y2 = j + k * v[q];
      if (x2 < 0.5) x2 = 0.5; if (x2 > nx + 0.5) x2 = nx + 0.5;
      if (y2 < 0.5) y2 = 0.5; if (y2 > ny + 0.5) y2 = ny + 0.5;
      var p0 = x2 | 0, q0 = y2 | 0, a1 = x2 - p0, b1 = y2 - q0, a0 = 1 - a1, b0 = 1 - b1, m = p0 + W * q0;
      var back = a0 * (b0 * cf[m] + b1 * cf[m + W]) + a1 * (b0 * cf[m + 1] + b1 * cf[m + 1 + W]);
      var val = cf[q] + 0.5 * (d0[q] - back);
      d[q] = val < lo[q] ? lo[q] : val > hi[q] ? hi[q] : val;
    }
    this.setBnd(0, d);
  };

  FluidSim.prototype.addForces = function (dt) {
    var nx = this.nx, ny = this.ny, W = this.W, u = this.u, v = this.v, w = this.w, dx = this.dx, i, j;
    var P = this.params;
    var amp = P.accel * P.power * this.dir;
    for (j = 1; j <= ny; j++) {
      var py = this.profY[j] * amp;
      for (i = 1; i <= nx; i++) u[i + W * j] += dt * py * this.winX[i];
    }
    // vorticity confinement
    for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var id = i + W * j;
      w[id] = 0.5 * ((v[id + 1] - v[id - 1]) - (u[id + W] - u[id - W])) / dx;
    }
    var eps = P.eps;
    for (j = 2; j < ny; j++) for (i = 2; i < nx; i++) {
      var q = i + W * j;
      var gx = 0.5 * (Math.abs(w[q + 1]) - Math.abs(w[q - 1]));
      var gy = 0.5 * (Math.abs(w[q + W]) - Math.abs(w[q - W]));
      var len = Math.sqrt(gx * gx + gy * gy) + 1e-9;
      u[q] += dt * eps * dx * (gy / len) * w[q];
      v[q] += dt * eps * dx * (-gx / len) * w[q];
    }
    var damp = 1 - P.drag * dt;
    for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) { var z = i + W * j; u[z] *= damp; v[z] *= damp; }
  };

  FluidSim.prototype.step = function (dt) {
    this.addForces(dt);
    this.setBnd(1, this.u); this.setBnd(2, this.v);
    this.project(20);
    this.u0.set(this.u); this.v0.set(this.v);
    this.advect(1, this.u, this.u0, dt);
    this.advect(2, this.v, this.v0, dt);
    this.project(20);
    this.c0.set(this.c);
    if (this.sharpDye) this.advectMC(this.c, this.c0, dt); else this.advect(0, this.c, this.c0, dt);
    this.time += dt;
  };

  FluidSim.prototype.stats = function () {
    var nx = this.nx, ny = this.ny, W = this.W, u = this.u, v = this.v, c = this.c, i, j;
    var vmax = 0, sum = 0, sum2 = 0, n = nx * ny;
    for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var id = i + W * j;
      var s = u[id] * u[id] + v[id] * v[id];
      if (s > vmax) vmax = s;
      sum += c[id]; sum2 += c[id] * c[id];
    }
    var mean = sum / n, varc = Math.max(0, sum2 / n - mean * mean);
    var phi = this.topFraction, sd0 = Math.sqrt(phi * (1 - phi));
    var homog = Math.max(0, Math.min(1, 1 - Math.sqrt(varc) / sd0));
    return { vmax: Math.sqrt(vmax), homog: homog, mean: mean };
  };

  FluidSim.prototype.sample = function (arr, x, y) {
    // x,y in cell units (1..nx, 1..ny)
    var nx = this.nx, ny = this.ny, W = this.W;
    if (x < 0.5) x = 0.5; if (x > nx + 0.5) x = nx + 0.5;
    if (y < 0.5) y = 0.5; if (y > ny + 0.5) y = ny + 0.5;
    var i0 = x | 0, j0 = y | 0, s1 = x - i0, t1 = y - j0, s0 = 1 - s1, t0 = 1 - t1;
    var a = i0 + W * j0;
    return s0 * (t0 * arr[a] + t1 * arr[a + W]) + s1 * (t0 * arr[a + 1] + t1 * arr[a + 1 + W]);
  };

  var api = { FluidSim: FluidSim, skinDepth: skinDepth, decay: decay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EMS = api;
})(typeof window !== 'undefined' ? window : this);
