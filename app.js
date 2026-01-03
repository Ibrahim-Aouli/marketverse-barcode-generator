/* ======================================================
   MARKETVERSE — BULK BARCODE BUILDER
   Author: MarketVerse
   Purpose: Generate printable barcode labels (preview, bulk sheets, PNG, PDF)
   DPI: 300 (print-ready)
   ====================================================== */


/* ======================================================
   STEP 0 — GLOBAL SETUP & CONSTANTS
   ====================================================== */

/**
 * External library
 * jsPDF → PDF export
 */
const { jsPDF } = window.jspdf;

/**
 * Print conversion helpers
 * 300 DPI → millimetres to pixels
 */
const PX_PER_MM = 300 / 25.4;
const mm2px = mm => mm * PX_PER_MM;

/**
 * Main preview canvas
 */
const canvas = document.getElementById("barcodeCanvas");
const ctx = canvas.getContext("2d");

/**
 * Runtime state
 */
let bgImage = null;        // Optional background template image
let renderedPages = [];   // Generated sheet canvases
let cancelRender = false; // Cancel flag for long renders


/* ======================================================
   STEP 1 — SETTINGS SAVE / LOAD (LocalStorage)
   ====================================================== */

const inputs = document.querySelectorAll("input,select,textarea");

/**
 * Save all UI settings (except file inputs)
 */
function saveSettings() {
  const data = {};

  inputs.forEach(el => {
    if (el.type === "file") return;
    data[el.id] = el.type === "checkbox" ? el.checked : el.value;
  });

  localStorage.setItem("mv_barcode_settings", JSON.stringify(data));
}

/**
 * Restore saved UI state
 */
function loadSettings() {
  const saved = localStorage.getItem("mv_barcode_settings");
  if (!saved) return;

  const data = JSON.parse(saved);
  for (const id in data) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.type === "checkbox" ? el.checked = data[id] : el.value = data[id];
  }
}


/* ======================================================
   STEP 2 — TEXT WRAPPING ENGINE (TITLE)
   Handles multi-line text + ellipsis inside fixed box
   ====================================================== */

function drawWrappedText({
  ctx, x, y, w, h,
  text,
  fontSize,
  lineHeight,
  align,
  vAlign,
  color,
  fontWeight,
  fontFamily
}) {
  ctx.save();

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;

  const linePx = fontSize * lineHeight;
  const maxLines = Math.floor(h / linePx);
  const words = text.split(/\s+/);
  const lines = [];
  const ellipsis = "…";

  let currentLine = "";

  // STEP 2.1 — Build lines within width
  for (const word of words) {
    const test = currentLine ? currentLine + " " + word : word;
    if (ctx.measureText(test).width > w && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines) break;
    } else {
      currentLine = test;
    }
  }

  if (lines.length < maxLines && currentLine) {
    lines.push(currentLine);
  }

  lines.length = Math.min(lines.length, maxLines);

  // STEP 2.2 — Ellipsis overflow handling
  let lastLine = lines[lines.length - 1];
  while (ctx.measureText(lastLine + ellipsis).width > w && lastLine.length) {
    lastLine = lastLine.slice(0, -1);
  }
  lines[lines.length - 1] = lastLine + ellipsis;

  // STEP 2.3 — Vertical alignment
  const totalHeight = lines.length * linePx;
  let startY = y + fontSize;

  if (vAlign === "center") startY = y + (h - totalHeight) / 2 + fontSize;
  if (vAlign === "bottom") startY = y + h - totalHeight + fontSize;

  // STEP 2.4 — Render lines
  lines.forEach((ln, i) => {
    const drawY = startY + i * linePx;
    const drawX =
      align === "center" ? x + w / 2 :
      align === "right"  ? x + w :
                           x;

    ctx.fillText(ln, drawX, drawY);
  });

  ctx.restore();
}


/* ======================================================
   STEP 3 — DRAW SINGLE LABEL
   ====================================================== */

