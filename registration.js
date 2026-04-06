import { connect } from 'odbc';

// Рядок підключення (Змініть під свої налаштування SQL Anywhere)
const CONNECTION_STRING = 'dsn=Doktor5U;CHARSET=utf-8';

// Налаштування меж для кодів аналізів
const TEST_CONFIG = {
    142: { min: 2.1000, max: 17.7000 },
    158: { min: 1.4000, max: 18.1000 },
    159: { min: 0.8000, max: 7.6000 }
};

/**
 * Отримує наступний номер PorCisPobyt (для pobyt і ziad_okb)
 */
async function getNextPorCisPobyt(connection, rodcis, kododd) {
    const sql = `SELECT MAX(porcispobyt) as max_num FROM "nis"."pobyt" WHERE "rodcis" = ? AND "kododd" = ?`;
    const result = await connection.query(sql, [rodcis, kododd]);

    // Пакет odbc повертає масив об'єктів
    let maxVal = 0;
    if (result.length > 0) maxVal = parseInt(result[0].max_num, 10) || 0;
    return maxVal + 1;
}

/**
 * Отримує наступний номер EvidCis (для ziad_okb_prac і pom)
 */
async function getNextEvidCis(connection, datevidcis, kodlab) {
    const sql = `SELECT MAX(evidcis) as max_evid FROM "nis"."ziad_okb_prac" WHERE  "datevidcis" = ? AND "kodlab" = ?`;
    const result = await connection.query(sql, [datevidcis, kodlab]);

    let maxVal = 0;
    if (result.length > 0) maxVal = parseInt(result[0].max_evid, 10) || 0;
    return maxVal + 1;
}

/**
 * Генерує наступний ID документа (DokladID) для таблиць dodaci_list або pokladnicny_doklad.
 * @param {any} connection - Активне з'єднання з базою даних.
 * @param {string} tableName - Назва таблиці ('DODACI_LIST' або '"nis"."pokladnicny_doklad"').
 * @param {string} kodOdd - Код відділення.
 * @param {Date} documentDate - Дата документа.
 * @returns {Promise<{newDokladID: number, maxDate: Date}>} - Об'єкт з новим ID та максимальною датою.
 */
async function generateDocumentId(connection, tableName, kodOdd, documentDate) {
    const maxDateRes = await connection.query(`SELECT Max(Datum) as max_date FROM ${tableName} WHERE KodOdd = ?`, [kodOdd]);
    const maxDate = (maxDateRes.length > 0 && maxDateRes[0].max_date) ? maxDateRes[0].max_date : documentDate;

    const maxIdSql = `SELECT Max(dokladid) as max_id FROM ${tableName} WHERE KodOdd = ? AND Datum = ?`;
    const maxIdRes = await connection.query(maxIdSql, [kodOdd, maxDate]);

    const maxDokladID = (maxIdRes.length > 0 && maxIdRes[0].max_id) ? parseInt(maxIdRes[0].max_id, 10) : 0;
    const newDokladID = maxDokladID + 1;

    console.log(`   - GEN: Новий DokladID для таблиці ${tableName}: ${newDokladID}`);
    return { newDokladID, maxDate };
}


/**
 * Форматує об'єкт Date у рядок 'YYYY-MM-DD HH:mm:ss.SSS' для SQL.
 * @param {Date} date - Об'єкт дати для форматування.
 * @returns {string} - Відформатований рядок дати.
 */
function formatDateForSQL(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * Отримує повне ім'я пацієнта (Прізвище Ім'я) за його rodcis.
 * @param {any} connection - Активне з'єднання з базою даних.
 * @param {string} rodcis - Родовий номер пацієнта.
 * @returns {Promise<string>} - Повне ім'я пацієнта або порожній рядок, якщо пацієнта не знайдено.
 */
async function getPatientFullName(connection, rodcis) {
    const sql = `SELECT meno, priezvisko FROM "nis"."c_pacient" WHERE rodcis = ?`;
    const result = await connection.query(sql, [rodcis]);

    if (result.length > 0 && result[0].priezvisko) {
        const priezvisko = result[0].priezvisko.trim();
        const meno = result[0].meno ? result[0].meno.trim() : '';
        return `${priezvisko} ${meno}`.trim();
    }
    return ''; // Повертаємо порожній рядок, якщо пацієнт не знайдений
}

/**
 * Розраховує деталі рахунку (суму, знижку, позиції).
 * @param {any} connection - Активне з'єднання з базою даних.
 * @param {object} registrationData - Дані реєстрації.
 * @param {number} newEvidCis - Номер evidcis.
 * @returns {Promise<object>} - Об'єкт з деталями рахунку.
 */
