// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
const schedulerState = {
    processes: [],
    nextId: 1,
    currentAlgo: 'fcfs',
    simulationCount: 0,
    results: null
};

const algoMeta = {
    fcfs: {
        name: 'FCFS',
        syntax: 'Non-preemptive · No starvation',
        desc: 'Processes are scheduled in the order they arrive. Simple, fair, but can cause the convoy effect with long jobs.'
    },
    sjf: {
        name: 'SJF',
        syntax: 'Non-preemptive · May starve long jobs',
        desc: 'Among all arrived processes, the one with the shortest burst time runs next. Minimises average waiting time but can starve long processes.'
    },
    srtf: {
        name: 'SRTF',
        syntax: 'Preemptive · Optimal avg waiting time',
        desc: 'Preemptive version of SJF. At every clock tick the process with the shortest remaining time runs, preempting the current one if needed.'
    },
    rr: {
        name: 'Round Robin',
        syntax: 'Preemptive · Configurable quantum',
        desc: 'Each process gets a fixed time quantum in cyclic order. Fair and responsive. Larger quantum → closer to FCFS; smaller → more overhead.'
    },
    priority: {
        name: 'Priority',
        syntax: 'Non-preemptive · Lower number = higher priority',
        desc: 'Among arrived processes the one with the highest priority (lowest number) runs next. Can starve low-priority processes without aging.'
    },
    ljf: {
        name: 'LJF',
        syntax: 'Non-preemptive · Maximises turnaround',
        desc: 'The process with the longest burst time is scheduled first among arrived jobs. Opposite of SJF — maximises average waiting time, useful for contrast demos.'
    }
};

const COLORS = [
    '#4da3ff', '#60e87a', '#ffd760', '#ff7eb3',
    '#a78bfa', '#fb923c', '#34d399', '#f87171',
    '#38bdf8', '#e879f9'
];

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    updateAlgoDoc('fcfs');
    setActiveAlgo('fcfs');
    updateProcCount();
    addLog('$ CPU_SCHEDULER initialized', 'info');
    addLog('$ Add processes and select an algorithm...', 'info');

    // Enter key on inputs
    ['proc-name', 'proc-arrival', 'proc-burst', 'proc-priority'].forEach(id => {
        document.getElementById(id).addEventListener('keypress', e => {
            if (e.key === 'Enter') addProcess();
        });
    });
});

// ─────────────────────────────────────────────
//  PROCESS MANAGEMENT
// ─────────────────────────────────────────────
function addProcess() {
    const nameInput    = document.getElementById('proc-name');
    const arrivalInput = document.getElementById('proc-arrival');
    const burstInput   = document.getElementById('proc-burst');
    const priorityInput= document.getElementById('proc-priority');

    const name     = nameInput.value.trim()    || ('P' + schedulerState.nextId);
    const arrival  = Math.max(0,  parseInt(arrivalInput.value)  || 0);
    const burst    = Math.max(1,  parseInt(burstInput.value)    || 1);
    const priority = Math.max(1,  parseInt(priorityInput.value) || 1);

    if (burst < 1) { addLog('Error: burst time must be ≥ 1', 'error'); return; }

    const proc = {
        id: schedulerState.nextId++,
        name,
        arrival,
        burst,
        priority,
        color: COLORS[(schedulerState.processes.length) % COLORS.length]
    };

    schedulerState.processes.push(proc);

    nameInput.value     = '';
    arrivalInput.value  = '';
    burstInput.value    = '';
    priorityInput.value = '';
    nameInput.focus();

    addLog('$ Added process ' + proc.name + ' [AT=' + arrival + ' BT=' + burst + ' PRI=' + priority + ']', 'output');
    renderProcessTable();
    updateProcCount();
}

function removeProcess(id) {
    schedulerState.processes = schedulerState.processes.filter(p => p.id !== id);
    addLog('$ Removed process', 'info');
    renderProcessTable();
    updateProcCount();
}

function clearProcesses() {
    schedulerState.processes = [];
    schedulerState.nextId = 1;
    clearGantt();
    clearMetrics();
    document.getElementById('console-output').innerHTML = '';
    addLog('$ Processes cleared', 'info');
    renderProcessTable();
    updateProcCount();
    resetStats();
}

