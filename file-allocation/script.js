// ── Constants ────────────────────────────────────────────────────────────────
const COLORS = [
    '#4da3ff', '#60e87a', '#ffd760', '#ff7eb3',
    '#a78bfa', '#fb923c', '#34d399', '#f87171',
    '#38bdf8', '#e879f9'
];

const METHOD_META = {
    contiguous: {
        name: 'Sequential',
        display: 'SEQ',
        syntax: 'Non-preemptive · External fragmentation',
        desc: 'Files stored in consecutive disk blocks. Simple and fast for sequential reads, but suffers from external fragmentation and requires knowing file size upfront.'
    },
    linked: {
        name: 'Linked List',
        display: 'LINK',
        syntax: 'Dynamic · Pointer overhead',
        desc: 'Each block holds a pointer to the next block. No external fragmentation and files can grow dynamically, but random access is slow and pointer damage breaks the chain.'
    },
    indexed: {
        name: 'Indexed',
        display: 'IDX',
        syntax: 'Direct access · One index block per file',
        desc: 'Each file gets a dedicated index block storing pointers to all data blocks. Supports direct access without fragmentation, but wastes a full block even for tiny files.'
    },
    sta: {
        name: 'Smart Tiered (STA)',
        display: 'STA',
        syntax: 'Adaptive · Tier-based overhead',
        desc: 'Automatically selects the best strategy per file size. Tiny files get zero index overhead, medium files share one index block, large files use a two-level index.'
    }
};

// ── State ────────────────────────────────────────────────────────────────────
let diskBlocks = [];
let files = [];
let currentMethod = 'contiguous';
let simCount = 0;

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    updateFileSizeInputs();
    setupInitialDiskBlocks();
    setActiveMethod('contiguous');
    updateMethodDoc('contiguous');

    document.getElementById('num-files').addEventListener('change', updateFileSizeInputs);
    document.getElementById('total-blocks').addEventListener('change', onDiskSizeChange);
});

// ── Method selection ──────────────────────────────────────────────────────────
function selectMethod(m) {
    currentMethod = m;
    setActiveMethod(m);
    updateMethodDoc(m);
    const meta = METHOD_META[m];
    document.getElementById('method-display').textContent = meta.display;
}

function selectMethodAndRun(m) {
    selectMethod(m);
    runSimulation();
}

function setActiveMethod(m) {
    document.querySelectorAll('.nav-item[data-method]').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.method === m);
    });
}

function updateMethodDoc(m) {
    const meta = METHOD_META[m];
    if (!meta) return;
    document.getElementById('doc-name').textContent   = meta.name;
    document.getElementById('doc-syntax').textContent = meta.syntax;
    document.getElementById('doc-desc').textContent   = meta.desc;
}

// ── Disk size change ──────────────────────────────────────────────────────────
function onDiskSizeChange() {
    const hasBusy = diskBlocks.some(b => b.initiallyBusy);
    if (hasBusy) {
        const ok = confirm('Changing disk size will clear your busy-block selections. Continue?');
        if (!ok) {
            document.getElementById('total-blocks').value = diskBlocks.length;
            return;
        }
    }
    setupInitialDiskBlocks();
}

// ── File size inputs ──────────────────────────────────────────────────────────
function updateFileSizeInputs() {
    const n = parseInt(document.getElementById('num-files').value) || 3;
    const container = document.getElementById('file-sizes-container');
    container.innerHTML = '';

    for (let i = 0; i < n; i++) {
        const row = document.createElement('div');
        row.className = 'file-size-row';

        const dot = document.createElement('span');
        dot.className = 'file-color-dot';
        dot.style.background = COLORS[i % COLORS.length];

        const label = document.createElement('span');
        label.className = 'file-size-label';
        label.textContent = `F${i + 1}`;

        const input = document.createElement('input');
        input.type = 'number';
        input.id = `file-size-${i}`;
        input.className = 'field-input file-size';
        input.min = 1; input.max = 20;
        input.value = Math.floor(Math.random() * 5) + 2;

        row.appendChild(dot);
        row.appendChild(label);
        row.appendChild(input);
        container.appendChild(row);
    }

    document.getElementById('file-badge').textContent =
        n + ' file' + (n !== 1 ? 's' : '');
}

