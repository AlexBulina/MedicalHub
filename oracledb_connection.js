/**
 * @file oracledb_connection.js
 * @description Модуль для виконання запитів до бази даних Oracle.
 */
import oracledb from 'oracledb';

/**
 * @description Перетворює snake_case або PASCAL_CASE в camelCase.
 * Oracle повертає назви колонок у верхньому регістрі (напр., 'PATIENTNAME').
 * Ця функція перетворює їх у camelCase (напр., 'patientName').
 * @param {string} str - Вхідний рядок.
 * @returns {string} - Рядок у форматі camelCase.
 */
const toCamelCase = (str) => {
    if (!str) return '';
    // Перетворюємо рядок в нижній регістр і розділяємо по '_'
    return str.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
};

/**
 * @description Виконує SQL-запит до бази даних Oracle.
 * @param {oracledb.ConnectionAttributes} dbConfig - Об'єкт конфігурації для підключення до Oracle DB.
 * @param {string} query - SQL-запит для виконання.
 * @param {oracledb.BindParameters} [binds=[]] - Масив або об'єкт параметрів для прив'язки до запиту.
 * @returns {Promise<Array<object>|undefined>} - Масив результатів запиту або `undefined` у разі помилки.
 *
 * @example
 * import { runOracleQuery } from './oracledb_connection.js';
 *
 * const dbConfig = {
 *   user: process.env.ORACLE_USER,
 *   password: process.env.ORACLE_PASSWORD,
 *   connectString: process.env.ORACLE_CONNECT_STRING
 * };
 *
 * const query = `SELECT department_name FROM departments WHERE department_id = :id`;
 * const binds = { id: 60 };
 *
 * const results = await runOracleQuery(dbConfig, query, binds);
 * if (results) {
 *   console.log("Результат запиту:", results);
 * }
 */
export async function runOracleQuery(dbConfig, query, binds = []) {
    let connection;

    // Створюємо конфігурацію, використовуючи передані дані або значення за замовчуванням
    const config = {
        user: dbConfig?.user,
        password: dbConfig?.password ,
        connectString: dbConfig?.connectString
    };

    // Перевірка, чи connectString не порожній
    if (!config.connectString) {
        console.error("Помилка конфігурації Oracle: 'connectString' не може бути порожнім. Перевірте змінні середовища.");
        throw new Error("NJS-125: \"connectString\" cannot be empty or undefined.");
    }

    try {
        // Отримуємо з'єднання з базою даних
        connection = await oracledb.getConnection(config);
        console.log("Підключено до бази даних Oracle DB");

        // Виконуємо запит
        const result = await connection.execute(query, binds, { 
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit: true // ВАЖЛИВО: Автоматично підтверджуємо транзакцію (INSERT, UPDATE, DELETE)
        });
        
        // Перетворюємо ключі (назви колонок) з верхнього регістру в camelCase
        if (result.rows) {
            return result.rows.map(row => 
                Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamelCase(key), value]))
            );
        }
        return [];
    } catch (err) {
        console.error("Помилка при виконанні запиту до Oracle DB:", err);
        // Прокидаємо помилку далі для централізованої обробки
        throw new Error(`Помилка підключення до бази даних Oracle: ${err.message}`);
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}