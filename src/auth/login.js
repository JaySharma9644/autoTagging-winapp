/**
 * Login Module
 * Handles authentication with frame-aware form detection
 */

import { CONFIG, logger } from '../config.js';
import { SELECTORS } from '../utils/selectors.js';
import { firstVisible, dumpFormDiagnostics, captureScreenshot } from '../utils/helpers.js';

/**
 * Polls every frame until one contains a visible user field
 */
async function findLoginFrame(page, timeout = 15000) {
    const deadline = Date.now() + timeout;
    do {
        for (const frame of page.frames()) {
            const user = await firstVisible(frame, SELECTORS.LOGIN.USER);
            if (user) return { frame, user };
        }
        await page.waitForTimeout(500);
    } while (Date.now() < deadline);
    return null;
}

/**
 * Locates the login form (user + password + submit) inside its frame
 */
async function locateLoginForm(page) {
    const found = await findLoginFrame(page);
    if (!found) {
        await dumpFormDiagnostics(page, 'login_no_form');
        throw new Error('Login form not found (no visible user field in any frame)');
    }
    const { frame, user } = found;
    logger.success('Found login frame', { frameUrl: frame.url(), userSelector: user.selector });

    const pass = await firstVisible(frame, SELECTORS.LOGIN.PASSWORD);
    if (!pass) {
        await dumpFormDiagnostics(page, 'login_no_pass');
        throw new Error('Password field not found in login frame');
    }

    const submit = await firstVisible(frame, SELECTORS.LOGIN.SUBMIT);
    if (!submit) {
        await dumpFormDiagnostics(page, 'login_no_submit');
        throw new Error('Submit button not found in login frame');
    }

    logger.success('Login form located', { user: user.selector, pass: pass.selector, submit: submit.selector });
    return { user, pass, submit };
}

/**
 * Fills credentials and submits the form
 */
async function submitCredentials(page, form) {
    logger.debug('Filling login credentials');
    await form.user.locator.fill(process.env.PORTAL_USER_ID, { timeout: 10000 });

    // Password field starts as readonly and removes that attribute via onfocus
    await form.pass.locator.click({ timeout: 10000 });
    await form.pass.locator.fill(process.env.PORTAL_PASSWORD, { timeout: 10000 });

    logger.debug('Submitting login form');
    await Promise.all([
        form.submit.locator.click({ timeout: 10000 }),
        page.waitForLoadState('networkidle').catch(() => null)
    ]);
}

/**
 * Waits for a login outcome and throws if it failed
 */
async function confirmLogin(page, form) {
    logger.debug('Waiting for login confirmation');

    const sawDashboard = page
        .waitForSelector(SELECTORS.RESULTS.DASHBOARD, { timeout: CONFIG.LOGIN_TIMEOUT })
        .then(() => 'dashboard').catch(() => null);

    const sawUrlChange = page
        .waitForFunction(() => {
            const url = (window.location.href + ' ' + window.location.pathname).toLowerCase();
            return url.includes('dashboard') || url.includes('home') || url.includes('request');
        }, { timeout: CONFIG.LOGIN_TIMEOUT })
        .then(() => 'url').catch(() => null);

    const sawError = page
        .waitForSelector(SELECTORS.RESULTS.LOGIN_ERROR, { timeout: CONFIG.LOGIN_TIMEOUT })
        .then(() => 'error').catch(() => null);

    const outcome = await Promise.race([sawDashboard, sawUrlChange, sawError]);

    if (outcome === 'dashboard') return logger.success('Authentication successful (dashboard detected)');
    if (outcome === 'url') return logger.success('Authentication successful (URL changed)');

    if (outcome === 'error') {
        const errText = await page.locator(SELECTORS.RESULTS.LOGIN_ERROR).first().innerText().catch(() => 'Login error');
        await captureScreenshot(page, 'login_error');
        throw new Error(`Login failed: ${errText}`);
    }

    // Ambiguous: nothing matched. If the form is gone, assume success; otherwise fail.
    const screenshot = await captureScreenshot(page, 'login_timeout');
    if (await form.user.locator.isVisible().catch(() => false)) {
        throw new Error('Login failed: form still visible after timeout (check credentials)');
    }
    logger.warning('Login confirmation unclear but form is gone. Proceeding cautiously.', { screenshot });
}

/**
 * Handles the portal login sequence (frame-aware)
 */
export async function login(page) {
    try {
        logger.debug('Starting login sequence (frame-aware)');
        const form = await locateLoginForm(page);
        await submitCredentials(page, form);
        await confirmLogin(page, form);
    } catch (error) {
        logger.exception(error, { function: 'login' });
        throw error;
    }
}
