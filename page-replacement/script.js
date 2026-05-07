// ─────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────
const simState = {
    currentAlgo: 'fifo',
    simulationCount: 0,
    lastResult: null
};

// ─────────────────────────────────────────────────────
//  ALGORITHM METADATA
// ─────────────────────────────────────────────────────
const algoMeta = {
    fifo: {
        name: 'FIFO',
        syntax: 'Non-preemptive · Queue-based',
        desc: 'First-In First-Out. Replaces the page that has been in memory the longest. Simple, but can suffer Belady\'s Anomaly — adding more frames may actually increase page faults.'
    },
    lru: {
        name: 'LRU',
        syntax: 'Non-preemptive · Recency-based',
        desc: 'Least Recently Used. Replaces the page that was used longest ago. Approximates optimal behavior, does NOT suffer Belady\'s Anomaly. Widely used in practice.'
    },
    optimal: {
        name: 'Optimal (OPT)',
        syntax: 'Theoretical · Future knowledge required',
        desc: 'Replaces the page that will NOT be used for the longest time in the future. Gives the minimum possible page faults. Used as a benchmark — cannot be implemented in a real OS.'
    },
    lfu: {
        name: 'LFU',
        syntax: 'Non-preemptive · Frequency-based',
        desc: 'Least Frequently Used. Replaces the page with the lowest reference count. Tie-break: evict the one used least recently among those with equal count.'
    },
    mfu: {
        name: 'MFU',
        syntax: 'Non-preemptive · Frequency-based (inverse)',
        desc: 'Most Frequently Used. Counter-intuitive: replaces the page used MOST often, reasoning it has already been used enough. Rarely optimal but useful for contrast demos.'
    },
    clock: {
        name: 'Clock (Second Chance)',
        syntax: 'Non-preemptive · Reference bit · Circular queue',
        desc: 'Approximates LRU using a circular list and reference bits. On each page reference, if the reference bit is 1, clear it and move on. Evict the first page with bit = 0. Efficient and hardware-friendly.'
    }
};

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    updateAlgoDoc('fifo');
    setActiveAlgo('fifo');
    document.getElementById('ref-string').addEventListener('keypress', e => {
        if (e.key === 'Enter') runSimulator();
    });
    document.getElementById('frame-count').addEventListener('keypress', e => {
        if (e.key === 'Enter') runSimulator();
    });
});

// ─────────────────────────────────────────────────────
//  ALGO SELECTION
// ─────────────────────────────────────────────────────
function selectAlgo(algo) {
    simState.currentAlgo = algo;
    setActiveAlgo(algo);
    updateAlgoDoc(algo);
    document.getElementById('algo-display').textContent = algoMeta[algo].name;
}

function selectAlgoAndRun(algo) {
    selectAlgo(algo);
    runSimulator();
}

function setActiveAlgo(algo) {
    document.querySelectorAll('.nav-item[data-algo]').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.algo === algo);
    });
}

function updateAlgoDoc(algo) {
    const meta = algoMeta[algo];
    if (!meta) return;
    document.getElementById('doc-name').textContent   = meta.name;
    document.getElementById('doc-syntax').textContent = meta.syntax;
    document.getElementById('doc-desc').textContent   = meta.desc;
}

// ─────────────────────────────────────────────────────
//  INPUT PARSING
// ─────────────────────────────────────────────────────
function parseRefString(raw) {
    // accepts space, comma, or mixed separators
    return raw.trim()
              .split(/[\s,]+/)
              .map(s => s.trim())
              .filter(s => s !== '')
              .map(s => {
                  const n = parseInt(s, 10);
                  return isNaN(n) ? null : n;
              })
              .filter(n => n !== null);
}

function getInputs() {
    const raw    = document.getElementById('ref-string').value;
    const frames = Math.max(1, parseInt(document.getElementById('frame-count').value) || 3);
    const pages  = parseRefString(raw);
    return { pages, frames };
}

// ─────────────────────────────────────────────────────
//  ALGORITHM IMPLEMENTATIONS
//  Each returns: { steps: [...], faults, hits }
//  step: { page, frames: [...], fault: bool, replaced: number|null }
//    frames array length === numFrames, -1 means empty slot
// ─────────────────────────────────────────────────────

