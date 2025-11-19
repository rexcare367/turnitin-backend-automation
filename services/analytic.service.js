import { getSupabaseClient } from './supabase.service.js'
import { config } from '../config/index.js'
import { getAccessToken } from './browser.service.js'
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getEssayBySubmissionId } from './essay.service.js'
import { sendFailureNotification } from './telegram.service.js'

/**
 * Upsert analytic results to Supabase
 */
export const upsertAnalyticResults = async (statusResponse) => {
    try {
        console.log(`\n💾 Storing analytic results for submission: ${statusResponse.id}`);
        
        const supabase = getSupabaseClient();
        
        // First, check if record exists to increment fetch_attempts_count
        const { data: existingData, error: fetchError } = await supabase
            .from('analytic_results')
            .select('fetch_attempts_count, id')
            .eq('id', statusResponse.id)
            .maybeSingle();
        
        const currentFetchAttempts = existingData?.fetch_attempts_count || 0;
        
        // Map the status response to database columns
        const analyticData = {
            id: statusResponse.id,
            // Core status fields
            status: statusResponse.status || null,
            is_processing: statusResponse.is_processing || false,
            source: statusResponse.source || false,
            
            // Similarity report fields
            similarity_report_url: statusResponse.similarity_report_url || null,
            similarity_report_status: statusResponse.similarity_report_status || null,
            similarity_report_error: statusResponse.similarity_report_error || null,
            overall_match_percentage: statusResponse.overall_match_percentage || null,
            
            // Authorship fields
            authorship_report_url: statusResponse.authorship_report_url || null,
            authorship_flags_status: statusResponse.authorship_flags_status || null,
            authorship_flags_error: statusResponse.authorship_flags_error || null,
            authorship_flags_json: statusResponse.authorship_flags || null,
            authorship_flags_started_at: statusResponse.authorship_flags_started_at || null,
            authorship_flags_completed_at: statusResponse.authorship_flags_completed_at || null,
            
            // AI detection fields
            ai_report_url: statusResponse.ai_report_url || null,
            ai_report_status: statusResponse.ai_report_status || null,
            ai_report_error: statusResponse.ai_report_error || null,
            ai_match_percentage: statusResponse.ai_match_percentage || null,
            air_match_percentage: statusResponse.air_match_percentage || null,
            ai_highlights_available: statusResponse.ai_highlights_available || false,
            ai_segments_status: statusResponse.ai_segments_status || null,
            ai_segments_fetched_at: statusResponse.ai_segments_fetched_at || null,
            
            // Document statistics
            word_count: statusResponse.word_count || null,
            page_count: statusResponse.page_count || null,
            
            // Hidden text detection
            hidden_text_instances_count: statusResponse.hidden_text_instances_count || null,
            hidden_text_character_total: statusResponse.hidden_text_character_total || null,
            hidden_text_page_total: statusResponse.hidden_text_page_total || null,
            
            // Confusable characters
            confusable_count_total: statusResponse.confusable_count_total || null,
            confusable_page_total: statusResponse.confusable_page_total || null,
            
            // Suspect words
            suspect_words_count: statusResponse.suspect_words_count || null,
            
            // Metadata
            is_old_view: statusResponse.is_old_view || null,
            fetch_attempts_count: currentFetchAttempts + 1, // Increment on each fetch
            updated_at: new Date().toISOString()
        };
        
        // If updating existing record, include the ID
        if (existingData?.id) {
            analyticData.id = existingData.id;
        }
        
        // Upsert the data (using source as the conflict target)
        const { data, error } = await supabase
            .from('analytic_results')
            .upsert(analyticData, { 
                onConflict: 'id',
                ignoreDuplicates: false 
            })
            .select();
        
        if (error) {
            console.error('✗ Error storing analytic results:', error);
            return false;
        }
        
        console.log('✓ Analytic results stored successfully');
        console.log(`  - Fetch attempts: ${currentFetchAttempts + 1}`);
        console.log(`  - Status: ${statusResponse.status}`);
        console.log(`  - Processing: ${statusResponse.is_processing}`);
        
        // Check if analysis failed and send notification to user
        if (statusResponse.status === 'failed') {
            console.log('\n⚠️ Analysis failed - sending notification to user...');
            try {
                const essayWithUser = await getEssayBySubmissionId(statusResponse.id);
                if (essayWithUser?.users?.telegram_id) {
                    // Get error message from status response
                    const errorMessage = statusResponse.similarity_report_error || 
                                       statusResponse.ai_report_error || 
                                       statusResponse.authorship_flags_error || 
                                       'Analysis processing failed';
                    
                    await sendFailureNotification(
                        essayWithUser.users.telegram_id, 
                        essayWithUser, 
                        errorMessage
                    );
                    console.log('✓ Failure notification sent to user');
                } else {
                    console.log('⚠️ Could not send failure notification: essay or user not found');
                }
            } catch (error) {
                console.error('✗ Error sending failure notification:', error);
            }
        }
        
        return true;
    } catch (error) {
        console.error('✗ Error in upsertAnalyticResults:', error);
        return false;
    }
}

