/**
 * Data Extractor Module
 * Extracts vehicle data from Excel worksheet
 */

import { logger } from '../config.js';
import { getColumnLetter } from '../utils/helpers.js';

/**
 * Extracts vehicles from worksheet organized column-wise starting from row 2
 * Returns an array of column groups with vehicles and their cell references
 */
export function extractColumnWiseGroups(worksheet) {
    const groups = [];
    const columnCount = worksheet.columnCount;
    const rowCount = worksheet.rowCount;
    
    logger.debug(`Extracting column groups. Columns: ${columnCount}, Rows: ${rowCount}`);
    
    // Iterate through columns
    for (let col = 1; col <= columnCount; col++) {
        const vehicles = [];
        
        for (let row = 2; row <= rowCount; row++) {
            const cell = worksheet.getCell(row, col);
            const vehicleNumber = cell.value;
            
            if (vehicleNumber && vehicleNumber.toString().trim()) {
                vehicles.push({
                    vehicle: vehicleNumber.toString().trim(),
                    row: row,
                    column: col,
                    cell: cell
                });
            }
        }
        
        // Only add column group if it has vehicles
        if (vehicles.length > 0) {
            groups.push({
                column: col,
                columnLetter: getColumnLetter(col),
                vehicles: vehicles,
                stats: { success: 0, skipped: 0, failed: 0 }
            });
            logger.debug(`Column ${getColumnLetter(col)}: Found ${vehicles.length} vehicles`);
        }
    }
    
    return groups;
}
