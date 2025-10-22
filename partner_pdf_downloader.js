/**
 * @file partner_pdf_downloader.js
 * @description Модуль для завантаження PDF-файлів з партнерської лабораторії.
 */

import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @description Завантажує PDF-файл за веб-кодом з URL партнерської лабораторії.
 * @param {string} webCode - Веб-код для пошуку результату.
 * @param {string} partnerLabResultUrl - URL для запиту результатів.
 * @param {string} destinationDir - Шлях до директорії, куди зберегти файл.
 * @returns {Promise<string>} - Повертає шлях до завантаженого файлу.
 */
export async function downloadPartnerPdf(webCode, partnerLabResultUrl, destinationDir) {
    if (!webCode || !partnerLabResultUrl || !destinationDir) {
        throw new Error('Веб-код, URL партнера та директорія призначення є обов\'язковими.');
    }

    const url = `${partnerLabResultUrl}?oid=${webCode}`;
    console.log(`Запит до партнерської лабораторії за URL: ${url}`);

    const tempSubDir = path.join(__dirname, 'temp', destinationDir); // Зберігаємо у піддиректорії всередині 'temp'
    await fs.mkdir(tempSubDir, { recursive: true }); // Переконуємось, що директорія існує
    const response = await axios.get(url, {
        responseType: 'arraybuffer'
    });

    const tempFilePath = path.join(tempSubDir, `${webCode}.pdf`);
    await fs.writeFile(tempFilePath, response.data);
    console.log(`PDF від партнера (${webCode}.pdf) успішно збережено у: ${destinationDir}`);
    return tempFilePath; // Повертаємо шлях до створеного файлу
}