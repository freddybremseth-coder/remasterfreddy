/* Measure public Re-Master Freddy source arrivals without tracking individuals.
 * The actual referrer URL, searches, conversations and URL queries stay in
 * the browser. An arrival is captured only after RealtyFlow confirms storage.
 */
(function () {
  "use strict";
  var current = window.location;
  if (current.protocol !== "https:" ||
      !/^remaster\.freddybremseth\.com$/i.test(current.hostname)) return;

  var path = current.pathname || "/";
  // This Vite landing is the only independent, indexable public route.
  if (path !== "/") return;
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 220 ||
      /[\x00-\x1f@?#]/.test(path) ||
      /%(?:00|0[0-9a-f]|1[0-9a-f]|2f|3f|23|40)/i.test(path) ||
      /^\/(?:api|app|admin|auth|account|konto|crm|min-side|nedlasting|avtale|checkout|private)(?:\/|\.|$)/i.test(path) ||
      /(?:^|\/)(?:nedlasting|avtale)(?:\.html)?$/i.test(path)) return;

  var raw = document.referrer || "";
  if (!raw || raw.length > 4096) return;
  var source;
  var host;
  try {
    var origin = new URL(raw);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.port) return;
    host = origin.hostname.toLowerCase();
    var known = [
      [/^gemini\.google\.com$/i, "google_gemini"],
      [/(^|\.)google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/i, "google_search"],
      [/(^|\.)bing\.com$/i, "bing_search"],
      [/(^|\.)chatgpt\.com$/i, "chatgpt"],
      [/^copilot\.microsoft\.com$/i, "microsoft_copilot"],
      [/(^|\.)perplexity\.ai$/i, "perplexity"],
      [/^search\.brave\.com$/i, "brave_search"],
      [/(^|\.)duckduckgo\.com$/i, "duckduckgo"]
    ];
    for (var i = 0; i < known.length; i++) {
      if (known[i][0].test(host)) { source = known[i][1]; break; }
    }
    if (!source) return;
  } catch (_) { return; }

  var storageKey = "remaster:search-discovery:" + path + ":" + source;
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
  } catch (_) {
    // Unavailable session storage is not evidence that a visit was measured.
  }

  void fetch("https://realtyflow.chatgenius.pro/api/public/search-discovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: path, referrer: "https://" + host + "/" }),
    keepalive: true
  }).then(function (response) {
    if (response.status !== 204) return;
    try { window.sessionStorage.setItem(storageKey, "1"); } catch (_) {}
  }).catch(function () {});
})();
