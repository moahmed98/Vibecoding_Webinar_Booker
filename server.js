require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Supabase client (server-side, uses anon key — RLS enforced)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Auth middleware: extract user from JWT
async function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        req.user = null;
        return next();
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
        req.user = null;
    } else {
        req.user = user;
        // Create authenticated client for this request
        req.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });
    }
    next();
}

app.use(authMiddleware);

// ============================================
// WEBINAR ENDPOINTS
// ============================================

// Check availability
app.post('/api/check-availability', async (req, res) => {
    const { start, end } = req.body;
    if (!start || !end) return res.status(400).json({ error: 'Times required.' });

    try {
        const { data, error } = await supabase
            .from('webinars')
            .select('id, title, start_time, end_time')
            .lt('start_time', end)
            .gt('end_time', start);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ available: !data || data.length === 0 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to check.' });
    }
});

// Book event
app.post('/api/book-event', async (req, res) => {
    const { title, start, end, type, paid_free, bootcamps, courses, linkedin } = req.body;
    if (!title || !start || !end || !linkedin) return res.status(400).json({ error: 'Missing fields.' });

    try {
        const { data, error } = await supabase
            .from('webinars')
            .insert({
                title,
                start_time: start,
                end_time: end,
                type: type || 'Course Webinar',
                paid_free: paid_free || 'Free',
                bootcamps: bootcamps || [],
                courses: courses || [],
                linkedin_url: linkedin,
                status: 'draft',
                created_by: req.user?.id || null
            })
            .select()
            .single();

        if (error) {
            console.error('Book error:', error);
            return res.status(500).json({ error: error.message });
        }
        res.json({ success: true, webinar: data });
    } catch (err) {
        res.status(500).json({ error: 'Failed to book.' });
    }
});

