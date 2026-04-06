import { promises as fs } from 'fs'; // Імпорт функцій роботи з файлами
import { PDFDocument } from 'pdf-lib'; // Імпорт необхідних компонентів з pdf-lib

/**
 * Функція для об'єднання PDF-файлів
 * @param {Uint8Array} masterBuffer - Бінарні дані головного PDF-документа
 * @param {string[]} pdfFiles - Масив назв PDF-файлів для додавання
 * @param {string} outputPdfPath - Шлях до збереження PDF-файлу
 * @param {string} folderName - Папка з PDF-файлами
 * @param {string|null} outputPdfPath - (Опціонально) Шлях до збереження PDF-файлу
 * @param {string|null} folderName - (Опціонально) Папка з PDF-файлами, якщо pdfFiles - це імена файлів
 * @returns {Promise<Uint8Array>} - Бінарний результат об'єднаного PDF
 */

export async function appendPdfToExistingPdf(masterBuffer, pdfFiles, outputPdfPath = null, folderName = null) {
    try {
        // Завантаження вихідного PDF
        const mergedPdfDoc = await PDFDocument.load(masterBuffer);

        // Проходимо через інші PDF-файли
        for (const currentFileName of pdfFiles) {
            if (currentFileName.toLowerCase().endsWith('.pdf')) {
                const currentPdfBytes = await fs.readFile(`${folderName}/${currentFileName}`);
                const currentPdfDoc = await PDFDocument.load(currentPdfBytes);

                // Копіюємо сторінки з поточного PDF до кінцевого документа
                for (let j = 0; j < currentPdfDoc.getPageCount(); j++) {
                    const [currentPdfPage] = await mergedPdfDoc.copyPages(currentPdfDoc, [j]);
                    mergedPdfDoc.addPage(currentPdfPage);
                }
            }
        }

        // Лог результату
        console.log('PDF-файли успішно обʼєднані.');

        // Збереження об'єднаного PDF
        const BufferPdf = Buffer.from(await mergedPdfDoc.save());
        return BufferPdf;

    } catch (error) {
        // Лог помилки
        console.error('Сталася помилка:', error);
    } finally {
        if (folderName) {
            // Видалення тимчасової папки, якщо вона використовувалась
            await fs.rm(folderName, { recursive: true, force: true }).catch((err) =>
                console.error('Не вдалося видалити папку:', err)
            );
        }
    }
}
