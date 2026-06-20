# Quick Debugging Guide

## Running the Application

```bash
node index.js
```

---

## Common Debugging Scenarios

### 1. **Login Fails**

**Symptoms**: Error message "Login form not found" or "Login failed"

**Files to Check**:
- `src/utils/selectors.js` - Verify LOGIN selectors match current portal
- `src/auth/login.js` - Check form detection logic
- `history/login_*.png` - Screenshots of failure state

**Debug Steps**:
```javascript
// In src/auth/login.js - add temporary logging
console.log('All frames:', page.frames().length);
page.frames().forEach(frame => console.log(frame.url()));
```

**Common Fixes**:
- Selectors changed in portal → Update `SELECTORS.LOGIN` in `selectors.js`
- Portal moved to new iframe → Check frame detection in `login.js`

---

### 2. **Navigation to Vehicle Tagging Fails**

**Symptoms**: Error in "navigateToEpass" or stuck at menu

**Files to Check**:
- `src/utils/selectors.js` - NAVIGATION selectors
- `src/auth/navigation.js` - Click sequence

**Debug**: Add timeout logging:
```javascript
logger.info('Before ePass click', { url: page.url() });
await page.locator(SELECTORS.NAVIGATION.EPASS_MENU).click();
await page.waitForTimeout(2000);
logger.info('After ePass click', { url: page.url() });
```

---

### 3. **Captcha Solving Returns Empty**

**Symptoms**: "Gemini returned an empty response"

**Files to Check**:
- `src/captcha/captchaSolver.js` - Gemini API call
- Environment: `GEMINI_API_KEY` valid?

**Possible Issues**:
- Captcha image not visible (CSS change in portal)
- Gemini model unavailable (rate limited?)
- Base64 encoding failed

**Quick Fix**:
```javascript
// In captchaSolver.js - debug image
const buffer = await captchaLocator.screenshot();
console.log('Image size:', buffer.length, 'bytes');
```

---

### 4. **Vehicle Processing Hangs**

**Symptoms**: Process stuck waiting for "Search" button or success message

**Files to Check**:
- `src/processor/vehicleProcessor.js` - Processing workflow
- `src/utils/selectors.js` - VEHICLE_PROCESSING selectors

**Debug**:
```javascript
// Check if selector exists
const searchBtn = page.locator(SELECTORS.VEHICLE_PROCESSING.SEARCH_BUTTON);
const isVisible = await searchBtn.isVisible({ timeout: 2000 });
logger.info('Search button visible:', isVisible);
```

**Common Fixes**:
- Portal rendered vehicle form differently
- Updated selectors in `selectors.js`
- Add explicit wait: `await page.waitForLoadState('networkidle')`

---

### 5. **Some Batches Fail, Others Succeed**

**Symptoms**: Column A processes, Column B fails immediately

**Files to Check**:
- `src/processor/batchProcessor.js` - Per-batch error handling
- Check which batch logs show errors

**Root Causes**:
- Portal login rate limiting (too many parallel logins)
- Resource exhaustion (too many pages open)
- Network timeout on specific batch

**Solution**:
```javascript
// In batchProcessor.js - add delay between logins
if (group.column > 1) {
    await new Promise(r => setTimeout(r, 5000)); // 5s delay
}
```

---

### 6. **Excel Data Not Updating**

**Symptoms**: Vehicle cells show "Success" but no new data appears in Excel

**Files to Check**:
- `src/excel/excelHandler.js` - File write operation
- `src/excel/dataExtractor.js` - Data structure

**Debug**:
```javascript
// Check cell reference before/after
logger.info('Cell before:', vehicleData.cell.value);
vehicleData.cell.value = 'Success';
logger.info('Cell after:', vehicleData.cell.value);
```

**Common Issue**: Cell object reference lost → Solution: Use `cell.value` setter properly

---

### 7. **Memory Issues / Slow Over Time**

**Symptoms**: App slows down after processing many vehicles, high memory usage

**Files to Check**:
- `src/browser/browserManager.js` - Page creation/closing
- `src/processor/batchProcessor.js` - Resource cleanup in finally blocks