/* ── FIFO ── */
function runFIFO(pages, numFrames) {
    const frames  = new Array(numFrames).fill(-1);   // -1 = empty
    const queue   = [];   // tracks insertion order
    const steps   = [];
    let faults = 0, hits = 0;

    for (const page of pages) {
        const inFrames = frames.includes(page);
        let replaced = null;

        if (!inFrames) {
            faults++;
            if (queue.length < numFrames) {
                // find first empty slot
                const emptyIdx = frames.indexOf(-1);
                frames[emptyIdx] = page;
                queue.push(page);
            } else {
                // evict oldest
                const victim = queue.shift();
                const idx = frames.indexOf(victim);
                replaced = victim;
                frames[idx] = page;
                queue.push(page);
            }
        } else {
            hits++;
        }

        steps.push({
            page,
            frames: [...frames],
            fault: !inFrames,
            replaced
        });
    }
    return { steps, faults, hits };
}

/* ── LRU ── */
function runLRU(pages, numFrames) {
    const frames  = new Array(numFrames).fill(-1);
    const lastUsed = {};  // page -> last used index in pages
    const steps   = [];
    let faults = 0, hits = 0;

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const inFrames = frames.includes(page);
        let replaced = null;

        if (!inFrames) {
            faults++;
            if (frames.includes(-1)) {
                const emptyIdx = frames.indexOf(-1);
                frames[emptyIdx] = page;
            } else {
                // find frame whose page was used least recently
                let lruPage = null, lruTime = Infinity;
                for (const f of frames) {
                    const t = lastUsed[f] !== undefined ? lastUsed[f] : -1;
                    if (t < lruTime) { lruTime = t; lruPage = f; }
                }
                const idx = frames.indexOf(lruPage);
                replaced = lruPage;
                frames[idx] = page;
            }
        } else {
            hits++;
        }

        lastUsed[page] = i;
        steps.push({ page, frames: [...frames], fault: !inFrames, replaced });
    }
    return { steps, faults, hits };
}

/* ── OPTIMAL ── */
function runOptimal(pages, numFrames) {
    const frames = new Array(numFrames).fill(-1);
    const steps  = [];
    let faults = 0, hits = 0;

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const inFrames = frames.includes(page);
        let replaced = null;

        if (!inFrames) {
            faults++;
            if (frames.includes(-1)) {
                const emptyIdx = frames.indexOf(-1);
                frames[emptyIdx] = page;
            } else {
                // find which frame's page won't be used longest (or never)
                let farthest = -1, victimPage = null;
                for (const f of frames) {
                    // next use of page f after index i
                    let nextUse = pages.indexOf(f, i + 1);
                    if (nextUse === -1) nextUse = Infinity;
                    if (nextUse > farthest) { farthest = nextUse; victimPage = f; }
                }
                const idx = frames.indexOf(victimPage);
                replaced = victimPage;
                frames[idx] = page;
            }
        } else {
            hits++;
        }

        steps.push({ page, frames: [...frames], fault: !inFrames, replaced });
    }
    return { steps, faults, hits };
}

/* ── LFU ── */
function runLFU(pages, numFrames) {
    const frames   = new Array(numFrames).fill(-1);
    const freq     = {};  // page -> frequency count
    const lastSeen = {};  // page -> last access index (for tie-breaking)
    const steps    = [];
    let faults = 0, hits = 0;

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const inFrames = frames.includes(page);
        let replaced = null;

        if (!inFrames) {
            faults++;
            freq[page]    = (freq[page] || 0);   // will be incremented after
            if (frames.includes(-1)) {
                const emptyIdx = frames.indexOf(-1);
                frames[emptyIdx] = page;
            } else {
                // evict frame with lowest frequency; tie-break: least recently used
                let minFreq = Infinity, lfuPage = null;
                for (const f of frames) {
                    const fc = freq[f] || 0;
                    const ls = lastSeen[f] !== undefined ? lastSeen[f] : -1;
                    if (fc < minFreq || (fc === minFreq && ls < (lastSeen[lfuPage] !== undefined ? lastSeen[lfuPage] : -1))) {
                        minFreq = fc; lfuPage = f;
                    }
                }
                const idx = frames.indexOf(lfuPage);
                replaced = lfuPage;
                frames[idx] = page;
            }
        } else {
            hits++;
        }

        freq[page]    = (freq[page] || 0) + 1;
        lastSeen[page] = i;
        steps.push({ page, frames: [...frames], fault: !inFrames, replaced });
    }
    return { steps, faults, hits };
}

