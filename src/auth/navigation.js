/**
 * Navigation Module
 * Handles portal navigation to vehicle tagging section
 */

import { logger } from '../config.js';
import { SELECTORS } from '../utils/selectors.js';

/**
 * Clicks an element via JavaScript — bypasses viewport and iframe scroll constraints.
 * Falls back to Playwright click if the JS click doesn't navigate (some elements need real events).
 */
async function jsClick(locator, label) {
    try {
        await locator.waitFor({ state: 'attached', timeout: 15000 });
        await locator.evaluate(el => el.click());
        logger.debug(`${label}: JS click dispatched`);
    } catch (e) {
        logger.warning(`${label}: JS click failed (${e.message}), falling back to force click`);
        await locator.click({ force: true, timeout: 15000 });
    }
}

/**
 * Navigates to Transporter login screen
 */
export async function navigateToTransporter(page) {
    try {
        logger.step('Navigating to Transporter');
        await dismissDowntimePopup(page);
        logger.debug('Clicking Transporter menu');
        await jsClick(page.locator(SELECTORS.NAVIGATION.TRANSPORTER).first(), 'Transporter');
        logger.success('Transporter navigation complete. Ready to login');
    } catch (error) {
        logger.exception(error, { function: 'navigateToTransporter' });
        throw error;
    }
}

/**
 * Closes the i3MS downtime notification popup if it appears after login.
 */
async function dismissDowntimePopup(page) {
    try {
        const popup = page.locator('#popup1');
        const isVisible = await popup.isVisible({ timeout: 5000 }).catch(() => false);
        if (!isVisible) return;
        logger.info('Downtime notification popup detected — closing it');
        await jsClick(page.locator('#Img1'), 'Downtime popup close');
        await popup.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
        logger.success('Downtime notification popup closed');
    } catch (error) {
        logger.warning('Could not close downtime popup, continuing anyway', { error: error.message });
    }
}

/**
 * Navigates through the portal to the vehicle tagging section (ePass)
 */
export async function navigateToEpass(page) {
    try {
        logger.debug('Clicking e-Pass menu');
        await jsClick(page.locator(SELECTORS.NAVIGATION.EPASS_MENU).first(), 'ePass menu');

        logger.debug('Clicking Request For Vehicle');
        await jsClick(page.locator(SELECTORS.NAVIGATION.REQUEST_FOR_VEHICLE).first(), 'Request For Vehicle');

        logger.debug('Clicking New Request');
        await jsClick(page.locator(SELECTORS.NAVIGATION.NEW_REQUEST).first(), 'New Request');

        // Check for no records found
        const noRecordsFound = page.locator(SELECTORS.NAVIGATION.NO_RECORDS_FOUND);
        if (await noRecordsFound.isVisible({ timeout: 5000 }).catch(() => false)) {
            logger.warning('No records found message visible — continuing anyway');
        }

        logger.debug('Clicking View Request Status');
        await jsClick(page.locator(SELECTORS.NAVIGATION.VIEW_REQUEST_STATUS).first(), 'View Request Status');

        logger.debug('Clicking Tag More Vehicle');
        await page.waitForSelector(SELECTORS.NAVIGATION.TAG_MORE_VEHICLE, { state: 'attached', timeout: 15000 });
        const tagLinks = page.locator(SELECTORS.NAVIGATION.TAG_MORE_VEHICLE);
        const count = await tagLinks.count();
        logger.debug(`Found ${count} Tag More Vechile link(s)`);

        const idx = count >= 4 ? 3 : count - 1;
        await jsClick(tagLinks.nth(idx), `Tag More Vechile [${idx}]`);

        logger.success('Navigation complete. Ready to process vehicles');
    } catch (error) {
        logger.exception(error, { function: 'navigateToEpass' });
        throw error;
    }
}