function drawLabelToCtx(ctxObj, title, sku, opts = {}) {

  const {
    labelW = 40, labelH = 30,
    headerH = 5, titleH = 6, barcodeH = 14, skuH = 2, footerH = 3,

    titleFontFamily, titleFontWeight, titleFontSize, titleLineHeight,
    titleAlign, titleVAlign, titleColor,

    skuFontFamily, skuFontWeight, skuFontSize, skuAlign, skuColor,

    showZones, zoneOpacity
  } = opts;

  const W = mm2px(labelW);
  const H = mm2px(labelH);

  ctxObj.save();

  // STEP 3.1 — Background
  ctxObj.fillStyle = "#fff";
  ctxObj.fillRect(0, 0, W, H);
  if (bgImage) ctxObj.drawImage(bgImage, 0, 0, W, H);

  // STEP 3.2 — Optional debug zones
  if (showZones) {
    ctxObj.globalAlpha = zoneOpacity || 0.25;
    const colors = ["#ff9999", "#99ff99", "#9999ff", "#ffccff", "#ffff99"];
    let y = 0;
    [headerH, titleH, barcodeH, skuH, footerH].forEach((h, i) => {
      ctxObj.fillStyle = colors[i];
      ctxObj.fillRect(0, y, W, mm2px(h));
      y += mm2px(h);
    });
    ctxObj.globalAlpha = 1;
  }

  let yPos = mm2px(headerH);

  // STEP 3.3 — Title
  drawWrappedText({
    ctx: ctxObj,
    x: 0,
    y: yPos,
    w: W,
    h: mm2px(titleH),
    text: title,
    fontSize: +titleFontSize,
    lineHeight: +titleLineHeight,
    align: titleAlign,
    vAlign: titleVAlign,
    color: titleColor,
    fontWeight: titleFontWeight,
    fontFamily: titleFontFamily
  });

  yPos += mm2px(titleH);

  // STEP 3.4 — Barcode
  const barCanvas = document.createElement("canvas");
  barCanvas.width = mm2px(labelW - 2);
  barCanvas.height = mm2px(barcodeH);

  JsBarcode(barCanvas, sku, {
    format: "CODE128",
    displayValue: false,
    width: 2,
    height: barCanvas.height,
    margin: 0,
    background: null
  });

  ctxObj.drawImage(barCanvas, mm2px(1), yPos);
  yPos += mm2px(barcodeH);

  // STEP 3.5 — SKU text
  ctxObj.font = `${skuFontWeight} ${skuFontSize}px ${skuFontFamily}`;
  ctxObj.fillStyle = skuColor;
  ctxObj.textAlign = skuAlign;
  ctxObj.textBaseline = "top";

  const skuX =
    skuAlign === "center" ? W / 2 :
    skuAlign === "right"  ? W - mm2px(1) :
                            mm2px(1);

  ctxObj.fillText(sku, skuX, yPos);

  ctxObj.restore();
}


/* ======================================================
   STEP 4 — PREVIEW RENDER
   ====================================================== */

function renderPreview() {
  saveSettings();

  const W = mm2px(+labelWidth.value);
  const H = mm2px(+labelHeight.value);

  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  drawLabelToCtx(ctx, titleInput.value, skuInput.value, getCurrentOptions());
}


/* ======================================================
   STEP 5 — COLLECT CURRENT OPTIONS
   ====================================================== */

function getCurrentOptions() {
  return {
    labelW: +labelWidth.value,
    labelH: +labelHeight.value,

    headerH: +headerHeight.value,
    titleH: +titleHeight.value,
    barcodeH: +barcodeHeight.value,
    skuH: +skuHeight.value,
    footerH: +footerHeight.value,

    titleFontFamily: titleFontFamily.value,
    titleFontWeight: titleFontWeight.value,
    titleFontSize: +titleFontSize.value,
    titleLineHeight: +titleLineHeight.value,
    titleAlign: titleAlign.value,
    titleVAlign: titleVAlign.value,
    titleColor: titleColor.value,

    skuFontFamily: skuFontFamily.value,
    skuFontWeight: skuFontWeight.value,
    skuFontSize: +skuFontSize.value,
    skuAlign: skuAlign.value,
    skuColor: skuColor.value,

    showZones: toggleZones.checked,
    zoneOpacity: +zoneOpacity.value / 100
  };
}


