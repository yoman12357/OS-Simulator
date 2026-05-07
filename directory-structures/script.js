// ─────────────────────────────────────────────
// STATE & CONFIG
// ─────────────────────────────────────────────
const state = {
    mode: 'dag', // 'dag' | 'general'
    nodes: [], // { id: string, name: string, x: number, y: number }
    links: [], // { id: string, source: string, target: string }
    isTraversing: false,
    traversalMetrics: { steps: 0, shared: 0, cycles: 0 }
};

const MODE_META = {
    dag: {
        title: 'Directed Acyclic Graph',
        syntax: 'Safe · Hierarchical · Shared Nodes',
        desc: 'A DAG allows files and subdirectories to be shared across multiple parent directories without duplicating data. Because it strictly prevents cycles (A -> B -> A), standard recursive traversal algorithms can safely navigate the structure without infinite loops.'
    },
    general: {
        title: 'General Graph',
        syntax: 'Cycles Permitted · Requires Safety Checks',
        desc: 'General Graphs permit cycles, often occurring via cyclic symlinks in a filesystem. Traversal algorithms must actively maintain a stack or "visited" set to detect cycles and prevent fatal infinite recursion.'
    }
};

// ─────────────────────────────────────────────
// INIT & EVENT LISTENERS
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    addLog('$ DIRECTORY_GRAPH_LAB initialized', 'info');
    addLog('$ Engine ready. Select mode and build structure.', 'info');
    
    // Drag and drop setup for graph viewport
    setupGraphInteractions();
    
    document.getElementById('node-name').addEventListener('keypress', e => {
        if (e.key === 'Enter') addNode();
    });
});

// ─────────────────────────────────────────────
// GRAPH BUILDER API
// ─────────────────────────────────────────────
function setMode(mode) {
    if (state.isTraversing) return;
    state.mode = mode;
    
    // Update UI
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('is-active', el.dataset.mode === mode);
    });
    document.getElementById('mode-display').textContent = mode.toUpperCase();
    document.getElementById('graph-badge').textContent = mode.toUpperCase() + ' Mode';
    document.getElementById('doc-badge').textContent = mode.toUpperCase();
    
    const meta = MODE_META[mode];
    document.getElementById('doc-title').textContent = meta.title;
    document.getElementById('doc-syntax').textContent = meta.syntax;
    document.getElementById('doc-desc').textContent = meta.desc;

    // Validate existing graph for cycles if switching to DAG
    if (mode === 'dag' && hasCycle()) {
        addLog('! Warning: Existing graph contains cycles. Clearing structure to enforce DAG rules.', 'error');
        clearGraph();
    } else {
        addLog(`$ Switched to ${meta.title} mode`, 'info');
    }
}

function addNode(nameParam, xParam, yParam) {
    if (state.isTraversing) return;
    
    const nameInput = document.getElementById('node-name');
    const name = nameParam || nameInput.value.trim();
    
    if (!name) {
        addLog('Error: Node name cannot be empty', 'error');
        return;
    }
    
    // Auto placement (grid-like drop)
    const count = state.nodes.length;
    const x = xParam !== undefined ? xParam : 20 + (count % 4) * 20; 
    const y = yParam !== undefined ? yParam : 20 + Math.floor(count / 4) * 25;

    const id = 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    state.nodes.push({ id, name, x, y });
    
    nameInput.value = '';
    updateGraphUI();
    addLog(`$ Added directory node [${name}]`, 'output');
}

function addLink(sourceIdParam, targetIdParam) {
    if (state.isTraversing) return;

    const sourceSelect = document.getElementById('link-from');
    const targetSelect = document.getElementById('link-to');
    
    const sourceId = sourceIdParam || sourceSelect.value;
    const targetId = targetIdParam || targetSelect.value;
    
    if (!sourceId || !targetId) {
        addLog('Error: Must select source and target', 'error');
        return;
    }
    if (sourceId === targetId) {
        addLog('Error: Self-referencing links not allowed in this lab', 'error');
        return;
    }
    
    // Check duplicates
    if (state.links.some(l => l.source === sourceId && l.target === targetId)) {
        addLog('Error: Link already exists', 'error');
        return;
    }

    // Speculative add to check cycles
    const newLink = { id: 'l_' + Date.now(), source: sourceId, target: targetId };
    state.links.push(newLink);

    if (state.mode === 'dag' && hasCycle()) {
        state.links.pop(); // Revert
        addLog('Error: Cyclic link rejected. DAG mode strictly prohibits cycles.', 'error');
        animateRejectNode(sourceId);
        animateRejectNode(targetId);
        return;
    }

    updateGraphUI();
    const sName = state.nodes.find(n => n.id === sourceId).name;
    const tName = state.nodes.find(n => n.id === targetId).name;
    addLog(`$ Linked [${sName}] → [${tName}]`, 'output');
}

