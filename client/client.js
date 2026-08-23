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
  var COMPLETION_AUDIO_PATH = "/dsh-genshin-lisa-notice/alert.mp3";
  var INTERACTION_AUDIO_PATH = "/dsh-genshin-lisa-notice/interaction.mp3";

  var name = "dsh-genshin-lisa-notice";
  var inject = ["timer"];

  function apply(ctx) {
    // Audio elements are created eagerly so the first user gesture can prime
    // them; `false` means initialization already failed.
    var completionAudio = null;
    var interactionAudio = null;
    var primed = false;
    // Browser autoplay policy: a sound play() is rejected until the page has
    // a real user gesture (some apps cancel keyboard activation, so typing
    // alone may not unlock). `pending` counts alerts blocked by the policy;
    // every subsequent gesture retries them, so a missed alert is heard the
    // moment the user clicks/taps.
    var pending = 0;

    function pageOrigin() {
      return typeof window !== "undefined" && window.location ? window.location.origin : "";
    }

    function makeAudio(path) {
      var el = new Audio(pageOrigin() + path);
      el.preload = "auto";
      return el;
    }

    function ensureCompletion() {
      if (completionAudio === null) {
        try {
          completionAudio = makeAudio(COMPLETION_AUDIO_PATH);
        } catch (error) {
          console.error("[dsh-genshin-lisa-notice] completion audio setup failed:", error);
          completionAudio = false;
        }
      }
      return completionAudio;
    }

    function ensureInteraction() {
      if (interactionAudio === null) {
        try {
          interactionAudio = makeAudio(INTERACTION_AUDIO_PATH);
        } catch (error) {
          console.error("[dsh-genshin-lisa-notice] interaction audio setup failed:", error);
          interactionAudio = false;
        }
      }
      return interactionAudio;
    }

    // Prime an element with a silent play so later play() calls are allowed
    // (Chrome grants autoplay after the first real user gesture; some engines
    // additionally require a play() inside the gesture handler itself).
    function prime(el) {
      if (!el) return;
      try {
        var previousVolume = el.volume;
        el.volume = 0;
        var p = el.play();
        if (p && typeof p.then === "function") {
          p.then(function () {
            ctx.timeout(function () {
              try {
                el.pause();
                el.currentTime = 0;
                el.volume = previousVolume;
              } catch (error) { /* ignore */ }
            }, 200);
          }).catch(function () { /* ignore */ });
        }
      } catch (error) { /* ignore */ }
    }

    function flushPending() {
      if (pending <= 0) return;
      pending = 0;
      var el = ensureCompletion();
      if (el) play(el);
    }

    // Runs on every user gesture; harmless when there is nothing to do.
    function unlock() {
      if (!primed) {
        primed = true;
        prime(ensureCompletion());
        prime(ensureInteraction());
      }
      flushPending();
    }

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("pointerdown", unlock, { capture: true });
      window.addEventListener("keydown", unlock, { capture: true });
      window.addEventListener("touchstart", unlock, { capture: true });
    }

    function play(el) {
      try {
        if (el.currentTime > 0) el.currentTime = 0;
        var p = el.play();
        if (p && typeof p.catch === "function") {
          p.catch(function (error) {
            console.error("[dsh-genshin-lisa-notice] play failed:", error);
            // Blocked by autoplay policy: replay once the user interacts.
            if (error && error.name === "NotAllowedError") {
              pending += 1;
            }
          });
        }
      } catch (error) {
        console.error("[dsh-genshin-lisa-notice] play failed:", error);
      }
    }

    // Poll the host endpoints; play once per distinct sound per tick.
    ctx.interval(async function () {
      try {
        var res = await fetch(POLL_PATH, { method: "GET", cache: "no-store" });
        if (!res.ok) return;
        var data = await res.json();
        if (!data) return;

        var played = {};
        if (data.completion > 0) {
          var el = ensureCompletion();
          if (el && !played[COMPLETION_AUDIO_PATH]) {
            played[COMPLETION_AUDIO_PATH] = true;
            play(el);
          }
        }
        if (data.interaction > 0) {
          var el = data.interactionAudio
            ? ensureInteraction()
            : ensureCompletion();
          if (el && !played[COMPLETION_AUDIO_PATH] && !played[INTERACTION_AUDIO_PATH]) {
            played[el === interactionAudio ? INTERACTION_AUDIO_PATH : COMPLETION_AUDIO_PATH] = true;
            play(el);
          }
        }
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
