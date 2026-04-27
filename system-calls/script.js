/*
Module Name: System Calls Simulator - Compact Edition
Created by: Appaji Nagaraja Dheeraj
File Purpose: Compact, efficient system call simulation
*/

// ============ SYSTEM STATE ============
const systemState = {
    processes: [
        { pid: 1, name: 'init', state: 'RUNNING', memory: 2.5 },
        { pid: 2840, name: 'ROOT_DAEMON', state: 'RUNNING', memory: 15.3 }
    ],
    memory: { total: 128, allocated: 35, free: 93 },
    currentPid: 2840,
    nextPid: 2841,
    executionCount: 0,
    history: [],
    allocations: []
};

function getCurrentProcess() {
    let current = systemState.processes.find(process => process.pid === systemState.currentPid);
    if (!current) {
        current = systemState.processes[0] || null;
        if (current) {
            systemState.currentPid = current.pid;
        }
    }
    return current;
}

function parseNumber(value, fallback = 0) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? number : fallback;
}

function formatProcessName(value, fallback = 'program') {
    return value && value.trim() ? value.trim() : fallback;
}

function updateCurrentProcessMemory(delta) {
    const current = getCurrentProcess();
    if (current) {
        current.memory = Math.max(0, +(current.memory + delta).toFixed(1));
    }
}

function updateMemoryUsage(delta, label) {
    const nextAllocated = systemState.memory.allocated + delta;
    if (nextAllocated < 0) {
        return { ok: false, msg: label + ': not enough allocated memory to free' };
    }
    if (nextAllocated > systemState.memory.total) {
        return { ok: false, msg: label + ': insufficient memory' };
    }

    systemState.memory.allocated = nextAllocated;
    systemState.memory.free = systemState.memory.total - nextAllocated;
    updateCurrentProcessMemory(delta);
    return { ok: true };
}

function removeProcess(pid) {
    const index = systemState.processes.findIndex(process => process.pid === pid);
    if (index === -1) return null;

    const removed = systemState.processes.splice(index, 1)[0];
    if (systemState.currentPid === pid) {
        const replacement = systemState.processes.find(process => process.state === 'RUNNING') || systemState.processes[0] || null;
        systemState.currentPid = replacement ? replacement.pid : pid;
    }
    return removed;
}

function updateProcessState(pid, state, name) {
    const process = systemState.processes.find(item => item.pid === pid);
    if (!process) return null;
    if (name) process.name = name;
    process.state = state;
    return process;
}

function formatCommandExample(name) {
    const call = syscalls[name];
    return call && call.example ? call.example : name + ' ';
}

