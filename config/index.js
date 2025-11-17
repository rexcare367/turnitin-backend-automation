import 'dotenv/config'

export const config = {
    // Captcha API
    captchaApiKey: process.env.APIKEY,
    
    // Supabase
    supabase: {
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_KEY
    },
    
    // Turnitin credentials
    turnitin: {
        email: process.env.TURNITIN_EMAIL,
        password: process.env.TURNITIN_PASSWORD
    },
    
    // Telegram Bot
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN
    },
    
    // Application settings
    maxAuthAttempts: 3,
    pollingInterval: 10000, // 10 seconds
    maxUploadWait: 60000, // 60 seconds
    maxProcessingWait: 300000, // 5 minutes
    
    // Directories
    tempDir: './temp'
}

