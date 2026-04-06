# ADVIA Centaur Emulator Manual

## Призначення

Цей документ описує, як користуватись емулятором `ADVIA Centaur` у цьому проєкті.

Емулятор потрібен для таких сценаріїв:

- перевірити, що bridge приймає `result` повідомлення;
- перевірити, що bridge відповідає на `Q` worklist query;
- перевірити сценарій `query -> host reply -> result`;
- локально подивитися ASTM-повідомлення без реального COM-порту.

Основний файл:

- [advia_centaur_emulator.js](c:/MedicalHub/advia_centaur_emulator.js)

Швидкий запуск:

- [centaur_emulator.bat](c:/MedicalHub/centaur_emulator.bat)

Конфіг:

- [advia_centaur_bridge.env.example](c:/MedicalHub/advia_centaur_bridge.env.example)

Файловий логер:

- [line_file_logger.js](c:/MedicalHub/line_file_logger.js)

---

## Що вміє емулятор

Підтримуються режими:

- `result`
- `query`
- `query-then-result`
- `print-only`

Підтримуються тестові коди:

- `FER`
- `TSH`
- `AFP`
- `HCG`

Також можна емулювати:

- `C` record для result comment
- `M` record для QC/control

---

## Основна логіка режимів

### `result`

Емулятор одразу шле result message:

```text
H -> P -> O -> [M] -> R... -> [C...] -> L
```

Це потрібно, коли хочете перевірити імпорт результатів у bridge без query mode.

Запуск:

```bat
centaur_emulator.bat --mode=result 0504B0005S
```

---

### `query`

Емулятор шле тільки ASTM query:

```text
H -> Q -> L
```

Після цього чекає host reply, але сам результат не шле.

Запуск:

```bat
centaur_emulator.bat --mode=query 0504B0005S
```

Це правильний режим, якщо треба перевірити:

- чи знайде bridge роботу по штрихкоду;
- чи поверне `worklist`;
- чи поверне `L|1|I`, якщо роботи нема.

---

### `query-then-result`

Емулятор:

1. шле `Q`
2. чекає відповідь host
3. якщо роботи нема, завершується
4. якщо робота є, чекає заданий час і шле result message

Запуск:

```bat
centaur_emulator.bat --mode=query-then-result 0504B0005S
```

Це найближчий до реального сценарій.

Важливо:

- якщо host поверне `L|1|I`, результат не піде;
- якщо host поверне `P/O/L` з тестами, емулятор побудує результати по тестах із reply.

---

### `print-only`

У цьому режимі COM-порт не відкривається.

Емулятор лише друкує ASTM-повідомлення в консоль.

Приклад:

```bat
centaur_emulator.bat --mode=query 0504B0005S --print-only
```

Або:

```bat
centaur_emulator.bat --mode=result 0504B0005S --print-only
```

Дуже важливе обмеження:

- у `print-only` немає реального діалогу з host;
- тому в `query-then-result` режимі він не може по-справжньому дочекатися відповіді bridge;
- цей режим потрібен тільки для перегляду формату ASTM-пакетів.

---

## Які повідомлення будує емулятор

### Query

Мінімальний `Q` виглядає так:

```text
H|\^&|||ADVCNT_LIS|||||LIS_ID||P|1
Q|1|^0504B0005S|^0504B0005S|ALL||||||||O
L|1|N
```

Якщо `CENTAUR_EMULATOR_QUERY_ALL_TESTS=false`, то замість `ALL` буде список тестів:

```text
Q|1|^0504B0005S|^0504B0005S|^^^TSH\^^^FER||||||||O
```

### Result

Типовий result message:

```text
H
P
O
R
R
L
```

Для QC-зразка може додаватися:

```text
M
```

Для result comments може додаватися:

```text
C
```

---

## Як host відповідає на query

### Якщо робота є

Bridge повертає worklist reply і в логах буде щось таке:

```text
[CENTAUR] Worklist reply sent 0504B0005S L|1|F
[CENTAUR-EMU] HOST REPLIED WORKLIST 0504B0005S tests=[TSH] L|1|F
```

### Якщо роботи нема

Bridge повертає `no information`:

```text
L|1|I
```

У логах:

```text
[CENTAUR] No work reply sent 0504B0005S L|1|I
[CENTAUR-EMU] HOST REPLIED NO WORK 0504B0005S L|1|I
```

Важливе уточнення:

- `L|1|N` у query message не означає “роботи нема”;
- `L|1|N` це просто нормальне завершення повідомлення, яке сам емулятор щойно відправив;
- відповідь host “роботи нема” це саме `L|1|I`.

---

## Основні параметри `.env`

Налаштовуються у [advia_centaur_bridge.env.example](c:/MedicalHub/advia_centaur_bridge.env.example)
або у вашому [advia_centaur_bridge.env](c:/MedicalHub/advia_centaur_bridge.env).

### Порт і низький рівень

```env
CENTAUR_EMULATOR_COM_PORT=COM7
```

Якщо `COM` не задано, емулятор не зможе працювати в реальному serial mode.

### Режим емулятора

```env
CENTAUR_EMULATOR_MODE=result
```

Можливі значення:

- `result`
- `query`
- `query-then-result`

### Автоматичний запуск

```env
CENTAUR_EMULATOR_AUTO_SEND=false
CENTAUR_EMULATOR_INTERVAL_MS=7000
```

Якщо `AUTO_SEND=true`, емулятор циклічно запускатиме сценарії через заданий інтервал.

### Режим без COM

```env
CENTAUR_EMULATOR_PRINT_ONLY=false
```

Якщо `true`, ASTM лише друкується в консоль.

### Логи в файл

