import 'dotenv/config'
import { pollForQueuedEssay, downloadFileFromSupabase } from './services/essay.service.js'
import { 
    initBrowser, 
    setupInterceptors, 
    setupCaptchaListener, 
    handleUploadProcess,
    setCurrentEssay,
    navigateToDashboard
} from './services/browser.service.js'

/**
 * Continuous essay processing loop
 * Polls database only when ready for next essay (not while processing)
 */
const startContinuousProcessing = async (page) => {
    console.log('\n🔄 Starting continuous essay processing loop...');
    console.log('📊 Will poll database every 10 seconds when ready for new essays\n');
    
    let isProcessing = false;
    
    // Infinite loop to continuously process essays
    while (true) {
        try {
            // === POLLING PHASE ===
            // Only poll when NOT processing
            isProcessing = false;
            console.log('🔍 [IDLE] Ready for next essay. Starting database polling...\n');
            
            // Poll for queued essay from Supabase (waits until one is found)
            const currentEssay = await pollForQueuedEssay();
            
            // === PROCESSING PHASE ===
            // Stop polling once essay is found
            isProcessing = true;
            console.log('⏸️  [BUSY] Essay found. Stopping database polling during processing.\n');
            
            // Download the file from Supabase
            console.log('📥 [PROCESSING] Downloading essay file...');
            const currentLocalFilePath = await downloadFileFromSupabase(currentEssay);
            
            // Set current essay context
            setCurrentEssay(currentEssay, currentLocalFilePath);
            
            // Process the essay (upload to Turnitin)
            console.log('🚀 [PROCESSING] Uploading to Turnitin...');
            await handleUploadProcess(page, currentEssay, currentLocalFilePath);
            
            // Navigate back to dashboard for next essay
            console.log('🏠 [PROCESSING] Returning to dashboard...');
            await navigateToDashboard(page);
            
            // After processing completes (success or failure), loop continues
            console.log('✓ [COMPLETE] Essay processing finished.\n');
            console.log('═══════════════════════════════════════════════════════\n');
            
        } catch (error) {
            console.error('✗ Error in processing loop:', error);
            console.log('⟳ Resetting to polling mode...\n');
            isProcessing = false;
            // Continue the loop even if there's an error
        }
    }
}

const main = async () => {
    console.log('\n=== Starting Turnitin Automation Service ===\n');
    
    // Initialize browser
    const { browser, page } = await initBrowser();
    
    // Setup request/response interceptors
    await setupInterceptors(page);
    
    // Setup captcha listener with callback for when ready to process essays
    setupCaptchaListener(page, browser, async () => {
        // This callback is called after successful login
        console.log('\n✓✓✓ Authentication completed! ✓✓✓');
        console.log('🎯 Now entering continuous processing mode...\n');
        
        // Start the continuous processing loop
        await startContinuousProcessing(page);
    });
    
    // Start the process by navigating to login page
    console.log('=== Starting Process ===');
    console.log('Stage: INITIAL_CHALLENGE');
    await page.goto('https://turndetect.com/login');
}

main().catch(error => {
    console.error('✗ Fatal error in main process:', error);
    process.exit(1);
});
