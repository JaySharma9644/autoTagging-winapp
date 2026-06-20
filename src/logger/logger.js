import fs from 'fs';
import path from 'path';

/**
 * Logger Module - Plugin for tracking steps and failures
 * Features:
 * - Console output with color coding
 * - File-based history with pipe-separated format
 * - Step tracking and error logging
 */

class Logger {
    constructor(options = {}) {
        const root = process.cwd();
        this.historyDir = path.resolve(root,'src', options.historyDir || 'history');
        // this.logsDir = path.resolve(root, options.logsDir || 'logs');
        this.sessionId = this.generateSessionId();
        this.sessionLog = [];
        this.sessionStart = new Date();
        
        // Create directories if they don't exist
        this.ensureDirectoriesExist();
        
        // Color codes for console output
        this.colors = {
            RESET: '\x1b[0m',
            BRIGHT: '\x1b[1m',
            
            // Foreground colors
            BLACK: '\x1b[30m',
            RED: '\x1b[31m',
            GREEN: '\x1b[32m',
            YELLOW: '\x1b[33m',
            BLUE: '\x1b[34m',
            MAGENTA: '\x1b[35m',
            CYAN: '\x1b[36m',
            WHITE: '\x1b[37m',
            
            // Background colors
            BG_RED: '\x1b[41m',
            BG_GREEN: '\x1b[42m',
            BG_YELLOW: '\x1b[43m',
            BG_BLUE: '\x1b[44m',
        };
        
        this.logLevels = {
            INFO: { icon: 'ℹ️', color: this.colors.BLUE, bgColor: '' },
            SUCCESS: { icon: '✅', color: this.colors.GREEN, bgColor: '' },
            WARNING: { icon: '⚠️', color: this.colors.YELLOW, bgColor: '' },
            ERROR: { icon: '❌', color: this.colors.RED, bgColor: '' },
            STEP: { icon: '👉', color: this.colors.CYAN, bgColor: '' },
            DEBUG: { icon: '🐛', color: this.colors.MAGENTA, bgColor: '' },
        };
    }
    