function loadSample() {
    clearProcesses();
    const samples = [
        { name: 'P1', arrival: 0, burst: 8, priority: 3 },
        { name: 'P2', arrival: 1, burst: 4, priority: 1 },
        { name: 'P3', arrival: 2, burst: 9, priority: 4 },
        { name: 'P4', arrival: 3, burst: 5, priority: 2 }
    ];
    samples.forEach(s => {
        schedulerState.processes.push({
            id: schedulerState.nextId++,
            name: s.name,
            arrival: s.arrival,
            burst: s.burst,
            priority: s.priority,
            color: COLORS[(schedulerState.processes.length) % COLORS.length]
        });
    });
    addLog('$ Loaded 4 sample processes', 'info');
    renderProcessTable();
    updateProcCount();
}

// ─────────────────────────────────────────────
//  ALGORITHM SELECTION
// ─────────────────────────────────────────────
function selectAlgo(algo) {
    schedulerState.currentAlgo = algo;
    setActiveAlgo(algo);
    updateAlgoDoc(algo);
    document.getElementById('algo-display').textContent = algoMeta[algo].name;
    document.getElementById('rr-config').style.display = algo === 'rr' ? 'block' : 'none';
}

function selectAlgoAndRun(algo) {
    selectAlgo(algo);
    runScheduler();
}

function setActiveAlgo(algo) {
    document.querySelectorAll('.nav-item[data-algo]').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.algo === algo);
    });
}

function updateAlgoDoc(algo) {
    const meta = algoMeta[algo];
    if (!meta) return;
    document.getElementById('doc-name').textContent    = meta.name;
    document.getElementById('doc-syntax').textContent  = meta.syntax;
    document.getElementById('doc-desc').textContent    = meta.desc;
}

// ─────────────────────────────────────────────
//  SCHEDULER ALGORITHMS
// ─────────────────────────────────────────────
function deepCopy(processes) {
    return processes.map(p => ({ ...p, remaining: p.burst }));
}

function scheduleFCFS(procs) {
    const sorted = [...procs].sort((a, b) => a.arrival - b.arrival || a.id - b.id);
    const timeline = [];
    let time = 0;
    sorted.forEach(p => {
        if (time < p.arrival) time = p.arrival;
        timeline.push({ pid: p.id, name: p.name, color: p.color, start: time, end: time + p.burst });
        time += p.burst;
    });
    return timeline;
}

function scheduleSJF(procs) {
    const queue = procs.map(p => ({ ...p })).sort((a, b) => a.arrival - b.arrival);
    const done = [];
    let time = 0;
    const timeline = [];
    while (done.length < procs.length) {
        const available = queue.filter(p => !p._done && p.arrival <= time);
        if (available.length === 0) { time++; continue; }
        available.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival);
        const p = available[0];
        timeline.push({ pid: p.id, name: p.name, color: p.color, start: time, end: time + p.burst });
        time += p.burst;
        p._done = true;
        done.push(p);
    }
    return timeline;
}

function scheduleSRTF(procs) {
    const queue = procs.map(p => ({ ...p, remaining: p.burst }));
    const timeline = [];
    let time = 0;
    let last = null;
    const total = procs.reduce((s, p) => s + p.burst, 0);
    let done = 0;
    let maxTime = procs.reduce((m, p) => Math.max(m, p.arrival), 0) + total + 1;

    while (done < procs.length && time <= maxTime) {
        const available = queue.filter(p => p.remaining > 0 && p.arrival <= time);
        if (available.length === 0) { time++; continue; }
        available.sort((a, b) => a.remaining - b.remaining || a.arrival - b.arrival);
        const p = available[0];

        if (timeline.length > 0 && timeline[timeline.length - 1].pid === p.id) {
            timeline[timeline.length - 1].end = time + 1;
        } else {
            timeline.push({ pid: p.id, name: p.name, color: p.color, start: time, end: time + 1 });
        }

        p.remaining--;
        time++;
        if (p.remaining === 0) done++;
    }
    return mergeTimeline(timeline);
}

