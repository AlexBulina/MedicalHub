/**
 * @file database_repository.js
 * @description Шар доступу до даних (DAL) для роботи з різними БД.
 * Інкапсулює логіку SQL-запитів та вибір відповідного драйвера БД.
 */

import { runOracleQuery } from './oracledb_connection.js';
import { runSybaseQuery } from './sybase_connection.js';
import { runMongoOperation } from './mongodb_connection.js'; // <-- ІМПОРТУЄМО НОВИЙ МОДУЛЬ

/**
 * @description Виконує запит, автоматично обираючи драйвер на основі конфігурації.
 * @param {string} query - SQL-запит.
 * @param {object} dbConfig - Об'єкт конфігурації БД з `BRANCHES`.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function executeQuery(query, dbConfig, binds = []) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType === 'oracle') {
        // Для Oracle потрібен об'єкт конфігурації, а не DSN
        return runOracleQuery(dbConfig, query, binds);
    } else if (dbType === 'mongodb') { // Цей блок тепер не буде використовуватись напряму
        // Операції MongoDB викликаються через runMongoOperation, а не executeQuery.
        // Ця заглушка залишається для сумісності, якщо десь залишився старий виклик.
        console.warn(" застарілий виклик executeQuery для MongoDB. Переведіть логіку на runMongoOperation.");
        return Promise.resolve([]);
    }
    // Для Sybase передаємо DSN
    return runSybaseQuery(dbConfig.dsn, query);
}

/**
 * @description Перевіряє існування унікального коду в базі даних.
 * @param {string} code - Код для перевірки.
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<boolean>}
 */
export async function checkCodeExists(code, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType === 'mongodb') {
        const result = await runMongoOperation(dbConfig, 'C_MESSAGES_JOURNAL', 'findOne', {
            query: { ID: code }
        });
        return !!result; // Поверне true, якщо документ знайдено, інакше false
    } else {
        let query;
        if (dbType === 'oracle') {
            query = `SELECT ID FROM C_MESSAGES_JOURNAL WHERE ID = '${code}'`;
        } else { // Sybase
            query = `SELECT number FROM UniqueRandomNumbersV2 WHERE number = '${code}'`;
        }
        const result = await executeQuery(query, dbConfig);
        return !!(result && result.length > 0);
    }
}

/**
 * @description Зберігає унікальний ID та пов'язану інформацію в базу даних.
 * @param {object} params - Параметри для збереження.
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<boolean>}
 */
export async function saveUniqueId(params, dbConfig) {
    const { uniqId, patientName = '', phoneNumber = '', smsStatus = '', department = '', smsStatusCode = null, messageId = null } = params;
    const dbType = dbConfig.type || 'sybase';

    if (dbType === 'mongodb') {
        const document = {
            ID: uniqId,
            created_at: new Date(),
            patient: patientName,
            tel: phoneNumber,
            department: department,
            turbo_sms_status: smsStatus,
            turbo_sms_status_code: smsStatusCode,
            turbo_sms_message_Id: messageId,
            turbo_sms_delivery_status: null
        };
        const result = await runMongoOperation(dbConfig, 'C_MESSAGES_JOURNAL', 'insertOne', { document });
        return result && result.acknowledged;
    } else {
        let query;
        const finalSmsStatusCode = smsStatusCode === null ? 'NULL' : smsStatusCode;
        const finalMessageId = messageId === null ? 'NULL' : `'${messageId}'`;

        if (dbType === 'oracle') {
            query = `
                INSERT INTO C_MESSAGES_JOURNAL (ID, created_at, patient, tel, department, turbo_sms_status, turbo_sms_status_code, turbo_sms_message_Id, turbo_sms_delivery_status)
                VALUES ('${uniqId}', SYSTIMESTAMP, '${patientName}', '${phoneNumber}', '${department}', '${smsStatus}', ${finalSmsStatusCode}, ${finalMessageId}, NULL)
            `;
        } else { // Sybase
            query = `
                INSERT INTO UniqueRandomNumbersV2 (number, created_at, patientName, phoneNumber, smsStatus, department, smsStatusCode, messageId, deliveryStatus)
                VALUES ('${uniqId}', CURRENT TIMESTAMP, '${patientName}', '${phoneNumber}', '${smsStatus}', '${department}', ${finalSmsStatusCode}, ${finalMessageId}, NULL)
            `;
        }
        const result = await executeQuery(query, dbConfig);
        return result !== undefined;
    }
}

