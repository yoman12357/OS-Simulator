const graphModels = {
    rag: createGraphModel(3, 3),
    wfg: createGraphModel(3, 3)
};

const banker = {
    p: 5,
    r: 3,
    allocation: [],
    max: [],
    available: []
};

const nodeColors = ['#4da3ff', '#60e87a', '#ffd760', '#ff7eb3', '#a78bfa', '#fb923c', '#34d399', '#f87171'];

document.addEventListener('DOMContentLoaded', () => {
    createRagModel();
    createWfgModel();
    createBankerModel();
    setView('rag');
});

function setView(view) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach(panel => {
        panel.classList.toggle('active', panel.id === view + '-view');
    });
    setStatus(view.toUpperCase());
    redrawAll();
}

function setStatus(text) {
    document.getElementById('status-pill').textContent = text;
}

function clamp(value, min, max, fallback) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function createGraphModel(processes, resources) {
    return {
        p: processes,
        r: resources,
        allocations: [],
        requests: [],
        cycleNodes: new Set(),
        cycleEdges: new Set()
    };
}

function makeMatrix(rows, cols, value = 0) {
    return Array.from({ length: rows }, () => Array(cols).fill(value));
}

function pName(index) {
    return 'P' + index;
}

function rName(index) {
    return 'R' + index;
}

function createRagModel() {
    const p = clamp(document.getElementById('rag-process-count').value, 1, 8, 3);
    const r = clamp(document.getElementById('rag-resource-count').value, 1, 8, 3);
    graphModels.rag = createGraphModel(p, r);
    fillGraphSelectors('rag');
    const result = document.getElementById('rag-result');
    result.textContent = 'Add edges and run detection.';
    result.className = 'result-bar';
    renderGraphEdgeList('rag');
    drawRagCanvas('rag-canvas', graphModels.rag, false);
}

function createWfgModel() {
    const p = clamp(document.getElementById('wfg-process-count').value, 1, 8, 3);
    const r = clamp(document.getElementById('wfg-resource-count').value, 1, 8, 3);
    graphModels.wfg = createGraphModel(p, r);
    fillGraphSelectors('wfg');
    const result = document.getElementById('wfg-result');
    result.textContent = 'Add edges and run detection.';
    result.className = 'result-bar';
    renderGraphEdgeList('wfg');
    drawRagCanvas('wfg-rag-canvas', graphModels.wfg, false);
    drawWfgCanvas('wfg-canvas', graphModels.wfg);
}

function fillGraphSelectors(prefix) {
    const model = graphModels[prefix];
    fillOptions(prefix + '-alloc-process', model.p, pName);
    fillOptions(prefix + '-req-process', model.p, pName);
    fillOptions(prefix + '-alloc-resource', model.r, rName);
    fillOptions(prefix + '-req-resource', model.r, rName);
}

function fillOptions(id, count, nameFn) {
    const select = document.getElementById(id);
    select.innerHTML = '';
    for (let i = 0; i < count; i++) {
        select.appendChild(new Option(nameFn(i), i));
    }
}

function addRagAllocation() {
    addAllocation('rag');
}

function addRagRequest() {
    addRequest('rag');
}

function addWfgAllocation() {
    addAllocation('wfg');
}

function addWfgRequest() {
    addRequest('wfg');
}

function addAllocation(prefix) {
    const model = graphModels[prefix];
    const p = Number.parseInt(document.getElementById(prefix + '-alloc-process').value, 10);
    const r = Number.parseInt(document.getElementById(prefix + '-alloc-resource').value, 10);

    removeMatching(model.requests, p, r);
    for (let i = model.allocations.length - 1; i >= 0; i--) {
        if (model.allocations[i].r === r) model.allocations.splice(i, 1);
    }
    addUniqueEdge(model.allocations, p, r);
    clearCycle(model);
    markGraphDirty(prefix);
    updateGraphOutput(prefix);
}

function addRequest(prefix) {
    const model = graphModels[prefix];
    const p = Number.parseInt(document.getElementById(prefix + '-req-process').value, 10);
    const r = Number.parseInt(document.getElementById(prefix + '-req-resource').value, 10);

    removeMatching(model.allocations, p, r);
    addUniqueEdge(model.requests, p, r);
    clearCycle(model);
    markGraphDirty(prefix);
    updateGraphOutput(prefix);
}

