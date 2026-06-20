/**
 * Batch Processor Module
 * Handles vehicle group processing — sequential when using an embedded page (CDP mode),
 * parallel with independent logins when using standalone browser.
 */

import { logger } from '../config.js';
import { createPage, closePage } from '../browser/browserManager.js';
import { login } from '../auth/login.js';
import { navigateToTransporter, navigateToEpass } from '../auth/navigation.js';
import { processVehicle } from './vehicleProcessor.js';

/**
 * Processes a single column group.
 * If existingPage is provided (embedded/CDP mode), reuses it without creating or closing a page.
 */
async function findPageBySentinel(context, title, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const p of context.pages()) {
            const t = await p.title().catch(() => '');
            if (t === title) return p;
        }
        await new Promise(r => setTimeout(r, 300));
    }
    return null;
}

async function processColumnGroup(context, group, portalUrl) {
    let page;
    let ownedPage = false;
    const groupLabel = `Column ${group.columnLetter}`;

    try {
        logger.info(`${'═'.repeat(60)}`);
        logger.info(`${groupLabel}: START  [${group.vehicles.length} vehicle(s)]`);
        logger.info(`${'═'.repeat(60)}`);

        if (process.env.PLAYWRIGHT_CDP_PORT) {
            // Signal main process to create an embedded tab for this column
            process.stdout.write(`TAB_OPEN:${group.columnLetter}\n`);
            const sentinel = `AUTOMATION_VIEW_${group.columnLetter}`;
            page = await findPageBySentinel(context, sentinel);
            if (!page) throw new Error(`Timed out waiting for embedded tab for column ${group.columnLetter}`);
        } else {
            page = await createPage(context);
            ownedPage = true;
        }

        await page.goto(portalUrl, { waitUntil: 'networkidle' });
        await navigateToTransporter(page);
        await login(page);
        await navigateToEpass(page);

        let successCount = 0;
        let skippedCount = 0;
        let failedCount = 0;
        const cellStatuses = [];

        for (let i = 0; i < group.vehicles.length; i++) {
            const vehicleData = group.vehicles[i];

            logger.info(`${groupLabel}: ── Record ${i + 1}/${group.vehicles.length} ── Vehicle: ${vehicleData.vehicle}`);

            const result = await processVehicle(page, vehicleData, groupLabel);

            cellStatuses.push({ row: result.row, column: result.column, status: result.status });

            if (result.status === 'success') {
                successCount++;
                logger.success(`${groupLabel}: Record ${i + 1} ✓ Tagged`);
            } else if (result.status === 'skipped') {
                skippedCount++;
                logger.warning(`${groupLabel}: Record ${i + 1} ↷ Skipped (already tagged)`);
            } else {
                failedCount++;
                logger.error(`${groupLabel}: Record ${i + 1} ✗ Failed — ${result.error}`);
            }

            // Emit structured result for the UI records table
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

        logger.info(`${'─'.repeat(60)}`);
        logger.info(`${groupLabel}: END  ✓ ${successCount} tagged  ↷ ${skippedCount} skipped  ✗ ${failedCount} failed`);
        logger.info(`${'─'.repeat(60)}`);

        // Signal main process to close this column's tab
        process.stdout.write(`TAB_DONE:${group.columnLetter}\n`);

        return { success: successCount, skipped: skippedCount, failed: failedCount, cellStatuses };

    } catch (error) {
        logger.exception(error, { function: 'processColumnGroup', column: group.columnLetter });
        process.stdout.write(`TAB_DONE:${group.columnLetter}\n`);
        throw error;
    } finally {
        if (ownedPage) await closePage(page, groupLabel);
    }
}

/**
 * Processes all vehicle column groups.
 * - With existingPage (embedded mode): runs sequentially, reusing the single embedded page.
 * - Without existingPage (standalone mode): runs in parallel with independent logins per group.
 */
export async function processVehicleGroupsInParallel(context, vehicleGroups, worksheet, portalUrl) {
    try {
        logger.info(`${'═'.repeat(60)}`);
        logger.info(`BATCH START — ${vehicleGroups.length} group(s) [parallel]`);
        logger.info(`${'═'.repeat(60)}`);

        const results = await Promise.allSettled(
            vehicleGroups.map(group => processColumnGroup(context, group, portalUrl))
        );

        let totalSuccess = 0;
        let totalSkipped = 0;
        let totalFailed = 0;
        const columnResults = [];
        const allCellStatuses = [];
        const failedGroups = [];

        results.forEach((result, index) => {
            const group = vehicleGroups[index];
            if (result.status === 'fulfilled') {
                const { success, skipped, failed, cellStatuses } = result.value;
                totalSuccess += success;
                totalSkipped += skipped;
                totalFailed += failed;
                if (cellStatuses) allCellStatuses.push(...cellStatuses);
                columnResults.push({
                    columnLetter: group.columnLetter,
                    totalRecords: group.vehicles.length,
                    successCount: success,
                    skippedCount: skipped,
                    failedCount: failed,
                });
            } else {
                failedGroups.push({ column: group.columnLetter, error: result.reason?.message });
                logger.error(`Column Group ${group.columnLetter} failed`, { error: result.reason?.message });
            }
        });

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
    }
}
