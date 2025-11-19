import { launch } from 'puppeteer'
import { readFileSync } from 'fs'
import { normalizeUserAgent } from '../normalize-ua.js'
import { sleep, clearField } from '../utils/helpers.js'
import { config } from '../config/index.js'
import { updateEssayStatus, getEssayWithUser } from './essay.service.js'
import { upsertAnalyticResults, downloadAndUploadReports } from './analytic.service.js'
import { sendCompletionNotification, sendFailureNotification, sendProcessingNotification } from './telegram.service.js'
import { solveTurnstileCaptcha } from './captcha.service.js'

// Store the access token and its validation response
let accessToken = null;
let tokenValidationResponse = null;
let uploadResponse = null;
let submissionId = null;
let latestStatusResponse = null;

// Store current essay being processed
let currentEssay = null;
let currentLocalFilePath = null;

// Track the current stage of the process
let currentStage = 'INITIAL_CHALLENGE'; // INITIAL_CHALLENGE -> LOGIN_FORM -> DASHBOARD -> UPLOAD_MODAL
let authAttemptCount = 0;
let captchaSolvedForCurrentStage = false;

/**
 * Initialize browser with proper configuration
 */
export const initBrowser = async () => {
    const initialUserAgent = await normalizeUserAgent();

    const browser = await launch({
        headless: false,
        devtools: true,
        args: [
            `--user-agent=${initialUserAgent}`,
            '--window-size=1920,1080',
            '--start-maximized',
        ]
    });

    const [page] = await browser.pages();

    // Set viewport to full size to ensure main window is full
    await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1
    });

    const preloadFile = readFileSync('./inject.js', 'utf8');
    await page.evaluateOnNewDocument(preloadFile);

    return { browser, page };
}

/**
 * Setup request/response interceptors
 */
export const setupInterceptors = (page) => {
    // Enable request interception
    page.setRequestInterception(true);
    
    // Intercept requests
    page.on('request', (request) => {
        request.continue();
    });
    
    // Intercept responses to catch validate-token, upload, and status APIs
    page.on('response', async (response) => {
        const url = response.url();
        
        // Check if this is the validate-token API call
        if (url.includes('production.turnitindetect.org/validate-token')) {
            console.log('\n🔍 Intercepted validate-token API call');
            
            try {
                const request = response.request();
                const headers = request.headers();
                const token = headers['x-access-token'];
                
                if (token) {
                    accessToken = token;
                    console.log('✓ Access token captured:', accessToken);
                }
                
                if (response.status() === 200) {
                    const responseData = await response.json();
                    tokenValidationResponse = responseData;
                    console.log('✓ Token validation response captured:', tokenValidationResponse);
                } else {
                    console.log('⚠ Token validation API returned status:', response.status());
                }
            } catch (error) {
                console.error('✗ Error capturing validate-token data:', error.message);
            }
        }
        
        // Check if this is the upload API call
        if (url.includes('production.turnitindetect.org/upload') && response.request().method() === 'POST') {
            console.log('\n🔍 Intercepted upload API call');
            
            try {
                if (response.status() === 200) {
                    const responseData = await response.json();
                    uploadResponse = responseData;
                    submissionId = responseData.submission_id;
                    console.log('✓ Upload API response:');
                    console.log(JSON.stringify(responseData, null, 2));
                    console.log(`✓ Submission ID: ${submissionId}`);
                    await updateEssayStatus(currentEssay.id, 'uploaded', {
                        submission_id: submissionId,
                        note: 'Upload submitted successfully'
                    });
                } else {
                    console.log('⚠ Upload API returned status:', response.status());
                }
            } catch (error) {
                console.error('✗ Error capturing upload data:', error.message);
            }
        }
        
        // Check if this is the status API call
        if (url.includes('production.turnitindetect.org/status/') && response.request().method() === 'GET') {
            try {
                if (response.status() === 200) {
                    const responseData = await response.json();
                    latestStatusResponse = responseData;
                    
                    console.log('\n🔍 Status API response:');
                    console.log(JSON.stringify(responseData, null, 2));

                    // Store the analytic results in Supabase
                    if (submissionId) {
                        await upsertAnalyticResults(responseData);
                    } else {
                        console.log('⚠ Cannot store analytic results: submissionId is missing');
                    }
                    
                    if (responseData.status === 'completed') {
                        console.log('\n✓✓✓ FILE PROCESSING COMPLETED! ✓✓✓');
                        
                        // Download and upload reports to Supabase
                        // Note: Report URLs will be included in completion notification
                        // when sent from completeFileUpload function
                        try {
                            await downloadAndUploadReports(responseData.id);
                        } catch (error) {
                            console.error('✗ Error downloading/uploading reports:', error.message);
                        }
                    } else if (responseData.is_processing) {
                        console.log('⏳ File is still processing...');
                    }
                } else {
                    console.log('⚠ Status API returned status:', response.status());
                }
            } catch (error) {
                console.error('✗ Error capturing status data:', error.message);
            }
        }
    });
}