function addUniqueEdge(list, p, r) {
    if (!list.some(edge => edge.p === p && edge.r === r)) {
        list.push({ p, r });
    }
}

function removeMatching(list, p, r) {
    const index = list.findIndex(edge => edge.p === p && edge.r === r);
    if (index !== -1) list.splice(index, 1);
}

function clearRagEdges() {
    clearGraphEdges('rag');
}

function clearWfgEdges() {
    clearGraphEdges('wfg');
}

function clearGraphEdges(prefix) {
    const model = graphModels[prefix];
    model.allocations = [];
    model.requests = [];
    clearCycle(model);
    const result = document.getElementById(prefix + '-result');
    result.textContent = 'Edges cleared.';
    result.className = 'result-bar';
    updateGraphOutput(prefix);
}

function markGraphDirty(prefix) {
    const result = document.getElementById(prefix + '-result');
    result.textContent = 'Graph changed. Run detection again.';
    result.className = 'result-bar';
}

function clearCycle(model) {
    model.cycleNodes.clear();
    model.cycleEdges.clear();
}

function updateGraphOutput(prefix) {
    renderGraphEdgeList(prefix);
    if (prefix === 'rag') {
        drawRagCanvas('rag-canvas', graphModels.rag, false);
    } else {
        drawRagCanvas('wfg-rag-canvas', graphModels.wfg, false);
        drawWfgCanvas('wfg-canvas', graphModels.wfg);
    }
}

function analyzeRag() {
    const model = graphModels.rag;
    const cycle = findCycle(buildRagGraph(model));
    applyCycle(model, cycle);

    const result = document.getElementById('rag-result');
    if (cycle.length) {
        result.textContent = 'Deadlock detected: ' + cycle.join(' -> ');
        result.className = 'result-bar danger';
        setStatus('Deadlock');
    } else {
        result.textContent = 'No deadlock detected.';
        result.className = 'result-bar safe';
        setStatus('Safe');
    }
    drawRagCanvas('rag-canvas', model, false);
}

function analyzeWfg() {
    const model = graphModels.wfg;
    const cycle = findCycle(buildWfgGraph(model));
    applyCycle(model, cycle);

    const result = document.getElementById('wfg-result');
    if (cycle.length) {
        result.textContent = 'Deadlock detected in WFG: ' + cycle.join(' -> ');
        result.className = 'result-bar danger';
        setStatus('Deadlock');
    } else {
        result.textContent = 'No deadlock detected.';
        result.className = 'result-bar safe';
        setStatus('Safe');
    }
    drawRagCanvas('wfg-rag-canvas', model, true);
    drawWfgCanvas('wfg-canvas', model);
}

function buildRagGraph(model) {
    const graph = {};
    for (let p = 0; p < model.p; p++) graph[pName(p)] = [];
    for (let r = 0; r < model.r; r++) graph[rName(r)] = [];

    model.requests.forEach(edge => graph[pName(edge.p)].push(rName(edge.r)));
    model.allocations.forEach(edge => graph[rName(edge.r)].push(pName(edge.p)));
    return graph;
}

function buildWfgGraph(model) {
    const graph = {};
    for (let p = 0; p < model.p; p++) graph[pName(p)] = [];

    getWaitEdges(model).forEach(edge => {
        const from = pName(edge.from);
        const to = pName(edge.to);
        if (!graph[from].includes(to)) graph[from].push(to);
    });
    return graph;
}

function getWaitEdges(model) {
    const edges = [];
    model.requests.forEach(req => {
        model.allocations.forEach(alloc => {
            if (req.r === alloc.r && req.p !== alloc.p) {
                edges.push({ from: req.p, to: alloc.p, r: req.r });
            }
        });
    });
    return edges;
}

function findCycle(graph) {
    const visited = new Set();
    const active = new Set();
    const stack = [];

    function dfs(node) {
        visited.add(node);
        active.add(node);
        stack.push(node);

        for (const next of graph[node] || []) {
            if (!visited.has(next)) {
                const found = dfs(next);
                if (found.length) return found;
            } else if (active.has(next)) {
                const start = stack.indexOf(next);
                return stack.slice(start).concat(next);
            }
        }

        stack.pop();
        active.delete(node);
        return [];
    }

    for (const node of Object.keys(graph)) {
        if (!visited.has(node)) {
            const cycle = dfs(node);
            if (cycle.length) return cycle;
        }
    }
    return [];
}

