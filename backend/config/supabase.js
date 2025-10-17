import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Regular client with ANON_KEY (respects RLS)
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Internal client with SERVICE_ROLE_KEY (bypasses RLS)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // Add SUPABASE_SERVICE_ROLE_KEY to your .env
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);



console.log('✅ Supabase clients initialized');