function scheduleRR(procs, quantum) {
    const queue = procs.map(p => ({ ...p, remaining: p.burst })).sort((a, b) => a.arrival - b.arrival);
    const timeline = [];
    let time = 0;
    const readyQueue = [];
    const arrived = new Set();
    let idx = 0;

    // seed first arrivals
    while (idx < queue.length && queue[idx].arrival <= time) {
        readyQueue.push(queue[idx++]);
        arrived.add(queue[idx - 1].id);
    }

    let safety = 0;
    while (readyQueue.length > 0 || idx < queue.length) {
        if (++safety > 100000) break;
        if (readyQueue.length === 0) {
            time = queue[idx].arrival;
            while (idx < queue.length && queue[idx].arrival <= time) {
                readyQueue.push(queue[idx++]);
            }
        }
        const p = readyQueue.shift();
        const run = Math.min(quantum, p.remaining);
        timeline.push({ pid: p.id, name: p.name, color: p.color, start: time, end: time + run });
        time += run;
        p.remaining -= run;

        // enqueue newly arrived processes
        while (idx < queue.length && queue[idx].arrival <= time) {
            readyQueue.push(queue[idx++]);
        }
        if (p.remaining > 0) readyQueue.push(p);
    }
    return timeline;
}

function schedulePriority(procs) {
    const queue = procs.map(p => ({ ...p })).sort((a, b) => a.arrival - b.arrival);
    const timeline = [];
    let time = 0;
    let done = 0;
    while (done < procs.length) {
        const available = queue.filter(p => !p._done && p.arrival <= time);
        if (available.length === 0) { time++; continue; }
        available.sort((a, b) => a.priority - b.priority || a.arrival - b.arrival);
        const p = available[0];
        timeline.push({ pid: p.id, name: p.name, color: p.color, start: time, end: time + p.burst });
        time += p.burst;
        p._done = true;
        done++;
    }
    return timeline;
}

function scheduleLJF(procs) {
    const queue = procs.map(p => ({ ...p })).sort((a, b) => a.arrival - b.arrival);
    const timeline = [];
    let time = 0;
    let done = 0;
    while (done < procs.length) {
        const available = queue.filter(p => !p._done && p.arrival <= time);
        if (available.length === 0) { time++; continue; }
        available.sort((a, b) => b.burst - a.burst || a.arrival - b.arrival);
        const p = available[0];
        timeline.push({ pid: p.id, name: p.name, color: p.color, start: time, end: time + p.burst });
        time += p.burst;
        p._done = true;
        done++;
    }
    return timeline;
}

function mergeTimeline(tl) {
    if (tl.length === 0) return tl;
    const merged = [{ ...tl[0] }];
    for (let i = 1; i < tl.length; i++) {
        const last = merged[merged.length - 1];
        if (tl[i].pid === last.pid && tl[i].start === last.end) {
            last.end = tl[i].end;
        } else {
            merged.push({ ...tl[i] });
        }
    }
    return merged;
}

// ─────────────────────────────────────────────
//  METRICS CALCULATOR
// ─────────────────────────────────────────────
function computeMetrics(procs, timeline) {
    const completionTime = {};
    timeline.forEach(seg => { completionTime[seg.pid] = seg.end; });

    return procs.map(p => {
        const ct  = completionTime[p.id] || 0;
        const tat = ct - p.arrival;
        const wt  = tat - p.burst;
        return { ...p, ct, tat, wt: Math.max(0, wt) };
    });
}

