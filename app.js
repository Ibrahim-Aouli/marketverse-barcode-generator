/* ======================================================
   MARKETVERSE — BARCODE TEMPLATE PRINTER
   Author: MarketVerse
   Purpose:
   - Render ONE barcode label
   - Repeat it N times across pages
   - Auto-load barcode-template.png if available
   - Allow user override via upload
   - Export PNG / PDF
   DPI: 300 (print-ready)
   ====================================================== */


/* ======================================================
   STEP 0 — GLOBAL SETUP & CONSTANTS
   ====================================================== */

const { jsPDF } = window.jspdf;

const PX_PER_MM = 300 / 25.4;
const mm2px = mm => mm * PX_PER_MM;

const canvas = document.getElementById("barcodeCanvas");
const ctx = canvas.getContext("2d");

let renderedPages = [];
let bgImage = null;


/* ======================================================
   STEP 1 — TEMPLATE LOADING (AUTO + OVERRIDE)
   ====================================================== */

/**
 * Attempt to auto-load barcode-template.png
 * Silent fail if not found
 */
function loadDefaultTemplate() {
  const img = new Image();
  img.onload = () => {
    bgImage = img;
    renderPreview();
  };
  img.onerror = () => {
    console.info("barcode-template.png not found — using plain background");
  };
  img.src = "barcode-template.png";
}

/**
 * User-uploaded template overrides default
 */
templateUpload.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      renderPreview();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});


/* ======================================================
   STEP 2 — DRAW SINGLE LABEL (UNCHANGED CORE)
   ====================================================== */

function drawLabelToCtx(ctxObj, title, sku, opts = {}) {

  const {
    labelW = 40,
    labelH = 30,
    headerH = 5,
    titleH = 6,
    barcodeH = 14,
    skuH = 2,

    titleFontFamily,
    titleFontWeight,
    titleFontSize,
    titleLineHeight,
    titleAlign,
    titleVAlign,
    titleColor,

    skuFontFamily,
    skuFontWeight,
    skuFontSize,
    skuAlign,
    skuColor
  } = opts;

  const W = mm2px(labelW);
  const H = mm2px(labelH);

  ctxObj.save();

  // Background
  ctxObj.fillStyle = "#fff";
  ctxObj.fillRect(0, 0, W, H);
  if (bgImage) ctxObj.drawImage(bgImage, 0, 0, W, H);

  let y = mm2px(headerH);

  // Title
  ctxObj.font = `${titleFontWeight} ${titleFontSize}px ${titleFontFamily}`;
  ctxObj.fillStyle = titleColor;
  ctxObj.textAlign = titleAlign;
  ctxObj.textBaseline = "top";

  const titleX =
    titleAlign === "center" ? W / 2 :
    titleAlign === "right"  ? W - mm2px(1) :
                              mm2px(1);

  ctxObj.fillText(title, titleX, y);
  y += mm2px(titleH);

  // Barcode
  const barCanvas = document.createElement("canvas");
  barCanvas.width = mm2px(labelW - 2);
  barCanvas.height = mm2px(barcodeH);

  JsBarcode(barCanvas, sku, {
    format: "CODE128",
    displayValue: false,
    width: 2,
    height: barCanvas.height,
    margin: 0
  });

  ctxObj.drawImage(barCanvas, mm2px(1), y);
  y += mm2px(barcodeH);

  // SKU text
  ctxObj.font = `${skuFontWeight} ${skuFontSize}px ${skuFontFamily}`;
  ctxObj.fillStyle = skuColor;
  ctxObj.textAlign = skuAlign;

  const skuX =
    skuAlign === "center" ? W / 2 :
    skuAlign === "right"  ? W - mm2px(1) :
                            mm2px(1);

  ctxObj.fillText(sku, skuX, y);

  ctxObj.restore();
}


/* ======================================================
   STEP 3 — HELPERS
   ====================================================== */

function getPaperSizeMM(name) {
  return name === "A3" ? [420, 297] : [297, 210];
}

