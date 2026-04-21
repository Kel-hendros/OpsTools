/**
 * Pre Sale Config — Email Whitelist Builder
 *
 * Flujo:
 *   1. (Opcional) Pegar un JSON de Pre Sale existente → se toma como base.
 *   2. Agregar emails (paste o CSV/TXT) → se mergean contra la base, con dedup.
 *   3. Ver analítica (totales, duplicados, inválidos, ya presentes).
 *   4. Copiar/descargar el JSON final listo para Fanki.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_RELATED = "NINGUNO";
const STORAGE_KEY = "presale_config_data";

const DEFAULT_CONFIG = () => ({
  id: "",
  eventCode: "",
  emails: [],
  relatedEventCodes: [DEFAULT_RELATED],
  enabled: true,
});

class PresaleConfigTool {
  constructor() {
    this.TABS = [
      { id: "config", label: "Configuración", icon: "⚙️" },
      { id: "emails", label: "Emails", icon: "📧" },
      { id: "analysis", label: "Análisis", icon: "📊" },
      { id: "output", label: "JSON Output", icon: "🧾" },
      { id: "csv", label: "Text Output", icon: "📄" },
    ];

    this.config = DEFAULT_CONFIG();
    this.activeTab = "config";

    // Input state (uncommitted content typed into textareas)
    this.pendingBaseJson = "";
    this.pendingEmailsInput = "";
    this.emailSearch = "";

    // Stats from last "Agregar emails" action
    this.lastAddStats = null;

    this.toastTimer = null;

    this.loadFromStorage();
    this.cacheDOM();
    this.bindEvents();
    this.renderTabs();
    this.renderActiveTab();
  }

  // ─── Persistence ───
  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.config) this.config = { ...DEFAULT_CONFIG(), ...data.config };
      if (Array.isArray(this.config.emails)) {
        this.config.emails = this.config.emails.filter((e) => typeof e === "string");
      } else {
        this.config.emails = [];
      }
      if (!Array.isArray(this.config.relatedEventCodes) || this.config.relatedEventCodes.length === 0) {
        this.config.relatedEventCodes = [DEFAULT_RELATED];
      }
      if (typeof data.activeTab === "string") {
        this.activeTab = data.activeTab === "input" ? "config" : data.activeTab;
      }
    } catch (err) {
      console.warn("No se pudo leer el estado guardado:", err);
    }
  }

  save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ config: this.config, activeTab: this.activeTab })
      );
    } catch (err) {
      console.warn("No se pudo guardar el estado:", err);
    }
  }

  resetAll() {
    if (!confirm("¿Resetear todo? Esto borra el JSON base, la lista de emails y el contenido de las áreas de texto.")) return;
    this.config = DEFAULT_CONFIG();
    this.pendingBaseJson = "";
    this.pendingEmailsInput = "";
    this.emailSearch = "";
    this.lastAddStats = null;
    this.activeTab = "config";
    this.save();
    this.renderTabs();
    this.renderActiveTab();
    this.toast("Todo reseteado", "success");
  }

  // ─── DOM ───
  cacheDOM() {
    this.tabsNav = document.getElementById("tabsNav");
    this.tabContent = document.getElementById("tabContent");
    this.resetAllBtn = document.getElementById("resetAll");
    this.toastEl = document.getElementById("toast");
  }

  bindEvents() {
    this.resetAllBtn.addEventListener("click", () => this.resetAll());
  }

  // ─── Tabs ───
  renderTabs() {
    this.tabsNav.innerHTML = this.TABS.map((tab) => {
      const isActive = this.activeTab === tab.id;
      const badge = this.getTabBadge(tab.id);
      return `
        <button class="tab-btn ${isActive ? "active" : ""}" data-tab="${tab.id}" type="button">
          <span class="icon">${tab.icon}</span>
          ${tab.label}
          ${badge ? `<span class="tab-badge ${badge.tone || ""}">${badge.text}</span>` : ""}
        </button>`;
    }).join("");
    this.tabsNav.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeTab = btn.dataset.tab;
        this.save();
        this.renderTabs();
        this.renderActiveTab();
      });
    });
  }

  getTabBadge(tabId) {
    if (["emails", "analysis", "output", "csv"].includes(tabId)) {
      const count = this.config.emails.length;
      if (count > 0) return { text: String(count) };
    }
    return null;
  }

  renderActiveTab() {
    switch (this.activeTab) {
      case "config":
        this.renderConfigTab();
        break;
      case "emails":
        this.renderEmailsTab();
        break;
      case "analysis":
        this.renderAnalysisTab();
        break;
      case "output":
        this.renderOutputTab();
        break;
      case "csv":
        this.renderCsvTab();
        break;
    }
  }

  // ─── Tab: Configuración ───
  renderConfigTab() {
    const c = this.config;
    const related = (c.relatedEventCodes || []).join(", ");

    this.tabContent.innerHTML = `
      <div class="tab-panel active">
        <section class="form-card">
          <div class="form-card-header">
            <h2 class="form-card-title">Campos base</h2>
          </div>
          <p class="form-card-desc">
            Definí los datos del JSON de Pre Sale. Podés arrancar de cero completando los campos,
            o <strong>importar un JSON existente</strong> para autorellenarlos (incluidos los emails).
          </p>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label" for="eventCodeInput">Event Code</label>
              <input id="eventCodeInput" class="form-input" type="text"
                value="${this.esc(c.eventCode)}" placeholder="V26_BNORTE_PLATEA">
            </div>
            <div class="form-group">
              <label class="form-label" for="idInput">ID (opcional)</label>
              <input id="idInput" class="form-input" type="text"
                value="${this.esc(c.id)}" placeholder="Se genera en Fanki si se deja vacío">
            </div>
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label" for="relatedInput">relatedEventCodes</label>
              <input id="relatedInput" class="form-input" type="text"
                value="${this.esc(related)}" placeholder="NINGUNO (o varios separados por coma)">
              <p class="form-hint">Separá múltiples códigos con coma. Vacío se convierte a <code>["NINGUNO"]</code>.</p>
            </div>
            <div class="form-group">
              <label class="form-label">&nbsp;</label>
              <label class="form-checkbox" style="margin-top:0.35rem;">
                <input id="enabledInput" type="checkbox" ${c.enabled ? "checked" : ""}>
                <span>enabled</span>
              </label>
            </div>
          </div>
        </section>

        <section class="form-card">
          <div class="form-card-header">
            <h2 class="form-card-title">Importar JSON existente</h2>
            <div class="form-card-actions">
              <button class="btn btn-secondary btn-sm" type="button" id="pasteBaseBtn">
                <span class="icon">📋</span> Pegar desde portapapeles
              </button>
            </div>
          </div>
          <p class="form-card-desc">
            Pegá un JSON de Pre Sale existente para autorellenar todos los campos y cargar la lista de emails.
            Luego en la tab <strong>Emails</strong> vas a poder agregar nuevos sobre lo importado.
          </p>
          <div class="form-group">
            <textarea id="baseJsonInput" class="form-textarea tall" spellcheck="false"
              placeholder='{\n  "id": "...",\n  "eventCode": "V26_...",\n  "emails": ["mail1@dominio.com"],\n  "relatedEventCodes": ["NINGUNO"],\n  "enabled": true\n}'>${this.esc(this.pendingBaseJson)}</textarea>
          </div>
          <div class="actions-row">
            <button class="btn btn-primary" type="button" id="loadBaseBtn">
              <span class="icon">📥</span> Importar y autorellenar
            </button>
            <div class="spacer"></div>
            ${this.hasBase() ? `
              <button class="btn btn-danger btn-sm" type="button" id="clearBaseBtn">
                <span class="icon">↺</span> Resetear config
              </button>
            ` : ""}
          </div>
        </section>
      </div>
    `;

    this.bindConfigTabEvents();
  }

  bindConfigTabEvents() {
    const eventCodeInput = document.getElementById("eventCodeInput");
    if (eventCodeInput) eventCodeInput.addEventListener("input", (e) => {
      this.config.eventCode = e.target.value.trim();
      this.save();
    });

    const idInput = document.getElementById("idInput");
    if (idInput) idInput.addEventListener("input", (e) => {
      this.config.id = e.target.value.trim();
      this.save();
    });

    const relatedInput = document.getElementById("relatedInput");
    if (relatedInput) relatedInput.addEventListener("input", (e) => {
      const parts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
      this.config.relatedEventCodes = parts.length ? parts : [DEFAULT_RELATED];
      this.save();
    });

    const enabledInput = document.getElementById("enabledInput");
    if (enabledInput) enabledInput.addEventListener("change", (e) => {
      this.config.enabled = !!e.target.checked;
      this.save();
    });

    const baseInput = document.getElementById("baseJsonInput");
    if (baseInput) baseInput.addEventListener("input", (e) => {
      this.pendingBaseJson = e.target.value;
    });

    const loadBtn = document.getElementById("loadBaseBtn");
    if (loadBtn) loadBtn.addEventListener("click", () => this.loadBaseFromInput());

    const pasteBtn = document.getElementById("pasteBaseBtn");
    if (pasteBtn) pasteBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text) return this.toast("Portapapeles vacío", "error");
        this.pendingBaseJson = text;
        const ta = document.getElementById("baseJsonInput");
        if (ta) ta.value = text;
      } catch (err) {
        this.toast("No se pudo leer el portapapeles", "error");
      }
    });

    const clearBaseBtn = document.getElementById("clearBaseBtn");
    if (clearBaseBtn) clearBaseBtn.addEventListener("click", () => this.clearBase());
  }

  // ─── Tab: Emails ───
  renderEmailsTab() {
    const hasEmails = this.config.emails.length > 0;
    const filtered = this.emailSearch
      ? this.config.emails.filter((e) => e.includes(this.emailSearch.toLowerCase()))
      : this.config.emails;

    this.tabContent.innerHTML = `
      <div class="tab-panel active">
        <section class="form-card">
          <div class="form-card-header">
            <h2 class="form-card-title">
              ${hasEmails ? "Agregar más emails" : "Cargar emails"}
            </h2>
          </div>
          <p class="form-card-desc">
            ${hasEmails
              ? `Ya hay <strong>${this.config.emails.length}</strong> emails cargados. Pegá o subí otro lote y lo mergeamos (sin duplicados, case-insensitive).`
              : "Pegá una columna de Google Sheets, subí un CSV/TXT, o separá por coma/punto y coma. Los inválidos se descartan."}
          </p>
          <div class="form-group">
            <textarea id="emailsInput" class="form-textarea tall" spellcheck="false"
              placeholder="mail1@ejemplo.com&#10;mail2@ejemplo.com&#10;mail3@ejemplo.com"></textarea>
            <p class="form-hint">Uno por línea, o separados por coma, punto y coma o tab.</p>
          </div>
          <div class="actions-row">
            <button class="btn btn-success" type="button" id="addEmailsBtn">
              <span class="icon">➕</span> ${hasEmails ? "Agregar al listado" : "Cargar emails"}
            </button>
            <label class="btn btn-secondary btn-sm" for="emailsFile" style="cursor:pointer;">
              <span class="icon">📤</span> Subir CSV / TXT
              <input id="emailsFile" type="file" accept=".csv,.txt,.tsv" style="display:none;">
            </label>
          </div>
          ${this.lastAddStats ? this.renderLastAddStats() : ""}
        </section>

        <section class="form-card">
          <div class="form-card-header">
            <h2 class="form-card-title">Listado actual</h2>
            <div class="form-card-actions">
              ${hasEmails ? `
                <button class="btn btn-danger btn-sm" type="button" id="clearEmailsBtn">
                  <span class="icon">🗑️</span> Borrar todo (${this.config.emails.length})
                </button>
              ` : ""}
            </div>
          </div>
          ${hasEmails ? `
            <div class="email-list-toolbar">
              <div class="email-list-count">
                Mostrando <strong>${filtered.length}</strong> de <strong>${this.config.emails.length}</strong>
              </div>
              <input type="text" id="emailSearch" class="search-input"
                placeholder="Buscar…" value="${this.esc(this.emailSearch)}">
            </div>
            <div class="email-list-wrapper">
              ${filtered.length === 0
                ? `<div class="email-list-empty">No hay coincidencias para "${this.esc(this.emailSearch)}".</div>`
                : filtered.map((e, i) => `
                    <div class="email-row">
                      <span class="email-row-index">${i + 1}</span>
                      <span class="email-row-value">${this.esc(e)}</span>
                      <button class="email-row-remove" data-email="${this.attr(e)}" title="Quitar">✕</button>
                    </div>
                  `).join("")}
            </div>
          ` : `
            <div class="email-list-empty" style="border:1px dashed var(--border-color); border-radius:var(--radius-lg); padding:2.25rem;">
              Todavía no hay emails cargados. Usá el cuadro de arriba para agregar el primer lote.
            </div>
          `}
        </section>
      </div>
    `;

    this.bindEmailsTabEvents();
  }

  bindEmailsTabEvents() {
    const emailsInput = document.getElementById("emailsInput");
    if (emailsInput) {
      emailsInput.value = this.pendingEmailsInput;
      emailsInput.addEventListener("input", (e) => { this.pendingEmailsInput = e.target.value; });
    }

    const addBtn = document.getElementById("addEmailsBtn");
    if (addBtn) addBtn.addEventListener("click", () => this.commitAddEmails());

    const fileInput = document.getElementById("emailsFile");
    if (fileInput) fileInput.addEventListener("change", (e) => this.handleFileUpload(e));

    const clearEmailsBtn = document.getElementById("clearEmailsBtn");
    if (clearEmailsBtn) clearEmailsBtn.addEventListener("click", () => this.clearEmails());

    const search = document.getElementById("emailSearch");
    if (search) {
      search.addEventListener("input", (e) => {
        this.emailSearch = e.target.value;
        this.renderEmailsTab();
        const next = document.getElementById("emailSearch");
        if (next) {
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        }
      });
    }

    this.tabContent.querySelectorAll(".email-row-remove").forEach((btn) => {
      btn.addEventListener("click", () => this.removeEmail(btn.dataset.email));
    });

    this.tabContent.querySelectorAll(".stat-detail-copy").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        const key = btn.dataset.copyStat;
        const list = (this.lastAddStats && this.lastAddStats[key]) || [];
        if (!list.length) return;
        this.copyJson(list.join("\n"));
      });
    });
  }

  renderLastAddStats() {
    const s = this.lastAddStats;
    const tone = s.invalid > 0 ? "warn" : "";
    return `
      <div class="info-row ${tone}" style="margin-top:0.85rem; flex-direction:column; align-items:stretch; gap:0.6rem;">
        <div style="display:flex; gap:0.5rem; align-items:flex-start;">
          <span class="icon">📈</span>
          <div>
            Último merge: <strong>${s.added}</strong> nuevos,
            <strong>${s.alreadyPresent}</strong> ya estaban,
            <strong>${s.duplicatesInInput}</strong> duplicados en el input,
            <strong>${s.invalid}</strong> inválidos descartados.
            Total ahora: <strong>${this.config.emails.length}</strong>.
          </div>
        </div>
        ${this.renderStatDetail("Inválidos", s.invalidList, "invalidList", "danger", true)}
        ${this.renderStatDetail("Duplicados en el input", s.duplicateList, "duplicateList")}
        ${this.renderStatDetail("Ya estaban en la lista", s.alreadyPresentList, "alreadyPresentList")}
      </div>
    `;
  }

  renderStatDetail(label, list, statKey, toneClass = "", openByDefault = false) {
    if (!list || list.length === 0) return "";
    const items = list.map((v) => `<li>${this.esc(v)}</li>`).join("");
    return `
      <details class="stat-detail ${toneClass}" ${openByDefault ? "open" : ""}>
        <summary>
          <span>${label} (${list.length})</span>
          <button type="button" class="stat-detail-copy" data-copy-stat="${statKey}" title="Copiar lista">📋 Copiar</button>
        </summary>
        <ul class="stat-detail-list">${items}</ul>
      </details>
    `;
  }

  // ─── Base JSON handling ───
  hasBase() {
    // "Base" means the user has already committed a base — we track it by eventCode or emails.
    return !!(this.config.eventCode || this.config.emails.length > 0 || this.config.id);
  }

  loadBaseFromInput() {
    const text = (this.pendingBaseJson || "").trim();
    if (!text) {
      this.toast("Pegá primero un JSON", "error");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      this.toast("JSON inválido: " + err.message, "error");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      this.toast("El JSON debe ser un objeto", "error");
      return;
    }

    const next = DEFAULT_CONFIG();
    if (typeof parsed.id === "string") next.id = parsed.id;
    if (typeof parsed.eventCode === "string") next.eventCode = parsed.eventCode;
    if (Array.isArray(parsed.emails)) {
      const cleaned = this.normalizeEmailList(parsed.emails.filter((v) => typeof v === "string"));
      next.emails = cleaned.valid;
    }
    if (Array.isArray(parsed.relatedEventCodes) && parsed.relatedEventCodes.length) {
      next.relatedEventCodes = parsed.relatedEventCodes.map(String).map((s) => s.trim()).filter(Boolean);
      if (!next.relatedEventCodes.length) next.relatedEventCodes = [DEFAULT_RELATED];
    }
    if (typeof parsed.enabled === "boolean") next.enabled = parsed.enabled;

    this.config = next;
    this.pendingBaseJson = "";
    this.lastAddStats = null;
    this.save();
    this.toast(`Base cargada: ${next.emails.length} emails · ${next.eventCode || "sin eventCode"}`, "success");
    this.renderTabs();
    this.renderActiveTab();
  }

  clearBase() {
    if (!confirm("¿Limpiar la base actual? Se pierden metadatos y lista de emails.")) return;
    this.config = DEFAULT_CONFIG();
    this.lastAddStats = null;
    this.save();
    this.renderTabs();
    this.renderActiveTab();
    this.toast("Base limpia", "success");
  }

  // ─── Email parsing & merge ───
  parseRawEmails(text) {
    const raw = String(text || "")
      .split(/[\n,;\t]+/)
      .map((e) => e.trim().replace(/^["']+|["']+$/g, "").trim())
      .filter((e) => e.length > 0);
    return raw;
  }

  normalizeEmailList(list) {
    const valid = [];
    const invalidList = [];
    const duplicateList = [];
    const seen = new Set();
    for (const candidate of list) {
      if (!EMAIL_REGEX.test(candidate)) { invalidList.push(candidate); continue; }
      const lower = candidate.toLowerCase();
      if (seen.has(lower)) { duplicateList.push(lower); continue; }
      seen.add(lower);
      valid.push(lower);
    }
    return {
      valid,
      invalidList,
      duplicateList,
      invalid: invalidList.length,
      duplicatesInInput: duplicateList.length,
    };
  }

  commitAddEmails() {
    const text = (this.pendingEmailsInput || "").trim();
    if (!text) { this.toast("No hay emails para agregar", "error"); return; }

    const raw = this.parseRawEmails(text);
    const { valid, invalid, invalidList, duplicatesInInput, duplicateList } = this.normalizeEmailList(raw);

    const existing = new Set(this.config.emails.map((e) => e.toLowerCase()));
    const alreadyPresentList = [];
    let added = 0;
    for (const email of valid) {
      if (existing.has(email)) { alreadyPresentList.push(email); continue; }
      existing.add(email);
      this.config.emails.push(email);
      added++;
    }
    const alreadyPresent = alreadyPresentList.length;

    this.lastAddStats = {
      totalInput: raw.length,
      added,
      alreadyPresent,
      duplicatesInInput,
      invalid,
      invalidList,
      duplicateList,
      alreadyPresentList,
    };
    this.pendingEmailsInput = "";
    this.save();

    let msg;
    if (added > 0 && invalid > 0) {
      msg = `${added} emails agregados · ${invalid} inválidos (ver detalle)`;
    } else if (added > 0) {
      msg = `${added} emails agregados (total: ${this.config.emails.length})`;
    } else if (invalid > 0) {
      msg = `Sin nuevos emails · ${invalid} inválidos (ver detalle)`;
    } else {
      msg = "Sin nuevos emails para agregar";
    }
    this.toast(msg, added > 0 ? "success" : "error");

    this.renderTabs();
    this.renderActiveTab();
  }

  handleFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result || "";
      // Append to any existing pending text so user can keep adding before committing.
      const existing = (this.pendingEmailsInput || "").trim();
      this.pendingEmailsInput = existing ? `${existing}\n${text}` : text;
      const ta = document.getElementById("emailsInput");
      if (ta) ta.value = this.pendingEmailsInput;
      this.toast(`${file.name} cargado en el textarea`, "success");
    };
    reader.onerror = () => this.toast("No se pudo leer el archivo", "error");
    reader.readAsText(file);
    event.target.value = "";
  }

  clearEmails() {
    if (!this.config.emails.length) return;
    if (!confirm(`¿Borrar los ${this.config.emails.length} emails cargados? Los metadatos (eventCode, id, etc.) se mantienen.`)) return;
    this.config.emails = [];
    this.lastAddStats = null;
    this.save();
    this.renderTabs();
    this.renderActiveTab();
    this.toast("Listado de emails borrado", "success");
  }

  removeEmail(email) {
    const idx = this.config.emails.indexOf(email);
    if (idx < 0) return;
    this.config.emails.splice(idx, 1);
    this.save();
    this.renderTabs();
    this.renderActiveTab();
  }

  // ─── Tab: Analysis ───
  renderAnalysisTab() {
    const total = this.config.emails.length;
    const domains = this.countDomains();
    const s = this.lastAddStats || { added: 0, alreadyPresent: 0, duplicatesInInput: 0, invalid: 0 };

    this.tabContent.innerHTML = `
      <div class="tab-panel active">
        <div class="stats-grid">
          <div class="stat-card accent">
            <div class="stat-label">Total únicos</div>
            <div class="stat-value">${total}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Dominios únicos</div>
            <div class="stat-value">${Object.keys(domains).length}</div>
          </div>
          <div class="stat-card success">
            <div class="stat-label">Último merge · nuevos</div>
            <div class="stat-value">${s.added}</div>
          </div>
          <div class="stat-card warn">
            <div class="stat-label">Último merge · ya presentes</div>
            <div class="stat-value">${s.alreadyPresent}</div>
          </div>
          <div class="stat-card warn">
            <div class="stat-label">Último merge · dup. en input</div>
            <div class="stat-value">${s.duplicatesInInput}</div>
          </div>
          <div class="stat-card danger">
            <div class="stat-label">Último merge · inválidos</div>
            <div class="stat-value">${s.invalid}</div>
          </div>
        </div>

        ${total === 0 ? `
          <div class="info-row warn">
            <span class="icon">⚠️</span>
            <div>Todavía no cargaste ningún email. Andá a la tab <strong>Emails</strong> para cargar el primer lote.</div>
          </div>
        ` : `
          <section class="form-card">
            <div class="form-card-header">
              <h2 class="form-card-title">Top dominios</h2>
            </div>
            ${this.renderDomainsTable(domains)}
          </section>
        `}
      </div>
    `;
  }

  countDomains() {
    const out = {};
    for (const e of this.config.emails) {
      const at = e.lastIndexOf("@");
      if (at < 0) continue;
      const d = e.slice(at + 1);
      out[d] = (out[d] || 0) + 1;
    }
    return out;
  }

  renderDomainsTable(domains) {
    const entries = Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (!entries.length) return `<p class="form-hint">Sin datos.</p>`;
    return `
      <div class="email-list-wrapper" style="max-height:320px;">
        ${entries.map(([domain, count]) => `
          <div class="email-row">
            <span class="email-row-value">${this.esc(domain)}</span>
            <span class="email-row-index" style="min-width:60px; font-weight:700; color:var(--accent);">${count}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  // ─── Tab: Output ───
  renderOutputTab() {
    const total = this.config.emails.length;
    const json = this.buildOutputJson();
    const pretty = JSON.stringify(json, null, 2);
    const highlighted = this.highlightJson(pretty);

    this.tabContent.innerHTML = `
      <div class="tab-panel active">
        ${total === 0 ? `
          <div class="info-row warn">
            <span class="icon">⚠️</span>
            <div>No hay emails cargados. Andá a la tab <strong>Emails</strong> para cargar el primer lote.</div>
          </div>
        ` : ""}

        ${!this.config.eventCode ? `
          <div class="info-row warn">
            <span class="icon">⚠️</span>
            <div>Falta el <code>eventCode</code>. Cargalo en la tab <strong>Configuración</strong>.</div>
          </div>
        ` : ""}

        <section class="form-card">
          <div class="form-card-header">
            <h2 class="form-card-title">JSON de Pre Sale</h2>
            <div class="form-card-actions">
              <button class="btn btn-secondary btn-sm" type="button" id="copyJsonBtn">
                <span class="icon">📋</span> Copiar
              </button>
              <button class="btn btn-primary btn-sm" type="button" id="downloadJsonBtn">
                <span class="icon">⬇️</span> Descargar
              </button>
            </div>
          </div>
          <pre class="json-preview">${highlighted}</pre>
        </section>
      </div>
    `;

    const copyBtn = document.getElementById("copyJsonBtn");
    if (copyBtn) copyBtn.addEventListener("click", () => this.copyJson(pretty));

    const downloadBtn = document.getElementById("downloadJsonBtn");
    if (downloadBtn) downloadBtn.addEventListener("click", () => this.downloadJson(pretty));
  }

  // ─── Tab: Text Output (CSV + Lista comma-separated) ───
  renderCsvTab() {
    const total = this.config.emails.length;
    const csv = this.buildCsv();
    const commaList = this.buildCommaList();
    const code = this.config.eventCode || "SIN_EVENTCODE";
    const csvFilename = `PRESALE-CONFIG-${code}.csv`;
    const listFilename = `EMAIL-LIST-${code}.txt`;

    this.tabContent.innerHTML = `
      <div class="tab-panel active">
        ${total === 0 ? `
          <div class="info-row warn">
            <span class="icon">⚠️</span>
            <div>No hay emails cargados. Andá a la tab <strong>Emails</strong> para cargar el primer lote.</div>
          </div>
        ` : ""}

        ${!this.config.eventCode && total > 0 ? `
          <div class="info-row warn">
            <span class="icon">⚠️</span>
            <div>Falta el <code>eventCode</code>. Los archivos se van a descargar usando <code>SIN_EVENTCODE</code> como fallback.</div>
          </div>
        ` : ""}

        <section class="form-card">
          <div class="form-card-header">
            <h2 class="form-card-title">CSV · ${this.esc(csvFilename)}</h2>
            <div class="form-card-actions">
              <button class="btn btn-secondary btn-sm" type="button" id="copyCsvBtn" ${total === 0 ? "disabled" : ""}>
                <span class="icon">📋</span> Copiar
              </button>
              <button class="btn btn-primary btn-sm" type="button" id="downloadCsvBtn" ${total === 0 ? "disabled" : ""}>
                <span class="icon">⬇️</span> Descargar
              </button>
            </div>
          </div>
          <p class="form-card-desc">
            Una sola columna <code>email</code>, un email por fila. Total: <strong>${total}</strong>.
          </p>
          <pre class="json-preview" style="white-space:pre; max-height:360px;">${this.esc(csv)}</pre>
        </section>

        <section class="form-card">
          <div class="form-card-header">
            <h2 class="form-card-title">Lista de emails · ${this.esc(listFilename)}</h2>
            <div class="form-card-actions">
              <button class="btn btn-secondary btn-sm" type="button" id="copyListBtn" ${total === 0 ? "disabled" : ""}>
                <span class="icon">📋</span> Copiar
              </button>
              <button class="btn btn-primary btn-sm" type="button" id="downloadListBtn" ${total === 0 ? "disabled" : ""}>
                <span class="icon">⬇️</span> Descargar .txt
              </button>
            </div>
          </div>
          <p class="form-card-desc">
            Todos los emails separados por coma, sin comillas. Útil para pegar en otras herramientas que aceptan listas inline.
          </p>
          <pre class="json-preview" style="white-space:pre-wrap; word-break:break-all; max-height:360px;">${this.esc(commaList)}</pre>
        </section>
      </div>
    `;

    const copyCsvBtn = document.getElementById("copyCsvBtn");
    if (copyCsvBtn) copyCsvBtn.addEventListener("click", () => this.copyText(csv, "CSV copiado al portapapeles"));

    const downloadCsvBtn = document.getElementById("downloadCsvBtn");
    if (downloadCsvBtn) downloadCsvBtn.addEventListener("click", () => this.downloadCsv(csv, csvFilename));

    const copyListBtn = document.getElementById("copyListBtn");
    if (copyListBtn) copyListBtn.addEventListener("click", () => this.copyText(commaList, "Lista copiada al portapapeles"));

    const downloadListBtn = document.getElementById("downloadListBtn");
    if (downloadListBtn) downloadListBtn.addEventListener("click", () => this.downloadText(commaList, listFilename));
  }

  buildCommaList() {
    return this.config.emails.join(", ");
  }

  buildCsv() {
    // RFC 4180 style: header + one email per line, CRLF separators. Quote emails that
    // contain comma/quote/newline just in case (shouldn't happen but cheap insurance).
    const lines = ["email"];
    for (const email of this.config.emails) {
      lines.push(this.csvField(email));
    }
    return lines.join("\r\n");
  }

  csvField(value) {
    const str = String(value ?? "");
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  async copyText(text, successMsg = "Copiado al portapapeles") {
    try {
      await navigator.clipboard.writeText(text);
      this.toast(successMsg, "success");
    } catch (err) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        this.toast(successMsg, "success");
      } catch {
        this.toast("No se pudo copiar", "error");
      }
      document.body.removeChild(ta);
    }
  }

  downloadCsv(text, filename) {
    // Prepend UTF-8 BOM so Excel abre los acentos/caracteres especiales OK.
    const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
    this.triggerDownload(blob, filename);
  }

  downloadText(text, filename) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    this.triggerDownload(blob, filename);
  }

  triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toast(`${filename} descargado`, "success");
  }

  buildOutputJson() {
    const c = this.config;
    const out = {};
    if (c.id) out.id = c.id;
    out.eventCode = c.eventCode || "";
    out.emails = [...c.emails];
    out.relatedEventCodes = (c.relatedEventCodes && c.relatedEventCodes.length)
      ? [...c.relatedEventCodes]
      : [DEFAULT_RELATED];
    out.enabled = !!c.enabled;
    return out;
  }

  async copyJson(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast("JSON copiado al portapapeles", "success");
    } catch (err) {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        this.toast("JSON copiado", "success");
      } catch {
        this.toast("No se pudo copiar", "error");
      }
      document.body.removeChild(ta);
    }
  }

  downloadJson(text) {
    const code = this.config.eventCode || "presale";
    const name = `${code}_presale.json`;
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toast(`${name} descargado`, "success");
  }

  highlightJson(text) {
    // Escape HTML-sensitive chars but keep quotes intact so regex can match strings.
    const escaped = String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped
      .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"(\s*:)/g, '<span class="k">"$1"</span>$2')
      .replace(/:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g, ': <span class="s">"$1"</span>')
      .replace(/(^|[\[\s,])"([^"\\]*(?:\\.[^"\\]*)*)"(?=[,\n\]])/g, '$1<span class="s">"$2"</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="b">$1</span>')
      .replace(/([:\s,\[])(-?\d+\.?\d*)/g, '$1<span class="n">$2</span>');
  }

  // ─── Utilities ───
  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  attr(value) {
    return this.esc(value);
  }

  toast(message, variant = "") {
    if (!this.toastEl) return;
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.className = "toast show" + (variant ? " " + variant : "");
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove("show");
    }, 2600);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new PresaleConfigTool();
});