/* ── MFU ── */
function runMFU(pages, numFrames) {
    const frames   = new Array(numFrames).fill(-1);
    const freq     = {};
    const lastSeen = {};
    const steps    = [];
    let faults = 0, hits = 0;

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const inFrames = frames.includes(page);
        let replaced = null;

        if (!inFrames) {
            faults++;
            if (frames.includes(-1)) {
                const emptyIdx = frames.indexOf(-1);
                frames[emptyIdx] = page;
            } else {
                // evict frame with HIGHEST frequency; tie-break: least recently used
                let maxFreq = -1, mfuPage = null;
                for (const f of frames) {
                    const fc = freq[f] || 0;
                    const ls = lastSeen[f] !== undefined ? lastSeen[f] : -1;
                    if (fc > maxFreq || (fc === maxFreq && ls < (lastSeen[mfuPage] !== undefined ? lastSeen[mfuPage] : -1))) {
                        maxFreq = fc; mfuPage = f;
                    }
                }
                const idx = frames.indexOf(mfuPage);
                replaced = mfuPage;
                frames[idx] = page;
            }
        } else {
            hits++;
        }

        freq[page]     = (freq[page] || 0) + 1;
        lastSeen[page] = i;
        steps.push({ page, frames: [...frames], fault: !inFrames, replaced });
    }
    return { steps, faults, hits };
}

/* ── CLOCK (Second Chance) ── */
function runClock(pages, numFrames) {
    // circular buffer: each slot { page, refBit }
    const slots = new Array(numFrames).fill(null).map(() => ({ page: -1, refBit: 0 }));
    let hand     = 0;   // clock hand pointer
    let filled   = 0;   // number of non-empty slots
    const steps  = [];
    let faults = 0, hits = 0;

    for (const page of pages) {
        // check if page is already in a slot
        const hitSlot = slots.findIndex(s => s.page === page);
        let replaced = null;

        if (hitSlot !== -1) {
            hits++;
            slots[hitSlot].refBit = 1;  // set reference bit on hit
        } else {
            faults++;
            if (filled < numFrames) {
                // find first empty slot
                const emptyIdx = slots.findIndex(s => s.page === -1);
                slots[emptyIdx] = { page, refBit: 1 };
                filled++;
                // advance hand to next slot after filled one
                hand = (emptyIdx + 1) % numFrames;
            } else {
                // clock replacement
                let safety = 0;
                while (slots[hand].refBit === 1 && safety < numFrames * 2) {
                    slots[hand].refBit = 0;
                    hand = (hand + 1) % numFrames;
                    safety++;
                }
                replaced = slots[hand].page;
                slots[hand] = { page, refBit: 1 };
                hand = (hand + 1) % numFrames;
            }
        }

        // snapshot of pages in current slots (in slot order)
        const frameSnap = slots.map(s => s.page);
        steps.push({ page, frames: frameSnap, fault: hitSlot === -1, replaced });
    }
    return { steps, faults, hits };
}

