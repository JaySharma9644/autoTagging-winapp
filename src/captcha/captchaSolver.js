/**
 * Captcha Solver Module
 * Uses Tesseract.js OCR (no AI API) to read the captcha image,
 * then solves the math/comparison problem programmatically.
 */

import { createWorker } from 'tesseract.js';
import { logger } from '../config.js';

// Persistent worker — initialised once, reused for every captcha solve.
// Avoids the expensive WASM + language-data reload on every vehicle.
let _worker = null;

async function getWorker() {
    if (!_worker) {
        _worker = await createWorker('eng', 1, { logger: () => {} });
    }
    return _worker;
}

export async function solveCaptcha(page, captchaLocator) {
    try {
        logger.step('Solving Captcha (Tesseract OCR)');

        // Capture image and OCR in parallel where possible
        const captchaBuffer = await captchaLocator.screenshot();
        logger.debug('Captcha image captured');

        const worker = await getWorker();
        const { data: { text } } = await worker.recognize(captchaBuffer);

        const raw = text.trim();
        logger.debug('Captcha OCR text', { raw });

        let answer = solveText(raw);
        if (answer === null) {
            // OCR may have dropped an operator symbol — retry with a fresh screenshot
            logger.debug('Captcha parse failed, retrying with fresh screenshot');
            const retryBuffer = await captchaLocator.screenshot();
            const { data: { text: retryText } } = await worker.recognize(retryBuffer);
            const rawRetry = retryText.trim();
            logger.debug('Captcha OCR retry text', { raw: rawRetry });
            answer = solveText(rawRetry);
            if (answer === null) {
                throw new Error(`Could not parse captcha text: "${raw}" (retry: "${rawRetry}")`);
            }
        }

        logger.success('Captcha solved', { raw, answer });
        return String(answer);

    } catch (error) {
        // On OCR error, reset the persistent worker so it's recreated fresh next time
        if (_worker) {
            await _worker.terminate().catch(() => {});
            _worker = null;
        }
        logger.error('Captcha solving failed', { error: error.message });
        throw error;
    }
}

/**
 * Parses OCR'd captcha text and returns the numeric answer.
 *
 * NOTE: Do NOT apply global O→0 or l→1 substitutions on the full text —
 * they corrupt keywords like "No." (→ "N0.") breaking all regex matches.
 * Instead, normalise only the extracted number substring in parseNumberList.
 *
 * Supported patterns (OCR may drop spaces between words):
 *   "Which is the greatest No. ? 9,56,12 ="  → max
 *   "Which is the smallest No. ? 9,56,12 ="  → min
 *   "Which is the Middle No. ? 6,64,44 ="    → median
 *   "Which is the first No. ? 9,22,41 ="     → first element in list (9)
 *   "Which is the last No. ? 9,22,41 ="      → last element in list (41)
 *   "9 + 56 ="  /  "34 - 12 ="  /  "3 * 4 ="  /  "10 / 2 ="
 */
function solveText(raw) {
    // Normalise arithmetic symbols — keep word characters intact
    const t = raw
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/#/g, '*')   // OCR misreads * as #
        .trim();

    // "No" matcher: handles OCR variants — "No.", "N0.", "no.", with/without space before it
    const NO = 'n[o0]\\.?';

    // "Which is the greatest/largest No. ? ..."
    const greatestRe = new RegExp(`(?:greatest|largest)\\s*${NO}\\s*\\?\\s*([\\d,\\s]+)`, 'i');
    const greatestMatch = t.match(greatestRe);
    if (greatestMatch) {
        const nums = parseNumberList(greatestMatch[1]);
        return nums.length ? Math.max(...nums) : null;
    }

    // "Which is the smallest/lowest No. ? ..."
    const smallestRe = new RegExp(`(?:smallest|lowest)\\s*${NO}\\s*\\?\\s*([\\d,\\s]+)`, 'i');
    const smallestMatch = t.match(smallestRe);
    if (smallestMatch) {
        const nums = parseNumberList(smallestMatch[1]);
        return nums.length ? Math.min(...nums) : null;
    }

    // "Which is the Middle No. ? ..."
    const middleRe = new RegExp(`middle\\s*${NO}\\s*\\?\\s*([\\d,\\s]+)`, 'i');
    const middleMatch = t.match(middleRe);
    if (middleMatch) {
        const nums = parseNumberList(middleMatch[1]).sort((a, b) => a - b);
        return nums.length ? nums[Math.floor(nums.length / 2)] : null;
    }

    // "Which is the first No. ? ..." → first element in the list as written
    const firstRe = new RegExp(`first\\s*${NO}\\s*\\?\\s*([\\d,\\s]+)`, 'i');
    const firstMatch = t.match(firstRe);
    if (firstMatch) {
        const nums = parseNumberList(firstMatch[1]);
        return nums.length ? nums[0] : null;
    }

    // "Which is the last No. ? ..." → last element in the list as written
    const lastRe = new RegExp(`last\\s*${NO}\\s*\\?\\s*([\\d,\\s]+)`, 'i');
    const lastMatch = t.match(lastRe);
    if (lastMatch) {
        const nums = parseNumberList(lastMatch[1]);
        return nums.length ? nums[nums.length - 1] : null;
    }

    // Simple arithmetic: "9 + 56 =", "34 - 12 =", "3 * 4 =", "10 / 2 =", "5 % 3 ="
    const mathMatch = t.match(/(\d+)\s*([+\-*/%])\s*(\d+)\s*=/);
    if (mathMatch) {
        const a = Number(mathMatch[1]);
        const op = mathMatch[2];
        const b = Number(mathMatch[3]);
        if (op === '+') return a + b;
        if (op === '-') return a - b;
        if (op === '*') return a * b;
        if (op === '/' && b !== 0) return Math.round(a / b);
        if (op === '%' && b !== 0) return a % b;
    }

    return null;
}

/**
 * Splits a raw OCR number string into an array of integers.
 * Handles OCR mis-reads in the number portion only (O→0, l/I→1).
 */
function parseNumberList(str) {
    return str
        .replace(/[oO]/g, '0')
        .replace(/[lI]/g, '1')
        .split(/[,\s]+/)
        .map(s => s.trim())
        .filter(s => /^\d+$/.test(s))
        .map(Number);
}
