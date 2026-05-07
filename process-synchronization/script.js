<<<<<<< HEAD
const $ = id => document.getElementById(id); let timers = []; function later(fn, t) { timers.push(setTimeout(fn, t)) } function stop() { timers.forEach(clearTimeout); timers = [] } function addLog(msg, type = "info") { let e = document.createElement("div"); e.className = "entry " + type; e.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`; $('log').prepend(e) } function clearLog() { $('log').innerHTML = "" } function setState(el, cls) { el.classList.remove('idle', 'allowed', 'blocked', 'warning'); el.classList.add(cls) } function flash(el, cls) { setState(el, cls); setTimeout(() => { if (el.dataset.active !== '1') setState(el, 'idle') }, 900) }
let cOwner = null; function resetCritical() { stop(); cOwner = null;[1, 2, 3, 4].forEach(i => { let p = $('p' + i); p.dataset.active = '0'; setState(p, 'idle') }); $('lock').textContent = '🔓'; $('criticalText').textContent = 'Free'; $('criticalDesc').textContent = 'Click a process to enter. Click same process again to exit.'; addLog('Critical Section reset. mutex = 1.', 'info') } function processClick(i) { let p = $('p' + i); if (cOwner === i) { cOwner = null; p.dataset.active = '0'; setState(p, 'idle'); $('lock').textContent = '🔓'; $('criticalText').textContent = 'Free'; $('criticalDesc').textContent = `P${i} exited. Mutex released.`; addLog(`P${i} exited critical section. signal(mutex).`, 'ok'); return } if (cOwner === null) { cOwner = i; p.dataset.active = '1'; setState(p, 'allowed'); $('lock').textContent = '🔒'; $('criticalText').textContent = `P${i} inside`; $('criticalDesc').textContent = 'Other processes are blocked until mutex is released.'; addLog(`P${i} entered critical section. wait(mutex) successful.`, 'ok') } else { flash(p, 'blocked'); addLog(`P${i} blocked because P${cOwner} is already inside critical section.`, 'bad') } } function autoCritical() { resetCritical(); later(() => processClick(1), 300); later(() => processClick(2), 1000); later(() => processClick(1), 1800); later(() => processClick(3), 2500); later(() => processClick(3), 3300) }
let readers = new Set(), writer = null; function updateRW() { [1, 2, 3].forEach(i => { let r = $('r' + i); r.dataset.active = readers.has(i) ? '1' : '0'; setState(r, readers.has(i) ? 'allowed' : 'idle') });[1, 2].forEach(i => { let w = $('w' + i); w.dataset.active = writer === i ? '1' : '0'; setState(w, writer === i ? 'allowed' : 'idle') }); $('readCount').textContent = readers.size; $('writeCount').textContent = writer ? 1 : 0; $('rwStatus').textContent = writer ? `Writer ${writer} writing` : readers.size ? `${readers.size} reader(s) reading` : 'Free' } function resetRW() { stop(); readers.clear(); writer = null; updateRW(); addLog('Readers-Writers reset. Database is free.', 'info') } function readerClick(i) { if (readers.has(i)) { readers.delete(i); addLog(`Reader ${i} left the database.`, 'ok'); updateRW(); return } if (writer) { flash($('r' + i), 'blocked'); addLog(`Reader ${i} blocked because Writer ${writer} has exclusive access.`, 'bad') } else { readers.add(i); addLog(`Reader ${i} entered. Multiple readers are allowed together.`, 'ok'); updateRW() } } function writerClick(i) { if (writer === i) { writer = null; addLog(`Writer ${i} finished writing and released database.`, 'ok'); updateRW(); return } if (writer) { flash($('w' + i), 'blocked'); addLog(`Writer ${i} blocked because Writer ${writer} is already writing.`, 'bad') } else if (readers.size > 0) { flash($('w' + i), 'blocked'); addLog(`Writer ${i} cannot enter because ${readers.size} reader(s) are inside.`, 'bad') } else { writer = i; addLog(`Writer ${i} entered with exclusive access.`, 'ok'); updateRW() } } function autoRW() { resetRW(); later(() => readerClick(1), 300); later(() => readerClick(2), 900); later(() => writerClick(1), 1500); later(() => readerClick(1), 2300); later(() => readerClick(2), 2800); later(() => writerClick(1), 3500); later(() => readerClick(3), 4300); later(() => writerClick(1), 5000) }
let eating = new Set(), sticks = Array(5).fill(null); function left(i) { return i } function right(i) { return (i + 1) % 5 } function updateDining() { for (let i = 0; i < 5; i++) { let ph = $('ph' + i); ph.dataset.active = eating.has(i) ? '1' : '0'; setState(ph, eating.has(i) ? 'allowed' : 'idle'); let c = $('c' + i); c.className = 'stick ' + (sticks[i] === null ? 'idle' : 'owner') } $('eatCount').textContent = eating.size; $('stickCount').textContent = sticks.filter(x => x !== null).length; $('deadStatus').textContent = 'No deadlock' } function resetDining() { stop(); eating.clear(); sticks = Array(5).fill(null); updateDining(); $('diningInfo').textContent = 'Click a philosopher to eat. Click again to put down both chopsticks.'; addLog('Dining Philosophers reset. All chopsticks are free.', 'info') } function philClick(i) { let l = left(i), r = right(i), ph = $('ph' + i); if (eating.has(i)) { eating.delete(i); sticks[l] = null; sticks[r] = null; addLog(`P${i} stopped eating and released C${l} and C${r}.`, 'ok'); updateDining(); return } if (sticks[l] === null && sticks[r] === null) { sticks[l] = i; sticks[r] = i; eating.add(i); addLog(`P${i} is eating using LEFT C${l} and RIGHT C${r}.`, 'ok'); updateDining() } else { flash(ph, 'blocked'); let held = []; if (sticks[l] !== null) held.push(`left C${l} held by P${sticks[l]}`); if (sticks[r] !== null) held.push(`right C${r} held by P${sticks[r]}`); addLog(`P${i} blocked: ${held.join(' and ')}.`, 'bad') } } function deadlockDining() { resetDining(); $('deadStatus').textContent = 'Building deadlock...'; $('diningInfo').textContent = 'Deadlock demo: philosophers pick one chopstick one by one, then each waits for the right chopstick.'; for (let i = 0; i < 5; i++) { later(() => { sticks[i] = i; setState($('ph' + i), 'warning'); $('c' + i).className = 'stick owner warning'; $('stickCount').textContent = sticks.filter(x => x !== null).length; $('deadStatus').textContent = i === 4 ? 'Deadlock' : 'Partial circular wait'; addLog(`P${i} picked LEFT C${i}. Now P${i} is waiting for RIGHT C${right(i)}.`, 'warnlog'); if (i === 4) { $('diningInfo').textContent = 'Deadlock: every philosopher has one chopstick and waits for the right chopstick held by the next philosopher.'; addLog('Deadlock complete: P0→C1, P1→C2, P2→C3, P3→C4, P4→C0 are all waiting.', 'warnlog') } }, 450 + i * 750) } } function autoDining() { resetDining(); later(() => philClick(0), 300); later(() => philClick(2), 1200); later(() => philClick(1), 2100); later(() => philClick(0), 3000); later(() => philClick(1), 3800); later(() => deadlockDining(), 5000) }
let buf = []; function renderBuf() { document.querySelectorAll('#buffer span').forEach((s, i) => s.className = i < buf.length ? 'full' : ''); $('bufCount').textContent = buf.length; $('bufStatus').textContent = buf.length === 0 ? 'Empty' : buf.length === 5 ? 'Full' : 'Partially filled'; $('fill').style.width = (buf.length / 5 * 100) + '%' } function resetPC() { stop(); buf = []; setState($('producer'), 'idle'); setState($('consumer'), 'idle'); renderBuf(); addLog('Producer-Consumer reset. Buffer is empty.', 'info') } function produce() { if (buf.length === 5) { flash($('producer'), 'blocked'); addLog('Producer blocked because buffer is full.', 'bad'); return } buf.push(1); flash($('producer'), 'allowed'); addLog(`Producer added an item. Buffer count = ${buf.length}.`, 'ok'); renderBuf() } function consume() { if (buf.length === 0) { flash($('consumer'), 'blocked'); addLog('Consumer blocked because buffer is empty.', 'bad'); return } buf.pop(); flash($('consumer'), 'allowed'); addLog(`Consumer removed an item. Buffer count = ${buf.length}.`, 'ok'); renderBuf() } function autoPC() { resetPC(); later(produce, 300); later(produce, 850); later(produce, 1400); later(() => { addLog('Partial-buffer case: buffer has only 3 items, but consumer is allowed to consume.', 'info'); consume() }, 2050); later(produce, 2650); later(produce, 3200); later(produce, 3750); later(produce, 4300); later(produce, 4850); later(consume, 5600); later(consume, 6150); later(consume, 6700); later(consume, 7250); later(consume, 7800); later(consume, 8350) }
resetCritical(); resetRW(); resetDining(); resetPC(); addLog('Simulator loaded successfully. All elements are visible and ready.', 'info');
=======
const $ = (id) => document.getElementById(id);

let timers = [];

function later(fn, delay) {
    const timer = setTimeout(fn, delay);
    timers.push(timer);
    return timer;
}

function stop() {
    timers.forEach(clearTimeout);
    timers = [];
}

function setState(element, state) {
    if (!element) return;
    element.classList.remove('allowed', 'blocked', 'warning', 'idle');
    element.classList.add(state);
}

function addLog(message, type = 'info') {
    const log = $('log');
    if (!log) return;

    const entry = document.createElement('div');
    entry.className = 'entry';
    if (type === 'ok') entry.classList.add('ok');
    if (type === 'bad') entry.classList.add('bad');
    if (type === 'warn') entry.classList.add('warnlog');

    const time = new Date().toLocaleTimeString();
    entry.textContent = `[${time}] ${message}`;
    log.prepend(entry);
}

function clearLog() {
    $('log').innerHTML = '';
    addLog('Activity log cleared.', 'info');
}

let criticalOwner = null;

function resetCritical() {
    stop();
    criticalOwner = null;
    [1, 2, 3, 4].forEach((id) => {
        const process = $('p' + id);
        process.dataset.active = '0';
        setState(process, 'idle');
    });
    $('lock').textContent = '🔓';
    $('criticalText').textContent = 'Free';
    $('criticalDesc').textContent = 'Click a process to enter. Click same process again to exit.';
}

function processClick(id) {
    if (criticalOwner === null) {
        criticalOwner = id;
        setState($('p' + id), 'allowed');
        $('p' + id).dataset.active = '1';
        $('lock').textContent = '🔒';
        $('criticalText').textContent = `P${id} inside`;
        $('criticalDesc').textContent = `P${id} entered the critical section. Other processes must wait.`;
        addLog(`Critical Section: P${id} entered the critical section.`, 'ok');
        return;
    }

    if (criticalOwner === id) {
        setState($('p' + id), 'idle');
        $('p' + id).dataset.active = '0';
        criticalOwner = null;
        $('lock').textContent = '🔓';
        $('criticalText').textContent = 'Free';
        $('criticalDesc').textContent = `P${id} exited the critical section. It is now free.`;
        addLog(`Critical Section: P${id} exited the critical section.`, 'info');
        return;
    }

    setState($('p' + id), 'blocked');
    later(() => {
        if (criticalOwner !== id) setState($('p' + id), 'idle');
    }, 900);
    $('criticalDesc').textContent = `P${id} is blocked because P${criticalOwner} already holds the lock.`;
    addLog(`Critical Section: P${id} blocked because P${criticalOwner} owns the lock.`, 'bad');
}

function autoCritical() {
    resetCritical();
    const steps = [
        () => processClick(1),
        () => processClick(2),
        () => processClick(1),
        () => processClick(2),
        () => processClick(2),
        () => processClick(3),
        () => processClick(3)
    ];
    steps.forEach((step, index) => later(step, index * 1200));
}

let readers = new Set();
let writer = null;

function updateRW() {
    [1, 2, 3].forEach((id) => {
        const reader = $('r' + id);
        const active = readers.has(id);
        reader.dataset.active = active ? '1' : '0';
        setState(reader, active ? 'allowed' : 'idle');
    });

    [1, 2].forEach((id) => {
        const writerNode = $('w' + id);
        const active = writer === id;
        writerNode.dataset.active = active ? '1' : '0';
        setState(writerNode, active ? 'allowed' : 'idle');
    });

    $('readCount').textContent = readers.size;
    $('writeCount').textContent = writer ? '1' : '0';

    if (writer) {
        $('rwStatus').textContent = `Writer ${writer} writing`;
    } else if (readers.size > 0) {
        $('rwStatus').textContent = `${readers.size} reader(s) reading`;
    } else {
        $('rwStatus').textContent = 'Free';
    }
}

function resetRW() {
    stop();
    readers = new Set();
    writer = null;
    updateRW();
}

function readerClick(id) {
    if (writer !== null) {
        setState($('r' + id), 'blocked');
        later(() => {
            if (!readers.has(id) && writer !== null) setState($('r' + id), 'idle');
        }, 900);
        addLog(`Readers-Writers: Reader ${id} blocked while Writer ${writer} is active.`, 'bad');
        return;
    }

    if (readers.has(id)) {
        readers.delete(id);
        addLog(`Readers-Writers: Reader ${id} stopped reading.`, 'info');
    } else {
        readers.add(id);
        addLog(`Readers-Writers: Reader ${id} started reading shared data.`, 'ok');
    }
    updateRW();
}

function writerClick(id) {
    if (writer === id) {
        writer = null;
        addLog(`Readers-Writers: Writer ${id} finished writing.`, 'info');
        updateRW();
        return;
    }

    if (writer !== null || readers.size > 0) {
        setState($('w' + id), 'blocked');
        later(() => {
            if (writer !== id) setState($('w' + id), 'idle');
        }, 900);
        addLog(`Readers-Writers: Writer ${id} blocked until readers/writers leave the database.`, 'bad');
        return;
    }

    writer = id;
    addLog(`Readers-Writers: Writer ${id} gained exclusive access to the database.`, 'ok');
    updateRW();
}

function autoRW() {
    resetRW();
    const steps = [
        () => readerClick(1),
        () => readerClick(2),
        () => writerClick(1),
        () => readerClick(1),
        () => readerClick(2),
        () => writerClick(1),
        () => writerClick(1),
        () => writerClick(2),
        () => writerClick(2)
    ];
    steps.forEach((step, index) => later(step, index * 1200));
}

let eating = new Set();
let sticks = Array(5).fill(null);

function left(index) {
    return index;
}

function right(index) {
    return (index + 1) % 5;
}

function updateDining() {
    for (let i = 0; i < 5; i += 1) {
        const philosopher = $('ph' + i);
        const isEating = eating.has(i);
        philosopher.dataset.active = isEating ? '1' : '0';
        setState(philosopher, isEating ? 'allowed' : 'idle');
    }

    let usedStickCount = 0;
    for (let i = 0; i < 5; i += 1) {
        const stick = $('c' + i);
        if (sticks[i] !== null) {
            stick.textContent = `C${i} • P${sticks[i]}`;
            stick.classList.add('owner');
            usedStickCount += 1;
        } else {
            stick.textContent = `C${i}`;
            stick.classList.remove('owner');
        }
    }

    $('eatCount').textContent = eating.size;
    $('stickCount').textContent = usedStickCount;

    const deadlocked = sticks.every((owner) => owner !== null) && eating.size === 0;
    $('deadStatus').textContent = deadlocked ? 'Deadlock shown' : 'No deadlock';
    if (deadlocked) {
        $('deadStatus').classList.add('warning');
    } else {
        $('deadStatus').classList.remove('warning');
    }
}

function resetDining() {
    stop();
    eating = new Set();
    sticks = Array(5).fill(null);
    updateDining();
    $('diningInfo').textContent = 'Click a philosopher to eat. Click again to put down both chopsticks.';
}

function philClick(index) {
    if (eating.has(index)) {
        eating.delete(index);
        sticks[left(index)] = null;
        sticks[right(index)] = null;
        updateDining();
        $('diningInfo').textContent = `P${index} finished eating and released chopsticks C${left(index)} and C${right(index)}.`;
        addLog(`Dining Philosophers: P${index} released C${left(index)} and C${right(index)}.`, 'info');
        return;
    }

    if (sticks[left(index)] !== null || sticks[right(index)] !== null) {
        setState($('ph' + index), 'blocked');
        later(() => {
            if (!eating.has(index)) setState($('ph' + index), 'idle');
        }, 900);
        $('diningInfo').textContent = `P${index} is blocked because one of the required chopsticks is already in use.`;
        addLog(`Dining Philosophers: P${index} blocked because C${left(index)} or C${right(index)} is unavailable.`, 'bad');
        return;
    }

    sticks[left(index)] = index;
    sticks[right(index)] = index;
    eating.add(index);
    updateDining();
    $('diningInfo').textContent = `P${index} is eating using chopsticks C${left(index)} and C${right(index)}.`;
    addLog(`Dining Philosophers: P${index} picked up C${left(index)} and C${right(index)} and started eating.`, 'ok');
}

function autoDining() {
    resetDining();
    const steps = [
        () => philClick(0),
        () => philClick(2),
        () => philClick(1),
        () => philClick(0),
        () => philClick(1),
        () => philClick(2),
        () => philClick(4),
        () => philClick(4)
    ];
    steps.forEach((step, index) => later(step, index * 1400));
}

function deadlockDining() {
    resetDining();
    sticks = [0, 1, 2, 3, 4];
    eating.clear();
    for (let i = 0; i < 5; i += 1) {
        setState($('ph' + i), 'warning');
    }
    updateDining();
    $('deadStatus').textContent = 'Deadlock shown';
    $('deadStatus').classList.add('warning');
    $('diningInfo').textContent = 'All philosophers are waiting with one chopstick each. This demonstrates deadlock.';
    addLog('Dining Philosophers: Deadlock scenario shown. Every philosopher holds one chopstick and waits forever.', 'warn');
}

let buffer = [];
const BUFFER_LIMIT = 5;

function renderBuf() {
    document.querySelectorAll('#buffer span').forEach((slot, index) => {
        slot.className = index < buffer.length ? 'full' : '';
    });

    $('fill').style.width = `${(buffer.length / BUFFER_LIMIT) * 100}%`;
    $('bufCount').textContent = buffer.length;

    if (buffer.length === 0) {
        $('bufStatus').textContent = 'Empty';
    } else if (buffer.length === BUFFER_LIMIT) {
        $('bufStatus').textContent = 'Full';
    } else {
        $('bufStatus').textContent = 'Partially Filled';
    }
}

function resetPC() {
    stop();
    buffer = [];
    setState($('producer'), 'idle');
    setState($('consumer'), 'idle');
    renderBuf();
}

function produce() {
    if (buffer.length >= BUFFER_LIMIT) {
        setState($('producer'), 'blocked');
        later(() => setState($('producer'), 'idle'), 900);
        addLog('Producer-Consumer: Producer blocked because buffer is full.', 'bad');
        return;
    }

    const item = `I${buffer.length + 1}`;
    buffer.push(item);
    setState($('producer'), 'allowed');
    later(() => setState($('producer'), 'idle'), 700);
    renderBuf();
    addLog(`Producer-Consumer: Producer added ${item} to the buffer.`, 'ok');
}

function consume() {
    if (buffer.length === 0) {
        setState($('consumer'), 'blocked');
        later(() => setState($('consumer'), 'idle'), 900);
        addLog('Producer-Consumer: Consumer blocked because buffer is empty.', 'bad');
        return;
    }

    const item = buffer.shift();
    setState($('consumer'), 'allowed');
    later(() => setState($('consumer'), 'idle'), 700);
    renderBuf();
    addLog(`Producer-Consumer: Consumer removed ${item} from the buffer.`, 'ok');
}

function autoPC() {
    resetPC();
    const steps = [
        () => produce(),
        () => produce(),
        () => produce(),
        () => consume(),
        () => produce(),
        () => produce(),
        () => produce(),
        () => consume(),
        () => consume()
    ];
    steps.forEach((step, index) => later(step, index * 1000));
}

resetCritical();
resetRW();
resetDining();
resetPC();
addLog('Simulator loaded successfully. All synchronization demos are active.', 'info');
>>>>>>> b8265ae (Polish dashboard and improve OS simulator modules)
