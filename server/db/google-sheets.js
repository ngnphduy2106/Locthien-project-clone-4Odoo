// ===============================================
// GOOGLE SHEETS UTILITY
// ===============================================

import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Safe documentation path placeholder
const __dirname = '.';

const SPREADSHEET_ID = '1kShrJvZ3Fiw1f3KEBtb6668GEJqoToy1ifqU_9Rb2BI';
// Move credentialsPath into the function to avoid top-level path errors

async function getSheetsClient() {
    const credentialsPath = join(process.cwd(), 'firebase-service-account.json');
    if (!fs.existsSync(credentialsPath)) {
        throw new Error('Service account file not found! Please check firebase-service-account.json');
    }

    const auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    return google.sheets({ version: 'v4', auth });
}

export async function getSheetNames() {
    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
        });
        return response.data.sheets.map(s => s.properties.title);
    } catch (error) {
        console.error('Error fetching sheet names:', error.message);
        throw error;
    }
}

export async function getSheetData(range) {
    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
        });
        return response.data.values;
    } catch (error) {
        console.error('Error fetching sheet data:', error.message);
        throw error;
    }
}

// Map 2D array to Objects based on headers
export function mapRowsToObjects(rows) {
    if (!rows || rows.length < 2) return [];

    const headers = rows[0];
    const data = rows.slice(1);

    return data.map(row => {
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = row[index] || '';
        });
        return obj;
    });
}
