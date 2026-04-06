import express from 'express';
import cors from 'cors';
import pkg from 'body-parser';
import pkgP from 'pdf-to-printer';
import { launch } from 'puppeteer';
import { existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());

const json = pkg;
const { print } = pkgP;
// Збільшуємо ліміт, бо HTML може бути великим
app.use(json({ limit: '10mb' }));



// НАЛАШТУВАННЯ ПРИНТЕРІВ (Назви з Windows)
const PRINTERS = {
    A4: "HP LaserJet P1006",
    LABEL: "Godex DT2x"
};

app.post('/print-html', async (req, res) => {
    const { type, htmlContent, width, height } = req.body;
    const printerName = PRINTERS[type];
    const tempPdfPath = join(__dirname, `output_${Date.now()}.pdf`);

    if (!printerName) return res.status(400).json({ error: "Невідомий принтер" });

    try {
        console.log(`Генерую PDF для ${type}...`);

        // 1. Запускаємо Puppeteer
        const browser = await launch();
        const page = await browser.newPage();

        // 2. Вставляємо ваш HTML
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        // 3. Налаштування сторінки (PDF)
        let pdfOptions = {};

        if (type === 'LABEL') {
            // Для етикеток задаємо точні розміри (наприклад, 50mm x 30mm)
            // Ці параметри прийдуть з фронта або можна прописати тут жорстко
            pdfOptions = {
                // Зазвичай для горизонтальної етикетки ширина більша за висоту
                width: width || '50mm', 
                height: height || '25mm', 
                
                landscape: true, // <--- ДОДАЄМО ЦЕЙ ПАРАМЕТР
                
                printBackground: false,
                margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
                scale: 1
            };
        } else {
            // А4
            pdfOptions = { format: 'A4', printBackground: true };
        }

        // 4. Зберігаємо у PDF
        await page.pdf({ path: tempPdfPath, ...pdfOptions });
        await browser.close();

        // 5. Друкуємо
        console.log(`Відправляю на принтер: ${printerName}`);
        await print(tempPdfPath, {
            printer: printerName,
            orientation: 'landscape' // Вказуємо принтеру друкувати горизонтально
        });

        // Видаляємо файл (трохи зачекавши, щоб принтер встиг схопити)
       setTimeout(() => { if (existsSync(tempPdfPath)) unlinkSync(tempPdfPath); }, 5000);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(4000, () => console.log('HTML Print Server running on port 4000'));