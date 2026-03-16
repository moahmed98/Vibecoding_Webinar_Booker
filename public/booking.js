// ============================================
// Booking Portal Logic
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Auth guard — only non-ops teams
    const profile = await requireRole(['content', 'marketing', 'engineering']);
    if (!profile) return;
    setupNav(profile);

    // Elements
    const checkBtn = document.getElementById('check-availability-btn');
    const bookingForm = document.getElementById('bookingForm');
    const feedbackDiv = document.getElementById('availability-feedback');
    const extendedForm = document.getElementById('extended-form');
    const submitBtn = document.getElementById('submit-btn');
    const finalMessage = document.getElementById('final-message');
    const postBooking = document.getElementById('post-booking');

    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');

    let availabilityChecked = false;
    let lastBookedId = null;
    let editingId = null;

    // ============================================
    // DATE/TIME HELPERS
    // ============================================

    function combineDateTime(dateVal, timeVal) {
        if (!dateVal || !timeVal) return null;
        return `${dateVal}T${timeVal}:00+05:30`;
    }

    function formatDateTime(isoString) {
        return new Date(isoString).toLocaleString('en-IN', {
            weekday: 'short', year: 'numeric', month: 'short',
            day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    // Auto-sync end date
    startDateInput.addEventListener('change', () => {
        if (!endDateInput.value) endDateInput.value = startDateInput.value;
    });

    // ============================================
    // RADIO & MULTI-SELECT LOGIC
    // ============================================

    const radioOptions = document.querySelectorAll('.radio-option');
    const bootcampField = document.getElementById('bootcamp-field');
    const courseField = document.getElementById('course-field');

    radioOptions.forEach(opt => {
        const input = opt.querySelector('input[type="radio"]');
        opt.addEventListener('click', () => {
            radioOptions.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            input.checked = true;

            if (input.value === 'Bootcamp Webinar') {
                bootcampField.classList.remove('hidden');
                courseField.classList.add('hidden');
            } else {
                courseField.classList.remove('hidden');
                bootcampField.classList.add('hidden');
            }
        });
    });

    // Multi-select toggle
    document.querySelectorAll('.multi-option').forEach(opt => {
        opt.addEventListener('click', () => {
            opt.classList.toggle('selected');
            const cb = opt.querySelector('input[type="checkbox"]');
            cb.checked = !cb.checked;
        });
    });

    // ============================================
    // AVAILABILITY CHECK
    // ============================================

    checkBtn.addEventListener('click', async () => {
        const start = combineDateTime(startDateInput.value, startTimeInput.value);
        const end = combineDateTime(endDateInput.value, endTimeInput.value);

        if (!start || !end) { showToast('Fill in all date and time fields.', 'error'); return; }
        if (new Date(start) >= new Date(end)) { showToast('End must be after start.', 'error'); return; }

        // Thursday block
        const startDt = new Date(start);
        const endDt = new Date(end);
        const sH = parseInt(startTimeInput.value.split(':')[0], 10);
        const eH = parseInt(endTimeInput.value.split(':')[0], 10);
        if ((startDt.getDay() === 4 && sH >= 18) || (endDt.getDay() === 4 && eH >= 18)) {
            feedbackDiv.classList.remove('hidden');
            feedbackDiv.innerHTML = '<span style="color: var(--cb-danger);">❌ Thursdays after 6:00 PM are blocked.</span>';
            feedbackDiv.style.background = 'rgba(239, 68, 68, 0.08)';
            return;
        }

        feedbackDiv.classList.remove('hidden');
        feedbackDiv.innerHTML = '<span style="color: var(--cb-text-muted);">Checking...</span>';
        feedbackDiv.style.background = 'rgba(255,255,255,0.04)';
        checkBtn.disabled = true;

        try {
            const data = await apiCall('/api/check-availability', 'POST', { start, end });

            if (data.available) {
                feedbackDiv.innerHTML = '<span style="color: var(--teal);">✅ Slot Available</span>';
                feedbackDiv.style.background = 'rgba(32, 201, 151, 0.08)';
                extendedForm.classList.remove('hidden');
                checkBtn.classList.add('hidden');
                availabilityChecked = true;
            } else {
                feedbackDiv.innerHTML = '<span style="color: var(--cb-danger);">❌ Slot Busy. Try another time.</span>';
                feedbackDiv.style.background = 'rgba(239, 68, 68, 0.08)';
                checkBtn.disabled = false;
            }
        } catch (err) {
            feedbackDiv.innerHTML = '<span style="color: var(--cb-danger);">Error checking.</span>';
            checkBtn.disabled = false;
        }
    });

    // Reset on change
    const resetAvailability = () => {
        if (availabilityChecked) {
            extendedForm.classList.add('hidden');
            checkBtn.classList.remove('hidden');
            checkBtn.disabled = false;
            feedbackDiv.classList.add('hidden');
            availabilityChecked = false;
        }
    };
    [startDateInput, endDateInput, startTimeInput, endTimeInput].forEach(i => i.addEventListener('change', resetAvailability));

    // ============================================
    // BOOK EVENT
    // ============================================

    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!availabilityChecked) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'BOOKING...';

        const start = combineDateTime(startDateInput.value, startTimeInput.value);
        const end = combineDateTime(endDateInput.value, endTimeInput.value);
        const eventTypeRadio = document.querySelector('input[name="eventType"]:checked');

        // Gather multi-select
        const bootcamps = [...document.querySelectorAll('#bootcamp-options input:checked')].map(c => c.value);
        const courses = [...document.querySelectorAll('#course-options input:checked')].map(c => c.value);

        const formData = {
            title: document.getElementById('title').value,
            start, end,
            type: eventTypeRadio ? eventTypeRadio.value : 'Course Webinar',
            paid_free: document.getElementById('paid-free').value,
            bootcamps,
            courses,
            linkedin: document.getElementById('linkedin').value
        };

        try {
            const url = editingId ? `/api/webinars/${editingId}` : '/api/book-event';
            const method = editingId ? 'PATCH' : 'POST';
            const result = await apiCall(url, method, formData);

            if (result.success || result.webinar) {
                const webinar = result.webinar;
                lastBookedId = webinar.id;

                // Show post-booking
                bookingForm.classList.add('hidden');
                postBooking.classList.remove('hidden');
                document.getElementById('booked-summary').textContent =
                    `${webinar.title} — ${formatDateTime(webinar.start_time)}`;

                editingId = null;
            } else {
                finalMessage.innerHTML = `<span style="color: var(--cb-danger);">${result.error || 'Failed'}</span>`;
                submitBtn.disabled = false;
                submitBtn.textContent = 'CONFIRM BOOKING';
            }
        } catch (err) {
            finalMessage.innerHTML = '<span style="color: var(--cb-danger);">Network error.</span>';
            submitBtn.disabled = false;
            submitBtn.textContent = 'CONFIRM BOOKING';
        }
    });

    // ============================================
    // ASSIGN TO OPS
    // ============================================

    document.getElementById('assign-ops-btn').addEventListener('click', async () => {
        if (!lastBookedId) return;
        const btn = document.getElementById('assign-ops-btn');
        btn.disabled = true;
        btn.textContent = 'ASSIGNING...';

        const result = await apiCall(`/api/webinars/${lastBookedId}/assign-ops`, 'PATCH');
        if (result.success) {
            btn.classList.add('hidden');
            document.getElementById('assigned-msg').classList.remove('hidden');
        } else {
            showToast('Failed to assign.', 'error');
            btn.disabled = false;
            btn.textContent = 'ASSIGN TO OPERATIONS TEAM →';
        }
    });

    // ============================================
    // TAB SWITCHING
    // ============================================

    window.switchTab = function (tab) {
        document.getElementById('panel-new').classList.toggle('hidden', tab !== 'new');
        document.getElementById('panel-events').classList.toggle('hidden', tab !== 'events');
        document.getElementById('tab-new').classList.toggle('active', tab === 'new');
        document.getElementById('tab-events').classList.toggle('active', tab === 'events');
        if (tab === 'events') loadMyEvents();
    };

    // ============================================
    // MY EVENTS
    // ============================================

    async function loadMyEvents() {
        const container = document.getElementById('events-list');
        container.innerHTML = '<p style="color: var(--cb-text-muted); text-align: center; padding: 40px;">Loading...</p>';

        const result = await apiCall('/api/webinars/mine');
        const events = result.webinars || [];

        if (events.length === 0) {
            container.innerHTML = '<p style="color: var(--cb-text-muted); text-align: center; padding: 40px;">No events yet. Book your first webinar!</p>';
            return;
        }

        container.innerHTML = '';
        events.forEach(ev => {
            const statusClass = ev.status === 'draft' ? 'status-draft' :
                ev.status === 'pending_ops' ? 'status-pending' :
                    ev.status === 'in_progress' ? 'status-active' : 'status-completed';

            const card = document.createElement('div');
            card.className = 'event-card';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div class="event-card-title">${ev.title}</div>
                        <div class="event-card-meta">${formatDateTime(ev.start_time)} → ${formatDateTime(ev.end_time)}</div>
                        <div class="event-card-meta" style="margin-top: 4px;">
                            ${ev.type} · ${ev.paid_free || 'Free'}
                            ${ev.bootcamps?.length ? ' · ' + ev.bootcamps.join(', ') : ''}
                            ${ev.courses?.length ? ' · ' + ev.courses.join(', ') : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="event-card-status ${statusClass}">${ev.status.replace('_', ' ')}</span>
                        ${ev.status === 'draft' ? '<button class="btn-outline btn-sm edit-btn" data-id="' + ev.id + '">Edit</button>' : ''}
                        ${ev.status === 'draft' ? '<button class="btn-outline btn-sm assign-btn" data-id="' + ev.id + '" style="border-color: var(--brand-purple); color: var(--brand-purple);">Assign Ops</button>' : ''}
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        // Edit handlers
        container.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                loadEventForEdit(btn.dataset.id);
            });
        });

        // Assign handlers
        container.querySelectorAll('.assign-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await apiCall(`/api/webinars/${btn.dataset.id}/assign-ops`, 'PATCH');
                showToast('Assigned to Operations!');
                loadMyEvents();
            });
        });
    }

    async function loadEventForEdit(id) {
        const result = await apiCall(`/api/webinars/${id}`);
        const ev = result.webinar;
        if (!ev) return;

        editingId = id;
        switchTab('new');

        // Fill form
        document.getElementById('title').value = ev.title;
        const startDt = new Date(ev.start_time);
        const endDt = new Date(ev.end_time);
        startDateInput.value = startDt.toISOString().split('T')[0];
        endDateInput.value = endDt.toISOString().split('T')[0];
        startTimeInput.value = startDt.toTimeString().slice(0, 5);
        endTimeInput.value = endDt.toTimeString().slice(0, 5);
        document.getElementById('paid-free').value = ev.paid_free || 'Free';
        document.getElementById('linkedin').value = ev.linkedin_url || '';

        // Show extended form
        extendedForm.classList.remove('hidden');
        checkBtn.classList.add('hidden');
        availabilityChecked = true;

        // Set radio
        const radio = document.querySelector(`input[name="eventType"][value="${ev.type}"]`);
        if (radio) {
            radio.checked = true;
            radio.closest('.radio-option').classList.add('selected');
            if (ev.type === 'Bootcamp Webinar') {
                bootcampField.classList.remove('hidden');
                courseField.classList.add('hidden');
            } else {
                courseField.classList.remove('hidden');
                bootcampField.classList.add('hidden');
            }
        }

        // Set multi-selects
        if (ev.bootcamps) {
            document.querySelectorAll('#bootcamp-options input').forEach(cb => {
                if (ev.bootcamps.includes(cb.value)) {
                    cb.checked = true;
                    cb.closest('.multi-option').classList.add('selected');
                }
            });
        }
        if (ev.courses) {
            document.querySelectorAll('#course-options input').forEach(cb => {
                if (ev.courses.includes(cb.value)) {
                    cb.checked = true;
                    cb.closest('.multi-option').classList.add('selected');
                }
            });
        }

        submitBtn.textContent = 'UPDATE EVENT';
        showToast('Editing event: ' + ev.title);
    }
});