**Fix**:
```javascript
// Ensure pages are closed in finally block
finally {
    await closePage(page, `Column ${group.columnLetter}`);
}

// Monitor memory: Check process memory in Task Manager
```

---

## Quick Fixes by Symptom

| Symptom | File | Fix |
|---------|------|-----|
| Login form can't find user field | `selectors.js` | Update `SELECTORS.LOGIN.USER` |
| Can't click menu items | `navigation.js` | Add explicit waits before clicks |
| Captcha solver returns empty | `config.js` | Verify `GEMINI_API_KEY` is valid |
| Vehicle search doesn't find it | `selectors.js` | Update `SELECTORS.VEHICLE_PROCESSING` |
| Portal redirects after login | `login.js` | Update `confirmLogin()` URL patterns |
| Multiple batches timeout | `batchProcessor.js` | Reduce concurrent logins |
| Excel not saving | `excelHandler.js` | Check file permissions |

---

## Logging Best Practices

### View Real-Time Logs
```bash
# Logs are in history/history_*.txt
# Open latest one:
tail -f history/history_*.txt
```

### Understand Log Levels
- `step()` - Major workflow step
- `info()` - General information
- `success()` - Operation succeeded
- `warning()` - Potential issue, continuing
- `error()` - Operation failed
- `exception()` - Caught exception with context
- `debug()` - Low-level details

### Find Errors Quickly
```bash
# Search for failures in logs
grep -i "failed\|error\|exception" history/history_*.txt
```

---

## Adding Debug Output

### Temporary Debug in any module:
```javascript
logger.info('DEBUG: State check', {
    url: page.url(),
    title: await page.title(),
    timeNow: new Date().toISOString()
});
```

### Capture diagnostics:
```javascript
import { dumpFormDiagnostics } from './utils/helpers.js';
await dumpFormDiagnostics(page, 'custom_checkpoint');
```

### Screenshot at checkpoint:
```javascript
import { captureScreenshot } from './utils/helpers.js';
const path = await captureScreenshot(page, 'before_vehicle_search');
logger.info('Screenshot saved at:', path);
```

---

## Environmental Issues

### Issue: "Missing environment variable"

**Solution**:
```bash
# Create .env file in project root:
GEMINI_API_KEY=your_key_here
PORTAL_URL=https://portal.example.com
PORTAL_USER_ID=username
PORTAL_PASSWORD=password
```

### Issue: "Browser launch failed"

**Solution**:
```bash
# Playwright browsers not installed
npm install
npx playwright install chromium
```

---

## Parallel Processing Issues

### If one batch hangs:
1. Check logs for that specific column (search `Column X:`)
2. It may be waiting on captcha or page load
3. Add timeout: `await page.waitForTimeout(5000)` then fail gracefully

### If all batches time out:
1. Portal might be throttling parallel logins
2. Reduce parallel batches: Don't launch all groups simultaneously
3. Add staggered startup: Delay batch 2+ by 5-10 seconds

---

## Getting Specific Cell Data

### To debug specific vehicle processing:
```javascript
// In vehicleProcessor.js - add before processing
logger.info('Vehicle data object:', {
    vehicle: vehicleData.vehicle,
    row: vehicleData.row,
    column: vehicleData.column,
    cellRef: vehicleData.cell.address
});
```

---

## Rollback Guide

### If application breaks:
1. Check `git status` (if using git)
2. Review recent changes to affected module
3. Revert problematic file or module
4. Run tests on that specific module first

---

## Performance Profiling

### Check execution time per vehicle:
```javascript
const startTime = Date.now();
const result = await processVehicle(page, vehicleData, label);
const duration = Date.now() - startTime;
logger.info(`Vehicle ${vehicleData.vehicle} took ${duration}ms`);
```

### Identify slow operations:
- Login: Usually 5-10s
- Navigation: 2-5s per page load
- Captcha solving: 1-3s
- Vehicle submission: 2-5s

### If any step > thresholds → Check network/portal

---

## Support Resources

- **Logs**: `history/` folder (all detailed logs)
- **Screenshots**: `history/*_*.png` (visual checkpoints)
- **Code**: `src/` modules (well-commented)
- **Docs**: `MODULAR_STRUCTURE.md` (architecture)
