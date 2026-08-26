import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ziclplqhbrpvcqjjqoau.supabase.co';
const supabaseAnonKey = 'sb_publishable_Z_oxGnRyOjYnJhEpHOtUEQ_efQpNo5a';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
