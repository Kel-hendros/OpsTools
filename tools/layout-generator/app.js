/**
 * Layout Generator — Fanki Venue Layout Builder
 *
 * Generates JSON layouts for venues in Fanki.
 * Supports CSV import for sections, JSON import, nested sub-sections, and JSON/CSV export.
 */

class LayoutGenerator {
  constructor() {
    this.STORAGE_KEY = "layout_generator_data";
    this.SECTION_TYPES = ["GRANDSTAND", "VIP", "BOX", "GENERAL"];
    this.VISIBILITY_SCOPES = ["ALL", "PRIVATE", "NONE"];
    this.TABS = [
      { id: "config", label: "Configuración", icon: "⚙️" },
      { id: "sections", label: "Secciones", icon: "🏟️" },
      { id: "output", label: "JSON Output", icon: "📦" },
      { id: "csv-output", label: "CSV Output", icon: "🧾" },
    ];

    this.config = {
      name: "",
      code: "",
      maxCapacityByFan: 3,
      image: { small: "", medium: "", large: "" },
    };
    this.sections = [];
    this.activeTab = "config";

    this.loadFromStorage();
    this.cacheDOM();
    this.bindEvents();
    this.renderTabs();
    this.renderActiveTab();
  }

  /* ═══════════════ DOM ═══════════════ */

  cacheDOM() {
    this.tabsNav = document.getElementById("tabsNav");
    this.tabContent = document.getElementById("tabContent");
    this.resetBtn = document.getElementById("resetAll");
    this.modal = document.getElementById("modal");
    this.modalTitle = document.getElementById("modalTitle");
    this.modalBody = document.getElementById("modalBody");
    this.closeModalBtn = document.getElementById("closeModal");
  }

