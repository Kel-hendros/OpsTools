/**
 * Propuesta Comercial — Commercial Proposal Builder
 */

const TABS = [
  {
    id: "info",
    label: "Información Básica",
    icon: "📝",
    items: [
      { id: "organizador", label: "Nombre del Organizador", type: "text" },
      { id: "fecha_propuesta", label: "Fecha de Propuesta", type: "date" },
      { id: "fecha_vencimiento", label: "Fecha de Vencimiento", type: "date" },
      { id: "representante", label: "Representante de Fanki", type: "text" },
      {
        id: "categoria",
        label: "Categoría",
        type: "select",
        options: ["", "Deportes", "Entretenimiento", "Otros"],
      },
      {
        id: "sub_deportes",
        label: "Sub-Categoría (Deportes)",
        type: "checkbox-group",
        options: [
          "Fútbol",
          "Tenis",
          "Pádel",
          "Basketball",
          "Baseball",
          "Rugby",
          "Hockey",
          "Boxeo",
          "MMA",
          "Automovilismo",
          "Golf",
          "Volleyball",
        ],
        conditional: { field: "categoria", value: "Deportes" },
      },
      {
        id: "sub_entretenimiento",
        label: "Sub-Categoría (Entretenimiento)",
        type: "checkbox-group",
        options: ["Shows", "Teatro", "Festivales"],
        conditional: { field: "categoria", value: "Entretenimiento" },
      },
      {
        id: "sub_otros",
        label: "Sub-Categoría (Otros)",
        type: "checkbox-group",
        options: ["Conferencias", "Competiciones", "Otros"],
        conditional: { field: "categoria", value: "Otros" },
      },
      {
        id: "calificacion",
        label: "Calificación",
        type: "select",
        options: [
          "",
          "Categoría 1: Eventos masivos recurrentes",
          "Categoría 2: Eventos recurrentes",
          "Categoría 3: Evento individual",
        ],
      },
    ],
  },
  {
    id: "finanzas",
    label: "Finanzas",
    icon: "💰",
    items: [
      {
        id: "metodos_pago",
        label: "Métodos de Pago",
        type: "checkbox-group",
        options: [
          "Tarjeta Crédito",
          "Tarjeta Débito",
          "Efectivo",
          "Transferencia",
          "QR",
        ],
      },
      {
        id: "pasarela",
        label: "Pasarela de Pago",
        type: "select",
        options: ["", "MercadoPago", "Stripe", "PayU", "Otra", "No Aplica"],
      },
      {
        id: "merchant",
        label: "Tipo de Merchant",
        type: "select",
        options: [
          "",
          "Propio del Organizador",
          "De Fanki",
          "No Aplica",
        ],
      },
      {
        id: "dispersion",
        label: "Tipo de Dispersión",
        type: "select",
        options: ["", "Semanal", "Mensual", "Semestral", "No Aplica"],
      },
      {
        id: "comision",
        label: "Tipo de Comisión",
        type: "select",
        options: ["", "B2B", "B2C", "No Aplica"],
      },
      {
        id: "iva",
        label: "Aplica IVA",
        type: "select",
        options: ["", "Sí", "No", "No Aplica"],
      },
      {
        id: "iva_porcentaje",
        label: "Porcentaje de IVA",
        type: "number",
        conditional: { field: "iva", value: "Sí" },
        placeholder: "Ej: 21",
      },
    ],
  },
  {
    id: "logistica",
    label: "Logística",
    icon: "🎟️",
    items: [
      {
        id: "companion",
        label: "Usa Companion (escaneo de tickets)",
        type: "select",
        options: ["", "Sí", "No", "No Aplica"],
      },
      {
        id: "companion_prestamo",
        label: "Dispositivos Companion a préstamo",
        type: "select",
        options: ["", "Sí", "No", "No Aplica"],
        conditional: { field: "companion", value: "Sí" },
      },
      {
        id: "personal_logistica",
        label: "Personal de Logística",
        type: "select",
        options: [
          "",
          "Propio del Organizador",
          "Brindado por Fanki",
          "Mixto",
          "No Aplica",
        ],
      },
      {
        id: "impresoras_taquilla",
        label: "Impresoras para Taquilla",
        type: "select",
        options: ["", "Sí", "No", "No Aplica"],
      },
      {
        id: "computadoras_taquilla",
        label: "Computadoras para Taquilla",
        type: "select",
        options: ["", "Sí", "No", "No Aplica"],
      },
      {
        id: "boleto_carton",
        label: "Formato de Boleto Cartón",
        type: "select",
        options: ["", "Grande", "Chico", "Nuevo", "No Aplica"],
      },
      {
        id: "voucher_termico",
        label: "Impresión Voucher Térmico",
        type: "select",
        options: ["", "Sí", "No", "No Aplica"],
      },
    ],
  },
];

