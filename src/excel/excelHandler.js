/**
 * Excel Handler Module
 * Handles Excel file read/write operations
 */

import ExcelJS from 'exceljs';
import { logger } from '../config.js';

/**
 * Loads Excel workbook and returns the worksheet
 */
export async function loadExcelFile(filePath) {
    try {
        logger.step('Loading Excel file', { file: filePath });
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.worksheets[0];
        
        if (!worksheet) {
            throw new Error(`No worksheet found in Excel file: ${filePath}`);
        }
        
        logger.success('Excel file loaded', { 
            rows: worksheet.rowCount, 
            columns: worksheet.columnCount 
        });
        
        return { workbook, worksheet };
    } catch (error) {
        logger.exception(error, { function: 'loadExcelFile' });
        throw error;
    }
}

/**
 * Saves Excel workbook to file
 */
export async function saveExcelFile(workbook, filePath) {
    try {
        logger.step('Saving progress to Excel');
        await workbook.xlsx.writeFile(filePath);
        logger.success('Progress saved successfully');
    } catch (error) {
        logger.exception(error, { stage: 'Excel Save' });
        throw error;
    }
}
