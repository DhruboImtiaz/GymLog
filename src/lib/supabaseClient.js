import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'example-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
