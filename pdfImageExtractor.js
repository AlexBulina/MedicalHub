import fs from 'fs-extra';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { createCanvas, loadImage } from 'canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Модуль для вилучення зображень з PDF файлів
 * Вилучає всі зображення з PDF та конвертує їх у JPG формат
 */

const OUTPUT_DIR = './PriscaPdf';

/**
 * NodeCanvasFactory - адаптер для роботи pdfjs-dist з Node.js canvas
 * ВАЖЛИВО: pdfjs-dist потребує спеціального canvas factory для Node.js
 */
class NodeCanvasFactory {
    create(width, height) {
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        return {
            canvas,
            context
        };
    }

    reset(canvasAndContext, width, height) {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
    }

    destroy(canvasAndContext) {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
        canvasAndContext.canvas = null;
        canvasAndContext.context = null;
    }
}

/**
 * Створює вихідну директорію якщо вона не існує
 */
async function ensureOutputDir() {
    await fs.ensureDir(OUTPUT_DIR);
}

/**
 * Конвертує зображення в JPG формат використовуючи canvas
 * @param {Buffer} imageBuffer - Буфер з даними зображення
 * @param {string} outputPath - Шлях для збереження JPG файлу
 */
async function convertToJpg(imageBuffer, outputPath) {
    try {
        const image = await loadImage(imageBuffer);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        // Малюємо зображення на canvas
        ctx.drawImage(image, 0, 0);

        // Конвертуємо в JPG з якістю 90%
        const jpgBuffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });

        // Зберігаємо файл
        await fs.writeFile(outputPath, jpgBuffer);

        return outputPath;
    } catch (error) {
        console.error('Помилка конвертації зображення:', error);
        throw error;
    }
}

/**
 * Вилучає зображення з PDF використовуючи pdfjs-dist
 * @param {string} pdfPath - Шлях до PDF файлу
 * @returns {Promise<Array>} - Масив шляхів до збережених зображень
 */
async function extractImagesFromPdf(pdfPath) {
    try {
        // Перевіряємо чи існує файл
        if (!await fs.pathExists(pdfPath)) {
            throw new Error(`PDF файл не знайдено: ${pdfPath}`);
        }

        // Створюємо вихідну директорію
        await ensureOutputDir();

        // Читаємо PDF файл та конвертуємо Buffer в Uint8Array
        const pdfBuffer = await fs.readFile(pdfPath);
        const pdfData = new Uint8Array(pdfBuffer);

        const loadingTask = getDocument({
            data: pdfData,
            canvasFactory: new NodeCanvasFactory()
        });
        const pdfDocument = await loadingTask.promise;

        const extractedImages = [];
        const baseName = path.basename(pdfPath, '.pdf');

        console.log(`Обробка PDF: ${pdfPath}`);
        console.log(`Кількість сторінок: ${pdfDocument.numPages}`);

        // Обробляємо кожну сторінку
        for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
            const page = await pdfDocument.getPage(pageNum);
            const operatorList = await page.getOperatorList();

            let imageIndex = 0;

            // Шукаємо операції малювання зображень
            for (let i = 0; i < operatorList.fnArray.length; i++) {
                // OPS.paintImageXObject та OPS.paintInlineImageXObject - це операції малювання зображень
                if (operatorList.fnArray[i] === 85 || operatorList.fnArray[i] === 88) {
                    try {
                        const imageName = operatorList.argsArray[i][0];

                        // Отримуємо об'єкт зображення
                        const image = await page.objs.get(imageName);

                        if (image && image.data) {
                            imageIndex++;

                            // Створюємо canvas для зображення
                            const canvas = createCanvas(image.width, image.height);
                            const ctx = canvas.getContext('2d');

                            // Створюємо ImageData з даних PDF
                            const imageData = ctx.createImageData(image.width, image.height);

                            // Копіюємо дані зображення
                            if (image.kind === 1) { // GRAYSCALE
                                for (let j = 0; j < image.data.length; j++) {
                                    const idx = j * 4;
                                    imageData.data[idx] = image.data[j];     // R
                                    imageData.data[idx + 1] = image.data[j]; // G
                                    imageData.data[idx + 2] = image.data[j]; // B
                                    imageData.data[idx + 3] = 255;           // A
                                }
                            } else if (image.kind === 2) { // RGB
                                for (let j = 0, k = 0; j < image.data.length; j += 3, k += 4) {
                                    imageData.data[k] = image.data[j];       // R
                                    imageData.data[k + 1] = image.data[j + 1]; // G
                                    imageData.data[k + 2] = image.data[j + 2]; // B
                                    imageData.data[k + 3] = 255;             // A
                                }
                            }

                            ctx.putImageData(imageData, 0, 0);

                            // Зберігаємо як JPG
                            const outputFilename = `${baseName}_page${pageNum}_img${imageIndex}.jpg`;
                            const outputPath = path.join(OUTPUT_DIR, outputFilename);

                            const jpgBuffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
                            await fs.writeFile(outputPath, jpgBuffer);

                            extractedImages.push(outputPath);
                            console.log(`Збережено зображення: ${outputFilename}`);
                        }
                    } catch (imgError) {
                        console.error(`Помилка обробки зображення на сторінці ${pageNum}:`, imgError.message);
                    }
                }
            }
        }

        console.log(`Вилучено ${extractedImages.length} зображень з PDF`);
        return extractedImages;

    } catch (error) {
        console.error('Помилка вилучення зображень з PDF:', error);
        throw error;
    }
}

