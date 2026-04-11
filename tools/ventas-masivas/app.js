const REASON_TYPES = [
  { id: "01f0ac5c-ef0e-495a-bdc9-943360142137", label: "Patrocinadores" },
  { id: "13484393-5058-4ff9-8e41-6322de3fb2e9", label: "Gobierno" },
  { id: "e882b269-ebd0-4f03-836a-a60c582e082b", label: "Medios" },
  { id: "2adf936e-d88a-4395-9b81-4279ae0600a5", label: "Invitados especiales" },
  { id: "484afb07-4820-496b-b946-5dff3bcff60c", label: "Plantel" },
  { id: "b7891be8-bb1a-4229-acc1-3b8d4d25b637", label: "Otros" },
  { id: "355c46b5-1beb-4b3f-802a-2a31bf77c495", label: "Canje" },
];
const REASON_TYPE_BY_ID = Object.fromEntries(REASON_TYPES.map((r) => [r.id, r.label]));
const REASON_TYPE_BY_LABEL = Object.fromEntries(REASON_TYPES.map((r) => [r.label.toLowerCase(), r.id]));

const OUTPUT_HEADERS = [
  "fanId",
  "eventCode",
  "sectionCode",
  "seatCode",
  "quantity",
  "discount",
  "basePrice",
  "courtesy",
  "groupCode",
  "reasonType",
  "reason",
];

const ROW_FIELDS = [
  "fanId",
  "sectionCode",
  "seatCode",
  "quantity",
  "discount",
  "basePrice",
  "courtesy",
  "reasonType",
  "reason",
];

const SIMPLE_REQUIRED_HEADERS = ["fanId", "sectionCode", "seatCode", "quantity"];
const TEXT_FIELDS = new Set(["fanId", "sectionCode", "reasonType", "reason"]);
const ORDER_TABLE_FIELDS = [
  "fanId",
  "tribuna",
  "seccion",
  "seatCode",
  "quantity",
  "discount",
  "basePrice",
  "courtesy",
  "reasonType",
  "reason",
];
const HEADER_BY_NORMALIZED_KEY = OUTPUT_HEADERS.reduce((acc, field) => {
  acc[normalizeKey(field)] = field;
  return acc;
}, {});

class BulkSalesTool {
  constructor() {
    this.STORAGE_KEY = "ventas_masivas_data";
    this.TABS = [
      { id: "config", label: "Configuración", icon: "⚙️" },
      { id: "orders", label: "Ordenes", icon: "📋" },
      { id: "analysis", label: "Análisis", icon: "📊" },
      { id: "csv-output", label: "CSV Output", icon: "🧾" },
    ];

    this.config = {
      eventCode: "",
      groupCode: "",
      outputFileName: "",
      outputFileNameManual: false,
    };
    this.filters = {
      fanIdSelected: null,
      fanIdSearch: "",
      fanIdOpen: false,
      tribunaSelected: null,
      tribunaSearch: "",
      tribunaOpen: false,
      seccionSelected: null,
      seccionSearch: "",
      seccionOpen: false,
      courtesy: "all",
      seats: "all",
    };
    this.rows = [];
    this.page = 0;
    this.pageSize = 100;
    this.activeTab = "config";
    this.csvFilteredMode = false;
    this.toastTimer = null;

    this.loadFromStorage();
    this.cacheDOM();
    this.bindEvents();
    this.renderTabs();
    this.renderActiveTab();
  }

  cacheDOM() {
    this.tabsNav = document.getElementById("tabsNav");
    this.tabContent = document.getElementById("tabContent");
    this.resetAllBtn = document.getElementById("resetAll");
    this.toastEl = document.getElementById("toast");
  }

  bindEvents() {
    this.resetAllBtn.addEventListener("click", () => this.resetAll());
    document.addEventListener("click", (event) => {
      this.closeFilterDropdownOnOutsideClick("fanId", "#fanIdFilter", event);
      this.closeFilterDropdownOnOutsideClick("tribuna", "#tribunaFilter", event);
      this.closeFilterDropdownOnOutsideClick("seccion", "#seccionFilter", event);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      this.closeFilterDropdown("fanId");
      this.closeFilterDropdown("tribuna");
      this.closeFilterDropdown("seccion");
    });
  }

  closeFilterDropdownOnOutsideClick(key, selector, event) {
    if (!this.filters[key + "Open"]) return;
    if (event.target.closest(selector)) return;
    this.filters[key + "Open"] = false;
    const el = document.querySelector(selector);
    if (el) el.classList.remove("open");
  }

  closeFilterDropdown(key) {
    if (!this.filters[key + "Open"]) return;
    this.filters[key + "Open"] = false;
    const el = document.getElementById(key + "Filter");
    if (el) el.classList.remove("open");
  }

