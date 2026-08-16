// dsh-genshin-lisa-notice — browser half (web client module bundle).
// Format: window.__ModuleLoader__.load({ id, factory }) — the web boot
// protocol's registration handoff. The factory receives a synchronous
// require and returns the module's exports; the cordis plugin exported here
// is { name, inject, apply }.
window.__ModuleLoader__.load({ id: "dsh-genshin-lisa-notice", factory: (require) => {

  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  var POLL_INTERVAL_MS = 700;
  var POLL_PATH = "/dsh-genshin-lisa-notice/poll";
  var AUDIO_PATH = "/dsh-genshin-lisa-notice/alert.mp3";

  var name = "dsh-genshin-lisa-notice";
  var inject = ["timer"];

  function apply(ctx) {
    // Reused Audio element; `false` means initialization already failed.
    var audio = null;

    async function ensureAudio() {
      if (audio) return audio;
      try {
        var origin = typeof window !== "undefined" && window.location ? window.location.origin : "";
        audio = new Audio(origin + AUDIO_PATH);
        audio.preload = "auto";
      } catch (error) {
        console.error("[dsh-genshin-lisa-notice] audio setup failed:", error);
        audio = false;
      }
      return audio;
    }

    function play(el) {
      try {
        if (el.currentTime > 0) el.currentTime = 0;
        var p = el.play();
        if (p && typeof p.catch === "function") {
          p.catch(function (error) {
            console.error("[dsh-genshin-lisa-notice] play failed:", error);
          });
        }
      } catch (error) {
        console.error("[dsh-genshin-lisa-notice] play failed:", error);
      }
    }

    // Poll the host completion endpoint; play once per drained burst.
    ctx.interval(async function () {
      try {
        var res = await fetch(POLL_PATH, { method: "GET", cache: "no-store" });
        if (!res.ok) return;
        var data = await res.json();
        if (!data || !data.count) return;
        var el = await ensureAudio();
        if (el) play(el);
      } catch (error) {
        // Transient failure (early page load / network jitter): skip this tick.
      }
    }, POLL_INTERVAL_MS);
  }

  exports.name = name;
  exports.inject = inject;
  exports.apply = apply;
  return module.exports;
}});