/**
 * @description Створює нового пацієнта в базі даних.
 * @param {object} params - Дані пацієнта.
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function createPatient({ firstName, lastName, dob, phone, gender }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType === 'mongodb') {
        const existingPatient = await runMongoOperation(dbConfig, 'pacients', 'findOne', {
            query: { meno: firstName, priezvisko: lastName, datumnarod: new Date(dob) }
        });

        if (existingPatient) {
            return [{ status: 'Patient already exists' }]; // Українською: "Пацієнт вже існує"
        }

        const formattedGender = gender === 'male' ? 'M' : (gender === 'female' ? 'F' : gender);

        const newPatient = {
            meno: firstName,
            priezvisko: lastName,
            datumnarod: new Date(dob),
            tel: phone,
            pohlavie: formattedGender,
            createdAt: new Date()
            // rodcis генерується автоматично в MongoDB як _id
        };
        const result = await runMongoOperation(dbConfig, 'pacients', 'insertOne', { document: newPatient });
        return [{ status: 'Patient created', rodcis: result.insertedId.toString() }]; // Українською: "Пацієнта створено"
    } else {
        let query;
        if (dbType === 'oracle') {
            // Oracle процедура очікує кириличні значення 'ч' або 'ж'
            const formattedGender = gender === 'male' ? 'ч' : (gender === 'female' ? 'ж' : gender);

            // Тимчасова конфігурація для підключення до тестової бази даних Oracle
            //  const tempDbConfig = {
            //     type: 'oracle',
            //     user: 'onelab_dev',
            //      password: 'color',
            //      connectString: '10.0.0.10:1521/nuni'
            //   };

            // Викликаємо збережену процедуру для створення пацієнта
            query = `
                BEGIN
                    create_patient_by_medical_hub(p_first_name => :p_first_name,
                                                 p_last_name  => :p_last_name,
                                                 p_dob        => TO_DATE(:p_dob, 'YYYY-MM-DD'),
                                                 p_tel        => :p_tel,
                                                 p_sex        => :p_sex);
                END;`;
            const binds = { p_first_name: firstName, p_last_name: lastName, p_dob: dob, p_tel: phone, p_sex: formattedGender };
            const result = await executeQuery(query, dbConfig, binds);
            // Якщо процедура виконалась без помилок, повертаємо успішний статус.
            // Обробка помилок (напр., дублікат пацієнта) має бути реалізована в самій процедурі.
            if (result !== undefined) {
                return [{ status: 'Patient created' }];
            }
            // Якщо executeQuery повернув undefined, це означає, що сталася помилка на рівні БД.
            // Помилка буде оброблена в блоці catch у KT_BackendNew.js
            return undefined;
        } else { // Sybase
            // Sybase очікує латинські значення 'M' або 'F'
            const formattedGender = gender === 'male' ? 'M' : (gender === 'female' ? 'F' : gender);

            query = `
                DECLARE @new_rodcis CHAR(10)
                SELECT @new_rodcis = RIGHT('0000000000' || CAST(CAST(MAX(rodcis) AS INT) + 1 AS VARCHAR(10)), 10)
                FROM nis.c_pacient

                IF NOT EXISTS (
                    SELECT 1 FROM nis.c_pacient
                    WHERE meno = '${firstName}' AND priezvisko = '${lastName}' AND datumnarod = '${dob}'
                )
                BEGIN
                    INSERT INTO nis.c_pacient (rodcis, titulza, datumnarod, platnostod, platnostdo, meno, priezvisko, rodena, tituly, pohlavie, priznak1, priznak2, priznak3, kodpoist, evidcis, cudzinec, stat, cislo, formular, ehic)
                    VALUES (@new_rodcis, '', '${dob}', NULL, NULL, '${firstName}', '${lastName}', '', '', '${formattedGender}', NULL, NULL, NULL, '0000', @new_rodcis, NULL, NULL, NULL, NULL, NULL);

                    INSERT INTO nis.pac_dem (rodcis, ulica, mesto, psc, kodstatu, tel, stav, cop, oscis, kodobec, kodokres, rodisko, poznamka1, email)
                    VALUES (@new_rodcis, '', '', '', '', '${phone}', '', '', 8, NULL, NULL, '', '', NULL);
                    
                    SELECT 'Patient created' as status, @new_rodcis as rodcis;
                END
                ELSE
                BEGIN
                    SELECT 'Patient already exists' AS status;
                END
            `;
        }
        return executeQuery(query, dbConfig); // Цей виклик для Sybase
    }
}

/**
 * @description Оновлює номер телефону пацієнта.
 * @param {object} params - Дані для оновлення.
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function updatePatientPhone({ phone, rodcisActual }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType === 'mongodb') {
        // В MongoDB _id є незмінним, тому ми шукаємо за іншими полями або оновлюємо по _id
        // Припускаємо, що rodcisActual - це _id з MongoDB
        const { ObjectId } = await import('mongodb');
        const result = await runMongoOperation(dbConfig, 'pacients', 'updateOne', { // Використовуємо правильну назву колекції
            filter: { _id: new ObjectId(rodcisActual) },
            update: { $set: { tel: phone } }
        });
        return result;
    } else {
        let query;
        if (dbType === 'oracle') {
            query = `MERGE INTO pac_dem dem USING (SELECT '${rodcisActual}' as rodcis FROM dual) src ON (dem.rodcis = src.rodcis) WHEN MATCHED THEN UPDATE SET dem.tel = '${phone}' WHEN NOT MATCHED THEN INSERT (rodcis, tel) VALUES ('${rodcisActual}', '${phone}')`;
        } else { // Sybase
            query = `MERGE INTO pac_dem AS pc USING (SELECT '${rodcisActual}' AS rodcis, '${phone}' AS tel) AS source ON (pc.rodcis = source.rodcis) WHEN MATCHED THEN UPDATE SET pc.tel = source.tel WHEN NOT MATCHED THEN INSERT (rodcis, tel) VALUES (source.rodcis, source.tel)`;
        }
        return executeQuery(query, dbConfig);
    }
}

/**
 * @description Пошук пацієнтів з пагінацією.
 * @param {object} params - Параметри пошуку.
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<{results: Array<object>, total: number}>}
 */
