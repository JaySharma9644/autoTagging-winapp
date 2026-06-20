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
    const cdpPort = process.env.PLAYWRIGHT_CDP_PORT;

    if (cdpPort) {
        logger.step('Connecting to embedded browser via CDP');

        let browser;
        for (let attempt = 1; attempt <= 10; attempt++) {
            try {
                browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
                break;
            } catch (e) {
                if (attempt === 10) throw e;
                await new Promise(r => setTimeout(r, 500));
            }
        }

        const context = browser.contexts()[0];
        if (!context) throw new Error('No browser context found in CDP connection');

        logger.success('Connected to embedded browser');
        return { browser, context };
    }

    // Standalone mode (fallback)
    logger.step('Launching standalone browser');
    const headless = process.env.PLAYWRIGHT_HEADLESS === 'true';
    const browser = await chromium.launch({ headless });
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
