/**
 * Vehicle Processor Module
 * Handles individual vehicle tagging logic
 */

import { logger } from '../config.js';
import { SELECTORS } from '../utils/selectors.js';
import { solveCaptcha } from '../captcha/captchaSolver.js';

/**
 * Clicks via JavaScript element.click() — bypasses viewport/iframe scroll issues.
 */
async function jsClick(locator, label) {
    try {
        await locator.waitFor({ state: 'attached', timeout: 10000 });
        await locator.evaluate(el => el.click());
    } catch (e) {
        logger.warning(`${label}: JS click failed (${e.message}), falling back to force click`);
        await locator.click({ force: true, timeout: 10000 });
    }
}

/**
 * Submits the tagging form and waits for either:
 *   - A JavaScript alert containing the success/error message, OR
 *   - A DOM element with 'text="Vehicle tagged successfully"'
 *
 * Returns { success: true } or throws an error with the portal's message.
 */
async function submitAndWaitForResult(page, groupLabel) {
    let dialogMessage = null;

    // Register dialog handler BEFORE clicking submit so we catch the alert
    const dialogHandler = async (dialog) => {
        dialogMessage = dialog.message().trim();
        logger.debug(`${groupLabel}: Dialog detected — "${dialogMessage}"`);
        await dialog.accept();
    };
    page.once('dialog', dialogHandler);

    const submitBtn = page.locator(SELECTORS.TAGCONTROLS.SUBMIT_BUTTON).first();
    await jsClick(submitBtn, `${groupLabel}: Submit`);
    logger.debug(`${groupLabel}: Form submitted`);

    // Wait up to 15s for either the JS dialog to fire OR the DOM success element to appear
    const domSuccessPromise = page
        .waitForSelector(SELECTORS.TAGCONTROLS.VEHICLETAGSUCCESS, { state: 'visible', timeout: 15000 })
        .then(() => 'dom')
        .catch(() => null);

    // Give the dialog handler time to fire (it fires during page event loop)
    const dialogWaitPromise = new Promise(resolve => {
        const check = setInterval(() => {
            if (dialogMessage !== null) { clearInterval(check); resolve('dialog'); }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(null); }, 15000);
    });

    const result = await Promise.race([domSuccessPromise, dialogWaitPromise]);

    // Remove handler if it never fired
    page.off('dialog', dialogHandler);

    if (result === 'dialog' || dialogMessage !== null) {
        const msg = (dialogMessage || '').toLowerCase();
        if (msg.includes('success') || msg.includes('tagged')) {
            logger.debug(`${groupLabel}: Success confirmed via dialog — "${dialogMessage}"`);
            return { success: true };
        } else {
            throw new Error(`Portal response: "${dialogMessage}"`);
        }
    }

    if (result === 'dom') {
        logger.debug(`${groupLabel}: Success confirmed via DOM element`);
        // Click OK button if present
        const okBtn = page.locator(SELECTORS.TAGCONTROLS.OK_BUTTON).first();
        const okVisible = await okBtn.isVisible({ timeout: 2000 }).catch(() => false);
        if (okVisible) {
            await jsClick(okBtn, `${groupLabel}: OK`);
            await page.waitForLoadState('networkidle');
        }
        return { success: true };
    }

    throw new Error('Success message not detected after 15s (no dialog or DOM element)');
}

