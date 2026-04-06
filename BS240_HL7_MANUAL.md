# BS-240 / HL7 Integration Manual

## Призначення

Цей документ описує поточну реалізацію HL7/MLLP інтеграції для лабораторних аналізаторів у цьому проєкті:

- HL7 TCP server
- HL7 emulator
- reset утиліта для повернення замовлення в `pending`
- мультианалізаторний запуск на різних портах
- поточні правила пошуку замовлення по barcode
- запис результатів у Sybase

Документ потрібен як точка повернення до теми пізніше.

---

## Основні файли

- [mindray_bs240_hl7_server.js](c:/MedicalHub/mindray_bs240_hl7_server.js)
  Основний HL7/MLLP сервер для одного аналізатора

- [mindray_bs240_hl7_emulator.js](c:/MedicalHub/mindray_bs240_hl7_emulator.js)
  Емулятор аналізатора для тестового обміну

- [mindray_bs240_reset_pending.js](c:/MedicalHub/mindray_bs240_reset_pending.js)
  Скидання результатів назад у `pending`

- [mindray_hl7_multi_server.js](c:/MedicalHub/mindray_hl7_multi_server.js)
  Launcher для кількох аналізаторів на різних портах

- [hl7_analyzer_profiles.js](c:/MedicalHub/hl7_analyzer_profiles.js)
  Парсер профілів аналізаторів із `.env`

- [sybase_connection.js](c:/MedicalHub/sybase_connection.js)
  ODBC-підключення до Sybase, включно з транзакційним виконанням

- [database_repository.js](c:/MedicalHub/database_repository.js)
  Обгортки для виконання SQL і транзакцій

- [package.json](c:/MedicalHub/package.json)
  npm scripts для запуску серверів, емулятора і reset

- [`.env`](c:/MedicalHub/.env)
  Конфігурація запуску

---

## Що вже реалізовано

### 1. Прийом HL7 по MLLP

Сервер слухає TCP-порт і приймає HL7 повідомлення у MLLP-обгортці:

- `VT` = `0x0B`
- `FS` = `0x1C`
- `CR` = `0x0D`

Підтримані повідомлення:

- `QRY^Q02`
- `ACK^Q03`
- `ORU^R01`

Відповіді сервера:

- `QCK^Q02`
- `DSR^Q03`
- `ACK^R01`

---

### 2. Barcode lookup

Поточний код підтримує кілька форматів barcode:

- `YYMMDD + typziad + evidcis(4) + priradenie`
- `YYMMDD + typziad + evidcis(4)`
- `DDMM + typziad + evidcis(4) + priradenie`
- `YYMM + typziad + evidcis(4)`

Приклад:

- `1512B0005B`
  - день = `15`
  - місяць = `12`
  - `typziad = B`
  - `evidcis = 5`
  - `priradenie = B`

Пошук виконується в межах `BS240_LOOKBACK_DAYS`.

---

### 3. Пошук тестів для аналізатора

Поточний ланцюг таблиць:

- `nis.ziad_okb`
- `nis.ziad_okb_pom`
- `nis.c_okb_vys`
- `nis.c_okb_prac_list`
- `nis.c_okb_prac_list_varianty`
- `nis.ziad_okb_pra_pom`

Логіка:

1. З barcode знаходимо заявку
2. Беремо `kodvys` із `ziad_okb_pom`
3. Через `c_okb_prac_list` і `c_okb_prac_list_varianty` відбираємо тільки тести потрібного аналізатора
4. Не віддаємо вже підтверджені тести:
   - умова: `pp.stavvys IS NULL OR pp.stavvys <> 2`

---

### 4. Віддача worklist

На `QRY^Q02` сервер:

1. знаходить замовлення
2. шле `QCK^Q02`
3. якщо є pending work, шле `DSR^Q03`

У `DSR` формуються:

- пацієнт
- дата народження
- стать
- barcode
- sample id
- sample type
- список тестів у `DSP|29+`

---

### 5. Прийом результатів

На `ORU^R01` сервер:

1. одразу віддає технічний `ACK^R01`
2. далі у фоні виконує запис результатів у БД

Це зроблено спеціально, щоб емулятор або реальний апарат не чекали довгий ACK під час запису у Sybase.

---

### 6. Запис результатів у Sybase

Оновлюються таблиці:

- `nis.ziad_okb_pom`
- `nis.ziad_okb_pra_pom`

Поля:

- `stavvys`
- `oscisvys`
- `datumvys`
- `oscispotvr`
- `datumpotvrd`
- `vysledoknum`
- `vysledoktext`
- `koncentracia`

Поточний статус після успішного ORU:

- `stavvys = 2`

---

### 7. Batch update mode

Раніше результати записувались по одному тесту з окремим ODBC-з’єднанням.

Зараз реалізовано кращий режим:

- один ODBC connection на весь `ORU`
- `BEGIN TRANSACTION`
- усі `UPDATE` всередині однієї транзакції
- `COMMIT`

Це зроблено через:

- [sybase_connection.js](c:/MedicalHub/sybase_connection.js)
  - `runSybaseTransaction(...)`

- [database_repository.js](c:/MedicalHub/database_repository.js)
  - `executeQueriesInTransaction(...)`

---

## Reset pending

Є окрема утиліта для скидання результатів назад у `pending`.

Файл:

- [mindray_bs240_reset_pending.js](c:/MedicalHub/mindray_bs240_reset_pending.js)

Що робить:

- знаходить замовлення по barcode
- бере тільки тести поточного аналізатора
- очищає результати
- ставить:
  - `stavvys = 1`
  - `datumvys = NULL`
  - `datumpotvrd = NULL`
  - `oscisvys = NULL`
  - `oscispotvr = NULL`
  - `vysledoknum = NULL`
  - `vysledoktext = NULL`

