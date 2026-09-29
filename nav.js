/* Shared nav for all three Stirrer pages. */
(function () {
  var items = [["/", "Vortex"], ["/furnace/", "Furnace 2D"], ["/3d/", "Furnace 3D"]];
  var path = location.pathname.replace(/index\.html$/, "");
  var css = document.createElement("style");
  css.textContent =
    ".sn{position:relative;z-index:50;display:flex;width:max-content;max-width:100%;margin:0;flex:none;gap:2px;padding:3px;border-radius:999px;background:rgba(13,11,10,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,106,19,.28);font:500 11px/1 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.04em}" +
    ".sn a{color:#c9b8ab;text-decoration:none;padding:7px 11px;border-radius:999px;white-space:nowrap}" +
    ".sn a:hover{color:#fff}.sn a[aria-current=page]{background:#ff6a13;color:#0d0b0a}" +
    "@media(max-width:480px){.sn{font-size:10px}.sn a{padding:6px 8px}}";
  document.head.appendChild(css);
  var nav = document.createElement("nav");
  nav.className = "sn"; nav.setAttribute("aria-label", "Stirrer versions");
  items.forEach(function (it) {
    var a = document.createElement("a"); a.href = it[0]; a.textContent = it[1];
    if (path === it[0]) a.setAttribute("aria-current", "page");
    nav.appendChild(a);
  });
  var host = document.querySelector(".app") || document.body; host.insertBefore(nav, host.firstChild);
})();
