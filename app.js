'use strict';

/**
 * Project: Collage Maker
 * Logic: Dynamic Client-Side Canvas Rendering (Horizontal, Vertical, Dynamic Grid)
 * Language: English
 */

// ── State ─────────────────────────────────────
let layoutMode = 'h'; // 'h', 'v', 'grid'
let slotIds = [1, 2]; // Active slots
let images = {};      // slotId -> HTMLImageElement
let previewTimer = null;

// Grid specific state
let gridRows = 2;
let gridCols = 2;

// ── Configuration ──────────────────────────────
const LABELS = {
  h: 'Photo',
  v: 'Photo',
  grid: 'Slot'
};

const MESSAGES = {
  minPhotos: 'Minimum 2 photos required',
  genError: 'Error generating collage',
  saved: 'Collage saved! 🎉',
  generating: 'Generating...',
  emptyState: 'Select a layout and upload your photos — preview will appear automatically'
};

/** UI Helpers */
function toast(msg, type = 'ok', ms = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.className = 'toast', ms);
}

function setBusy(on) {
  const el = document.getElementById('genBadge');
  if (el) el.classList.toggle('show', on);
}

function hex2rgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/** Settings Linkers */
function onSetting(el, valId, unit = '') {
  document.getElementById(valId).textContent = el.value + unit;
  schedulePreview();
}

function onColorPick(el, dotId, hexId) {
  const hex = el.value.toUpperCase();
  document.getElementById(dotId).style.background = hex;
  document.getElementById(hexId).textContent = hex;
  schedulePreview();
}

/** Grid Specific */
function onGridChange() {
  if (layoutMode !== 'grid') return;
  
  gridRows = Math.min(Math.max(parseInt(document.getElementById('gridRows').value) || 1, 1), 5);
  gridCols = Math.min(Math.max(parseInt(document.getElementById('gridCols').value) || 1, 1), 5);
  
  // Ensure values back in inputs if they were capped
  document.getElementById('gridRows').value = gridRows;
  document.getElementById('gridCols').value = gridCols;

  const totalSlots = gridRows * gridCols;
  const newSlotIds = [];
  for (let i = 1; i <= totalSlots; i++) newSlotIds.push(i);
  
  slotIds = newSlotIds;
  renderSlots();
  if (allLoaded()) schedulePreview();
  else resetPreview();
}

/** Slot Management */
function setLayout(mode) {
  layoutMode = mode;
  
  // Update UI active state
  document.querySelectorAll('.lay-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('lay-' + mode).classList.add('active');

  // Toggle Grid Settings
  const gridSet = document.getElementById('gridSettings');
  const addBtn = document.getElementById('addBtn');
  
  if (mode === 'grid') {
    gridSet.classList.add('show');
    addBtn.style.display = 'none';
    onGridChange(); // Initialize grid slots
  } else {
    gridSet.classList.remove('show');
    addBtn.style.display = 'flex';
    
    // Resume previous H/V slots if they were multi, or default back to 2
    if (slotIds.length > 5) slotIds = slotIds.slice(0, 5);
    if (slotIds.length < 2) slotIds = [1, 2];
    addBtn.disabled = (slotIds.length >= 5);
    
    renderSlots();
    if (allLoaded()) schedulePreview();
    else resetPreview();
  }
}

function addSlot() {
  if (layoutMode === 'grid') return;
  if (slotIds.length >= 5) return;

  const newId = Math.max(...slotIds, 0) + 1;
  slotIds.push(newId);
  
  if (slotIds.length >= 5) document.getElementById('addBtn').disabled = true;
  
  renderSlots();
}

function removeSlot(id) {
  if (layoutMode === 'grid') return;
  if (slotIds.length <= 2) {
    toast(MESSAGES.minPhotos, 'err');
    return;
  }

  slotIds = slotIds.filter(sid => sid !== id);
  delete images[id]; 
  
  document.getElementById('addBtn').disabled = false;
  
  renderSlots();
  if (allLoaded()) schedulePreview();
  else resetPreview();
}

function renderSlots() {
  const container = document.getElementById('slots');
  const fileContainer = document.getElementById('fileInputs');
  container.innerHTML = '';
  fileContainer.innerHTML = '';

  slotIds.forEach((id, index) => {
    // Hidden file input
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.id = `file-${id}`;
    inp.onchange = e => loadFile(e, id);
    fileContainer.appendChild(inp);

    // Slot Element
    const slotEl = document.createElement('div');
    const isFilled = !!images[id];
    slotEl.className = `slot ${isFilled ? 'filled' : 'empty'}`;
    slotEl.id = `slot-${id}`;
    slotEl.onclick = () => inp.click();

    // Drag and Drop
    slotEl.ondragover = e => { e.preventDefault(); slotEl.classList.add('dragging'); };
    slotEl.ondragleave = () => slotEl.classList.remove('dragging');
    slotEl.ondrop = e => {
      e.preventDefault();
      slotEl.classList.remove('dragging');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) readImageFile(file, id);
    };

    if (isFilled) {
      slotEl.innerHTML = `
        <img src="${images[id].src}" class="slot-thumb" alt="Photo ${id}">
        <div class="slot-overlay">
          <button class="slot-ol-btn" title="Replace"><span class="material-symbols-outlined">${ICONS.sync}</span></button>
          <button class="slot-ol-btn delete" title="Delete" onclick="event.stopPropagation(); removeSlot(${id})">
            <span class="material-symbols-outlined">${ICONS.delete}</span>
          </button>
        </div>
        <div class="slot-fname">${images[id]._name || 'Photo'}</div>
      `;
    } else {
      slotEl.innerHTML = `<span class="material-symbols-outlined slot-icon">${ICONS.image}</span>`;
    }
    container.appendChild(slotEl);
  });
}

