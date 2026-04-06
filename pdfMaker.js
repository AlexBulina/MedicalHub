import PDFDocument from 'pdfkit'; // Переконайтеся, що ви імпортуєте PDFDocument
import { Writable } from 'stream';   // та Writable
import { processFilesFromFtp, handleError } from './docxTopdf.js';
import { appendPdfToExistingPdf } from './labrequest.js';

// ... Тут мають бути визначені ваші допоміжні функції та константи ...
// (convertDate, isAbnormalResult, drawCell, formatReferenceValue, formatNumber,
//  values, partialArray, forbiddenPhrases, excludedPhrases, 
//  RESULT_DECIMAL_PLACES, ROUND_RESULT_VALUE)

const RESULT_DECIMAL_PLACES = 4; // Кількість знаків після коми для поля "Результат"
const REFERENCE_DECIMAL_PLACES = 4; // Кількість знаків після коми для поля "Еталонні величини"
const ROUND_RESULT_VALUE = false; // Чи заокруглювати результат? true - так, false - просто відрізати.

// Створюємо масив з рядками для виключення фрази/ а саме:/
const excludedPhrases = ["Клітини циліндричного епітелію", "Додаткові висновки:"];

const forbiddenPhrases = ['не виявлено', 'Не виявлено', 'НЕ ВИЯВЛЕНО', 'змішана помірна', 'O ( I ) Rh ( + )', 'O ( II ) Rh ( + )', 'O ( III ) Rh ( + )', 'O ( IV ) Rh ( + )', 'A ( II ) Rh ( + )', '-не виявлено', 'AB ( IV ) Rh ( + )'];

const partialArray = ['зм.', 'поле зору', 'св.', 'поодинокі', 'солом', 'мутна', '++++'];

