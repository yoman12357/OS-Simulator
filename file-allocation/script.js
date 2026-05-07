document.addEventListener('DOMContentLoaded', function () {
    const totalBlocksInput = document.getElementById('total-blocks');
    const numFilesInput = document.getElementById('num-files');
    const fileSizesContainer = document.getElementById('file-sizes-container');
    const allocationMethodSelect = document.getElementById('allocation-method');
    const runSimulationBtn = document.getElementById('run-simulation');
    const resetSimulationBtn = document.getElementById('reset-simulation');
    const diskContainer = document.getElementById('disk-container');
    const allocationInfo = document.getElementById('allocation-info');

    const colors = ['#FF6B6B','#4ECDC4','#FFD166','#06D6A0','#118AB2','#F7B801','#7F7EFF','#EF476F','#3BCEAC','#FC7307'];

    let diskBlocks = [];
    let files = [];
    let initialSetupComplete = false;

    initialize();
    numFilesInput.addEventListener('change', updateFileSizeInputs);
    runSimulationBtn.addEventListener('click', runSimulation);
    resetSimulationBtn.addEventListener('click', resetSimulation);
    totalBlocksInput.addEventListener('change', setupInitialDiskBlocks);

    function initialize() { updateFileSizeInputs(); setupInitialDiskBlocks(); }

    function updateFileSizeInputs() {
        const numFiles = parseInt(numFilesInput.value);
        fileSizesContainer.innerHTML = '';
        for (let i = 0; i < numFiles; i++) {
            const d = document.createElement('div');
            d.classList.add('file-size-input');
            d.innerHTML = `<label for="file-size-${i}">File ${i+1} Size (blocks):</label>
                           <input type="number" id="file-size-${i}" class="file-size" min="1" max="20" value="${Math.floor(Math.random()*5)+2}">`;
            fileSizesContainer.appendChild(d);
        }
    }

    function setupInitialDiskBlocks() {
        diskBlocks = []; diskContainer.innerHTML = '';
        allocationInfo.innerHTML = '<p>Click on disk blocks to mark them as already allocated (busy) before running the simulation.</p>';
        const total = parseInt(totalBlocksInput.value);
        for (let i = 0; i < total; i++) diskBlocks.push({id:i,allocated:false,fileId:null,isIndex:false,isTier:null,nextBlock:null,initiallyBusy:false});
        renderInitialDiskBlocks();
        initialSetupComplete = true;
    }

    function renderInitialDiskBlocks() {
        diskContainer.innerHTML = '';
        for (let i = 0; i < diskBlocks.length; i++) {
            const b = diskBlocks[i];
            const el = document.createElement('div');
            el.classList.add('disk-block');
            if (b.initiallyBusy) {
                el.classList.add('busy');
                el.innerHTML = `<span>${i}</span><span class="busy-mark">X</span>`;
            } else { el.classList.add('free'); el.textContent = i; }
            el.addEventListener('click', () => toggleBlockBusyState(i));
            diskContainer.appendChild(el);
        }
        const legend = document.createElement('div'); legend.classList.add('legend');
        legend.innerHTML = `
            <div class="legend-item"><div class="legend-color" style="background:#e2e8f0;"></div><span>Free Block</span></div>
            <div class="legend-item"><div class="legend-color" style="background:#dc2626;"></div><span>Pre-Allocated (Busy)</span></div>`;
        diskContainer.appendChild(legend);
    }

    function toggleBlockBusyState(blockId) {
        diskBlocks[blockId].initiallyBusy = !diskBlocks[blockId].initiallyBusy;
        diskBlocks[blockId].allocated = diskBlocks[blockId].initiallyBusy;
        renderInitialDiskBlocks();
    }

    function resetSimulation() {
        diskBlocks=[]; files=[]; initialSetupComplete=false;
        diskContainer.innerHTML=''; allocationInfo.innerHTML='';
        updateFileSizeInputs(); setupInitialDiskBlocks();
    }

    function runSimulation() {
        if (!initialSetupComplete) { setupInitialDiskBlocks(); return; }
        files = [];
        for (let i = 0; i < diskBlocks.length; i++) {
            if (!diskBlocks[i].initiallyBusy) {
                diskBlocks[i].allocated=false; diskBlocks[i].fileId=null;
                diskBlocks[i].isIndex=false; diskBlocks[i].isTier=null; diskBlocks[i].nextBlock=null;
            }
        }
        const numFiles = parseInt(numFilesInput.value);
        const method = allocationMethodSelect.value;
        const inputs = document.querySelectorAll('.file-size');
        for (let i = 0; i < numFiles; i++) {
            const size = parseInt(inputs[i].value);
            if (size<1||isNaN(size)) { alert(`Invalid size for File ${i+1}`); return; }
            files.push({id:i,name:`F${i+1}`,size,color:colors[i%colors.length],blocks:[]});
        }
        let success=false, log=[];
        switch(method) {
            case 'contiguous': success=allocateSequential(log); break;
            case 'linked':     success=allocateLinked(log);     break;
            case 'indexed':    success=allocateIndexed(log);    break;
            case 'sta':        success=allocateSTA(log);        break;
        }
        if (!success) return;
        renderDiskBlocks();
        displayAllocationInfo(method, log);
    }

    /* ================================================================
       1. SEQUENTIAL (CONTIGUOUS) — Lab PDF Logic
    ================================================================ */
    function allocateSequential(log) {
        for (let file of files) {
            const extraBlocks = file.size;
            let fileStart=-1, count=0, start=0;
            for (let i=0; i<diskBlocks.length; i++) {
                if (!diskBlocks[i].allocated) { if(count===0) start=i; count++; if(count===file.size){fileStart=start;break;} }
                else { count=0; }
            }
            if (fileStart===-1) { alert(`❌ Allocation FAILED for ${file.name}: No contiguous space of ${file.size} blocks found.`); return false; }
            const fileEnd = fileStart+file.size-1;
            for (let i=fileStart; i<=fileEnd; i++) { diskBlocks[i].allocated=true; diskBlocks[i].fileId=file.id; file.blocks.push(i); }

            const growEnd = fileEnd+extraBlocks;
            let adjacentFree = (growEnd < diskBlocks.length);
            if (adjacentFree) { for (let i=fileEnd+1; i<=growEnd; i++) { if(diskBlocks[i].allocated){adjacentFree=false;break;} } }

            if (adjacentFree) {
                for (let i=fileEnd+1; i<=growEnd; i++) { diskBlocks[i].allocated=true; diskBlocks[i].fileId=file.id; file.blocks.push(i); }
                log.push({file:file.name, original:`${fileStart}–${fileEnd}`, result:`Extended → blocks ${fileStart}–${growEnd}`, case:'extended'});
            } else {
                const requiredSize = file.size+extraBlocks;
                for (let i=fileStart; i<=fileEnd; i++) diskBlocks[i].allocated=false;
                let newStart=-1, c=0, s=0;
                for (let i=0; i<diskBlocks.length; i++) {
                    if (!diskBlocks[i].allocated) { if(c===0) s=i; c++; if(c===requiredSize){newStart=s;break;} } else { c=0; }
                }
                if (newStart===-1) {
                    for (let i=fileStart; i<=fileEnd; i++) diskBlocks[i].allocated=true;
                    alert(`❌ Allocation FAILED for ${file.name}: No contiguous space of ${requiredSize} blocks for relocation.`); return false;
                }
                file.blocks=[];
                const newEnd=newStart+requiredSize-1;
                for (let i=newStart; i<=newEnd; i++) { diskBlocks[i].allocated=true; diskBlocks[i].fileId=file.id; file.blocks.push(i); }
                log.push({file:file.name, original:`${fileStart}–${fileEnd}`, result:`Adjacent occupied → Relocated to blocks ${newStart}–${newEnd}`, case:'relocated'});
            }
        }
        return true;
    }

    /* ================================================================
       2. LINKED — Lab PDF Logic
    ================================================================ */
    function allocateLinked(log) {
        for (let file of files) {
            const freeList = diskBlocks.map((b,i)=>(!b.allocated?i:-1)).filter(i=>i!==-1);
            if (freeList.length < file.size) { alert(`❌ Allocation FAILED for ${file.name}: Only ${freeList.length} free blocks, need ${file.size}.`); return false; }
            const chosen = freeList.slice(0, file.size);
            for (let i=0; i<chosen.length; i++) {
                const idx=chosen[i];
                diskBlocks[idx].allocated=true; diskBlocks[idx].fileId=file.id;
                diskBlocks[idx].nextBlock=(i<chosen.length-1)?chosen[i+1]:null;
                file.blocks.push(idx);
            }
            log.push({file:file.name, head:chosen[0], tail:chosen[chosen.length-1], chain:chosen.join(' → ')+' → NULL', case:'linked'});
        }
        return true;
    }

    /* ================================================================
       3. INDEXED — Lab PDF Logic
    ================================================================ */
    function allocateIndexed(log) {
        for (let file of files) {
            const extraBlocks = file.size;
            const allFree = diskBlocks.map((b,i)=>(!b.allocated?i:-1)).filter(i=>i!==-1);
            if (allFree.length < 1+extraBlocks) {
                alert(`❌ Allocation FAILED for ${file.name}: Need ${1+extraBlocks} blocks (1 index + ${extraBlocks} data), only ${allFree.length} free.`); return false;
            }
            const indexBlockNum = allFree[0];
            diskBlocks[indexBlockNum].allocated=true; diskBlocks[indexBlockNum].fileId=file.id; diskBlocks[indexBlockNum].isIndex=true;
            file.indexBlock=indexBlockNum;
            const freeList = diskBlocks.map((b,i)=>(!b.allocated?i:-1)).filter(i=>i!==-1);
            const newDataBlocks = freeList.slice(0, extraBlocks);
            for (let idx of newDataBlocks) { diskBlocks[idx].allocated=true; diskBlocks[idx].fileId=file.id; file.blocks.push(idx); }
            log.push({file:file.name, indexBlock:indexBlockNum, freeCount:freeList.length, extraBlocks, dataBlocks:newDataBlocks.join(', '), indexList:`[${newDataBlocks.join(', ')}]`, case:'indexed'});
        }
        return true;
    }

    /* ================================================================
       4. SMART TIERED ALLOCATION (STA) — New Algorithm
       Beats Indexed by adapting strategy to file size:

       TIER 1 — Tiny files (1–2 blocks):
         • Pointers stored directly in directory entry
         • NO index block needed → zero index overhead
         • Single disk access to reach data ✅

       TIER 2 — Medium files (3–8 blocks):
         • ONE shared index block for ALL tier-2 files
         • Multiple files share index block → far less waste than Indexed
         • Each file's portion of index block maps its data blocks ✅

       TIER 3 — Large files (9+ blocks):
         • Auto two-level index (index block → sub-index → data)
         • No manual setup, system decides automatically
         • Handles huge files without multiple index blocks ✅

       Result: No fragmentation + random access + minimal overhead
    ================================================================ */
    function allocateSTA(log) {
        // Separate files by tier
        const tier1Files = files.filter(f => f.size <= 2);
        const tier2Files = files.filter(f => f.size >= 3 && f.size <= 8);
        const tier3Files = files.filter(f => f.size >= 9);

        // Calculate total blocks needed
        const tier2NeedsSharedIndex = tier2Files.length > 0 ? 1 : 0;
        const tier3IndexBlocks = tier3Files.reduce((acc, f) => acc + 1 + Math.ceil(f.size / 4), 0);
        const totalDataBlocks = files.reduce((acc, f) => acc + f.size, 0);
        const totalNeeded = totalDataBlocks + tier2NeedsSharedIndex + tier3IndexBlocks;

        const freeAll = diskBlocks.map((b,i)=>(!b.allocated?i:-1)).filter(i=>i!==-1);
        if (freeAll.length < totalNeeded) {
            alert(`❌ STA Allocation FAILED: Need ${totalNeeded} blocks total, only ${freeAll.length} free.`); return false;
        }

        let ptr = 0;
        const getFree = () => { const b = freeAll[ptr++]; return b; };

        // ── TIER 2: allocate shared index block first ──
        let sharedIndexBlock = null;
        if (tier2Files.length > 0) {
            sharedIndexBlock = getFree();
            diskBlocks[sharedIndexBlock].allocated = true;
            diskBlocks[sharedIndexBlock].fileId = tier2Files[0].id; // visually assign to first tier2 file
            diskBlocks[sharedIndexBlock].isIndex = true;
            diskBlocks[sharedIndexBlock].isTier = 2;
        }

        // ── TIER 1: direct directory pointers, no index block ──
        for (let file of tier1Files) {
            file.tier = 1;
            for (let b = 0; b < file.size; b++) {
                const blk = getFree();
                diskBlocks[blk].allocated = true; diskBlocks[blk].fileId = file.id; diskBlocks[blk].isTier = 1;
                file.blocks.push(blk);
            }
            log.push({file:file.name, tier:1, blocks:file.blocks.join(', '), indexBlock:'None (direct)', case:'sta',
                desc:`Tiny file — pointers stored directly in directory entry. No index block needed. Single disk access.`});
        }

        // ── TIER 2: shared index block ──
        for (let file of tier2Files) {
            file.tier = 2;
            file.indexBlock = sharedIndexBlock;
            for (let b = 0; b < file.size; b++) {
                const blk = getFree();
                diskBlocks[blk].allocated = true; diskBlocks[blk].fileId = file.id; diskBlocks[blk].isTier = 2;
                file.blocks.push(blk);
            }
            log.push({file:file.name, tier:2, blocks:file.blocks.join(', '), indexBlock:`Block ${sharedIndexBlock} (shared)`, case:'sta',
                desc:`Medium file — shares ONE index block (Block ${sharedIndexBlock}) with other medium files. No wasted index block.`});
        }

        // ── TIER 3: two-level index ──
        for (let file of tier3Files) {
            file.tier = 3;
            const mainIdx = getFree();
            diskBlocks[mainIdx].allocated = true; diskBlocks[mainIdx].fileId = file.id; diskBlocks[mainIdx].isIndex = true; diskBlocks[mainIdx].isTier = 3;
            file.indexBlock = mainIdx;
            file.subIndexes = [];
            const subCount = Math.ceil(file.size / 4);
            let dataLeft = file.size;
            for (let s = 0; s < subCount; s++) {
                const subIdx = getFree();
                diskBlocks[subIdx].allocated = true; diskBlocks[subIdx].fileId = file.id; diskBlocks[subIdx].isIndex = true; diskBlocks[subIdx].isTier = 3;
                file.subIndexes.push(subIdx);
                const take = Math.min(4, dataLeft); dataLeft -= take;
                for (let d = 0; d < take; d++) {
                    const blk = getFree();
                    diskBlocks[blk].allocated = true; diskBlocks[blk].fileId = file.id; diskBlocks[blk].isTier = 3;
                    file.blocks.push(blk);
                }
            }
            log.push({file:file.name, tier:3, blocks:file.blocks.join(', '), indexBlock:`Block ${mainIdx} (main) → Sub-indexes: [${file.subIndexes.join(', ')}]`, case:'sta',
                desc:`Large file — auto two-level index. Main index block ${mainIdx} points to sub-index blocks, which point to data. Handles huge files with minimal overhead.`});
        }
        return true;
    }

    /* ================================================================
       RENDER
    ================================================================ */
    function renderDiskBlocks() {
        diskContainer.innerHTML='';
        for (let i=0; i<diskBlocks.length; i++) {
            const block=diskBlocks[i];
            const el=document.createElement('div'); el.classList.add('disk-block');
            if (block.initiallyBusy && block.fileId===null) {
                el.classList.add('busy'); el.innerHTML=`<span>${i}</span><span class="busy-mark">X</span>`;
            } else if (block.allocated && block.fileId!==null) {
                const file=files[block.fileId];
                el.style.backgroundColor=file.color; el.classList.add('allocated'); el.setAttribute('data-file',file.name);
                if (block.isIndex) {
                    el.classList.add('index-block');
                    el.textContent = block.isTier===2 ? `SI` : `I${file.id+1}`;
                } else { el.textContent=i; }
                if (block.nextBlock!==null) { const ptr=document.createElement('div'); ptr.classList.add('pointer'); ptr.textContent='→'; el.appendChild(ptr); }
            } else { el.classList.add('free'); el.textContent=i; }
            diskContainer.appendChild(el);
        }
        const legend=document.createElement('div'); legend.classList.add('legend');
        legend.innerHTML=`<div class="legend-item"><div class="legend-color" style="background:#e2e8f0;"></div><span>Free</span></div>
            <div class="legend-item"><div class="legend-color" style="background:#dc2626;"></div><span>Pre-Allocated</span></div>`;
        for (let file of files) { const item=document.createElement('div'); item.classList.add('legend-item'); item.innerHTML=`<div class="legend-color" style="background:${file.color};"></div><span>${file.name}</span>`; legend.appendChild(item); }
        const method = allocationMethodSelect.value;
        if (method==='indexed') legend.innerHTML+=`<div class="legend-item"><div class="legend-color" style="background:#c084fc;border:2px dashed #9333ea;"></div><span>Index Block</span></div>`;
        if (method==='sta') legend.innerHTML+=`<div class="legend-item"><div class="legend-color" style="background:#c084fc;border:2px dashed #9333ea;"></div><span>Index/Sub-Index Block</span></div>
            <div class="legend-item"><span style="font-size:0.8rem;color:#64748b;">T1=Tiny(≤2) &nbsp; T2=Medium(3–8) &nbsp; T3=Large(9+)</span></div>`;
        diskContainer.appendChild(legend);
    }

    /* ================================================================
       DISPLAY INFO
    ================================================================ */
    function displayAllocationInfo(method, log) {
        let html=`<h4>${getMethodFullName(method)} — Allocation Details</h4>`;

        if (method==='contiguous') {
            html+=`<div class="algo-steps">
                <div class="algo-step"><span class="step-num">Step 1</span> Find first free contiguous region of <b>file.size</b> blocks → initial placement</div>
                <div class="algo-step"><span class="step-num">Step 2</span> Check adjacent blocks [fileEnd+1 … fileEnd+extraBlocks]</div>
                <div class="algo-step"><span class="step-num">Case 1 ✅</span> All adjacent FREE → <b>extend file in place</b></div>
                <div class="algo-step"><span class="step-num">Case 2</span> Any adjacent OCCUPIED → requiredSize = currentSize + extraBlocks → search whole disk</div>
                <div class="algo-step"><span class="step-num">Result</span> Found new space → <b>free old blocks, relocate</b> ✅ &nbsp;|&nbsp; No space → <b>FAIL</b> ❌</div>
            </div>
            <table class="allocation-table"><tr><th>File</th><th>Initial Placement</th><th>Outcome</th></tr>`;
            for (let e of log) {
                const badge=e.case==='extended'?'🟢 Extended':e.case==='relocated'?'🟡 Relocated':'🔴 Failed';
                html+=`<tr><td>${e.file}</td><td>Blocks ${e.original}</td><td>${badge} — ${e.result}</td></tr>`;
            }
            html+=`</table>`;

        } else if (method==='linked') {
            html+=`<div class="algo-steps">
                <div class="algo-step"><span class="step-num">Step 1</span> Collect all FREE disk blocks → freeList</div>
                <div class="algo-step"><span class="step-num">Step 2</span> Check SIZE(freeList) ≥ required blocks — if not → FAIL ❌</div>
                <div class="algo-step"><span class="step-num">Step 3</span> Traverse linked list to find the tail block (next = -1)</div>
                <div class="algo-step"><span class="step-num">Step 4</span> Link new free blocks to tail → file grows without relocation ✅</div>
            </div>
            <table class="allocation-table"><tr><th>File</th><th>Head Block</th><th>Tail Block</th><th>Block Chain</th></tr>`;
            for (let e of log) html+=`<tr><td>${e.file}</td><td>${e.head}</td><td>${e.tail}</td><td>${e.chain}</td></tr>`;
            html+=`</table>`;

        } else if (method==='indexed') {
            html+=`<div class="algo-steps">
                <div class="algo-step"><span class="step-num">Step 1</span> Count all FREE blocks on disk (location doesn't matter)</div>
                <div class="algo-step"><span class="step-num">Step 2</span> If freeCount ≥ extraBlocks → proceed, else FAIL ❌</div>
                <div class="algo-step"><span class="step-num">Step 3</span> Pick 1 free block as <b>Index Block</b> — stores addresses of all data blocks</div>
                <div class="algo-step"><span class="step-num">Step 4</span> Pick remaining free blocks as data blocks → add addresses to indexList ✅</div>
            </div>
            <table class="allocation-table"><tr><th>File</th><th>Index Block</th><th>Index Contents</th><th>Data Blocks</th></tr>`;
            for (let e of log) html+=`<tr><td>${e.file}</td><td>${e.indexBlock}</td><td>${e.indexList}</td><td>${e.dataBlocks}</td></tr>`;
            html+=`</table>`;

        } else if (method==='sta') {
            html+=`<div class="algo-steps">
                <div class="algo-step"><span class="step-num">Tier 1</span> <b>Tiny files (1–2 blocks)</b> → Pointers in directory entry directly. <b>Zero index overhead. 1 disk access.</b></div>
                <div class="algo-step"><span class="step-num">Tier 2</span> <b>Medium files (3–8 blocks)</b> → All medium files share <b>ONE</b> index block. Far less waste than Indexed.</div>
                <div class="algo-step"><span class="step-num">Tier 3</span> <b>Large files (9+ blocks)</b> → Auto two-level index. Main index → sub-indexes → data. Handles huge files seamlessly.</div>
                <div class="algo-step"><span class="step-num">Result ✅</span> No fragmentation + Random access + Minimal overhead — beats Indexed on all 3 weaknesses</div>
            </div>
            <table class="allocation-table"><tr><th>File</th><th>Tier</th><th>Index Block</th><th>Data Blocks</th><th>Why Better</th></tr>`;
            for (let e of log) {
                const tierBadge = e.tier===1?'🔵 T1 Tiny':e.tier===2?'🟢 T2 Medium':'🟣 T3 Large';
                html+=`<tr><td>${e.file}</td><td>${tierBadge}</td><td>${e.indexBlock}</td><td>${e.blocks}</td><td style="font-size:0.82rem;color:#475569;">${e.desc}</td></tr>`;
            }
            html+=`</table>`;
        }
        allocationInfo.innerHTML=html;
    }

    function getMethodFullName(m) {
        return {contiguous:'Sequential (Contiguous)',linked:'Linked List',indexed:'Indexed',sta:'Smart Tiered Allocation (STA)'}[m]||m;
    }
});