// ─────────────────────────────────────────────────────
//  RUN
// ─────────────────────────────────────────────────────
function runSimulator() {
    const { pages, frames } = getInputs();

    if (pages.length === 0) {
        addLog('$ Error: please enter a valid page reference string', 'error');
        return;
    }
    if (frames < 1 || frames > 10) {
        addLog('$ Error: frames must be between 1 and 10', 'error');
        return;
    }

    const algo = simState.currentAlgo;
    simState.simulationCount++;

    addLog('$ Running ' + algoMeta[algo].name + ' | frames=' + frames + ' | refs=' + pages.length, 'info');
    addLog('$ Reference string: ' + pages.join(' '), 'input');

    let result;
    switch (algo) {
        case 'fifo':    result = runFIFO(pages, frames);    break;
        case 'lru':     result = runLRU(pages, frames);     break;
        case 'optimal': result = runOptimal(pages, frames); break;
        case 'lfu':     result = runLFU(pages, frames);     break;
        case 'mfu':     result = runMFU(pages, frames);     break;
        case 'clock':   result = runClock(pages, frames);   break;
        default:        result = runFIFO(pages, frames);
    }

    simState.lastResult = { ...result, algo, pages, frames };

    const total     = pages.length;
    const hitRate   = ((result.hits   / total) * 100).toFixed(1) + '%';
    const faultRate = ((result.faults / total) * 100).toFixed(1) + '%';

    // console trace (per step)
    result.steps.forEach((step, i) => {
        const frameStr = step.frames.map(f => f === -1 ? '—' : f).join(', ');
        if (step.fault) {
            const replStr = step.replaced !== null ? ' (replaced page ' + step.replaced + ')' : '';
            addLog('  Step ' + (i+1) + ': ref=' + step.page + ' → FAULT' + replStr + ' | [' + frameStr + ']', 'fault');
        } else {
            addLog('  Step ' + (i+1) + ': ref=' + step.page + ' → HIT  | [' + frameStr + ']', 'hit');
        }
    });

    addLog('$ Faults=' + result.faults + '  Hits=' + result.hits + '  HitRate=' + hitRate + '  FaultRate=' + faultRate, 'info');

    // update hero stats
    document.getElementById('status-text').textContent = 'DONE';
    document.getElementById('hero-faults').textContent = result.faults;
    document.getElementById('exec-count').textContent  = 'Simulations: ' + simState.simulationCount;
    document.getElementById('frame-algo-badge').textContent = algoMeta[algo].name + ' · ' + frames + ' frames · ' + pages.length + ' refs';

    // overview cards
    document.getElementById('ov-faults').textContent   = result.faults;
    document.getElementById('ov-hits').textContent     = result.hits;
    document.getElementById('ov-hitrate').textContent  = hitRate;
    document.getElementById('ov-faultrate').textContent= faultRate;

    renderFrameTable(result.steps, frames, pages);
    renderSummary(result, algo, frames, total);
}

// ─────────────────────────────────────────────────────
//  RENDER: FRAME STATE TABLE
// ─────────────────────────────────────────────────────
function renderFrameTable(steps, numFrames, pages) {
    const container = document.getElementById('frame-viz-container');
    container.innerHTML = '';

    if (steps.length === 0) {
        container.innerHTML = '<div class="viz-empty">No steps to show.</div>';
        return;
    }

    // ── Reference string header row ──
    const refRow = document.createElement('div');
    refRow.className = 'ref-row';

    const refLabel = document.createElement('div');
    refLabel.className = 'row-label';
    refLabel.textContent = 'REF';
    refRow.appendChild(refLabel);

    steps.forEach(step => {
        const cell = document.createElement('div');
        cell.className = 'ref-cell';
        cell.textContent = step.page;
        refRow.appendChild(cell);
    });

    container.appendChild(refRow);

    // ── Frame rows (one per frame slot) ──
    for (let f = 0; f < numFrames; f++) {
        const row = document.createElement('div');
        row.className = 'frame-row';

        const lbl = document.createElement('div');
        lbl.className = 'frame-row-label';
        lbl.textContent = 'F' + (f + 1);
        row.appendChild(lbl);

        steps.forEach(step => {
            const cell = document.createElement('div');
            cell.className = 'frame-cell';
            const pageInSlot = step.frames[f];

            if (pageInSlot === -1 || pageInSlot === undefined) {
                cell.classList.add('is-empty');
                cell.textContent = '';
            } else {
                cell.textContent = pageInSlot;
                if (!step.fault) {
                    cell.classList.add('is-hit');
                } else if (step.replaced !== null && pageInSlot === step.page) {
                    // this is the newly loaded page in a fault+replace
                    cell.classList.add('is-fault');
                } else if (step.fault && pageInSlot === step.page) {
                    // fault with no replace (empty slot was used)
                    cell.classList.add('is-fault');
                }
            }

            row.appendChild(cell);
        });

        container.appendChild(row);
    }

    // ── Fault/Hit indicator row ──
    const indRow = document.createElement('div');
    indRow.className = 'indicator-row';

    const indLabel = document.createElement('div');
    indLabel.className = 'row-label';
    indLabel.textContent = '';
    indRow.appendChild(indLabel);

    steps.forEach(step => {
        const cell = document.createElement('div');
        cell.className = 'indicator-cell ' + (step.fault ? 'fault' : 'hit');
        cell.textContent = step.fault ? 'FAULT' : 'HIT';
        indRow.appendChild(cell);
    });

    container.appendChild(indRow);

    // show legend
    document.getElementById('viz-legend').style.display = 'flex';
}