  bindFilterDropdown(key) {
    const filterEl = document.getElementById(key + "Filter");
    const trigger = document.getElementById(key + "FilterTrigger");
    const search = document.getElementById(key + "FilterSearch");
    const optionsEl = document.getElementById(key + "FilterOptions");

    // Pending state starts as a copy of committed state
    let pending = this.filters[key + "Selected"] === null ? null : [...this.filters[key + "Selected"]];

    const renderOptions = () => {
      const allOptions = this.getFilterOptions(key);
      const counts = this.getFilterCounts(key);
      const q = normalizeText(this.filters[key + "Search"]).toLowerCase();
      const filtered = allOptions.filter((v) => !q || v.toLowerCase().includes(q));
      if (filtered.length === 0) {
        optionsEl.innerHTML = `<div class="filter-empty">No hay opciones para mostrar.</div>`;
        return;
      }
      optionsEl.innerHTML = filtered.map((value) => {
        const checked = pending === null || pending.includes(value);
        return `
          <label class="filter-option">
            <input type="checkbox" data-filter-key="${key}" data-filter-value="${this.attr(value)}" ${checked ? "checked" : ""}>
            <span class="filter-option-code"><span class="filter-option-tribuna">${this.esc(value)}</span></span>
            <span class="filter-option-count">${fmt(counts[value] || 0)}</span>
          </label>`;
      }).join("");
    };

    const togglePending = (value) => {
      const allOptions = this.getFilterOptions(key);
      if (pending === null) {
        pending = allOptions.filter((o) => o !== value);
      } else {
        const next = new Set(pending);
        if (next.has(value)) next.delete(value); else next.add(value);
        const selected = allOptions.filter((o) => next.has(o));
        pending = selected.length === allOptions.length ? null : selected;
      }
    };

    const applyPending = () => {
      this.filters[key + "Selected"] = pending === null ? null : [...pending];
      this.filters[key + "Open"] = false;
      filterEl.classList.remove("open");
      this.page = 0;
      this.save();
      this.renderActiveTab();
    };

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      this.filters[key + "Open"] = !this.filters[key + "Open"];
      filterEl.classList.toggle("open", this.filters[key + "Open"]);
      if (this.filters[key + "Open"]) {
        pending = this.filters[key + "Selected"] === null ? null : [...this.filters[key + "Selected"]];
        renderOptions();
        setTimeout(() => { if (search) search.focus(); }, 0);
      }
    });

    search.addEventListener("input", (event) => {
      this.filters[key + "Search"] = event.target.value;
      renderOptions();
    });

    optionsEl.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[data-filter-value]");
      if (!checkbox) return;
      togglePending(checkbox.dataset.filterValue);
    });

    filterEl.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-filter-action]");
      if (!btn || btn.dataset.filterKey !== key) return;
      if (btn.dataset.filterAction === "all") pending = null;
      else if (btn.dataset.filterAction === "none") pending = [];
      renderOptions();
    });

    const applyBtn = document.getElementById(key + "FilterApply");
    if (applyBtn) applyBtn.addEventListener("click", () => applyPending());
  }

  /* ═══════════════ TABS ═══════════════ */

  renderTabs() {
    const validation = this.validate();

    this.tabsNav.innerHTML = this.TABS.map((tab) => {
      let badge = "";
      if (tab.id === "orders" && this.rows.length > 0) {
        badge = `<span class="tab-badge">${fmt(this.rows.length)}</span>`;
      }
      if (tab.id === "csv-output" && this.hasStarted()) {
        badge = validation.valid
          ? `<span class="tab-badge tab-badge-green">OK</span>`
          : `<span class="tab-badge tab-badge-red">${validation.errors.length}</span>`;
      }

      return `
        <button class="tab-btn ${tab.id === this.activeTab ? "active" : ""}" data-tab="${tab.id}" type="button">
          ${tab.icon} ${tab.label} ${badge}
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

  renderActiveTab() {
    document.getElementById("app").classList.toggle("orders-active", this.activeTab === "orders");
    switch (this.activeTab) {
      case "config":
        this.renderConfigTab();
        break;
      case "orders":
        this.renderOrdersTab();
        break;
      case "analysis":
        this.renderAnalysisTab();
        break;
      case "csv-output":
        this.renderCsvOutputTab();
        break;
    }
  }

  /* ═══════════════ CONFIG TAB ═══════════════ */

  renderConfigTab() {
    const validation = this.validate();
    const showErrors = this.hasStarted();
    const effectiveOutputFileName = this.getEffectiveOutputFileName();
    const fileHint = this.config.outputFileNameManual
      ? "Pisado manualmente. Solo letras, numeros, guion y underscore."
      : "Se genera automaticamente desde Group Code hasta que lo pises.";

    this.tabContent.innerHTML = `
      <div class="tab-panel active config-tab">
        <div class="form-card">
          <div class="form-card-title">Datos del Archivo</div>
          <div class="form-row cols-3">
            <div class="form-group">
              <label class="form-label" for="cfgEventCode">Event Code</label>
              <input type="text" class="form-input ${showErrors && validation.globalErrors.eventCode ? "invalid" : ""}"
                     id="cfgEventCode" value="${this.esc(this.config.eventCode)}"
                     placeholder="Ej: ABN_CAM_BNORTE_CL26" autocomplete="off" spellcheck="false">
              <span class="form-hint">Se exporta igual en todas las filas.</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="cfgGroupCode">Group Code</label>
              <input type="text" class="form-input ${showErrors && validation.globalErrors.groupCode ? "invalid" : ""}"
                     id="cfgGroupCode" value="${this.esc(this.config.groupCode)}"
                     placeholder="Ej: PALCOS99_ABNCAM_CL26_V1" autocomplete="off" spellcheck="false">
              <span class="form-hint">Debe ser unico para todo el archivo. Solo letras, numeros, _ y -.</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="cfgOutputFileName">Nombre del Archivo</label>
              <input type="text" class="form-input ${showErrors && validation.globalErrors.outputFileName ? "invalid" : ""}"
                     id="cfgOutputFileName" value="${this.esc(effectiveOutputFileName)}"
                     placeholder="Ej: ventas_masivas_abono_99" autocomplete="off" spellcheck="false">
              <span class="form-hint">${fileHint}</span>
            </div>
          </div>
        </div>

        <div class="form-card">
          <div class="form-card-title">Formato de Trabajo</div>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-icon">📄</span>
              <div>
                <strong>CSV completo</strong>
                <p>Puede traer las 11 columnas del output. Event code y group code deben ser unicos.</p>
              </div>
            </div>
            <div class="info-item">
              <span class="info-icon">✍️</span>
              <div>
                <strong>CSV simple</strong>
                <p>Debe incluir fanId, sectionCode, seatCode y quantity. El resto se completa en Ordenes.</p>
              </div>
            </div>
            <div class="info-item">
              <span class="info-icon">✅</span>
              <div>
                <strong>Validacion bloqueante</strong>
                <p>El output se habilita cuando todas las columnas requeridas tienen valores validos.</p>
              </div>
            </div>
          </div>
        </div>

        <div id="configValidation">${this.renderValidationSummary(validation)}</div>
      </div>`;

    document.getElementById("cfgEventCode").addEventListener("input", (event) => {
      this.config.eventCode = event.target.value;
      this.syncAfterEdit();
    });
    document.getElementById("cfgGroupCode").addEventListener("input", (event) => {
      const sanitized = sanitizeIdentifier(event.target.value);
      this.config.groupCode = sanitized;
      event.target.value = sanitized;
      const outputInput = document.getElementById("cfgOutputFileName");
      if (outputInput && !this.config.outputFileNameManual) {
        outputInput.value = this.getEffectiveOutputFileName();
      }
      this.syncAfterEdit();
    });
    document.getElementById("cfgOutputFileName").addEventListener("input", (event) => {
      const sanitized = sanitizeIdentifier(event.target.value);
      if (!sanitized) {
        this.config.outputFileName = "";
        this.config.outputFileNameManual = false;
        event.target.value = this.getEffectiveOutputFileName();
      } else {
        this.config.outputFileName = sanitized;
        this.config.outputFileNameManual = true;
        event.target.value = sanitized;
      }
      this.syncAfterEdit();
    });
  }

  /* ═══════════════ ORDERS TAB ═══════════════ */

  renderOrdersTab() {
    const validation = this.validate();
    const filteredEntries = this.getFilteredRowEntries();
    const totalPages = Math.max(1, Math.ceil(filteredEntries.length / this.pageSize));
    if (this.page >= totalPages) this.page = totalPages - 1;
    if (this.page < 0) this.page = 0;
    const pageStart = this.page * this.pageSize;
    const pageEntries = filteredEntries.slice(pageStart, pageStart + this.pageSize);
    const rowsHTML = pageEntries.length > 0
      ? pageEntries.map(({ row, index }) => this.renderOrderRow(row, index, validation.rowErrors[index] || {})).join("")
      : this.rows.length > 0
        ? `
        <tr>
          <td colspan="12" class="output-empty-cell">
            <div class="empty-state-icon">🔎</div>
            <div class="empty-state-text">No hay filas visibles para el filtro actual.</div>
            <div class="empty-state-hint">Ajusta el filtro de Section Code para volver a ver filas.</div>
          </td>
        </tr>`
      : `
        <tr>
          <td colspan="12" class="output-empty-cell">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-text">Todavia no hay ordenes cargadas.</div>
            <div class="empty-state-hint">Importa un CSV o agrega una fila manualmente.</div>
          </td>
        </tr>`;

    this.tabContent.innerHTML = `
      <div class="tab-panel active orders-tab">
        <div class="form-card compact-toolbar-card">
          <div class="toolbar-left">
            <label class="csv-zone-compact">
              <input type="file" accept=".csv,.tsv,.txt" id="csvFile">
              <span class="btn btn-secondary btn-sm">📄 Importar CSV</span>
            </label>
            <button class="btn btn-success btn-sm" id="addRow" type="button">➕ Agregar fila</button>
          </div>
          <div class="toolbar-totals">
            <div class="total-stat">
              <span class="total-stat-value">${fmt(this.rows.length)}</span>
              <span class="total-stat-label">ordenes</span>
            </div>
            <div class="total-stat">
              <span class="total-stat-value">${fmt(this.sumField(this.rows.map((row, index) => ({ row, index })), "quantity"))}</span>
              <span class="total-stat-label">asientos</span>
            </div>
            <div class="total-stat ${validation.rowErrorCount > 0 ? "total-stat-warn" : ""}">
              <span class="total-stat-value">${fmt(validation.rowErrorCount)}</span>
              <span class="total-stat-label">pendientes</span>
            </div>
          </div>
        </div>

        <div class="orders-sticky-controls">
          <div class="form-card filter-card">
            <div class="filter-card-header">
              <div class="form-card-title">Filtros</div>
              <button class="action-btn" id="clearFilters" type="button" title="Limpiar filtros">🧹</button>
            </div>
            <div class="filter-toolbar">
              ${this.renderFilterDropdown("fanId", "👤 Fan")}
              ${this.renderFilterDropdown("tribuna", "🏟️ Tribuna")}
              ${this.renderFilterDropdown("seccion", "📍 Sección")}
              ${this.renderToggleFilter("courtesy", "🎫 Cortesía", [["all", "Todas"], ["yes", "Sí"], ["no", "No"]])}
              ${this.renderToggleFilter("seats", "💺 Asientos", [["all", "Todos"], ["numbered", "Numerados"], ["unnumbered", "No numerados"]])}
            </div>
          </div>

          <div class="sections-toolbar">
            <div class="sections-stats" id="ordersStats">
              <span class="stats-chip"><strong>${fmt(filteredEntries.length)}</strong> visibles</span>
              <span><strong>${fmt(this.countDistinct(filteredEntries, "fanId"))}</strong> fans</span>
              <span><strong>${fmt(this.sumField(filteredEntries, "quantity"))}</strong> asientos</span>
              <span><strong>${fmt(this.countDistinct(filteredEntries, "tribuna"))}</strong> tribunas</span>
              <span><strong>${fmt(this.countDistinct(filteredEntries, "seccion"))}</strong> secciones</span>
              <span class="stats-separator"></span>
              <span>Cortesías: <strong>${fmt(this.countByCourtesy(filteredEntries, true))}</strong> ord, <strong>${fmt(this.sumByCourtesy(filteredEntries, true))}</strong> asientos</span>
              <span>No cortesías: <strong>${fmt(this.countByCourtesy(filteredEntries, false))}</strong> ord, <strong>${fmt(this.sumByCourtesy(filteredEntries, false))}</strong> asientos</span>
            </div>
            ${totalPages > 1 ? `
            <div class="pagination" id="pagination">
              <button class="btn btn-secondary btn-sm" id="pageFirst" type="button" ${this.page === 0 ? "disabled" : ""}>«</button>
              <button class="btn btn-secondary btn-sm" id="pagePrev" type="button" ${this.page === 0 ? "disabled" : ""}>‹</button>
              <span class="pagination-info">${fmt(this.page + 1)} / ${fmt(totalPages)}</span>
              <button class="btn btn-secondary btn-sm" id="pageNext" type="button" ${this.page >= totalPages - 1 ? "disabled" : ""}>›</button>
              <button class="btn btn-secondary btn-sm" id="pageLast" type="button" ${this.page >= totalPages - 1 ? "disabled" : ""}>»</button>
            </div>` : ""}
          </div>
        </div>

        <div class="orders-scroll-area">
          <div id="ordersValidation">${this.renderValidationSummary(validation)}</div>

          <div class="sections-table-wrapper orders-table-wrapper">
            <table class="sections-table sales-table">
              <colgroup>
                <col class="col-row-index">
                <col class="col-fan-id">
                <col class="col-tribuna">
                <col class="col-seccion">
                <col class="col-seat-code">
                <col class="col-quantity">
                <col class="col-discount">
                <col class="col-base-price">
                <col class="col-courtesy">
                <col class="col-reason-type">
                <col class="col-reason">
                <col class="col-actions">
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  ${ORDER_TABLE_FIELDS.map((field) => {
                    const label = { fanId: "fanId", tribuna: "Tribuna", seccion: "Sección", seatCode: "seatCode", quantity: "quantity", discount: "discount", basePrice: "basePrice", courtesy: "courtesy", reasonType: "reasonType", reason: "reason" }[field];
                    return `<th class="th-clickable" data-bulk-field="${field}" title="Click para modificar en lote">${label}</th>`;
                  }).join("")}
                  <th class="th-clickable th-danger" id="bulkDeleteTh" title="Click para borrar filas visibles">🗑️</th>
                </tr>
              </thead>
              <tbody id="tableBody">${rowsHTML}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    this.bindOrdersTab();
  }

  renderOrderRow(row, index, rowErrors) {
    const sectionParts = splitSectionCode(row.sectionCode);
    const cells = ORDER_TABLE_FIELDS.map((field) => {
      const value = this.getOrderFieldValue(field, row, sectionParts);
      const invalid = this.getOrderFieldHasError(field, rowErrors) ? "invalid" : "";
      if (field === "reasonType" || field === "reason") {
        const isCourtesy = parseBoolean(row.courtesy) === true;
        if (!isCourtesy) return `<td class="cell-disabled"></td>`;
        if (field === "reasonType") {
          const currentId = row.reasonType || "";
          return `
          <td>
            <select class="form-select table-input ${invalid}"
              data-index="${index}" data-field="${field}"
              aria-label="${field} fila ${index + 1}">
              <option value="">—</option>
              ${REASON_TYPES.map((r) => `<option value="${r.id}" ${r.id === currentId ? "selected" : ""}>${this.esc(r.label)}</option>`).join("")}
            </select>
          </td>`;
        }
      }
      if (field === "courtesy") {
        const parsed = parseBoolean(row.courtesy);
        const hasValue = parsed !== null;
        return `
        <td>
          <select class="form-select table-input ${invalid}"
            data-index="${index}" data-field="${field}"
            aria-label="${field} fila ${index + 1}">
            ${hasValue ? "" : '<option value="">—</option>'}
            <option value="TRUE" ${parsed === true ? "selected" : ""}>Sí</option>
            <option value="FALSE" ${parsed === false ? "selected" : ""}>No</option>
          </select>
        </td>`;
      }
      return `
      <td>
        <input
          type="text"
          class="form-input table-input ${invalid}"
          value="${this.attr(value)}"
          data-index="${index}"
          data-field="${field}"
          aria-label="${field} fila ${index + 1}"
          spellcheck="false"
          autocomplete="off">
      </td>`;
    }).join("");

    return `
      <tr data-index="${index}">
        <td class="capacity-cell">${index + 1}</td>
        ${cells}
        <td>
          <div class="actions-cell">
            <button class="action-btn danger" type="button" title="Borrar" data-action="delete" data-index="${index}">🗑️</button>
          </div>
        </td>
      </tr>`;
  }

  bindOrdersTab() {
    const csvFile = document.getElementById("csvFile");
    const tableBody = document.getElementById("tableBody");

    csvFile.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) this.handleImportFile(file);
      event.target.value = "";
    });

    document.getElementById("addRow").addEventListener("click", () => this.addRow());

    document.getElementById("clearFilters").addEventListener("click", () => {
      this.filters.fanIdSelected = null; this.filters.fanIdSearch = "";
      this.filters.tribunaSelected = null; this.filters.tribunaSearch = "";
      this.filters.seccionSelected = null; this.filters.seccionSearch = "";
      this.filters.courtesy = "all"; this.filters.seats = "all";
      this.page = 0;
      this.save();
      this.renderActiveTab();
    });

    const paginationEl = document.getElementById("pagination");
    if (paginationEl) {
      const go = (p) => { this.page = p; this.renderActiveTab(); };
      document.getElementById("pageFirst").addEventListener("click", () => go(0));
      document.getElementById("pagePrev").addEventListener("click", () => go(this.page - 1));
      document.getElementById("pageNext").addEventListener("click", () => go(this.page + 1));
      document.getElementById("pageLast").addEventListener("click", () => go(Math.ceil(this.getFilteredRowEntries().length / this.pageSize) - 1));
    }

    const thead = this.tabContent.querySelector("thead");
    thead.addEventListener("click", (event) => {
      const th = event.target.closest("th");
      if (!th) return;
      if (th.dataset.bulkField) return this.openBulkEditModal(th.dataset.bulkField);
      if (th.id === "bulkDeleteTh") return this.bulkDeleteVisible();
    });

    this.bindFilterDropdown("fanId");
    this.bindFilterDropdown("tribuna");
    this.bindFilterDropdown("seccion");

    this.tabContent.querySelectorAll(".filter-toggle").forEach((el) => {
      el.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-toggle-value]");
        if (!btn) return;
        this.filters[el.dataset.toggleKey] = btn.dataset.toggleValue;
        this.page = 0;
        this.save();
        this.renderActiveTab();
      });
    });

    tableBody.addEventListener("input", (event) => {
      const input = event.target.closest("input[data-field]");
      if (!input) return;
      const index = Number(input.dataset.index);
      const field = input.dataset.field;
      if (!this.rows[index] || !ORDER_TABLE_FIELDS.includes(field)) return;
      this.setOrderFieldValue(index, field, input.value);
      this.syncAfterEdit();
    });

    tableBody.addEventListener("change", (event) => {
      const select = event.target.closest("select[data-field]");
      if (!select) return;
      const index = Number(select.dataset.index);
      const field = select.dataset.field;
      if (!this.rows[index] || !ORDER_TABLE_FIELDS.includes(field)) return;
      this.rows[index][field] = select.value;
      if (field === "courtesy") {
        const validation = this.validate();
        const tr = select.closest("tr");
        if (tr) tr.outerHTML = this.renderOrderRow(this.rows[index], index, validation.rowErrors[index] || {});
      }
      this.syncAfterEdit();
    });

    tableBody.addEventListener("blur", (event) => {
      const input = event.target.closest("input[data-field='seatCode']");
      if (!input) return;
      const index = Number(input.dataset.index);
      if (!this.rows[index]) return;
      this.rows[index].seatCode = normalizeSeatCode(input.value);
      this.syncAfterEdit();
    }, true);

    tableBody.addEventListener("blur", (event) => {
      const input = event.target.closest("input[data-field='tribuna'], input[data-field='seccion']");
      if (!input) return;
      this.syncAllFilterStates();
      this.save();
      this.renderActiveTab();
    }, true);

    tableBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const index = Number(button.dataset.index);
      if (button.dataset.action === "delete") this.deleteRow(index);
    });
  }

  /* ═══════════════ ANALYSIS TAB ═══════════════ */

  renderAnalysisTab() {
    if (this.rows.length === 0) {
      this.tabContent.innerHTML = `
        <div class="tab-panel active analysis-tab">
          <div class="form-card" style="text-align:center;padding:3rem">
            <div class="empty-state-icon">📊</div>
            <div class="empty-state-text">No hay datos para analizar.</div>
            <div class="empty-state-hint">Importa o agrega filas en la tab Ordenes.</div>
          </div>
        </div>`;
      return;
    }

    const stats = this.buildAnalysisStats();

    this.tabContent.innerHTML = `
      <div class="tab-panel active analysis-tab">
        <div class="analysis-grid">
          ${this.renderCourtesyCard(stats)}
          ${this.renderReasonTypeCard(stats)}
          ${this.renderTribunaCard(stats)}
          ${this.renderTopFansCard(stats)}
        </div>
        <div class="form-card analysis-fan-card">
          <div class="analysis-card-header">
            <div class="form-card-title">Detalle por Fan</div>
            <div class="analysis-fan-filter">
              <div class="filter-dropdown" id="analysisFanFilter">
                <button class="filter-trigger" id="analysisFanTrigger" type="button">
                  <span class="filter-trigger-label">👤 Fans</span>
                  <span class="filter-trigger-summary" id="analysisFanSummary">Ninguno seleccionado</span>
                  <span class="filter-trigger-caret">▾</span>
                </button>
                <div class="filter-menu">
                  <div class="filter-search-row">
                    <input type="text" class="form-input filter-search-input" id="analysisFanSearch" placeholder="Buscar fan ID..." autocomplete="off" spellcheck="false">
                  </div>
                  <div class="filter-options" id="analysisFanOptions"></div>
                  <div class="filter-menu-apply">
                    <button class="btn btn-success btn-sm filter-apply-btn" id="analysisFanApply" type="button">Aplicar</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div id="fanTableContainer">${this.renderFanTable(stats, [])}</div>
        </div>
      </div>`;

    this.bindAnalysisTab(stats);
  }

  buildAnalysisStats() {
    const fans = {};
    const tribunas = {};
    const reasonTypes = {};
    let courtesyYes = { orders: 0, seats: 0 };
    let courtesyNo = { orders: 0, seats: 0 };

    this.rows.forEach((row) => {
      const qty = parseInt(row.quantity, 10) || 0;
      const parts = splitSectionCode(row.sectionCode);
      const trib = normalizeText(parts.tribuna) || "(Vacío)";
      const sec = normalizeText(parts.seccion) || "(Sin sección)";
      const fanId = normalizeText(row.fanId) || "(Sin fan)";
      const isCourtesy = parseBoolean(row.courtesy) === true;
      const sectionKey = `${trib}/${sec}`;

      // Fan detail
      if (!fans[fanId]) fans[fanId] = { courtesy: 0, noCourtesy: 0, totalSeats: 0, sections: {} };
      fans[fanId].totalSeats += qty;
      if (isCourtesy) fans[fanId].courtesy += qty; else fans[fanId].noCourtesy += qty;
      if (!fans[fanId].sections[sectionKey]) fans[fanId].sections[sectionKey] = { courtesy: 0, noCourtesy: 0 };
      if (isCourtesy) fans[fanId].sections[sectionKey].courtesy += qty;
      else fans[fanId].sections[sectionKey].noCourtesy += qty;

      // Tribuna
      if (!tribunas[trib]) tribunas[trib] = { orders: 0, seats: 0 };
      tribunas[trib].orders++;
      tribunas[trib].seats += qty;

      // Courtesy
      if (isCourtesy) { courtesyYes.orders++; courtesyYes.seats += qty; }
      else { courtesyNo.orders++; courtesyNo.seats += qty; }

      // Reason type
      if (isCourtesy) {
        const rtLabel = REASON_TYPE_BY_ID[row.reasonType] || normalizeText(row.reasonType) || "(Sin tipo)";
        if (!reasonTypes[rtLabel]) reasonTypes[rtLabel] = { orders: 0, seats: 0 };
        reasonTypes[rtLabel].orders++;
        reasonTypes[rtLabel].seats += qty;
      }
    });

    const fanList = Object.entries(fans)
      .map(([id, data]) => ({
        id,
        ...data,
        sectionList: Object.entries(data.sections)
          .map(([name, d]) => ({ name, ...d, total: d.courtesy + d.noCourtesy }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.totalSeats - a.totalSeats);

    const tribunaList = Object.entries(tribunas)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    const reasonTypeList = Object.entries(reasonTypes)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.seats - a.seats);

    return { fans, fanList, tribunaList, reasonTypeList, courtesyYes, courtesyNo };
  }

  renderCourtesyCard(stats) {
    const maxOrders = Math.max(1, stats.courtesyYes.orders, stats.courtesyNo.orders);
    const yPct = ((stats.courtesyYes.orders / maxOrders) * 100).toFixed(1);
    const nPct = ((stats.courtesyNo.orders / maxOrders) * 100).toFixed(1);
    return `
      <div class="form-card analysis-card">
        <div class="form-card-title">Cortesías</div>
        <div class="analysis-rows">
          <div class="analysis-row">
            <span class="analysis-row-label">✅ Sí</span>
            <span class="analysis-row-bar"><span class="bar-fill bar-green" style="width:${yPct}%"></span></span>
            <span class="analysis-row-values"><strong>${fmt(stats.courtesyYes.orders)}</strong> ord · <strong>${fmt(stats.courtesyYes.seats)}</strong> asientos</span>
          </div>
          <div class="analysis-row">
            <span class="analysis-row-label">❌ No</span>
            <span class="analysis-row-bar"><span class="bar-fill bar-cyan" style="width:${nPct}%"></span></span>
            <span class="analysis-row-values"><strong>${fmt(stats.courtesyNo.orders)}</strong> ord · <strong>${fmt(stats.courtesyNo.seats)}</strong> asientos</span>
          </div>
        </div>
      </div>`;
  }

  renderReasonTypeCard(stats) {
    const maxSeats = Math.max(1, ...stats.reasonTypeList.map((r) => r.seats));
    return `
      <div class="form-card analysis-card">
        <div class="form-card-title">Reason Type (cortesías)</div>
        <div class="analysis-rows">
          ${stats.reasonTypeList.length === 0 ? '<div class="empty-state-hint">No hay cortesías</div>' :
            stats.reasonTypeList.map((r) => `
              <div class="analysis-row">
                <span class="analysis-row-label">${this.esc(r.name)}</span>
                <span class="analysis-row-bar"><span class="bar-fill bar-amber" style="width:${(r.seats / maxSeats * 100).toFixed(1)}%"></span></span>
                <span class="analysis-row-values"><strong>${fmt(r.orders)}</strong> ord · <strong>${fmt(r.seats)}</strong> asientos</span>
              </div>`).join("")}
        </div>
      </div>`;
  }

  renderTribunaCard(stats) {
    const maxSeats = Math.max(1, ...stats.tribunaList.map((t) => t.seats));
    return `
      <div class="form-card analysis-card">
        <div class="form-card-title">Distribución por Tribuna</div>
        <div class="analysis-rows">
          ${stats.tribunaList.map((t) => `
            <div class="analysis-row">
              <span class="analysis-row-label">${this.esc(t.name)}</span>
              <span class="analysis-row-bar"><span class="bar-fill bar-cyan" style="width:${(t.seats / maxSeats * 100).toFixed(1)}%"></span></span>
              <span class="analysis-row-values"><strong>${fmt(t.orders)}</strong> ord · <strong>${fmt(t.seats)}</strong> asientos</span>
            </div>`).join("")}
        </div>
      </div>`;
  }

  renderTopFansCard(stats) {
    const top = stats.fanList.slice(0, 10);
    const maxSeats = Math.max(1, ...top.map((f) => f.totalSeats));
    return `
      <div class="form-card analysis-card">
        <div class="form-card-title">Top 10 Fans (por asientos)</div>
        <div class="analysis-rows">
          ${top.map((f) => `
            <div class="analysis-row">
              <span class="analysis-row-label analysis-row-mono">${this.esc(f.id)}</span>
              <span class="analysis-row-bar"><span class="bar-fill bar-green" style="width:${(f.totalSeats / maxSeats * 100).toFixed(1)}%"></span></span>
              <span class="analysis-row-values"><strong>${fmt(f.totalSeats)}</strong> asientos</span>
            </div>`).join("")}
        </div>
      </div>`;
  }

  renderFanTable(stats, selectedFans = []) {
    if (selectedFans.length === 0) {
      return `<div class="empty-state-hint" style="padding:1rem;text-align:center">Seleccioná hasta 10 fans del filtro para ver el detalle.</div>`;
    }
    const display = stats.fanList.filter((f) => selectedFans.includes(f.id));

    if (display.length === 0) {
      return `<div class="empty-state-hint" style="padding:1rem;text-align:center">No se encontraron fans.</div>`;
    }

    const rows = display.map((f) => {
      const sectionRows = f.sectionList.map((s, i) => `
        <tr class="fan-section-row">
          ${i === 0 ? `<td class="code-cell fan-id-cell" rowspan="${f.sectionList.length + 1}">${this.esc(f.id)}</td>` : ""}
          <td class="fan-section-name">${this.esc(s.name)}</td>
          <td class="pivot-num">${fmt(s.courtesy)}</td>
          <td class="pivot-num">${fmt(s.noCourtesy)}</td>
          <td class="pivot-num pivot-total">${fmt(s.total)}</td>
        </tr>`).join("");

      const totalRow = `
        <tr class="fan-total-row">
          <td class="pivot-total-label">Total</td>
          <td class="pivot-num pivot-total">${fmt(f.courtesy)}</td>
          <td class="pivot-num pivot-total">${fmt(f.noCourtesy)}</td>
          <td class="pivot-num pivot-grand-total">${fmt(f.totalSeats)}</td>
        </tr>`;

      return sectionRows + totalRow;
    }).join("");

    return `
      <div class="sections-table-wrapper" id="fanTableWrapper">
        <table class="sections-table fan-analysis-table">
          <thead>
            <tr>
              <th>Fan ID</th>
              <th>Sección</th>
              <th>Cortesías</th>
              <th>No Cortesías</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  bindAnalysisTab(stats) {
    const filterEl = document.getElementById("analysisFanFilter");
    const trigger = document.getElementById("analysisFanTrigger");
    const search = document.getElementById("analysisFanSearch");
    const optionsEl = document.getElementById("analysisFanOptions");
    const summary = document.getElementById("analysisFanSummary");
    const container = document.getElementById("fanTableContainer");
    const allFanIds = stats.fanList.map((f) => f.id);
    let selected = new Set();
    let searchText = "";
    let open = false;

    const renderOptions = () => {
      const q = searchText.toLowerCase();
      const filtered = q ? allFanIds.filter((id) => id.toLowerCase().includes(q)) : allFanIds;
      const display = filtered.slice(0, 100);
      optionsEl.innerHTML = display.length === 0
        ? `<div class="filter-empty">No hay fans para mostrar.</div>`
        : display.map((id) => {
            const checked = selected.has(id);
            const disabled = !checked && selected.size >= 10;
            return `
              <label class="filter-option ${disabled ? "filter-option-disabled" : ""}">
                <input type="checkbox" data-fan-id="${this.attr(id)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
                <span class="filter-option-code"><span class="filter-option-tribuna">${this.esc(id)}</span></span>
                <span class="filter-option-count">${fmt(stats.fans[id].totalSeats)}</span>
              </label>`;
          }).join("");
    };

    const updateSummary = () => {
      if (selected.size === 0) summary.textContent = "Ninguno seleccionado";
      else if (selected.size === 1) summary.textContent = [...selected][0];
      else summary.textContent = `${selected.size} seleccionados`;
    };

    const applySelection = () => {
      open = false;
      filterEl.classList.remove("open");
      container.innerHTML = this.renderFanTable(stats, [...selected]);
    };

    renderOptions();
    updateSummary();

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      open = !open;
      filterEl.classList.toggle("open", open);
      if (open) setTimeout(() => search.focus(), 0);
    });

    search.addEventListener("input", () => {
      searchText = search.value;
      renderOptions();
    });

    optionsEl.addEventListener("change", (e) => {
      const cb = e.target.closest("input[data-fan-id]");
      if (!cb) return;
      const id = cb.dataset.fanId;
      if (cb.checked) selected.add(id); else selected.delete(id);
      updateSummary();
      renderOptions();
    });

    document.getElementById("analysisFanApply").addEventListener("click", applySelection);

    document.addEventListener("click", (e) => {
      if (!open || e.target.closest("#analysisFanFilter")) return;
      open = false;
      filterEl.classList.remove("open");
    });
  }

  /* ═══════════════ CSV OUTPUT TAB ═══════════════ */

  renderCsvOutputTab() {
    const validation = this.validate();
    const rows = this.getActiveOutputRows();
    const csv = validation.valid ? this.generateActiveCSV() : "Corregi los pendientes para generar el CSV.";
    const rowsHTML = rows.length > 0
      ? rows.map((row, index) => this.renderOutputRow(row, index)).join("")
      : `
        <tr>
          <td colspan="11" class="output-empty-cell">No hay filas para exportar todavia.</td>
        </tr>`;

    const filteredWarning = this.csvFilteredMode
      ? `<div class="csv-filtered-warning">⚠️ Solo exportando <strong>${fmt(rows.length)}</strong> filas filtradas de <strong>${fmt(this.rows.length)}</strong> totales.</div>`
      : "";

    this.tabContent.innerHTML = `
      <div class="tab-panel active output-stack output-tab">
        ${this.renderValidationSummary(validation)}

        <div class="json-output-wrapper">
          <div class="json-output-header">
            <div class="output-header-main" style="flex-direction:row;align-items:center;gap:0.75rem">
              <button class="btn ${this.csvFilteredMode ? "btn-danger" : "btn-secondary"} btn-sm" id="toggleCsvFilter" type="button">
                🔍 ${this.csvFilteredMode ? "Quitar filtros" : "Aplicar filtros de Ordenes"}
              </button>
              ${filteredWarning}
            </div>
            <div class="output-header-actions">
              <span class="json-output-stats">${fmt(rows.length)} filas · ${validation.valid ? "listo" : `${validation.errors.length} pendientes`}</span>
              <button class="btn btn-secondary btn-sm" id="copyCsvOutput" type="button" ${validation.valid ? "" : "disabled"}>📋 Copiar CSV</button>
              <button class="btn btn-success btn-sm" id="exportCsvOutput" type="button" ${validation.valid ? "" : "disabled"}>📦 Exportar .csv</button>
              <button class="btn btn-secondary btn-sm" id="exportChunked" type="button" ${validation.valid ? "" : "disabled"}>✂️ Exportar fragmentado</button>
            </div>
          </div>
          <div class="sections-table-wrapper output-table-wrapper">
            <table class="sections-table output-table sales-output-table">
              <thead>
                <tr>
                  ${OUTPUT_HEADERS.map((header) => `<th>${header}</th>`).join("")}
                </tr>
              </thead>
              <tbody>${rowsHTML}</tbody>
            </table>
          </div>
        </div>

        <div class="json-output-wrapper">
          <div class="json-output-header">
            <span class="json-output-label">CSV Raw</span>
            <span class="json-output-stats">Encabezado incluido, listo para copiar o abrir en Excel/Sheets</span>
          </div>
          <pre class="json-output-pre">${this.esc(csv)}</pre>
        </div>
      </div>`;

    document.getElementById("toggleCsvFilter").addEventListener("click", () => {
      this.csvFilteredMode = !this.csvFilteredMode;
      this.renderActiveTab();
    });
    const copyBtn = document.getElementById("copyCsvOutput");
    const exportBtn = document.getElementById("exportCsvOutput");
    if (copyBtn) copyBtn.addEventListener("click", () => this.copyCsv());
    if (exportBtn) exportBtn.addEventListener("click", () => this.downloadCsv());
    const chunkedBtn = document.getElementById("exportChunked");
    if (chunkedBtn) chunkedBtn.addEventListener("click", () => this.openChunkedExportModal());
  }

  renderOutputRow(row, index) {
    return `
      <tr>
        ${OUTPUT_HEADERS.map((header) => {
          const value = row[header];
          const empty = !normalizeText(value);
          const codeClass = ["eventCode", "sectionCode", "seatCode", "groupCode", "reasonType"].includes(header) ? "code-cell" : "";
          return `<td class="${codeClass}">${empty ? '<span class="output-empty">—</span>' : this.esc(value)}</td>`;
        }).join("")}
      </tr>`;
  }

  /* ═══════════════ ACTIONS ═══════════════ */

  createRow(data = {}) {
    const row = ROW_FIELDS.reduce((row, field) => {
      row[field] = data[field] == null ? "" : String(data[field]);
      return row;
    }, {});
    if (row.reasonType && !REASON_TYPE_BY_ID[row.reasonType]) {
      const resolved = REASON_TYPE_BY_LABEL[row.reasonType.toLowerCase()];
      if (resolved) row.reasonType = resolved;
    }
    return row;
  }

  getOrderFieldValue(field, row, sectionParts = splitSectionCode(row.sectionCode)) {
    if (field === "tribuna") return sectionParts.tribuna;
    if (field === "seccion") return sectionParts.seccion;
    if (field === "seatCode") return normalizeSeatCode(row.seatCode);
    if (field === "reasonType") return REASON_TYPE_BY_ID[row.reasonType] || row.reasonType;
    return row[field];
  }

  getOrderFieldHasError(field, rowErrors) {
    if (field === "tribuna" || field === "seccion") return Boolean(rowErrors.sectionCode);
    return Boolean(rowErrors[field]);
  }

  setOrderFieldValue(index, field, value) {
    if (!this.rows[index]) return;
    if (field === "tribuna" || field === "seccion") {
      const parts = splitSectionCode(this.rows[index].sectionCode);
      this.rows[index].sectionCode = composeSectionCode(
        field === "tribuna" ? value : parts.tribuna,
        field === "seccion" ? value : parts.seccion
      );
      return;
    }
    if (field === "reasonType") {
      this.rows[index][field] = REASON_TYPE_BY_LABEL[value.toLowerCase()] || value;
      return;
    }
    this.rows[index][field] = value;
  }

  /* ─── Generic filter helpers ─── */

  getFilterValue(row, key) {
    if (key === "fanId") return normalizeText(row.fanId);
    return normalizeText(splitSectionCode(row.sectionCode)[key]);
  }

  getFilterOptions(key) {
    return [...new Set(this.rows.map((row) => this.getFilterValue(row, key)))]
      .filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  getFilterCounts(key) {
    return this.rows.reduce((acc, row) => {
      const val = this.getFilterValue(row, key);
      if (val) acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
  }

  getFilterSummary(key) {
    const options = this.getFilterOptions(key);
    const selected = this.filters[key + "Selected"];
    if (selected === null) return options.length ? "Todas" : "Sin datos";
    if (selected.length === 0) return "Ninguna";
    if (selected.length === 1) return selected[0];
    return `${selected.length} seleccionadas`;
  }

  renderToggleFilter(key, label, options) {
    return `
      <div class="filter-toggle" data-toggle-key="${key}">
        <span class="filter-trigger-label">${label}</span>
        <div class="toggle-group">
          ${options.map(([value, text]) =>
            `<button class="toggle-btn ${this.filters[key] === value ? "active" : ""}" data-toggle-value="${value}" type="button">${text}</button>`
          ).join("")}
        </div>
      </div>`;
  }

  renderFilterDropdown(key, label) {
    return `
      <div class="filter-dropdown ${this.filters[key + "Open"] ? "open" : ""}" id="${key}Filter">
        <button class="filter-trigger" id="${key}FilterTrigger" type="button">
          <span class="filter-trigger-label">${label}</span>
          <span class="filter-trigger-summary">${this.esc(this.getFilterSummary(key))}</span>
          <span class="filter-trigger-caret">▾</span>
        </button>
        <div class="filter-menu">
          <div class="filter-search-row">
            <input type="text" class="form-input filter-search-input" id="${key}FilterSearch"
                   value="${this.attr(this.filters[key + "Search"])}"
                   placeholder="Buscar ${key}" autocomplete="off" spellcheck="false">
          </div>
          <div class="filter-menu-actions">
            <button class="btn btn-secondary btn-sm" data-filter-key="${key}" data-filter-action="all" type="button">Todas</button>
            <button class="btn btn-secondary btn-sm" data-filter-key="${key}" data-filter-action="none" type="button">Ninguna</button>
          </div>
          <div class="filter-options" id="${key}FilterOptions">
            ${this.renderFilterOptionsMarkup(key)}
          </div>
          <div class="filter-menu-apply">
            <button class="btn btn-success btn-sm filter-apply-btn" id="${key}FilterApply" type="button">Aplicar</button>
          </div>
        </div>
      </div>`;
  }

  renderFilterOptionsMarkup(key) {
    const options = this.getFilterOptions(key);
    const counts = this.getFilterCounts(key);
    const search = normalizeText(this.filters[key + "Search"]).toLowerCase();
    const filtered = options.filter((v) => !search || v.toLowerCase().includes(search));

    if (filtered.length === 0) {
      return `<div class="filter-empty">No hay opciones para mostrar.</div>`;
    }

    const selected = this.filters[key + "Selected"];
    return filtered.map((value) => {
      const checked = selected === null || selected.includes(value);
      return `
        <label class="filter-option">
          <input type="checkbox" data-filter-key="${key}" data-filter-value="${this.attr(value)}" ${checked ? "checked" : ""}>
          <span class="filter-option-code">
            <span class="filter-option-tribuna">${this.esc(value)}</span>
          </span>
          <span class="filter-option-count">${counts[value] || 0}</span>
        </label>`;
    }).join("");
  }

  toggleFilterSelection(key, value) {
    const options = this.getFilterOptions(key);
    const selectedKey = key + "Selected";
    if (this.filters[selectedKey] === null) {
      this.filters[selectedKey] = options.filter((o) => o !== value);
      return;
    }
    const next = new Set(this.filters[selectedKey]);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    const selected = options.filter((o) => next.has(o));
    this.filters[selectedKey] = selected.length === options.length ? null : selected;
  }

  getFilteredRowEntries() {
    const fanSel = this.filters.fanIdSelected;
    const tribSel = this.filters.tribunaSelected;
    const secSel = this.filters.seccionSelected;
    const courtesyFilter = this.filters.courtesy;
    const seatsFilter = this.filters.seats;
    return this.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        if (fanSel !== null) {
          const fan = normalizeText(row.fanId);
          if (fan && !fanSel.includes(fan)) return false;
        }
        const parts = splitSectionCode(row.sectionCode);
        const trib = normalizeText(parts.tribuna);
        const sec = normalizeText(parts.seccion);
        if (tribSel !== null && trib && !tribSel.includes(trib)) return false;
        if (secSel !== null && sec && !secSel.includes(sec)) return false;
        if (courtesyFilter !== "all") {
          const val = parseBoolean(row.courtesy);
          if (courtesyFilter === "yes" && val !== true) return false;
          if (courtesyFilter === "no" && val !== false) return false;
        }
        if (seatsFilter !== "all") {
          const seat = normalizeSeatCode(row.seatCode);
          const isNumbered = seat && seat !== "UNNUMBERED";
          if (seatsFilter === "numbered" && !isNumbered) return false;
          if (seatsFilter === "unnumbered" && isNumbered) return false;
        }
        return true;
      });
  }

  syncFilterState(key) {
    const selectedKey = key + "Selected";
    if (this.filters[selectedKey] === null) return;
    const options = this.getFilterOptions(key);
    const selected = this.filters[selectedKey].filter((v) => options.includes(v));
    this.filters[selectedKey] = selected.length === options.length ? null : selected;
  }

  syncAllFilterStates() {
    this.syncFilterState("fanId");
    this.syncFilterState("tribuna");
    this.syncFilterState("seccion");
  }

  countDistinct(entries, field) {
    const values = new Set();
    for (const { row } of entries) {
      const parts = splitSectionCode(row.sectionCode);
      const val = field === "tribuna" ? parts.tribuna
        : field === "seccion" ? parts.seccion
        : normalizeText(row[field]);
      if (val) values.add(val);
    }
    return values.size;
  }

  sumField(entries, field) {
    return entries.reduce((sum, { row }) => sum + (parseInt(row[field], 10) || 0), 0);
  }

  countByCourtesy(entries, isCourtesy) {
    return entries.filter(({ row }) => parseBoolean(row.courtesy) === isCourtesy).length;
  }

  sumByCourtesy(entries, isCourtesy) {
    return entries.filter(({ row }) => parseBoolean(row.courtesy) === isCourtesy)
      .reduce((sum, { row }) => sum + (parseInt(row.quantity, 10) || 0), 0);
  }

  addRow(data = {}) {
    this.rows.push(this.createRow(data));
    this.activeTab = "orders";
    this.syncAllFilterStates();
    this.save();
    this.renderTabs();
    this.renderActiveTab();

    const firstField = this.tabContent.querySelector(`input[data-index="${this.rows.length - 1}"][data-field="fanId"]`);
    if (firstField) firstField.focus();
  }

  bulkDeleteVisible() {
    const filtered = this.getFilteredRowEntries();
    if (filtered.length === 0) {
      this.toast("No hay filas visibles para borrar", "error");
      return;
    }

    const existing = document.getElementById("bulkEditOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "bulkEditOverlay";
    overlay.className = "bulk-edit-overlay";
    overlay.innerHTML = `
      <div class="bulk-edit-modal">
        <div class="bulk-edit-title">Borrar <strong>${fmt(filtered.length)} filas</strong> visibles?</div>
        <div class="bulk-edit-actions">
          <button class="btn btn-secondary btn-sm" id="bulkEditCancel" type="button">Cancelar</button>
          <button class="btn btn-danger btn-sm" id="bulkEditAccept" type="button">Borrar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById("bulkEditCancel").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", handler); }
    });

    document.getElementById("bulkEditAccept").addEventListener("click", () => {
      const indices = new Set(filtered.map((e) => e.index));
      this.rows = this.rows.filter((_, i) => !indices.has(i));
      close();
      this.syncAllFilterStates();
      this.save();
      this.renderTabs();
      this.renderActiveTab();
      this.toast(`${fmt(indices.size)} filas eliminadas`, "success");
    });
  }

  deleteRow(index) {
    if (!this.rows[index]) return;
    this.rows.splice(index, 1);
    this.syncAllFilterStates();
    this.save();
    this.renderTabs();
    this.renderActiveTab();
    this.toast("Fila eliminada", "success");
  }

  resetAll() {
    const existing = document.getElementById("bulkEditOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "bulkEditOverlay";
    overlay.className = "bulk-edit-overlay";
    overlay.innerHTML = `
      <div class="bulk-edit-modal">
        <div class="bulk-edit-title">Resetear <strong>toda la herramienta</strong>? Se eliminará la configuración, filas, filtros y datos guardados.</div>
        <div class="bulk-edit-actions">
          <button class="btn btn-secondary btn-sm" id="bulkEditCancel" type="button">Cancelar</button>
          <button class="btn btn-danger btn-sm" id="bulkEditAccept" type="button">Resetear todo</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById("bulkEditCancel").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", handler); }
    });

    document.getElementById("bulkEditAccept").addEventListener("click", () => {
      localStorage.removeItem(this.STORAGE_KEY);
      close();
      this.config = { eventCode: "", groupCode: "", outputFileName: "", outputFileNameManual: false };
      this.filters = { fanIdSelected: null, fanIdSearch: "", fanIdOpen: false, tribunaSelected: null, tribunaSearch: "", tribunaOpen: false, seccionSelected: null, seccionSearch: "", seccionOpen: false, courtesy: "all", seats: "all" };
      this.rows = [];
      this.activeTab = "config";
      this.renderTabs();
      this.renderActiveTab();
      this.toast("Todo reseteado", "success");
    });
  }

  openBulkEditModal(field) {
    const filteredEntries = this.getFilteredRowEntries();
    if (filteredEntries.length === 0) {
      this.toast("No hay filas visibles para modificar", "error");
      return;
    }

    const label = { fanId: "Fan ID", tribuna: "Tribuna", seccion: "Sección", seatCode: "Seat Code", quantity: "Quantity", discount: "Discount", basePrice: "Base Price", courtesy: "Courtesy", reasonType: "Reason Type", reason: "Reason" }[field] || field;

    const inputHTML = field === "reasonType"
      ? `<select class="form-select" id="bulkEditValue">
          <option value="">— Seleccionar —</option>
          ${REASON_TYPES.map((r) => `<option value="${r.id}">${this.esc(r.label)}</option>`).join("")}
        </select>`
      : field === "courtesy"
      ? `<select class="form-select" id="bulkEditValue">
          <option value="TRUE">Sí</option>
          <option value="FALSE">No</option>
        </select>`
      : `<input type="text" class="form-input" id="bulkEditValue" placeholder="${this.attr(label)}" autocomplete="off" spellcheck="false">`;

    const existing = document.getElementById("bulkEditOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "bulkEditOverlay";
    overlay.className = "bulk-edit-overlay";
    overlay.innerHTML = `
      <div class="bulk-edit-modal">
        <div class="bulk-edit-title">Modificar <strong>${this.esc(label)}</strong> para ${fmt(filteredEntries.length)} filas visibles</div>
        ${inputHTML}
        <div class="bulk-edit-actions">
          <button class="btn btn-secondary btn-sm" id="bulkEditCancel" type="button">Cancelar</button>
          <button class="btn btn-success btn-sm" id="bulkEditAccept" type="button">Aceptar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = document.getElementById("bulkEditValue");
    input.focus();

    const close = () => overlay.remove();

    document.getElementById("bulkEditCancel").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", handler); }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("bulkEditAccept").click();
    });

    document.getElementById("bulkEditAccept").addEventListener("click", () => {
      const value = input.value;
      const indices = new Set(filteredEntries.map((e) => e.index));
      this.rows.forEach((row, i) => {
        if (!indices.has(i)) return;
        if (field === "tribuna" || field === "seccion") {
          this.setOrderFieldValue(i, field, value);
        } else {
          row[field] = value;
        }
      });
      close();
      this.syncAllFilterStates();
      this.save();
      this.renderTabs();
      this.renderActiveTab();
      this.toast(`${label} aplicado a ${fmt(indices.size)} filas`, "success");
    });
  }

  handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = this.parseCSV(event.target.result);
        this.importRows(parsed);
        this.activeTab = "orders";
        this.save();
        this.renderTabs();
        this.renderActiveTab();
        this.toast(`${fmt(this.rows.length)} filas importadas`, "success");
      } catch (error) {
        this.toast(error.message, "error");
      }
    };
    reader.onerror = () => this.toast("No se pudo leer el archivo", "error");
    reader.readAsText(file);
  }

  copyCsv() {
    const validation = this.validate();
    if (!validation.valid) {
      this.toast("Corregi los errores antes de copiar", "error");
      this.renderTabs();
      this.renderActiveTab();
      return;
    }

    this.copyText(this.generateActiveCSV())
      .then(() => this.toast("CSV copiado al portapapeles", "success"))
      .catch(() => this.toast("No se pudo copiar el CSV", "error"));
  }

  downloadCsv() {
    const validation = this.validate();
    if (!validation.valid) {
      this.toast("Corregi los errores antes de descargar", "error");
      this.renderTabs();
      this.renderActiveTab();
      return;
    }

    const blob = new Blob([this.generateActiveCSV()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = this.getActiveDownloadFileName();
    link.click();
    URL.revokeObjectURL(url);
    this.toast("CSV descargado", "success");
  }

  openChunkedExportModal() {
    const validation = this.validate();
    if (!validation.valid) {
      this.toast("Corregi los errores antes de exportar", "error");
      return;
    }

    const outputRows = this.getActiveOutputRows();
    const totalRows = outputRows.length;
    if (totalRows === 0) {
      this.toast("No hay filas para exportar", "error");
      return;
    }

    const existing = document.getElementById("bulkEditOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "bulkEditOverlay";
    overlay.className = "bulk-edit-overlay";
    overlay.innerHTML = `
      <div class="bulk-edit-modal">
        <div class="bulk-edit-title">Exportar fragmentado</div>
        <div class="form-group">
          <label class="form-label">Máximo de filas por archivo</label>
          <input type="number" class="form-input" id="chunkedMaxRows" min="1" max="${totalRows}" value="100" autocomplete="off">
        </div>
        <div class="chunked-info" id="chunkedInfo">
          <strong>${fmt(totalRows)}</strong> filas → <strong>${fmt(Math.ceil(totalRows / 100))}</strong> archivos de hasta <strong>100</strong> filas
        </div>
        <div class="bulk-edit-actions">
          <button class="btn btn-secondary btn-sm" id="bulkEditCancel" type="button">Cancelar</button>
          <button class="btn btn-success btn-sm" id="bulkEditAccept" type="button">📦 Descargar .zip</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = document.getElementById("chunkedMaxRows");
    const info = document.getElementById("chunkedInfo");
    input.focus();
    input.select();

    const updateInfo = () => {
      const max = parseInt(input.value, 10) || 1;
      const files = Math.ceil(totalRows / Math.max(1, max));
      info.innerHTML = `<strong>${fmt(totalRows)}</strong> filas → <strong>${fmt(files)}</strong> archivos de hasta <strong>${fmt(max)}</strong> filas`;
    };
    input.addEventListener("input", updateInfo);

    const close = () => overlay.remove();
    document.getElementById("bulkEditCancel").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", handler); }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("bulkEditAccept").click();
    });

    document.getElementById("bulkEditAccept").addEventListener("click", () => {
      const maxRows = Math.max(1, parseInt(input.value, 10) || 100);
      close();
      this.downloadChunkedZip(outputRows, maxRows);
    });
  }

  downloadChunkedZip(outputRows, maxRows) {
    const header = OUTPUT_HEADERS.join(",");
    const rawBase = this.getEffectiveOutputFileName();
    const baseName = this.csvFilteredMode ? `${rawBase}-filtrado` : rawBase;
    const totalParts = Math.ceil(outputRows.length / maxRows);
    const files = {};
    const encoder = new TextEncoder();

    const fullCsv = [header, ...outputRows.map((row) => OUTPUT_HEADERS.map((h) => escapeCSVCell(row[h])).join(","))].join("\n");
    files[`${baseName}-full.csv`] = encoder.encode(fullCsv);

    for (let i = 0; i < totalParts; i++) {
      const chunk = outputRows.slice(i * maxRows, (i + 1) * maxRows);
      const lines = chunk.map((row) => OUTPUT_HEADERS.map((h) => escapeCSVCell(row[h])).join(","));
      const csv = [header, ...lines].join("\n");
      const fileName = `${baseName}-part${i + 1}-${totalParts}.csv`;
      files[fileName] = encoder.encode(csv);
    }

    const zipped = fflate.zipSync(files);
    const blob = new Blob([zipped], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}.zip`;
    link.click();
    URL.revokeObjectURL(url);
    this.toast(`${fmt(totalParts)} archivos exportados en .zip`, "success");
  }

  /* ═══════════════ CSV PARSE / GENERATE ═══════════════ */

  parseCSV(text) {
    const normalizedText = String(text || "").replace(/^\uFEFF/, "");
    const lines = normalizedText.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length < 2) {
      throw new Error("El CSV esta vacio o no tiene filas de datos");
    }

    const separator = this.detectSeparator(lines[0]);
    const rawHeaders = this.parseLine(lines[0], separator);
    const headers = rawHeaders.map((header) => HEADER_BY_NORMALIZED_KEY[normalizeKey(header)] || null);
    const headerSet = new Set(headers.filter(Boolean));

    const dataRows = lines.slice(1).map((line) => {
      const values = this.parseLine(line, separator);
      const row = {};
      headers.forEach((header, index) => {
        if (header) row[header] = values[index] == null ? "" : values[index].trim();
      });
      return row;
    }).filter((row) => Object.values(row).some((value) => String(value).trim() !== ""));

    if (dataRows.length === 0) {
      throw new Error("El CSV no tiene filas de datos validas");
    }

    return { headerSet, rows: dataRows };
  }

  parseLine(line, separator) {
    const cells = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === separator && !inQuotes) {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    cells.push(current);
    return cells;
  }

  detectSeparator(headerLine) {
    const counts = { "\t": 0, ",": 0, ";": 0 };
    for (const char of headerLine) {
      if (Object.prototype.hasOwnProperty.call(counts, char)) counts[char] += 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ",";
  }

  importRows(parsed) {
    const hasCompleteHeaders = OUTPUT_HEADERS.every((header) => parsed.headerSet.has(header));
    const hasSimpleHeaders = SIMPLE_REQUIRED_HEADERS.every((header) => parsed.headerSet.has(header));

    if (!hasCompleteHeaders && !hasSimpleHeaders) {
      throw new Error("El CSV debe ser completo o incluir fanId, sectionCode, seatCode y quantity");
    }

    if (hasCompleteHeaders) {
      this.importCompleteRows(parsed.rows);
      return;
    }

    this.rows = parsed.rows.map((row) => this.createRow(row));
    this.syncAllFilterStates();
    this.save();
  }

  importCompleteRows(rows) {
    const eventCodes = uniqueTrimmed(rows.map((row) => row.eventCode));
    const groupCodes = uniqueTrimmed(rows.map((row) => row.groupCode));

    if (eventCodes.length !== 1 || !eventCodes[0]) {
      throw new Error("El CSV completo debe tener un unico eventCode no vacio");
    }

    if (groupCodes.length !== 1 || !groupCodes[0]) {
      throw new Error("El CSV completo debe tener un unico groupCode no vacio");
    }

    this.config.eventCode = eventCodes[0];
    this.config.groupCode = sanitizeIdentifier(groupCodes[0]);
    this.rows = rows.map((row) => this.createRow(row));
    this.syncAllFilterStates();
    this.save();
  }

  getActiveOutputRows() {
    if (this.csvFilteredMode) {
      const filtered = this.getFilteredRowEntries();
      return filtered.map(({ row }) => this.getOutputRow(row));
    }
    return this.getOutputRows();
  }

  generateActiveCSV() {
    const lines = this.getActiveOutputRows().map((row) => {
      return OUTPUT_HEADERS.map((header) => escapeCSVCell(row[header])).join(",");
    });
    return [OUTPUT_HEADERS.join(","), ...lines].join("\n");
  }

  getActiveDownloadFileName() {
    const base = this.getEffectiveOutputFileName();
    return this.csvFilteredMode ? `${base}-filtrado.csv` : `${base}.csv`;
  }

  getOutputRows() {
    return this.rows.map((row) => this.getOutputRow(row));
  }

  getOutputRow(row) {
    const courtesy = parseBoolean(row.courtesy);
    const seatCode = normalizeSeatCode(row.seatCode);
    return {
      fanId: normalizeText(row.fanId),
      eventCode: normalizeText(this.config.eventCode),
      sectionCode: normalizeText(row.sectionCode),
      seatCode,
      quantity: normalizeText(row.quantity),
      discount: normalizeText(row.discount),
      basePrice: normalizeText(row.basePrice),
      courtesy: courtesy == null ? normalizeText(row.courtesy) : courtesy ? "TRUE" : "FALSE",
      groupCode: normalizeText(this.config.groupCode),
      reasonType: courtesy === true ? normalizeText(row.reasonType) : "",
      reason: courtesy === true ? normalizeText(row.reason) : "",
    };
  }

  generateCSV() {
    const lines = this.getOutputRows().map((row) => {
      return OUTPUT_HEADERS.map((header) => escapeCSVCell(row[header])).join(",");
    });

    return [OUTPUT_HEADERS.join(","), ...lines].join("\n");
  }

  getDownloadFileName() {
    const base = this.getEffectiveOutputFileName();
    return `${base}.csv`;
  }

  getEffectiveOutputFileName() {
    const manual = sanitizeIdentifier(this.config.outputFileName);
    if (this.config.outputFileNameManual && manual) return manual;
    return sanitizeIdentifier(this.config.groupCode);
  }

  /* ═══════════════ VALIDATION ═══════════════ */

  validate() {
    const globalErrors = {};
    const errors = [];
    const rowErrors = this.rows.map(() => ({}));

    if (!normalizeText(this.config.eventCode)) {
      globalErrors.eventCode = "Event code requerido";
      errors.push("Event code requerido");
    }

    const groupCode = sanitizeIdentifier(this.config.groupCode);
    if (!groupCode) {
      globalErrors.groupCode = "Group code requerido";
      errors.push("Group code requerido");
    } else if (groupCode !== normalizeText(this.config.groupCode)) {
      globalErrors.groupCode = "Group code invalido";
      errors.push("Group code invalido");
    }

    const effectiveOutputFileName = this.getEffectiveOutputFileName();
    if (!effectiveOutputFileName) {
      globalErrors.outputFileName = "Nombre de archivo requerido";
      errors.push("Nombre de archivo requerido");
    } else if (this.config.outputFileNameManual && effectiveOutputFileName !== normalizeText(this.config.outputFileName)) {
      globalErrors.outputFileName = "Nombre de archivo invalido";
      errors.push("Nombre de archivo invalido");
    }

    if (this.rows.length === 0) {
      errors.push("Agrega al menos una fila");
    }

    this.rows.forEach((row, index) => {
      const isCourtesy = parseBoolean(row.courtesy) === true;
      ROW_FIELDS.forEach((field) => {
        if (!isCourtesy && (field === "reasonType" || field === "reason")) return;
        const error = this.validateField(field, row[field]);
        if (error) {
          rowErrors[index][field] = error;
          errors.push(`Fila ${index + 1}: ${field} ${error}`);
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors,
      globalErrors,
      rowErrors,
      rowErrorCount: rowErrors.filter((rowError) => Object.keys(rowError).length > 0).length,
    };
  }

  validateField(field, value) {
    const text = normalizeText(value);
    if (TEXT_FIELDS.has(field)) return text ? "" : "requerido";
    if (field === "seatCode") return "";
    if (field === "quantity") {
      if (!text) return "requerido";
      if (!/^\d+$/.test(text) || Number(text) <= 0) return "debe ser entero positivo";
      return "";
    }
    if (field === "discount" || field === "basePrice") {
      if (!text) return "requerido";
      if (!Number.isFinite(Number(text))) return "debe ser numero valido";
      return "";
    }
    if (field === "courtesy") {
      if (!text) return "requerido";
      if (parseBoolean(text) == null) return "debe ser TRUE o FALSE";
      return "";
    }
    return "";
  }

  renderValidationSummary(validation) {
    if (validation.valid || !this.hasStarted()) return "";

    const visibleErrors = validation.errors.slice(0, 8).map((error) => `<li>${this.esc(error)}</li>`).join("");
    const extra = validation.errors.length > 8 ? `<p>Y ${validation.errors.length - 8} pendientes mas.</p>` : "";
    return `
      <div class="validation-summary" role="status">
        <strong>Corregi estos datos antes de exportar:</strong>
        <ul>${visibleErrors}</ul>
        ${extra}
      </div>`;
  }

  hasStarted() {
    return this.rows.length > 0
      || normalizeText(this.config.eventCode)
      || normalizeText(this.config.groupCode)
      || normalizeText(this.getEffectiveOutputFileName());
  }

  syncAfterEdit() {
    this.save();
    this.renderTabs();
    const validation = this.validate();
    if (this.activeTab === "config") this.syncConfigValidation(validation);
    if (this.activeTab === "orders") this.syncOrdersValidation(validation);
  }

  /* ═══════════════ PERSISTENCE ═══════════════ */

  save() {
    const data = {
      config: this.config,
      filters: {
        fanIdSelected: this.filters.fanIdSelected,
        fanIdSearch: this.filters.fanIdSearch,
        tribunaSelected: this.filters.tribunaSelected,
        tribunaSearch: this.filters.tribunaSearch,
        seccionSelected: this.filters.seccionSelected,
        seccionSearch: this.filters.seccionSearch,
        courtesy: this.filters.courtesy,
        seats: this.filters.seats,
      },
      rows: this.rows,
      activeTab: this.activeTab,
    };
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Failed to save:", error);
    }
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.config) this.config = { ...this.config, ...data.config };
      if (data.filters) {
        for (const key of ["fanId", "tribuna", "seccion"]) {
          if (Array.isArray(data.filters[key + "Selected"]) || data.filters[key + "Selected"] === null) {
            this.filters[key + "Selected"] = data.filters[key + "Selected"];
          }
          if (typeof data.filters[key + "Search"] === "string") {
            this.filters[key + "Search"] = data.filters[key + "Search"];
          }
        }
        if (typeof data.filters.courtesy === "string") this.filters.courtesy = data.filters.courtesy;
        if (typeof data.filters.seats === "string") this.filters.seats = data.filters.seats;
      }
      this.config.groupCode = sanitizeIdentifier(this.config.groupCode);
      this.config.outputFileName = sanitizeIdentifier(this.config.outputFileName);
      if (!this.config.outputFileName) this.config.outputFileNameManual = false;
      if (Array.isArray(data.rows)) this.rows = data.rows.map((row) => this.createRow(row));
      this.syncAllFilterStates();
      if (data.activeTab && this.TABS.some((tab) => tab.id === data.activeTab)) {
        this.activeTab = data.activeTab;
      }
    } catch (error) {
      console.error("Failed to load:", error);
    }
  }

  syncConfigValidation(validation) {
    const showErrors = this.hasStarted();
    const eventInput = document.getElementById("cfgEventCode");
    const groupInput = document.getElementById("cfgGroupCode");
    const fileInput = document.getElementById("cfgOutputFileName");
    const holder = document.getElementById("configValidation");
    if (eventInput) eventInput.classList.toggle("invalid", showErrors && Boolean(validation.globalErrors.eventCode));
    if (groupInput) groupInput.classList.toggle("invalid", showErrors && Boolean(validation.globalErrors.groupCode));
    if (fileInput) fileInput.classList.toggle("invalid", showErrors && Boolean(validation.globalErrors.outputFileName));
    if (holder) holder.innerHTML = this.renderValidationSummary(validation);
  }

  syncOrdersValidation(validation) {
    this.tabContent.querySelectorAll("input[data-field]").forEach((input) => {
      const index = Number(input.dataset.index);
      const field = input.dataset.field;
      input.classList.toggle("invalid", Boolean(validation.rowErrors[index] && validation.rowErrors[index][field]));
    });

    const holder = document.getElementById("ordersValidation");
    if (holder) holder.innerHTML = this.renderValidationSummary(validation);

    const stats = document.getElementById("ordersStats");
    if (stats) {
      stats.innerHTML = `
        <span><strong>${this.rows.length}</strong> ordenes</span>
        <span><strong>${validation.rowErrorCount}</strong> filas con pendientes</span>`;
    }
  }

  /* ═══════════════ UTILS ═══════════════ */

  copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        copied ? resolve() : reject(new Error("copy failed"));
      } catch (error) {
        document.body.removeChild(textarea);
        reject(error);
      }
    });
  }

  toast(message, type = "") {
    window.clearTimeout(this.toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.className = `toast show ${type}`.trim();
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.className = "toast";
    }, 3200);
  }

  esc(value) {
    return escapeHTML(value);
  }

  attr(value) {
    return escapeAttribute(value);
  }
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function fmt(n) {
  return Number(n).toLocaleString("es-AR");
}

