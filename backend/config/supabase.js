
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Validate environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase environment variables');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Present' : 'Missing');
  throw new Error('Supabase configuration required');
}

// Create and export Supabase client with ANON_KEY for auth operations
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY // Use ANON_KEY instead of SERVICE_ROLE_KEY
);

console.log('✅ Supabase client initialized successfully with ANON_KEY');