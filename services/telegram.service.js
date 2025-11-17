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
 * Format analytic results for Telegram message
 */
const formatAnalyticResults = (analyticData) => {
    if (!analyticData) {
        return 'No analytic results available yet.';
    }
    
    let message = '📊 *Analysis Results:*\n\n';
    
    // AI Detection
    if (analyticData.ai_match_percentage !== null) {
        message += `🤖 *AI Detection:* ${analyticData.ai_match_percentage}%\n`;
    }
    
    // Similarity/Plagiarism
    if (analyticData.overall_match_percentage !== null) {
        message += `📄 *Similarity:* ${analyticData.overall_match_percentage}%\n`;
    }
    
    // Document stats
    if (analyticData.word_count !== null) {
        message += `📝 *Word Count:* ${analyticData.word_count}\n`;
    }
    if (analyticData.page_count !== null) {
        message += `📑 *Page Count:* ${analyticData.page_count}\n`;
    }
    
    // Hidden text detection
    if (analyticData.hidden_text_instances_count > 0) {
        message += `⚠️ *Hidden Text:* ${analyticData.hidden_text_instances_count} instances\n`;
    }
    
    // Confusable characters
    if (analyticData.confusable_count_total > 0) {
        message += `⚠️ *Confusable Characters:* ${analyticData.confusable_count_total}\n`;
    }
    
    // Suspect words
    if (analyticData.suspect_words_count > 0) {
        message += `⚠️ *Suspect Words:* ${analyticData.suspect_words_count}\n`;
    }
    
    return message;
}

/**
 * Send completion notification to user
 */
export const sendCompletionNotification = async (telegramId, essayData, analyticData) => {
    try {
        const telegramBot = initBot();
        if (!telegramBot) {
            console.log('⚠️ Telegram bot not initialized (missing token). Skipping notification.');
            return false;
        }
        
        console.log(`\n📱 Sending completion notification to Telegram ID: ${telegramId}`);
        
        let message = `✅ *Document Analysis Complete!*\n\n`;
        message += `📄 *File:* ${essayData.file_name}\n`;
        message += `🆔 *Submission ID:* ${essayData.submission_id}\n\n`;
        
        // Add analytic results
        message += formatAnalyticResults(analyticData);
        
        await telegramBot.sendMessage(telegramId, message, { 
            parse_mode: 'Markdown' 
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
        
        let message = `❌ *Document Analysis Failed*\n\n`;
        message += `📄 *File:* ${essayData.file_name}\n`;
        message += `⚠️ *Error:* ${errorMessage || 'Unknown error occurred'}\n\n`;
        message += `Please try uploading your document again or contact support if the issue persists.`;
        
        await telegramBot.sendMessage(telegramId, message, { 
            parse_mode: 'Markdown' 
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
        
        let message = `⏳ *Document Processing Started*\n\n`;
        message += `📄 *File:* ${essayData.file_name}\n`;
        message += `\nYour document is being analyzed. You'll receive a notification when it's complete.`;
        
        await telegramBot.sendMessage(telegramId, message, { 
            parse_mode: 'Markdown' 
        });
        
        console.log('✓ Processing notification sent successfully');
        return true;
    } catch (error) {
        console.error('✗ Error sending processing notification:', error);
        return false;
    }
}