/**
 * Fills login form and submits (only after captcha is resolved)
 */
export const handleLoginProcess = async (page) => {
    try {
        console.log('Filling in login credentials...');
        
        // Clear and fill email
        await page.waitForSelector('#email', { timeout: 10000 });
        await clearField(page, '#email');
        await page.type('#email', config.turnitin.email, { delay: 50 });
        console.log('✓ Email filled');
        
        // Clear and fill password
        await page.waitForSelector('#password', { timeout: 10000 });
        await clearField(page, '#password');
        await page.type('#password', config.turnitin.password, { delay: 50 });
        console.log('✓ Password filled');
        
        // Submit the form
        console.log('Submitting login form...');
        await page.click('button[type="submit"]');
        
        // Wait a bit for response
        await sleep(3000);
        
        // Check if active-session-confirm modal appears
        console.log('Checking for active session modal...');
        const modalExists = await page.evaluate(() => {
            const modal = document.querySelector('.fixed.inset-0.bg-black\\/50.backdrop-blur-sm');
            if (modal) {
                const heading = modal.querySelector('h2');
                return heading && heading.textContent.includes('Active Session Found');
            }
            return false;
        });
        
        if (modalExists) {
            console.log('⚠ Active session modal detected. Clicking Continue button...');
            
            const continueClicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const continueBtn = buttons.find(btn => 
                    btn.textContent.trim() === 'Continue' &&
                    btn.classList.contains('bg-blue-600')
                );
                if (continueBtn) {
                    continueBtn.click();
                    return true;
                }
                return false;
            });
            
            if (continueClicked) {
                console.log('✓ Continue button clicked on active session modal');
                await sleep(3000);
            } else {
                console.log('✗ Continue button not found on modal');
            }
        } else {
            console.log('✓ No active session modal detected');
        }
        
        // Wait additional time for navigation to complete
        await sleep(5000);
        
        // Check if we're on the dashboard
        const currentUrl = page.url();
        console.log('Current URL after login:', currentUrl);
        
        if (currentUrl.includes('/dashboard')) {
            console.log('✓ Login successful! Navigated to dashboard.');
            return true;
        } else {
            console.log('✗ Login failed. Not on dashboard page.');
            return false;
        }
    } catch (error) {
        console.log('✗ Login attempt failed:', error.message);
        return false;
    }
}

/**
 * Handles the upload process on dashboard
 */
