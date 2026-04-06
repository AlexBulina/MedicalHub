# Sysmex CA-1500 ASTM Bridge Manual

## Призначення

Цей документ описує поточну реалізацію локального `COM/RS-232` моста для `Sysmex CA-1500` у цьому проєкті.

Схема роботи така:

```text
Sysmex CA-1500 -> COM/RS232 -> локальний Windows ПК -> Node.js bridge -> HTTP -> MedicalHub -> Sybase
```

Міст потрібен для двох сценаріїв:

- прийом результатів від аналізатора у режимі "сліпа передача";
- прийом `Q`-запиту від аналізатора і відправка назад `H/P/O/L` worklist-відповіді.

---

## Основні файли

- [sysmex_ca1500_agent.js](c:/MedicalHub/sysmex_ca1500_agent.js)
  Основний агент для `COM`-порту, який приймає ASTM, парсить повідомлення і шле результати в MedicalHub.

- [sysmex_ca1500_astm.js](c:/MedicalHub/sysmex_ca1500_astm.js)
  Низькорівневий ASTM transport layer:
  `ENQ`, `ACK`, `NAK`, `EOT`, frame-розбиття, checksum, retry, timeout.

- [sysmex_ca1500_parser.js](c:/MedicalHub/sysmex_ca1500_parser.js)
  Парсер і builder для записів `H/P/Q/O/R/L`.

- [sysmex_ca1500_bridge.env.example](c:/MedicalHub/sysmex_ca1500_bridge.env.example)
  Приклад конфігурації для запуску моста.

- [sysmex_ca1500_mapping.example.json](c:/MedicalHub/sysmex_ca1500_mapping.example.json)
  Приклад мапінгу кодів параметрів аналізатора на коди, які очікує LIS.

- [sysmex_ca1500_order_groups.example.json](c:/MedicalHub/sysmex_ca1500_order_groups.example.json)
  Приклад group-mapping для query mode, коли один код `CA-1500` відповідає кільком LIS тестам.

- [sybase_analyzer_result_ingest.js](c:/MedicalHub/sybase_analyzer_result_ingest.js)
  Універсальний ingester, який знаходить замовлення в Sybase і записує результати.

- [KT_BackendNew.js](c:/MedicalHub/KT_BackendNew.js)
  Серверний endpoint `/api/analyzer/serial-result`, який приймає JSON від локального моста.

- [package.json](c:/MedicalHub/package.json)
  npm script для запуску `CA-1500` агента.

---

## Що вже реалізовано

### 1. ASTM transport layer

Реалізовано повний базовий transport для `CA-1500`:

- `ENQ -> ACK/NAK`
- передача frame-ів у форматі:

```text
[STX][F#][text][ETX/ETB][CHK1][CHK2][CR][LF]
```

- розбиття повідомлення на кілька frame-ів, якщо текст довший за `240` символів;
- frame numbers: `1,2,3,4,5,6,7,0`;
- завершення передачі через `EOT`;
- retry того самого frame після `NAK`;
- обрив сесії при перевищенні timeout або ліміту повторів.

### 2. Прийом result output

Агент приймає ASTM-повідомлення з результатами у вигляді:

```text
H -> P -> O -> R... -> L
```

Після цього:

1. парсить повідомлення;
2. будує JSON payload;
3. шле його на `/api/analyzer/serial-result`;
4. сервер записує результати у Sybase.

### 3. Query mode

Якщо аналізатор шле ASTM `Q` record:

```text
H -> Q -> L
```

агент:

1. парсить `sampleNo`, `rackNo`, `tubePosition`, список тестів;
2. намагається знайти worklist у Sybase;
3. будує host reply:

```text
H -> P -> O -> L
```

4. відправляє його назад у `CA-1500`.

### 3.1. Fail-soft query mode

Якщо під час query mode виникає одна з проблем:

- немає підключення до Sybase;
- не підхопився `DB_DSN_SYBASE`;
- barcode не розібрався;
- SQL lookup завершився помилкою;

агент не завершує процес і не валить міст.

Замість цього він:

1. логує помилку;
2. формує порожню відповідь `H/P/O/L`;
3. для аналізатора це виглядає як "роботи нема".

### 3.2. Group-mapping для query mode

У `CA-1500` апарат часто запитує батьківські коди типу:

- `040`
- `050`
- `060`

А в LIS реально можуть лежати:

