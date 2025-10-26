/**
 * @file KT_BackendNew.js
 * @description Бекенд-сервер для системи "MedicalHub", що обробляє запити від клієнтських сторінок,
 * керує даними пацієнтів, завантажує файли на FTP, відправляє SMS-повідомлення через TurboSMS
 * та надає доступ до результатів досліджень у форматі PDF.
 */

// ===================================================================
// ІМПОРТИ ОСНОВНИХ МОДУЛІВ
// ===================================================================
import express from "express";
import { OAuth2Client } from 'google-auth-library';
import fileUpload from "express-fileupload";
import ftp from "basic-ftp";
import { existsSync, promises as fs } from 'fs';
import 'dotenv/config'; // Завантажує змінні середовища з .env файлу
import path, { join } from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { processLocalFiles} from './docxTopdfRad.js';
import iconv from "iconv-lite";
import axios from 'axios';
import basicAuth from "basic-auth"; 
import http from "node:http";
import logger from './logger.js'; // <-- ІМПОРТУЄМО НАШ НОВИЙ ЛОГЕР

import { appendPdfToExistingPdf } from './labrequestKT.js';
import { getStorageAdapter } from './storage/storageFactory.js'; // <-- ІМПОРТУЄМО ФАБРИКУ
import { sendViberMessage } from './turbosmsviber.js';
import * as db from './database_repository.js'; // Імпортуємо наш новий репозиторій
import { logDownload } from './download_logger.js'; // <-- ІМПОРТУЄМО НОВИЙ ЛОГЕР ЗАВАНТАЖЕНЬ
import { downloadPartnerPdf } from './partner_pdf_downloader.js'; // Імпортуємо новий модуль
import BRANCHES from './branches_config.js'; // <-- ІМПОРТУЄМО КОНФІГУРАЦІЮ

// ===================================================================
// ПОЧАТКОВЕ НАЛАШТУВАННЯ
// ===================================================================

// Отримуємо `__dirname` в ES-модулях, оскільки він не є глобальним.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors()); // Дозволяє крос-доменні запити з будь-яких джерел.
app.use(fileUpload()); // Middleware для обробки завантаження файлів.
app.use(express.json()); // Middleware для парсингу JSON-тіл запитів.
app.use(express.urlencoded({ extended: true, limit: "10mb" })); // Middleware для парсингу URL-кодованих тіл.

// Налаштування для роздачі статичних файлів (CSS, JS, зображення) з папки 'public'.
app.use(express.static(path.join(__dirname, 'public')));

// ===================================================================
// ЦЕНТРАЛІЗОВАНА КОНФІГУРАЦІЯ ФІЛІАЛІВ 
// ===================================================================

// ===================================================================
// КОНФІГУРАЦІЯ МОВ
// ===================================================================
const SUPPORTED_LANGUAGES = {
    uk: 'Українська',
    en: 'English'
   //geo: 'ქართული'
};


// ===================================================================
// КОНФІГУРАЦІЯ API ТА СЕРВІСІВ
// ===================================================================
const API_SEND_URL = 'https://api.turbosms.ua/message/send';

// ===================================================================
// КЕРУВАННЯ СТАНОМ ПІДКЛЮЧЕННЯ ДО БД
// ===================================================================
const dbConnectionState = {}; // Об'єкт для відстеження стану підключення до БД

const API_STATUS_URL = 'https://api.turbosms.ua/message/status';
const API_BALANCE_URL = 'https://api.turbosms.ua/user/balance.json';
const FTP_CONFIG = {
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASS,
    secure: false,
};

// ===================================================================
// ЛОКАЛІЗАЦІЯ
// ===================================================================
let translations = { uk: {}, en: {}, geo: {} };

/**
 * @description Завантажує файли локалізації в пам'ять при старті сервера.
 */
async function loadTranslations() {
    try {
        const langCodes = Object.keys(SUPPORTED_LANGUAGES);
        const promises = langCodes.map(lang => {
            const filePath = path.join(__dirname, 'public', 'locales', `${lang}.json`);
            return fs.readFile(filePath, 'utf-8');
        });

        const files = await Promise.all(promises);
        files.forEach((file, index) => {
            const lang = langCodes[index];
            translations[lang] = JSON.parse(file);
        });

        logger.info('Файли локалізації успішно завантажено.');
    } catch (error) {
        logger.error(`Не вдалося завантажити файли локалізації: ${error.message}`);
    }
}
// ===================================================================
// ОСНОВНІ ФУНКЦІЇ
// ===================================================================

/**
 * @description Асинхронно видаляє вказаний файл та/або директорію. Використовується для очищення тимчасових даних.
 * @param {string} filePath - Абсолютний шлях до файлу, який потрібно видалити.
 * @param {string} directoryPath - Абсолютний шлях до директорії, яку потрібно видалити.
 * @param {string} key - Унікальний ідентифікатор (код доступу), що використовується для логування.
 */
async function cleanupFiles(filePath, directoryPath, key) {    
    const trashDir = path.join(__dirname, '.trash');

    try {
        await fs.mkdir(trashDir, { recursive: true }); // Переконуємось, що "карантин" існує
    } catch (mkdirError) {
        logger.error(`[${key}] - Не вдалося створити карантинну директорію: ${mkdirError.message}`);
        // Не зупиняємо процес, просто логуємо помилку
    }

    const timestamp = () => `[${new Date().toLocaleString()}]`;

    if (filePath && existsSync(filePath)) {
        try {
            await fs.unlink(filePath);
            logger.info(`${timestamp()} Файл ${filePath} видалено.`);
        } catch (fileErr) {
            logger.warn(`[${key}] - Не вдалося видалити файл ${filePath}: ${fileErr.message}. Спроба перемістити в карантин.`);
            try {
                const newPath = path.join(trashDir, `${Date.now()}-${path.basename(filePath)}`);
                await fs.rename(filePath, newPath);
                logger.info(`[${key}] - Файл ${filePath} переміщено в карантин: ${newPath}`);
            } catch (moveErr) {
                logger.error(`[${key}] - Не вдалося перемістити файл ${filePath} в карантин: ${moveErr.message}`);
            }
        }
    }

    if (directoryPath && existsSync(directoryPath)) {
        try {
            await fs.rm(directoryPath, { recursive: true, force: true });
            logger.info(`${timestamp()} Директорія ${directoryPath} видалена.`);
        } catch (dirErr) {
            logger.warn(`[${key}] - Не вдалося видалити директорію ${directoryPath}: ${dirErr.message}. Спроба перемістити в карантин.`);
            try {
                const newPath = path.join(trashDir, `${Date.now()}-${path.basename(directoryPath)}`);
                await fs.rename(directoryPath, newPath);
                logger.info(`[${key}] - Директорію ${directoryPath} переміщено в карантин: ${newPath}`);
            } catch (moveErr) {
                logger.error(`[${key}] - Не вдалося перемістити директорію ${directoryPath} в карантин: ${moveErr.message}`);
            }
        }
    }
}

/**
 * @description Відправляє SMS через API TurboSMS.
 * @param {string} recipients - Номер телефону отримувача (10 цифр, без +38).
 * @param {string|null} code - Унікальний код доступу до результату. Якщо він є, формується посилання.
 * @param {string} smsText - Текст повідомлення.
 * @param {object} branch - Об'єкт конфігурації філіалу з `BRANCHES`.
 * @returns {Promise<object>} - Результат відправки від API TurboSMS або об'єкт помилки.
 */