function applyCycle(model, cycle) {
    clearCycle(model);
    cycle.forEach(node => model.cycleNodes.add(node));
    for (let i = 0; i < cycle.length - 1; i++) {
        model.cycleEdges.add(cycle[i] + '->' + cycle[i + 1]);
    }
}

function createBankerModel() {
    banker.p = clamp(document.getElementById('banker-process-count').value, 1, 8, 5);
    banker.r = clamp(document.getElementById('banker-resource-count').value, 1, 6, 3);
    banker.allocation = makeMatrix(banker.p, banker.r, 0);
    banker.max = makeMatrix(banker.p, banker.r, 0);
    banker.available = Array(banker.r).fill(0);
    document.getElementById('banker-result').textContent = 'Enter matrices and check state.';
    document.getElementById('banker-result').className = 'result-bar';
    document.getElementById('banker-sequence').textContent = '';
    renderBankerMatrices();
}

function clearBanker() {
    banker.allocation = makeMatrix(banker.p, banker.r, 0);
    banker.max = makeMatrix(banker.p, banker.r, 0);
    banker.available = Array(banker.r).fill(0);
    document.getElementById('banker-result').textContent = 'Values cleared.';
    document.getElementById('banker-result').className = 'result-bar';
    document.getElementById('banker-sequence').textContent = '';
    renderBankerMatrices();
}

function renderBankerMatrices() {
    const container = document.getElementById('banker-matrices');
    container.innerHTML = '';
    container.appendChild(createMatrix('Allocation', banker.allocation, 'allocation', true));
    container.appendChild(createMatrix('Max', banker.max, 'max', true));
    container.appendChild(createMatrix('Need', computeNeed(), 'need', false));
    container.appendChild(createAvailableMatrix());
}

function createMatrix(title, matrix, type, editable) {
    const card = document.createElement('div');
    card.className = 'matrix-card';
    let html = '<h3>' + title + '</h3><table><thead><tr><th></th>';
    for (let r = 0; r < banker.r; r++) html += '<th>' + rName(r) + '</th>';
    html += '</tr></thead><tbody>';

    for (let p = 0; p < banker.p; p++) {
        html += '<tr><th>' + pName(p) + '</th>';
        for (let r = 0; r < banker.r; r++) {
            const value = matrix[p][r];
            if (editable) {
                html += '<td><input min="0" type="number" value="' + value + '" onchange="updateBankerValue(\'' + type + '\',' + p + ',' + r + ',this.value)"></td>';
            } else {
                html += '<td>' + value + '</td>';
            }
        }
        html += '</tr>';
    }

    html += '</tbody></table>';
    card.innerHTML = html;
    return card;
}

function createAvailableMatrix() {
    const card = document.createElement('div');
    card.className = 'matrix-card';
    let html = '<h3>Available</h3><table><thead><tr>';
    for (let r = 0; r < banker.r; r++) html += '<th>' + rName(r) + '</th>';
    html += '</tr></thead><tbody><tr>';
    for (let r = 0; r < banker.r; r++) {
        html += '<td><input min="0" type="number" value="' + banker.available[r] + '" onchange="updateAvailable(' + r + ',this.value)"></td>';
    }
    html += '</tr></tbody></table>';
    card.innerHTML = html;
    return card;
}

function updateBankerValue(type, p, r, value) {
    const number = Math.max(0, Number.parseInt(value, 10) || 0);
    banker[type][p][r] = number;
    renderBankerMatrices();
}

function updateAvailable(r, value) {
    banker.available[r] = Math.max(0, Number.parseInt(value, 10) || 0);
    renderBankerMatrices();
}

function computeNeed() {
    return banker.max.map((row, p) => {
        return row.map((maxValue, r) => Math.max(0, maxValue - banker.allocation[p][r]));
    });
}

