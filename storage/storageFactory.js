/**
 * @file storageFactory.js
 * @description Фабрика для створення адаптерів сховища (FTP, Google Drive тощо).
 */

import FtpAdapter from './ftpAdapter.js';
import GoogleDriveAdapter from './googleDriveAdapter.js';
import { getTokens } from '../tokenManager.js'; // <-- Імпортуємо з надійного модуля

/**
 * @description Створює та повертає екземпляр адаптера сховища на основі конфігурації.
 * @param {object} branch - Об'єкт конфігурації філіалу.
 * @returns {Promise<object>} - Екземпляр адаптера сховища.
 */
export async function getStorageAdapter(branch) {
    const { type, config } = branch.storage;

    if (type === 'ftp') {
        // Для FTP просто створюємо новий екземпляр з конфігурацією
        return new FtpAdapter(config);
    } else if (type === 'google-drive') {
        // Для Google Drive спочатку отримуємо токени, використовуючи наш tokenManager
        const tokens = await getTokens(config.tokenKey);
        return new GoogleDriveAdapter(config, tokens);
    } else {
        throw new Error(`Unsupported storage type: ${type}`);
    }
}