```env
CENTAUR_FILE_LOG_ENABLED=true
CENTAUR_LOG_DIR=logs\\centaur
CENTAUR_EMULATOR_LOG_FILE=
```

Якщо `CENTAUR_EMULATOR_LOG_FILE` порожній, емулятор пише в файл типу:

```text
logs\\centaur\\centaur-emu-YYYY-MM-DD.log
```

На старті емулятор окремо логує:

- режим
- `printOnly`
- чи увімкнений файловий лог
- повний шлях до файлу логу

### Дані пацієнта

```env
CENTAUR_EMULATOR_PATIENT_NAME=DOE^JOHN
CENTAUR_EMULATOR_PATIENT_ID=
CENTAUR_EMULATOR_DATE_OF_BIRTH=
CENTAUR_EMULATOR_SEX=
```

### Дані зразка

```env
CENTAUR_EMULATOR_RACK_NO=
CENTAUR_EMULATOR_SAMPLE_POSITION=
```

### Які тести емулювати

```env
CENTAUR_EMULATOR_TEST_CODES=FER,TSH
```

Цей список використовується:

- у `result` mode для побудови `R` records;
- у `query` mode, якщо `CENTAUR_EMULATOR_QUERY_ALL_TESTS=false`.

### Query-поведінка

```env
CENTAUR_EMULATOR_QUERY_ALL_TESTS=false
CENTAUR_EMULATOR_QUERY_STATUS=O
```

Рекомендовано для звичайного worklist query:

```env
CENTAUR_EMULATOR_QUERY_STATUS=O
```

### Result-поведінка

```env
CENTAUR_EMULATOR_RESULT_STATUS=F
CENTAUR_EMULATOR_DILUTION_PROTOCOL=
CENTAUR_EMULATOR_DILUTION_RATIO=
CENTAUR_EMULATOR_ABNORMAL_FLAG=
```

### Comment і QC

```env
CENTAUR_EMULATOR_RESULT_COMMENT_CODE=
CENTAUR_EMULATOR_RESULT_COMMENT_TEXT=
CENTAUR_EMULATOR_CONTROL_NAME=CTRL1
CENTAUR_EMULATOR_CONTROL_LOT=000001
```

### Таймаути

```env
CENTAUR_EMULATOR_RESULT_DELAY_MS=30000
CENTAUR_EMULATOR_QUERY_TIMEOUT_MS=8000
```

---

## Типові команди

### 1. Просто віддати результат

```bat
centaur_emulator.bat --mode=result 0504B0005S
```

### 2. Тільки запитати роботу

```bat
centaur_emulator.bat --mode=query 0504B0005S
```

### 3. Повний сценарій query -> result

```bat
centaur_emulator.bat --mode=query-then-result 0504B0005S
```

### 4. Подивитися ASTM без COM

```bat
centaur_emulator.bat --mode=query 0504B0005S --print-only
```

### 5. Передати конкретні тести

```bat
set CENTAUR_EMULATOR_TEST_CODES=TSH,AFP
centaur_emulator.bat --mode=result 0504B0005S
```

---

## Типові сценарії тестування

### Перевірка “нема роботи”

1. Запустити bridge.
2. Запустити:

```bat
centaur_emulator.bat --mode=query 0504B0005S
```

3. У логах bridge очікувати:

```text
[CENTAUR] No work reply sent 0504B0005S L|1|I
```

4. У логах емулятора очікувати:

```text
[CENTAUR-EMU] HOST REPLIED NO WORK 0504B0005S L|1|I
```

### Перевірка “робота є”

1. Підготуйте в LIS незавершене замовлення для штрихкоду.
2. Запустіть:

```bat
centaur_emulator.bat --mode=query 0504B0006S
```

3. Перевірте, що host повернув `worklist`.

### Перевірка повного циклу

1. Має бути незавершене замовлення в LIS.
2. Запустіть:

```bat
centaur_emulator.bat --mode=query-then-result 0504B0006S
```

3. Емулятор має:

- отримати `worklist`
- почекати `CENTAUR_EMULATOR_RESULT_DELAY_MS`
- відправити `result`

---

## Типові помилки

### Емулятор шле `result`, хоча ви хотіли `query`

Причина:

- вибрано `CENTAUR_EMULATOR_MODE=result`
- або запуск зроблений з `--mode=result`

Рішення:

```bat
centaur_emulator.bat --mode=query 0504B0005S
```

### У логах видно `L|1|N`, а не `L|1|I`

Причина:

- це, швидше за все, termination record повідомлення, яке щойно відправив сам емулятор;
- це не host reply.

Потрібно дивитися саме на лог:

```text
HOST REPLIED NO WORK
```

або:

```text
HOST REPLIED WORKLIST
```

### У режимі `query-then-result` у `print-only` усе одно друкується `result`

Причина:

- у `print-only` немає реального host reply;
- це демонстраційний режим перегляду пакетів.

Для реального тесту треба:

```env
CENTAUR_EMULATOR_PRINT_ONLY=false
```

і запуск через справжній `COM`.

### Bridge не відповідає на `Q`

Перевірити:

- чи запущений [advia_centaur_agent.js](c:/MedicalHub/advia_centaur_agent.js)
- чи `CENTAUR_DISABLE_QUERY_RESPONSE=false`
- чи правильно налаштовані `COM` порти
- чи не переплутані host/emulator порти

---

## Практична рекомендація

Для реальної перевірки bridge найкорисніші саме два режими:

- `query`
- `query-then-result`

`result` mode корисний, коли треба лише швидко перевірити запис результату в LIS.

`print-only` використовуйте тільки для читання формату ASTM-повідомлень.