/**
 * Processes a single vehicle on the Tag More Vehicle search page.
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
        await searchInput.waitFor({ state: 'attached', timeout: 10000 });
        await searchInput.evaluate(el => el.value = '');
        await searchInput.fill(vehicleData.vehicle);
        logger.debug(`${groupLabel}: Filled vehicle number: ${vehicleData.vehicle}`);

        await jsClick(page.locator(SELECTORS.VEHICLE_PROCESSING.SEARCH_BUTTON).first(), `${groupLabel}: Search`);
        logger.debug(`${groupLabel}: Clicked search button`);

        await page.waitForLoadState('networkidle');
        logger.debug(`${groupLabel}: Page loaded after search`);

        // Check if already tagged
        const alreadyTaggedLocator = page.locator(SELECTORS.VEHICLE_PROCESSING.ALREADY_TAGGED);
        const isTagged = await alreadyTaggedLocator.isVisible({ timeout: 3000 }).catch(() => false);

        if (isTagged) {
            logger.warning(`${groupLabel}: Vehicle ${vehicleData.vehicle} is already tagged — clicking Reset`);
            await jsClick(page.locator(SELECTORS.VEHICLE_PROCESSING.RESET_BUTTON).first(), `${groupLabel}: Reset`);
            await page.waitForLoadState('networkidle');
            logger.logVehicleResult(vehicleData.vehicle, 'Skipped - Already Tagged', { row: vehicleData.row });
            return { status: 'skipped', row: vehicleData.row, column: vehicleData.column };
        }

        logger.debug(`${groupLabel}: Vehicle not tagged, proceeding to VTS/GPS form`);

        // Wait for the tagging form to appear
        await page.waitForSelector(SELECTORS.TAGCONTROLS.VTS, { state: 'visible' });
        logger.debug(`${groupLabel}: VTS/GPS form visible`);

        // Verify all required form elements are present
        const gpsYes      = page.locator(SELECTORS.TAGCONTROLS.GPSFITTEDYES);
        const gpsNo       = page.locator(SELECTORS.TAGCONTROLS.GPSFITTEDNO);
        const vtsYes      = page.locator(SELECTORS.TAGCONTROLS.VTSACTIVEYES);
        const vtsNo       = page.locator(SELECTORS.TAGCONTROLS.VTSACTIVENO);
        const simValidYes = page.locator(SELECTORS.TAGCONTROLS.SIMVALIDYES);
        const simValidNo  = page.locator(SELECTORS.TAGCONTROLS.SIMVALIDNO);
        const ackCheckbox = page.locator(SELECTORS.TAGCONTROLS.ACK);
        const captchaImage= page.locator(SELECTORS.TAGCONTROLS.CAPTCHAIMAGE);
        const captchaInput= page.locator(SELECTORS.TAGCONTROLS.CAPTCHAINPUT);

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
                !hasGpsYes      && 'rdo_GPS_0',
                !hasGpsNo       && 'rdo_GPS_1',
                !hasVtsYes      && 'Rdo_VTS_0',
                !hasVtsNo       && 'Rdo_VTS_1',
                !hasSimValidYes && 'Rdo_SIM_0',
                !hasSimValidNo  && 'Rdo_SIM_1',
                !hasAck         && 'chkClick',
                !hasCaptchaImg  && 'imgCaptch',
                !hasCaptchaInput&& 'txtcaptcha',
            ].filter(Boolean);
            throw new Error(`VTS form elements missing: ${missing.join(', ')}`);
        }
        logger.debug(`${groupLabel}: All VTS/GPS form elements verified`);

        // Fill form via JS (bypasses viewport constraints)
        await gpsYes.evaluate(el => el.click());
        logger.debug(`${groupLabel}: GPS Fitted = Yes`);

        await vtsYes.evaluate(el => el.click());
        logger.debug(`${groupLabel}: VTS Active = Yes`);

        await simValidYes.evaluate(el => el.click());
        logger.debug(`${groupLabel}: SIM Validity = Yes`);

        await ackCheckbox.evaluate(el => {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        logger.debug(`${groupLabel}: Acknowledge checkbox checked`);

        // Solve captcha
        const captchaAnswer = await solveCaptcha(page, captchaImage);
        logger.info(`${groupLabel}: Captcha solved`, { vehicle: vehicleData.vehicle, answer: captchaAnswer });

        // Fill captcha input — use Playwright fill() which fires all necessary events
        await captchaInput.fill(captchaAnswer);
        logger.debug(`${groupLabel}: Captcha filled`);

        // Submit and detect success (handles both JS alert and DOM text)
        await submitAndWaitForResult(page, groupLabel);

        logger.success(`${groupLabel}: Vehicle ${vehicleData.vehicle} tagged successfully`);
        logger.logVehicleResult(vehicleData.vehicle, 'Success', { row: vehicleData.row, captcha: captchaAnswer });

        // Wait for page to return to search form
        await page.waitForLoadState('networkidle').catch(() => {});
        logger.debug(`${groupLabel}: Ready for next vehicle`);

        return { status: 'success', row: vehicleData.row, column: vehicleData.column };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`${groupLabel}: Failed to process vehicle ${vehicleData.vehicle}`, { error: errorMessage });
        logger.logVehicleResult(vehicleData.vehicle, `Failed: ${errorMessage}`, { row: vehicleData.row });

        // Recover: click Reset if visible, otherwise go back
        try {
            const resetBtn = page.locator(SELECTORS.VEHICLE_PROCESSING.RESET_BUTTON).first();
            const visible = await resetBtn.isVisible({ timeout: 2000 }).catch(() => false);
            if (visible) {
                await resetBtn.evaluate(el => el.click());
                await page.waitForLoadState('networkidle').catch(() => {});
                logger.debug(`${groupLabel}: Reset clicked to recover`);
            } else {
                await page.goBack({ waitUntil: 'networkidle' }).catch(() => {});
                logger.debug(`${groupLabel}: Navigated back to recover`);
            }
        } catch (reloadError) {
            logger.warning(`${groupLabel}: Recovery failed`, { error: reloadError.message });
        }

        return { status: 'failed', error: errorMessage, row: vehicleData.row, column: vehicleData.column };
    }
}
