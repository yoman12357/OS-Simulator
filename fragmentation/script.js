const fragState = {
	totalSize: 128,
	mode: 'fixed',
	policy: 'first',
	partitions: [],
	blocks: [],
	processes: [],
	pending: [],
	nextId: 1,
	allocationCount: 0
};

const COLORS = [
	'#4da3ff', '#60e87a', '#ffd760', '#ff7eb3',
	'#a78bfa', '#fb923c', '#34d399', '#f87171',
	'#38bdf8', '#e879f9'
];

const el = {};

document.addEventListener('DOMContentLoaded', () => {
	el.totalSize = document.getElementById('total-size');
	el.modeSelect = document.getElementById('mode-select');
	el.partitionsInput = document.getElementById('partitions-input');
	el.policySelect = document.getElementById('policy-select');
	el.applyConfig = document.getElementById('apply-config');
	el.loadSample = document.getElementById('load-sample');
	el.processName = document.getElementById('process-name');
	el.processSize = document.getElementById('process-size');
	el.allocateNow = document.getElementById('allocate-now');
	el.queueRequest = document.getElementById('queue-request');
	el.allocateQueue = document.getElementById('allocate-queue');
	el.compactMemory = document.getElementById('compact-memory');
	el.resetAll = document.getElementById('reset-all');
	el.modeNote = document.getElementById('mode-note');
	el.partitionRow = document.getElementById('partition-row');
	el.usedMem = document.getElementById('used-mem');
	el.freeMem = document.getElementById('free-mem');
	el.internalFrag = document.getElementById('internal-frag');
	el.externalFrag = document.getElementById('external-frag');
	el.memoryMap = document.getElementById('memory-map');
	el.mapBadge = document.getElementById('map-badge');
	el.procTableBody = document.getElementById('proc-table-body');
	el.procBadge = document.getElementById('proc-badge');
	el.freeList = document.getElementById('free-list');
	el.freeBadge = document.getElementById('free-badge');
	el.queueList = document.getElementById('queue-list');
	el.queueBadge = document.getElementById('queue-badge');
	el.consoleOutput = document.getElementById('console-output');
	el.statusText = document.getElementById('status-text');
	el.procCount = document.getElementById('proc-count');
	el.modeDisplay = document.getElementById('mode-display');
	el.execCount = document.getElementById('exec-count');

	el.partitionsInput.value = '16, 32, 24, 20, 36';
	el.totalSize.value = '128';
	el.modeSelect.value = 'fixed';
	el.policySelect.value = 'first';

	el.modeSelect.addEventListener('change', () => setModeUI(el.modeSelect.value));
	el.applyConfig.addEventListener('click', () => applyConfig(false));
	el.loadSample.addEventListener('click', loadSample);
	el.allocateNow.addEventListener('click', allocateNow);
	el.queueRequest.addEventListener('click', queueRequest);
	el.allocateQueue.addEventListener('click', allocateQueue);
	el.compactMemory.addEventListener('click', compactMemory);
	el.resetAll.addEventListener('click', resetAll);
	el.procTableBody.addEventListener('click', handleProcessAction);
	el.queueList.addEventListener('click', handleQueueAction);

	['process-name', 'process-size'].forEach((id) => {
		const input = document.getElementById(id);
		input.addEventListener('keypress', (event) => {
			if (event.key === 'Enter') allocateNow();
		});
	});

	setModeUI('fixed');
	applyConfig(true);
});

function setModeUI(mode) {
	const isFixed = mode === 'fixed';
	el.partitionRow.style.display = isFixed ? 'flex' : 'none';
	el.compactMemory.disabled = isFixed;
	el.modeNote.textContent = isFixed
		? 'Fixed partitions show internal fragmentation. Variable partitions show external fragmentation and allow compaction.'
		: 'Variable partitions show external fragmentation and allow compaction. Fixed partition fields are hidden.';
}

function parsePositiveInt(value, fallback = 0) {
	const num = Number.parseInt(value, 10);
	return Number.isFinite(num) && num > 0 ? num : fallback;
}

