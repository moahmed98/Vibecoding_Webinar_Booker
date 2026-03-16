// ============================================
// Setup webhook tables in Supabase
// Run once: node setup-webhook-tables.js
// ============================================
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function setup() {
    console.log('Creating webhook_events table...');
    const { error: e1 } = await supabase.rpc('exec_sql', {
        sql: `
        CREATE TABLE IF NOT EXISTS webhook_events (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            event_type TEXT NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}',
            source TEXT DEFAULT 'internal',
            direction TEXT DEFAULT 'outbound',
            status TEXT DEFAULT 'sent',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        `
    });
    if (e1) {
        console.log('webhook_events may need manual creation. Error:', e1.message);
        console.log('\nRun this SQL in Supabase SQL Editor:\n');
        console.log(`
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    source TEXT DEFAULT 'internal',
    direction TEXT DEFAULT 'outbound',
    status TEXT DEFAULT 'sent',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_urls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    url TEXT NOT NULL,
    label TEXT DEFAULT '',
    secret TEXT DEFAULT '',
    events TEXT[] DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS for webhook tables (internal use only)
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_urls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for webhook_events" ON webhook_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for webhook_urls" ON webhook_urls FOR ALL USING (true) WITH CHECK (true);
        `);
    } else {
        console.log('✅ webhook_events created');
    }

    console.log('\nCreating webhook_urls table...');
    const { error: e2 } = await supabase.rpc('exec_sql', {
        sql: `
        CREATE TABLE IF NOT EXISTS webhook_urls (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            url TEXT NOT NULL,
            label TEXT DEFAULT '',
            secret TEXT DEFAULT '',
            events TEXT[] DEFAULT '{}',
            active BOOLEAN DEFAULT true,
            created_by UUID,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        `
    });
    if (e2) {
        console.log('webhook_urls may need manual creation (see SQL above).');
    } else {
        console.log('✅ webhook_urls created');
    }

    console.log('\nDone! If tables failed to create automatically, copy the SQL above into Supabase SQL Editor.');
}

setup();