function getCurrentOptions() {
  return {
    labelW: +labelWidth.value,
    labelH: +labelHeight.value,
    headerH: +headerHeight.value,
    titleH: +titleHeight.value,
    barcodeH: +barcodeHeight.value,
    skuH: +skuHeight.value,

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
    skuColor: skuColor.value
  };
}


/* ======================================================
   STEP 4 — PREVIEW (SINGLE LABEL)
   ====================================================== */

function renderPreview() {
  const opts = getCurrentOptions();
  const W = mm2px(opts.labelW);
  const H = mm2px(opts.labelH);

  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  drawLabelToCtx(
    ctx,
    titleInput.value.trim(),
    skuInput.value.trim(),
    opts
  );
}


/* ======================================================
   STEP 5 — GENERATE PAGES (ONE BARCODE × QUANTITY)
   ====================================================== */

function generatePages() {

  renderedPages = [];

  const title = titleInput.value.trim();
  const sku = skuInput.value.trim();
  const quantity = Math.max(1, +quantityInput.value || 1);

  if (!sku) {
    alert("SKU is required");
    return;
  }

  const opts = getCurrentOptions();
  const [paperW, paperH] = getPaperSizeMM(paperSize.value);

  const margin = +margin.value || 3;
  const gap = +gap.value || 3;

  const usableW = paperW - margin * 2;
  const usableH = paperH - margin * 2;

  const perRow = Math.floor((usableW + gap) / (opts.labelW + gap));
  const perCol = Math.floor((usableH + gap) / (opts.labelH + gap));
  const perPage = perRow * perCol;

  let printed = 0;
  const totalPages = Math.ceil(quantity / perPage);

  for (let p = 0; p < totalPages; p++) {

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = mm2px(paperW);
    pageCanvas.height = mm2px(paperH);

    const pctx = pageCanvas.getContext("2d");
    pctx.fillStyle = "#fff";
    pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

    for (let row = 0; row < perCol; row++) {
      for (let col = 0; col < perRow; col++) {

        if (printed >= quantity) break;

        const x = mm2px(margin + col * (opts.labelW + gap));
        const y = mm2px(margin + row * (opts.labelH + gap));

        const labelCanvas = document.createElement("canvas");
        labelCanvas.width = mm2px(opts.labelW);
        labelCanvas.height = mm2px(opts.labelH);

        drawLabelToCtx(
          labelCanvas.getContext("2d"),
          title,
          sku,
          opts
        );

        pctx.drawImage(labelCanvas, x, y);
        printed++;
      }
    }

    renderedPages.push(pageCanvas);
  }

  renderPage(0);
}


/* ======================================================
   STEP 6 — PAGE PREVIEW
   ====================================================== */

function renderPage(index) {
  const page = renderedPages[index];
  if (!page) return;

  canvas.width = page.width;
  canvas.height = page.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(page, 0, 0);
}


/* ======================================================
   STEP 7 — EXPORTS
   ====================================================== */

// Export PNG (first page)
exportPNG.onclick = () => {
  if (!renderedPages.length) return;

  const link = document.createElement("a");
  link.download = "marketverse-barcodes.png";
  link.href = renderedPages[0].toDataURL("image/png", 1.0);
  link.click();
};

// Export PDF (all pages)
exportPDF.onclick = () => {
  if (!renderedPages.length) return;

  const [pw, ph] = getPaperSizeMM(paperSize.value);
  const orientation = pw > ph ? "landscape" : "portrait";

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: [pw, ph]
  });

  renderedPages.forEach((pg, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(pg.toDataURL("image/png", 1.0), "PNG", 0, 0, pw, ph);
  });

  pdf.save("marketverse-barcodes.pdf");
};


/* ======================================================
   STEP 8 — UI HOOKS
   ====================================================== */

generateSheet.onclick = generatePages;

// Live preview updates
document
  .querySelectorAll("input,select")
  .forEach(el => el.addEventListener("input", renderPreview));


/* ======================================================
   STEP 9 — INIT
   ====================================================== */

loadDefaultTemplate();
renderPreview();
