# Мануал системи ліцензування

Цей проєкт використовує локальну, підписану ліцензію для on-prem інсталяцій. Ліцензія перевіряється на сервері замовника, а її статус впливає на доступність окремих функцій.

## 1. Як працює ліцензування

Сервер читає файл `license/license.json`, перевіряє його цифровий підпис через `license/license.public.pem` і порівнює прив’язку до конкретного сервера через `instance.instanceId`.

Якщо ліцензія валідна, сервер працює у звичайному режимі. Якщо термін дії завершився або ліцензію не знайдено, система переходить у обмежений режим. Додатково окремі можливості можуть бути вимкнені через feature flags.

Статус ліцензії можна подивитися через `GET /api/license/status`.

## 2. Структура `license.json`

Файл має такий вигляд:

```json
{
  "license": {
    "schemaVersion": 1,
    "licenseId": "mh-2026-0001",
    "customer": {
      "name": "Clinic Demo LLC",
      "contactEmail": "it@example.com"
    },
    "issuedAt": "2026-04-07T09:00:00Z",
    "validFrom": "2026-04-07T09:00:00Z",
    "expiresAt": "2027-04-07T08:59:59Z",
    "graceUntil": "2027-04-21T08:59:59Z",
    "instance": {
      "instanceId": "clinic-prod-01"
    },
    "features": {
      "writeAccess": true,
      "customSms": true,
      "resultDownloads": true,
      "analysisRegistration": true,
      "analyzerIntegration": true,
      "branchAdmin": true
    },
    "limits": {
      "branches": 10
    }
  },
  "signature": "BASE64_SIGNATURE"
}
```

Обов’язкові частини:

- `license` - payload ліцензії.
- `signature` - цифровий підпис цього payload.

Ключові поля:

- `licenseId` - ідентифікатор ліцензії.
- `customer.name` - назва клієнта.
- `issuedAt` - дата видачі.
- `validFrom` - дата початку дії.
- `expiresAt` - дата завершення дії.
- `graceUntil` - кінець пільгового періоду.
- `instance.instanceId` - прив’язка до конкретного сервера.
- `features` - список дозволених функцій.

## 3. Роль `.env`

У `.env` зберігаються локальні шляхи та ідентифікатор сервера:

```env
LICENSE_INSTANCE_ID=clinic-prod-01
LICENSE_FILE_PATH=license/license.json
LICENSE_PUBLIC_KEY_PATH=license/license.public.pem
```

Що важливо:

- `LICENSE_INSTANCE_ID` має збігатися з `license.instance.instanceId`.
- `LICENSE_FILE_PATH` вказує на підписаний файл ліцензії.
- `LICENSE_PUBLIC_KEY_PATH` вказує на публічний ключ для перевірки підпису.

Якщо `LICENSE_INSTANCE_ID` і `instance.instanceId` не збігаються, статус буде `instance_mismatch`.

Окремі сервіси з папки `C:\Hemomed Backend` теж можуть використовувати цю саму ліцензію. Для цього вони мають читати той самий `C:\MedicalHub\.env` або принаймні ті самі значення `LICENSE_INSTANCE_ID`, `LICENSE_FILE_PATH` і `LICENSE_PUBLIC_KEY_PATH`.

## 4. Як згенерувати ключі

Для Windows і Linux без `openssl` використовується локальний Node-скрипт:

```bash
node scripts/generate-license-keys.js
```

Пояснення команди:

- `node` - запускає локальний Node.js.
- `scripts/generate-license-keys.js` - скрипт, який створює нову пару RSA-ключів для ліцензування.

Що робить ця команда:

- генерує новий приватний ключ для підписування ліцензій
- генерує відповідний публічний ключ для перевірки підпису на сервері замовника
- зберігає обидва файли в папку `license/`

За замовчуванням скрипт створює:

- `license/private.pem`
- `license/license.public.pem`

Призначення файлів:

- `license/private.pem` - ваш секретний ключ; ним ви підписуєте ліцензії
- `license/license.public.pem` - відкритий ключ; ним сервер перевіряє, що ліцензію підписали саме ви

Що важливо:

- `private.pem` не можна передавати замовнику
- `license.public.pem` можна і потрібно класти на сервер замовника
- якщо ви вже видали ліцензії клієнтам, не генеруйте нову пару ключів без потреби, інакше старі підписані ліцензії перестануть збігатися з новим публічним ключем

Приватний ключ зберігається тільки у вас. На сервер замовника передається лише публічний ключ і підписана ліцензія.

## 5. Як підписати ліцензію

1. Підготуйте payload у файлі, наприклад `license/license.payload.example.json`.
2. Підпишіть його приватним ключем:

```bash
node scripts/sign-license.js license/license.payload.example.json license/private.pem license/license.json
```

Пояснення команди:

- `license/license.payload.example.json` - вхідний JSON без підпису; тут задаються дати, `instanceId` і `features`
- `license/private.pem` - ваш приватний ключ, яким створюється цифровий підпис
- `license/license.json` - вихідний підписаний файл, який читає сервер

Що робить ця команда:

- читає payload ліцензії
- обчислює цифровий підпис через `private.pem`
- формує готовий `license.json`, де є і сам payload, і поле `signature`

Після цього `license/license.json` містить:

- `license` - сам payload.
- `signature` - підпис, який перевіряється сервером.

Практично це означає:

- редагувати потрібно не `license.json`, а payload-файл
- після будь-якої зміни payload ліцензію треба підписати заново
- на сервер замовника потрібно передати `license.json` і `license.public.pem`
- `private.pem` залишається тільки у вас

Приклад типової послідовності:

```bash
node scripts/generate-license-keys.js
node scripts/sign-license.js license/license.payload.example.json license/private.pem license/license.json
```

Якщо ви зміните payload, ліцензію потрібно підписати ще раз.

## 6. Як перевірити `/api/license/status`

Після запуску сервера відкрийте:

```bash
http://localhost:3090/api/license/status
```

Або в PowerShell:

```powershell
Invoke-RestMethod http://localhost:3090/api/license/status | ConvertTo-Json -Depth 6
```

У відповіді ви побачите:

- `status`
- `message`
- `checkedAt`
- `licenseId`
- `customerName`
- `expiresAt`
- `graceUntil`
- `features`
- `resolvedFeatures`

## 7. Значення статусів

- `active` - ліцензія чинна, функції дозволені згідно з флагами.
- `grace` - термін дії завершився, але ще працює пільговий період.
- `expired` - ліцензія прострочена, write-операції та частина функцій блокуються.
- `invalid` - файл пошкоджений, підпис не пройшов перевірку або дані некоректні.
- `missing` - файл ліцензії або публічний ключ не знайдено.
- `instance_mismatch` - `LICENSE_INSTANCE_ID` не збігається з `license.instance.instanceId`.

## 8. Що блокують feature flags

### `customSms`

Блокує:

- відправку довільних SMS через `/send-custom-sms`
- кнопку довільного SMS у веб-інтерфейсі
- cron-розсилки та SMS-нагадування в `C:\Hemomed Backend\index.mjs`

### `resultDownloads`

Блокує:

- завантаження результатів через PDF-ендпоїнти
- друк PDF
- відправку результатів на email
- пакетне завантаження архівів
- публічні лінки на результати
- видачу PDF-результатів у `C:\Hemomed Backend\backend.js`

### `analysisRegistration`

Блокує:

- веб-реєстрацію аналізів
- маршрут `/register`
- API реєстрації аналізів

### `analyzerIntegration`

Блокує:

- `POST /api/analyzer/serial-result`
- `GET /api/analyzer/access`
- прийом результатів від лабораторних аналізаторів через analyzer bridge
- query/worklist сценарії в `serial_urine_analyzer_agent.js`, `sysmex_ca1500_agent.js` і `advia_centaur_agent.js`

## 9. Типові проблеми і як їх виправити

### `status: "missing"`

Причина:

- немає `license/license.json`
- немає `license/license.public.pem`

Що робити:

- згенерувати ключі
- підписати ліцензію
- перевірити шляхи в `.env`

### `status: "invalid"`

Причина:

- підпис не збігається з payload
- файл пошкоджений
- змінено `license.json` без повторного підпису

Що робити:

- заново підписати файл через `node scripts/sign-license.js`

### `status: "instance_mismatch"`

Причина:

- `LICENSE_INSTANCE_ID` не збігається з `license.instance.instanceId`

Що робити:

- або змінити `.env`
- або змінити `instance.instanceId` у payload
- потім знову підписати ліцензію, якщо змінювався payload

## 10. Інтеграція з `C:\Hemomed Backend`

У зовнішній папці `C:\Hemomed Backend` є два окремі сервіси:

- `index.mjs` - cron-сервіс SMS-інформування
- `backend.js` - сервіс публічної видачі результатів аналізів

Вони підключаються до тієї ж системи ліцензування з `C:\MedicalHub` і не використовують окрему ліцензію.

Логіка роботи:

- `index.mjs` перевіряє ліцензію перед cron-циклами і перед фактичною відправкою SMS
- якщо ліцензія неопераційна або `customSms=false`, SMS не відправляються, але сам процес лишається запущеним
- `backend.js` перевіряє ліцензію перед маршрутом видачі PDF-результату
- якщо ліцензія неопераційна або `resultDownloads=false`, результат не віддається і клієнт отримує повідомлення про блокування

Для цієї інтеграції важливо:

- `C:\MedicalHub\license\license.json` має бути чинним
- `C:\MedicalHub\license\license.public.pem` має відповідати підпису
- `LICENSE_INSTANCE_ID` має збігатися з `instance.instanceId` у ліцензії

### `status: "expired"`

Причина:

- завершився `expiresAt`

Що робити:

- випустити нову ліцензію

### `status: "grace"`

Причина:

- ліцензія вже завершилась, але ще діє пільговий період

Що робити:

- оновити ліцензію до завершення `graceUntil`

### Функція зникла у UI, але доступна на сервері

Причина:

- фронтенд ще не оновив конфігурацію
- сторінка потребує перезавантаження

Що робити:

- оновити сторінку
- перевірити `/api/license/status`

### Сервер стартує, але фіча не працює

Причина:

- feature flag вимкнений

Що робити:

- перевірити `features` у `license.json`
- перевірити `resolvedFeatures` у `/api/license/status`

## Короткий робочий цикл

1. Згенерувати ключі.
2. Підготувати payload ліцензії.
3. Підписати payload.
4. Покласти `license.json` і `license.public.pem` на сервер.
5. Вказати правильні значення в `.env`.
6. Запустити сервер.
7. Перевірити `/api/license/status`.

Створений файл: `C:\MedicalHub\LICENSE_SYSTEM_MANUAL.md`
