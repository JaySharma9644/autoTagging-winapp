/**
 * Status Report Generator Module
 * Creates and maintains a status worksheet tracking record processing results with color-coded text
 */

// Color codes for different statuses (for text color, not background)
const TEXT_COLOR_CODES = {
    tagged: 'FF00B050',        // Green - Successfully tagged
    alreadyTagged: 'FFFF0000',  // Red - Already tagged/Skipped
    failed: 'FFFF9900',         // Orange - Failed
    pending: 'FF000000'         // Black - Pending/Not processed
};

// Border style for all cells
const CELL_BORDER = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } }
};

/**
 * Creates a new worksheet for status reporting that mirrors the original data structure
 */
export function createStatusWorksheet(workbook, originalWorksheet) {
    // Remove existing Status worksheet if present
    const existingSheet = workbook.getWorksheet('Status Report');
    if (existingSheet) {
        workbook.removeWorksheet(existingSheet.id);
    }

    const statusWorksheet = workbook.addWorksheet('Status Report');

    // Copy header from original worksheet (row 1)
    const originalHeaders = [];
    for (let col = 1; col <= originalWorksheet.columnCount; col++) {
        const headerCell = originalWorksheet.getCell(1, col);
        originalHeaders.push(headerCell.value || `Column ${col}`);
    }

    // Set columns with appropriate widths
    const columns = originalHeaders.map((header, index) => ({
        header: header,
        key: `col${index}`,
        width: 18
    }));

    statusWorksheet.columns = columns;

    // Style header row
    const headerRow = statusWorksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'center' };

    for (let i = 1; i <= columns.length; i++) {
        headerRow.getCell(i).border = CELL_BORDER;
    }

    // Copy data from original worksheet (starting from row 2)
    for (let row = 2; row <= originalWorksheet.rowCount; row++) {
        const rowData = {};
        for (let col = 1; col <= originalWorksheet.columnCount; col++) {
            const cell = originalWorksheet.getCell(row, col);
            rowData[`col${col - 1}`] = cell.value;
        }
        statusWorksheet.addRow(rowData);
    }

    // Apply borders to all data cells
    for (let row = 2; row <= statusWorksheet.rowCount; row++) {
        for (let col = 1; col <= columns.length; col++) {
            statusWorksheet.getCell(row, col).border = CELL_BORDER;
        }
    }

    return statusWorksheet;
}

/**
 * Updates a cell in the status worksheet with text color based on processing status
 */
export function updateCellStatus(statusWorksheet, row, column, status) {
    const cell = statusWorksheet.getCell(row, column);

    let textColor = TEXT_COLOR_CODES.pending;
    if (status === 'success') {
        textColor = TEXT_COLOR_CODES.tagged;
    } else if (status === 'skipped') {
        textColor = TEXT_COLOR_CODES.alreadyTagged;
    } else if (status === 'failed') {
        textColor = TEXT_COLOR_CODES.failed;
    }

    cell.font = { color: { argb: textColor }, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'center' };
    cell.border = CELL_BORDER;
}

/**
 * Adds a legend worksheet explaining the color coding
 */
export function addLegendWorksheet(workbook) {
    // Remove existing Legend if present
    const existingLegend = workbook.getWorksheet('Legend');
    if (existingLegend) {
        workbook.removeWorksheet(existingLegend.id);
    }

    const legendWorksheet = workbook.addWorksheet('Legend');

    // Title row
    const titleRow = legendWorksheet.addRow(['STATUS LEGEND']);
    titleRow.font = { bold: true, size: 14 };
    titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } };
    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleRow.getCell(1).border = CELL_BORDER;

    const emptyRow = legendWorksheet.addRow([]);
    emptyRow.getCell(1).border = CELL_BORDER;

    const legendData = [
        ['Status', 'Text Color', 'Meaning'],
        ['Tagged', 'Green', 'Record was successfully tagged'],
        ['Already Tagged', 'Red', 'Record was already tagged, skipped'],
        ['Failed', 'Orange', 'Record processing failed'],
        ['Pending', 'Black', 'Record not yet processed']
    ];

    legendData.forEach((row, index) => {
        const newRow = legendWorksheet.addRow(row);

        if (index === 0) {
            newRow.font = { bold: true };
            newRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
            newRow.getCell(1).alignment = { horizontal: 'center', vertical: 'center' };
            newRow.getCell(2).alignment = { horizontal: 'center', vertical: 'center' };
            newRow.getCell(3).alignment = { horizontal: 'left', vertical: 'center' };
        } else {
            let textColor = TEXT_COLOR_CODES.pending;
            if (index === 1) textColor = TEXT_COLOR_CODES.tagged;
            else if (index === 2) textColor = TEXT_COLOR_CODES.alreadyTagged;
            else if (index === 3) textColor = TEXT_COLOR_CODES.failed;

            newRow.getCell(1).font = { color: { argb: textColor }, bold: true };
            newRow.getCell(2).font = { color: { argb: textColor }, bold: true };
            newRow.getCell(1).alignment = { horizontal: 'center', vertical: 'center' };
            newRow.getCell(2).alignment = { horizontal: 'center', vertical: 'center' };
            newRow.getCell(3).alignment = { horizontal: 'left', vertical: 'center' };
        }

        for (let i = 1; i <= 3; i++) {
            newRow.getCell(i).border = CELL_BORDER;
        }
    });

    legendWorksheet.columns = [
        { width: 18 },
        { width: 15 },
        { width: 40 }
    ];
}
