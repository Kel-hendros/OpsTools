/**
 * Layout Interpreter — Fanki
 *
 * Intérprete de manifiestos de estadio (formato BAN) → Layout JSON de Fanki.
 *
 * Formato BAN esperado (columnas): SECCION, FILA, ASIENTO, LOCALIDAD, ACCESO, SEÑALIZACION BOLETO
 *   - LOCALIDAD  -> name de la sección PADRE
 *   - SECCION    -> name de la sección HIJA (única por (LOCALIDAD, SECCION))
 *   - ACCESO     -> door (dominante por sección; ⚠️ si hay otros)
 *   - SEÑALIZACION BOLETO -> color (nombre -> hex, mapeable)
 *   - FILA/ASIENTO -> numerado vs sin numerar:
 *        · FILA con valor (número o letra) -> NUMERADA  -> capacity NO va al JSON (grilla aparte)
 *        · FILA = "-" / vacío              -> SIN NUMERAR -> capacity = nº de registros (va al JSON)
 */

const STORAGE_KEY = "fanki_layout_interpreter_v1";

const SECTION_TYPES = ["GRANDSTAND", "VIP", "BOX", "GENERAL"];
const VISIBILITY_SCOPES = ["ALL", "PRIVATE", "NONE"];

// Columnas del manifiesto BAN y sus alias normalizados
const COLUMN_ALIASES = {
  seccion: ["seccion", "sección", "section"],
  fila: ["fila", "row"],
  asiento: ["asiento", "seat", "butaca"],
  localidad: ["localidad", "locality", "zona"],
  acceso: ["acceso", "access", "puerta", "door"],
  color: ["senalizacionboleto", "señalizacionboleto", "señalizaciónboleto", "senalizacion", "color"],
};

// Nombre de señalización -> hex por defecto (editable en el panel Colores)
const DEFAULT_COLOR_MAP = {
  "AMARILLO": "#FFD400",
  "ROJO": "#E10600",
  "GRIS": "#9CA3AF",
  "VERDE": "#16A34A",
  "AZUL": "#2563EB",
  "MAGENTA": "#D6006C",
  "VERDE MILITAR": "#4B5320",
  "AZUL REY": "#1D4ED8",
  "MOSTAZA": "#C9A227",
};
const NO_COLOR_KEY = "(sin color)";
const FALLBACK_HEX = "#FFFFFF";
const DEFAULT_CHILD_PREFIX = "SECCION_";
const CHEVRON_SVG = `<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const GRID_ICON = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="1.2" y="1.2" width="13.6" height="13.6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M1.2 6h13.6M1.2 10.5h13.6M6 1.2v13.6M10.5 1.2v13.6" stroke="currentColor" stroke-width="1"/></svg>`;

class Interpreter {
  constructor() {
    this.tabs = [
      { id: "secciones", label: "Secciones", icon: "🏟️" },
      { id: "colores", label: "Colores", icon: "🎨" },
      { id: "config", label: "Config", icon: "⚙️" },
      { id: "json", label: "Exportar", icon: "🧾" },
      { id: "cmpLayout", label: "Comparar Layout", icon: "🔀" },
      { id: "cmpGrids", label: "Comparar Grids", icon: "🧮" },
    ];
    this.activeTab = "secciones";
    this.format = "BAN"; // "BAN" (CSV manifiesto) | "FANKI" (Layout JSON)

    this.config = { code: "", name: "", maxCapacityByFan: 3 };
    this.parents = [];
    this.colorMap = { ...DEFAULT_COLOR_MAP };
    this.expanded = new Set();
    this.selected = new Set(); // keys "pi" (padre) o "pi:ci" (hija)

    // Comparación de layout
    this.cmpRight = null;        // layout nuevo normalizado { code, name, parents: [...] }
    this.matchParent = {};       // li -> ri
    this.matchChild = {};        // "li:ci" -> "ri:rci"
    this.cmpExpanded = new Set();

    // Comparación de grids (ZIP)
    this.gridRight = null;       // { name, parents: [{code, children:[{code, fullCode, count}]}] }
    this.gMatchParent = {};
    this.gMatchChild = {};
    this.gExpanded = new Set();

    // Grids aplicados al layout base (formato Fanki) — resumen para mostrar
    this.gridsApplied = null;    // { fileName, filled, notFound, unused }
    // Geometría de grids para dibujar (solo en memoria, no se persiste)
    this.gridGeometry = new Map(); // normFullCode -> { rows: [[seatCode|null,...],...], count, fullCode }

    this.tabsNav = document.getElementById("tabsNav");
    this.tabContent = document.getElementById("tabContent");
    this.modal = document.getElementById("modal");
    this.modalBox = this.modal.querySelector(".modal");
    this.modalTitle = document.getElementById("modalTitle");
    this.modalBody = document.getElementById("modalBody");

    this.load();
    this.bindGlobal();
    this.render();
  }

  /* ═══════════════ PERSISTENCIA ═══════════════ */