/**
 * Check if there is any file currently being processed
 * @returns {Promise<boolean>} True if there's a processing file, false otherwise
 */
export const hasProcessingFile = async () => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('essay_uplaods')
            .select('id, status')
            .eq('status', 'processing')
            .limit(1)
            .maybeSingle();
        
        if (error) {
            console.error('✗ Error checking for processing files:', error);
            return false; // On error, assume no processing file to allow polling
        }
        
        // If data exists, there's a processing file
        // maybeSingle() returns null when no rows found, which is fine
        return !!data;
    } catch (error) {
        console.error('✗ Error in hasProcessingFile:', error);
        return false; // On error, assume no processing file to allow polling
    }
}

/**
 * Get analytic results by submission ID
 */
export const getAnalyticResults = async (submissionId) => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('analytic_results')
            .select('*')
            .eq('id', submissionId)
            .single();
        
        if (error) {
            console.error('✗ Error fetching analytic results:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('✗ Error in getAnalyticResults:', error);
        return null;
    }
}

/**
 * Download and upload similarity and AI reports to Supabase storage
 * @param {string} submissionId - The submission UUID
 * @returns {Promise<{similarity_report_url: string|null, ai_report_url: string|null}>}
 */
export const downloadAndUploadReports = async (submissionId) => {
    try {
        console.log(`\n📥 Downloading reports for submission: ${submissionId}`);
        
        const accessToken = getAccessToken();
        if (!accessToken) {
            console.error('✗ Access token not available');
            return { similarity_report_url: null, ai_report_url: null };
        }
        
        const supabase = getSupabaseClient();
        const baseUrl = 'https://production.turnitindetect.org';
        
        // Create temp directory if it doesn't exist
        if (!existsSync(config.tempDir)) {
            mkdirSync(config.tempDir, { recursive: true });
        }
        
        let similarityReportUrl = null;
        let aiReportUrl = null;
        
        // 1. Call similarity check API
        try {
            console.log('📊 Fetching similarity report download URL...');
            const similarityResponse = await fetch(
                `${baseUrl}/download/${submissionId}/integrity-pdf`,
                {
                    headers: {
                        'x-access-token': accessToken
                    }
                }
            );
            
            if (!similarityResponse.ok) {
                throw new Error(`Similarity API returned ${similarityResponse.status}`);
            }
            
            const similarityData = await similarityResponse.json();
            console.log('✓ Similarity report download URL received');
            
            if (similarityData.download_url) {
                // Download the file
                console.log('⬇️ Downloading similarity report...');
                const fileResponse = await fetch(similarityData.download_url);
                if (!fileResponse.ok) {
                    throw new Error(`Failed to download similarity report: ${fileResponse.statusText}`);
                }
                
                const arrayBuffer = await fileResponse.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                // Determine file extension from filename or default to pdf
                const filename = similarityData.filename || 'similarity.pdf';
                const fileExt = filename.split('.').pop() || 'pdf';
                const contentType = fileExt === 'pdf' ? 'application/pdf' : 'application/octet-stream';
                
                // Save temporarily
                const tempFileName = `${submissionId}_similarity.${fileExt}`;
                const tempFilePath = join(config.tempDir, tempFileName);
                writeFileSync(tempFilePath, buffer);
                console.log('✓ Similarity report downloaded');
                
                // Upload to Supabase storage
                const storagePath = `reports/${submissionId}/similarity.${fileExt}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('essays')
                    .upload(storagePath, buffer, {
                        contentType: contentType,
                        upsert: true
                    });
                
                if (uploadError) {
                    console.error('✗ Error uploading similarity report to Supabase:', uploadError);
                } else {
                    // Get public URL
                    const { data: urlData } = supabase.storage
                        .from('essays')
                        .getPublicUrl(storagePath);
                    
                    similarityReportUrl = urlData.publicUrl;
                    console.log('✓ Similarity report uploaded to Supabase:', similarityReportUrl);
                }
                
                // Clean up temp file
                try {
                    unlinkSync(tempFilePath);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        } catch (error) {
            console.error('✗ Error processing similarity report:', error.message);
        }
        
        // 2. Call AI match check API
        try {
            console.log('🤖 Fetching AI report download URL...');
            const aiResponse = await fetch(
                `${baseUrl}/download/${submissionId}/aiw`,
                {
                    headers: {
                        'x-access-token': accessToken
                    }
                }
            );
            
            if (!aiResponse.ok) {
                throw new Error(`AI API returned ${aiResponse.status}`);
            }
            
            const aiData = await aiResponse.json();
            console.log('✓ AI report download URL received');
            
            if (aiData.download_url) {
                // Download the file
                console.log('⬇️ Downloading AI report...');
                const fileResponse = await fetch(aiData.download_url);
                if (!fileResponse.ok) {
                    throw new Error(`Failed to download AI report: ${fileResponse.statusText}`);
                }
                
                const arrayBuffer = await fileResponse.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                // Determine file extension from filename or default to pdf
                const filename = aiData.filename || 'ai.pdf';
                const fileExt = filename.split('.').pop() || 'pdf';
                const contentType = fileExt === 'pdf' ? 'application/pdf' : 'application/octet-stream';
                
                // Save temporarily
                const tempFileName = `${submissionId}_ai.${fileExt}`;
                const tempFilePath = join(config.tempDir, tempFileName);
                writeFileSync(tempFilePath, buffer);
                console.log('✓ AI report downloaded');
                
                // Upload to Supabase storage
                const storagePath = `reports/${submissionId}/ai.${fileExt}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('essays')
                    .upload(storagePath, buffer, {
                        contentType: contentType,
                        upsert: true
                    });
                
                if (uploadError) {
                    console.error('✗ Error uploading AI report to Supabase:', uploadError);
                } else {
                    // Get public URL
                    const { data: urlData } = supabase.storage
                        .from('essays')
                        .getPublicUrl(storagePath);
                    
                    aiReportUrl = urlData.publicUrl;
                    console.log('✓ AI report uploaded to Supabase:', aiReportUrl);
                }
                
                // Clean up temp file
                try {
                    unlinkSync(tempFilePath);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        } catch (error) {
            console.error('✗ Error processing AI report:', error.message);
        }
        
        // 3. Update analytic_results table with the URLs
        if (similarityReportUrl || aiReportUrl) {
            const updateData = {};
            if (similarityReportUrl) {
                updateData.similarity_report_url = similarityReportUrl;
            }
            if (aiReportUrl) {
                updateData.ai_report_url = aiReportUrl;
            }
            
            const { error: updateError } = await supabase
                .from('analytic_results')
                .update(updateData)
                .eq('id', submissionId);
            
            if (updateError) {
                console.error('✗ Error updating analytic_results with report URLs:', updateError);
            } else {
                console.log('✓ Analytic results updated with report URLs');
            }
        }
        
        return {
            similarity_report_url: similarityReportUrl,
            ai_report_url: aiReportUrl
        };
        
    } catch (error) {
        console.error('✗ Error in downloadAndUploadReports:', error);
        return { similarity_report_url: null, ai_report_url: null };
    }
}