function parseNumberList(value) {
	return value
		.split(/[\s,]+/)
		.filter(Boolean)
		.map((item) => Number.parseInt(item, 10))
		.filter((num) => Number.isFinite(num) && num > 0);
}

function createProcess(name, size) {
	const id = fragState.nextId++;
	return {
		id,
		name: name && name.trim() ? name.trim() : 'P' + id,
		size,
		color: COLORS[(id - 1) % COLORS.length]
	};
}

function createProcessFromInputs() {
	const size = parsePositiveInt(el.processSize.value, 0);
	if (!size) {
		addLog('Error: process size must be greater than 0', 'error');
		setStatus('error', 'ERROR');
		return null;
	}

	const process = createProcess(el.processName.value, size);
	el.processName.value = '';
	el.processSize.value = '';
	return process;
}

function applyConfig(silent) {
	const total = parsePositiveInt(el.totalSize.value, 0);
	if (!total || total < 8) {
		addLog('Error: total memory must be at least 8 MB', 'error');
		setStatus('error', 'ERROR');
		return;
	}

	const mode = el.modeSelect.value;
	const policy = el.policySelect.value;

	let partitions = [];
	let blocks = [];

	if (mode === 'fixed') {
		partitions = parseNumberList(el.partitionsInput.value);
		if (partitions.length === 0) partitions = [total];
		const sum = partitions.reduce((acc, size) => acc + size, 0);
		if (sum > total) {
			addLog('Error: partition sizes exceed total memory', 'error');
			setStatus('error', 'ERROR');
			return;
		}
		if (sum < total) {
			partitions.push(total - sum);
			if (!silent) {
				addLog('Info: added extra partition for remaining memory', 'info');
			}
		}
	} else {
		blocks = [{ start: 0, size: total, status: 'free', procId: null }];
	}

	fragState.totalSize = total;
	fragState.mode = mode;
	fragState.policy = policy;
	fragState.processes = [];
	fragState.pending = [];
	fragState.nextId = 1;
	fragState.allocationCount = 0;
	fragState.partitions = partitions.map((size, index) => ({
		index,
		size,
		allocatedId: null
	}));
	fragState.blocks = blocks;

	if (!silent) {
		addLog(`$ Memory configured: ${total} MB, ${mode} mode, ${policy} fit`, 'info');
	}
	setStatus('ok', 'READY');
	updateAll();
}

function resetAll() {
	applyConfig(false);
}

function loadSample() {
	const mode = el.modeSelect.value;
	if (mode === 'fixed') {
		el.totalSize.value = '128';
		el.partitionsInput.value = '16, 32, 24, 20, 36';
		el.policySelect.value = 'first';
		applyConfig(true);
		const samples = [
			{ name: 'P1', size: 10 },
			{ name: 'P2', size: 18 },
			{ name: 'P3', size: 12 },
			{ name: 'P4', size: 6 }
		];
		samples.forEach((sample) => allocateProcess(createProcess(sample.name, sample.size)));
		addLog('$ Loaded fixed-partition sample', 'info');
	} else {
		el.totalSize.value = '128';
		el.policySelect.value = 'best';
		applyConfig(true);
		const samples = [
			{ name: 'P1', size: 18 },
			{ name: 'P2', size: 22 },
			{ name: 'P3', size: 14 },
			{ name: 'P4', size: 30 }
		];
		samples.forEach((sample) => allocateProcess(createProcess(sample.name, sample.size)));
		if (fragState.processes[1]) {
			freeProcess(fragState.processes[1].id, true);
		}
		allocateProcess(createProcess('P5', 12));
		addLog('$ Loaded variable-partition sample', 'info');
	}
	setStatus('ok', 'READY');
	updateAll();
}

function allocateNow() {
	const process = createProcessFromInputs();
	if (!process) return;
	const success = allocateProcess(process);
	setStatus(success ? 'ok' : 'warn', success ? 'READY' : 'WARN');
	updateAll();
}