async function sendSMS(recipients, code, smsText, branch) {
    try {
        const fullPhoneNumber = `38${recipients}`;
        // Формуємо посилання, якщо є код і publicUrl у конфігурації
        const link = code && branch.publicUrl ? `${branch.publicUrl}?${code}` : '';
        // Додаємо посилання до тексту SMS, якщо воно було створено
        const message = link ? `${smsText} ${link}` : smsText;

        const response = await axios.post(API_SEND_URL, {
            sms: {
                'recipients': [fullPhoneNumber],
                'text': message,
                'sender': branch.sms.sender
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${branch.sms.token}`
            }
        });
        console.log('Відповідь Turbo SMS:', response.data);
        const result = response.data;
        if (result.response_result && result.response_result.length > 0) {
            result.message_id = result.response_result[0].message_id;
        }
        return result;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error('Помилка при відправці SMS:', errorMessage);
        logger.error(`[${recipients}] [${code || 'custom'}] - Помилка при відправці SMS: ${errorMessage}`);
        return { error: true, message: errorMessage };
    }
}

/**
 * @description Відправляє довільне SMS-повідомлення без прив'язки до завантаження файлу.
 * @param {string} phoneNumber - Номер телефону отримувача (10 цифр).
 * @param {string} messageText - Текст повідомлення.
 * @param {string} token - Токен авторизації для TurboSMS.
 * @param {string} sender - Альфа-ім'я відправника.
 * @returns {Promise<object>} - Результат відправки від API TurboSMS або об'єкт помилки.
 */
async function sendCustomSmsOnly(phoneNumber, messageText, token, sender) {
    try {
        const fullPhoneNumber = `38${phoneNumber}`;
        const response = await axios.post(API_SEND_URL, {
            sms: {
                'recipients': [fullPhoneNumber],
                'text': messageText,
                'sender': sender
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        return response.data;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        logger.error(`[${phoneNumber}] [custom_only] - Помилка при відправці довільного SMS: ${errorMessage}`);
        return { error: true, message: errorMessage };
    }
}

/**
 * @description Перевіряє, чи є код статусу SMS успішним.
 * @param {number} statusCode - Код статусу від TurboSMS.
 * @returns {boolean} - `true`, якщо статус успішний, інакше `false`.
 */
function isSmsSuccess(statusCode) {
    const successCodes = [0, 1, 800, 801, 802, 803];
    return successCodes.includes(statusCode);
}

/**
 * @description Форматує номер телефону до стандартного 10-значного вигляду (напр., 0991234567).
 * @param {string} phone - Вхідний номер телефону в довільному форматі.
 * @returns {string} - Нормалізований номер телефону.
 */
function formatPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('380') && digits.length === 12) return digits.substring(2);
    if (digits.length === 9) return '0' + digits;
    return digits;
}

/**
 * @description Генерує випадковий 12-значний унікальний ID.
 * @returns {string} - Унікальний ID.
 */
function generateUniqueId() {
    return Math.random().toString().slice(2, 14);
}

/**
 * @description Переконується, що тимчасова директорія `temp` існує, і створює її, якщо ні.
 */
async function ensureTempDir() {
    const tempDir = path.join(__dirname, "temp");
    try {
        await fs.access(tempDir);
    } catch {
        await fs.mkdir(tempDir, { recursive: true });
    }
}

/**
 * @description Middleware-фабрика для базової HTTP-автентифікації.
 * @param {string} validUsername - Правильний логін.
 * @param {string} validPassword - Правильний пароль.
 * @returns {function} - Express middleware для перевірки автентифікації.
 */
const auth = (validUsername, validPassword) => (req, res, next) => {
    const user = basicAuth(req);
    if (!user || user.name !== validUsername || user.pass !== validPassword) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Restricted"');
        return res.status(401).send('Authentication required');
    }
    next();
};

/**
 * @description Функції для роботи з токенами, що зберігаються у файлі.
 * У реальному застосунку це має бути безпечна база даних.
 */
const TOKENS_PATH = path.join(__dirname, 'tokens.json');

async function saveTokens(key, tokens) {
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

async function getTokens(key) {
    try {
        const data = await fs.readFile(TOKENS_PATH, 'utf-8');
        const allTokens = JSON.parse(data);
        const tokens = allTokens[key];
        if (tokens && tokens.refresh_token) {
            return tokens;
        }
    } catch (error) {
        // Помилка читання або парсингу
    }
    return null;
}
/**
 * @description Відправляє клієнту стилізовану HTML-сторінку з повідомленням про помилку.
 * @param {object} res - Об'єкт відповіді Express.
 * @param {string} title - Заголовок помилки.
 * @param {string} message - Детальний текст помилки.
 * @param {number} [statusCode=500] - HTTP-статус код.
 */
function sendErrorPage(res, title, message, statusCode = 500, branchName = '') {
    const htmlContent = `
        <!DOCTYPE html>
        <html lang="uk">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="icon" href="/favicon.png" type="image/x-icon">            
            <title>${branchName ? `Помилка - ${branchName}` : 'Помилка запиту'}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Inter', sans-serif; background-color: #f3f4f6; margin: 0; }
                .modal-backdrop {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background-color: rgba(0, 0, 0, 0.5); display: flex;
                    justify-content: center; align-items: center; z-index: 50;
                }
                .modal-content {
                    background-color: white; padding: 2rem; border-radius: 0.5rem;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                    max-width: 90%; width: 500px; text-align: center;
                }
                .modal-title { color: #dc2626; font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem; }
                .modal-message { color: #4b5563; margin-bottom: 1.5rem; }
            </style>
        </head>
        <body>
            <div class="modal-backdrop">
                <div class="modal-content">
                    <h3 class="modal-title">${title}</h3>
                    <p class="modal-message">${message}</p>
                </div>
            </div>
        </body>
        </html>`;
    res.status(statusCode).send(htmlContent);
}

/**
 * @description Періодично шукає та видаляє "осиротілі" тимчасові папки.
 * Функція шукає в кореневій директорії проєкту папки, імена яких складаються з 12 цифр,
 * і видаляє їх разом з усім вмістом. Це допомагає очищати дані, які могли залишитися
 * після збоїв або незавершених запитів.
 */ 
async function cleanupOrphanedDirectories() {
    logger.info('Запуск періодичного очищення тимчасових директорій...');
    try {
        const entries = await fs.readdir(__dirname, { withFileTypes: true });
        const orphanDirRegex = /^\d{12}$/; // Регулярний вираз для папок з 12 цифр

        for (const entry of entries) {
            // Перевіряємо, чи є директорія і чи її ім'я відповідає шаблону 12 цифр
            // Також перевіряємо, чи це не основна директорія 'temp', щоб уникнути її видалення
            if (entry.isDirectory() && orphanDirRegex.test(entry.name) && entry.name !== 'temp') {
                // Якщо директорія знаходиться безпосередньо в корені проекту і відповідає шаблону,
                // це може бути стара тимчасова директорія. Видаляємо її.
                // Нові тимчасові директорії будуть створюватися в 'temp'
                const dirPath = path.join(__dirname, entry.name);
                try {
                    await fs.rm(dirPath, { recursive: true, force: true });
                    logger.info(`Видалено "осиротілу" директорію: ${dirPath}`);
                } catch (rmError) {
                    logger.error(`Не вдалося видалити директорію ${dirPath}: ${rmError.message}`);
                }
            }
        }

        // Додатково перевіряємо директорії всередині 'temp'
        const baseTempDir = path.join(__dirname, "temp");
        if (existsSync(baseTempDir)) {
            const tempEntries = await fs.readdir(baseTempDir, { withFileTypes: true });
            for (const entry of tempEntries) {
                if (entry.isDirectory() && orphanDirRegex.test(entry.name)) {
                    const dirPath = path.join(baseTempDir, entry.name);
                    try {
                        await fs.rm(dirPath, { recursive: true, force: true });
                        logger.info(`Видалено "осиротілу" тимчасову директорію: ${dirPath}`);
                    } catch (rmError) {
                        logger.error(`Не вдалося видалити тимчасову директорію ${dirPath}: ${rmError.message}`);
                    }
                }
            }
        } else {
            // Якщо основна тимчасова директорія не існує, створюємо її
            await fs.mkdir(baseTempDir, { recursive: true });
            logger.info(`Створено базову тимчасову директорію: ${baseTempDir}`);
        }

    } catch (error) {
        logger.error(`Помилка під час очищення "осиротілих" директорій: ${error.message}`);
    }
}
// ===================================================================
// МАРШРУТИ (API ENDPOINTS)
// ===================================================================

// --- Маршрути для сторінок завантаження для кожної філії ---
Object.values(BRANCHES).forEach(branch => {
    if (branch.path && branch.auth.user && branch.auth.pass) {
        app.get(branch.path, auth(branch.auth.user, branch.auth.pass), (req, res) => {
            res.sendFile(path.join(__dirname, 'upload-page.html'));
        });
    }
});

// --- Маршрут для отримання конфігурації фронтендом ---
app.get('/config', async (req, res) => {
    const referer = req.get('Referer') || '';
    const branch = Object.values(BRANCHES).find(b => referer && referer.endsWith(b.path));
    
    if (branch) {
        const langHeader = req.headers['accept-language'] || 'uk';
        const lang = langHeader.startsWith('en') ? 'en' : (langHeader.startsWith('ka') ? 'geo' : 'uk');

        try {
            const translationsPath = path.join(__dirname, 'public', 'locales', `${lang}.json`);
            const translationsFile = await fs.readFile(translationsPath, 'utf-8');
            const translations = JSON.parse(translationsFile);

            res.json({
                title: translations[branch.titleKey] || branch.titleKey,
                depId: branch.depId,
                smsText: translations[branch.smsTextKey] || branch.smsTextKey,
                clinicName: translations[branch.clinicNameKey] || branch.clinicNameKey,
                supportedLanguages: SUPPORTED_LANGUAGES, // Додаємо список мов
                labResultUrl: branch.labResultUrl, // Додаємо URL для результатів лабораторії
                labResultUrlEng: branch.labResultUrlEng, // <-- ДОДАНО: Передаємо URL для англомовної версії
                hasPartnerLab: branch.hasPartnerLab, // Додаємо прапорець наявності лабораторії
                partnerLabResultUrl: branch.partnerLabResultUrl, // Додаємо URL для результатів партнерської лабораторії
                publicUrl: branch.publicUrl, // <-- ДОДАНО: Передаємо публічний URL
                channel: branch.channel, // Додаємо канал відправки
                dbType: branch.db?.type || 'sybase' // Додаємо тип БД
            });
        } catch (error) {
            res.status(500).json({ message: 'Помилка завантаження конфігурації локалізації' });
        }
    } else {
        res.status(404).json({ message: 'Конфігурацію не знайдено' });
    }
});

// --- Маршрут для перевірки стану SMS-сервісу ---
app.get('/sms-health-check', async (req, res) => {
    try {
        const referer = req.get('Referer');
        const branch = Object.values(BRANCHES).find(b => referer && referer.includes(b.path));

        if (!branch || !branch.sms || !branch.sms.token) {
            throw new Error('Не вдалося визначити токен для перевірки статусу SMS.');
        }

        const response = await axios.get(API_BALANCE_URL, {
            headers: { 'Authorization': `Bearer ${branch.sms.token}`, 'Accept': 'application/json' }
        });

        if (response.data && response.data.response_code === 0) {
            res.json({ status: 'ok', data: response.data.response_result });
        } else {
            throw new Error(response.data.response_status || 'Сервіс SMS повернув неочікувану відповідь.');
        }
    } catch (error) {
        logger.error(`Помилка перевірки статусу SMS: ${error.message}`);
        res.status(503).json({ status: 'error', message: 'Сервіс SMS недоступний або помилка авторизації.' });
    }
});

// --- Маршрути для роботи з пацієнтами ---
app.post("/pacientcreate", async (req, res) => {
    const { firstName, lastName, dob, phone, gender } = req.body;
    const referer = req.get('Referer') || '';
    const branch = Object.values(BRANCHES).find(b => referer && referer.includes(b.path));
    const dbConfig = branch ? branch.db : BRANCHES.defaultSybase.db;

    try {
        const result = await db.createPatient({ firstName, lastName, dob, phone, gender }, dbConfig);
        logger.info(`[${firstName} ${lastName} ${phone}] - Спроба створення пацієнта. Статус: ${result?.[0]?.status}`);
        res.json(result);
    } catch (error) {
        logger.error(`[${branch.depId}] - Помилка створення пацієнта: ${error.message}`);
        res.status(503).json({ message: `Не вдалося створити пацієнта. ${error.message}` });
    }
});

app.post("/pacientupdate", async (req, res) => {
    const { phone, rodcisActual } = req.body;
    const referer = req.get('Referer') || '';
    const branch = Object.values(BRANCHES).find(b => referer && referer.includes(b.path));
    const dbConfig = branch ? branch.db : BRANCHES.defaultSybase.db;

    try {
        const result = await db.updatePatientPhone({ phone, rodcisActual }, dbConfig);
        res.json(result);
    } catch (error) {
        logger.error(`[${branch.depId}] - Помилка оновлення пацієнта: ${error.message}`);
        res.status(503).json({ message: `Не вдалося оновити дані пацієнта. ${error.message}` });
    }
});

app.post("/search", async (req, res) => {
    const { lastName, firstName, page = 1, limit = 10 } = req.body;
    const offset = (page - 1) * limit;

    logger.info(`[Пошук пацієнта] - Отримано запит: Прізвище='${lastName}', Ім'я='${firstName}', Сторінка=${page}`);

    if (!lastName) {
        return res.status(400).json({ message: "Прізвище є обов'язковим для пошуку" });
    }

    // Визначаємо філіал за Referer, щоб знати, до якої БД робити запит
    const referer = req.get('Referer') || '';
    const branch = Object.values(BRANCHES).find(b => referer && referer.includes(b.path));
    
    // Якщо філіал не знайдено, використовуємо конфігурацію за замовчуванням
    const dbConfig = branch ? branch.db : BRANCHES.defaultSybase.db;

    try {
        const { results, total } = await db.searchPatients({ lastName, firstName, limit, offset }, dbConfig);
        const formattedData = results.map(p => ({ ...p, tel: formatPhoneNumber(p.tel) }));
        logger.info(`[Пошук пацієнта] - Знайдено: ${total} записів. Повертаємо ${formattedData.length} на сторінці ${page}.`);
        res.json({ results: formattedData, total });
    } catch (error) {
        logger.error(`[${branch.depId}] - Помилка пошуку пацієнта: ${error.message}`);
        res.status(503).json({ message: `Не вдалося виконати пошук. ${error.message}` });
    }
});

app.post("/doc-search", async (req, res) => {
    const { docNumber, isPartnerSearch } = req.body;

    if (!docNumber) {
        return res.status(400).json({ message: "Номер документа є обов'язковим" });
    }

    let dbConfig;

    if (isPartnerSearch) {
        // Використовуємо нову конфігурацію для партнерської бази Oracle з .env
        dbConfig = {
            type: 'oracle',
            user: process.env.PARTNER_ORACLE_USER,
            password: process.env.PARTNER_ORACLE_PASSWORD,
            connectString: process.env.PARTNER_ORACLE_CONNECT_STRING
        };
    } else {
        // Використовуємо існуючу логіку для визначення конфігурації БД
        const referer = req.get('Referer') || '';
        const branch = Object.values(BRANCHES).find(b => referer && referer.includes(b.path));
        dbConfig = branch ? branch.db : BRANCHES.defaultSybase.db;
    }

    if (dbConfig.type !== 'oracle') {
        return res.status(400).json({ message: "Цей тип пошуку доступний тільки для Oracle" });
    }

    try {
        const results = await db.searchByDocumentNumber(docNumber, dbConfig);
        // Форматуємо номер телефону для кожного результату
        const formattedResults = results.map(patient => ({
            ...patient,
            tel: formatPhoneNumber(patient.tel) // Використовуємо camelCase поле 'tel'
        }));
        res.json(formattedResults);
    } catch (error) {
        logger.error(`[${dbConfig.type}] - Помилка пошуку по документу ${docNumber}: ${error.message}`);
        res.status(503).json({ message: `Не вдалося виконати пошук по документу. ${error.message}` });
    }
});

// --- Маршрут для ігнорування запитів на favicon.ico ---
app.get('/favicon.ico', (req, res) => res.status(204).end());
/**
 * @description Callback-маршрут, на який Google перенаправляє після згоди користувача.
 * Обмінює отриманий код на токени та зберігає їх.
 */
app.get('/auth/google/callback', async (req, res) => {
    const { code, state } = req.query;
    const tokenKey = state; // Отримуємо ключ філіалу зі стану

    const branch = Object.values(BRANCHES).find(b => b.storage?.config?.tokenKey === tokenKey); // Тут все правильно, шукаємо за tokenKey

    if (!branch) {
        return res.status(400).send('Не вдалося визначити філіал для збереження токену.');
    }

    const { clientId, clientSecret, redirectUri } = branch.storage.config;
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

    try {
        const { tokens } = await oauth2Client.getToken(code);
        await saveTokens(tokenKey, tokens);
        res.send(`Авторизація для філіалу '${tokenKey.toUpperCase()}' пройшла успішно! Тепер ви можете закрити цю вкладку.`);
    } catch (error) {
        logger.error(`Помилка отримання токену для '${tokenKey}': ${error.message}`);
        res.status(500).send(`Помилка авторизації: ${error.message}`);
    }
});

/**
 * @description Генерує ID, який гарантовано є унікальним у базі даних.
 * @param {object} [branch] - Об'єкт конфігурації філіалу для визначення БД.
 * @returns {Promise<string>} - Унікальний ID.
 */

/**
 * @description Маршрут для початку процесу OAuth 2.0 авторизації з Google.
 * Перенаправляє користувача на сторінку згоди Google.
 */
app.get('/auth/google/:depId', (req, res) => {
    const { depId } = req.params;
    const branch = Object.values(BRANCHES).find(b => b.depId === depId); // Шукаємо за depId

    if (!branch || branch.storage.type !== 'google-drive') {
       return res.status(400).send('Неправильна конфігурація для цього філіалу.');
    }

    const { clientId, redirectUri, tokenKey } = branch.storage.config;
    const oauth2Client = new OAuth2Client(clientId, null, redirectUri);

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline', // 'offline' потрібен для отримання refresh_token
        scope: ['https://www.googleapis.com/auth/drive'],
        prompt: 'consent', // ВАЖЛИВО: Завжди запитувати згоду, щоб гарантовано отримувати refresh_token
        state: tokenKey // Передаємо ключ філіалу для ідентифікації у callback
    });

    res.redirect(authUrl);
});


async function getValidId(branch) {
    // Визначаємо конфігурацію БД з філіалу або використовуємо дефолтну
    const dbConfig = branch ? branch.db : BRANCHES.defaultSybase.db;
    let corId;
    let idExists;
    do {
        corId = generateUniqueId();
        idExists = await db.checkCodeExists(corId, dbConfig);
    } while (idExists);
    return corId;
}

// --- Маршрути для отримання журналу відправок ---
app.get("/journal", async (req, res) => {
    const { date, depId } = req.query;
    const lang = req.headers['accept-language']?.startsWith('en') ? 'en' : (req.headers['accept-language']?.startsWith('ka') ? 'geo' : 'uk');

    if (!date || !depId) {
        return res.status(400).json({ message: "Необхідно вказати дату та ID відділення" });
    }

    // Визначаємо філіал за depId, щоб знати, до якої БД робити запит
    const branch = Object.values(BRANCHES).find(b => b.depId === depId);

    // Якщо філіал не знайдено, використовуємо конфігурацію за замовчуванням
    const dbConfig = branch ? branch.db : BRANCHES.defaultSybase.db;

    const results = await db.getJournalByDate({ date, depId }, dbConfig);
    if (results) {
        const processedResults = results.map(entry => ({
            ...entry,
            // Уніфікація для Oracle (snake_case) та Sybase (camelCase)
            patientName: entry.patientName || entry.patient_name,
            phoneNumber: entry.phoneNumber || entry.phone_number,
            smsStatus: getStatusDescription(entry.smsStatusCode, lang), // Отримуємо опис статусу за кодом
            isSuccess: isSmsSuccess(entry.smsStatusCode)
        }));
        res.json(processedResults);
    } else {
        res.status(500).json({ message: "Помилка отримання журналу" });
    }
});

app.get("/journal/search", async (req, res) => {
    const { term, depId, onlySuccessful } = req.query;
    const lang = req.headers['accept-language']?.startsWith('en') ? 'en' : (req.headers['accept-language']?.startsWith('ka') ? 'geo' : 'uk');

    if (!term || term.length < 3) {
        return res.json([]);
    }

    // Визначаємо філіал за depId, щоб знати, до якої БД робити запит
    const branch = Object.values(BRANCHES).find(b => b.depId === depId);

    // Якщо філіал не знайдено, використовуємо конфігурацію за замовчуванням
    const dbConfig =  branch.db ;

    const results = await db.searchJournal({ term, depId, onlySuccessful: onlySuccessful === 'true' }, dbConfig);

    if (results) {
        const processedResults = results.map(entry => ({
            ...entry,
            smsStatus: getStatusDescription(entry.smsStatusCode, lang), // Отримуємо опис статусу за кодом
            isSuccess: isSmsSuccess(entry.smsStatusCode)
        }));
        res.json(processedResults);
    } else {
        res.status(500).json({ message: "Помилка пошуку в журналі" });
    }
});

/**
 * @description Фонова задача для оновлення статусів доставки SMS, які ще не були оновлені.
 */
async function updateSmsStatuses(targetDepId = null) {
    if (targetDepId) {
        logger.info(`Запуск цільового оновлення статусів SMS для філіалу '${targetDepId}'...`);
    } else {
        logger.info("Запуск фонового оновлення статусів SMS для всіх філіалів...");
    }

    const branchesToProcess = targetDepId
        ? [Object.values(BRANCHES).find(b => b.depId === targetDepId)].filter(Boolean)
        : Object.values(BRANCHES);

    if (targetDepId && branchesToProcess.length === 0) {
        logger.warn(`Не знайдено конфігурацію для цільового філіалу '${targetDepId}'.`);
        return;
    }

    // Перевіряємо стан підключення до БД для цього філіалу
    if (dbConnectionState[targetDepId] && dbConnectionState[targetDepId].isDown) {
        const timeSinceLastAttempt = Date.now() - dbConnectionState[targetDepId].lastAttempt;
        const cooldownPeriod = 5 * 60 * 1000; // 5 хвилин

        if (timeSinceLastAttempt < cooldownPeriod) {
            // Якщо період "охолодження" ще не минув, пропускаємо спробу
            logger.debug(`[${targetDepId}] - Підключення до БД недоступне. Наступна спроба через ${Math.round((cooldownPeriod - timeSinceLastAttempt) / 1000)} сек.`);
            return;
        }
        // Якщо період минув, скидаємо стан і пробуємо знову
        logger.info(`[${targetDepId}] - Період очікування минув. Спроба відновити з'єднання з БД...`);
        dbConnectionState[targetDepId].isDown = false;
    }

    for (const branch of branchesToProcess) {
        // Пропускаємо "віртуальні" конфігурації, які не є реальними філіалами
        if (!branch.depId || !branch.db) continue;

        try {
            // 1. Отримуємо записи, що очікують оновлення, з БД КОНКРЕТНОГО філіалу
            const recordsToUpdate = await db.getPendingSmsRecords(branch.db);

            if (!recordsToUpdate || recordsToUpdate.length === 0) {
                logger.debug(`[${branch.depId}] - Немає SMS-статусів для оновлення.`);
                continue; // Переходимо до наступного філіалу
            }

            logger.info(`[${branch.depId}] - Знайдено ${recordsToUpdate.length} записів для оновлення статусу SMS.`);

            // 2. Перевіряємо наявність токену для цього філіалу
            if (!branch || !branch.sms || !branch.sms.token) {
                logger.warn(`[${branch.depId}] - Не знайдено токен для оновлення статусів. Пропускаємо.`);
                continue;
            }

            const messageIds = recordsToUpdate.map(rec => rec.messageid).filter(Boolean);

            // 3. Робимо запит до TurboSMS API
            logger.info(`[${branch.depId}] - Запит статусів для message IDs: ${JSON.stringify(messageIds)}`);
            const response = await axios.post(API_STATUS_URL, { messages: messageIds }, {
                headers: { 'Authorization': `Bearer ${branch.sms.token}` }
            });

            const statuses = response.data.response_result;
            if (statuses && statuses.length > 0) {
                // 4. Оновлюємо статуси в БД КОНКРЕТНОГО філіалу
                for (const statusInfo of statuses) {
                    const newDeliveryStatus = statusInfo.status_description || statusInfo.status || 'Статус не визначено';
                    await db.updateSmsDeliveryStatus(statusInfo.message_id, newDeliveryStatus, branch.db);
                    logger.info(`[${branch.depId}] - Статус для messageId ${statusInfo.message_id} оновлено: '${newDeliveryStatus}'.`);
                }
            }
        } catch (error) {
            logger.error(`[${branch.depId}] - Помилка фонового оновлення статусів SMS: ${error.message}`);
            // Більше не потрібно відстежувати стан, оскільки помилки обробляються централізовано
            // if (error.message.toLowerCase().includes('бази даних')) {
            //     logger.warn(`[${branch.depId}] - Зафіксовано помилку підключення до БД. Тимчасово припиняємо спроби.`);
            //     dbConnectionState[branch.depId] = { isDown: true, lastAttempt: Date.now() };
            // }
        }
    }
}

// --- Маршрут для завантаження файлу ---
app.post("/upload", async (req, res) => {
    const { phoneNumber, depId, smsText, patientName, isDocSearchChecked, webCode, isEnglishVersion, isPartnerSearchChecked, partnerWebCode } = req.body;

    // Визначаємо, чи є обов'язковим файл. Файл не потрібен, якщо обрано результат з одного з пошуків.
    const isFileRequired = isDocSearchChecked !== 'true' && isPartnerSearchChecked !== 'true';

    // Перевіряємо наявність файлу, тільки якщо він обов'язковий
    if (isFileRequired && (!req.files || Object.keys(req.files).length === 0 || !req.files.file)) {
        return res.status(400).json({ message: "Файл не вибрано" }); // Повідомлення, яке бачить користувач
    }

    const referer = req.get('Referer');
    const branch = Object.values(BRANCHES).find(b => referer && referer.includes(b.path));
    if (!branch || !branch.sms || !branch.sms.token || !branch.sms.sender) {
        return res.status(400).json({ message: "Не вдалося визначити конфігурацію для відправки SMS." });
    }

    const corId = await getValidId(branch);
    // Обробляємо як один файл, так і масив файлів
    const uploadedFiles = req.files && req.files.file ? (Array.isArray(req.files.file) ? req.files.file : [req.files.file]) : [];
    let filesToUpload = [...uploadedFiles];
    const pdfsToMerge = [];
    let mergedPdfPath = null; // Шлях до об'єднаного PDF

    const tempWorkingDir = path.join(__dirname, 'temp', corId); // Центральна тимчасова директорія для цього запиту
    await fs.mkdir(tempWorkingDir, { recursive: true }); // Створюємо її

    try {
        await ensureTempDir();

        // Перевірка, чи потрібно завантажувати додаткові PDF
        const shouldDownloadPdfs = (isDocSearchChecked === 'true' && webCode) || (isPartnerSearchChecked === 'true' && partnerWebCode);

        // Створюємо піддиректорії для кожного типу файлів
        const mainUploadsDir = path.join(tempWorkingDir, 'main_uploads');
        const docDownloadsDir = path.join(tempWorkingDir, 'doc_downloads');
        const partnerDownloadsDir = path.join(tempWorkingDir, 'partner_downloads');

        await fs.mkdir(mainUploadsDir, { recursive: true });
        await fs.mkdir(docDownloadsDir, { recursive: true });
        await fs.mkdir(partnerDownloadsDir, { recursive: true });

        if (shouldDownloadPdfs) {
            // Завантаження PDF з "Пошуку по документу"
            if (isDocSearchChecked === 'true' && webCode && branch.labResultUrl) {
                // Визначаємо URL залежно від вибору англійської версії
                const downloadUrl = (isEnglishVersion === 'true' && branch.labResultUrlEng)
                    ? branch.labResultUrlEng
                    : `${branch.labResultUrl}/BackEnd/TestResult`;

                logger.info(`[${corId}] - Завантаження PDF по документу (webCode: ${webCode}) у ${docDownloadsDir}.`);
                try {
                    // Зберігаємо завантажений PDF у спеціальну підпапку
                    const docPdfPath = await downloadPartnerPdf(webCode, downloadUrl, docDownloadsDir);
                    pdfsToMerge.push(docPdfPath);
                } catch (pdfError) {
                    logger.error(`[${corId}] - Помилка завантаження PDF по документу: ${pdfError.message}`);
                }
            }

            // Завантаження PDF з "Пошуку по партнеру"
            if (isPartnerSearchChecked === 'true' && partnerWebCode && branch.partnerLabResultUrl) {
                logger.info(`[${corId}] - Завантаження PDF партнера (webCode: ${partnerWebCode}) у ${partnerDownloadsDir}.`);
                try { 
                    // Зберігаємо завантажений PDF у спеціальну підпапку
                    const partnerPdfPath = await downloadPartnerPdf(partnerWebCode, branch.partnerLabResultUrl, partnerDownloadsDir);
                    pdfsToMerge.push(partnerPdfPath);
                } catch (pdfError) {
                    logger.error(`[${corId}] - Помилка завантаження PDF партнера: ${pdfError.message}`);
                }
            }
            
            // 2. Обробляємо основні завантажені файли (якщо вони є)
            if (uploadedFiles.length > 0) {
                // Переміщуємо всі завантажені файли до тимчасової директорії
                for (const mainFile of uploadedFiles) {
                    const mainFileDecodedName = iconv.decode(Buffer.from(mainFile.name, "binary"), "utf-8");
                    const mainFileLocalPath = path.join(mainUploadsDir, mainFileDecodedName);
                    await mainFile.mv(mainFileLocalPath);
                }

                // Обробляємо всі файли в піддиректорії ОДИН РАЗ після того, як всі файли переміщено
                const processedResult = await processLocalFiles(mainUploadsDir, branch.depId);
                if (processedResult.pdfFiles.length > 0) {
                    processedResult.pdfFiles.forEach(pdfName => {
                        pdfsToMerge.push(path.join(mainUploadsDir, pdfName));
                    });
                } else {
                    logger.warn(`[${corId}] - Не вдалося сконвертувати або знайти PDF файли в ${mainUploadsDir}. Пропускаємо.`);
                }
            }

            // 3. Об'єднуємо всі PDF-файли в один
            if (pdfsToMerge.length > 0) {
                logger.info(`[${corId}] - Запускаємо об'єднання ${pdfsToMerge.length} PDF-файлів. Порядок: ${JSON.stringify(pdfsToMerge)}`);
                // Перевіряємо наявність файлів перед об'єднанням
                const existingPdfsForMerge = [];
                for (const p of pdfsToMerge) {
                    if (existsSync(p)) {
                        existingPdfsForMerge.push(p);
                    } else {
                        logger.warn(`[${corId}] - Очікуваний PDF файл ${p} не знайдено під час підготовки до об'єднання.`);
                    }
                }

                if (existingPdfsForMerge.length > 0) {
                    const mergedPdfBuffer = await appendPdfToExistingPdf(existingPdfsForMerge);
                    if (mergedPdfBuffer) {
                        mergedPdfPath = path.join(tempWorkingDir, `${corId}_merged.pdf`);
                        await fs.writeFile(mergedPdfPath, mergedPdfBuffer);
                        filesToUpload = [{ name: `${corId}_merged.pdf`, localPath: mergedPdfPath }];
                    } else {
                        logger.error(`[${corId}] - Об'єднання PDF не вдалося. mergedPdfBuffer is undefined. Спроба завантажити файли окремо.`);
                        // Якщо об'єднання не вдалося, завантажуємо існуючі окремі PDF
                        filesToUpload = existingPdfsForMerge.map(pdfPath => ({ name: path.basename(pdfPath), localPath: pdfPath }));
                    }
                } else {
                    logger.error(`[${corId}] - Немає існуючих PDF файлів для об'єднання.`);
                    if (isFileRequired) {
                        return res.status(400).json({ message: "Не вдалося обробити завантажені файли." });
                    }
                    filesToUpload = []; // Немає файлів для завантаження
                }
            } else {
                // Якщо жоден файл не вдалося обробити або завантажити
                if (isFileRequired) {
                    return res.status(400).json({ message: "Не вдалося обробити завантажені файли." });
                }
                logger.warn(`[${corId}] - Немає файлів для завантаження.`);
                filesToUpload = [];
            }
        } else { // Якщо не shouldDownloadPdfs, то обробляємо лише оригінальні завантажені файли
            if (uploadedFiles.length > 0) {
                for (const mainFile of uploadedFiles) {
                    const mainFileDecodedName = iconv.decode(Buffer.from(mainFile.name, "binary"), "utf-8");
                    const mainFileLocalPath = path.join(mainUploadsDir, mainFileDecodedName);
                    await mainFile.mv(mainFileLocalPath);
                }

                const processedResult = await processLocalFiles(mainUploadsDir, branch.depId);
                const processedPdfFileNames = processedResult.pdfFiles;

                if (processedPdfFileNames.length > 0) {
                    filesToUpload = processedPdfFileNames.map(pdfName => ({
                        name: pdfName,
                        localPath: path.join(mainUploadsDir, pdfName)
                    }));
                } else {
                    logger.error(`[${corId}] - Не вдалося обробити оригінальні завантажені файли в PDF.`);
                    if (isFileRequired) {
                        return res.status(400).json({ message: "Не вдалося обробити завантажені файли." });
                    }
                    filesToUpload = [];
                }
            } else {
                if (isFileRequired) {
                    return res.status(400).json({ message: "Файл не вибрано" });
                }
                filesToUpload = [];
            }
        }

        // 4. Завантажуємо фінальні файли у сховище
        const storage = await getStorageAdapter(branch);
        const remoteFolderPath = `/${corId}`;
        const finalFilesToUpload = [];
        for (const file of filesToUpload) {
            if (existsSync(file.localPath)) {
                finalFilesToUpload.push(file);
            } else {
                logger.error(`[${corId}] - Файл для завантаження не знайдено: ${file.localPath}`);
            }
        }

        if (finalFilesToUpload.length === 0) {
            if (isFileRequired) {
                return res.status(400).json({ message: "Не вдалося підготувати файли для завантаження." });
            }
            logger.warn(`[${corId}] - Немає фінальних файлів для завантаження.`);
        } else {
            const remoteFolderIdentifier = await storage.ensureDir(remoteFolderPath);
            for (const file of finalFilesToUpload) {
                const decodedFileName = iconv.decode(Buffer.from(file.name, "binary"), "utf-8");
                const remoteTarget = branch.storage.type === 'google-drive' ? remoteFolderIdentifier : `${remoteFolderPath}/${decodedFileName}`;
                await storage.uploadFrom(file.localPath, remoteTarget);
            }
        }

        let smsStatus = { response_code: -1, message: "SMS не відправлялось" };
        if (phoneNumber && phoneNumber.length === 10) {
            // Перевіряємо, чи ввімкнена відправка повідомлень для цієї філії
            if (branch.messagingEnabled) {
                const fullPhoneNumber = `38${phoneNumber}`;
                const link = branch.publicUrl ? `${branch.publicUrl}?${corId}` : '';

                if (branch.channel === 'viber' && branch.viber?.token) {
                    smsStatus = await sendViberMessage({
                        recipients: [fullPhoneNumber],
                        text: smsText,
                        sender: branch.viber.sender,
                        token: branch.viber.token,
                        buttonText: "Переглянути результат", // Текст для кнопки
                        buttonUrl: link
                    });
                } else {
                    // Відправка через SMS за замовчуванням або якщо канал 'sms'
                    smsStatus = await sendSMS(phoneNumber, corId, smsText, branch);
                }
            } else {
                // Імітуємо успішну відправку, якщо messagingEnabled = false
                smsStatus = {
                    response_code: 801, // Успішний код
                    response_status: "OK",
                    response_result: [{ message_id: "test-mode-id-" + Date.now() }]
                };
                logger.info(`[${phoneNumber}] [${corId}] - Імітація відправки повідомлення (messagingEnabled=false) для філії '${branch.depId}'.`);
            }
        }

        const smsStatusCode = smsStatus.response_code ?? (smsStatus.error ? 999 : -1);
        const lang = req.headers['accept-language']?.startsWith('en') ? 'en' : (req.headers['accept-language']?.startsWith('ka') ? 'geo' : 'uk');
        const smsStatusText = getStatusDescription(smsStatusCode, lang);
        const messageId = smsStatus.message_id || null;
        
        await db.saveUniqueId({
            uniqId: corId,
            patientName,
            phoneNumber,
            smsStatus: smsStatusText,
            department: depId,
            smsStatusCode,
            messageId
        }, branch.db);

        // Визначаємо назву сховища для коректного логування та відповіді
        const storageTypeName = branch.storage.type === 'google-drive' ? 'Google Drive' : 'FTP';

        logger.info(`[${phoneNumber}] [${corId}] - Файл успішно завантажено на ${storageTypeName}. Статус SMS (${lang}): ${smsStatusText}`);
        res.json({
            message: `Файл успішно завантажено на ${storageTypeName}`,
            smsStatus: smsStatusText,
            isSuccess: isSmsSuccess(smsStatusCode)
        });

    } catch (error) {
        console.error("Помилка:", error);
        logger.error(`[${phoneNumber}] [${corId}] - Помилка при завантаженні файлу: ${error.message}`);
        res.status(500).json({ message: "Помилка при завантаженні файлу" });
    } finally {
        // Очищення центральної тимчасової директорії для цього запиту
        if (existsSync(tempWorkingDir)) {
            await fs.rm(tempWorkingDir, { recursive: true, force: true }).catch(err => {
                logger.error(`[${corId}] - Помилка видалення тимчасової директорії ${tempWorkingDir}: ${err.message}`);
            });
        }
    }
});

// --- Маршрут для відправки довільного SMS ---
app.post("/send-custom-sms", async (req, res) => {
    const { phoneNumber, messageText, patientName } = req.body;
    const lang = req.headers['accept-language']?.startsWith('en') ? 'en' : (req.headers['accept-language']?.startsWith('ka') ? 'geo' : 'uk');

    if (!phoneNumber || !messageText) {
        return res.status(400).json({ isSuccess: false, message: "Номер телефону та текст повідомлення є обов'язковими." });
    }

    const referer = req.get('Referer');
    const branch = Object.values(BRANCHES).find(b => referer && referer.includes(b.path));

    if (!branch || !branch.sms || !branch.sms.token) {
        return res.status(400).json({ isSuccess: false, message: "Не вдалося визначити конфігурацію для відправки SMS." });
    }

    try {
        // Для довільного SMS код доступу (corId) не потрібен, тому передаємо null.
        // Функція sendSMS коректно обробить це і не буде додавати посилання.
        const smsResult = await sendSMS(phoneNumber, null, messageText, branch);
        const smsStatusCode = smsResult.response_code ?? (smsResult.error ? 999 : -1);
        const smsStatusText = getStatusDescription(smsStatusCode, lang);

        logger.info(`[${phoneNumber}] [custom] - Відправлено довільне SMS. Статус: ${smsStatusText}`);
        res.json({ isSuccess: isSmsSuccess(smsStatusCode), message: smsStatusText });
    } catch (error) {
        logger.error(`[${phoneNumber}] [custom] - Помилка відправки довільного SMS: ${error.message}`);
        res.status(500).json({ isSuccess: false, message: `Помилка сервера: ${error.message}` });
    }
});

/**
 * @description Маршрут для примусового запуску фонового оновлення статусів SMS.
 * Викликається з фронтенду при завантаженні сторінки.
 */
app.post("/trigger-sms-update", (req, res) => {
    const { depId } = req.body;
    const branch = Object.values(BRANCHES).find(b => b.depId === depId);

    // Запускаємо оновлення, тільки якщо філіал знайдено і він має налаштування БД
    if (branch && branch.db) {
        logger.info(`Примусовий запуск оновлення статусів SMS для філіалу '${depId}' з фронтенду.`);
        updateSmsStatuses(depId); // Запускаємо без await, щоб не блокувати відповідь
    } else {
        logger.warn("Примусовий запуск оновлення без depId. Оновлення не виконано.");
    }
    res.status(202).json({ message: "Запит на оновлення статусів SMS прийнято." });
});

/**
 * @description Обробник маршруту для відображення PDF-файлу.
 * Завантажує файли з FTP, обробляє їх, вбудовує в HTML і віддає клієнту.
 */
const displayPdfRoute = async (req, res) => {
  const key = Object.keys(req.query)[0];
  // Determine language for error messages
  const langHeader = req.headers['accept-language'] || 'uk';
  const lang = langHeader.startsWith('en') ? 'en' : (langHeader.startsWith('ka') ? 'geo' : 'uk');

  if (!key) {
      return sendErrorPage(res, "Помилка запиту", "Не вказано ідентифікатор результату. Будь ласка, перевірте посилання.", 400);
  }
  // Перевірка формату коду доступу
  if (!/^\d{12}$/.test(key)) {
      return sendErrorPage(res, "Некоректний код", "Код доступу має складатися з 12 цифр. Будь ласка, перевірте правильність введеного коду.", 400);
  }

  // Визначаємо філіал за URL-шляхом запиту (наприклад, /rd, /ct)
  const branch = Object.values(BRANCHES).find(b => b.resultPath && req.path === b.resultPath);
  let branchDisplayName = '';
  if (!branch) {
      return sendErrorPage(res, "Помилка конфігурації", `Не вдалося визначити філіал для цього запиту.`, 404);
  }
  branchDisplayName = translations[lang]?.[branch.clinicNameKey] || branch.depId;

  const tempDisplayDir = path.join(__dirname, 'temp', key); // Використовуємо тимчасову директорію для відображення
  let filesInDir = []; // Ініціалізуємо список файлів

  try {
    await fs.mkdir(tempDisplayDir, { recursive: true }); // Переконуємось, що тимчасова директорія існує

    const storage = await getStorageAdapter(branch);
    const remoteFolderIdentifier = branch.storage.type === 'google-drive' ? await storage.ensureDir(`/${key}`) : `/${key}`;
    const filesToDownload = await storage.list(remoteFolderIdentifier);

    // Перевіряємо, чи є що завантажувати
    if (!filesToDownload || filesToDownload.length === 0) {
        logger.warn(`[${key}] - За введеним кодом не знайдено файлів у сховищі (${branch.storage.type}).`);
        return sendErrorPage(res, "Результат не знайдено", "Результат за цим кодом ще не готовий або код невірний. Будь ласка, перевірте код або спробуйте пізніше.", 404, branchDisplayName);
    }

    // Завантажуємо кожен файл у тимчасову директорію
    for (const file of filesToDownload) { // filesToDownload - це масив об'єктів { id, name, ... }
        const remoteFilePath = branch.storage.type === 'google-drive' ? file.id : `${remoteFolderIdentifier}/${file.name}`;
        const localFilePath = path.join(tempDisplayDir, file.name);
        await storage.downloadTo(remoteFilePath, localFilePath);
    }
    // Після завантаження запускаємо обробку (конвертацію, очищення метаданих)
    const processedResult = await processLocalFiles(tempDisplayDir, branch.depId);
    filesInDir = processedResult.pdfFiles; // Отримуємо список успішно оброблених PDF-файлів (базові імена)

    if (filesInDir.length === 0) {
        logger.error(`[${key}] - Файли для обробки не знайдено після обробки.`);
        return sendErrorPage(res, "Результат не знайдено", "На жаль, файли для цього дослідження не знайдено. Можливо, вони ще в обробці.", 404, branchDisplayName);
    }

    let finalPdfBuffer = null;

    try {
        const pdfPathsToMerge = filesInDir.map(file => path.join(tempDisplayDir, file)); // Створюємо повні шляхи

        // Перевіряємо наявність файлів перед об'єднанням
        const existingPdfPaths = [];
        for (const p of pdfPathsToMerge) {
            if (existsSync(p)) {
                existingPdfPaths.push(p);
            } else {
                logger.warn(`[${key}] - Очікуваний PDF файл ${p} не знайдено під час підготовки до об'єднання.`);
            }
        }

        if (existingPdfPaths.length === 0) {
            logger.error(`[${key}] - Жодного існуючого PDF файлу не знайдено для об'єднання/відправки.`);
            return sendErrorPage(res, "Помилка обробки PDF", "Не вдалося знайти жодного PDF файлу для відображення.", 500, branchDisplayName);
        }

        if (existingPdfPaths.length === 1) {
            // Якщо файл один, просто читаємо його
            finalPdfBuffer = await fs.readFile(existingPdfPaths[0]);
        } else {
            // Якщо файлів декілька, об'єднуємо їх
            logger.info(`[${key}] - Знайдено ${existingPdfPaths.length} файлів. Запускаємо об'єднання...`);
            finalPdfBuffer = await appendPdfToExistingPdf(existingPdfPaths);
        }
    } catch (pdfProcessingError) {
        logger.error(`[${key}] - Помилка під час створення або об'єднання PDF: ${pdfProcessingError.message}`);        
        return sendErrorPage(res, "Помилка обробки PDF", "Не вдалося обробити або об'єднати PDF файли.", 500, branchDisplayName);
    }

    // Перевіряємо, чи був успішно створений буфер PDF
    if (!finalPdfBuffer) {
        logger.error(`[${key}] - Фінальний PDF-буфер порожній після спроби об'єднання/читання.`);
        return sendErrorPage(res, "Помилка створення файлу", "Не вдалося створити фінальний PDF-документ. Можливо, один з файлів пошкоджено.", 500, branchDisplayName);
    }

    // Зберігаємо фінальний буфер у тимчасовий файл перед відправкою
    const finalPdfPath = path.join(tempDisplayDir, `${key}_final.pdf`);
    try {
        await fs.writeFile(finalPdfPath, finalPdfBuffer);
        logger.info(`[${key}] - Фінальний PDF успішно збережено локально: ${finalPdfPath}`);
    } catch (writeError) {
        logger.error(`[${key}] - Помилка збереження фінального PDF: ${writeError.message}`);
        return sendErrorPage(res, "Помилка збереження файлу", "Не вдалося зберегти фінальний PDF-документ перед відправкою.", 500, branchDisplayName);
    }

    // Відправляємо готовий PDF-файл клієнту, читаючи його з диска.
    res.sendFile(finalPdfPath, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${key}.pdf"`
        }
    });

    res.on('finish', () => {
        // Додаємо затримку перед видаленням, щоб уникнути помилок блокування файлів на Windows
        setTimeout(() => {
            logDownload(branch.depId, key); // <-- ЛОГУЄМО УСПІШНЕ ЗАВАНТАЖЕННЯ
            cleanupFiles(null, tempDisplayDir, key); // Очищаємо тимчасову директорію
        }, 10000); // 10 секунд
    });
  } catch (error) {
    logger.error(`[${key}] - Помилка обробки: ${error.message}`);
    sendErrorPage(res, "Помилка сервера", `Під час обробки вашого запиту сталася внутрішня помилка. Будь ласка, спробуйте пізніше.`, 500, branchDisplayName);
  }
};

// --- Маршрут для віддачі даних PDF ---
app.get("/pdf-data/:key", async (req, res) => {
    const { key } = req.params;
    if (!key) return res.status(400).send("Не вказано ID результату.");

    // Цей маршрут, ймовірно, застарів або використовується для іншого сценарію.
    // Якщо він має віддавати PDF, який вже був оброблений і збережений,
    // то шлях до файлу має бути в тимчасовій директорії.
    const directoryPath = path.join(__dirname, 'temp', key); // Припускаємо, що файл знаходиться в temp/${key}
    const filePath = path.join(directoryPath, `${key}_final.pdf`); // Припускаємо, що фінальний файл називається key_final.pdf

    try {
        if (existsSync(filePath)) {
            res.sendFile(filePath, (err) => {
                if (err) {
                    logger.error(`[${key}] - Помилка відправки файлу: ${err.message}`);
                }
                // Додаємо затримку, щоб уникнути помилки EPERM на Windows.
                setTimeout(() => {
                    cleanupFiles(null, directoryPath, key); // Очищаємо всю тимчасову директорію
                }, 10000); // Затримка 10 секунд
            });
        } else {
            res.status(404).send(`Файл для ID: ${key} не знайдено.`);
        }
    } catch (error) {
        logger.error(`[${key}] - Помилка доступу до файлу: ${error.message}`);
        res.status(500).send(`Помилка доступу до файлу: ${error.message}`);
    }
});

// --- Маршрути для відображення PDF для кожної філії ---
app.get("/mrt", displayPdfRoute);
app.get("/ct", displayPdfRoute);
app.get("/rd", displayPdfRoute);
app.get("/zdvrd",displayPdfRoute);
app.get("/ol",displayPdfRoute);

/**
 * @description Повертає текстовий опис для коду статусу TurboSMS.
 * @param {number} statusCode - Код статусу.
 * @param {string} [lang='uk'] - Мова ('uk' або 'en') для опису.
 * @returns {string} - Опис статусу.
 */
function getStatusDescription(statusCode, lang = 'uk') {
    // Визначаємо мову. Якщо запитана мова не підтримується, використовуємо 'uk' за замовчуванням.
    const langKey = translations[lang] ? lang : 'uk';
    // Отримуємо об'єкт з повідомленнями для обраної мови.
    const statusMessages = translations[langKey]?.sms_status || {};

    // Шукаємо опис за кодом статусу.
    const description = statusMessages[statusCode];

    // Якщо опис знайдено, повертаємо його.
    if (description) {
        return description;
    }

    // Якщо опис не знайдено, використовуємо шаблон для невідомого коду.
    const unknownMessageTemplate = statusMessages.unknown || `Невідомий код стану: {{statusCode}}`;
    // Замінюємо плейсхолдер на реальний код статусу.
    return unknownMessageTemplate.replace('{{statusCode}}', statusCode);
}

// ===================================================================
// ЗАПУСК СЕРВЕРА
// ===================================================================
const server1 = http.createServer(app);
server1.listen(process.env.PORT1 || 3000, () => {
    console.log(`Server is running on port ${process.env.PORT1 || 3000}`);
    logger.info(`Server is running on port ${process.env.PORT1 || 3000}`);
});

const server2 = http.createServer(app);
server2.listen(process.env.PORT2 || 1026, async () => {
    console.log(`Server is running on port ${process.env.PORT2 || 1080}`);
    logger.info(`Server is running on port ${process.env.PORT2 || 1080}`);
    
    // Завантажуємо переклади перед початком роботи
    await loadTranslations();

    // Запускаємо фонове оновлення статусів SMS кожні 5 хвилин
    setInterval(async () => {
        try {
            await updateSmsStatuses();
        } catch (error) {
            logger.error(`Критична помилка під час періодичного оновлення статусів SMS: ${error.message}`);
        }
    }, 300000); // 300000 мс = 5 хвилин

    // Запускаємо періодичне очищення "осиротілих" папок кожні 30 хвилин
    setInterval(async () => {
        try {
            await cleanupOrphanedDirectories();
        } catch (error) {
            logger.error(`Критична помилка під час періодичного очищення папок: ${error.message}`);
        }
    }, 1800000); // 1800000 мс = 30 хвилин

    // Перший запуск очищення одразу після старту
    cleanupOrphanedDirectories();
});