import TelegramBot from 'node-telegram-bot-api'
import { config } from '../config/index.js'

let bot = null;

/**
 * Initialize Telegram bot (only if token is provided)
 */
const initBot = () => {
    if (!bot && config.telegram.botToken) {
        bot = new TelegramBot(config.telegram.botToken);
    }
    return bot;
}

/**
 * Escape HTML entities for Telegram HTML parse mode
 */
const escapeHtml = (text) => {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Format analytic results for Telegram message
 */
const formatAnalyticResults = (analyticData) => {
    if (!analyticData) {
        return 'No analytic results available yet.';
    }
    
    let message = '📊 <b>Analysis Results:</b>\n\n';
    
    // AI Detection
    if (analyticData.ai_match_percentage !== null) {
        message += `🤖 <b>AI Detection:</b> ${escapeHtml(analyticData.ai_match_percentage)}%\n`;
    }
    
    // Similarity/Plagiarism
    if (analyticData.overall_match_percentage !== null) {
        message += `📄 <b>Similarity:</b> ${escapeHtml(analyticData.overall_match_percentage)}%\n`;
    }
    
    // Document stats
    if (analyticData.word_count !== null) {
        message += `📝 <b>Word Count:</b> ${escapeHtml(analyticData.word_count)}\n`;
    }
    if (analyticData.page_count !== null) {
        message += `📑 <b>Page Count:</b> ${escapeHtml(analyticData.page_count)}\n`;
    }
    
    // Hidden text detection
    if (analyticData.hidden_text_instances_count > 0) {
        message += `⚠️ <b>Hidden Text:</b> ${escapeHtml(analyticData.hidden_text_instances_count)} instances\n`;
    }
    
    // Confusable characters
    if (analyticData.confusable_count_total > 0) {
        message += `⚠️ <b>Confusable Characters:</b> ${escapeHtml(analyticData.confusable_count_total)}\n`;
    }
    
    // Suspect words
    if (analyticData.suspect_words_count > 0) {
        message += `⚠️ <b>Suspect Words:</b> ${escapeHtml(analyticData.suspect_words_count)}\n`;
    }
    
    return message;
}

/**
 * Format report URLs for Telegram message
 */
const formatReportUrls = (reportUrls) => {
    if (!reportUrls) {
        return '';
    }
    
    let message = '\n📎 <b>Download Reports:</b>\n\n';
    let hasReports = false;
    
    if (reportUrls.similarity_report_url) {
        message += `📄 <a href="${reportUrls.similarity_report_url}">Similarity Report</a>\n`;
        hasReports = true;
    }
    
    if (reportUrls.ai_report_url) {
        message += `🤖 <a href="${reportUrls.ai_report_url}">AI Detection Report</a>\n`;
        hasReports = true;
    }
    
    if (!hasReports) {
        return '\n⚠️ Reports are being generated and will be available shortly.';
    }
    
    return message;
}

/**
 * Send completion notification to user
 * @param {string} telegramId - Telegram user ID
 * @param {object} essayData - Essay data
 * @param {object} analyticData - Analytic results data
 * @param {object} reportUrls - Report URLs object with similarity_report_url and ai_report_url
 */
export const sendCompletionNotification = async (telegramId, essayData, analyticData, reportUrls = null) => {
    try {
        const telegramBot = initBot();
        if (!telegramBot) {
            console.log('⚠️ Telegram bot not initialized (missing token). Skipping notification.');
            return false;
        }
        
        console.log(`\n📱 Sending completion notification to Telegram ID: ${telegramId}`);
        
        let message = `✅ <b>Document Analysis Complete!</b>\n\n`;
        message += `📄 <b>File:</b> ${escapeHtml(essayData.file_name)}\n`;
        message += `🆔 <b>Submission ID:</b> ${escapeHtml(essayData.submission_id)}\n\n`;
        
        // Add analytic results
        message += formatAnalyticResults(analyticData);
        
        // Add report URLs if available
        if (reportUrls) {
            message += formatReportUrls(reportUrls);
        }
        
        await telegramBot.sendMessage(telegramId, message, { 
            parse_mode: 'HTML',
            disable_web_page_preview: false
        });
        
        console.log('✓ Completion notification sent successfully');
        return true;
    } catch (error) {
        console.error('✗ Error sending completion notification:', error);
        return false;
    }
}

/**
 * Send failure notification to user
 */
export const sendFailureNotification = async (telegramId, essayData, errorMessage) => {
    try {
        const telegramBot = initBot();
        if (!telegramBot) {
            console.log('⚠️ Telegram bot not initialized (missing token). Skipping notification.');
            return false;
        }
        
        console.log(`\n📱 Sending failure notification to Telegram ID: ${telegramId}`);
        
        let message = `❌ <b>Document Analysis Failed</b>\n\n`;
        message += `📄 <b>File:</b> ${escapeHtml(essayData.file_name)}\n`;
        message += `⚠️ <b>Error:</b> ${escapeHtml(errorMessage || 'Unknown error occurred')}\n\n`;
        message += `Please try uploading your document again or contact support if the issue persists.`;
        
        await telegramBot.sendMessage(telegramId, message, { 
            parse_mode: 'HTML' 
        });
        
        console.log('✓ Failure notification sent successfully');
        return true;
    } catch (error) {
        console.error('✗ Error sending failure notification:', error);
        return false;
    }
}

/**
 * Send processing notification to user
 */
export const sendProcessingNotification = async (telegramId, essayData) => {
    try {
        const telegramBot = initBot();
        if (!telegramBot) {
            console.log('⚠️ Telegram bot not initialized (missing token). Skipping notification.');
            return false;
        }
        
        console.log(`\n📱 Sending processing notification to Telegram ID: ${telegramId}`);
        
        let message = `⏳ <b>Document Processing Started</b>\n\n`;
        message += `📄 <b>File:</b> ${escapeHtml(essayData.file_name)}\n`;
        message += `\nYour document is being analyzed. You'll receive a notification when it's complete.`;
        
        await telegramBot.sendMessage(telegramId, message, { 
            parse_mode: 'HTML' 
        });
        
        console.log('✓ Processing notification sent successfully');
        return true;
    } catch (error) {
        console.error('✗ Error sending processing notification:', error);
        return false;
    }
}

