# ADVIA Centaur ASTM Bridge Manual

## Призначення

Цей документ описує поточну реалізацію локального `COM/RS-232` моста для `ADVIA Centaur / Centaur XP / Centaur CP` у цьому проєкті.

Схема роботи така:

```text
ADVIA Centaur -> COM/RS232 -> локальний Windows ПК -> Node.js bridge -> HTTP -> MedicalHub -> Sybase
```

Міст потрібен для двох основних сценаріїв:

- прийом результатів від аналізатора в LIS;
- прийом `Q`-запиту від аналізатора і відправка назад `worklist` відповіді.

---

## Дуже важливе уточнення

Для `ADVIA Centaur` у Siemens manual описані **дві різні інтеграції**:

1. `Section 3: Implementation of ASTM Protocols`
2. `Section 5: Laboratory Automation Interface`

У цьому каркасі реалізується тільки:

- **Section 3**
- тобто **ASTM LIS / Host interface**

Не реалізується:

- `LAS automation protocol`
- hex-команди типу `F0 ... F8`
- `Test Map Command`, `Reagent Status`, `Reset Queue`, `Add Tube` з розділу 5

Тобто якщо ви підключаєте аналізатор до LIS, вам потрібен саме цей міст.  
Якщо ви колись підключатимете `Centaur` до трек-системи або LAS, це буде інший драйвер.

---

## Основні файли

- [advia_centaur_agent.js](c:/MedicalHub/advia_centaur_agent.js)  
  Основний COM-агент для `ADVIA Centaur`.

- [advia_centaur_parser.js](c:/MedicalHub/advia_centaur_parser.js)  
  Parser/builder для ASTM records `H/P/O/R/Q/C/M/L`.

- [advia_centaur_emulator.js](c:/MedicalHub/advia_centaur_emulator.js)  
  Емулятор аналізатора для локального тесту.

- [ADVIA_CENTAUR_EMULATOR_MANUAL.md](c:/MedicalHub/ADVIA_CENTAUR_EMULATOR_MANUAL.md)  
  Окремий мануал по роботі з емулятором `ADVIA Centaur`.

- [astm_e1381_link.js](c:/MedicalHub/astm_e1381_link.js)  
  Спільний ASTM transport layer alias над уже перевіреним `sysmex` link layer.

- [advia_centaur_bridge.env.example](c:/MedicalHub/advia_centaur_bridge.env.example)  
  Приклад конфігурації для агента й емулятора.

- [advia_centaur_mapping.example.json](c:/MedicalHub/advia_centaur_mapping.example.json)  
  Мапінг кодів результатів аналізатора на коди, які очікує LIS ingest.

- [line_file_logger.js](c:/MedicalHub/line_file_logger.js)  
  Простий файловий логер для `Centaur` bridge та емулятора.

- [sybase_analyzer_result_ingest.js](c:/MedicalHub/sybase_analyzer_result_ingest.js)  
  Універсальний ingester для пошуку замовлення і запису результатів у Sybase.

- [KT_BackendNew.js](c:/MedicalHub/KT_BackendNew.js)  
  Серверний endpoint `/api/analyzer/serial-result`.

---

## Що вже реалізовано

### 1. ASTM transport layer

Реалізовано стандартний ASTM transport:

- `ENQ -> ACK/NAK`
- `STX ... ETB/ETX ... checksum CR LF`
- `EOT`
- розбиття на кадри до `240` символів
- frame numbers `1..7,0`
- retry після `NAK`
- timeout і завершення сеансу

### 2. Result receive

Підтримується прийом ASTM result message:

```text
H -> P -> O -> [M] -> R... -> [C...] -> L
```

Після цього агент:

1. парсить message
2. будує JSON payload
3. шле його на `/api/analyzer/serial-result`
4. сервер записує результати у Sybase

### 3. Query reply

Підтримується прийом query message:

```text
H -> Q -> L
```

Після цього агент:

1. бере `sampleId` із `Q3`
2. шукає worklist у Sybase
3. повертає назад:

або worklist:
```text
H -> P -> O -> [M] -> L
```

або “нічого не знайдено”:
```text
H -> L
```

### 4. Емулятор

Є окремий емулятор:

- `result`
- `query`
- `query-then-result`
- `print-only`

Він уміє генерувати:

- `FER`
- `TSH`
- `AFP`
- `HCG`

А також:

- `C` result comment
- `M` manufacturer record для QC

### 5. Файловий логер