function clearGraph() {
    if (state.isTraversing) return;
    state.nodes = [];
    state.links = [];
    updateGraphUI();
    resetMetrics();
    addLog('$ Graph cleared', 'info');
}

// ─────────────────────────────────────────────
// GRAPH CYCLE DETECTION
// ─────────────────────────────────────────────
function hasCycle() {
    const adj = buildAdjacencyList();
    const visited = new Set();
    const recStack = new Set();

    for (let node of state.nodes) {
        if (!visited.has(node.id)) {
            if (detectCycleDFS(node.id, visited, recStack, adj)) return true;
        }
    }
    return false;
}

function detectCycleDFS(nodeId, visited, recStack, adj) {
    visited.add(nodeId);
    recStack.add(nodeId);
    
    for (let neighbor of (adj[nodeId] || [])) {
        if (!visited.has(neighbor)) {
            if (detectCycleDFS(neighbor, visited, recStack, adj)) return true;
        } else if (recStack.has(neighbor)) {
            return true;
        }
    }
    recStack.delete(nodeId);
    return false;
}

function buildAdjacencyList() {
    const adj = {};
    state.nodes.forEach(n => adj[n.id] = []);
    state.links.forEach(l => {
        if (adj[l.source]) adj[l.source].push(l.target);
    });
    return adj;
}

