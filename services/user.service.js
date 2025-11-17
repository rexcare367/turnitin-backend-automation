import { getSupabaseClient } from './supabase.service.js'

/**
 * Get user by ID
 */
export const getUserById = async (userId) => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) {
            console.error('✗ Error fetching user:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('✗ Error in getUserById:', error);
        return null;
    }
}

/**
 * Get user by telegram ID
 */
export const getUserByTelegramId = async (telegramId) => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', telegramId)
            .single();
        
        if (error) {
            console.error('✗ Error fetching user by telegram ID:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('✗ Error in getUserByTelegramId:', error);
        return null;
    }
}

/**
 * Create or update user
 */
export const upsertUser = async (userData) => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('users')
            .upsert({
                telegram_id: userData.telegram_id,
                username: userData.username || null,
                first_name: userData.first_name || null,
                last_name: userData.last_name || null,
                language_code: userData.language_code || null,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'telegram_id'
            })
            .select();
        
        if (error) {
            console.error('✗ Error upserting user:', error);
            return null;
        }
        
        return data[0];
    } catch (error) {
        console.error('✗ Error in upsertUser:', error);
        return null;
    }
}