Для `Centaur` bridge і емулятора додано окреме логування в файл.

Керується через `.env`:

```env
CENTAUR_FILE_LOG_ENABLED=true
CENTAUR_LOG_DIR=logs\\centaur
CENTAUR_AGENT_LOG_FILE=
CENTAUR_EMULATOR_LOG_FILE=
```

За замовчуванням:

- агент пише у файл типу `logs\\centaur\\centaur-YYYY-MM-DD.log`
- емулятор пише у файл типу `logs\\centaur\\centaur-emu-YYYY-MM-DD.log`

Ті самі записи лишаються і в консолі.

---

## Який саме ASTM profile реалізований

Поточна реалізація орієнтується на `ADVIA Centaur / ADVIA Centaur XP Interface Specification Guide`, розділ 3.

Підтримані records:

- `H` header
- `P` patient
- `O` order
- `R` result
- `Q` query
- `C` comment
- `M` manufacturer
- `L` termination

Зараз **не реалізовано окрему бізнес-логіку** для:

- `S` scientific record
- повного аналізу всіх типів `C/M`
- спеціальних error-comment сценаріїв із Siemens manual

---

## Важливі особливості ADVIA Centaur

### 1. Це двосторонній ASTM host interface

Прилад:

- приймає worklist від LIS
- сам може запитувати worklist
- відправляє результати в LIS
- відповідає на query по worklist/results

### 2. Результати від LIS у прилад не передаються

Згідно з manual:

- `incoming result records from a remote system` прилад відхиляє / ігнорує

Тобто:

- `LIS -> analyzer`: worklist / query replies
- `analyzer -> LIS`: results / query / result query responses

### 3. Checksum рахується без `STX`

Для `ADVIA Centaur` checksum покриває:

```text
[F#] + [text] + [ETX/ETB]
```

Тобто:

- `STX` не входить у checksum
- `CR/LF` не входять

У конфігу це:

```env
CENTAUR_CHECKSUM_INCLUDE_STX=false
```

---

## ASTM records і ключові поля

### Header `H`

Використовується для:

- `senderId`
- `receiverId`
- `processingId`
- `version`

У цьому проєкті:

- LIS host за замовчуванням: `LIS_ID`
- analyzer receiver: `ADVCNT_LIS`

### Patient `P`

Зараз використовується для:

- `patientId`
- `patientName`
- `dateOfBirth`
- `sex`
- `physicianId`
- `location`

### Order `O`

Ключові поля:

- `O3` specimen ID
  - `sampleId`
  - `rackNo`
  - `samplePosition`
- `O5.4`
  - код тесту
- `O5.5`
  - dilution protocol
- `O5.6`
  - dilution ratio
- `O6`
  - priority (`R`, `S`)
- `O12`
  - action code
- `O26`
  - report type

### Manufacturer `M`

Зараз підтримується базовий `M` для QC:

- `CCD^ACS:NG^V1^O`
- `controlName`
- `controlLotNumber`

### Result `R`

Ключові поля:

- `R3.4`
  код тесту
- `R3.5`
  dilution protocol
- `R3.6`
  dilution ratio
- `R3.7`
  replicate number
- `R3.8`
  result aspect
- `R4`
  value
- `R5`
  units
- `R6`
  allergy class range
- `R7`
  abnormal flags
- `R9`
  result status
- `R13`
  completed datetime

### Comment `C`

Зараз parser приймає:

- `comment source`
- `comment code`
- `comment text`
- `comment type`

`C` records підвішуються:

- до `R`, якщо comment іде після result
- до `O`, якщо comment іде після order
- до `P`, якщо comment іде після patient

### Query `Q`

Зараз використовуються:

- `Q3`
  sample selection
- `Q4`
  ending range
- `Q5`
  test list або `ALL`
- `Q13`
  request information status code

---

## Message kinds у parser

Parser [advia_centaur_parser.js](c:/MedicalHub/advia_centaur_parser.js) зараз розрізняє:

- `query`
- `result`
- `worklist`
- `unknown`

Це використовується в логах і в agent flow.

---

## Query mode логіка

### Що приходить від приладу

Типовий запит:

```text
H
Q
L
```

Приклад:

```text
Q|1|^SID555|^SID555|^^^FER\^^^HCG||||||||O
```

Це означає:

- sampleId = `SID555`
- requested tests = `FER`, `HCG`
- status code = `O` = request tests / worklist

### Що віддає LIS

Якщо worklist знайдено:

```text
H
P
O
[M]
L|1|F
```

