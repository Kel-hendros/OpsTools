/**
 * Stadium Grid Manager - Logic (Canvas 2D)
 */

// Visual constants
const CELL = 32;
const GAP = 4;
const PAD = 40;
const LABEL_W = 40;
const STEP = CELL + GAP; // 36

const COLORS = {
  seat: "#3b82f6",
  seatHover: "#60a5fa",
  empty: "#1e293b",
  emptyHover: "#2d3a4d",
  emptyBorder: "rgba(255,255,255,0.1)",
  emptyHoverBorder: "#3b82f6",
  labelA: "#059669",
  labelB: "#10b981",
  cornerBorder: "#10b981",
  text: "#ffffff",
  labelText: "#000000",
  bg: "#080a0f",
};

class GridManager {
  constructor() {
    this.rows = 10;
    this.cols = 15;
    this.sectionCode = "PISO_2/SECCION_503A";
    this.gridData = [];
    this.currentTool = "seat";
    this.appContainer = document.getElementById("app");
    this.canvasContainer = document.querySelector(".canvas-container");
    this.appContainer.setAttribute("data-current-tool", this.currentTool);
    this.isMouseDown = false;

    // Transform state
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;

    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;
    this.dragDist = 0;

    // Canvas
    this.gridCanvas = document.getElementById("gridCanvas");
    this.ctx = this.gridCanvas.getContext("2d");
    this.hoveredCell = -1;
    this.lastPaintedIndex = -1;
    this._renderedScale = 1; // track last scale the canvas was rendered at
    this._zoomTimer = null;

    // DOM Elements
    this.rowsInput = document.getElementById("rows");
    this.colsInput = document.getElementById("cols");
    this.sectionInput = document.getElementById("sectionCode");
    this.namingTypeInput = document.getElementById("rowNamingType");
    this.rowStartInput = document.getElementById("rowStartValue");
    this.colStartInput = document.getElementById("colStartValue");
    this.invertRowsInput = document.getElementById("invertRows");
    this.invertColsInput = document.getElementById("invertCols");

    this.toolBtns = document.querySelectorAll(".tool-btn");
    this.exportBtn = document.getElementById("exportCsv");
    this.applyNamingBtn = document.getElementById("applyNaming");
    this.fillAllBtn = document.getElementById("fillAll");
    this.clearAllBtn = document.getElementById("clearAll");
    this.zeroPaddingInput = document.getElementById("zeroPadding");
    this.namePatternInput = document.getElementById("namePattern");
    this.seatCountSpan = document.getElementById("seatCount");
    this.canvasInfoSpan = document.getElementById("canvasInfo");

    this.rowOverrides = {};

    // Modal elements
    this.editModal = document.getElementById("editModal");
    this.editSeatCodeInput = document.getElementById("editSeatCode");
    this.saveSeatEditBtn = document.getElementById("saveSeatEdit");
    this.currentEditingCell = null;

    this.rowEditModal = document.getElementById("rowEditModal");
    this.editRowLabelInput = document.getElementById("editRowLabel");
    this.saveRowEditBtn = document.getElementById("saveRowEdit");
    this.currentEditingRow = null;

    this.canvasTitle = document.getElementById("canvasTitle");
    this.recenterBtn = document.getElementById("recenterBtn");

    // Multi-section logic
    this.layoutModal = document.getElementById("layoutModal");
    this.importLayoutBtn = document.getElementById("importLayout");
    this.layoutJsonPaste = document.getElementById("layoutJsonPaste");
    this.confirmImportBtn = document.getElementById("confirmImport");
    this.manualSectionField = document.getElementById("manualSectionField");
    this.closeProjectBtn = document.getElementById("closeProject");

    this.sectionsNav = document.getElementById("sectionsNav");
    this.sectionsListContainer = document.getElementById(
      "sectionsListContainer",
    );
    this.stadiumNameSpan = document.getElementById("stadiumName");

    this.stadiumData = null;
    this.allSections = [];
    this.sectionsCache = {};
    this.sectionToParentMap = {};
    this.currentSectionCode = "PISO_2/SECCION_503A";
    this.expandedNodes = new Set();

    this.parentCountSpan = document.getElementById("parentCount");
    this.leafCountSpan = document.getElementById("leafCount");
    this.exportAllZipBtn = document.getElementById("exportAllZip");

    this.STORAGE_KEY = "stadium_grid_manager_data";

    this.init();
  }

  // ─── Grid geometry helpers ───

