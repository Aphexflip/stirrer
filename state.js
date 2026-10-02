/* Persist slider/select settings in the URL hash so a link reproduces the setup.
   Only control values (numbers/options) are stored. No personal data. */
(function () {
  var ctrls = [].slice.call(document.querySelectorAll('.panel input[type=range], .panel select'))
    .filter(function (c) { return c.id; });
  if (!ctrls.length) return;
  function fire(c) { c.dispatchEvent(new Event(c.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }
  var defs = {};
  ctrls.forEach(function (c) { defs[c.id] = c.tagName === 'SELECT' ? (c.querySelector('option[selected]') || c.options[0]).value : c.defaultValue; });
  // restore
  try {
    var h = location.hash.replace(/^#/, '');
    if (h) {
      var p = new URLSearchParams(h);
      // quality/depth rebuild the sim, so apply them first
      var rank = function (c) { return c.id === 'machine' ? 0 : c.id === 'quality' ? 1 : (c.id === 'depth' || c.id === 'flen' || c.id === 'fwid') ? 2 : 3; };
      var order = ctrls.slice().sort(function (a, b) { return rank(a) - rank(b); });
      order.forEach(function (c) {
        if (!p.has(c.id)) return;
        var v = p.get(c.id);
        if (c.tagName === 'SELECT') { if (![].some.call(c.options, function (o) { return o.value === v; })) return; }
        else { var n = parseFloat(v); if (!isFinite(n)) return; v = String(Math.min(+c.max, Math.max(+c.min, n))); }
        c.value = v; fire(c);
      });
    }
  } catch (e) {}
  // save (debounced)
  var t = null;
  function save() {
    clearTimeout(t);
    t = setTimeout(function () {
      var p = new URLSearchParams();
      ctrls.forEach(function (c) { if (c.value !== defs[c.id]) p.set(c.id, c.value); });
      var s = p.toString();
      try { history.replaceState(null, '', location.pathname + location.search + (s ? '#' + s : '')); } catch (e) {}
    }, 250);
  }
  ctrls.forEach(function (c) { c.addEventListener(c.tagName === 'SELECT' ? 'change' : 'input', save); });
})();

/* Accessibility helpers shared by the solver pages. */
(function () {
  try {
    // Sliders: expose the readout text (e.g. "5.0 Hz") instead of the raw 0-100 position.
    [].forEach.call(document.querySelectorAll('.panel input[type=range]'), function (c) {
      var o = c.id && document.getElementById(c.id + 'Out');
      if (!o) return;
      var sync = function () { c.setAttribute('aria-valuetext', o.textContent); };
      c.addEventListener('input', sync); sync();
    });
    // Announce the regime sentence politely when it changes.
    var reg = document.getElementById('regime');
    if (reg) { reg.setAttribute('role', 'status'); reg.setAttribute('aria-live', 'polite'); }
    // Respect reduced motion: start paused and stop the 3D auto-rotate.
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      var pb = document.getElementById('play');
      if (pb && pb.getAttribute('aria-pressed') === 'false') pb.click();
      if (window.__ems3 && __ems3.view) __ems3.view.auto = false;
    }
    // 3D view: keyboard orbit/zoom.
    var gl = document.getElementById('gl');
    if (gl && window.__ems3 && __ems3.view) {
      var v = __ems3.view;
      gl.setAttribute('tabindex', '0');
      gl.setAttribute('aria-label', gl.getAttribute('aria-label') + '. Focus it, then use arrow keys to orbit and plus or minus to zoom.');
      gl.addEventListener('keydown', function (e) {
        var used = true;
        if (e.key === 'ArrowLeft') v.theta -= 0.12;
        else if (e.key === 'ArrowRight') v.theta += 0.12;
        else if (e.key === 'ArrowUp') v.phi = Math.max(0.15, v.phi - 0.08);
        else if (e.key === 'ArrowDown') v.phi = Math.min(Math.PI * 0.62, v.phi + 0.08);
        else if (e.key === '+' || e.key === '=') v.r = Math.max(1.6, v.r * 0.92);
        else if (e.key === '-' || e.key === '_') v.r = Math.min(7, v.r / 0.92);
        else used = false;
        if (used) { v.auto = false; e.preventDefault(); }
      });
    }
  } catch (e) {}
})();
