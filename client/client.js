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

  // ── injected stylesheet (class-based, matching the official plugin cards) ──
  var CARD_CSS = [
    ".dgn-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}",
    ".dgn-card:hover{border-color:var(--dsw-alias-label-dimmed)}",
    ".dgn-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
    ".dgn-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
    ".dgn-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
    ".dgn-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
    ".dgn-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}",
    ".dgn-desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}",
    ".dgn-badge{display:inline-block;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px;white-space:nowrap}",
    ".dgn-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}",
    ".dgn-chevron-open{transform:rotate(180deg)}",
    ".dgn-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}",
    ".dgn-field{padding:10px 0}",
    ".dgn-fieldLabel{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}",
    ".dgn-fieldStatus{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;margin-top:4px}",
    ".dgn-fieldHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;margin:6px 0 0}",
    ".dgn-btnRow{display:flex;align-items:center;gap:8px;margin-top:8px}",
    ".dgn-pick{background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;cursor:pointer}",
    ".dgn-pick:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
    ".dgn-pickName{color:var(--dsw-alias-label-tertiary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".dgn-footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 16px 8px;display:flex}",
    ".dgn-message{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:1.5;flex:1;min-width:0}",
    ".dgn-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}",
    ".dgn-btn-secondary{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}",
    ".dgn-btn-secondary:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
    ".dgn-btn-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}",
    ".dgn-btn:disabled{opacity:.4;cursor:default}",
    ".dgn-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
  ].join("\n");

  var CARD_CSS_TAG = "dsh-genshin-lisa-notice/card.css";

  function apply(ctx) {
    // Inject the stylesheet once per page.
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CARD_CSS_TAG) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-genshin-lisa-notice";
      tag.dataset.pluginCss = CARD_CSS_TAG;
      tag.textContent = CARD_CSS;
      document.head.appendChild(tag);
    }

    // ── audio alert machinery ──────────────────────────────────────────────
    // Fresh Audio element per alert so it always reflects the current server
    // config: a reused element keeps a stale cached copy, so after the user
    // uploads or resets audio the server serves new bytes at the same URL but
    // the old element would replay its previous buffer. Each play() therefore
    // creates a new element (responses are no-store, so it refetches).
    var pending = 0;
    var unlocked = false;

    function pageOrigin() {
      return typeof window !== "undefined" && window.location ? window.location.origin : "";
    }

    function playAlert(kind) {
      try {
        var path = kind === "completion" ? COMPLETION_AUDIO_PATH : INTERACTION_AUDIO_PATH;
        var el = new Audio(pageOrigin() + path);
        var p = el.play();
        if (p && typeof p.catch === "function") {
          p.catch(function (error) {
            if (error && error.name === "NotAllowedError") {
              pending += 1;
            } else {
              console.error("[dsh-genshin-lisa-notice] play failed:", error);
            }
          });
        }
      } catch (error) {
        console.error("[dsh-genshin-lisa-notice] play failed:", error);
      }
    }

    // First real user gesture: mark unlocked, satisfy strict engines
    // (Safari/iOS) with a silent play inside the handler, and replay any
    // alert the autoplay policy had blocked.
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      try {
        var seed = new Audio(pageOrigin() + COMPLETION_AUDIO_PATH);
        seed.volume = 0;
        var p = seed.play();
        if (p && typeof p.then === "function") {
          p.then(function () {
            try { seed.pause(); } catch (e) { /* ignore */ }
          }).catch(function () { /* ignore */ });
        }
      } catch (error) { /* ignore */ }
      if (pending > 0) {
        pending = 0;
        playAlert("completion");
      }
    }

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("pointerdown", unlock, { capture: true });
      window.addEventListener("keydown", unlock, { capture: true });
      window.addEventListener("touchstart", unlock, { capture: true });
    }

    ctx.interval(async function () {
      try {
        var res = await fetch(POLL_PATH, { method: "GET", cache: "no-store" });
        if (!res.ok) return;
        var data = await res.json();
        if (!data) return;
        if (data.completion > 0) playAlert("completion");
        if (data.interaction > 0) playAlert("interaction");
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

      var cardClass = "dgn-card" + (open ? " dgn-card-open" : "");

      return react.createElement("li", { className: cardClass },
        react.createElement("button", { className: "dgn-header", onClick: function () { setOpen(!open); } },
          react.createElement("div", { className: "dgn-headText" },
            react.createElement("div", { className: "dgn-name" }, "dsh-genshin-lisa-notice"),
            react.createElement("div", { className: "dgn-desc" }, "完成/交互提醒音频 · completion & interaction audio"),
            overridden ? react.createElement("span", { className: "dgn-badge" }, "已自定义 / customized") : null,
          ),
          react.createElement("svg", {
            className: "dgn-chevron" + (open ? " dgn-chevron-open" : ""),
            width: 14, height: 14, viewBox: "0 0 14 14", fill: "none",
          },
            react.createElement("path", {
              d: "M3.5 5.25 L7 8.75 L10.5 5.25",
              stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round",
            }),
          ),
        ),
        open ? react.createElement("div", null,
          react.createElement("div", { className: "dgn-body" },
            react.createElement("div", { className: "dgn-field" },
              react.createElement("div", { className: "dgn-fieldLabel" }, "完成提醒音频"),
              react.createElement("div", { className: "dgn-fieldStatus" },
                pendingCompletion
                  ? "已选：待保存 " + fileName(pendingCompletion.name)
                  : fileName(value.completionAudio)
                    ? "当前：自定义 " + fileName(value.completionAudio)
                    : "当前：默认 lisa-notice.mp3",
              ),
              react.createElement("div", { className: "dgn-btnRow" },
                react.createElement("button", {
                  className: "dgn-pick", disabled: !writable || saving,
                  onClick: function () { pick("completion"); },
                }, "选择音频文件"),
                react.createElement("span", { className: "dgn-pickName" },
                  pendingCompletion ? "" : (fileName(value.completionAudio) || "未配置，使用默认语音"),
                ),
              ),
              react.createElement("input", {
                id: COMPLETION_INPUT_ID, type: "file", accept: "audio/*,.mp3",
                style: { display: "none" },
                onChange: function (e) { onFile("completion", e); },
              }),
            ),
            react.createElement("div", { className: "dgn-field" },
              react.createElement("div", { className: "dgn-fieldLabel" }, "交互提醒音频"),
              react.createElement("div", { className: "dgn-fieldStatus" },
                pendingInteraction
                  ? "已选：待保存 " + fileName(pendingInteraction.name)
                  : fileName(value.interactionAudio)
                    ? "当前：自定义 " + fileName(value.interactionAudio)
                    : "当前：默认 luoshaliya-jiaban.mp3",
              ),
              react.createElement("div", { className: "dgn-btnRow" },
                react.createElement("button", {
                  className: "dgn-pick", disabled: !writable || saving,
                  onClick: function () { pick("interaction"); },
                }, "选择音频文件"),
                react.createElement("span", { className: "dgn-pickName" },
                  pendingInteraction ? "" : (fileName(value.interactionAudio) || "未配置，使用默认语音"),
                ),
              ),
              react.createElement("input", {
                id: INTERACTION_INPUT_ID, type: "file", accept: "audio/*,.mp3",
                style: { display: "none" },
                onChange: function (e) { onFile("interaction", e); },
              }),
            ),
            react.createElement("p", { className: "dgn-fieldHint" },
              "选择 mp3 文件后点「确认」上传并立即生效；「恢复默认」回到包内语音。",
            ),
          ),
          react.createElement("div", { className: "dgn-footer" },
            message ? react.createElement("span", { className: "dgn-message" }, message) : null,
            react.createElement("button", { className: "dgn-btn dgn-btn-secondary", disabled: !writable || saving, onClick: reset }, "恢复默认"),
            react.createElement("button", { className: "dgn-btn dgn-btn-secondary", disabled: !writable || saving || (!pendingCompletion && !pendingInteraction), onClick: cancel }, "取消"),
            react.createElement("button", { className: "dgn-btn dgn-btn-primary", disabled: !writable || saving || (!pendingCompletion && !pendingInteraction), onClick: save }, "确认"),
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