const values = [
    'виявлено', 'ВИЯВЛЕНО', 'Виявлено', 'Позитивний', 'позитивний', 'виявлено+', 'виявлено++', 'виявлено+++', 'Виявлено+', 'Виявлено++', 'Виявлено+++',
    '+', '++', '+++', '++++', 'виявлено +++', 'виявлено ++', 'виявлено +', '++виявлено', '+виявлено', '+++виявлено', 'виявлено ++++', 'виявлено ++++,',
    'велика кількість', 'Значна кількість', 'сліди', 'Змігклий', // Змігклий колір може вказувати на наявність пігментів або інші порушення.
    'Темно-жовтий',   // Може вказувати на зневоднення або порушення функції печінки.
    'Червоний',       // Може бути ознакою гемоглобінурії або гематурії.
    'Коричневий',     // Може бути ознакою порушення роботи печінки або гемолізу.
    'Кислий',         // Надмірно кисла сеча може бути ознакою метаболічних порушень.
    'Лужний',         // Лужна сеча може бути ознакою інфекцій сечових шляхів.
    'Множинні',       // Множинні бактерії вказують на наявність інфекції.
    'Еритроцити',     // Присутність еритроцитів у сечі є ознакою гемоглобінурії або гематурії.
    'Лейкоцити',      // Підвищення лейкоцитів вказує на запальний процес або інфекцію.
    'Гіалінові',      // Гіалінові циліндри можуть бути присутні при дегідратації або ниркових захворюваннях.
    'Еритроцитарні',  // Циліндри з еритроцитами вказують на кровотечу в нирках або сечових шляхах.
    'Лейкоцитарні',   // Циліндри з лейкоцитами можуть вказувати на інфекційні процеси в нирках.
    'Знижений',       // Знижений рівень уробіліногену може свідчити про проблеми з печінкою.
    'Підвищений',     // Підвищений рівень уробіліногену вказує на порушення функції печінки.
    'Білірубін',      // Присутність білірубіну в сечі є ознакою проблем з печінкою або жовчними шляхами.
    'Сліди',
    'густо вкривають п/з',
    'зм',
    'слабка дисплазія',
    'препараті',
    'фосфати +', 'Фосфати ++', 'Фосфати +++', 'Фосфати ++++',
    'оксалати +', 'оксалати ++', 'оксалати +++', 'оксалати ++++', 'мікрооксалати +', 'мікрооксалати+', 'мікрооксалати ++', 'мікрооксалати +++', 'мікрооксалати ++++',
    'урати +', 'урати ++', 'урати +++', 'урати ++++',
    'кислі кристали +', 'кислі кристали ++', 'кислі кристали +++', 'кислі кристали ++++',
    'амонієві кристали +', 'амонієві кристали ++', 'амонієві кристали +++', 'амонієві кристали ++++',
    'значна паличкова', 'помірна паличкова', 'помірна змішана', 'реактивні зміни',
    'спори грибка +', 'спори грибка ++', 'спори грибка +++', 'спори грибка ++++',
    'поодинокі урати', 'поодинокі', 'кокова мізерна', 'кокова незначна', // Нові варіанти
    'кокова одинична', 'кокова рідкісна', 'кокова помірна', 'кокова малочисельна', // Нові варіанти
    'кокова мізерно мала', 'кокова поодинока', 'кокова слабка', 'кокова низька', // Нові варіанти
    'виражені реактивні зміни',
    'пов. плоский епітелій',
    'кокова одинична колонія', 'кокова фрагментарна', // Нові варіанти
    'Аеробні бактерії',  // Позитивний ріст аеробних бактерій у пробі.
    'Анаеробні бактерії', // Позитивний ріст анаеробних бактерій.
    'Стрептококи',        // Виявлено наявність стрептококів.
    'Стафілококи',        // Виявлено наявність стафілококів.
    'Escherichia coli',    // Виявлено наявність E. coli (кишкова паличка).
    'Клебсієла',          // Виявлено наявність Klebsiella.
    'Протей',             // Виявлено наявність Proteus.
    'Сальмонела',         // Виявлено наявність Salmonella.
    'Шигела',             // Виявлено наявність Shigella.
    'Негативний результат', // Відсутність зростання бактерій у пробі.
    'Підвищена концентрація', // Підвищена концентрація бактерій або патогенних мікроорганізмів.
    'Чутливість до антибіотиків', // Тест на чутливість до антибіотиків.
    'Резистентність до антибіотиків', // Резистентність до певних антибіотиків.
    'Флора, що вказує на дисбіоз', // Зміни в мікрофлорі, які можуть свідчити про дисбіоз.
    'Нормофлора',         // Виявлення нормальної мікрофлори.
    'Грибкова інфекція',  // Виявлено наявність грибкової інфекції.
    'Присутність Candida', // Виявлення грибка роду Candida.
    'Громувальні бактерії', // Виявлення бактерій, що можуть утворювати гази.
    'Патогенні мікроорганізми', // Виявлено патогенні мікроорганізми.
    'Мікроскопія крові',   // Мікроскопія зразка крові, виявлення аномальних клітин.
    'Мікроскопія сечі',    // Мікроскопія зразка сечі для виявлення елементів (кристали, бактерії, клітини).
    'Ураження клітин',     // Наявність уражених клітин в зразку.
    'Погіршення стійкості до інфекцій', // Погіршення імунного статусу або схильність до інфекцій.
    'Мікробна колонія',    // Виявлення мікробних колоній в зразку.
    'Інфекційні зміни',    // Присутність мікроорганізмів, які вказують на інфекційний процес.
    'Лабораторна забрудненість', // Можливе забруднення проби під час тестування.
    'Патогенний штам',     // Виявлення патогенного штаму мікроорганізму.
    'Кількість колоній на мілілітр', // Визначення кількості мікробних колоній на одиницю об’єму.
    'Сліди бактеріального росту', // Виявлені сліди росту бактерій без значної колонії.
    'Гематурія',           // Виявлення крові в сечі.
    'Лейкоцитурія',        // Підвищення рівня лейкоцитів у сечі.
    'Ниркова дисфункція',  // Можливі ознаки порушення функції нирок.
    'Порушення кислотно-лужного балансу', // Порушення рівноваги pH в сечі або в інших зразках.
    'Реактивний аналіз', 'паличкова', 'значна', 'грибка', 'елементи', 'все поле зору', 'помірна', 'в скупченні', ' мутна', 'еритроцити ++', 'еритроцити +++', 'еритроцити ++++', 'еритроцити +', 'мутна', 'свіжі,', 'велика', 'вкриває поле зору', 'насичено'];

