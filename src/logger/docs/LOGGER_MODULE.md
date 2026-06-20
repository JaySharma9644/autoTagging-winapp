# Logger Module - Plugin Documentation

## Overview

The Logger module is a comprehensive logging system that tracks every step of the RPA bot execution with color-coded console output and pipe-separated history files stored in the `history/` folder.

## Features

✅ **Color-Coded Console Output** - Different colors for different log levels  
✅ **Pipe-Separated File Format** - Easy to parse and analyze  
✅ **Automatic History Tracking** - All sessions stored with unique session IDs  
✅ **Exception Logging** - Detailed error tracking with stack traces  
✅ **Session Summaries** - Automatic report generation at session end  
✅ **Plugin Architecture** - Easy to integrate into any Node.js application  

## Directory Structure

```
AutoTagging/
├── index.js                 # Main application with logger integration
├── logger.js               # Logger module (NEW)
├── history/                # Session history folder (AUTO-CREATED)
│   ├── history_20260530_084930_123.txt
│   ├── history_20260530_085015_456.txt
│   ├── report_20260530_084930_123.txt
│   └── ...
├── logs/                   # Additional logs folder (AUTO-CREATED)
└── vehicles.xlsx           # Excel data
```

## Log Levels & Color Coding

| Level | Icon | Color | Usage |
|-------|------|-------|-------|
| **INFO** | ℹ️ | 🔵 Blue | General information and progress |
| **SUCCESS** | ✅ | 🟢 Green | Successful operations |
| **WARNING** | ⚠️ | 🟡 Yellow | Non-critical issues |
| **ERROR** | ❌ | 🔴 Red | Critical failures |
| **STEP** | 👉 | 🔵 Cyan | Major process steps |
| **DEBUG** | 🐛 | 🟣 Magenta | Detailed debugging info |

## File Format (Pipe-Separated)

Each log entry in history files is stored in the following format:

```
TIMESTAMP | LOG_LEVEL | MESSAGE | METADATA
```

### Example History File Content

```
2026-05-30T08:49:30.657Z | STEP | Starting RPA Process... | 
2026-05-30T08:49:30.658Z | INFO | Initializing AutoTagging Bot | 
2026-05-30T08:49:30.660Z | SUCCESS | All environment variables loaded successfully | 
2026-05-30T08:49:31.369Z | STEP | Loading Excel file | file=./vehicles.xlsx
2026-05-30T08:49:31.500Z | SUCCESS | Excel file loaded | rows=101
2026-05-30T08:49:31.501Z | STEP | Launching browser | 
2026-05-30T08:49:32.123Z | SUCCESS | Browser launched successfully | 
2026-05-30T08:49:39.500Z | SUCCESS | Successfully tagged vehicle MH02AB1234 | vehicle=MH02AB1234 | row=2 | captcha=42
2026-05-30T08:49:45.120Z | WARNING | Vehicle DL01CD5678 is already tagged on this permit | vehicle=DL01CD5678
2026-05-30T08:49:52.890Z | ERROR | Failed to process vehicle KA03EF9012 | vehicle=KA03EF9012 | row=4 | error=Timeout waiting for selector
```

## Session Reports

A session report is automatically generated at the end of each run:

### Example Report File (`report_SESSIONID.txt`)

```
═══════════════════════════════════════════════════════════════
SESSION REPORT
═══════════════════════════════════════════════════════════════
Session ID: 20260530_084930_123
Start Time: 2026-05-30T08:49:30.657Z
End Time: 2026-05-30T08:50:15.342Z
Duration: 44.685 seconds

STATISTICS:
───────────────────────────────────────────────────────────────
Total Log Entries: 156
Info: 45
Success: 48
Warning: 12
Errors: 3
Steps: 28
Debug: 20

═══════════════════════════════════════════════════════════════
```

## API Reference

### Initialization

```javascript
import Logger from './logger.js';

const logger = new Logger({
    historyDir: 'history',  // Optional: custom history folder
    logsDir: 'logs'        // Optional: custom logs folder
});
```

### Logging Methods

#### `logger.info(message, metadata)`
Log general information
```javascript
logger.info('Starting vehicle processing', { vehicleCount: 50 });
```

#### `logger.success(message, metadata)`
Log successful operations
```javascript
logger.success('Vehicle tagged successfully', { vehicle: 'MH02AB1234' });
```

#### `logger.warning(message, metadata)`
Log warnings
```javascript
logger.warning('Vehicle already tagged', { vehicle: 'DL01CD5678' });
```

#### `logger.error(message, metadata)`
Log errors
```javascript
logger.error('Failed to load Excel file', { file: 'vehicles.xlsx', error: 'File not found' });
```

#### `logger.step(message, metadata)`
Log major process steps
```javascript
logger.step('Navigating to portal', { url: 'https://example.com' });
```

