import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabasePublishableKey } from './supabaseConfig.ts';

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