// ============ SYSCALLS ============
const syscalls = {
    fork: {
        cat: 'process',
        desc: 'Create a child process by duplicating the current one.',
        syntax: 'fork [child_name]',
        example: 'fork worker',
        run: (a) => {
            const parent = getCurrentProcess();
            const childPid = systemState.nextPid++;
            const childName = formatProcessName(a, 'child');
            const child = {
                pid: childPid,
                name: childName,
                state: 'RUNNING',
                memory: parent ? Math.max(1, +(parent.memory * 0.5).toFixed(1)) : 1,
                parentPid: parent ? parent.pid : 0
            };

            systemState.processes.push(child);
            systemState.currentPid = childPid;
            return { ok: true, msg: 'Forked child process ' + childPid + ' from parent ' + (parent ? parent.pid : '?') };
        }
    },
    exec: {
        cat: 'process',
        desc: 'Replace the current process image with a new program.',
        syntax: 'exec <program> [args...]',
        example: 'exec /bin/ls',
        run: (a) => {
            const current = getCurrentProcess();
            const program = formatProcessName(a, 'program');
            if (current) {
                current.name = program;
                current.state = 'RUNNING';
            }
            return { ok: true, msg: 'Executing program: ' + program };
        }
    },
    wait: {
        cat: 'process',
        desc: 'Block until a child process changes state or exits.',
        syntax: 'wait <pid>',
        example: 'wait 2841',
        run: (a) => {
            const current = getCurrentProcess();
            const targetPid = parseNumber(a, -1);

            if (targetPid > 0) {
                const target = systemState.processes.find(process => process.pid === targetPid && process.pid !== (current ? current.pid : -1));
                if (!target) return { ok: false, msg: 'wait: child process ' + targetPid + ' not found' };
                removeProcess(targetPid);
                return { ok: true, msg: 'Reaped child process ' + targetPid };
            }

            const child = [...systemState.processes].reverse().find(process => process.pid !== (current ? current.pid : -1) && process.pid !== 1);
            if (!child) return { ok: false, msg: 'wait: no child processes available' };
            removeProcess(child.pid);
            return { ok: true, msg: 'Reaped child process ' + child.pid };
        }
    },
    exit: {
        cat: 'process',
        desc: 'Terminate the current process with an exit code.',
        syntax: 'exit <code>',
        example: 'exit 0',
        run: (a) => {
            const current = getCurrentProcess();
            const code = parseNumber(a, 0);
            if (!current) return { ok: false, msg: 'exit: no active process' };

            if (current.pid === 1) {
                current.state = 'EXITED(' + code + ')';
                return { ok: true, msg: 'Init process exit recorded with code ' + code };
            }

            updateProcessState(current.pid, 'EXITED(' + code + ')');
            removeProcess(current.pid);
            return { ok: true, msg: 'Process ' + current.pid + ' exited with code ' + code };
        }
    },
    kill: {
        cat: 'process',
        desc: 'Send a signal to a target process ID.',
        syntax: 'kill <pid> <signal>',
        example: 'kill 2841 SIGTERM',
        run: (a) => {
            const [pidText, signalText] = a.trim().split(/\s+/);
            const pid = parseNumber(pidText, -1);
            const signal = signalText || 'SIGTERM';
            if (pid <= 0) return { ok: false, msg: 'kill: pid argument required' };
            if (!systemState.processes.some(process => process.pid === pid)) return { ok: false, msg: 'kill: process ' + pid + ' not found' };
            if (pid === 1) return { ok: false, msg: 'kill: init process protected' };
            removeProcess(pid);
            return { ok: true, msg: 'Sent ' + signal + ' to process ' + pid };
        }
    },
    getpid: {
        cat: 'process',
        desc: 'Return the process ID of the current process.',
        syntax: 'getpid()',
        example: 'getpid',
        run: () => ({ ok: true, msg: 'Current PID: ' + getCurrentProcess().pid })
    },

    open: {
        cat: 'file',
        desc: 'Open a file and return a file descriptor.',
        syntax: 'open <path> <flags>',
        example: 'open test.txt O_RDWR',
        run: (a) => {
            const args = a.trim() || 'file.txt O_RDONLY';
            return { ok: true, msg: 'File opened: ' + args + ' [FD: 3]' };
        }
    },
    close: {
        cat: 'file',
        desc: 'Close an open file descriptor.',
        syntax: 'close <fd>',
        example: 'close 3',
        run: (a) => ({ ok: !!a.trim(), msg: a.trim() ? 'Closed FD ' + a.trim() : 'close: invalid FD' })
    },
    read: {
        cat: 'file',
        desc: 'Read bytes from a file descriptor into a buffer.',
        syntax: 'read <fd> <bytes>',
        example: 'read 3 64',
        run: (a) => {
            const [fd = '3', bytesText = '64'] = a.trim().split(/\s+/);
            const bytes = Math.max(1, parseNumber(bytesText, 64));
            return { ok: true, msg: 'Read ' + bytes + ' bytes from FD ' + fd };
        }
    },
    write: {
        cat: 'file',
        desc: 'Write bytes from a buffer to a file descriptor.',
        syntax: 'write <fd> <text>',
        example: 'write 1 hello',
        run: (a) => {
            const [fd = '1', ...rest] = a.trim().split(/\s+/);
            const text = rest.join(' ') || 'data';
            return { ok: true, msg: 'Wrote ' + text.length + ' bytes to FD ' + fd };
        }
    },
    unlink: {
        cat: 'file',
        desc: 'Remove a directory entry for a file.',
        syntax: 'unlink <path>',
        example: 'unlink temp.txt',
        run: (a) => ({ ok: true, msg: 'File deleted: ' + (a.trim() || 'file') })
    },

    malloc: {
        cat: 'memory',
        desc: 'Allocate a block of heap memory.',
        syntax: 'malloc <size>',
        example: 'malloc 32',
        run: (a) => {
            const size = Math.max(1, parseNumber(a, 10));
            const result = updateMemoryUsage(size, 'malloc');
            if (!result.ok) return result;
            const address = '0x' + Math.random().toString(16).slice(2, 8).toUpperCase();
            systemState.allocations.push({ type: 'malloc', size, address });
            return { ok: true, msg: 'Allocated ' + size + 'MB at ' + address };
        }
    },
    calloc: {
        cat: 'memory',
        desc: 'Allocate and zero-initialize an array of elements.',
        syntax: 'calloc <count> <size>',
        example: 'calloc 4 8',
        run: (a) => {
            const [countText = '1', sizeText = '8'] = a.trim().split(/\s+/);
            const count = Math.max(1, parseNumber(countText, 1));
            const size = Math.max(1, parseNumber(sizeText, 8));
            const amount = Math.max(1, count * size);
            const result = updateMemoryUsage(amount, 'calloc');
            if (!result.ok) return result;
            const address = '0x' + Math.random().toString(16).slice(2, 8).toUpperCase();
            systemState.allocations.push({ type: 'calloc', size: amount, address });
            return { ok: true, msg: 'Allocated ' + amount + 'MB with calloc at ' + address };
        }
    },
    free: {
        cat: 'memory',
        desc: 'Release previously allocated heap memory.',
        syntax: 'free <size|all>',
        example: 'free 16',
        run: (a) => {
            const input = a.trim().toLowerCase();
            const amount = input === 'all' ? systemState.memory.allocated : Math.max(1, parseNumber(input, 10));
            const result = updateMemoryUsage(-amount, 'free');
            if (!result.ok) return result;
            systemState.allocations = systemState.allocations.slice(0, Math.max(0, systemState.allocations.length - 1));
            return { ok: true, msg: 'Freed ' + amount + 'MB' };
        }
    },
    mmap: {
        cat: 'memory',
        desc: 'Map files or anonymous pages into process memory.',
        syntax: 'mmap <length>',
        example: 'mmap 4096',
        run: (a) => {
            const length = Math.max(1, parseNumber(a, 4096));
            const mb = Math.max(1, Math.ceil(length / 1024));
            const result = updateMemoryUsage(mb, 'mmap');
            if (!result.ok) return result;
            const address = '0x' + Math.random().toString(16).slice(2, 8).toUpperCase();
            systemState.allocations.push({ type: 'mmap', size: mb, address });
            return { ok: true, msg: 'Mapped ' + length + ' bytes at ' + address };
        }
    },
    munmap: {
        cat: 'memory',
        desc: 'Unmap a mapped memory region.',
        syntax: 'munmap <length>',
        example: 'munmap 4096',
        run: (a) => {
            const length = Math.max(1, parseNumber(a, 4096));
            const mb = Math.max(1, Math.ceil(length / 1024));
            const result = updateMemoryUsage(-mb, 'munmap');
            if (!result.ok) return result;
            return { ok: true, msg: 'Unmapped ' + length + ' bytes' };
        }
    },
    sbrk: {
        cat: 'memory',
        desc: 'Adjust the program break by a signed increment.',
        syntax: 'sbrk <increment>',
        example: 'sbrk 8',
        run: (a) => {
            const delta = parseNumber(a, 4);
            const result = updateMemoryUsage(delta, 'sbrk');
            if (!result.ok) return result;
            return { ok: true, msg: 'Program break adjusted by ' + delta + 'MB' };
        }
    },
    brk: {
        cat: 'memory',
        desc: 'Change the end of the process data segment.',
        syntax: 'brk <size>',
        example: 'brk 64',
        run: (a) => {
            const target = Math.max(0, parseNumber(a, systemState.memory.allocated));
            const delta = target - systemState.memory.allocated;
            const result = updateMemoryUsage(delta, 'brk');
            if (!result.ok) return result;
            return { ok: true, msg: 'Program break set to ' + target + 'MB' };
        }
    },
    mlock: {
        cat: 'memory',
        desc: 'Lock memory pages in RAM.',
        syntax: 'mlock <length>',
        example: 'mlock 4096',
        run: (a) => ({ ok: true, msg: 'Locked ' + Math.max(1, parseNumber(a, 4096)) + ' bytes in RAM' })
    },
    munlock: {
        cat: 'memory',
        desc: 'Unlock previously locked memory pages.',
        syntax: 'munlock <length>',
        example: 'munlock 4096',
        run: (a) => ({ ok: true, msg: 'Unlocked ' + Math.max(1, parseNumber(a, 4096)) + ' bytes from RAM' })
    },

    pipe: {
        cat: 'ipc',
        desc: 'Create a unidirectional data channel between processes.',
        syntax: 'pipe()',
        example: 'pipe',
        run: () => ({ ok: true, msg: 'Pipe created [FD: 3-4]' })
    },
    socket: {
        cat: 'ipc',
        desc: 'Create an endpoint for network communication.',
        syntax: 'socket <domain> <type> <protocol>',
        example: 'socket AF_INET SOCK_STREAM 0',
        run: (a) => ({ ok: true, msg: 'Socket created with args: ' + (a.trim() || 'AF_INET SOCK_STREAM 0') })
    },
    shmget: {
        cat: 'ipc',
        desc: 'Create or get a shared memory segment.',
        syntax: 'shmget <key> <size>',
        example: 'shmget 1234 4096',
        run: (a) => ({ ok: true, msg: 'Shared memory created with args: ' + (a.trim() || 'key size') })
    },
    semget: {
        cat: 'ipc',
        desc: 'Create or get a semaphore set.',
        syntax: 'semget <key> <nsems>',
        example: 'semget 1234 1',
        run: (a) => ({ ok: true, msg: 'Semaphore set created with args: ' + (a.trim() || 'key nsems') })
    },
    msgget: {
        cat: 'ipc',
        desc: 'Create or get a message queue.',
        syntax: 'msgget <key> <flags>',
        example: 'msgget 1234 IPC_CREAT',
        run: (a) => ({ ok: true, msg: 'Message queue created with args: ' + (a.trim() || 'key flags') })
    },

    ioctl: {
        cat: 'device',
        desc: 'Send a device-specific control command to a file descriptor.',
        syntax: 'ioctl <fd> <request>',
        example: 'ioctl 1 TIOCGWINSZ',
        run: (a) => ({ ok: true, msg: 'I/O control completed with args: ' + (a.trim() || 'fd request') })
    },
    gettimeofday: {
        cat: 'device',
        desc: 'Return the current wall-clock time.',
        syntax: 'gettimeofday()',
        example: 'gettimeofday',
        run: () => ({ ok: true, msg: 'Current time: ' + new Date().toISOString() })
    },
    uname: {
        cat: 'device',
        desc: 'Return system name and version information.',
        syntax: 'uname()',
        example: 'uname',
        run: () => ({ ok: true, msg: 'OS_EMULATOR kernel v4.0' })
    }
};

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
    setupInput();
    renderMemory();
    renderProcesses();
    renderButtons();
    updateSyscallDoc('fork');
    addLog('$ System ready', 'info');
});

