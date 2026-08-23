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
  var SETTINGS_NS = "dsh-genshin-lisa-notice";

  var name = "dsh-genshin-lisa-notice";
  var inject = ["timer", "settingsScope"];

  function apply(ctx) {
    // ── audio alert machinery ──────────────────────────────────────────────
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

    // Poll the host endpoints; play the matching sound per alert kind.
    ctx.interval(async function () {
      try {
        var res = await fetch(POLL_PATH, { method: "GET", cache: "no-store" });
        if (!res.ok) return;
        var data = await res.json();
        if (!data) return;
        if (data.completion > 0) {
          var el = ensureCompletion();
          if (el) play(el);
        }
        if (data.interaction > 0) {
          var el = ensureInteraction();
          if (el) play(el);
        }
      } catch (error) {
        // Transient failure (early page load / network jitter): skip this tick.
      }
    }, POLL_INTERVAL_MS);

    // ── settings card in 设置 → 插件 → 配置 ────────────────────────────────
    var style = {
      card: {
        border: "1px solid var(--dsw-alias-border-l2, #333)",
        background: "var(--dsw-alias-bg-layer-3, #222)",
        borderRadius: "12px",
        listStyle: "none",
        marginBottom: "10px",
      },
      head: { padding: "14px 16px" },
      title: { fontSize: "15px", fontWeight: 600, color: "var(--dsw-alias-label-primary, #fff)" },
      desc: { fontSize: "13px", color: "var(--dsw-alias-label-tertiary, #999)", marginTop: "4px" },
      badge: {
        display: "inline-block", marginLeft: "8px", fontSize: "11px",
        background: "var(--dsw-alias-bg-module-platform, #444)", color: "var(--dsw-alias-label-secondary, #bbb)",
        borderRadius: "999px", padding: "1px 8px",
      },
      body: { borderTop: "1px solid var(--dsw-alias-border-l2, #333)", margin: "0 16px", padding: "4px 0 8px" },
      field: { display: "flex", flexDirection: "column", gap: "6px", padding: "10px 0" },
      label: { fontSize: "13px", fontWeight: 500, color: "var(--dsw-alias-label-primary, #fff)" },
      input: {
        border: "1px solid var(--dsw-alias-border-l2, #333)", background: "var(--dsw-alias-bg-layer-3, #222)",
        height: "34px", color: "var(--dsw-alias-label-primary, #fff)", borderRadius: "8px", padding: "0 12px",
        fontSize: "13px",
      },
      hint: { color: "var(--dsw-alias-label-tertiary, #999)", margin: "6px 0 0", fontSize: "12px" },
      footer: {
        borderTop: "1px solid var(--dsw-alias-border-l2, #333)", display: "flex",
        justifyContent: "flex-end", alignItems: "center", gap: "8px", padding: "10px 16px 12px",
      },
      message: { color: "var(--dsw-alias-label-secondary, #bbb)", margin: "0", fontSize: "12px", flex: 1 },
      btn: {
        appearance: "none", font: "inherit", cursor: "pointer", border: "1px solid var(--dsw-alias-border-l2, #333)",
        borderRadius: "8px", padding: "5px 14px", fontSize: "13px",
        color: "var(--dsw-alias-label-secondary, #bbb)", background: "transparent",
      },
      btnPrimary: {
        appearance: "none", font: "inherit", cursor: "pointer", border: "1px solid transparent",
        borderRadius: "8px", padding: "5px 14px", fontSize: "13px",
        color: "#fff", background: "var(--dsw-alias-brand-primary, #4a90d9)",
      },
    };

    function LisaNoticeCard(props) {
      var scope = props.scope;
      var [snap, setSnap] = React.useState(function () { return scope.getSnapshot(); });
      var [drafts, setDrafts] = React.useState(null);
      var [saving, setSaving] = React.useState(false);
      var [message, setMessage] = React.useState("");

      React.useEffect(function () {
        return scope.subscribe(function () {
          var s = scope.getSnapshot();
          setSnap(s);
          if (s.status === "ready" && s.value) {
            setDrafts({
              completionAudio: String(s.value.completionAudio || ""),
              interactionAudio: String(s.value.interactionAudio || ""),
            });
          }
        });
      }, []);

      var d = drafts || { completionAudio: "", interactionAudio: "" };
      var writable = snap.status === "ready" && snap.writable;
      var overridden = snap.user !== undefined && snap.user !== null
        && (snap.user.completionAudio !== undefined || snap.user.interactionAudio !== undefined);

      function edit(field, value) {
        setDrafts(Object.assign({}, d, (function (o) { o[field] = value; return o; })({})));
      }

      function save() {
        setSaving(true);
        setMessage("");
        Promise.resolve()
          .then(function () { return scope.set("completionAudio", d.completionAudio.trim()); })
          .then(function () { return scope.set("interactionAudio", d.interactionAudio.trim()); })
          .then(function () { setMessage("已保存 / Saved"); })
          .catch(function (error) {
            setMessage("保存失败 / Save failed: " + (error && error.message ? error.message : String(error)));
          })
          .then(function () { setSaving(false); });
      }

      function reset() {
        setSaving(true);
        setMessage("");
        Promise.resolve()
          .then(function () { return scope.unset("completionAudio"); })
          .then(function () { return scope.unset("interactionAudio"); })
          .then(function () { setMessage("已恢复默认 / Reset to default"); })
          .catch(function (error) {
            setMessage("恢复失败 / Reset failed: " + (error && error.message ? error.message : String(error)));
          })
          .then(function () { setSaving(false); });
      }

      return React.createElement("li", { style: style.card },
        React.createElement("div", { style: style.head },
          React.createElement("div", { style: style.title }, "dsh-genshin-lisa-notice"),
          React.createElement("div", { style: style.desc }, "完成/交互提醒音频 · completion & interaction audio"),
          overridden ? React.createElement("span", { style: style.badge }, "已自定义 / customized") : null,
        ),
        React.createElement("div", { style: style.body },
          React.createElement("label", { style: style.field },
            React.createElement("span", { style: style.label }, "完成提醒音频（留空 = 默认 lisa-notice.mp3）"),
            React.createElement("input", {
              style: style.input, type: "text", disabled: !writable || saving,
              value: d.completionAudio, placeholder: "C:\\path\\to\\completion.mp3",
              onChange: function (e) { edit("completionAudio", e.target.value); },
            }),
          ),
          React.createElement("label", { style: style.field },
            React.createElement("span", { style: style.label }, "交互提醒音频（留空 = 默认 luoshaliya-jiaban.mp3）"),
            React.createElement("input", {
              style: style.input, type: "text", disabled: !writable || saving,
              value: d.interactionAudio, placeholder: "C:\\path\\to\\interaction.mp3",
              onChange: function (e) { edit("interactionAudio", e.target.value); },
            }),
          ),
          React.createElement("p", { style: style.hint }, "自定义语音：填入 mp3 文件的绝对路径，保存后立即生效。"),
        ),
        React.createElement("div", { style: style.footer },
          message ? React.createElement("span", { style: style.message }, message) : null,
          React.createElement("button", { style: style.btn, disabled: !writable || saving, onClick: reset }, "恢复默认"),
          React.createElement("button", { style: style.btnPrimary, disabled: !writable || saving, onClick: save }, "保存"),
        ),
      );
    }

    var slots = ctx.get("slots");
    if (slots !== undefined && ctx.settingsScope !== undefined) {
      var settingsScope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
      slots.inject("settings.plugin.item", function () {
        return slots.register(
          { name: "settings.plugin.item", key: SETTINGS_NS },
          function (props) {
            return React.createElement(LisaNoticeCard, Object.assign({}, props, { scope: settingsScope }));
          },
        );
      });
    }
  }

  exports.name = name;
  exports.inject = inject;
  exports.apply = apply;
  return module.exports;
}});
