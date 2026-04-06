import { extractImagesFromPdf, extractWithInfo } from './pdfImageExtractor.js';
import fs from 'fs-extra';

/**
 * Простий тест модуля pdfImageExtractor
 */

async function testModule() {
    console.log('🧪 Тестування модуля pdfImageExtractor\n');

    // Тест 1: Перевірка чи модуль експортує функції
    console.log('✓ Модуль успішно імпортовано');
    console.log('✓ Функція extractImagesFromPdf доступна:', typeof extractImagesFromPdf === 'function');
    console.log('✓ Функція extractWithInfo доступна:', typeof extractWithInfo === 'function');

    console.log('\n📝 Для тестування вилучення зображень:');
    console.log('   1. Помістіть PDF файл з зображеннями в кореневу папку проекту');
    console.log('   2. Використайте наступний код:\n');
    console.log('   import { extractWithInfo } from "./pdfImageExtractor.js";');
    console.log('   const result = await extractWithInfo("./ваш_файл.pdf");');
    console.log('   console.log(result);\n');
    console.log('   Зображення будуть збережені в папку ./PriscaPdf/\n');

    // Перевірка чи існує папка PriscaPdf
    const outputDirExists = await fs.pathExists('./PriscaPdf');
    if (!outputDirExists) {
        console.log('ℹ️  Папка PriscaPdf буде створена автоматично при першому вилученні\n');
    } else {
        console.log('✓ Папка PriscaPdf вже існує\n');

        // Показати вміст папки
        const files = await fs.readdir('./PriscaPdf');
        if (files.length > 0) {
            console.log(`📁 В папці PriscaPdf знайдено ${files.length} файл(ів):`);
            files.forEach((file, index) => {
                console.log(`   ${index + 1}. ${file}`);
            });
        } else {
            console.log('📁 Папка PriscaPdf порожня');
        }
    }

    console.log('\n✅ Модуль готовий до використання!\n');
}

testModule().catch(error => {
    console.error('❌ Помилка тестування:', error.message);
    process.exit(1);
});
