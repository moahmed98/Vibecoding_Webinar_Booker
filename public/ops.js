// ============================================
// Operations Dashboard + Checklist Engine
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    const profile = await requireRole(['operations']);
    if (!profile) return;
    setupNav(profile);

    let currentEvent = null;
    let checklistsData = [];
    let selectedTaskId = null;

    // ============================================
    // DASHBOARD: Workflow Runs Table
    // ============================================

    async function loadEvents() {
        const tbody = document.getElementById('wf-tbody');
        const result = await apiCall('/api/webinars/pending-ops');
        const events = result.webinars || [];

        document.getElementById('wf-count').textContent = `${events.length} result${events.length !== 1 ? 's' : ''}`;

        if (events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:60px;color:var(--cb-text-muted);">No events assigned yet.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const ev of events) {
            // Get checklist progress
            const clResult = await apiCall(`/api/webinars/${ev.id}/checklists`);
            const cls = clResult.checklists || [];
            let total = 0, done = 0, overdue = 0;
            cls.forEach(cl => (cl.items || []).forEach(i => {
                total++;
                if (i.completed) {
                    done++;
                } else {
                    // Check if due_date exists and is before today
                    const dueDate = i.component_data?.due_date;
                    if (dueDate) {
                        const due = new Date(dueDate);
                        due.setHours(0, 0, 0, 0);
                        if (due < today) overdue++;
                    }
                }
            }));
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);

            // Determine status
            let statusClass, statusText;
            if (pct === 100 && total > 0) {
                statusClass = 'wf-done';
                statusText = 'Done';
            } else if (overdue > 0) {
                statusClass = 'wf-delayed';
                statusText = `Delayed`;
            } else {
                statusClass = 'wf-on-track';
                statusText = 'On-Track';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <span class="wf-name">${ev.title} — <span class="highlight">${formatDT(ev.start_time)}</span></span>
                </td>
                <td>${ev.type || '—'}</td>
                <td><span class="wf-assignee">${getInitials(profile.full_name)}</span></td>
                <td>${timeAgo(ev.created_at)}</td>
                <td>
                    <div class="wf-progress">
                        <div class="wf-progress-bar"><div class="wf-progress-fill" style="width:${pct}%${overdue > 0 ? ';background:#EF4444' : ''}"></div></div>
                        <span class="wf-progress-text">${done}/${total}${overdue > 0 ? ` <span style="color:#EF4444;font-weight:600;">(${overdue} overdue)</span>` : ''}</span>
                    </div>
                </td>
                <td><span class="wf-status ${statusClass}">${statusText}</span></td>
            `;
            tr.addEventListener('click', () => openEngine(ev));
            tbody.appendChild(tr);
        }
    }

    // Search
    document.getElementById('wf-search').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('#wf-tbody tr').forEach(row => {
            row.style.display = (row.textContent.toLowerCase().includes(q) || !q) ? '' : 'none';
        });
    });

    function formatDT(iso) {
        return new Date(iso).toLocaleString('en-IN', {
            weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    function timeAgo(iso) {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }

    function getInitials(name) {
        return (name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    loadEvents();

    // ============================================
    // CHECKLIST ENGINE
    // ============================================

    function openEngine(ev) {
        currentEvent = ev;
        document.getElementById('dashboard-view').classList.add('hidden');
        document.getElementById('checklist-view').classList.remove('hidden');
        document.getElementById('engine-title').textContent = ev.title;
        document.getElementById('engine-meta').textContent = `${formatDT(ev.start_time)} → ${formatDT(ev.end_time)}`;
        selectedTaskId = null;
        document.getElementById('right-empty').classList.remove('hidden');
        document.getElementById('right-content').classList.add('hidden');
        loadChecklists();
    }

    document.getElementById('back-btn').addEventListener('click', () => {
        document.getElementById('checklist-view').classList.add('hidden');
        document.getElementById('dashboard-view').classList.remove('hidden');
        currentEvent = null;
        closePanel('content-panel');
        closePanel('form-panel');
        loadEvents();
    });

    async function loadChecklists() {
        const result = await apiCall(`/api/webinars/${currentEvent.id}/checklists`);
        checklistsData = result.checklists || [];
        renderTasks();
        updateProgress();
    }

    // ============================================
    // RENDER TASK LIST (Left Pane)
    // ============================================

    function renderTasks() {
        const container = document.getElementById('engine-tasks');
        container.innerHTML = '';
        let globalNum = 0;

        checklistsData.forEach((cl, clIdx) => {
            // Section header
            const section = document.createElement('div');
            section.className = 'cl-section';

            // Label (double-click to rename)
            const nameLabel = document.createElement('span');
            nameLabel.className = 'cl-section-label';
            nameLabel.textContent = cl.name;
            nameLabel.addEventListener('dblclick', () => {
                // Replace label with editable input
                nameLabel.style.display = 'none';
                const nameInput = document.createElement('input');
                nameInput.className = 'cl-section-name';
                nameInput.value = cl.name;
                nameInput.spellcheck = false;
                section.insertBefore(nameInput, dotsWrap);
                nameInput.focus();
                nameInput.select();
                const commit = async () => {
                    const val = nameInput.value.trim() || cl.name;
                    await apiCall(`/api/checklists/${cl.id}`, 'PATCH', { name: val });
                    cl.name = val;
                    nameLabel.textContent = val;
                    nameLabel.style.display = '';
                    nameInput.remove();
                };
                nameInput.addEventListener('blur', commit);
                nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });
            });

            // 3-dot menu
            const dotsWrap = document.createElement('div');
            dotsWrap.className = 'cl-dots';
            const dotsBtn = document.createElement('button');
            dotsBtn.className = 'cl-dots-btn';
            dotsBtn.textContent = '⋯';
            dotsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close any existing dropdown
                document.querySelectorAll('.cl-dropdown').forEach(d => d.remove());
                const dd = document.createElement('div');
                dd.className = 'cl-dropdown';

                // Rename
                const renameItem = document.createElement('div');
                renameItem.className = 'cl-dropdown-item';
                renameItem.innerHTML = '✏️ Rename';
                renameItem.onclick = () => { dd.remove(); nameLabel.dispatchEvent(new Event('dblclick')); };
                dd.appendChild(renameItem);

                // Move Up
                if (clIdx > 0) {
                    const upItem = document.createElement('div');
                    upItem.className = 'cl-dropdown-item';
                    upItem.innerHTML = '⬆️ Move Up';
                    upItem.onclick = () => {
                        dd.remove();
                        [checklistsData[clIdx - 1], checklistsData[clIdx]] = [checklistsData[clIdx], checklistsData[clIdx - 1]];
                        renderTasks();
                    };
                    dd.appendChild(upItem);
                }

                // Move Down
                if (clIdx < checklistsData.length - 1) {
                    const downItem = document.createElement('div');
                    downItem.className = 'cl-dropdown-item';
                    downItem.innerHTML = '⬇️ Move Down';
                    downItem.onclick = () => {
                        dd.remove();
                        [checklistsData[clIdx], checklistsData[clIdx + 1]] = [checklistsData[clIdx + 1], checklistsData[clIdx]];
                        renderTasks();
                    };
                    dd.appendChild(downItem);
                }

                // Delete
                const delItem = document.createElement('div');
                delItem.className = 'cl-dropdown-item danger';
                delItem.innerHTML = '🗑️ Delete';
                delItem.onclick = async () => {
                    dd.remove();
                    if (confirm('Delete this checklist and all its tasks?')) {
                        await apiCall(`/api/checklists/${cl.id}`, 'DELETE');
                        await loadChecklists();
                    }
                };
                dd.appendChild(delItem);

                dotsWrap.appendChild(dd);
                // Close on outside click
                setTimeout(() => {
                    const closer = (ev) => { if (!dd.contains(ev.target)) { dd.remove(); document.removeEventListener('click', closer); } };
                    document.addEventListener('click', closer);
                }, 10);
            });
            dotsWrap.appendChild(dotsBtn);

            section.appendChild(nameLabel);
            section.appendChild(dotsWrap);
            container.appendChild(section);

            // Items
            const topItems = (cl.items || []).filter(i => !i.parent_item_id).sort((a, b) => a.position - b.position);
            topItems.forEach(item => {
                globalNum++;
                container.appendChild(buildTaskRow(item, cl, globalNum));
                // Sub-items
                const children = (cl.items || []).filter(i => i.parent_item_id === item.id).sort((a, b) => a.position - b.position);
                children.forEach(child => {
                    globalNum++;
                    container.appendChild(buildTaskRow(child, cl, globalNum, true));
                });
            });
        });
    }

    function buildTaskRow(item, checklist, num, nested = false) {
        const row = document.createElement('div');
        row.className = 'engine-task' + (item.id === selectedTaskId ? ' active' : '');
        if (nested) row.style.paddingLeft = '46px';

        // Drag-and-drop
        row.draggable = true;
        row.dataset.itemId = item.id;
        row.dataset.checklistId = checklist.id;

        row.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', JSON.stringify({ itemId: item.id, checklistId: checklist.id }));
            row.classList.add('dragging');
        });

        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            document.querySelectorAll('.engine-task.drag-over').forEach(el => el.classList.remove('drag-over'));
        });

        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            // Only show indicator if not dragging over self
            if (!row.classList.contains('dragging')) {
                document.querySelectorAll('.engine-task.drag-over').forEach(el => el.classList.remove('drag-over'));
                row.classList.add('drag-over');
            }
        });

        row.addEventListener('dragleave', () => {
            row.classList.remove('drag-over');
        });

        row.addEventListener('drop', async (e) => {
            e.preventDefault();
            row.classList.remove('drag-over');
            const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            const fromId = dragData.itemId;
            const toId = item.id;
            if (fromId === toId) return;

            // Find source and target checklists
            const srcCl = checklistsData.find(c => c.id === dragData.checklistId);
            const dstCl = checklist;
            if (!srcCl) return;

            const srcItems = (srcCl.items || []).filter(i => !i.parent_item_id).sort((a, b) => a.position - b.position);
            const fromItem = srcItems.find(i => i.id === fromId);
            if (!fromItem) return;

            if (srcCl.id === dstCl.id) {
                // Same checklist — reorder
                const items = srcItems;
                const fromIdx = items.indexOf(fromItem);
                const toIdx = items.findIndex(i => i.id === toId);
                if (fromIdx === -1 || toIdx === -1) return;
                items.splice(fromIdx, 1);
                items.splice(toIdx, 0, fromItem);
                // Reassign positions
                items.forEach((it, idx) => { it.position = idx; });
                renderTasks();
                updateProgress();
                // Persist
                for (const it of items) {
                    apiCall(`/api/checklist-items/${it.id}`, 'PATCH', { position: it.position });
                }
            } else {
                // Cross-checklist move
                const srcArr = srcItems;
                const dstItems = (dstCl.items || []).filter(i => !i.parent_item_id).sort((a, b) => a.position - b.position);
                const fromIdx = srcArr.indexOf(fromItem);
                if (fromIdx === -1) return;

                // Remove from source
                srcArr.splice(fromIdx, 1);
                srcCl.items = srcCl.items.filter(i => i.id !== fromId);
                srcArr.forEach((it, idx) => { it.position = idx; });

                // Insert into dest
                const toIdx = dstItems.findIndex(i => i.id === toId);
                dstItems.splice(toIdx, 0, fromItem);
                dstCl.items.push(fromItem);
                dstItems.forEach((it, idx) => { it.position = idx; });

                renderTasks();
                updateProgress();

                // Persist all source + dest positions
                for (const it of srcArr) {
                    apiCall(`/api/checklist-items/${it.id}`, 'PATCH', { position: it.position });
                }
                for (const it of dstItems) {
                    apiCall(`/api/checklist-items/${it.id}`, 'PATCH', { position: it.position });
                }
            }
        });

        const numEl = document.createElement('span');
        numEl.className = 'task-num';
        numEl.textContent = num;

        const cb = document.createElement('div');
        cb.className = 'task-cb' + (item.completed ? ' done' : '');
        cb.addEventListener('click', async (e) => {
            e.stopPropagation();
            await apiCall(`/api/checklist-items/${item.id}`, 'PATCH', { completed: !item.completed });
            item.completed = !item.completed;
            renderTasks();
            updateProgress();
        });

        const label = document.createElement('input');
        label.className = 'task-label' + (item.completed ? ' struck' : '');
        label.value = item.text;
        label.spellcheck = false;
        label.style.cssText = 'background:none;border:none;outline:none;font-family:inherit;font-size:inherit;font-weight:inherit;color:inherit;padding:0;cursor:pointer;';
        label.addEventListener('focus', () => { label.style.cursor = 'text'; });
        label.addEventListener('blur', () => { label.style.cursor = 'pointer'; });
        let labelTimer;
        label.addEventListener('input', (e) => {
            e.stopPropagation();
            clearTimeout(labelTimer);
            labelTimer = setTimeout(async () => {
                await apiCall(`/api/checklist-items/${item.id}`, 'PATCH', { text: label.value });
                item.text = label.value;
                // Also update right pane title if this task is selected
                if (selectedTaskId === item.id) {
                    document.getElementById('detail-title').value = label.value;
                }
            }, 600);
        });
        label.addEventListener('click', (e) => e.stopPropagation());

        const avatar = document.createElement('span');
        avatar.className = 'task-avatar';
        avatar.textContent = getInitials(profile.full_name);

        row.appendChild(numEl);
        row.appendChild(cb);
        row.appendChild(label);
        row.appendChild(avatar);

        row.addEventListener('click', () => {
            selectedTaskId = item.id;
            renderTasks();
            showDetail(item, checklist);
        });

        return row;
    }

    // ============================================
    // PROGRESS
    // ============================================

    function updateProgress() {
        let total = 0, done = 0;
        checklistsData.forEach(cl => (cl.items || []).forEach(i => { total++; if (i.completed) done++; }));
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);
        document.getElementById('eng-pct').textContent = `${pct}%`;
        document.getElementById('eng-fill').style.width = `${pct}%`;
        if (pct === 100 && total > 0) {
            document.getElementById('eng-pct').style.color = '#059669';
            document.getElementById('eng-fill').style.background = '#22C55E';
        } else {
            document.getElementById('eng-pct').style.color = 'var(--cb-blue)';
            document.getElementById('eng-fill').style.background = 'var(--cb-blue)';
        }
    }

    // ============================================
    // RIGHT PANE: Task Detail
    // ============================================

    function showDetail(item, checklist) {
        document.getElementById('right-empty').classList.add('hidden');
        document.getElementById('right-content').classList.remove('hidden');

        const titleInput = document.getElementById('detail-title');
        titleInput.value = item.text;
        let tt;
        titleInput.oninput = () => {
            clearTimeout(tt);
            tt = setTimeout(async () => {
                await apiCall(`/api/checklist-items/${item.id}`, 'PATCH', { text: titleInput.value });
                item.text = titleInput.value;
                renderTasks();
            }, 600);
        };

        // Assignee avatar
        const assigneeEmail = item.component_data?.assignee_email;
        document.getElementById('detail-assignee-avatar').innerHTML = assigneeEmail
            ? `<span class="wf-assignee" style="width:24px;height:24px;font-size:10px;">${getInitials(assigneeEmail)}</span>`
            : '';
        document.getElementById('assign-label').textContent = assigneeEmail || 'Assign';

        // Due date display
        const dueDate = item.component_data?.due_date;
        document.getElementById('duedate-label').textContent = dueDate
            ? new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Due date';

        // Wire up Assign trigger
        const assignTrigger = document.getElementById('assign-trigger');
        assignTrigger.onclick = (e) => {
            e.stopPropagation();
            // Close any existing popover
            document.querySelectorAll('.meta-popover').forEach(p => p.remove());
            const pop = document.createElement('div');
            pop.className = 'meta-popover';
            pop.innerHTML = `<div class="meta-popover-label">Assignee Email</div>`;
            const inp = document.createElement('input');
            inp.type = 'email';
            inp.placeholder = 'email@example.com';
            inp.value = item.component_data?.assignee_email || '';
            inp.addEventListener('keydown', async (ev) => {
                if (ev.key === 'Enter') {
                    if (!item.component_data) item.component_data = {};
                    item.component_data.assignee_email = inp.value;
                    await saveComp(item);
                    document.getElementById('assign-label').textContent = inp.value || 'Assign';
                    document.getElementById('detail-assignee-avatar').innerHTML = inp.value
                        ? `<span class="wf-assignee" style="width:24px;height:24px;font-size:10px;">${getInitials(inp.value)}</span>`
                        : '';
                    pop.remove();
                }
            });
            pop.appendChild(inp);
            assignTrigger.appendChild(pop);
            inp.focus();
            setTimeout(() => {
                const closer = (ev) => { if (!pop.contains(ev.target) && ev.target !== assignTrigger) { pop.remove(); document.removeEventListener('click', closer); } };
                document.addEventListener('click', closer);
            }, 10);
        };

        // Wire up Due date trigger
        const dueTrigger = document.getElementById('duedate-trigger');
        dueTrigger.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.meta-popover').forEach(p => p.remove());
            const pop = document.createElement('div');
            pop.className = 'meta-popover';
            pop.innerHTML = `<div class="meta-popover-label">Due Date</div>`;
            const inp = document.createElement('input');
            inp.type = 'date';
            inp.value = item.component_data?.due_date || '';
            inp.addEventListener('change', async () => {
                if (!item.component_data) item.component_data = {};
                item.component_data.due_date = inp.value;
                await saveComp(item);
                document.getElementById('duedate-label').textContent = inp.value
                    ? new Date(inp.value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'Due date';
                pop.remove();
            });
            pop.appendChild(inp);
            dueTrigger.appendChild(pop);
            inp.focus();
            inp.showPicker?.(); // Opens the native date picker dropdown
            setTimeout(() => {
                const closer = (ev) => { if (!pop.contains(ev.target) && ev.target !== dueTrigger) { pop.remove(); document.removeEventListener('click', closer); } };
                document.addEventListener('click', closer);
            }, 10);
        };

        renderComponents(item, checklist);
    }

    // ============================================
    // COMPONENT RENDERER
    // ============================================

    function renderComponents(item, checklist) {
        const container = document.getElementById('detail-components');
        const comps = item.component_data?.components || [];
        container.innerHTML = '';

        comps.forEach((comp, idx) => {
            const block = document.createElement('div');
            block.className = 'comp-block';

            const del = document.createElement('button');
            del.className = 'comp-del';
            del.textContent = '✕';
            del.onclick = () => { comps.splice(idx, 1); saveComp(item); renderComponents(item, checklist); };
            block.appendChild(del);

            const label = document.createElement('div');
            label.className = 'comp-type-label';
            label.textContent = comp.type.replace('_', ' ');
            block.appendChild(label);

            switch (comp.type) {
                case 'text':
                case 'page':
                case 'long_text':
                    const ta = document.createElement('textarea');
                    ta.className = 'cb-input';
                    ta.style.cssText = `min-height: ${comp.type === 'page' ? '120' : '60'}px; resize: vertical;`;
                    ta.value = comp.content || '';
                    ta.placeholder = comp.type === 'page' ? 'Write detailed notes...' : 'Enter text...';
                    let t1;
                    ta.oninput = () => { clearTimeout(t1); t1 = setTimeout(() => { comp.content = ta.value; saveComp(item); }, 600); };
                    block.appendChild(ta);
                    break;

                case 'short_text':
                    const stInput = document.createElement('input');
                    stInput.className = 'cb-input';
                    stInput.value = comp.content || '';
                    stInput.placeholder = 'Short text...';
                    let t1s;
                    stInput.oninput = () => { clearTimeout(t1s); t1s = setTimeout(() => { comp.content = stInput.value; saveComp(item); }, 600); };
                    block.appendChild(stInput);
                    break;

                case 'website':
                case 'image':
                case 'file':
                case 'video':
                case 'embed':
                case 'file_upload':
                    const lf = document.createElement('div');
                    lf.className = 'link-field';
                    lf.innerHTML = `<span class="link-field-icon">🌐</span>`;
                    const urlInp = document.createElement('input');
                    urlInp.value = comp.url || '';
                    urlInp.placeholder = comp.type === 'image' ? 'Image URL...' : comp.type === 'video' ? 'Video URL...' : comp.type === 'embed' ? 'Embed URL...' : comp.type === 'file_upload' ? 'File URL...' : 'URL...';
                    let t2;
                    urlInp.oninput = () => { clearTimeout(t2); t2 = setTimeout(() => { comp.url = urlInp.value; saveComp(item); renderComponents(item, checklist); }, 800); };
                    const arrow = document.createElement('span');
                    arrow.className = 'link-field-arrow';
                    arrow.textContent = '→';
                    arrow.onclick = () => { if (comp.url) window.open(comp.url, '_blank'); };
                    lf.appendChild(urlInp);
                    lf.appendChild(arrow);
                    block.appendChild(lf);

                    const note = document.createElement('div');
                    note.className = 'pre-filled-note';
                    note.textContent = 'Pre-filled with a default value';
                    block.appendChild(note);

                    // Preview
                    if (comp.url && comp.type === 'image') {
                        const img = document.createElement('img');
                        img.src = comp.url;
                        img.style.cssText = 'max-width:100%; border-radius:6px; margin-top:8px;';
                        img.onerror = () => img.style.display = 'none';
                        block.appendChild(img);
                    }
                    if (comp.url && comp.type === 'video' && comp.url.includes('youtube')) {
                        const vid = comp.url.match(/(?:v=|\/)([\w-]{11})/)?.[1];
                        if (vid) {
                            const iframe = document.createElement('iframe');
                            iframe.src = `https://www.youtube.com/embed/${vid}`;
                            iframe.style.cssText = 'width:100%;height:200px;border:none;border-radius:6px;margin-top:8px;';
                            block.appendChild(iframe);
                        }
                    }
                    if (comp.url && comp.type === 'embed') {
                        const iframe = document.createElement('iframe');
                        iframe.src = comp.url;
                        iframe.style.cssText = 'width:100%;height:200px;border:1px solid var(--glass-border);border-radius:6px;margin-top:8px;';
                        block.appendChild(iframe);
                    }
                    break;

                case 'subtask':
                    const sLabel = document.createElement('div');
                    sLabel.style.cssText = 'font-size: 13px; font-weight: 500; color: var(--text-secondary); margin-bottom: 8px;';
                    sLabel.innerHTML = '';
                    block.appendChild(sLabel);

                    (comp.items || []).forEach((si, sIdx) => {
                        const sRow = document.createElement('div');
                        sRow.className = 'subtask-row';

                        const sNum = document.createElement('span');
                        sNum.className = 'subtask-num';
                        sNum.textContent = sIdx + 1;

                        const sCb = document.createElement('div');
                        sCb.className = 'subtask-cb' + (si.done ? ' done' : '');
                        sCb.onclick = () => { si.done = !si.done; saveComp(item); renderComponents(item, checklist); };

                        const sTxt = document.createElement('input');
                        sTxt.className = 'subtask-text' + (si.done ? ' struck' : '');
                        sTxt.value = si.text || '';
                        let st;
                        sTxt.oninput = () => { clearTimeout(st); st = setTimeout(() => { si.text = sTxt.value; saveComp(item); }, 600); };

                        const sReq = document.createElement('span');
                        sReq.className = 'subtask-req';
                        sReq.textContent = '*';

                        const sDel = document.createElement('button');
                        sDel.className = 'btn-icon danger';
                        sDel.style.fontSize = '11px';
                        sDel.textContent = '✕';
                        sDel.onclick = () => { comp.items.splice(sIdx, 1); saveComp(item); renderComponents(item, checklist); };

                        sRow.appendChild(sNum);
                        sRow.appendChild(sCb);
                        sRow.appendChild(sTxt);
                        sRow.appendChild(sReq);
                        sRow.appendChild(sDel);
                        block.appendChild(sRow);
                    });

                    const addSub = document.createElement('button');
                    addSub.className = 'add-btn-dashed';
                    addSub.style.cssText = 'padding:6px;font-size:12px;margin-top:6px;';
                    addSub.textContent = '+ Add subtask';
                    addSub.onclick = () => {
                        if (!comp.items) comp.items = [];
                        comp.items.push({ text: 'New subtask', done: false });
                        saveComp(item); renderComponents(item, checklist);
                    };
                    block.appendChild(addSub);
                    break;

                case 'email':
                    const eTo = document.createElement('input');
                    eTo.className = 'cb-input'; eTo.placeholder = 'To...'; eTo.value = comp.to || '';
                    eTo.style.marginBottom = '6px';
                    const eSubj = document.createElement('input');
                    eSubj.className = 'cb-input'; eSubj.placeholder = 'Subject...'; eSubj.value = comp.subject || '';
                    eSubj.style.marginBottom = '6px';
                    const eBody = document.createElement('textarea');
                    eBody.className = 'cb-input'; eBody.placeholder = 'Body...'; eBody.value = comp.body || '';
                    eBody.style.cssText = 'min-height:60px;resize:vertical;';

                    [eTo, eSubj, eBody].forEach(el => {
                        let et;
                        el.oninput = () => {
                            clearTimeout(et); et = setTimeout(() => {
                                comp.to = eTo.value; comp.subject = eSubj.value; comp.body = eBody.value;
                                saveComp(item);
                            }, 600);
                        };
                    });

                    const sendLink = document.createElement('a');
                    sendLink.className = 'btn-primary btn-sm';
                    sendLink.style.cssText = 'display:inline-block;margin-top:8px;text-align:center;text-decoration:none;width:auto;padding:8px 16px;';
                    sendLink.textContent = '📧 Open in Email';
                    sendLink.href = `mailto:${comp.to || ''}?subject=${encodeURIComponent(comp.subject || '')}&body=${encodeURIComponent(comp.body || '')}`;
                    sendLink.target = '_blank';

                    block.appendChild(eTo);
                    block.appendChild(eSubj);
                    block.appendChild(eBody);
                    block.appendChild(sendLink);
                    break;

                case 'email_field':
                    const efInp = document.createElement('input');
                    efInp.className = 'cb-input'; efInp.type = 'email'; efInp.placeholder = 'email@example.com';
                    efInp.value = comp.content || '';
                    let ef;
                    efInp.oninput = () => { clearTimeout(ef); ef = setTimeout(() => { comp.content = efInp.value; saveComp(item); }, 600); };
                    block.appendChild(efInp);
                    break;

                case 'date':
                    const dateInp = document.createElement('input');
                    dateInp.className = 'cb-input'; dateInp.type = 'date';
                    dateInp.value = comp.content || '';
                    dateInp.onchange = () => { comp.content = dateInp.value; saveComp(item); };
                    block.appendChild(dateInp);
                    break;

                case 'numbers':
                    const numInp = document.createElement('input');
                    numInp.className = 'cb-input'; numInp.type = 'number'; numInp.placeholder = '0';
                    numInp.value = comp.content || '';
                    let ni;
                    numInp.oninput = () => { clearTimeout(ni); ni = setTimeout(() => { comp.content = numInp.value; saveComp(item); }, 600); };
                    block.appendChild(numInp);
                    break;

                case 'dropdown':
                    const ddInp = document.createElement('input');
                    ddInp.className = 'cb-input';
                    ddInp.placeholder = 'Comma-separated options (e.g. Option A, Option B)';
                    ddInp.value = comp.options || '';
                    let dd;
                    ddInp.oninput = () => { clearTimeout(dd); dd = setTimeout(() => { comp.options = ddInp.value; saveComp(item); }, 600); };
                    block.appendChild(ddInp);

                    const ddSel = document.createElement('select');
                    ddSel.className = 'cb-select';
                    ddSel.style.marginTop = '6px';
                    ddSel.innerHTML = '<option value="">Select...</option>';
                    (comp.options || '').split(',').filter(Boolean).forEach(o => {
                        const opt = document.createElement('option');
                        opt.value = o.trim(); opt.textContent = o.trim();
                        if (o.trim() === comp.selected) opt.selected = true;
                        ddSel.appendChild(opt);
                    });
                    ddSel.onchange = () => { comp.selected = ddSel.value; saveComp(item); };
                    block.appendChild(ddSel);
                    break;

                case 'multi_choice':
                    const mcInp = document.createElement('input');
                    mcInp.className = 'cb-input';
                    mcInp.placeholder = 'Comma-separated choices';
                    mcInp.value = comp.options || '';
                    let mc;
                    mcInp.oninput = () => { clearTimeout(mc); mc = setTimeout(() => { comp.options = mcInp.value; saveComp(item); renderComponents(item, checklist); }, 800); };
                    block.appendChild(mcInp);

                    const mcDiv = document.createElement('div');
                    mcDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;';
                    (comp.options || '').split(',').filter(Boolean).forEach(o => {
                        const chosen = (comp.selected_multi || []).includes(o.trim());
                        const pill = document.createElement('span');
                        pill.className = 'multi-option' + (chosen ? ' selected' : '');
                        pill.textContent = o.trim();
                        pill.style.cursor = 'pointer';
                        pill.onclick = () => {
                            if (!comp.selected_multi) comp.selected_multi = [];
                            if (chosen) comp.selected_multi = comp.selected_multi.filter(x => x !== o.trim());
                            else comp.selected_multi.push(o.trim());
                            saveComp(item); renderComponents(item, checklist);
                        };
                        mcDiv.appendChild(pill);
                    });
                    block.appendChild(mcDiv);
                    break;
            }

            container.appendChild(block);
        });

        // Description text
        if (comps.length === 0) {
            const emptyHint = document.createElement('p');
            emptyHint.style.cssText = 'color:var(--cb-text-muted);font-size:13px;font-style:italic;padding:20px 0;';
            emptyHint.textContent = 'No components yet. Click "+ Content" or "+ Form Fields" to add.';
            container.appendChild(emptyHint);
        }
    }

    async function saveComp(item) {
        await apiCall(`/api/checklist-items/${item.id}`, 'PATCH', { component_data: item.component_data });
    }

    function findCurrentItem() {
        if (!selectedTaskId) return null;
        for (const cl of checklistsData) {
            const item = (cl.items || []).find(i => i.id === selectedTaskId);
            if (item) return item;
        }
        return null;
    }

    // ============================================
    // SLIDE-IN PANELS
    // ============================================

    document.getElementById('open-content-panel').addEventListener('click', () => {
        closePanel('form-panel');
        document.getElementById('content-panel').classList.add('open');
    });

    document.getElementById('open-form-panel').addEventListener('click', () => {
        closePanel('content-panel');
        document.getElementById('form-panel').classList.add('open');
    });

    window.closePanel = function (id) {
        document.getElementById(id).classList.remove('open');
    };

    // Panel item clicks
    document.querySelectorAll('.panel-item').forEach(pi => {
        pi.addEventListener('click', () => {
            const item = findCurrentItem();
            if (!item) { showToast('Select a task first.', 'error'); return; }
            if (!item.component_data) item.component_data = {};
            if (!item.component_data.components) item.component_data.components = [];

            const type = pi.dataset.comp;
            const comp = { type };
            if (type === 'subtask') comp.items = [{ text: 'New subtask', done: false }];

            item.component_data.components.push(comp);
            saveComp(item);
            renderComponents(item);
            closePanel('content-panel');
            closePanel('form-panel');
        });
    });

    // ============================================
    // ADD TASK
    // ============================================

    document.getElementById('add-task-btn').addEventListener('click', async () => {
        if (!currentEvent) return;
        if (checklistsData.length === 0) {
            const clResult = await apiCall(`/api/webinars/${currentEvent.id}/checklists`, 'POST', { name: 'Tasks' });
            if (clResult.checklist) checklistsData.push(clResult.checklist);
        }
        const cl = checklistsData[checklistsData.length - 1];
        const result = await apiCall(`/api/checklists/${cl.id}/items`, 'POST', { text: 'New Task' });
        if (result.item) {
            cl.items.push(result.item);
            renderTasks();
            updateProgress();
        }
    });

    // ============================================
    // TEMPLATES
    // ============================================

    document.getElementById('manage-templates-btn').addEventListener('click', () => openTplModal());
    document.getElementById('save-tpl-btn').addEventListener('click', () => openTplModal('save'));
    document.getElementById('load-tpl-btn').addEventListener('click', () => openTplModal('load'));
    document.getElementById('close-tpl-modal').addEventListener('click', () => {
        document.getElementById('tpl-modal').classList.add('hidden');
    });

    async function openTplModal(mode) {
        document.getElementById('tpl-modal').classList.remove('hidden');
        const listDiv = document.getElementById('tpl-list');
        listDiv.innerHTML = '<p style="color:var(--cb-text-muted);font-size:13px;">Loading...</p>';

        const result = await apiCall('/api/templates');
        const templates = result.templates || [];

        if (templates.length === 0) {
            listDiv.innerHTML = '<p style="color:var(--cb-text-muted);font-size:13px;">No templates yet.</p>';
        } else {
            listDiv.innerHTML = '';
            templates.forEach(tpl => {
                const row = document.createElement('div');
                row.className = 'flex justify-between items-center';
                row.style.cssText = 'padding:8px 12px;border:1px solid var(--glass-border);border-radius:6px;margin-bottom:6px;';
                row.innerHTML = `
                    <span style="font-size:14px;">${tpl.name}</span>
                    <div class="flex gap-2">
                        <button class="btn-outline btn-sm load-tpl" data-id="${tpl.id}">Load</button>
                        <button class="btn-icon danger del-tpl" data-id="${tpl.id}">🗑️</button>
                    </div>
                `;
                listDiv.appendChild(row);
            });

            listDiv.querySelectorAll('.load-tpl').forEach(btn => {
                btn.addEventListener('click', () => loadTemplate(btn.dataset.id));
            });
            listDiv.querySelectorAll('.del-tpl').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await apiCall(`/api/templates/${btn.dataset.id}`, 'DELETE');
                    openTplModal(mode);
                });
            });
        }
    }

    document.getElementById('save-tpl-exec').addEventListener('click', async () => {
        const name = document.getElementById('tpl-name').value.trim();
        if (!name) { showToast('Enter a name', 'error'); return; }

        const templateData = checklistsData.map(cl => ({
            name: cl.name,
            items: (cl.items || []).map(i => ({
                text: i.text, parent_item_id: i.parent_item_id,
                component_type: i.component_type, component_data: i.component_data
            }))
        }));

        await apiCall('/api/templates', 'POST', { name, template_data: templateData });
        showToast('Template saved!');
        document.getElementById('tpl-name').value = '';
        document.getElementById('tpl-modal').classList.add('hidden');
    });

    async function loadTemplate(id) {
        const result = await apiCall(`/api/templates/${id}`);
        const tpl = result.template;
        if (!tpl || !currentEvent) return;

        for (const clData of (tpl.template_data || [])) {
            const clResult = await apiCall(`/api/webinars/${currentEvent.id}/checklists`, 'POST', { name: clData.name });
            if (clResult.checklist) {
                for (const itemData of (clData.items || [])) {
                    await apiCall(`/api/checklists/${clResult.checklist.id}/items`, 'POST', {
                        text: itemData.text, component_data: itemData.component_data
                    });
                }
            }
        }

        document.getElementById('tpl-modal').classList.add('hidden');
        showToast('Template loaded!');
        await loadChecklists();
    }
});
