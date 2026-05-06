// ─── State ───────────────────────────────────────────────────────────────────
const algorithms = ["Sequential", "Linked", "Indexed", "Multi-level Indexed"];
let selectedAlgorithm = "Sequential";

// Stores all allocated files so we can keep the disk map across allocations
let allocatedFiles = [];

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const el = {
  totalBlocks: document.getElementById("totalBlocks"),
  fileName: document.getElementById("fileName"),
  fileSize: document.getElementById("fileSize"),
  startBlock: document.getElementById("startBlock"),
  linkedBlocks: document.getElementById("linkedBlocks"),
  linkedField: document.getElementById("linkedField"),
  indexBlock: document.getElementById("indexBlock"),
  indexBlockField: document.getElementById("indexBlockField"),
  indexedBlocks: document.getElementById("indexedBlocks"),
  indexedDataField: document.getElementById("indexedDataField"),
  l1IndexBlock: document.getElementById("l1IndexBlock"),
  l1IndexField: document.getElementById("l1IndexField"),
  l2IndexBlocks: document.getElementById("l2IndexBlocks"),
  l2IndexField: document.getElementById("l2IndexField"),
  mlDataBlocks: document.getElementById("mlDataBlocks"),
  mlDataField: document.getElementById("mlDataField"),
  addFile: document.getElementById("addFile"),
  sample: document.getElementById("sample"),
  run: document.getElementById("run"),
  reset: document.getElementById("reset"),
  error: document.getElementById("error"),
  algoButtons: document.getElementById("algoButtons"),
  chipList: document.getElementById("chipList"),
  blockCount: document.getElementById("blockCount"),
  status: document.getElementById("status"),
  activeAlgo: document.getElementById("activeAlgo"),
  blocksUsed: document.getElementById("blocksUsed"),
  overhead: document.getElementById("overhead"),
  runBadge: document.getElementById("runBadge"),
  diskMap: document.getElementById("diskMap"),
  legend: document.getElementById("legend"),
  structTitle: document.getElementById("structTitle"),
  structViz: document.getElementById("structViz"),
  trace: document.getElementById("trace"),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseList(str) {
  return str.split(/[\s,]+/).filter(Boolean).map(Number);
}

function getUsedBlocks() {
  const used = new Set();
  allocatedFiles.forEach(f => {
    f.allBlocks.forEach(b => used.add(b));
  });
  return used;
}

// File color palette — cycles for multiple files
const FILE_COLORS = [
  { data: "#69a8ff", index: "#ffd166", pointer: "#ff6b8a", name: "Blue" },
  { data: "#5ff2a3", index: "#f97316", pointer: "#c084fc", name: "Green" },
  { data: "#42d9f5", index: "#fb923c", pointer: "#f472b6", name: "Cyan" },
  { data: "#a78bfa", index: "#34d399", pointer: "#fbbf24", name: "Purple" },
  { data: "#f87171", index: "#60a5fa", pointer: "#4ade80", name: "Red" },
];

function getColor(fileIndex) {
  return FILE_COLORS[fileIndex % FILE_COLORS.length];
}

// ─── Allocation Algorithms ────────────────────────────────────────────────────

function allocateSequential(params) {
  const { fileSize, startBlock, totalBlocks, fileName } = params;
  const errors = [];
  if (startBlock < 0 || startBlock >= totalBlocks) errors.push(`Start block must be 0–${totalBlocks - 1}.`);
  if (startBlock + fileSize > totalBlocks) errors.push(`Not enough contiguous space: need blocks ${startBlock}–${startBlock + fileSize - 1} but disk has ${totalBlocks} blocks.`);
  if (errors.length) throw new Error(errors.join(" "));

  const dataBlocks = Array.from({ length: fileSize }, (_, i) => startBlock + i);
  const used = getUsedBlocks();
  const conflict = dataBlocks.find(b => used.has(b));
  if (conflict !== undefined) throw new Error(`Block ${conflict} is already allocated to another file.`);

  return {
    method: "Sequential",
    fileName,
    dataBlocks,
    indexBlocks: [],
    pointerBlocks: [],
    allBlocks: dataBlocks,
    overhead: 0,
    meta: { startBlock, fileSize },
  };
}

function allocateLinked(params) {
  const { linkedBlocks, totalBlocks, fileName } = params;
  const chain = parseList(linkedBlocks);
  if (chain.length < 1) throw new Error("Enter at least one block in the chain.");
  const invalid = chain.find(b => b < 0 || b >= totalBlocks);
  if (invalid !== undefined) throw new Error(`Block ${invalid} is out of range (0–${totalBlocks - 1}).`);
  const unique = new Set(chain);
  if (unique.size !== chain.length) throw new Error("Duplicate block numbers in linked chain.");
  const used = getUsedBlocks();
  const conflict = chain.find(b => used.has(b));
  if (conflict !== undefined) throw new Error(`Block ${conflict} is already allocated to another file.`);

  return {
    method: "Linked",
    fileName,
    dataBlocks: chain,
    indexBlocks: [],
    pointerBlocks: [],          // pointers are embedded — shown as arrows in viz
    allBlocks: chain,
    overhead: 0,                // pointer is inside each block (partial overhead)
    meta: { chain },
  };
}

function allocateIndexed(params) {
  const { indexBlock, indexedBlocks, totalBlocks, fileName } = params;
  const idxBlock = Number(indexBlock);
  const dataBlocks = parseList(indexedBlocks);

  if (isNaN(idxBlock) || idxBlock < 0 || idxBlock >= totalBlocks)
    throw new Error(`Index block must be 0–${totalBlocks - 1}.`);
  if (dataBlocks.length < 1)
    throw new Error("Enter at least one data block address.");
  const invalid = dataBlocks.find(b => b < 0 || b >= totalBlocks);
  if (invalid !== undefined) throw new Error(`Block ${invalid} is out of range.`);
  if (dataBlocks.includes(idxBlock)) throw new Error("Index block cannot also be a data block.");
  const used = getUsedBlocks();
  const allNeed = [idxBlock, ...dataBlocks];
  const conflict = allNeed.find(b => used.has(b));
  if (conflict !== undefined) throw new Error(`Block ${conflict} is already allocated.`);

  return {
    method: "Indexed",
    fileName,
    dataBlocks,
    indexBlocks: [idxBlock],
    pointerBlocks: [],
    allBlocks: [idxBlock, ...dataBlocks],
    overhead: 1,
    meta: { idxBlock, dataBlocks },
  };
}

function allocateMultiLevelIndexed(params) {
  const { l1IndexBlock, l2IndexBlocks, mlDataBlocks, totalBlocks, fileName } = params;
  const l1 = Number(l1IndexBlock);
  const l2List = parseList(l2IndexBlocks);
  const dataList = parseList(mlDataBlocks);

  if (isNaN(l1) || l1 < 0 || l1 >= totalBlocks) throw new Error(`L1 index block must be 0–${totalBlocks - 1}.`);
  if (l2List.length < 1) throw new Error("Enter at least one L2 index block.");
  if (dataList.length < 1) throw new Error("Enter at least one data block.");
  const allNeed = [l1, ...l2List, ...dataList];
  const invalid = allNeed.find(b => b < 0 || b >= totalBlocks);
  if (invalid !== undefined) throw new Error(`Block ${invalid} is out of range.`);
  const uniqueAll = new Set(allNeed);
  if (uniqueAll.size !== allNeed.length) throw new Error("Duplicate block numbers detected.");
  const used = getUsedBlocks();
  const conflict = allNeed.find(b => used.has(b));
  if (conflict !== undefined) throw new Error(`Block ${conflict} is already allocated.`);

  return {
    method: "Multi-level Indexed",
    fileName,
    dataBlocks: dataList,
    indexBlocks: [l1, ...l2List],
    pointerBlocks: [],
    allBlocks: allNeed,
    overhead: 1 + l2List.length,
    meta: { l1, l2List, dataList },
  };
}

// ─── Disk Map Rendering ───────────────────────────────────────────────────────

function renderDiskMap(totalBlocks) {
  const usedMap = {};     // blockNum -> { fileIdx, type }
  allocatedFiles.forEach((f, fi) => {
    f.dataBlocks.forEach(b => { usedMap[b] = { fi, type: "data" }; });
    f.indexBlocks.forEach(b => { usedMap[b] = { fi, type: "index" }; });
  });

  const cols = Math.min(totalBlocks, 16);
  el.diskMap.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  el.diskMap.innerHTML = "";

  for (let i = 0; i < totalBlocks; i++) {
    const cell = document.createElement("div");
    cell.className = "disk-block";
    cell.setAttribute("data-block", i);
    const info = usedMap[i];
    if (info) {
      const colors = getColor(info.fi);
      cell.style.background = info.type === "index" ? colors.index : colors.data;
      cell.style.color = "#06111f";
      cell.style.borderColor = info.type === "index" ? colors.index : colors.data;
      cell.title = `Block ${i} — ${allocatedFiles[info.fi].fileName} (${info.type})`;
      cell.classList.add("used");
    }
    cell.innerHTML = `<span class="block-num">${i}</span>`;
    el.diskMap.appendChild(cell);
  }

  // Legend
  el.legend.innerHTML = "<span class='legend-label'>Legend:</span>" +
    allocatedFiles.map((f, fi) => {
      const c = getColor(fi);
      return `<span class="legend-item"><span class="legend-dot" style="background:${c.data}"></span>${f.fileName} data</span>` +
        (f.indexBlocks.length ? `<span class="legend-item"><span class="legend-dot" style="background:${c.index}"></span>${f.fileName} index</span>` : "");
    }).join("") +
    `<span class="legend-item"><span class="legend-dot free"></span>Free</span>`;
}

// ─── Structure Visualizer ─────────────────────────────────────────────────────

function renderStructure(fileResult) {
  const { method, meta, dataBlocks, indexBlocks, fileName } = fileResult;
  el.structTitle.textContent = `${method} — ${fileName}`;

  if (method === "Sequential") {
    el.structViz.innerHTML = `
      <div class="struct-row">
        <div class="struct-label">Directory Entry</div>
        <div class="struct-chain">
          <div class="struct-block entry-block">
            <span class="sb-label">Start</span>
            <span class="sb-val">${meta.startBlock}</span>
          </div>
          <div class="struct-block entry-block">
            <span class="sb-label">Length</span>
            <span class="sb-val">${meta.fileSize}</span>
          </div>
        </div>
      </div>
      <div class="struct-row">
        <div class="struct-label">Disk Blocks</div>
        <div class="struct-chain">
          ${dataBlocks.map(b => `<div class="struct-block data-block"><span class="sb-label">Blk</span><span class="sb-val">${b}</span></div>`).join('<span class="arrow">→</span>')}
        </div>
      </div>
      <p class="struct-note">✔ Contiguous allocation — fast sequential & random access. ✘ External fragmentation risk. Must declare size upfront.</p>
    `;
  } else if (method === "Linked") {
    const chain = meta.chain;
    el.structViz.innerHTML = `
      <div class="struct-row">
        <div class="struct-label">Directory Entry</div>
        <div class="struct-chain">
          <div class="struct-block entry-block"><span class="sb-label">Start</span><span class="sb-val">${chain[0]}</span></div>
          <div class="struct-block entry-block"><span class="sb-label">End</span><span class="sb-val">${chain[chain.length - 1]}</span></div>
        </div>
      </div>
      <div class="struct-row">
        <div class="struct-label">Block Chain</div>
        <div class="struct-chain">
          ${chain.map((b, i) => `
            <div class="struct-block data-block linked-block">
              <span class="sb-label">Blk ${b}</span>
              <span class="sb-val ptr">${i < chain.length - 1 ? '→ ' + chain[i + 1] : 'NULL'}</span>
            </div>
          `).join('<span class="arrow">⤏</span>')}
        </div>
      </div>
      <p class="struct-note">✔ No external fragmentation — blocks can be scattered. ✘ No direct access (must follow chain). Pointer overhead per block.</p>
    `;
  } else if (method === "Indexed") {
    const { idxBlock, dataBlocks: dBlocks } = meta;
    el.structViz.innerHTML = `
      <div class="struct-row">
        <div class="struct-label">Directory Entry</div>
        <div class="struct-chain">
          <div class="struct-block entry-block"><span class="sb-label">Index</span><span class="sb-val">${idxBlock}</span></div>
        </div>
      </div>
      <div class="struct-row">
        <div class="struct-label">Index Block ${idxBlock}</div>
        <div class="struct-chain index-table">
          ${dBlocks.map((b, i) => `<div class="struct-block idx-entry"><span class="sb-label">[${i}]</span><span class="sb-val">${b}</span></div>`).join("")}
        </div>
      </div>
      <div class="struct-row">
        <div class="struct-label">Data Blocks</div>
        <div class="struct-chain">
          ${dBlocks.map(b => `<div class="struct-block data-block"><span class="sb-label">Blk</span><span class="sb-val">${b}</span></div>`).join('<span class="arrow">·</span>')}
        </div>
      </div>
      <p class="struct-note">✔ Direct access via index. No external fragmentation. ✘ Index block overhead. File size limited by index block capacity.</p>
    `;
  } else if (method === "Multi-level Indexed") {
    const { l1, l2List, dataList } = meta;
    el.structViz.innerHTML = `
      <div class="struct-row">
        <div class="struct-label">Directory Entry</div>
        <div class="struct-chain">
          <div class="struct-block entry-block"><span class="sb-label">L1 Index</span><span class="sb-val">${l1}</span></div>
        </div>
      </div>
      <div class="struct-row">
        <div class="struct-label">L1 Index Block ${l1}</div>
        <div class="struct-chain">
          ${l2List.map(b => `<div class="struct-block idx-block"><span class="sb-label">L2→</span><span class="sb-val">${b}</span></div>`).join('<span class="arrow">·</span>')}
        </div>
      </div>
      <div class="struct-row">
        <div class="struct-label">L2 Index Blocks</div>
        <div class="struct-chain">
          ${l2List.map((b, li) => {
            // distribute data blocks among L2 nodes
            const chunkSize = Math.ceil(dataList.length / l2List.length);
            const chunk = dataList.slice(li * chunkSize, (li + 1) * chunkSize);
            return `<div class="ml-group">
              <div class="struct-block idx-block ml-idx"><span class="sb-label">Blk ${b}</span></div>
              <div class="ml-children">${chunk.map(d => `<div class="struct-block data-block ml-data"><span class="sb-val">${d}</span></div>`).join("")}</div>
            </div>`;
          }).join('<span class="arrow ml-arrow">·</span>')}
        </div>
      </div>
      <p class="struct-note">✔ Supports very large files. No external fragmentation. ✘ Multiple index block accesses increase seek time. Higher overhead.</p>
    `;
  }
}

// ─── Trace ────────────────────────────────────────────────────────────────────

function renderTrace(fileResult) {
  const { method, fileName, dataBlocks, indexBlocks, overhead, allBlocks } = fileResult;
  const lines = [
    `$ FILE_ALLOCATOR: ${method.toUpperCase().replaceAll(" ", "_")} mode`,
    `$ Allocating file: "${fileName}"`,
  ];

  if (method === "Sequential") {
    lines.push(`$ Contiguous blocks: ${dataBlocks[0]} – ${dataBlocks[dataBlocks.length - 1]}`);
    dataBlocks.forEach((b, i) => lines.push(`$ Block[${i}] = ${b}`));
  } else if (method === "Linked") {
    lines.push(`$ FAT chain: ${dataBlocks.join(" → ")} → NULL`);
    dataBlocks.forEach((b, i) => {
      const next = dataBlocks[i + 1];
      lines.push(`$ Block ${b}: data + pointer → ${next !== undefined ? next : "NULL"}`);
    });
  } else if (method === "Indexed") {
    lines.push(`$ Index block: ${indexBlocks[0]}`);
    dataBlocks.forEach((b, i) => lines.push(`$ index[${i}] → Block ${b}`));
  } else if (method === "Multi-level Indexed") {
    lines.push(`$ L1 index block: ${fileResult.meta.l1}`);
    fileResult.meta.l2List.forEach((b, i) => lines.push(`$ L2 index block[${i}]: ${b}`));
    dataBlocks.forEach((b, i) => lines.push(`$ data[${i}] → Block ${b}`));
  }

  lines.push(`$ Total blocks used: ${allBlocks.length} (data: ${dataBlocks.length}, index overhead: ${overhead})`);
  lines.push(`$ Allocation complete ✓`);
  el.trace.textContent = lines.join("\n");
}

// ─── Main Run ─────────────────────────────────────────────────────────────────

function gatherParams() {
  return {
    totalBlocks: Number(el.totalBlocks.value),
    fileName: el.fileName.value.trim() || "file.txt",
    fileSize: Number(el.fileSize.value),
    startBlock: Number(el.startBlock.value),
    linkedBlocks: el.linkedBlocks.value,
    indexBlock: el.indexBlock.value,
    indexedBlocks: el.indexedBlocks.value,
    l1IndexBlock: el.l1IndexBlock.value,
    l2IndexBlocks: el.l2IndexBlocks.value,
    mlDataBlocks: el.mlDataBlocks.value,
  };
}

function runAllocator(addToExisting = false) {
  try {
    const params = gatherParams();

    if (!addToExisting) allocatedFiles = [];

    let result;
    if (selectedAlgorithm === "Sequential") result = allocateSequential(params);
    else if (selectedAlgorithm === "Linked") result = allocateLinked(params);
    else if (selectedAlgorithm === "Indexed") result = allocateIndexed(params);
    else if (selectedAlgorithm === "Multi-level Indexed") result = allocateMultiLevelIndexed(params);

    allocatedFiles.push(result);

    // Stats
    const totalData = result.dataBlocks.length;
    const totalOverhead = result.overhead;
    el.error.textContent = "";
    el.status.textContent = "ALLOCATED";
    el.activeAlgo.textContent = selectedAlgorithm;
    el.blocksUsed.textContent = String(totalData);
    el.overhead.textContent = totalOverhead === 0 ? "None" : `${totalOverhead} block${totalOverhead !== 1 ? "s" : ""}`;
    el.runBadge.textContent = `${selectedAlgorithm} — ${result.fileName}`;

    renderDiskMap(params.totalBlocks);
    renderStructure(result);
    renderTrace(result);
    updateBlockCount();
  } catch (err) {
    el.error.textContent = err.message;
    el.status.textContent = "ERROR";
  }
}

// ─── UI ───────────────────────────────────────────────────────────────────────

function updateConditionalFields() {
  el.linkedField.classList.toggle("visible", selectedAlgorithm === "Linked" || selectedAlgorithm === "Sequential");
  // Sequential: show start block only
  // Actually show linkedField only for linked, start block for sequential
  el.linkedField.classList.toggle("visible", selectedAlgorithm === "Linked");
  el.indexBlockField.classList.toggle("visible", selectedAlgorithm === "Indexed");
  el.indexedDataField.classList.toggle("visible", selectedAlgorithm === "Indexed");
  el.l1IndexField.classList.toggle("visible", selectedAlgorithm === "Multi-level Indexed");
  el.l2IndexField.classList.toggle("visible", selectedAlgorithm === "Multi-level Indexed");
  el.mlDataField.classList.toggle("visible", selectedAlgorithm === "Multi-level Indexed");

  // Start block only relevant for sequential
  document.querySelectorAll(".start-block-group").forEach(el => {
    el.style.display = selectedAlgorithm === "Sequential" ? "" : "none";
  });
}

function selectAlgorithm(type) {
  selectedAlgorithm = type;
  el.activeAlgo.textContent = type;
  updateConditionalFields();
  document.querySelectorAll(".algo").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.algo === type);
  });
}