async function calculateInvoiceDetails(connection, registrationData, newEvidCis) {
    let totalSum = 0;
    const testsInMacros = new Set();
    const invoiceItems = [];

    // Спочатку обробляємо макроси (пакети)
    const macrosSql = `
       SELECT c_okb_skup.kodskup, c_okb_skup.nazovskup, c_okb_skup.cenaplna, c_okb_skup_vys.kodvys
       FROM c_okb_skup, c_okb_skup_vys, ziad_okb_pouzite_makro, c_okb_vys
       WHERE (c_okb_skup.kodskup = c_okb_skup_vys.kodskup) AND
             (c_okb_skup.kodlab = c_okb_skup_vys.kodlab) AND
             (ziad_okb_pouzite_makro.kodlab = c_okb_skup.kodlab) AND
             (ziad_okb_pouzite_makro.kodmakra = c_okb_skup.kodskup) AND
             (c_okb_vys.kodvys = c_okb_skup_vys.kodvys) AND
             (c_okb_vys.kodlab = c_okb_skup_vys.kodlab) AND
             (ziad_okb_pouzite_makro.kodlab = ?) AND
             (ziad_okb_pouzite_makro.datevidcis = ?) AND
             (ziad_okb_pouzite_makro.evidcis = ?)
   `;
    const macrosResult = await connection.query(macrosSql, [registrationData.labCode, registrationData.datevidcis, newEvidCis]);

    const groupedMacros = {};
    macrosResult.forEach(row => {
        if (!groupedMacros[row.kodskup]) {
            groupedMacros[row.kodskup] = { name: row.nazovskup, price: row.cenaplna, tests: [] };
        }
        groupedMacros[row.kodskup].tests.push(row.kodvys);
        testsInMacros.add(row.kodvys);
    });

    for (const kodskup in groupedMacros) {
        const macro = groupedMacros[kodskup];
        totalSum += macro.price || 0;
        invoiceItems.push({ code: kodskup, name: macro.name, price: macro.price || 0, isMacro: true });
        console.log(`   - Макрос '${macro.name}' (${kodskup}) додано до розрахунку. Ціна: ${macro.price || 0}`);
    }

    // Потім обробляємо окремі аналізи, які не входять до макросів
    const individualTestsSql = `
       SELECT z.kodvys, v.nazov, p.cena
       FROM ziad_okb_pom z
       LEFT JOIN c_okb_vys v ON z.kodvys = v.kodvys AND z.kodlab = v.kodlab
       LEFT JOIN c_okb_vykon p ON z.kodvys = p.kodvys AND z.kodlab = p.kodlab
       WHERE z.kodlab = ? AND z.datevidcis = ? AND z.evidcis = ?
   `;
    const testsResult = await connection.query(individualTestsSql, [registrationData.labCode, registrationData.datevidcis, newEvidCis]);

    for (const test of testsResult) {
        if (!testsInMacros.has(test.kodvys)) {
            const price = test.cena || 0;
            totalSum += price;
            invoiceItems.push({ code: test.kodvys, name: test.nazov, price: price, isMacro: false });
            console.log(`   - Окремий аналіз '${test.nazov}' (${test.kodvys}) додано. Ціна: ${price}`);
        }
    }

    const discountPercent = registrationData.discont || 0;
    const totalSumWithoutDiscount = totalSum;
    const discountAmount = (totalSumWithoutDiscount * discountPercent) / 100;
    const finalSum = totalSumWithoutDiscount - discountAmount;

    console.log(`   - Розрахована сума без знижки: ${totalSumWithoutDiscount}`);
    console.log(`   - Знижка: ${discountPercent}% (${discountAmount})`);
    console.log(`   - Кінцева сума: ${finalSum}`);

    return { invoiceItems, totalSumWithoutDiscount, discountPercent, finalSum };
}
/**
 * Реєструє лабораторне замовлення в базі даних.
 * @param {object} registrationData - Об'єкт з даними для реєстрації.
 * @param {string} registrationData.rodcis - Родовий номер пацієнта.
 * @param {string} registrationData.kododd - Код відділення.
 * @param {string} registrationData.datodberu - Дата та час відбору матеріалу.
 * @param {string} registrationData.datprijmu - Дата та час прийому матеріалу.
 * @param {string} registrationData.datevidcis - Дата для evidence.
 * @param {string} registrationData.labCode - Код лабораторії.
 * @param {string} registrationData.targetKodOdd - Цільовий код відділення для запису в `pobyt`.
 * @param {string} registrationData.oscis - Код особи, що зробила запис.
 * @param {string|null} registrationData.osciskon - Код особи, що закрила запис.
 * @param {number} registrationData.rok - Рік.
 * @param {number} registrationData.roknarod - Рік народження.
 * @param {string} registrationData.typziad - Тип заявки.
 * @param {string} registrationData.pohlavie - Стать пацієнта ('M' або 'F').
 * @param {Array<{code: string|number, origin: string}>} testCodes - Масив об'єктів аналізів з їх походженням.
 */
