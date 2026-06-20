/**
 * Vehicle Processor Module
 * Handles individual vehicle tagging logic
 */

import { logger } from '../config.js';
import { SELECTORS } from '../utils/selectors.js';
import { solveCaptcha } from '../captcha/captchaSolver.js';

/**
 * Processes a single vehicle on the Tag More Vehicle search page.
 * Assumes the page is already on the vehicle search form.
 * - If already tagged: clicks Reset, returns status='skipped'
 * - If not tagged: fills form, solves captcha, submits, clicks OK, returns status='success'
 * - On error: navigates back to recover, returns status='failed'
 */
export async function processVehicle(page, vehicleData, groupLabel) {
    try {
        logger.step(`${groupLabel}: Processing Vehicle ${vehicleData.vehicle}`, { row: vehicleData.row });

        const v = vehicleData.vehicle;
        if (v === 'Success' || v.startsWith('Skipped') || v.startsWith('Failed')) {
            logger.debug(`${groupLabel}: Cell contains status value, skipping`);
            return { status: 'skipped', row: vehicleData.row, column: vehicleData.column };
        }

        // Fill vehicle number and search
        const searchInput = page.locator(SELECTORS.VEHICLE_PROCESSING.SEARCH_INPUT);
        await searchInput.click();
        await searchInput.fill(vehicleData.vehicle);
        logger.debug(`${groupLabel}: Filled vehicle number: ${vehicleData.vehicle}`);

        await page.locator(SELECTORS.VEHICLE_PROCESSING.SEARCH_BUTTON).click();
        logger.debug(`${groupLabel}: Clicked search button`);

        await page.waitForLoadState('networkidle');
        logger.debug(`${groupLabel}: Page loaded after search`);

        // Check if already tagged
        const alreadyTaggedLocator = page.locator(SELECTORS.VEHICLE_PROCESSING.ALREADY_TAGGED);
        const isTagged = await alreadyTaggedLocator.isVisible({ timeout: 3000 }).catch(() => false);

        if (isTagged) {
            logger.warning(`${groupLabel}: Vehicle ${vehicleData.vehicle} is already tagged — clicking Reset`);
            await page.locator(SELECTORS.VEHICLE_PROCESSING.RESET_BUTTON).click();
            await page.waitForLoadState('networkidle');
            logger.debug(`${groupLabel}: Reset clicked, ready for next vehicle`);
            logger.logVehicleResult(vehicleData.vehicle, 'Skipped - Already Tagged', { row: vehicleData.row });
            return { status: 'skipped', row: vehicleData.row, column: vehicleData.column };
        }

        logger.debug(`${groupLabel}: Vehicle not tagged, proceeding to VTS/GPS form`);

        // Wait for the tagging form to appear
        await page.waitForSelector(SELECTORS.TAGCONTROLS.VTS, { state: 'visible' });
        logger.debug(`${groupLabel}: VTS/GPS form visible`);

        // Verify all required form elements are present
        const gpsYes       = page.locator(SELECTORS.TAGCONTROLS.GPSFITTEDYES);
        const gpsNo        = page.locator(SELECTORS.TAGCONTROLS.GPSFITTEDNO);
        const vtsYes       = page.locator(SELECTORS.TAGCONTROLS.VTSACTIVEYES);
        const vtsNo        = page.locator(SELECTORS.TAGCONTROLS.VTSACTIVENO);
        const simValidYes  = page.locator(SELECTORS.TAGCONTROLS.SIMVALIDYES);
        const simValidNo   = page.locator(SELECTORS.TAGCONTROLS.SIMVALIDNO);
        const ackCheckbox  = page.locator(SELECTORS.TAGCONTROLS.ACK);
        const captchaImage = page.locator(SELECTORS.TAGCONTROLS.CAPTCHAIMAGE);
        const captchaInput = page.locator(SELECTORS.TAGCONTROLS.CAPTCHAINPUT);

        const [
            hasGpsYes, hasGpsNo, hasVtsYes, hasVtsNo,
            hasSimValidYes, hasSimValidNo, hasAck, hasCaptchaImg, hasCaptchaInput
        ] = await Promise.all([
            gpsYes.count(), gpsNo.count(),
            vtsYes.count(), vtsNo.count(),
            simValidYes.count(), simValidNo.count(),
            ackCheckbox.count(), captchaImage.count(), captchaInput.count(),
        ]);

        const allPresent = hasGpsYes && hasGpsNo && hasVtsYes && hasVtsNo &&
                           hasSimValidYes && hasSimValidNo && hasAck && hasCaptchaImg && hasCaptchaInput;

        if (!allPresent) {
            const missing = [
                !hasGpsYes       && 'rdo_GPS_0',
                !hasGpsNo        && 'rdo_GPS_1',
                !hasVtsYes       && 'Rdo_VTS_0',
                !hasVtsNo        && 'Rdo_VTS_1',
                !hasSimValidYes  && 'Rdo_SIM_0',
                !hasSimValidNo   && 'Rdo_SIM_1',
                !hasAck          && 'chkClick',
                !hasCaptchaImg   && 'imgCaptch',
                !hasCaptchaInput && 'txtcaptcha',
            ].filter(Boolean);
            throw new Error(`VTS form elements missing: ${missing.join(', ')}`);
        }
        logger.debug(`${groupLabel}: All VTS/GPS form elements verified`);

        // Set GPS Fitted = Yes
        await gpsYes.check();
        logger.debug(`${groupLabel}: GPS Fitted = Yes`);

        // Set VTS Active = Yes
        await vtsYes.check();
        logger.debug(`${groupLabel}: VTS Active = Yes`);

        // Set SIM Validity = Yes
        await simValidYes.check();
        logger.debug(`${groupLabel}: SIM Validity = Yes`);

        // Check the acknowledge checkbox
        await ackCheckbox.check();
        logger.debug(`${groupLabel}: Acknowledge checkbox checked`);

        // Solve and fill captcha
        const captchaAnswer = await solveCaptcha(page, captchaImage);
        logger.info(`${groupLabel}: Captcha solved`, { vehicle: vehicleData.vehicle, answer: captchaAnswer });
        await captchaInput.fill(captchaAnswer);
        logger.debug(`${groupLabel}: Captcha filled`);

        // Submit the form
        await page.locator(SELECTORS.TAGCONTROLS.SUBMIT_BUTTON).click();
        logger.debug(`${groupLabel}: Form submitted`);

        // Wait for success popup
        await page.waitForSelector(SELECTORS.TAGCONTROLS.VEHICLETAGSUCCESS, { state: 'visible' });
        logger.success(`${groupLabel}: Vehicle ${vehicleData.vehicle} tagged successfully`, { captcha: captchaAnswer });
        logger.logVehicleResult(vehicleData.vehicle, 'Success', { row: vehicleData.row, captcha: captchaAnswer });

        // Click OK — page refreshes back to search form, ready for next vehicle
        await page.locator(SELECTORS.TAGCONTROLS.OK_BUTTON).click();
        await page.waitForLoadState('networkidle');
        logger.debug(`${groupLabel}: OK clicked, page refreshed — ready for next vehicle`);

        return { status: 'success', row: vehicleData.row, column: vehicleData.column };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`${groupLabel}: Failed to process vehicle ${vehicleData.vehicle}`, { error: errorMessage });
        logger.logVehicleResult(vehicleData.vehicle, `Failed: ${errorMessage}`, { row: vehicleData.row });

        // Navigate back to recover the search page for the next vehicle
        try {
            await page.goBack({ waitUntil: 'networkidle' });
            logger.debug(`${groupLabel}: Navigated back after error`);
        } catch (reloadError) {
            logger.warning(`${groupLabel}: Failed to navigate back after error`, { error: reloadError.message });
        }

        return { status: 'failed', error: errorMessage, row: vehicleData.row, column: vehicleData.column };
    }
}