function setupAlgorithms() {
  el.algoButtons.innerHTML = algorithms.map(algo => (
    `<button class="algo ${algo === selectedAlgorithm ? "active" : ""}" data-algo="${algo}">${algo}</button>`
  )).join("");
  el.chipList.innerHTML = algorithms.map(algo => `<span class="chip">${algo}</span>`).join("");
  document.querySelectorAll(".algo").forEach(btn => {
    btn.addEventListener("click", () => selectAlgorithm(btn.dataset.algo));
  });
}

function updateBlockCount() {
  const total = Number(el.totalBlocks.value);
  const used = getUsedBlocks().size;
  el.blockCount.textContent = `${used}/${total} blocks used`;
}

el.run.addEventListener("click", () => runAllocator(false));

el.addFile.addEventListener("click", () => {
  if (allocatedFiles.length === 0) {
    el.error.textContent = "Run a first allocation before adding another file.";
    return;
  }
  runAllocator(true);
});

el.sample.addEventListener("click", () => {
  allocatedFiles = [];
  el.totalBlocks.value = "32";
  el.diskSize && (el.diskSize.value = "32");

  // Load sample for selected algorithm
  if (selectedAlgorithm === "Sequential") {
    el.fileName.value = "report.pdf";
    el.fileSize.value = "5";
    el.startBlock.value = "4";
  } else if (selectedAlgorithm === "Linked") {
    el.fileName.value = "music.mp3";
    el.fileSize.value = "6";
    el.linkedBlocks.value = "3, 9, 14, 20, 25, 30";
  } else if (selectedAlgorithm === "Indexed") {
    el.fileName.value = "video.mp4";
    el.fileSize.value = "6";
    el.indexBlock.value = "5";
    el.indexedBlocks.value = "8, 13, 17, 22, 27, 31";
  } else {
    el.fileName.value = "bigfile.bin";
    el.fileSize.value = "6";
    el.l1IndexBlock.value = "3";
    el.l2IndexBlocks.value = "6, 10";
    el.mlDataBlocks.value = "14, 18, 21, 25, 28, 31";
  }
  runAllocator(false);
});

