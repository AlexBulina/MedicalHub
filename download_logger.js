/**
 * @file download_logger.js
 * @description Модуль для ведення статистики завантажень результатів.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js'; // Використовуємо основний логер для операційних повідомлень

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATS_PATH = path.join(__dirname, 'download_stats.json');

/**
 * @description Логує успішне завантаження результату та оновлює статистику.
 * @param {string} branchDepId - ID відділення філіалу (напр., 'rd', 'ct').
 * @param {string} accessKey - Унікальний ключ доступу, за яким відбулося завантаження.
 */
export async function logDownload(branchDepId, accessKey) {
    if (!branchDepId) {
        logger.warn('[DownloadLogger] Спроба залогувати завантаження без ID філіалу.');
        return;
    }

    try {
        let stats = {};
        try {
            const data = await fs.readFile(STATS_PATH, 'utf-8');
            stats = JSON.parse(data);
        } catch (error) {
            // Файл може не існувати, це нормально для першого запуску.
            if (error.code !== 'ENOENT') {
                throw error; // Інші помилки прокидаємо далі.
            }
        }

        const today = new Date().toISOString().split('T')[0]; // Формат YYYY-MM-DD

        // Ініціалізуємо статистику для філіалу, якщо її немає
        if (!stats[branchDepId]) {
            stats[branchDepId] = { total: 0, today: 0, lastUpdate: today };
        }

        const branchStats = stats[branchDepId];

        // Якщо дата останнього оновлення не сьогоднішня, скидаємо денний лічильник
        if (branchStats.lastUpdate !== today) {
            branchStats.today = 0;
            branchStats.lastUpdate = today;
        }

        // Оновлюємо лічильники
        branchStats.total += 1;
        branchStats.today += 1;

        // Зберігаємо оновлену статистику
        await fs.writeFile(STATS_PATH, JSON.stringify(stats, null, 2));
        logger.info(`[DownloadLogger] Зареєстровано завантаження для філіалу '${branchDepId}' (ключ: ${accessKey}). Загалом: ${branchStats.total}, сьогодні: ${branchStats.today}.`);

    } catch (error) {
        logger.error(`[DownloadLogger] Помилка при оновленні статистики завантажень: ${error.message}`);
    }
}