// ── Disk setup ────────────────────────────────────────────────────────────────
function setupInitialDiskBlocks() {
    diskBlocks = [];
    files = [];
    const total = parseInt(document.getElementById('total-blocks').value) || 30;

    for (let i = 0; i < total; i++) {
        diskBlocks.push({ id: i, allocated: false, fileId: null, isIndex: false, isTier: null, nextBlock: null, initiallyBusy: false });
    }

    document.getElementById('block-count').textContent = total;
    resetMetrics();
    clearResultsTable();
    clearConsole();
    addLog('$ FILE_ALLOCATOR initialized', 'info');
    addLog('$ Add files, mark busy blocks, then run simulation...', 'info');
    renderDisk({ interactive: true });
}

function toggleBlockBusy(id) {
    diskBlocks[id].initiallyBusy = !diskBlocks[id].initiallyBusy;
    diskBlocks[id].allocated     = diskBlocks[id].initiallyBusy;
    renderDisk({ interactive: true });
}

function resetSimulation() {
    updateFileSizeInputs();
    setupInitialDiskBlocks();
}

// ── Run ───────────────────────────────────────────────────────────────────────
function runSimulation() {
    files = [];
    // Reset non-busy blocks
    for (let i = 0; i < diskBlocks.length; i++) {
        if (!diskBlocks[i].initiallyBusy) {
            diskBlocks[i].allocated = false;
            diskBlocks[i].fileId    = null;
            diskBlocks[i].isIndex   = false;
            diskBlocks[i].isTier    = null;
            diskBlocks[i].nextBlock = null;
        }
    }

    const n = parseInt(document.getElementById('num-files').value) || 1;
    const inputs = document.querySelectorAll('.file-size');

    for (let i = 0; i < n; i++) {
        const size = parseInt(inputs[i]?.value);
        if (isNaN(size) || size < 1) { addLog(`Error: invalid size for F${i + 1}`, 'error'); return; }
        files.push({ id: i, name: `F${i + 1}`, size, color: COLORS[i % COLORS.length], blocks: [] });
    }

    clearConsole();
    addLog(`$ Running ${METHOD_META[currentMethod].name} on ${files.length} file(s)...`, 'info');
    document.getElementById('status-text').textContent = 'RUNNING';

    const log = [];
    let ok = false;

    switch (currentMethod) {
        case 'contiguous': ok = allocateSequential(log); break;
        case 'linked':     ok = allocateLinked(log);     break;
        case 'indexed':    ok = allocateIndexed(log);    break;
        case 'sta':        ok = allocateSTA(log);        break;
    }

    if (!ok) { document.getElementById('status-text').textContent = 'FAILED'; return; }

    simCount++;
    document.getElementById('status-text').textContent = 'DONE';
    document.getElementById('sim-count').textContent = 'Simulations: ' + simCount;
    document.getElementById('disk-method-badge').textContent = METHOD_META[currentMethod].name;

    log.forEach(e => {
        if (e.case === 'contiguous') {
            addLog(`  ${e.file} → blocks ${e.result}`, 'output');
        } else if (e.case === 'linked') {
            addLog(`  ${e.file} → chain: ${e.chain}`, 'output');
        } else if (e.case === 'indexed') {
            addLog(`  ${e.file} → index[${e.indexBlock}] data[${e.dataBlocks}]`, 'output');
        } else if (e.case === 'sta') {
            addLog(`  ${e.file} [T${e.tier}] → ${e.desc}`, 'output');
        }
    });

    // Stats
    const totalBlocks = diskBlocks.length;
    const busyBefore  = diskBlocks.filter(b => b.initiallyBusy).length;
    const usedAfter   = diskBlocks.filter(b => b.allocated).length;
    const freeAfter   = totalBlocks - usedAfter;
    const util        = ((usedAfter / totalBlocks) * 100).toFixed(1) + '%';

    document.getElementById('free-blocks').textContent = freeAfter;
    document.getElementById('used-blocks').textContent = usedAfter;
    document.getElementById('disk-util').textContent   = util;
    addLog(`$ Free=${freeAfter}  Used=${usedAfter}  Util=${util}`, 'info');

    renderDisk({ interactive: false });
    renderResultsTable(log);
}

// ══════════════════════════════════════════════════════════════════════════════
//  ALGORITHMS (unchanged logic, same as original)
// ══════════════════════════════════════════════════════════════════════════════

