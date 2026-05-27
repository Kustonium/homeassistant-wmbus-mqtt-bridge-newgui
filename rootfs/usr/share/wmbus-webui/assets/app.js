(() => {
  const app = document.getElementById("app");

  const navItems = [
    ["dashboard", "nav_dashboard", "DB"],
    ["meters", "nav_meters", "MT"],
    ["discover", "nav_discover", "DS"],
    ["search", "nav_search", "SR"],
    ["logs", "nav_logs", "LG"],
    ["esp-logs", "nav_esp_logs", "EL"],
    ["settings", "nav_settings", "ST"],
    ["about", "nav_about", "AB"],
  ];

  const textAliases = {
    webui_language: "show",
    webui_restart: "restart_addon",
    webui_updated: "updated_label",
    webui_online: "online_label",
    webui_raw_input: "raw_telegrams_received",
    webui_recent_meters: "configured_meters",
    webui_top_candidates: "best_candidate",
    webui_no_meters: "no_configured_meters_yet",
    webui_no_candidates: "no_candidates_yet",
    webui_no_events: "no_events_yet",
    webui_id: "id_label",
    webui_name: "meter_name_label",
    webui_value: "value_label",
    webui_last_seen: "last_telegram",
    webui_add: "add_meter",
    webui_remove: "delete",
    webui_stop: "save_disable_search",
    webui_search_cache: "candidates_for_search_label",
    webui_matches: "search_matches",
    webui_runtime_events: "recent_events_title",
    webui_diagnostics: "esp_diag_title",
    webui_suggestion: "esp_suggestion_title",
    webui_boot: "esp_boot_title",
    webui_esp_events: "esp_events_title",
    webui_search_mode: "search_config",
    webui_options_snapshot: "json_preview",
    webui_data_path: "runtime_files",
    webui_add_meter: "add_meter",
    webui_meter_name: "meter_name_label",
    webui_aes_key: "aes_key_label",
    webui_cancel: "cancel_label",
  };

  const state = {
    route: currentRoute(),
    data: null,
    loading: true,
    error: "",
    modal: null,
    toast: null,
    liveConnected: false,
    mediaFilter: "all",
  };

  let liveSource = null;
  let liveLang = "";
  let liveRenderTimer = null;

  // Debounced render for SSE live updates — coalesces rapid events into one
  // DOM patch. 150ms is enough to batch bursts without feeling sluggish.
  function scheduleRender() {
    if (liveRenderTimer) return;
    liveRenderTimer = window.setTimeout(() => {
      liveRenderTimer = null;
      render();
    }, 150);
  }

  function currentRoute() {
    const hash = window.location.hash.replace(/^#\/?/, "");
    const route = hash.split("?")[0].trim();
    return route || "dashboard";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function t(key, fallback = key, replacements = {}) {
    const dict = state.data?.i18n?.text || {};
    const text = dict[key] || dict[textAliases[key]] || fallback;
    return Object.entries(replacements).reduce(
      (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
      text,
    );
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  // ── Media classification ──────────────────────────────────────────────────
  // Works for both candidates (type = wmbusmeters type string like
  // "Warm Water (30°C-90°C) meter (0x06)") and meters (media = wmbusmeters
  // media field like "warm_water").
  function mediaClass(typeOrMedia, driver) {
    const s = ((typeOrMedia || "") + " " + (driver || "")).toLowerCase();
    if (s.includes("electric"))                           return "electricity";
    if (s.includes("warm_water") || s.includes("warm water") || s.includes("hot water")) return "warm_water";
    if (s.includes("heat") || s.includes("caloric") || s.includes("cooling")) return "heat";
    if (s.includes("water"))                              return "water";
    return "other";
  }

  // Returns {icon, color, bg, mc}.
  // Emoji like 💧 ignore CSS color — warm_water vs water is distinguished
  // by the background circle colour (#3b2010 orange vs #0f2a3b blue).
  function mediaIcon(typeOrMedia, driver) {
    const mc = mediaClass(typeOrMedia, driver);
    const icon  = {electricity:"⚡", heat:"🔥", warm_water:"🚱", water:"🚰", other:"·"}[mc] || "·";
    const color = {electricity:"#60b4f0", heat:"#f07840", warm_water:"#f09040", water:"#40c0e0", other:"#607a88"}[mc] || "#607a88";
    return {icon, color, mc};
  }

  // Render medium icon — just the emoji, no background circle.
  function mediaIconHtml(typeOrMedia, driver) {
    const {icon} = mediaIcon(typeOrMedia, driver);
    return `<span style="font-size:16px;vertical-align:middle;">${icon}</span>`;
  }

  // Filter chip bar — renders pill buttons; active one gets .active class.
  function filterChips() {
    const active = state.mediaFilter || "all";
    const filters = [
      ["all",         t("filter_all",         "Wszystkie")],
      ["water",       t("media_water",         "Woda")],
      ["electricity", t("media_electricity",   "Prąd")],
      ["heat",        t("media_heat",          "Ciepło")],
      ["warm_water",  t("media_warm_water",    "Ciepła woda")],
      ["other",       t("media_other",         "Inne")],
    ];
    const chips = filters.map(([key, label]) =>
      `<span class="filter${key === active ? " active" : ""}" data-action="media-filter" data-filter="${key}" style="cursor:pointer;">${escapeHtml(label)}</span>`
    ).join("");
    return `<div class="filters"><span style="color:#9eafba;font-size:12px;">${escapeHtml(t("show", "Pokaż:"))}</span> ${chips}</div>`;
  }

  // Filter array rows by current mediaFilter; typeField is the row property
  // that holds the wmbusmeters type/media string.
  function applyMediaFilter(rows, typeField = "type") {
    const active = state.mediaFilter || "all";
    if (active === "all") return rows;
    return rows.filter(r => mediaClass(r[typeField] || r.media || "", r.driver || "") === active);
  }

  // ── #2 Unit mapping ──────────────────────────────────────────────────────
  // Maps wmbusmeters value_key suffix → display unit string.
  // Longest suffixes checked first to avoid false matches (_kwh before _kw).
  function unitFromKey(valueKey) {
    const k = (valueKey || "").toLowerCase();
    if (k.endsWith("_kvarh"))   return "kVARh";
    if (k.endsWith("_kvah"))    return "kVAh";
    if (k.endsWith("_m3c"))     return "m³°C";
    if (k.endsWith("_m3ch"))    return "m³°C/h";
    if (k.endsWith("_m3h"))     return "m³/h";
    if (k.endsWith("_mjh"))     return "MJ/h";
    if (k.endsWith("_kvar"))    return "kVAR";
    if (k.endsWith("_kva"))     return "kVA";
    if (k.endsWith("_kwh"))     return "kWh";
    if (k.endsWith("_kw"))      return "kW";
    if (k.endsWith("_wh"))      return "Wh";
    if (k.endsWith("_lh"))      return "l/h";
    if (k.endsWith("_jh"))      return "J/h";
    if (k.endsWith("_gj"))      return "GJ";
    if (k.endsWith("_mj"))      return "MJ";
    if (k.endsWith("_dbm"))     return "dBm";
    if (k.endsWith("_hca"))     return "hca";
    if (k.endsWith("_pct"))     return "%";
    if (k.endsWith("_ppm"))     return "ppm";
    if (k.endsWith("_rh"))      return "RH%";
    if (k.endsWith("_hz"))      return "Hz";
    if (k.endsWith("_bar"))     return "bar";
    if (k.endsWith("_pa"))      return "Pa";
    if (k.endsWith("_m3"))      return "m³";
    if (k.endsWith("_mol"))     return "mol";
    if (k.endsWith("_min"))     return "min";
    if (k.endsWith("_rad"))     return "rad";
    if (k.endsWith("_deg"))     return "°";
    if (k.endsWith("_counter")) return "cnt";
    if (k.endsWith("_factor"))  return "×";
    if (k.endsWith("_nr"))      return "nr";
    if (k.endsWith("_kg"))      return "kg";
    if (k.endsWith("_cd"))      return "cd";
    if (k.endsWith("_w"))       return "W";
    if (k.endsWith("_v"))       return "V";
    if (k.endsWith("_a"))       return "A";
    if (k.endsWith("_k"))       return "K";
    if (k.endsWith("_c"))       return "°C";
    if (k.endsWith("_f"))       return "°F";
    if (k.endsWith("_l"))       return "l";
    if (k.endsWith("_m"))       return "m";
    if (k.endsWith("_s"))       return "s";
    if (k.endsWith("_h"))       return "h";
    if (k.endsWith("_d"))       return "d";
    if (k.endsWith("_y"))       return "y";
    return "";
  }

  // ── #5 Signal bars + meter health ────────────────────────────────────────
  function signalBars(seen15m) {
    const n = seen15m >= 10 ? 4 : seen15m >= 5 ? 3 : seen15m >= 2 ? 2 : seen15m > 0 ? 1 : 0;
    const ok = "#4df08d", off = "#2a3a3a";
    return `<span style="display:inline-flex;align-items:flex-end;height:16px;gap:1px;">${
      Array.from({length: 4}, (_, i) =>
        `<span style="display:inline-block;width:4px;height:${4 + i * 3}px;background:${i < n ? ok : off};border-radius:1px;"></span>`
      ).join("")
    }</span>`;
  }

  function meterStatusLabel(seen15m, seen60m) {
    if (seen15m > 0) return {label: t("online_label",  "online"),  color: "#2de36f"};
    if (seen60m > 0) return {label: t("silent_label",  "silent"),  color: "#f3c84b"};
    return             {label: t("offline_label", "offline"), color: "#ff646b"};
  }

  // ── #1 Encryption badge (shared by candidateTable + pendingMetersSection) ─
  function encBadge(enc, note) {
    const e = (enc || "").toLowerCase();
    if (!e) return `<span class="pill muted" title="${escapeHtml(t("enc_unknown", "Not yet analyzed"))}">?</span>`;
    const bad  = ["encrypted", "aes_required", "aes"].includes(e);
    const good = ["not_encrypted", "no_aes", "plain", "unencrypted"].includes(e);
    const label = bad ? "AES req." : good ? "no AES" : e;
    const cls   = bad ? "bad"      : good ? "ok"     : "muted";
    const title = note ? ` title="${escapeHtml(note)}"` : "";
    return `<span class="pill ${cls}"${title}>${escapeHtml(label)}</span>`;
  }

  // ── #6 Reception interval formatter ──────────────────────────────────────
  function fmtInterval(seconds) {
    const n = Number(seconds);
    if (!n || n <= 0) return "—";
    if (n < 60)   return `${Math.round(n)}s`;
    if (n < 3600) return `${Math.round(n / 60)}m`;
    return `${Math.round(n / 3600)}h`;
  }

  // ── #7 Pending-restart banner ─────────────────────────────────────────────
  // Shown when options.json is newer than status.json (user saved settings
  // but the add-on hasn't restarted yet to pick them up).
  function pendingRestartBanner() {
    const model = (state.data || {}).model || {};
    if (!model.pending_restart) return "";
    return `
      <div class="notice warn" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div>
          <strong>⚠ ${escapeHtml(t("pending_title", "Pending changes — waiting for restart"))}</strong>
          <div style="font-size:11px;color:#b0a060;margin-top:3px;">${escapeHtml(t("pending_text", "These meters are saved in options.json but the add-on hasn't picked them up yet. Restart the add-on to apply."))}</div>
        </div>
        <button class="btn warn" data-action="restart" style="white-space:nowrap;flex-shrink:0;">${escapeHtml(t("restart_addon", "Restart add-on"))}</button>
      </div>
    `;
  }

  function number(value) {
    const parsed = Number.parseInt(value ?? 0, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function fmtTime(value) {
    if (!value) return "-";
    const text = String(value);
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return escapeHtml(text);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function pill(ok, label) {
    const cls = ok ? "ok" : "bad";
    return `<span class="pill ${cls}"><span class="dot"></span>${escapeHtml(label)}</span>`;
  }

  function levelPill(level) {
    const raw = String(level || "info").toLowerCase();
    const cls = raw.includes("error") ? "bad" : raw.includes("warn") ? "warn" : "ok";
    return `<span class="pill ${cls}"><span class="dot"></span>${escapeHtml(raw)}</span>`;
  }

  function toast(message, isError = false) {
    state.toast = {message, isError};
    render();
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => {
      state.toast = null;
      render();
    }, 4800);
  }

  function currentLang() {
    return state.data?.i18n?.lang || liveLang || "";
  }

  function applyData(payload) {
    const previousI18n = state.data?.i18n;
    state.data = {...(state.data || {}), ...(payload || {})};
    if (!payload?.i18n && previousI18n) {
      state.data.i18n = previousI18n;
    }
    state.error = "";
  }

  async function fetchData(lang = "") {
    try {
      const url = lang ? `api/app?lang=${encodeURIComponent(lang)}` : "api/app";
      const response = await fetch(url, {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      applyData(await response.json());
      startLiveUpdates(state.data?.i18n?.lang || lang || currentLang());
    } catch (error) {
      state.error = `Cannot load dashboard data: ${error.message}`;
    } finally {
      state.loading = false;
      render();
    }
  }

  async function postApi(endpoint, payload) {
    const response = await fetch(`api/${endpoint}`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload || {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(result.message || `HTTP ${response.status}`);
    }
    return result;
  }

  function startLiveUpdates(lang = "") {
    if (!window.EventSource) {
      state.liveConnected = false;
      return;
    }
    const nextLang = lang || currentLang();
    if (liveSource && liveLang === nextLang) return;
    if (liveSource) {
      liveSource.close();
      liveSource = null;
    }
    liveLang = nextLang;
    const url = nextLang ? `api/events?lang=${encodeURIComponent(nextLang)}` : "api/events";
    liveSource = new EventSource(url);
    liveSource.onopen = () => {
      state.liveConnected = true;
      scheduleRender();
    };
    // Server sends named SSE events: "event: state\ndata: ...\n\n"
    // onmessage only fires for unnamed events — must use addEventListener("state").
    liveSource.addEventListener("state", (event) => {
      try {
        applyData(JSON.parse(event.data));
        state.loading = false;
        state.liveConnected = true;
        scheduleRender();
      } catch (error) {
        state.liveConnected = false;
      }
    });
    liveSource.onerror = () => {
      state.liveConnected = false;
    };
  }

  function routeTitle(route) {
    const item = navItems.find(([id]) => id === route);
    return item ? t(item[1], item[0]) : t("dashboard_title", "Dashboard");
  }

  function navHtml(mobile = false) {
    const cls = mobile ? "mobile-nav" : "nav";
    return `<nav class="${cls}">${navItems
      .map(([id, key, mark]) => {
        const active = id === state.route ? " active" : "";
        const icon = mobile ? "" : `<span class="nav-ico">${mark}</span>`;
        return `<a class="${active}" href="#/${id}">${icon}<span>${escapeHtml(t(key, id))}</span></a>`;
      })
      .join("")}</nav>`;
  }

  function languageSelect() {
    const i18n = state.data?.i18n || {};
    const current = i18n.lang || "en";
    const labels = i18n.labels || {};
    const supported = asArray(i18n.supported).length ? i18n.supported : ["en", "pl", "de", "cs", "sk"];
    return `
      <div class="lang-menu">
        <button class="lang-button" type="button" data-action="toggle-language" aria-label="${escapeHtml(t("webui_language", "Language"))}">
          <span class="flag flag-${escapeHtml(current)}"></span>
          <span>${escapeHtml(labels[current] || current.toUpperCase())}</span>
        </button>
        <div class="lang-options" hidden>
          ${supported
            .map(
              (lang) => `
                <button class="${lang === current ? "active" : ""}" type="button" data-action="language" data-lang="${escapeHtml(lang)}">
                  <span class="flag flag-${escapeHtml(lang)}"></span>
                  <span>${escapeHtml(labels[lang] || lang)}</span>
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function shell(content) {
    const data = state.data || {};
    const meta = data.meta || {};
    const model = data.model || {};
    const title = routeTitle(state.route);
    const updatedAt = model.status?.updated_at || data.status?.updated_at || "";
    const runtime =
      meta.runtime === "home_assistant"
        ? t("webui_runtime_home_assistant", "Home Assistant")
        : t("webui_runtime_docker", "Docker");
    const dev = meta.is_dev ? '<span class="pill warn">DEV</span>' : "";

    return `
      <div class="app-shell">
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-mark">WB</div>
            <div>
              <div class="brand-title">wMBus MQTT Bridge</div>
              <div class="brand-sub">v${escapeHtml(meta.version || "dev")} ${dev}</div>
            </div>
          </div>
          ${navHtml(false)}
          <div class="sidebar-foot">
            <span>${escapeHtml(runtime)}</span>
            <a class="btn ghost" href="legacy">${escapeHtml(t("webui_legacy", "Legacy UI"))}</a>
          </div>
        </aside>
        <main class="main">
          ${navHtml(true)}
          <header class="topbar">
            <div class="top-title">
              <h1>${escapeHtml(title)}</h1>
              <p>${escapeHtml(t("webui_updated", "Updated"))} ${fmtTime(updatedAt)}</p>
            </div>
            <div class="top-actions">
              ${languageSelect()}
              <span class="pill ${state.liveConnected ? "ok" : "muted"}"><span class="dot"></span>${state.liveConnected ? "LIVE" : "POLL"}</span>
              <button class="btn" data-action="refresh">${escapeHtml(t("webui_refresh", "Refresh"))}</button>
              <button class="btn danger" data-action="restart">${escapeHtml(t("webui_restart", "Restart"))}</button>
            </div>
          </header>
          <div class="content">
            ${state.error ? `<div class="empty">${escapeHtml(state.error)}</div>` : content}
          </div>
        </main>
      </div>
      ${state.modal ? renderModal() : ""}
      ${state.toast ? `<div class="toast ${state.toast.isError ? "error" : ""}">${escapeHtml(state.toast.message)}</div>` : ""}
    `;
  }

  function metric(label, value, sub) {
    return `
      <div class="card metric">
        <span class="label">${escapeHtml(label)}</span>
        <span class="value">${escapeHtml(value)}</span>
        <span class="sub">${escapeHtml(sub || "")}</span>
      </div>
    `;
  }

  function statusCard(title, ok, detail) {
    return `
      <div class="card status-card">
        ${pill(ok, ok ? t("webui_online", "Online") : t("webui_attention", "Attention"))}
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail || "")}</span>
      </div>
    `;
  }

  function statsPanel(model) {
    const current = Number(model.rate_current_min || 0);
    const previous = Number(model.rate_prev_min || 0);
    const trend = current - previous;
    const trendClass = trend > 0 ? "up" : trend < 0 ? "down" : "flat";
    const trendMark = trend > 0 ? "↑" : trend < 0 ? "↓" : "→";
    // Separate scales: candidates/meters share one scale, rate has its own.
    // Mixing raw_per_min (84.2) with candidate_count (5) as a single maxValue
    // makes candidate/meter bars nearly invisible while rate bar shows 100%.
    const countMax = Math.max(Number(model.candidate_count || 0), Number(model.meter_count || 0), 1);
    const rateMax  = Math.max(Number(model.raw_per_min || 0), 1);
    // Rate source badge
    const rateSource = model.rate_source || "bridge";
    const srcIcon  = rateSource === "esp" ? "📡" : "⚙";
    const srcColor = rateSource === "esp" ? "#00bcd4" : "#607a88";
    // In decode mode raw_per_min is computed from meters TSV (decoded telegrams),
    // not from candidates TSV (which is stale). Label reflects this.
    const inDecodeMode = Number(model.meter_count || 0) > 0;
    const rateLabel = inDecodeMode
      ? t("decoded_per_min_metric", "Decoded / min")
      : t("telegrams_per_min_metric", "Telegrams / min");
    const rateSuffix = rateSource === "esp"
      ? `${srcIcon} ESP 60s`
      : inDecodeMode
        ? t("rate_decoded_avg_label", "session avg (decoded)")
        : t("rate_session_avg_label", "60 min avg");

    return `
      <section class="section">
        <div class="card stats-panel">
          <div class="section-head">
            <h2>${escapeHtml(t("statistics", "Statistics"))}</h2>
          </div>
          <div class="stats-live">
            <div>
              <span>${escapeHtml(t("rate_current_min_label", "Current minute"))}</span>
              <strong>${escapeHtml(current)}</strong>
              <small>${escapeHtml(t("rate_tel_min", "tel / min"))}</small>
            </div>
            <div>
              <span>${escapeHtml(t("rate_prev_min_label", "Previous minute"))}</span>
              <strong>${escapeHtml(previous)}</strong>
              <small>${escapeHtml(t("rate_tel_min", "tel / min"))}</small>
            </div>
            <div class="trend ${trendClass}">
              <span>${escapeHtml(t("rate_trend_label", "Trend"))}</span>
              <strong>${trendMark}</strong>
              <small>${trend > 0 ? "+" : ""}${escapeHtml(trend)} ${escapeHtml(t("rate_vs_prev", "vs previous"))}</small>
            </div>
          </div>
          <div style="text-align:right;font-size:10px;color:#4d6875;padding-top:4px;border-top:1px solid #1a3344;margin-top:4px;">
            ${escapeHtml(t("rate_source_label", "Rate source"))}: <span style="color:${srcColor};font-weight:700;">${srcIcon} ${escapeHtml(rateSource)}</span>
          </div>
          <div class="stats-bars">
            ${statsRow("candidate", t("detected_candidates", "Detected candidates"), model.candidate_count || 0, model.candidate_count || 0, countMax)}
            ${statsRow("meter", t("configured_meters", "Configured meters"), model.meter_count || 0, model.meter_count || 0, countMax)}
            ${statsRow("rate", rateLabel, model.raw_per_min || 0, model.raw_per_min || 0, rateMax, rateSuffix)}
          </div>
        </div>
      </section>
    `;
  }

  function statsRow(type, label, value, barValue, maxValue, suffix = "") {
    const numeric = Number(barValue || 0);
    const pct = numeric > 0 ? Math.max(3, Math.min(100, Math.round((numeric / maxValue) * 100))) : 1;
    return `
      <div class="stats-row ${type}">
        <span class="stats-icon"></span>
        <div class="stats-label">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
        <div class="stats-track"><span style="width:${pct}%"></span></div>
        ${suffix ? `<small>${escapeHtml(suffix)}</small>` : ""}
      </div>
    `;
  }

  function dashboard() {
    const data = state.data || {};
    const model = data.model || {};
    const pipe = model.pipe || {};
    const mqtt = model.mqtt || {};
    const recentMeters = asArray(data.meters).slice(0, 6);
    const recentCandidates = asArray(data.candidates).slice(0, 6);

    return `
      <section class="section">
        <div class="status-row">
          ${statusCard("MQTT", !!model.mqtt_ok, mqtt.host ? `${mqtt.host}:${mqtt.port || ""}` : t("webui_mqtt_detail", "Broker connection"))}
          ${statusCard(t("webui_raw_input", "Raw input"), !!model.raw_ok, `${number(pipe.raw_count)} ${t("raw_telegrams_metric", "telegrams")}`)}
          ${statusCard("wmbusmeters", !!model.wmbus_ok, t("webui_wmbusmeters_detail", "Decoder process and decoded stream"))}
          ${statusCard(t("discovery_label", "Discovery"), !!model.discovery_ok, t("webui_discovery_detail", "Home Assistant MQTT discovery"))}
        </div>
      </section>

      ${pendingRestartBanner()}
      ${statsPanel(model)}

      <section class="section grid two">
        <div>
          <div class="section-head"><h2>${escapeHtml(t("webui_recent_meters", "Recent meters"))}</h2><span>${recentMeters.length} ${escapeHtml(t("webui_shown", "shown"))}</span></div>
          ${meterTable(recentMeters, false)}
        </div>
        <div>
          <div class="section-head">
            <h2>${escapeHtml(t("webui_top_candidates", "Top candidates"))}</h2>
            <span>${recentCandidates.length} ${escapeHtml(t("webui_shown", "shown"))}</span>
          </div>
          ${Number(model.meter_count || 0) > 0
            ? `<div style="font-size:11px;color:#607a88;margin-bottom:8px;">🕐 ${escapeHtml(t("raw_signal_note_short", "Decode mode — data is stale from previous listen session"))}</div>`
            : ""}
          ${candidateTable(recentCandidates, false)}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>${escapeHtml(t("recent_events_title", "Recent events"))}</h2><span>${asArray(data.events).length} ${escapeHtml(t("webui_total", "total"))}</span></div>
        ${eventsList(asArray(data.events).slice(0, 8))}
      </section>
    `;
  }

  function meterTable(rows, withActions = true) {
    if (!rows.length) return `<div class="empty">${escapeHtml(t("webui_no_meters", "No meters yet."))}</div>`;
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t("webui_id", "ID"))}</th>
              <th>${escapeHtml(t("webui_name", "Name"))}</th>
              <th>${escapeHtml(t("driver", "Driver"))}</th>
              <th>${escapeHtml(t("webui_value", "Value"))}</th>
              <th>${escapeHtml(t("webui_last_seen", "Last seen"))}</th>
              <th>${escapeHtml(t("reception", "Reception"))}</th>
              ${withActions ? "<th></th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row) => {
                const id      = row.id || row.meter_id || "";
                const seen15m = Number(row.seen_15m || 0);
                const seen60m = Number(row.seen_60m || 0);
                const {label: statusLabel, color: statusColor} = meterStatusLabel(seen15m, seen60m);
                const unit    = unitFromKey(row.value_key || "");
                const valueStr = (row.value && row.value !== "-") ? row.value : "—";
                return `
                  <tr>
                    <td><strong>${escapeHtml(id)}</strong></td>
                    <td>${escapeHtml(row.name || row.id || "-")}</td>
                    <td>${escapeHtml(row.driver || "-")}</td>
                    <td>
                      <span>${escapeHtml(valueStr)}${unit ? ` <span class="mono" style="color:#9eafba;font-size:11px;">${escapeHtml(unit)}</span>` : ""}</span>
                      ${row.value_key ? `<div class="mono" style="font-size:10px;color:#4a6070;">${escapeHtml(row.value_key)}</div>` : ""}
                    </td>
                    <td>${fmtTime(row.last_seen)}</td>
                    <td style="white-space:nowrap;">
                      <span style="color:${statusColor};font-size:11px;font-weight:600;">${escapeHtml(statusLabel)}</span>
                      <span style="margin-left:5px;">${signalBars(seen15m)}</span>
                      <div style="font-size:10px;color:#607a88;">${escapeHtml(fmtInterval(row.avg_interval_s))}</div>
                    </td>
                    ${
                      withActions
                        ? `<td><div class="actions"><button class="btn danger" data-action="remove-meter" data-id="${escapeHtml(id)}">${escapeHtml(t("webui_remove", "Remove"))}</button></div></td>`
                        : ""
                    }
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function candidateTable(rows, withActions = true) {
    if (!rows.length) return `<div class="empty">${escapeHtml(t("webui_no_candidates", "No visible candidates."))}</div>`;
    // analysis is keyed by meter ID
    const analysis = (state.data || {}).analysis || {};
    const decodeMode = Number(((state.data || {}).model || {}).meter_count || 0) > 0;
    // In decode mode the 15m/60m columns are STALE — bridge.sh only updates candidates when meter_count==0
    const rawTip = decodeMode
      ? ` title="${escapeHtml(t("raw_signal_col_tip", "Stale data from previous listen session — not updated in decode mode"))}" style="cursor:help;border-bottom:1px dashed #607a88;"`
      : "";
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t("webui_id", "ID"))}</th>
              <th>${escapeHtml(t("driver", "Driver"))}</th>
              <th>${escapeHtml(t("webui_type", "Type"))}</th>
              <th>${escapeHtml(t("media", "Medium"))}</th>
              <th>${escapeHtml(t("encryption_label", "Encryption"))}</th>
              <th>${escapeHtml(t("webui_last_seen", "Last seen"))}</th>
              <th><span${rawTip}>15m${decodeMode ? " 📡" : ""}</span></th>
              <th><span${rawTip}>60m${decodeMode ? " 📡" : ""}</span></th>
              <th>${escapeHtml(t("reception", "Interval"))}</th>
              ${withActions ? "<th></th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row) => {
                const id     = row.id || "";
                const driver = row.driver || "auto";
                const {mc}   = mediaIcon(row.type || "", driver);
                const mediaLabel = t(`media_${mc}`, mc);
                // look up analysis by id (may be stored lowercase or uppercase)
                const a    = analysis[id] || analysis[id.toUpperCase()] || row.analysis || {};
                const enc  = String(a.encryption || "").toLowerCase();
                const note = String(a.note || "");
                return `
                  <tr>
                    <td><strong>${escapeHtml(id)}</strong></td>
                    <td>${escapeHtml(driver)}</td>
                    <td style="color:#9eafba;font-size:12px;">${escapeHtml(row.type || "-")}</td>
                    <td>${mediaIconHtml(row.type || "", driver)} ${escapeHtml(mediaLabel)}</td>
                    <td>${encBadge(enc, note)}</td>
                    <td>${fmtTime(row.last_seen)}</td>
                    <td>${escapeHtml(row.seen_15m || "0")}</td>
                    <td>${escapeHtml(row.seen_60m || "0")}</td>
                    <td style="color:#607a88;font-size:12px;">${escapeHtml(fmtInterval(row.avg_interval_s))}</td>
                    ${
                      withActions
                        ? `<td><div class="actions">
                            <button class="btn primary" data-action="open-add" data-id="${escapeHtml(id)}" data-driver="${escapeHtml(driver)}">${escapeHtml(t("webui_add", "Add"))}</button>
                            <button class="btn" data-action="ignore" data-id="${escapeHtml(id)}">${escapeHtml(t("ignore", "Ignore"))}</button>
                          </div></td>`
                        : ""
                    }
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function pendingMetersSection(rows, analysis) {
    return `
      <div style="margin-top:20px;">
        <div class="section-head" style="margin-bottom:4px;">
          <h3 style="font-size:13px;color:#9eafba;margin:0;">
            ⏳ ${escapeHtml(t("waiting_for_telegrams_title", "Waiting for first telegram"))}
          </h3>
          <span>${rows.length}</span>
        </div>
        <p style="font-size:11px;color:#607a88;margin:0 0 10px;">${escapeHtml(t("waiting_for_telegrams_text", "These meters are configured but haven't sent a telegram yet."))}</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(t("webui_id", "ID"))}</th>
                <th>${escapeHtml(t("driver", "Driver"))}</th>
                <th>${escapeHtml(t("encryption_label", "Encryption"))}</th>
                <th>${escapeHtml(t("aes_key_label", "AES key"))}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(m => {
                const mid    = String(m.meter_id || "").toLowerCase();
                const type   = m.type === "other" ? (m.type_other || "other") : (m.type || "auto");
                const hasKey = !!(m.key && m.key.trim());
                // analysis keyed by id as written by bridge.sh (may be lowercase or uppercase)
                const a   = analysis[mid] || analysis[mid.toUpperCase()] || {};
                const enc = String(a.encryption || "").toLowerCase();
                const note = String(a.note || "");
                return `
                  <tr>
                    <td><strong>${escapeHtml(mid)}</strong></td>
                    <td style="color:#9eafba;font-size:12px;">${escapeHtml(type)}</td>
                    <td>${encBadge(enc, note)}</td>
                    <td>${hasKey
                      ? `<span class="pill ok">✓ set</span>`
                      : `<span class="pill muted">${escapeHtml(t("no_key", "No key"))}</span>`}
                    </td>
                    <td><button class="btn danger" data-action="remove-meter" data-id="${escapeHtml(mid)}">${escapeHtml(t("webui_remove", "Remove"))}</button></td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function metersPage() {
    const data = state.data || {};
    const all = asArray(data.meters);
    const filtered = applyMediaFilter(all, "media");

    // Pending = in options.json but not yet decoded (not in status_meters.tsv)
    const knownIds  = new Set(all.map(m => String(m.id || "").toLowerCase()));
    const optMeters = asArray((data.options || {}).meters);
    const pending   = optMeters.filter(m => {
      const mid = String(m.meter_id || "").toLowerCase();
      return mid && !knownIds.has(mid);
    });

    return `
      ${pendingRestartBanner()}
      <section class="section">
        <div class="section-head">
          <h2>${escapeHtml(t("configured_meters", "Configured meters"))}</h2>
          <span>${filtered.length}${filtered.length !== all.length ? `/${all.length}` : ""} ${escapeHtml(t("webui_shown", "shown"))}</span>
        </div>
        ${filterChips()}
        ${meterTable(filtered, true)}
        ${pending.length ? pendingMetersSection(pending, data.analysis || {}) : ""}
      </section>
    `;
  }

  function discoverPage() {
    const data = state.data || {};
    const model = data.model || {};
    const all = asArray(data.candidates);
    const filtered = applyMediaFilter(all, "type");
    const decodeMode = Number(model.meter_count || 0) > 0;
    const rawSignalNote = decodeMode ? `
      <div class="notice" style="margin-bottom:12px;display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:16px;flex-shrink:0;">🕐</span>
        <div>
          <strong>${escapeHtml(t("decode_mode_label", "Decode mode — candidate data is from previous listen session"))}</strong>
          <div style="font-size:11px;color:#9eafba;margin-top:2px;">${escapeHtml(t("raw_signal_note", "wmbusmeters is processing configured meters only and no longer updates candidate statistics. The values below (15m / 60m / Interval) are from the previous LISTEN session and are NOT being updated in real time."))}</div>
        </div>
      </div>` : "";
    return `
      <section class="section">
        <div class="section-head">
          <h2>${escapeHtml(t("detected_candidates", "Detected candidates"))}</h2>
          <span>${filtered.length}${filtered.length !== all.length ? `/${all.length}` : ""} ${escapeHtml(t("webui_visible", "visible"))}</span>
        </div>
        ${rawSignalNote}
        ${filterChips()}
        ${candidateTable(filtered, true)}
      </section>
      <section class="section">
        <div class="section-head">
          <h2>${escapeHtml(t("ignored", "Ignored"))}</h2>
          <span>${asArray(data.ignored).length} ${escapeHtml(t("webui_id", "ID"))}</span>
        </div>
        ${ignoredList(asArray(data.ignored))}
      </section>
    `;
  }

  function ignoredList(rows) {
    if (!rows.length) return `<div class="empty">${escapeHtml(t("webui_no_ignored", "No ignored candidates."))}</div>`;
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>${escapeHtml(t("webui_id", "ID"))}</th><th></th></tr></thead>
          <tbody>
            ${rows
              .map(
                (id) => `
                  <tr>
                    <td><strong>${escapeHtml(id)}</strong></td>
                    <td><button class="btn" data-action="unignore" data-id="${escapeHtml(id)}">${escapeHtml(t("restore", "Restore"))}</button></td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function searchPage() {
    const data = state.data || {};
    const cfg = data.search_config || {};
    const status = data.search_status || {};
    const active = !!cfg.search_mode || ["collecting", "search", "matched"].includes(String(status.phase || ""));
    return `
      <section class="section search-card card">
        <div class="section-head">
          <h2>${escapeHtml(t("search_config", "Search mode"))}</h2>
          ${active ? `<span class="pill warn"><span class="dot"></span>${escapeHtml(t("active", "Active"))}</span>` : `<span class="pill muted">${escapeHtml(t("webui_idle", "Idle"))}</span>`}
        </div>
        <form id="search-form" class="form-grid">
          <div class="field">
            <label for="expected">${escapeHtml(t("expected_label", "Expected m3"))}</label>
            <input id="expected" name="expected" inputmode="decimal" value="${escapeHtml(cfg.search_expected_value_m3 || "0")}">
          </div>
          <div class="field">
            <label for="tolerance">${escapeHtml(t("tolerance_m3_label", "Tolerance m3"))}</label>
            <input id="tolerance" name="tolerance" inputmode="decimal" value="${escapeHtml(cfg.search_tolerance_m3 || "0.05")}">
          </div>
          <div class="field">
            <label>&nbsp;</label>
            <div class="actions">
              <button class="btn primary" type="submit" name="action" value="start">${escapeHtml(t("webui_start", "Start"))}</button>
              <button class="btn" type="submit" name="action" value="stop">${escapeHtml(t("webui_stop", "Stop"))}</button>
            </div>
          </div>
        </form>
      </section>
      <section class="section grid two">
        <div>
          <div class="section-head"><h2>${escapeHtml(t("webui_search_cache", "Search cache"))}</h2><span>${asArray(data.search_candidates).length} ${escapeHtml(t("webui_rows", "rows"))}</span></div>
          ${simpleRows(asArray(data.search_candidates), ["id", "driver", "type"])}
        </div>
        <div>
          <div class="section-head"><h2>${escapeHtml(t("webui_matches", "Matches"))}</h2><span>${asArray(data.search_matches).length} ${escapeHtml(t("webui_rows", "rows"))}</span></div>
          ${simpleRows(asArray(data.search_matches), ["id", "driver", "value_m3", "diff_m3"])}
        </div>
      </section>
    `;
  }

  // ── ESP event table ───────────────────────────────────────────────────────
  const ESP_COLORS = {
    summary:            "#00bcd4",
    summary_15min:      "#0097a7",
    summary_60min:      "#006064",
    dropped:            "#f44336",
    truncated:          "#ff9800",
    rx_path:            "#9c27b0",
    suggestion:         "#ff5722",
    boot:               "#4caf50",
    busy_ether_changed: "#795548",
    meter_snapshot:     "#009688",
    meter_window:       "#3f51b5",
  };
  const ESP_ICONS = {
    summary:            "📊",
    summary_15min:      "📊",
    summary_60min:      "📊",
    dropped:            "✗",
    truncated:          "⚠",
    rx_path:            "📡",
    suggestion:         "💡",
    boot:               "🔄",
    busy_ether_changed: "📶",
    meter_snapshot:     "📸",
    meter_window:       "🪟",
  };
  const ESP_KEY_MAP = {
    summary:            ["listen_mode","total","ok","dropped","drop_pct","avg_ok_rssi","hint_en"],
    summary_15min:      ["listen_mode","total","ok","dropped","drop_pct","avg_ok_rssi","hint_en"],
    summary_60min:      ["listen_mode","total","ok","dropped","drop_pct","avg_ok_rssi","hint_en"],
    dropped:            ["stage","reason","detail","mode"],
    truncated:          ["stage","reason","detail","mode"],
    rx_path:            ["stage","mode","rssi"],
    suggestion:         ["chip","code","yaml_key","suggested_value"],
    boot:               ["radio","listen_mode","version"],
    busy_ether_changed: ["chip","state","drop_pct"],
    meter_snapshot:     ["trigger","elapsed_s"],
    meter_window:       ["trigger","id","mode","count_window","count_total","win_avg_rssi"],
  };

  function espEventSummary(payloadStr, evtype) {
    let d = {};
    try { d = JSON.parse(payloadStr || "{}"); } catch(_) { return (payloadStr || "").slice(0, 80); }
    const keys = ESP_KEY_MAP[evtype] || Object.keys(d).slice(0, 5);
    const parts = [];
    for (const k of keys) {
      const v = d[k];
      if (v !== undefined && v !== null && String(v) !== "" && String(v) !== "null") {
        parts.push(`${k}=${v}`);
      }
    }
    if (evtype === "meter_snapshot") {
      const meters = Array.isArray(d.meters) ? d.meters : [];
      if (meters.length) {
        const ids = meters.filter(m => m && m.id).map(m => m.id).join("  ");
        parts.push(`meters=${meters.length} [${ids}]`);
      }
    }
    const text = parts.join("  ");
    return text.slice(0, 140) || (payloadStr || "").slice(0, 80);
  }

  function espEventsTable(rows) {
    if (!rows.length) return `<div class="empty">${escapeHtml(t("webui_no_events", "No events yet."))}</div>`;
    return `
      <div class="table-wrap">
        <table class="esp-events-tbl">
          <thead>
            <tr>
              <th style="white-space:nowrap;">${escapeHtml(t("webui_time","Time"))}</th>
              <th>${escapeHtml(t("webui_type","Type"))}</th>
              <th>${escapeHtml(t("webui_topic","Topic"))}</th>
              <th>${escapeHtml(t("webui_summary","Summary"))}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => {
              const evtype  = row.evtype || "unknown";
              const color   = ESP_COLORS[evtype] || "#607a88";
              const icon    = ESP_ICONS[evtype]  || "·";
              const epoch   = Number(row.epoch || 0);
              const timeStr = epoch ? new Date(epoch * 1000).toLocaleString() : "-";
              const topic   = (row.topic || "").split("/").slice(-3).join("/");
              const summary = espEventSummary(row.payload || "", evtype);
              return `
                <tr>
                  <td style="white-space:nowrap;color:#9eafba;font-size:11px;">${escapeHtml(timeStr)}</td>
                  <td style="white-space:nowrap;">
                    <span style="color:${color};font-weight:700;">${icon} ${escapeHtml(evtype)}</span>
                  </td>
                  <td style="color:#9eafba;font-size:11px;white-space:nowrap;">${escapeHtml(topic)}</td>
                  <td style="font-size:12px;word-break:break-word;max-width:420px;">${escapeHtml(summary)}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function simpleRows(rows, fields) {
    if (!rows.length) return `<div class="empty">${escapeHtml(t("webui_no_rows", "No rows."))}</div>`;
    return `
      <div class="table-wrap">
        <table>
          <thead><tr>${fields.map((field) => `<th>${escapeHtml(field)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows
              .map((row) => `<tr>${fields.map((field) => `<td>${field === "id" ? `<strong>${escapeHtml(row[field] || "-")}</strong>` : escapeHtml(row[field] || "-")}</td>`).join("")}</tr>`)
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function logsPage() {
    const data = state.data || {};
    return `
      <section class="section">
        <div class="section-head"><h2>${escapeHtml(t("webui_runtime_events", "Runtime events"))}</h2><span>${asArray(data.events).length} ${escapeHtml(t("webui_rows", "rows"))}</span></div>
        ${eventsList(asArray(data.events))}
      </section>
    `;
  }

  function espLogsPage() {
    const data = state.data || {};
    const esp = data.esp || {};
    const diag = esp.diag || {};
    const suggestion = esp.suggestion || {};
    const boot = esp.boot || {};
    const events = asArray(esp.events);
    return `
      <section class="section grid two">
        <div>
          <div class="section-head"><h2>${escapeHtml(t("webui_diagnostics", "Diagnostics"))}</h2></div>
          ${Object.keys(diag).length ? objectKv(diag) : `<div class="empty">${escapeHtml(t("webui_no_diagnostics", "No diagnostic summary."))}</div>`}
        </div>
        <div>
          <div class="section-head"><h2>${escapeHtml(t("webui_suggestion", "Suggestion"))}</h2></div>
          ${Object.keys(suggestion).length ? objectKv(suggestion) : `<div class="empty">${escapeHtml(t("webui_no_suggestion", "No tuning suggestion."))}</div>`}
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>${escapeHtml(t("webui_boot", "Boot"))}</h2></div>
        ${Object.keys(boot).length ? objectKv(boot) : `<div class="empty">${escapeHtml(t("webui_no_boot", "No boot data."))}</div>`}
      </section>
      <section class="section">
        <div class="section-head"><h2>${escapeHtml(t("webui_esp_events", "ESP events"))}</h2><span>${events.length} ${escapeHtml(t("webui_rows", "rows"))}</span></div>
        ${espEventsTable(events)}
      </section>
    `;
  }

  function objectKv(obj) {
    const entries = Object.entries(obj || {}).slice(0, 24);
    if (!entries.length) return `<div class="empty">No data.</div>`;
    return `
      <div class="kv">
        ${entries.map(([key, value]) => `<div>${escapeHtml(key)}</div><div>${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</div>`).join("")}
      </div>
    `;
  }

  function eventsList(rows) {
    if (!rows.length) return `<div class="empty">${escapeHtml(t("webui_no_events", "No events yet."))}</div>`;
    return `
      <div class="event-list">
        ${rows
          .map(
            (row) => `
              <div class="event-row">
                <div>${fmtTime(row.time)}</div>
                <div class="event-level">${escapeHtml(row.level || "info")}</div>
                <div>${escapeHtml(row.message || "")}</div>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function settingsPage() {
    const data = state.data || {};
    const model = data.model || {};
    const cfg = model.cfg || {};
    const mqtt = model.mqtt || {};
    const meta = data.meta || {};
    return `
      <section class="section grid two">
        <div>
          <div class="section-head"><h2>${escapeHtml(t("webui_runtime", "Runtime"))}</h2></div>
          <div class="kv">
            <div>Mode</div><div>${escapeHtml(meta.runtime || "-")}</div>
            <div>${escapeHtml(t("webui_base_path", "Base path"))}</div><div class="mono">${escapeHtml(meta.base || "-")}</div>
            <div>${escapeHtml(t("webui_raw_topic", "Raw topic"))}</div><div class="mono">${escapeHtml(cfg.raw_topic || "-")}</div>
            <div>State prefix</div><div class="mono">${escapeHtml(cfg.state_prefix || "-")}</div>
            <div>Discovery prefix</div><div class="mono">${escapeHtml(cfg.discovery_prefix || "-")}</div>
            <div>${escapeHtml(t("webui_search_mode", "Search mode"))}</div><div>${escapeHtml(String(cfg.search_mode ?? false))}</div>
          </div>
        </div>
        <div>
          <div class="section-head"><h2>MQTT</h2></div>
          <div class="kv">
            <div>Connected</div><div>${escapeHtml(String(!!model.mqtt_ok))}</div>
            <div>Host</div><div class="mono">${escapeHtml(mqtt.host || "-")}</div>
            <div>Port</div><div class="mono">${escapeHtml(mqtt.port || "-")}</div>
            <div>Mode</div><div>${escapeHtml(cfg.mqtt_mode || "-")}</div>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>${escapeHtml(t("webui_options_snapshot", "Options snapshot"))}</h2></div>
        <div class="code">${escapeHtml(JSON.stringify(data.options || {}, null, 2))}</div>
      </section>
    `;
  }

  function aboutPage() {
    const data = state.data || {};
    const meta = data.meta || {};
    return `
      <section class="section grid two">
        <div class="card metric">
          <span class="label">Version</span>
          <span class="value">${escapeHtml(meta.version || "dev")}</span>
          <span class="sub">${escapeHtml(meta.runtime || "-")}</span>
        </div>
        <div class="card metric">
          <span class="label">${escapeHtml(t("webui_data_path", "Data path"))}</span>
          <span class="value" style="font-size:18px">${escapeHtml(meta.base || "-")}</span>
          <span class="sub">Runtime files used by the dashboard</span>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>${escapeHtml(t("webui_pipeline", "Pipeline"))}</h2></div>
        <div class="code">ESP32 / Gateway / Bridge
-> MQTT raw HEX
-> wmbusmeters stdin:hex
-> MQTT decoded JSON
-> Home Assistant Discovery</div>
      </section>
    `;
  }

  function renderModal() {
    const modal = state.modal || {};
    // Inline AES key validation script — runs in the same window context.
    // Strips non-hex chars, validates 0 or 32 hex chars, colours input,
    // shows char counter, enables/disables submit button (#4).
    const keyValidateJs = `(function(inp){
      var v = inp.value.replace(/[^0-9A-Fa-f]/g,'').slice(0,32);
      inp.value = v;
      var cnt = document.getElementById('aes-key-count');
      var btn = document.getElementById('add-meter-submit');
      if(v.length===0){
        inp.style.borderColor='';
        cnt.textContent='';
        btn.disabled=false;
      } else if(v.length===32){
        inp.style.borderColor='#1e6b3a';
        cnt.textContent='✓ 32';
        cnt.style.color='#4df08d';
        btn.disabled=false;
      } else {
        inp.style.borderColor='#6b4a1e';
        cnt.textContent=v.length+'/32';
        cnt.style.color='#f3c84b';
        btn.disabled=true;
      }
    })(this)`;
    return `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="add-meter-title">
          <div class="modal-head">
            <h2 id="add-meter-title">${escapeHtml(t("webui_add_meter", "Add meter"))}</h2>
          </div>
          <form id="add-meter-form">
            <div class="modal-body">
              <div class="form-grid" style="grid-template-columns:1fr">
                <div class="field">
                  <label for="meter-id">${escapeHtml(t("meter_id", "Meter ID"))}</label>
                  <input id="meter-id" name="meter_id" value="${escapeHtml(modal.id || "")}" required pattern="[0-9A-Fa-f]{8}">
                </div>
                <div class="field">
                  <label for="meter-name">${escapeHtml(t("webui_meter_name", "Name"))}</label>
                  <input id="meter-name" name="meter_name" value="${escapeHtml(modal.name || "")}">
                </div>
                <div class="field">
                  <label for="meter-driver">${escapeHtml(t("driver", "Driver"))}</label>
                  <input id="meter-driver" name="driver" value="${escapeHtml(modal.driver || "auto")}">
                </div>
                <div class="field">
                  <label for="meter-key">
                    ${escapeHtml(t("webui_aes_key", "AES key"))}
                    <span style="font-size:10px;color:#607a88;font-weight:400;margin-left:6px;">${escapeHtml(t("key_hint_short", "32 hex chars, or leave empty"))}</span>
                  </label>
                  <div style="display:flex;gap:8px;align-items:center;">
                    <input id="meter-key" name="key" autocomplete="off" value="" maxlength="32"
                      style="font-family:monospace;flex:1;"
                      placeholder="${escapeHtml(t("key_input_placeholder", "e.g. 00112233445566778899AABBCCDDEEFF"))}"
                      oninput="${escapeHtml(keyValidateJs)}">
                    <span id="aes-key-count" style="font-size:11px;font-weight:700;min-width:40px;text-align:right;"></span>
                  </div>
                  <div style="font-size:10px;color:#4a6070;margin-top:3px;">${escapeHtml(t("no_aes_key_note", 'key: "" = no key'))} · zero-key: <span class="mono">0000…0000</span></div>
                </div>
              </div>
            </div>
            <div class="modal-actions">
              <button class="btn" type="button" data-action="close-modal">${escapeHtml(t("webui_cancel", "Cancel"))}</button>
              <button id="add-meter-submit" class="btn primary" type="submit">${escapeHtml(t("webui_add", "Add"))}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderRoute() {
    if (state.loading && !state.data) {
      return `
        <div class="boot">
          <div class="boot-mark"></div>
          <div><strong>wMBus MQTT Bridge</strong><span>${escapeHtml(t("webui_loading", "Loading dashboard..."))}</span></div>
        </div>
      `;
    }
    switch (state.route) {
      case "meters":
        return shell(metersPage());
      case "discover":
        return shell(discoverPage());
      case "search":
        return shell(searchPage());
      case "logs":
        return shell(logsPage());
      case "esp-logs":
        return shell(espLogsPage());
      case "settings":
        return shell(settingsPage());
      case "about":
        return shell(aboutPage());
      default:
        return shell(dashboard());
    }
  }

  function render() {
    const newHtml = renderRoute();
    if (typeof morphdom !== "undefined") {
      // morphdom patches only the DOM nodes that actually changed —
      // no flicker, no scroll reset, no lost input focus.
      const tmp = document.createElement("div");
      tmp.id = "app";
      tmp.innerHTML = newHtml;
      morphdom(app, tmp, {
        // Never replace the app root itself — only its children.
        onBeforeElUpdated(from, to) {
          // Skip elements the user is actively interacting with.
          if (from === document.activeElement) return false;
          // Skip identical nodes (morphdom checks attrs, this adds textContent check).
          if (from.isEqualNode(to)) return false;
          return true;
        },
      });
    } else {
      // Fallback when morphdom.min.js failed to load.
      app.innerHTML = newHtml;
    }
  }

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    if (action === "refresh") {
      await fetchData(currentLang());
      toast(t("webui_dashboard_refreshed", "Dashboard refreshed."));
      return;
    }

    if (action === "toggle-language") {
      const menu = target.closest(".lang-menu")?.querySelector(".lang-options");
      if (menu) menu.hidden = !menu.hidden;
      return;
    }

    if (action === "language") {
      const lang = target.dataset.lang || "";
      const menu = target.closest(".lang-options");
      if (menu) menu.hidden = true;
      if (liveSource) {
        liveSource.close();
        liveSource = null;
      }
      if (lang) await fetchData(lang);
      return;
    }

    if (action === "media-filter") {
      state.mediaFilter = target.dataset.filter || "all";
      render();
      return;
    }

    if (action === "open-add") {
      const id     = target.dataset.id || "";
      const driver = target.dataset.driver || "auto";
      // Auto-suggest meter name based on media class + last 4 chars of ID (#3)
      const cand   = asArray((state.data || {}).candidates).find(c => c.id === id) || {};
      const mc     = mediaClass(cand.type || "", driver);
      const last4  = id.slice(-4).toUpperCase();
      const suggestedName = {
        water:       `Cold_Water_${last4}`,
        warm_water:  `Warm_Water_${last4}`,
        electricity: `Electricity_${last4}`,
        heat:        `Heat_${last4}`,
      }[mc] || (driver && driver !== "auto" ? `${driver}_${last4}` : `meter_${id}`);
      state.modal = {id, driver, name: suggestedName};
      render();
      return;
    }

    if (action === "close-modal") {
      if (event.target.classList.contains("modal-backdrop") || target.dataset.action === "close-modal") {
        state.modal = null;
        render();
      }
      return;
    }

    if (action === "remove-meter") {
      const id = target.dataset.id || "";
      if (!id || !window.confirm(t("webui_remove_confirm", "Remove meter {id}?", {id}))) return;
      try {
        const result = await postApi("remove-meter", {meter_id: id});
        toast(result.message || t("webui_meter_removed", "Meter removed."));
        await fetchData(currentLang());
      } catch (error) {
        toast(error.message, true);
      }
      return;
    }

    if (action === "ignore" || action === "unignore") {
      try {
        const result = await postApi(action, {id: target.dataset.id || ""});
        toast(result.message || t("webui_updated_ok", "Updated."));
        await fetchData(currentLang());
      } catch (error) {
        toast(error.message, true);
      }
      return;
    }

    if (action === "restart") {
      if (!window.confirm(t("webui_restart_confirm", "Restart the Home Assistant add-on?"))) return;
      try {
        const result = await postApi("restart-bridge", {});
        toast(result.message || "Restart requested.");
      } catch (error) {
        toast(error.message, true);
      }
    }
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.id === "add-meter-form") {
      event.preventDefault();
      const form = new FormData(event.target);
      try {
        const result = await postApi("add-meter", Object.fromEntries(form.entries()));
        state.modal = null;
        toast(result.message || t("webui_meter_added", "Meter added."));
        await fetchData(currentLang());
      } catch (error) {
        toast(error.message, true);
      }
    }

    if (event.target.id === "search-form") {
      event.preventDefault();
      const submitter = event.submitter;
      const form = new FormData(event.target);
      form.set("action", submitter?.value || "start");
      try {
        const result = await postApi("search-control", Object.fromEntries(form.entries()));
        const restartText = result.restart_ok ? ` ${result.restart_message || ""}` : "";
        toast(`${result.message || "Search updated."}${restartText}`);
        await fetchData(currentLang());
      } catch (error) {
        toast(error.message, true);
      }
    }
  });

  window.addEventListener("hashchange", () => {
    state.route = currentRoute();
    render();
  });

  fetchData();
  window.setInterval(() => {
    if (!document.hidden && !state.liveConnected) fetchData(currentLang());
  }, 15000);
})();
