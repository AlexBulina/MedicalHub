// storage/ftpAdapter.js
import ftp from 'basic-ftp';
import { createWriteStream } from 'fs';
import path from 'path';


class FtpAdapter {
    constructor(config) {
        this.config = config;
    }

    async _getClient() {
        // Створюємо та налаштовуємо клієнт при кожному виклику, щоб гарантувати свіже з'єднання.
        const client = new ftp.Client();
        await client.access(this.config);
        return client;
    }

    _normalizePath(remotePath) {
        // Замінюємо всі зворотні слеші на прямі та забезпечуємо, щоб шлях починався з /
        const normalized = remotePath.replace(/\\/g, '/');
        return normalized.startsWith('/') ? normalized : `/${normalized}`;
    }

    async ensureDir(path) {
        const client = await this._getClient();
        try {
            await client.ensureDir(this._normalizePath(path));
        } finally {
            client.close();
        }
    }

    async uploadFrom(localPath, remotePath) {
        const client = await this._getClient();
        try {
            await client.uploadFrom(localPath, this._normalizePath(remotePath));
        } finally {
            client.close();
        }
    }

    /**
     * @description Отримує список файлів з віддаленої директорії, фільтруючи їх.
     * @param {string} remotePath - Шлях до директорії на FTP.
     * @returns {Promise<Array<object>>} - Масив об'єктів з інформацією про файли.
     */
    async list(remotePath) {
        const client = await this._getClient();
        const normalizedPath = this._normalizePath(remotePath);
        try {
            // Використовуємо list з повним шляхом, а не cd + list
            const files = await client.list(normalizedPath);
            // Фільтруємо файли, залишаючи тільки .docx та .pdf
            return files.filter(file => {
                if (file.isDirectory) return false;
                const fileExtension = path.extname(file.name).toLowerCase();
                return ['.docx', '.pdf'].includes(fileExtension);
            });
        } finally {
            client.close();
        }
    }

    /**
     * @description Завантажує файл з FTP у локальну файлову систему.
     * @param {string} remotePath - Повний шлях до файлу на FTP.
     * @param {string} localPath - Повний шлях для збереження файлу локально.
     */
    async downloadTo(remotePath, localPath) {
        return new Promise(async (resolve, reject) => {
            const client = await this._getClient(); // _getClient() is called inside the promise
            const writeStream = createWriteStream(localPath);

            writeStream.on('finish', () => {
                client.close();
                resolve();
            });

            writeStream.on('error', (err) => {
                client.close();
                reject(err);
            });

            client.downloadTo(writeStream, this._normalizePath(remotePath)).catch(reject);
        });
    }

    /**
     * @description Перевіряє існування директорії на FTP.
     * @param {string} directoryName - Назва директорії для перевірки.
     * @returns {Promise<object|null>} - Повертає інформацію про директорію або null, якщо її не існує.
     */
    async checkDirectory(directoryName) {
        const client = await this._getClient();
        try {
            const fileInfo = await client.list(this._normalizePath(directoryName));
            return fileInfo;
        } catch (error) {
            if (error.code === 550) { // Код помилки "File not found"
                return null;
            }
            // Якщо інша помилка, прокидаємо її далі
            throw error;
        } finally {
            client.close();
        }
    }

    /**
     * @description Завантажує файл на FTP, створюючи директорію, якщо потрібно.
     * Цей метод є перенесеною логікою з ftp_del, яка мала невідповідну назву.
     * @param {string} localPath - Шлях до локального файлу.
     * @param {string} remoteDir - Директорія на FTP, куди завантажувати.
     * @param {string} remoteFileName - Ім'я файлу на FTP.
     */
    async uploadAndEnsureDir(localPath, remoteDir, remoteFileName) {
        const client = await this._getClient();
        try {
            const normalizedDir = this._normalizePath(remoteDir);
            await client.ensureDir(normalizedDir);
            // Завантажуємо файл
            const remotePath = this._normalizePath(path.join(normalizedDir, remoteFileName));
            await client.uploadFrom(localPath, remotePath);
            console.log(`Файл ${localPath} успішно завантажено в ${remotePath}`);
        } catch (err) {
            console.error(`Помилка при завантаженні файлу на FTP:`, err);
            throw err; // Прокидаємо помилку для обробки вище
        } finally {
            client.close();
        }
    }
}

export default FtpAdapter;