/** Image Processing */
function loadFile(e, id) {
  const file = e.target.files[0];
  if (file) readImageFile(file, id);
}

function readImageFile(file, id) {
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      img._name = file.name;
      images[id] = img;
      renderSlots();
      if (allLoaded()) schedulePreview(false);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function allLoaded() {
  return slotIds.every(id => !!images[id]);
}

/** Rendering Engine */
function schedulePreview(debounce = true) {
  if (!allLoaded()) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderCollage, debounce ? 600 : 100);
}

function resetPreview() {
  document.getElementById('outputCanvas').style.display = 'none';
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('btnDl').disabled = true;
}

function roundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawSlot(ctx, img, x, y, w, h, r, borderW, br) {
  ctx.save();
  roundedRect(ctx, x, y, w, h, r);
  ctx.clip();
  
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  
  ctx.restore();

  if (borderW > 0) {
    ctx.save();
    roundedRect(ctx, x, y, w, h, r);
    ctx.lineWidth = borderW * 2;
    ctx.strokeStyle = `rgb(${br[0]},${br[1]},${br[2]})`;
    ctx.stroke();
    ctx.restore();
  }
}

function renderCollage() {
  setBusy(true);
  
  setTimeout(() => {
    try {
      const sp = +document.getElementById('spacing').value;
      const r = +document.getElementById('radius').value;
      const bw = +document.getElementById('borderW').value;
      const bg = hex2rgb(document.getElementById('bgColor').value);
      const br = hex2rgb(document.getElementById('borderColor').value);

      const canvas = document.getElementById('outputCanvas');
      const ctx = canvas.getContext('2d');
      
      const activeImgs = slotIds.map(id => images[id]);
      let W, H, rects = [];

      if (layoutMode === 'h') {
        const baseH = activeImgs[0].height;
        const scaledWidths = activeImgs.map(img => Math.round(img.width * (baseH / img.height)));
        const totalImgW = scaledWidths.reduce((a, b) => a + b, 0);
        W = totalImgW + (activeImgs.length + 1) * sp;
        H = baseH + 2 * sp;
        
        let curX = sp;
        rects = activeImgs.map((img, i) => {
          const rect = { img, x: curX, y: sp, w: scaledWidths[i], h: baseH };
          curX += scaledWidths[i] + sp;
          return rect;
        });

      } else if (layoutMode === 'v') {
        const baseW = activeImgs[0].width;
        const scaledHeights = activeImgs.map(img => Math.round(img.height * (baseW / img.width)));
        const totalImgH = scaledHeights.reduce((a, b) => a + b, 0);
        W = baseW + 2 * sp;
        H = totalImgH + (activeImgs.length + 1) * sp;
        
        let curY = sp;
        rects = activeImgs.map((img, i) => {
          const rect = { img, x: sp, y: curY, w: baseW, h: scaledHeights[i] };
          curY += scaledHeights[i] + sp;
          return rect;
        });

      } else if (layoutMode === 'grid') {
        // Dynamic grid math
        // We use average of all images to define 'cell' size if user hasn't specified one?
        // Let's use avg width/height of all uploaded images as a base reference.
        const avgW = Math.round(activeImgs.reduce((s, img) => s + img.width, 0) / activeImgs.length);
        const avgH = Math.round(activeImgs.reduce((s, img) => s + img.height, 0) / activeImgs.length);
        
        const cw = avgW;
        const ch = avgH;
        
        W = gridCols * cw + (gridCols + 1) * sp;
        H = gridRows * ch + (gridRows + 1) * sp;
        
        for (let row = 0; row < gridRows; row++) {
          for (let col = 0; col < gridCols; col++) {
            const idx = row * gridCols + col;
            if (activeImgs[idx]) {
              rects.push({
                img: activeImgs[idx],
                x: sp + col * (cw + sp),
                y: sp + row * (ch + sp),
                w: cw,
                h: ch
              });
            }
          }
        }
      }

      canvas.width = W;
      canvas.height = H;
      ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
      ctx.fillRect(0, 0, W, H);
      rects.forEach(rect => drawSlot(ctx, rect.img, rect.x, rect.y, rect.w, rect.h, r, bw, br));

      canvas.style.display = 'block';
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('btnDl').disabled = false;

    } catch (err) {
      console.error(err);
      toast(MESSAGES.genError, 'err');
    }
    setBusy(false);
  }, 10);
}

