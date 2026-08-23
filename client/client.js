// dsh-genshin-lisa-notice — browser half (web client module bundle).
// Format: window.__ModuleLoader__.load({ id, factory }) — the web boot
// protocol's registration handoff. The factory receives a synchronous
// require and returns the module's exports; the cordis plugin exported here
// is { name, inject, apply }. Static client bundles resolve React through
// the factory's require — NOT a global.
window.__ModuleLoader__.load({ id: "dsh-genshin-lisa-notice", factory: (require) => {

  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  var react = require("react");

  var POLL_INTERVAL_MS = 700;
  var POLL_PATH = "/dsh-genshin-lisa-notice/poll";
  var UPLOAD_PATH = "/dsh-genshin-lisa-notice/upload";
  var COMPLETION_AUDIO_PATH = "/dsh-genshin-lisa-notice/alert.mp3";
  var INTERACTION_AUDIO_PATH = "/dsh-genshin-lisa-notice/interaction.mp3";
  var SETTINGS_NS = "dsh-genshin-lisa-notice";

  var name = "dsh-genshin-lisa-notice";
  var inject = ["timer", "settingsScope"];

  // Theme-aware styles (CSS variables from the dsw alias tokens).
  var style = {
    card: {
      border: "1px solid var(--dsw-alias-border-l2, #333)",
      background: "var(--dsw-alias-bg-layer-3, #222)",
      borderRadius: "12px",
      listStyle: "none",
      marginBottom: "10px",
    },
    header: {
      appearance: "none", width: "100%", font: "inherit", color: "inherit",
      cursor: "pointer", background: "transparent", border: "0", borderRadius: "12px",
      textAlign: "left", display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px",
    },
    headText: { flex: 1, minWidth: 0 },
    title: { fontSize: "15px", fontWeight: 600, color: "var(--dsw-alias-label-primary, #fff)" },
    desc: { fontSize: "13px", color: "var(--dsw-alias-label-tertiary, #999)", marginTop: "4px" },
    badge: {
      display: "inline-block", marginLeft: "8px", fontSize: "11px", whiteSpace: "nowrap",
      background: "var(--dsw-alias-bg-module-platform, #444)", color: "var(--dsw-alias-label-secondary, #bbb)",
      borderRadius: "999px", padding: "1px 8px",
    },
    chevron: { color: "var(--dsw-alias-label-tertiary, #999)", flex: "none", transition: "transform .16s" },
    body: { borderTop: "1px solid var(--dsw-alias-border-l2, #333)", margin: "0 16px", padding: "4px 0 8px" },
    field: { padding: "10px 0" },
    fieldLabel: { fontSize: "13px", fontWeight: 500, color: "var(--dsw-alias-label-primary, #fff)" },
    fieldStatus: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #bbb)", marginTop: "4px" },
    fieldHint: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #999)", marginTop: "2px" },
    btnRow: { display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" },
    pickBtn: {
      appearance: "none", font: "inherit", cursor: "pointer",
      border: "1px solid var(--dsw-alias-border-l2, #333)", borderRadius: "8px", padding: "5px 14px",
      fontSize: "13px", background: "var(--dsw-alias-bg-layer-3, #222)",
      color: "var(--dsw-alias-label-secondary, #bbb)",
    },
    pickName: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #999)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    footer: {
      borderTop: "1px solid var(--dsw-alias-border-l2, #333)", display: "flex",
      justifyContent: "flex-end", alignItems: "center", gap: "8px", padding: "10px 16px 12px",
    },
    message: { color: "var(--dsw-alias-label-secondary, #bbb)", margin: "0", fontSize: "12px", flex: 1 },
    btnSecondary: {
      appearance: "none", font: "inherit", cursor: "pointer",
      border: "1px solid var(--dsw-alias-border-l2, #333)", borderRadius: "8px", padding: "5px 14px",
      fontSize: "13px", background: "var(--dsw-alias-bg-layer-3, #222)",
      color: "var(--dsw-alias-label-secondary, #bbb)",
    },
    btnPrimary: {
      appearance: "none", font: "inherit", cursor: "pointer", border: "1px solid transparent",
      borderRadius: "8px", padding: "5px 14px", fontSize: "13px",
      background: "var(--dsw-alias-brand-primary, #4a90d9)", color: "var(--dsw-alias-brand-text, #fff)",
    },
  };

  function apply(ctx) {
    // ── audio alert machinery ──────────────────────────────────────────────
    var completionAudio = null;
    var interactionAudio = null;
    var primed = false;
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
            if (error && error.name === "NotAllowedError") {
              pending += 1;
            }
          });
        }
      } catch (error) {
        console.error("[dsh-genshin-lisa-notice] play failed:", error);
      }
    }

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
      } catch (error) { /* transient */ }
    }, POLL_INTERVAL_MS);

    // ── settings card in 设置 → 插件 → 配置 ────────────────────────────────
    var COMPLETION_INPUT_ID = "dgn-completion-file";
    var INTERACTION_INPUT_ID = "dgn-interaction-file";

    function LisaNoticeCard(props) {
      var scope = props.scope;
      var [snap, setSnap] = react.useState(function () { return scope.getSnapshot(); });
      var [open, setOpen] = react.useState(false);
      var [pendingCompletion, setPendingCompletion] = react.useState(null);
      var [pendingInteraction, setPendingInteraction] = react.useState(null);
      var [saving, setSaving] = react.useState(false);
      var [message, setMessage] = react.useState("");

      react.useEffect(function () {
        return scope.subscribe(function () {
          setSnap(scope.getSnapshot());
        });
      }, []);

      var value = snap.value || {};
      var writable = snap.status === "ready" && snap.writable;
      var overridden = snap.user !== undefined && snap.user !== null
        && (snap.user.completionAudio !== undefined || snap.user.interactionAudio !== undefined);

      function fileName(path) {
        if (!path) return null;
        var parts = String(path).split(/[\\/]/);
        return parts[parts.length - 1] || String(path);
      }

      function pick(kind) {
        var el = document.getElementById(kind === "completion" ? COMPLETION_INPUT_ID : INTERACTION_INPUT_ID);
        if (el) el.click();
      }

      function onFile(kind, event) {
        var input = event.target;
        var file = input && input.files && input.files[0] ? input.files[0] : null;
        if (file) {
          if (kind === "completion") setPendingCompletion(file);
          else setPendingInteraction(file);
        }
        input.value = "";
      }

      async function upload(kind, file) {
        var buf = await file.arrayBuffer();
        var res = await fetch(UPLOAD_PATH + "?kind=" + kind, { method: "POST", body: buf });
        var json = await res.json().catch(function () { return {}; });
        if (!res.ok || !json.ok) {
          throw new Error(json.error || ("HTTP " + res.status));
        }
        return json;
      }

      function save() {
        setSaving(true);
        setMessage("");
        var work = Promise.resolve();
        if (pendingCompletion) {
          work = work.then(function () { return upload("completion", pendingCompletion); });
        }
        if (pendingInteraction) {
          work = work.then(function () { return upload("interaction", pendingInteraction); });
        }
        work
          .then(function () {
            setPendingCompletion(null);
            setPendingInteraction(null);
            setMessage("已保存 / Saved");
          })
          .catch(function (error) {
            setMessage("保存失败 / Save failed: " + (error && error.message ? error.message : String(error)));
          })
          .then(function () { setSaving(false); });
      }

      function cancel() {
        setPendingCompletion(null);
        setPendingInteraction(null);
        setMessage("");
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

      return react.createElement("li", { style: style.card },
        react.createElement("button", { style: style.header, onClick: function () { setOpen(!open); } },
          react.createElement("div", { style: style.headText },
            react.createElement("div", { style: style.title }, "dsh-genshin-lisa-notice"),
            react.createElement("div", { style: style.desc }, "完成/交互提醒音频 · completion & interaction audio"),
            overridden ? react.createElement("span", { style: style.badge }, "已自定义 / customized") : null,
          ),
          react.createElement("span", { style: style.chevron }, open ? "▾" : "▸"),
        ),
        open ? react.createElement("div", null,
          react.createElement("div", { style: style.body },
            react.createElement("div", { style: style.field },
              react.createElement("div", { style: style.fieldLabel }, "完成提醒音频"),
              react.createElement("div", { style: style.fieldStatus },
                pendingCompletion
                  ? "已选：待保存 " + fileName(pendingCompletion.name)
                  : fileName(value.completionAudio)
                    ? "当前：自定义 " + fileName(value.completionAudio)
                    : "当前：默认 lisa-notice.mp3",
              ),
              react.createElement("div", { style: style.btnRow },
                react.createElement("button", {
                  style: style.pickBtn, disabled: !writable || saving,
                  onClick: function () { pick("completion"); },
                }, "选择音频文件"),
                react.createElement("span", { style: style.pickName },
                  pendingCompletion ? "" : (fileName(value.completionAudio) || "未配置，使用默认语音"),
                ),
              ),
              react.createElement("input", {
                id: COMPLETION_INPUT_ID, type: "file", accept: "audio/*,.mp3",
                style: { display: "none" },
                onChange: function (e) { onFile("completion", e); },
              }),
            ),
            react.createElement("div", { style: style.field },
              react.createElement("div", { style: style.fieldLabel }, "交互提醒音频"),
              react.createElement("div", { style: style.fieldStatus },
                pendingInteraction
                  ? "已选：待保存 " + fileName(pendingInteraction.name)
                  : fileName(value.interactionAudio)
                    ? "当前：自定义 " + fileName(value.interactionAudio)
                    : "当前：默认 luoshaliya-jiaban.mp3",
              ),
              react.createElement("div", { style: style.btnRow },
                react.createElement("button", {
                  style: style.pickBtn, disabled: !writable || saving,
                  onClick: function () { pick("interaction"); },
                }, "选择音频文件"),
                react.createElement("span", { style: style.pickName },
                  pendingInteraction ? "" : (fileName(value.interactionAudio) || "未配置，使用默认语音"),
                ),
              ),
              react.createElement("input", {
                id: INTERACTION_INPUT_ID, type: "file", accept: "audio/*,.mp3",
                style: { display: "none" },
                onChange: function (e) { onFile("interaction", e); },
              }),
            ),
            react.createElement("p", { style: style.fieldHint },
              "选择 mp3 文件后点「确认」上传并立即生效；「恢复默认」回到包内语音。",
            ),
          ),
          react.createElement("div", { style: style.footer },
            message ? react.createElement("span", { style: style.message }, message) : null,
            react.createElement("button", {
              style: style.btnSecondary, disabled: !writable || saving,
              onClick: reset,
            }, "恢复默认"),
            react.createElement("button", {
              style: style.btnSecondary, disabled: !writable || saving || (!pendingCompletion && !pendingInteraction),
              onClick: cancel,
            }, "取消"),
            react.createElement("button", {
              style: style.btnPrimary, disabled: !writable || saving || (!pendingCompletion && !pendingInteraction),
              onClick: save,
            }, "确认"),
          ),
        ) : null,
      );
    }

    var slots = ctx.get("slots");
    if (slots !== undefined && ctx.settingsScope !== undefined) {
      var settingsScope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
      slots.inject("settings.plugin.item", function () {
        return slots.register(
          { name: "settings.plugin.item", key: "dsh-genshin-lisa-notice", order: 30 },
          function (props) {
            return react.createElement(LisaNoticeCard, Object.assign({}, props, { scope: settingsScope }));
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
