#!/usr/bin/env node

/**
 * History Log Analyzer
 * 
 * Usage:
 *   node analyze-logs.js                    # Analyze latest session
 *   node analyze-logs.js <session-id>       # Analyze specific session
 *   node analyze-logs.js --errors           # Show only errors
 *   node analyze-logs.js --vehicles         # Show vehicle summary
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_DIR = path.join(__dirname, 'history');

/**
 * Parse a log line into structured data
 */
function parseLogLine(line) {
    const parts = line.split(' | ');
    
    // Parse metadata key=value pairs
    const metadata = {};
    if (parts.length > 3) {
        const metaString = parts.slice(3).join(' | ');
        metaString.split(' | ').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) {
                metadata[key.trim()] = value.trim();
            }
        });
    }
    
    return {
        timestamp: parts[0]?.trim() || '',
        level: parts[1]?.trim() || '',
        message: parts[2]?.trim() || '',
        metadata
    };
}

/**
 * Load history file
 */
function loadHistoryFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(line => line.trim()).map(parseLogLine);
}

/**
 * Get latest session file
 */
function getLatestSessionFile() {
    const files = fs.readdirSync(HISTORY_DIR)
        .filter(f => f.startsWith('history_') && f.endsWith('.txt'))
        .sort()
        .reverse();
    
    if (files.length === 0) {
        console.error('❌ No history files found');
        process.exit(1);
    }
    
    return path.join(HISTORY_DIR, files[0]);
}

/**
 * Print colored output
 */
function colorize(text, color) {
    const colors = {
        'INFO': '\x1b[34m',      // Blue
        'SUCCESS': '\x1b[32m',   // Green
        'WARNING': '\x1b[33m',   // Yellow
        'ERROR': '\x1b[31m',     // Red
        'STEP': '\x1b[36m',      // Cyan
        'DEBUG': '\x1b[35m',     // Magenta
        'RESET': '\x1b[0m'
    };
    
    const colorCode = colors[color] || '';
    return colorCode ? `${colorCode}${text}\x1b[0m` : text;
}

/**
 * Analyze and display logs
 */