function downloadCollage() {
  const canvas = document.getElementById('outputCanvas');
  const link = document.createElement('a');
  link.download = 'collage.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast(MESSAGES.saved, 'ok');
}

/** Center Drag and Drop */
function initCenterDragAndDrop() {
  const area = document.querySelector('.canvas-area');
  if (!area) return;

  area.ondragover = e => {
    e.preventDefault();
    area.classList.add('drag-over');
  };
  area.ondragleave = () => area.classList.remove('drag-over');
  area.ondrop = e => {
    e.preventDefault();
    area.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    let usedIds = [];
    files.forEach(file => {
      let targetId = slotIds.find(id => !images[id] && !usedIds.includes(id));
      if (!targetId && layoutMode !== 'grid' && slotIds.length < 5) {
        addSlot();
        targetId = slotIds[slotIds.length - 1];
      }
      if (targetId) {
        usedIds.push(targetId);
        readImageFile(file, targetId);
      } else {
        // Fallback to first slot if full
        readImageFile(file, slotIds[0]);
      }
    });
  };
}

/** Clipboard Support */
function initPasteSupport() {
  window.addEventListener('paste', e => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    let usedIds = [];
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        let targetId = slotIds.find(id => !images[id] && !usedIds.includes(id));
        if (!targetId && layoutMode !== 'grid' && slotIds.length < 5) {
          addSlot();
          targetId = slotIds[slotIds.length - 1];
        }
        if (targetId) {
          usedIds.push(targetId);
          readImageFile(file, targetId);
        } else {
          readImageFile(file, slotIds[0]);
        }
      }
    }
  });
}

// ── Init ──────────────────────────────────────
window.onload = () => {
  renderSlots();
  initCenterDragAndDrop();
  initPasteSupport();
  initSidebarResizer();
};

/** Sidebar Resizing */
function initSidebarResizer() {
  const resizer = document.getElementById('sidebarResizer');
  const sidebar = document.querySelector('.sidebar');
  if (!resizer || !sidebar) return;

  // Load saved width
  const savedWidth = localStorage.getItem('collage-sidebar-width');
  if (savedWidth) {
    document.documentElement.style.setProperty('--sidebar-width', savedWidth + 'px');
  }

  let isResizing = false;

  resizer.addEventListener('mousedown', e => {
    isResizing = true;
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', e => {
    if (!isResizing) return;
    
    let newWidth = e.clientX;
    // Bounds
    if (newWidth < 280) newWidth = 280;
    if (newWidth > 600) newWidth = 600;

    document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
  });

  window.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    resizer.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    const finalWidth = parseInt(getComputedStyle(sidebar).width);
    localStorage.setItem('collage-sidebar-width', finalWidth);
  });
}
