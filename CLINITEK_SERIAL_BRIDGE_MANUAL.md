# Clinitek Serial Bridge Manual

Цей мануал описує, як підняти локальний міст для `COM`-аналізатора типу `Clinitek` на окремому ПК, який стоїть поруч з апаратом.

Схема роботи така:

```text
Clinitek -> COM/RS232 -> локальний Windows ПК -> HTTP -> головний сервер MedicalHub -> Sybase
```

## Що робить міст

Локальний міст:
- читає рядки з `COM`-порту;
- чекає кінець повідомлення `CR`;
- парсить рядок аналізатора;
- перекладає типові значення `Clinitek` у читабельний вигляд, наприклад `Neg -> Негативний`, `Pos -> Позитивний`, `Yellow -> Жовтий`;
- збирає JSON з результатами;
- відправляє його на серверний endpoint:

```text
/api/analyzer/serial-result
```

## Які файли скопіювати в папку `Clinitek`

Створи на локальному ПК папку, наприклад:

```text
C:\Clinitek
```

Скопіюй у неї ці файли:

- `serial_urine_bridge.bat`
- `serial_urine_emulator.bat`
- `serial_urine_analyzer_agent.js`
- `serial_urine_analyzer_emulator.js`
- `serial_urine_analyzer_parser.js`
- `serial_urine_bridge.env.example`
- `serial_urine_mapping.example.json`
- `serial_urine_package.example.json`

Після копіювання папка має виглядати приблизно так:

```text
C:\Clinitek\
  serial_urine_bridge.bat
  serial_urine_emulator.bat
  serial_urine_analyzer_agent.js
  serial_urine_analyzer_emulator.js
  serial_urine_analyzer_parser.js
  serial_urine_bridge.env.example
  serial_urine_mapping.example.json
  serial_urine_package.example.json
```

## Що встановити на локальному ПК

Потрібно встановити:

- `Node.js`

Перевірка:

```bash
node -v
npm -v
```

## Як підготувати середовище

Відкрий `cmd` або `PowerShell` у папці `C:\Clinitek` і виконай:

```bash
copy serial_urine_package.example.json package.json
npm install
```

Важливо:
- `node_modules` краще не переносити з іншого комп’ютера;
- `serialport` містить нативні компоненти, тому його краще ставити локально на цій машині.
- якщо файл уже перейменовано в `package.json`, достатньо лише `npm install`.

## Як створити конфігурацію

Скопіюй:

```text
serial_urine_bridge.env.example
```

у:

```text
serial_urine_bridge.env
```

Після цього відредагуй `serial_urine_bridge.env`.

Мінімально треба перевірити ці поля:

```env
SERIAL_URINE_COM_PORT=COM3
SERIAL_URINE_BAUD_RATE=9600
SERIAL_URINE_DATA_BITS=8
SERIAL_URINE_STOP_BITS=1
SERIAL_URINE_PARITY=none

SERIAL_URINE_SERVER_URL=http://IP_СЕРВЕРА:3000/api/analyzer/serial-result
ANALYZER_BRIDGE_TOKEN=change-me

SERIAL_URINE_BRANCH=ad
SERIAL_URINE_PRACLISTID=
SERIAL_URINE_KODZAR=
SERIAL_URINE_KODLAB=00001
SERIAL_URINE_LOOKBACK_DAYS=90
SERIAL_URINE_RESULT_OSCIS=22
SERIAL_URINE_AUTO_CONFIRM_RESULTS=true

SERIAL_URINE_ANALYZER_ID=clinitek-1
SERIAL_URINE_LABEL=Clinitek COM Analyzer
SERIAL_URINE_USE_PATIENT_ID_AS_BARCODE=true
SERIAL_URINE_DRY_RUN=false
SERIAL_URINE_MAPPING_FILE=serial_urine_mapping.example.json

SERIAL_URINE_EMULATOR_COM_PORT=COM4
SERIAL_URINE_EMULATOR_AUTO_SEND=false
SERIAL_URINE_EMULATOR_INTERVAL_MS=5000
SERIAL_URINE_EMULATOR_PRINT_ONLY=false
```

## Що означають основні параметри

- `SERIAL_URINE_COM_PORT`
  Порт, до якого підключений аналізатор, наприклад `COM3`.

- `SERIAL_URINE_SERVER_URL`
  Адреса головного сервера MedicalHub, куди міст буде надсилати результати.

- `ANALYZER_BRIDGE_TOKEN`
  Захисний токен для endpoint на сервері.

- `SERIAL_URINE_PRACLISTID` або `SERIAL_URINE_KODZAR`
  Ідентифікатор аналізатора у вашій ЛІС.
  Якщо використовуєш `praclistid`, `kodzar` можна не заповнювати.

- `SERIAL_URINE_USE_PATIENT_ID_AS_BARCODE=true`
  Означає, що `Patient ID` з рядка аналізатора використовується як ключ замовлення.
  Якщо у вас це не так, цю логіку треба буде окремо адаптувати.

- `SERIAL_URINE_MAPPING_FILE`
  JSON-файл з мапінгом кодів типу `GLU`, `KET`, `LEU` на коди, які очікує система.

## Мапінг кодів

