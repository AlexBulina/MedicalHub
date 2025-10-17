/**
 * @file turbosmsviber.js
 * @description Модуль для відправки повідомлень через Viber API від TurboSMS.
 */

/*
Як використовувати цей модуль:
Ви можете імпортувати функцію sendViberMessage в іншому файлі (наприклад, KT_BackendNew.js) і викликати її, передавши необхідні параметри.

Приклад імпорту та виклику:

import { sendViberMessage } from './turbosmsviber.js';

// ... всередині якоїсь асинхронної функції або маршруту

try {
    const result = await sendViberMessage({
        recipients: ['380991234567'],
        text: 'Ваше замовлення готове до видачі!',
        sender: 'HEMO MEDIKA', // Ваше альфа-ім'я для Viber
        token: process.env.VIBER_TOKEN, // Ваш токен
        imageUrl: 'https://hemomedika.ua/logo.png',
        buttonText: 'Переглянути',
        buttonUrl: 'https://hemomedika.ua/results'
    });
    console.log('Повідомлення успішно надіслано:', result);
} catch (error) {
    console.error('Не вдалося надіслати повідомлення:', error);
}



*/     

import axios from 'axios';
import winston from 'winston'; // Припускаємо, що логер може знадобитися

// URL для надсилання повідомлень
const API_URL = 'https://api.turbosms.ua/message/send.json';

// Створення простого логера, якщо він потрібен
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({ format: winston.format.simple() }),
    ],
});

/**
 * @description Надсилає повідомлення через Viber.
 * @param {object} options - Параметри для відправки.
 * @param {string[]} options.recipients - Масив номерів телефонів у форматі '380xxxxxxxxx'.
 * @param {string} options.text - Текст повідомлення.
 * @param {string} options.sender - Альфа-ім'я відправника, зареєстроване в TurboSMS.
 * @param {string} options.token - Ваш токен авторизації TurboSMS.
 * @param {string} [options.imageUrl] - (Опціонально) URL зображення для повідомлення.
 * @param {string} [options.buttonText] - (Опціонально) Текст на кнопці.
 * @param {string} [options.buttonUrl] - (Опціонально) URL, на який перенаправить кнопка.
 * @returns {Promise<object>} - Результат відправки від API TurboSMS.
 */
export async function sendViberMessage({ recipients, text, sender, token, imageUrl, buttonText, buttonUrl }) {
    const viberPayload = {
        sender,
        text,
    };

    if (imageUrl) viberPayload.image_url = imageUrl;
    if (buttonText && buttonUrl) {
        viberPayload.button_text = buttonText;
        viberPayload.button_url = buttonUrl;
    }

    try {
        const response = await axios.post(API_URL, {
            recipients,
            viber: viberPayload,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        });

        logger.info('Відповідь від TurboSMS Viber API:', response.data);
        return response.data;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        logger.error(`Помилка при відправці Viber-повідомлення: ${errorMessage}`);
        throw new Error(`Помилка при відправці Viber-повідомлення: ${errorMessage}`);
    }
}