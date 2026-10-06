// dsh-genshin-lisa-notice — browser half (web client module bundle).
// Format: window.__ModuleLoader__.load({ id, factory }) — the web boot
// protocol's registration handoff. The factory receives a synchronous
// require and returns the module's exports; the cordis plugin exported here
// is { name, inject, apply }. Static client bundles resolve React through
// the factory's require — NOT a global.
//
// Settings: the host half declares this bundle's Config (voice keys/paths,
// the two notification switches, the Feishu webhook) with every field
// volatile. This half binds the same entry id through `ctx.configForms` and
// registers a configuration card into the Plugins page's `plugins.bundle.config`
// slot while the host serves the entry, so writes ride the settings document's
// revision fence instead of a private settings namespace.
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
  var VOICE_PLAY_PATH = "/dsh-genshin-lisa-notice/voice.mp3";
  // Package name == Loader row id == settings namespace of this bundle.
  var PKG = "dsh-genshin-lisa-notice";
  var ENTRY_ID = PKG;
  var CUSTOM_OPTION = "__custom__";

  // Schema defaults, used only when the served base layer does not carry a
  // field (an entry mounted without the settings provider).
  var FALLBACK = {
    completionAudio: "",
    interactionAudio: "",
    soundEnabled: true,
    notificationEnabled: true,
    feishuEnabled: false,
    feishuWebhook: "",
  };

  var name = PKG;
  var inject = ["slots", "configForms"];

  // ── injected stylesheet (class-based, matching the official plugin cards) ──
  var CARD_CSS = [
    ".dgn-card{list-style:none}",
    ".dgn-title{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4;margin:0}",
    ".dgn-desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5;margin:4px 0 0}",
    ".dgn-badge{display:inline-block;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px;white-space:nowrap;margin-left:8px}",
    ".dgn-body{padding-bottom:8px}",
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
    ".dgn-toggles{display:flex;flex-direction:column;gap:10px;padding:8px 0 4px}",
    ".dgn-toggleLabel{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;cursor:pointer}",
    ".dgn-toggleLabel input{accent-color:var(--dsw-alias-brand-primary)}",
    ".dgn-footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 8px;display:flex}",
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
      tag.dataset.plugin = PKG;
      tag.dataset.pluginCss = CARD_CSS_TAG;
      tag.textContent = CARD_CSS;
      document.head.appendChild(tag);
    }

    // The shared configuration form of this bundle's own entry. Reads never
    // block; the form derives its snapshot from the settings mirror.
    var form = ctx.configForms.get(ENTRY_ID);

    function formValue() {
      try {
        var snap = form.getSnapshot();
        return snap && snap.value !== null && typeof snap.value === "object" ? snap.value : {};
      } catch (error) {
        return {};
      }
    }

    function settingEnabled(key) {
      var value = formValue();
      return value[key] !== false;
    }

    function requestPermission() {
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "default" && typeof Notification.requestPermission === "function") {
          Notification.requestPermission().catch(function () { /* ignore */ });
        }
      } catch (error) { /* ignore */ }
    }

    function notify(title, body) {
      try {
        if (typeof Notification === "undefined") return;
        var text = String(body || "").trim();
        if (text.length > 300) text = text.slice(0, 300) + "…";
        new Notification(title, text ? { body: text } : undefined);
      } catch (error) {
        console.error("[dsh-genshin-lisa-notice] notification failed:", error);
      }
    }

    // ── alert machinery ────────────────────────────────────────────────────
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

    // First real user gesture: mark unlocked, request notification
    // permission, satisfy strict engines with a silent play, and replay any
    // alert the autoplay policy had blocked.
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      requestPermission();
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

    // Poll on a plain browser timer. The newer client no longer ships the
    // `timer` service, and listing it in `inject` blocks apply() forever, so
    // neither the card nor the alerts would ever mount.
    var poll = async function () {
      try {
        var res = await fetch(POLL_PATH, { method: "GET", cache: "no-store" });
        if (!res.ok) return;
        var data = await res.json();
        if (!data) return;
        if (data.completion > 0) {
          if (settingEnabled("soundEnabled")) playAlert("completion");
          if (settingEnabled("notificationEnabled")) {
            // One notification per completed session, each with its own summary.
            var list = Array.isArray(data.summaries) ? data.summaries.filter(function (s) { return typeof s === "string"; }) : [];
            if (list.length === 0) notify("任务完成", "");
            else for (var i = 0; i < list.length; i++) notify("任务完成", list[i]);
          }
        }
        if (data.interaction > 0) {
          if (settingEnabled("soundEnabled")) playAlert("interaction");
          if (settingEnabled("notificationEnabled")) notify("需要你的输入", data.interactionSummary || "");
        }
      } catch (error) { /* transient */ }
    };
    ctx.effect(function () {
      var id = setInterval(poll, POLL_INTERVAL_MS);
      return function () { clearInterval(id); };
    }, "dsh-genshin-lisa-notice: alert polling");

    // ── configuration card on the Plugins page ──────────────────────────────
    // Registered while the host serves this entry, into the bundle-configuration
    // seat of this bundle's own page (keyed by package name).
    var COMPLETION_INPUT_ID = "dgn-completion-file";
    var INTERACTION_INPUT_ID = "dgn-interaction-file";

    function messageOf(error) {
      return error && error.message ? error.message : String(error);
    }

    function LisaNoticeCard(props) {
      var [snap, setSnap] = react.useState(function () { return form.getSnapshot(); });
      // Staged edits per audio field: { kind:'builtin', key } or { kind:'file', file, name }.
      var [pendingCompletion, setPendingCompletion] = react.useState(null);
      var [pendingInteraction, setPendingInteraction] = react.useState(null);
      var [webhookDraft, setWebhookDraft] = react.useState(null);
      var [saving, setSaving] = react.useState(false);
      var [message, setMessage] = react.useState("");
      var [voices, setVoices] = react.useState([]);
      var [defaults, setDefaults] = react.useState({});

      react.useEffect(function () {
        return form.subscribe(function () {
          setSnap(form.getSnapshot());
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
          .catch(function () { /* leave empty; the dropdown still offers the custom option */ });
        return function () { alive = false; };
      }, []);

      if (props.view === "summary") {
        return react.createElement("span", null, "执行完成 / 等待输入时的语音通知");
      }

      var value = snap.value !== null && typeof snap.value === "object" ? snap.value : {};
      var user = snap.user !== null && typeof snap.user === "object" ? snap.user : {};
      var writable = snap.status === "ready" && snap.writable === true;
      var overridden = user.completionAudio !== undefined || user.interactionAudio !== undefined;

      // Effective value beneath the user layer: the field's composition base
      // when the deployment resolved one, this bundle's schema default otherwise.
      function inherited(key) {
        var base = snap.base;
        if (base !== null && typeof base === "object" && Object.prototype.hasOwnProperty.call(base, key)) return base[key];
        return FALLBACK[key];
      }

      function fileName(path) {
        if (!path) return null;
        var parts = String(path).split(/[\\/]/);
        return parts[parts.length - 1] || String(path);
      }

      function labelOf(key) {
        var match = voices.filter(function (v) { return v.key === key; })[0];
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

      // A toggle stores its value only when it differs from the inherited one;
      // matching the inherited value clears the override instead.
      function writeField(key, next) {
        return next === inherited(key) ? form.unset(key) : form.set(key, next);
      }

      function reportWrite(work, done, failPrefix) {
        setSaving(true);
        setMessage("");
        work
          .then(function (ok) {
            setMessage(ok === false ? "部署未接受该值 / Refused" : done);
          })
          .catch(function (error) {
            setMessage(failPrefix + messageOf(error));
          })
          .then(function () { setSaving(false); });
      }

      function onToggle(key, checked, labels) {
        reportWrite(writeField(key, checked), checked ? labels[0] : labels[1], "保存失败 / Save failed: ");
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

      // One atomic write for everything staged on this card: revision-fenced,
      // validated by the host against the full plugin Config.
      function applyStaged() {
        setSaving(true);
        setMessage("");
        var ops = [];
        var pendingByField = { completion: pendingCompletion, interaction: pendingInteraction };
        var work = Promise.resolve();
        ["completion", "interaction"].forEach(function (field) {
          var p = pendingByField[field];
          if (!p) return;
          var key = field + "Audio";
          if (p.kind === "builtin") {
            ops.push(p.key === inherited(key) ? { op: "unset", path: [key] } : { op: "set", path: [key], value: p.key });
            return;
          }
          work = work
            .then(function () { return upload(field, p.file); })
            .then(function (json) {
              ops.push(json.path === inherited(key) ? { op: "unset", path: [key] } : { op: "set", path: [key], value: json.path });
            });
        });
        if (webhookDraft !== null) {
          var text = String(webhookDraft).trim();
          ops.push(text === String(inherited("feishuWebhook") || "") ? { op: "unset", path: ["feishuWebhook"] } : { op: "set", path: ["feishuWebhook"], value: text });
        }
        work
          .then(function () {
            return ops.length === 0 ? true : form.mutate(ops, snap.revision);
          })
          .then(function (ok) {
            if (ok === false) {
              setMessage("部署未接受这些值 / Refused");
              return;
            }
            setPendingCompletion(null);
            setPendingInteraction(null);
            setWebhookDraft(null);
            setMessage("已保存 / Saved");
          })
          .catch(function (error) {
            setMessage("保存失败 / Save failed: " + messageOf(error));
          })
          .then(function () { setSaving(false); });
      }

      function cancel() {
        setPendingCompletion(null);
        setPendingInteraction(null);
        setWebhookDraft(null);
        setMessage("");
      }

      function reset() {
        reportWrite(
          form.mutate([{ op: "unset", path: ["completionAudio"] }, { op: "unset", path: ["interactionAudio"] }], snap.revision),
          "已恢复默认 / Reset to default",
          "恢复失败 / Reset failed: ",
        );
      }

      function voiceOptions() {
        var opts = voices.map(function (v) {
          return react.createElement("option", { key: v.key, value: v.key }, v.label);
        });
        opts.push(react.createElement("option", { key: CUSTOM_OPTION, value: CUSTOM_OPTION }, "自定义音频…"));
        return opts;
      }

      function fieldStatus(pendingEdit, field) {
        if (pendingEdit && pendingEdit.kind === "file") return "已选：待保存 " + fileName(pendingEdit.name);
        if (pendingEdit && pendingEdit.kind === "builtin") return "选择：" + labelOf(pendingEdit.key) + "（待确认）";
        return "当前：" + currentName(field);
      }

      // Audition whatever this field currently points at — including an
      // unsaved choice: a staged upload plays straight from the local File
      // (object URL), a staged built-in plays its packaged route, and anything
      // else falls back to the saved route (which serves the stored value).
      function previewAudio(field, pendingEdit) {
        var url;
        var objectUrl = null;
        if (pendingEdit && pendingEdit.kind === "file" && pendingEdit.file) {
          objectUrl = URL.createObjectURL(pendingEdit.file);
          url = objectUrl;
        } else if (pendingEdit && pendingEdit.kind === "builtin" && pendingEdit.key) {
          url = pageOrigin() + VOICE_PLAY_PATH + "?key=" + encodeURIComponent(pendingEdit.key);
        } else {
          url = pageOrigin() + (field === "completion" ? COMPLETION_AUDIO_PATH : INTERACTION_AUDIO_PATH);
        }
        try {
          var el = new Audio(url);
          var p = el.play();
          if (p && typeof p.then === "function") {
            p.then(function () {
              if (objectUrl) setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 2000);
            }).catch(function (error) {
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              setMessage("试听失败 / Preview failed: " + messageOf(error));
            });
          }
        } catch (error) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          setMessage("试听失败 / Preview failed: " + messageOf(error));
        }
      }

      function audioField(field, label, pendingEdit, inputId) {
        return react.createElement("div", { className: "dgn-field" },
          react.createElement("div", { className: "dgn-fieldLabel" }, label),
          react.createElement("div", { className: "dgn-fieldStatus" }, fieldStatus(pendingEdit, field)),
          react.createElement("div", { className: "dgn-btnRow" },
            react.createElement("select", {
              className: "dgn-select",
              disabled: !writable || saving,
              value: pendingEdit && pendingEdit.kind === "builtin"
                ? pendingEdit.key
                : (pendingEdit && pendingEdit.kind === "file" ? CUSTOM_OPTION : currentSelect(field)),
              onChange: function (e) { onSelect(field, e.target.value); },
            }, voiceOptions()),
            react.createElement("button", {
              className: "dgn-pick",
              type: "button",
              disabled: saving,
              title: "试听当前选择（未保存也可试听）",
              onClick: function () { previewAudio(field, pendingEdit); },
            }, "试听"),
            react.createElement("span", { className: "dgn-pickName" },
              (pendingEdit && pendingEdit.kind === "file")
                ? fileName(pendingEdit.name)
                : (currentSelect(field) === CUSTOM_OPTION ? (fileName(value[field + "Audio"]) || "") : ""),
            ),
          ),
          react.createElement("input", {
            id: inputId,
            type: "file",
            accept: "audio/*,.mp3",
            style: { display: "none" },
            onChange: function (e) { onFile(field, e); },
          }),
        );
      }

      var hasStaged = (pendingCompletion !== null) || (pendingInteraction !== null) || (webhookDraft !== null);

      return react.createElement("div", { className: "dgn-card" },
        react.createElement("p", { className: "dgn-title" },
          "Genshin通知提醒",
          overridden ? react.createElement("span", { className: "dgn-badge" }, "已自定义 / customized") : null,
        ),
        react.createElement("p", { className: "dgn-desc" }, "执行完成 / 等待输入时的语音通知"),
        react.createElement("div", { className: "dgn-body" },
          audioField("completion", "完成提醒语音", pendingCompletion, COMPLETION_INPUT_ID),
          audioField("interaction", "交互提醒语音", pendingInteraction, INTERACTION_INPUT_ID),
          react.createElement("div", { className: "dgn-toggles" },
            react.createElement("label", { className: "dgn-toggleLabel" },
              react.createElement("input", {
                type: "checkbox",
                checked: value.soundEnabled !== false,
                disabled: !writable || saving,
                onChange: function (e) { onToggle("soundEnabled", e.target.checked, ["已开启 / On", "已关闭 / Off"]); },
              }),
              "声音提醒",
            ),
            react.createElement("label", { className: "dgn-toggleLabel" },
              react.createElement("input", {
                type: "checkbox",
                checked: value.notificationEnabled !== false,
                disabled: !writable || saving,
                onChange: function (e) { onToggle("notificationEnabled", e.target.checked, ["已开启 / On", "已关闭 / Off"]); },
              }),
              "系统通知",
            ),
            react.createElement("label", { className: "dgn-toggleLabel" },
              react.createElement("input", {
                type: "checkbox",
                checked: value.feishuEnabled === true,
                disabled: !writable || saving,
                onChange: function (e) { onToggle("feishuEnabled", e.target.checked, ["已开启 / On", "已关闭 / Off"]); },
              }),
              "飞书通知",
            ),
          ),
          react.createElement("div", { className: "dgn-field" },
            react.createElement("div", { className: "dgn-fieldLabel" }, "飞书 Webhook 地址"),
            react.createElement("input", {
              className: "dgn-select",
              type: "text",
              disabled: !writable || saving,
              value: webhookDraft === null ? String(value.feishuWebhook || "") : webhookDraft,
              placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/…",
              onChange: function (e) { setWebhookDraft(e.target.value); },
              style: { width: "100%", maxWidth: "100%" },
            }),
            react.createElement("p", { className: "dgn-fieldHint" },
              "飞书群机器人 · 自定义机器人 Webhook 地址；开启「飞书通知」后，完成/需要输入时会推送到该群。",
            ),
          ),
          react.createElement("p", { className: "dgn-fieldHint" },
            "下拉选择内置语音；选「自定义音频…」可上传自己的 mp3。点「确认」生效，「恢复默认」回到包内语音。",
          ),
          writable ? null : react.createElement("p", { className: "dgn-fieldHint" },
            snap.status === "unavailable"
              ? "本页面不是 loopback 打开的，配置暂不可写 / Configuration is read-only on this page."
              : "配置暂不可用，正在读取 / Configuration is not ready yet.",
          ),
        ),
        react.createElement("div", { className: "dgn-footer" },
          message ? react.createElement("span", { className: "dgn-message" }, message) : null,
          react.createElement("button", {
            className: "dgn-btn dgn-btn-secondary",
            disabled: !writable || saving,
            onClick: reset,
          }, "恢复默认"),
          react.createElement("button", {
            className: "dgn-btn dgn-btn-secondary",
            disabled: !writable || saving || !hasStaged,
            onClick: cancel,
          }, "取消"),
          react.createElement("button", {
            className: "dgn-btn dgn-btn-primary",
            disabled: !writable || saving || !hasStaged,
            onClick: applyStaged,
          }, "确认"),
        ),
      );
    }

    // The card exists while the host serves this entry's namespace: a
    // deployment that never mounted the host half shows no trace of it.
    // Three seats, one per client generation. `slots.inject` waits for a seat
    // that exists, so only the surfaces this client actually declares mount:
    //   - `settings.plugins.tab`  a page in the Plugins settings section
    //   - `plugins.bundle.config` this bundle's page on the plugin manager
    //   - `settings.plugin.item`  the older plugin-configuration card list
    ctx.effect(function () {
      return ctx.configForms.whileServed([ENTRY_ID], function () {
        var offs = [];
        var add = function (seat, options) {
          try {
            offs.push(ctx.slots.inject(seat, function () {
              return ctx.slots.register(options, LisaNoticeCard);
            }));
          } catch (error) { /* seat unavailable on this client */ }
        };
        add("settings.plugins.tab", { name: "settings.plugins.tab", id: PKG, order: 40, label: "Genshin通知提醒" });
        add("plugins.bundle.config", { name: "plugins.bundle.config", key: PKG, order: 30 });
        add("settings.plugin.item", { name: "settings.plugin.item", key: PKG, order: 30 });
        return function () {
          for (var i = 0; i < offs.length; i++) {
            try { offs[i](); } catch (error) { /* ignore */ }
          }
        };
      });
    }, "dsh-genshin-lisa-notice: configuration surfaces");
  }

  exports.name = name;
  exports.inject = inject;
  exports.apply = apply;
  return module.exports;
}});