Файл:

```text
serial_urine_mapping.example.json
```

має вигляд:

```json
{
  "GLU": "GLU",
  "BIL": "BIL",
  "KET": "KET",
  "SG": "SG",
  "BLO": "BLO",
  "pH": "pH",
  "PRO": "PRO",
  "URO": "URO",
  "NIT": "NIT",
  "LEU": "LEU"
}
```

Якщо треба, заміни праві значення на ті коди, які реально використовуються у вашій ЛІС або в мапінгу обладнання.

## Як запустити міст

Найпростіший спосіб:

- двічі клікнути:

```text
serial_urine_bridge.bat
```

Або з консолі:

```bash
node serial_urine_analyzer_agent.js
```

Якщо у папці вже є `package.json`, можна ще так:

```bash
npm start
```

## Емулятор Clinitek

Для локального тестування без реального аналізатора можна використати емулятор:

- `serial_urine_analyzer_emulator.js`
- `serial_urine_emulator.bat`

Він:
- генерує валідний CSV-рядок `Clinitek`;
- додає завершення рядка `CR`;
- надсилає дані у вказаний `COM`-порт;
- показує локальний preview після парсингу.

### Як тестувати на одному ПК

Якщо міст і емулятор запускаються на одному Windows ПК, зазвичай потрібна пара віртуальних COM-портів, наприклад:

- міст слухає `COM3`
- емулятор пише в `COM4`

У такому випадку в `serial_urine_bridge.env` можна задати:

```env
SERIAL_URINE_COM_PORT=COM3
SERIAL_URINE_EMULATOR_COM_PORT=COM4
```

### Як запустити емулятор

Інтерактивний режим:

```text
serial_urine_emulator.bat
```

або:

```bash
node serial_urine_analyzer_emulator.js
```

Режим одного повідомлення:

```bash
node serial_urine_analyzer_emulator.js 250404A1234
```

Режим тільки preview, без запису в `COM`:

```bash
node serial_urine_analyzer_emulator.js 250404A1234 --print-only
```

Автоматична відправка по таймеру:

```env
SERIAL_URINE_EMULATOR_AUTO_SEND=true
SERIAL_URINE_EMULATOR_INTERVAL_MS=5000
```

або:

```bash
node serial_urine_analyzer_emulator.js --auto
```

## Що робить `serial_urine_bridge.bat`

Файл:
- переходить у папку, де лежить сам `.bat`;
- шукає `serial_urine_bridge.env`;
- підключає його через `DOTENV_CONFIG_PATH`;
- запускає `serial_urine_analyzer_agent.js`.

Тобто основний запуск для користувача:

```text
подвійний клік по serial_urine_bridge.bat
```

## Як перевірити, що все працює

Після запуску в консолі мають бути повідомлення типу:

```text
[SERIAL-URINE] Starting COM bridge ...
[SERIAL-URINE] COM port opened COM3
```

Коли аналізатор надішле рядок, очікуються логи:

```text
[SERIAL-URINE] IN COM ...
[SERIAL-URINE] Parsed COM result ...
[SERIAL-URINE] Server response ...
```

## Типові проблеми

### 1. `serial_urine_bridge.env not found`

Причина:
- не створено `serial_urine_bridge.env`

Що робити:
- скопіювати `serial_urine_bridge.env.example` у `serial_urine_bridge.env`

### 2. `Package "serialport" is not installed`

Причина:
- не виконано `npm install`

Що робити:

```bash
npm install
```

### 3. `COM port error`

Причина:
- неправильний `COM`-порт;
- порт зайнятий іншою програмою;
- невірні serial settings.

Що робити:
- перевірити `COM` у Device Manager;
- закрити стороннє ПЗ, яке тримає порт;
- перевірити `baud rate`, `parity`, `data bits`, `stop bits`.

### 4. Сервер повертає `401 Unauthorized`

Причина:
- `ANALYZER_BRIDGE_TOKEN` не збігається з тим, що очікує сервер.

Що робити:
- звірити токен на локальному ПК і на сервері.

### 5. Дані не записуються в БД

Причина:
- ключ замовлення визначається неправильно;
- `Patient ID` не дорівнює barcode;
- не налаштований `praclistid/kodzar`;
- коди `GLU/BIL/KET...` не збігаються з мапінгом.

Що робити:
- перевірити `SERIAL_URINE_USE_PATIENT_ID_AS_BARCODE`;
- перевірити `serial_urine_mapping.example.json`;
- перевірити серверні логи endpoint `/api/analyzer/serial-result`.

## Мінімальний чекліст запуску

1. Створити `C:\Clinitek`
2. Скопіювати 8 файлів моста
3. Встановити `Node.js`
4. Виконати:

```bash
copy serial_urine_package.example.json package.json
npm install
```

5. Створити `serial_urine_bridge.env`
6. Прописати `COM`, `SERVER_URL`, `TOKEN`
7. Запустити `serial_urine_bridge.bat`

## Що можна доробити пізніше

- запуск як Windows Service;
- автозапуск при вході в систему;
- локальна черга, якщо сервер тимчасово недоступний;
- окремий лог-файл;
- точніший resolver, якщо `Patient ID` не є barcode замовлення.
