# Modular Architecture Guide

## Overview

The application has been refactored into a modular, maintainable structure organized by feature/responsibility. This makes debugging, testing, and extending the application much easier.

---

## Directory Structure

```
src/
├── auth/
│   ├── login.js              # Authentication logic (frame-aware form handling)
│   └── navigation.js         # Portal navigation workflows
├── browser/
│   └── browserManager.js     # Browser/context lifecycle management
├── captcha/
│   └── captchaSolver.js      # Captcha image extraction & Gemini API integration
├── excel/
│   ├── excelHandler.js       # Excel file read/write operations
│   └── dataExtractor.js      # Vehicle data extraction from worksheets
├── processor/
│   ├── vehicleProcessor.js   # Individual vehicle tagging logic
│   └── batchProcessor.js     # Parallel batch & column group processing
├── utils/
│   ├── helpers.js            # Utility functions (screenshots, DOM queries, etc.)
│   └── selectors.js          # Centralized CSS/XPath selectors
└── config.js                 # Configuration constants & environment setup

index.js                       # Main orchestrator/entry point
```

---

## Module Descriptions

### `src/config.js`
**Purpose**: Centralized configuration and initialization
- Loads environment variables
- Initializes Logger instance
- Exports `CONFIG` object with constants
- Initializes Gemini API client
- Validates required environment variables

**Key Exports**:
- `logger` - Shared logger instance
- `CONFIG` - Configuration constants
- `ai` - Gemini API client
- `validateEnvironment()` - Validates env vars

**Usage**:
```javascript
import { CONFIG, logger, ai, validateEnvironment } from './src/config.js';
```

---

### `src/utils/selectors.js`
**Purpose**: Single source of truth for all DOM selectors
- Login form selectors (iframe-aware)
- Navigation menu selectors
- Vehicle processing selectors
- Captcha field selectors
- Success/error message selectors

**Key Exports**:
- `SELECTORS` - Object with categorized selectors

**Usage**:
```javascript
import { SELECTORS } from '../utils/selectors.js';
const userField = page.locator(SELECTORS.LOGIN.USER[0]);
```

**Why It's Better**:
- Easy to update selectors without searching code
- Prevents selector duplication
- Clearer intent (grouped by feature)

---

### `src/utils/helpers.js`
**Purpose**: Reusable utility functions
- `captureScreenshot()` - Save page screenshots
- `getColumnLetter()` - Convert column numbers to letters (1→'A')
- `firstVisible()` - Find first visible element in scope
- `dumpFormDiagnostics()` - Debug form issues across iframes
- `sleep()` - Promise-based delay

**Usage**:
```javascript
import { getColumnLetter, captureScreenshot } from '../utils/helpers.js';
const colName = getColumnLetter(1); // Returns 'A'
```

---

### `src/auth/login.js`
**Purpose**: Authentication workflow
- `login()` - Complete login sequence
- `locateLoginForm()` - Find form fields across frames
- `submitCredentials()` - Fill and submit credentials
- `confirmLogin()` - Detect login success/failure

**Key Features**:
- Frame-aware (searches across iframes)
- Multiple selector fallbacks
- Comprehensive error diagnostics
- Dashboard/URL/error detection

**Usage**:
```javascript
import { login } from '../auth/login.js';
await login(page);
```

---

### `src/auth/navigation.js`
**Purpose**: Portal navigation workflows
- `navigateToTransporter()` - Reach transporter login section
- `navigateToEpass()` - Navigate to e-Pass vehicle tagging section

**Key Features**:
- Handles "no records found" retry logic (30s wait)
- Click-through sequences for portal menus

**Usage**:
```javascript
import { navigateToTransporter, navigateToEpass } from '../auth/navigation.js';
await navigateToTransporter(page);
await navigateToEpass(page);
```

---

### `src/excel/excelHandler.js`
**Purpose**: Excel file I/O operations
- `loadExcelFile()` - Read Excel file and return workbook + worksheet
- `saveExcelFile()` - Write workbook back to disk

**Usage**:
```javascript
import { loadExcelFile, saveExcelFile } from '../excel/excelHandler.js';
const { workbook, worksheet } = await loadExcelFile('./data.xlsx');
await saveExcelFile(workbook, './data.xlsx');
```

---

### `src/excel/dataExtractor.js`
**Purpose**: Extract vehicle data from Excel
- `extractColumnWiseGroups()` - Parse columns and group vehicles

**Returns**:
```javascript
[
  {
    column: 1,
    columnLetter: 'A',
    vehicles: [{vehicle: 'DL-123', row: 2, column: 1, cell: ...}, ...],
    stats: { success: 0, skipped: 0, failed: 0 }
  },
  ...
]
```

**Usage**:
```javascript
import { extractColumnWiseGroups } from '../excel/dataExtractor.js';
const groups = extractColumnWiseGroups(worksheet);
```

---

### `src/browser/browserManager.js`
**Purpose**: Browser lifecycle management
- `initializeBrowser()` - Launch browser and create context
- `closeBrowser()` - Close browser and cleanup
- `createPage()` - Create new page in context
- `closePage()` - Close page gracefully

**Usage**:
```javascript
import { initializeBrowser, closeBrowser, createPage } from '../browser/browserManager.js';

const { browser, context } = await initializeBrowser();
const page = await createPage(context);
await closePage(page);
await closeBrowser(browser);
```

---

### `src/captcha/captchaSolver.js`
**Purpose**: Captcha solving via Gemini API
- `solveCaptcha()` - Extract captcha image and send to Gemini

**Features**:
- Captures element-specific screenshot
- Converts to base64
- Sends to Gemini 1.5 Flash
- Validates response