class ProposalApp {
  constructor() {
    this.STORAGE_KEY = "commercial_proposal_data";
    this.data = {}; // { itemId: { value, notes } }
    this.activeTab = TABS[0].id;

    this.tabsNav = document.getElementById("tabsNav");
    this.tabContent = document.getElementById("tabContent");
    this.exportBtn = document.getElementById("exportMd");
    this.newBtn = document.getElementById("newProposal");

    this.loadFromStorage();
    this.renderTabs();
    this.renderContent();
    this.bindEvents();
  }

  // ─── Data helpers ───

  getValue(itemId) {
    return this.data[itemId]?.value ?? "";
  }

  getNotes(itemId) {
    return this.data[itemId]?.notes ?? "";
  }

  setValue(itemId, value) {
    if (!this.data[itemId]) this.data[itemId] = { value: "", notes: "" };
    this.data[itemId].value = value;
    this.save();
    this.updateBadges();
    this.updateItemStatus(itemId);
    this.updateConditionalFields();
    this.updateSummaryBar();
  }

  setNotes(itemId, notes) {
    if (!this.data[itemId]) this.data[itemId] = { value: "", notes: "" };
    this.data[itemId].notes = notes;
    this.save();
  }

  isItemComplete(item) {
    const val = this.getValue(item.id);
    if (item.type === "checkbox-group") {
      return Array.isArray(val) && val.length > 0;
    }
    return val !== "" && val !== undefined && val !== null;
  }

  getTabPendingCount(tab) {
    return tab.items.filter((item) => {
      if (item.conditional) {
        const parentVal = this.getValue(item.conditional.field);
        if (parentVal !== item.conditional.value) return false;
      }
      return !this.isItemComplete(item);
    }).length;
  }

  getTabVisibleCount(tab) {
    return tab.items.filter((item) => {
      if (item.conditional) {
        const parentVal = this.getValue(item.conditional.field);
        if (parentVal !== item.conditional.value) return false;
      }
      return true;
    }).length;
  }

  // ─── Persistence ───

