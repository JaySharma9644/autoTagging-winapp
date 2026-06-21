/**
 * Batch Processor Module
 * Handles vehicle group processing — sequential when using an embedded page (CDP mode),
 * parallel with independent logins when using standalone browser.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../config.js';
import { createPage, closePage } from '../browser/browserManager.js';
import { login } from '../auth/login.js';
import { navigateToTransporter, navigateToEpass } from '../auth/navigation.js';
import { processVehicle } from './vehicleProcessor.js';

const STOP_FLAG = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.stop-requested');

function isStopRequested() {
    try { return fs.existsSync(STOP_FLAG); } catch (_) { return false; }
}

function clearStopFlag() {
    try { fs.unlinkSync(STOP_FLAG); } catch (_) {}
}

const NETWORK_ERROR_PATTERNS = [
    /net::ERR_/i,
    /NS_ERROR_NET/i,
    /ERR_CONNECTION_REFUSED/i,
    /ERR_NAME_NOT_RESOLVED/i,
    /ERR_INTERNET_DISCONNECTED/i,
    /ERR_NETWORK_CHANGED/i,
    /ERR_EMPTY_RESPONSE/i,
    /ERR_CONNECTION_TIMED_OUT/i,
    /ERR_CONNECTION_RESET/i,
    /ERR_CONNECTION_CLOSED/i,
    /socket hang up/i,
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /ETIMEDOUT/i,
];

function isNetworkError(err) {
    const msg = err?.message || String(err);
    return NETWORK_ERROR_PATTERNS.some(re => re.test(msg));
}

/**
 * Processes a single column group.
 * If existingPage is provided (embedded/CDP mode), reuses it without creating or closing a page.
 */

async function processGroupVehicles(page, group) {
    const groupLabel = `Column ${group.columnLetter}`;
    let successCount = 0;
    let skippedCount = 0;
    let failedCount  = 0;
    const cellStatuses = [];

    for (let i = 0; i < group.vehicles.length; i++) {
        const vehicleData = group.vehicles[i];
        logger.info(`${groupLabel}: ── Record ${i + 1}/${group.vehicles.length} ── Vehicle: ${vehicleData.vehicle}`);

        const result = await processVehicle(page, vehicleData, groupLabel);
        cellStatuses.push({ row: result.row, column: result.column, status: result.status });

        if (result.status === 'success')       { successCount++; logger.success(`${groupLabel}: Record ${i + 1} ✓ Tagged`); }
        else if (result.status === 'skipped')  { skippedCount++; logger.warning(`${groupLabel}: Record ${i + 1} ↷ Skipped`); }
        else                                   { failedCount++;  logger.error(`${groupLabel}: Record ${i + 1} ✗ Failed — ${result.error}`); }

        process.stdout.write(
            `VEHICLE_RESULT:${JSON.stringify({
                column: group.columnLetter,
                vehicle: vehicleData.vehicle,
                row: vehicleData.row,
                status: result.status,
                error: result.error || null,
            })}\n`
        );
    }

    // After last vehicle, wait for the search input to be ready so the next group skips navigation
    await page.locator('#txtVehicleNo').waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});

    return { success: successCount, skipped: skippedCount, failed: failedCount, cellStatuses };
}

/**
 * Processes all vehicle column groups sequentially on a single shared session.
 * Login happens once. Between groups we navigate back to epass — no re-login.
 */
export async function processVehicleGroupsInParallel(context, vehicleGroups, worksheet, portalUrl) {
    let page;
    let ownedPage = false;

    try {
        logger.info(`${'═'.repeat(60)}`);
        logger.info(`BATCH START — ${vehicleGroups.length} group(s) [sequential, single session]`);
        logger.info(`${'═'.repeat(60)}`);

        // ── One-time setup: open page, login, navigate ───────────────────────
        page = await createPage(context);
        ownedPage = true;

        await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
        await navigateToTransporter(page);
        await login(page);
        await navigateToEpass(page);
        logger.success('Session ready — starting group processing');

        let totalSuccess = 0;
        let totalSkipped = 0;
        let totalFailed = 0;
        const columnResults = [];
        const allCellStatuses = [];
        const failedGroups = [];

        for (let g = 0; g < vehicleGroups.length; g++) {
            const group = vehicleGroups[g];
            const groupLabel = `Column ${group.columnLetter}`;

            logger.info(`${'═'.repeat(60)}`);
            logger.info(`${groupLabel}: START  [${group.vehicles.length} vehicle(s)]`);
            logger.info(`${'═'.repeat(60)}`);

            // Stay on Tag More Vehicle page between groups — only navigate if we've genuinely left it
            if (g > 0) {
                const onSearchPage = await page.locator('#txtVehicleNo').isVisible({ timeout: 6000 }).catch(() => false);
                if (onSearchPage) {
                    logger.info(`${groupLabel}: Already on Tag More Vehicle page — skipping navigation`);
                } else {
                    logger.info(`${groupLabel}: Not on Tag More Vehicle page — navigating back`);
                    try {
                        await navigateToEpass(page);
                    } catch (navErr) {
                        // Session expired — re-login once then continue
                        logger.warning(`${groupLabel}: Navigation failed, re-logging in — ${navErr.message}`);
                        await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
                        await navigateToTransporter(page);
                        await login(page);
                        await navigateToEpass(page);
                    }
                }
            }

            try {
                const { success, skipped, failed, cellStatuses } = await processGroupVehicles(page, group);

                logger.info(`${'─'.repeat(60)}`);
                logger.info(`${groupLabel}: END  ✓ ${success} tagged  ↷ ${skipped} skipped  ✗ ${failed} failed`);
                logger.info(`${'─'.repeat(60)}`);
                process.stdout.write(`TAB_DONE:${group.columnLetter}\n`);

                totalSuccess += success;
                totalSkipped += skipped;
                totalFailed  += failed;
                if (cellStatuses) allCellStatuses.push(...cellStatuses);
                columnResults.push({
                    columnLetter: group.columnLetter,
                    totalRecords: group.vehicles.length,
                    successCount: success,
                    skippedCount: skipped,
                    failedCount:  failed,
                });
            } catch (err) {
                process.stdout.write(`TAB_DONE:${group.columnLetter}\n`);
                if (isNetworkError(err)) {
                    logger.error('Network error — portal may be down. Stopping.');
                    process.stdout.write(`NETWORK_DOWN:${err.message}\n`);
                    process.exit(2);
                }
                failedGroups.push({ column: group.columnLetter, error: err?.message });
                logger.error(`${groupLabel} failed — ${err?.message}`);
            }
        }

        logger.info(`${'═'.repeat(60)}`);
        logger.info(`BATCH END — ✓ ${totalSuccess} tagged  ↷ ${totalSkipped} skipped  ✗ ${totalFailed} failed`);
        if (failedGroups.length > 0) {
            logger.error(`Failed groups: ${failedGroups.map(g => g.column).join(', ')}`);
        }
        logger.info(`${'═'.repeat(60)}`);

        return {
            columnResults,
            allCellStatuses,
            totalSuccess,
            totalSkipped,
            totalFailed,
            totalRecords: vehicleGroups.reduce((sum, g) => sum + g.vehicles.length, 0),
        };

    } catch (error) {
        logger.exception(error, { function: 'processVehicleGroupsInParallel' });
        throw error;
    } finally {
        if (ownedPage) await closePage(page, 'Session');
    }
}