/* ======================================================
   STEP 6 — LIVE UI HOOKS
   ====================================================== */

inputs.forEach(el => el.addEventListener("input", renderPreview));

templateUpload.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    bgImage = new Image();
    bgImage.onload = renderPreview;
    bgImage.src = reader.result;
  };
  reader.readAsDataURL(file);
});

zoneOpacity.addEventListener("input", () => {
  zoneOpacityVal.textContent = zoneOpacity.value + "%";
  renderPreview();
});


/* ======================================================
   STEP 7 — INIT
   ====================================================== */

loadSettings();
renderPreview();
setInterval(saveSettings, 5000);


/* ======================================================
   STEP 8 — BULK INPUT PARSING
   ====================================================== */

function parseBulkInput() {
  const txt = bulkInput.value.trim();
  if (!txt) return [];

  const items = [];

  txt.split(/\r?\n/).forEach(line => {
    const cols = line.split(/\t+/).map(c => c.trim());
    if (cols.length < 2) return;

    const title = cols[0];
    const sku = cols[1];
    const qty = parseInt(cols[2] || "1", 10);

    if (!sku || qty <= 0) return;
    for (let i = 0; i < qty; i++) items.push({ title, sku });
  });

  return items;
}

/* ======================================================
   STEP 9 — PAGE SIZE & LAYOUT CALCULATIONS
   ====================================================== */

/**
 * STEP 9.1 — Resolve paper size in millimetres
 * Defaults to A4 if not A3
 */
function getPaperSizeMM(name) {
  return name === "A3" ? [420, 297] : [297, 210];
}

/* ======================================================
   STEP 10 — BULK SHEET GENERATION
   Builds full printable pages from parsed label items
   ====================================================== */

async function generateSheets() {

  // STEP 10.1 — Reset render state
  cancelRender = false;
  renderedPages = [];

  // STEP 10.2 — Parse bulk input
  const items = parseBulkInput();
  if (items.length === 0) {
    alert("No valid items to render.");
    return;
  }

  // STEP 10.3 — Gather layout options
  const opts = getCurrentOptions();
  const [paperW, paperH] = getPaperSizeMM(paperSize.value);

  const margin = +document.getElementById("margin").value || 3;
  const gap = +document.getElementById("gap").value || 3;

  const labelW = opts.labelW;
  const labelH = opts.labelH;

  // STEP 10.4 — Calculate usable area
  const usableW = paperW - margin * 2;
  const usableH = paperH - margin * 2;

  // STEP 10.5 — Calculate grid layout
  const perRow = Math.floor((usableW + gap) / (labelW + gap));
  const perCol = Math.floor((usableH + gap) / (labelH + gap));
  const perPage = perRow * perCol;

  const totalPages = Math.ceil(items.length / perPage);

  updateProgress(
    0,
    `Starting render — ${items.length} labels, ${totalPages} page(s).`
  );

  /* --------------------------------------
     STEP 10.6 — PAGE GENERATION LOOP
     -------------------------------------- */
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {

    if (cancelRender) break;

    // Create page canvas
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = mm2px(paperW);
    pageCanvas.height = mm2px(paperH);

    const pctx = pageCanvas.getContext("2d");
    pctx.fillStyle = "#fff";
    pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

    // Determine item range for this page
    const startIdx = pageIndex * perPage;
    const endIdx = Math.min(items.length, startIdx + perPage);
    let currentItem = startIdx;

    /* --------------------------------------
       STEP 10.7 — GRID FILL (ROW × COLUMN)
       -------------------------------------- */
    for (let row = 0; row < perCol; row++) {
      for (let col = 0; col < perRow; col++) {

        if (currentItem >= endIdx) break;

        const item = items[currentItem++];

        const x = mm2px(margin + col * (labelW + gap));
        const y = mm2px(margin + row * (labelH + gap));

        // Render label to offscreen canvas
        const subCanvas = document.createElement("canvas");
        subCanvas.width = mm2px(labelW);
        subCanvas.height = mm2px(labelH);

        const sctx = subCanvas.getContext("2d");
        drawLabelToCtx(sctx, item.title, item.sku, opts);

        // Draw label onto page
        pctx.drawImage(subCanvas, x, y);
      }
    }

    renderedPages.push(pageCanvas);

    const percent = Math.round(((pageIndex + 1) / totalPages) * 100);
    updateProgress(percent, `Rendered page ${pageIndex + 1} of ${totalPages}`);

    await waitFrame(); // allow UI to breathe
  }

  // STEP 10.8 — Cancel handling
  if (cancelRender) {
    updateProgress(0, "❌ Rendering cancelled.");
    return;
  }

  // STEP 10.9 — Finalise UI
  fillPageSelect(totalPages);
  renderSelectedPage(1);
  updateProgress(
    100,
    `✅ Completed — ${renderedPages.length} page(s) ready.`
  );
}

