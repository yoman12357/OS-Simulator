const algorithms = [
  "FCFS",
  "SSTF",
  "SCAN",
  "C-SCAN",
  "LOOK",
  "C-LOOK",
  "RSS",
  "LIFO",
  "N-Step SCAN",
  "FSCAN",
  "Priority",
  "Deadline",
  "Aged SSTF",
  "FD-SCAN",
  "SCAN-EDF",
];
let selectedAlgorithm = "FCFS";
const deadlineAlgorithms = ["Deadline", "FD-SCAN", "SCAN-EDF"];
const batchAlgorithms = ["N-Step SCAN", "SCAN-EDF"];

const el = {
  requests: document.getElementById("requests"),
  head: document.getElementById("head"),
  diskSize: document.getElementById("diskSize"),
  direction: document.getElementById("direction"),
  priorities: document.getElementById("priorities"),
  deadlines: document.getElementById("deadlines"),
  batchSize: document.getElementById("batchSize"),
  priorityField: document.getElementById("priorityField"),
  deadlineField: document.getElementById("deadlineField"),
  batchField: document.getElementById("batchField"),
  newRequest: document.getElementById("newRequest"),
  addRequest: document.getElementById("addRequest"),
  sample: document.getElementById("sample"),
  run: document.getElementById("run"),
  reset: document.getElementById("reset"),
  error: document.getElementById("error"),
  algoButtons: document.getElementById("algoButtons"),
  chipList: document.getElementById("chipList"),
  queueCount: document.getElementById("queueCount"),
  status: document.getElementById("status"),
  activeAlgo: document.getElementById("activeAlgo"),
  totalSeek: document.getElementById("totalSeek"),
  avgSeek: document.getElementById("avgSeek"),
  runBadge: document.getElementById("runBadge"),
  chart: document.getElementById("chart"),
  sequence: document.getElementById("sequence"),
  trace: document.getElementById("trace"),
  axisMid: document.getElementById("axisMid"),
  axisMax: document.getElementById("axisMax"),
};

function parseNumberList(value) {
  return value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
}

function parseRequests() {
  const diskSize = Number(el.diskSize.value);
  const head = Number(el.head.value);
  const values = parseNumberList(el.requests.value);
  const priorities = parseNumberList(el.priorities.value);
  const deadlines = parseNumberList(el.deadlines.value);
  const batchSize = Number(el.batchSize.value);

  if (!Number.isInteger(diskSize) || diskSize < 2) {
    throw new Error("Disk size must be at least 2.");
  }
  if (!Number.isInteger(head) || head < 0 || head >= diskSize) {
    throw new Error(`Head must be between 0 and ${diskSize - 1}.`);
  }
  if (!values.length) {
    throw new Error("Enter at least one request cylinder.");
  }
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value >= diskSize)) {
    throw new Error(`Every request must be an integer from 0 to ${diskSize - 1}.`);
  }
  if (batchAlgorithms.includes(selectedAlgorithm) && (!Number.isInteger(batchSize) || batchSize < 1)) {
    throw new Error("N-Step batch size must be at least 1.");
  }
  if (selectedAlgorithm === "Priority" || deadlineAlgorithms.includes(selectedAlgorithm)) {
    const list = selectedAlgorithm === "Priority" ? priorities : deadlines;
    const label = selectedAlgorithm === "Priority" ? "priority" : "deadline";
    if (list.length !== values.length) {
      throw new Error(`Enter exactly ${values.length} ${label} value${values.length === 1 ? "" : "s"}.`);
    }
    if (list.some((value) => !Number.isFinite(value))) {
      throw new Error(`${selectedAlgorithm} values must be valid numbers.`);
    }
  }

  return { requests: values, priorities, deadlines, batchSize, head, diskSize, direction: el.direction.value };
}

function totalMovement(sequence) {
  return sequence.slice(1).reduce((sum, value, index) => sum + Math.abs(value - sequence[index]), 0);
}

function sortedParts(requests, head) {
  const left = requests.filter((request) => request < head).sort((a, b) => a - b);
  const right = requests.filter((request) => request >= head).sort((a, b) => a - b);
  return { left, right };
}