el.reset.addEventListener("click", () => {
  allocatedFiles = [];
  el.fileName.value = "myfile.txt";
  el.fileSize.value = "6";
  el.startBlock.value = "2";
  el.linkedBlocks.value = "2, 7, 12, 18, 24, 29";
  el.indexBlock.value = "5";
  el.indexedBlocks.value = "8, 13, 17, 22, 27, 31";
  el.l1IndexBlock.value = "3";
  el.l2IndexBlocks.value = "6, 10";
  el.mlDataBlocks.value = "14, 18, 21, 25, 28, 31";
  el.diskMap.innerHTML = "";
  el.legend.innerHTML = "";
  el.structViz.innerHTML = "";
  el.status.textContent = "IDLE";
  el.blocksUsed.textContent = "—";
  el.overhead.textContent = "—";
  el.runBadge.textContent = "No allocation yet";
  el.trace.textContent = "$ FILE_ALLOCATOR initialized\n$ Configure a file and select an allocation method...";
  el.error.textContent = "";
  updateBlockCount();
  renderDiskMap(Number(el.totalBlocks.value));
});

el.totalBlocks.addEventListener("input", () => {
  updateBlockCount();
  renderDiskMap(Number(el.totalBlocks.value));
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
setupAlgorithms();
updateConditionalFields();
updateBlockCount();
renderDiskMap(Number(el.totalBlocks.value));