function allocateSequential(log) {
    for (const file of files) {
        const extraBlocks = file.size;
        let fileStart = -1, count = 0, start = 0;
        for (let i = 0; i < diskBlocks.length; i++) {
            if (!diskBlocks[i].allocated) {
                if (count === 0) start = i;
                count++;
                if (count === file.size) { fileStart = start; break; }
            } else { count = 0; }
        }

        if (fileStart === -1) {
            addLog(`Error: No contiguous space of ${file.size} blocks for ${file.name}`, 'error');
            return false;
        }

        const fileEnd = fileStart + file.size - 1;
        for (let i = fileStart; i <= fileEnd; i++) {
            diskBlocks[i].allocated = true;
            diskBlocks[i].fileId    = file.id;
            file.blocks.push(i);
        }

        const growEnd = fileEnd + extraBlocks;
        let adjacentFree = (growEnd < diskBlocks.length);
        if (adjacentFree) {
            for (let i = fileEnd + 1; i <= growEnd; i++) {
                if (diskBlocks[i].allocated) { adjacentFree = false; break; }
            }
        }

        if (adjacentFree) {
            for (let i = fileEnd + 1; i <= growEnd; i++) {
                diskBlocks[i].allocated = true;
                diskBlocks[i].fileId    = file.id;
                file.blocks.push(i);
            }
            log.push({ file: file.name, original: `${fileStart}–${fileEnd}`, result: `Extended → blocks ${fileStart}–${growEnd}`, blocks: file.blocks.join(', '), case: 'contiguous', indexBlock: '—' });
        } else {
            const requiredSize = file.size + extraBlocks;
            for (let i = fileStart; i <= fileEnd; i++) { diskBlocks[i].allocated = false; diskBlocks[i].fileId = null; }
            file.blocks = [];
            let newStart = -1, c = 0, s = 0;
            for (let i = 0; i < diskBlocks.length; i++) {
                if (!diskBlocks[i].allocated) {
                    if (c === 0) s = i;
                    c++;
                    if (c === requiredSize) { newStart = s; break; }
                } else { c = 0; }
            }
            if (newStart === -1) {
                for (let i = fileStart; i <= fileEnd; i++) diskBlocks[i].allocated = true;
                addLog(`Error: No contiguous space of ${requiredSize} blocks for ${file.name} relocation`, 'error');
                return false;
            }
            const newEnd = newStart + requiredSize - 1;
            for (let i = newStart; i <= newEnd; i++) {
                diskBlocks[i].allocated = true;
                diskBlocks[i].fileId    = file.id;
                file.blocks.push(i);
            }
            log.push({ file: file.name, original: `${fileStart}–${fileEnd}`, result: `Adjacent occupied → Relocated to blocks ${newStart}–${newEnd}`, blocks: file.blocks.join(', '), case: 'contiguous', indexBlock: '—' });
        }
    }
    return true;
}

function allocateLinked(log) {
    for (const file of files) {
        const freeList = diskBlocks.map((b, i) => (!b.allocated ? i : -1)).filter(i => i !== -1);
        if (freeList.length < file.size) {
            addLog(`Error: Only ${freeList.length} free blocks, need ${file.size} for ${file.name}`, 'error');
            return false;
        }
        const chosen = freeList.slice(0, file.size);
        for (let i = 0; i < chosen.length; i++) {
            const idx = chosen[i];
            diskBlocks[idx].allocated = true;
            diskBlocks[idx].fileId    = file.id;
            diskBlocks[idx].nextBlock = i < chosen.length - 1 ? chosen[i + 1] : null;
            file.blocks.push(idx);
        }
        log.push({ file: file.name, head: chosen[0], tail: chosen[chosen.length - 1], chain: chosen.join(' → ') + ' → NULL', blocks: chosen.join(', '), case: 'linked', indexBlock: '—' });
    }
    return true;
}

function allocateIndexed(log) {
    for (const file of files) {
        const extraBlocks = file.size;
        const allFree = diskBlocks.map((b, i) => (!b.allocated ? i : -1)).filter(i => i !== -1);
        if (allFree.length < 1 + extraBlocks) {
            addLog(`Error: Need ${1 + extraBlocks} blocks for ${file.name}, only ${allFree.length} free`, 'error');
            return false;
        }
        const idxBlk = allFree[0];
        diskBlocks[idxBlk].allocated = true;
        diskBlocks[idxBlk].fileId    = file.id;
        diskBlocks[idxBlk].isIndex   = true;
        file.indexBlock = idxBlk;

        const freeList = diskBlocks.map((b, i) => (!b.allocated ? i : -1)).filter(i => i !== -1);
        const chosen = freeList.slice(0, extraBlocks);
        for (const idx of chosen) {
            diskBlocks[idx].allocated = true;
            diskBlocks[idx].fileId    = file.id;
            file.blocks.push(idx);
        }
        log.push({ file: file.name, indexBlock: idxBlk, dataBlocks: chosen.join(', '), blocks: chosen.join(', '), case: 'indexed', indexList: `[${chosen.join(', ')}]` });
    }
    return true;
}

