/**
 * Vehicle Processor Module
 * Handles individual vehicle tagging logic
 */

import { logger } from '../config.js';
import { SELECTORS } from '../utils/selectors.js';
import { solveCaptcha } from '../captcha/captchaSolver.js';

// ── Network error detection ───────────────────────────────────────────────────

const NETWORK_ERROR_PATTERNS = [
    /net::ERR_/i, /NS_ERROR_NET/i, /ECONNREFUSED/i,
    /ENOTFOUND/i, /ETIMEDOUT/i, /ERR_INTERNET_DISCONNECTED/i,
    /ERR_NAME_NOT_RESOLVED/i, /socket hang up/i, /ERR_EMPTY_RESPONSE/i,
];

export function isNetworkError(err) {
    const msg = err?.message || String(err);
    return NETWORK_ERROR_PATTERNS.some(re => re.test(msg));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function jsClick(locator, label) {
    try {
        await locator.waitFor({ state: 'attached', timeout: 10000 });
        await locator.evaluate(el => el.click());
    } catch (e) {
        logger.warning(`${label}: JS click failed (${e.message}), falling back to force click`);
        await locator.click({ force: true, timeout: 10000 });
    }
}

async function recoverPage(page, groupLabel) {
    try {
        const resetBtn = page.locator(SELECTORS.VEHICLE_PROCESSING.RESET_BUTTON).first();
        const visible = await resetBtn.isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) {
            await resetBtn.evaluate(el => el.click());
            await page.waitForLoadState('domcontentloaded').catch(() => {});
            logger.debug(`${groupLabel}: Reset clicked to recover`);
        } else {
            await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
            logger.debug(`${groupLabel}: Navigated back to recover`);
        }
    } catch (e) {
        logger.warning(`${groupLabel}: Recovery failed — ${e.message}`);
    }
}

/**
 * Submits the tagging form and detects the result via:
 *   - JavaScript alert dialog ("Vehicle tagged successfully.")
 *   - DOM element matching the success selector
 */
