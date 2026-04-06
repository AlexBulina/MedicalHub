import { scanPdfPage, extractImageByCoordinates, getPageDimensions } from './pdfImageExtractor.js';

/**
 * Тест повного процесу: сканування -> перегляд розмірів -> вирізання
 */

async function testFullWorkflow() {
    const pdfPath = './Дадика.pdf';
    const pageNumber = 1;

    console.log('\n=== ТЕСТ: Повний процес обробки PDF ===\n');

    try {
        // Крок 1: Скануємо сторінку повністю
        console.log('📸 Крок 1: Сканування повної сторінки...');
        const scanResult = await scanPdfPage(pdfPath, pageNumber);

        console.log(`✓ Скановано: ${scanResult.filename}`);
        console.log(`  Розміри: ${scanResult.width} x ${scanResult.height} px`);
        console.log(`  Сторінка: ${scanResult.pageNumber} з ${scanResult.totalPages}`);
        console.log(`  Шлях: ${scanResult.path}`);

        console.log('\n📐 Крок 2: Перевірка розмірів...');
        const dims = await getPageDimensions(pdfPath, pageNumber);
        console.log(`  Підтверджені розміри: ${dims.width} x ${dims.height} px`);

        // Крок 3: Вирізаємо верхню половину
        console.log('\n✂️  Крок 3: Вирізання області (верхня половина)...');
        const coords = {
            x: 0,
            y: 0,
            width: dims.width,
            height: Math.floor(dims.height / 2)
        };

        const extractedPath = await extractImageByCoordinates(
            pdfPath,
            pageNumber,
            coords,
            'test_top_half.jpg'
        );

        console.log(`✓ Вирізано: ${extractedPath}`);
        console.log(`  Координати: x=${coords.x}, y=${coords.y}`);
        console.log(`  Розмір: ${coords.width} x ${coords.height} px`);

        console.log('\n✅ УСПІХ! Всі кроки виконано.');
        console.log('\n📁 Перевірте папку ./PriscaPdf/ для результатів:');
        console.log(`   1. ${scanResult.filename} - повна сторінка`);
        console.log(`   2. test_top_half.jpg - вирізана область\n`);

    } catch (error) {
        console.error(`\n❌ Помилка: ${error.message}\n`);
        process.exit(1);
    }
}

testFullWorkflow();