export async function searchPatients({ lastName, firstName, limit, offset }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    // --- Універсальна функція для видалення дублікатів ---
    // Перенесено на початок, щоб уникнути помилок ReferenceError.
    const getUniqueResults = (patientList) => {
        if (!patientList) {
            return [];
        }
        const uniquePatients = [];
        const seen = new Set();
        for (const patient of patientList) {
            // Створюємо унікальний ключ (ПІБ + дата народження + телефон + стать)
            const key = `${patient.priezvisko?.toLowerCase()}|${patient.meno?.toLowerCase()}|${patient.datumnarod}|${patient.tel || ''}|${patient.pohlavie?.toLowerCase()}`;
            if (!seen.has(key)) {
                // Якщо ім'я (meno) є null, замінюємо його на порожній рядок
                if (patient.meno === null) {
                    patient.meno = '';
                }
                seen.add(key);
                uniquePatients.push(patient);
            }
        }
        return uniquePatients;
    };

    if (dbType === 'mongodb') {
        console.log(`[DB] Пошук пацієнтів в MongoDB. Прізвище: ${lastName}, Ім'я: ${firstName}`);

        const query = {
            priezvisko: { $regex: `^${lastName}`, $options: 'i' } // Виправлено поле на `priezvisko`
        };
        if (firstName) {
            query.meno = { $regex: `^${firstName}`, $options: 'i' }; // Виправлено поле на `meno`
        }

        const total = await runMongoOperation(dbConfig, 'pacients', 'countDocuments', { query });
        const results = await runMongoOperation(dbConfig, 'pacients', 'find', {
            query,
            options: {
                limit,
                skip: offset,
                sort: { priezvisko: 1, meno: 1 }, // Виправлено поля для сортування
                projection: { _id: 1, priezvisko: 1, meno: 1, datumnarod: 1, tel: 1, pohlavie: 1 } // Виправлено поля для вибірки
            }
        });

        // Адаптуємо результат до очікуваного формату
        const formattedResults = results.map(p => ({
            rodcis: p._id.toString(),
            priezvisko: p.priezvisko,
            meno: p.meno,
            datumnarod: new Date(p.datumnarod).toISOString().split('T')[0],
            tel: p.tel,
            pohlavie: p.pohlavie
        }));

        return { results: formattedResults, total };
    } else {
        console.log(`[DB] Пошук пацієнтів в ${dbType}. Прізвище: ${lastName}, Ім'я: ${firstName}`);

        let countQuery, dataQuery;
        if (dbType === 'oracle') {
            const whereClause = `WHERE lower("Повна назва") like lower('${lastName}%${firstName || ''}%')`;
            countQuery = `SELECT COUNT(*) as total FROM "#ПАЦІЄНТИ" p ${whereClause}`;
            dataQuery = `
                SELECT p.idobject rodcis, getfirstname(p."Повна назва") priezvisko, getlastname(p."Повна назва") meno, 
                       to_char(p."Дата народження", 'YYYY-MM-DD') datumnarod, correctphonenumber(nvl(c."Тел.1", c."Тел.2")) tel, p."Стать" pohlavie 
                FROM "#ПАЦІЄНТИ" p LEFT JOIN "#КОНТАКТНІ ДАНІ" c ON p."Контактні дані" = c.idobject
                ${whereClause} ORDER BY p."Повна назва"
                OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
            `;
        } else { // Sybase
            const whereClause = `WHERE priezvisko = '${lastName}' AND meno LIKE '%${firstName || ''}%'`;
            countQuery = `SELECT COUNT(*) as total FROM c_pacient pac ${whereClause}`;
            const sybaseOffset = offset + 1;
            dataQuery = `
                SELECT TOP ${limit} START AT ${sybaseOffset}
                       pac.rodcis, priezvisko, meno, datumnarod, dem.tel, pohlavie 
                FROM c_pacient pac LEFT JOIN pac_dem dem ON pac.rodcis = dem.rodcis
                ${whereClause} ORDER BY priezvisko, meno
            `;
        }

        // Ця частина залишається спільною для SQL баз
        const countResult = await executeQuery(countQuery, dbConfig);
        const total = countResult?.[0]?.total || 0;
        const results = await executeQuery(dataQuery, dbConfig);
        return { results: getUniqueResults(results || []), total };
    }
}

