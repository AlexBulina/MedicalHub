import { exec } from 'child_process';
import path from 'path';
import ftpClient from './ftpconnect.js';
import fs from 'fs/promises';
import { PDFDocument } from 'pdf-lib'; // Імпорт pdf-lib

// Використовуємо повний шлях до libreoffice
const libreOfficePath = '"C:\\Program Files\\LibreOffice\\program\\soffice.exe"'; // Замінити на  шлях до LibreOffice

// Універсальна функція для обробки помилок
export function handleError(context, error) {
    console.error(`[${context}]`, error.message || error);
}

// Конвертація DOCX у PDF
export async function convertDocxToPdf(docxPath, outputPdfPath) {
    return new Promise((resolve, reject) => {
        // Перетворюємо шляхи на абсолютні, щоб уникнути проблем з відносними шляхами в LibreOffice
        const absoluteDocxPath = path.resolve(docxPath);
        const absoluteOutDir = path.resolve(path.dirname(outputPdfPath));

        const command = `${libreOfficePath} --headless --convert-to pdf --outdir "${absoluteOutDir}" "${absoluteDocxPath}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) return reject(new Error(`Помилка при конвертації: ${error.message}. Stderr: ${stderr}`));
            if (stderr && !stderr.includes('writer_pdf_Export')) return reject(new Error(`Сталася помилка: ${stderr}`));
            resolve(`Конвертація завершена! PDF збережено за адресою: ${outputPdfPath}`);
        });
    });
}





// Очищення метаданих з PDF
export async function removePdfMetadata(pdfPath) {
    try {
        const pdfBytes = await fs.readFile(pdfPath); // Зчитуємо PDF-файл
        const pdfDoc = await PDFDocument.load(pdfBytes); // Завантажуємо PDF у pdf-lib

        // Очищаємо стандартні метадані
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('');
        pdfDoc.setCreator('');



        // Зберігаємо оновлений PDF
        const pdfBytesCleaned = await pdfDoc.save();
        await fs.writeFile(pdfPath, pdfBytesCleaned);
        console.log(`Метадані видалено з файлу: ${pdfPath}`);
    } catch (error) {
        handleError(`Очищення метаданих ${pdfPath}`, error);
    }
}




export async function addBackgroundToPdf(
  pdfPath,
  imagePath = 'C:\\data\\Blank_HM_Stamp.png'
) {
  try {
    // читаємо оригінал
    const srcBytes = await fs.readFile(pdfPath);
    const srcDoc = await PDFDocument.load(srcBytes);

    // створюємо новий PDF
    const destDoc = await PDFDocument.create();

    // читаємо фон
    const imgBytes = await fs.readFile(imagePath);
    const bgImg = imagePath.toLowerCase().endsWith('.png')
      ? await destDoc.embedPng(imgBytes)
      : await destDoc.embedJpg(imgBytes);

    // копіюємо сторінки з оригінального PDF
    const totalPages = srcDoc.getPageCount();
    for (let i = 0; i < totalPages; i++) {
      const [embeddedPage] = await destDoc.embedPages([srcDoc.getPage(i)]);
      const { width, height } = embeddedPage;

      // додаємо нову сторінку у результат
      const newPage = destDoc.addPage([width, height]);

      // малюємо фон
      newPage.drawImage(bgImg, {
        x: 0,
        y: 0,
        width,
        height,
      });

      // поверх малюємо контент старої сторінки
      newPage.drawPage(embeddedPage, { x: 0, y: 0, width, height });
    }

    // зберігаємо у той самий файл (перезаписуємо старий PDF)
    const modifiedBytes = await destDoc.save();
    await fs.writeFile(pdfPath, modifiedBytes);

    console.log(`✅ Фон додано і збережено у файл: ${pdfPath}`);
  } catch (error) {
    console.error(`Помилка при додаванні фону:`, error);
  }
}


// Зміна розширення файлу на .pdf
export function changeExtensionToPdf(filePath) {
    if (!filePath.endsWith('.docx')) {
        if (filePath.endsWith('.pdf')) {
            return filePath;
        }
        throw new Error('Вхідний файл повинен мати розширення .docx або .pdf');
    }
    return filePath.replace('.docx', '.pdf');
}

// Завантаження файлів із FTP і обробка
export async function processFilesFromFtp(directoryId,backTriger,DepartmentId = null) {
    try {
        const ftpFilesRow = await ftpClient.ftp_connect(directoryId);

        const response = await ftpClient.checkDirectoryOnFTP(directoryId);
        if (response.code === 550) {
            throw new Error('Каталог з даними не знайдено на FTP');
        }

        if (!ftpFilesRow.ftpFiles || ftpFilesRow.ftpFiles.length === 0) {
            throw new Error('На FTP відсутні відповідні файли для обробки');
        }

        for (const ftpFile of ftpFilesRow.ftpFiles) {
            try {
                console.log(`Обробляємо файл: ${ftpFile}`);
                const inputPath = `./${directoryId}/${ftpFile}`;
                const outputPdfPath = `./${directoryId}/${changeExtensionToPdf(ftpFile)}`;




				/*
				
				/ ... / — це літерал регулярного виразу.

\. — означає «буквальна крапка» (бо . у regex означає будь-який символ, тому її треба екранувати \.).

(docx?):

doc — обов’язково має бути.

x? — x може бути, а може і не бути (? = 0 або 1 раз).

тобто підходить і doc, і docx.

$ — вказує на кінець рядка (щоб .doc не знайшлось десь у середині).

.test(ftpFile) — метод регулярки:

повертає true, якщо рядок підходить під шаблон.

ftpFile тут можна навіть не переводити у .toLowerCase(), бо в шаблоні я прописав DOCX? для верхнього регістру теж.
Якщо хочеш коротше — можна додати флаг i (ignore case):
				
				*/

                if  (/\.(docx?)$/i.test(ftpFile)) {
                    // DOCX → конвертація
                    const message = await convertDocxToPdf(inputPath, outputPdfPath);
                    console.log(message);

                    // очищаємо метадані
                    await removePdfMetadata(outputPdfPath);
						if (DepartmentId === null){
                    // додаємо фон (звичайний)

                     if (backTriger){
                        await addBackgroundToPdf(outputPdfPath, 'C:\\data\\Blank_HM_Stamp.png');
                    }
						
						}

                    // видаляємо оригінал DOCX
                    await fs.unlink(inputPath).catch(err => {
                        if (err.code !== 'ENOENT') throw err; // Ігноруємо помилку, тільки якщо файл не знайдено
                        console.log(`Файл ${inputPath} вже був видалений, пропускаємо.`);
                    });
                } 
                else if (ftpFile.toLowerCase().endsWith('.pdf') && DepartmentId === null) {
                    // PDF → очищення метаданих
                    await removePdfMetadata(inputPath);

                    // додаємо фон для PDF з іншим зображенням
                  //  await addBackgroundToPdf(inputPath, 'C:\\data\\Blank_HM_Stamp_Prisca.png');
                    console.log(`✅ Фон (Prisca) додано у файл: ${ftpFile}`);
                } 
                else {
                    console.warn(`⚠ Файл ${ftpFile} має непідтримуване розширення`);
                }

            } catch (fileError) {
                handleError(`Обробка файлу ${ftpFile}`, fileError);
            }
        }

        const files = await fs.readdir(`./${directoryId}`);
        console.log('Список файлів:', files);

        return { WebPath: directoryId, pdfFiles: files };
    } catch (e) {
        handleError('FTP Обробка', e);
        throw e;
    }
}