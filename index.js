
document.addEventListener('DOMContentLoaded', () => {
    const moduleCards = document.querySelectorAll('.module-card');
    const moduleCountElement = document.getElementById('module-count');
    const statModulesElement = document.getElementById('stat-modules');

    if (moduleCountElement) {
        moduleCountElement.textContent = moduleCards.length;
    }

    if (statModulesElement) {
        statModulesElement.textContent = moduleCards.length;
    }
    const loadElement = document.getElementById('processor-load');
    if (loadElement) {
        setInterval(() => {
            const load = (Math.random() * 0.0005 + 0.0002).toFixed(5);
            loadElement.innerHTML = `PROCESSOR_LOAD<br>${load}ms`;
        }, 2000);
    }
    const bootBtn = document.getElementById('btn-boot');
    if (bootBtn) {
        bootBtn.addEventListener('click', () => {
            bootBtn.textContent = 'BOOTING...';
            bootBtn.style.opacity = '0.7';
            bootBtn.disabled = true;
            setTimeout(() => {
                bootBtn.textContent = 'ONLINE';
                bootBtn.style.opacity = '1';
                bootBtn.classList.add('bg-green-600');
                bootBtn.classList.remove('bg-tertiary-fixed');
            }, 1500);
        });
    }
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
    const moduleRoutes = {
        SYSTEM_CALLS: 'system-calls/index.html',
        MEMORY_MGMT: 'memory-management/index.html',
        FRAGMENTATION: 'fragmentation/index.html',
        CPU_SCHEDULING: 'cpu-scheduling/index.html',
        'DEADLOCK_(RAG)': 'deadlock/index.html',
        PROCESS_SYNC: 'process-synchronization/index.html',
        DISK_SCHEDULING: 'disk-scheduling/index.html',
        FILE_SYSTEM: 'file-system/index.html',
        FILE_ALLOCATION: 'file-allocation/index.html',
        RTOS: 'rtos/index.html',
        STATE_TRANSITION: 'process-state-transition/index.html'
    };

    document.querySelectorAll('.module-card').forEach(card => {
        const heading = card.querySelector('h3');
        if (!heading) return;

        const route = moduleRoutes[heading.textContent.trim()];
        if (!route) return;
        if (card.tagName.toLowerCase() === 'a') return;

        card.addEventListener('click', () => {
            window.location.href = route;
        });
    });
});