function normalizeText(value) {
  return value == null ? "" : String(value).trim();
}

function uniqueTrimmed(values) {
  return [...new Set(values.map((value) => normalizeText(value)))];
}

function parseBoolean(value) {
  const normalized = normalizeKey(value);
  if (["true", "1", "yes", "si"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return null;
}

function normalizeSeatCode(value) {
  const text = normalizeText(value);
  return text || "UNNUMBERED";
}

function splitSectionCode(value) {
  const text = normalizeText(value);
  if (!text) return { tribuna: "", seccion: "" };
  const slashIndex = text.indexOf("/");
  if (slashIndex === -1) return { tribuna: text, seccion: "" };
  return {
    tribuna: text.slice(0, slashIndex),
    seccion: text.slice(slashIndex + 1),
  };
}

function composeSectionCode(tribuna, seccion) {
  const tribunaText = normalizeText(tribuna);
  const seccionText = normalizeText(seccion);
  if (!tribunaText) return seccionText;
  return seccionText ? `${tribunaText}/${seccionText}` : tribunaText;
}

function sanitizeIdentifier(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "");
}

function escapeCSVCell(value) {
  const text = normalizeText(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function escapeHTML(value) {
  return normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHTML(value).replace(/'/g, "&#39;");
}

document.addEventListener("DOMContentLoaded", () => {
  window.bulkSalesTool = new BulkSalesTool();
});