  save() {
    const data = {
      config: this.config,
      parents: this.parents,
      colorMap: this.colorMap,
      activeTab: this.activeTab,
      format: this.format,
      cmpRight: this.cmpRight,
      matchParent: this.matchParent,
      matchChild: this.matchChild,
      gridRight: this.gridRight,
      gMatchParent: this.gMatchParent,
      gMatchChild: this.gMatchChild,
      gridsApplied: this.gridsApplied,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      /* storage lleno: ignoramos */
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.config) this.config = { ...this.config, ...data.config };
      if (Array.isArray(data.parents)) this.parents = data.parents;
      if (data.colorMap) this.colorMap = { ...DEFAULT_COLOR_MAP, ...data.colorMap };
      if (data.activeTab) this.activeTab = data.activeTab;
      if (data.format) this.format = data.format;
      if (data.cmpRight) this.cmpRight = data.cmpRight;
      if (data.matchParent) this.matchParent = data.matchParent;
      if (data.matchChild) this.matchChild = data.matchChild;
      if (data.gridRight) this.gridRight = data.gridRight;
      if (data.gMatchParent) this.gMatchParent = data.gMatchParent;
      if (data.gMatchChild) this.gMatchChild = data.gMatchChild;
      if (data.gridsApplied) this.gridsApplied = data.gridsApplied;
    } catch (e) {
      /* corrupto: arrancamos limpio */
    }
  }

  bindGlobal() {
    document.getElementById("resetAll").addEventListener("click", () => this.confirmReset());
    document.querySelectorAll("#formatToggle .format-opt").forEach((btn) => {
      btn.addEventListener("click", () => this.setFormat(btn.dataset.fmt));
    });
    this.updateFormatToggle();
    document.getElementById("closeModal").addEventListener("click", () => this.closeModal());
    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.modal.classList.contains("open")) this.closeModal();
    });
  }

  setFormat(fmt) {
    if (fmt !== "BAN" && fmt !== "FANKI") return;
    if (fmt === this.format) return;
    this.format = fmt;
    this.activeTab = "secciones";
    this.save();
    this.render();
  }

  updateFormatToggle() {
    document.querySelectorAll("#formatToggle .format-opt").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.fmt === this.format);
    });
  }

  /* ═══════════════ RENDER PRINCIPAL ═══════════════ */

  render() {
    this.updateFormatToggle();
    this.renderTabs();
    this.renderActiveTab();
  }

  renderTabs() {
    this.tabsNav.innerHTML = this.tabs
      .map((tab) => {
        let badge = "";
        if (tab.id === "secciones" && this.parents.length > 0) {
          const kids = this.parents.reduce((s, p) => s + p.children.length, 0);
          badge = `<span class="tab-badge">${kids}</span>`;
        }
        return `<button class="tab-btn ${this.activeTab === tab.id ? "active" : ""}" data-tab="${tab.id}">
          <span class="icon">${tab.icon}</span> ${tab.label}${badge}
        </button>`;
      })
      .join("");
    this.tabsNav.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeTab = btn.dataset.tab;
        this.save();
        this.render();
      });
    });
  }

  renderActiveTab() {
    switch (this.activeTab) {
      case "secciones": return this.renderSeccionesTab();
      case "colores": return this.renderColoresTab();
      case "config": return this.renderConfigTab();
      case "json": return this.renderExportTab();
      case "cmpLayout": return this.renderCompareLayoutTab();
      case "cmpGrids": return this.renderCompareGridsTab();
    }
  }

  /* ═══════════════ TAB: SECCIONES ═══════════════ */

  renderSeccionesTab() {
    const stats = this.getStats();
    this.tabContent.innerHTML = `
      <div class="tab-panel active">
        ${this.renderImportZone()}

        <div class="sections-toolbar">
          <div class="sections-stats">
            <span><strong>${stats.parents}</strong> padres</span>
            <span><strong>${stats.children}</strong> secciones</span>
            <span><strong>${stats.capJson.toLocaleString()}</strong> sin numerar</span>
            <span><strong>${stats.seatsNumbered.toLocaleString()}</strong> numeradas</span>
            <span class="stat-total">Total aforo: <strong>${(stats.capJson + stats.seatsNumbered).toLocaleString()}</strong></span>
          </div>
          <div class="toolbar-actions">
            ${this.parents.length ? `<button class="btn btn-ghost btn-sm" id="expandAll">Expandir todo</button>
            <button class="btn btn-ghost btn-sm" id="collapseAll">Colapsar</button>` : ""}
          </div>
        </div>

        ${this.selected.size > 0 ? this.renderBulkBar() : ""}

        <div id="sectionsContainer">
          ${this.parents.length === 0 ? this.renderEmptyState() : this.renderTable()}
        </div>
      </div>`;

    this.bindCSVZone();
    this.bindTable();
  }

  renderImportZone() {
    if (this.format === "FANKI") {
      const hasParents = this.parents.length > 0;
      const numbered = this.parents.reduce((s, p) => s + p.children.filter((c) => c.numbered).length, 0);
      let gridHint = `Asumimos que las grids corresponden 100% al layout cargado.`;
      if (this.gridsApplied) {
        const g = this.gridsApplied;
        gridHint = `✅ <strong>${g.filled}</strong> secciones completadas` +
          (g.notFound ? ` · <strong class="cmp-warn">${g.notFound}</strong> sin grid` : "") +
          (g.unused ? ` · <strong class="cmp-warn">${g.unused}</strong> grids sin usar` : "");
      }
      return `
        <div class="import-grid">
          <div class="csv-zone" id="jsonZone">
            <input type="file" accept=".json,application/json" id="jsonFile">
            <div class="csv-zone-content">
              <div class="csv-zone-icon">🧩</div>
              <div class="csv-zone-title">Cargá un Layout JSON (formato Fanki) o hacé click</div>
              <div class="csv-zone-hint">Carga un layout base completo con toda la data real</div>
              <div class="csv-zone-hint csv-zone-hint-sub">${hasParents ? `Cargado: <strong>${esc(this.config.name || this.config.code || "layout")}</strong> · ${this.parents.length} padres` : "Después compará contra otro layout o grids."}</div>
            </div>
            <button class="btn btn-secondary btn-sm zone-inline-btn" id="openJsonPaste" type="button">Pegar JSON</button>
          </div>
          <div class="csv-zone ${hasParents ? "" : "csv-zone-disabled"}" id="gridApplyZone">
            <input type="file" accept=".zip,application/zip" id="gridApplyFile" ${hasParents ? "" : "disabled"}>
            <div class="csv-zone-content">
              <div class="csv-zone-icon">🗜️</div>
              <div class="csv-zone-title">${hasParents ? "Arrastrá el ZIP de grids para completar asientos" : "Primero cargá el Layout JSON →"}</div>
              <div class="csv-zone-hint">Adjudica la cantidad de asientos a cada sección numerada${hasParents ? ` (${numbered} numeradas)` : ""}</div>
              <div class="csv-zone-hint csv-zone-hint-sub">${gridHint}</div>
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="import-grid import-grid-single">
        <div class="csv-zone" id="csvZone">
          <input type="file" accept=".csv,.tsv,.txt" id="csvFile">
          <div class="csv-zone-content">
            <div class="csv-zone-icon">📄</div>
            <div class="csv-zone-title">Arrastrá el manifiesto BAN (.csv) o hacé click</div>
            <div class="csv-zone-hint">Columnas esperadas: SECCION, FILA, ASIENTO, LOCALIDAD, ACCESO, SEÑALIZACION BOLETO</div>
            <div class="csv-zone-hint csv-zone-hint-sub">Reemplaza las secciones actuales. Para pegar texto usá el botón.</div>
          </div>
          <button class="btn btn-secondary btn-sm zone-inline-btn" id="openPaste" type="button">Pegar texto</button>
        </div>
      </div>`;
  }

  renderEmptyState() {
    const hint = this.format === "FANKI"
      ? "Cargá un Layout JSON de Fanki para visualizarlo y compararlo"
      : "Cargá el CSV de BAN para interpretarlo automáticamente";
    return `
      <div class="empty-state">
        <div class="empty-state-icon">🧩</div>
        <div class="empty-state-text">No hay layout cargado</div>
        <div class="empty-state-hint">${hint}</div>
      </div>`;
  }

  renderBulkBar() {
    const visOpts = VISIBILITY_SCOPES.map((v) => `<option value="${v}">${v}</option>`).join("");
    return `
      <div class="bulk-bar">
        <span class="bulk-count">${this.selected.size} seleccionada(s)</span>
        <select class="form-select bulk-select" id="bulkVis"><option value="">Visibilidad…</option>${visOpts}</select>
        <select class="form-select bulk-select" id="bulkNumbered">
          <option value="">Numerado…</option>
          <option value="num">Numerada</option>
          <option value="unnum">Sin numerar</option>
        </select>
        <button class="btn btn-ghost btn-sm" data-bulk-flag="reseleable">Reseleable ⇄</button>
        <button class="btn btn-secondary btn-sm" id="bulkClear">Deseleccionar</button>
        <div class="bulk-code-group">
          <span class="bulk-code-label">Código:</span>
          <input type="text" class="form-input bulk-code-input" id="bulkPrefix" placeholder="Prefijo (ej. SECCION_)">
          <input type="text" class="form-input bulk-code-input" id="bulkSuffix" placeholder="Sufijo">
          <select class="form-select bulk-select" id="bulkCodeTarget">
            <option value="child">Hijas</option>
            <option value="parent">Padres</option>
          </select>
          <select class="form-select bulk-select" id="bulkCodeMode" title="Reemplazar: reconstruye desde el nombre. Agregar: antepone/añade al código actual.">
            <option value="replace">Reemplazar</option>
            <option value="add">Agregar</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="bulkCodeApply">Aplicar código</button>
        </div>
      </div>`;
  }

  renderTable() {
    const rows = this.parents.map((p, pi) => this.renderParentBlock(p, pi)).join("");
    const total = this.parents.length + this.parents.reduce((s, p) => s + p.children.length, 0);
    const allSel = total > 0 && this.selected.size === total;
    return `
      <div class="sections-table-wrapper">
        <table class="sections-table interp-table">
          <thead>
            <tr>
              <th class="col-check"><input type="checkbox" id="selAll" ${allSel ? "checked" : ""}></th>
              <th class="col-exp"></th>
              <th>Nombre</th>
              <th>Código</th>
              <th>Numerado</th>
              <th class="capacity-cell">Capacity</th>
              <th>Acceso</th>
              <th>Color</th>
              <th>Visib.</th>
              <th>Resel.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  renderParentBlock(p, pi) {
    const isOpen = this.expanded.has(pi);
    const checked = this.selected.has(`${pi}`) ? "checked" : "";
    const cap = p.children.reduce((s, c) => s + (c.numbered ? 0 : c.capacity), 0);
    const seats = p.children.reduce((s, c) => s + c.seatCount, 0);
    const visOpts = VISIBILITY_SCOPES.map((v) => `<option value="${v}" ${p.visibilityScope === v ? "selected" : ""}>${v}</option>`).join("");
    const hex = this.resolveParentColor(p);

    const parentRow = `
      <tr class="parent-row ${isOpen ? "expanded" : ""}" data-pi="${pi}">
        <td class="col-check"><input type="checkbox" class="sel-parent" data-pi="${pi}" ${checked}></td>
        <td class="col-exp"><button class="sub-toggle" data-toggle="${pi}" aria-label="Desplegar">${CHEVRON_SVG}</button></td>
        <td class="editable-cell name-cell" data-pi="${pi}" data-field="name" contenteditable="true">${esc(p.name)}</td>
        <td class="editable-cell code-cell" data-pi="${pi}" data-field="code" contenteditable="true">${esc(p.code)}</td>
        <td><span class="children-count">${p.children.length} sec.</span></td>
        <td class="capacity-cell"><strong>${cap.toLocaleString()}</strong> <span class="seat-muted">· ${seats.toLocaleString()} as.</span></td>
        <td>—</td>
        <td><span class="color-swatch" style="background:${hex}" title="${esc(hex)}"></span></td>
        <td><select class="form-select inline-select" data-pi="${pi}" data-field="visibilityScope">${visOpts}</select></td>
        <td>—</td>
        <td></td>
      </tr>`;

    const childRows = isOpen
      ? p.children.map((c, ci) => this.renderChildRow(p, pi, c, ci)).join("")
      : "";

    return parentRow + childRows;
  }

  renderChildRow(p, pi, c, ci) {
    const key = `${pi}:${ci}`;
    const checked = this.selected.has(key) ? "checked" : "";
    const visOpts = VISIBILITY_SCOPES.map((v) => `<option value="${v}" ${c.visibilityScope === v ? "selected" : ""}>${v}</option>`).join("");
    const hex = this.colorMap[c.colorName || NO_COLOR_KEY] || FALLBACK_HEX;
    const numBadge = c.numbered
      ? `<span class="badge badge-cyan">NUM</span>`
      : `<span class="badge badge-amber">S/N</span>`;
    let capCell;
    if (!c.numbered) {
      capCell = `<strong>${c.capacity.toLocaleString()}</strong>`;
    } else {
      const geoKey = this.normFull(`${p.code}/${c.code}`);
      capCell = this.gridGeometry.has(geoKey)
        ? `<button class="grid-chip" data-grid-key="${esc(geoKey)}" title="Ver grilla de asientos">${GRID_ICON} ${c.seatCount.toLocaleString()}</button>`
        : `<span class="seat-muted">0 · ${c.seatCount.toLocaleString()} as.</span>`;
    }
    const doorWarn = c.doorAlts && c.doorAlts.length
      ? `<span class="door-warn" data-door-alts="${pi}:${ci}" title="Otros accesos en algunos asientos">⚠️</span>`
      : "";

    return `
      <tr class="child-row" data-pi="${pi}" data-ci="${ci}">
        <td class="col-check"><input type="checkbox" class="sel-child" data-key="${key}" ${checked}></td>
        <td class="col-exp"></td>
        <td class="editable-cell name-cell child-name" data-pi="${pi}" data-ci="${ci}" data-field="name" contenteditable="true">${esc(c.name)}</td>
        <td class="editable-cell code-cell" data-pi="${pi}" data-ci="${ci}" data-field="code" contenteditable="true"><span class="child-code-prefix">${esc(p.code)}/</span>${esc(c.code)}</td>
        <td>${numBadge}</td>
        <td class="capacity-cell">${capCell}</td>
        <td class="door-cell">${esc(c.door || "—")} ${doorWarn}</td>
        <td><span class="color-swatch" style="background:${hex}" title="${esc(c.colorName || "sin color")} · ${esc(hex)}"></span></td>
        <td><select class="form-select inline-select" data-pi="${pi}" data-ci="${ci}" data-field="visibilityScope">${visOpts}</select></td>
        <td><input type="checkbox" class="flag-check" data-pi="${pi}" data-ci="${ci}" data-field="reseleable" ${c.reseleable ? "checked" : ""}></td>
        <td></td>
      </tr>`;
  }

  bindTable() {
    const expandAll = document.getElementById("expandAll");
    if (expandAll) expandAll.addEventListener("click", () => {
      this.parents.forEach((_, i) => this.expanded.add(i));
      this.renderSeccionesTab();
    });
    const collapseAll = document.getElementById("collapseAll");
    if (collapseAll) collapseAll.addEventListener("click", () => {
      this.expanded.clear();
      this.renderSeccionesTab();
    });

    const container = document.getElementById("sectionsContainer");
    if (!container) return;

    // Toggle expand
    container.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pi = Number(btn.dataset.toggle);
        if (this.expanded.has(pi)) this.expanded.delete(pi);
        else this.expanded.add(pi);
        this.renderSeccionesTab();
      });
    });

    // Inline selects (type / visibility)
    container.querySelectorAll(".inline-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const { pi, ci, field } = sel.dataset;
        const target = ci != null ? this.parents[pi].children[ci] : this.parents[pi];
        target[field] = sel.value;
        this.save();
      });
    });

    // Flag checkboxes
    container.querySelectorAll(".flag-check").forEach((chk) => {
      chk.addEventListener("change", () => {
        const { pi, ci, field } = chk.dataset;
        this.parents[pi].children[ci][field] = chk.checked;
        this.save();
      });
    });

    // Editable cells (name / code)
    container.querySelectorAll(".editable-cell").forEach((cell) => {
      cell.addEventListener("blur", () => this.commitEditableCell(cell));
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); cell.blur(); }
        if (e.key === "Escape") { cell.blur(); }
      });
    });

    // Selection
    container.querySelectorAll(".sel-parent").forEach((chk) => {
      chk.addEventListener("change", () => this.toggleSelectParent(Number(chk.dataset.pi), chk.checked));
    });
    container.querySelectorAll(".sel-child").forEach((chk) => {
      chk.addEventListener("change", () => {
        if (chk.checked) this.selected.add(chk.dataset.key);
        else this.selected.delete(chk.dataset.key);
        this.renderSeccionesTab();
      });
    });
    const selAll = document.getElementById("selAll");
    if (selAll) selAll.addEventListener("change", () => {
      if (selAll.checked) this.parents.forEach((p, pi) => this.toggleSelectParent(pi, true, false));
      else this.selected.clear();
      this.renderSeccionesTab();
    });

    // Chip de grilla -> dibujar
    container.querySelectorAll(".grid-chip").forEach((btn) => {
      btn.addEventListener("click", () => this.openGridModal(btn.dataset.gridKey));
    });

    // Door warning detail
    container.querySelectorAll(".door-warn").forEach((w) => {
      w.addEventListener("click", () => {
        const [pi, ci] = w.dataset.doorAlts.split(":").map(Number);
        this.showDoorAlts(this.parents[pi].children[ci]);
      });
    });

    this.bindBulkBar();
  }

  commitEditableCell(cell) {
    const { pi, ci, field } = cell.dataset;
    let val = cell.textContent.trim();
    // En código hija, el prefijo del padre no es editable: lo quitamos si quedó pegado
    if (field === "code" && ci != null) {
      const prefix = this.parents[pi].code + "/";
      if (val.startsWith(prefix)) val = val.slice(prefix.length);
    }
    const target = ci != null ? this.parents[pi].children[ci] : this.parents[pi];
    if (field === "code") val = this.autoCode(val);
    if (target[field] === val) return;
    target[field] = val;
    this.save();
    // Re-render para reflejar prefijos de código / badges
    this.renderSeccionesTab();
  }

  toggleSelectParent(pi, on, rerender = true) {
    if (on) {
      this.selected.add(`${pi}`);
      this.parents[pi].children.forEach((_, ci) => this.selected.add(`${pi}:${ci}`));
    } else {
      this.selected.delete(`${pi}`);
      this.parents[pi].children.forEach((_, ci) => this.selected.delete(`${pi}:${ci}`));
    }
    if (rerender) this.renderSeccionesTab();
  }

  /* ── Bulk ── */

  bindBulkBar() {
    const bar = document.querySelector(".bulk-bar");
    if (!bar) return;
    const apply = (fn) => { this.eachSelected(fn); this.save(); this.renderSeccionesTab(); };

    const bv = document.getElementById("bulkVis");
    if (bv) bv.addEventListener("change", () => { if (bv.value) apply((t) => t.visibilityScope = bv.value); });
    const bn = document.getElementById("bulkNumbered");
    if (bn) bn.addEventListener("change", () => {
      if (!bn.value) return;
      const numbered = bn.value === "num";
      apply((t, isChild) => { if (isChild) { t.numbered = numbered; if (!numbered) t.capacity = t.seatCount; } });
    });
    bar.querySelectorAll("[data-bulk-flag]").forEach((b) => {
      b.addEventListener("click", () => {
        const f = b.dataset.bulkFlag;
        apply((t) => { t[f] = !t[f]; });
      });
    });
    document.getElementById("bulkClear").addEventListener("click", () => {
      this.selected.clear();
      this.renderSeccionesTab();
    });

    // Bulk código: prefijo/sufijo separados para Hijas o Padres
    const codeApply = document.getElementById("bulkCodeApply");
    if (codeApply) codeApply.addEventListener("click", () => {
      const prefix = this.sanitizeAffix(document.getElementById("bulkPrefix").value);
      const suffix = this.sanitizeAffix(document.getElementById("bulkSuffix").value);
      const target = document.getElementById("bulkCodeTarget").value; // child | parent
      const mode = document.getElementById("bulkCodeMode").value;     // replace | add
      if (!prefix && !suffix && mode === "add") return this.toast("Indicá un prefijo o sufijo", "error");

      let n = 0;
      this.eachSelected((t, isChild) => {
        if (target === "child" && !isChild) return;
        if (target === "parent" && isChild) return;
        const base = mode === "replace" ? this.autoCode(t.name) : t.code;
        t.code = prefix + base + suffix;
        n++;
      });
      if (n === 0) return this.toast(`No hay ${target === "child" ? "hijas" : "padres"} en la selección`, "error");
      this.dedupeAll();
      this.save();
      this.renderSeccionesTab();
      this.toast(`Código actualizado en ${n} ${target === "child" ? "hijas" : "padres"}`);
    });
  }

  // Recorre selección. fn(target, isChild)
  eachSelected(fn) {
    this.selected.forEach((key) => {
      if (key.includes(":")) {
        const [pi, ci] = key.split(":").map(Number);
        if (this.parents[pi] && this.parents[pi].children[ci]) fn(this.parents[pi].children[ci], true);
      } else {
        const pi = Number(key);
        if (this.parents[pi]) fn(this.parents[pi], false);
      }
    });
  }

  showDoorAlts(child) {
    const total = child.seatCount;
    const rows = [{ acceso: child.door, count: child.doorMainCount }]
      .concat(child.doorAlts)
      .map((d) => `<tr><td>${esc(d.acceso)}</td><td style="text-align:right">${d.count.toLocaleString()}</td><td style="text-align:right">${((d.count / total) * 100).toFixed(1)}%</td></tr>`)
      .join("");
    this.modalTitle.textContent = `Accesos — ${child.name}`;
    this.modalBody.innerHTML = `
      <div class="modal-form">
        <p class="form-hint">El acceso de la sección es el <strong>dominante</strong>. Estos asientos llevan otro acceso (se setea a nivel asiento aparte):</p>
        <table class="sections-table"><thead><tr><th>Acceso</th><th style="text-align:right">Asientos</th><th style="text-align:right">%</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    this.openModal();
  }

  /* ═══════════════ TAB: COLORES ═══════════════ */

  renderColoresTab() {
    // Recolectar nombres de color en uso con conteo de secciones
    const usage = {};
    this.parents.forEach((p) => {
      if (p.colorName) usage[p.colorName] = (usage[p.colorName] || 0) + 1;
      p.children.forEach((c) => {
        const k = c.colorName || NO_COLOR_KEY;
        usage[k] = (usage[k] || 0) + 1;
      });
    });
    const keys = Object.keys(usage).sort((a, b) => usage[b] - usage[a]);

    const items = keys.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">🎨</div><div class="empty-state-text">Cargá un manifiesto para mapear sus colores</div></div>`
      : keys.map((k) => {
          const hex = this.colorMap[k] || FALLBACK_HEX;
          return `
          <div class="color-row">
            <span class="color-swatch color-swatch-lg" style="background:${hex}"></span>
            <div class="color-row-info">
              <span class="color-row-name">${esc(k)}</span>
              <span class="color-palette-count">${usage[k]} sección${usage[k] > 1 ? "es" : ""}</span>
            </div>
            <input type="color" class="color-input" data-color-key="${esc(k)}" value="${hex}">
            <input type="text" class="form-input hex-input" data-color-hex="${esc(k)}" value="${hex}" maxlength="7">
          </div>`;
        }).join("");

    this.tabContent.innerHTML = `
      <div class="tab-panel active">
        <div class="form-card">
          <div class="form-card-title">Mapeo de colores (señalización → hex)</div>
          <p class="form-hint">Cada color del manifiesto se aplica a todas sus secciones. Editá el hex y se actualiza el JSON.</p>
          <div class="color-list">${items}</div>
        </div>
      </div>`;

    this.tabContent.querySelectorAll(".color-input").forEach((inp) => {
      inp.addEventListener("input", () => this.setColor(inp.dataset.colorKey, inp.value));
    });
    this.tabContent.querySelectorAll(".hex-input").forEach((inp) => {
      inp.addEventListener("change", () => {
        let v = inp.value.trim();
        if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
          if (!v.startsWith("#")) v = "#" + v;
          this.setColor(inp.dataset.colorHex, v.toUpperCase());
        } else {
          this.toast("Hex inválido (usá #RRGGBB)", "error");
          inp.value = this.colorMap[inp.dataset.colorHex] || FALLBACK_HEX;
        }
      });
    });
  }

  setColor(key, hex) {
    this.colorMap[key] = hex;
    this.save();
    this.renderColoresTab();
  }

  /* ═══════════════ TAB: CONFIG ═══════════════ */

  renderConfigTab() {
    this.tabContent.innerHTML = `
      <div class="tab-panel active">
        <div class="form-card">
          <div class="form-card-title">Configuración del Layout</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Código del layout</label>
              <input type="text" class="form-input" id="cfgCode" value="${esc(this.config.code)}" placeholder="BAN_GENERAL">
            </div>
            <div class="form-group">
              <label class="form-label">Nombre del venue</label>
              <input type="text" class="form-input" id="cfgName" value="${esc(this.config.name)}" placeholder="Estadio BAN">
            </div>
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">maxCapacityByFan</label>
              <input type="number" class="form-input" id="cfgMaxCap" value="${this.config.maxCapacityByFan}" min="1" max="99">
            </div>
          </div>
        </div>
      </div>`;
    const bind = (id, field, num) => {
      const el = document.getElementById(id);
      el.addEventListener("input", () => {
        this.config[field] = num ? Number(el.value) || 1 : el.value;
        this.save();
      });
    };
    bind("cfgCode", "code");
    bind("cfgName", "name");
    bind("cfgMaxCap", "maxCapacityByFan", true);
  }

  /* ═══════════════ TAB: EXPORTAR ═══════════════ */

  renderExportTab() {
    if (this.parents.length === 0) {
      this.tabContent.innerHTML = `<div class="tab-panel active"><div class="empty-state"><div class="empty-state-icon">🧾</div><div class="empty-state-text">No hay nada que exportar todavía</div></div></div>`;
      return;
    }
    const json = this.generateJSON();
    const str = JSON.stringify(json, null, 2);
    const stats = this.getStats();
    const csv = this.generateCSVExport();
    const csvRows = this.getExportRows().length;
    const totalSeats = (stats.capJson + stats.seatsNumbered).toLocaleString();

    this.tabContent.innerHTML = `
      <div class="tab-panel active">
        <div class="export-report-card">
          <div class="export-report-info">
            <span class="export-report-title">📄 Reporte PDF</span>
            <span class="export-report-sub">Documento con diseño: indicadores de aforo y todas las secciones con sus sectores. Abre el diálogo de impresión → "Guardar como PDF".</span>
          </div>
          <button class="btn btn-primary btn-md" id="reportPdf">🖨️ Generar reporte</button>
        </div>

        <div class="json-output-wrapper">
          <div class="json-output-header">
            <span class="json-output-label">Layout JSON — Fanki</span>
            <div class="output-header-actions">
              <span class="json-output-stats">${stats.parents} padres · ${stats.children} sec · ${stats.capJson.toLocaleString()} cap</span>
              <button class="btn btn-secondary btn-sm" id="copyJson">📋 Copiar</button>
              <button class="btn btn-primary btn-sm" id="downloadJson">⬇️ Descargar</button>
            </div>
          </div>
          <pre class="json-output-pre"><code>${this.highlightJSON(esc(str))}</code></pre>
        </div>

        <div class="json-output-wrapper export-csv-wrapper">
          <div class="json-output-header">
            <span class="json-output-label">CSV — Secciones &amp; Sectores (para tabla dinámica)</span>
            <div class="output-header-actions">
              <span class="json-output-stats">${csvRows} filas · ${totalSeats} asientos</span>
              <button class="btn btn-secondary btn-sm" id="copyCsv">📋 Copiar</button>
              <button class="btn btn-primary btn-sm" id="downloadCsv">⬇️ Descargar</button>
            </div>
          </div>
          <pre class="json-output-pre csv-output-pre"><code>${esc(csv)}</code></pre>
        </div>
      </div>`;

    document.getElementById("copyJson").addEventListener("click", () => {
      navigator.clipboard.writeText(str).then(() => this.toast("JSON copiado"));
    });
    document.getElementById("downloadJson").addEventListener("click", () => this.downloadJSON(str));
    document.getElementById("copyCsv").addEventListener("click", () => {
      navigator.clipboard.writeText(csv).then(() => this.toast("CSV copiado"));
    });
    document.getElementById("downloadCsv").addEventListener("click", () => this.downloadCSV(csv));
    document.getElementById("reportPdf").addEventListener("click", () => this.exportReportPDF());
  }

  /* ── Reporte PDF (print → guardar como PDF) ── */

  exportReportPDF() {
    const html = this.buildReportHTML();
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    const win = iframe.contentWindow;
    const print = () => {
      try { win.focus(); win.print(); } catch (e) { /* ignore */ }
      setTimeout(() => iframe.remove(), 1500);
    };
    if (win.document.fonts && win.document.fonts.ready) {
      win.document.fonts.ready.then(() => setTimeout(print, 150));
      setTimeout(print, 1500); // fallback si fonts.ready no resuelve
    } else {
      setTimeout(print, 500);
    }
  }

  buildReportHTML() {
    const stats = this.getStats();
    const total = stats.capJson + stats.seatsNumbered;
    const layoutName = this.config.name || this.config.code || "Layout";
    const venue = this.config.code && this.config.name ? this.config.code : "";

    const sectionsHTML = this.parents.map((p) => {
      const hex = this.resolveParentColor(p);
      const childCount = p.children.length;
      const cap = childCount
        ? p.children.reduce((s, c) => s + (c.seatCount || 0), 0)
        : (p.seatCount || 0);
      const meta = `${childCount ? `${childCount} sectores` : "sección directa"} · ${cap.toLocaleString()} asientos`;

      const list = childCount
        ? p.children.map((c) => ({ name: c.name, code: c.code, numbered: c.numbered, qty: c.seatCount || 0, door: c.door || "" }))
        : [{ name: p.name, code: p.code, numbered: !!p.numbered, qty: p.seatCount || 0, door: p.door || "" }];

      const rowsHTML = list.map((r) => `
        <tr>
          <td>${esc(r.name)}</td>
          <td class="rp-code">${esc(r.code)}</td>
          <td class="num">${r.numbered ? `<span class="b-si">Sí</span>` : `<span class="b-no">No</span>`}</td>
          <td class="qty">${r.qty.toLocaleString()}</td>
          <td>${esc(r.door || "—")}</td>
        </tr>`).join("");

      return `
        <div class="rp-section" style="--sec-color:${esc(hex)}">
          <div class="rp-sec-head">
            <span class="rp-sec-name">${esc(p.name)}</span>
            <span class="rp-sec-code">${esc(p.code)}</span>
            <span class="rp-sec-meta">${meta}</span>
          </div>
          <table class="rp-table">
            <thead>
              <tr>
                <th>Nombre</th><th>Código</th><th class="num">Numerado</th><th class="qty">Cantidad</th><th>Acceso</th>
              </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
          </table>
        </div>`;
    }).join("");

    const styles = `
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Outfit', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; color: #0f172a; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rp-head { border-bottom: 3px solid #06b6d4; padding-bottom: 8px; margin-bottom: 16px; break-after: avoid; }
      .rp-head h1 { font-size: 22px; margin: 0; letter-spacing: -0.02em; }
      .rp-venue { color: #64748b; font-size: 12px; margin-top: 3px; }
      .rp-kpis { display: flex; gap: 10px; margin-bottom: 18px; break-inside: avoid; }
      .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; }
      .kpi-num { font-size: 20px; font-weight: 700; color: #06b6d4; line-height: 1.1; }
      .kpi-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-top: 2px; }
      .kpi-wide { flex: 1; display: flex; flex-direction: column; justify-content: center; }
      .kpi-aforo { font-size: 12px; margin-top: 4px; }
      .kpi-aforo .seg { color: #475569; }
      .kpi-aforo .sep { color: #cbd5e1; margin: 0 6px; }
      .kpi-aforo strong { color: #0f172a; }
      .rp-section { margin-bottom: 14px; border-left: 4px solid var(--sec-color, #cbd5e1); padding-left: 11px; }
      .rp-sec-head { display: flex; align-items: baseline; gap: 9px; padding: 3px 0 5px; break-after: avoid; break-inside: avoid; }
      .rp-sec-name { font-weight: 700; font-size: 13px; }
      .rp-sec-code { font-family: 'SF Mono', ui-monospace, monospace; font-size: 10.5px; color: #0891b2; }
      .rp-sec-meta { margin-left: auto; font-size: 9.5px; color: #94a3b8; }
      .rp-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
      .rp-table thead { display: table-header-group; }
      .rp-table th { text-align: left; background: #f1f5f9; color: #475569; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.04em; padding: 3px 7px; border-bottom: 1px solid #e2e8f0; }
      .rp-table td { padding: 3px 7px; border-bottom: 1px solid #f1f5f9; }
      .rp-table tr { break-inside: avoid; }
      .rp-table .num { text-align: center; }
      .rp-table .qty { text-align: right; font-variant-numeric: tabular-nums; }
      .rp-code { font-family: 'SF Mono', ui-monospace, monospace; color: #475569; }
      .b-si { color: #0891b2; font-weight: 600; }
      .b-no { color: #b45309; font-weight: 600; }
      .rp-foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; text-align: center; }
    `;

    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>${esc(layoutName)} — Reporte</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
<style>${styles}</style></head>
<body>
  <header class="rp-head">
    <h1>${esc(layoutName)}</h1>
    ${venue ? `<div class="rp-venue">${esc(venue)}</div>` : ""}
  </header>
  <section class="rp-kpis">
    <div class="kpi"><div class="kpi-num">${stats.parents}</div><div class="kpi-lbl">Secciones</div></div>
    <div class="kpi"><div class="kpi-num">${stats.children.toLocaleString()}</div><div class="kpi-lbl">Sectores</div></div>
    <div class="kpi kpi-wide">
      <div class="kpi-lbl">Aforo</div>
      <div class="kpi-aforo"><span class="seg">${stats.capJson.toLocaleString()} sin numerar</span><span class="sep">·</span><span class="seg">${stats.seatsNumbered.toLocaleString()} numerados</span><span class="sep">·</span><strong>Total: ${total.toLocaleString()}</strong></div>
    </div>
  </section>
  <main class="rp-sections">${sectionsHTML}</main>
  <footer class="rp-foot">Generado con Layout Interpreter · Fanki</footer>
</body></html>`;
  }

  // Filas para export: una por hija (repitiendo la sección padre). Padre sin hijas = una fila propia.
  getExportRows() {
    const rows = [];
    this.parents.forEach((p) => {
      if (p.children.length === 0) {
        rows.push({
          secName: p.name, secCode: p.code,
          secrName: "", secrCode: "",
          numbered: !!p.numbered, cantidad: p.seatCount || 0, door: p.door || "",
        });
      } else {
        p.children.forEach((c) => {
          rows.push({
            secName: p.name, secCode: p.code,
            secrName: c.name, secrCode: c.code,
            numbered: !!c.numbered, cantidad: c.seatCount || 0, door: c.door || "",
          });
        });
      }
    });
    return rows;
  }

  generateCSVExport() {
    const headers = ["Nombre Seccion", "Codigo Seccion", "Nombre Sector", "Codigo Sector", "Numerado", "Cantidad", "Acceso"];
    const lines = [headers.map((h) => this.csvCell(h)).join(",")];
    this.getExportRows().forEach((r) => {
      lines.push([
        this.csvCell(r.secName),
        this.csvCell(r.secCode),
        this.csvCell(r.secrName),
        this.csvCell(r.secrCode),
        r.numbered ? "Sí" : "No",
        r.cantidad,
        this.csvCell(r.door),
      ].join(","));
    });
    return lines.join("\n");
  }

  csvCell(value) {
    const s = String(value == null ? "" : value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  downloadCSV(str) {
    const name = (this.config.code || this.config.name || "layout") + "_secciones";
    const filename = `${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`;
    const blob = new Blob(["﻿" + str], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    this.toast("CSV descargado");
  }

  generateJSON() {
    const out = {};
    if (this.config.code) out.code = this.config.code;
    if (this.config.name) out.name = this.config.name;

    out.sections = this.parents.map((p) => {
      const sec = {
        code: p.code,
        name: p.name,
        type: p.type || "GRANDSTAND",
        color: this.resolveParentColor(p),
        disabled: !!p.disabled,
        exclusive: !!p.exclusive,
        visibilityScope: p.visibilityScope || "ALL",
        sections: p.children.map((c) => {
          const child = {
            code: `${p.code}/${c.code}`,
            name: c.name,
            type: c.type || p.type || "GRANDSTAND",
            color: this.colorMap[c.colorName || NO_COLOR_KEY] || FALLBACK_HEX,
            disabled: !!c.disabled,
            exclusive: !!c.exclusive,
            visibilityScope: c.visibilityScope || p.visibilityScope || "ALL",
          };
          // Capacity SOLO para sin numerar; las numeradas van por grilla aparte
          if (!c.numbered) child.capacity = c.capacity;
          if (c.door) child.door = c.door;
          child.unnumbered = !c.numbered;
          child.reseleable = !!c.reseleable;
          return child;
        }),
        unnumbered: p.children.some((c) => !c.numbered),
        reseleable: !!p.reseleable,
      };
      return sec;
    });

    out.maxCapacityByFan = this.config.maxCapacityByFan;
    return out;
  }

  resolveParentColor(p) {
    // Si el padre trae su propio color (formato Fanki), lo usamos
    if (p.colorName) return this.colorMap[p.colorName] || p.colorName || FALLBACK_HEX;
    // Si no, color dominante de sus hijas (por nombre de señalización, formato BAN)
    const counts = {};
    p.children.forEach((c) => {
      const k = c.colorName || NO_COLOR_KEY;
      counts[k] = (counts[k] || 0) + 1;
    });
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return this.colorMap[top] || FALLBACK_HEX;
  }

  downloadJSON(str) {
    const name = this.config.code || this.config.name || "layout_ban";
    const filename = `${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    const blob = new Blob([str], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    this.toast("JSON descargado");
  }

  highlightJSON(json) {
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (m) => {
        let cls = "json-number";
        if (/^"/.test(m)) cls = /:$/.test(m) ? "json-key" : "json-string";
        else if (/true|false/.test(m)) cls = "json-bool";
        else if (/null/.test(m)) cls = "json-null";
        return `<span class="${cls}">${m}</span>`;
      }
    );
  }

  /* ═══════════════ TAB: COMPARAR LAYOUT ═══════════════ */

  renderCompareLayoutTab() {
    if (this.parents.length === 0) {
      this.tabContent.innerHTML = `<div class="tab-panel active"><div class="empty-state"><div class="empty-state-icon">🔀</div><div class="empty-state-text">Primero cargá un manifiesto en "Secciones"</div><div class="empty-state-hint">Necesitamos el layout actual para comparar contra el nuevo</div></div></div>`;
      return;
    }

    const inputZone = `
      <div class="import-grid import-grid-single">
        <div class="csv-zone" id="cmpZone">
          <input type="file" accept=".json,application/json" id="cmpFile">
          <div class="csv-zone-content">
            <div class="csv-zone-icon">🧩</div>
            <div class="csv-zone-title">Cargá el Layout JSON nuevo (formato Fanki) o hacé click</div>
            <div class="csv-zone-hint">Se compara contra el manifiesto cargado: Numerado, Capacity y Acceso</div>
            <div class="csv-zone-hint csv-zone-hint-sub">${this.cmpRight ? `Cargado: <strong>${esc(this.cmpRight.name || this.cmpRight.code || "layout nuevo")}</strong> · ${this.cmpRight.parents.length} padres` : "Para pegar el JSON usá el botón."}</div>
          </div>
          <button class="btn btn-secondary btn-sm zone-inline-btn" id="openCmpPaste" type="button">Pegar JSON</button>
        </div>
      </div>`;

    let body = "";
    if (this.cmpRight) {
      const ind = this.getCompareCounts();
      body = `
        <div class="cmp-indicator">
          <div class="cmp-ind-side">
            <span class="cmp-ind-label">📄 Manifiesto sin matchear</span>
            <span class="cmp-ind-vals"><strong class="${ind.leftParents ? "cmp-warn" : "cmp-ok"}">${ind.leftParents}</strong> padres · <strong class="${ind.leftChildren ? "cmp-warn" : "cmp-ok"}">${ind.leftChildren}</strong> hijas</span>
          </div>
          <div class="cmp-ind-side">
            <span class="cmp-ind-label">🧩 Layout nuevo sin matchear</span>
            <span class="cmp-ind-vals"><strong class="${ind.rightParents ? "cmp-warn" : "cmp-ok"}">${ind.rightParents}</strong> padres · <strong class="${ind.rightChildren ? "cmp-warn" : "cmp-ok"}">${ind.rightChildren}</strong> hijas</span>
          </div>
          <button class="btn btn-secondary btn-sm" id="cmpRematch">🔁 Re-matchear auto</button>
        </div>
        ${this.renderCompareTable()}`;
    }

    this.tabContent.innerHTML = `<div class="tab-panel active">${inputZone}${body}</div>`;
    this.bindCompareTab();
  }

  renderCompareTable() {
    const rightParents = this.cmpRight.parents;
    const parentOpts = (selRi) =>
      `<option value="">— sin match —</option>` +
      rightParents.map((rp, ri) => `<option value="${ri}" ${selRi === ri ? "selected" : ""}>${esc(rp.code)}</option>`).join("");

    const rows = this.parents.map((p, li) => {
      const ri = this.matchParent[li];
      const matchedRi = ri == null ? null : Number(ri);
      const isOpen = this.cmpExpanded.has(li);
      const childDiffs = this.countParentChildDiffs(li);

      const parentRow = `
        <tr class="parent-row ${isOpen ? "expanded" : ""}">
          <td class="col-exp"><button class="sub-toggle" data-cmp-toggle="${li}" aria-label="Desplegar">${CHEVRON_SVG}</button></td>
          <td class="cmp-name"><strong>${esc(p.code)}</strong><span class="cmp-subname">${esc(p.name)}</span></td>
          <td><select class="form-select cmp-match-parent" data-li="${li}">${parentOpts(matchedRi)}</select></td>
          <td class="cmp-cell" colspan="3">${this.renderParentSummary(li, matchedRi, childDiffs)}</td>
        </tr>`;

      let childRows = "";
      if (isOpen) {
        childRows = p.children.map((c, ci) => this.renderCompareChildRow(li, ci, c, matchedRi)).join("");
      }
      return parentRow + childRows;
    }).join("");

    return `
      <div class="sections-table-wrapper">
        <table class="sections-table cmp-table">
          <thead>
            <tr>
              <th class="col-exp"></th>
              <th>Sección (manifiesto)</th>
              <th>Match (layout nuevo)</th>
              <th>Numerado</th>
              <th>Capacity</th>
              <th>Acceso</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  renderParentSummary(li, ri, diffs) {
    const parts = [];
    if (ri == null) parts.push(`<span class="badge badge-muted">padre sin match</span>`);
    if (diffs.total > 0) {
      if (diffs.diff > 0) parts.push(`<span class="badge badge-amber">${diffs.diff} con cambios</span>`);
      if (diffs.unmatched > 0) parts.push(`<span class="badge badge-red">${diffs.unmatched} sin match</span>`);
      if (diffs.diff === 0 && diffs.unmatched === 0) parts.push(`<span class="badge badge-green">${diffs.total} OK</span>`);
    }
    return parts.join(" ") || `<span class="cmp-subname">—</span>`;
  }

  renderCompareChildRow(li, ci, c, parentRi) {
    const key = `${li}:${ci}`;
    const rightRef = this.matchChild[key]; // "ri:rci"
    let right = null;
    if (rightRef != null) {
      const [rri, rci] = rightRef.split(":").map(Number);
      if (this.cmpRight.parents[rri] && this.cmpRight.parents[rri].children[rci]) {
        right = this.cmpRight.parents[rri].children[rci];
      }
    }

    // Dropdown de hijas: primero las del padre matcheado, luego TODAS las demás (puede migrar de padre)
    const childOpts = this.buildChildOptions(this.cmpRight.parents, parentRi, rightRef, (rc) => esc(rc.code));

    const L = this.leftCmpVals(c);
    const R = right ? this.rightCmpVals(right) : null;

    return `
      <tr class="child-row">
        <td class="col-exp"></td>
        <td class="cmp-name cmp-child-name">${esc(c.code)}</td>
        <td>
          <select class="form-select cmp-match-child" data-key="${key}">${childOpts}</select>
        </td>
        ${this.renderCmpCell(L.numberedLabel, R && R.numberedLabel, R && L.numbered !== R.numbered)}
        ${this.renderCmpCell(L.capLabel, R && R.capLabel, R && L.cap !== R.cap)}
        ${this.renderCmpCell(L.doorLabel, R && R.doorLabel, R && this.normDoor(L.door) !== this.normDoor(R.door))}
      </tr>`;
  }

  // Opciones de match para una hija: grupo del padre matcheado primero, luego todos los demás padres.
  // Permite elegir cualquier sub-sección (puede haber migrado de padre entre layouts).
  buildChildOptions(rightParents, matchedParentRi, selectedRef, labelFn) {
    let html = `<option value="">— sin match —</option>`;
    const group = (rp, ri, tag) => {
      const opts = rp.children.map((rc, rci) => {
        const val = `${ri}:${rci}`;
        return `<option value="${val}" ${val === selectedRef ? "selected" : ""}>${labelFn(rc)}</option>`;
      }).join("");
      return `<optgroup label="${tag}${esc(rp.code)}">${opts}</optgroup>`;
    };
    const mri = matchedParentRi == null ? null : Number(matchedParentRi);
    if (mri != null && rightParents[mri]) {
      html += group(rightParents[mri], mri, "★ ");
    }
    rightParents.forEach((rp, ri) => {
      if (ri === mri) return;
      html += group(rp, ri, "");
    });
    return html;
  }

  renderCmpCell(leftLabel, rightLabel, isDiff) {
    if (rightLabel == null) {
      return `<td class="cmp-cell"><span class="cmp-l">${esc(leftLabel)}</span> <span class="cmp-arrow">→</span> <span class="cmp-r cmp-nomatch">—</span></td>`;
    }
    const cls = isDiff ? "cmp-diff" : "cmp-equal";
    return `<td class="cmp-cell cmp-${isDiff ? "row-diff" : "row-eq"}"><span class="cmp-l">${esc(leftLabel)}</span> <span class="cmp-arrow">→</span> <span class="cmp-r ${cls}">${esc(rightLabel)}</span></td>`;
  }

  leftCmpVals(c) {
    const cap = c.numbered ? null : c.capacity;
    return {
      numbered: c.numbered,
      numberedLabel: c.numbered ? "NUM" : "S/N",
      cap,
      capLabel: cap == null ? "—" : cap.toLocaleString(),
      door: c.door || "",
      doorLabel: c.door || "—",
    };
  }

  rightCmpVals(c) {
    const cap = c.numbered ? null : (c.capacity == null ? null : c.capacity);
    return {
      numbered: c.numbered,
      numberedLabel: c.numbered ? "NUM" : "S/N",
      cap,
      capLabel: cap == null ? "—" : cap.toLocaleString(),
      door: c.door || "",
      doorLabel: c.door || "—",
    };
  }

  normDoor(s) {
    return (s || "").trim().toUpperCase();
  }

  bindCompareTab() {
    const zone = document.getElementById("cmpZone");
    const fileInput = document.getElementById("cmpFile");
    if (fileInput) fileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) this.readCompareFile(e.target.files[0]);
    });
    if (zone) {
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        if (e.dataTransfer.files[0]) this.readCompareFile(e.dataTransfer.files[0]);
      });
    }
    const paste = document.getElementById("openCmpPaste");
    if (paste) paste.addEventListener("click", () => this.openComparePasteModal());

    const rem=document.getElementById("cmpRematch");
    if (rem) rem.addEventListener("click", () => { this.autoMatchLayout(); this.save(); this.renderCompareLayoutTab(); this.toast("Re-matcheado"); });

    this.tabContent.querySelectorAll("[data-cmp-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = Number(btn.dataset.cmpToggle);
        if (this.cmpExpanded.has(li)) this.cmpExpanded.delete(li);
        else this.cmpExpanded.add(li);
        this.renderCompareLayoutTab();
      });
    });

    this.tabContent.querySelectorAll(".cmp-match-parent").forEach((sel) => {
      sel.addEventListener("change", () => {
        const li = Number(sel.dataset.li);
        Object.keys(this.matchChild).forEach((k) => { if (k.startsWith(li + ":")) delete this.matchChild[k]; });
        if (sel.value === "") delete this.matchParent[li];
        else { this.matchParent[li] = Number(sel.value); this.autoMatchChildren(li, Number(sel.value)); }
        this.save();
        this.renderCompareLayoutTab();
      });
    });

    this.tabContent.querySelectorAll(".cmp-match-child").forEach((sel) => {
      sel.addEventListener("change", () => {
        const key = sel.dataset.key;
        if (sel.value === "") delete this.matchChild[key];
        else this.matchChild[key] = sel.value;
        this.save();
        this.renderCompareLayoutTab();
      });
    });
  }

  readCompareFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => this.loadCompareLayout(e.target.result);
    reader.readAsText(file);
  }

  openComparePasteModal() {
    this.modalTitle.textContent = "Pegar Layout JSON nuevo";
    this.modalBody.innerHTML = `
      <div class="modal-form">
        <div class="form-group">
          <label class="form-label">Layout JSON (formato Fanki)</label>
          <textarea class="form-input form-textarea form-textarea-code" id="cmpPasteInput" placeholder='{
  "code": "LAYOUT",
  "name": "Venue",
  "sections": []
}'></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" id="cancelCmpPaste">Cancelar</button>
          <button class="btn btn-primary btn-sm" id="confirmCmpPaste">Cargar y comparar</button>
        </div>
      </div>`;
    this.openModal();
    document.getElementById("cancelCmpPaste").addEventListener("click", () => this.closeModal());
    document.getElementById("confirmCmpPaste").addEventListener("click", () => {
      const text = document.getElementById("cmpPasteInput").value;
      this.closeModal();
      this.loadCompareLayout(text);
    });
  }

  loadCompareLayout(text) {
    try {
      const raw = JSON.parse(text);
      const sections = Array.isArray(raw.sections) ? raw.sections : [];
      if (sections.length === 0) return this.toast("El layout no tiene secciones", "error");

      const parents = sections.map((s) => ({
        code: this.lastSeg(s.code),
        fullCode: s.code || "",
        name: s.name || "",
        children: (Array.isArray(s.sections) ? s.sections : []).map((c) => ({
          code: this.lastSeg(c.code),
          fullCode: c.code || "",
          name: c.name || "",
          numbered: this.inferNumbered(c),
          capacity: c.capacity == null ? null : Number(c.capacity),
          door: c.door || "",
        })),
      }));

      this.cmpRight = { code: raw.code || "", name: raw.name || "", parents };
      this.autoMatchLayout();
      this.save();
      this.activeTab = "cmpLayout";
      this.render();
      this.toast(`Layout nuevo cargado: ${parents.length} padres`, "success");
    } catch (err) {
      this.toast("JSON inválido: " + err.message, "error");
    }
  }

  // code "PADRE/HIJA" -> "HIJA"; "PADRE" -> "PADRE"
  lastSeg(code) {
    const s = String(code || "");
    const i = s.lastIndexOf("/");
    return i >= 0 ? s.slice(i + 1) : s;
  }

  inferNumbered(c) {
    if (c.unnumbered === true) return false;
    if (c.unnumbered === false) return true;
    // sin campo: si trae capacity > 0 lo tomamos sin numerar, si no numerada
    if (c.capacity != null && Number(c.capacity) > 0) return false;
    return true;
  }

  /* ── Matching ── */

  autoMatchLayout() {
    this.matchParent = {};
    this.matchChild = {};
    if (!this.cmpRight) return;
    const rightP = this.cmpRight.parents;

    const pairs = [];
    this.parents.forEach((lp, li) => rightP.forEach((rp, ri) => {
      const s = this.codeSim(lp.code, rp.code);
      if (s >= 0.42) pairs.push([s, li, ri]);
    }));
    pairs.sort((a, b) => b[0] - a[0]);
    const usedL = new Set(), usedR = new Set();
    pairs.forEach(([s, li, ri]) => {
      if (usedL.has(li) || usedR.has(ri)) return;
      this.matchParent[li] = ri;
      usedL.add(li); usedR.add(ri);
    });

    Object.entries(this.matchParent).forEach(([li, ri]) => this.autoMatchChildren(Number(li), ri));
  }

  autoMatchChildren(li, ri) {
    const lc = this.parents[li].children;
    const rc = this.cmpRight.parents[ri].children;
    const pairs = [];
    lc.forEach((c, ci) => rc.forEach((r, rci) => {
      const s = this.codeSim(c.code, r.code);
      if (s >= 0.4) pairs.push([s, ci, rci]);
    }));
    pairs.sort((a, b) => b[0] - a[0]);
    const usedL = new Set(), usedR = new Set();
    pairs.forEach(([s, ci, rci]) => {
      if (usedL.has(ci) || usedR.has(rci)) return;
      this.matchChild[`${li}:${ci}`] = `${ri}:${rci}`;
      usedL.add(ci); usedR.add(rci);
    });
  }

  autoMatchGrids() {
    this.gMatchParent = {};
    this.gMatchChild = {};
    if (!this.gridRight) return;
    const rightP = this.gridRight.parents;
    const pairs = [];
    this.parents.forEach((lp, li) => {
      if (!lp.children.some((c) => c.numbered)) return; // sólo padres con secciones numeradas
      rightP.forEach((rp, ri) => {
        const s = this.codeSim(lp.code, rp.code);
        if (s >= 0.42) pairs.push([s, li, ri]);
      });
    });
    pairs.sort((a, b) => b[0] - a[0]);
    const usedL = new Set(), usedR = new Set();
    pairs.forEach(([s, li, ri]) => {
      if (usedL.has(li) || usedR.has(ri)) return;
      this.gMatchParent[li] = ri;
      usedL.add(li); usedR.add(ri);
    });
    Object.entries(this.gMatchParent).forEach(([li, ri]) => this.autoMatchGridChildren(Number(li), ri));
  }

  autoMatchGridChildren(li, ri) {
    const lc = this.parents[li].children;
    const rc = this.gridRight.parents[ri].children;
    const pairs = [];
    lc.forEach((c, ci) => {
      if (!c.numbered) return; // sólo numeradas tienen grid
      rc.forEach((r, rci) => {
        const s = this.codeSim(c.code, r.code);
        if (s >= 0.4) pairs.push([s, ci, rci]);
      });
    });
    pairs.sort((a, b) => b[0] - a[0]);
    const usedL = new Set(), usedR = new Set();
    pairs.forEach(([s, ci, rci]) => {
      if (usedL.has(ci) || usedR.has(rci)) return;
      this.gMatchChild[`${li}:${ci}`] = `${ri}:${rci}`;
      usedL.add(ci); usedR.add(rci);
    });
  }

  codeSim(a, b) {
    const na = this.normCode(a), nb = this.normCode(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    const lev = 1 - this.levenshtein(na, nb) / Math.max(na.length, nb.length);
    const ta = new Set(this.codeTokens(a)), tb = new Set(this.codeTokens(b));
    let inter = 0;
    ta.forEach((t) => { if (tb.has(t)) inter++; });
    const union = ta.size + tb.size - inter;
    const jac = union ? inter / union : 0;
    return Math.max(lev, jac);
  }

  normCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  codeTokens(s) { return String(s || "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean); }

  levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    let cur = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }

  /* ── Conteos / diffs ── */

  getCompareCounts() {
    const usedRP = new Set(Object.values(this.matchParent).map(Number));
    const usedRC = new Set(Object.values(this.matchChild));
    let leftParents = 0, leftChildren = 0;
    this.parents.forEach((p, li) => {
      if (this.matchParent[li] == null) leftParents++;
      p.children.forEach((c, ci) => { if (this.matchChild[`${li}:${ci}`] == null) leftChildren++; });
    });
    let rightParents = 0, rightChildren = 0;
    this.cmpRight.parents.forEach((rp, ri) => {
      if (!usedRP.has(ri)) rightParents++;
      rp.children.forEach((rc, rci) => { if (!usedRC.has(`${ri}:${rci}`)) rightChildren++; });
    });
    return { leftParents, leftChildren, rightParents, rightChildren };
  }

  countParentChildDiffs(li) {
    const p = this.parents[li];
    let total = p.children.length, diff = 0, unmatched = 0;
    p.children.forEach((c, ci) => {
      const ref = this.matchChild[`${li}:${ci}`];
      if (ref == null) { unmatched++; return; }
      const [rri, rci] = ref.split(":").map(Number);
      const r = this.cmpRight.parents[rri] && this.cmpRight.parents[rri].children[rci];
      if (!r) { unmatched++; return; }
      const L = this.leftCmpVals(c), R = this.rightCmpVals(r);
      if (L.numbered !== R.numbered || L.cap !== R.cap || this.normDoor(L.door) !== this.normDoor(R.door)) diff++;
    });
    return { total, diff, unmatched };
  }

  /* ═══════════════ TAB: COMPARAR GRIDS ═══════════════ */

  renderCompareGridsTab() {
    if (this.parents.length === 0) {
      this.tabContent.innerHTML = `<div class="tab-panel active"><div class="empty-state"><div class="empty-state-icon">🧮</div><div class="empty-state-text">Primero cargá un manifiesto en "Secciones"</div><div class="empty-state-hint">Comparamos las secciones numeradas del manifiesto contra los grids del ZIP</div></div></div>`;
      return;
    }

    const inputZone = `
      <div class="import-grid import-grid-single">
        <div class="csv-zone" id="gridZone">
          <input type="file" accept=".zip,application/zip" id="gridFile">
          <div class="csv-zone-content">
            <div class="csv-zone-icon">🗜️</div>
            <div class="csv-zone-title">Arrastrá el ZIP de grids o hacé click</div>
            <div class="csv-zone-hint">Cada CSV trae <code>sectionCode</code> y <code>seatCode</code>; contamos los asientos (ignorando NOT_SEAT)</div>
            <div class="csv-zone-hint csv-zone-hint-sub">${this.gridRight ? `Cargado: <strong>${esc(this.gridRight.name || "grids")}</strong> · ${this.gridRight.fileCount} archivos · ${this.gridRight.totalSeats.toLocaleString()} asientos` : "Sólo se compara la cantidad de asientos de las secciones numeradas."}</div>
          </div>
        </div>
      </div>`;

    let body = "";
    if (this.gridRight) {
      const ind = this.getGridCounts();
      body = `
        <div class="cmp-indicator">
          <div class="cmp-ind-side">
            <span class="cmp-ind-label">📄 Numeradas sin matchear (manifiesto)</span>
            <span class="cmp-ind-vals"><strong class="${ind.leftChildren ? "cmp-warn" : "cmp-ok"}">${ind.leftChildren}</strong> secciones</span>
          </div>
          <div class="cmp-ind-side">
            <span class="cmp-ind-label">🗜️ Grids sin matchear (ZIP)</span>
            <span class="cmp-ind-vals"><strong class="${ind.rightChildren ? "cmp-warn" : "cmp-ok"}">${ind.rightChildren}</strong> de ${this.gridRight.totalSections}</span>
          </div>
          <button class="btn btn-secondary btn-sm" id="gridRematch">🔁 Re-matchear auto</button>
        </div>
        ${this.renderGridTable()}`;
    }

    this.tabContent.innerHTML = `<div class="tab-panel active">${inputZone}${body}</div>`;
    this.bindGridTab();
  }

  renderGridTable() {
    const rightParents = this.gridRight.parents;
    const parentOpts = (selRi) =>
      `<option value="">— sin match —</option>` +
      rightParents.map((rp, ri) => `<option value="${ri}" ${selRi === ri ? "selected" : ""}>${esc(rp.code)}</option>`).join("");

    // Sólo padres con al menos una hija numerada
    const rows = this.parents.map((p, li) => {
      if (!p.children.some((c) => c.numbered)) return "";
      const ri = this.gMatchParent[li];
      const matchedRi = ri == null ? null : Number(ri);
      const isOpen = this.gExpanded.has(li);
      const sum = this.gridParentSummary(li, matchedRi);

      const parentRow = `
        <tr class="parent-row ${isOpen ? "expanded" : ""}">
          <td class="col-exp"><button class="sub-toggle" data-grid-toggle="${li}" aria-label="Desplegar">${CHEVRON_SVG}</button></td>
          <td class="cmp-name"><strong>${esc(p.code)}</strong><span class="cmp-subname">${esc(p.name)}</span></td>
          <td><select class="form-select grid-match-parent" data-li="${li}">${parentOpts(matchedRi)}</select></td>
          <td class="cmp-cell">${sum}</td>
        </tr>`;

      let childRows = "";
      if (isOpen) {
        childRows = p.children.map((c, ci) => (c.numbered ? this.renderGridChildRow(li, ci, c, matchedRi) : "")).join("");
      }
      return parentRow + childRows;
    }).join("");

    return `
      <div class="sections-table-wrapper">
        <table class="sections-table grid-table">
          <thead>
            <tr>
              <th class="col-exp"></th>
              <th>Sección numerada (manifiesto)</th>
              <th>Match (grid del ZIP)</th>
              <th>Cantidad de asientos</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  renderGridChildRow(li, ci, c, parentRi) {
    const key = `${li}:${ci}`;
    const rightRef = this.gMatchChild[key];
    let right = null;
    if (rightRef != null) {
      const [rri, rci] = rightRef.split(":").map(Number);
      if (this.gridRight.parents[rri] && this.gridRight.parents[rri].children[rci]) {
        right = this.gridRight.parents[rri].children[rci];
      }
    }
    // Primero las grids del padre matcheado, luego TODAS las demás (puede migrar de padre)
    const childOpts = this.buildChildOptions(this.gridRight.parents, parentRi, rightRef, (rc) => `${esc(rc.code)} (${rc.count})`);

    const lCount = c.seatCount;
    const rCount = right ? right.count : null;
    const diff = rCount != null && lCount !== rCount;
    const cell = rCount == null
      ? `<span class="cmp-l">${lCount.toLocaleString()}</span> <span class="cmp-arrow">→</span> <span class="cmp-r cmp-nomatch">—</span>`
      : `<span class="cmp-l">${lCount.toLocaleString()}</span> <span class="cmp-arrow">→</span> <span class="cmp-r ${diff ? "cmp-diff" : "cmp-equal"}">${rCount.toLocaleString()}</span>${diff ? ` <span class="cmp-delta">(${rCount > lCount ? "+" : ""}${(rCount - lCount).toLocaleString()})</span>` : ""}`;

    return `
      <tr class="child-row">
        <td class="col-exp"></td>
        <td class="cmp-name cmp-child-name">${esc(c.code)}</td>
        <td>
          <select class="form-select grid-match-child" data-key="${key}">${childOpts}</select>
        </td>
        <td class="cmp-cell">${cell}</td>
      </tr>`;
  }

  gridParentSummary(li, ri) {
    const p = this.parents[li];
    let total = 0, diff = 0, unmatched = 0;
    p.children.forEach((c, ci) => {
      if (!c.numbered) return;
      total++;
      const ref = this.gMatchChild[`${li}:${ci}`];
      if (ref == null) { unmatched++; return; }
      const [rri, rci] = ref.split(":").map(Number);
      const r = this.gridRight.parents[rri] && this.gridRight.parents[rri].children[rci];
      if (!r) { unmatched++; return; }
      if (r.count !== c.seatCount) diff++;
    });
    const parts = [];
    if (ri == null) parts.push(`<span class="badge badge-muted">padre sin match</span>`);
    if (diff > 0) parts.push(`<span class="badge badge-amber">${diff} con diferencia</span>`);
    if (unmatched > 0) parts.push(`<span class="badge badge-red">${unmatched} sin match</span>`);
    if (diff === 0 && unmatched === 0) parts.push(`<span class="badge badge-green">${total} OK</span>`);
    return parts.join(" ");
  }

  bindGridTab() {
    const zone = document.getElementById("gridZone");
    const fileInput = document.getElementById("gridFile");
    if (fileInput) fileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) this.readGridZip(e.target.files[0]);
    });
    if (zone) {
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        if (e.dataTransfer.files[0]) this.readGridZip(e.dataTransfer.files[0]);
      });
    }
    const rem = document.getElementById("gridRematch");
    if (rem) rem.addEventListener("click", () => { this.autoMatchGrids(); this.save(); this.renderCompareGridsTab(); this.toast("Re-matcheado"); });

    this.tabContent.querySelectorAll("[data-grid-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = Number(btn.dataset.gridToggle);
        if (this.gExpanded.has(li)) this.gExpanded.delete(li);
        else this.gExpanded.add(li);
        this.renderCompareGridsTab();
      });
    });
    this.tabContent.querySelectorAll(".grid-match-parent").forEach((sel) => {
      sel.addEventListener("change", () => {
        const li = Number(sel.dataset.li);
        Object.keys(this.gMatchChild).forEach((k) => { if (k.startsWith(li + ":")) delete this.gMatchChild[k]; });
        if (sel.value === "") delete this.gMatchParent[li];
        else { this.gMatchParent[li] = Number(sel.value); this.autoMatchGridChildren(li, Number(sel.value)); }
        this.save();
        this.renderCompareGridsTab();
      });
    });
    this.tabContent.querySelectorAll(".grid-match-child").forEach((sel) => {
      sel.addEventListener("change", () => {
        const key = sel.dataset.key;
        if (sel.value === "") delete this.gMatchChild[key];
        else this.gMatchChild[key] = sel.value;
        this.save();
        this.renderCompareGridsTab();
      });
    });
  }

  async readGridZip(file) {
    if (typeof JSZip === "undefined") return this.toast("JSZip no cargó (sin conexión?)", "error");
    this.toast("Descomprimiendo y contando asientos…");
    try {
      const zip = await JSZip.loadAsync(file);
      const entries = [];
      zip.forEach((path, entry) => {
        if (!entry.dir && /\.csv$/i.test(path)) entries.push(entry);
      });
      if (entries.length === 0) return this.toast("El ZIP no tiene CSVs", "error");

      const byParent = new Map(); // parentCode -> Map(childCode -> {fullCode, count})
      let totalSeats = 0, totalSections = 0;
      for (const entry of entries) {
        const text = await entry.async("string");
        const res = this.parseGridCsv(text);
        if (!res) continue;
        const { fullCode, count } = res;
        const pCode = this.gridParentCode(fullCode);
        const cCode = this.lastSeg(fullCode);
        if (!byParent.has(pCode)) byParent.set(pCode, new Map());
        const cm = byParent.get(pCode);
        // si se repite la sección en varios archivos, sumamos
        if (cm.has(cCode)) cm.get(cCode).count += count;
        else { cm.set(cCode, { code: cCode, fullCode, count }); totalSections++; }
        totalSeats += count;
      }

      const parents = [];
      for (const [pCode, cm] of byParent) {
        parents.push({ code: pCode, children: Array.from(cm.values()) });
      }

      this.gridRight = {
        name: file.name.replace(/\.zip$/i, ""),
        fileCount: entries.length,
        totalSeats,
        totalSections,
        parents,
      };
      this.autoMatchGrids();
      this.save();
      this.activeTab = "cmpGrids";
      this.render();
      this.toast(`Grids: ${totalSections} secciones · ${totalSeats.toLocaleString()} asientos`, "success");
    } catch (err) {
      this.toast("Error al leer el ZIP: " + err.message, "error");
    }
  }

  // Parse de un CSV de grid: devuelve { fullCode, count } o null
  parseGridCsv(text) {
    const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const sep = this.detectSeparator(lines[0]);
    const headers = this.parseLine(lines[0], sep).map((h) => h.trim().toLowerCase());
    let secIdx = headers.indexOf("sectioncode");
    let seatIdx = headers.indexOf("seatcode");
    if (seatIdx < 0) seatIdx = headers.indexOf("setcode"); // typo en algunos archivos
    if (secIdx < 0) secIdx = 1;   // fallback por posición
    if (seatIdx < 0) seatIdx = 2;

    let fullCode = "";
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const v = this.parseLine(lines[i], sep);
      if (!fullCode && v[secIdx]) fullCode = v[secIdx].trim();
      const seat = (v[seatIdx] || "").trim();
      if (seat && seat.toUpperCase() !== "NOT_SEAT") count++;
    }
    if (!fullCode) return null;
    return { fullCode, count };
  }

  // Código de padre desde el fullCode del grid (todo lo previo al último "/")
  gridParentCode(fullCode) {
    const s = String(fullCode || "");
    const i = s.lastIndexOf("/");
    return i >= 0 ? s.slice(0, i) : s;
  }

  getGridCounts() {
    const usedRC = new Set(Object.values(this.gMatchChild));
    let leftChildren = 0;
    this.parents.forEach((p, li) => p.children.forEach((c, ci) => {
      if (c.numbered && this.gMatchChild[`${li}:${ci}`] == null) leftChildren++;
    }));
    let rightChildren = 0;
    this.gridRight.parents.forEach((rp, ri) => rp.children.forEach((rc, rci) => {
      if (!usedRC.has(`${ri}:${rci}`)) rightChildren++;
    }));
    return { leftChildren, rightChildren };
  }

  /* ═══════════════ IMPORT / INTÉRPRETE ═══════════════ */

  bindCSVZone() {
    if (this.format === "FANKI") return this.bindJsonZone();
    const zone = document.getElementById("csvZone");
    const fileInput = document.getElementById("csvFile");
    if (fileInput) fileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) this.readFile(e.target.files[0]);
    });
    if (zone) {
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        if (e.dataTransfer.files[0]) this.readFile(e.dataTransfer.files[0]);
      });
    }
    const paste = document.getElementById("openPaste");
    if (paste) paste.addEventListener("click", () => this.openPasteModal());
  }

  bindJsonZone() {
    const zone = document.getElementById("jsonZone");
    const fileInput = document.getElementById("jsonFile");
    if (fileInput) fileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) this.readJsonFile(e.target.files[0]);
    });
    if (zone) {
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        if (e.dataTransfer.files[0]) this.readJsonFile(e.dataTransfer.files[0]);
      });
    }
    const paste = document.getElementById("openJsonPaste");
    if (paste) paste.addEventListener("click", () => this.openFankiPasteModal());

    // Caja de grids para completar conteos (sólo Fanki, con layout cargado)
    const gz = document.getElementById("gridApplyZone");
    const gf = document.getElementById("gridApplyFile");
    if (gf && this.parents.length > 0) {
      gf.addEventListener("change", (e) => { if (e.target.files[0]) this.applyGridsToLayout(e.target.files[0]); });
      if (gz) {
        gz.addEventListener("dragover", (e) => { e.preventDefault(); gz.classList.add("drag-over"); });
        gz.addEventListener("dragleave", () => gz.classList.remove("drag-over"));
        gz.addEventListener("drop", (e) => {
          e.preventDefault();
          gz.classList.remove("drag-over");
          if (e.dataTransfer.files[0]) this.applyGridsToLayout(e.dataTransfer.files[0]);
        });
      }
    }
  }

  // Sube un ZIP de grids y adjudica las cantidades a las secciones numeradas del layout cargado.
  // Match por código completo exacto (PADRE/HIJA), asumiendo correspondencia 1:1.
  async applyGridsToLayout(file) {
    if (typeof JSZip === "undefined") return this.toast("JSZip no cargó (sin conexión?)", "error");
    this.toast("Descomprimiendo y completando asientos…");
    try {
      const zip = await JSZip.loadAsync(file);
      const entries = [];
      zip.forEach((path, entry) => { if (!entry.dir && /\.csv$/i.test(path)) entries.push(entry); });
      if (entries.length === 0) return this.toast("El ZIP no tiene CSVs", "error");

      // Mapa: código completo normalizado -> cantidad; y geometría para dibujar
      const gridMap = new Map();
      this.gridGeometry = new Map();
      for (const entry of entries) {
        const text = await entry.async("string");
        const res = this.parseGridGeometry(text);
        if (!res) continue;
        const k = this.normFull(res.fullCode);
        gridMap.set(k, (gridMap.get(k) || 0) + res.count);
        if (this.gridGeometry.has(k)) {
          const g = this.gridGeometry.get(k);
          g.rows.push(...res.rows);
          g.count += res.count;
        } else {
          this.gridGeometry.set(k, { rows: res.rows, count: res.count, fullCode: res.fullCode });
        }
      }

      let filled = 0, notFound = 0;
      const used = new Set();
      this.parents.forEach((p) => p.children.forEach((c) => {
        if (!c.numbered) return;
        const k = this.normFull(`${p.code}/${c.code}`);
        if (gridMap.has(k)) {
          c.seatCount = gridMap.get(k);
          used.add(k);
          filled++;
        } else {
          notFound++;
        }
      }));
      const unused = [...gridMap.keys()].filter((k) => !used.has(k)).length;

      this.gridsApplied = { fileName: file.name, filled, notFound, unused };
      this.save();
      this.render();
      this.toast(`Completadas ${filled} secciones${notFound ? ` · ${notFound} sin grid` : ""}`, "success");
    } catch (err) {
      this.toast("Error al leer el ZIP: " + err.message, "error");
    }
  }

  // Normaliza un código completo para match exacto: mayúsculas, conserva A-Z 0-9 _ /
  normFull(code) {
    return String(code || "").toUpperCase().replace(/[^A-Z0-9_/]/g, "");
  }

  // Parse de grid con geometría: agrupa por rowNumber (en orden), cada celda = seatCode o null (NOT_SEAT)
  parseGridGeometry(text) {
    const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const sep = this.detectSeparator(lines[0]);
    const headers = this.parseLine(lines[0], sep).map((h) => h.trim().toLowerCase());
    let secIdx = headers.indexOf("sectioncode");
    let seatIdx = headers.indexOf("seatcode");
    if (seatIdx < 0) seatIdx = headers.indexOf("setcode");
    let rowIdx = headers.indexOf("rownumber");
    if (secIdx < 0) secIdx = 1;
    if (seatIdx < 0) seatIdx = 2;
    if (rowIdx < 0) rowIdx = 0;

    let fullCode = "", count = 0;
    const rowMap = new Map(); // rowNumber -> array de celdas (seatCode | null)
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const v = this.parseLine(lines[i], sep);
      const sec = (v[secIdx] || "").trim();
      if (sec && !fullCode) fullCode = sec;
      const rn = (v[rowIdx] || "").trim();
      const seat = (v[seatIdx] || "").trim();
      const isSeat = seat && seat.toUpperCase() !== "NOT_SEAT";
      if (isSeat) count++;
      if (!rowMap.has(rn)) rowMap.set(rn, []);
      rowMap.get(rn).push(isSeat ? seat : null);
    }
    if (!fullCode) return null;
    return { fullCode, count, rows: [...rowMap.values()] };
  }

  // Color resuelto de la sección cuyo código completo (normalizado) coincide
  gridColorFor(key) {
    for (const p of this.parents) {
      for (const c of p.children) {
        if (this.normFull(`${p.code}/${c.code}`) === key) {
          return this.colorMap[c.colorName || NO_COLOR_KEY] || FALLBACK_HEX;
        }
      }
    }
    return null;
  }

  openGridModal(key) {
    const g = this.gridGeometry.get(key);
    if (!g) return this.toast("No hay grilla cargada para esta sección", "error");
    const color = this.gridColorFor(key) || "var(--accent)";
    const totalCols = g.rows.reduce((m, r) => Math.max(m, r.length), 0);

    const rowsHTML = g.rows.map((row) => {
      const firstSeat = row.find((cell) => cell) || "";
      const label = firstSeat.includes("-") ? firstSeat.split("-")[0] : "";
      const cells = row.map((cell) => cell
        ? `<span class="gseat" style="background:${esc(color)}" title="${esc(cell)}"></span>`
        : `<span class="gseat gseat-empty"></span>`).join("");
      return `<div class="grow"><span class="grow-label">${esc(label)}</span><div class="gcells">${cells}</div></div>`;
    }).join("");

    this.modalTitle.textContent = `Grilla — ${g.fullCode}`;
    this.modalBody.innerHTML = `
      <div class="grid-meta">${g.rows.length} filas · ${totalCols} columnas · <strong>${g.count.toLocaleString()}</strong> asientos · los huecos son NOT_SEAT</div>
      <div class="grid-draw">${rowsHTML}</div>`;
    if (this.modalBox) this.modalBox.classList.add("modal-wide");
    this.openModal();
  }

  readJsonFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => this.importFankiLayout(e.target.result);
    reader.readAsText(file);
  }

  openFankiPasteModal() {
    this.modalTitle.textContent = "Pegar Layout JSON (Fanki)";
    this.modalBody.innerHTML = `
      <div class="modal-form">
        <div class="form-group">
          <label class="form-label">Layout JSON (formato Fanki)</label>
          <textarea class="form-input form-textarea form-textarea-code" id="fankiPasteInput" placeholder='{
  "code": "LAYOUT",
  "name": "Venue",
  "sections": []
}'></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" id="cancelFankiPaste">Cancelar</button>
          <button class="btn btn-primary btn-sm" id="confirmFankiPaste">Cargar</button>
        </div>
      </div>`;
    this.openModal();
    document.getElementById("cancelFankiPaste").addEventListener("click", () => this.closeModal());
    document.getElementById("confirmFankiPaste").addEventListener("click", () => {
      const text = document.getElementById("fankiPasteInput").value;
      this.closeModal();
      this.importFankiLayout(text);
    });
  }

  importFankiLayout(text) {
    try {
      const raw = JSON.parse(text);
      const sections = Array.isArray(raw.sections) ? raw.sections : [];
      if (sections.length === 0) return this.toast("El layout no tiene secciones", "error");

      const parents = sections.map((s) => {
        const pHex = (s.color || "").toUpperCase();
        const subSections = Array.isArray(s.sections) ? s.sections : [];
        const parent = {
          name: s.name || this.lastSeg(s.code),
          code: this.lastSeg(s.code),
          type: s.type || "GRANDSTAND",
          visibilityScope: s.visibilityScope || "ALL",
          reseleable: !!s.reseleable,
          disabled: !!s.disabled,
          exclusive: !!s.exclusive,
          colorName: pHex || "",
          children: subSections.map((c) => {
            const numbered = this.inferNumbered(c);
            const cap = c.capacity == null ? null : Number(c.capacity);
            const hex = (c.color || "").toUpperCase();
            return {
              name: c.name || this.lastSeg(c.code),
              code: this.lastSeg(c.code),
              numbered,
              seatCount: cap != null ? cap : 0,
              capacity: cap != null ? cap : 0,
              door: c.door || "",
              doorMainCount: 0,
              doorAlts: [],
              colorName: hex || "",
              type: c.type || s.type || "GRANDSTAND",
              visibilityScope: c.visibilityScope || s.visibilityScope || "ALL",
              reseleable: !!c.reseleable,
              disabled: !!c.disabled,
              exclusive: !!c.exclusive,
            };
          }),
        };
        // Sección sin sub-secciones = sección con asientos directa: guardamos sus datos en el padre
        if (subSections.length === 0) {
          parent.numbered = this.inferNumbered(s);
          const cap = s.capacity == null ? null : Number(s.capacity);
          parent.capacity = cap != null ? cap : 0;
          parent.seatCount = cap != null ? cap : 0;
          parent.door = s.door || "";
        }
        return parent;
      });

      this.parents = parents;
      this.gridsApplied = null; // layout nuevo: hay que volver a aplicar grids
      this.gridGeometry = new Map();
      this.config.code = raw.code || this.config.code;
      this.config.name = raw.name || this.config.name;
      if (raw.maxCapacityByFan != null) this.config.maxCapacityByFan = Number(raw.maxCapacityByFan) || 3;
      this.ensureColorMap();
      this.expanded.clear();
      this.selected.clear();
      this.matchParent = {}; this.matchChild = {};
      this.gMatchParent = {}; this.gMatchChild = {};
      if (this.cmpRight) this.autoMatchLayout();
      if (this.gridRight) this.autoMatchGrids();
      this.save();
      this.activeTab = "secciones";
      this.render();

      const totalChildren = parents.reduce((s, p) => s + p.children.length, 0);
      this.toast(`Layout Fanki cargado: ${parents.length} padres · ${totalChildren} secciones`, "success");
    } catch (err) {
      this.toast("JSON inválido: " + err.message, "error");
    }
  }

  readFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => this.interpret(e.target.result);
    reader.readAsText(file);
  }

  openPasteModal() {
    this.modalTitle.textContent = "Pegar manifiesto BAN";
    this.modalBody.innerHTML = `
      <div class="modal-form">
        <div class="form-group">
          <label class="form-label">Pegá el contenido del CSV (con encabezados)</label>
          <textarea class="form-input form-textarea form-textarea-code" id="pasteInput" placeholder="SECCION,FILA,ASIENTO,LOCALIDAD,ACCESO,SEÑALIZACION BOLETO&#10;FSEAT1,1,1,FIELD SEATS,TUNEL 8,MOSTAZA"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" id="cancelPaste">Cancelar</button>
          <button class="btn btn-primary btn-sm" id="confirmPaste">Interpretar</button>
        </div>
      </div>`;
    this.openModal();
    document.getElementById("cancelPaste").addEventListener("click", () => this.closeModal());
    document.getElementById("confirmPaste").addEventListener("click", () => {
      const text = document.getElementById("pasteInput").value;
      this.closeModal();
      this.interpret(text);
    });
  }

  interpret(text) {
    try {
      const { headers, rows } = this.parseCSV(text);
      if (rows.length === 0) return this.toast("CSV vacío o sin datos", "error");

      const map = this.mapColumns(headers);
      const missing = ["seccion", "localidad", "fila"].filter((f) => map[f] == null);
      if (missing.length) {
        return this.toast(`Faltan columnas: ${missing.join(", ")}. Esperado formato BAN.`, "error");
      }

      // Agrupar por (LOCALIDAD, SECCION)
      const groups = new Map(); // localidad -> Map(seccion -> aggregate)
      for (const r of rows) {
        const loc = (r[map.localidad] || "").trim();
        const sec = (r[map.seccion] || "").trim();
        if (!loc && !sec) continue;
        const fila = (r[map.fila] || "").trim();
        const acceso = map.acceso != null ? (r[map.acceso] || "").trim() : "";
        const color = map.color != null ? (r[map.color] || "").trim() : "";

        if (!groups.has(loc)) groups.set(loc, new Map());
        const secMap = groups.get(loc);
        if (!secMap.has(sec)) secMap.set(sec, { recs: 0, numberedRecs: 0, acceso: {}, color: {} });
        const agg = secMap.get(sec);
        agg.recs++;
        if (this.isNumberedFila(fila)) agg.numberedRecs++;
        if (acceso) agg.acceso[acceso] = (agg.acceso[acceso] || 0) + 1;
        const ckey = color || NO_COLOR_KEY;
        agg.color[ckey] = (agg.color[ckey] || 0) + 1;
      }

      // Construir parents/children
      const usedParentCodes = new Set();
      const parents = [];
      for (const [loc, secMap] of groups) {
        const pCode = this.uniqueCode(this.autoCode(loc || "SECCION"), usedParentCodes);
        const usedChildCodes = new Set();
        const children = [];
        for (const [sec, agg] of secMap) {
          const numbered = agg.numberedRecs > 0;
          const door = this.dominant(agg.acceso);
          const doorMainCount = door ? agg.acceso[door] : 0;
          const doorAlts = Object.entries(agg.acceso)
            .filter(([a]) => a !== door)
            .map(([acceso, count]) => ({ acceso, count }))
            .sort((a, b) => b.count - a.count);
          const colorName = this.dominant(agg.color, NO_COLOR_KEY);
          const cCode = this.uniqueCode(DEFAULT_CHILD_PREFIX + this.autoCode(sec || "SEC"), usedChildCodes);
          children.push({
            name: sec,
            code: cCode,
            numbered,
            seatCount: agg.recs,
            capacity: agg.recs, // usado solo si !numbered
            door,
            doorMainCount,
            doorAlts,
            colorName: colorName === NO_COLOR_KEY ? "" : colorName,
            type: "GRANDSTAND",
            visibilityScope: "ALL",
            reseleable: false,
            disabled: false,
            exclusive: false,
          });
        }
        parents.push({
          name: loc,
          code: pCode,
          type: "GRANDSTAND",
          visibilityScope: "ALL",
          reseleable: false,
          disabled: false,
          exclusive: false,
          children,
        });
      }

      this.parents = parents;
      this.expanded.clear();
      this.selected.clear();
      this.ensureColorMap();
      // Los índices de match quedaron inválidos: reseteamos y re-matcheamos si hay datos nuevos
      this.matchParent = {};
      this.matchChild = {};
      this.gMatchParent = {};
      this.gMatchChild = {};
      this.gridGeometry = new Map();
      if (this.cmpRight) this.autoMatchLayout();
      if (this.gridRight) this.autoMatchGrids();
      this.save();
      this.activeTab = "secciones";
      this.render();

      const totalChildren = parents.reduce((s, p) => s + p.children.length, 0);
      this.toast(`Interpretado: ${parents.length} padres · ${totalChildren} secciones`, "success");
    } catch (err) {
      this.toast("Error al interpretar: " + err.message, "error");
    }
  }

  isNumberedFila(fila) {
    const f = (fila || "").trim();
    if (!f || f === "-") return false;
    return true; // número o letra cuenta como numerada
  }

  dominant(counts, fallback = "") {
    const keys = Object.keys(counts);
    if (keys.length === 0) return fallback;
    return keys.sort((a, b) => counts[b] - counts[a])[0];
  }

  ensureColorMap() {
    const seed = (name) => {
      const k = name || NO_COLOR_KEY;
      if (this.colorMap[k] == null) {
        // Si la "clave" ya es un hex (formato Fanki) la mapeamos a sí misma; si no, blanco
        this.colorMap[k] = /^#[0-9a-f]{6}$/i.test(k) ? k.toUpperCase() : FALLBACK_HEX;
      }
    };
    this.parents.forEach((p) => {
      if (p.colorName) seed(p.colorName);
      p.children.forEach((c) => seed(c.colorName));
    });
  }

  mapColumns(headers) {
    const norm = headers.map((h) => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ""));
    const map = {};
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      const idx = norm.findIndex((h) => aliases.some((a) => h === a.replace(/\s+/g, "")));
      map[field] = idx >= 0 ? headers[idx] : null;
    }
    return map;
  }

  parseCSV(text) {
    const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    const sep = this.detectSeparator(lines[0]);
    const headers = this.parseLine(lines[0], sep).map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseLine(lines[i], sep);
      if (values.every((v) => !v.trim())) continue;
      const row = {};
      headers.forEach((h, idx) => { row[h] = (values[idx] || "").trim(); });
      rows.push(row);
    }
    return { headers, rows };
  }

  parseLine(line, sep) {
    const result = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === sep && !inQ) { result.push(cur); cur = ""; }
      else cur += ch;
    }
    result.push(cur);
    return result;
  }

  detectSeparator(line) {
    const counts = { "\t": 0, ",": 0, ";": 0 };
    for (const ch of line) if (ch in counts) counts[ch]++;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  autoCode(name) {
    return (name || "")
      .toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "X";
  }

  uniqueCode(base, used) {
    let code = base, n = 2;
    while (used.has(code)) { code = `${base}_${n}`; n++; }
    used.add(code);
    return code;
  }

  // Sanitiza un prefijo/sufijo conservando guiones bajos de los bordes
  sanitizeAffix(s) {
    return (s || "")
      .toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9_]+/g, "_");
  }

  // Garantiza códigos únicos: padres entre sí, hijas dentro de cada padre
  dedupeAll() {
    const usedParents = new Set();
    this.parents.forEach((p) => {
      p.code = this.uniqueCode(p.code || "X", usedParents);
      const usedChildren = new Set();
      p.children.forEach((c) => {
        c.code = this.uniqueCode(c.code || "X", usedChildren);
      });
    });
  }

  /* ═══════════════ STATS / UTILS ═══════════════ */

  getStats() {
    let children = 0, capJson = 0, seatsNumbered = 0;
    this.parents.forEach((p) => p.children.forEach((c) => {
      children++;
      if (c.numbered) seatsNumbered += c.seatCount;
      else capJson += c.capacity;
    }));
    return { parents: this.parents.length, children, capJson, seatsNumbered };
  }

  openModal() { this.modal.classList.add("open"); }
  closeModal() {
    this.modal.classList.remove("open");
    if (this.modalBox) this.modalBox.classList.remove("modal-wide");
  }

  confirmReset() {
    this.modalTitle.textContent = "Reset total";
    this.modalBody.innerHTML = `
      <div class="modal-form">
        <p class="form-hint">Esto borra el manifiesto interpretado, los colores y la config. ¿Seguro?</p>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" id="cancelReset">Cancelar</button>
          <button class="btn btn-danger btn-sm" id="confirmResetBtn">Borrar todo</button>
        </div>
      </div>`;
    this.openModal();
    document.getElementById("cancelReset").addEventListener("click", () => this.closeModal());
    document.getElementById("confirmResetBtn").addEventListener("click", () => {
      this.config = { code: "", name: "", maxCapacityByFan: 3 };
      this.parents = [];
      this.colorMap = { ...DEFAULT_COLOR_MAP };
      this.expanded.clear();
      this.selected.clear();
      this.cmpRight = null;
      this.matchParent = {};
      this.matchChild = {};
      this.cmpExpanded.clear();
      this.gridRight = null;
      this.gMatchParent = {};
      this.gMatchChild = {};
      this.gExpanded.clear();
      this.gridsApplied = null;
      this.gridGeometry = new Map();
      this.activeTab = "secciones";
      localStorage.removeItem(STORAGE_KEY);
      this.closeModal();
      this.render();
      this.toast("Todo borrado");
    });
  }

  toast(msg, type = "success") {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", () => new Interpreter());