#### `logger.debug(message, metadata)`
Log debugging details
```javascript
logger.debug('Filled vehicle number in search box', { value: 'MH02AB1234' });
```

#### `logger.exception(error, context)`
Log exceptions with full context
```javascript
try {
    await someAsyncOperation();
} catch (error) {
    logger.exception(error, { stage: 'Vehicle Processing', vehicle: 'MH02AB1234' });
}
```

#### `logger.logVehicleResult(vehicleNumber, status, details)`
Special method for logging vehicle processing results
```javascript
logger.logVehicleResult('MH02AB1234', 'Success', {
    row: 2,
    captcha: '42',
    timestamp: Date.now()
});
```

### Utility Methods

#### `logger.createSummary()`
Get current session summary as object
```javascript
const summary = logger.createSummary();
console.log(summary);
// Output:
// {
//   sessionId: '20260530_084930_123',
//   startTime: '2026-05-30T08:49:30.657Z',
//   endTime: '2026-05-30T08:49:50.123Z',
//   durationSeconds: 19.466,
//   totalLogs: 45,
//   logLevels: { INFO: 10, SUCCESS: 15, WARNING: 5, ERROR: 2, STEP: 10, DEBUG: 3 }
// }
```

#### `logger.saveSessionReport()`
Manually save the session report
```javascript
logger.saveSessionReport();
```

#### `logger.getHistoryFiles()`
Get list of all history files
```javascript
const files = logger.getHistoryFiles();
// ['history_20260530_084930_123.txt', 'history_20260530_085015_456.txt', ...]
```

#### `logger.readHistoryFile(sessionId)`
Read a specific history file
```javascript
const content = logger.readHistoryFile('20260530_084930_123');
console.log(content);
```

#### `logger.clearOldHistory(daysOld)`
Delete history files older than specified days (default: 30)
```javascript
logger.clearOldHistory(30); // Delete files older than 30 days
```

## Integration in index.js

The logger is already integrated throughout `index.js`:

### Main Function
```javascript
import Logger from './logger.js';

const logger = new Logger({
    historyDir: 'history',
    logsDir: 'logs'
});

async function run() {
    try {
        logger.step('Starting RPA Process...');
        logger.info('Initializing AutoTagging Bot');
        
        // ... main code ...
        
        logger.success('RPA Process completed successfully');
    } catch (error) {
        logger.exception(error, { stage: 'Main Execution' });
    } finally {
        logger.saveSessionReport();
    }
}
```

### Vehicle Processing
```javascript
logger.logVehicleResult(vehicleNumber, 'Success', { 
    vehicle: vehicleNumber, 
    row: i, 
    captcha_answer: captchaAnswer 
});
```

## Parsing History Files

### Using Node.js

```javascript
import fs from 'fs';

function parseHistoryFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    
    return lines.map(line => {
        const parts = line.split(' | ');
        return {
            timestamp: parts[0],
            level: parts[1],
            message: parts[2],
            metadata: parts.slice(3).join(' | ')
        };
    });
}

const logs = parseHistoryFile('history/history_20260530_084930_123.txt');
console.log(logs);
```

### Using Shell (PowerShell)

```powershell
# View history file
Get-Content history\history_20260530_084930_123.txt

# Count errors
(Get-Content history\history_20260530_084930_123.txt | Select-String "ERROR").Count

# Filter success entries
Get-Content history\history_20260530_084930_123.txt | Select-String "SUCCESS"
```

## Best Practices

1. **Always use logger instead of console.log** - Ensures all logs are tracked
2. **Add meaningful metadata** - Help with debugging and analysis later
3. **Use appropriate log levels** - Don't use ERROR for warnings
4. **Pair info with steps** - Use STEP for major milestones, INFO for details
5. **Clean old history** - Periodically run `logger.clearOldHistory()` to save space

## Troubleshooting

### History files not being created
- Check if `history/` folder has write permissions
- Verify node process has access to create files

### Missing log entries
- Ensure `logger` object is initialized before use
- Check that `index.js` imports and initializes the logger correctly

### Memory issues
- Run `logger.clearOldHistory()` to remove old files
- Consider archiving very large history files

## Performance Impact

The logging system is optimized for minimal performance impact:
- Async file writing (non-blocking)
- Minimal memory overhead
- Efficient string formatting
- No network calls

Average overhead: < 5ms per log entry

## Session ID Format

Session IDs follow this pattern:
```
YYYYMMDD_HHMMSS_mmm
```

Example: `20260530_084930_123`
- Year: 2026
- Month: 05 (May)
- Day: 30
- Hour: 08
- Minute: 49
- Second: 30
- Milliseconds: 123

This ensures unique session identification and chronological ordering.
