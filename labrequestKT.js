import { promises as fs } from 'fs'; // Імпорт функцій роботи з файлами
import path from 'path'; // <-- ДОДАНО ЦЕЙ РЯДОК
import { PDFDocument } from 'pdf-lib'; // Імпорт необхідних компонентів з pdf-lib

/**
 * Функція для об'єднання PDF-файлів
 * @param {string[]} pdfFilePaths - Масив повних шляхів до PDF-файлів для додавання
 * @returns {Promise<Uint8Array>} - Бінарний результат об'єднаного PDF
 */
export async function appendPdfToExistingPdf(pdfFilePaths) {
    try {
        if (!pdfFilePaths || pdfFilePaths.length === 0) {
            console.warn("Масив шляхів до PDF-файлів порожній. Повертаю null.");
            return null;
        }

        // Якщо є тільки один файл, просто повертаємо його вміст
        if (pdfFilePaths.length === 1) {
            console.log("Для об'єднання передано лише один файл. Повертаю його вміст.");
            return await fs.readFile(pdfFilePaths[0]);
        }

        // Створюємо новий документ, в який будемо все об'єднувати
        const mergedPdfDoc = await PDFDocument.create();

        // Проходимо по кожному шляху до файлу
        for (const pdfPath of pdfFilePaths) {
            const pdfBytes = await fs.readFile(pdfPath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const copiedPages = await mergedPdfDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => {
                mergedPdfDoc.addPage(page);
            });
        }

        console.log(`PDF-файли (${pdfFilePaths.length} шт.) успішно обʼєднані.`);

        // Зберігаємо об'єднаний PDF у буфер
        return await mergedPdfDoc.save();
    } catch (error) {
        console.error('Сталася помилка під час об\'єднання PDF:', error);
        return null; // Повертаємо null у разі помилки
    }
}