function queueRequest() {
	const process = createProcessFromInputs();
	if (!process) return;
	fragState.pending.push(process);
	addLog(`$ Queued ${process.name} (${process.size} MB)`, 'info');
	setStatus('ok', 'READY');
	updateAll();
}

function allocateQueue() {
	if (fragState.pending.length === 0) {
		addLog('Info: request queue is empty', 'info');
		return;
	}
	const remaining = [];
	let hadFailure = false;
	fragState.pending.forEach((process) => {
		const success = allocateProcess(process);
		if (!success) {
			remaining.push(process);
			hadFailure = true;
		}
	});
	fragState.pending = remaining;
	setStatus(hadFailure ? 'warn' : 'ok', hadFailure ? 'WARN' : 'READY');
	updateAll();
}

function allocateProcess(process) {
	if (fragState.mode === 'fixed') {
		const index = findPartitionIndex(process.size);
		if (index === -1) {
			addLog(`Error: no partition fits ${process.name} (${process.size} MB)`, 'error');
			return false;
		}
		const partition = fragState.partitions[index];
		partition.allocatedId = process.id;
		process.partitionIndex = index;
		process.start = getPartitionStart(index);
		process.internal = partition.size - process.size;
		fragState.processes.push(process);
		fragState.allocationCount++;
		addLog(`$ Allocated ${process.name} in partition ${index + 1} (internal ${process.internal} MB)`, 'output');
		return true;
	}

	const blockIndex = findBlockIndex(process.size);
	if (blockIndex === -1) {
		addLog(`Error: no hole fits ${process.name} (${process.size} MB)`, 'error');
		return false;
	}
	const block = fragState.blocks[blockIndex];
	const remaining = block.size - process.size;
	const usedBlock = { start: block.start, size: process.size, status: 'used', procId: process.id };
	const newBlocks = [usedBlock];
	if (remaining > 0) {
		newBlocks.push({ start: block.start + process.size, size: remaining, status: 'free', procId: null });
	}
	fragState.blocks.splice(blockIndex, 1, ...newBlocks);
	process.start = block.start;
	process.internal = 0;
	fragState.processes.push(process);
	fragState.allocationCount++;
	addLog(`$ Allocated ${process.name} at base ${process.start} MB`, 'output');
	return true;
}

function findPartitionIndex(size) {
	const candidates = fragState.partitions
		.filter((part) => !part.allocatedId && part.size >= size)
		.map((part) => part.index);

	if (candidates.length === 0) return -1;
	if (fragState.policy === 'first') return candidates[0];

	let selected = candidates[0];
	candidates.forEach((index) => {
		const sizeA = fragState.partitions[selected].size;
		const sizeB = fragState.partitions[index].size;
		if (fragState.policy === 'best' && sizeB < sizeA) selected = index;
		if (fragState.policy === 'worst' && sizeB > sizeA) selected = index;
	});
	return selected;
}

function findBlockIndex(size) {
	const freeBlocks = fragState.blocks
		.map((block, index) => ({ block, index }))
		.filter((entry) => entry.block.status === 'free' && entry.block.size >= size);

	if (freeBlocks.length === 0) return -1;
	if (fragState.policy === 'first') return freeBlocks[0].index;

	let selected = freeBlocks[0];
	freeBlocks.forEach((entry) => {
		if (fragState.policy === 'best' && entry.block.size < selected.block.size) selected = entry;
		if (fragState.policy === 'worst' && entry.block.size > selected.block.size) selected = entry;
	});
	return selected.index;
}

function handleProcessAction(event) {
	const button = event.target.closest?.('button[data-proc-id]');
	if (!button) return;
	const id = Number.parseInt(button.dataset.procId, 10);
	if (!Number.isFinite(id)) return;
	freeProcess(id, false);
	updateAll();
}

function handleQueueAction(event) {
	const button = event.target.closest?.('button[data-queue-id]');
	if (!button) return;
	const id = Number.parseInt(button.dataset.queueId, 10);
	if (!Number.isFinite(id)) return;
	fragState.pending = fragState.pending.filter((proc) => proc.id !== id);
	addLog(`$ Removed queued process ${id}`, 'info');
	updateAll();
}