function runBanker() {
    const need = computeNeed();
    const work = [...banker.available];
    const finish = Array(banker.p).fill(false);
    const sequence = [];
    let changed = true;

    while (sequence.length < banker.p && changed) {
        changed = false;
        for (let p = 0; p < banker.p; p++) {
            if (finish[p]) continue;
            const canRun = need[p].every((needValue, r) => needValue <= work[r]);
            if (canRun) {
                for (let r = 0; r < banker.r; r++) {
                    work[r] += banker.allocation[p][r];
                }
                finish[p] = true;
                sequence.push(p);
                changed = true;
            }
        }
    }

    const result = document.getElementById('banker-result');
    const sequenceBox = document.getElementById('banker-sequence');

    if (finish.every(Boolean)) {
        result.textContent = 'Safe state';
        result.className = 'result-bar safe';
        sequenceBox.textContent = 'Safe sequence: ' + sequence.map(pName).join(' -> ');
        setStatus('Safe');
    } else {
        const unfinished = finish.map((done, p) => done ? null : pName(p)).filter(Boolean);
        result.textContent = 'Unsafe state';
        result.className = 'result-bar danger';
        sequenceBox.textContent = 'Could not finish: ' + unfinished.join(', ');
        setStatus('Unsafe');
    }
    renderBankerMatrices();
}

function loadRagSample() {
    document.getElementById('rag-process-count').value = 3;
    document.getElementById('rag-resource-count').value = 3;
    createRagModel();
    graphModels.rag.allocations = [{ p: 0, r: 0 }, { p: 1, r: 1 }, { p: 2, r: 2 }];
    graphModels.rag.requests = [{ p: 0, r: 1 }, { p: 1, r: 2 }, { p: 2, r: 0 }];
    updateGraphOutput('rag');
    analyzeRag();
}

function loadWfgSample() {
    document.getElementById('wfg-process-count').value = 3;
    document.getElementById('wfg-resource-count').value = 3;
    createWfgModel();
    graphModels.wfg.allocations = [{ p: 0, r: 0 }, { p: 1, r: 1 }, { p: 2, r: 2 }];
    graphModels.wfg.requests = [{ p: 0, r: 1 }, { p: 1, r: 2 }, { p: 2, r: 0 }];
    updateGraphOutput('wfg');
    analyzeWfg();
}

function loadBankerSample() {
    document.getElementById('banker-process-count').value = 5;
    document.getElementById('banker-resource-count').value = 3;
    createBankerModel();
    banker.allocation = [
        [0, 1, 0],
        [2, 0, 0],
        [3, 0, 2],
        [2, 1, 1],
        [0, 0, 2]
    ];
    banker.max = [
        [7, 5, 3],
        [3, 2, 2],
        [9, 0, 2],
        [2, 2, 2],
        [4, 3, 3]
    ];
    banker.available = [3, 3, 2];
    renderBankerMatrices();
    runBanker();
}

function renderGraphEdgeList(prefix) {
    const model = graphModels[prefix];
    const target = document.getElementById(prefix + '-edge-list');
    const lines = [];

    model.allocations.forEach(edge => {
        lines.push('<span class="allocation-edge">' + rName(edge.r) + ' -> ' + pName(edge.p) + '</span>');
    });
    model.requests.forEach(edge => {
        lines.push('<span class="request-edge">' + pName(edge.p) + ' -> ' + rName(edge.r) + '</span>');
    });

    if (prefix === 'wfg') {
        getWaitEdges(model).forEach(edge => {
            lines.push('<span class="wait-edge">' + pName(edge.from) + ' -> ' + pName(edge.to) + ' via ' + rName(edge.r) + '</span>');
        });
    }

    target.innerHTML = lines.length ? lines.join('') : '<span>No edges yet</span>';
}

function redrawAll() {
    drawRagCanvas('rag-canvas', graphModels.rag, false);
    drawRagCanvas('wfg-rag-canvas', graphModels.wfg, true);
    drawWfgCanvas('wfg-canvas', graphModels.wfg);
}

