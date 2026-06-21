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

const POLL_ATTEMPTS  = 60;   // max polls before giving up
const POLL_DELAY_MS  = 4000; // wait between polls

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Navigates to ePass → Request For Vehicle, then polls the New Request tab
 * until the top row shows a "Take Action" link. Extracts the Permit No from
 * that row, then navigates to View Request Status and clicks Tag More Vehicle
 * on the matching row.
 */
export async function navigateToEpass(page) {
    try {
        logger.debug('Clicking e-Pass menu');
        await jsClick(page.locator(SELECTORS.NAVIGATION.EPASS_MENU).first(), 'ePass menu');

        logger.debug('Clicking Request For Vehicle');
        await jsClick(page.locator(SELECTORS.NAVIGATION.REQUEST_FOR_VEHICLE).first(), 'Request For Vehicle');

        // Poll New Request tab until Take Action appears on the top row
        const permitNo = await pollNewRequestForTakeAction(page);

        // Navigate to View Request Status and click Tag More Vehicle for this permit
        await clickTagMoreVehicleForPermit(page, permitNo);

        logger.success('Navigation complete. Ready to process vehicles');
    } catch (error) {
        logger.exception(error, { function: 'navigateToEpass' });
        throw error;
    }
}

/**
 * Clicks "New Request" tab and polls until the top data row has a "Take Action"
 * cell visible. Returns the Permit No extracted from that row.
 * If no rows exist, re-navigates via ePass → Request For Vehicle and retries.
 */
async function pollNewRequestForTakeAction(page) {
    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
        logger.info(`New Request poll — attempt ${attempt}/${POLL_ATTEMPTS}`);

        await jsClick(page.locator(SELECTORS.NAVIGATION.NEW_REQUEST).first(), 'New Request tab');
        await page.waitForLoadState('domcontentloaded').catch(() => {});

        // No rows yet — refresh via ePass menu and retry
        const noRows = await page.locator(SELECTORS.NAVIGATION.NO_RECORDS_FOUND)
            .isVisible({ timeout: 3000 }).catch(() => false);
        if (noRows) {
            logger.info(`Attempt ${attempt}: No records in New Request — refreshing in ${POLL_DELAY_MS / 1000}s`);
            await delay(POLL_DELAY_MS);
            await jsClick(page.locator(SELECTORS.NAVIGATION.EPASS_MENU).first(), 'ePass menu (refresh)');
            await jsClick(page.locator(SELECTORS.NAVIGATION.REQUEST_FOR_VEHICLE).first(), 'Request For Vehicle (refresh)');
            continue;
        }

        // Check if the top data row has "Take Action" in its last cell
        const hasTakeAction = await page.locator(SELECTORS.NAVIGATION.TAKE_ACTION)
            .first().isVisible({ timeout: 3000 }).catch(() => false);
        if (!hasTakeAction) {
            logger.info(`Attempt ${attempt}: Take Action not visible in top row — refreshing`);
            await delay(POLL_DELAY_MS);
            await jsClick(page.locator(SELECTORS.NAVIGATION.EPASS_MENU).first(), 'ePass menu (refresh)');
            await jsClick(page.locator(SELECTORS.NAVIGATION.REQUEST_FOR_VEHICLE).first(), 'Request For Vehicle (refresh)');
            continue;
        }

        // Take Action visible — extract Permit No from the same row
        const permitNo = await extractPermitNoFromTopRow(page);
        if (!permitNo) {
            logger.warning(`Attempt ${attempt}: Could not read Permit No — retrying`);
            await delay(POLL_DELAY_MS);
            continue;
        }

        logger.success(`Take Action found — Permit No: ${permitNo}`);
        return permitNo;
    }

    throw new Error(`Take Action not found after ${POLL_ATTEMPTS} poll attempts`);
}

/**
 * Reads the Permit No from the first data row of the New Request table.
 * Looks for a column whose header contains "Permit"; falls back to column index 1
 * (second column, skipping any serial/checkbox column).
 */
async function extractPermitNoFromTopRow(page) {
    // Find the table that contains "Take Action"
    const table = page.locator('table').filter({ has: page.locator(SELECTORS.NAVIGATION.TAKE_ACTION) }).first();

    // Resolve permit column index from header
    let permitColIdx = 1; // safe default
    const headers = table.locator('thead tr th, tr:first-child th, tr:first-child td');
    const headerCount = await headers.count().catch(() => 0);
    for (let i = 0; i < headerCount; i++) {
        const txt = (await headers.nth(i).textContent().catch(() => '')).trim().toLowerCase();
        if (txt.includes('permit')) { permitColIdx = i; break; }
    }

    // Read from the first data row
    const firstDataRow = table.locator('tbody tr, tr').filter({ has: page.locator(SELECTORS.NAVIGATION.TAKE_ACTION) }).first();
    const cells = firstDataRow.locator('td');
    const cellCount = await cells.count().catch(() => 0);
    if (cellCount === 0) return null;

    const safeIdx = Math.min(permitColIdx, cellCount - 2); // -2 to avoid the Take Action cell itself
    const val = (await cells.nth(safeIdx).textContent().catch(() => '')).trim();
    return val || null;
}

/**
 * Navigates to View Request Status, locates the row matching the given Permit No,
 * and clicks its "Tag More Vechile" link.
 */
async function clickTagMoreVehicleForPermit(page, permitNo) {
    logger.debug(`Clicking View Request Status for Permit No: ${permitNo}`);
    await jsClick(page.locator(SELECTORS.NAVIGATION.VIEW_REQUEST_STATUS).first(), 'View Request Status');
    await page.waitForLoadState('domcontentloaded').catch(() => {});

    // Find the row that contains the permit number
    const permitRow = page.locator('tr').filter({
        has: page.locator(`td`).filter({ hasText: new RegExp(`^\\s*${escapeRegex(permitNo)}\\s*$`) }),
    }).first();

    await permitRow.waitFor({ state: 'visible', timeout: 15000 });

    const tagLink = permitRow.locator('a:has-text("Tag More Vechile")');
    logger.debug(`Clicking Tag More Vechile on row with Permit No: ${permitNo}`);
    await jsClick(tagLink.first(), `Tag More Vechile (Permit: ${permitNo})`);
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