/**
 * @description Пошук обстеження за номером документа (тільки для Oracle).
 * @param {string} docNumber - Номер документа.
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function searchByDocumentNumber(docNumber, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType === 'mongodb') {
        // Пошук по номеру документа для MongoDB потребує знати структуру даних
        return []; // Повертаємо порожній масив як заглушку
    } else if (dbType !== 'oracle') {
        console.warn('Search by document number is only supported for Oracle DB.');
        return []; // Повертаємо порожній масив, оскільки функція тільки для Oracle
    }

    const query = `
        select "Web-code" web_code,
               st."Назва" status,
               getfirstname(pat."Повна назва") priezvisko,
               getlastname(pat."Повна назва") meno,
               correctphonenumber(nvl(contacts."Тел.1", contacts."Тел.2")) tel,
               to_char(pat."Дата народження", 'YYYY-MM-DD') datumnarod,
               pat."Стать" pohlavie,
               pat.idobject rodcis,
               to_char(exams.docdate, 'dd.mm.yyyy') register_date,
               to_char(exams."Дата підтвердження", 'dd.mm.yyyy') || ' ' || exams."Час підтвердження" confirmation_datetime
        from "#ОБСТЕЖЕННЯ" exams,
             "#СТАТУСИ" st,
             "#ПАЦІЄНТИ" pat,
             "#КОНТАКТНІ ДАНІ" contacts
        where exams.docnum = '${docNumber}'
          and exams."Статус" = st.idobject
          and exams."Пацієнт" = pat.idobject
          and pat."Контактні дані" = contacts.idobject(+)
    `;

    return executeQuery(query, dbConfig);
}

/**
 * @description Отримання журналу відправок за датою.
 * @param {object} params - Параметри запиту.
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function getJournalByDate({ date, depId }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType === 'mongodb') {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        const results = await runMongoOperation(dbConfig, 'C_MESSAGES_JOURNAL', 'find', {
            query: {
                created_at: { $gte: startDate, $lte: endDate },
                department: { $regex: `^${depId}$`, $options: 'i' }
            },
            options: {
                sort: { created_at: -1 },
                limit: 200
            }
        });
        // Адаптуємо результат до очікуваного формату
        return results.map(r => ({
            webcode: r.ID, // `webcode` використовується на фронтенді
            createdAt: r.created_at, // `createdAt` використовується на фронтенді
            patientName: r.patient, // Уніфіковано до camelCase
            phoneNumber: r.tel, // Уніфіковано до camelCase
            smsStatus: r.turbo_sms_status, // `smsStatus` використовується на фронтенді
            department: r.department,
            smsStatusCode: r.turbo_sms_status_code, // Уніфіковано до camelCase
            deliveryStatus: r.turbo_sms_delivery_status // Уніфіковано до camelCase
        }));
    } else {
        let query;
        if (dbType === 'oracle') {
            query = `
                SELECT ID as webcode, created_at, patient as patient_name, tel as phone_number, 
                       turbo_sms_status as sms_status, department, turbo_sms_status_code as sms_status_code, 
                       turbo_sms_delivery_status as delivery_status 
                FROM C_MESSAGES_JOURNAL 
                WHERE TRUNC(created_at) = TO_DATE('${date}', 'YYYY-MM-DD') AND LOWER(department) = LOWER('${depId}')
                ORDER BY created_at DESC FETCH FIRST 200 ROWS ONLY
            `;
        } else { // Sybase
            query = `
                SELECT TOP 200 number as webcode, created_at, patientName, phoneNumber, smsStatus, department, smsStatusCode, deliveryStatus 
                FROM UniqueRandomNumbersV2 
                WHERE CAST(created_at AS DATE) = '${date}' AND department = '${depId}'
                ORDER BY created_at DESC
            `;
        }
        return executeQuery(query, dbConfig);
    }
}

/**
 * @description Пошук у журналі відправок.
 * @param {object} params - Параметри пошуку.
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function searchJournal({ term, depId, onlySuccessful }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType === 'mongodb') {
        const searchRegex = { $regex: term, $options: 'i' };
        const query = {
            $or: [
                { patient: searchRegex },
                { tel: searchRegex },
                { ID: searchRegex }
            ]
        };

        if (depId && depId !== 'undefined') {
            query.department = { $regex: `^${depId}$`, $options: 'i' };
        }

        if (onlySuccessful) {
            query.turbo_sms_status_code = 801;
        }

        const results = await runMongoOperation(dbConfig, 'C_MESSAGES_JOURNAL', 'find', {
            query,
            options: {
                sort: { created_at: -1 },
                limit: 50
            }
        });
        // Адаптуємо результат до очікуваного формату, як і в getJournalByDate
        return results.map(r => ({
            webcode: r.ID,
            createdAt: r.created_at,
            patientName: r.patient,
            phoneNumber: r.tel,
            smsStatus: r.turbo_sms_status,
            smsStatusCode: r.turbo_sms_status_code,
            deliveryStatus: r.turbo_sms_delivery_status
        }));
    } else {
        let query;
        if (dbType === 'oracle') {
            query = `
                SELECT ID as webcode, created_at, patient as patient_name, tel as phone_number, 
                       turbo_sms_status as sms_status, department, turbo_sms_status_code as sms_status_code, 
                       turbo_sms_delivery_status as delivery_status 
                FROM C_MESSAGES_JOURNAL 
                WHERE (LOWER(patient) LIKE LOWER('%${term}%') OR tel LIKE '%${term}%' OR ID LIKE '%${term}%')
            `;
        } else { // Sybase
            query = `
                SELECT number as webcode, created_at, patientName, phoneNumber, smsStatus, department, smsStatusCode, deliveryStatus 
                FROM UniqueRandomNumbersV2 
                WHERE (patientName LIKE '%${term}%' OR phoneNumber LIKE '%${term}%' OR number LIKE '%${term}%')
            `;
        }

        if (depId && depId !== 'undefined') {
            query += ` AND LOWER(department) = LOWER('${depId}')`;
        }
        if (onlySuccessful) {
            query += ` AND smsStatusCode = 801`;
        }
        query += ` ORDER BY created_at DESC`;
        query = (dbType === 'oracle') ? `${query} FETCH FIRST 50 ROWS ONLY` : query.replace('SELECT', 'SELECT TOP 50');

        return executeQuery(query, dbConfig);
    }
}

/**
 * @description Отримує записи з messageId для фонового оновлення статусів.
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function getPendingSmsRecords(dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType === 'mongodb') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const results = await runMongoOperation(dbConfig, 'C_MESSAGES_JOURNAL', 'find', {
            query: {
                turbo_sms_message_Id: { $ne: null },
                turbo_sms_delivery_status: null,
                created_at: { $gt: sevenDaysAgo }
            },
            options: {
                projection: { turbo_sms_message_Id: 1, department: 1, _id: 0 }
            }
        });
        // Адаптуємо результат до очікуваного формату
        return results.map(r => ({ messageid: r.turbo_sms_message_Id, department: r.department }));
    } else {
        let query;
        if (dbType === 'oracle') {
            query = `
                SELECT turbo_sms_message_Id as messageId, department FROM C_MESSAGES_JOURNAL 
                WHERE turbo_sms_message_Id IS NOT NULL AND turbo_sms_delivery_status IS NULL
                AND created_at > SYSTIMESTAMP - INTERVAL '7' DAY
            `;
        } else { // Sybase
            query = `
                SELECT messageId, department FROM UniqueRandomNumbersV2 
                WHERE messageId IS NOT NULL AND deliveryStatus IS NULL
                AND created_at > DATEADD(day, -7, GETDATE())
            `;
        }
        return executeQuery(query, dbConfig);
    }
}

/**
 * @description Оновлює статус доставки SMS за messageId.
 * @param {string} messageId - ID повідомлення.
 * @param {string} newStatus - Новий статус доставки.
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function updateSmsDeliveryStatus(messageId, newStatus, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType === 'mongodb') {
        const result = await runMongoOperation(dbConfig, 'C_MESSAGES_JOURNAL', 'updateOne', {
            filter: { turbo_sms_message_Id: messageId },
            update: { $set: { turbo_sms_delivery_status: newStatus } }
        });
        return result;
    } else {
        let query, binds;
        if (dbType === 'oracle') {
            query = `UPDATE C_MESSAGES_JOURNAL SET turbo_sms_delivery_status = :newStatus WHERE turbo_sms_message_Id = :messageId`;
            binds = { newStatus, messageId };
        } else { // Sybase
            query = `UPDATE UniqueRandomNumbersV2 SET deliveryStatus = '${newStatus}' WHERE messageId = '${messageId}'`;
            binds = [];
        }
        return executeQuery(query, dbConfig, binds);
    }
}

/**
 * @description Отримує історію обстежень пацієнта (тільки для Sybase).
 * @param {object} params - Параметри пошуку.
 * @param {string} params.dob - Дата народження пацієнта (YYYY-MM-DD).
 * @param {string} params.phone - Номер телефону пацієнта.
 * @param {string} [params.dateFrom] - Початкова дата періоду (YYYY-MM-DD).
 * @param {string} [params.dateTo] - Кінцева дата періоду (YYYY-MM-DD).
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function getPatientHistory({ dob, phone, dateFrom, dateTo }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType !== 'sybase') {
        console.warn('Patient history search is only supported for Sybase DB.');
        return []; // Повертаємо порожній масив для інших типів БД
    }

    let query = `
  SELECT *, dem.tel 
FROM ziad_okb AS p
JOIN c_pacient AS pac ON p.rodcis = pac.rodcis
JOIN pac_dem AS dem ON pac.rodcis = dem.rodcis
WHERE 
  pac.datumnarod = '${dob}'  
  AND p.stavziad = 2 
    `;

    if (dateFrom && dateTo) {
        query += ` AND CAST(p.datodberu AS DATE) BETWEEN '${dateFrom}' AND '${dateTo}'`;
    }

    const results = await executeQuery(query, dbConfig);

    if (!results) return [];

    // Фільтруємо на рівні JS, оскільки SQL Anywhere 11 не підтримує REGEXP_REPLACE
    // Це дозволяє очистити номер від будь-якого тексту та символів
    return results.filter(record => {
        if (!record.tel) return false;

        let digits = record.tel.replace(/\D/g, '');

        // Нормалізація, аналогічна formatPhoneNumber
        if (digits.startsWith('380') && digits.length === 12) digits = digits.substring(2);
        if (digits.length === 9) digits = '0' + digits;

        return digits === phone;
    });
}

/**
 * @description Отримує деталі обстеження пацієнта за датою обстеження та датою народження (тільки для Sybase).
 * @param {object} params - Параметри пошуку.
 * @param {string} params.datodberu - Дата та час взяття матеріалу.
 * @param {string} params.datumnarod - Дата народження пацієнта.
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function getPatientExamDetails({ datodberu, datumnarod }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType !== 'sybase') {
        console.warn('Patient exam details search is only supported for Sybase DB.');
        return []; // Повертаємо порожній масив для інших типів БД
    }

    // Важливо: datodberu має бути в точному форматі, як в базі, включаючи час.
    const query = `
        SELECT
            pa.rodcis AS "ID Пацієнта",
            CONVERT(DATE, pa.datumnarod) AS "Дата народження",
            CONVERT(DATE, zop.datodberu) AS "Дата отримання матеріалу",
            CONVERT(DATE, ok.datpotvrd) AS "Дата видачі результатів",
            ok.poznamka AS "Примітка",
            CASE
                WHEN pa.pohlavie = 'M' THEN 'чоловіча'
                WHEN pa.pohlavie = 'F' THEN 'жіноча'
                ELSE 'Невідомо'
            END AS "Стать",
            pa.priezvisko AS "Прізвище",
            pa.meno AS "Ім'я",
            s.kodvys AS "Код дослідження",
            s.skratka AS "Артикул",
            ts.nazovskup AS "Панель",
            s.nazov AS "Обстеження",
            MAX(a.vysledoknum) AS "Результат",
            MAX(a.vysledoktext) AS "Результат текст",
            dtxt.dlhytext AS "Коментар",
            s.kodmernjedn AS "Одиниця в.",
            MAX(a.hranicaod) AS "Референт від",
            MAX(a.hranicado) AS "Референт до",
            s.pomtext AS "Опис результату",
            cz.priezvisko AS "ЛаборантФ",
            cz.meno AS "ЛаборантМ"
        FROM ziad_okb_pom a JOIN c_okb_vys s ON a.kodvys = s.kodvys JOIN c_okb_tlac_skup ts ON s.kodotecvys >= ts.kodskupod AND s.kodotecvys <= ts.kodskupdo JOIN c_pacient pa ON pa.rodcis = a.rodcis JOIN ziad_okb_prac zop ON zop.datodberu = a.datodberu JOIN ziad_okb ok ON ok.datodberu = zop.datodberu JOIN c_zam cz ON ok.oscispotvr = cz.oscis LEFT JOIN dlhe_texty dtxt ON dtxt.textid = a.vysetrenieid
        WHERE ok.datodberu = '${datodberu}' AND pa.datumnarod = '${datumnarod}' AND (s.nazov NOT LIKE '%Забір%' AND (a.vysledoknum IS NOT NULL OR a.vysledoktext <> ''))
        GROUP BY pa.rodcis, pa.datumnarod, zop.datodberu, ok.datpotvrd, ok.poznamka, pa.pohlavie, pa.priezvisko, pa.meno, s.kodvys, s.skratka, ts.nazovskup, s.nazov, s.kodmernjedn, s.pomtext, dtxt.dlhytext, cz.priezvisko, cz.meno
        ORDER BY s.kodvys ASC
    `;
    return executeQuery(query, dbConfig);
}

/**
 * @description Отримує статистику реєстрацій пацієнтів адміністраторами за період (тільки для Sybase).
 * @param {object} params - Параметри запиту.
 * @param {string} params.dateFrom - Початкова дата періоду (YYYY-MM-DD).
 * @param {string} params.dateTo - Кінцева дата періоду (YYYY-MM-DD).
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function getAdminRegistrationStats({ dateFrom, dateTo }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType !== 'sybase') {
        console.warn('Admin registration stats report is only supported for Sybase DB.');
        return [];
    }

    const query = `
        SELECT cz.priezvisko As "Фамілія",  cz.meno As "Адміністратор", COUNT(*) AS record_count
        FROM pac_obj pac
        JOIN c_zam cz ON pac.oscis = cz.oscis
        WHERE pac.datumobj BETWEEN '${dateFrom}' AND '${dateTo}'
        GROUP BY cz.meno,cz.priezvisko
        ORDER BY record_count DESC;`;

    return executeQuery(query, dbConfig);
}

/**
 * @description Отримує статистику реєстрацій досліджень адміністраторами за період (тільки для Sybase).
 * @param {object} params - Параметри запиту.
 * @param {string} params.dateFrom - Початкова дата періоду (YYYY-MM-DD).
 * @param {string} params.dateTo - Кінцева дата періоду (YYYY-MM-DD).
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function getExamRegistrationStats({ dateFrom, dateTo }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType !== 'sybase') {
        console.warn('Exam registration stats report is only supported for Sybase DB.');
        return [];
    }

    const query = `
        SELECT cz.priezvisko As "Фамілія",  cz.meno As "Адміністратор", COUNT(*) AS record_count
        FROM ziad_okb_prac zp JOIN c_zam cz ON zp.oscisprijmu = cz.oscis
        WHERE zp.datodberu BETWEEN '${dateFrom}' AND '${dateTo}'
        GROUP BY cz.meno,cz.priezvisko ORDER BY record_count DESC;`;
    return executeQuery(query, dbConfig);
}

/**
 * @description Отримує статистику сум замовлень по адміністраторах (Каса) за період (тільки для Sybase).
 * Використовує таблиці dodaci_list та c_zam.
 * @param {object} params - Параметри запиту.
 * @param {string} params.dateFrom - Початкова дата періоду (YYYY-MM-DD або YYYY-MM-DD HH:MM:SS).
 * @param {string} params.dateTo - Кінцева дата періоду (YYYY-MM-DD або YYYY-MM-DD HH:MM:SS).
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function getAdministratorCashStats({ dateFrom, dateTo }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType !== 'sybase') {
        console.warn('Administrator cash report is only supported for Sybase DB.');
        return [];
    }

    const query = `
        SELECT
            cz.priezvisko AS "Фамілія",
            cz.meno AS "Ім'я",
            SUM(d.suma) AS suma_zamovlen
        FROM dodaci_list d
        JOIN c_zam cz ON d.oscis = cz.oscis
        WHERE d.datum BETWEEN '${dateFrom}' AND '${dateTo}'
        GROUP BY cz.priezvisko, cz.meno
        HAVING SUM(d.suma) > 0
        ORDER BY suma_zamovlen DESC;`;

    return executeQuery(query, dbConfig);
}

/**
 * @description Отримує статистику сум замовлень по адміністраторах (Лабораторія) за період (тільки для Sybase).
 * Використовує таблиці pokladnicny_doklad та c_zam.
 * @param {object} params - Параметри запиту.
 * @param {string} params.dateFrom - Початкова дата періоду (YYYY-MM-DD або YYYY-MM-DD HH:MM:SS).
 * @param {string} params.dateTo - Кінцева дата періоду (YYYY-MM-DD або YYYY-MM-DD HH:MM:SS).
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<object>|undefined>}
 */
