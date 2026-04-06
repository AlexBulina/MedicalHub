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

/**
 * @description Виконує кілька SQL-запитів до Sybase в межах одного ODBC-з'єднання і транзакції.
 * @param {string} dsn - Рядок підключення ODBC (DSN).
 * @param {string[]} queries - Масив SQL-запитів для послідовного виконання.
 * @returns {Promise<Array<object>|undefined>} - Масив результатів або `undefined` у разі помилки.
 */
export async function runSybaseTransaction(dsn, queries) {
    let connection;
    try {
        connection = await connect(dsn);
        if (connectionFirstState === 1) {
            console.log('Підключено до бази даних SYBASE Ambis');
            connectionFirstState = 0;
        }

        await connection.query("BEGIN TRANSACTION");
        const results = [];

        for (const query of queries) {
            if (!String(query || "").trim()) {
                continue;
            }
            results.push(await connection.query(query));
        }

        await connection.query("COMMIT TRANSACTION");
        return results;
    } catch (err) {
        if (connection) {
            try {
                await connection.query("ROLLBACK TRANSACTION");
            } catch (rollbackError) {
                console.error("Помилка при відкаті транзакції Sybase DB:", rollbackError);
            }
        }
        console.error("Помилка при виконанні транзакції до Sybase DB:", err);
        connectionFirstState = 1;
        return undefined;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}