function allocateSTA(log) {
    const t1 = files.filter(f => f.size <= 2);
    const t2 = files.filter(f => f.size >= 3 && f.size <= 8);
    const t3 = files.filter(f => f.size >= 9);

    const t2Shared   = t2.length > 0 ? 1 : 0;
    const t3Extra    = t3.reduce((a, f) => a + 1 + Math.ceil(f.size / 4), 0);
    const totalData  = files.reduce((a, f) => a + f.size, 0);
    const totalNeeded = totalData + t2Shared + t3Extra;

    const freeAll = diskBlocks.map((b, i) => (!b.allocated ? i : -1)).filter(i => i !== -1);
    if (freeAll.length < totalNeeded) {
        addLog(`Error: STA needs ${totalNeeded} blocks, only ${freeAll.length} free`, 'error');
        return false;
    }

    let ptr = 0;
    const getFree = () => freeAll[ptr++];

    let sharedIdx = null;
    if (t2.length > 0) {
        sharedIdx = getFree();
        diskBlocks[sharedIdx].allocated = true;
        diskBlocks[sharedIdx].fileId    = -1;
        diskBlocks[sharedIdx].isIndex   = true;
        diskBlocks[sharedIdx].isTier    = 2;
    }

    for (const file of t1) {
        file.tier = 1;
        for (let b = 0; b < file.size; b++) {
            const blk = getFree();
            diskBlocks[blk].allocated = true;
            diskBlocks[blk].fileId    = file.id;
            diskBlocks[blk].isTier    = 1;
            file.blocks.push(blk);
        }
        log.push({ file: file.name, tier: 1, blocks: file.blocks.join(', '), indexBlock: 'None (direct)', case: 'sta', desc: 'Direct pointers in directory. Zero index overhead.' });
    }

    for (const file of t2) {
        file.tier = 2;
        file.indexBlock = sharedIdx;
        for (let b = 0; b < file.size; b++) {
            const blk = getFree();
            diskBlocks[blk].allocated = true;
            diskBlocks[blk].fileId    = file.id;
            diskBlocks[blk].isTier    = 2;
            file.blocks.push(blk);
        }
        log.push({ file: file.name, tier: 2, blocks: file.blocks.join(', '), indexBlock: `Block ${sharedIdx} (shared)`, case: 'sta', desc: `Shares index block ${sharedIdx} with other medium files.` });
    }

    for (const file of t3) {
        file.tier = 3;
        const mainIdx = getFree();
        diskBlocks[mainIdx].allocated = true;
        diskBlocks[mainIdx].fileId    = file.id;
        diskBlocks[mainIdx].isIndex   = true;
        diskBlocks[mainIdx].isTier    = 3;
        file.indexBlock = mainIdx;
        file.subIndexes = [];

        const subs = Math.ceil(file.size / 4);
        let left = file.size;
        for (let s = 0; s < subs; s++) {
            const sub = getFree();
            diskBlocks[sub].allocated = true;
            diskBlocks[sub].fileId    = file.id;
            diskBlocks[sub].isIndex   = true;
            diskBlocks[sub].isTier    = 3;
            file.subIndexes.push(sub);
            const take = Math.min(4, left); left -= take;
            for (let d = 0; d < take; d++) {
                const blk = getFree();
                diskBlocks[blk].allocated = true;
                diskBlocks[blk].fileId    = file.id;
                diskBlocks[blk].isTier    = 3;
                file.blocks.push(blk);
            }
        }
        log.push({ file: file.name, tier: 3, blocks: file.blocks.join(', '), indexBlock: `Block ${mainIdx} → subs [${file.subIndexes.join(', ')}]`, case: 'sta', desc: `Two-level index. Block ${mainIdx} → sub-indexes → data.` });
    }

    return true;
}

// ══════════════════════════════════════════════════════════════════════════════
//  RENDERING
// ══════════════════════════════════════════════════════════════════════════════

