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
 * Multi-language translations
 * Supported languages: en (English), zh (Chinese - includes zh-hans, zh-hant, zh-TW, zh-CN)
 */
const translations = {
    en: {
        completion: {
            title: '✅ <b>Document Analysis Complete!</b>',
            file: '📄 <b>File:</b>',
            submissionId: '🆔 <b>Submission ID:</b>',
            results: '📊 <b>Analysis Results:</b>',
            aiDetection: '🤖 <b>AI Detection:</b>',
            similarity: '📄 <b>Similarity:</b>',
            wordCount: '📝 <b>Word Count:</b>',
            pageCount: '📑 <b>Page Count:</b>',
            hiddenText: '⚠️ <b>Hidden Text:</b>',
            hiddenTextInstances: 'instances',
            confusableChars: '⚠️ <b>Confusable Characters:</b>',
            suspectWords: '⚠️ <b>Suspect Words:</b>',
            downloadReports: '📎 <b>Download Reports:</b>',
            similarityReport: '📄 Similarity Report',
            aiReport: '🤖 AI Detection Report',
            noResults: 'No analytic results available yet.',
            reportsGenerating: '⚠️ Reports are being generated and will be available shortly.'
        },
        failure: {
            title: '❌ <b>Document Analysis Failed</b>',
            file: '📄 <b>File:</b>',
            error: '⚠️ <b>Error:</b>',
            unknownError: 'Unknown error occurred',
            helpText: 'Please try uploading your document again or contact support if the issue persists.'
        },
        processing: {
            title: '⏳ <b>Document Processing Started</b>',
            file: '📄 <b>File:</b>',
            helpText: "Your document is being analyzed. You'll receive a notification when it's complete."
        }
    },
    zh: {
        completion: {
            title: '✅ <b>文件分析完成！</b>',
            file: '📄 <b>檔案：</b>',
            submissionId: '🆔 <b>提交編號：</b>',
            results: '📊 <b>分析結果：</b>',
            aiDetection: '🤖 <b>AI 檢測：</b>',
            similarity: '📄 <b>相似度：</b>',
            wordCount: '📝 <b>字數：</b>',
            pageCount: '📑 <b>頁數：</b>',
            hiddenText: '⚠️ <b>隱藏文字：</b>',
            hiddenTextInstances: '處',
            confusableChars: '⚠️ <b>易混淆字元：</b>',
            suspectWords: '⚠️ <b>可疑字詞：</b>',
            downloadReports: '📎 <b>下載報告：</b>',
            similarityReport: '📄 相似度報告',
            aiReport: '🤖 AI 檢測報告',
            noResults: '暫無分析結果。',
            reportsGenerating: '⚠️ 報告生成中，稍後即可查看。'
        },
        failure: {
            title: '❌ <b>文件分析失敗</b>',
            file: '📄 <b>檔案：</b>',
            error: '⚠️ <b>錯誤：</b>',
            unknownError: '發生未知錯誤',
            helpText: '請再次嘗試上傳您的文件，如問題持續，請聯繫客服。'
        },
        processing: {
            title: '⏳ <b>文件處理中</b>',
            file: '📄 <b>檔案：</b>',
            helpText: '您的文件正在分析中，完成後將會通知您。'
        }
    }
}

/**
 * Get translations for specified language (defaults to English)
 */
