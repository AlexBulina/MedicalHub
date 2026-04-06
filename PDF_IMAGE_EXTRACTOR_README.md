# PDF Image Extractor Module

Модуль для вилучення зображень з PDF файлів та конвертації їх у JPG формат.

## Особливості

- ✅ Вилучає всі зображення з PDF документів
- ✅ Автоматично конвертує в JPG формат
- ✅ Зберігає зображення в папку `./PriscaPdf/`
- ✅ Підтримує багатосторінкові PDF
- ✅ Обробляє grayscale та RGB зображення
- ✅ Надає детальну інформацію про вилучені зображення

## Встановлення

Всі необхідні залежності вже встановлені в проекті:
- `pdfjs-dist` - для парсингу PDF
- `canvas` - для конвертації зображень
- `pdf-lib` - для роботи з PDF документами
- `fs-extra` - для роботи з файловою системою

## Використання

### Основний приклад

```javascript
import { extractImagesFromPdf } from './pdfImageExtractor.js';

const pdfPath = './documents/medical_report.pdf';

try {
  const imagePaths = await extractImagesFromPdf(pdfPath);
  console.log(`Вилучено ${imagePaths.length} зображень:`);
  imagePaths.forEach(path => console.log(path));
} catch (error) {
  console.error('Помилка:', error.message);
}
```

### Отримання детальної інформації

```javascript
import { extractWithInfo } from './pdfImageExtractor.js';

const result = await extractWithInfo('./document.pdf');

if (result.success) {
  console.log(`Вилучено: ${result.totalImages} зображень`);
  console.log(`Папка: ${result.outputDirectory}`);
  
  result.images.forEach(img => {
    console.log(`${img.filename}: ${img.width}x${img.height}px, ${img.sizeKB}KB`);
  });
}
```

### Інформація про окреме зображення

```javascript
import { getImageInfo } from './pdfImageExtractor.js';

const info = await getImageInfo('./PriscaPdf/report_page1_img1.jpg');
console.log(info);
// {
//   path: './PriscaPdf/report_page1_img1.jpg',
//   filename: 'report_page1_img1.jpg',
//   size: 245678,
//   sizeKB: '239.92',
//   width: 1920,
//   height: 1080,
//   format: 'JPG'
// }
```

## API

### `extractImagesFromPdf(pdfPath)`

Вилучає всі зображення з PDF файлу.

**Параметри:**
- `pdfPath` (string) - Шлях до PDF файлу

**Повертає:**
- `Promise<Array<string>>` - Масив шляхів до збережених зображень

**Приклад:**
```javascript
const images = await extractImagesFromPdf('./report.pdf');
// ['./PriscaPdf/report_page1_img1.jpg', './PriscaPdf/report_page2_img1.jpg']
```

---

### `extractWithInfo(pdfPath)`

Вилучає зображення та повертає детальну інформацію.

**Параметри:**
- `pdfPath` (string) - Шлях до PDF файлу

**Повертає:**
- `Promise<Object>` - Об'єкт з результатами:
  - `success` (boolean) - Чи успішно виконано
  - `totalImages` (number) - Кількість вилучених зображень
  - `outputDirectory` (string) - Папка збереження
  - `images` (Array) - Масив з інформацією про кожне зображення
  - `error` (string) - Повідомлення про помилку (якщо є)

**Приклад:**
```javascript
const result = await extractWithInfo('./report.pdf');
console.log(result.totalImages); // 5
```

---

### `getImageInfo(imagePath)`

Отримує інформацію про зображення.

**Параметри:**
- `imagePath` (string) - Шлях до зображення

**Повертає:**
- `Promise<Object>` - Об'єкт з інформацією:
  - `path` (string) - Повний шлях
  - `filename` (string) - Ім'я файлу
  - `size` (number) - Розмір в байтах
  - `sizeKB` (string) - Розмір в KB
  - `width` (number) - Ширина в пікселях
  - `height` (number) - Висота в пікселях
  - `format` (string) - Формат ('JPG')

---

### `OUTPUT_DIR`

Константа з шляхом до вихідної директорії.

**Значення:** `'./PriscaPdf'`

## Структура вихідних файлів

Зображення зберігаються з такими іменами:

```
<назва_pdf>_page<номер_сторінки>_img<номер_зображення>.jpg
```

**Приклад:**
- `medical_report_page1_img1.jpg`
- `medical_report_page1_img2.jpg`
- `medical_report_page2_img1.jpg`

## Обробка помилок

```javascript
try {
  const images = await extractImagesFromPdf('./nonexistent.pdf');
} catch (error) {
  if (error.message.includes('не знайдено')) {
    console.error('PDF файл не існує');
  } else {
    console.error('Невідома помилка:', error);
  }
}
```

## Інтеграція з існуючим кодом

Модуль можна легко інтегрувати в існуючі файли проекту:

```javascript
// В KT_BackendNew.js або інших модулях
import { extractImagesFromPdf } from './pdfImageExtractor.js';

// Використання в обробнику
async function processMedicalDocument(pdfPath) {
  // Вилучення зображень
  const images = await extractImagesFromPdf(pdfPath);
  
  // Подальша обробка зображень
  for (const imagePath of images) {
    // Наприклад, завантаження в базу даних,
    // відправка на сервер, тощо
    console.log('Обробка:', imagePath);
  }
}
```

## Приклади використання

Дивіться файл `pdfImageExtractor.example.js` для повних прикладів використання.

## Технічні деталі

- **Якість JPG:** 90% (0.9)
- **Підтримувані формати вхідних зображень:** Grayscale, RGB
- **Автоматичне створення папки:** Папка `PriscaPdf` створюється автоматично
- **Бібліотека парсингу:** Mozilla PDF.js (pdfjs-dist)
- **Конвертація:** Node Canvas

## Обмеження

- Вилучаються тільки растрові зображення (не векторна графіка)
- PNG і інші формати конвертуються в JPG
- Прозорість не зберігається (JPG не підтримує alpha канал)

## Підтримка

При виникненні проблем перевірте:
1. Чи існує PDF файл за вказаним шляхом
2. Чи має додаток права на читання PDF та запис у папку PriscaPdf
3. Чи містить PDF файл зображення (деякі PDF містять тільки текст)