function pseudoShuffle(values, seed) {
  const copy = [...values];
  let state = seed || 37;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function scanSegment(values, head, diskSize, direction) {
  const { left, right } = sortedParts(values, head);
  const max = diskSize - 1;
  return direction === "right"
    ? [head, ...right, max, ...left.reverse()].filter((value, index, arr) => index === 0 || value !== arr[index - 1])
    : [head, ...left.reverse(), 0, ...right].filter((value, index, arr) => index === 0 || value !== arr[index - 1]);
}

function metadataSchedule(requests, metadata, mode) {
  return requests
    .map((request, index) => ({ request, meta: metadata[index], index }))
    .sort((a, b) => {
      if (mode === "priority" && b.meta !== a.meta) return b.meta - a.meta;
      if (mode === "deadline" && a.meta !== b.meta) return a.meta - b.meta;
      return a.index - b.index;
    })
    .map((item) => item.request);
}

function agedSstfSchedule(requests, head, diskSize) {
  const pending = requests.map((request, index) => ({ request, index }));
  const sequence = [head];
  const ageWeight = Math.max(1, Math.round(diskSize / 40));
  let current = head;

  while (pending.length) {
    let bestIndex = 0;
    for (let i = 1; i < pending.length; i += 1) {
      const bestAge = requests.length - pending[bestIndex].index;
      const candidateAge = requests.length - pending[i].index;
      const bestScore = Math.abs(pending[bestIndex].request - current) - bestAge * ageWeight;
      const candidateScore = Math.abs(pending[i].request - current) - candidateAge * ageWeight;
      if (
        candidateScore < bestScore ||
        (candidateScore === bestScore && pending[i].index < pending[bestIndex].index)
      ) {
        bestIndex = i;
      }
    }
    current = pending.splice(bestIndex, 1)[0].request;
    sequence.push(current);
  }

  return sequence;
}

function fscanSchedule(requests, head, diskSize, direction) {
  const splitAt = Math.ceil(requests.length / 2);
  const activeQueue = requests.slice(0, splitAt);
  const waitingQueue = requests.slice(splitAt);
  const sequence = [head];

  [activeQueue, waitingQueue].forEach((queue) => {
    if (!queue.length) return;
    const currentHead = sequence[sequence.length - 1];
    const segment = scanSegment(queue, currentHead, diskSize, direction);
    sequence.push(...segment.slice(1));
  });

  return sequence;
}

function fdScanSchedule(requests, deadlines, head) {
  const pending = requests.map((request, index) => ({ request, deadline: deadlines[index], index }));
  const sequence = [head];
  let current = head;
  let elapsedSeek = 0;

  while (pending.length) {
    const feasible = pending
      .map((item, index) => ({ ...item, pendingIndex: index, seek: Math.abs(item.request - current) }))
      .filter((item) => elapsedSeek + item.seek <= item.deadline);
    const candidates = feasible.length
      ? feasible
      : pending.map((item, index) => ({ ...item, pendingIndex: index, seek: Math.abs(item.request - current) }));

    candidates.sort((a, b) => {
      if (a.deadline !== b.deadline) return a.deadline - b.deadline;
      if (a.seek !== b.seek) return a.seek - b.seek;
      return a.index - b.index;
    });

    const next = pending.splice(candidates[0].pendingIndex, 1)[0];
    elapsedSeek += Math.abs(next.request - current);
    current = next.request;
    sequence.push(current);
  }

  return sequence;
}

function scanEdfSchedule(requests, deadlines, head, diskSize, direction, batchSize) {
  const deadlineOrder = requests
    .map((request, index) => ({ request, deadline: deadlines[index], index }))
    .sort((a, b) => {
      if (a.deadline !== b.deadline) return a.deadline - b.deadline;
      return a.index - b.index;
    })
    .map((item) => item.request);
  const sequence = [head];

  for (let i = 0; i < deadlineOrder.length; i += batchSize) {
    const batch = deadlineOrder.slice(i, i + batchSize);
    const currentHead = sequence[sequence.length - 1];
    const segment = scanSegment(batch, currentHead, diskSize, direction);
    sequence.push(...segment.slice(1));
  }

  return sequence;
}

function buildSchedule(type, requests, head, diskSize, direction, options = {}) {
  const { left, right } = sortedParts(requests, head);
  const max = diskSize - 1;

  if (type === "FCFS") return [head, ...requests];
  if (type === "LIFO") return [head, ...[...requests].reverse()];
  if (type === "RSS") return [head, ...pseudoShuffle(requests, head + diskSize + requests.length)];
  if (type === "Priority") return [head, ...metadataSchedule(requests, options.priorities, "priority")];
  if (type === "Deadline") return [head, ...metadataSchedule(requests, options.deadlines, "deadline")];
  if (type === "Aged SSTF") return agedSstfSchedule(requests, head, diskSize);
  if (type === "FSCAN") return fscanSchedule(requests, head, diskSize, direction);
  if (type === "FD-SCAN") return fdScanSchedule(requests, options.deadlines, head);
  if (type === "SCAN-EDF") {
    return scanEdfSchedule(requests, options.deadlines, head, diskSize, direction, options.batchSize);
  }

  if (type === "N-Step SCAN") {
    const sequence = [head];
    for (let i = 0; i < requests.length; i += options.batchSize) {
      const batch = requests.slice(i, i + options.batchSize);
      const currentHead = sequence[sequence.length - 1];
      const segment = scanSegment(batch, currentHead, diskSize, direction);
      sequence.push(...segment.slice(1));
    }
    return sequence;
  }

  if (type === "SSTF") {
    const pending = [...requests];
    const sequence = [head];
    let current = head;
    while (pending.length) {
      let bestIndex = 0;
      for (let i = 1; i < pending.length; i += 1) {
        const bestDistance = Math.abs(pending[bestIndex] - current);
        const candidateDistance = Math.abs(pending[i] - current);
        if (candidateDistance < bestDistance || (candidateDistance === bestDistance && pending[i] < pending[bestIndex])) {
          bestIndex = i;
        }
      }
      current = pending.splice(bestIndex, 1)[0];
      sequence.push(current);
    }
    return sequence;
  }

  if (type === "SCAN") {
    return direction === "right"
      ? [head, ...right, max, ...left.reverse()].filter((value, index, arr) => index === 0 || value !== arr[index - 1])
      : [head, ...left.reverse(), 0, ...right].filter((value, index, arr) => index === 0 || value !== arr[index - 1]);
  }

  if (type === "C-SCAN") {
    return direction === "right"
      ? [head, ...right, max, 0, ...left].filter((value, index, arr) => index === 0 || value !== arr[index - 1])
      : [head, ...left.reverse(), 0, max, ...right.reverse()].filter((value, index, arr) => index === 0 || value !== arr[index - 1]);
  }

  if (type === "LOOK") {
    return direction === "right"
      ? [head, ...right, ...left.reverse()]
      : [head, ...left.reverse(), ...right];
  }

  if (type === "C-LOOK") {
    return direction === "right"
      ? [head, ...right, ...left]
      : [head, ...left.reverse(), ...right.reverse()];
  }

  return [head, ...requests];
}

function drawChart(sequence, diskSize) {
  const width = 1000;
  const height = 260;
  const leftPad = 36;
  const rightPad = 36;
  const topPad = 26;
  const rowGap = sequence.length > 1 ? (height - 54) / (sequence.length - 1) : 0;
  const points = sequence.map((value, index) => {
    const x = leftPad + (value / (diskSize - 1)) * (width - leftPad - rightPad);
    const y = topPad + index * rowGap;
    return { value, x, y };
  });

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const circles = points.map((point, index) => `
    <g>
      <circle cx="${point.x}" cy="${point.y}" r="${index === 0 ? 8 : 6}" fill="${index === 0 ? "#ffd166" : "#69a8ff"}" stroke="#d9ecff" stroke-width="2"></circle>
      <text x="${Math.min(point.x + 12, 946)}" y="${point.y + 5}" fill="#d9e8ff" font-size="18" font-family="ui-monospace, monospace">${point.value}</text>
    </g>
  `).join("");

  el.chart.innerHTML = `
    <defs>
      <linearGradient id="seekGradient" x1="0%" x2="100%">
        <stop offset="0%" stop-color="#5ff2a3"></stop>
        <stop offset="55%" stop-color="#69a8ff"></stop>
        <stop offset="100%" stop-color="#42d9f5"></stop>
      </linearGradient>
    </defs>
    <path d="${path}" fill="none" stroke="url(#seekGradient)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path>
    ${circles}
  `;
}

function renderSequence(sequence) {
  el.sequence.innerHTML = sequence.map((value, index) => (
    `<span class="request">${index === 0 ? "H:" : ""}${value}</span>`
  )).join("");
}

function renderTrace(type, sequence, total, requestCount) {
  const lines = [`$ ${type}_SCHEDULER started`, `$ Head starts at cylinder ${sequence[0]}`];
  sequence.slice(1).forEach((value, index) => {
    const from = sequence[index];
    lines.push(`$ move ${from} -> ${value} | seek ${Math.abs(value - from)}`);
  });
  lines.push(`$ Total seek time: ${total}`);
  lines.push(`$ Average seek time: ${(total / requestCount).toFixed(2)}`);
  el.trace.textContent = lines.join("\n");
}

function updateQueueCount() {
  try {
    const { requests, diskSize } = parseRequests();
    el.queueCount.textContent = `${requests.length} request${requests.length === 1 ? "" : "s"}`;
    el.axisMax.textContent = String(diskSize - 1);
    el.axisMid.textContent = String(Math.floor((diskSize - 1) / 2));
    el.error.textContent = "";
  } catch {
    const values = el.requests.value.split(/[\s,]+/).filter(Boolean);
    el.queueCount.textContent = `${values.length} request${values.length === 1 ? "" : "s"}`;
  }
}

function runScheduler() {
  try {
    const { requests, priorities, deadlines, batchSize, head, diskSize, direction } = parseRequests();
    const sequence = buildSchedule(selectedAlgorithm, requests, head, diskSize, direction, {
      priorities,
      deadlines,
      batchSize,
    });
    const total = totalMovement(sequence);
    el.error.textContent = "";
    el.status.textContent = "READY";
    el.activeAlgo.textContent = selectedAlgorithm;
    el.totalSeek.textContent = String(total);
    el.avgSeek.textContent = (total / requests.length).toFixed(2);
    el.runBadge.textContent = `${selectedAlgorithm} complete`;
    drawChart(sequence, diskSize);
    renderSequence(sequence);
    renderTrace(selectedAlgorithm.replaceAll("-", "_").replaceAll(" ", "_"), sequence, total, requests.length);
    updateQueueCount();
  } catch (error) {
    el.error.textContent = error.message;
    el.status.textContent = "ERROR";
  }
}

function selectAlgorithm(type) {
  selectedAlgorithm = type;
  el.activeAlgo.textContent = type;
  updateConditionalFields();
  document.querySelectorAll(".algo").forEach((button) => {
    button.classList.toggle("active", button.dataset.algo === type);
  });
}

function updateConditionalFields() {
  el.priorityField.classList.toggle("visible", selectedAlgorithm === "Priority");
  el.deadlineField.classList.toggle("visible", deadlineAlgorithms.includes(selectedAlgorithm));
  el.batchField.classList.toggle("visible", batchAlgorithms.includes(selectedAlgorithm));
}

function setupAlgorithms() {
  el.algoButtons.innerHTML = algorithms.map((algorithm) => (
    `<button class="algo ${algorithm === selectedAlgorithm ? "active" : ""}" data-algo="${algorithm}">${algorithm}</button>`
  )).join("");
  el.chipList.innerHTML = algorithms.map((algorithm) => `<span class="chip">${algorithm}</span>`).join("");
  document.querySelectorAll(".algo").forEach((button) => {
    button.addEventListener("click", () => selectAlgorithm(button.dataset.algo));
  });
}

el.addRequest.addEventListener("click", () => {
  const value = Number(el.newRequest.value);
  const diskSize = Number(el.diskSize.value);
  if (!Number.isInteger(value) || value < 0 || value >= diskSize) {
    el.error.textContent = `New request must be from 0 to ${diskSize - 1}.`;
    return;
  }
  const current = el.requests.value.trim();
  el.requests.value = current ? `${current}, ${value}` : String(value);
  const currentPriorities = el.priorities.value.trim();
  const currentDeadlines = el.deadlines.value.trim();
  el.priorities.value = currentPriorities ? `${currentPriorities}, 1` : "1";
  el.deadlines.value = currentDeadlines ? `${currentDeadlines}, 100` : "100";
  el.newRequest.value = "";
  updateQueueCount();
});

el.sample.addEventListener("click", () => {
  el.requests.value = "98, 183, 37, 122, 14, 124, 65, 67";
  el.priorities.value = "2, 5, 1, 4, 3, 2, 5, 1";
  el.deadlines.value = "90, 20, 75, 45, 110, 60, 30, 100";
  el.batchSize.value = "3";
  el.head.value = "53";
  el.diskSize.value = "200";
  el.direction.value = "right";
  updateQueueCount();
  runScheduler();
});

el.reset.addEventListener("click", () => {
  el.requests.value = "";
  el.priorities.value = "";
  el.deadlines.value = "";
  el.batchSize.value = "3";
  el.head.value = "0";
  el.diskSize.value = "200";
  el.direction.value = "right";
  el.sequence.innerHTML = "";
  el.chart.innerHTML = "";
  el.status.textContent = "IDLE";
  el.totalSeek.textContent = "—";
  el.avgSeek.textContent = "—";
  el.runBadge.textContent = "No algorithm run yet";
  el.trace.textContent = "$ DISK_SCHEDULER initialized\n$ Add requests and select an algorithm...";
  updateQueueCount();
});

el.run.addEventListener("click", runScheduler);
[el.requests, el.head, el.diskSize, el.direction, el.priorities, el.deadlines, el.batchSize].forEach((input) => {
  input.addEventListener("input", updateQueueCount);
  input.addEventListener("change", updateQueueCount);
});

setupAlgorithms();
updateConditionalFields();
updateQueueCount();
runScheduler();