// ─────────────────────────────────────────────────────
//  RENDER: SUMMARY PANEL
// ─────────────────────────────────────────────────────
function renderSummary(result, algo, frames, total) {
    const wrap = document.getElementById('summary-wrap');
    wrap.innerHTML = '';

    const rows = [
        { label: 'Algorithm',   value: algoMeta[algo].name,                cls: '' },
        { label: 'Frames',      value: frames,                             cls: '' },
        { label: 'References',  value: total,                              cls: '' },
        { label: 'Page Faults', value: result.faults,                      cls: 'metric-fault' },
        { label: 'Page Hits',   value: result.hits,                        cls: 'metric-hit' },
        { label: 'Hit Rate',    value: ((result.hits   / total) * 100).toFixed(1) + '%', cls: 'metric-rate' },
        { label: 'Fault Rate',  value: ((result.faults / total) * 100).toFixed(1) + '%', cls: 'metric-rate' }
    ];

    rows.forEach(r => {
        const row = document.createElement('div');
        row.className = 'metric-row';
        row.innerHTML =
            '<span class="metric-label">' + r.label + '</span>' +
            '<span class="metric-value ' + r.cls + '">' + r.value + '</span>';
        wrap.appendChild(row);
    });

    document.getElementById('summary-badge').textContent = algoMeta[algo].name;
}

// ─────────────────────────────────────────────────────
//  BELADY'S DEMO
// ─────────────────────────────────────────────────────
function loadBeladys() {
    // Classic Belady's anomaly string: 3 frames = 9 faults, 4 frames = 10 faults
    const beladyString = '1 2 3 4 1 2 5 1 2 3 4 5';
    document.getElementById('ref-string').value  = beladyString;
    document.getElementById('frame-count').value = 3;
    selectAlgo('fifo');
    addLog('$ Loaded Belady\'s Anomaly demo string: ' + beladyString, 'info');
    addLog('$ Algorithm set to FIFO. Running comparison...', 'info');
    runBeladysComparison(beladyString);
}

function runBeladysComparison(refStr) {
    const pages = parseRefString(refStr);
    const r3 = runFIFO(pages, 3);
    const r4 = runFIFO(pages, 4);

    const wrap = document.getElementById('belady-wrap');
    wrap.innerHTML = '';

    // 3 frames row
    const row3 = document.createElement('div');
    row3.className = 'belady-row';
    row3.innerHTML =
        '<div class="belady-frames-label">3 Frames</div>' +
        '<div class="belady-value">' + r3.faults + ' faults</div>' +
        '<div class="belady-sub">' + r3.hits + ' hits · ' + ((r3.hits / pages.length)*100).toFixed(1) + '% hit rate</div>';
    wrap.appendChild(row3);

    // 4 frames row
    const row4 = document.createElement('div');
    row4.className = 'belady-row';
    row4.innerHTML =
        '<div class="belady-frames-label">4 Frames</div>' +
        '<div class="belady-value">' + r4.faults + ' faults</div>' +
        '<div class="belady-sub">' + r4.hits + ' hits · ' + ((r4.hits / pages.length)*100).toFixed(1) + '% hit rate</div>';
    wrap.appendChild(row4);

    // verdict
    const verdict = document.createElement('div');
    if (r4.faults > r3.faults) {
        verdict.className = 'belady-verdict anomaly';
        verdict.textContent = '⚠ Belady\'s Anomaly detected! 4 frames → MORE faults than 3 frames.';
    } else if (r4.faults === r3.faults) {
        verdict.className = 'belady-verdict no-anomaly';
        verdict.textContent = 'Equal faults. No anomaly on this string.';
    } else {
        verdict.className = 'belady-verdict no-anomaly';
        verdict.textContent = '✓ No anomaly. 4 frames → fewer faults as expected.';
    }
    wrap.appendChild(verdict);

    addLog('$ Belady Demo → FIFO 3 frames: ' + r3.faults + ' faults | 4 frames: ' + r4.faults + ' faults', 'info');
    if (r4.faults > r3.faults) {
        addLog('$ ⚠ Belady\'s Anomaly detected on this reference string!', 'fault');
    }

    // now run the 3-frame simulation visually
    runSimulator();
}