function renderDisk({ interactive }) {
    const container = document.getElementById('disk-container');
    container.innerHTML = '';

    for (let i = 0; i < diskBlocks.length; i++) {
        const block = diskBlocks[i];
        const el    = document.createElement('div');
        el.classList.add('disk-block');

        if (block.initiallyBusy && block.fileId === null) {
            el.classList.add('busy');
            const n = document.createElement('span');
            n.textContent = i;
            const x = document.createElement('span');
            x.className = 'busy-mark';
            x.textContent = 'BUSY';
            el.appendChild(n);
            el.appendChild(x);

        } else if (block.allocated && block.fileId !== null && block.fileId !== -1) {
            const file = files[block.fileId];
            el.classList.add('allocated');
            el.style.background = hexToRgba(file.color, 0.75);
            el.setAttribute('data-file', file.name);

            if (block.isIndex) {
                el.classList.add('index-block');
                el.textContent = block.isTier === 2 ? 'SI' : `I${file.id + 1}`;
            } else {
                el.textContent = i;
            }

            if (block.nextBlock !== null) {
                const ptr = document.createElement('span');
                ptr.className = 'ptr-arrow';
                ptr.textContent = '→';
                el.appendChild(ptr);
            }

        } else if (block.allocated && block.fileId === -1) {
            el.classList.add('allocated', 'index-block');
            el.setAttribute('data-file', 'Shared Idx');
            el.textContent = 'SI';

        } else {
            el.classList.add('free');
            el.textContent = i;
        }

        if (interactive) {
            el.addEventListener('click', () => toggleBlockBusy(i));
        }

        container.appendChild(el);
    }

    // Legend
    const legend = document.getElementById('disk-legend');
    legend.innerHTML = '';
    const addLeg = (color, label, dashed = false) => {
        const item   = document.createElement('div');
        item.className = 'legend-item';
        const sw     = document.createElement('div');
        sw.className = 'legend-color';
        sw.style.background = color;
        if (dashed) sw.style.border = '2px dashed rgba(168,85,247,0.7)';
        const txt    = document.createElement('span');
        txt.textContent = label;
        item.appendChild(sw);
        item.appendChild(txt);
        legend.appendChild(item);
    };

    addLeg('rgba(255,255,255,0.06)', 'Free');
    addLeg('rgba(248,113,113,0.3)', 'Busy');

    for (const file of files) addLeg(hexToRgba(file.color, 0.75), file.name);

    if (currentMethod === 'indexed') addLeg('rgba(192,132,252,0.38)', 'Index Block', true);
    if (currentMethod === 'sta') {
        addLeg('rgba(192,132,252,0.38)', 'Index / Sub-Index', true);
        addLeg('rgba(168,85,247,0.38)', 'Shared Index (T2)');
    }
}

function renderResultsTable(log) {
    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';

    log.forEach(e => {
        const file = files.find(f => f.name === e.file);
        const tr   = document.createElement('tr');

        let tierCell = '';
        if (e.tier !== undefined) {
            tierCell = `<span class="tier-badge tier-${e.tier}">T${e.tier}</span>`;
        } else {
            tierCell = '—';
        }

        tr.innerHTML =
            `<td><span class="proc-dot" style="background:${file.color}"></span>${e.file}</td>` +
            `<td>${file.size}</td>` +
            `<td>${e.indexBlock || '—'}</td>` +
            `<td>${e.blocks}</td>`;

        tbody.appendChild(tr);
    });

    document.getElementById('file-badge').textContent =
        files.length + ' file' + (files.length !== 1 ? 's' : '');
}

function clearResultsTable() {
    document.getElementById('results-tbody').innerHTML =
        '<tr><td colspan="4" class="table-empty">Run simulation to see results</td></tr>';
}

// ── Console ───────────────────────────────────────────────────────────────────
function addLog(text, type = 'output') {
    const out  = document.getElementById('console-output');
    const line = document.createElement('div');
    line.className = 'console-line line-' + type;
    line.textContent = text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
}

function clearConsole() {
    document.getElementById('console-output').innerHTML = '';
}

function resetMetrics() {
    document.getElementById('free-blocks').textContent = '—';
    document.getElementById('used-blocks').textContent = '—';
    document.getElementById('disk-util').textContent   = '—';
    document.getElementById('status-text').textContent = 'IDLE';
    document.getElementById('disk-method-badge').textContent = 'No simulation run yet';
}

function showReference() {
    addLog('--- METHOD REFERENCE ---', 'info');
    addLog('Sequential : Contiguous blocks. Fast reads, external fragmentation.', 'info');
    addLog('Linked     : Each block → next pointer. No fragmentation, slow random.', 'info');
    addLog('Indexed    : One index block per file holds all pointers.', 'info');
    addLog('STA        : T1(≤2 direct) T2(3-8 shared index) T3(9+ two-level).', 'info');
    addLog('--- TERMS ---', 'info');
    addLog('SI = Shared Index (STA Tier 2)  |  IX = Index Block', 'info');
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
}