export const handleUploadProcess = async (page, essay, localFilePath) => {
    try {
        console.log('\n📤 Starting upload process for essay:', essay.file_name);
        
        // Update status to processing and send notification
        await updateEssayStatus(essay.id, 'processing');
        
        // Get essay with user info and send Telegram notification
        const essayWithUser = await getEssayWithUser(essay.id);
        if (essayWithUser?.users?.telegram_id) {
            await sendProcessingNotification(essayWithUser.users.telegram_id, essayWithUser);
        }
        
        console.log('Looking for upload button on dashboard...');
        await page.waitForSelector('.tutorial-upload-button', { 
            timeout: 30000,
            visible: true 
        });
        console.log('✓ Found upload button, clicking...');
        
        // Use evaluate to click the element directly to avoid detachment issues
        await page.evaluate(() => {
            const button = document.querySelector('.tutorial-upload-button');
            if (button) {
                button.click();
            }
        });
        
        // Wait for the upload modal to appear
        console.log('Waiting for upload modal to appear...');
        await sleep(3000);
        
        // Change stage to upload modal
        currentStage = 'UPLOAD_MODAL';
        captchaSolvedForCurrentStage = false;
        console.log('Stage changed to: UPLOAD_MODAL');
        
        // Wait for the modal's turnstile captcha to be detected and solved
        console.log('Waiting for modal turnstile to be detected and solved...');
        await sleep(5000);
        
    } catch (error) {
        console.log('✗ Error in upload process:', error.message);
        await updateEssayStatus(essay.id, 'failed', { 
            note: error.message 
        });
        
        // Send failure notification
        const essayWithUser = await getEssayWithUser(essay.id);
        if (essayWithUser?.users?.telegram_id) {
            await sendFailureNotification(essayWithUser.users.telegram_id, essayWithUser, error.message);
        }
    }
}

/**
 * Completes the file upload in the modal (only after captcha is resolved)
 */