// ============ INPUT ============
function setupInput() {
    const input = document.getElementById('syscall-input');

    input.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            execute(e.target.value);
            e.target.value = '';
        }
    });

    input.addEventListener('input', e => {
        const name = e.target.value.trim().split(' ')[0].toLowerCase();
        if (syscalls[name]) {
            updateSyscallDoc(name);
        }
    });
}

function execute(cmd) {
    const cleaned = cmd.trim();
    if (!cleaned) return;

    const firstSpace = cleaned.indexOf(' ');
    const name = (firstSpace === -1 ? cleaned : cleaned.slice(0, firstSpace)).toLowerCase();
    const args = firstSpace === -1 ? '' : cleaned.slice(firstSpace + 1);

    addLog('$ ' + cleaned, 'input');

    if (!syscalls[name]) {
        addLog('Error: unknown system call', 'error');
        return;
    }

    updateSyscallDoc(name);

    const result = syscalls[name].run(args);
    if (result.ok) {
        addLog(result.msg, 'output');
        systemState.executionCount++;
        systemState.history.unshift({
            time: new Date().toLocaleTimeString(),
            call: name,
            args,
            ok: true
        });
    } else {
        addLog(result.msg, 'error');
        systemState.history.unshift({
            time: new Date().toLocaleTimeString(),
            call: name,
            args,
            ok: false
        });
    }

    renderMemory();
    renderProcesses();
    updateFooter();
}