- analyzer codes `041/042/043/044`;
- або власні `kodvys`;
- або інші внутрішні коди лабораторії.

Через це в query mode додано окремий group-mapping:

- [sysmex_ca1500_order_groups.example.json](c:/MedicalHub/sysmex_ca1500_order_groups.example.json)

Приклад:

```json
{
  "040": ["040", "041", "042", "043", "044"],
  "050": ["050", "051"],
  "060": ["060", "061", "062"],
  "510": ["510", "511", "513"]
}
```

Логіка така:

- якщо в заявці знайдені тести, які входять у групу `040`, то в `O` reply назад у прилад піде тільки `040`;
- якщо знайдено тести групи `050`, піде `050`;
- якщо в заявці немає жодного тесту з групи `060`, код `060` у reply не піде.

Окремий важливий випадок:

- `TT` у LIS може зберігатися як `511`;
- але в `Q/O` для `CA-1500` ця робота йде як група `510`;
- тобто ланцюг нормальний такий:
  - у LIS знайдено `511`
  - group-mapping схлопує його в `510`
  - у `O` reply назад у прилад іде `510`
  - у результатах від аналізатора потім може прийти `511`

### 3.3. Match source для group-mapping

Group-mapping можна прив’язувати:

- до analyzer codes;
- до `kodvys`;
- або до обох джерел одразу.

Для цього є параметр:

```env
CA1500_ORDER_GROUP_MATCH_SOURCE=auto
```

Варіанти:

- `auto`
  Агент пробує і analyzer codes, і `kodvys`

- `analyzer_codes`
  Групування тільки по `analyzer_test_code` / `analyzer_test_code2`

- `kodvys`
  Групування тільки по `row.kodvys`

Практичне правило вибору:

- `kodvys`
  Використовуйте, якщо в [sysmex_ca1500_order_groups.example.json](c:/MedicalHub/sysmex_ca1500_order_groups.example.json) у вас записані саме внутрішні коди LIS.
  Приклад:
  ```json
  { "510": ["511", "513"] }
  ```

- `analyzer_codes`
  Використовуйте, якщо в group-mapping записані не LIS-коди, а коди з полів `analyzer_test_code` / `analyzer_test_code2`.
  Приклад:
  ```json
  { "040": ["041", "042", "044"] }
  ```

- `auto`
  Використовуйте, якщо на майданчику змішана схема або ви ще не впевнені, в якому саме полі лежать правильні коди для групування.
  Це зручно для первинної діагностики, але для стабільної бойової роботи краще перейти на явний режим `kodvys` або `analyzer_codes`.

Для майданчиків, де LIS використовує власні внутрішні коди, зазвичай потрібен режим:

```env
CA1500_ORDER_GROUP_MATCH_SOURCE=kodvys
```

### 4. Перетворення result records у payload

Кожен `R` record перетворюється в один елемент `observations[]`.

У payload входять:

- `barcode`
- `sampleId`
- `patientName`
- `rackNo`
- `tubePosition`
- `sampleAttribute`
- `expandedOrderFlag`
- `observations[]`

Кожен observation містить:

- `code`
- `observationId`
- `observationName`
- `value`
- `valueType`
- `units`
- `abnormalFlag`
- `measuredAt`
- `metadata.dilution`
- `metadata.resultType`
- `metadata.expandOrderRequired`
- `metadata.expandOrderResult`
- `metadata.reflexRequired`

---

## Який ASTM profile використовується

Поточна реалізація орієнтується на `CA-1500 ASTM Serial Interface Spec`.

Підтримані записи:

- `H` header
- `P` patient
- `Q` request
- `O` test order
- `R` result
- `L` termination

Записи `C/M/S` у поточному драйвері не використовуються.

---

## Як парсяться записи

### Header record `H`

Використовується для читання:

- назви аналізатора;
- версії ПЗ;
- `Instrument No`;
- `User Instrument No`.

Ці дані зараз ідуть переважно в metadata і логування.

### Patient record `P`

Використовується для:

- `patientId`
- `patientName`

У практиці `CA-1500` основним ключем пошуку все одно є не пацієнт, а `sampleNo` із `O` або `Q`.

### Request record `Q`

З `Q` driver бере:

- `rackNo`
- `tubePosition`
- `sampleNo`
- `sampleAttribute`
- список тестів
- `requestStartAt`

### Test order record `O`

З `O` driver бере:

- `rackNo`
- `tubePosition`
- `sampleNo`
- `sampleAttribute`
- `expandedOrderFlag`
- `priority`
- `requestedAt`
- `actionCode`

### Result record `R`

З `R` driver бере:

- `testCode`
- `testName`
- `dilution`
- `resultType`
- `expandOrderRequired`
- `expandOrderResult`
- `reflexRequired`
- `value`
- `units`
- `abnormalFlag`
- `completedAt`

---

## Result type і службові прапори

У `CA-1500` result records містять додаткові службові поля.

Поточний driver їх не викидає, а зберігає в metadata.

### `resultType`

Найчастіше зустрічаються:

- `1` звичайний результат
- `2` середній результат при double measurement
- `3` review / expanded result
- `4` review average / expand order average

### `expandOrderRequired`

Типові значення:

- `D`
- `R`

### `expandOrderResult`

Типові значення:

- `D`
- `R`
- `F`

### `reflexRequired`

Типове значення:

- `F`

На поточному етапі ці прапори:

- не блокують запис результату;
- не змінюють логіку інжесту в Sybase;
- зберігаються як metadata для майбутньої бізнес-логіки.

---

## Як знайдеться замовлення в LIS

### При прийомі результатів

Driver відправляє payload на:

```text
/api/analyzer/serial-result
```

Далі серверний ingester:

1. бере `barcode/sampleId/patientId`;
2. розбирає його через поточний barcode parser;
3. знаходить відповідну заявку в Sybase;
4. мапить `observationId` на `kodvys` через:
   - `c_okb_prac_list`
   - `c_okb_prac_list_varianty`
5. записує результати в:
   - `nis.ziad_okb_pom`
   - `nis.ziad_okb_pra_pom`

### Важливе обмеження

Поточний query mode очікує, що `sampleNo` від `CA-1500` сумісний із наявною логікою пошуку barcode в [sybase_analyzer_result_ingest.js](c:/MedicalHub/sybase_analyzer_result_ingest.js).

Тобто якщо `sampleNo` у вас:

- не LIS barcode;
- не `YYMMDD + typziad + evidcis`;
- не один із уже підтриманих форматів,

тоді query lookup доведеться адаптувати окремо.

Це найімовірніше місце, де може знадобитися доопрацювання під реальний майданчик.

### Підхоплення Sybase DSN

Агент запускається через:

- [sysmex_ca1500_bridge.env](c:/MedicalHub/sysmex_ca1500_bridge.env)

Але query mode для пошуку роботи в Sybase використовує `DB_DSN_SYBASE`.

Щоб не дублювати всі змінні, агент додатково підчитує основний:

- [`.env`](c:/MedicalHub/.env)

Тобто схема така:

1. локальний `sysmex_ca1500_bridge.env`
2. fallback до кореневого `.env`

На практиці це означає, що якщо в `sysmex_ca1500_bridge.env` не заданий `DB_DSN_SYBASE`, агент усе одно може взяти його з основного `.env`.

---

## Налаштування середовища

Створи робочий `.env` на основі:

- [sysmex_ca1500_bridge.env.example](c:/MedicalHub/sysmex_ca1500_bridge.env.example)

Мінімальний приклад:

```env
CA1500_COM_PORT=COM3
CA1500_BAUD_RATE=9600
CA1500_DATA_BITS=8
CA1500_STOP_BITS=1
CA1500_PARITY=none

CA1500_SERVER_URL=http://127.0.0.1:3000/api/analyzer/serial-result
ANALYZER_BRIDGE_TOKEN=change-me

CA1500_BRANCH=ad
CA1500_PRACLISTID=CA1500
CA1500_KODZAR=10001
CA1500_KODLAB=00001

CA1500_MAPPING_FILE=sysmex_ca1500_mapping.example.json
CA1500_ORDER_GROUP_MAPPING_FILE=sysmex_ca1500_order_groups.example.json
CA1500_ORDER_GROUP_MATCH_SOURCE=kodvys
CA1500_ALLOW_UNREQUESTED_GROUPS=true
CA1500_QUERY_GROUP_DEBUG=true
CA1500_DRY_RUN=false
CA1500_DISABLE_QUERY_RESPONSE=false
CA1500_CHECKSUM_INCLUDE_STX=false
```

### Робочий baseline для цього майданчика

Станом на поточну робочу конфігурацію підтверджено:

- `CA1500_PRACLISTID=CA1500`
- `CA1500_KODZAR=10001`
- `CA1500_KODLAB=00001`
- `CA1500_ORDER_GROUP_MATCH_SOURCE=kodvys`
- `CA1500_ALLOW_UNREQUESTED_GROUPS=true`
- `CA1500_QUERY_GROUP_DEBUG=true`
- `CA1500_CHECKSUM_INCLUDE_STX=false`

Якщо починати з нуля на цьому ж майданчику, краще стартувати саме з цих значень.

---

## Що означають основні параметри

### COM параметри

- `CA1500_COM_PORT`
  COM-порт аналізатора, наприклад `COM3`.

- `CA1500_BAUD_RATE`
  Швидкість порту. Типовий стартовий варіант: `9600`.

- `CA1500_DATA_BITS`
  Зазвичай `8`.

- `CA1500_STOP_BITS`
  Зазвичай `1`.

- `CA1500_PARITY`
  Зазвичай `none`.

### Endpoint і безпека

- `CA1500_SERVER_URL`
  Адреса MedicalHub, куди агент шле payload з результатами.

- `ANALYZER_BRIDGE_TOKEN`
  Токен для захисту endpoint `/api/analyzer/serial-result`.

### Прив’язка аналізатора до LIS

- `CA1500_PRACLISTID`
  Ідентифікатор аналізатора у `c_okb_prac_list`.

- `CA1500_KODZAR`
  Альтернативний спосіб прив’язки через `kodzar`.

Заповнювати треба хоча б один із них.

Для поточного робочого підключення використовується:

```env
CA1500_PRACLISTID=CA1500
CA1500_KODZAR=10001
```

### Параметри пошуку замовлення

- `CA1500_KODLAB`
  Код лабораторії.

- `CA1500_LOOKBACK_DAYS`
  Скільки днів назад шукати заявку по barcode.

- `CA1500_SHORT_BARCODE_WITH_SAMPLE_MODE`
  Режим розбору коротких barcode, якщо у вас вони використовуються.

### Параметри інжесту

- `CA1500_RESULT_OSCIS`
  `oscisvys`, який буде проставлено при записі результатів.

- `CA1500_AUTO_CONFIRM_RESULTS`
  Якщо `true`, результат одразу піде в підтверджений стан.

### Ідентифікація моста

- `CA1500_ANALYZER_ID`
  Внутрішній ID агента.

- `CA1500_LABEL`
  Людська назва аналізатора в логах і payload.

- `CA1500_IDENTIFIER_SOURCE`
  Звідки брати `barcode` для payload.
  Поточне значення за замовчуванням: `sample_no`.

- `CA1500_MAPPING_FILE`
  Мапінг кодів результатів, які приходять від `CA-1500`, на коди, що очікує LIS ingest.

### Query mode

- `CA1500_DISABLE_QUERY_RESPONSE`
  Якщо `true`, агент не відповідатиме на `Q` host-order повідомленням.

- `CA1500_HOST_NAME`
  Ім’я host у `H` record.

- `CA1500_INSTRUMENT_NO`
  Значення для `Receiver ID`/metadata при відповіді host.

- `CA1500_USER_INSTRUMENT_NO`
  Додатковий user instrument номер.

- `CA1500_DEFAULT_DILUTION`
  Dilution, який підставляється в `O` record host reply.

- `CA1500_ORDER_CODE_SOURCE`
  Який analyzer code віддавати в query reply.
  Поточний варіант:
  - `secondary_or_primary`
  або
  - `primary`

- `CA1500_ORDER_GROUP_MAPPING_FILE`
  JSON-файл, який описує, які коди входять у групи `040/050/060/...`

- `CA1500_ORDER_GROUP_MATCH_SOURCE`
  Як саме агент має зіставляти рядки із SQL з групами:
  - `auto`
  - `kodvys`
  - `analyzer_codes`

Для нестандартних LIS-кодів рекомендується:

```env
CA1500_ORDER_GROUP_MATCH_SOURCE=kodvys
```

- `CA1500_ALLOW_UNREQUESTED_GROUPS`
  Якщо `true`, агент може повернути в `O` групу, якої не було у `Q`, але яка реально є в LIS після group-mapping.

Це корисно для кейсів, коли аналізатор не просить якусь групу явно, але LIS містить потрібний тест.

Приклад:

- апарат у `Q` прислав тільки `040,050,060`
- у LIS є `511`
- group-mapping визначив, що `511 -> 510`
- при `CA1500_ALLOW_UNREQUESTED_GROUPS=true` агент може все одно повернути `510`

