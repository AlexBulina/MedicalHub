import { extractImageByCoordinates, getPageDimensions } from './pdfImageExtractor.js';

/**
 * Простий тест для вилучення зображення за координатами
 * 
 * Використання:
 * node coordinateTest.js <шлях_до_pdf> <номер_сторінки> <x> <y> <width> <height>
 * 
 * Приклад:
 * node coordinateTest.js ./document.pdf 1 100 200 800 600
 */

async function testExtraction() {
    try {
        // Отримуємо аргументи з командного рядка
        const args = process.argv.slice(2);

        if (args.length === 0) {
            console.log('📖 Використання:');
            console.log('  node coordinateTest.js <pdf_файл> [сторінка] [x] [y] [width] [height]');
            console.log('');
            console.log('Приклади:');
            console.log('  1. Отримати розміри:');
            console.log('     node coordinateTest.js document.pdf 1');
            console.log('');
            console.log('  2. Вилучити область:');
            console.log('     node coordinateTest.js document.pdf 1 100 200 800 600');
            console.log('');
            return;
        }

        const pdfPath = args[0];
        const pageNumber = args[1] ? parseInt(args[1]) : 1;

        // Спочатку отримуємо розміри сторінки
        console.log(`\n📄 Отримання розмірів сторінки ${pageNumber}...`);
        const dimensions = await getPageDimensions(pdfPath, pageNumber);

        console.log(`\n📏 Розміри PDF сторінки:`);
        console.log(`   Файл: ${pdfPath}`);
        console.log(`   Сторінка: ${dimensions.pageNumber} з ${dimensions.totalPages}`);
        console.log(`   Ширина: ${dimensions.width} px`);
        console.log(`   Висота: ${dimensions.height} px`);
        console.log(`   Scale: ${dimensions.scale}x`);

        // Якщо вказані координати - вилучаємо область
        if (args.length >= 6) {
            const x = parseInt(args[2]);
            const y = parseInt(args[3]);
            const width = parseInt(args[4]);
            const height = parseInt(args[5]);

            console.log(`\n✂️  Вилучення області:`);
            console.log(`   X: ${x} px`);
            console.log(`   Y: ${y} px`);
            console.log(`   Ширина: ${width} px`);
            console.log(`   Висота: ${height} px`);

            const imagePath = await extractImageByCoordinates(
                pdfPath,
                pageNumber,
                { x, y, width, height }
            );

            console.log(`\n✅ Успіх!`);
            console.log(`   Зображення збережено: ${imagePath}`);
            console.log(`   Папка: ./PriscaPdf/\n`);
        } else {
            console.log(`\n💡 Підказка: Щоб вилучити область, вкажіть координати:`);
            console.log(`   node coordinateTest.js ${pdfPath} ${pageNumber} <x> <y> <width> <height>`);
            console.log(`\nНаприклад (вилучити верхню половину):`);
            console.log(`   node coordinateTest.js ${pdfPath} ${pageNumber} 0 0 ${dimensions.width} ${Math.floor(dimensions.height / 2)}\n`);
        }

    } catch (error) {
        console.error(`\n❌ Помилка: ${error.message}\n`);
        process.exit(1);
    }
}

testExtraction();