function freeProcess(id, silent) {
	const index = fragState.processes.findIndex((proc) => proc.id === id);
	if (index === -1) return;
	const process = fragState.processes.splice(index, 1)[0];

	if (fragState.mode === 'fixed') {
		const partition = fragState.partitions[process.partitionIndex];
		if (partition) partition.allocatedId = null;
	} else {
		const blockIndex = fragState.blocks.findIndex((block) => block.procId === id);
		if (blockIndex !== -1) {
			fragState.blocks[blockIndex].status = 'free';
			fragState.blocks[blockIndex].procId = null;
			mergeFreeBlocks();
		}
	}

	if (!silent) {
		addLog(`$ Freed ${process.name} (${process.size} MB)`, 'info');
		setStatus('ok', 'READY');
	}
}

function mergeFreeBlocks() {
	fragState.blocks.sort((a, b) => a.start - b.start);
	const merged = [];
	fragState.blocks.forEach((block) => {
		const last = merged[merged.length - 1];
		if (last && last.status === 'free' && block.status === 'free') {
			last.size += block.size;
		} else {
			merged.push({ ...block });
		}
	});
	fragState.blocks = merged;
}

function compactMemory() {
	if (fragState.mode !== 'variable') {
		addLog('Error: compaction is available only in variable mode', 'error');
		setStatus('error', 'ERROR');
		return;
	}

	const processes = [...fragState.processes].sort((a, b) => a.start - b.start);
	const newBlocks = [];
	let cursor = 0;
	processes.forEach((proc) => {
		proc.start = cursor;
		newBlocks.push({ start: cursor, size: proc.size, status: 'used', procId: proc.id });
		cursor += proc.size;
	});
	const freeSize = fragState.totalSize - cursor;
	if (freeSize > 0) {
		newBlocks.push({ start: cursor, size: freeSize, status: 'free', procId: null });
	}
	fragState.blocks = newBlocks;
	addLog(`$ Compaction complete. Free block: ${freeSize} MB`, 'info');
	setStatus('ok', 'READY');
	updateAll();
}

function getPartitionStart(index) {
	let cursor = 0;
	for (let i = 0; i < index; i++) cursor += fragState.partitions[i].size;
	return cursor;
}

function updateAll() {
	updateStats();
	renderMemoryMap();
	renderProcessTable();
	renderFreeList();
	renderQueue();
	updateHero();
}

function updateHero() {
	el.procCount.textContent = fragState.processes.length;
	el.modeDisplay.textContent = fragState.mode === 'fixed' ? 'FIXED' : 'VARIABLE';
	el.procBadge.textContent = `${fragState.processes.length} process${fragState.processes.length === 1 ? '' : 'es'}`;
	el.queueBadge.textContent = `${fragState.pending.length} queued`;
	el.execCount.textContent = `Allocations: ${fragState.allocationCount}`;
}

function updateStats() {
	const used = fragState.processes.reduce((sum, proc) => sum + proc.size, 0);
	let allocated = used;
	let internal = 0;
	let free = fragState.totalSize - used;
	let external = 0;

	if (fragState.mode === 'fixed') {
		allocated = fragState.partitions
			.filter((part) => part.allocatedId)
			.reduce((sum, part) => sum + part.size, 0);
		internal = allocated - used;
		free = fragState.totalSize - allocated;
		external = 0;
	} else {
		const freeBlocks = fragState.blocks.filter((block) => block.status === 'free');
		const maxHole = freeBlocks.reduce((max, block) => Math.max(max, block.size), 0);
		external = Math.max(0, free - maxHole);
	}

	el.usedMem.textContent = `${used} MB`;
	el.freeMem.textContent = `${free} MB`;
	el.internalFrag.textContent = `${internal} MB`;
	el.externalFrag.textContent = `${external} MB`;

	el.mapBadge.textContent = fragState.processes.length
		? `${used} MB used`
		: 'No allocations yet';
}