export async function getAdministratorLabCashStats({ dateFrom, dateTo }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType !== 'sybase') {
        console.warn('Administrator lab cash report is only supported for Sybase DB.');
        return [];
    }

    const query = `
        select cz.priezvisko AS "Фамілія", cz.meno AS "Ім'я", sum(d.suma) AS suma_zamovlen from pokladnicny_doklad d 
        JOIN c_zam cz ON d.oscis = cz.oscis
        WHERE d.datum BETWEEN '${dateFrom}' AND '${dateTo}'
        GROUP BY cz.priezvisko, cz.meno
        HAVING sum(d.suma) > 0
        ORDER BY suma_zamovlen DESC;`;

    return executeQuery(query, dbConfig);
}

/**
 * @description Отримує динаміку значень конкретного показника для вибраних обстежень (тільки для Sybase).
 * @param {object} params - Параметри пошуку.
 * @param {Array<{datodberu: string, datumnarod: string}>} params.exams - Масив об'єктів з даними обстежень.
 * @param {string[]} params.indicatorCodes - Масив кодів показників (напр., ['HGB', 'ALT']).
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<{datodberu: string, vysledoknum: number, skratka: string}>|undefined>}
 */
export async function getPatientExamDynamics({ exams, indicatorCodes }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType !== 'sybase') {
        console.warn('Patient exam dynamics search is only supported for Sybase DB.');
        return [];
    }

    // Створюємо список умов WHERE IN для datodberu
    const datodberuList = exams.map(exam => `'${exam.datodberu}'`).join(',');
    const indicatorCodeList = indicatorCodes.map(code => `'${code}'`).join(',');
    const datumnarod = exams[0]?.datumnarod; // Беремо дату народження з першого обстеження

    if (!datodberuList || !datumnarod) {
        return [];
    }

    const query = `
        SELECT
            a.datodberu,
            s.skratka,
            MAX(a.vysledoknum) AS vysledoknum
        FROM ziad_okb_pom a JOIN c_pacient pa ON a.rodcis = pa.rodcis JOIN c_okb_vys s ON a.kodvys = s.kodvys
        WHERE a.datodberu IN (${datodberuList}) AND pa.datumnarod = '${datumnarod}' AND s.skratka IN (${indicatorCodeList}) AND a.vysledoknum IS NOT NULL
        GROUP BY a.datodberu, s.skratka
        ORDER BY a.datodberu ASC
    `;
    return executeQuery(query, dbConfig);
}