// ─────────────────────────────────────────────
// TRAVERSAL ENGINE
// ─────────────────────────────────────────────
async function runTraversal() {
    if (state.isTraversing || state.nodes.length === 0) return;
    
    state.isTraversing = true;
    resetMetrics();
    resetGraphStyles();
    document.getElementById('status-text').textContent = 'TRAVERSING';
    document.getElementById('status-dot').style.background = '#60e87a';
    addLog('$ Initiating Depth-First Search traversal...', 'info');

    const adj = buildAdjacencyList();
    const visited = new Set(); // Globally visited
    const recStack = new Set(); // Current recursion path
    
    // Find a root (in-degree 0) or fallback to first node
    const inDegree = {};
    state.nodes.forEach(n => inDegree[n.id] = 0);
    state.links.forEach(l => { if(inDegree[l.target] !== undefined) inDegree[l.target]++; });
    
    let roots = state.nodes.filter(n => inDegree[n.id] === 0);
    if (roots.length === 0) roots = [state.nodes[0]]; // fallback for pure cycle graph

    for (const root of roots) {
        if (!visited.has(root.id)) {
            const safe = await traverseNode(root.id, visited, recStack, adj, null);
            if (!safe && state.mode === 'general') break; // Stopped due to cycle
        }
    }

    addLog('$ Traversal complete.', 'success');
    state.isTraversing = false;
    document.getElementById('status-text').textContent = 'IDLE';
    document.getElementById('status-dot').style.background = 'var(--accent)';
    updateGraphUI(); // re-enable clicks
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function traverseNode(nodeId, visited, recStack, adj, parentEdgeId) {
    // UI Update: Edge
    if (parentEdgeId) setEdgeState(parentEdgeId, 'active');
    await delay(300);

    const nodeData = state.nodes.find(n => n.id === nodeId);
    
    // CYCLE CHECK
    if (recStack.has(nodeId)) {
        state.traversalMetrics.cycles++;
        updateMetricsUI();
        addLog(`! CYCLE DETECTED at [${nodeData.name}]. Infinite loop aborted.`, 'error');
        setNodeState(nodeId, 'cycle');
        if (parentEdgeId) setEdgeState(parentEdgeId, 'error');
        await delay(800);
        return false; 
    }

    // SHARED NODE CHECK (DAG)
    if (visited.has(nodeId)) {
        state.traversalMetrics.shared++;
        updateMetricsUI();
        addLog(`> Revisiting shared node [${nodeData.name}] (Already processed)`, 'warn');
        setNodeState(nodeId, 'visited');
        await delay(600);
        if (parentEdgeId) setEdgeState(parentEdgeId, 'default');
        return true; 
    }

    // NORMAL VISIT
    state.traversalMetrics.steps++;
    updateMetricsUI();
    visited.add(nodeId);
    recStack.add(nodeId);
    setNodeState(nodeId, 'active');
    addLog(`> Visiting: /${nodeData.name}`, 'output');
    
    await delay(700);

    const neighbors = adj[nodeId] || [];
    for (const neighborId of neighbors) {
        const edge = state.links.find(l => l.source === nodeId && l.target === neighborId);
        const safe = await traverseNode(neighborId, visited, recStack, adj, edge.id);
        if (!safe && state.mode === 'general') {
            recStack.delete(nodeId);
            return false; // Propagate abort
        }
    }

    recStack.delete(nodeId);
    setNodeState(nodeId, 'visited');
    if (parentEdgeId) setEdgeState(parentEdgeId, 'default');
    
    return true;
}

// ─────────────────────────────────────────────
// UI & RENDER LOGIC
// ─────────────────────────────────────────────
function updateGraphUI() {
    const nodesLayer = document.getElementById('nodes-layer');
    const emptyState = document.getElementById('empty-state');
    const sourceSelect = document.getElementById('link-from');
    const targetSelect = document.getElementById('link-to');
    
    // Selects
    const optionsHtml = `<option value="" disabled selected>Select Node...</option>` + 
        state.nodes.map(n => `<option value="${n.id}">${n.name}</option>`).join('');
    sourceSelect.innerHTML = optionsHtml;
    targetSelect.innerHTML = optionsHtml;

    // Badges
    document.getElementById('node-count').textContent = state.nodes.length;
    document.getElementById('link-badge').textContent = `${state.links.length} links`;
    emptyState.style.display = state.nodes.length === 0 ? 'flex' : 'none';

    // DOM Nodes
    nodesLayer.innerHTML = '';
    state.nodes.forEach(n => {
        const el = document.createElement('div');
        el.className = 'graph-node';
        el.id = n.id;
        el.style.left = `${n.x}%`;
        el.style.top = `${n.y}%`;
        el.innerHTML = `
            <span class="material-symbols-outlined">folder</span>
            <div class="node-label">${n.name}</div>
        `;
        // Drag logic hook (handled globally, but setup cursor)
        nodesLayer.appendChild(el);
    });

    // Edges
    renderEdges();
    
    // Link Table
    const tbody = document.getElementById('link-table-body');
    if (state.links.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No links established</td></tr>';
    } else {
        tbody.innerHTML = state.links.map(l => {
            const sName = state.nodes.find(n => n.id === l.source).name;
            const tName = state.nodes.find(n => n.id === l.target).name;
            return `
                <tr>
                    <td><strong>${sName}</strong></td>
                    <td style="color:var(--text-muted)">→</td>
                    <td><strong>${tName}</strong></td>
                    <td><span class="panel-badge">Symlink</span></td>
                </tr>
            `;
        }).join('');
    }
}

function renderEdges() {
    const svg = document.getElementById('edges-layer');
    // Keep defs
    const defs = svg.querySelector('defs');
    svg.innerHTML = '';
    if(defs) svg.appendChild(defs);

    state.links.forEach(l => {
        const src = state.nodes.find(n => n.id === l.source);
        const tgt = state.nodes.find(n => n.id === l.target);
        if(!src || !tgt) return;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'graph-edge');
        path.setAttribute('id', l.id);
        path.setAttribute('marker-end', 'url(#arrow)');
        
        // Convert % to actual pixels for SVG
        const vp = document.getElementById('graph-viewport');
        const w = vp.clientWidth;
        const h = vp.clientHeight;
        
        const x1 = (src.x / 100) * w;
        const y1 = (src.y / 100) * h;
        const x2 = (tgt.x / 100) * w;
        const y2 = (tgt.y / 100) * h;

        // Curve calculation
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // Offset endpoint slightly so arrow doesn't hide under node
        const r = 24; 
        const nx2 = x2 - (dx/dist)*r;
        const ny2 = y2 - (dy/dist)*r;

        // Simple bezier curve for organic look
        const cx1 = x1;
        const cy1 = y1 + Math.abs(dy)/2;
        const cx2 = x2;
        const cy2 = y2 - Math.abs(dy)/2;

        path.setAttribute('d', `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${nx2} ${ny2}`);
        svg.appendChild(path);
    });
}

// ─────────────────────────────────────────────
// VISUAL STATE HELPERS
// ─────────────────────────────────────────────
function setNodeState(id, stateClass) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('is-active', 'is-visited', 'is-cycle');
    if (stateClass) el.classList.add('is-' + stateClass);
}