export const completeFileUpload = async (page, essay, localFilePath) => {
    try {
        // Reset upload tracking variables
        uploadResponse = null;
        submissionId = null;
        latestStatusResponse = null;
        
        console.log('\n📁 Uploading file:', essay.file_name);
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
            await fileInput.uploadFile(localFilePath);
            console.log('✓ File selected for upload');
            await sleep(2000);
        } else {
            console.log('✗ File input not found!');
            await updateEssayStatus(essay.id, 'failed', { 
                note: 'File input not found on page' 
            });
            
            // Send failure notification
            const essayWithUser = await getEssayWithUser(essay.id);
            if (essayWithUser?.users?.telegram_id) {
                await sendFailureNotification(essayWithUser.users.telegram_id, essayWithUser, 'File input not found on page');
            }
            return false;
        }
        
        // Click the upload button in the modal
        console.log('Looking for modal upload button...');
        const uploadButtonClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const uploadBtn = buttons.find(btn => {
                const hasGradient = btn.classList.contains('from-blue-600') && 
                                   btn.classList.contains('to-purple-600');
                const hasUploadText = btn.textContent.trim().includes('Upload');
                const hasSvg = btn.querySelector('svg') !== null;
                const hasShadow = btn.classList.contains('shadow-lg');
                
                return hasGradient && hasUploadText && hasSvg && hasShadow;
            });
            if (uploadBtn) {
                console.log('Found upload button:', uploadBtn.className);
                uploadBtn.click();
                return true;
            }
            return false;
        });
        
        if (uploadButtonClicked) {
            console.log('✓ Modal upload button clicked!');
            console.log('⏳ Waiting for file upload to complete...');
            
            // Wait for upload API response
            let uploadWaitTime = 0;
            while (!uploadResponse && uploadWaitTime < config.maxUploadWait) {
                await sleep(1000);
                uploadWaitTime += 1000;
            }
            
            if (!uploadResponse) {
                console.log('✗ Upload API response timeout!');
                await updateEssayStatus(essay.id, 'failed', { 
                    note: 'Upload API response timeout' 
                });
                
                // Send failure notification
                const essayWithUser = await getEssayWithUser(essay.id);
                if (essayWithUser?.users?.telegram_id) {
                    await sendFailureNotification(essayWithUser.users.telegram_id, essayWithUser, 'Upload API response timeout');
                }
                return false;
            }
            
            console.log('✓ Upload submitted successfully!');
            console.log('⏳ Waiting for file processing to complete...');
            
            // Update status to uploading
            await updateEssayStatus(essay.id, 'uploading');
            
            // Wait for processing to complete
            let processingWaitTime = 0;
            while (processingWaitTime < config.maxProcessingWait) {
                await sleep(2000);
                processingWaitTime += 2000;
                
                // Check if status is completed
                if (latestStatusResponse && latestStatusResponse.status === 'completed') {
                    console.log('\n✓✓✓ FILE FULLY PROCESSED AND READY! ✓✓✓');
                    
                    // Download and upload reports to Supabase
                    let reportUrls = { similarity_report_url: null, ai_report_url: null };
                    try {
                        reportUrls = await downloadAndUploadReports(latestStatusResponse.id);
                    } catch (error) {
                        console.error('✗ Error downloading/uploading reports:', error.message);
                    }
                    
                    // Update status to completed
                    await updateEssayStatus(essay.id, 'completed');
                    
                    // Send completion notification with analytic results and report URLs
                    const essayWithUser = await getEssayWithUser(essay.id);
                    if (essayWithUser?.users?.telegram_id) {
                        await sendCompletionNotification(
                            essayWithUser.users.telegram_id, 
                            essayWithUser, 
                            latestStatusResponse,
                            reportUrls
                        );
                    }
                    
                    return true;
                }
            }
            
            console.log('⚠ Processing timeout - file may still be processing');
            await updateEssayStatus(essay.id, 'uploaded', {
                submission_id: submissionId,
                note: 'Upload succeeded but processing status timeout'
            });
            return true;
            
        } else {
            console.log('✗ Modal upload button not found!');
            await updateEssayStatus(essay.id, 'failed', { 
                note: 'Modal upload button not found' 
            });
            
            // Send failure notification
            const essayWithUser = await getEssayWithUser(essay.id);
            if (essayWithUser?.users?.telegram_id) {
                await sendFailureNotification(essayWithUser.users.telegram_id, essayWithUser, 'Modal upload button not found');
            }
            return false;
        }
    } catch (error) {
        console.log('✗ Error completing file upload:', error.message);
        await updateEssayStatus(essay.id, 'failed', { 
            note: 'Error completing file upload: ' + error.message 
        });
        
        // Send failure notification
        const essayWithUser = await getEssayWithUser(essay.id);
        if (essayWithUser?.users?.telegram_id) {
            await sendFailureNotification(essayWithUser.users.telegram_id, essayWithUser, error.message);
        }
        return false;
    }
}

/**
 * Navigate back to dashboard after processing an essay
 */
export const navigateToDashboard = async (page) => {
    try {
        console.log('\n🏠 Navigating back to dashboard...');
        
        // Check if already on dashboard
        const currentUrl = page.url();
        if (currentUrl.includes('/dashboard')) {
            console.log('✓ Already on dashboard');
            return true;
        }
        
        // Navigate to dashboard
        await page.goto('https://turndetect.com/dashboard', { waitUntil: 'networkidle0' });
        await sleep(2000);
        
        console.log('✓ Back on dashboard, ready for next essay');
        return true;
    } catch (error) {
        console.error('✗ Error navigating to dashboard:', error.message);
        return false;
    }
}

/**
 * Setup captcha console listener
 */