async function submitAndWaitForResult(page, groupLabel) {
    let dialogMessage = null;

    const dialogHandler = async (dialog) => {
        dialogMessage = dialog.message().trim();
        logger.debug(`${groupLabel}: Dialog — "${dialogMessage}"`);
        await dialog.accept();
    };
    page.once('dialog', dialogHandler);

    const submitBtn = page.locator(SELECTORS.TAGCONTROLS.SUBMIT_BUTTON).first();
    await jsClick(submitBtn, `${groupLabel}: Submit`);
    logger.debug(`${groupLabel}: Form submitted`);

    const domSuccess = page
        .waitForSelector(SELECTORS.TAGCONTROLS.VEHICLETAGSUCCESS, { state: 'visible', timeout: 30000 })
        .then(() => 'dom')
        .catch(() => null);

    const dialogArrived = new Promise(resolve => {
        const tick = setInterval(() => {
            if (dialogMessage !== null) { clearInterval(tick); resolve('dialog'); }
        }, 100);
        setTimeout(() => { clearInterval(tick); resolve(null); }, 30000);
    });

    const outcome = await Promise.race([domSuccess, dialogArrived]);
    page.off('dialog', dialogHandler);

    if (outcome === 'dialog' || dialogMessage !== null) {
        const msg = (dialogMessage || '').toLowerCase();
        if (msg.includes('success') || msg.includes('tagged')) {
            logger.debug(`${groupLabel}: Success via dialog`);
            return;
        }
        throw new Error(`Portal rejected submission: "${dialogMessage}"`);
    }

    if (outcome === 'dom') {
        logger.debug(`${groupLabel}: Success via DOM element`);
        const okBtn = page.locator(SELECTORS.TAGCONTROLS.OK_BUTTON).first();
        if (await okBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await jsClick(okBtn, `${groupLabel}: OK`);
            await page.waitForLoadState('domcontentloaded');
        }
        return;
    }

    throw new Error('No success signal after 30 s (no dialog, no DOM element)');
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function processVehicle(page, vehicleData, groupLabel) {
    const { vehicle, row, column } = vehicleData;

    logger.step(`${groupLabel}: Processing Vehicle ${vehicle}`, { row });

    if (vehicle === 'Success' || vehicle.startsWith('Skipped') || vehicle.startsWith('Failed')) {
        logger.debug(`${groupLabel}: Cell contains status value — skipping`);
        return { status: 'skipped', row, column };
    }

    // Search
    const searchInput = page.locator(SELECTORS.VEHICLE_PROCESSING.SEARCH_INPUT);
    await searchInput.waitFor({ state: 'attached', timeout: 10000 });
    await searchInput.evaluate(el => el.value = '');
    await searchInput.fill(vehicle);
    await jsClick(page.locator(SELECTORS.VEHICLE_PROCESSING.SEARCH_BUTTON).first(), `${groupLabel}: Search`);

    // Wait for the portal's AJAX response — VTS form, already-tagged, no-records, or validity info
    const vtsForm       = page.locator(SELECTORS.TAGCONTROLS.VTS);
    const alreadyTagged = page.locator(SELECTORS.VEHICLE_PROCESSING.ALREADY_TAGGED);
    const noRecords     = page.locator('td:has-text("No Record(s) Found")');
    const vldInfo       = page.locator(SELECTORS.VEHICLE_PROCESSING.VEHICLE_VLD_INFO);
    await Promise.race([
        vtsForm.waitFor({ state: 'visible', timeout: 20000 }),
        alreadyTagged.waitFor({ state: 'visible', timeout: 20000 }),
        noRecords.waitFor({ state: 'visible', timeout: 20000 }),
        vldInfo.waitFor({ state: 'visible', timeout: 20000 }),
    ]).catch(() => {});
    logger.debug(`${groupLabel}: Search result received`);

    // No-records fast-path — portal couldn't find this vehicle number
    if (await noRecords.isVisible({ timeout: 500 }).catch(() => false)) {
        logger.warning(`${groupLabel}: ${vehicle} — no records found on portal`);
        const resetBtn = page.locator(SELECTORS.VEHICLE_PROCESSING.RESET_BUTTON).first();
        if (await resetBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await jsClick(resetBtn, `${groupLabel}: Reset`);
            await page.waitForLoadState('domcontentloaded').catch(() => {});
        }
        logger.logVehicleResult(vehicle, 'Failed: No records found on portal', { row });
        return { status: 'failed', error: 'No records found on portal', row, column };
    }

    // Validity info fast-path — covers "expired permit", "already tagged", and similar portal messages
    if (await vldInfo.isVisible({ timeout: 500 }).catch(() => false)) {
        const infoText = (await vldInfo.textContent().catch(() => '')).trim();
        logger.warning(`${groupLabel}: ${vehicle} — portal info: "${infoText}"`);
        const resetBtn = page.locator(SELECTORS.VEHICLE_PROCESSING.RESET_BUTTON).first();
        if (await resetBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await jsClick(resetBtn, `${groupLabel}: Reset`);
            await page.waitForLoadState('domcontentloaded').catch(() => {});
        }
        logger.logVehicleResult(vehicle, 'Skipped - Already Tagged', { row });
        return { status: 'skipped', row, column };
    }

    // Already-tagged fast-path
    if (await alreadyTagged.isVisible({ timeout: 1000 }).catch(() => false)) {
        logger.warning(`${groupLabel}: ${vehicle} already tagged — skipping`);
        await jsClick(page.locator(SELECTORS.VEHICLE_PROCESSING.RESET_BUTTON).first(), `${groupLabel}: Reset`);
        await page.waitForLoadState('domcontentloaded');
        logger.logVehicleResult(vehicle, 'Skipped - Already Tagged', { row });
        return { status: 'skipped', row, column };
    }

    // Form fill → captcha → submit
    let captchaAnswer = null;
    try {
        // Confirm VTS form is visible (already waited above, this is a fast check)
        if (!await vtsForm.isVisible({ timeout: 3000 }).catch(() => false)) {
            throw new Error('VTS form not visible after search');
        }

        const gpsYes      = page.locator(SELECTORS.TAGCONTROLS.GPSFITTEDYES);
        const vtsYes      = page.locator(SELECTORS.TAGCONTROLS.VTSACTIVEYES);
        const simValidYes = page.locator(SELECTORS.TAGCONTROLS.SIMVALIDYES);
        const ackCheckbox = page.locator(SELECTORS.TAGCONTROLS.ACK);
        const captchaImage= page.locator(SELECTORS.TAGCONTROLS.CAPTCHAIMAGE);
        const captchaInput= page.locator(SELECTORS.TAGCONTROLS.CAPTCHAINPUT);

        // Fill radios and checkbox sequentially via JS
        await gpsYes.evaluate(el => el.click());
        await vtsYes.evaluate(el => el.click());
        await simValidYes.evaluate(el => el.click());
        await ackCheckbox.evaluate(el => {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        logger.debug(`${groupLabel}: Radios + checkbox filled`);

        captchaAnswer = await solveCaptcha(page, captchaImage);
        logger.info(`${groupLabel}: Captcha solved`, { vehicle, answer: captchaAnswer });

        await captchaInput.fill(captchaAnswer);
        await submitAndWaitForResult(page, groupLabel);
        await page.waitForLoadState('domcontentloaded').catch(() => {});

        logger.success(`${groupLabel}: ${vehicle} tagged successfully`);
        logger.logVehicleResult(vehicle, 'Success', { row, captcha: captchaAnswer });
        return { status: 'success', row, column };

    } catch (error) {
        if (isNetworkError(error)) throw error;

        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`${groupLabel}: Failed to process ${vehicle} — ${msg}`);
        logger.logVehicleResult(vehicle, `Failed: ${msg}`, { row });
        await recoverPage(page, groupLabel);
        return { status: 'failed', error: msg, row, column };
    }
}