// My events (MUST be before /:id)
app.get('/api/webinars/mine', async (req, res) => {
    if (!req.user) return res.json({ webinars: [] });
    try {
        const { data, error } = await supabase
            .from('webinars')
            .select('*')
            .eq('created_by', req.user.id)
            .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json({ webinars: data || [] });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

// Pending ops events (MUST be before /:id)
app.get('/api/webinars/pending-ops', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('webinars')
            .select('*')
            .in('status', ['pending_ops', 'in_progress'])
            .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json({ webinars: data || [] });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

// Get single webinar
app.get('/api/webinars/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('webinars')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error) return res.status(500).json({ error: error.message });
        res.json({ webinar: data });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

// Update webinar
app.patch('/api/webinars/:id', async (req, res) => {
    const { title, start, end, type, paid_free, bootcamps, courses, linkedin } = req.body;
    const updates = {};
    if (title) updates.title = title;
    if (start) updates.start_time = start;
    if (end) updates.end_time = end;
    if (type) updates.type = type;
    if (paid_free) updates.paid_free = paid_free;
    if (bootcamps) updates.bootcamps = bootcamps;
    if (courses) updates.courses = courses;
    if (linkedin) updates.linkedin_url = linkedin;

    try {
        const { data, error } = await supabase
            .from('webinars')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true, webinar: data });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

// Assign to ops
app.patch('/api/webinars/:id/assign-ops', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('webinars')
            .update({ status: 'pending_ops' })
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) return res.status(500).json({ error: error.message });

        // Fire workflow_started webhook
        if (data) {
            sendWebhook('workflow_started', {
                workflow_name: data.title,
                workflow_id: data.id,
                assigned_to: '',
                task_link: `http://localhost:${process.env.PORT || 3000}/ops.html`
            });
        }

        res.json({ success: true, webinar: data });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

// ============================================
// CHECKLIST ENDPOINTS
// ============================================

app.get('/api/webinars/:id/checklists', async (req, res) => {
    try {
        const { data: checklists, error: clErr } = await supabase
            .from('checklists')
            .select('*')
            .eq('webinar_id', req.params.id)
            .order('position');
        if (clErr) return res.status(500).json({ error: clErr.message });

        const checklistIds = checklists.map(c => c.id);
        if (checklistIds.length === 0) return res.json({ checklists: [] });

        const { data: items, error: itemErr } = await supabase
            .from('checklist_items')
            .select('*')
            .in('checklist_id', checklistIds)
            .order('position');
        if (itemErr) return res.status(500).json({ error: itemErr.message });

        const result = checklists.map(cl => ({
            ...cl,
            items: (items || []).filter(i => i.checklist_id === cl.id)
        }));
        res.json({ checklists: result });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

app.post('/api/webinars/:id/checklists', async (req, res) => {
    const { name } = req.body;
    try {
        const { data: existing } = await supabase
            .from('checklists')
            .select('position')
            .eq('webinar_id', req.params.id)
            .order('position', { ascending: false })
            .limit(1);
        const nextPos = existing?.length ? existing[0].position + 1 : 0;

        const { data, error } = await supabase
            .from('checklists')
            .insert({ webinar_id: req.params.id, name: name || 'New Checklist', position: nextPos })
            .select()
            .single();
        if (error) return res.status(500).json({ error: error.message });

        // Webhook: checklist_created
        if (data) {
            getWebinarForChecklist(data.id).then(w => {
                sendWebhook('checklist_created', {
                    workflow_name: w?.title || 'Unknown',
                    workflow_id: w?.id || null,
                    checklist_name: data.name,
                    checklist_id: data.id
                });
            });
        }

        res.json({ checklist: { ...data, items: [] } });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

app.patch('/api/checklists/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('checklists')
            .update({ name: req.body.name })
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) return res.status(500).json({ error: error.message });

        // Webhook: checklist_renamed
        if (data) {
            getWebinarForChecklist(data.id).then(w => {
                sendWebhook('checklist_renamed', {
                    workflow_name: w?.title || 'Unknown',
                    workflow_id: w?.id || null,
                    checklist_name: data.name,
                    checklist_id: data.id
                });
            });
        }

        res.json({ checklist: data });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

app.delete('/api/checklists/:id', async (req, res) => {
    try {
        // Get checklist info before deleting
        const { data: clData } = await supabase.from('checklists').select('*').eq('id', req.params.id).single();
        const { error } = await supabase.from('checklists').delete().eq('id', req.params.id);
        if (error) return res.status(500).json({ error: error.message });

        // Webhook: checklist_deleted
        if (clData) {
            getWebinarForChecklist(clData.webinar_id).then(w => {
                sendWebhook('checklist_deleted', {
                    workflow_name: w?.title || 'Unknown',
                    workflow_id: w?.id || null,
                    checklist_name: clData.name,
                    checklist_id: clData.id
                });
            }).catch(() => {
                sendWebhook('checklist_deleted', { checklist_name: clData.name, checklist_id: clData.id });
            });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

// ============================================
// CHECKLIST ITEM ENDPOINTS
// ============================================

app.post('/api/checklists/:id/items', async (req, res) => {
    const { text, parent_item_id, component_data } = req.body;
    try {
        const query = supabase
            .from('checklist_items')
            .select('position')
            .eq('checklist_id', req.params.id)
            .order('position', { ascending: false })
            .limit(1);

        if (parent_item_id) query.eq('parent_item_id', parent_item_id);
        else query.is('parent_item_id', null);

        const { data: existing } = await query;
        const nextPos = existing?.length ? existing[0].position + 1 : 0;

        const { data, error } = await supabase
            .from('checklist_items')
            .insert({
                checklist_id: req.params.id,
                parent_item_id: parent_item_id || null,
                text: text || 'New Task',
                completed: false,
                position: nextPos,
                component_data: component_data || { components: [] }
            })
            .select()
            .single();
        if (error) return res.status(500).json({ error: error.message });

        // Webhook: task_created
        if (data) {
            getWebinarForItem(data).then(({ webinar }) => fireTaskWebhook('task_created', data, webinar));
        }

        res.json({ item: data });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

app.patch('/api/checklist-items/:id', async (req, res) => {
    const updates = {};
    if (req.body.completed !== undefined) updates.completed = req.body.completed;
    if (req.body.text !== undefined) updates.text = req.body.text;
    if (req.body.component_data !== undefined) updates.component_data = req.body.component_data;
    if (req.body.position !== undefined) updates.position = req.body.position;

    try {
        const { data, error } = await supabase
            .from('checklist_items')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) return res.status(500).json({ error: error.message });

        // --- Webhook triggers for EVERYTHING (async, non-blocking) ---
        if (data) {
            getWebinarForItem(data).then(({ webinar: w }) => {
                // Task completed
                if (req.body.completed === true) {
                    fireTaskWebhook('task_completed', data, w);
                    // Check if ALL items complete → workflow_completed
                    if (w) {
                        supabase.from('checklists').select('id').eq('webinar_id', w.id).then(({ data: cls }) => {
                            if (!cls) return;
                            supabase.from('checklist_items').select('completed').in('checklist_id', cls.map(c => c.id)).then(({ data: items }) => {
                                if (items && items.length > 0 && items.every(i => i.completed)) {
                                    sendWebhook('workflow_completed', { workflow_name: w.title, workflow_id: w.id });
                                }
                            });
                        });
                    }
                }

                // Task uncompleted
                if (req.body.completed === false) {
                    fireTaskWebhook('task_uncompleted', data, w);
                }

                // Assignee changed
                if (req.body.component_data?.assignee_email !== undefined) {
                    fireTaskWebhook('assignee_changed', data, w);
                }

                // Due date changed
                if (req.body.component_data?.due_date !== undefined) {
                    fireTaskWebhook('due_date_changed', data, w);
                }

                // Components updated (text, image, file, video, subtask, form, etc.)
                if (req.body.component_data?.components !== undefined) {
                    fireTaskWebhook('component_updated', data, w);
                }

                // Task text/name changed
                if (req.body.text !== undefined) {
                    fireTaskWebhook('task_text_changed', data, w);
                }
            });
        }

        res.json({ item: data });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

app.delete('/api/checklist-items/:id', async (req, res) => {
    try {
        // Get item info before deleting
        const { data: itemData } = await supabase.from('checklist_items').select('*').eq('id', req.params.id).single();
        const { error } = await supabase.from('checklist_items').delete().eq('id', req.params.id);
        if (error) return res.status(500).json({ error: error.message });

        // Webhook: task_deleted
        if (itemData) {
            getWebinarForItem(itemData).then(({ webinar }) => fireTaskWebhook('task_deleted', itemData, webinar));
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

// ============================================
// TEMPLATE ENDPOINTS
// ============================================

app.get('/api/templates', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('checklist_templates')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json({ templates: data || [] });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

app.get('/api/templates/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('checklist_templates')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error) return res.status(500).json({ error: error.message });
        res.json({ template: data });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

app.post('/api/templates', async (req, res) => {
    const { name, template_data } = req.body;
    try {
        const { data, error } = await supabase
            .from('checklist_templates')
            .insert({
                name: name || 'Untitled Template',
                template_data: template_data || [],
                created_by: req.user?.id || null
            })
            .select()
            .single();
        if (error) return res.status(500).json({ error: error.message });
        res.json({ template: data });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

app.delete('/api/templates/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('checklist_templates').delete().eq('id', req.params.id);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

// ============================================
// WEBHOOK SENDER UTILITY
// ============================================

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'cb-webhook-secret-2026';

async function sendWebhook(eventType, payload) {
    try {
        // Fetch all active webhook URLs
        const { data: webhooks, error } = await supabase
            .from('webhook_urls')
            .select('*')
            .eq('active', true);

        if (error || !webhooks || webhooks.length === 0) return;

        const fullPayload = {
            event_type: eventType,
            timestamp: new Date().toISOString(),
            ...payload
        };

        console.log(`[WEBHOOK] Firing ${eventType} to ${webhooks.length} endpoint(s)`, fullPayload);

        for (const wh of webhooks) {
            // Check if this webhook subscribes to this event type
            if (wh.events && wh.events.length > 0 && !wh.events.includes(eventType)) continue;

            try {
                const response = await fetch(wh.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-webhook-secret': wh.secret || WEBHOOK_SECRET
                    },
                    body: JSON.stringify(fullPayload)
                });

                // Log outbound event
                await supabase.from('webhook_events').insert({
                    event_type: eventType,
                    payload: fullPayload,
                    source: wh.url,
                    direction: 'outbound',
                    status: response.ok ? 'sent' : `failed_${response.status}`
                });

                console.log(`[WEBHOOK] → ${wh.label || wh.url}: ${response.status}`);
            } catch (fetchErr) {
                console.error(`[WEBHOOK] Failed to reach ${wh.url}:`, fetchErr.message);
                await supabase.from('webhook_events').insert({
                    event_type: eventType,
                    payload: fullPayload,
                    source: wh.url,
                    direction: 'outbound',
                    status: 'error'
                });
            }
        }
    } catch (err) {
        console.error('[WEBHOOK] sendWebhook error:', err.message);
    }
}

// Helper: fire webhook for task events — includes FULL component_data
async function fireTaskWebhook(eventType, item, webinar) {
    const taskLink = `http://localhost:${process.env.PORT || 3000}/ops.html`;

    sendWebhook(eventType, {
        workflow_name: webinar?.title || 'Unknown',
        workflow_id: webinar?.id || null,
        task_name: item.text || item.name || 'Untitled',
        task_id: item.id,
        assigned_to: item.component_data?.assignee_email || '',
        due_date: item.component_data?.due_date || '',
        completed: item.completed || false,
        components: item.component_data?.components || [],
        full_component_data: item.component_data || {},
        task_link: taskLink
    });
}

// Helper: get webinar from checklist item
async function getWebinarForItem(item) {
    try {
        const { data: cl } = await supabase.from('checklists').select('webinar_id, name').eq('id', item.checklist_id).single();
        if (!cl) return { webinar: null, checklistName: '' };
        const { data: w } = await supabase.from('webinars').select('*').eq('id', cl.webinar_id).single();
        return { webinar: w, checklistName: cl.name };
    } catch { return { webinar: null, checklistName: '' }; }
}

// Helper: get webinar from checklist
async function getWebinarForChecklist(checklistId) {
    try {
        const { data: cl } = await supabase.from('checklists').select('webinar_id').eq('id', checklistId).single();
        if (!cl) return null;
        const { data: w } = await supabase.from('webinars').select('*').eq('id', cl.webinar_id).single();
        return w;
    } catch { return null; }
}

// ============================================
// WEBHOOK RECEIVER (Incoming from external tools)
// ============================================

app.post('/api/webhook/workflow-event', async (req, res) => {
    // Validate secret
    const secret = req.headers['x-webhook-secret'];
    if (secret !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Unauthorized. Invalid x-webhook-secret.' });
    }

    // Validate payload
    const payload = req.body;
    if (!payload || !payload.event_type) {
        return res.status(400).json({ error: 'Invalid payload. "event_type" is required.' });
    }

    console.log('[WEBHOOK RECEIVED]', payload);

    // Store in database
    try {
        await supabase.from('webhook_events').insert({
            event_type: payload.event_type,
            payload: payload,
            source: req.headers['user-agent'] || 'external',
            direction: 'inbound',
            status: 'received'
        });
    } catch (err) {
        console.error('[WEBHOOK] DB store error:', err.message);
    }

    res.json({ status: 'received' });
});

// ============================================
// WEBHOOK URL MANAGEMENT (CRUD)
// ============================================

app.get('/api/webhooks', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('webhook_urls')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json({ webhooks: data || [] });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

app.post('/api/webhooks', async (req, res) => {
    const { url, label, secret, events } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required.' });

    try {
        const { data, error } = await supabase
            .from('webhook_urls')
            .insert({
                url,
                label: label || '',
                secret: secret || WEBHOOK_SECRET,
                events: events || [],
                active: true,
                created_by: req.user?.id || null
            })
            .select()
            .single();
        if (error) return res.status(500).json({ error: error.message });
        res.json({ webhook: data });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

app.patch('/api/webhooks/:id', async (req, res) => {
    const updates = {};
    if (req.body.url !== undefined) updates.url = req.body.url;
    if (req.body.label !== undefined) updates.label = req.body.label;
    if (req.body.secret !== undefined) updates.secret = req.body.secret;
    if (req.body.events !== undefined) updates.events = req.body.events;
    if (req.body.active !== undefined) updates.active = req.body.active;

    try {
        const { data, error } = await supabase
            .from('webhook_urls')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) return res.status(500).json({ error: error.message });
        res.json({ webhook: data });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

app.delete('/api/webhooks/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('webhook_urls').delete().eq('id', req.params.id);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

// GET recent webhook events (for the log UI)
app.get('/api/webhook-events', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('webhook_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ events: data || [] });
    } catch (err) {
        res.status(500).json({ error: 'Failed.' });
    }
});

// ============================================
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
