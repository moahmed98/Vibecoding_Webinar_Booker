// ============================================
// Supabase Auth Helpers (shared across all pages)
// ============================================

const SUPABASE_URL = 'https://dnydjprlwbgukyqqlnon.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRueWRqcHJsd2JndWt5cXFsbm9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MTE2MTIsImV4cCI6MjA4NjI4NzYxMn0.D9w3ICyqfxt-oQDli6mZbOWIIjSFuuseVZON9wbbq5E';

// Initialize Supabase client
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Get current session
async function getSession() {
    const { data: { session } } = await sb.auth.getSession();
    return session;
}

// Get current user profile (with team role)
async function getProfile() {
    const session = await getSession();
    if (!session) return null;

    const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    if (error) {
        console.error('Profile error:', error);
        return null;
    }
    return data;
}

// Sign up
async function signUp(email, password, fullName, team) {
    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: fullName, team: team }
        }
    });
    return { data, error };
}

// Sign in
async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    return { data, error };
}

// Sign out
async function signOut() {
    await sb.auth.signOut();
    window.location.href = '/';
}

// Send password reset email
async function sendPasswordReset(email) {
    const { data, error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password.html'
    });
    return { data, error };
}

// Update password (called on the reset-password page)
async function updatePassword(newPassword) {
    const { data, error } = await sb.auth.updateUser({ password: newPassword });
    return { data, error };
}

// Auth guard — redirect to login if not authenticated
async function requireAuth() {
    const session = await getSession();
    if (!session) {
        window.location.href = '/';
        return null;
    }
    const profile = await getProfile();
    if (!profile) {
        window.location.href = '/';
        return null;
    }
    return profile;
}

// Role guard
async function requireRole(allowedRoles) {
    const profile = await requireAuth();
    if (!profile) return null;
    if (!allowedRoles.includes(profile.team)) {
        // Redirect to correct page
        if (profile.team === 'operations') {
            window.location.href = '/ops.html';
        } else {
            window.location.href = '/booking.html';
        }
        return null;
    }
    return profile;
}

// Redirect authenticated users to their dashboard
async function redirectIfLoggedIn() {
    const session = await getSession();
    if (session) {
        const profile = await getProfile();
        if (profile) {
            if (profile.team === 'operations') {
                window.location.href = '/ops.html';
            } else {
                window.location.href = '/booking.html';
            }
        }
    }
}

// Setup nav bar
function setupNav(profile) {
    const nameEl = document.getElementById('nav-name');
    const roleEl = document.getElementById('nav-role');
    const logoutBtn = document.getElementById('logout-btn');

    if (nameEl) nameEl.textContent = profile.full_name;
    if (roleEl) roleEl.textContent = profile.team;
    if (logoutBtn) logoutBtn.addEventListener('click', signOut);
}

// Toast notification
function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// API helper with auth token
async function apiCall(url, method = 'GET', body = null) {
    const session = await getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session) headers['Authorization'] = `Bearer ${session.access_token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    return res.json();
}