function renderMemoryMap() {
	el.memoryMap.innerHTML = '';
	const total = fragState.totalSize || 1;

	if (fragState.mode === 'fixed') {
		let cursor = 0;
		fragState.partitions.forEach((partition, index) => {
			const proc = fragState.processes.find((item) => item.partitionIndex === index);
			const blockEl = buildBlockElement({
				start: cursor,
				size: partition.size,
				status: proc ? 'used' : 'free',
				process: proc,
				label: `Part ${index + 1}`
			}, total);
			el.memoryMap.appendChild(blockEl);
			cursor += partition.size;
		});
	} else {
		fragState.blocks.forEach((block) => {
			const proc = block.procId ? fragState.processes.find((item) => item.id === block.procId) : null;
			const blockEl = buildBlockElement({
				start: block.start,
				size: block.size,
				status: block.status,
				process: proc,
				label: block.status === 'free' ? 'Hole' : proc ? proc.name : 'Block'
			}, total);
			el.memoryMap.appendChild(blockEl);
		});
	}
}

function buildBlockElement(block, total) {
	const blockEl = document.createElement('div');
	blockEl.className = `memory-block ${block.status}`;
	blockEl.style.flex = `${block.size} 1 0`;

	if (block.process) {
		blockEl.style.setProperty('--block-accent', block.process.color);
	}

	const header = document.createElement('div');
	header.className = 'block-header';

	const title = document.createElement('div');
	title.className = 'block-title';
	title.textContent = block.process ? block.process.name : block.label;

	const meta = document.createElement('div');
	meta.className = 'block-meta';

	if (fragState.mode === 'fixed') {
		if (block.process) {
			meta.textContent = `${block.label} | Base ${block.start} MB | Size ${block.size} MB | Internal ${block.process.internal} MB`;
		} else {
			meta.textContent = `${block.label} | Base ${block.start} MB | Size ${block.size} MB`;
		}
	} else {
		if (block.status === 'free') {
			meta.textContent = `Base ${block.start} MB | Size ${block.size} MB`;
		} else if (block.process) {
			meta.textContent = `Base ${block.start} MB | Size ${block.process.size} MB`;
		} else {
			meta.textContent = `Base ${block.start} MB | Size ${block.size} MB`;
		}
	}

	header.appendChild(title);
	header.appendChild(meta);

	const bar = document.createElement('div');
	bar.className = 'block-bar';

	if (fragState.mode === 'fixed' && block.process) {
		const usedPercent = Math.max(0, Math.min(100, (block.process.size / block.size) * 100));
		const gapPercent = 100 - usedPercent;
		const used = document.createElement('span');
		used.className = 'bar-used';
		used.style.width = `${usedPercent}%`;
		const gap = document.createElement('span');
		gap.className = 'bar-gap';
		gap.style.width = `${gapPercent}%`;
		bar.appendChild(used);
		bar.appendChild(gap);
	} else if (block.status === 'free') {
		const free = document.createElement('span');
		free.className = 'bar-free';
		free.style.width = '100%';
		bar.appendChild(free);
	} else {
		const used = document.createElement('span');
		used.className = 'bar-used';
		used.style.width = '100%';
		bar.appendChild(used);
	}

	blockEl.appendChild(header);
	blockEl.appendChild(bar);
	return blockEl;
}

