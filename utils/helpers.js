/**
 * Sleep utility
 */
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Clears an input field properly
 */
export const clearField = async (page, selector) => {
    await page.click(selector, { clickCount: 3 }); // Triple-click to select all
    await page.keyboard.press('Backspace');
    await sleep(500);
}