  /** Total canvas pixel width at scale=1 */
  getGridWidth() {
    return PAD * 2 + LABEL_W + GAP + this.cols * STEP - GAP;
  }

  /** Total canvas pixel height at scale=1 */
  getGridHeight() {
    return PAD * 2 + (this.rows + 1) * STEP - GAP;
  }

  /** Returns {x, y, w, h} for a cell at (row, col). row=0 is header, col=0 is label. */
  getCellRect(row, col) {
    const x =
      col === 0 ? PAD : PAD + LABEL_W + GAP + (col - 1) * STEP;
    const y = PAD + row * STEP;
    const w = col === 0 ? LABEL_W : CELL;
    const h = CELL;
    return { x, y, w, h };
  }

  /** Hit-test: given clientX/clientY, returns {row, col, index, isLabel, isHeader} or null */
  hitTest(clientX, clientY) {
    const rect = this.canvasContainer.getBoundingClientRect();
    const viewX = clientX - rect.left;
    const viewY = clientY - rect.top;

    // Transform to grid coordinates
    const gx = (viewX - this.translateX) / this.scale;
    const gy = (viewY - this.translateY) / this.scale;

    // Header row (row index 0)
    const headerY = PAD;
    const dataStartY = PAD + STEP;

    // Determine row
    let row, col;

    if (gy >= headerY && gy < headerY + CELL) {
      row = 0; // header
    } else if (gy >= dataStartY) {
      row = Math.floor((gy - dataStartY) / STEP) + 1;
      // Check we're within the cell, not in the gap
      const cellTop = dataStartY + (row - 1) * STEP;
      if (gy > cellTop + CELL) return null; // in gap
    } else {
      return null;
    }

    // Determine col
    const labelX = PAD;
    const dataStartX = PAD + LABEL_W + GAP;

    if (gx >= labelX && gx < labelX + LABEL_W) {
      col = 0; // label column
    } else if (gx >= dataStartX) {
      col = Math.floor((gx - dataStartX) / STEP) + 1;
      const cellLeft = dataStartX + (col - 1) * STEP;
      if (gx > cellLeft + CELL) return null; // in gap
    } else {
      return null;
    }

    // Bounds check
    if (row > this.rows || col > this.cols) return null;

    // Calculate gridData index (only for data cells)
    let index = -1;
    if (row >= 1 && col >= 1) {
      index = (row - 1) * this.cols + (col - 1);
    }

    return {
      row,
      col,
      index,
      isLabel: col === 0 && row >= 1,
      isHeader: row === 0 && col >= 1,
    };
  }

  // ─── Canvas rendering ───

  renderGrid() {
    const logicalW = this.getGridWidth();
    const logicalH = this.getGridHeight();
    const dpr = window.devicePixelRatio || 1;
    const s = this.scale;

    // Never render below native DPR — keeps text crisp at any zoom-out level.
    // When scale < 1, bitmap stays at dpr resolution and CSS shrinks it.
    const res = dpr * Math.max(s, 1);
    this._renderedScale = s;

    const bitmapW = Math.ceil(logicalW * res);
    const bitmapH = Math.ceil(logicalH * res);

    this.gridCanvas.width = bitmapW;
    this.gridCanvas.height = bitmapH;

    // CSS size = logical size * scale (visual size on screen)
    this.gridCanvas.style.width = logicalW * s + "px";
    this.gridCanvas.style.height = logicalH * s + "px";

    // Reset CSS transform to translate-only (zoom is baked into bitmap)
    this.gridCanvas.style.transform = `translate(${this.translateX}px, ${this.translateY}px)`;

    const ctx = this.ctx;
    ctx.setTransform(res, 0, 0, res, 0, 0); // scale all drawing by res
    ctx.clearRect(0, 0, logicalW, logicalH);

    // Corner cell (row 0, col 0) — dashed border
    const corner = this.getCellRect(0, 0);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = COLORS.cornerBorder;
    ctx.lineWidth = 1;
    this.strokeRoundRect(ctx, corner.x, corner.y, corner.w, corner.h, 4);
    ctx.setLineDash([]);

    // Column headers (row 0, col 1..cols)
    for (let c = 1; c <= this.cols; c++) {
      const r = this.getCellRect(0, c);
      this.fillGradientRect(ctx, r.x, r.y, r.w, r.h, 4, COLORS.labelA, COLORS.labelB, "vertical");
      ctx.fillStyle = COLORS.labelText;
      ctx.font = "600 10px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.formatColumn(c), r.x + r.w / 2, r.y + r.h / 2);
    }

    // Rows
    for (let row = 1; row <= this.rows; row++) {
      // Row label (col 0)
      const lr = this.getCellRect(row, 0);
      this.fillGradientRect(ctx, lr.x, lr.y, lr.w, lr.h, 4, COLORS.labelA, COLORS.labelB, "diagonal");
      ctx.fillStyle = COLORS.labelText;
      ctx.font = "600 10px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.getRowLabel(row), lr.x + lr.w / 2, lr.y + lr.h / 2);

      // Data cells
      for (let col = 1; col <= this.cols; col++) {
        const idx = (row - 1) * this.cols + (col - 1);
        const cell = this.gridData[idx];
        if (!cell) continue;

        const cr = this.getCellRect(row, col);
        const isHovered = idx === this.hoveredCell;

        if (cell.type === "seat") {
          ctx.fillStyle = isHovered ? COLORS.seatHover : COLORS.seat;
          this.fillRoundRect(ctx, cr.x, cr.y, cr.w, cr.h, 4);

          ctx.fillStyle = COLORS.text;
          ctx.font = "600 8px Outfit, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(cell.code, cr.x + cr.w / 2, cr.y + cr.h / 2);
        } else {
          // empty
          ctx.fillStyle = isHovered ? COLORS.emptyHover : COLORS.empty;
          this.fillRoundRect(ctx, cr.x, cr.y, cr.w, cr.h, 4);
          ctx.strokeStyle = isHovered ? COLORS.emptyHoverBorder : COLORS.emptyBorder;
          ctx.lineWidth = 1;
          this.strokeRoundRect(ctx, cr.x, cr.y, cr.w, cr.h, 4);
        }
      }
    }
  }

  fillRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  strokeRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.stroke();
  }

  fillGradientRect(ctx, x, y, w, h, r, colorA, colorB, dir) {
    let grad;
    if (dir === "vertical") {
      grad = ctx.createLinearGradient(x, y, x, y + h);
    } else {
      grad = ctx.createLinearGradient(x, y, x + w, y + h);
    }
    grad.addColorStop(0, colorA);
    grad.addColorStop(1, colorB);
    ctx.fillStyle = grad;
    this.fillRoundRect(ctx, x, y, w, h, r);
  }

  // ─── Transform ───

  updateTransform() {
    // Position only — no CSS scale (zoom is baked into canvas bitmap)
    this.gridCanvas.style.transform = `translate(${this.translateX}px, ${this.translateY}px)`;
    this.canvasContainer.style.backgroundPosition = `${this.translateX}px ${this.translateY}px`;
  }

  recenterView() {
    const containerRect = this.canvasContainer.getBoundingClientRect();
    const gridW = this.getGridWidth();
    const gridH = this.getGridHeight();
    const pad = 24; // breathing room around grid

    // Fit: max zoom where entire grid fits in the container
    const fitScale = Math.min(
      (containerRect.width - pad * 2) / gridW,
      (containerRect.height - pad * 2) / gridH,
    );
    this.scale = Math.min(Math.max(fitScale, 0.1), 5);

    // Center the scaled grid in the container
    const scaledW = gridW * this.scale;
    const scaledH = gridH * this.scale;
    this.translateX = (containerRect.width - scaledW) / 2;
    this.translateY = (containerRect.height - scaledH) / 2;

    this.renderGrid();
    this.updateTransform();
  }

  // ─── Init & Events ───

  init() {
    this.setupEventListeners();
    this.loadFromLocalStorage();
    if (!this.stadiumData) {
      this.resetGrid();
    }

    // Re-render once fonts are loaded so canvas text is crisp
    document.fonts.ready.then(() => {
      this.renderGrid();
      this.updateTransform();
    });
  }

  setupEventListeners() {
    // Real-time Configuration Sync
    const configInputs = [
      this.rowsInput,
      this.colsInput,
      this.sectionInput,
      this.namingTypeInput,
      this.rowStartInput,
      this.colStartInput,
      this.invertRowsInput,
      this.invertColsInput,
      this.zeroPaddingInput,
      this.namePatternInput,
    ];

    configInputs.forEach((input) => {
      const eventType =
        input.tagName === "SELECT" || input.type === "checkbox"
          ? "change"
          : "input";
      input.addEventListener(eventType, () => {
        this.resetGrid();
        this.saveCurrentToCache();
      });
    });

    // Tool Picker
    this.toolBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.toolBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentTool = btn.dataset.tool;
        this.appContainer.setAttribute("data-current-tool", this.currentTool);
      });
    });

    // Infinite Canvas Events
    this.canvasContainer.addEventListener("mousedown", (e) =>
      this.handleGlobalMouseDown(e),
    );
    this._boundMouseMove = (e) => this.handleGlobalMouseMove(e);
    this._boundMouseUp = () => this.handleGlobalMouseUp();
    window.addEventListener("mousemove", this._boundMouseMove);
    window.addEventListener("mouseup", this._boundMouseUp);
    this.canvasContainer.addEventListener("wheel", (e) => this.handleWheel(e), {
      passive: false,
    });

    // Prevent context menu on canvas
    this.gridCanvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Bulk shortcuts
    this.applyNamingBtn.addEventListener("click", () => this.resetGrid());
    this.fillAllBtn.addEventListener("click", () => this.bulkSetType("seat"));
    this.clearAllBtn.addEventListener("click", () => this.bulkSetType("empty"));

    // Multi-section Events
    this.importLayoutBtn.addEventListener("click", () =>
      this.layoutModal.showModal(),
    );
    this.confirmImportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.processLayoutJson();
    });
    this.closeProjectBtn.addEventListener("click", () => this.resetProject());
    this.recenterBtn.addEventListener("click", () => this.recenterView());

    // Export
    this.exportBtn.addEventListener("click", () => this.exportToCSV());
    this.exportAllZipBtn.addEventListener("click", () => this.exportToZip());

    // Modal
    this.saveSeatEditBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.saveManualEdit();
    });

    this.saveRowEditBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.saveRowManualEdit();
    });
  }

  // ─── Mouse Handlers ───

  handleGlobalMouseDown(e) {
    const hit = this.hitTest(e.clientX, e.clientY);

    if (hit && e.button === 0 && this.currentTool !== "edit") {
      if (hit.index >= 0) {
        // Start painting
        this.isMouseDown = true;
        this.lastPaintedIndex = -1;
        this.handleCellAction(hit.index);
        return;
      }
    }

    // Edit tool: single click on cell or label
    if (hit && e.button === 0 && this.currentTool === "edit") {
      this.dragDist = 0;
      this.isPanning = true;
      this.startX = e.pageX - this.translateX;
      this.startY = e.pageY - this.translateY;
      this.isMouseDown = true;
      this._editHit = hit; // save for mouseUp
      return;
    }

    // Panning
    this.isPanning = true;
    this.startX = e.pageX - this.translateX;
    this.startY = e.pageY - this.translateY;
    this.dragDist = 0;
    this.isMouseDown = true;
  }

  handleGlobalMouseMove(e) {
    if (this.isPanning) {
      this.translateX = e.pageX - this.startX;
      this.translateY = e.pageY - this.startY;
      this.updateTransform();
      this.dragDist += 1;
      return;
    }

    // Drag-painting
    if (this.isMouseDown && this.currentTool !== "edit") {
      const hit = this.hitTest(e.clientX, e.clientY);
      if (hit && hit.index >= 0 && hit.index !== this.lastPaintedIndex) {
        this.handleCellAction(hit.index);
      }
      return;
    }

    // Hover tracking
    const hit = this.hitTest(e.clientX, e.clientY);
    const newHover = hit && hit.index >= 0 ? hit.index : -1;
    if (newHover !== this.hoveredCell) {
      this.hoveredCell = newHover;
      this.renderGrid();
    }
  }

  handleGlobalMouseUp() {
    // Edit tool: handle click (not drag) on mouseUp
    if (this._editHit && this.dragDist < 5) {
      const hit = this._editHit;
      if (hit.isLabel) {
        this.currentEditingRow = hit.row;
        this.editRowLabelInput.value = this.getRowLabel(hit.row);
        this.rowEditModal.showModal();
      } else if (hit.index >= 0) {
        this.openEditModal(hit.index);
      }
    }
    this._editHit = null;
    this.isMouseDown = false;
    this.isPanning = false;
    this.lastPaintedIndex = -1;
  }

  handleWheel(e) {
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 100);
    const newScale = Math.min(Math.max(this.scale * factor, 0.1), 5);

    const rect = this.canvasContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const gridX = (mouseX - this.translateX) / this.scale;
    const gridY = (mouseY - this.translateY) / this.scale;

    this.translateX = mouseX - gridX * newScale;
    this.translateY = mouseY - gridY * newScale;

    // During active zooming, use CSS scale for speed (relative to last rendered scale)
    const cssScale = newScale / this._renderedScale;
    this.gridCanvas.style.transform =
      `translate(${this.translateX}px, ${this.translateY}px) scale(${cssScale})`;
    this.canvasContainer.style.backgroundPosition =
      `${this.translateX}px ${this.translateY}px`;

    this.scale = newScale;

    // Debounce: re-render at full resolution when user stops scrolling
    clearTimeout(this._zoomTimer);
    this._zoomTimer = setTimeout(() => {
      this.renderGrid();
      this.updateTransform();
    }, 100);
  }

  // ─── Cell Actions ───

  handleCellAction(index) {
    const cell = this.gridData[index];
    if (!cell) return;

    if (this.currentTool === "seat") {
      cell.type = "seat";
    } else if (this.currentTool === "empty") {
      cell.type = "empty";
    }

    this.lastPaintedIndex = index;
    this.renderGrid();
    this.updateStats();
    this.saveCurrentToCache();
  }

  openEditModal(index) {
    this.currentEditingCell = index;
    this.editSeatCodeInput.value = this.gridData[index].code;
    this.editModal.showModal();
  }

  saveManualEdit() {
    if (this.currentEditingCell !== null) {
      const index = this.currentEditingCell;
      const newCode = this.editSeatCodeInput.value.trim();
      this.gridData[index].code = newCode;
      this.gridData[index].type = "seat";

      this.editModal.close();
      this.renderGrid();
      this.updateStats();
      this.saveCurrentToCache();
    }
  }

  saveRowManualEdit() {
    if (this.currentEditingRow !== null) {
      const rowIndex = this.currentEditingRow;
      const newLabel = this.editRowLabelInput.value.trim();
      if (newLabel) {
        this.rowOverrides[rowIndex] = newLabel;
      } else {
        delete this.rowOverrides[rowIndex];
      }
      this.rowEditModal.close();
      this.renderGrid();
      this.saveCurrentToCache();
    }
  }

  bulkSetType(type) {
    this.gridData.forEach((cell) => {
      cell.type = type;
    });
    this.renderGrid();
    this.updateStats();
    this.saveCurrentToCache();
  }

  // ─── Grid Data ───

  resetGrid() {
    const newRows = parseInt(this.rowsInput.value) || 10;
    const newCols = parseInt(this.colsInput.value) || 15;
    this.sectionCode = this.sectionInput.value || "SECTION";
    this.currentSectionCode = this.sectionCode;
    if (this.canvasTitle) this.canvasTitle.textContent = this.sectionCode;

    const oldDataMap = {};
    this.gridData.forEach((cell) => {
      oldDataMap[`${cell.row}-${cell.col}`] = {
        type: cell.type,
        code: cell.code,
      };
    });

    this.rows = newRows;
    this.cols = newCols;
    this.gridData = [];

    for (let r = 1; r <= this.rows; r++) {
      for (let c = 1; c <= this.cols; c++) {
        const key = `${r}-${c}`;
        if (oldDataMap[key]) {
          this.gridData.push({
            row: r,
            col: c,
            type: oldDataMap[key].type,
            code: this.generateCode(r, c),
          });
        } else {
          this.gridData.push({
            row: r,
            col: c,
            type: "seat",
            code: this.generateCode(r, c),
          });
        }
      }
    }

    this.updateStats();
    this.recenterView();
  }

  // ─── Row/Col Labels & Code Generation (unchanged) ───

  getRowLabel(rowIndex) {
    if (this.rowOverrides[rowIndex]) return this.rowOverrides[rowIndex];

    const type = this.namingTypeInput.value;
    const start = this.rowStartInput.value;
    const isInverted = this.invertRowsInput.checked;
    const logicalIndex = isInverted ? this.rows - rowIndex + 1 : rowIndex;

    if (type === "alpha") {
      return this.calculateAlphaLabel(logicalIndex, start);
    } else {
      const startNum = parseInt(start) || 1;
      return (startNum + logicalIndex - 1).toString();
    }
  }

  calculateAlphaLabel(rowIndex, start) {
    const getVal = (s) => {
      let res = 0;
      for (let i = 0; i < s.length; i++) {
        res = res * 26 + (s.charCodeAt(i) - 64);
      }
      return res;
    };
    const getStr = (v) => {
      let res = "";
      while (v > 0) {
        let m = (v - 1) % 26;
        res = String.fromCharCode(65 + m) + res;
        v = Math.floor((v - m) / 26);
      }
      return res || "A";
    };

    const startVal = getVal(start.toUpperCase().replace(/[^A-Z]/g, "A") || "A");
    return getStr(startVal + rowIndex - 1);
  }

  formatColumn(colIndex) {
    const start = parseInt(this.colStartInput.value) || 1;
    const isInverted = this.invertColsInput.checked;
    const logicalIndex = isInverted ? this.cols - colIndex + 1 : colIndex;
    const actualNum = start + logicalIndex - 1;

    if (!this.zeroPaddingInput.checked) return actualNum.toString();

    const maxVal = start + this.cols - 1;
    let padLength = 2;
    if (maxVal >= 100) padLength = 3;
    if (maxVal >= 1000) padLength = 4;

    return actualNum.toString().padStart(padLength, "0");
  }

  generateCode(row, col) {
    const pattern = this.namePatternInput
      ? this.namePatternInput.value
      : "$ROW-$COL";
    const colVal = this.formatColumn(col);
    const rowLabel = this.getRowLabel(row);

    return pattern.replace("$ROW", rowLabel).replace("$COL", colVal);
  }

  // ─── Multi-section (unchanged) ───

  processLayoutJson() {
    try {
      const json = JSON.parse(this.layoutJsonPaste.value);
      this.stadiumData = json;
      this.allSections = [];
      this.extractLeafSections(json.sections || []);

      if (this.allSections.length > 0) {
        this.sectionsNav.style.display = "flex";
        this.stadiumNameSpan.textContent = json.name || "Stadium Layout";
        this.sectionInput.readOnly = true;
        this.layoutModal.close();

        this.updateProjectStats();

        const firstCode = this.allSections[0];
        if (!this.sectionsCache[firstCode]) {
          this.switchSection(firstCode);
        } else {
          this.renderSectionsList();
          this.switchSection(firstCode);
        }
        this.persistProject();
      } else {
        alert("No leaf sections (unnumbered: false) found in the JSON.");
      }
    } catch (e) {
      alert("Invalid JSON format.");
      console.error(e);
    }
  }

  extractLeafSections(sections, parentCode = null) {
    sections.forEach((s) => {
      if (s.unnumbered === true) return;

      if (s.sections && s.sections.length > 0) {
        this.extractLeafSections(s.sections, s.code);
      } else {
        this.allSections.push(s.code);
        if (parentCode) {
          this.sectionToParentMap[s.code] = parentCode;
        }
      }
    });
  }

  updateProjectStats() {
    if (!this.stadiumData) return;

    let parentCount = 0;
    let leafCount = 0;

    const countRecursive = (sections) => {
      sections.forEach((s) => {
        if (s.unnumbered === true) return;
        if (s.sections && s.sections.length > 0) {
          parentCount++;
          countRecursive(s.sections);
        } else {
          leafCount++;
        }
      });
    };

    countRecursive(this.stadiumData.sections || []);
    this.parentCountSpan.textContent = parentCount;
    this.leafCountSpan.textContent = leafCount;
  }

  renderSectionsList() {
    this.sectionsListContainer.innerHTML = "";
    if (this.stadiumData && this.stadiumData.sections) {
      this.renderSectionTree(
        this.stadiumData.sections,
        this.sectionsListContainer,
      );
    }
  }

  renderSectionTree(sections, container) {
    let subtreeHasActive = false;
    let subtreeStatus = {
      totalLeaves: 0,
      configuredLeaves: 0,
    };

    sections.forEach((s) => {
      if (s.unnumbered === true) return;

      if (s.sections && s.sections.length > 0) {
        const node = document.createElement("div");
        node.className = "tree-node";

        const header = document.createElement("div");
        header.className = "tree-header";

        const group = document.createElement("div");
        group.className = "tree-group";

        const { hasActive, stats } = this.renderSectionTree(s.sections, group);

        const allConfigured =
          stats.totalLeaves > 0 && stats.totalLeaves === stats.configuredLeaves;
        const nodeKey = `node_${s.code}`;

        header.innerHTML = `
          <span class="tree-toggle">▶</span>
          <span class="status-dot ${allConfigured ? "configured" : "empty"}"></span>
          <span class="name">${s.name || s.code}</span>
          <span class="count">(${stats.totalLeaves})</span>
        `;

        header.onclick = () => {
          const isExpanded = group.classList.toggle("expanded");
          node.classList.toggle("expanded", isExpanded);
          if (isExpanded) this.expandedNodes.add(nodeKey);
          else this.expandedNodes.delete(nodeKey);
        };

        if (hasActive || this.expandedNodes.has(nodeKey)) {
          group.classList.add("expanded");
          node.classList.add("expanded");
        }
        if (hasActive) {
          subtreeHasActive = true;
        }

        subtreeStatus.totalLeaves += stats.totalLeaves;
        subtreeStatus.configuredLeaves += stats.configuredLeaves;

        node.appendChild(header);
        node.appendChild(group);
        container.appendChild(node);
      } else {
        const cached = this.sectionsCache[s.code];
        const hasSeats =
          cached && cached.gridData.some((c) => c.type === "seat");
        const isConfigured = !!cached && hasSeats;

        if (s.code === this.currentSectionCode) {
          subtreeHasActive = true;
        }

        subtreeStatus.totalLeaves += 1;
        if (isConfigured) subtreeStatus.configuredLeaves += 1;

        const button = document.createElement("button");
        button.className = `section-item ${s.code === this.currentSectionCode ? "active" : ""}`;
        button.innerHTML = `
          <span class="status-dot ${isConfigured ? "configured" : "empty"}"></span>
          <span class="name">${s.name || s.code}</span>
        `;
        button.onclick = () => this.switchSection(s.code);
        container.appendChild(button);
      }
    });

    return { hasActive: subtreeHasActive, stats: subtreeStatus };
  }

  switchSection(newCode) {
    if (
      !newCode ||
      (newCode === this.currentSectionCode && this.sectionsCache[newCode])
    )
      return;

    if (this.currentSectionCode) {
      this.saveCurrentToCache();
    }

    this.currentSectionCode = newCode;
    this.sectionInput.value = newCode;
    this.canvasTitle.textContent = newCode;

    if (this.sectionsCache[newCode]) {
      this.loadFromCache(newCode);
    } else {
      this.rowsInput.value = 10;
      this.colsInput.value = 15;
      this.rowOverrides = {};
      this.gridData = [];
      this.resetGrid();
    }

    this.renderSectionsList();
    this.persistProject();
  }

  // ─── Cache & Persistence (unchanged) ───

  saveCurrentToCache() {
    if (!this.currentSectionCode) return;
    this.sectionsCache[this.currentSectionCode] = {
      gridData: JSON.parse(JSON.stringify(this.gridData)),
      rows: this.rows,
      cols: this.cols,
      rowOverrides: { ...this.rowOverrides },
      config: {
        rowStart: this.rowStartInput.value,
        colStart: this.colStartInput.value,
        namingType: this.namingTypeInput.value,
        invertRows: this.invertRowsInput.checked,
        invertCols: this.invertColsInput.checked,
        namePattern: this.namePatternInput.value,
        zeroPadding: this.zeroPaddingInput.checked,
      },
    };
    this.renderSectionsList();
    this.persistProject();
  }

  loadFromCache(code) {
    const cache = this.sectionsCache[code];
    const cfg = cache.config || {};

    this.rowsInput.value = cache.rows;
    this.colsInput.value = cache.cols;
    this.rowStartInput.value = cfg.rowStart || "1";
    this.colStartInput.value = cfg.colStart || "1";
    this.namingTypeInput.value = cfg.namingType || "numeric";
    this.invertRowsInput.checked = !!cfg.invertRows;
    this.invertColsInput.checked = !!cfg.invertCols;
    this.namePatternInput.value = cfg.namePattern || "$ROW-$COL";
    this.zeroPaddingInput.checked = !!cfg.zeroPadding;

    this.rowOverrides = cache.rowOverrides || {};
    this.gridData = cache.gridData;
    this.rows = cache.rows;
    this.cols = cache.cols;

    this.updateStats();
    this.canvasTitle.textContent = code;
    this.recenterView();
  }

  persistProject() {
    const data = {
      stadiumData: this.stadiumData,
      allSections: this.allSections,
      sectionsCache: this.sectionsCache,
      currentSectionCode: this.currentSectionCode,
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }

  loadFromLocalStorage() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      this.stadiumData = data.stadiumData;
      this.currentSectionCode = data.currentSectionCode;
      this.sectionsCache = data.sectionsCache || {};

      if (this.currentSectionCode) {
        this.sectionInput.value = this.currentSectionCode;
        if (this.canvasTitle)
          this.canvasTitle.textContent = this.currentSectionCode;
      }

      if (this.stadiumData) {
        this.allSections = [];
        this.sectionToParentMap = {};
        this.extractLeafSections(this.stadiumData.sections || []);

        this.sectionsNav.style.display = "flex";
        this.stadiumNameSpan.textContent =
          this.stadiumData.name || "Stadium Layout";
        this.sectionInput.readOnly = true;
        this.updateProjectStats();
        this.renderSectionsList();
        if (this.currentSectionCode) {
          this.loadFromCache(this.currentSectionCode);
        }
      }
    } catch (e) {
      console.error("Failed to load from localStorage", e);
    }
  }

  resetProject() {
    if (
      confirm(
        "Are you sure you want to close this project? All unsaved grid progress will be lost (cached data in localStorage will be cleared).",
      )
    ) {
      this.stadiumData = null;
      this.allSections = [];
      this.sectionsCache = {};
      this.currentSectionCode = "PISO_2/SECCION_503A";

      localStorage.removeItem(this.STORAGE_KEY);

      this.sectionsNav.style.display = "none";
      this.sectionInput.readOnly = false;
      this.sectionInput.value = this.currentSectionCode;
      this.canvasTitle.textContent = "";

      this.resetGrid();
    }
  }

  // ─── Stats & Export (unchanged) ───

  updateStats() {
    const seats = this.gridData.filter((c) => c.type === "seat").length;
    this.seatCountSpan.textContent = `Seats: ${seats}`;
    this.canvasInfoSpan.textContent = `${this.rows}x${this.cols} Grid`;
  }

  getRowLabelWithConfig(rowIndex, config, totalRows, rowOverrides) {
    if (rowOverrides && rowOverrides[rowIndex]) return rowOverrides[rowIndex];

    const type = config.namingType || "numeric";
    const start = config.rowStart || "1";
    const isInverted = !!config.invertRows;

    const logicalIndex = isInverted ? totalRows - rowIndex + 1 : rowIndex;

    if (type === "alpha") {
      return this.calculateAlphaLabel(logicalIndex, start);
    } else {
      const startNum = parseInt(start) || 1;
      return (startNum + logicalIndex - 1).toString();
    }
  }

  generateCSVContent(gridData, sectionCode, config, rowOverrides) {
    const header = "Section,Row,Seat";
    const rows = [header];
    const totalRows = config ? config.rows : this.rows;

    gridData.forEach((cell) => {
      if (cell.type === "seat") {
        const rowLabel = config
          ? this.getRowLabelWithConfig(cell.row, config, totalRows, rowOverrides)
          : this.getRowLabel(cell.row);
        rows.push(`${sectionCode},${rowLabel},${cell.code}`);
      }
    });

    return rows.join("\n");
  }

  exportToCSV() {
    const sectionCode = this.sectionInput.value || "SECTION";
    const csvContent = this.generateCSVContent(this.gridData, sectionCode);

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);

    const fileName = sectionCode.replace(/[\/\\ ]/g, "_") + ".csv";
    link.setAttribute("download", fileName);
    link.click();
  }

  async exportToZip() {
    if (!this.stadiumData) {
      alert("No stadium data loaded.");
      return;
    }

    this.saveCurrentToCache();

    const zip = new JSZip();
    let filesAdded = 0;

    this.allSections.forEach((code) => {
      const cached = this.sectionsCache[code];

      if (!cached) return;

      const hasSeats = cached.gridData.some((c) => c.type === "seat");
      if (!hasSeats) return;

      const csv = this.generateCSVContent(
        cached.gridData,
        code,
        { ...cached.config, rows: cached.rows },
        cached.rowOverrides,
      );

      const parentCode = this.sectionToParentMap[code] || "OTHERS";
      const safeParent = parentCode.replace(/[\/\\ ]/g, "_");
      const safeLeaf = code.replace(/[\/\\ ]/g, "_");

      zip.folder(safeParent).file(`${safeLeaf}.csv`, csv);
      filesAdded++;
    });

    if (filesAdded === 0) {
      alert("No configured sections to export.");
      return;
    }

    try {
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");

      const stadiumSafe = (this.stadiumData.name || "stadium").replace(
        /\s+/g,
        "_",
      );
      link.setAttribute("href", url);
      link.setAttribute("download", `${stadiumSafe}_layout.zip`);
      link.click();
    } catch (err) {
      console.error("ZIP Generation failed", err);
      alert("Generation failed. Check console for details.");
    }
  }

  destroy() {
    window.removeEventListener("mousemove", this._boundMouseMove);
    window.removeEventListener("mouseup", this._boundMouseUp);
  }
}

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  window.manager = new GridManager();
});
