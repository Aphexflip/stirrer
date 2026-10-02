/* Generic machine-class presets for the Stirrer pages.
   Illustrative, rounded values for a class of low-frequency, bottom-mounted linear induction stirrers.
   These are NOT product specifications. */
(function () {
  window.EMS_MACHINES = {
    lf: {
      label: 'Low-frequency bottom stirrer',
      furnaceL: 6.0, furnaceW: 3.5, depth: 80,
      stirL: 2.7, stirW: 1.3, stirX: 0.5, offZ: -12,
      gap: 0.45, pitch: 2000, slip: 20, model: '1',
      fmin: 0.1, fmax: 5, freq: 0.8, current: 100, rev: '600',
      accel3: 0.25, accel2: 0.1, step3: 0.25, step2: 0.2, speedup2: 24,
      dx3: [0.09, 0.055], phi: 1.5
    },
    demo: {
      label: 'Compact demo (original)',
      furnaceL: 2.0, furnaceW: 1.0, depth: 80,
      stirL: 0.84, stirW: 0.6, stirX: 0.29, offZ: 0,
      gap: 0, pitch: 200, slip: 100, model: '0',
      fmin: 0.5, fmax: 60, freq: 5, current: 100, rev: '0',
      accel3: 0.6, accel2: 0.5, step3: 0.1, step2: 0.08, speedup2: 4.8,
      dx3: [2 / 56, 2 / 84], phi: 1.12
    }
  };
  // log-scale frequency slider (0..100) for a profile
  window.EMS_freqFromSlider = function (P, s) { return P.fmin * Math.pow(P.fmax / P.fmin, s / 100); };
  window.EMS_sliderFromFreq = function (P, f) { return Math.round(100 * Math.log(f / P.fmin) / Math.log(P.fmax / P.fmin)); };
  window.EMS_fmtHz = function (f) { return (f < 1 ? f.toFixed(2) : f < 10 ? f.toFixed(1) : f.toFixed(0)) + ' Hz'; };
  window.EMS_fmtT = function (t) { return t < 120 ? Math.round(t) + '<small>s</small>' : (t / 60).toFixed(1) + '<small>min</small>'; };
})();