function drawRagCanvas(canvasId, model, highlightWfgCycle) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = setupCanvas(canvas);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    drawCanvasGrid(ctx, width, height);

    const pPos = [];
    const rPos = [];
    for (let p = 0; p < model.p; p++) pPos[p] = leftColumnPosition(p, model.p, width, height);
    for (let r = 0; r < model.r; r++) rPos[r] = rightColumnPosition(r, model.r, width, height);

    model.requests.forEach(edge => {
        const key = pName(edge.p) + '->' + rName(edge.r);
        drawArrow(ctx, pPos[edge.p], rPos[edge.r], '#ffd760', model.cycleEdges.has(key));
    });
    model.allocations.forEach(edge => {
        const key = rName(edge.r) + '->' + pName(edge.p);
        drawArrow(ctx, rPos[edge.r], pPos[edge.p], '#60e87a', model.cycleEdges.has(key));
    });

    for (let p = 0; p < model.p; p++) {
        const name = pName(p);
        drawCircleNode(ctx, pPos[p], name, nodeColors[p % nodeColors.length], model.cycleNodes.has(name));
    }
    for (let r = 0; r < model.r; r++) {
        const name = rName(r);
        drawBoxNode(ctx, rPos[r], name, model.cycleNodes.has(name) && !highlightWfgCycle);
    }
}

function drawWfgCanvas(canvasId, model) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = setupCanvas(canvas);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    drawCanvasGrid(ctx, width, height);

    const positions = circlePositions(model.p, width, height);
    getWaitEdges(model).forEach(edge => {
        const key = pName(edge.from) + '->' + pName(edge.to);
        drawArrow(ctx, positions[edge.from], positions[edge.to], '#ff7eb3', model.cycleEdges.has(key), rName(edge.r));
    });

    for (let p = 0; p < model.p; p++) {
        const name = pName(p);
        drawCircleNode(ctx, positions[p], name, nodeColors[p % nodeColors.length], model.cycleNodes.has(name));
    }
}

function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    return ctx;
}

function drawCanvasGrid(ctx, width, height) {
    ctx.save();
    ctx.strokeStyle = 'rgba(103,168,255,0.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = 0; y < height; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    ctx.restore();
}

function leftColumnPosition(index, total, width, height) {
    return {
        x: Math.max(70, width * 0.22),
        y: ((index + 1) * height) / (total + 1)
    };
}

function rightColumnPosition(index, total, width, height) {
    return {
        x: Math.min(width - 70, width * 0.78),
        y: ((index + 1) * height) / (total + 1)
    };
}

function circlePositions(total, width, height) {
    const positions = [];
    const radius = Math.min(width, height) * 0.32;
    const cx = width / 2;
    const cy = height / 2;
    for (let i = 0; i < total; i++) {
        const angle = -Math.PI / 2 + (Math.PI * 2 * i) / Math.max(total, 1);
        positions.push({
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius
        });
    }
    return positions;
}

function drawArrow(ctx, from, to, color, highlight, label) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const startPad = 34;
    const endPad = 34;
    const x1 = from.x + Math.cos(angle) * startPad;
    const y1 = from.y + Math.sin(angle) * startPad;
    const x2 = to.x - Math.cos(angle) * endPad;
    const y2 = to.y - Math.sin(angle) * endPad;
    const lineColor = highlight ? '#f87171' : color;

    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.fillStyle = lineColor;
    ctx.lineWidth = highlight ? 3.5 : 2;
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = highlight ? 16 : 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 12 * Math.cos(angle - Math.PI / 6), y2 - 12 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - 12 * Math.cos(angle + Math.PI / 6), y2 - 12 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    if (label) {
        ctx.shadowBlur = 0;
        ctx.font = '600 11px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#dcecff';
        ctx.fillText(label, (x1 + x2) / 2, (y1 + y2) / 2 - 8);
    }
    ctx.restore();
}

function drawCircleNode(ctx, pos, label, color, highlight) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, highlight ? 31 : 27, 0, Math.PI * 2);
    ctx.fillStyle = highlight ? '#f87171' : color;
    ctx.shadowColor = highlight ? '#f87171' : color;
    ctx.shadowBlur = highlight ? 22 : 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.font = '700 13px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pos.x, pos.y);
    ctx.restore();
}

function drawBoxNode(ctx, pos, label, highlight) {
    ctx.save();
    roundedRect(ctx, pos.x - 28, pos.y - 28, 56, 56, 10);
    ctx.fillStyle = highlight ? '#f87171' : '#99c9ff';
    ctx.shadowColor = highlight ? '#f87171' : '#99c9ff';
    ctx.shadowBlur = highlight ? 22 : 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.font = '700 13px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pos.x, pos.y);
    ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}