const getTranslations = (languageCode) => {
    // Normalize language code to lowercase
    const normalizedLang = languageCode?.toLowerCase();
    
    // Map language codes to translations
    if (normalizedLang === 'zh-hans' || normalizedLang?.startsWith('zh')) {
        return translations.zh;
    }
    
    // Default to English
    return translations.en;
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
const formatAnalyticResults = (analyticData, t) => {
    if (!analyticData) {
        return t.completion.noResults;
    }
    
    let message = `${t.completion.results}\n\n`;
    
    // AI Detection
    if (analyticData.ai_match_percentage !== null) {
        message += `${t.completion.aiDetection} ${escapeHtml(analyticData.ai_match_percentage)}%\n`;
    }
    
    // Similarity/Plagiarism
    if (analyticData.overall_match_percentage !== null) {
        message += `${t.completion.similarity} ${escapeHtml(analyticData.overall_match_percentage)}%\n`;
    }
    
    // Document stats
    if (analyticData.word_count !== null) {
        message += `${t.completion.wordCount} ${escapeHtml(analyticData.word_count)}\n`;
    }
    if (analyticData.page_count !== null) {
        message += `${t.completion.pageCount} ${escapeHtml(analyticData.page_count)}\n`;
    }
    
    // Hidden text detection
    if (analyticData.hidden_text_instances_count > 0) {
        message += `${t.completion.hiddenText} ${escapeHtml(analyticData.hidden_text_instances_count)} ${t.completion.hiddenTextInstances}\n`;
    }
    
    // Confusable characters
    if (analyticData.confusable_count_total > 0) {
        message += `${t.completion.confusableChars} ${escapeHtml(analyticData.confusable_count_total)}\n`;
    }
    
    // Suspect words
    if (analyticData.suspect_words_count > 0) {
        message += `${t.completion.suspectWords} ${escapeHtml(analyticData.suspect_words_count)}\n`;
    }
    
    return message;
}

/**
 * Format report URLs for Telegram message
 */
const formatReportUrls = (reportUrls, t) => {
    if (!reportUrls) {
        return '';
    }
    
    let message = `\n${t.completion.downloadReports}\n\n`;
    let hasReports = false;
    
    if (reportUrls.similarity_report_url) {
        message += `<a href="${reportUrls.similarity_report_url}">${t.completion.similarityReport}</a>\n`;
        hasReports = true;
    }
    
    if (reportUrls.ai_report_url) {
        message += `<a href="${reportUrls.ai_report_url}">${t.completion.aiReport}</a>\n`;
        hasReports = true;
    }
    
    if (!hasReports) {
        return `\n${t.completion.reportsGenerating}`;
    }
    
    return message;
}

/**
 * Send completion notification to user
 * @param {string} telegramId - Telegram user ID
 * @param {object} essayData - Essay data with user information
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
        
        // Get user's language preference
        const languageCode = essayData.users?.language_code || 'en';
        const t = getTranslations(languageCode);
        
        console.log(`\n📱 Sending completion notification to Telegram ID: ${telegramId} (Language: ${languageCode})`);
        
        let message = `${t.completion.title}\n\n`;
        message += `${t.completion.file} ${escapeHtml(essayData.file_name)}\n`;
        message += `${t.completion.submissionId} ${escapeHtml(essayData.submission_id)}\n\n`;
        
        // Add analytic results
        message += formatAnalyticResults(analyticData, t);
        
        // Add report URLs if available
        if (reportUrls) {
            message += formatReportUrls(reportUrls, t);
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
        
        // Get user's language preference
        const languageCode = essayData.users?.language_code || 'en';
        const t = getTranslations(languageCode);
        
        console.log(`\n📱 Sending failure notification to Telegram ID: ${telegramId} (Language: ${languageCode})`);
        
        let message = `${t.failure.title}\n\n`;
        message += `${t.failure.file} ${escapeHtml(essayData.file_name)}\n`;
        message += `${t.failure.error} ${escapeHtml(errorMessage || t.failure.unknownError)}\n\n`;
        message += t.failure.helpText;
        
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
        
        // Get user's language preference
        const languageCode = essayData.users?.language_code || 'en';
        const t = getTranslations(languageCode);
        
        console.log(`\n📱 Sending processing notification to Telegram ID: ${telegramId} (Language: ${languageCode})`);
        
        let message = `${t.processing.title}\n\n`;
        message += `${t.processing.file} ${escapeHtml(essayData.file_name)}\n`;
        message += `\n${t.processing.helpText}`;
        
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