/**
 * @description Екранує спеціальні символи регулярних виразів у рядку.
 * @param {string} string - Вхідний рядок.
 * @returns {string} - Рядок з екранованими символами.
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& означає весь знайдений збіг
}

function isAbnormalResult(value, exactValues, partialValues, forbidden, reference = null) {
    if (!value) return false;
    const cleaned = value.trim();

    // 1. Виключення → одразу НЕ позанормовий
    if (forbidden.some(f => new RegExp(`^${escapeRegExp(f)}$`, 'i').test(cleaned))) {
        return false;
    }

    // 2. Точний збіг з довідником exactValues → позанормовий
    if (exactValues.some(v => new RegExp(`^${escapeRegExp(v)}$`, 'i').test(cleaned))) {
        return true;
    }

    // 3. Частковий збіг з partialValues → позанормовий
    if (partialValues.some(v => new RegExp(`${escapeRegExp(v)}`, 'i').test(cleaned))) {
        return true;
    }

    // 4. Перевірка діапазонів через isRangeResult
    if (reference) {
        if (isRangeResult(cleaned, reference)) {
            return false;
        } else {
            return true;
        }
    }

    return false;
}

// Функція для перевірки діапазонів
function isRangeResult(value, reference) {
    // короткий варіант умови
    if (reference?.trim() === "(null - null)" && value) {
        return true;
    }

    const rangeRegex = /^\d+\s*-\s*\d+$/;

    if (!value || !rangeRegex.test(value.trim())) {
        return false;
    }

    const [start, end] = value.split("-").map(num => parseInt(num.trim(), 10));
    if (start > end) return false;

    const referenceRegex = /\(?\s*(\d+)\s*-\s*(\d+)\s*\)?/;
    const match = reference?.match(referenceRegex);

    if (!match) return true;

    const refStart = parseInt(match[1], 10);
    const refEnd = parseInt(match[2], 10);

    return start >= Math.min(refStart, refEnd) && end <= Math.max(refStart, refEnd);
}

// Функція для форматування чисел до .00
function formatNumber(value, decimalPlaces, round = true) {
    if (value === null || value === undefined) return ''; // Повертаємо порожній рядок для null/undefined
    const num = Number(value);
    if (!isNaN(num)) {
        if (round) {
            // Округлюємо до decimalPlaces і видаляємо зайві нулі в кінці
            return parseFloat(num.toFixed(decimalPlaces)).toString();
        } else {
            // Просто "відрізаємо" зайві знаки без заокруглення
            const regex = new RegExp(`^-?\\d+(?:\\.\\d{0,${decimalPlaces}})?`);
            const match = num.toString().match(regex);
            if (match) {
                return match[0];
            }
            return num.toString();
        }
    }
    return value;
}

// Функція для форматування чисел всередині рядка "Еталонні величини"
function formatReferenceValue(value) {
    if (typeof value !== 'string') {
        return value;
    }
    // Знаходимо всі числа (включно з десятковими) у рядку
    return value.replace(/(\d+\.\d+)|(\d+)/g, (match) => {
        // Для кожного знайденого числа застосовуємо форматування
        return formatNumber(match, REFERENCE_DECIMAL_PLACES);
    });
}

// Функція для розрахунку тексту і визначення висоти тексту
function drawCell(doc, cell, x, y, width, align = 'center') {
    const textHeight = doc.heightOfString(cell.toString(), { width });
    doc.text(cell, x, y, { width, align });
    return Math.floor(textHeight);
}

function convertDate(dateStr) {
    // Перетворення рядка в об'єкт дати
    const date = new Date(dateStr);

    // Отримання дня, місяця та року
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');  // Місяці в JavaScript починаються з 0
    const year = date.getFullYear();


    // Форматування дати у формат dd.mm.yyyy
    return `${day}.${month}.${year}`;
}


export default function createPDF(secData, data, backgroundImagePath, fontPath, backgroundTrigger = false, webcode) {
    // Функція тепер повертає Promise, який зарезолвиться з Buffer
    return new Promise((resolve, reject) => {
        let i;
        let end;
        console.log(webcode);
        const doc = new PDFDocument({
            bufferPages: true
        });

        // Додаємо обробники помилок
        doc.on('error', reject);

        // Створення буфера для запису
        const buffers = [];
        const writableStream = new Writable({
            write(chunk, encoding, callback) {
                buffers.push(chunk); // Збираємо всі частини в буфер
                callback();
            }
        });

        writableStream.on('error', reject); // Обробка помилок стріму

        doc.pipe(writableStream);

        // ==================================================================
        // ВАША ЛОГІКА ГЕНЕРАЦІЇ PDF (залишена без змін)
        // ==================================================================

        function addHeaderAndBackground() {
            let headerData = ''
            // Додавання фону
            if (backgroundTrigger) {
                doc.image(backgroundImagePath, 0, 0, { width: doc.page.width, height: doc.page.height });
            }

            // Використання системного шрифту
            doc.font(fontPath).fontSize(9).fillColor('black');
            for (const element of data) {
                // Дані шапки
                headerData = {
                    'Дата отримання матеріалу': convertDate(element['Дата отримання матеріалу']),
                    'Пацієнт': `${element['Прізвище']} ${element["Ім'я"]}`,
                    'Дата народження': convertDate(String(element['Дата народження'])),
                    'Стать': element['Стать'],
                    'Дата видачі результатів': convertDate(element['Дата видачі результатів']),
                    'Примітка': element['Примітка'],
                };
                break
            }


            let headerY = 80; // Початкова позиція для шапки
            const headerX = 50; // Ліва межа шапки

            // Відображення шапки
            Object.entries(headerData).forEach(([key, value]) => {
                const keyText = `${key}: `;  // Текст для ключа
                const valueText = value;     // Текст для значення

                // Спочатку виводимо ключ зі стандартним шрифтом
                doc.font(fontPath).text(keyText, headerX, headerY);

                // Якщо ключ - "Пацієнт", то текст значення буде жирним
                if (key === 'Пацієнт') {
                    doc.font('C:\\data\\arial-bold.ttf');  // Встановлюємо жирний шрифт Arial
                } else {
                    doc.font(fontPath);  // Встановлюємо звичайний шрифт Arial для інших
                }

                // Виводимо значення (жирним, якщо це "Пацієнт")
                doc.text(valueText, headerX + doc.widthOfString(keyText), headerY);  // Зсуваємо, щоб значення йшло після ключа
                headerY += 15; // Відступ між рядками
            }
            );

            // Позиція Y першого рядка шапки
            const firstHeaderRowY = headerY;

            // Додавання заголовка таблиці
            const startX = 50;
            const cellWidth = 130; // Ширина комірки
            const columnWidths = [
                cellWidth * 2, // Перша комірка — ширша на 30%
                cellWidth * 0.5, // Друга комірка — вужча
                cellWidth * 0.5, // Третя комірка — вужча
                cellWidth, // Четверта комірка — стандартна
            ];



            let currentX = startX;
            secData.headers.forEach((header, index) => {
                const columnWidth = columnWidths[index];
                if (index === 3) {
                    doc.rect(currentX, headerY, columnWidth - 1, 15).fillOpacity(0.2).fill('Gray').stroke()
                    // Визначаємо центр для тексту
                    const textWidth = doc.widthOfString(header) + 5;
                    const textHeight = doc.heightOfString(header);
                    const textX = currentX + (columnWidth - textWidth) / 2;
                    const textY = headerY + (15 - textHeight) / 2;

                    doc.font(fontPath).fontSize(9).opacity(1).fillColor('black');
                    doc.text(header, textX - 5, textY);


                } else {
                    // Малюємо рамку для заголовка
                    doc.rect(currentX, headerY, columnWidth - 1, 15).fillOpacity(0.2).fill('Gray').stroke()

                    // Визначаємо центр для тексту
                    const textWidth = doc.widthOfString(header);
                    const textHeight = doc.heightOfString(header);
                    const textX = currentX + (columnWidth - textWidth) / 2;
                    const textY = headerY + (15 - textHeight) / 2;

                    // Додаємо текст заголовка
                    doc.font(fontPath).fontSize(9).opacity(1).fillColor('black');

                    doc.text(header, textX, textY);

                    // Зміщуємо позицію для наступної комірки
                    currentX += columnWidth;
                }
            });

            // Повертаємо висоту після шапки та заголовка таблиці
            return { firstHeaderRowY, nextY: headerY + 25 }; // Повертаємо координати для використання далі
        }

        // Додаємо першу сторінку та отримуємо висоту після шапки
        const { firstHeaderRowY, nextY } = addHeaderAndBackground();

        // Налаштування таблиці
        const startX = 50; // Початок таблиці
        const cellWidth = 130; // Ширина комірки
        // Висота комірки
        const columnWidths = [
            cellWidth * 2, // Перша комірка — ширша на 30%
            cellWidth * 0.5, // Друга комірка — вужча
            cellWidth * 0.5, // Третя комірка — вужча
            cellWidth   // Четверта комірка — стандартна
        ];
        let cellHeightFirstRow = 15;
        let TextResult
        let resDescription
        let rowsArray = [];
        let upper;
        let laborantName;
        // Додаємо рядки таблиці
        let currentY = nextY; // Використовуємо значення для Y після шапки
        data.forEach((row) => {
            let result = row['Результат'];
            let resultText = row['Результат текст'];
            const refFrom = row['Референт від'];
            const refTo = row['Референт до'];
            if (resultText !== null && !isNaN(Number((resultText)?.replace(',', '.'))) && result === null) {
                result = Number((resultText).replace(',', '.'));
                resultText = null;
            }

            // Перевірка наявності результатів
            if ((result !== null && result !== 0) || (resultText && result !== 0.0000)) {
                // Визначення значення 'upper'
                if (result !== null && result > refTo && refTo !== null && refFrom !== null) {
                    upper = `+ (${refFrom} - ${refTo})`;
                } else if (result !== null && result < refFrom) {
                    upper = `- (${refFrom} - ${refTo})`;
                } else {
                    upper = `(${refFrom} - ${refTo})`;
                }

                let ExpWithComment;
                if (row['Коментар'] !== null) {
                    // Заміна символів переведення рядка на \n
                    let resultComment = row['Коментар']
                        .replace(/\r\n|\n|\r/g, '\n') // Замінюємо всі варіанти переведення рядка на пробіл
                        .trim(); // Видаляємо зайві пробіли з початку і кінця
                    ExpWithComment = `${row['Обстеження']}\n\n${resultComment}\n`;

                } else (ExpWithComment = row['Обстеження']);
                // Додавання до масиву rowsArray
                rowsArray.push([
                    ExpWithComment,
                    result,
                    row['Одиниця в.'],
                    upper,
                    resultText,
                    row['Опис результату'],
                    row['Панель'],
                    row['Матеріал забору'] // Додаємо матеріал забору
                ]);
            }

            // Формування імені лаборанта
            laborantName = `${row['ЛаборантФ']} ${row['ЛаборантМ']}`;
        });

        let actualPanel = null;
        let panelCount = 0;  // додаємо перед циклом rowsArray.forEach
        rowsArray.sort((a, b) => a[6].localeCompare(b[6]));
        rowsArray.forEach((row, rowIndex) => {
            cellHeightFirstRow = 15;
            let currentX = startX; // Початкова позиція для кожного рядка
            let cellHeight = 15;
            let test;
            let textHeightValue;

            const panel = row[6] ? row[6].trim() : null;
            if (!panel) { }
            else if (panel !== actualPanel) {
                actualPanel = panel;

                // Лічильник панелей
                panelCount++;

                // Якщо це не перша панель → робимо відступ
                if (panelCount > 1) {
                    currentY += 15;  // відступ у один рядок
                }

                // Знаходимо унікальні матеріали для поточної панелі
                const materialsForPanel = rowsArray
                    .filter(r => (r[6] ? r[6].trim() : '') === actualPanel && r[7])
                    .map(r => r[7].trim());
                const uniqueMaterials = [...new Set(materialsForPanel)].join(', ');

                const pageWidth = doc.page.width;
                const fontSize = 8.5;
                let panelHeaderHeight = cellHeight;

                // Розраховуємо висоту заголовка панелі, враховуючи матеріал
                if (uniqueMaterials) {
                    const materialTextHeight = doc.heightOfString(uniqueMaterials, { width: pageWidth - 92 - 10 });
                    panelHeaderHeight += materialTextHeight;
                }

                doc.moveTo(currentX, currentY)
                    .lineWidth(0.8)
                    .lineTo(currentX + columnWidths.reduce((a, b) => a + b, 0), currentY)
                    .stroke();

                doc.fillOpacity(0.15).fill('Gray').stroke();
                doc.rect(currentX, currentY, pageWidth - 92, panelHeaderHeight).fill();

                // Назва панелі: жирний шрифт, по центру
                doc.font('C:\\data\\arial-bold.ttf').fontSize(9).opacity(1).fillColor('black');
                doc.text(panel, currentX, currentY + 4, { width: pageWidth - 92, align: 'center' });

                if (uniqueMaterials) {
                    // Матеріал: курсив, менший шрифт, по центру
                    const materialText = `Матеріал забору: ${uniqueMaterials}`;
                    doc.font('C:\\data\\arial-italic.ttf').fontSize(7).opacity(1).fillColor('black');
                    doc.text(materialText, currentX, currentY + 16, { width: pageWidth - 92, align: 'left' });
                }

                currentY += panelHeaderHeight + 5; // Оновлюємо currentY після заголовка панелі
            }

            let isFullWidthRow = false; // Прапорець для рядка на всю ширину
            for (let index = 0; index < row.length; index++) {
                let cell = row[index];
                const columnWidth = columnWidths[index]; // Ширина поточної комірки

                // Текст у першій колонці (індекс 0) вирівнюється по лівому краю
                if (index === 0) {
                    if (([":", "а саме:"].includes(row[4]) && !excludedPhrases.some(phrase => row[0].includes(phrase))) && row[5] === null) {  // [':','а саме:'].includes(row[4])        //  row[4]=== ':'
                        const pageWidth = doc.page.width;
                        // Розмір шрифту
                        const fontSize = 8.5;
                        // Визначаємо ширину тексту
                        const textWidth = doc.widthOfString(cell, fontSize);
                        // Обчислюємо координату X для центрування
                        const centerX = (pageWidth - textWidth) / 2;

                        doc.fillOpacity(0.15).fill('Gray').stroke();

                        doc.rect(currentX, currentY, pageWidth - 92, cellHeight).fill();
                        doc.font(fontPath).fontSize(9).opacity(1).fillColor('black');

                        // Встановлюємо координати для тексту (центруємо по X, Y залишаємо за замовчуванням)
                        doc.text(cell, centerX + 30, currentY + 3, { fontSize: fontSize });

                        isFullWidthRow = true; // Встановлюємо прапорець

                    } else {

                        doc.font(fontPath).fontSize(8.5).fillColor('black');
                        // Замінюємо новий рядок на спеціальний текст
                        if (row[5] !== null && row[5] !== "") {
                            row[5] = row[5].replace(/[\r\n]+/g, `\n     •   `);
                            cell = `${cell}\n     •   ${row[5]}`;
                            test = doc.heightOfString(cell, { width: 255, align: 'left' });
                            doc.text(cell, currentX + 5, currentY + 2, { width: 255, align: 'left' }); // Лівий відступ
                        } else {
                            test = doc.heightOfString(cell, { width: 255, align: 'left' });
                            doc.text(cell, currentX + 5, currentY + 2, { width: 255, align: 'left' });
                        }
                    }
                    if (Math.floor(test) > 15) {
                        cellHeight = Math.floor(test) + 5;
                        cellHeightFirstRow = cellHeight;
                    } else {
                        cellHeight = 15;
                    }
                } else {
                    // Якщо це рядок на всю ширину, пропускаємо малювання інших колонок
                    if (isFullWidthRow) {
                        continue;
                    }

                    // Визначаємо значення для інших колонок
                    if (index === 1 && cell === null) {
                        cell = row[4];
                        const cleanedWord = cell.replace(/[,.;!?]$/, '');

                        if (isAbnormalResult(cleanedWord, values, partialArray, forbiddenPhrases, row[3])) {
                            test = doc.heightOfString(cell, { width: 60, align: 'left' });
                            // Оновлюємо висоту клітинки, якщо потрібно
                            if (Math.floor(test) > cellHeightFirstRow) {
                                cellHeight = Math.floor(test) + 4;
                            }

                            // Розраховуємо вертикальний центр для фону
                            const verticalCenter = currentY + (cellHeight - test - 3) / 2;

                            // Малюємо блідочервоний квадрат навколо результату
                            if (backgroundTrigger) { doc.fillColor('#FFCCCB'); } else { doc.fillColor('#D3D3D3'); }
                            doc.rect(currentX, verticalCenter, 60, test + 3).fill();
                        } else {
                            // Якщо жодна з умов не виконана, то просто перевіряємо висоту без малювання
                            test = doc.heightOfString(cell, { width: 60, align: 'left' });
                            if (Math.floor(test) > cellHeightFirstRow) {
                                cellHeight = Math.floor(test) + 4;
                            }
                        }

                    }
                    if (index >= 4) {
                        break; // Виходимо з циклу, коли індекс досягне 4
                    }

                    if (cell === null) {
                        if (index === 2 || index === 1) { // Додано перевірку для index 1 (Результат)
                            cell = ''; // Обробка для index === 2 або index === 3
                        }
                    }
                    if (index === 3 && (cell === null || String(cell).includes("null"))) {
                        cell = ''; // Обробка для index === 3 і якщо масив містить "null"
                    }

                    // Перевірка, чи потрібно малювати блідочервоний квадрат
                    if (index === 1 && row[3]?.[0] && ['+', '-'].includes(row[3][0])) {
                        // Форматуємо число перед розрахунком висоти, щоб бути послідовним
                        const formattedCell = formatNumber(cell, RESULT_DECIMAL_PLACES, ROUND_RESULT_VALUE);
                        const textHeight = doc.heightOfString(formattedCell.toString(), { width: 60 });

                        // Розраховуємо Y-координату так, щоб вона центрувалася відносно висоти тексту
                        const rectY = currentY + (cellHeight - textHeight) / 2;

                        if (backgroundTrigger) { doc.fillColor('#FFCCCB'); } else { doc.fillColor('#D3D3D3'); }
                        // Малюємо прямокутник навколо тексту
                        doc.rect(currentX, rectY, 60, textHeight).fill();
                    }

                    doc.font(fontPath).fontSize(8.5).fillColor('black');
                    const textWidth = doc.widthOfString(cell.toString());
                    const textX = currentX + (columnWidth - textWidth) / 2; // Горизонтальний центр

                    if (index === 3) {
                        // Форматуємо числа всередині рядка "Еталонні величини"
                        cell = formatReferenceValue(cell);
                        const textHeightValue = drawCell(doc, cell, currentX + 15, currentY + 4, 80, 'center'); // Малюємо текст для 3-ї колонки
                        if (Math.floor(textHeightValue) > Math.floor(cellHeightFirstRow)) {
                            cellHeight = Math.floor(textHeightValue) + 5; // Оновлюємо висоту комірки
                        }
                    } else if (index === 2) { // Окрема обробка для "Одиниця в."
                        const textHeightValue = drawCell(doc, cell, currentX, currentY + 4, 60, 'center');
                        if (Math.floor(textHeightValue) > Math.floor(cellHeightFirstRow)) {
                            cellHeight = Math.floor(textHeightValue) + 5;
                        }
                    } else if (index === 1) { // Окрема обробка для "Результат"
                        cell = formatNumber(cell, RESULT_DECIMAL_PLACES, ROUND_RESULT_VALUE);
                        const textHeightValue = doc.heightOfString(cell.toString(), { width: 60 });
                        const verticalCenter = currentY + (cellHeight - textHeightValue) / 2; // Розрахунок вертикального центру
                        drawCell(doc, cell, currentX, verticalCenter, 60, 'center');

                        if (Math.floor(textHeightValue) > Math.floor(cellHeightFirstRow)) {
                            cellHeight = Math.floor(textHeightValue) + 5;
                        }
                    }
                }

                // Зміщуємо позицію для наступної комірки
                currentX += columnWidth;
            }

            currentY += cellHeight;

            // Малюємо горизонтальну лінію після кожного рядка
            doc.moveTo(startX, currentY)
                .lineWidth(0.7)
                .lineTo(startX + columnWidths.reduce((a, b) => a + b, 0), currentY)
                .stroke();

            // Перевірка, чи вистачає місця на поточній сторінці
            if ((currentY > doc.page.height - 290) && (rowIndex < rowsArray.length - 1)) {
                doc.font(fontPath).fontSize(8).fillColor('black');
                doc.text(`Виконавець: ${laborantName}\nЗавідувач лабораторією: Бакася Марина\nРезультати аналізів не є діагнозом. Інтерпретацію аналізів проводить лікуючий лікар.`, startX, currentY + 25, { align: 'left' });
                if (backgroundTrigger) {
                    doc.image('C:\\data\\logostamp.png', 430, currentY + 5, { fit: [100, 100], align: 'center', valign: 'center' });
                }

                doc.addPage(); // Додаємо нову сторінку

                const { firstHeaderRowY, nextY } = addHeaderAndBackground(); // Додаємо фонове зображення та шапку на новій сторінці
                currentY = nextY;
            }
        });

        // ==================================================================
        // КІНЕЦЬ ВАШОЇ ЛОГІКИ ГЕНЕРАЦІЇ
        // ==================================================================

        // Додавання нумерації сторінок
        const range = doc.bufferedPageRange();
        for (i = range.start, end = range.start + range.count; i < end; i++) {
            doc.switchToPage(i);
            doc.font(fontPath).fontSize(8).fillColor('black');
            doc.text(`Сторінка ${i + 1}/${range.count}`, startX, doc.page.height - 700, { align: 'right' }); // Позиція Y скоригована
        }

        // Додавання футера на останню сторінку
        // (Переконайтеся, що doc все ще на останній сторінці, або використовуйте doc.switchToPage(end - 1))
        doc.text(`Виконавець: ${laborantName}\nЗавідувач лабораторією: Бакася Марина\nРезультати аналізів не є діагнозом. Інтерпретацію аналізів проводить лікуючий лікар.`, startX, currentY + 25, { align: 'left' });
        if (backgroundTrigger) {
            doc.image('C:\\data\\logostamp.png', 430, currentY + 5, { fit: [100, 100], align: 'center', valign: 'center' });
        }
        // Завершення документу
        doc.end();

        // ==================================================================
        // ОНОВЛЕНИЙ ОБРОБНИК ЗАВЕРШЕННЯ
        // ==================================================================

      writableStream.on('finish', async () => {
    const pdfBuffer = Buffer.concat(buffers);
    const outputPath = './output.pdf'; 

    // Якщо webcode відсутній, пропускаємо пошук на FTP і повертаємо основний PDF
    if (!webcode) {
        console.log('Webcode не надано, пошук додатків на FTP пропущено.');
        return resolve(pdfBuffer);
    }

    try {
        console.log(`Пошук додатків для коду: ${webcode}`);
        
        // Спроба отримати файли
        const result = await processFilesFromFtp(webcode,backgroundTrigger);

        // Перевірка наявності результатів та масиву файлів
        if (result && Array.isArray(result.pdfFiles) && result.pdfFiles.length > 0) {
            console.log(`Знайдено додатків: ${result.pdfFiles.length}. Починаємо об'єднання...`);
            
            const outputFolder = `./${webcode}`;
            const mergedPdf = await appendPdfToExistingPdf(
                pdfBuffer, 
                result.pdfFiles, 
                outputPath, 
                outputFolder
            );

            return resolve(mergedPdf);
        }

        // Якщо масив порожній (але проміс зарезолвився)
        resolve( pdfBuffer );

    } catch (error) {
        // КРИТИЧНЕ ВИПРАВЛЕННЯ:
        // Якщо каталог не знайдено (ваша помилка), просто повертаємо основний PDF
        if (error.message.includes('Каталог з даними не знайдено')) {
            console.warn(`Додатки відсутні для ${webcode}: каталог не знайдено на FTP.`);
            return resolve(pdfBuffer);
        }

        // Якщо сталася інша технічна помилка (наприклад, збій з'єднання)
        console.error('Технічна помилка FTP:', error);
        resolve({
            pathFile: outputPath,
            buffer: pdfBuffer,
            ftpError: error.message
        });
    }
});
    });
}