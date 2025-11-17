import { createClient } from '@supabase/supabase-js'
import { config } from '../config/index.js'

let supabaseClient = null;

/**
 * Get or create Supabase client instance
 */
export const getSupabaseClient = () => {
    if (!supabaseClient) {
        supabaseClient = createClient(config.supabase.url, config.supabase.key);
    }
    return supabaseClient;
}

