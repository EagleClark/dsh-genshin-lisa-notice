// dsh-genshin-lisa-notice — browser half (web client module bundle).
// Format: window.__ModuleLoader__.load({ id, factory }) — the web boot
// protocol's registration handoff. The factory receives a synchronous
// require and returns the module's exports; the cordis plugin exported here
// is { name, inject, apply }. Static client bundles resolve React through
// the factory's require — NOT a global.
//
// Settings: the host half declares this bundle's Config (voice keys/paths,
// the two notification switches, the Feishu webhook and the Feishu assistant
// credentials) with every field volatile. This half binds the same entry id
// through `ctx.configForms`, so writes ride the settings document's revision
// fence instead of a private settings namespace.
//
// Seats, in the order the user asked for them:
//   - `sidebar.panellist` + `main`  the left-rail "工作台" icon and its panel
//   - `settings.section`            a page beside 通用设置 in Settings
//   - `plugins.bundle.config`       this bundle's own page in the plugin list
// The Plugins tab registration is gone: three seats are enough.
//
// Nothing is written until 确认 is pressed: every control edits a local draft
// and one atomic mutate commits the whole form.
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
  var CLIENT_DIAG_PATH = "/dsh-genshin-lisa-notice/client-diag";
  // Package name == Loader row id == settings namespace of this bundle.
  var PKG = "dsh-genshin-lisa-notice";
  var ENTRY_ID = PKG;
  // The rail icon's id and its `main` panel key must be the same value: the
  // sidebar resolves the panel by the icon's id.
  var PANEL_ID = "lisa-notice";
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
    feishuBotEnabled: false,
    feishuAppId: "",
    feishuAppSecret: "",
    feishuChatId: "",
    feishuPollSeconds: 5,
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
    ".dgn-select:disabled{opacity:.5;cursor:not-allowed}",
    ".dgn-input{display:block;width:100%;max-width:100%;box-sizing:border-box;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 8px;font-size:13px;line-height:1.5;margin-top:6px}",
    ".dgn-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
    ".dgn-input:disabled{opacity:.5;cursor:not-allowed}",
    ".dgn-toggles{display:flex;flex-direction:column;gap:10px;padding:8px 0 4px}",
    ".dgn-toggleLabel{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;cursor:pointer}",
    ".dgn-toggleLabel input{accent-color:var(--dsw-alias-brand-primary)}",
    ".dgn-choices{display:flex;flex-direction:column;gap:8px;margin-top:8px}",
    ".dgn-choice{display:flex;align-items:flex-start;gap:8px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;cursor:pointer}",
    ".dgn-choice input{margin-top:3px;accent-color:var(--dsw-alias-brand-primary)}",
    ".dgn-choiceText{min-width:0}",
    ".dgn-choiceSub{display:block;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}",
    ".dgn-footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 8px;display:flex;flex-wrap:wrap}",
    ".dgn-message{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:1.5;flex:1;min-width:0}",
    ".dgn-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}",
    ".dgn-btn-secondary{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}",
    ".dgn-btn-secondary:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
    ".dgn-btn-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}",
    ".dgn-btn:disabled{opacity:.4;cursor:default}",
    ".dgn-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
    ".dgn-panel{box-sizing:border-box;width:100%;height:100%;overflow:auto;padding:24px 20px 40px;color:var(--dsw-alias-label-primary)}",
    ".dgn-panelInner{max-width:760px;margin:0 auto}",
    ".dgn-panelTitle{color:var(--dsw-alias-label-primary);font-size:17px;font-weight:600;line-height:1.4;margin:0 0 4px}",
    ".dgn-panelSub{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5;margin:0 0 16px}",
    ".dgn-section{border-top:1px solid var(--dsw-alias-border-l2);margin-top:12px;padding-top:12px}",
    ".dgn-sectionTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:1.5;margin:0}",
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
        // Cache-buster: the route always serves the current config, but a browser
        // may reuse a decoded media buffer for an identical URL, which made a
        // freshly saved voice sound like the previous one.
        var el = new Audio(pageOrigin() + path + "?v=" + Date.now());
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
        // Model/network failures (429, 5xx, quota, disconnect): the case where a
        // turn dies without ever reaching completion.
        if (data.failure > 0) {
          if (settingEnabled("soundEnabled")) playAlert("interaction");
          if (settingEnabled("notificationEnabled")) {
            var fails = Array.isArray(data.failureSummaries) ? data.failureSummaries.filter(function (s) { return typeof s === "string"; }) : [];
            if (fails.length === 0) notify("⚠️ 任务失败", "");
            else for (var j = 0; j < fails.length; j++) notify("⚠️ 任务失败", fails[j]);
          }
        }
      } catch (error) { /* transient */ }
    };
    ctx.effect(function () {
      var id = setInterval(poll, POLL_INTERVAL_MS);
      return function () { clearInterval(id); };
    }, "dsh-genshin-lisa-notice: alert polling");

    var COMPLETION_INPUT_ID = "dgn-completion-file";
    var INTERACTION_INPUT_ID = "dgn-interaction-file";

    function messageOf(error) {
      return error && error.message ? error.message : String(error);
    }

    /**
     * The configuration form, shared by every seat.
     *
     * Every control edits `draft` only — a local overlay over the served value —
     * and 确认 commits the whole overlay in one revision-fenced mutate. Nothing
     * reaches the host (and therefore nothing changes behaviour) before that.
     */
    function LisaNoticeForm(props) {
      var compact = props && props.compact === true;
      var [snap, setSnap] = react.useState(function () { return form.getSnapshot(); });
      // Staged edits per audio field: { kind:'builtin', key } or { kind:'file', file, name }.
      var [pendingCompletion, setPendingCompletion] = react.useState(null);
      var [pendingInteraction, setPendingInteraction] = react.useState(null);
      // Every other field, staged by key. Text stays raw here and is normalised
      // on commit, so typing never writes a half-finished value.
      var [draft, setDraft] = react.useState({});
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

      if (props && props.view === "summary") {
        return react.createElement("span", null, "执行完成 / 等待输入时的语音与飞书通知");
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

      // Draft first, then the served value, then the schema default.
      function eff(key) {
        if (Object.prototype.hasOwnProperty.call(draft, key)) return draft[key];
        if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined && value[key] !== null) return value[key];
        return inherited(key);
      }

      function setField(key, next) {
        setDraft(function (current) {
          var merged = Object.assign({}, current);
          merged[key] = next;
          return merged;
        });
        setMessage("");
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
        setMessage("");
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

      // ── Feishu channel: one choice, two implementations ───────────────────
      // The host prefers the assistant bot and only uses the webhook as its
      // fallback, so offering both as independent switches misrepresented the
      // behaviour. One radio drives both flags.
      function channelMode() {
        if (eff("feishuBotEnabled") === true) return "bot";
        if (eff("feishuEnabled") === true) return "webhook";
        return "off";
      }

      function setChannelMode(mode) {
        setDraft(function (current) {
          var merged = Object.assign({}, current);
          if (mode === "off") {
            merged.feishuEnabled = false;
            merged.feishuBotEnabled = false;
          } else if (mode === "webhook") {
            merged.feishuEnabled = true;
            merged.feishuBotEnabled = false;
          } else {
            // The assistant is the channel; the webhook stays on as its fallback.
            merged.feishuBotEnabled = true;
            merged.feishuEnabled = true;
          }
          return merged;
        });
        setMessage("");
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

      // Normalise one staged value for the key that carries it. Booleans must stay
      // booleans: the host validates `feishuEnabled` etc. as `boolean`, and a
      // stringified "true" is refused there.
      function normalise(key, raw) {
        if (typeof raw === "boolean") return { value: raw };
        if (key === "feishuPollSeconds") {
          var n = Math.round(Number(String(raw == null ? "" : raw).trim()));
          if (!Number.isFinite(n) || n < 2 || n > 60) return { error: "回复拉取间隔需在 2–60 秒之间 / Poll interval must be 2–60 seconds" };
          return { value: n };
        }
        return { value: String(raw == null ? "" : raw).trim() };
      }

      // One atomic write for everything staged on this form: revision-fenced,
      // validated by the host against the full plugin Config.
      // The browser half cannot write the host log; this reports what the commit
      // button attempted, so a refused write is diagnosable without a debugger.
      function diag(payload) {
        try {
          fetch(CLIENT_DIAG_PATH, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          }).catch(function () { /* diagnostics never break the form */ });
        } catch (error) { /* ignore */ }
      }

      // Sequential writes through `form.set` / `form.unset`.
      //
      // `set` answers `false` for a value that already equals the served one
      // ("nothing to write"), which is not a failure — so a refusal is confirmed
      // against a fresh snapshot before it is reported.
      async function writeOne(key, next) {
        var isUnset = next === inherited(key);
        diag({ step: "write", key: key, value: isUnset ? "(unset)" : String(next).slice(0, 40) });
        var accepted = isUnset ? await form.unset(key) : await form.set(key, next);
        if (accepted === false) {
          var fresh = null;
          try { fresh = form.getSnapshot(); } catch (error) { fresh = null; }
          var now = fresh && fresh.value !== null && typeof fresh.value === "object" ? fresh.value[key] : undefined;
          var applied = isUnset ? now === undefined : now === next;
          diag({ step: "write-result", key: key, accepted: false, applied: applied, now: String(now) });
          if (applied !== true) throw new Error("部署未接受 " + key + " / refused");
          return;
        }
        diag({ step: "write-result", key: key, accepted: accepted });
      }

      async function applyStaged() {
        // Validate everything first: a bad number must not leave a half-applied
        // form behind.
        var credentialKeys = ["feishuAppId", "feishuAppSecret", "feishuChatId"];
        var keys = Object.keys(draft);
        var planned = [];
        for (var i = 0; i < keys.length; i += 1) {
          var key = keys[i];
          var normalised = normalise(key, draft[key]);
          if (normalised.error) {
            setMessage(normalised.error);
            return;
          }
          // An emptied credential box means "leave the stored value alone".
          if (credentialKeys.indexOf(key) !== -1 && String(draft[key]).trim() === "") continue;
          // Skip what the served document already holds: rewriting an unchanged
          // value is a no-op the form answers with `false`.
          var served = Object.prototype.hasOwnProperty.call(value, key) ? value[key] : inherited(key);
          if (normalised.value === served) {
            diag({ step: "skip-unchanged", key: key });
            continue;
          }
          planned.push({ key: key, value: normalised.value });
        }
        var hasAudio = pendingCompletion !== null || pendingInteraction !== null;
        if (planned.length === 0 && !hasAudio) {
          setDraft({});
          setMessage("没有需要保存的修改 / Nothing to save");
          return;
        }

        setSaving(true);
        setMessage("");
        diag({ step: "apply-start", planned: planned.length, hasAudio: hasAudio });
        try {
          var pendingByField = { completion: pendingCompletion, interaction: pendingInteraction };
          var fields = ["completion", "interaction"];
          for (var f = 0; f < fields.length; f += 1) {
            var field = fields[f];
            var staged = pendingByField[field];
            if (!staged) continue;
            var audioPath = staged.kind === "builtin" ? staged.key : (await upload(field, staged.file)).path;
            await writeOne(field + "Audio", audioPath);
          }
          for (var p = 0; p < planned.length; p += 1) {
            await writeOne(planned[p].key, planned[p].value);
          }
          setPendingCompletion(null);
          setPendingInteraction(null);
          setDraft({});
          setMessage("已保存并生效 / Saved");
          diag({ step: "apply-ok" });
        } catch (error) {
          setMessage("保存失败 / Save failed: " + messageOf(error));
          diag({ step: "apply-error", message: messageOf(error) });
        } finally {
          setSaving(false);
        }
      }

      function cancel() {
        setPendingCompletion(null);
        setPendingInteraction(null);
        setDraft({});
        setMessage("已放弃未保存的修改 / Discarded");
      }

      async function reset() {
        setSaving(true);
        setMessage("");
        try {
          await form.unset("completionAudio");
          await form.unset("interactionAudio");
          setPendingCompletion(null);
          setPendingInteraction(null);
          setMessage("已恢复默认语音 / Reset to default");
        } catch (error) {
          setMessage("恢复失败 / Reset failed: " + messageOf(error));
        } finally {
          setSaving(false);
        }
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
          url = pageOrigin() + (field === "completion" ? COMPLETION_AUDIO_PATH : INTERACTION_AUDIO_PATH) + "?v=" + Date.now();
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

      // A labelled text field. `secret` masks the value; the box never renders a
      // stored secret back, so leaving it alone keeps the stored one.
      function textField(options) {
        var key = options.key;
        var disabled = !writable || saving || options.disabled === true;
        var current = eff(key);
        var shown = draft[key] !== undefined ? draft[key] : (options.secret === true ? "" : (current === undefined || current === null ? "" : String(current)));
        return react.createElement("div", { className: "dgn-field" },
          react.createElement("div", { className: "dgn-fieldLabel" }, options.label),
          react.createElement("input", {
            className: "dgn-input",
            type: options.type || "text",
            value: shown,
            disabled: disabled,
            autoComplete: "off",
            spellCheck: false,
            placeholder: options.placeholder || "",
            onChange: function (e) { setField(key, e.target.value); },
          }),
          options.hint ? react.createElement("p", { className: "dgn-fieldHint" }, options.hint) : null,
          options.secret === true && draft[key] === undefined
            ? react.createElement("p", { className: "dgn-fieldHint" }, "已保存的密钥不会回显；留空表示不修改。")
            : null,
        );
      }

      function toggle(key, label) {
        return react.createElement("label", { className: "dgn-toggleLabel" },
          react.createElement("input", {
            type: "checkbox",
            checked: eff(key) !== false,
            disabled: !writable || saving,
            onChange: function (e) { setField(key, e.target.checked); },
          }),
          label,
        );
      }

      function channelChoice(mode, title, sub) {
        return react.createElement("label", { className: "dgn-choice" },
          react.createElement("input", {
            type: "radio",
            name: "dgn-feishu-channel-" + (props && props.seat ? props.seat : "form"),
            checked: channelMode() === mode,
            disabled: !writable || saving,
            onChange: function () { setChannelMode(mode); },
          }),
          react.createElement("span", { className: "dgn-choiceText" },
            title,
            sub ? react.createElement("span", { className: "dgn-choiceSub" }, sub) : null,
          ),
        );
      }

      var mode = channelMode();
      var hasStaged = Object.keys(draft).length > 0 || pendingCompletion !== null || pendingInteraction !== null;

      return react.createElement("div", { className: "dgn-card" },
        compact ? null : react.createElement("p", { className: "dgn-title" },
          "Genshin通知提醒",
          overridden ? react.createElement("span", { className: "dgn-badge" }, "已自定义 / customized") : null,
        ),
        compact ? null : react.createElement("p", { className: "dgn-desc" }, "执行完成 / 等待输入时的语音与飞书通知"),
        react.createElement("div", { className: "dgn-body" },
          react.createElement("div", { className: "dgn-section" },
            react.createElement("p", { className: "dgn-sectionTitle" }, "语音提醒"),
            audioField("completion", "完成提醒语音", pendingCompletion, COMPLETION_INPUT_ID),
            audioField("interaction", "交互提醒语音", pendingInteraction, INTERACTION_INPUT_ID),
          ),
          react.createElement("div", { className: "dgn-section" },
            react.createElement("p", { className: "dgn-sectionTitle" }, "本机提醒"),
            react.createElement("div", { className: "dgn-toggles" },
              toggle("soundEnabled", "声音提醒"),
              toggle("notificationEnabled", "系统通知"),
            ),
          ),
          react.createElement("div", { className: "dgn-section" },
            react.createElement("p", { className: "dgn-sectionTitle" }, "飞书通道"),
            react.createElement("p", { className: "dgn-fieldHint" }, "二选一：助手可回复（推荐），Webhook 只单向推送。"),
            react.createElement("div", { className: "dgn-choices" },
              channelChoice("off", "关闭", "不发送任何飞书消息"),
              channelChoice("bot", "飞书助手（可回复）", "应用机器人发到群，可直接在飞书里回复并回到原会话"),
              channelChoice("webhook", "飞书通知（Webhook）", "群自定义机器人，只能单向推送"),
            ),
          ),
          // Exactly one channel's settings exist at a time: the assistant's
          // credentials under `bot`, the webhook address under `webhook`, and
          // nothing at all when Feishu is off.
          mode === "bot"
            ? react.createElement("div", { className: "dgn-section" },
              react.createElement("p", { className: "dgn-sectionTitle" }, "飞书助手凭证"),
              react.createElement("p", { className: "dgn-fieldHint" }, "应用机器人凭证与该群 chat_id。"),
              textField({
                key: "feishuAppId", label: "App ID", placeholder: "cli_ 开头",
              }),
              textField({
                key: "feishuAppSecret", label: "App Secret", type: "password", placeholder: "应用密钥",
                secret: true,
              }),
              textField({
                key: "feishuChatId", label: "群 chat_id", placeholder: "oc_ 开头",
              }),
              textField({
                key: "feishuPollSeconds", label: "回复拉取间隔（秒）", type: "number", placeholder: "2–60，默认 5",
              }),
            )
            : null,
          // The webhook only exists as a channel of its own; under the assistant
          // (and when Feishu is off) it would be dead weight in the form.
          mode === "webhook"
            ? react.createElement("div", { className: "dgn-section" },
              react.createElement("p", { className: "dgn-sectionTitle" }, "飞书 Webhook"),
              textField({
                key: "feishuWebhook", label: "Webhook 地址",
                placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/…",
                hint: "群自定义机器人的地址；完成后推送到该群（只能单向推送）。",
              }),
            )
            : null,
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
            type: "button",
            disabled: !writable || saving,
            onClick: reset,
            title: "把两条提醒语音恢复为包内默认",
          }, "恢复默认语音"),
          react.createElement("button", {
            className: "dgn-btn dgn-btn-secondary",
            type: "button",
            disabled: !writable || saving || !hasStaged,
            onClick: cancel,
          }, "取消"),
          react.createElement("button", {
            className: "dgn-btn dgn-btn-primary",
            type: "button",
            disabled: !writable || saving || !hasStaged,
            onClick: applyStaged,
          }, saving ? "保存中…" : "确认"),
        ),
      );
    }

    // ── seats ────────────────────────────────────────────────────────────────
    function LisaNoticeCard(props) {
      return react.createElement(LisaNoticeForm, { view: props && props.view, seat: "card" });
    }

    function LisaNoticePanel() {
      return react.createElement("div", { className: "dgn-panel" },
        react.createElement("div", { className: "dgn-panelInner" },
          react.createElement("p", { className: "dgn-panelTitle" }, "Genshin 通知提醒"),
          react.createElement("p", { className: "dgn-panelSub" }, "语音提醒、浏览器通知与飞书推送（含双向回复）"),
          react.createElement(LisaNoticeForm, { compact: true, seat: "panel" }),
        ),
      );
    }

    function LisaNoticeSettingsPage() {
      // The settings shell owns the column's padding and scrolling, so this
      // renders content only.
      return react.createElement("div", { className: "dgn-panelInner" },
        react.createElement("p", { className: "dgn-panelTitle" }, "Genshin 通知提醒"),
        react.createElement("p", { className: "dgn-panelSub" }, "完成 / 需要输入 / 失败时如何提醒你"),
        react.createElement(LisaNoticeForm, { compact: true, seat: "settings" }),
      );
    }

    // Left-rail icon: stroke-only, drawn at the requested square edge.
    function LisaNoticeIcon(props) {
      var size = (props && props.size) || 18;
      var color = props && props.active ? "var(--dsw-alias-label-primary)" : "currentColor";
      return react.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none",
        "aria-hidden": "true", style: { display: "block" },
      },
        react.createElement("path", {
          d: "M12 3.6a5.4 5.4 0 0 0-5.4 5.4v3.1L5.2 15h13.6l-1.4-2.9V9A5.4 5.4 0 0 0 12 3.6Z",
          stroke: color, strokeWidth: 1.6, strokeLinejoin: "round",
        }),
        react.createElement("path", {
          d: "M9.8 17.6a2.3 2.3 0 0 0 4.4 0",
          stroke: color, strokeWidth: 1.6, strokeLinecap: "round",
        }),
      );
    }

    // The card exists while the host serves this entry's namespace: a
    // deployment that never mounted the host half shows no trace of it.
    ctx.effect(function () {
      return ctx.configForms.whileServed([ENTRY_ID], function () {
        var offs = [];
        var add = function (seat, options, component) {
          try {
            offs.push(ctx.slots.inject(seat, function () {
              return ctx.slots.register(Object.assign({ registrant: PKG }, options), component);
            }));
          } catch (error) { /* seat unavailable on this client */ }
        };
        // `main` first: the rail validates the panel key against live entries.
        add("main", { name: "main", key: PANEL_ID }, LisaNoticePanel);
        add("sidebar.panellist", { name: "sidebar.panellist", id: PANEL_ID, order: 30, label: function () { return "通知提醒"; } }, LisaNoticeIcon);
        add("settings.section", { name: "settings.section", id: PKG, order: 25, label: function () { return "Genshin 通知提醒"; } }, LisaNoticeSettingsPage);
        add("plugins.bundle.config", { name: "plugins.bundle.config", key: PKG, order: 30 }, LisaNoticeCard);
        add("settings.plugin.item", { name: "settings.plugin.item", key: PKG, order: 30 }, LisaNoticeCard);
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