  bindEvents() {
    this.resetBtn.addEventListener("click", () => this.resetAll());
    this.closeModalBtn.addEventListener("click", () => this.closeModal());
    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.closeModal();
    });
  }

  /* ═══════════════ TABS ═══════════════ */

  renderTabs() {
    this.tabsNav.innerHTML = this.TABS.map((tab) => {
      let badge = "";
      if (tab.id === "sections" && this.sections.length > 0) {
        badge = `<span class="tab-badge">${this.sections.length}</span>`;
      }
      return `
        <button class="tab-btn ${tab.id === this.activeTab ? "active" : ""}"
                data-tab="${tab.id}">
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
    switch (this.activeTab) {
      case "config":
        this.renderConfigTab();
        break;
      case "sections":
        this.renderSectionsTab();
        break;
      case "output":
        this.renderOutputTab();
        break;
      case "csv-output":
        this.renderCsvOutputTab();
        break;
    }
  }

  /* ═══════════════ CONFIG TAB ═══════════════ */

  renderConfigTab() {
    this.tabContent.innerHTML = `
      <div class="tab-panel active">
        <div class="form-card">
          <div class="form-card-title">Datos del Layout</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Nombre del Venue</label>
              <input type="text" class="form-input" id="cfgName"
                     value="${this.esc(this.config.name)}"
                     placeholder="Ej: Estadio Olímpico Jaime Morón León">
            </div>
            <div class="form-group">
              <label class="form-label">Código del Layout</label>
              <input type="text" class="form-input" id="cfgCode"
                     value="${this.esc(this.config.code)}"
                     placeholder="Ej: LAYOUT_RCA_2026I_PARTIDO_4">
              <span class="form-hint">Se auto-genera desde el nombre si está vacío</span>
            </div>
          </div>
          <div class="form-row cols-3">
            <div class="form-group">
              <label class="form-label">Max Capacity By Fan</label>
              <input type="number" class="form-input" id="cfgMaxCap"
                     value="${this.config.maxCapacityByFan}" min="1" max="99">
            </div>
          </div>
        </div>

        <div class="form-card">
          <div class="form-card-title">Imágenes del Layout</div>
          <div class="form-row cols-3">
            <div class="form-group">
              <label class="form-label">Small</label>
              <input type="text" class="form-input" id="cfgImgSmall"
                     value="${this.esc(this.config.image.small)}"
                     placeholder="https://...small.png">
            </div>
            <div class="form-group">
              <label class="form-label">Medium</label>
              <input type="text" class="form-input" id="cfgImgMedium"
                     value="${this.esc(this.config.image.medium)}"
                     placeholder="https://...medium.png">
            </div>
            <div class="form-group">
              <label class="form-label">Large</label>
              <input type="text" class="form-input" id="cfgImgLarge"
                     value="${this.esc(this.config.image.large)}"
                     placeholder="https://...large.png">
            </div>
          </div>
        </div>
      </div>`;

    const nameEl = document.getElementById("cfgName");
    const codeEl = document.getElementById("cfgCode");
    let userEditedCode =
      codeEl.value.trim() !== "" && codeEl.value !== this.autoCode(nameEl.value);

    const bind = (id, field) => {
      const el = document.getElementById(id);
      el.addEventListener("input", () => {
        const keys = field.split(".");
        let target = this.config;
        for (let i = 0; i < keys.length - 1; i++) target = target[keys[i]];
        target[keys[keys.length - 1]] = el.type === "number" ? Number(el.value) : el.value;

        if (field === "code") {
          const trimmedCode = el.value.trim();
          userEditedCode = trimmedCode !== "" && trimmedCode !== this.autoCode(nameEl.value);

          if (!trimmedCode) {
            this.config.code = this.autoCode(nameEl.value);
            codeEl.value = this.config.code;
            userEditedCode = false;
          }
        }

        // Keep code synced with name until the user overrides it manually.
        if (field === "name" && !userEditedCode) {
          this.config.code = this.autoCode(el.value);
          codeEl.value = this.config.code;
        }
        this.save();
      });
    };

    bind("cfgName", "name");
    bind("cfgCode", "code");
    bind("cfgMaxCap", "maxCapacityByFan");
    bind("cfgImgSmall", "image.small");
    bind("cfgImgMedium", "image.medium");
    bind("cfgImgLarge", "image.large");
  }

  autoCode(name) {
    return name
      .toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  /* ═══════════════ SECTIONS TAB ═══════════════ */

  renderSectionsTab() {
    const stats = this.getSectionStats();

    this.tabContent.innerHTML = `
      <div class="tab-panel active">
        <div class="import-grid">
          <div class="csv-zone" id="csvZone">
            <input type="file" accept=".csv,.tsv,.txt" id="csvFile">
            <div class="csv-zone-content">
              <div class="csv-zone-icon">📄</div>
              <div class="csv-zone-title">Arrastrá un CSV o hacé click para cargar secciones</div>
              <div class="csv-zone-hint">Columnas: parent, code, name, type, unnumbered, capacity, visibilityScope, color, reseleable, disabled, exclusive</div>
              <div class="csv-zone-hint" style="margin-top:0.25rem; opacity:0.5;">Si "parent" tiene un código → sub-sección. Si está vacío → sección principal. Padre inexistente se crea automáticamente.</div>
            </div>
          </div>

          <div class="csv-zone" id="jsonZone">
            <input type="file" accept=".json,application/json" id="jsonFile">
            <div class="csv-zone-content">
              <div class="csv-zone-icon">🧩</div>
              <div class="csv-zone-title">Cargá un JSON o pegá el JSON</div>
              <div class="csv-zone-hint">Importá un layout existente para editarlo desde este generador.</div>
              <div class="csv-zone-hint" style="margin-top:0.25rem; opacity:0.5;">Soporta layouts exportados por esta misma herramienta y estructuras padre/sub-sección.</div>
            </div>
            <button class="btn btn-secondary btn-sm zone-inline-btn" id="openJsonPaste" type="button">Pegar JSON</button>
          </div>
        </div>

        <div class="sections-toolbar" style="margin-top: 1rem;">
          <div class="sections-stats">
            <span><strong>${stats.sectionCount}</strong> secciones</span>
            <span><strong>${stats.childCount}</strong> sub-secciones</span>
            <span><strong>${stats.totalCap.toLocaleString()}</strong> capacidad total</span>
          </div>
          <button class="btn btn-primary btn-sm" id="addSectionBtn">+ Agregar Sección</button>
        </div>

        <div id="sectionsContainer">
          ${this.sections.length === 0 ? this.renderEmptyState() : this.renderSectionsTable()}
        </div>
      </div>`;

    this.bindCSVZone();
    document.getElementById("addSectionBtn").addEventListener("click", () => this.openEditModal());
  }

  renderEmptyState() {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">🏟️</div>
        <div class="empty-state-text">No hay secciones cargadas</div>
        <div class="empty-state-hint">Subí un CSV, importá un JSON o agregá secciones manualmente</div>
      </div>`;
  }

  renderSectionsTable() {
    const rows = this.sections.map((s, i) => {
      const childCount = s.children ? s.children.length : 0;
      const cap = childCount > 0
        ? s.children.reduce((sum, c) => sum + (c.capacity || 0), 0)
        : s.capacity;
      const capDisplay = cap != null && cap > 0 ? cap.toLocaleString() : "—";

      return `
        <tr>
          <td><span class="color-swatch" style="background:${this.esc(s.color || "#666")}"></span></td>
          <td class="code-cell">${this.esc(s.code)}</td>
          <td>${this.esc(s.name)}</td>
          <td><span class="badge badge-muted">${this.esc(s.type)}</span></td>
          <td class="capacity-cell">${capDisplay}</td>
          <td>${this.visBadge(s.visibilityScope)}</td>
          <td>
            ${s.unnumbered ? '<span class="badge badge-cyan">UNN</span>' : '<span class="badge badge-muted">NUM</span>'}
            ${s.reseleable ? ' <span class="badge badge-amber">RES</span>' : ""}
          </td>
          <td>
            ${childCount > 0
              ? `<span class="children-count" data-idx="${i}">${childCount} sub</span>`
              : `<button class="action-btn" title="Agregar sub-secciones" data-children="${i}">📂</button>`
            }
          </td>
          <td>
            <div class="actions-cell">
              <button class="action-btn" title="Editar" data-edit="${i}">✏️</button>
              <button class="action-btn danger" title="Eliminar" data-delete="${i}">🗑️</button>
            </div>
          </td>
        </tr>`;
    }).join("");

    return `
      <div class="sections-table-wrapper">
        <table class="sections-table">
          <thead>
            <tr>
              <th></th>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Capacidad</th>
              <th>Visibilidad</th>
              <th>Flags</th>
              <th>Sub</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  visBadge(scope) {
    const map = {
      ALL: "badge-green",
      PRIVATE: "badge-purple",
      NONE: "badge-red",
    };
    return `<span class="badge ${map[scope] || "badge-muted"}">${scope || "ALL"}</span>`;
  }

  /* ─── CSV Upload ─── */

  bindCSVZone() {
    const zone = document.getElementById("csvZone");
    const input = document.getElementById("csvFile");
    const jsonZone = document.getElementById("jsonZone");
    const jsonInput = document.getElementById("jsonFile");
    const openJsonPasteBtn = document.getElementById("openJsonPaste");

    ["dragenter", "dragover"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.add("drag-over");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      zone.addEventListener(evt, () => zone.classList.remove("drag-over"))
    );
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) this.handleCSV(file);
    });
    input.addEventListener("change", () => {
      if (input.files[0]) this.handleCSV(input.files[0]);
      input.value = "";
    });

    ["dragenter", "dragover"].forEach((evt) =>
      jsonZone.addEventListener(evt, (e) => {
        e.preventDefault();
        jsonZone.classList.add("drag-over");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      jsonZone.addEventListener(evt, () => jsonZone.classList.remove("drag-over"))
    );
    jsonZone.addEventListener("drop", (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) this.handleJSONFile(file);
    });
    jsonInput.addEventListener("change", () => {
      if (jsonInput.files[0]) this.handleJSONFile(jsonInput.files[0]);
      jsonInput.value = "";
    });
    openJsonPasteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openImportJsonModal();
    });

    // Bind table actions via delegation
    const container = document.getElementById("sectionsContainer");
    container.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-edit]");
      if (btn) return this.openEditModal(Number(btn.dataset.edit));

      const del = e.target.closest("[data-delete]");
      if (del) return this.deleteSection(Number(del.dataset.delete));

      const children = e.target.closest("[data-children]");
      if (children) return this.openChildrenModal(Number(children.dataset.children));

      const childCount = e.target.closest("[data-idx]");
      if (childCount) return this.openChildrenModal(Number(childCount.dataset.idx));
    });
  }

  handleCSV(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = this.parseCSV(e.target.result);
        if (parsed.length === 0) return this.toast("CSV vacío o sin datos válidos", "error");

        // Separate parents (no parent column or empty) from children
        const parentRows = [];
        const childRows = [];
        parsed.forEach((row) => {
          const parentCode = (row.parent || row.padre || "").trim();
          if (parentCode) {
            childRows.push({ ...row, _parentCode: parentCode });
          } else {
            parentRows.push(row);
          }
        });

        // 1) Add parent rows as top-level sections
        let addedParents = 0;
        parentRows.forEach((row) => {
          this.sections.push(this.rowToSection(row));
          addedParents++;
        });

        // 2) Assign children to their parents (create placeholder parent if missing)
        let addedChildren = 0;
        let createdPlaceholders = 0;
        childRows.forEach((row) => {
          let parent = this.sections.find((s) => s.code === row._parentCode);
          if (!parent) {
            // Auto-create placeholder parent
            parent = {
              code: row._parentCode,
              name: row._parentCode,
              type: "GRANDSTAND",
              color: "#FFFFFF",
              disabled: false,
              exclusive: false,
              visibilityScope: "PRIVATE",
              capacity: null,
              unnumbered: false,
              reseleable: false,
              children: [],
            };
            this.sections.push(parent);
            createdPlaceholders++;
          }
          if (!parent.children) parent.children = [];
          const child = this.rowToSection(row);
          delete child.children;
          // Inherit parent color if CSV row has no explicit color
          if (!row.color || !row.color.trim()) {
            child.color = parent.color;
          }
          parent.children.push(child);
          addedChildren++;
        });

        this.save();
        this.renderTabs();
        this.renderSectionsTab();

        // Build summary message
        const parts = [];
        if (addedParents > 0) parts.push(`${addedParents} secciones`);
        if (addedChildren > 0) parts.push(`${addedChildren} sub-secciones`);
        if (createdPlaceholders > 0) parts.push(`${createdPlaceholders} padres auto-creados`);
        this.toast(parts.join(", ") + " cargadas", "success");
      } catch (err) {
        this.toast("Error al parsear CSV: " + err.message, "error");
      }
    };
    reader.readAsText(file);
  }

  handleJSONFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        this.importLayoutJSON(e.target.result);
      } catch (err) {
        this.toast("Error al importar JSON: " + err.message, "error");
      }
    };
    reader.readAsText(file);
  }

  openImportJsonModal() {
    this.modalTitle.textContent = "Pegar Layout JSON";
    this.modalBody.innerHTML = `
      <div class="modal-form">
        <div class="form-group">
          <label class="form-label">Layout JSON</label>
          <textarea class="form-input form-textarea form-textarea-code" id="layoutJsonInput" placeholder='{
  "code": "LAYOUT_EVENTO",
  "name": "Venue Name",
  "sections": []
}'></textarea>
          <span class="form-hint">La importación reemplaza la configuración y las secciones cargadas actualmente.</span>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" id="layoutJsonCancel" type="button">Cancelar</button>
          <button class="btn btn-primary btn-sm" id="layoutJsonImport" type="button">Importar JSON</button>
        </div>
      </div>`;
    this.modal.classList.add("open");

    document.getElementById("layoutJsonCancel").addEventListener("click", () => this.closeModal());
    document.getElementById("layoutJsonImport").addEventListener("click", () => {
      const raw = document.getElementById("layoutJsonInput").value.trim();
      if (!raw) return this.toast("Pegá un JSON antes de importar", "error");

      try {
        this.importLayoutJSON(raw);
      } catch (err) {
        this.toast("Error al importar JSON: " + err.message, "error");
      }
    });
  }

  importLayoutJSON(raw) {
    const parsed = JSON.parse(raw);
    const normalized = this.normalizeImportedLayout(parsed);

    if (this.hasExistingData()) {
      const ok = confirm("La importación va a reemplazar la configuración y las secciones actuales. ¿Continuar?");
      if (!ok) return;
    }

    this.config = normalized.config;
    this.sections = normalized.sections;
    this.activeTab = normalized.sections.length > 0 ? "sections" : "config";
    this.modal.classList.remove("open");
    this.save();
    this.renderTabs();
    this.renderActiveTab();

    const stats = this.getSectionStats();
    this.toast(
      `${stats.sectionCount} secciones y ${stats.childCount} sub-secciones importadas`,
      "success",
    );
  }

  normalizeImportedLayout(layout) {
    if (!layout || typeof layout !== "object" || Array.isArray(layout)) {
      throw new Error("El archivo no contiene un objeto JSON válido.");
    }

    const sourceSections = Array.isArray(layout.sections) ? layout.sections : [];
    const sections = sourceSections.map((section, idx) =>
      this.normalizeImportedSection(section, idx)
    );

    if (
      sections.length === 0 &&
      !this.normalizeText(layout.code) &&
      !this.normalizeText(layout.name)
    ) {
      throw new Error("No se encontró un layout compatible para importar.");
    }

    return {
      config: {
        name: this.normalizeText(layout.name),
        code: this.normalizeText(layout.code),
        maxCapacityByFan: this.normalizeNumber(layout.maxCapacityByFan, 3),
        image: {
          small: this.normalizeText(layout.image?.small),
          medium: this.normalizeText(layout.image?.medium),
          large: this.normalizeText(layout.image?.large),
        },
      },
      sections,
    };
  }

  normalizeImportedSection(section, idx) {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      throw new Error(`La sección ${idx + 1} no tiene un formato válido.`);
    }

    const parentCode =
      this.normalizeText(section.code) ||
      this.autoCode(section.name || `Seccion ${idx + 1}`) ||
      `SECTION_${idx + 1}`;
    const parentName = this.normalizeText(section.name) || parentCode;
    const sourceChildren = Array.isArray(section.sections) ? section.sections : [];

    if (sourceChildren.some((child) => Array.isArray(child?.sections) && child.sections.length > 0)) {
      throw new Error("Layout Generator soporta hasta un nivel de sub-secciones.");
    }

    return {
      code: parentCode,
      name: parentName,
      type: this.normalizeText(section.type) || "GRANDSTAND",
      color: this.normalizeColor(section.color),
      disabled: this.parseBool(section.disabled),
      exclusive: this.parseBool(section.exclusive),
      visibilityScope: this.normalizeVisibilityScope(section.visibilityScope),
      capacity: sourceChildren.length > 0 ? null : this.normalizeOptionalNumber(section.capacity),
      unnumbered: section.unnumbered == null ? true : this.parseBool(section.unnumbered),
      reseleable: this.parseBool(section.reseleable),
      children: sourceChildren.map((child, childIdx) =>
        this.normalizeImportedChild(child, parentCode, childIdx, section)
      ),
    };
  }

  normalizeImportedChild(child, parentCode, idx, parentSection) {
    if (!child || typeof child !== "object" || Array.isArray(child)) {
      throw new Error(`La sub-sección ${idx + 1} de ${parentCode} no tiene un formato válido.`);
    }

    const rawCode = this.normalizeText(child.code);
    const codeWithoutParent = rawCode.startsWith(`${parentCode}/`)
      ? rawCode.slice(parentCode.length + 1)
      : rawCode;
    const childCode =
      codeWithoutParent ||
      this.autoCode(child.name || `Subseccion ${idx + 1}`) ||
      `SUB_${idx + 1}`;

    return {
      code: childCode,
      name: this.normalizeText(child.name) || childCode,
      type: this.normalizeText(child.type) || this.normalizeText(parentSection.type) || "GRANDSTAND",
      color: this.normalizeColor(child.color || parentSection.color),
      disabled: this.parseBool(child.disabled),
      exclusive: this.parseBool(child.exclusive),
      visibilityScope: this.normalizeVisibilityScope(
        child.visibilityScope,
        this.normalizeVisibilityScope(parentSection.visibilityScope),
      ),
      capacity: this.normalizeOptionalNumber(child.capacity),
      unnumbered: child.unnumbered == null ? true : this.parseBool(child.unnumbered),
      reseleable: this.parseBool(child.reseleable),
    };
  }

  /* ─── CSV Parser ─── */

  parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const sep = this.detectSeparator(lines[0]);
    const headers = this.parseLine(lines[0], sep).map((h) =>
      h.trim().toLowerCase().replace(/\s+/g, "")
    );

    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseLine(lines[i], sep);
      if (values.length === 0 || values.every((v) => !v.trim())) continue;
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = (values[idx] || "").trim();
      });
      results.push(row);
    }
    return results;
  }

  parseLine(line, sep) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === sep && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  detectSeparator(headerLine) {
    const counts = { "\t": 0, ",": 0, ";": 0 };
    for (const ch of headerLine) {
      if (ch in counts) counts[ch]++;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  rowToSection(row) {
    return {
      code: row.code || row.codigo || "",
      name: row.name || row.nombre || "",
      type: row.type || row.tipo || "GRANDSTAND",
      color: row.color || "#FFFFFF",
      disabled: this.parseBool(row.disabled),
      exclusive: this.parseBool(row.exclusive),
      visibilityScope: (row.visibilityscope || row.visibility || "ALL").toUpperCase(),
      capacity: row.capacity || row.capacidad ? Number(row.capacity || row.capacidad) : null,
      unnumbered: row.unnumbered != null ? this.parseBool(row.unnumbered) : true,
      reseleable: this.parseBool(row.reseleable),
      children: [],
    };
  }

  parseBool(val) {
    if (val == null) return false;
    const v = String(val).trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes" || v === "si" || v === "sí";
  }

  normalizeText(val) {
    if (val == null) return "";
    return String(val).trim();
  }

  normalizeNumber(val, fallback = 0) {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  normalizeOptionalNumber(val) {
    if (val == null || val === "") return null;
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : null;
  }

  normalizeColor(val) {
    const color = this.normalizeText(val);
    return color || "#FFFFFF";
  }

  normalizeVisibilityScope(val, fallback = "ALL") {
    const scope = this.normalizeText(val).toUpperCase();
    return this.VISIBILITY_SCOPES.includes(scope) ? scope : fallback;
  }

  hasExistingData() {
    return Boolean(
      this.normalizeText(this.config.name) ||
      this.normalizeText(this.config.code) ||
      this.sections.length > 0
    );
  }

  getSectionStats() {
    const sectionCount = this.sections.length;
    const childCount = this.sections.reduce((sum, section) => {
      return sum + ((section.children || []).length);
    }, 0);
    const totalCap = this.sections.reduce((sum, section) => {
      if (section.children && section.children.length > 0) {
        return sum + section.children.reduce((childSum, child) => childSum + (child.capacity || 0), 0);
      }
      return sum + (section.capacity || 0);
    }, 0);

    return { sectionCount, childCount, totalCap };
  }

  /* ═══════════════ SECTION CRUD ═══════════════ */

  deleteSection(idx) {
    const name = this.sections[idx]?.name || this.sections[idx]?.code;
    if (!confirm(`¿Eliminar sección "${name}"?`)) return;
    this.sections.splice(idx, 1);
    this.save();
    this.renderTabs();
    this.renderSectionsTab();
  }

  /* ─── Edit Section Modal ─── */

  openEditModal(idx) {
    const isNew = idx == null;
    const section = isNew
      ? {
          code: "", name: "", type: "GRANDSTAND", color: "#06b6d4",
          disabled: false, exclusive: false, visibilityScope: "ALL",
          capacity: null, unnumbered: true, reseleable: false, children: [],
        }
      : { ...this.sections[idx] };

    this.modalTitle.textContent = isNew ? "Nueva Sección" : `Editar: ${section.name}`;
    this.modalBody.innerHTML = this.renderSectionForm(section, isNew, idx);
    this.modal.classList.add("open");
    this.bindFormAutoCode();

    // Remember original color to detect changes
    const originalColor = isNew ? null : section.color;

    // Bind save
    document.getElementById("modalSave").addEventListener("click", () => {
      const data = this.readSectionForm();
      if (!data.code || !data.name) return this.toast("Código y nombre son obligatorios", "error");

      if (isNew) {
        this.sections.push({ ...data, children: [] });
      } else {
        const children = this.sections[idx].children || [];
        // Propagate color to children if parent color changed
        if (originalColor && data.color !== originalColor && children.length > 0) {
          children.forEach((c) => { c.color = data.color; });
        }
        this.sections[idx] = { ...data, children };
      }
      this.closeModal();
      this.save();
      this.renderTabs();
      this.renderSectionsTab();
    });

    document.getElementById("modalCancel").addEventListener("click", () => this.closeModal());
  }

  renderSectionForm(s, isNew, idx) {
    const typeOpts = this.SECTION_TYPES
      .map((t) => `<option value="${t}" ${s.type === t ? "selected" : ""}>${t}</option>`)
      .join("");
    const visOpts = this.VISIBILITY_SCOPES
      .map((v) => `<option value="${v}" ${s.visibilityScope === v ? "selected" : ""}>${v}</option>`)
      .join("");

    return `
      <div class="modal-form">
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Nombre</label>
            <input type="text" class="form-input" id="fName" value="${this.esc(s.name)}" placeholder="Ej: Occidental Alta">
          </div>
          <div class="form-group">
            <label class="form-label">Código</label>
            <input type="text" class="form-input" id="fCode" value="${this.esc(s.code)}" placeholder="Se auto-genera desde el nombre">
            <span class="form-hint">Se auto-genera. Podés editarlo manualmente.</span>
          </div>
        </div>
        <div class="form-row cols-3">
          <div class="form-group">
            <label class="form-label">Tipo</label>
            <select class="form-select" id="fType">${typeOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Visibilidad</label>
            <select class="form-select" id="fVisibility">${visOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Color</label>
            <input type="color" class="form-input" id="fColor" value="${s.color || "#06b6d4"}">
          </div>
        </div>
        <div class="form-row cols-3">
          <div class="form-group">
            <label class="form-label">Capacidad</label>
            <input type="number" class="form-input" id="fCapacity" value="${s.capacity || ""}" min="0" placeholder="—">
          </div>
          <div class="form-group">
            <label class="form-label">Unnumbered</label>
            <select class="form-select" id="fUnnumbered">
              <option value="true" ${s.unnumbered ? "selected" : ""}>Sí (Sin numerar)</option>
              <option value="false" ${!s.unnumbered ? "selected" : ""}>No (Numerado)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Reseleable</label>
            <select class="form-select" id="fReseleable">
              <option value="false" ${!s.reseleable ? "selected" : ""}>No</option>
              <option value="true" ${s.reseleable ? "selected" : ""}>Sí</option>
            </select>
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Disabled</label>
            <select class="form-select" id="fDisabled">
              <option value="false" ${!s.disabled ? "selected" : ""}>No</option>
              <option value="true" ${s.disabled ? "selected" : ""}>Sí</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Exclusive</label>
            <select class="form-select" id="fExclusive">
              <option value="false" ${!s.exclusive ? "selected" : ""}>No</option>
              <option value="true" ${s.exclusive ? "selected" : ""}>Sí</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" id="modalCancel">Cancelar</button>
          <button class="btn btn-primary btn-sm" id="modalSave">${isNew ? "Agregar" : "Guardar"}</button>
        </div>
      </div>`;
  }

  readSectionForm() {
    const cap = document.getElementById("fCapacity").value;
    return {
      code: document.getElementById("fCode").value.trim(),
      name: document.getElementById("fName").value.trim(),
      type: document.getElementById("fType").value,
      color: document.getElementById("fColor").value,
      disabled: document.getElementById("fDisabled").value === "true",
      exclusive: document.getElementById("fExclusive").value === "true",
      visibilityScope: document.getElementById("fVisibility").value,
      capacity: cap ? Number(cap) : null,
      unnumbered: document.getElementById("fUnnumbered").value === "true",
      reseleable: document.getElementById("fReseleable").value === "true",
    };
  }

  bindFormAutoCode() {
    const nameEl = document.getElementById("fName");
    const codeEl = document.getElementById("fCode");
    if (!nameEl || !codeEl) return;

    // Track if user manually edited the code
    let userEditedCode = codeEl.value.trim() !== "" && codeEl.value !== this.autoCode(nameEl.value);

    codeEl.addEventListener("input", () => {
      userEditedCode = true;
    });

    nameEl.addEventListener("input", () => {
      if (!userEditedCode) {
        codeEl.value = this.autoCode(nameEl.value);
      }
    });
  }

  /* ═══════════════ CHILDREN MODAL ═══════════════ */

  openChildrenModal(parentIdx) {
    const parent = this.sections[parentIdx];
    if (!parent) return;
    this.modalTitle.textContent = `Sub-secciones de: ${parent.name} (${parent.code})`;
    this.renderChildrenModalBody(parentIdx);
    this.modal.classList.add("open");
  }

  renderChildrenModalBody(parentIdx) {
    const parent = this.sections[parentIdx];
    const children = parent.children || [];

    let tableHTML = "";
    if (children.length > 0) {
      const rows = children.map((c, ci) => `
        <tr>
          <td><span class="color-swatch" style="background:${this.esc(c.color || parent.color || "#666")}"></span></td>
          <td class="code-cell">${this.esc(parent.code)}/${this.esc(c.code)}</td>
          <td>${this.esc(c.name)}</td>
          <td class="capacity-cell">${c.capacity != null ? c.capacity.toLocaleString() : "—"}</td>
          <td>${this.visBadge(c.visibilityScope)}</td>
          <td>
            <div class="actions-cell">
              <button class="action-btn" title="Editar" data-cedit="${ci}">✏️</button>
              <button class="action-btn danger" title="Eliminar" data-cdelete="${ci}">🗑️</button>
            </div>
          </td>
        </tr>`).join("");

      const totalChildCap = children.reduce((s, c) => s + (c.capacity || 0), 0);

      tableHTML = `
        <div class="sections-stats" style="margin-bottom: 0.5rem;">
          <span><strong>${children.length}</strong> sub-secciones</span>
          <span><strong>${totalChildCap.toLocaleString()}</strong> capacidad</span>
        </div>
        <div class="sections-table-wrapper" style="margin-bottom: 1rem;">
          <table class="sections-table">
            <thead>
              <tr>
                <th></th>
                <th>Código</th>
                <th>Nombre</th>
                <th>Capacidad</th>
                <th>Visibilidad</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    this.modalBody.innerHTML = `
      ${tableHTML}
      <div class="csv-zone" id="childCsvZone" style="margin-bottom: 1rem;">
        <input type="file" accept=".csv,.tsv,.txt" id="childCsvFile">
        <div class="csv-zone-icon">📄</div>
        <div class="csv-zone-title">CSV para sub-secciones de ${this.esc(parent.code)}</div>
        <div class="csv-zone-hint">Los códigos se prefijan automáticamente con ${this.esc(parent.code)}/</div>
      </div>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <button class="btn btn-secondary btn-sm" id="addChildBtn">+ Agregar Sub-sección</button>
      </div>`;

    // Bind child CSV upload
    const zone = document.getElementById("childCsvZone");
    const input = document.getElementById("childCsvFile");

    ["dragenter", "dragover"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.add("drag-over");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      zone.addEventListener(evt, () => zone.classList.remove("drag-over"))
    );
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) this.handleChildCSV(file, parentIdx);
    });
    input.addEventListener("change", () => {
      if (input.files[0]) this.handleChildCSV(input.files[0], parentIdx);
      input.value = "";
    });

    // Bind child table actions
    this.modalBody.addEventListener("click", (e) => {
      const edit = e.target.closest("[data-cedit]");
      if (edit) return this.openChildEditModal(parentIdx, Number(edit.dataset.cedit));

      const del = e.target.closest("[data-cdelete]");
      if (del) {
        const ci = Number(del.dataset.cdelete);
        const child = this.sections[parentIdx].children[ci];
        if (confirm(`¿Eliminar sub-sección "${child.name}"?`)) {
          this.sections[parentIdx].children.splice(ci, 1);
          this.save();
          this.renderChildrenModalBody(parentIdx);
          this.renderTabs();
        }
      }
    });

    // Add child manually
    document.getElementById("addChildBtn").addEventListener("click", () => {
      this.openChildEditModal(parentIdx);
    });
  }

  handleChildCSV(file, parentIdx) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = this.parseCSV(e.target.result);
        if (parsed.length === 0) return this.toast("CSV vacío", "error");

        const parent = this.sections[parentIdx];
        if (!parent.children) parent.children = [];

        parsed.forEach((row) => {
          const child = this.rowToSection(row);
          delete child.children;
          // Inherit parent color if CSV row has no explicit color
          if (!row.color || !row.color.trim()) {
            child.color = parent.color;
          }
          parent.children.push(child);
        });

        this.save();
        this.renderChildrenModalBody(parentIdx);
        this.renderTabs();
        this.toast(`${parsed.length} sub-secciones cargadas`, "success");
      } catch (err) {
        this.toast("Error al parsear CSV: " + err.message, "error");
      }
    };
    reader.readAsText(file);
  }

  openChildEditModal(parentIdx, childIdx) {
    const parent = this.sections[parentIdx];
    const isNew = childIdx == null;
    const child = isNew
      ? {
          code: "", name: "", type: parent.type || "GRANDSTAND",
          color: parent.color || "#06b6d4", disabled: false, exclusive: false,
          visibilityScope: parent.visibilityScope || "PRIVATE",
          capacity: null, unnumbered: true, reseleable: false,
        }
      : { ...parent.children[childIdx] };

    // Replace modal body with child form
    this.modalTitle.textContent = isNew
      ? `Nueva sub-sección en ${parent.code}`
      : `Editar: ${child.name}`;

    this.modalBody.innerHTML = this.renderSectionForm(child, isNew, null);
    this.bindFormAutoCode();

    document.getElementById("modalSave").addEventListener("click", () => {
      const data = this.readSectionForm();
      if (!data.code || !data.name) return this.toast("Código y nombre son obligatorios", "error");

      if (isNew) {
        if (!parent.children) parent.children = [];
        parent.children.push(data);
      } else {
        parent.children[childIdx] = data;
      }
      this.save();
      // Go back to children list
      this.modalTitle.textContent = `Sub-secciones de: ${parent.name} (${parent.code})`;
      this.renderChildrenModalBody(parentIdx);
      this.renderTabs();
    });

    document.getElementById("modalCancel").addEventListener("click", () => {
      this.modalTitle.textContent = `Sub-secciones de: ${parent.name} (${parent.code})`;
      this.renderChildrenModalBody(parentIdx);
    });
  }

  closeModal() {
    this.modal.classList.remove("open");
    // Refresh sections tab if visible
    if (this.activeTab === "sections") {
      this.renderSectionsTab();
    }
  }

  /* ═══════════════ JSON OUTPUT TAB ═══════════════ */

  renderOutputTab() {
    const json = this.generateJSON();
    const jsonStr = JSON.stringify(json, null, 2);
    const highlighted = this.highlightJSON(jsonStr);
    const stats = this.getSectionStats();

    this.tabContent.innerHTML = `
      <div class="tab-panel active">
        <div class="json-output-wrapper">
          <div class="json-output-header">
            <div class="output-header-main">
              <span class="json-output-label">JSON Output</span>
              <span class="json-output-stats">${stats.sectionCount} secciones &middot; ${stats.childCount} sub-secciones &middot; ${stats.totalCap.toLocaleString()} cap total &middot; ${(jsonStr.length / 1024).toFixed(1)} KB</span>
            </div>
            <div class="output-header-actions">
              <button class="btn btn-secondary btn-sm" id="copyJsonOutput" type="button">📋 Copiar JSON</button>
              <button class="btn btn-success btn-sm" id="exportJsonOutput" type="button">📦 Exportar .json</button>
            </div>
          </div>
          <pre class="json-output-pre">${highlighted}</pre>
        </div>
      </div>`;

    document.getElementById("copyJsonOutput").addEventListener("click", () => this.copyJSON());
    document.getElementById("exportJsonOutput").addEventListener("click", () => this.exportJSON());
  }

  renderCsvOutputTab() {
    const rows = this.getCSVOutputRows();
    const csv = this.generateCSVOutput();
    const stats = this.getSectionStats();
    const rowsHTML = rows.length > 0
      ? rows.map((row) => `
        <tr>
          <td class="code-cell">${this.esc(row.parentCode)}</td>
          <td>${this.esc(row.parentName)}</td>
          <td class="code-cell">${row.childCode ? this.esc(row.childCode) : '<span class="output-empty">—</span>'}</td>
          <td>${row.childName ? this.esc(row.childName) : '<span class="output-empty">—</span>'}</td>
        </tr>`).join("")
      : `
        <tr>
          <td colspan="4" class="output-empty-cell">No hay filas para exportar todavía.</td>
        </tr>`;

    this.tabContent.innerHTML = `
      <div class="tab-panel active output-stack">
        <div class="json-output-wrapper">
          <div class="json-output-header">
            <div class="output-header-main">
              <span class="json-output-label">CSV Output</span>
              <span class="json-output-stats">${rows.length} filas &middot; ${stats.sectionCount} secciones &middot; ${stats.childCount} sub-secciones</span>
            </div>
            <div class="output-header-actions">
              <button class="btn btn-secondary btn-sm" id="copyCsvOutput" type="button">📋 Copiar CSV</button>
              <button class="btn btn-success btn-sm" id="exportCsvOutput" type="button">📦 Exportar .csv</button>
            </div>
          </div>
          <div class="sections-table-wrapper">
            <table class="sections-table output-table">
              <thead>
                <tr>
                  <th>Parent Code</th>
                  <th>Parent Name</th>
                  <th>Child Code</th>
                  <th>Child Name</th>
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

    document.getElementById("copyCsvOutput").addEventListener("click", () => this.copyCSVOutput());
    document.getElementById("exportCsvOutput").addEventListener("click", () => this.exportCSVOutput());
  }

  generateJSON() {
    const output = {};

    if (this.config.code) output.code = this.config.code;
    if (this.config.name) output.name = this.config.name;

    output.sections = this.sections.map((s) => {
      const sec = {
        code: s.code,
        name: s.name,
        type: s.type || "GRANDSTAND",
        color: s.color || "#FFFFFF",
        disabled: s.disabled || false,
        exclusive: s.exclusive || false,
        visibilityScope: s.visibilityScope || "ALL",
      };

      if (s.children && s.children.length > 0) {
        sec.sections = s.children.map((c) => {
          const child = {
            code: `${s.code}/${c.code}`,
            name: c.name,
            type: c.type || s.type || "GRANDSTAND",
            color: c.color || s.color || "#FFFFFF",
            disabled: c.disabled || false,
            exclusive: c.exclusive || false,
            visibilityScope: c.visibilityScope || s.visibilityScope || "ALL",
          };
          if (c.capacity != null) child.capacity = c.capacity;
          child.unnumbered = c.unnumbered != null ? c.unnumbered : true;
          child.reseleable = c.reseleable || false;
          return child;
        });
      }

      if (s.capacity != null && (!s.children || s.children.length === 0)) {
        sec.capacity = s.capacity;
      }
      sec.unnumbered = s.unnumbered != null ? s.unnumbered : true;
      sec.reseleable = s.reseleable || false;

      return sec;
    });

    // Only include image if at least one URL is set
    if (this.config.image.small || this.config.image.medium || this.config.image.large) {
      output.image = {};
      if (this.config.image.small) output.image.small = this.config.image.small;
      if (this.config.image.medium) output.image.medium = this.config.image.medium;
      if (this.config.image.large) output.image.large = this.config.image.large;
    }

    output.maxCapacityByFan = this.config.maxCapacityByFan;

    return output;
  }

  getCSVOutputRows() {
    return this.sections.flatMap((section) => {
      const parentCode = this.normalizeText(section.code);
      const parentName = this.normalizeText(section.name);
      const children = Array.isArray(section.children) ? section.children : [];

      if (children.length === 0) {
        return [{
          parentCode,
          parentName,
          childCode: "",
          childName: "",
        }];
      }

      return children.map((child) => ({
        parentCode,
        parentName,
        childCode: `${parentCode}/${this.normalizeText(child.code)}`,
        childName: this.normalizeText(child.name),
      }));
    });
  }

  generateCSVOutput() {
    const headers = ["Parent Code", "Parent Name", "Child Code", "Child Name"];
    const rows = this.getCSVOutputRows();

    return [
      headers.join(","),
      ...rows.map((row) => [
        row.parentCode,
        row.parentName,
        row.childCode,
        row.childName,
      ].map((cell) => this.escapeCSVCell(cell)).join(",")),
    ].join("\n");
  }

  escapeCSVCell(value) {
    const normalized = this.normalizeText(value);
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  highlightJSON(json) {
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = "json-number";
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? "json-key" : "json-string";
        } else if (/true|false/.test(match)) {
          cls = "json-bool";
        } else if (/null/.test(match)) {
          cls = "json-null";
        }
        // Escape HTML
        const safe = match.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<span class="${cls}">${safe}</span>`;
      }
    );
  }

  /* ═══════════════ EXPORT ═══════════════ */

  exportJSON() {
    const json = this.generateJSON();
    const str = JSON.stringify(json, null, 2);
    const name = this.config.code || this.config.name || "layout";
    const filename = `${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;

    const blob = new Blob([str], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.click();
    URL.revokeObjectURL(url);
    this.toast("JSON exportado", "success");
  }

  copyJSON() {
    const json = this.generateJSON();
    const str = JSON.stringify(json, null, 2);
    navigator.clipboard.writeText(str).then(
      () => this.toast("JSON copiado al portapapeles", "success"),
      () => this.toast("Error al copiar", "error")
    );
  }

  exportCSVOutput() {
    const csv = this.generateCSVOutput();
    const name = this.config.code || this.config.name || "layout";
    const filename = `${name.replace(/[^a-zA-Z0-9_-]/g, "_")}_output.csv`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.click();
    URL.revokeObjectURL(url);
    this.toast("CSV exportado", "success");
  }

  copyCSVOutput() {
    const csv = this.generateCSVOutput();
    navigator.clipboard.writeText(csv).then(
      () => this.toast("CSV copiado al portapapeles", "success"),
      () => this.toast("Error al copiar CSV", "error")
    );
  }

  /* ═══════════════ PERSISTENCE ═══════════════ */

  save() {
    const data = {
      config: this.config,
      sections: this.sections,
      activeTab: this.activeTab,
    };
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("Failed to save:", e);
    }
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.config) this.config = { ...this.config, ...data.config };
      if (data.sections) this.sections = data.sections;
      if (data.activeTab) this.activeTab = data.activeTab;
    } catch (e) {
      console.error("Failed to load:", e);
    }
  }

  resetAll() {
    if (!confirm("¿Resetear todo? Se borrarán todas las secciones y configuración.")) return;
    this.config = {
      name: "",
      code: "",
      maxCapacityByFan: 3,
      image: { small: "", medium: "", large: "" },
    };
    this.sections = [];
    localStorage.removeItem(this.STORAGE_KEY);
    this.activeTab = "config";
    this.renderTabs();
    this.renderActiveTab();
    this.toast("Todo reseteado", "success");
  }

  /* ═══════════════ UTILS ═══════════════ */

  esc(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

/* ─── Init ─── */
document.addEventListener("DOMContentLoaded", () => {
  window.app = new LayoutGenerator();
});
