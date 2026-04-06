import fs from 'fs-extra';
import path from 'path';
import { fromPath } from 'pdf2pic';
import { createCanvas, loadImage } from 'canvas';

/**
 * Модуль для вилучення зображень з PDF файлів використовуючи pdf2pic
 * Простіше і надійніше рішення для Node.js
 */

const OUTPUT_DIR = './PriscaPdf';

/**
 * Створює вихідну директорію якщо вона не існує
 */
async function ensureOutputDir() {
    await fs.ensureDir(OUTPUT_DIR);
}

/**
 * Сканує PDF сторінку і зберігає її як зображення  
 * @param {string} pdfPath - Шлях до PDF файлу
 * @param {number} pageNumber - Номер сторінки (починаючи з 1)
 * @param {string} outputFilename - Ім'я вихідного файлу (опціонально)
 * @returns {Promise<Object>} - Об'єкт з шляхом і розмірами
 */
async function scanPdfPage(pdfPath, pageNumber = 1, outputFilename = null) {
    try {
        if (!await fs.pathExists(pdfPath)) {
            throw new Error(`PDF файл не знайдено: ${pdfPath}`);
        }

        await ensureOutputDir();

        console.log(`Сканування сторінки ${pageNumber} з PDF: ${pdfPath}`);

        // Налаштування pdf2pic
        const options = {
            density: 200,           // DPI (якість)
            saveFilename: outputFilename || `scan_page${pageNumber}`,
            savePath: OUTPUT_DIR,
            format: 'jpg',
            width: 2000,           // Максимальна ширина
            height: 3000           // Максимальна висота
        };

        const converter = fromPath(pdfPath, options);

        // Конвертуємо конкретну сторінку
        const result = await converter(pageNumber, { responseType: 'image' });

        if (!result || !result.path) {
            throw new Error('Не вдалося сконвертувати PDF сторінку');
        }

        // Отримуємо інформацію про зображення
        const image = await loadImage(result.path);
        const filename = path.basename(result.path);

        console.log(`Скановано: ${filename} (${image.width}x${image.height}px)`);

        return {
            path: result.path,
            filename: filename,
            width: image.width,
            height: image.height,
            pageNumber: pageNumber
        };

    } catch (error) {
        console.error('Помилка сканування PDF сторінки:', error);
        throw error;
    }
}

/**
 * Вилучає зображення з PDF за вказаними координатами
 * @param {string} pdfPath - Шлях до PDF файлу
 * @param {number} pageNumber - Номер сторінки (починаючи з 1)
 * @param {Object} coordinates - Координати області {x, y, width, height}
 * @param {string} outputFilename - Ім'я вихідного файлу (опціонально)
 * @returns {Promise<string>} - Шлях до збереженого зображення
 */
async function extractImageByCoordinates(pdfPath, pageNumber, coordinates, outputFilename = null) {
    try {
        // Спочатку сканруємо всю сторінку
        const scanResult = await scanPdfPage(pdfPath, pageNumber, `temp_full_page_${Date.now()}`);

        // Завантажуємо повне зображення
        const fullImage = await loadImage(scanResult.path);

        // Перевіряємо координати
        const { x = 0, y = 0, width, height } = coordinates;

        if (!width || !height) {
            throw new Error('Необхідно вказати width та height у координатах');
        }

        if (x < 0 || y < 0 || x + width > fullImage.width || y + height > fullImage.height) {
            throw new Error(
                `Координати виходять за межі сторінки. ` +
                `Розмір сторінки: ${fullImage.width}x${fullImage.height}px. ` +
                `Вказані координати: x=${x}, y=${y}, width=${width}, height=${height}`
            );
        }

        // Створюємо canvas для вирізаної області
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Копіюємо вирізану область
        ctx.drawImage(
            fullImage,
            x, y, width, height,  // Джерело
            0, 0, width, height   // Призначення
        );

        // Генеруємо ім'я файлу
        if (!outputFilename) {
            const baseName = path.basename(pdfPath, '.pdf');
            outputFilename = `${baseName}_page${pageNumber}_x${x}_y${y}.jpg`;
        }

        const outputPath = path.join(OUTPUT_DIR, outputFilename);

        // Зберігаємо як JPG
        const jpgBuffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
        await fs.writeFile(outputPath, jpgBuffer);

        // Видаляємо тимчасовий файл
        await fs.remove(scanResult.path);

        console.log(`Збережено зображення: ${outputFilename} (${width}x${height}px)`);

        return outputPath;

    } catch (error) {
        console.error('Помилка вилучення зображення за координатами:', error);
        throw error;
    }
}

/**
 * Отримує розміри сторінки PDF
 * @param {string} pdfPath - Шлях до PDF файлу
 * @param {number} pageNumber - Номер сторінки
 * @returns {Promise<Object>} - Об'єкт з розмірами
 */
async function getPageDimensions(pdfPath, pageNumber = 1) {
    try {
        const tempScan = await scanPdfPage(pdfPath, pageNumber, `temp_dimensions_${Date.now()}`);
        const dimensions = {
            width: tempScan.width,
            height: tempScan.height,
            pageNumber: pageNumber
        };

        // Видаляємо тимчасовий файл
        await fs.remove(tempScan.path);

        return dimensions;
    } catch (error) {
        console.error('Помилка отримання розмірів сторінки:', error);
        throw error;
    }
}

export {
    scanPdfPage,
    extractImageByCoordinates,
    getPageDimensions,
    OUTPUT_DIR
};

export default {
    scanPdfPage,
    extractImageByCoordinates,
    getPageDimensions,
    OUTPUT_DIR
};
