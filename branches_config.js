/**
 * @file branches_config.js
 * @description Централізована конфігурація для всіх філіалів системи.
 * Кожен об'єкт представляє окремий філіал з його унікальними налаштуваннями
 * для автентифікації, баз даних, сховищ файлів та сервісів повідомлень.
 */

const BRANCHES = {
    mrt: {
        path: '/tomogmrt',
        depId: 'mrt',
        hasPartnerLab: true, // Наявність лабораторії партнера
        partnerLabResultUrl: 'http://onelab.com.ua/Home/Result', // URL для результатів партнерської лабораторії
        labResultUrl: 'http://be.zdorovya.kdg.com.ua:17298/Zdorovya/Zdorovya',
        titleKey: "branchTitle_mrt",
        clinicNameKey: "branchClinicName_mrt",
        smsTextKey: "branchSmsText_mrt",
        channel: 'sms',
        messagingEnabled: false, // true - відправляти повідомлення, false - імітувати відправку
        auth: { user: process.env.AUTH_USER_MRT, pass: process.env.AUTH_PASS_MRT },
        sms: { token: process.env.SMS_TOKEN_MRT, sender: process.env.SMS_SENDER_MRT },
        
        db: { dsn: process.env.DB_DSN_SYBASE } ,// DSN для Sybase
        // Конфігурація для Oracle
        /*db: {
            type: 'oracle',
            user: process.env.DB_USER_ORA_MRT, // Рекомендую створити окремі змінні для MRT
            password: process.env.DB_PASSWORD_ORA_MRT,
            connectString: process.env.DB_CONNECT_STRING_ORA_MRT
        },*/

        storage: {
            type: 'ftp', 
            config: { 
                host: process.env.FTP_HOST,
                user: process.env.FTP_USER,
                password: process.env.FTP_PASS
            }
        },
    },
    rd: {
        path: '/radiology',
        resultPath: '/rd',
        depId: 'rd',
        hasPartnerLab: true, // Наявність лабораторії партнера
        partnerLabResultUrl: 'http://be.onelab.kdg.com.ua:9998/OneLab/OneLab/BackEnd/TestResult/', // URL для результатів партнерської лабораторії
        publicUrl: 'http://rad.hemomedika.ua:1026/rd',
        labResultUrl: 'http://be.zdorovya.kdg.com.ua:17298/Zdorovya/Zdorovya',
        titleKey: "branchTitle_rd",
        clinicNameKey: "branchClinicName_rd",
        smsTextKey: "branchSmsText_rd",
        channel: 'sms', // <--- Перемикач каналу
        messagingEnabled: false, // true - відправляти повідомлення, false - імітувати відправку
        auth: { user: process.env.AUTH_USER_RD, pass: process.env.AUTH_PASS_RD },
        sms: { token: process.env.SMS_TOKEN_RD, sender: process.env.SMS_SENDER_RD },
        viber: { token: process.env.VIBER_TOKEN_RD, sender: process.env.VIBER_SENDER_RD }, // Потрібно додати в .env
      //  db: { dsn: process.env.DB_DSN_SYBASE }, // DSN для Sybase
        db: {
            type: 'oracle',
            user: process.env.DB_USER_ORA_RD,
            password: process.env.DB_PASSWORD_ORA_RD,
            connectString: process.env.DB_CONNECT_STRING_ORA_RD
        },
        storage: {
            type: 'google-drive',
            config: {
                clientId: process.env.GDRIVE_CLIENT_ID,
                clientSecret: process.env.GDRIVE_CLIENT_SECRET,
                redirectUri: process.env.GDRIVE_REDIRECT_URI,
                folderId: process.env.GDRIVE_FOLDER_ID_RD,
                tokenKey: 'rd' // Унікальний ключ для збереження токену
            }
        }
    },
    ct: {
        path: '/tomograf',
        resultPath: '/ct',
        depId: 'ct',
        hasPartnerLab: false, // Наявність лабораторії партнера
        publicUrl: 'http://rad.hemomedika.ua:1026/ct',
        channel: 'sms',
        messagingEnabled: true, // true - відправляти повідомлення, false - імітувати відправку
        titleKey: "branchTitle_ct",
        clinicNameKey: "branchClinicName_ct",
        smsTextKey: "branchSmsText_ct",
        auth: { user: process.env.AUTH_USER_HMU, pass: process.env.AUTH_PASS_HMU },
        sms: { token: process.env.SMS_TOKEN_CT, sender: process.env.SMS_SENDER_CT },
        db: { dsn: process.env.DB_DSN_SYBASE }, // DSN для Sybase
        storage: {
            type: 'ftp', 
            config: { 
                host: process.env.FTP_HOST,
                user: process.env.FTP_USER,
                password: process.env.FTP_PASS
            }
        }
    },
    zdvrd: {
        path: '/zdvrd',
        resultPath: '/zdvrd',
        depId: 'zdvrd',
        hasPartnerLab: false, // Наявність лабораторії партнера
        publicUrl: 'http://85.159.5.112:1026/zdvrd',
        channel: 'sms',
        messagingEnabled: true, // true - відправляти повідомлення, false - імітувати відправку
        titleKey: "branchTitle_zdvrd",
        clinicNameKey: "branchClinicName_zdvrd",
        smsTextKey: "branchSmsText_zdvrd",
        auth: { user: process.env.AUTH_USER_ZDVRD, pass: process.env.AUTH_PASS_ZDVRD },
        sms: { token: process.env.SMS_TOKEN_ZDVRD, sender: process.env.SMS_SENDER_ZDVRD },
        db: { dsn: process.env.DB_DSN_SYBASE }, // DSN для Sybase
        storage: {
            type: 'ftp', 
            config: { 
                host: process.env.FTP_HOST,
                user: process.env.FTP_USER,
                password: process.env.FTP_PASS
            }
        }
    },
    // Конфігурація за замовчуванням для Sybase
    defaultSybase: {
        db: { dsn: process.env.DB_DSN_SYBASE, type: 'sybase' }
    },
};

export default BRANCHES;