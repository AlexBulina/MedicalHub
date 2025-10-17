/**
 * @file sybase_connection.js
 * @description Модуль для виконання запитів до бази даних Sybase через ODBC.
 */
import { connect } from "odbc";

let connectionFirstState = 1; // Для логування першого підключення

/**
 * @description Виконує SQL-запит до бази даних Sybase.
 * @param {string} dsn - Рядок підключення ODBC (DSN).
 * @param {string} query - SQL-запит для виконання.
 * @returns {Promise<Array<object>|undefined>} - Масив результатів запиту або `undefined` у разі помилки.
 *
 * @example
 * import { runSybaseQuery } from './sybase_connection.js';
 * const dsn = process.env.DB_DSN_SYBASE;
 * const results = await runSybaseQuery(dsn, 'SELECT * FROM c_pacient');
 */
export async function runSybaseQuery(dsn, query) {
    let connection;
    try {
        connection = await connect(dsn);
        if (connectionFirstState === 1) {
            console.log('Підключено до бази даних SYBASE Ambis');
            connectionFirstState = 0;
        }
        const data = await connection.query(query);
        return data;
    } catch (err) {
        console.error("Помилка при виконанні запиту до Sybase DB:", err);
        connectionFirstState = 1;
        return undefined;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}