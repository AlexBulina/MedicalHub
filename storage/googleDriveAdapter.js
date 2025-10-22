// storage/googleDriveAdapter.js
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { saveTokens } from '../tokenManager.js'; // Імпортуємо функцію збереження
import fs, { createReadStream, createWriteStream } from 'fs';
import path from 'path';

class GoogleDriveAdapter {
    constructor(config, tokens) {
        if (!tokens || !tokens.refresh_token) {
            // Створюємо помилку, яка буде перехоплена і пояснить, що робити
            const authUrl = `http://localhost:1090/auth/google/${config.tokenKey}`;
            throw new Error(`Токен доступу для '${config.tokenKey}' відсутній. Будь ласка, пройдіть авторизацію за посиланням: ${authUrl}`);
        }
        this.drive = this.authenticate(config, tokens);
        this.config = config; // Зберігаємо всю конфігурацію
        this.rootFolderId = config.folderId;
    }

    authenticate(config, tokens) {
        const { clientId, clientSecret, redirectUri } = config;
        const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

        // Встановлюємо отримані токени для клієнта
        oauth2Client.setCredentials(tokens);

        // ВАЖЛИВО: Додаємо обробник події 'tokens'.
        // Він спрацює, коли бібліотека автоматично оновить access_token.
        oauth2Client.on('tokens', (newTokens) => {
            console.log('Google Drive: Токени було оновлено.');
            // Зберігаємо оновлені токени. Важливо зберегти і новий access_token,
            // і refresh_token, якщо він раптом теж оновився (хоча це рідкість).
            const finalTokens = { ...tokens, ...newTokens };
            saveTokens(this.config.tokenKey, finalTokens);
        });

        // Повертаємо готовий до роботи drive-клієнт
        return google.drive({ version: 'v3', auth: oauth2Client });
    }

    async ensureDir(remotePath) {
        // В Google Drive ми створюємо папку всередині головної папки.
        const folderName = remotePath.replace(/\//g, ''); // Видаляємо слеші
        try {
            // Спочатку шукаємо, чи існує вже така папка, щоб уникнути дублікатів
            const searchResponse = await this.drive.files.list({
                q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${this.rootFolderId}' in parents and trashed=false`,
                fields: 'files(id)',
                spaces: 'drive',
            });

            if (searchResponse.data.files.length > 0) {
                console.log('Google Drive: Folder already exists. ID:', searchResponse.data.files[0].id);
                return searchResponse.data.files[0].id; // Повертаємо ID існуючої папки
            }

            // Якщо папки немає, створюємо нову
            const fileMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [this.rootFolderId],
            };
            const file = await this.drive.files.create({
                resource: fileMetadata,
                fields: 'id',
            });
            console.log('Google Drive: Folder created. ID:', file.data.id);
            return file.data.id; // Повертаємо ID нової папки
        } catch (err) {
            console.error('Error creating folder in Google Drive', err);
            throw err;
        }
    }

    async uploadFrom(localPath, remoteFolderId) {
        // remoteFolderId тут буде ID папки, куди завантажувати
        const fileName = path.basename(localPath);
        const fileMetadata = {
            name: fileName,
            parents: [remoteFolderId], // remoteFolderId - це ID папки
        };
        const media = {
            mimeType: 'application/octet-stream', // Можна визначати динамічно
            body: createReadStream(localPath),
        };

        await this.drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
        });

        console.log(`Google Drive: File ${fileName} uploaded to folder ${remoteFolderId}`);
    }
    
    /**
     * @description Отримує список файлів з папки на Google Drive.
     * @param {string} remoteFolderId - ID папки на Google Drive.
     * @returns {Promise<Array<object>>} - Масив об'єктів з інформацією про файли.
     */
    async list(remoteFolderId) {
        const res = await this.drive.files.list({
            q: `'${remoteFolderId}' in parents and trashed=false`,
            fields: 'files(id, name, mimeType)',
            spaces: 'drive',
        });

        // Фільтруємо, щоб повернути тільки файли, а не папки, і з потрібними розширеннями
        return res.data.files
            .filter(file => {
                const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                if (isFolder) return false;
                const fileExtension = path.extname(file.name).toLowerCase();
                return ['.docx', '.pdf'].includes(fileExtension);
            })
            .map(file => ({
                id: file.id, // Додаємо ID для подальшого завантаження
                name: file.name,
                isDirectory: false, // Симулюємо поле, як у FTP-адаптера
            }));
    }

    /**
     * @description Завантажує файл з Google Drive у локальну файлову систему.
     * @param {string} remoteFileId - ID файлу на Google Drive.
     * @param {string} localPath - Повний шлях для збереження файлу локально.
     */
    async downloadTo(remoteFileId, localPath) {
        const dest = createWriteStream(localPath);
        const res = await this.drive.files.get(
            { fileId: remoteFileId, alt: 'media' },
            { responseType: 'stream' }
        );

        return new Promise((resolve, reject) => {
            res.data
                .on('end', () => {
                    console.log(`Google Drive: File ${remoteFileId} downloaded to ${localPath}.`);
                    resolve();
                })
                .on('error', err => {
                    console.error('Error downloading file from Google Drive.');
                    reject(err);
                })
                .pipe(dest);
        });
    }
}

export default GoogleDriveAdapter;