/* ======================================================
   STEP 11 — UTILITIES & PROGRESS MANAGEMENT
   ====================================================== */

/**
 * Small async delay to keep UI responsive
 */
function waitFrame() {
  return new Promise(resolve => setTimeout(resolve, 50));
}

/**
 * Update progress bar + status text
 */
function updateProgress(percent, text) {
  document.getElementById("progressFill").style.width = percent + "%";
  document.getElementById("progressStatus").textContent = text;
}

/* ======================================================
   STEP 12 — CANCEL HANDLING
   ====================================================== */

document.getElementById("cancelRender").onclick = () => {
  cancelRender = true;
  updateProgress(0, "Cancelling render…");
};

/* ======================================================
   STEP 13 — PAGE SELECTION & PREVIEW
   ====================================================== */

/**
 * Populate page dropdown
 */
function fillPageSelect(total) {
  const sel = document.getElementById("pageSelect");
  sel.innerHTML = "";

  for (let i = 1; i <= total; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `Page ${i}`;
    sel.appendChild(opt);
  }

  sel.onchange = () => renderSelectedPage(+sel.value);
}

/**
 * Render selected page to preview canvas
 */
function renderSelectedPage(pageNumber) {
  const page = renderedPages[pageNumber - 1];
  if (!page) return;

  canvas.width = page.width;
  canvas.height = page.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(page, 0, 0);

  updateProgress(
    100,

    `Previewing page ${pageNumber} of ${renderedPages.length}`
  );
}

/* ======================================================
   STEP 14 — EXPORT FUNCTIONS
   ====================================================== */

// 🔹 Export current page as high-res PNG
document.getElementById("exportPNG").onclick = () => {

  if (renderedPages.length === 0) {
    alert("Please generate sheets first.");
    return;
  }

  const index = +pageSelect.value - 1;
  const page = renderedPages[index];

  const link = document.createElement("a");
  link.download = `marketverse-labels-page${index + 1}.png`;
  link.href = page.toDataURL("image/png", 1.0);
  link.click();

  updateProgress(100, `📦 Exported page ${index + 1} as PNG`);
};


// 🔹 Export all pages as multi-page PDF
document.getElementById("exportPDF").onclick = async () => {

  if (renderedPages.length === 0) {
    alert("Please generate sheets first.");
    return;
  }

  const [pw, ph] = getPaperSizeMM(paperSize.value);
  const orientation = pw > ph ? "landscape" : "portrait";

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: [pw, ph],
    compress: true
  });

  updateProgress(0, "📄 Preparing PDF export…");

  for (let i = 0; i < renderedPages.length; i++) {
    const page = renderedPages[i];
    const imgData = page.toDataURL("image/png", 1.0);
    const props = pdf.getImageProperties(imgData);

    const imgW = pw;
    const imgH = (props.height * imgW) / props.width;

    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH);

    const percent = Math.round(((i + 1) / renderedPages.length) * 100);
    updateProgress(percent, `📦 Added page ${i + 1} of ${renderedPages.length}`);

    await waitFrame();
  }

  pdf.save("marketverse-labels-batch.pdf");

  updateProgress(
    100,
    `✅ PDF exported successfully (${renderedPages.length} page${renderedPages.length > 1 ? "s" : ""})`
  );
};

/* ======================================================
   STEP 15 — BUTTON HOOKS
   ====================================================== */

document.getElementById("generateSheet").onclick = generateSheets;