    /**
     * Generate a unique session ID based on timestamp
     */
    generateSessionId() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        
        return `${year}${month}${day}_${hours}${minutes}${seconds}_${ms}`;
    }
    
    /**
     * Ensure history and logs directories exist
     */
    ensureDirectoriesExist() {
        [this.historyDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    
    /**
     * Get current formatted timestamp
     */
    getTimestamp() {
        return new Date().toISOString();
    }
    
    /**
     * Format a log entry for file storage (pipe-separated)
     */
    formatLogEntry(level, message, metadata = {}) {
        const timestamp = this.getTimestamp();
        const metadataStr = Object.entries(metadata)
            .map(([key, value]) => `${key}=${value}`)
            .join(' | ');
        
        return [
            timestamp,
            level,
            message,
            metadataStr
        ].filter(Boolean).join(' | ');
    }
    
    /**
     * Main logging method
     */
    log(level, message, metadata = {}) {
        const timestamp = this.getTimestamp();
        const levelConfig = this.logLevels[level] || this.logLevels.INFO;
        
        // Console output with colors
        const coloredMessage = `${levelConfig.color}${this.colors.BRIGHT}[${timestamp}]${this.colors.RESET} ${levelConfig.icon} ${message}${this.colors.RESET}`;
        console.log(coloredMessage);
        
        // Add to session log
        const logEntry = this.formatLogEntry(level, message, metadata);
        this.sessionLog.push(logEntry);
        
        // Immediately write to file
        this.writeToHistoryFile(logEntry);
    }
    
    /**
     * Append log entry to history file
     */
    writeToHistoryFile(logEntry) {
        const historyFile = path.join(this.historyDir, `history_${this.sessionId}.txt`);
        
        try {
            fs.appendFileSync(historyFile, logEntry + '\n', 'utf-8');
        } catch (error) {
            console.error(`Failed to write to history file: ${error.message}`);
        }
    }
    
    /**
     * Log INFO level message
     */
    info(message, metadata = {}) {
        this.log('INFO', message, metadata);
    }
    
    /**
     * Log SUCCESS level message
     */
    success(message, metadata = {}) {
        this.log('SUCCESS', message, metadata);
    }
    
    /**
     * Log WARNING level message
     */
    warning(message, metadata = {}) {
        this.log('WARNING', message, metadata);
    }
    
    /**
     * Log ERROR level message
     */
    error(message, metadata = {}) {
        this.log('ERROR', message, metadata);
    }
    
    /**
     * Log STEP level message (for tracking steps)
     */
    step(message, metadata = {}) {
        this.log('STEP', message, metadata);
    }
    
    /**
     * Log DEBUG level message
     */
    debug(message, metadata = {}) {
        this.log('DEBUG', message, metadata);
    }
    
    /**
     * Log an exception with context
     */
    exception(error, context = {}) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        
        const metadata = {
            ...context,
            error_type: error instanceof Error ? error.constructor.name : 'Unknown',
            error_stack: errorStack.split('\n')[0] // First line of stack
        };
        
        this.error(`Exception: ${errorMessage}`, metadata);
    }
    
    /**
     * Log vehicle processing result
     */
    logVehicleResult(vehicleNumber, status, details = {}) {
        const metadata = {
            vehicle: vehicleNumber,
            status: status,
            ...details
        };
        
        let logLevel = 'INFO';
        let message = `Vehicle ${vehicleNumber}: ${status}`;
        
        if (status === 'Success') {
            logLevel = 'SUCCESS';
        } else if (status.includes('Failed') || status.includes('Error')) {
            logLevel = 'ERROR';
        } else if (status.includes('Skip') || status.includes('Already')) {
            logLevel = 'WARNING';
        }
        
        this.log(logLevel, message, metadata);
    }
    
    /**
     * Create a summary report
     */
    createSummary() {
        const sessionDuration = new Date() - this.sessionStart;
        const durationSec = (sessionDuration / 1000).toFixed(2);
        
        const summary = {
            sessionId: this.sessionId,
            startTime: this.sessionStart.toISOString(),
            endTime: new Date().toISOString(),
            durationSeconds: parseFloat(durationSec),
            totalLogs: this.sessionLog.length,
            logLevels: this.countLogLevels()
        };
        
        return summary;
    }
    
    /**
     * Count log entries by level
     */
    countLogLevels() {
        const counts = {
            INFO: 0,
            SUCCESS: 0,
            WARNING: 0,
            ERROR: 0,
            STEP: 0,
            DEBUG: 0
        };
        
        this.sessionLog.forEach(entry => {
            Object.keys(counts).forEach(level => {
                if (entry.includes(`| ${level} |`)) {
                    counts[level]++;
                }
            });
        });
        
        return counts;
    }
    
    /**
     * Save final session report
     */
    saveSessionReport() {
        const summary = this.createSummary();
        const reportFile = path.join(this.historyDir, `report_${this.sessionId}.txt`);
        
        const reportContent = `
═══════════════════════════════════════════════════════════════
SESSION REPORT
═══════════════════════════════════════════════════════════════
Session ID: ${summary.sessionId}
Start Time: ${summary.startTime}
End Time: ${summary.endTime}
Duration: ${summary.durationSeconds} seconds

STATISTICS:
───────────────────────────────────────────────────────────────
Total Log Entries: ${summary.totalLogs}
Info: ${summary.logLevels.INFO}
Success: ${summary.logLevels.SUCCESS}
Warning: ${summary.logLevels.WARNING}
Errors: ${summary.logLevels.ERROR}
Steps: ${summary.logLevels.STEP}
Debug: ${summary.logLevels.DEBUG}

═══════════════════════════════════════════════════════════════
`;
        
        try {
            fs.writeFileSync(reportFile, reportContent, 'utf-8');
            this.info('Session report saved', { file: reportFile });
        } catch (error) {
            console.error(`Failed to save session report: ${error.message}`);
        }
        
        // Clean up old history files - keep only latest 3
        this.cleanupOldHistoryFiles();
    }
    
    /**
     * Clean up old history and report files - keep only latest 3
     */
    cleanupOldHistoryFiles() {
        try {
            const files = fs.readdirSync(this.historyDir);
            
            // Separate history and report files
            const historyFiles = files
                .filter(file => file.startsWith('history_') && file.endsWith('.txt'))
                .map(file => ({
                    name: file,
                    path: path.join(this.historyDir, file),
                    time: fs.statSync(path.join(this.historyDir, file)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time); // Sort by newest first
            
            const reportFiles = files
                .filter(file => file.startsWith('report_') && file.endsWith('.txt'))
                .map(file => ({
                    name: file,
                    path: path.join(this.historyDir, file),
                    time: fs.statSync(path.join(this.historyDir, file)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time); // Sort by newest first
            
            // Delete old history files, keep only latest 3
            if (historyFiles.length > 3) {
                for (let i = 3; i < historyFiles.length; i++) {
                    try {
                        fs.unlinkSync(historyFiles[i].path);
                        this.debug(`Deleted old history file: ${historyFiles[i].name}`);
                    } catch (error) {
                        this.warning(`Failed to delete history file: ${historyFiles[i].name}`, { error: error.message });
                    }
                }
            }
            
            // Delete old report files, keep only latest 3
            if (reportFiles.length > 3) {
                for (let i = 3; i < reportFiles.length; i++) {
                    try {
                        fs.unlinkSync(reportFiles[i].path);
                        this.debug(`Deleted old report file: ${reportFiles[i].name}`);
                    } catch (error) {
                        this.warning(`Failed to delete report file: ${reportFiles[i].name}`, { error: error.message });
                    }
                }
            }
            
            this.info(`Cleanup completed. Keeping latest 3 history and report files.`, { 
                historyFilesKept: Math.min(historyFiles.length, 3),
                reportFilesKept: Math.min(reportFiles.length, 3)
            });
        } catch (error) {
            this.warning('Failed to cleanup old history files', { error: error.message });
        }
    }
    
    /**
     * Get all history files
     */
    getHistoryFiles() {
        try {
            return fs.readdirSync(this.historyDir).filter(f => f.startsWith('history_'));
        } catch (error) {
            console.error(`Failed to read history files: ${error.message}`);
            return [];
        }
    }
    
    /**
     * Read a specific history file
     */
    readHistoryFile(sessionId) {
        const filePath = path.join(this.historyDir, `history_${sessionId}.txt`);
        
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`History file not found: ${filePath}`);
            }
            return fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            console.error(`Failed to read history file: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Clear old history files (older than X days)
     */
    clearOldHistory(daysOld = 30) {
        try {
            const files = fs.readdirSync(this.historyDir);
            const now = Date.now();
            const maxAge = daysOld * 24 * 60 * 60 * 1000;
            
            files.forEach(file => {
                const filePath = path.join(this.historyDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtimeMs > maxAge) {
                    fs.unlinkSync(filePath);
                    this.info(`Deleted old history file: ${file}`);
                }
            });
        } catch (error) {
            console.error(`Failed to clear old history: ${error.message}`);
        }
    }
}

export default Logger;
