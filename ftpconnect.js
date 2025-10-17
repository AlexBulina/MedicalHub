import fs from 'fs';
import ftp from 'basic-ftp';
import 'dotenv/config'; // Додаємо для завантаження змінних середовища

// Виносимо конфігурацію в окремий об'єкт, використовуючи змінні середовища
const FTP_CONFIG = {
    host: process.env.FTP_HOST || "localhost",
    user: process.env.FTP_USER || "anonymous",
    password: process.env.FTP_PASS || "mail@mail.ua",
    secure: false,
};

const ftpClient = {
    ftp_connect: async function ftp_connect(Target) {
        const client = new ftp.Client();
        try {
            // Підключення до FTP сервера
            await client.access(FTP_CONFIG);

            // Перехід до папки на FTP сервері
            await client.cd(Target);

            // Отримання списку файлів на FTP сервері
            const ftpFiles = await client.list();

// Фільтрація файлів з розширенням .docx і .pdf
            const filteredFiles = ftpFiles.filter(file => {
                // Перевіряємо, чи це файл, а не папка, і чи має потрібне розширення
                const fileExtension = file.name.split('.').pop().toLowerCase(); // Отримуємо розширення файлу
                return (!file.isDirectory  && (fileExtension === 'docx' || fileExtension === 'pdf'));
            });

            const localFolderPath = "./" + Target;
            if (!fs.existsSync(localFolderPath)) {
                fs.mkdirSync(localFolderPath, { recursive: true });

                console.log("Створено локальну папку:", localFolderPath);
            }

            // Копіювання файлів локально
            for (const file of filteredFiles) {
                if (file.isDirectory === false) {
                    await client.downloadTo(fs.createWriteStream(`./${Target}/${file.name}`), file.name);
                }
            }

            // Повернення масиву імен файлів з папки FTP
            return {
                ftpFiles: filteredFiles.map((file) => file.name),
                clientftp: client,
            };
        } catch (error) {
            // console.error("Помилка:", error);
        } finally {
            // Закриття з'єднання з FTP сервером
            client.close();
        }
    },

    ftp_del: async function ftp_del(localPath, remotePath) {
        const client = new ftp.Client();
        try {
            // З'єднання з FTP сервером
            await client.access(FTP_CONFIG);

            if (!fs.existsSync(remotePath)) {
                await client.ensureDir(remotePath).then(() => {
                    client.uploadFrom(localPath, remotePath + "results.pdf").then(() => {
                        client.close();
                    });
                    fs.rm("./result.pdf", { recursive: true, force: true }, () => {});
                });
            } else {
                await client.uploadFrom(localPath, remotePath).then(() => {
                    // fs.rm('./result.pdf',{recursive: true, force: true},(response)=>{
                    //  client.close();
                });
            }

            console.log("Файл успішно скопійовано на FTP сервер");
        } catch (err) {
            console.error("Помилка при копіюванні файлу на FTP сервер:", err);
        } finally {
            // Завершення з'єднання
        }
    },

    checkDirectoryOnFTP: async function checkDirectoryOnFTP(directoryName) {
        const client = new ftp.Client();
        try {
            await client.access(FTP_CONFIG);
            try {
                const fileInfo = await client.list(directoryName);
                return fileInfo;
            } catch (error) {
                if (error.code === 550) {
                    return {
                        code: error.code,
                    };
                }
                console.error("Произошла ошибка:", error);
            }
        } finally {
            // Завершуємо з'єднання з FTP
            client.close();
        }
    },
};

// Експортуємо модуль за замовчуванням
export default ftpClient;
