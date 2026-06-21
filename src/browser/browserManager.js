/**
 * Browser Manager Module
 * Handles browser initialization — either CDP-connected (embedded) or standalone.
 */

import { chromium } from 'playwright';
import { logger } from '../config.js';

/**
 * Initializes the browser.
 * If PLAYWRIGHT_CDP_PORT is set, connects to Electron's embedded Chromium via CDP
 * and finds the WebContentsView page (identified by title "AUTOMATION_VIEW").
 * Otherwise launches a standalone headed browser.
 *
 * Returns { browser, context, existingPage }
 * existingPage is non-null in CDP mode — callers should use it directly instead of createPage().
 */
export async function initializeBrowser() {
    logger.step('Launching headless browser');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    logger.success('Browser launched successfully');
    return { browser, context };
}

/**
 * Closes/disconnects the browser.
 * In CDP mode this just disconnects — it does NOT close Electron.
 */
export async function closeBrowser(browser) {
    try {
        if (browser) {
            logger.step('Closing browser connection');
            await browser.close();
            logger.success('Browser connection closed');
        }
    } catch (error) {
        logger.exception(error, { function: 'closeBrowser' });
    }
}

/**
 * Creates a new page in the given context.
 * Only used in standalone mode.
 */
export async function createPage(context) {
    return await context.newPage();
}

/**
 * Closes a page.
 * Only used in standalone mode — never close the shared embedded page.
 */
export async function closePage(page, label = 'Page') {
    try {
        if (page) {
            await page.close();
            logger.debug(`${label}: Page closed`);
        }
    } catch (error) {
        logger.warning(`${label}: Error closing page`, { error: error.message });
    }
}
