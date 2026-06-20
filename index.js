/**
 * AutoTagging Bot - Main Orchestrator
 * Entry point that coordinates all modules for parallel vehicle tagging
 */

import { CONFIG, logger, validateEnvironment } from './src/config.js';
import { initializeBrowser, closeBrowser } from './src/browser/browserManager.js';
import { loadExcelFile, saveExcelFile } from './src/excel/excelHandler.js';
import { extractColumnWiseGroups } from './src/excel/dataExtractor.js';
import { processVehicleGroupsInParallel } from './src/processor/batchProcessor.js';
import { createStatusWorksheet, updateCellStatus, addLegendWorksheet } from './src/excel/statusReportGenerator.js';

/**
 * Main execution block - orchestrates the entire RPA process
 */
async function run() {
    let browser;
    let workbook;
    
    try {
        logger.step('Starting RPA Process...');
        logger.info('Initializing AutoTagging Bot');
        
        // Validate environment variables
        validateEnvironment();
        
        // 1. Load Excel Data
        const excelData = await loadExcelFile(CONFIG.EXCEL_FILE_PATH);
        workbook = excelData.workbook;
        const worksheet = excelData.worksheet;
        
        // 2. Initialize Browser
        const browserData = await initializeBrowser();
        browser = browserData.browser;
        const context = browserData.context;
        
        // 3. Extract column-wise vehicle groups
        logger.step('Extracting vehicle groups column-wise');
        const vehicleGroups = extractColumnWiseGroups(worksheet);
        logger.info(`Found ${vehicleGroups.length} column groups to process`, { 
            groups: vehicleGroups.map(g => ({ column: g.columnLetter, count: g.vehicles.length }))
        });
        
        // 4. Process all column groups in PARALLEL with independent logins
        logger.step('Starting parallel batch processing with independent logins');
        const processingResults = await processVehicleGroupsInParallel(context, vehicleGroups, worksheet, CONFIG.PORTAL_URL);
        
        // 5. Create and populate status worksheet with color coding
        logger.step('Generating color-coded status report');
        const statusWorksheet = createStatusWorksheet(workbook, worksheet);
        
        if (processingResults && processingResults.allCellStatuses) {
            // Apply colors to each processed cell
            processingResults.allCellStatuses.forEach(cellStatus => {
                updateCellStatus(statusWorksheet, cellStatus.row, cellStatus.column, cellStatus.status);
            });
            
            logger.success('Color-coded status applied to all processed records', {
                totalProcessed: processingResults.allCellStatuses.length
            });
        }
        
        // 6. Add legend worksheet
        logger.step('Adding legend to workbook');
        addLegendWorksheet(workbook);
        
        logger.success('RPA Process completed successfully');

    } catch (error) {
        logger.exception(error, { stage: 'Main Execution' });
    } finally {
        // Save progress and cleanup
        if (workbook) {
            try {
                await saveExcelFile(workbook, CONFIG.EXCEL_FILE_PATH);
                logger.success('Excel file with status report saved');
            } catch (error) {
                logger.exception(error, { stage: 'Excel Save' });
            }
        }
        
        if (browser) {
            await closeBrowser(browser);
        }
        
        // Save final session report
        logger.saveSessionReport();
        logger.info('Process terminated');
    }
}

// Execute script
run();