// ─────────────────────────────────────────────
//  RUN
// ─────────────────────────────────────────────
function runScheduler() {
    if (schedulerState.processes.length === 0) {
        addLog('Error: no processes to schedule', 'error');
        return;
    }

    const algo = schedulerState.currentAlgo;
    const procs = schedulerState.processes;
    const quantum = Math.max(1, parseInt(document.getElementById('quantum').value) || 2);

    addLog('$ Running ' + algoMeta[algo].name + (algo === 'rr' ? ' (q=' + quantum + ')' : '') + ' on ' + procs.length + ' processes...', 'info');

    let timeline;
    switch (algo) {
        case 'fcfs':     timeline = scheduleFCFS(procs); break;
        case 'sjf':      timeline = scheduleSJF(procs); break;
        case 'srtf':     timeline = scheduleSRTF(procs); break;
        case 'rr':       timeline = scheduleRR(procs, quantum); break;
        case 'priority': timeline = schedulePriority(procs); break;
        case 'ljf':      timeline = scheduleLJF(procs); break;
        default:         timeline = scheduleFCFS(procs);
    }

    const metrics = computeMetrics(procs, timeline);
    schedulerState.results = { timeline, metrics, algo };
    schedulerState.simulationCount++;

    // Log trace
    timeline.forEach(seg => {
        addLog('  [' + seg.start + '→' + seg.end + '] ' + seg.name + ' runs for ' + (seg.end - seg.start) + ' unit(s)', 'output');
    });

    metrics.forEach(m => {
        addLog('  ' + m.name + ' → CT=' + m.ct + ' TAT=' + m.tat + ' WT=' + m.wt, 'output');
    });

    // Averages
    const avgWT  = (metrics.reduce((s, m) => s + m.wt,  0) / metrics.length).toFixed(2);
    const avgTAT = (metrics.reduce((s, m) => s + m.tat, 0) / metrics.length).toFixed(2);
    const totalTime = timeline.length ? timeline[timeline.length - 1].end - Math.min(...timeline.map(s => s.start)) : 1;
    const busyTime  = timeline.reduce((s, seg) => s + (seg.end - seg.start), 0);
    const utilPct   = ((busyTime / Math.max(totalTime, 1)) * 100).toFixed(1) + '%';

    addLog('$ Avg WT=' + avgWT + '  Avg TAT=' + avgTAT + '  CPU Util=' + utilPct, 'info');

    document.getElementById('avg-wt').textContent  = avgWT + ' u';
    document.getElementById('avg-tat').textContent = avgTAT + ' u';
    document.getElementById('cpu-util').textContent = utilPct;

    document.getElementById('status-text').textContent = 'DONE';
    document.getElementById('gantt-algo-badge').textContent = algoMeta[algo].name + (algo === 'rr' ? ' q=' + quantum : '');
    document.getElementById('exec-count').textContent = 'Simulations: ' + schedulerState.simulationCount;

    renderGantt(timeline);
    renderMetrics(metrics);
}

// ─────────────────────────────────────────────
//  RENDER: GANTT CHART
// ─────────────────────────────────────────────
function renderGantt(timeline) {
    const chart    = document.getElementById('gantt-chart');
    const timeLine = document.getElementById('gantt-timeline');
    chart.innerHTML    = '';
    timeLine.innerHTML = '';

    if (timeline.length === 0) {
        chart.innerHTML = '<div class="gantt-empty">No timeline generated.</div>';
        return;
    }

    const tStart = Math.min(...timeline.map(s => s.start));
    const tEnd   = Math.max(...timeline.map(s => s.end));
    const total  = tEnd - tStart;
    const minPct = 2.5; // minimum block width %

    timeline.forEach((seg, i) => {
        const duration = seg.end - seg.start;
        const rawPct   = (duration / total) * 100;
        const pct      = Math.max(rawPct, minPct);

        const block = document.createElement('div');
        block.className = 'gantt-block';
        block.style.width = pct + '%';
        block.style.background = seg.color;
        block.style.setProperty('--glow', seg.color);
        block.style.animationDelay = (i * 0.04) + 's';

        block.innerHTML = '<span class="gantt-label">' + seg.name + '</span>' +
                          '<span class="gantt-dur">' + duration + 'u</span>';
        block.title = seg.name + ': t=' + seg.start + '→' + seg.end + ' (' + duration + ' units)';
        chart.appendChild(block);
    });

    // Timeline ticks
    const tickCount = Math.min(total, 20);
    const step = Math.ceil(total / tickCount);
    for (let t = tStart; t <= tEnd; t += step) {
        const tick = document.createElement('div');
        tick.className = 'gantt-tick';
        tick.style.left = ((t - tStart) / total * 100) + '%';
        tick.textContent = t;
        timeLine.appendChild(tick);
    }
    // always add end tick
    const endTick = document.createElement('div');
    endTick.className = 'gantt-tick';
    endTick.style.left = '100%';
    endTick.textContent = tEnd;
    timeLine.appendChild(endTick);
}

