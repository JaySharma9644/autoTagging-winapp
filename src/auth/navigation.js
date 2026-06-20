/**
 * Navigation Module
 * Handles portal navigation to vehicle tagging section
 */

import { logger } from '../config.js';
import { SELECTORS } from '../utils/selectors.js';

/**
 * Navigates to Transporter login screen
 */
export async function navigateToTransporter(page) {
    try {
        logger.step('Navigating to Transporter');
        logger.debug('Clicking Transporter menu');
        await page.locator(SELECTORS.NAVIGATION.TRANSPORTER).click();
        
        logger.success('Transporter navigation complete. Ready to login');
    } catch (error) {
        logger.exception(error, { function: 'navigateToTransporter' });
        throw error;
    }
}

/**
 * Navigates through the portal to the vehicle tagging section (ePass)
 */
export async function navigateToEpass(page) {
    try {
        logger.debug('Clicking e-Pass menu');
        await page.locator(SELECTORS.NAVIGATION.EPASS_MENU).click();
        
        logger.debug('Clicking Request For Vehicle');
        await page.locator(SELECTORS.NAVIGATION.REQUEST_FOR_VEHICLE).click();

        logger.debug('Clicking New Request');
        await page.locator(SELECTORS.NAVIGATION.NEW_REQUEST).click();
       
        // Check for no records found and wait if needed
        const noRecordsFound = page.locator(SELECTORS.NAVIGATION.NO_RECORDS_FOUND);
        if (await noRecordsFound.isVisible({ timeout: 5000 }).catch(() => false)) {
            logger.warning('No records found. Waiting for 30 seconds before retrying.');
            //await page.waitForTimeout(30000);
        }

        logger.debug('Clicking View Request Status');
        await page.locator(SELECTORS.NAVIGATION.VIEW_REQUEST_STATUS).click();

        logger.debug('Clicking Tag More Vehicle');
        const tagMoreVehicle = page.locator(SELECTORS.NAVIGATION.TAG_MORE_VEHICLE).nth(3);
        await tagMoreVehicle.click();
       
        logger.success('Navigation complete. Ready to process vehicles');
    } catch (error) {
        logger.exception(error, { function: 'navigateToEpass' });
        throw error;
    }
}
