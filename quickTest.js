import { scanPdfPage } from './pdfImageExtractor.js';

async function quickTest() {
    console.log('Швидкий тест сканування PDF...');

    try {
        const result = await scanPdfPage('./Дадика.pdf', 1, 'test_output.jpg');
        console.log('✓ Успіх!');
        console.log('Файл:', result.filename);
        console.log('Шлях:', result.path);
    } catch (error) {
        console.error('✗ Помилка:', error.message);
    }
}

quickTest();
