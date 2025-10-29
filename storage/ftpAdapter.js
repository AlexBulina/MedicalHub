// storage/ftpAdapter.js
import ftp from 'basic-ftp';
import { promises as fsPromises, createWriteStream } from 'fs';


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

    async ensureDir(path) {
        const client = await this._getClient();
        try {
            await client.ensureDir(path);
        } finally {
            client.close();
        }
    }

    async uploadFrom(localPath, remotePath) {
        const client = await this._getClient();
        try {
            await client.uploadFrom(localPath, remotePath);
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
        try {
            await client.cd(remotePath);
            const files = await client.list();
            // Фільтруємо файли, залишаючи тільки .docx та .pdf
            return files.filter(file => {
                if (file.isDirectory) return false;
                const fileExtension = file.name.split('.').pop().toLowerCase();
                return ['docx', 'pdf'].includes(fileExtension);
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
            const client = await this._getClient();
            const writeStream = createWriteStream(localPath);

            writeStream.on('finish', () => {
                client.close();
                resolve();
            });

            writeStream.on('error', (err) => {
                client.close();
                reject(err);
            });

            client.downloadTo(writeStream, remotePath).catch(reject);
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
            const fileInfo = await client.list(directoryName);
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
            // Переконуємось, що директорія існує
            await client.ensureDir(remoteDir);
            // Завантажуємо файл
            const remotePath = `${remoteDir}/${remoteFileName}`;
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
