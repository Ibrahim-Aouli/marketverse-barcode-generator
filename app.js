/* ===============================
   MARKETVERSE BULK BARCODE BUILDER
   =============================== */
const { jsPDF } = window.jspdf;
const PX_PER_MM = 300 / 25.4;
const mm2px = mm => mm * PX_PER_MM;
const canvas = document.getElementById("barcodeCanvas");
const ctx = canvas.getContext("2d");
let bgImage = null;
let renderedPages = [];
let cancelRender = false;

/* ---------- Save/Load Settings ---------- */
const inputs = document.querySelectorAll("input,select,textarea");
function saveSettings(){
  const d={};
  inputs.forEach(e=>{
    if(e.type==="file")return;
    d[e.id]=(e.type==="checkbox"?e.checked:e.value);
  });
  localStorage.setItem("mv_barcode_settings",JSON.stringify(d));
}
function loadSettings(){
  const s=localStorage.getItem("mv_barcode_settings");if(!s)return;
  const d=JSON.parse(s);
  for(const k in d){
    const el=document.getElementById(k);
    if(el){if(el.type==="checkbox")el.checked=d[k];else el.value=d[k];}
  }
}

/* ---------- Text wrapping with ellipsis ---------- */
function drawWrappedText({ctx,x,y,w,h,text,fontSize,lineHeight,align,vAlign,color,fontWeight,fontFamily}){
  ctx.save();
  ctx.font=`${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle=color;
  ctx.textAlign=align;
  const lh=fontSize*lineHeight;
  const words=text.split(/\s+/);
  const lines=[];
  let line="";
  const maxLines=Math.floor(h/lh);
  const ell="…";
  for(let i=0;i<words.length;i++){
    const test=line+(line?" ":"")+words[i];
    if(ctx.measureText(test).width>w && line){
      lines.push(line);line=words[i];
      if(lines.length>=maxLines)break;
    }else line=test;
  }
  if(lines.length<maxLines)lines.push(line);
  if(lines.length>maxLines)lines.length=maxLines;
  let last=lines[lines.length-1];
  if(ctx.measureText(last).width>w){
    while(last.length>0&&ctx.measureText(last+ell).width>w){last=last.slice(0,-1);}
    lines[lines.length-1]=last+ell;
  }
  const totalH=lines.length*lh;
  let startY=y;
  if(vAlign==="center")startY=y+(h-totalH)/2+fontSize;
  else if(vAlign==="bottom")startY=y+h-totalH+fontSize;
  else startY=y+fontSize;
  for(let i=0;i<lines.length;i++){
    const yy=startY+i*lh;
    if(align==="center")ctx.fillText(lines[i],x+w/2,yy);
    else if(align==="right")ctx.fillText(lines[i],x+w,yy);
    else ctx.fillText(lines[i],x,yy);
  }
  ctx.restore();
}

/* ---------- Draw one label ---------- */
function drawLabelToCtx(ctxObj,title,sku,opts={}){
  const {
    labelW=40,labelH=30,
    headerH=5,titleH=6,barcodeH=14,skuH=2,footerH=3,
    titleFontFamily, titleFontWeight, titleFontSize, titleLineHeight,
    titleAlign, titleVAlign, titleColor,
    skuFontFamily, skuFontWeight, skuFontSize, skuAlign, skuColor
  } = opts;

  const W=mm2px(labelW),H=mm2px(labelH);
  ctxObj.save();
  ctxObj.fillStyle="#fff";ctxObj.fillRect(0,0,W,H);
  if(bgImage)ctxObj.drawImage(bgImage,0,0,W,H);

  // zones optional overlay
  if(opts.showZones){
    ctxObj.globalAlpha=opts.zoneOpacity||0.25;
    const colors=["#ff9999","#99ff99","#9999ff","#ffccff","#ffff99"];
    let y=0;[headerH,titleH,barcodeH,skuH,footerH].forEach((h,i)=>{
      ctxObj.fillStyle=colors[i];
      ctxObj.fillRect(0,y,mm2px(labelW),mm2px(h));y+=mm2px(h);
    });
    ctxObj.globalAlpha=1;
  }

  let yPos=mm2px(headerH);

  // Title
  drawWrappedText({
    ctx:ctxObj,
    x:0,
    y:yPos,
    w:mm2px(labelW),
    h:mm2px(titleH),
    text:title,
    fontSize:+titleFontSize,
    lineHeight:+titleLineHeight,
    align:titleAlign,
    vAlign:titleVAlign,
    color:titleColor,
    fontWeight:titleFontWeight,
    fontFamily:titleFontFamily
  });
  yPos+=mm2px(titleH);

  // Barcode
  const barCanvas=document.createElement("canvas");
  const barCtx=barCanvas.getContext("2d");
  barCanvas.width=mm2px(labelW-2);
  barCanvas.height=mm2px(barcodeH);
  JsBarcode(barCanvas,sku,{format:"CODE128",displayValue:false,width:2,height:barCanvas.height,margin:0,background:null});
  ctxObj.drawImage(barCanvas,mm2px(1),yPos,mm2px(labelW-2),mm2px(barcodeH));
  yPos+=mm2px(barcodeH);

// SKU (Top Aligned)
ctxObj.font=`${skuFontWeight} ${skuFontSize}px ${skuFontFamily}`;
ctxObj.fillStyle=skuColor;
ctxObj.textAlign=skuAlign;
ctxObj.textBaseline="top"; // Align to top of the SKU section
const skuX =
  skuAlign === "center" ? mm2px(labelW) / 2 :
  skuAlign === "right" ? mm2px(labelW - 1) :
  mm2px(1);
const skuY = yPos; // start drawing right at the start of SKU section
ctxObj.fillText(sku, skuX, skuY);


  ctxObj.restore();
}

/* ---------- Canvas Preview ---------- */
function renderPreview(){
  saveSettings();
  const Wmm=+labelWidth.value,Hmm=+labelHeight.value;
  const W=mm2px(Wmm),H=mm2px(Hmm);
  canvas.width=W;canvas.height=H;
  ctx.clearRect(0,0,W,H);
  const opts=getCurrentOptions();
  drawLabelToCtx(ctx,titleInput.value,skuInput.value,opts);
}

/* ---------- Helper: gather options ---------- */
function getCurrentOptions(){
  return {
    labelW:+labelWidth.value,labelH:+labelHeight.value,
    headerH:+headerHeight.value,titleH:+titleHeight.value,
    barcodeH:+barcodeHeight.value,skuH:+skuHeight.value,
    footerH:+footerHeight.value,
    titleFontFamily:titleFontFamily.value,
    titleFontWeight:titleFontWeight.value,
    titleFontSize:+titleFontSize.value,
    titleLineHeight:+titleLineHeight.value,
    titleAlign:titleAlign.value,
    titleVAlign:titleVAlign.value,
    titleColor:titleColor.value,
    skuFontFamily:skuFontFamily.value,
    skuFontWeight:skuFontWeight.value,
    skuFontSize:+skuFontSize.value,
    skuAlign:skuAlign.value,
    skuColor:skuColor.value,
    showZones:toggleZones.checked,
    zoneOpacity:+zoneOpacity.value/100
  };
}

/* auto-update preview */
inputs.forEach(el=>el.addEventListener("input",renderPreview));
templateUpload.addEventListener("change",e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=()=>{bgImage=new Image();bgImage.onload=renderPreview;bgImage.src=r.result;};
  r.readAsDataURL(f);
});
zoneOpacity.addEventListener("input",()=>{zoneOpacityVal.textContent=zoneOpacity.value+"%";renderPreview();});

/* init */
loadSettings();
renderPreview();
/* ==========================================================
   BULK PARSING + PAGE GENERATION + PROGRESS MANAGEMENT
   ========================================================== */
function parseBulkInput() {
  const txt = document.getElementById("bulkInput").value.trim();
  if (!txt) return [];
  const lines = txt.split(/\r?\n/);
  const items = [];

  for (const ln of lines) {
    if (!ln.trim()) continue;
    const cols = ln.split(/\t+/).map(c => c.trim());
    if (cols.length < 2) continue;

    const title = cols[0];
    const sku = cols[1];
    const qty = parseInt(cols[2] || "1");

    // Skip if quantity is 0 or SKU missing
    if (!sku || qty <= 0) continue;

    for (let i = 0; i < qty; i++) {
      items.push({ title, sku });
    }
  }

  return items;
}


/* ---- PAGE LAYOUT CALCULATIONS ---- */
function getPaperSizeMM(name) {
  return name === "A3" ? [420, 297] : [297, 210];
}

async function generateSheets() {
  cancelRender = false;
  renderedPages = [];
  const items = parseBulkInput();
  if (items.length === 0) {
    alert("No valid items to render.");
    return;
  }

  const opts = getCurrentOptions();
  const [pw, ph] = getPaperSizeMM(paperSize.value);
  const margin = +document.getElementById("margin").value || 3;
  const gap = +document.getElementById("gap").value || 3;
  const labelW = opts.labelW;
  const labelH = opts.labelH;
  const usableW = pw - margin * 2;
  const usableH = ph - margin * 2;

  const perRow = Math.floor((usableW + gap) / (labelW + gap));
  const perCol = Math.floor((usableH + gap) / (labelH + gap));
  const perPage = perRow * perCol;

  const totalPages = Math.ceil(items.length / perPage);
  updateProgress(0, `Starting render — ${items.length} labels, ${totalPages} page(s).`);

  for (let p = 0; p < totalPages; p++) {
    if (cancelRender) break;
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = mm2px(pw);
    pageCanvas.height = mm2px(ph);
    const pctx = pageCanvas.getContext("2d");
    pctx.fillStyle = "#fff";
    pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

    const startIdx = p * perPage;
    const endIdx = Math.min(items.length, startIdx + perPage);
    let idx = startIdx;

    for (let row = 0; row < perCol; row++) {
      for (let col = 0; col < perRow; col++) {
        if (idx >= endIdx) break;
        const item = items[idx++];
        const x = mm2px(margin + col * (labelW + gap));
        const y = mm2px(margin + row * (labelH + gap));
        const subCanvas = document.createElement("canvas");
        subCanvas.width = mm2px(labelW);
        subCanvas.height = mm2px(labelH);
        const sctx = subCanvas.getContext("2d");
        drawLabelToCtx(
          sctx,
          item.title,
          item.sku,
          opts
        );
        pctx.drawImage(subCanvas, x, y);
      }
    }

    renderedPages.push(pageCanvas);
    const percent = Math.round(((p + 1) / totalPages) * 100);
    updateProgress(percent, `Rendered page ${p + 1} of ${totalPages}`);
    await waitFrame();
  }

  if (cancelRender) {
    updateProgress(0, "❌ Rendering cancelled.");
    return;
  }

  fillPageSelect(totalPages);
  renderSelectedPage(1);
  updateProgress(100, `✅ Completed — ${renderedPages.length} page(s) ready.`);
}

/* ---- UTILITIES ---- */
function waitFrame() {
  return new Promise(r => setTimeout(r, 50));
}

/* ---- PROGRESS BAR ---- */
function updateProgress(percent, text) {
  document.getElementById("progressFill").style.width = percent + "%";
  document.getElementById("progressStatus").textContent = text;
}

/* ---- CANCEL ---- */
document.getElementById("cancelRender").onclick = () => {
  cancelRender = true;
  updateProgress(0, "Cancelling render…");
};

/* ---- FILL PAGE SELECT ---- */
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

/* ---- RENDER SELECTED PAGE ---- */
function renderSelectedPage(n) {
  const pg = renderedPages[n - 1];
  if (!pg) return;
  canvas.width = pg.width;
  canvas.height = pg.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(pg, 0, 0);
  updateProgress(100, `Previewing page ${n} of ${renderedPages.length}`);
}

/* ---- BUTTON HOOK ---- */
document.getElementById("generateSheet").onclick = generateSheets;
/* ======================================================
   EXPORT FUNCTIONS — HIGH-RES PNG & MULTI-PAGE PDF
   ====================================================== */

// 🔹 Export current previewed page as high-res PNG
document.getElementById("exportPNG").onclick = () => {
  if (renderedPages.length === 0) {
    alert("Please generate sheets first.");
    return;
  }

  const pageIndex = +document.getElementById("pageSelect").value - 1;
  const pageCanvas = renderedPages[pageIndex];
  const link = document.createElement("a");
  link.download = `marketverse-labels-page${pageIndex + 1}.png`;
  // full-quality PNG at 300 DPI (we already rendered at that scale)
  link.href = pageCanvas.toDataURL("image/png", 1.0);
  link.click();
  updateProgress(100, `📦 Exported page ${pageIndex + 1} as PNG`);
};

// 🔹 Export all rendered pages into a high-res multi-page PDF
document.getElementById("exportPDF").onclick = async () => {
  if (renderedPages.length === 0) {
    alert("Please generate sheets first.");
    return;
  }

  const [pw, ph] = getPaperSizeMM(paperSize.value);
  const orient = pw > ph ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation: orient,
    unit: "mm",
    format: [pw, ph],
    compress: true
  });

  updateProgress(0, "📄 Preparing PDF export…");

  for (let i = 0; i < renderedPages.length; i++) {
    const pg = renderedPages[i];
    const imgData = pg.toDataURL("image/png", 1.0);
    const imgProps = pdf.getImageProperties(imgData);
    const imgWidth = pw;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

    const percent = Math.round(((i + 1) / renderedPages.length) * 100);
    updateProgress(percent, `📦 Added page ${i + 1} of ${renderedPages.length}`);
    await waitFrame();
  }

  pdf.save("marketverse-labels-batch.pdf");
  updateProgress(100, `✅ PDF exported successfully (${renderedPages.length} page${renderedPages.length > 1 ? "s" : ""})`);
};


// 🔹 Optional — auto-save settings periodically
setInterval(saveSettings, 5000);

/* ======================================================
   END OF SCRIPT
   ====================================================== */