/**
 * Вилучає зображення з PDF за вказаними координатами
 * Рендерить сторінку PDF в canvas і вирізає вказану область
 * @param {string} pdfPath - Шлях до PDF файлу
 * @param {number} pageNumber - Номер сторінки (починаючи з 1)
 * @param {Object} coordinates - Координати області {x, y, width, height} в пікселях
 * @param {string} outputFilename - Ім'я вихідного файлу (опціонально)
 * @returns {Promise<string>} - Шлях до збереженого зображення
 */
async function extractImageByCoordinates(pdfPath, pageNumber, coordinates, outputFilename = null) {
    try {
        // Перевіряємо чи існує файл
        if (!await fs.pathExists(pdfPath)) {
            throw new Error(`PDF файл не знайдено: ${pdfPath}`);
        }

        // Створюємо вихідну директорію
        await ensureOutputDir();

        // Читаємо PDF файл
        const pdfBuffer = await fs.readFile(pdfPath);
        const pdfData = new Uint8Array(pdfBuffer);

        const loadingTask = getDocument({
            data: pdfData,
            canvasFactory: new NodeCanvasFactory()
        });
        const pdfDocument = await loadingTask.promise;

        // Перевіряємо номер сторінки
        if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
            throw new Error(`Невірний номер сторінки: ${pageNumber}. PDF має ${pdfDocument.numPages} сторінок.`);
        }

        console.log(`Обробка сторінки ${pageNumber} з PDF: ${pdfPath}`);

        // Отримуємо сторінку
        const page = await pdfDocument.getPage(pageNumber);

        // Отримуємо viewport для визначення розміру
        const scale = 2.0; // Множник для якості (2.0 = подвійна роздільність)
        const viewport = page.getViewport({ scale });

        // Створюємо canvas для рендерингу сторінки
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        // ВАЖЛИВО: Заповнюємо canvas білим фоном перед рендерингом PDF
        context.fillStyle = 'white';
        context.fillRect(0, 0, viewport.width, viewport.height);

        // Рендеримо PDF сторінку на canvas
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        console.log(`Сторінка відрендерена: ${viewport.width}x${viewport.height}px`);

        // Перевіряємо координати
        const { x = 0, y = 0, width, height } = coordinates;

        if (!width || !height) {
            throw new Error('Необхідно вказати width та height у координатах');
        }

        if (x < 0 || y < 0 || x + width > viewport.width || y + height > viewport.height) {
            throw new Error(
                `Координати виходять за межі сторінки. ` +
                `Розмір сторінки: ${viewport.width}x${viewport.height}px. ` +
                `Вказані координати: x=${x}, y=${y}, width=${width}, height=${height}`
            );
        }

        // Створюємо новий canvas для вирізаної області
        const croppedCanvas = createCanvas(width, height);
        const croppedContext = croppedCanvas.getContext('2d');

        // Копіюємо вирізану область
        croppedContext.drawImage(
            canvas,
            x, y, width, height,  // Джерело (область для вирізання)
            0, 0, width, height   // Призначення (новий canvas)
        );

        // Генеруємо ім'я файлу якщо не вказано
        if (!outputFilename) {
            const baseName = path.basename(pdfPath, '.pdf');
            outputFilename = `${baseName}_page${pageNumber}_x${x}_y${y}.jpg`;
        }

        const outputPath = path.join(OUTPUT_DIR, outputFilename);

        // Зберігаємо як JPG
        const jpgBuffer = croppedCanvas.toBuffer('image/jpeg', { quality: 0.9 });
        await fs.writeFile(outputPath, jpgBuffer);

        console.log(`Збережено зображення: ${outputFilename} (${width}x${height}px)`);

        return outputPath;

    } catch (error) {
        console.error('Помилка вилучення зображення за координатами:', error);
        throw error;
    }
}