- `CA1500_QUERY_GROUP_DEBUG`
  Якщо `true`, агент пише детальний лог по кожному SQL рядку і фінальному набору query-груп.

- `CA1500_CHECKSUM_INCLUDE_STX`
  У поточному драйвері checksum validation приймає обидва варіанти, але при відправці host reply використовує це налаштування як основне.

Для поточного реального `CA-1500` підтверджено роботу з:

```env
CA1500_CHECKSUM_INCLUDE_STX=false
```

Тобто при відправці checksum рахується без `STX`, по байтах:

```text
[F#] + [text] + [ETX/ETB]
```

---

## Мапінг кодів

Файл:

- [sysmex_ca1500_mapping.example.json](c:/MedicalHub/sysmex_ca1500_mapping.example.json)

Приклад:

```json
{
  "041": "041",
  "042": "042",
  "043": "043",
  "044": "044",
  "051": "051",
  "061": "061",
  "062": "062"
}
```

Ліва частина:

- код параметра від `CA-1500`

Права частина:

- код, який шукається в `analyzer_test_code` або `analyzer_test_code2` через ingester.

Якщо у вас в LIS ці поля зберігають інші коди, праві значення треба змінити.

### Group-mapping для query mode

Окремо від result-mapping існує group-mapping:

- [sysmex_ca1500_order_groups.example.json](c:/MedicalHub/sysmex_ca1500_order_groups.example.json)

Цей файл використовується не для запису результатів, а для відповіді на `Q`.

Тобто:

- `sysmex_ca1500_mapping.example.json`
  використовується для result ingest

- `sysmex_ca1500_order_groups.example.json`
  використовується для query/worklist reply

Якщо у вас LIS використовує свої внутрішні `kodvys`, group-mapping може виглядати так:

```json
{
  "040": ["1234", "1235", "1236", "1237"],
  "050": ["1240"],
  "060": ["1250", "1251"]
}
```

У такому випадку:

- знайдено `kodvys=1234` -> назад у прилад піде `040`
- знайдено `kodvys=1240` -> назад у прилад піде `050`
- якщо група `060` не представлена в заявці, `060` у reply не піде

Для `TT` робочий приклад може бути таким:

```json
{
  "510": ["510", "511", "513"]
}
```

Тобто:

- у LIS є `511`
- у `Q`/`O` для апарата використовується `510`
- у `R` результат від приладу може прийти як `511`

---

## Як запустити агент

Команда:

```bash
npm run ca1500-agent
```

Або напряму:

```bash
node sysmex_ca1500_agent.js
```

Перед запуском:

1. переконайся, що MedicalHub сервер уже піднятий;
2. перевір `CA1500_SERVER_URL`;
3. перевір правильність `COM`-порту;
4. звір `CA1500_PRACLISTID` або `CA1500_KODZAR`.

---

## Як працює blind transfer

У режимі прямої передачі результатів `CA-1500` сам ініціює ASTM-сеанс:

1. шле `ENQ`
2. хост відповідає `ACK`
3. аналізатор шле:
   - `H`
   - `P`
   - `O`
   - один або більше `R`
   - `L`
4. хост підтверджує кожен frame
5. аналізатор шле `EOT`
6. агент перетворює повідомлення в JSON і шле його на сервер

У цьому режимі головний ключ для пошуку заявки:

- `sampleNo` з `O` record

---

## Як працює query mode

У query mode `CA-1500` спочатку просить замовлення:

1. шле `ENQ`
2. відправляє `H/Q/L`
3. агент розбирає `Q`
4. знаходить worklist у Sybase
5. сам ініціює зворотний ASTM-сеанс
6. шле назад `H/P/O/L`

Після цього аналізатор виконує тест і вже окремим ASTM-сеансом віддає результати.

### Як визначається, що повертати в `O`

Апарат може запитувати:

```text
Q ... ^^^040^\^^^050^\^^^060^
```

Це означає, що він просить роботу по групах `040`, `050`, `060`.

ЛІС не зобов’язана повертати всі ці коди.

Вона повинна повернути тільки ті групи, які реально є в заявці.

Приклад:

- апарат запросив `040,050,060`
- у LIS є тести тільки з груп `040` і `050`
- у відповіді `O` назад піде тільки:
  - `040`
  - `050`

Тобто аналізатор має виконати тільки ці групи, а `060` не робити.