export const setupCaptchaListener = (page, browser, onEssayReceived) => {
    page.on('console', async (msg) => {
        const txt = msg.text();
        if (txt.includes('intercepted-params:')) {
            const params = JSON.parse(txt.replace('intercepted-params:', ''));
            console.log(`\n[${currentStage}] Captcha detected, intercepted params:`, params);

            try {
                // Solve the captcha
                console.log(`[${currentStage}] Solving the captcha...`);
                const res = await solveTurnstileCaptcha(params);
                
                // Inject the captcha token
                await page.evaluate((token) => {
                    cfCallback(token);
                }, res.data);
                console.log(`[${currentStage}] ✓ Captcha token injected`);
                
                // Mark captcha as solved for current stage
                captchaSolvedForCurrentStage = true;
                
                // Wait a bit for the page to process the token
                await sleep(2000);
                
                // Handle different stages
                if (currentStage === 'INITIAL_CHALLENGE') {
                    console.log('[INITIAL_CHALLENGE] ✓ Challenge page resolved, waiting for login form...');
                    
                    // Wait for the email field to appear (with longer timeout)
                    try {
                        console.log('[INITIAL_CHALLENGE] Waiting for email field to appear...');
                        await page.waitForSelector('#email', { timeout: 15000 });
                        console.log('[INITIAL_CHALLENGE] ✓ Email field found!');
                        
                        // Also wait for password field
                        await page.waitForSelector('#password', { timeout: 5000 });
                        console.log('[INITIAL_CHALLENGE] ✓ Password field found!');
                        
                        currentStage = 'LOGIN_FORM';
                        captchaSolvedForCurrentStage = false;
                        
                        // Check if there's a turnstile captcha on the login form
                        const hasTurnstile = await page.evaluate(() => {
                            return document.querySelector('#cf-turnstile') !== null;
                        });
                        
                        if (hasTurnstile) {
                            console.log('[INITIAL_CHALLENGE] ✓ Login form has turnstile captcha, waiting for it to be detected...');
                            
                            // Set a 10-second timeout to proceed with login if captcha doesn't appear/solve
                            const captchaTimeout = setTimeout(async () => {
                                if (currentStage === 'LOGIN_FORM' && !captchaSolvedForCurrentStage) {
                                    console.log('[LOGIN_FORM] ⏱ Captcha timeout (10s) - proceeding with login anyway...');
                                    authAttemptCount++;
                                    console.log(`\n=== Login Attempt ${authAttemptCount}/${config.maxAuthAttempts} ===`);
                                    const loginSuccess = await handleLoginProcess(page);
                                    
                                    if (loginSuccess) {
                                        console.log('✓✓✓ Authentication completed successfully! ✓✓✓\n');
                                        currentStage = 'DASHBOARD';
                                        captchaSolvedForCurrentStage = false;
                                        await onEssayReceived();
                                    } else {
                                        console.log('✗ Login failed');
                                        if (authAttemptCount < config.maxAuthAttempts) {
                                            console.log(`⟳ Retrying... (${config.maxAuthAttempts - authAttemptCount} attempts remaining)`);
                                            captchaSolvedForCurrentStage = false;
                                            await page.goto('https://turndetect.com/login');
                                        } else {
                                            console.log(`✗✗✗ Maximum login attempts (${config.maxAuthAttempts}) reached ✗✗✗`);
                                            await browser.close();
                                            process.exit(1);
                                        }
                                    }
                                }
                            }, 10000);
                            
                            // Store the timeout so it can be cleared if captcha is solved
                            page._loginCaptchaTimeout = captchaTimeout;
                        } else {
                            console.log('[INITIAL_CHALLENGE] ⚠ No turnstile detected on login form, proceeding with login...');
                            // If no captcha, try to login directly
                            authAttemptCount++;
                            console.log(`\n=== Login Attempt ${authAttemptCount}/${config.maxAuthAttempts} ===`);
                            const loginSuccess = await handleLoginProcess(page);
                            
                            if (loginSuccess) {
                                console.log('✓✓✓ Authentication completed successfully! ✓✓✓\n');
                                currentStage = 'DASHBOARD';
                                captchaSolvedForCurrentStage = false;
                                await onEssayReceived();
                            } else {
                                console.log('✗ Login failed');
                                if (authAttemptCount < config.maxAuthAttempts) {
                                    console.log(`⟳ Retrying... (${config.maxAuthAttempts - authAttemptCount} attempts remaining)`);
                                    captchaSolvedForCurrentStage = false;
                                    await page.goto('https://turndetect.com/login');
                                } else {
                                    console.log(`✗✗✗ Maximum login attempts (${config.maxAuthAttempts}) reached ✗✗✗`);
                                    await browser.close();
                                    process.exit(1);
                                }
                            }
                        }
                    } catch (waitError) {
                        console.log('[INITIAL_CHALLENGE] ✗ Login form fields not found after challenge resolution');
                        console.log('[INITIAL_CHALLENGE] Error:', waitError.message);
                        console.log('[INITIAL_CHALLENGE] Current URL:', page.url());
                        console.log('[INITIAL_CHALLENGE] Reloading page...');
                        await page.goto('https://turndetect.com/login');
                        currentStage = 'INITIAL_CHALLENGE';
                        captchaSolvedForCurrentStage = false;
                    }
                    
                } else if (currentStage === 'LOGIN_FORM') {
                    console.log('[LOGIN_FORM] ✓ Login form turnstile resolved!');
                    
                    // Clear the captcha timeout since captcha was solved
                    if (page._loginCaptchaTimeout) {
                        clearTimeout(page._loginCaptchaTimeout);
                        page._loginCaptchaTimeout = null;
                        console.log('[LOGIN_FORM] ✓ Captcha timeout cleared');
                    }
                    
                    authAttemptCount++;
                    console.log(`\n=== Login Attempt ${authAttemptCount}/${config.maxAuthAttempts} ===`);
                    
                    const loginSuccess = await handleLoginProcess(page);
                    
                    if (loginSuccess) {
                        console.log('✓✓✓ Authentication completed successfully! ✓✓✓\n');
                        currentStage = 'DASHBOARD';
                        captchaSolvedForCurrentStage = false;
                        
                        // Notify caller that we're ready to receive essay
                        await onEssayReceived();
                        
                    } else {
                        console.log('✗ Login failed');
                        if (authAttemptCount < config.maxAuthAttempts) {
                            console.log(`⟳ Retrying... (${config.maxAuthAttempts - authAttemptCount} attempts remaining)`);
                            captchaSolvedForCurrentStage = false;
                            await page.goto('https://turndetect.com/login');
                        } else {
                            console.log(`✗✗✗ Maximum login attempts (${config.maxAuthAttempts}) reached ✗✗✗`);
                            await browser.close();
                            process.exit(1);
                        }
                    }
                    
                } else if (currentStage === 'UPLOAD_MODAL') {
                    console.log('[UPLOAD_MODAL] ✓ Upload modal turnstile resolved!');
                    
                    const uploadSuccess = await completeFileUpload(page, currentEssay, currentLocalFilePath);
                    
                    if (uploadSuccess) {
                        console.log('\n✓✓✓ ESSAY UPLOAD COMPLETED! ✓✓✓\n');
                        // Reset stage to DASHBOARD for next essay
                        currentStage = 'DASHBOARD';
                        captchaSolvedForCurrentStage = false;
                    } else {
                        console.log('✗ Upload process failed');
                        // Reset stage to DASHBOARD to try next essay
                        currentStage = 'DASHBOARD';
                        captchaSolvedForCurrentStage = false;
                    }
                }
                
            } catch (e) {
                console.error('✗ Error during captcha solving:', e);
                await browser.close();
                process.exit(1);
            }
        }
    });
}

/**
 * Set current essay being processed
 */
export const setCurrentEssay = (essay, localFilePath) => {
    currentEssay = essay;
    currentLocalFilePath = localFilePath;
}

/**
 * Get current essay
 */
export const getCurrentEssay = () => currentEssay;

/**
 * Get current local file path
 */
export const getCurrentLocalFilePath = () => currentLocalFilePath;

/**
 * Get access token
 */
export const getAccessToken = () => accessToken;