function analyzeLogs(logs, options = {}) {
    console.log('\n📊 LOG ANALYSIS');
    console.log('═'.repeat(80));
    
    // Summary statistics
    const stats = {
        total: logs.length,
        byLevel: {},
        errors: [],
        vehicles: {},
        timeline: []
    };
    
    logs.forEach(log => {
        // Count by level
        stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
        
        // Collect errors
        if (log.level === 'ERROR') {
            stats.errors.push({
                timestamp: log.timestamp,
                message: log.message,
                metadata: log.metadata
            });
        }
        
        // Collect vehicle data
        if (log.metadata.vehicle) {
            const vehicle = log.metadata.vehicle;
            if (!stats.vehicles[vehicle]) {
                stats.vehicles[vehicle] = {
                    logs: [],
                    status: 'Unknown'
                };
            }
            stats.vehicles[vehicle].logs.push(log);
            stats.vehicles[vehicle].status = log.level === 'SUCCESS' ? 'Success' : 
                                             log.level === 'WARNING' ? 'Skipped' : 
                                             log.level === 'ERROR' ? 'Failed' : 'Processing';
        }
    });
    
    // Calculate duration
    const firstLog = logs[0];
    const lastLog = logs[logs.length - 1];
    const startTime = new Date(firstLog?.timestamp);
    const endTime = new Date(lastLog?.timestamp);
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    // Display summary
    console.log('\n📈 SUMMARY');
    console.log(`Total Logs: ${stats.total}`);
    console.log(`Duration: ${duration} seconds`);
    console.log(`Time Range: ${firstLog?.timestamp} to ${lastLog?.timestamp}`);
    
    console.log('\n📋 LOGS BY LEVEL');
    Object.entries(stats.byLevel)
        .sort((a, b) => b[1] - a[1])
        .forEach(([level, count]) => {
            const icon = {
                'INFO': 'ℹ️',
                'SUCCESS': '✅',
                'WARNING': '⚠️',
                'ERROR': '❌',
                'STEP': '👉',
                'DEBUG': '🐛'
            }[level] || '•';
            
            console.log(`  ${icon} ${colorize(level, level)}: ${count}`);
        });
    
    // Display errors if requested or if there are any
    if (options.errors || stats.errors.length > 0) {
        console.log('\n⚠️  ERRORS & WARNINGS');
        if (stats.errors.length === 0) {
            console.log('  ✅ No errors found!');
        } else {
            stats.errors.forEach((err, idx) => {
                console.log(`\n  ${idx + 1}. ${colorize('❌ ERROR', 'ERROR')}`);
                console.log(`     Time: ${err.timestamp}`);
                console.log(`     Message: ${err.message}`);
                if (Object.keys(err.metadata).length > 0) {
                    console.log(`     Details:`);
                    Object.entries(err.metadata).forEach(([key, value]) => {
                        console.log(`       - ${key}: ${value}`);
                    });
                }
            });
        }
    }
    
    // Display vehicle summary if requested
    if (options.vehicles || Object.keys(stats.vehicles).length > 0) {
        console.log('\n🚗 VEHICLE PROCESSING SUMMARY');
        
        const vehicleStats = {
            success: 0,
            failed: 0,
            skipped: 0
        };
        
        Object.entries(stats.vehicles).forEach(([vehicle, data]) => {
            if (data.status === 'Success') vehicleStats.success++;
            else if (data.status === 'Failed') vehicleStats.failed++;
            else if (data.status === 'Skipped') vehicleStats.skipped++;
        });
        
        console.log(`  Total: ${Object.keys(stats.vehicles).length}`);
        console.log(`  ${colorize('✅ Success:', 'SUCCESS')} ${vehicleStats.success}`);
        console.log(`  ${colorize('❌ Failed:', 'ERROR')} ${vehicleStats.failed}`);
        console.log(`  ${colorize('⚠️  Skipped:', 'WARNING')} ${vehicleStats.skipped}`);
        
        if (options.vehicles && Object.keys(stats.vehicles).length <= 50) {
            console.log('\n  Vehicle Details:');
            Object.entries(stats.vehicles)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .forEach(([vehicle, data]) => {
                    const statusIcon = data.status === 'Success' ? '✅' : 
                                     data.status === 'Failed' ? '❌' : 
                                     data.status === 'Skipped' ? '⚠️' : '⏳';
                    console.log(`    ${statusIcon} ${vehicle}: ${data.status}`);
                });
        }
    }
    
    // Display all logs if detailed view
    if (options.detail) {
        console.log('\n📝 DETAILED LOG OUTPUT');
        console.log('─'.repeat(80));
        logs.forEach(log => {
            const icon = {
                'INFO': 'ℹ️',
                'SUCCESS': '✅',
                'WARNING': '⚠️',
                'ERROR': '❌',
                'STEP': '👉',
                'DEBUG': '🐛'
            }[log.level] || '•';
            
            console.log(`${log.timestamp} ${icon} ${colorize(log.level, log.level)}`);
            console.log(`  ${log.message}`);
            if (Object.keys(log.metadata).length > 0) {
                Object.entries(log.metadata).forEach(([key, value]) => {
                    console.log(`    • ${key}: ${value}`);
                });
            }
        });
    }
    
    console.log('\n' + '═'.repeat(80));
}

/**
 * Main function
 */
function main() {
    const args = process.argv.slice(2);
    let historyFile;
    const options = {
        errors: false,
        vehicles: false,
        detail: false
    };
    
    // Parse arguments
    args.forEach(arg => {
        if (arg === '--errors') options.errors = true;
        else if (arg === '--vehicles') options.vehicles = true;
        else if (arg === '--detail') options.detail = true;
        else if (!arg.startsWith('--')) {
            historyFile = path.join(HISTORY_DIR, `history_${arg}.txt`);
        }
    });
    
    // Get history file
    if (!historyFile) {
        historyFile = getLatestSessionFile();
        console.log(`📂 Latest session: ${path.basename(historyFile)}\n`);
    } else {
        console.log(`📂 Session: ${path.basename(historyFile)}\n`);
    }
    
    // Load and analyze
    const logs = loadHistoryFile(historyFile);
    analyzeLogs(logs, options);
    
    // Show available options if this is the latest file
    if (!args.some(arg => !arg.startsWith('--'))) {
        console.log('\n💡 TIP: Add flags for more details:');
        console.log('   --errors    Show error details');
        console.log('   --vehicles  Show vehicle summary');
        console.log('   --detail    Show all logs with full details\n');
    }
}

// Run analyzer
main();