---

## Які поля реально йдуть у Sybase

Через endpoint `/api/analyzer/serial-result` далі оновлюються:

- `stavvys`
- `oscisvys`
- `datumvys`
- `oscispotvr`
- `datumpotvrd`
- `vysledoknum`
- `vysledoktext`
- `koncentracia`

Поведінка залежить від `valueType`:

- якщо значення числове, воно йде в `vysledoknum` і `koncentracia`;
- якщо текстове, воно йде в `vysledoktext`.

---

## Логи і що дивитися при тесті

Агент пише в консоль повідомлення з префіксом:

```text
[CA1500]
```

Типові корисні логи:

- відкриття порту;
- `Startup config`;
- `IN/OUT ENQ/ACK/NAK/EOT`;
- вхідні frame-и;
- тип ASTM message: `query` або `result`;
- короткий preview payload;
- відповідь сервера.

### Startup config

На старті агент тепер окремо логує активну конфігурацію:

```text
[CA1500] Startup config {"port":"COM4","branch":"ad","praclistid":"CA1500","kodzar":"10001","kodlab":"00001","checksumIncludeStx":false,"orderGroupMatchSource":"kodvys","allowUnrequestedGroups":true}
```

Це перше, що треба перевіряти, якщо агент раптом шукає "не ті" замовлення.

### Query group row

При `CA1500_QUERY_GROUP_DEBUG=true` для кожного рядка із SQL буде лог типу:

```text
[CA1500] Query group row sample=0404B0003P kodvys=511 analyzer1=511 analyzer2= candidates=[511] grouped=510
```

Це дозволяє одразу побачити:

- який `kodvys` реально прийшов із Sybase;
- які коди агент розглянув;
- у яку групу він це схлопнув.

### Query requested vs returned

Після цього агент пише фінальний підсумок:

```text
[CA1500] Query requested vs returned 0404B0003P requested=[040,050,060] lisGroups=[040,050,510] returned=[040,050,510] missingRequested=[060] availableButNotRequested=[510] matchSource=kodvys allowUnrequested=true
```

Це головний лог для перевірки, чому апарат отримав або не отримав конкретну роботу.

---

## Рекомендований план тестування

### 1. Dry run без запису в БД

Постав:

```env
CA1500_DRY_RUN=true
```

У цьому режимі агент:

- парсить результати;
- збирає payload;
- не шле його на сервер.

Це найкращий перший крок для перевірки формату.

### 2. Blind transfer test

Перевірити:

- чи відкривається COM-порт;
- чи приходить повне ASTM-повідомлення;
- чи правильно читається `sampleNo`;
- чи всі `R` records перетворюються в `observations`.

### 3. Server ingest test

Після `CA1500_DRY_RUN=false` перевірити:

- чи endpoint приймає payload;
- чи `observationId` правильно мапиться на потрібні тести;
- чи немає `skipped` для ключових кодів.

### 4. Query mode test

Перевірити:

- чи `Q.sampleNo` справді відповідає barcode в LIS;
- чи host reply містить правильні батьківські test codes;
- чи аналізатор приймає назад `O` record без помилки.

Окремо треба перевірити:

- що групування працює саме по тому джерелу, яке ви вибрали:
  - `kodvys`
  - або `analyzer_codes`

- що при запиті `040,050,060` агент може повернути, наприклад, тільки `040,050`
- що при наявності `511` у LIS агент може повернути `510`, навіть якщо в `Q` не було `510`, якщо увімкнено `CA1500_ALLOW_UNREQUESTED_GROUPS=true`

### 5. Emulator query-then-result test

Емулятор підтримує сценарій:

1. шле `Q`
2. чекає host reply
3. якщо роботи нема, завершує сценарій
4. якщо робота є, чекає `CA1500_EMULATOR_RESULT_DELAY_MS`
5. відправляє заглушку результатів

За замовчуванням:

```env
CA1500_EMULATOR_RESULT_DELAY_MS=30000
```

Тобто емулятор імітує, що аналізатор працює `30` секунд, а потім віддає результати.

---

## Типові проблеми

### 1. `Query does not contain sample number`

Причина:

- у `Q` record прийшов неочікуваний формат specimen fields;
- sample number не в тому полі, яке ми зараз очікуємо.

Що робити:

- зберегти сире ASTM-повідомлення;
- звірити реальний `Q` record;
- адаптувати parser.