function renderProcessTable() {
	const body = el.procTableBody;
	body.innerHTML = '';

	if (fragState.processes.length === 0) {
		body.innerHTML = '<tr><td colspan="5" class="table-empty">No processes allocated</td></tr>';
		return;
	}

	fragState.processes.forEach((proc) => {
		const row = document.createElement('tr');

		const nameCell = document.createElement('td');
		const dot = document.createElement('span');
		dot.className = 'proc-dot';
		dot.style.background = proc.color;
		nameCell.appendChild(dot);
		nameCell.appendChild(document.createTextNode(proc.name));

		const sizeCell = document.createElement('td');
		sizeCell.textContent = `${proc.size} MB`;

		const locationCell = document.createElement('td');
		if (fragState.mode === 'fixed') {
			locationCell.textContent = `Part ${proc.partitionIndex + 1} @ ${proc.start} MB`;
		} else {
			locationCell.textContent = `Base ${proc.start} MB`;
		}

		const fragCell = document.createElement('td');
		fragCell.textContent = `${proc.internal || 0} MB`;

		const actionCell = document.createElement('td');
		const button = document.createElement('button');
		button.className = 'remove-btn';
		button.textContent = 'Free';
		button.dataset.procId = proc.id;
		actionCell.appendChild(button);

		row.appendChild(nameCell);
		row.appendChild(sizeCell);
		row.appendChild(locationCell);
		row.appendChild(fragCell);
		row.appendChild(actionCell);
		body.appendChild(row);
	});
}

function renderFreeList() {
	el.freeList.innerHTML = '';
	let items = [];

	if (fragState.mode === 'fixed') {
		let cursor = 0;
		fragState.partitions.forEach((partition, index) => {
			if (!partition.allocatedId) {
				items.push({
					label: `Part ${index + 1}`,
					meta: `Base ${cursor} MB | Size ${partition.size} MB`
				});
			}
			cursor += partition.size;
		});
		el.freeBadge.textContent = `${items.length} partition${items.length === 1 ? '' : 's'}`;
	} else {
		fragState.blocks
			.filter((block) => block.status === 'free')
			.forEach((block, index) => {
				items.push({
					label: `Hole ${index + 1}`,
					meta: `Base ${block.start} MB | Size ${block.size} MB`
				});
			});
		el.freeBadge.textContent = `${items.length} block${items.length === 1 ? '' : 's'}`;
	}

	if (items.length === 0) {
		el.freeList.innerHTML = '<div class="table-empty">No free blocks</div>';
		return;
	}

	items.forEach((item) => {
		const card = document.createElement('div');
		card.className = 'free-item';

		const label = document.createElement('div');
		label.textContent = item.label;

		const meta = document.createElement('div');
		meta.className = 'item-meta';
		meta.textContent = item.meta;

		card.appendChild(label);
		card.appendChild(meta);
		el.freeList.appendChild(card);
	});
}

function renderQueue() {
	el.queueList.innerHTML = '';
	el.queueBadge.textContent = `${fragState.pending.length} queued`;

	if (fragState.pending.length === 0) {
		el.queueList.innerHTML = '<div class="table-empty">Queue is empty</div>';
		return;
	}

	fragState.pending.forEach((proc) => {
		const card = document.createElement('div');
		card.className = 'queue-item';

		const label = document.createElement('div');
		label.textContent = `${proc.name} (${proc.size} MB)`;

		const metaWrap = document.createElement('div');
		metaWrap.style.display = 'flex';
		metaWrap.style.alignItems = 'center';
		metaWrap.style.gap = '8px';

		const meta = document.createElement('div');
		meta.className = 'item-meta';
		meta.textContent = `ID ${proc.id}`;

		const button = document.createElement('button');
		button.className = 'remove-btn';
		button.textContent = 'Remove';
		button.dataset.queueId = proc.id;

		metaWrap.appendChild(meta);
		metaWrap.appendChild(button);

		card.appendChild(label);
		card.appendChild(metaWrap);
		el.queueList.appendChild(card);
	});
}

function addLog(message, type) {
	const line = document.createElement('div');
	line.className = `console-line line-${type || 'info'}`;
	line.textContent = message;
	el.consoleOutput.appendChild(line);
	el.consoleOutput.scrollTop = el.consoleOutput.scrollHeight;
}

function setStatus(type, text) {
	el.statusText.classList.remove('status-ok', 'status-warn', 'status-error');
	el.statusText.classList.add(`status-${type}`);
	el.statusText.textContent = text;
}

function showReference() {
	addLog('$ Reference: attach the fragmentation lab PDF for exact scenarios', 'info');
}