Команда:

```bash
npm run bs240-reset -- 1512B0005B
```

---

## Emulator

Файл:

- [mindray_bs240_hl7_emulator.js](c:/MedicalHub/mindray_bs240_hl7_emulator.js)

Що вміє:

1. Шле `QRY^Q02`
2. Приймає `QCK^Q02`
3. Приймає `DSR^Q03`
4. Відправляє `ACK^Q03`
5. Через `BS240_RESULT_DELAY_MS` шле `ORU^R01`
6. Чекає `ACK^R01`

Успішний сценарій тепер явно пише:

```text
ACK^R01 received successfully.
```

Якщо ACK не прийшов:

```text
No ACK^R01 response received.
```

---

## Один сервер для кількох аналізаторів

Реалізовано окремий launcher:

- [mindray_hl7_multi_server.js](c:/MedicalHub/mindray_hl7_multi_server.js)

Він:

- читає профілі аналізаторів
- піднімає окремий child process на кожен порт
- використовує один і той самий серверний код

Профілі читаються з:

- [hl7_analyzer_profiles.js](c:/MedicalHub/hl7_analyzer_profiles.js)

Підтриманий формат у `.env`:

```env
BS240_ANALYZER_PROFILES=name=Advia120,port=4001,praclistid=Advia120;name=BS240,port=4002,praclistid=BS240;name=Centaur,port=4003,praclistid=Centaur
```

Підтримані поля профілю:

- `name`
- `port`
- `praclistid`
- `kodzar`
- `branch`
- `kodlab`
- `host`
- `searchDays`

Запуск:

```bash
npm run bs240-hl7-multi
```

---

## Конфігурація `.env`

Поточні важливі змінні:

```env
BS240_BRANCH="ad"
BS240_KODLAB="00001"
BS240_PRACLISTID="Advia120"
BS240_LOOKBACK_DAYS=400

BS240_HL7_HOST="0.0.0.0"
BS240_HL7_PORT=4001

BS240_EMULATOR_HOST="127.0.0.1"
BS240_EMULATOR_PORT=4001
BS240_EMULATOR_TIMEOUT_MS=12000

BS240_RESULT_DELAY_MS=30000
BS240_AUTO_SEND_RESULTS=true
BS240_AUTO_CONFIRM_RESULTS=true
BS240_RESULT_OSCIS=22
```

---
## Конфігурація multi server `.env`

BS240_ANALYZER_PROFILES=name=Advia120,port=4001,praclistid=Advia120;name=BS240,port=4002,praclistid=BS240;name=Centaur,port=4003,praclistid=Centaur


## Команди запуску

### Одиночний сервер

```bash
npm run bs240-hl7
```

### Мультисервер

```bash
npm run bs240-hl7-multi
```

### Емулятор

```bash
npm run bs240-emulator
```

Або з barcode:

```bash
npm run bs240-emulator -- 1512B0005B
```

### Reset

```bash
npm run bs240-reset -- 1512B0005B
```

---

## Типовий тестовий сценарій

1. Скинути barcode в `pending`

```bash
npm run bs240-reset -- 1512B0005B
```

2. Запустити сервер

```bash
npm run bs240-hl7
```

3. Запустити емулятор

```bash
npm run bs240-emulator -- 1512B0005B
```

4. Переконатися, що:

- прийшов `QCK^Q02`
- прийшов `DSR^Q03`
- емулятор відправив `ACK^Q03`
- через таймаут пішов `ORU^R01`
- емулятор отримав:

```text
ACK^R01 received successfully.
```

5. Перевірити БД

Приклад:

```sql
SELECT datevidcis, evidcis, kodvys, stavvys, vysledoknum, datumvys, datumpotvrd
FROM nis.ziad_okb_pra_pom
WHERE datevidcis = '2025-12-15'
  AND evidcis = 5
  AND kodvys IN (852, 854, 855, 899)
ORDER BY kodvys;
```

---

## Відомі нюанси

### 1. ACK^R01 тепер технічний

Сервер повертає `ACK^R01` одразу після прийому `ORU`, а не після завершення запису в БД.

Це означає:

- `ACK^R01` = повідомлення прийнято
- але не обов’язково означає, що БД вже оновлена саме в цю мить

Фактичний запис треба перевіряти:

- по логах сервера
- або запитом у БД

### 2. Протокол зараз підігнаний під поточний BS-240 сценарій

Це не універсальний HL7 engine для всіх приладів без змін.

Якщо підключати інший аналізатор:

- може змінитись структура `DSR`
- може змінитись формат `ORU`
- може відрізнятися очікування по `PID/OBR/OBX`

### 3. Barcode parsing досі залежить від ваших правил

Особливо для коротких barcode без року або з коротким номером замовлення.

---

## Що можна покращити далі

1. Зробити справжній масовий update:

- 1 `UPDATE` для `ziad_okb_pom`
- 1 `UPDATE` для `ziad_okb_pra_pom`

2. Додати логування в окремі `.log` файли по кожному аналізатору

3. Зробити окремий `BAT` launcher:

- сервер
- мультисервер
- емулятор
- reset

4. Винести спільне HL7 ядро в окремий модуль

5. Додати окремі профілі протоколу для різних апаратів

---

## Швидке резюме

Поточний стан:

- HL7/MLLP сервер працює
- emulator працює
- reset працює
- результати в Sybase записуються
- `ACK^R01` тепер іде одразу
- batch update переведений на одну транзакцію
- мультианалізаторний launcher доданий

Це вже робоча база, до якої можна повернутися і розширювати під інші аналізатори.