// ============ DISPLAY ============
function addLog(text, type = 'output') {
    const output = document.getElementById('console-output');
    const line = document.createElement('div');
    line.className = 'console-line line-' + type;
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

function renderMemory() {
    const grid = document.getElementById('memory-grid');
    grid.innerHTML = '';
    const total = systemState.memory.total;
    const used = systemState.memory.allocated;

    for (let i = 0; i < 60; i++) {
        const block = document.createElement('div');
        block.className = 'memory-block';
        const percent = (i / 60) * 100;
        const usedPercent = (used / total) * 100;

        if (percent < usedPercent * 0.7) {
            block.classList.add('mem-used');
        } else if (percent < usedPercent) {
            block.classList.add('mem-allocated');
        } else {
            block.classList.add('mem-free');
        }

        grid.appendChild(block);
    }

    document.getElementById('mem-used').textContent = used.toFixed(1) + 'MB';
    document.getElementById('mem-free').textContent = systemState.memory.free.toFixed(1) + 'MB';
}

function renderProcesses() {
    const list = document.getElementById('process-list');
    list.innerHTML = '';

    systemState.processes.slice(0, 6).forEach(process => {
        const item = document.createElement('div');
        item.className = 'process-item';
        const currentMarker = process.pid === systemState.currentPid ? ' [CURRENT]' : '';
        item.innerHTML = '<div class="proc-pid">' + process.pid + '</div>' +
            '<div class="proc-name">' + process.name + currentMarker + '</div>' +
            '<div class="proc-mem">' + process.memory.toFixed(1) + 'MB</div>' +
            '<div class="proc-status">' + process.state + '</div>';
        list.appendChild(item);
    });

    document.getElementById('proc-count').textContent = systemState.processes.length;
}

function renderButtons() {
    const grid = document.getElementById('buttons-grid');
    grid.innerHTML = '';
    const common = [
        'fork',
        'exec',
        'wait',
        'kill',
        'malloc',
        'calloc',
        'free',
        'mmap',
        'munmap',
        'open'
    ];

    common.forEach(name => {
        const call = syscalls[name];
        const btn = document.createElement('button');
        btn.className = 'btn-syscall';
        btn.textContent = name + '()';
        btn.onclick = () => {
            document.getElementById('syscall-input').value = formatCommandExample(name);
            updateSyscallDoc(name);
            document.getElementById('syscall-input').focus();
        };
        if (call) {
            btn.title = call.syntax || name + '()';
        }
        grid.appendChild(btn);
    });
}

function updateSyscallDoc(name) {
    const docName = document.getElementById('doc-name');
    const docSyntax = document.getElementById('doc-syntax');
    const docDesc = document.getElementById('doc-desc');
    if (!docName || !docSyntax || !docDesc) return;

    const call = syscalls[name];
    if (!call) {
        docName.textContent = 'unknown()';
        docSyntax.textContent = 'unknown';
        docDesc.textContent = 'No documentation available for this command.';
        return;
    }

    docName.textContent = name + '()';
    docSyntax.textContent = call.syntax || name + '()';
    docDesc.textContent = call.desc || 'No description available.';
}

function updateFooter() {
    document.getElementById('exec-count').textContent = 'Executed: ' + systemState.executionCount;
}

function setActiveCategory(cat) {
    document.querySelectorAll('.nav-item[data-category]').forEach(item => {
        item.classList.toggle('is-active', item.dataset.category === cat);
    });
}

// ============ ACTIONS ============
function filterCategory(cat) {
    setActiveCategory(cat);
    const grid = document.getElementById('buttons-grid');
    grid.innerHTML = '';
    const filtered = Object.keys(syscalls).filter(key => cat === 'all' || syscalls[key].cat === cat);

    filtered.forEach(name => {
        const call = syscalls[name];
        const btn = document.createElement('button');
        btn.className = 'btn-syscall';
        btn.textContent = name + '()';
        btn.onclick = () => {
            document.getElementById('syscall-input').value = call.example || name + ' ';
            updateSyscallDoc(name);
            document.getElementById('syscall-input').focus();
        };
        btn.title = call.syntax || name + '()';
        grid.appendChild(btn);
    });

    if (filtered.length > 0) {
        updateSyscallDoc(filtered[0]);
    }
}

function clearHistory() {
    document.getElementById('console-output').innerHTML = '';
    addLog('$ History cleared', 'info');
}

function resetKernel() {
    systemState.processes = [
        { pid: 1, name: 'init', state: 'RUNNING', memory: 2.5 },
        { pid: 2840, name: 'ROOT_DAEMON', state: 'RUNNING', memory: 15.3 }
    ];
    systemState.memory = { total: 128, allocated: 35, free: 93 };
    systemState.currentPid = 2840;
    systemState.nextPid = 2841;
    systemState.executionCount = 0;
    systemState.history = [];
    systemState.allocations = [];
    document.getElementById('console-output').innerHTML = '';
    addLog('$ System reinitialized', 'info');
    renderMemory();
    renderProcesses();
    renderButtons();
    setActiveCategory('');
    updateSyscallDoc('fork');
    updateFooter();
}

function showHelp() {
    addLog('--- QUICK REFERENCE ---', 'info');
    addLog('Process: fork <name> exec <program> wait <pid> exit <code> kill <pid> <sig> getpid', 'info');
    addLog('File: open <path> <flags> close <fd> read <fd> <bytes> write <fd> <text> unlink <path>', 'info');
    addLog('Memory: malloc <size> calloc <count> <size> free <size|all> mmap <len> munmap <len> sbrk <inc> brk <size>', 'info');
    addLog('IPC: pipe socket <domain> <type> <proto> shmget semget msgget', 'info');
    addLog('Device: ioctl <fd> <request> gettimeofday uname', 'info');
}

function showReference() {
    showHelp();
}