  save() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
  }

  loadFromStorage() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (raw) {
      try {
        this.data = JSON.parse(raw);
      } catch {
        this.data = {};
      }
    }
  }

  reset() {
    if (
      confirm(
        "¿Estás seguro? Se borrarán todos los datos de la propuesta actual."
      )
    ) {
      this.data = {};
      this.save();
      this.renderContent();
      this.updateBadges();
    }
  }

  // ─── Rendering ───

  renderTabs() {
    this.tabsNav.innerHTML = TABS.map(
      (tab) => `
      <button class="tab-btn ${tab.id === this.activeTab ? "active" : ""}"
              data-tab="${tab.id}">
        <span>${tab.icon}</span>
        <span>${tab.label}</span>
        <span class="tab-badge" id="badge-${tab.id}"></span>
      </button>
    `
    ).join("");

    this.updateBadges();
  }

  updateBadges() {
    TABS.forEach((tab) => {
      const badge = document.getElementById(`badge-${tab.id}`);
      if (!badge) return;
      const pending = this.getTabPendingCount(tab);
      if (pending > 0) {
        badge.textContent = pending;
        badge.className = "tab-badge pending";
      } else {
        badge.textContent = "✓";
        badge.className = "tab-badge complete";
      }
    });
  }

  renderContent() {
    this.tabContent.innerHTML = TABS.map(
      (tab) => `
      <div class="tab-panel ${tab.id === this.activeTab ? "active" : ""}"
           id="panel-${tab.id}">
        ${this.renderSummaryBar(tab)}
        ${tab.items.map((item) => this.renderItem(item)).join("")}
      </div>
    `
    ).join("");

    this.updateConditionalFields();
    this.bindInputs();
  }

  renderSummaryBar(tab) {
    const visible = this.getTabVisibleCount(tab);
    const pending = this.getTabPendingCount(tab);
    const done = visible - pending;
    const pct = visible > 0 ? Math.round((done / visible) * 100) : 100;

    return `
      <div class="summary-bar" id="summary-${tab.id}">
        <span class="progress-text">${done}/${visible} completados</span>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }

  updateSummaryBar() {
    TABS.forEach((tab) => {
      const bar = document.getElementById(`summary-${tab.id}`);
      if (!bar) return;
      const visible = this.getTabVisibleCount(tab);
      const pending = this.getTabPendingCount(tab);
      const done = visible - pending;
      const pct = visible > 0 ? Math.round((done / visible) * 100) : 100;
      bar.querySelector(".progress-text").textContent =
        `${done}/${visible} completados`;
      bar.querySelector(".progress-bar-fill").style.width = `${pct}%`;
    });
  }

  renderItem(item) {
    const isConditional = !!item.conditional;
    const complete = this.isItemComplete(item);
    const notes = this.getNotes(item.id);
    const hasNotes = notes.length > 0;

    return `
      <div class="form-item ${complete ? "completed" : "incomplete"} ${isConditional ? "conditional-field" : ""}"
           id="item-${item.id}"
           ${isConditional ? `data-cond-field="${item.conditional.field}" data-cond-value="${item.conditional.value}"` : ""}>
        <div class="form-item-header">
          <span class="form-item-label">${item.label}</span>
          <span class="form-item-status ${complete ? "done" : "pending"}" id="status-${item.id}">
            ${complete ? "Completo" : "Pendiente"}
          </span>
        </div>
        <div class="field-input">
          ${this.renderInput(item)}
        </div>
        <button class="notes-toggle" data-item="${item.id}">
          <span class="arrow ${hasNotes ? "open" : ""}">▶</span>
          Notas${hasNotes ? " (tiene notas)" : ""}
        </button>
        <div class="notes-area ${hasNotes ? "open" : ""}" id="notes-area-${item.id}">
          <textarea placeholder="Agregar notas..."
                    data-notes-for="${item.id}">${notes}</textarea>
        </div>
      </div>
    `;
  }

  renderInput(item) {
    const val = this.getValue(item.id);

    switch (item.type) {
      case "text":
        return `<input type="text" data-item="${item.id}" value="${this.escapeAttr(val)}"
                       placeholder="${item.placeholder || ""}">`;

      case "date":
        return `<input type="date" data-item="${item.id}" value="${this.escapeAttr(val)}">`;

      case "number":
        return `<input type="number" data-item="${item.id}" value="${this.escapeAttr(val)}"
                       placeholder="${item.placeholder || ""}" min="0" step="any">`;

      case "select":
        return `
          <select data-item="${item.id}">
            ${item.options
              .map(
                (opt) =>
                  `<option value="${opt}" ${val === opt ? "selected" : ""}>${opt || "— Seleccionar —"}</option>`
              )
              .join("")}
          </select>
        `;

      case "checkbox-group": {
        const checked = Array.isArray(val) ? val : [];
        return `
          <div class="checkbox-group" data-item="${item.id}">
            ${item.options
              .map(
                (opt) => `
              <label class="checkbox-item ${checked.includes(opt) ? "checked" : ""}">
                <input type="checkbox" value="${opt}" ${checked.includes(opt) ? "checked" : ""}>
                ${opt}
              </label>
            `
              )
              .join("")}
          </div>
          <label class="checkbox-item" style="margin-top: 0.5rem; opacity: 0.7;">
            <input type="checkbox" data-na-for="${item.id}"
                   ${checked.includes("No Aplica") ? "checked" : ""}>
            No Aplica
          </label>
        `;
      }

      default:
        return "";
    }
  }

  // ─── Status Updates ───

  updateItemStatus(itemId) {
    const item = this.findItem(itemId);
    if (!item) return;
    const el = document.getElementById(`item-${itemId}`);
    const statusEl = document.getElementById(`status-${itemId}`);
    if (!el || !statusEl) return;

    const complete = this.isItemComplete(item);
    el.classList.toggle("completed", complete);
    el.classList.toggle("incomplete", !complete);
    statusEl.className = `form-item-status ${complete ? "done" : "pending"}`;
    statusEl.textContent = complete ? "Completo" : "Pendiente";
  }

  updateConditionalFields() {
    document.querySelectorAll(".conditional-field").forEach((el) => {
      const field = el.dataset.condField;
      const value = el.dataset.condValue;
      const parentVal = this.getValue(field);
      el.classList.toggle("hidden", parentVal !== value);
    });
  }

  findItem(itemId) {
    for (const tab of TABS) {
      const found = tab.items.find((i) => i.id === itemId);
      if (found) return found;
    }
    return null;
  }

  // ─── Events ───

  bindEvents() {
    // Tab switching
    this.tabsNav.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-btn");
      if (!btn) return;
      this.activeTab = btn.dataset.tab;
      this.tabsNav
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.toggle("active", b.dataset.tab === this.activeTab));
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) => p.classList.toggle("active", p.id === `panel-${this.activeTab}`));
    });

    // Header actions
    this.exportBtn.addEventListener("click", () => this.exportMarkdown());
    this.newBtn.addEventListener("click", () => this.reset());
  }

  bindInputs() {
    // Text, date, number, select inputs
    this.tabContent.querySelectorAll("[data-item]").forEach((input) => {
      if (input.tagName === "DIV") return; // skip checkbox-group containers
      const evt = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(evt, () => {
        this.setValue(input.dataset.item, input.value);
      });
    });

    // Checkbox groups
    this.tabContent.querySelectorAll(".checkbox-group").forEach((group) => {
      const itemId = group.dataset.item;
      group.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener("change", () => {
          const checked = [
            ...group.querySelectorAll('input[type="checkbox"]:checked'),
          ].map((c) => c.value);
          this.setValue(itemId, checked);
          // Update visual
          cb.closest(".checkbox-item").classList.toggle("checked", cb.checked);
        });
      });
    });

    // "No Aplica" for checkbox groups
    this.tabContent.querySelectorAll("[data-na-for]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const itemId = cb.dataset.naFor;
        if (cb.checked) {
          this.setValue(itemId, ["No Aplica"]);
          // Uncheck all others
          const group = this.tabContent.querySelector(
            `.checkbox-group[data-item="${itemId}"]`
          );
          if (group) {
            group.querySelectorAll('input[type="checkbox"]').forEach((c) => {
              c.checked = false;
              c.closest(".checkbox-item").classList.remove("checked");
            });
          }
        } else {
          this.setValue(itemId, []);
        }
      });
    });

    // Notes toggles
    this.tabContent.querySelectorAll(".notes-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const itemId = btn.dataset.item;
        const area = document.getElementById(`notes-area-${itemId}`);
        const arrow = btn.querySelector(".arrow");
        area.classList.toggle("open");
        arrow.classList.toggle("open");
      });
    });

    // Notes textareas
    this.tabContent.querySelectorAll("[data-notes-for]").forEach((ta) => {
      ta.addEventListener("input", () => {
        this.setNotes(ta.dataset.notesFor, ta.value);
      });
    });
  }

  // ─── Export ───

  exportMarkdown() {
    const orgName = this.getValue("organizador") || "Sin nombre";
    const lines = [];

    lines.push(`# Propuesta Comercial: ${orgName}`);
    lines.push("");
    lines.push(
      `**Fecha de Propuesta:** ${this.getValue("fecha_propuesta") || "—"}`
    );
    lines.push(
      `**Fecha de Vencimiento:** ${this.getValue("fecha_vencimiento") || "—"}`
    );
    lines.push(
      `**Representante Fanki:** ${this.getValue("representante") || "—"}`
    );

    const cat = this.getValue("categoria") || "—";
    lines.push(`**Categoría:** ${cat}`);

    // Sub-categoría based on selected category
    const subMap = {
      Deportes: "sub_deportes",
      Entretenimiento: "sub_entretenimiento",
      Otros: "sub_otros",
    };
    if (subMap[cat]) {
      let subVal = this.getValue(subMap[cat]);
      if (Array.isArray(subVal)) subVal = subVal.join(", ");
      lines.push(`**Sub-Categoría:** ${subVal || "—"}`);
    }

    const calif = this.getValue("calificacion") || "—";
    lines.push(`**Calificación:** ${calif}`);

    lines.push("");
    lines.push("---");
    lines.push("");

    // Skip the first tab (info) since we already rendered it above
    for (const tab of TABS.slice(1)) {
      lines.push(`## ${tab.label}`);
      lines.push("");
      lines.push("| Item | Valor | Notas |");
      lines.push("|------|-------|-------|");

      for (const item of tab.items) {
        // Skip conditional items whose parent doesn't match
        if (item.conditional) {
          const parentVal = this.getValue(item.conditional.field);
          if (parentVal !== item.conditional.value) continue;
        }

        let val = this.getValue(item.id);
        if (Array.isArray(val)) val = val.join(", ");
        if (!val) val = "—";

        let notes = this.getNotes(item.id) || "";
        // Escape pipes for markdown table
        notes = notes.replace(/\|/g, "\\|").replace(/\n/g, " ");
        val = String(val).replace(/\|/g, "\\|");

        lines.push(`| ${item.label} | ${val} | ${notes} |`);
      }

      lines.push("");
    }

    const md = lines.join("\n");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = orgName.replace(/[\/\\ ]/g, "_");
    link.setAttribute("href", url);
    link.setAttribute("download", `Propuesta_${safeName}.md`);
    link.click();
    URL.revokeObjectURL(url);
  }

  // ─── Utils ───

  escapeAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.app = new ProposalApp();
});
