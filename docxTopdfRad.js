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
            
            // LibreOffice може виводити попередження в stderr, але все одно успішно конвертувати.
            // Перевіряємо, чи stderr містить явні ознаки помилки.
            if (stderr && (stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('failed'))) {
                return reject(new Error(`Сталася помилка під час конвертації: ${stderr}`));
            }

            // Важлива перевірка: переконуємось, що вихідний PDF файл дійсно існує
            fs.access(outputPdfPath)
                .then(() => resolve(`Конвертація завершена! PDF збережено за адресою: ${outputPdfPath}`))
                .catch(() => reject(new Error(`Конвертація завершилась, але вихідний PDF файл ${outputPdfPath} не знайдено.`)));

            
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
    const successfullyProcessedPdfPaths = []; // Зберігаємо повні шляхи успішно оброблених PDF
    try {
        const localFiles = await fs.readdir(directoryId);

        if (!localFiles || localFiles.length === 0) {
            console.warn(`[processLocalFiles] У локальній директорії ${directoryId} відсутні файли для обробки.`);
            return { WebPath: path.basename(directoryId), pdfFiles: [] };
        }

        for (const localFile of localFiles) {
            const inputPath = path.join(directoryId, localFile);
            const outputPdfPath = path.join(directoryId, changeExtensionToPdf(localFile));

            try {
                console.log(`[processLocalFiles] Обробляємо локальний файл: ${localFile}`);

                if (/\.(docx?)$/i.test(localFile)) {
                    // DOCX → конвертація
                    try {
                        await convertDocxToPdf(inputPath, outputPdfPath);
                        // Після успішної конвертації перевіряємо, чи існує вихідний PDF
                        if (await fs.access(outputPdfPath).then(() => true).catch(() => false)) {
                            await removePdfMetadata(outputPdfPath);
                            successfullyProcessedPdfPaths.push(outputPdfPath);
                        } else {
                            console.error(`[processLocalFiles] Помилка: Конвертація DOCX ${localFile} в PDF не створила файл ${outputPdfPath}.`);
                        }
                    } catch (conversionError) {
                        handleError(`Конвертація DOCX ${localFile}`, conversionError);
                    } finally {
                        // Завжди намагаємося видалити оригінальний DOCX файл
                        if (await fs.access(inputPath).then(() => true).catch(() => false)) {
                            await fs.unlink(inputPath).catch(err => {
                                if (err.code !== 'ENOENT') handleError(`Видалення DOCX ${inputPath}`, err);
                            });
                        }
                    }
                } else if (localFile.toLowerCase().endsWith('.pdf')) {
                    // PDF → очищення метаданих
                    if (await fs.access(inputPath).then(() => true).catch(() => false)) {
                        await removePdfMetadata(inputPath);
                        successfullyProcessedPdfPaths.push(inputPath);
                    } else {
                        console.warn(`[processLocalFiles] PDF файл ${inputPath} не існує, пропускаємо очищення метаданих.`);
                    }
                } else {
                    console.warn(`[processLocalFiles] Файл ${localFile} має непідтримуване розширення, пропускаємо.`);
                }
            } catch (fileError) {
                handleError(`Обробка файлу ${localFile}`, fileError);
            }
        }

        console.log(`[processLocalFiles] Завершено обробку. Знайдено ${successfullyProcessedPdfPaths.length} PDF файлів.`);
        return { WebPath: path.basename(directoryId), pdfFiles: successfullyProcessedPdfPaths.map(p => path.basename(p)) };
    } catch (e) {
        handleError('Локальна обробка файлів', e);
        throw e;
    }
}