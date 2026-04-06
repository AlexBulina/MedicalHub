import { extractImageByCoordinates, getPageDimensions, scanPdfPage } from './pdfImageExtractor.js';

/**
 * Приклади використання модуля для вилучення зображень за координатами
 */

// Приклад 1: Спочатку дізнаємось розміри сторінки
async function example1_GetPageSize() {
    console.log('\n=== Приклад 1: Отримання розмірів сторінки ===');

    const pdfPath = './Дадика.pdf';
    const pageNumber = 1;

    try {
        const dimensions = await getPageDimensions(pdfPath, pageNumber);

        console.log(`PDF: ${pdfPath}`);
        console.log(`Сторінка: ${dimensions.pageNumber} з ${dimensions.totalPages}`);
        console.log(`Розміри: ${dimensions.width} x ${dimensions.height} px`);
        console.log(`Scale: ${dimensions.scale}`);
        console.log('\n✓ Тепер ви знаєте розміри для вибору координат!');

        return dimensions;
    } catch (error) {
        console.error('Помилка:', error.message);
    }
}

// Приклад 2: Вилучення зображення за координатами
async function example2_ExtractByCoordinates() {
    console.log('\n=== Приклад 2: Вилучення за координатами ===');

    const pdfPath = './example.pdf';
    const pageNumber = 1;

    // Координати області яку хочемо вирізати
    const coordinates = {
        x: 100,      // Відступ зліва
        y: 200,      // Відступ зверху
        width: 800,  // Ширина області
        height: 600  // Висота області
    };

    try {
        const imagePath = await extractImageByCoordinates(
            pdfPath,
            pageNumber,
            coordinates
        );

        console.log(`✓ Зображення збережено: ${imagePath}`);

        return imagePath;
    } catch (error) {
        console.error('Помилка:', error.message);
    }
}

// Приклад 3: Вилучення з власним ім'ям файлу
async function example3_CustomFilename() {
    console.log('\n=== Приклад 3: Власне ім\'я файлу ===');

    const pdfPath = './medical_report.pdf';
    const pageNumber = 1;

    const coordinates = {
        x: 0,
        y: 0,
        width: 1000,
        height: 500
    };

    const customFilename = 'medical_header.jpg';

    try {
        const imagePath = await extractImageByCoordinates(
            pdfPath,
            pageNumber,
            coordinates,
            customFilename
        );

        console.log(`✓ Зображення збережено як: ${customFilename}`);

        return imagePath;
    } catch (error) {
        console.error('Помилка:', error.message);
    }
}

// Приклад 4: Вилучення кількох областей з однієї сторінки
async function example4_MultipleRegions() {
    console.log('\n=== Приклад 4: Кілька областей ===');

    const pdfPath = './Дадика.pdf';
    const pageNumber = 1;

    // Різні області на сторінці
    const regions = [
        { name: 'header', x: 0, y: 0, width: 1000, height: 200 },
        { name: 'main_image', x: 100, y: 300, width: 800, height: 600 },
        { name: 'footer', x: 0, y: 1000, width: 1000, height: 150 }
    ];

    try {
        const extractedImages = [];

        for (const region of regions) {
            const imagePath = await extractImageByCoordinates(
                pdfPath,
                pageNumber,
                { x: region.x, y: region.y, width: region.width, height: region.height },
                `${region.name}.jpg`
            );

            extractedImages.push(imagePath);
            console.log(`✓ ${region.name}: ${imagePath}`);
        }

        console.log(`\n✓ Всього вилучено ${extractedImages.length} областей`);

        return extractedImages;
    } catch (error) {
        console.error('Помилка:', error.message);
    }
}

// Приклад 5: Повний workflow - СПОЧАТКУ СКАНУВАННЯ, потім розміри, потім вилучення
async function example5_CompleteWorkflow() {
    console.log('\n=== Приклад 5: Повний процес (РЕКОМЕНДОВАНИЙ) ===');

    const pdfPath = './Дадика.pdf';
    const pageNumber = 1;

    try {
        // Крок 1: СПОЧАТКУ скануємо всю сторінку
        console.log('📸 Крок 1: Сканування повної сторінки...');
        const scan = await scanPdfPage(pdfPath, pageNumber);
        console.log(`✓ Скановано: ${scan.filename}`);
        console.log(`  Розміри: ${scan.width} x ${scan.height} px`);
        console.log(`  Шлях: ${scan.path}`);

        // Крок 2: Отримуємо розміри для планування
        console.log('\n📐 Крок 2: Підтвердження розмірів...');
        const dims = await getPageDimensions(pdfPath, pageNumber);
        console.log(`  Розміри сторінки: ${dims.width} x ${dims.height} px`);

        // Крок 3: Вилучаємо потрібну область
        const coordinates = {
            x: 0,
            y: 0,
            width: dims.width,
            height: Math.floor(dims.height / 2)
        };

        console.log('\n✂️  Крок 3: Вилучення верхньої половини...');
        const imagePath = await extractImageByCoordinates(
            pdfPath,
            pageNumber,
            coordinates,
            'top_half.jpg'
        );

        console.log(`✓ Збережено: ${imagePath}`);
        console.log(`  Координати: x=${coordinates.x}, y=${coordinates.y}`);
        console.log(`  Розмір: ${coordinates.width} x ${coordinates.height} px`);

        console.log('\n✅ Успіх! Перевірте папку ./PriscaPdf/');
        console.log(`   1. ${scan.filename} - повна сторінка`);
        console.log(`   2. top_half.jpg - вирізана область`);

        return imagePath;
    } catch (error) {
        console.error('Помилка:', error.message);
    }
}

// Запуск прикладу
async function runExamples() {
    console.log('===========================================');
    console.log('Приклади вилучення зображень за координатами');
    console.log('===========================================');

    // Розкоментуйте потрібний приклад:

    // await example1_GetPageSize();
    // await example2_ExtractByCoordinates();
    // await example3_CustomFilename();
    // await example4_MultipleRegions();
    await example5_CompleteWorkflow();

    console.log('\n✓ Готово!\n');
}

runExamples().catch(console.error);
