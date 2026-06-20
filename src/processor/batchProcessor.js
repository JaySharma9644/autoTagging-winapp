/**
 * Batch Processor Module
 * Handles parallel batch processing with independent logins
 */

import { logger, CONFIG } from '../config.js';
import { createPage, closePage } from '../browser/browserManager.js';
import { login } from '../auth/login.js';
import { navigateToTransporter, navigateToEpass } from '../auth/navigation.js';
import { processVehicle } from './vehicleProcessor.js';

/**
 * Processes a single column group in its own browser page with INDEPENDENT LOGIN
 */
export async function processColumnGroup(context, group, worksheet, portalUrl) {
    let page;
    const groupLabel = `Column ${group.columnLetter}`;

    try {
        logger.info(`${'═'.repeat(60)}`);
        logger.info(`${groupLabel}: START  [${group.vehicles.length} vehicle(s)]`);
        logger.info(`${'═'.repeat(60)}`);

        page = await createPage(context);
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

            cellStatuses.push({
                row: result.row,
                column: result.column,
                status: result.status
            });

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
        }

        logger.info(`${'─'.repeat(60)}`);
        logger.info(`${groupLabel}: END  ✓ ${successCount} tagged  ↷ ${skippedCount} skipped  ✗ ${failedCount} failed`);
        logger.info(`${'─'.repeat(60)}`);

        return { success: successCount, skipped: skippedCount, failed: failedCount, cellStatuses };

    } catch (error) {
        logger.exception(error, { function: 'processColumnGroup', column: group.columnLetter });
        throw error;
    } finally {
        await closePage(page, groupLabel);
    }
}

/**
 * Processes all vehicle column groups in parallel browser pages with INDEPENDENT LOGINS
 */
export async function processVehicleGroupsInParallel(context, vehicleGroups, worksheet, portalUrl) {
    try {
        logger.info(`${'═'.repeat(60)}`);
        logger.info(`BATCH START — ${vehicleGroups.length} group(s)`);
        logger.info(`${'═'.repeat(60)}`);

        const processPromises = vehicleGroups.map(group =>
            processColumnGroup(context, group, worksheet, portalUrl)
        );

        const results = await Promise.allSettled(processPromises);

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
                    failedCount: failed
                });
            } else {
                failedGroups.push({ column: group.columnLetter, error: result.reason.message });
                logger.error(`Column Group ${group.columnLetter} failed`, { error: result.reason.message });
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
            totalRecords: vehicleGroups.reduce((sum, g) => sum + g.vehicles.length, 0)
        };

    } catch (error) {
        logger.exception(error, { function: 'processVehicleGroupsInParallel' });
        throw error;
    }
}
