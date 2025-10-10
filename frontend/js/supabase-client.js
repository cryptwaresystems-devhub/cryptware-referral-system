import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from './config.js';

// Initialize Supabase client
export const supabase = createClient(
    CONFIG.SUPABASE.URL,
    CONFIG.SUPABASE.ANON_KEY
);

// Auth state change listener
supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event, session);
    
    if (event === 'SIGNED_IN') {
        console.log('User signed in:', session.user.email);
        // Redirect based on user type
        const userType = session.user.user_metadata?.user_type;
        if (userType === 'partner') {
            window.location.href = 'partner-dashboard.html';
        } else if (userType === 'internal') {
            window.location.href = 'internal-dashboard.html';
        }
    } else if (event === 'SIGNED_OUT') {
        console.log('User signed out');
        window.location.href = 'login.html';
    }
});

export default supabase;