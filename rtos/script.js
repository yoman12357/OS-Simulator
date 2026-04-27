class RTOSSimulator {
	constructor() {
		this.systemTime = 0;
		this.running = false;
		this.taskIdCounter = 1;
		this.totalMemory = 4096;
		this.usedMemory = 0;
		this.tasks = [];
		this.runningTasks = [null, null];
		this.taskHistory = [];
		this.timeScale = 5000;

		this.timeDisplay = document.getElementById("system-time");
		this.cpuUtil = document.getElementById("cpu-util");
		this.memoryUsage = document.getElementById("memory-usage");
		this.tasksRunning = document.getElementById("tasks-running");
		this.tasksWaiting = document.getElementById("tasks-waiting");
		this.tasksList = document.getElementById("tasks-list");
		this.memoryBlocks = document.getElementById("memory-blocks");
		this.ganttContainer = document.getElementById("gantt-container");
		this.ganttTimeMarkers = document.getElementById("gantt-time-markers");
		this.core1 = document.getElementById("core-1");
		this.core2 = document.getElementById("core-2");

		this.startBtn = document.getElementById("start-btn");
		this.pauseBtn = document.getElementById("pause-btn");
		this.resetBtn = document.getElementById("reset-btn");
		this.taskForm = document.getElementById("task-form");
		this.simState = document.getElementById("sim-state");

		this.initMemoryBlocks();
		this.updateGanttTimeMarkers();
		this.bindEvents();
	}

	initMemoryBlocks() {
		for (let i = 0; i < 40; i += 1) {
			const block = document.createElement("div");
			block.className = "memory-block";
			this.memoryBlocks.appendChild(block);
		}
	}

	updateGanttTimeMarkers() {
		this.ganttTimeMarkers.innerHTML = "";
		const timeMarkerCount = 10;
		const interval = this.timeScale / timeMarkerCount;

		for (let i = 0; i <= timeMarkerCount; i += 1) {
			const marker = document.createElement("div");
			marker.className = "gantt-time-marker";
			marker.textContent = `${i * interval}ms`;
			this.ganttTimeMarkers.appendChild(marker);
		}
	}

	bindEvents() {
		this.startBtn.addEventListener("click", () => this.startSimulation());
		this.pauseBtn.addEventListener("click", () => this.pauseSimulation());
		this.resetBtn.addEventListener("click", () => this.resetSimulation());
		this.taskForm.addEventListener("submit", (e) => this.handleTaskSubmit(e));
	}

	startSimulation() {
		if (this.running) return;
		this.running = true;
		this.startBtn.disabled = true;
		this.pauseBtn.disabled = false;
		this.updateSimState("RUNNING");
		this.tick();
	}

	pauseSimulation() {
		this.running = false;
		this.startBtn.disabled = false;
		this.pauseBtn.disabled = true;
		if (this.hasPendingTasks()) {
			this.updateSimState("PAUSED");
		}
	}

	resetSimulation() {
		this.pauseSimulation();
		this.systemTime = 0;
		this.taskIdCounter = 1;
		this.tasks = [];
		this.runningTasks = [null, null];
		this.taskHistory = [];
		this.usedMemory = 0;
		this.timeScale = 5000;

		this.ganttContainer.innerHTML = "";
		this.tasksList.innerHTML = "";
		this.updateGanttTimeMarkers();
		this.clearCores();
		this.updateUI();
		this.updateSimState("IDLE");

		document.querySelectorAll(".memory-block").forEach((block) => {
			block.style.backgroundColor = "";
		});
	}

	handleTaskSubmit(e) {
		e.preventDefault();

		const nameInput = document.getElementById("task-name");
		const priorityInput = document.getElementById("task-priority");
		const burstInput = document.getElementById("task-burst");
		const memoryInput = document.getElementById("task-memory");

		const task = {
			id: this.taskIdCounter,
			name: nameInput.value.trim(),
			priority: priorityInput.value,
			burstTime: Number.parseInt(burstInput.value, 10),
			remainingTime: Number.parseInt(burstInput.value, 10),
			memoryRequired: Number.parseInt(memoryInput.value, 10),
			state: "waiting",
			startTime: null,
			completionTime: null,
			executionIntervals: []
		};

		if (!task.name) return;

		if (this.usedMemory + task.memoryRequired > this.totalMemory) {
			window.alert("Not enough memory to add this task!");
			return;
		}

		this.taskIdCounter += 1;
		this.tasks.push(task);
		this.usedMemory += task.memoryRequired;

		this.addTaskToGantt(task);
		this.updateMemoryUI();

		if (task.burstTime > this.timeScale * 0.8) {
			this.timeScale = Math.ceil((task.burstTime * 1.5) / 1000) * 1000;
			this.updateGanttTimeMarkers();
			this.refreshGanttChart();
		}

		nameInput.value = "";
		priorityInput.value = "medium";
		burstInput.value = "1000";
		memoryInput.value = "100";

		this.sortTasksByPriority();
		this.renderTaskList();
		if (this.running) this.scheduleTasks();
		this.updateUI();
	}

	priorityRank(priority) {
		return { high: 3, medium: 2, low: 1 }[priority] || 0;
	}

	hasPendingTasks() {
		return this.tasks.some((task) => task.state !== "completed");
	}

	updateSimState(status) {
		if (!this.simState) return;
		this.simState.textContent = status;
		this.simState.className = `sim-state status-${status.toLowerCase()}`;
	}

	sortTasksByPriority() {
		this.tasks.sort((a, b) => {
			if (a.state === "completed" && b.state !== "completed") return 1;
			if (a.state !== "completed" && b.state === "completed") return -1;
			const byPriority = this.priorityRank(b.priority) - this.priorityRank(a.priority);
			if (byPriority !== 0) return byPriority;
			return a.id - b.id;
		});
	}

	renderTaskList() {
		this.sortTasksByPriority();
		this.tasksList.innerHTML = "";

		this.tasks.forEach((task) => {
			const li = document.createElement("li");
			li.className = "task-item";
			li.id = `task-${task.id}`;

			let stateText = `<span class="priority-pill priority-${task.priority}">${task.priority.toUpperCase()}</span>`;
			if (task.state === "running") {
				stateText = '<span class="priority-pill state-running">RUNNING</span>';
			}
			if (task.state === "completed") {
				stateText = '<span class="priority-pill state-completed">DONE</span>';
			}

			li.innerHTML = `
				<h3>
					<span>${task.name}</span>
					${stateText}
				</h3>
				<p>
					<span>Time: ${Math.max(task.remainingTime, 0)}/${task.burstTime} ms</span>
					<span>Memory: ${task.memoryRequired} KB</span>
				</p>
			`;

			if (task.state === "completed") {
				li.classList.add("task-completed");
			}

			this.tasksList.appendChild(li);
		});
	}

	addTaskToGantt(task) {
		const row = document.createElement("div");
		row.className = "gantt-row";
		row.id = `gantt-task-${task.id}`;

		row.innerHTML = `
			<div class="gantt-label">${task.name}</div>
			<div class="gantt-timeline" id="gantt-timeline-${task.id}"></div>
		`;

		this.ganttContainer.appendChild(row);
	}

	refreshGanttChart() {
		document.querySelectorAll(".gantt-timeline").forEach((timeline) => {
			timeline.innerHTML = "";
		});

		this.tasks.forEach((task) => {
			task.executionIntervals.forEach((interval) => {
				this.drawGanttBlock(task, interval.core, interval.start, interval.end);
			});
		});
	}

	drawGanttBlock(task, coreIndex, timeStart, timeEnd) {
		const timeline = document.getElementById(`gantt-timeline-${task.id}`);
		if (!timeline) return;

		const taskBlock = document.createElement("div");
		taskBlock.className = "gantt-task";

		const color = coreIndex === 0 ? "#c00100" : "#2bb673";
		taskBlock.style.backgroundColor = color;

		const left = (timeStart / this.timeScale) * 100;
		const width = ((timeEnd - timeStart) / this.timeScale) * 100;

		taskBlock.style.left = `${left}%`;
		taskBlock.style.width = `${width}%`;
		taskBlock.title = `${task.name} (Core ${coreIndex + 1}): ${timeStart}ms - ${timeEnd}ms`;

		if (width > 7) {
			taskBlock.textContent = `C${coreIndex + 1}`;
		}

		timeline.appendChild(taskBlock);
	}

	scheduleTasks() {
		const readyTasks = this.tasks
			.filter((task) => task.state !== "completed")
			.sort((a, b) => {
				const byPriority = this.priorityRank(b.priority) - this.priorityRank(a.priority);
				if (byPriority !== 0) return byPriority;
				if (a.state !== b.state) {
					if (a.state === "running") return -1;
					if (b.state === "running") return 1;
				}
				return a.id - b.id;
			});

		const desiredAssignments = [readyTasks[0] || null, readyTasks[1] || null];

		for (let i = 0; i < this.runningTasks.length; i += 1) {
			const currentTask = this.runningTasks[i];
			const desiredTask = desiredAssignments[i];

			if (currentTask && currentTask !== desiredTask) {
				if (currentTask.currentExecutionStart !== undefined && currentTask.currentExecutionStart !== null && currentTask.currentExecutionStart < this.systemTime) {
					currentTask.executionIntervals.push({
						core: currentTask.currentExecutionCore,
						start: currentTask.currentExecutionStart,
						end: this.systemTime
					});
					this.drawGanttBlock(currentTask, currentTask.currentExecutionCore, currentTask.currentExecutionStart, this.systemTime);
				}
				currentTask.state = "waiting";
				currentTask.currentExecutionStart = null;
				currentTask.currentExecutionCore = null;
				this.runningTasks[i] = null;
			}
		}

		for (let i = 0; i < this.runningTasks.length; i += 1) {
			const desiredTask = desiredAssignments[i];
			if (!desiredTask) {
				this.runningTasks[i] = null;
				this.updateCoreUI(i, null);
				continue;
			}

			if (this.runningTasks[i] === desiredTask) {
				this.updateCoreUI(i, desiredTask);
				continue;
			}

			desiredTask.state = "running";
			if (desiredTask.startTime === null) desiredTask.startTime = this.systemTime;
			desiredTask.currentExecutionStart = this.systemTime;
			desiredTask.currentExecutionCore = i;
			this.runningTasks[i] = desiredTask;
			this.updateCoreUI(i, desiredTask);
		}

		this.renderTaskList();
		this.updateUI();
	}

	updateCoreUI(coreIndex, task) {
		const core = coreIndex === 0 ? this.core1 : this.core2;
		while (core.children.length > 1) {
			core.removeChild(core.lastChild);
		}

		if (!task) return;

		const executionBlock = document.createElement("div");
		executionBlock.className = "task-execution";
		executionBlock.style.width = "100%";

		const colorMap = {
			high: "#ef4444",
			medium: "#f59e0b",
			low: "#2bb673"
		};
		executionBlock.style.backgroundColor = colorMap[task.priority];
		executionBlock.textContent = `${task.name} (${Math.max(task.remainingTime, 0)}ms)`;
		core.appendChild(executionBlock);
	}

	clearCores() {
		[this.core1, this.core2].forEach((core) => {
			while (core.children.length > 1) {
				core.removeChild(core.lastChild);
			}
		});
	}

	updateMemoryUI() {
		const usagePercent = Math.round((this.usedMemory / this.totalMemory) * 100);
		this.memoryUsage.textContent = `${this.usedMemory}/${this.totalMemory} KB (${usagePercent}%)`;
		const blocks = document.querySelectorAll(".memory-block");
		const blocksToFill = Math.floor((this.usedMemory / this.totalMemory) * blocks.length);

		blocks.forEach((block, index) => {
			if (index < blocksToFill) {
				block.style.backgroundColor = "#c00100";
				block.style.boxShadow = "0 0 8px rgba(192, 1, 0, 0.35) inset";
			} else {
				block.style.backgroundColor = "";
				block.style.boxShadow = "none";
			}
		});
	}

	updateUI() {
		this.timeDisplay.textContent = `${this.systemTime}`;

		const runningTasksCount = this.runningTasks.filter((task) => task !== null).length;
		const cpuUtilization = Math.round((runningTasksCount / this.runningTasks.length) * 100);
		this.cpuUtil.textContent = `${cpuUtilization}%`;
		this.tasksRunning.textContent = `${runningTasksCount}`;
		this.tasksWaiting.textContent = `${this.tasks.filter((task) => task.state === "waiting").length}`;

		this.updateMemoryUI();

		if (this.systemTime > this.timeScale * 0.8) {
			this.timeScale = Math.ceil((this.systemTime * 1.5) / 1000) * 1000;
			this.updateGanttTimeMarkers();
			this.refreshGanttChart();
		}

		this.renderTaskList();
	}

	tick() {
		if (!this.running) return;

		this.systemTime += 100;

		for (let i = 0; i < this.runningTasks.length; i += 1) {
			const task = this.runningTasks[i];
			if (!task) continue;

			task.remainingTime -= 100;

			if (task.remainingTime <= 0) {
				task.remainingTime = 0;
				task.state = "completed";
				task.completionTime = this.systemTime;
				task.executionIntervals.push({
					core: task.currentExecutionCore,
					start: task.currentExecutionStart,
					end: this.systemTime
				});

				this.drawGanttBlock(task, task.currentExecutionCore, task.currentExecutionStart, this.systemTime);

				this.usedMemory -= task.memoryRequired;
				if (this.usedMemory < 0) this.usedMemory = 0;

				this.runningTasks[i] = null;
				this.updateCoreUI(i, null);

				this.taskHistory.push({
					...task,
					turnaroundTime: task.completionTime - task.startTime,
					waitingTime: task.completionTime - task.startTime - task.burstTime
				});
			} else {
				this.updateCoreUI(i, task);
			}
		}

		this.scheduleTasks();
		this.updateUI();

		if (!this.hasPendingTasks()) {
			this.pauseSimulation();
			this.updateSimState("COMPLETED");
			return;
		}

		setTimeout(() => this.tick(), 100);
	}
}

document.addEventListener("DOMContentLoaded", () => {
	window.rtosSimulator = new RTOSSimulator();

	const sampleTasks = [
		{ name: "System Monitor", priority: "high", burstTime: 2000, memory: 200 },
		{ name: "User Interface", priority: "medium", burstTime: 1500, memory: 300 },
		{ name: "Data Logger", priority: "low", burstTime: 3000, memory: 150 }
	];

	setTimeout(() => {
		sampleTasks.forEach((task) => {
			document.getElementById("task-name").value = task.name;
			document.getElementById("task-priority").value = task.priority;
			document.getElementById("task-burst").value = `${task.burstTime}`;
			document.getElementById("task-memory").value = `${task.memory}`;
			document.getElementById("task-form").dispatchEvent(new Event("submit"));
		});
	}, 350);
});
