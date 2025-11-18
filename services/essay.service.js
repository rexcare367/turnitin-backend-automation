import { getSupabaseClient } from './supabase.service.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { config } from '../config/index.js'
import { sleep } from '../utils/helpers.js'

/**
 * Poll for a queued essay in Supabase
 * Checks every 10 seconds until an essay is found
 */
export const pollForQueuedEssay = async () => {
    let pollCount = 0;
    
    while (true) {
        try {
            pollCount++;
            const timestamp = new Date().toLocaleTimeString();
            console.log(`\n[${timestamp}] 📊 Polling database (attempt #${pollCount})...`);
            
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('essay_uploads')
                .select('*')
                .eq('status', 'queued')
                .order('created_at', { ascending: true })
                .limit(1)
                .single();
            
            if (error) {
                if (error.code === 'PGRST116') {
                    // No rows found
                    console.log(`   ⏳ No queued essays found. Next check in 10 seconds...`);
                    await sleep(config.pollingInterval);
                    continue;
                } else {
                    console.error('   ✗ Error querying Supabase:', error);
                    await sleep(config.pollingInterval);
                    continue;
                }
            }
            
            if (data) {
                console.log(`   ✓ Essay found after ${pollCount} poll(s)!`);
                console.log(`   📄 File: ${data.file_name}`);
                console.log(`   🆔 Essay ID: ${data.id}`);
                console.log(`   ⏸️  POLLING STOPPED - Now processing this essay\n`);
                return data;
            }
        } catch (error) {
            console.error('   ✗ Error in pollForQueuedEssay:', error);
            await sleep(config.pollingInterval);
        }
    }
}

/**
 * Download file from Supabase storage
 */
export const downloadFileFromSupabase = async (essay) => {
    try {
        console.log('\n📥 Downloading file from Supabase storage...');
        
        const fileUrl = `${config.supabase.url}/storage/v1/object/public/essays/${essay.file_path}`;
        console.log('File URL:', fileUrl);
        
        // Fetch the file
        const response = await fetch(fileUrl);
        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Create temp directory if it doesn't exist
        if (!existsSync(config.tempDir)) {
            mkdirSync(config.tempDir, { recursive: true });
        }
        
        // Save file locally
        const localFilePath = join(config.tempDir, essay.file_name);
        writeFileSync(localFilePath, buffer);
        
        console.log('✓ File downloaded successfully to:', localFilePath);
        return localFilePath;
    } catch (error) {
        console.error('✗ Error downloading file:', error);
        throw error;
    }
}

/**
 * Update essay status in Supabase
 */
export const updateEssayStatus = async (essayId, status, additionalData = {}) => {
    try {
        console.log(`\n📝 Updating essay ${essayId} status to: ${status}`);
        
        const supabase = getSupabaseClient();
        const updateData = {
            status,
            updated_at: new Date().toISOString(),
            ...additionalData
        };
        
        const { data, error } = await supabase
            .from('essay_uploads')
            .update(updateData)
            .eq('id', essayId)
            .select();
        
        if (error) {
            console.error('✗ Error updating essay status:', error);
            return false;
        }
        
        console.log('✓ Essay status updated successfully');
        return true;
    } catch (error) {
        console.error('✗ Error in updateEssayStatus:', error);
        return false;
    }
}

/**
 * Get essay by ID with user information
 */
export const getEssayWithUser = async (essayId) => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('essay_uploads')
            .select(`
                *,
                users!essay_uploads_user_id_fkey (
                    id,
                    telegram_id,
                    username,
                    first_name,
                    last_name
                )
            `)
            .eq('id', essayId)
            .single();
        
        if (error) {
            console.error('✗ Error fetching essay with user:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('✗ Error in getEssayWithUser:', error);
        return null;
    }
}

/**
 * Get essay by submission_id with user information
 */
export const getEssayBySubmissionId = async (submissionId) => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('essay_uploads')
            .select(`
                *,
                users!essay_uploads_user_id_fkey (
                    id,
                    telegram_id,
                    username,
                    first_name,
                    last_name
                )
            `)
            .eq('submission_id', submissionId)
            .single();
        
        if (error) {
            console.error('✗ Error fetching essay by submission_id:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('✗ Error in getEssayBySubmissionId:', error);
        return null;
    }
}