function clearGantt() {
    const chart = document.getElementById('gantt-chart');
    const tl    = document.getElementById('gantt-timeline');
    chart.innerHTML = '<div class="gantt-empty">Add processes and click <strong>Run Scheduler</strong> to visualize.</div>';
    tl.innerHTML = '';
    document.getElementById('gantt-algo-badge').textContent = 'No algorithm run yet';
}

// ─────────────────────────────────────────────
//  RENDER: PROCESS TABLE
// ─────────────────────────────────────────────
function renderProcessTable() {
    const tbody = document.getElementById('proc-table-body');
    tbody.innerHTML = '';

    if (schedulerState.processes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No processes added yet</td></tr>';
        return;
    }

    schedulerState.processes.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td><span class="proc-dot" style="background:' + p.color + '"></span>' + p.name + '</td>' +
            '<td>' + p.arrival + '</td>' +
            '<td>' + p.burst + '</td>' +
            '<td>' + p.priority + '</td>' +
            '<td><button class="remove-btn" onclick="removeProcess(' + p.id + ')" title="Remove">×</button></td>';
        tbody.appendChild(tr);
    });

    document.getElementById('queue-badge').textContent = schedulerState.processes.length + ' process' + (schedulerState.processes.length !== 1 ? 'es' : '');
}

// ─────────────────────────────────────────────
//  RENDER: METRICS TABLE
// ─────────────────────────────────────────────
function renderMetrics(metrics) {
    const wrap = document.getElementById('metrics-wrap');
    wrap.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'metrics-table';
    table.innerHTML =
        '<thead><tr><th>Name</th><th>AT</th><th>BT</th><th>CT</th><th>TAT</th><th>WT</th></tr></thead>';
    const tbody = document.createElement('tbody');

    metrics.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td><span class="proc-dot" style="background:' + m.color + '"></span>' + m.name + '</td>' +
            '<td>' + m.arrival + '</td>' +
            '<td>' + m.burst + '</td>' +
            '<td>' + m.ct + '</td>' +
            '<td class="tat-cell">' + m.tat + '</td>' +
            '<td class="wt-cell">' + m.wt + '</td>';
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
}

function clearMetrics() {
    document.getElementById('metrics-wrap').innerHTML = '<div class="metrics-empty">Run the scheduler to see detailed metrics.</div>';
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function addLog(text, type = 'output') {
    const output = document.getElementById('console-output');
    const line   = document.createElement('div');
    line.className = 'console-line line-' + type;
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

function updateProcCount() {
    document.getElementById('proc-count').textContent = schedulerState.processes.length;
}

function resetStats() {
    document.getElementById('avg-wt').textContent   = '—';
    document.getElementById('avg-tat').textContent  = '—';
    document.getElementById('cpu-util').textContent = '—';
    document.getElementById('status-text').textContent = 'IDLE';
    document.getElementById('exec-count').textContent = 'Simulations: ' + schedulerState.simulationCount;
}

function showReference() {
    addLog('--- ALGORITHM REFERENCE ---', 'info');
    addLog('FCFS     : Arrive first, served first. Non-preemptive.', 'info');
    addLog('SJF      : Shortest burst among arrived processes. Non-preemptive.', 'info');
    addLog('SRTF     : Preemptive SJF. Shortest REMAINING time wins at every tick.', 'info');
    addLog('RR       : Round-robin with configurable quantum. Preemptive.', 'info');
    addLog('Priority : Lowest priority number runs first. Non-preemptive.', 'info');
    addLog('LJF      : Longest burst among arrived processes. Non-preemptive.', 'info');
    addLog('--- METRICS ---', 'info');
    addLog('CT  = Completion Time  |  TAT = CT - Arrival  |  WT = TAT - Burst', 'info');
}