export async function registerLabRequest(registrationData, testCodes) {
    let connection;
     
    try {
        // 1. Підключення
        connection = await connect(CONNECTION_STRING);

        // 2. Старт транзакції
        await connection.beginTransaction();
        console.log("--> Транзакцію відкрито.");

        // Отримання додаткових даних пацієнта (стать, рік народження)
        const patientSql = `SELECT pohlavie, datumnarod FROM "nis"."c_pacient" WHERE rodcis = ?`;
        const patientResult = await connection.query(patientSql, [registrationData.rodcis]);

        if (patientResult.length === 0) {
            // Якщо пацієнта не знайдено, перериваємо транзакцію
            throw new Error(`Пацієнта з rodcis ${registrationData.rodcis} не знайдено в таблиці c_pacient.`);
        }

        const patientData = patientResult[0];
        registrationData.pohlavie = patientData.pohlavie; // Оновлюємо стать
        registrationData.roknarod = new Date(patientData.datumnarod).getFullYear(); // Оновлюємо рік народження
        registrationData.datumnarod = patientData.datumnarod; // Оновлюємо дату народження

        // Отримуємо повне ім'я пацієнта
        const patientFullName = await getPatientFullName(connection, registrationData.rodcis);
        console.log(`Отримано повне ім'я пацієнта: ${patientFullName}`);

        // Розрахунок кількості днів від дати народження до сьогодні
        const birthDate = new Date(patientData.datumnarod);
        const currentDate = new Date();

        // Відкидаємо час для точного розрахунку повних днів
        birthDate.setHours(0, 0, 0, 0);
        currentDate.setHours(0, 0, 0, 0);

        const timeDiff = currentDate.getTime() - birthDate.getTime();
        const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
        registrationData.daysFromBirth = daysDiff;

        console.log(`Кількість днів від дати народження: ${daysDiff}`);

        console.log(`Отримано дані пацієнта: стать=${registrationData.pohlavie}, рік народження=${registrationData.roknarod}`);

        // 3. Розрахунок ID
        const newPorCis = await getNextPorCisPobyt(connection, registrationData.rodcis, registrationData.targetKodOdd);
        const newEvidCis = await getNextEvidCis(connection, registrationData.datevidcis, registrationData.labCode);

        console.log(`GEN: PorCisPobyt=${newPorCis}, EvidCis=${newEvidCis}`);

        // ---------------------------------------------------------
        // КРОК 1: Перевірка типу направлення та вставка в POBYT
        // ---------------------------------------------------------
        const checkReferralSql = `SELECT kododd FROM "nis"."c_zak_okb" WHERE kododdokb = ?`;
        const referralResult = await connection.query(checkReferralSql, [registrationData.pobytKodOddOkb]);

        // Оновлюємо registrationData.kododd на основі результату
        if (referralResult && referralResult.length > 0) {
            registrationData.kododd = referralResult[0].kododd;
            console.log(`--> Направляюча установа внутрішня. Оновлено kododd на: ${registrationData.kododd}`);
        } else {
            registrationData.kododd = null; // або інше значення за замовчуванням, якщо потрібно
            console.log(`--> Направляюча установа зовнішня. kododd встановлено в null.`);
        }

        // ---------------------------------------------------------
        // Вставка в POBYT
        // ---------------------------------------------------------
        const sqlPobyt = `INSERT INTO "nis"."pobyt" 
            ("rodcis", "kododd", "porcispobyt", "datumzac", "datumkon", "datzapisu", "oscis", "datzapisukon", "osciskon") 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?,?) `;

        if (referralResult[0].kododd !== null && referralResult.length > 0) {
            // Направлення внутрішнє - створюємо два записи
            console.log("--> Направлення внутрішнє. Створення двох записів в 'pobyt'.");

            // 1. Запис для kododd
            await connection.query(sqlPobyt, [
                registrationData.rodcis, registrationData.kododd, newPorCis,
                registrationData.datevidcis, registrationData.datevidcis,
                registrationData.datprijmu, registrationData.oscis, registrationData.datprijmu, registrationData.osciskon
            ]);

            // 2. Запис для targetKodOdd
            const newPorCisOdd = await getNextPorCisPobyt(connection, registrationData.rodcis, registrationData.targetKodOdd);
            console.log(`GEN: PorCisPobyt (for target ${registrationData.targetKodOdd})=${newPorCisOdd}`);
            await connection.query(sqlPobyt, [
                registrationData.rodcis, registrationData.targetKodOdd, newPorCisOdd,
                registrationData.datevidcis, registrationData.datevidcis,
                registrationData.datprijmu, registrationData.oscis, registrationData.datprijmu, registrationData.oscis
            ]);
        } else {
            // Направлення зовнішнє - створюємо один запис для targetKodOdd
            console.log("--> Направлення зовнішнє. Створення одного запису в 'pobyt'.");
            await connection.query(sqlPobyt, [
                registrationData.rodcis, registrationData.targetKodOdd, newPorCis,
                registrationData.datevidcis, registrationData.datevidcis,
                registrationData.datprijmu, registrationData.oscis, registrationData.datprijmu, registrationData.osciskon
            ]);

            registrationData.kododd = registrationData.targetKodOdd; // Оновлюємо kododd для подальшого використання
        }

        // ---------------------------------------------------------
        // КРОК 2: Вставка в ZIAD_OKB (Header 1)
        // ---------------------------------------------------------
        const sqlZiad = `INSERT INTO "nis"."ziad_okb" 
            ("datevidcis","kododd", "evidencnecislo", "rodcis", "porcispobyt", "datodberu", "oscisodber", "datprijmu", "oscisprijmu", "stavziad", "evidcis", "koddiagnozy", "typziad", "miestzadziad", "doverne", "kododdokb", "kodpoist", "roknarod", "rok", "cisprotokolu", "vaha", "pracovisko", "kodlab", "samoplatca", "tg") 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        await connection.query(sqlZiad, [
            registrationData.datevidcis, // datevidcis
            registrationData.kododd,     // kododd
            newEvidCis,             // evidencnecislo
            registrationData.rodcis,     // rodcis
            newPorCis,              // porcispobyt
            registrationData.datodberu,  // datodberu
            null,                   // oscisodber
            registrationData.datprijmu,  // datprijmu
            registrationData.oscis, '1', newEvidCis,
            '-', registrationData.typziad, 'O', '4',
            registrationData.pobytKodOddOkb, '0000', registrationData.roknarod, registrationData.rok, 1, 0, 1, registrationData.labCode, 'N', 0
        ]);






        // ---------------------------------------------------------
        // КРОК 3: Вставка в ZIAD_OKB_PRAC (Header 2)
        // ---------------------------------------------------------
        const sqlZiadPrac = `INSERT INTO "nis"."ziad_okb_prac" 
            ("kododd", "rodcis", "porcispobyt", "datodberu", "datprijmu", "oscisprijmu","stavziad", "cisprotokolu", "rok", "evidcis", "koddiagnozy", "typziad", "datevidcis", "miestzadziad", "doverne", "kododdokb", "kodpoist", "evidencnecislo","roknarod", "pohlavie", "pracovisko", "kodlab", "samoplatca", "tg") 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        await connection.query(sqlZiadPrac, [
            registrationData.kododd,
            registrationData.rodcis,
            newPorCis,          // Generated ID
            registrationData.datodberu,
            registrationData.datprijmu, registrationData.oscis, 1, 1, registrationData.rok,
            newEvidCis,         // Generated ID
            '-', registrationData.typziad, registrationData.datevidcis,
            'O', '4', registrationData.pobytKodOddOkb, '0000', registrationData.rodcis, registrationData.roknarod, registrationData.pohlavie, 1, registrationData.labCode, 'N', 0
        ]);

        // ---------------------------------------------------------
        // КРОК 4: Цикл по аналізах (Details)
        // ---------------------------------------------------------
        const sqlPom = `INSERT INTO "nis"."ziad_okb_pom" 
            ("kododd", "rodcis", "porcispobyt", "datodberu", "kodvys", "stavvys", 
             "evidcis", "datevidcis", "kododdokb", "hranicaod", "hranicado", 
             "pracovisko", "tlacskup", "kodlab", "priznak", "opakovane", "znacka", "extlabodoslane","priznak2", "makro") 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const sqlPraPom = `INSERT INTO "nis"."ziad_okb_pra_pom" 
            ("evidcis", "datevidcis", "kodvys", "stavvys", "kodzar", "kododd", 
             "hranicaod", "hranicado", "pracovisko", "tlacskup", "kodlab", 
             "priznak", "opakovane", "znacka", "pridanecas") 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, Now())`;

        const sqlVys = `SELECT kodzar, kodotecvys FROM "nis"."c_okb_vys" WHERE kodvys = ? AND kodlab = ?`;

        for (const test of testCodes) {
            const code = test.code;
            const origin = test.origin; // null або код макросу
            // Отримуємо межі з c_okb_hranice
            const hraniceSql = `SELECT muzod, muzdo, zenaod, zenado FROM "nis"."c_okb_hranice" WHERE kodvys = ? AND dniod <= ? AND dnido >= ? AND kodlab = ?`;
            const hraniceResult = await connection.query(hraniceSql, [code, registrationData.daysFromBirth, registrationData.daysFromBirth, registrationData.labCode]);

            let config = { min: null, max: null };

            if (hraniceResult.length > 0) {
                const hraniceData = hraniceResult[0];
                if (registrationData.pohlavie === 'M') {
                    config = { min: hraniceData.muzod, max: hraniceData.muzdo };
                } else if (registrationData.pohlavie === 'F') {
                    config = { min: hraniceData.zenaod, max: hraniceData.zenado };
                }
                console.log(`Знайдено межі для коду ${code}: min=${config.min}, max=${config.max}`);
            } else {
                console.log(`Межі для коду ${code} не знайдено в c_okb_hranice, використовуються стандартні.`);
                config = TEST_CONFIG[code] || { min: null, max: null };
            }

            // Отримуємо kodzar та tlacskup (kodotecvys) з c_okb_vys
            const vysResult = await connection.query(sqlVys, [code, registrationData.labCode]);
            let kodzarValue = code; // За замовчуванням використовуємо kodvys
            let tlacskupValue; // Значення за замовчуванням для tlacskup

            if (vysResult.length > 0) {
                const vysData = vysResult[0];
                if (vysData.kodzar !== null) {
                    kodzarValue = vysData.kodzar;
                    console.log(`Для коду ${code} знайдено kodzar=${kodzarValue} в c_okb_vys.`);
                }
                if (vysData.kodotecvys !== null) {
                    tlacskupValue = vysData.kodotecvys;
                    console.log(`Для коду ${code} знайдено tlacskup(kodotecvys)=${tlacskupValue} в c_okb_vys.`);
                }
            }

            // 4.1 ziad_okb_pom
            await connection.query(sqlPom, [
                registrationData.kododd,
                registrationData.rodcis,
                newPorCis,      // Generated ID
                registrationData.datodberu, code, 1,
                newEvidCis,     // Generated ID
                registrationData.datevidcis, registrationData.pobytKodOddOkb, config.min, config.max,
                1, tlacskupValue, registrationData.labCode, '0', 1, 1, null, '1111000000', origin
            ]);

            // 4.2 ziad_okb_pra_pom
            await connection.query(sqlPraPom, [
                newEvidCis,     // Generated ID
                registrationData.datevidcis, code, 1, kodzarValue, '00001',
                config.min, config.max, 1, tlacskupValue, registrationData.labCode,
                '0', 1, '1100000000'
            ]);
        }

        // ---------------------------------------------------------
        // КРОК 4.5: Вставка в ZIAD_OKB_POUZITE_MAKRO (макроси)
        // ---------------------------------------------------------
        if (registrationData.macros && Array.isArray(registrationData.macros) && registrationData.macros.length > 0) {
            console.log("--> Додавання макросів...");
            const sqlMacro = `INSERT INTO "nis"."ziad_okb_pouzite_makro" ("kodlab", "kodmakra", "datevidcis", "evidcis") VALUES (?, ?, ?, ?)`;
            for (const macroCode of registrationData.macros) {
                await connection.query(sqlMacro, [
                    registrationData.labCode,
                    macroCode,
                    registrationData.datevidcis,
                    newEvidCis
                ]);
                console.log(`   - Макрос ${macroCode} додано.`);
            }
        }

        // ---------------------------------------------------------
        // КРОК 5: Перевірка та створення запису про оплату
        // ---------------------------------------------------------
        console.log("--> Перевірка наявності оплати...");
        const checkPaymentSql = `SELECT COUNT(*) as payment_count FROM "nis"."pokladnicny_doklad" WHERE kododd = ? AND labdatevidcis = ? AND labevidcis = ? AND typdokladu = 'P'`;
        const paymentResult = await connection.query(checkPaymentSql, [
            registrationData.kododd,
            registrationData.datevidcis,
            newEvidCis
        ]);

        const paymentCount = paymentResult[0].payment_count;
        console.log(`   - Знайдено записів про оплату: ${paymentCount}`);

        if (paymentCount === 0) {
            console.log("--> Оплата не знайдена, створюємо запис про оплату...");
            // TODO: Додати сюди SQL-запит для вставки запису про оплату, коли він буде готовий.
            // const createPaymentSql = `INSERT INTO "nis"."pokladnicny_doklad" (...) VALUES (...)`;
            // await connection.query(createPaymentSql, [...]);
        }

        // ---------------------------------------------------------
        // КРОК 5.1: Перевірка та створення рахунку-фактури (dodaci_list)
        // ---------------------------------------------------------
        console.log("--> Перевірка наявності рахунку-фактури...");
        const checkInvoiceSql = `SELECT COUNT(*) as invoice_count FROM "nis"."dodaci_list" WHERE kododd = ? AND labdatevidcis = ? AND labevidcis = ? AND typdokladu = 'F'`;
        const invoiceResult = await connection.query(checkInvoiceSql, [
            registrationData.targetKodOdd,
            registrationData.datevidcis,
            newEvidCis
        ]);

        const invoiceCount = invoiceResult[0].invoice_count;
        console.log(`   - Знайдено рахунків-фактур: ${invoiceCount}`);

        if (registrationData.invoiceType === 'F') {
            if (invoiceCount === 0) {
                console.log("--> Рахунок-фактура не знайдений, створюємо новий...");

                const documentDate = new Date(registrationData.datprijmu); // Використовуємо datprijmu для отримання часу
                const formattedDocumentDate = formatDateForSQL(documentDate);
                const docYear = documentDate.getFullYear();
                const docMonth = documentDate.getMonth() + 1;
                const kodOddForInvoice = registrationData.targetKodOdd;

                const { newDokladID, maxDate } = await generateDocumentId(connection, 'DODACI_LIST', kodOddForInvoice, documentDate);

                const prevBalanceRes = await connection.query(`SELECT StavKontaPo FROM dodaci_list WHERE KodOdd = ? AND Datum = ? AND DokladID = ?`, [registrationData.targetKodOdd, maxDate, maxDokladID]);
                const previousBalance = (prevBalanceRes.length > 0 && prevBalanceRes[0].StavKontaPo) ? parseFloat(prevBalanceRes[0].StavKontaPo) : 0;
                console.log(`   - Попередній баланс: ${previousBalance}`);

                const { invoiceItems, totalSumWithoutDiscount, discountPercent, finalSum } = await calculateInvoiceDetails(connection, registrationData, newEvidCis);
                const newBalance = previousBalance + finalSum;

                const now = new Date();
                const day = String(now.getDate()).padStart(2, '0');
                const month = String(now.getMonth() + 1).padStart(2, '0'); // Місяці починаються з 0
                const year = now.getFullYear();
                const cislodennikDate = `${day}.${month}.${year}`;

                const formattedDokladID = String(newDokladID).padStart(4, '0');
                const formattedDocMonth = String(docMonth).padStart(2, '0');
                const newCisloDokladu = `F ${formattedDokladID}/00001/${formattedDocMonth}/${docYear}`;

                const pacFullName = await getPatientFullName(connection, registrationData.rodcis);

                const insertDodaciListSql = `
                   INSERT INTO "nis"."DODACI_LIST" 
                   ( kododd, rok, mesiac, dokladid, oscis, cislodokladu, datum, rodcis, 
                    stavkontapred, stavkontapo, prijateod, ico, dic, op, ucel, schvalil, 
                    cislodennik, suma, typdokladu, inkasoval, cenabezzlavy, zlavapercento, 
                    cisloblocku, labdatevidcis, labevidcis) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                await connection.query(insertDodaciListSql, [ // 25 параметрів


                    kodOddForInvoice, // 1 kododd
                    docYear,                   // 2 rok
                    docMonth,                  // 3 mesiac
                    newDokladID,               // 4 dokladid
                    Number(registrationData.oscis),    // 5 oscis 
                    newCisloDokladu,           // 6 cislodokladu
                    formattedDocumentDate,     // 7 datum
                    registrationData.rodcis,   // 8 rodcis
                    previousBalance,           // 9 stavkontapred
                    newBalance,                // 10 stavkontapo
                    pacFullName,               // 11 prijateod
                    '',                        // 12 ico
                    '',                        // 13 dic
                    '',                        // 14 op
                    'Послуги пов"язані з охороною здоров"я', // 15 ucel
                    '',                        // 16 schvalil
                    cislodennikDate,           // 17 cislodennik
                    finalSum,                  // 18 suma
                    'F',                       // 19 typdokladu
                    null,                      // 20 inkasoval
                    totalSumWithoutDiscount,   // 21 cenabezzlavy
                    discountPercent,           // 22 zlavapercento
                    '',                        // 23 cisloblocku
                    registrationData.datevidcis, // 24 labdatevidcis
                    newEvidCis                 // 25 labevidcis

                ]);
                console.log(`   - Шапку рахунку-фактури (DokladID: ${newDokladID}) створено.`);

                // Етап 4: Запис "деталей" документа
                const insertDetailsSql = `
                   INSERT INTO "nis"."pokladnicny_doklad_lab_podrobnosti" 
                   (KodOdd, Rok, Mesiac, DokladID, polozkaid, polozka, polozkanazov, pocet, cena, zlava) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                let polozkaIdCounter = 0;
                for (const item of invoiceItems) {
                    polozkaIdCounter++;
                    const itemPriceWithDiscount = item.price - (item.price * discountPercent / 100);
                    const itemDiscountAmount = item.price - itemPriceWithDiscount;
                    await connection.query(insertDetailsSql, [
                        registrationData.targetKodOdd, docYear, docMonth, newDokladID,
                        polozkaIdCounter, item.isMacro ? `M${item.code}` : item.code, item.name, 1, itemPriceWithDiscount, itemDiscountAmount
                    ]);
                }
                console.log(`   - Додано ${invoiceItems.length} позицій до рахунку-фактури.`);
            }
        } else if (registrationData.invoiceType === 'D') {
            console.log("--> Створення прибуткового ордера типу 'D'...");

            // Логіка для типу 'D'
            const documentDate = new Date(registrationData.datprijmu); // Використовуємо datprijmu для отримання часу
            const formattedDocumentDate = formatDateForSQL(documentDate);
            const docYear = documentDate.getFullYear();
            const docMonth = documentDate.getMonth() + 1;
            const kodOddForInvoice = registrationData.kododd;

            const { newDokladID, maxDate } = await generateDocumentId(connection, 'DODACI_LIST', kodOddForInvoice, documentDate);

            const prevBalanceRes = await connection.query(`SELECT StavKontaPo FROM dodaci_list WHERE KodOdd = ? AND Datum = ? AND DokladID = ?`, [kodOddForInvoice, maxDate, newDokladID - 1]);
            const previousBalance = (prevBalanceRes.length > 0 && prevBalanceRes[0].StavKontaPo) ? parseFloat(prevBalanceRes[0].StavKontaPo) : 0;
            console.log(`   - Попередній баланс для типу 'D': ${previousBalance}`);

            const { invoiceItems, totalSumWithoutDiscount, discountPercent, finalSum } = await calculateInvoiceDetails(connection, registrationData, newEvidCis);
            const newBalance = previousBalance + finalSum;

            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            const cislodennikDate = `${day}.${month}.${year}`;

            const formattedDokladID = String(newDokladID).padStart(4, '0');
            const formattedDocMonth = String(docMonth).padStart(2, '0');
            const newCisloDokladu = `D ${formattedDokladID}/${kodOddForInvoice}/${formattedDocMonth}/${docYear}`;

            const pacFullName = await getPatientFullName(connection, registrationData.rodcis);

            const insertDodaciListSql = `
               INSERT INTO "nis"."DODACI_LIST" 
               ( kododd, rok, mesiac, dokladid, oscis, cislodokladu, datum, rodcis, 
                stavkontapred, stavkontapo, prijateod, ico, dic, op, ucel, schvalil, 
                cislodennik, suma, typdokladu, inkasoval, cenabezzlavy, zlavapercento, 
                cisloblocku, labdatevidcis, labevidcis) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            await connection.query(insertDodaciListSql, [
                kodOddForInvoice,          // 1 kododd
                docYear,                   // 2 rok
                docMonth,                  // 3 mesiac
                newDokladID,               // 4 dokladid
                Number(registrationData.oscis),    // 5 oscis 
                newCisloDokladu,           // 6 cislodokladu
                formattedDocumentDate,     // 7 datum
                registrationData.rodcis,   // 8 rodcis
                previousBalance,           // 9 stavkontapred
                newBalance,                // 10 stavkontapo
                pacFullName,               // 11 prijateod
                '',                        // 12 ico
                '',                        // 13 dic
                '',                        // 14 op
                'Послуги пов"язані з охороною здоров"я', // 15 ucel
                '',                        // 16 schvalil
                cislodennikDate,           // 17 cislodennik
                finalSum,                  // 18 suma
                'D',                       // 19 typdokladu (змінено на 'D')
                null,                      // 20 inkasoval
                totalSumWithoutDiscount,   // 21 cenabezzlavy
                discountPercent,           // 22 zlavapercento
                '',                        // 23 cisloblocku
                registrationData.datevidcis, // 24 labdatevidcis
                newEvidCis                 // 25 labevidcis
            ]);
            console.log(`   - Шапку рахунку типу 'D' (DokladID: ${newDokladID}) створено.`);

            // Етап 4: Запис "деталей" документа
            const insertDetailsSql = `
               INSERT INTO "nis"."pokladnicny_doklad_lab_podrobnosti" 
               (KodOdd, Rok, Mesiac, DokladID, polozkaid, polozka, polozkanazov, pocet, cena, zlava) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            let polozkaIdCounter = 0;
            for (const item of invoiceItems) {
                polozkaIdCounter++;
               // const itemPriceWithDiscount = item.price - (item.price * discountPercent / 100);
               // const itemDiscountAmount = item.price - itemPriceWithDiscount;
                await connection.query(insertDetailsSql, [
                    kodOddForInvoice, docYear, docMonth, newDokladID,
                    polozkaIdCounter, item.isMacro ? `M${item.code}` : item.code, item.name, 1, item.price, discountPercent
                ]);
            }
            console.log(`   - Додано ${invoiceItems.length} позицій до рахунку типу 'D'.`);
        } else if (registrationData.invoiceType === 'P') {
            console.log("--> Створення касового ордера типу 'P'...");

            const documentDate = new Date(registrationData.datprijmu);
            const formattedDocumentDate = formatDateForSQL(documentDate);
            const docYear = documentDate.getFullYear();
            const docMonth = documentDate.getMonth() + 1;
            const kodOddForInvoice = registrationData.targetKodOdd;

            const { newDokladID, maxDate } = await generateDocumentId(connection, '"nis"."pokladnicny_doklad"', kodOddForInvoice, documentDate);

            const prevBalanceRes = await connection.query(`SELECT StavKontaPo FROM "nis"."pokladnicny_doklad" WHERE KodOdd = ? AND Datum = ? AND DokladID = ?`, [kodOddForInvoice, maxDate, newDokladID - 1]);
            const previousBalance = (prevBalanceRes.length > 0 && prevBalanceRes[0].StavKontaPo) ? parseFloat(prevBalanceRes[0].StavKontaPo) : 0;
            console.log(`   - Попередній баланс для типу 'P': ${previousBalance}`);

            const { invoiceItems, totalSumWithoutDiscount, discountPercent, finalSum } = await calculateInvoiceDetails(connection, registrationData, newEvidCis);
            const newBalance = previousBalance + finalSum;

            const formattedDokladID = String(newDokladID).padStart(4, '0');
            const formattedDocMonth = String(docMonth).padStart(2, '0');
            const newCisloDokladu = `P ${formattedDokladID}/${kodOddForInvoice}/${formattedDocMonth}/${docYear}`;

            const pacFullName = await getPatientFullName(connection, registrationData.rodcis);

            const insertPaymentSql = `
               INSERT INTO "nis"."pokladnicny_doklad" 
               ("kododd", "rok", "mesiac", "dokladid", "oscis", "cislodokladu", "datum", "rodcis", 
                "stavkontapred", "stavkontapo", "prijateod", "ico", "dic", "op", "ucel", "schvalil", 
                "cislodennik", "suma", "uzavierka", "typdokladu", "icdph", "inkasoval", "cisloblocku", 
                "zlavapercento", "cenabezzlavy", "labdatevidcis", "labevidcis", "tlacene") 
               VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            await connection.query(insertPaymentSql, [
                kodOddForInvoice, docYear, docMonth, newDokladID, registrationData.oscis,
                newCisloDokladu, formattedDocumentDate, registrationData.rodcis, previousBalance, newBalance,
                pacFullName, ' ', ' ', ' ', 'Послуги пов"язані з охороною здоров"я', ' ', ' ', finalSum, null,
                'P', ' ', null, '', discountPercent, totalSumWithoutDiscount, registrationData.datevidcis,
                newEvidCis, null
            ]);

            console.log(`   - Створено касовий ордер типу 'P' (DokladID: ${newDokladID}).`);

            const insertDetailsSql = `
               INSERT INTO "nis"."pokladnicny_doklad_lab_podrobnosti" 
               (kododd, rok, mesiac, dokladid, polozkaid, polozka, polozkanazov, pocet, cena, zlava) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            let polozkaIdCounter = 0;
            for (const item of invoiceItems) {
                polozkaIdCounter++;
                const itemPriceWithDiscount = item.price - (item.price * discountPercent / 100);
               
                await connection.query(insertDetailsSql, [
                    kodOddForInvoice, docYear, docMonth, newDokladID,
                    
                    polozkaIdCounter, item.isMacro ? `M${item.code}` : item.code, item.name, 1, item.price  , registrationData.discont
                ]);
            }
            console.log(`   - Додано ${invoiceItems.length} позицій до касового ордера.`);
        }

        // 6. Фіксація змін
        await connection.commit();
        console.log("--> УСПІХ! Дані збережено.");

        return { success: true, evidcis: newEvidCis, porcispobyt: newPorCis };

    } catch (error) {
        console.error("!!! ПОМИЛКА. Виконуємо ROLLBACK !!!");
        console.error(error);
        if (connection) {
            try {
                await connection.rollback();
            } catch (rbError) {
                console.error("Помилка при rollback:", rbError);
            }
        }
        return { success: false, error: error.message };
    } finally {
        if (connection) {
            await connection.close();
            console.log("--> З'єднання закрито.");
        }
    }
}

/*
// === Приклад використання ===

const registrationData = {
    rodcis: '0600065070',
    pobytKodOddOkb: '255',
    kododd: '',
    datodberu: '2025-12-15 10:07:10.000',
    datprijmu: '2025-12-15 10:08:20.768',
    datevidcis: '2025-12-15 00:00:00.000',
    labCode: '00001',
    targetKodOdd: '00001',
    oscis: '90',
    osciskon: null,
    rok: 2025,
    roknarod: null,
    typziad: 'B',
    pohlavie: 'F',
    macros: ['02', '07'],
    discont: 20,
    invoiceType: 'P' // 'F' для фактури, 'D' для прибуткового ордера ,  'P'  готівка
};

// Нова структура для `codes`
const codes = [
    { code: 7, origin: null },
    { code: 31, origin: '02' },
    { code: 33, origin: '02' },
    { code: 35, origin: '02' },
    { code: 47, origin: '07' },
    { code: 48, origin: '07' },
    { code: 50, origin: '07' },
    { code: 51, origin: '07' },
    { code: 62, origin: '07' },
    { code: 66, origin: '07' },
    { code: 67, origin: '07' },
    { code: 68, origin: '07' },
    { code: 70, origin: '07' },
    { code: 83, origin: '07' },
    { code: 91, origin: '07' }
    // ... і так далі для решти кодів
];

registerLabRequest(registrationData, codes);
*/