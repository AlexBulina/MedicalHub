/**
 * @file tokenManager.js
 * @description Модуль для керування OAuth-токенами (збереження та отримання).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import winston from 'winston'; // Припустимо, що логер може знадобитися

// Отримуємо __dirname в ES-модулях
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKENS_PATH = path.join(__dirname, 'tokens.json');
const logger = winston.loggers.get('default'); // Отримуємо існуючий логер

/**
 * @description Зберігає токени для вказаного ключа у файл.
 * @param {string} key - Унікальний ключ (напр., 'rd', 'lab').
 * @param {object} tokens - Об'єкт токенів для збереження.
 */
export async function saveTokens(key, tokens) {
    let allTokens = {};
    try {
        const data = await fs.readFile(TOKENS_PATH, 'utf-8');
        allTokens = JSON.parse(data);
    } catch (error) {
        // Файл може не існувати, це нормально
    }
    allTokens[key] = tokens;
    await fs.writeFile(TOKENS_PATH, JSON.stringify(allTokens, null, 2));
    logger.info(`Токени для ключа '${key}' успішно збережено.`);
}

/**
 * @description Отримує токени для вказаного ключа з файлу.
 * @param {string} key - Унікальний ключ (напр., 'rd', 'lab').
 * @returns {Promise<object|null>} - Об'єкт токенів або null, якщо не знайдено.
 */
export async function getTokens(key) {
    try {
        const data = await fs.readFile(TOKENS_PATH, 'utf-8');
        const allTokens = JSON.parse(data);
        return allTokens[key] || null;
    } catch (error) {
        // Помилка читання або парсингу, файл може не існувати
        return null;
    }
}