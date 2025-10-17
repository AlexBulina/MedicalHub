import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { PDFDocument } from 'pdf-lib'; // Імпорт pdf-lib

// Визначаємо __dirname для поточного модуля
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Використовуємо повний шлях до libreoffice
const libreOfficePath = '"C:\\Program Files\\LibreOffice\\program\\soffice.exe"'; // Замінити на  шлях до LibreOffice

// Універсальна функція для обробки помилок
export function handleError(context, error) {
    console.error(`[${context}]`, error.message || error);
}

// Конвертація DOCX у PDF
export async function convertDocxToPdf(docxPath, outputPdfPath) {
    return new Promise((resolve, reject) => {
        // Перетворюємо шляхи на абсолютні, щоб уникнути проблем з відносними шляхами в LibreOffice
        const absoluteDocxPath = path.resolve(docxPath);
        const absoluteOutDir = path.resolve(path.dirname(outputPdfPath));

        const command = `${libreOfficePath} --headless --convert-to pdf --outdir "${absoluteOutDir}" "${absoluteDocxPath}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) return reject(new Error(`Помилка при конвертації: ${error.message}. Stderr: ${stderr}`));
            if (stderr && !stderr.includes('writer_pdf_Export')) return reject(new Error(`Сталася помилка: ${stderr}`));
            resolve(`Конвертація завершена! PDF збережено за адресою: ${outputPdfPath}`);
        });
    });
}





// Очищення метаданих з PDF
export async function removePdfMetadata(pdfPath) {
    try {
        const pdfBytes = await fs.readFile(pdfPath); // Зчитуємо PDF-файл
        const pdfDoc = await PDFDocument.load(pdfBytes); // Завантажуємо PDF у pdf-lib

        // Очищаємо стандартні метадані
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('');
        pdfDoc.setCreator('');



        // Зберігаємо оновлений PDF
        const pdfBytesCleaned = await pdfDoc.save();
        await fs.writeFile(pdfPath, pdfBytesCleaned);
        console.log(`Метадані видалено з файлу: ${pdfPath}`);
    } catch (error) {
        handleError(`Очищення метаданих ${pdfPath}`, error);
    }
}


// Зміна розширення файлу на .pdf
export function changeExtensionToPdf(filePath) {
    if (!filePath.endsWith('.docx')) {
        if (filePath.endsWith('.pdf')) {
            return filePath;
        }
        throw new Error('Вхідний файл повинен мати розширення .docx або .pdf');
    }
    return filePath.replace('.docx', '.pdf');
}

// Локальна обробка файлів (конвертація, метадані, фон)
export async function processLocalFiles(directoryId, DepartmentId = null) {
    try {
        const localFiles = await fs.readdir(directoryId);

        if (!localFiles || localFiles.length === 0) {
            throw new Error('У локальній директорії відсутні файли для обробки');
        }

        for (const localFile of localFiles) {
            try {
                console.log(`Обробляємо локальний файл: ${localFile}`);
                const inputPath = path.join(directoryId, localFile);
                const outputPdfPath = path.join(directoryId, changeExtensionToPdf(localFile));

                if (/\.(docx?)$/i.test(localFile)) {
                    // DOCX → конвертація
                    const message = await convertDocxToPdf(inputPath, outputPdfPath);
                    console.log(message);

                    // очищаємо метадані
                    await removePdfMetadata(outputPdfPath);

                    // видаляємо оригінал DOCX
                    await fs.unlink(inputPath).catch(err => {
                        if (err.code !== 'ENOENT') throw err; // Ігноруємо помилку, тільки якщо файл не знайдено
                        console.log(`Файл ${inputPath} вже був видалений, пропускаємо.`);
                    });
                } else if (localFile.toLowerCase().endsWith('.pdf') && DepartmentId === null) {
                    // PDF → очищення метаданих
                    await removePdfMetadata(inputPath);
                } else {
                    console.warn(`⚠ Файл ${localFile} має непідтримуване розширення`);
                }

            } catch (fileError) {
                handleError(`Обробка файлу ${localFile}`, fileError);
            }
        }

        const files = await fs.readdir(directoryId);
        console.log('Список файлів:', files);

        return { WebPath: path.basename(directoryId), pdfFiles: files };
    } catch (e) {
        handleError('Локальна обробка файлів', e);
        throw e;
    }
}