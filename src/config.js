/**
 * Configuration Module
 * Centralized configuration constants and environment setup
 */

import dotenv from 'dotenv';
import Logger from './logger/logger.js';

// Load environment variables
dotenv.config();

// Initialize Logger
export const logger = new Logger({
    historyDir: 'history',
    logsDir: 'logs'
});

// Configuration constants
export const CONFIG = {
    EXCEL_FILE_PATH: process.env.EXCEL_FILE_PATH || './src/AutoTagSheet.xlsx',
    PORTAL_URL: process.env.PORTAL_URL,
    MAX_RETRIES: 3,
    LOGIN_TIMEOUT: 500000, // ms to wait for login confirmation
};

// Validate environment variables
export function validateEnvironment() {
    const requiredEnvVars = ['GEMINI_API_KEY', 'PORTAL_URL', 'PORTAL_USER_ID', 'PORTAL_PASSWORD'];
    const missingVars = requiredEnvVars.filter(v => !process.env[v]);
    
    if (missingVars.length > 0) {
        logger.error(`Missing environment variables: ${missingVars.join(', ')}`);
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    logger.success('All environment variables loaded successfully');
}

// Gemini API initialization
import { GoogleGenAI } from '@google/genai';
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
