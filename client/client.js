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
    // Reused Audio elements; `false` means initialization already failed.
    var completionAudio = null;
    var interactionAudio = null;
    // Browser autoplay policy: sound play() is rejected until the user has
    // interacted with the page. `unlocked` flips on the first user gesture;
    // `pending` counts alerts that were blocked and should replay on that
    // gesture, so a missed alert is heard the moment the user clicks/types.
    var unlocked = false;
    var pending = 0;

    function pageOrigin() {
      return typeof window !== "undefined" && window.location ? window.location.origin : "";
    }

    async function ensureCompletion() {
      if (completionAudio) return completionAudio;
      try {
        completionAudio = new Audio(pageOrigin() + COMPLETION_AUDIO_PATH);
        completionAudio.preload = "auto";
      } catch (error) {
        console.error("[dsh-genshin-lisa-notice] completion audio setup failed:", error);
        completionAudio = false;
      }
      return completionAudio;
    }

    async function ensureInteraction() {
      if (interactionAudio) return interactionAudio;
      try {
        interactionAudio = new Audio(pageOrigin() + INTERACTION_AUDIO_PATH);
        interactionAudio.preload = "auto";
      } catch (error) {
        console.error("[dsh-genshin-lisa-notice] interaction audio setup failed:", error);
        interactionAudio = false;
      }
      return interactionAudio;
    }

    // Prime an element with a silent play so later play() calls are allowed
    // (Chrome grants autoplay after the first user gesture; some engines need
    // a play() inside the gesture handler itself).
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
      ensureCompletion().then(function (el) {
        if (el) play(el);
      });
    }

    function unlock() {
      if (unlocked) return;
      unlocked = true;
      prime(completionAudio);
      prime(interactionAudio);
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
          var el = await ensureCompletion();
          if (el && !played[COMPLETION_AUDIO_PATH]) {
            played[COMPLETION_AUDIO_PATH] = true;
            play(el);
          }
        }
        if (data.interaction > 0) {
          var el = data.interactionAudio
            ? await ensureInteraction()
            : await ensureCompletion();
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
