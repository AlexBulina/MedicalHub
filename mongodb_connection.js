/**
 * @file mongodb_connection.js
 * @description Модуль для виконання операцій з базою даних MongoDB.
 */
import { MongoClient } from 'mongodb';

/**
 * @description Виконує операцію з колекцією в MongoDB.
 * @param {object} dbConfig - Конфігурація підключення (uri, dbName).
 * @param {string} collectionName - Назва колекції.
 * @param {string} operation - Назва операції ('find', 'findOne', 'insertOne', 'updateOne').
 * @param {object} params - Параметри для операції (query, update, options).
 * @returns {Promise<any>} - Результат виконання операції.
 */
export async function runMongoOperation(dbConfig, collectionName, operation, params = {}) {
    if (!dbConfig.uri || !dbConfig.dbName) {
        throw new Error("Конфігурація MongoDB повинна містити 'uri' та 'dbName'.");
    }

    const client = new MongoClient(dbConfig.uri);

    try {
        await client.connect();
        console.log("Підключено до бази даних MongoDB");
        const db = client.db(dbConfig.dbName);
        const collection = db.collection(collectionName);

        switch (operation) {
            case 'find':
                return await collection.find(params.query || {}, params.options || {}).toArray();
            case 'findOne':
                return await collection.findOne(params.query || {}, params.options || {});
            case 'insertOne':
                return await collection.insertOne(params.document || {}, params.options || {});
            case 'updateOne':
                return await collection.updateOne(params.filter || {}, params.update || {}, params.options || {});
            case 'countDocuments':
                return await collection.countDocuments(params.query || {});
            default:
                throw new Error(`Непідтримувана операція MongoDB: ${operation}`);
        }
    } catch (err) {
        console.error("Помилка при виконанні операції з MongoDB:", err);
        throw new Error(`Помилка MongoDB: ${err.message}`);
    } finally {
        await client.close();
    }
}