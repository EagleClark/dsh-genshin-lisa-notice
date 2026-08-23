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
  var VOICES_PATH = "/dsh-genshin-lisa-notice/voices";
  var COMPLETION_AUDIO_PATH = "/dsh-genshin-lisa-notice/alert.mp3";
  var INTERACTION_AUDIO_PATH = "/dsh-genshin-lisa-notice/interaction.mp3";
  var SETTINGS_NS = "dsh-genshin-lisa-notice";
  var CUSTOM_OPTION = "__custom__";

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
    ".dgn-select{appearance:auto;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 8px;font-size:13px;line-height:1.5;max-width:100%}",
    ".dgn-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
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
      // Staged edits: per field, either { kind:'builtin', key } or { kind:'file', file }.
      var [pendingCompletion, setPendingCompletion] = react.useState(null);
      var [pendingInteraction, setPendingInteraction] = react.useState(null);
      var [saving, setSaving] = react.useState(false);
      var [message, setMessage] = react.useState("");
      var [voices, setVoices] = react.useState([]);
      var [defaults, setDefaults] = react.useState({});

      react.useEffect(function () {
        return scope.subscribe(function () {
          setSnap(scope.getSnapshot());
        });
      }, []);

      react.useEffect(function () {
        var alive = true;
        fetch(VOICES_PATH, { cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!alive) return;
            setVoices(data.voices || []);
            setDefaults(data.defaults || {});
          })
          .catch(function () { /* leave empty; dropdown shows defaults only */ });
        return function () { alive = false; };
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

      function labelOf(key) {
        var match = voices.find(function (v) { return v.key === key; });
        return match ? match.label : key;
      }

      // Current config's selectable value for a field:
      // '' (default) -> the field's default key; builtin -> key; custom -> CUSTOM_OPTION.
      function currentSelect(field) {
        var raw = String(value[field + "Audio"] || "");
        if (raw === "") return defaults[field] || "";
        var isBuiltin = voices.some(function (v) { return v.key === raw; });
        return isBuiltin ? raw : CUSTOM_OPTION;
      }

      // Friendly current name: default/builtin -> label; custom -> original filename.
      function currentName(field) {
        var raw = String(value[field + "Audio"] || "");
        if (raw === "") return labelOf(defaults[field] || "");
        var isBuiltin = voices.some(function (v) { return v.key === raw; });
        return isBuiltin ? labelOf(raw) : (fileName(raw) || raw);
      }

      function pick(field) {
        var el = document.getElementById(field === "completion" ? COMPLETION_INPUT_ID : INTERACTION_INPUT_ID);
        if (el) el.click();
      }

      function setPending(field, pendingValue) {
        if (field === "completion") setPendingCompletion(pendingValue);
        else setPendingInteraction(pendingValue);
      }

      function onSelect(field, sel) {
        if (sel === CUSTOM_OPTION) {
          pick(field);
          return;
        }
        setPending(field, { kind: "builtin", key: sel });
      }

      function onFile(field, event) {
        var input = event.target;
        var file = input && input.files && input.files[0] ? input.files[0] : null;
        if (file) setPending(field, { kind: "file", file: file, name: file.name });
        input.value = "";
      }

      async function upload(field, file) {
        var buf = await file.arrayBuffer();
        var res = await fetch(UPLOAD_PATH + "?kind=" + field, { method: "POST", body: buf });
        var json = await res.json().catch(function () { return {}; });
        if (!res.ok || !json.ok) {
          throw new Error(json.error || ("HTTP " + res.status));
        }
        return json;
      }

      function apply() {
        setSaving(true);
        setMessage("");
        var work = Promise.resolve();
        var pendingByField = { completion: pendingCompletion, interaction: pendingInteraction };
        Object.keys(pendingByField).forEach(function (field) {
          var p = pendingByField[field];
          if (!p) return;
          if (p.kind === "builtin") {
            var store = p.key === (defaults[field] || "") ? "" : p.key;
            work = work.then(function () { return scope.set(field + "Audio", store); });
          } else if (p.kind === "file") {
            work = work.then(function () { return upload(field, p.file); })
              .then(function (json) { return scope.set(field + "Audio", json.path); });
          }
        });
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

      function voiceOptions(field) {
        var opts = voices.map(function (v) {
          return react.createElement("option", { key: v.key, value: v.key }, v.label);
        });
        opts.push(react.createElement("option", { key: CUSTOM_OPTION, value: CUSTOM_OPTION }, "自定义音频…"));
        return opts;
      }

      function fieldStatus(pending, field) {
        if (pending && pending.kind === "file") return "已选：待保存 " + fileName(pending.name);
        if (pending && pending.kind === "builtin") return "选择：" + labelOf(pending.key) + "（待确认）";
        return "当前：" + currentName(field);
      }

      var cardClass = "dgn-card" + (open ? " dgn-card-open" : "");

      return react.createElement("li", { className: cardClass },
        react.createElement("button", { className: "dgn-header", onClick: function () { setOpen(!open); } },
          react.createElement("div", { className: "dgn-headText" },
            react.createElement("div", { className: "dgn-name" }, "Genshin通知提醒"),
            react.createElement("div", { className: "dgn-desc" }, "执行完成 / 等待输入时的语音通知"),
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
              react.createElement("div", { className: "dgn-fieldLabel" }, "完成提醒语音"),
              react.createElement("div", { className: "dgn-fieldStatus" }, fieldStatus(pendingCompletion, "completion")),
              react.createElement("div", { className: "dgn-btnRow" },
                react.createElement("select", {
                  className: "dgn-select", disabled: !writable || saving,
                  value: pendingCompletion && pendingCompletion.kind === "builtin"
                    ? pendingCompletion.key
                    : (pendingCompletion && pendingCompletion.kind === "file" ? CUSTOM_OPTION : currentSelect("completion")),
                  onChange: function (e) { onSelect("completion", e.target.value); },
                }, voiceOptions("completion")),
                react.createElement("span", { className: "dgn-pickName" },
                  (pendingCompletion && pendingCompletion.kind === "file")
                    ? fileName(pendingCompletion.name)
                    : (currentSelect("completion") === CUSTOM_OPTION ? (fileName(value.completionAudio) || "") : ""),
                ),
              ),
              react.createElement("input", {
                id: COMPLETION_INPUT_ID, type: "file", accept: "audio/*,.mp3",
                style: { display: "none" },
                onChange: function (e) { onFile("completion", e); },
              }),
            ),
            react.createElement("div", { className: "dgn-field" },
              react.createElement("div", { className: "dgn-fieldLabel" }, "交互提醒语音"),
              react.createElement("div", { className: "dgn-fieldStatus" }, fieldStatus(pendingInteraction, "interaction")),
              react.createElement("div", { className: "dgn-btnRow" },
                react.createElement("select", {
                  className: "dgn-select", disabled: !writable || saving,
                  value: pendingInteraction && pendingInteraction.kind === "builtin"
                    ? pendingInteraction.key
                    : (pendingInteraction && pendingInteraction.kind === "file" ? CUSTOM_OPTION : currentSelect("interaction")),
                  onChange: function (e) { onSelect("interaction", e.target.value); },
                }, voiceOptions("interaction")),
                react.createElement("span", { className: "dgn-pickName" },
                  (pendingInteraction && pendingInteraction.kind === "file")
                    ? fileName(pendingInteraction.name)
                    : (currentSelect("interaction") === CUSTOM_OPTION ? (fileName(value.interactionAudio) || "") : ""),
                ),
              ),
              react.createElement("input", {
                id: INTERACTION_INPUT_ID, type: "file", accept: "audio/*,.mp3",
                style: { display: "none" },
                onChange: function (e) { onFile("interaction", e); },
              }),
            ),
            react.createElement("p", { className: "dgn-fieldHint" },
              "下拉选择内置语音；选「自定义音频…」可上传自己的 mp3。点「确认」生效，「恢复默认」回到包内语音。",
            ),
          ),
          react.createElement("div", { className: "dgn-footer" },
            message ? react.createElement("span", { className: "dgn-message" }, message) : null,
            react.createElement("button", { className: "dgn-btn dgn-btn-secondary", disabled: !writable || saving, onClick: reset }, "恢复默认"),
            react.createElement("button", { className: "dgn-btn dgn-btn-secondary", disabled: !writable || saving || (!pendingCompletion && !pendingInteraction), onClick: cancel }, "取消"),
            react.createElement("button", { className: "dgn-btn dgn-btn-primary", disabled: !writable || saving || (!pendingCompletion && !pendingInteraction), onClick: apply }, "确认"),
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
