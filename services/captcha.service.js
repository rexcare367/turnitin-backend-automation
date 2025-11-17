import { Solver } from '@2captcha/captcha-solver'
import { config } from '../config/index.js'

let solver = null;

/**
 * Get or create solver instance
 */
const getSolver = () => {
    if (!solver) {
        solver = new Solver(config.captchaApiKey);
    }
    return solver;
}

/**
 * Solve Cloudflare Turnstile captcha
 */
export const solveTurnstileCaptcha = async (params) => {
    try {
        const captchaSolver = getSolver();
        console.log('🔐 Solving turnstile captcha...');
        const result = await captchaSolver.cloudflareTurnstile(params);
        console.log(`✓ Captcha solved! (ID: ${result.id})`);
        return result;
    } catch (error) {
        console.error('✗ Error solving captcha:', error);
        throw error;
    }
}

