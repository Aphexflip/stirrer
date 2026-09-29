/* 3D incompressible flow in a rectangular liquid-metal bath.
   Axes: x = along the stirrer's traveling field, y = up, z = across the bath width.
   Stable Fluids (trilinear semi-Lagrangian advection + pressure projection) with:
   - a traveling-wave body force on the floor, decaying as exp(-2d/delta), over a stirrer
     that spans the middle of the width only (so the side walls shape a real 3D flow)
   - 3D vorticity confinement and weak bulk drag as stand-ins for turbulent mixing
   - a passive dye (alloy / temperature) to measure homogenization.
   Qualitative only. Not validated CFD. */
(function (root) {
  var MU0 = 4e-7 * Math.PI;
  function skinDepth(f, sigma) { return Math.sqrt(1 / (Math.PI * f * MU0 * sigma)); }
  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  function Fluid3D(nx, ny, nz, dx) {
    this.nx = nx; this.ny = ny; this.nz = nz; this.dx = dx;
    this.A = nx + 2; this.B = ny + 2; this.C = nz + 2;
    this.sy = this.A; this.sz = this.A * this.B;
    var n = this.A * this.B * this.C; this.n = n;
    var F = function () { return new Float32Array(n); };
    this.u = F(); this.v = F(); this.w = F();
    this.u0 = F(); this.v0 = F(); this.w0 = F();
    this.c = F(); this.c0 = F(); this.p = F(); this.div = F();
    this.wx = F(); this.wy = F(); this.wz = F(); this.wm = F();
    this.time = 0; this.dir = 1;
    this.params = { sigma: 3.8e6, freq: 5, power: 1, drag: 0.03, eps: 3, accel: 0.6 };
    this.winA = 0.08; this.winB = 0.50; this.zA = 0.20; this.zB = 0.80;
    this.buildProfile();
    this.resetDye(0.25);
  }

  Fluid3D.prototype.buildProfile = function () {
    var nx = this.nx, ny = this.ny, nz = this.nz, dx = this.dx;
    var delta = skinDepth(this.params.freq, this.params.sigma);
    this.delta = delta;
    this.prof = new Float32Array(ny + 2);
    for (var j = 1; j <= ny; j++) {
      var d0 = (j - 1) * dx, d1 = j * dx;
      // cell-averaged force so total thrust is kept even when delta is under-resolved
      this.prof[j] = (delta / 2) * (Math.exp(-2 * d0 / delta) - Math.exp(-2 * d1 / delta)) / dx;
    }
    this.winX = new Float32Array(nx + 2);
    var a = this.winA * nx, b = this.winB * nx, e = 0.06 * nx;
    for (var i = 1; i <= nx; i++) this.winX[i] = smooth((i - a) / e) * smooth((b - i) / e);
    this.winZ = new Float32Array(nz + 2);
    var za = this.zA * nz, zb = this.zB * nz, ez = 0.08 * nz;
    for (var k = 1; k <= nz; k++) this.winZ[k] = smooth((k - za) / ez) * smooth((zb - k) / ez);
  };

  Fluid3D.prototype.resetDye = function (topFraction) {
    var nx = this.nx, ny = this.ny, nz = this.nz, A = this.A, sy = this.sy, sz = this.sz;
    this.topFraction = topFraction; this.c.fill(0);
    for (var k = 1; k <= nz; k++) for (var j = 1; j <= ny; j++) {
      var val = (j > ny * (1 - topFraction)) ? 1 : 0;
      for (var i = 1; i <= nx; i++) this.c[i + sy * j + sz * k] = val;
    }
  };

  // b: 1,2,3 velocity components, 0 scalar. no-slip x/z walls and floor, free-slip top.
  Fluid3D.prototype.setBnd = function (b, x) {
    var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz, i, j, k, vel = b > 0;
    for (k = 1; k <= nz; k++) for (j = 1; j <= ny; j++) {
      var r = sy * j + sz * k;
      x[0 + r] = vel ? -x[1 + r] : x[1 + r];
      x[nx + 1 + r] = vel ? -x[nx + r] : x[nx + r];
    }
    for (k = 1; k <= nz; k++) for (i = 1; i <= nx; i++) {
      var q = i + sz * k;
      x[q] = vel ? -x[q + sy] : x[q + sy];
      x[q + sy * (ny + 1)] = (b === 2) ? -x[q + sy * ny] : x[q + sy * ny];
    }
    for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var s = i + sy * j;
      x[s] = vel ? -x[s + sz] : x[s + sz];
      x[s + sz * (nz + 1)] = vel ? -x[s + sz * nz] : x[s + sz * nz];
    }
  };

  Fluid3D.prototype.project = function (iters) {
    var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz;
    var u = this.u, v = this.v, w = this.w, p = this.p, div = this.div, i, j, k, it;
    for (k = 1; k <= nz; k++) for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var id = i + sy * j + sz * k;
      div[id] = -0.5 * (u[id + 1] - u[id - 1] + v[id + sy] - v[id - sy] + w[id + sz] - w[id - sz]);
    }
    this.setBnd(0, div); this.setBnd(0, p);
    for (it = 0; it < iters; it++) {
      for (k = 1; k <= nz; k++) for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
        var q = i + sy * j + sz * k;
        p[q] = (div[q] + p[q - 1] + p[q + 1] + p[q - sy] + p[q + sy] + p[q - sz] + p[q + sz]) * (1 / 6);
      }
      this.setBnd(0, p);
    }
    for (k = 1; k <= nz; k++) for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var r = i + sy * j + sz * k;
      u[r] -= 0.5 * (p[r + 1] - p[r - 1]);
      v[r] -= 0.5 * (p[r + sy] - p[r - sy]);
      w[r] -= 0.5 * (p[r + sz] - p[r - sz]);
    }
    this.setBnd(1, u); this.setBnd(2, v); this.setBnd(3, w);
  };

  Fluid3D.prototype.advect = function (b, d, d0, dt) {
    var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz;
    var u = this.u, v = this.v, w = this.w, k0 = dt / this.dx, i, j, k;
    for (k = 1; k <= nz; k++) for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var id = i + sy * j + sz * k;
      var x = i - k0 * u[id], y = j - k0 * v[id], z = k - k0 * w[id];
      if (x < 0.5) x = 0.5; else if (x > nx + 0.5) x = nx + 0.5;
      if (y < 0.5) y = 0.5; else if (y > ny + 0.5) y = ny + 0.5;
      if (z < 0.5) z = 0.5; else if (z > nz + 0.5) z = nz + 0.5;
      var i0 = x | 0, j0 = y | 0, k0i = z | 0;
      var fx = x - i0, fy = y - j0, fz = z - k0i, gx = 1 - fx, gy = 1 - fy, gz = 1 - fz;
      var a = i0 + sy * j0 + sz * k0i;
      d[id] =
        gz * (gy * (gx * d0[a] + fx * d0[a + 1]) + fy * (gx * d0[a + sy] + fx * d0[a + sy + 1])) +
        fz * (gy * (gx * d0[a + sz] + fx * d0[a + sz + 1]) + fy * (gx * d0[a + sz + sy] + fx * d0[a + sz + sy + 1]));
    }
    this.setBnd(b, d);
  };

  Fluid3D.prototype.addForces = function (dt) {
    var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz, dx = this.dx;
    var u = this.u, v = this.v, w = this.w, wx = this.wx, wy = this.wy, wz = this.wz, wm = this.wm, i, j, k;
    var P = this.params, amp = P.accel * P.power * this.dir;
    for (k = 1; k <= nz; k++) {
      var wzk = this.winZ[k] * amp;
      for (j = 1; j <= ny; j++) {
        var pj = this.prof[j] * wzk;
        for (i = 1; i <= nx; i++) u[i + sy * j + sz * k] += dt * pj * this.winX[i];
      }
    }
    // vorticity
    var inv = 0.5 / dx;
    for (k = 1; k <= nz; k++) for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var id = i + sy * j + sz * k;
      var ox = (w[id + sy] - w[id - sy] - (v[id + sz] - v[id - sz])) * inv;
      var oy = (u[id + sz] - u[id - sz] - (w[id + 1] - w[id - 1])) * inv;
      var oz = (v[id + 1] - v[id - 1] - (u[id + sy] - u[id - sy])) * inv;
      wx[id] = ox; wy[id] = oy; wz[id] = oz; wm[id] = Math.sqrt(ox * ox + oy * oy + oz * oz);
    }
    var eps = P.eps * dx * dt;
    for (k = 2; k < nz; k++) for (j = 2; j < ny; j++) for (i = 2; i < nx; i++) {
      var q = i + sy * j + sz * k;
      var gx = 0.5 * (wm[q + 1] - wm[q - 1]), gy = 0.5 * (wm[q + sy] - wm[q - sy]), gz = 0.5 * (wm[q + sz] - wm[q - sz]);
      var len = Math.sqrt(gx * gx + gy * gy + gz * gz) + 1e-9;
      gx /= len; gy /= len; gz /= len;
      u[q] += eps * (gy * wz[q] - gz * wy[q]);
      v[q] += eps * (gz * wx[q] - gx * wz[q]);
      w[q] += eps * (gx * wy[q] - gy * wx[q]);
    }
    var damp = 1 - P.drag * dt;
    for (k = 1; k <= nz; k++) for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var z = i + sy * j + sz * k; u[z] *= damp; v[z] *= damp; w[z] *= damp;
    }
  };

  Fluid3D.prototype.step = function (dt) {
    this.addForces(dt);
    this.setBnd(1, this.u); this.setBnd(2, this.v); this.setBnd(3, this.w);
    this.project(16);
    this.u0.set(this.u); this.v0.set(this.v); this.w0.set(this.w);
    this.advect(1, this.u, this.u0, dt);
    this.advect(2, this.v, this.v0, dt);
    this.advect(3, this.w, this.w0, dt);
    this.project(16);
    this.c0.set(this.c);
    this.advect(0, this.c, this.c0, dt);
    this.time += dt;
  };

  Fluid3D.prototype.stats = function () {
    var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz;
    var u = this.u, v = this.v, w = this.w, c = this.c, i, j, k, vmax = 0, s1 = 0, s2 = 0, wmax = 0, n = nx * ny * nz;
    for (k = 1; k <= nz; k++) for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
      var id = i + sy * j + sz * k, s = u[id] * u[id] + v[id] * v[id] + w[id] * w[id];
      if (s > vmax) vmax = s;
      var ww = w[id] * w[id]; if (ww > wmax) wmax = ww;
      s1 += c[id]; s2 += c[id] * c[id];
    }
    var mean = s1 / n, varc = Math.max(0, s2 / n - mean * mean), phi = this.topFraction, sd0 = Math.sqrt(phi * (1 - phi));
    return { vmax: Math.sqrt(vmax), crossmax: Math.sqrt(wmax), homog: Math.max(0, Math.min(1, 1 - Math.sqrt(varc) / sd0)), mean: mean };
  };

  Fluid3D.prototype.sample = function (arr, x, y, z) {
    var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz;
    if (x < 0.5) x = 0.5; else if (x > nx + 0.5) x = nx + 0.5;
    if (y < 0.5) y = 0.5; else if (y > ny + 0.5) y = ny + 0.5;
    if (z < 0.5) z = 0.5; else if (z > nz + 0.5) z = nz + 0.5;
    var i0 = x | 0, j0 = y | 0, k0 = z | 0, fx = x - i0, fy = y - j0, fz = z - k0, gx = 1 - fx, gy = 1 - fy, gz = 1 - fz;
    var a = i0 + sy * j0 + sz * k0;
    return gz * (gy * (gx * arr[a] + fx * arr[a + 1]) + fy * (gx * arr[a + sy] + fx * arr[a + sy + 1])) +
      fz * (gy * (gx * arr[a + sz] + fx * arr[a + sz + 1]) + fy * (gx * arr[a + sz + sy] + fx * arr[a + sz + sy + 1]));
  };

  var api = { Fluid3D: Fluid3D, skinDepth: skinDepth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EMS3 = api;
})(typeof window !== 'undefined' ? window : this);
