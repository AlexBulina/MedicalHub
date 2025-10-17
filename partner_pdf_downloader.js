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
 * @param {string} corId - Унікальний ідентифікатор запиту для створення спільної тимчасової папки.
 * @returns {Promise<string>} - Шлях до тимчасово збереженого PDF-файлу.
 */
export async function downloadPartnerPdf(webCode, partnerLabResultUrl, corId) {
    if (!webCode || !partnerLabResultUrl || !corId) {
        throw new Error('Веб-код, URL партнера та corId є обов\'язковими.');
    }

    const url = `${partnerLabResultUrl}?oid=${webCode}`;
    console.log(`Запит до партнерської лабораторії за URL: ${url}`);

    const response = await axios.get(url, {
        responseType: 'arraybuffer' // Важливо для отримання бінарних даних
    });

    const tempDir = path.join(__dirname, 'temp', `merge_${corId}`);
    await fs.mkdir(tempDir, { recursive: true });

    const tempFilePath = path.join(tempDir, `${webCode}.pdf`);
    await fs.writeFile(tempFilePath, response.data);

    console.log(`PDF від партнера успішно збережено у: ${tempFilePath}`);
    return tempFilePath;
}