### 2. `Unsupported barcode format`

Причина:

- `sampleNo` не схожий на поточний LIS barcode;
- query lookup використовує barcode parser, який не знає цей формат.

Що робити:

- або змінити формат barcode в аналізаторі;
- або адаптувати lookup в [sybase_analyzer_result_ingest.js](c:/MedicalHub/sybase_analyzer_result_ingest.js).

### 2.1. `Query worklist lookup failed`

Причина:

- немає Sybase DSN;
- Sybase недоступна;
- lookup у query mode завершився помилкою.

Поточна поведінка:

- агент не падає;
- агент повертає порожню worklist-відповідь;
- для апарата це виглядає як "роботи нема".

### 3. Є payload, але все йде в `skipped`

Причина:

- `observationId` не збігається з `analyzer_test_code` / `analyzer_test_code2`.

Що робити:

- перевірити [sysmex_ca1500_mapping.example.json](c:/MedicalHub/sysmex_ca1500_mapping.example.json);
- звірити коди в `c_okb_prac_list_varianty`.

### 3.1. `Server skipped sample ... resolved to 0 orders`

Причина найчастіше одна з таких:

- у payload правильний `sampleNo`, але агент шукає не по тому `praclistid/kodzar`;
- у конфігу виставлено старий або чужий `CA1500_KODZAR`;
- barcode формально парситься, але lookup іде не в ту прив’язку аналізатора.

Що перевірити в першу чергу:

1. `Startup config`
2. `CA1500_PRACLISTID`
3. `CA1500_KODZAR`
4. `CA1500_KODLAB`

Для поточного робочого майданчика правильний варіант такий:

```env
CA1500_PRACLISTID=CA1500
CA1500_KODZAR=10001
CA1500_KODLAB=00001
```

### 4. Аналізатор не приймає host reply

Причина:

- невірний checksum;
- інша структура `O` record;
- не той test code source;
- аналізатор очікує інший `sampleAttribute` або `option`.

Що робити:

1. зберегти frame-и;
2. звірити з прикладами з мануалу;
3. перевірити:
   - `CA1500_CHECKSUM_INCLUDE_STX`
   - `CA1500_ORDER_CODE_SOURCE`
   - `CA1500_DEFAULT_DILUTION`
   - `CA1500_ORDER_GROUP_MATCH_SOURCE`
   - `sysmex_ca1500_order_groups.example.json`

### 5. `Unauthorized analyzer bridge request`

Причина:

- `ANALYZER_BRIDGE_TOKEN` на агенті і сервері не збігаються.

---

## Поточні обмеження каркаса

- Є окремий `CA-1500` емулятор у [sysmex_ca1500_emulator.js](c:/MedicalHub/sysmex_ca1500_emulator.js), але його результати все одно залишаються тестовими заглушками.
- Query mode працює через поточний Sybase-ingester і може вимагати адаптації під ваш реальний формат `sampleNo`.
- Службові прапори `expand/reflex` поки лише зберігаються як metadata і не впливають на бізнес-логіку.
- Не реалізовано окремий reset-утилітарій саме під `CA-1500`.

---

## Що доопрацьовувати далі

Найлогічніші наступні кроки:

1. за потреби розширити [sysmex_ca1500_emulator.js](c:/MedicalHub/sysmex_ca1500_emulator.js) реалістичнішими сценаріями;
2. зробити окремий reset-script під `sampleNo`;
3. адаптувати query lookup, якщо `sampleNo` не є LIS barcode;
4. додати збереження службових прапорів у окремий audit/log;
5. за потреби винести спільний ASTM engine в базовий модуль для `CA-1500` і `CA-600`.

---

## Швидкий старт

1. Скопіювати [sysmex_ca1500_bridge.env.example](c:/MedicalHub/sysmex_ca1500_bridge.env.example) у робочий `.env`.
2. Заповнити `CA1500_COM_PORT`, `CA1500_SERVER_URL`, `CA1500_PRACLISTID` або `CA1500_KODZAR`.
3. Перевірити [sysmex_ca1500_mapping.example.json](c:/MedicalHub/sysmex_ca1500_mapping.example.json).
4. Для першого тесту поставити `CA1500_DRY_RUN=true`.
5. Запустити:

```bash
npm run ca1500-agent
```

6. Перевірити консольні логи.
7. Після успішного dry run увімкнути реальний ingest:

```env
CA1500_DRY_RUN=false
```
