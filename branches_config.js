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
        hasPartnerLab: false, // Наявність лабораторії партнера publicUrl: 'http://37.53.72.157:1090/rd', zdorovya
        partnerLabResultUrl: 'http://be.onelab.kdg.com.ua:9998/OneLab/OneLab/BackEnd/TestResult/', // URL для результатів партнерської лабораторії
        publicUrl: 'http://85.159.5.112:1090/rd',
        labResultUrl: 'http://be.zdorovya.kdg.com.ua:17298/Zdorovya/Zdorovya',
        labResultUrlEng: 'http://be.zdorovya.kdg.com.ua:17298/zdorovya/zdorovya/ER/ENG', // <-- ДОДАНО: URL для англомовної версії
        titleKey: "branchTitle_rd",
        clinicNameKey: "branchClinicName_rd",
        smsTextKey: "branchSmsText_rd",
        channel: 'sms', // <--- Перемикач каналу
        messagingEnabled: true, // true - відправляти повідомлення, false - імітувати відправку
        auth: { user: process.env.AUTH_USER_ZDVRD, pass: process.env.AUTH_PASS_ZDVRD },
        sms: { token: process.env.SMS_TOKEN_ZDVRD, sender: process.env.SMS_SENDER_ZDVRD
 },
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
        hasPartnerLab: false, // Наявність лабораторії партнера publicUrl: 'http://37.53.72.157:1090/rd', zdorovya
        partnerLabResultUrl: 'http://be.onelab.kdg.com.ua:9998/OneLab/OneLab/BackEnd/TestResult/', // URL для результатів партнерської лабораторії
        publicUrl: 'http://85.159.5.112:1090/ct',
        labResultUrl: 'http://be.zdorovya.kdg.com.ua:17298/Zdorovya/Zdorovya',
        labResultUrlEng: 'http://be.zdorovya.kdg.com.ua:17298/zdorovya/zdorovya/ER/ENG', // <-- ДОДАНО: URL для англомовної версії
        titleKey: "branchTitle_ct",
        clinicNameKey: "branchClinicName_ct",
        smsTextKey: "branchSmsText_ct",
        channel: 'sms', // <--- Перемикач каналу
        messagingEnabled: true, // true - відправляти повідомлення, false - імітувати відправку
        auth: { user: process.env.AUTH_USER_CT, pass: process.env.AUTH_PASS_CT },
        sms: { token: process.env.SMS_TOKEN_ZDVRD, sender: process.env.SMS_SENDER_ZDVRD
 },
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
                tokenKey: 'ct' // Унікальний ключ для збереження токену
            }
        }
    },
    zdvct: {
        path: '/zdvct',
        resultPath: '/zct',
        depId: 'zct',
        hasPartnerLab: false, // Наявність лабораторії партнера
        publicUrl: 'http://85.159.5.112:1026/zct',
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
     ol: {
        path: '/onelab',
        hasPartnerLab: false, // Наявність лабораторії партнера
        resultPath: '/ol',
        depId: 'ol',
        partnerLabResultUrl: 'http://be.onelab.kdg.com.ua:9998/OneLab/OneLab/BackEnd/TestResult/', // URL для результатів партнерської лабораторії
        publicUrl: 'http://37.53.72.157:1090/ol',
        labResultUrl: 'http://be.onelab.kdg.com.ua:9998/OneLab/OneLab',
        labResultUrlEng: 'http://195.211.240.20:11898/onelab/onelab/ER/ENG', // <-- ДОДАНО: URL для англомовної версії
        titleKey: "branchTitle_ol",
        clinicNameKey: "branchClinicName_ol",
        smsTextKey: "branchSmsText_ol",
        hasAdvancedPatientSearch: true,
        advancedSearch: {
            url: 'http://195.211.240.20:11998/KDG_SIMPLE_LAB_API/Onelab/', // URL вашого API
            token: 'b25lbGFifG9uZUxhYldlYjpvbmVMYWJXZWIxMjMh' // Токен авторизації
        },
        channel: 'sms', // <--- Перемикач каналу
        messagingEnabled: true, // true - відправляти повідомлення, false - імітувати відправку
        auth: { user: process.env.AUTH_USER_OL, pass: process.env.AUTH_PASS_OL },
        sms: { token: process.env.SMS_TOKEN_OL, sender: process.env.SMS_SENDER_OL },
        viber: { token: process.env.VIBER_TOKEN_RD, sender: process.env.VIBER_SENDER_RD }, // Потрібно додати в .env
      //  db: { dsn: process.env.DB_DSN_SYBASE }, // DSN для Sybase
        db: {
            type: 'oracle',
            user: process.env.DB_USER_ORA_OL,
            password: process.env.DB_PASSWORD_ORA_OL,
            connectString: process.env.DB_CONNECT_STRING_ORA_OL
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
      zd: {
        path: '/zdorovya',
        hasPartnerLab: true, // Наявність лабораторії партнера
        resultPath: '/zd',
        depId: 'zd',
        partnerLabResultUrl: 'http://be.onelab.kdg.com.ua:9998/OneLab/OneLab/BackEnd/TestResult/', // URL для результатів партнерської лабораторії
        publicUrl: 'http://37.53.72.157:1090/zd',
        labResultUrl: 'http://be.zdorovya.kdg.com.ua:17298/Zdorovya/Zdorovya',
        labResultUrlEng: 'http://be.zdorovya.kdg.com.ua:17298/zdorovya/zdorovya/ER/ENG', // <-- ДОДАНО: URL для англомовної версії
        titleKey: "branchTitle_zd",
        clinicNameKey: "branchClinicName_zd",
        smsTextKey: "branchSmsText_zd",
        channel: 'sms', // <--- Перемикач каналу
        hasAdvancedPatientSearch: true,
        advancedSearch: {
            url: 'http://be.zdorovya.kdg.com.ua:17298/KDG_SIMPLE_LAB_API/Zdorovya/', // URL вашого API
            token: 'WmRvcm92eWF8U01TX0JhY2tlbmQ6JE0kQkBjazEyMzQ=' // Токен авторизації
        },
        messagingEnabled: true, // true - відправляти повідомлення, false - імітувати відправку 
        auth: { user: process.env.AUTH_USER_ZD, pass: process.env.AUTH_PASS_ZD },
        sms: { token: process.env.SMS_TOKEN_ZD, sender: process.env.SMS_SENDER_ZD },
        viber: { token: process.env.VIBER_TOKEN_ZD, sender: process.env.VIBER_SENDER_ZD }, // Потрібно додати в .env
      //  db: { dsn: process.env.DB_DSN_SYBASE }, // DSN для Sybase
        db: {
            type: 'oracle',
            user: process.env.DB_USER_ORA_ZD,
            password: process.env.DB_PASSWORD_ORA_ZD,
            connectString: process.env.DB_CONNECT_STRING_ORA_ZD
        },
        storage: {
            type: 'google-drive',
            config: {
                clientId: process.env.GDRIVE_CLIENT_ID,
                clientSecret: process.env.GDRIVE_CLIENT_SECRET,
                redirectUri: process.env.GDRIVE_REDIRECT_URI,
                folderId: process.env.GDRIVE_FOLDER_ID_RD,
                tokenKey: 'zd' // Унікальний ключ для збереження токену
            }
        }
    },

mongo: {
        path: '/mongo',
        resultPath: '/mg',
        depId: 'mg',
        hasPartnerLab: true, // Наявність лабораторії партнера publicUrl: 'http://37.53.72.157:1090/rd', zdorovya
        partnerLabResultUrl: 'http://be.onelab.kdg.com.ua:9998/OneLab/OneLab/BackEnd/TestResult/', // URL для результатів партнерської лабораторії
        publicUrl: 'http://rad.hemomedika.ua:1026/rd',
        labResultUrl: 'http://be.zdorovya.kdg.com.ua:17298/Zdorovya/Zdorovya',
        titleKey: "branchTitle_rd",
        clinicNameKey: "branchClinicName_rd",
        smsTextKey: "branchSmsText_rd",
        channel: 'sms', // <--- Перемикач каналу 'sms' - 'viber'
        messagingEnabled: true, // true - відправляти повідомлення, false - імітувати відправку
         auth: { user: process.env.AUTH_USER_MONGO, pass: process.env.AUTH_PASS_MONGO },
         sms: { token: process.env.SMS_TOKEN_MONGO, sender: process.env.SMS_SENDER_MONGO },
         db: {
             type: 'mongodb',
             uri: process.env.DB_MONGO_URI, // Напр., "mongodb://localhost:27017"
             dbName: process.env.DB_MONGO_NAME // Напр., "MedicalHubDb"
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
    // --- Приклад конфігурації для філіалу з MongoDB ---
    // mongo_branch: {
    //     path: '/mongobranch',
    //     depId: 'mongo',
    //     publicUrl: 'http://localhost:1026/mongo',
    //     titleKey: "branchTitle_mongo",
    //     clinicNameKey: "branchClinicName_mongo",
    //     smsTextKey: "branchSmsText_mongo",
    //     channel: 'sms',
    //     messagingEnabled: true,
    //     auth: { user: process.env.AUTH_USER_MONGO, pass: process.env.AUTH_PASS_MONGO },
    //     sms: { token: process.env.SMS_TOKEN_MONGO, sender: process.env.SMS_SENDER_MONGO },
    //     db: {
    //         type: 'mongodb',
    //         uri: process.env.DB_MONGO_URI, // Напр., "mongodb://localhost:27017"
    //         dbName: process.env.DB_MONGO_NAME // Напр., "medicalhub"
    //     },
    //     storage: { type: 'ftp', config: { host: process.env.FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS } }
    // },
    // Конфігурація за замовчуванням для Sybase
    defaultSybase: {
        db: { dsn: process.env.DB_DSN_SYBASE, type: 'sybase' }
    },
}

export default BRANCHES;