/**
 * Отримує розміри сторінки PDF (корисно для планування координат)
 * @param {string} pdfPath - Шлях до PDF файлу
 * @param {number} pageNumber - Номер сторінки (починаючи з 1)
 * @returns {Promise<Object>} - Об'єкт з розмірами {width, height, scale}
 */
async function getPageDimensions(pdfPath, pageNumber = 1) {
    try {
        const pdfBuffer = await fs.readFile(pdfPath);
        const pdfData = new Uint8Array(pdfBuffer);

        const loadingTask = getDocument({
            data: pdfData,
            canvasFactory: new NodeCanvasFactory()
        });
        const pdfDocument = await loadingTask.promise;

        if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
            throw new Error(`Невірний номер сторінки: ${pageNumber}`);
        }

        const page = await pdfDocument.getPage(pageNumber);
        const scale = 2.0;
        const viewport = page.getViewport({ scale });

        return {
            width: viewport.width,
            height: viewport.height,
            scale: scale,
            pageNumber: pageNumber,
            totalPages: pdfDocument.numPages
        };
    } catch (error) {
        console.error('Помилка отримання розмірів сторінки:', error);
        throw error;
    }
}

/**
 * Сканує PDF сторінку і зберігає її як зображення
 * Корисно для перегляду сторінки перед вибором координат
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

        const pdfBuffer = await fs.readFile(pdfPath);
        const pdfData = new Uint8Array(pdfBuffer);

        const loadingTask = getDocument({
            data: pdfData,
            canvasFactory: new NodeCanvasFactory()
        });
        const pdfDocument = await loadingTask.promise;

        if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
            throw new Error(`Невірний номер сторінки: ${pageNumber}. PDF має ${pdfDocument.numPages} сторінок.`);
        }

        console.log(`Сканування сторінки ${pageNumber} з PDF: ${pdfPath}`);

        const page = await pdfDocument.getPage(pageNumber);
        const scale = 2.0;
        const viewport = page.getViewport({ scale });

        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        // ВАЖЛИВО: Заповнюємо canvas білим фоном перед рендерингом PDF
        context.fillStyle = 'white';
        context.fillRect(0, 0, viewport.width, viewport.height);

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        if (!outputFilename) {
            const baseName = path.basename(pdfPath, '.pdf');
            outputFilename = `${baseName}_page${pageNumber}_scan.jpg`;
        }

        const outputPath = path.join(OUTPUT_DIR, outputFilename);

        const jpgBuffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
        await fs.writeFile(outputPath, jpgBuffer);

        console.log(`Скановано: ${outputFilename} (${viewport.width}x${viewport.height}px)`);

        return {
            path: outputPath,
            filename: outputFilename,
            width: viewport.width,
            height: viewport.height,
            pageNumber: pageNumber,
            totalPages: pdfDocument.numPages
        };

    } catch (error) {
        console.error('Помилка сканування PDF сторінки:', error);
        throw error;
    }
}

/**
 * Отримує інформацію про вилучене зображення
 * @param {string} imagePath - Шлях до зображення
 * @returns {Promise<Object>} - Об'єкт з інформацією про зображення
 */
async function getImageInfo(imagePath) {
    try {
        const stats = await fs.stat(imagePath);
        const image = await loadImage(imagePath);

        return {
            path: imagePath,
            filename: path.basename(imagePath),
            size: stats.size,
            sizeKB: (stats.size / 1024).toFixed(2),
            width: image.width,
            height: image.height,
            format: 'JPG'
        };
    } catch (error) {
        console.error('Помилка отримання інформації про зображення:', error);
        throw error;
    }
}

/**
 * Вилучає зображення з PDF та повертає детальну інформацію
 * @param {string} pdfPath - Шлях до PDF файлу
 * @returns {Promise<Object>} - Об'єкт з результатами вилучення
 */
async function extractWithInfo(pdfPath) {
    try {
        const imagePaths = await extractImagesFromPdf(pdfPath);

        const imagesInfo = await Promise.all(
            imagePaths.map(imgPath => getImageInfo(imgPath))
        );

        return {
            success: true,
            totalImages: imagePaths.length,
            outputDirectory: OUTPUT_DIR,
            images: imagesInfo
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            totalImages: 0,
            images: []
        };
    }
}

// Експортуємо функції для використання в інших модулях
export {
    extractImagesFromPdf,
    extractImageByCoordinates,
    scanPdfPage,
    getPageDimensions,
    getImageInfo,
    extractWithInfo,
    OUTPUT_DIR
};

export default {
    extractImagesFromPdf,
    extractImageByCoordinates,
    scanPdfPage,
    getPageDimensions,
    getImageInfo,
    extractWithInfo,
    OUTPUT_DIR
};
