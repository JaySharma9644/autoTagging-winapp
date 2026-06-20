# AutoTagging Bot - Logging Guide

## Overview
The AutoTagging RPA bot now includes comprehensive logging functionality that records all activities in structured text files.

## Log Files Generated

### 1. **Main Execution Log** (`execution_YYYY-MM-DD_HH-MM-SS.log`)
- **Location**: `logs/` directory
- **Purpose**: Records all system events, authentication, navigation, and errors
- **Format**: Timestamped log entries with severity levels

**Sample Format:**
```
[2026-05-30T08:49:30.657Z] [INFO] ℹ️  Environment variables loaded successfully
[2026-05-30T08:49:30.658Z] [INFO] ℹ️  GEMINI_API_KEY: ✓ Set
[2026-05-30T08:49:30.660Z] [INFO] ℹ️  PORTAL_USER_ID: ✓ Set
[2026-05-30T08:49:31.369Z] [SUCCESS] ✅ Browser launched successfully
[2026-05-30T08:49:38.918Z] [ERROR] ❌ Authentication failed | Error: locator.fill: ...
```

### 2. **Vehicle Processing Log** (`vehicles_YYYY-MM-DD_HH-MM-SS.csv`)
- **Location**: `logs/` directory
- **Purpose**: Tabular record of each vehicle processed with status and details
- **Format**: Tab-separated values with headers

**Column Structure:**
| Timestamp | Vehicle Number | Status | Details |
|-----------|----------------|--------|---------|
| 2026-05-30T08:49:39.500Z | MH02AB1234 | Success | Tagged successfully with answer: 42 |
| 2026-05-30T08:49:45.120Z | DL01CD5678 | Already Tagged | Vehicle was previously tagged |
| 2026-05-30T08:49:52.890Z | KA03EF9012 | Failed | Timeout waiting for selector |

## Log Levels

The logger supports multiple severity levels with visual indicators:

### 📋 Log Types

| Type | Icon | Usage | Color |
|------|------|-------|-------|
| **INFO** | ℹ️  | General information and progress updates | Blue |
| **SUCCESS** | ✅ | Successful operations completed | Green |
| **WARNING** | ⚠️  | Non-critical issues and recoverable errors | Yellow |
| **ERROR** | ❌ | Critical failures and exceptions | Red |

## Key Events Logged

### System Startup
- Environment variables loading
- Configuration validation
- Excel file reading
- Browser initialization

### Authentication Flow
- Portal connection
- Credential entry
- Login submission
- Authentication success/failure

### Navigation Steps
- Menu clicks (Epass, Request for Vehicle, etc.)
- Page transitions
- Element visibility checks

### Vehicle Processing
- Vehicle number entry
- Search execution
- Captcha extraction and solving
- Form submission
- Success/failure outcomes

### Error Handling
- Connection failures
- Timeout errors
- Missing elements
- API failures
- Recovery actions

## Accessing Logs

### View Latest Logs
```powershell
# View main execution log
type logs\execution_*.log

# View vehicle processing log
type logs\vehicles_*.csv
```

### Open in Excel (CSV)
1. Open the `vehicles_YYYY-MM-DD_HH-MM-SS.csv` file with Excel
2. Use "Text to Columns" feature to format tab-separated data
3. Adjust column widths for better readability

### Filter Logs
```powershell
# Show only errors
Select-String "ERROR" logs\execution_*.log

# Show only successful vehicles
Select-String "Success" logs\vehicles_*.csv
```

## Log Summary

At the end of each execution, a summary is displayed:
```
═════════════════════════════════════
Vehicle Queue Processing Summary:
Total Successfully Tagged: 3
Total Skipped: 2
Total Failed: 0
═════════════════════════════════════
```

## Using Logs for Debugging

### 1. **Track Execution Flow**
- Review main execution log to see where the process stopped
- Identify which step failed with detailed error messages

### 2. **Verify Vehicle Processing**
- Check vehicle log to see per-vehicle status
- Identify which vehicles need manual attention

### 3. **Analyze Failures**
- Search for ERROR entries to find issues
- Review stack traces for detailed error information
- Use timestamps to correlate with application events

### 4. **Monitor Progress**
- Review vehicle log to check processing status
- Track captcha solving accuracy (if captcha answers logged)
- Monitor for retry patterns or repeated failures

## Log Retention

Log files are created with timestamps and stored in the `logs/` directory:
- Files are never automatically deleted
- Review and archive old logs as needed
- Consider cleaning up after several days if desired

## Integration with Excel

The main script also updates your `vehicles.xlsx` file with status information in column B:
- **Success** - Vehicle was successfully tagged
- **Skipped - Already Tagged** - Vehicle was previously tagged
- **Failed: [Error Message]** - Processing failed with details

Combined with the CSV log file, you have full traceability of all operations.

## Example: Complete Run Output

```
═══════════════════════════════════
Starting RPA Process...
═══════════════════════════════════
✅ Excel file loaded. Found 3 vehicles to process
✅ Browser launched successfully
✅ Authentication successful
✅ Navigation complete. Ready to process vehicles

══════════════════════════════════════════════════════════════════════
Processing Row 2: Vehicle MH02AB1234
══════════════════════════════════════════════════════════════════════
✅ Successfully tagged vehicle MH02AB1234

══════════════════════════════════════════════════════════════════════
Vehicle Queue Processing Summary:
Total Successfully Tagged: 1
Total Skipped: 0
Total Failed: 0
══════════════════════════════════════════════════════════════════════

Logs saved to:
- Main Log: C:\workspace\Agentic-AI-Workspace\AutoTagging\logs\execution_2026-05-30_14-19-30.log
- Vehicle Log: C:\workspace\Agentic-AI-Workspace\AutoTagging\logs\vehicles_2026-05-30_14-19-30.csv
```