/**
 * @description Отримує список показників, які присутні у більше ніж одному з вибраних обстежень (тільки для Sybase).
 * @param {object} params - Параметри пошуку.
 * @param {Array<{datodberu: string, datumnarod: string}>} params.exams - Масив об'єктів з даними обстежень.
 * @param {object} dbConfig - Конфігурація бази даних.
 * @returns {Promise<Array<{skratka: string, nazov: string}>|undefined>}
 */
export async function getAvailableIndicatorsForDynamics({ exams }, dbConfig) {
    const dbType = dbConfig.type || 'sybase';

    if (dbType !== 'sybase') {
        console.warn('Available indicators search is only supported for Sybase DB.');
        return [];
    }

    const datodberuList = exams.map(exam => `'${exam.datodberu}'`).join(',');
    const datumnarod = exams[0]?.datumnarod;

    if (!datodberuList || !datumnarod) {
        return [];
    }

    const query = `
        SELECT
            s.skratka,
            s.nazov
        FROM ziad_okb_pom a JOIN c_pacient pa ON a.rodcis = pa.rodcis JOIN c_okb_vys s ON a.kodvys = s.kodvys
        WHERE a.datodberu IN (${datodberuList}) AND pa.datumnarod = '${datumnarod}' AND a.vysledoknum IS NOT NULL
        GROUP BY s.skratka, s.nazov
        HAVING COUNT(DISTINCT a.datodberu) > 1
        ORDER BY s.nazov ASC
    `;
    return executeQuery(query, dbConfig);
}
