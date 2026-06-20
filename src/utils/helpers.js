/**
 * Helpers Module
 * Utility functions used across the application
 */

import path from 'path';
import { logger } from '../config.js';

/**
 * Saves a full-page screenshot to history/ and returns its path
 */
export async function captureScreenshot(page, reason) {
    const screenshotPath = path.join('history', `${reason}_${logger.sessionId}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true })
        .catch(err => logger.warning('Screenshot failed', { error: err.message }));
    return screenshotPath;
}

/**
 * Gets the column letter from column number (e.g., 1='A', 27='AA')
 */
export function getColumnLetter(colNum) {
    let col = '';
    while (colNum > 0) {
        colNum--;
        col = String.fromCharCode(65 + (colNum % 26)) + col;
        colNum = Math.floor(colNum / 26);
    }
    return col;
}

/**
 * Returns the first visible { selector, locator } in a scope (page or frame)
 */
export async function firstVisible(scope, selectors) {
    for (const selector of selectors) {
        const locator = scope.locator(selector).first();
        if (await locator.count().catch(() => 0) === 0) continue;
        if (await locator.isVisible().catch(() => false)) return { selector, locator };
    }
    return null;
}

/**
 * Dumps every input/button across all frames + a screenshot for diagnostics
 */
export async function dumpFormDiagnostics(page, reason) {
    for (const frame of page.frames()) {
        const elements = await frame.evaluate(() => {
            const map = (el, i) => ({
                index: i, 
                tag: el.tagName, 
                type: el.type || '', 
                id: el.id, 
                name: el.name,
                placeholder: el.placeholder || '', 
                text: (el.innerText || el.value || '').slice(0, 40),
                visible: el.offsetParent !== null
            });
            return {
                inputs: Array.from(document.querySelectorAll('input')).map(map),
                buttons: Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')).map(map)
            };
        }).catch(err => ({ error: err.message }));
        logger.error(`Frame elements [${frame.url()}]`, { elements: JSON.stringify(elements, null, 2) });
    }
    return captureScreenshot(page, reason);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