// ─────────────────────────────────────────────────────
//  SAMPLE LOAD
// ─────────────────────────────────────────────────────
function loadSample() {
    // Classic textbook string: FIFO 3-frame → 9 faults, OPT → 6 faults
    document.getElementById('ref-string').value  = '3 0 1 2 0 3 0 4 2 3';
    document.getElementById('frame-count').value = 3;
    addLog('$ Loaded sample reference string: 3 0 1 2 0 3 0 4 2 3', 'info');
    addLog('$ FIFO(3f)=9 faults | LRU(3f)=8 | OPT(3f)=6 faults', 'info');
}

// ─────────────────────────────────────────────────────
//  CLEAR
// ─────────────────────────────────────────────────────
function clearAll() {
    document.getElementById('ref-string').value  = '';
    document.getElementById('frame-count').value = 3;
    document.getElementById('frame-viz-container').innerHTML =
        '<div class="viz-empty">Enter a reference string and click <strong>Run Simulator</strong> to visualize.</div>';
    document.getElementById('viz-legend').style.display = 'none';
    document.getElementById('frame-algo-badge').textContent = 'No algorithm run yet';
    document.getElementById('console-output').innerHTML = '';
    document.getElementById('summary-wrap').innerHTML  = '<div class="panel-empty">Run the simulator to see results.</div>';
    document.getElementById('belady-wrap').innerHTML   = '<div class="panel-empty">Click <strong>Belady\'s Demo</strong> to compare FIFO with 3 vs 4 frames on the same string.</div>';
    document.getElementById('summary-badge').textContent = 'Post-run';

    // reset overview cards
    ['ov-faults','ov-hits','ov-hitrate','ov-faultrate'].forEach(id => {
        document.getElementById(id).textContent = '—';
    });
    document.getElementById('hero-faults').textContent = '—';
    document.getElementById('status-text').textContent = 'IDLE';

    addLog('$ Cleared. Ready for new simulation.', 'info');
}

// ─────────────────────────────────────────────────────
//  CONSOLE LOG HELPER
// ─────────────────────────────────────────────────────
function addLog(text, type) {
    type = type || 'output';
    const output = document.getElementById('console-output');
    const line   = document.createElement('div');
    line.className = 'console-line line-' + type;
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

// ─────────────────────────────────────────────────────
//  REFERENCE PANEL (footer link)
// ─────────────────────────────────────────────────────
function showReference() {
    addLog('─── PAGE REPLACEMENT ALGORITHM REFERENCE ───', 'info');
    addLog('FIFO    : Evict oldest page. Suffers Belady\'s Anomaly.', 'info');
    addLog('LRU     : Evict least recently used. No Belady\'s. Practical.', 'info');
    addLog('Optimal : Evict page used farthest in future. Min faults. Theoretical only.', 'info');
    addLog('LFU     : Evict page with lowest access count. Tie→LRU.', 'info');
    addLog('MFU     : Evict page with highest access count. Rare; contrast demo.', 'info');
    addLog('Clock   : Circular queue + reference bits. Approx LRU, hardware-friendly.', 'info');
    addLog('─── METRICS ───', 'info');
    addLog('Fault Rate  = Page Faults / Total References', 'info');
    addLog('Hit Rate    = Page Hits   / Total References', 'info');
    addLog('Belady Anomaly: FIFO can have MORE faults with MORE frames.', 'info');
}