**Usage**:
```javascript
import { solveCaptcha } from '../captcha/captchaSolver.js';
const answer = await solveCaptcha(page, page.locator('#captchaImage'));
```

---

### `src/processor/vehicleProcessor.js`
**Purpose**: Individual vehicle tagging logic
- `processVehicle()` - Handle single vehicle: search → check status → solve captcha → submit

**Returns**:
```javascript
{ status: 'success' | 'skipped' | 'failed', error?: string }
```

**Workflow**:
1. Check if already processed
2. Search vehicle
3. Detect if already tagged
4. Solve captcha
5. Submit and confirm

**Usage**:
```javascript
import { processVehicle } from '../processor/vehicleProcessor.js';
const result = await processVehicle(page, vehicleData, 'Column A');
```

---

### `src/processor/batchProcessor.js`
**Purpose**: Parallel batch orchestration
- `processColumnGroup()` - Process single column: login → navigate → process all vehicles
- `processVehicleGroupsInParallel()` - Launch all groups in parallel

**Features**:
- Independent login per batch
- Parallel page creation
- Result aggregation
- Error isolation

**Usage**:
```javascript
import { processVehicleGroupsInParallel } from '../processor/batchProcessor.js';
await processVehicleGroupsInParallel(context, vehicleGroups, worksheet, portalUrl);
```

---

### `index.js` (Main Orchestrator)
**Purpose**: Coordinates entire RPA workflow
- Validates environment
- Loads Excel data
- Initializes browser
- Extracts vehicle groups
- Launches parallel processing
- Saves results
- Cleanup

**Flow**:
```
Validate Env → Load Excel → Launch Browser 
    → Extract Groups → Parallel Processing 
    → Save Results → Cleanup
```

---

## Debug Map

### Issue: Login fails
**Check**:
1. [src/auth/login.js](src/auth/login.js) - Form locator logic
2. [src/utils/selectors.js](src/utils/selectors.js) - Selector correctness
3. Check screenshots in `history/login_*.png`

### Issue: Navigation wrong
**Check**:
1. [src/auth/navigation.js](src/auth/navigation.js) - Click sequence
2. [src/utils/selectors.js](src/utils/selectors.js) - Menu selectors
3. Portal menu structure changed?

### Issue: Captcha solving fails
**Check**:
1. [src/captcha/captchaSolver.js](src/captcha/captchaSolver.js) - Image extraction
2. Gemini API key valid?
3. Captcha image quality?

### Issue: Vehicle processing incomplete
**Check**:
1. [src/processor/vehicleProcessor.js](src/processor/vehicleProcessor.js) - Individual vehicle logic
2. [src/processor/batchProcessor.js](src/processor/batchProcessor.js) - Parallel handling

### Issue: Excel data mismatch
**Check**:
1. [src/excel/dataExtractor.js](src/excel/dataExtractor.js) - Parsing logic
2. Excel file format changed?

---

## Adding New Features

### Example: Add email notification on completion

1. **Create module**: `src/notifications/emailNotifier.js`
   ```javascript
   export async function sendCompletionEmail(summary) {
       // Implementation
   }
   ```

2. **Import in `index.js`**:
   ```javascript
   import { sendCompletionEmail } from './src/notifications/emailNotifier.js';
   ```

3. **Use in `run()` function**:
   ```javascript
   await sendCompletionEmail({
       success: totalSuccess,
       failed: totalFailed
   });
   ```

---

## Dependencies Between Modules

```
index.js (orchestrator)
├── config.js (provides logger, ai, CONFIG)
├── browser/browserManager.js
├── excel/excelHandler.js → excel/dataExtractor.js
└── processor/batchProcessor.js
    ├── auth/login.js → utils/helpers.js, selectors.js
    ├── auth/navigation.js → utils/selectors.js
    └── processor/vehicleProcessor.js
        ├── captcha/captchaSolver.js (uses ai from config.js)
        └── utils/selectors.js
```

---

## Environment Variables Required

All loaded and validated in `src/config.js`:
- `GEMINI_API_KEY` - Google Gemini API key
- `PORTAL_URL` - Portal base URL
- `PORTAL_USER_ID` - Portal username
- `PORTAL_PASSWORD` - Portal password

---

## Debugging Tips

### Enable verbose logging
- Logs are already detailed - check `history/*.txt`

### Capture diagnostics
- Automatic screenshots on errors in `history/`
- Form diagnostics dumped on login failures

### Check parallel execution
- Look for `Column X:` prefixes in logs
- Each column processes independently

### Monitor memory/performance
- Each column gets own page (browser isolates resources)
- Use `closePage()` to prevent leaks

---

## Testing Individual Modules

### Test login in isolation:
```javascript
import { login } from './src/auth/login.js';
const page = await context.newPage();
await page.goto(url);
await login(page);
```

### Test Excel extraction:
```javascript
import { loadExcelFile } from './src/excel/excelHandler.js';
import { extractColumnWiseGroups } from './src/excel/dataExtractor.js';

const { worksheet } = await loadExcelFile('./test.xlsx');
const groups = extractColumnWiseGroups(worksheet);
console.log(groups);
```

### Test single vehicle:
```javascript
import { processVehicle } from './src/processor/vehicleProcessor.js';
const result = await processVehicle(page, vehicleData, 'TestColumn');
console.log(result);
```

---

## Summary

✅ **Benefits of Modular Structure**:
- Single Responsibility Principle
- Easy to debug (find code by purpose)
- Easy to test (mock/isolate modules)
- Easy to extend (add new features)
- Easy to maintain (changes in one place)
- Clear dependencies
- Reusable functions
- Better error tracking