function setEdgeState(id, stateType) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('is-active', 'is-error');
    el.setAttribute('marker-end', 'url(#arrow)');
    
    if (stateType === 'active') {
        el.classList.add('is-active');
        el.setAttribute('marker-end', 'url(#arrow-active)');
    } else if (stateType === 'error') {
        el.classList.add('is-error');
        el.setAttribute('marker-end', 'url(#arrow-error)');
    }
}

function resetGraphStyles() {
    state.nodes.forEach(n => setNodeState(n.id, null));
    state.links.forEach(l => setEdgeState(l.id, 'default'));
}

function resetMetrics() {
    state.traversalMetrics = { steps: 0, shared: 0, cycles: 0 };
    updateMetricsUI();
}

function updateMetricsUI() {
    document.getElementById('metric-steps').textContent = state.traversalMetrics.steps;
    document.getElementById('metric-shared').textContent = state.traversalMetrics.shared;
    document.getElementById('metric-cycles').textContent = state.traversalMetrics.cycles;
}

function animateRejectNode(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('is-cycle');
        setTimeout(() => el.classList.remove('is-cycle'), 500);
    }
}

function addLog(text, type = 'output') {
    const output = document.getElementById('console-output');
    const line = document.createElement('div');
    line.className = 'console-line line-' + type;
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

// ─────────────────────────────────────────────
// DRAG & DROP INTERACTION
// ─────────────────────────────────────────────
function setupGraphInteractions() {
    const viewport = document.getElementById('graph-viewport');
    let draggedNode = null;
    let offsetX = 0, offsetY = 0;

    viewport.addEventListener('mousedown', e => {
        if (state.isTraversing) return;
        const target = e.target.closest('.graph-node');
        if (!target) return;
        
        draggedNode = state.nodes.find(n => n.id === target.id);
        const rect = target.getBoundingClientRect();
        const vpRect = viewport.getBoundingClientRect();
        
        // Convert click pos to % offset
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        offsetX = (px / vpRect.width) * 100;
        offsetY = (py / vpRect.height) * 100;
    });

    document.addEventListener('mousemove', e => {
        if (!draggedNode) return;
        const vpRect = viewport.getBoundingClientRect();
        
        let newX = ((e.clientX - vpRect.left) / vpRect.width) * 100 - offsetX + (22/vpRect.width*100);
        let newY = ((e.clientY - vpRect.top) / vpRect.height) * 100 - offsetY + (22/vpRect.height*100);
        
        draggedNode.x = Math.max(5, Math.min(95, newX));
        draggedNode.y = Math.max(5, Math.min(95, newY));
        
        const el = document.getElementById(draggedNode.id);
        el.style.left = `${draggedNode.x}%`;
        el.style.top = `${draggedNode.y}%`;
        renderEdges();
    });

    document.addEventListener('mouseup', () => {
        draggedNode = null;
    });
    
    // Redraw edges on window resize
    window.addEventListener('resize', () => {
        if (state.nodes.length > 0) renderEdges();
    });
}

// ─────────────────────────────────────────────
// DEMO DATA GENERATORS
// ─────────────────────────────────────────────
function loadDemo(type) {
    clearGraph();
    setMode(type);
    
    if (type === 'dag') {
        // Shared Libs (DAG)
        const root = 'n_root'; addNodeInternal('root', 50, 15, root);
        const usr = 'n_usr';   addNodeInternal('usr', 30, 45, usr);
        const bin = 'n_bin';   addNodeInternal('bin', 70, 45, bin);
        const lib = 'n_lib';   addNodeInternal('shared_lib', 50, 75, lib);
        
        addLinkInternal(root, usr);
        addLinkInternal(root, bin);
        addLinkInternal(usr, lib);
        addLinkInternal(bin, lib); // shared node
        
        addLog('$ Loaded Shared Libs DAG Demo.', 'info');
    } else {
        // Symlink Loop (General)
        const varDir = 'n_var';   addNodeInternal('var', 50, 15, varDir);
        const www = 'n_www';      addNodeInternal('www', 25, 50, www);
        const log = 'n_log';      addNodeInternal('log', 75, 50, log);
        const sym = 'n_sym';      addNodeInternal('symlink_back', 50, 85, sym);
        
        addLinkInternal(varDir, www);
        addLinkInternal(varDir, log);
        addLinkInternal(log, sym);
        addLinkInternal(sym, varDir); // cycle!
        
        addLog('$ Loaded Symlink Loop General Demo.', 'info');
    }
    updateGraphUI();
}

function addNodeInternal(name, x, y, id) {
    state.nodes.push({ id, name, x, y });
}
function addLinkInternal(source, target) {
    state.links.push({ id: 'l_' + Math.random().toString(36).substr(2, 9), source, target });
}