Якщо worklist не знайдено:

```text
H
L|1|I
```

Якщо query неправильний:

```text
H
L|1|Q
```

### Як формується список тестів

Поточний agent:

- бере записи з SQL
- дістає `analyzer_test_code` / `analyzer_test_code2`
- будує список кодів для `O5.4`

Параметр:

```env
CENTAUR_ORDER_CODE_SOURCE=secondary_or_primary
```

Варіанти:

- `secondary_or_primary`
- `primary`

### Що означають termination codes у reply

- `F`
  query закрита, дані відправлено
- `I`
  information not available
- `Q`
  query in error

---

## Result flow

Типовий message:

```text
H
P
O
[M]
R
[C]
R
[C]
L
```

Агент:

1. парсить `sampleId` з `O3`
2. перетворює кожен `R` у `observations[]`
3. додає metadata з `C/M`
4. шле payload у MedicalHub

### Payload

Payload містить:

- `barcode`
- `sampleId`
- `patientId`
- `patientName`
- `rackNo`
- `tubePosition`
- `comments`
- `manufacturerRecords`
- `observations[]`

Кожен observation містить:

- `observationId`
- `value`
- `valueType`
- `units`
- `abnormalFlag`
- `status`
- `measuredAt`
- `metadata.resultAspect`
- `metadata.replicateNumber`
- `metadata.dilutionProtocol`
- `metadata.dilutionRatio`
- `metadata.resultStatus`
- `metadata.comments`

---

## Налаштування середовища

Створи робочий конфіг на основі:

- [advia_centaur_bridge.env.example](c:/MedicalHub/advia_centaur_bridge.env.example)

Мінімальний приклад:

```env
CENTAUR_COM_PORT=COM6
CENTAUR_BAUD_RATE=9600
CENTAUR_DATA_BITS=8
CENTAUR_STOP_BITS=1
CENTAUR_PARITY=none

CENTAUR_SERVER_URL=http://127.0.0.1:3090/api/analyzer/serial-result
ANALYZER_BRIDGE_TOKEN=change-me

CENTAUR_BRANCH=ad
CENTAUR_PRACLISTID=ADVCENTAUR
CENTAUR_KODZAR=
CENTAUR_KODLAB=00001

CENTAUR_ANALYZER_ID=advia-centaur-1
CENTAUR_LABEL=ADVIA Centaur ASTM
CENTAUR_MAPPING_FILE=advia_centaur_mapping.example.json
CENTAUR_CHECKSUM_INCLUDE_STX=false
```

---

## Що означають основні параметри

### COM

- `CENTAUR_COM_PORT`
- `CENTAUR_BAUD_RATE`
- `CENTAUR_DATA_BITS`
- `CENTAUR_STOP_BITS`
- `CENTAUR_PARITY`

### LIS / Sybase

- `CENTAUR_BRANCH`
- `CENTAUR_PRACLISTID`
- `CENTAUR_KODZAR`
- `CENTAUR_KODLAB`
- `CENTAUR_LOOKBACK_DAYS`
- `CENTAUR_RESULT_OSCIS`
- `CENTAUR_AUTO_CONFIRM_RESULTS`

### Host interface

- `CENTAUR_HOST_SENDER_ID`
- `CENTAUR_INSTRUMENT_RECEIVER_ID`
- `CENTAUR_PROCESSING_ID`
- `CENTAUR_VERSION`
- `CENTAUR_ORDER_CODE_SOURCE`
- `CENTAUR_DEFAULT_DILUTION_PROTOCOL`
- `CENTAUR_DEFAULT_DILUTION_RATIO`
- `CENTAUR_DEFAULT_PRIORITY`
- `CENTAUR_CHECKSUM_INCLUDE_STX`

### QC / Manufacturer record

- `CENTAUR_QC_CONTROL_NAME`
- `CENTAUR_QC_CONTROL_LOT`

Якщо sample looks like `QC...`, agent може додати `M` record у reply.

---

## Result mapping

Файл:

- [advia_centaur_mapping.example.json](c:/MedicalHub/advia_centaur_mapping.example.json)

Поточний приклад:

```json
{
  "TSH": "TSH",
  "AFP": "AFP",
  "FER": "FER",
  "HCG": "HCG"
}
```

Ліва частина:

- код, який приходить у `R3.4`

Права частина:

- код, який шукається серверним ingest у `analyzer_test_code` / `analyzer_test_code2`

---

## Емулятор

Запуск:

```bash
npm run centaur-emulator
```

### Режими

- `result`
- `query`
- `query-then-result`
- `print-only`

### Корисні параметри

- `CENTAUR_EMULATOR_TEST_CODES=FER,TSH`
- `CENTAUR_EMULATOR_QUERY_STATUS=O`
- `CENTAUR_EMULATOR_RESULT_STATUS=F`
- `CENTAUR_EMULATOR_RESULT_COMMENT_CODE=Above Check`
- `CENTAUR_EMULATOR_CONTROL_NAME=CTRL1`
- `CENTAUR_EMULATOR_CONTROL_LOT=000001`
- `CENTAUR_EMULATOR_RESULT_DELAY_MS=30000`

### Приклади

Тільки друк result:

```bash
node advia_centaur_emulator.js --mode=result --print-only SID123
```

Запит worklist:

```bash
node advia_centaur_emulator.js --mode=query --print-only SID555
```

Повний сценарій:

```bash
node advia_centaur_emulator.js --mode=query-then-result SID555
```

---

## Логи

Агент пише в консоль із префіксом:

```text
[CENTAUR]
```

Корисні логи:

- `Startup config`
- `IN/OUT ENQ/ACK/NAK/EOT`
- `IN FRAME`
- `Parsed query`
- `Query requested vs returned`
- `Parsed result payload`
- `Server response`

Емулятор пише з префіксом:

```text
[CENTAUR-EMU]
```

---

## Рекомендований план тестування

### 1. Dry run

Постав:

```env
CENTAUR_DRY_RUN=true
```

Перевір:

- чи читається `sampleId`
- чи правильно мапляться `FER/TSH/AFP/HCG`
- чи payload доходить до server layer без падіння

### 2. Query test

Перевір:

- чи при `Q` агент дістає правильну заявку
- чи reply має `L|1|F`, `L|1|I` або `L|1|Q`
- чи `O5.4` містить саме ті коди, які знає `Centaur`

### 3. Result test

Перевір:

- чи `R3.4` правильно мапиться в LIS
- чи `R3.8` не губиться
- чи `C` comments зберігаються в metadata

### 4. QC test

Перевір:

- чи при QC sample додається `M` record
- чи `control name / lot` проходять коректно

---

## Типові проблеми

### 1. `Unsupported barcode format`

Причина:

- `sampleId` від `Centaur` не збігається з тим, як у нас зараз парситься barcode для Sybase lookup

Що робити:

- або узгодити формат `sampleId`
- або адаптувати barcode parser в [sybase_analyzer_result_ingest.js](c:/MedicalHub/sybase_analyzer_result_ingest.js)

### 2. `resolved to 0 orders`

Причина:

- не той `CENTAUR_PRACLISTID`
- не той `CENTAUR_KODZAR`
- не той `sampleId`

Що перевірити:

1. `Startup config`
2. `CENTAUR_PRACLISTID`
3. `CENTAUR_KODZAR`
4. `CENTAUR_KODLAB`

### 3. Query прийшов, але reply порожній

Причина:

- в Sybase нема worklist
- `Q13` не підтримується
- `sampleId` не співпав

### 4. Result прийшов, але observation пішов у skipped

Причина:

- `advia_centaur_mapping.example.json` не збігається з `analyzer_test_code`

### 5. Не плутати ASTM з LAS

Якщо в логах або в документації ви бачите:

- `F0 ... F8`
- `B4`
- `BF`
- `AE`
- `Reset Queue`
- `Add Tube`

це вже не ASTM host interface, а `Laboratory Automation Interface`.

---

## Поточні обмеження

- Немає окремої реалізації `LAS` протоколу з розділу 5
- Не реалізовано весь спектр `result comments` та Siemens-specific error replies
- Немає окремого group-mapping як у `CA-1500`, бо для `Centaur` query логічніше будувати напряму по test codes
- Мапінг тестів поки лише прикладовий

---

## Що доопрацьовувати далі

Найлогічніші наступні кроки:

1. підставити реальні коди `Centaur` у [advia_centaur_mapping.example.json](c:/MedicalHub/advia_centaur_mapping.example.json)
2. зробити бойовий [advia_centaur_bridge.env](c:/MedicalHub/advia_centaur_bridge.env)
3. додати `.bat` для агента і емулятора
4. при потребі додати окремий `query code mapping`, якщо ваш LIS повертає інші коди для worklist, ніж для result
5. якщо знадобиться трек/LAS, робити окремий драйвер під розділ 5
