const ENQ = 0x05;
const ACK = 0x06;
const NAK = 0x15;
const EOT = 0x04;
const STX = 0x02;
const ETX = 0x03;
const ETB = 0x17;
const CR = 0x0d;
const LF = 0x0a;

function noop() {}

/**
 * Робить коротку async-затримку.
 * Використовується для ASTM пауз після contention або перед повторною спробою відправки.
 *
 * @param {number} ms Кількість мілісекунд затримки.
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Перетворює байт у двосимвольний hex-рядок у верхньому регістрі.
 *
 * @param {number} value Значення байта.
 * @returns {string}
 */
function toHexByte(value) {
    return value.toString(16).toUpperCase().padStart(2, "0");
}

/**
 * Рахує checksum для ASTM frame.
 * Залежно від реалізації приладу STX може входити або не входити в суму.
 *
 * @param {Buffer} frameBytes Байти frame від STX до ETX/ETB.
 * @param {boolean} [includeStx=true] Чи включати STX у checksum.
 * @returns {string} Двосимвольний hex checksum.
 */
function computeChecksumBytes(frameBytes, includeStx = true) {
    let sum = 0;
    const start = includeStx ? 0 : 1;
    for (let index = start; index < frameBytes.length; index += 1) {
        sum = (sum + frameBytes[index]) & 0xff;
    }
    return toHexByte(sum);
}

/**
 * Формує один ASTM frame:
 * STX + frameNumber + text + ETX/ETB + checksum + CRLF.
 *
 * @param {string|number} frameNumber Номер frame, який піде після STX.
 * @param {string} text Текстовий payload поточного frame.
 * @param {number} terminator Кінцевий байт ETX або ETB.
 * @param {boolean} [includeStxInChecksum=true] Чи враховувати STX у checksum.
 * @returns {Buffer}
 */
function buildFrameBytes(frameNumber, text, terminator, includeStxInChecksum = true) {
    const frame = Buffer.concat([
        Buffer.from([STX]),
        Buffer.from(String(frameNumber), "ascii"),
        Buffer.from(String(text || ""), "ascii"),
        Buffer.from([terminator]),
    ]);

    return Buffer.concat([
        frame,
        Buffer.from(computeChecksumBytes(frame, includeStxInChecksum), "ascii"),
        Buffer.from([CR, LF]),
    ]);
}

/**
 * Розбиває текст повідомлення на ASTM-сумісні шматки.
 * Номер кадру та службові байти додаються окремо під час buildFrameBytes().
 *
 * @param {string} message Повний ASTM text message без transport-байтів.
 * @param {number} [maxTextLength=240] Максимальна довжина тексту в одному frame.
 * @returns {string[]}
 */
function splitTextIntoFrames(message, maxTextLength = 240) {
    const text = String(message || "");
    if (!text) {
        return [""];
    }

    const chunks = [];
    for (let index = 0; index < text.length; index += maxTextLength) {
        chunks.push(text.slice(index, index + maxTextLength));
    }
    return chunks;
}

function normalizeControlName(byte) {
    const names = {
        [ENQ]: "ENQ",
        [ACK]: "ACK",
        [NAK]: "NAK",
        [EOT]: "EOT",
        [STX]: "STX",
        [ETX]: "ETX",
        [ETB]: "ETB",
        [CR]: "CR",
        [LF]: "LF",
    };

    return names[byte] || `0x${byte.toString(16).toUpperCase().padStart(2, "0")}`;
}

/**
 * Витягує повні STX...LF frame-и з накопичувального буфера прийому.
 * Усе, що ще не дочиталось, лишається в `rest` до наступного feed().
 *
 * @param {Buffer} frameBuffer Поточний накопичувальний буфер transport-рівня.
 * @returns {{frames: Buffer[], rest: Buffer}}
 */
function extractCompletedFrames(frameBuffer) {
    const frames = [];
    let workingBuffer = frameBuffer;

    while (workingBuffer.length) {
        const startIndex = workingBuffer.indexOf(STX);
        if (startIndex === -1) {
            return { frames, rest: Buffer.alloc(0) };
        }

        if (startIndex > 0) {
            workingBuffer = workingBuffer.slice(startIndex);
        }

        const lfIndex = workingBuffer.indexOf(LF, 1);
        if (lfIndex === -1) {
            return { frames, rest: workingBuffer };
        }

        frames.push(workingBuffer.slice(0, lfIndex + 1));
        workingBuffer = workingBuffer.slice(lfIndex + 1);
    }

    return { frames, rest: Buffer.alloc(0) };
}

/**
 * Створює ASTM E1381/E1394 transport layer для Sysmex CA-1500.
 * Обробляє handshake ENQ/ACK/NAK/EOT, розбиття на frame-и, checksum,
 * timeout-и, retransmit і складання повного message з кількох frame-ів.
 *
 * @param {object} [options={}] Налаштування transport layer.
 * @param {(buffer: Buffer) => void} [options.write] Функція відправки байтів у COM-порт.
 * @param {(message: string, extra?: string) => void} [options.log] Логер транспортних подій.
 * @param {(messageText: string) => Promise<void>|void} [options.onMessage] Обробник повного вхідного ASTM message.
 * @param {number} [options.hostYieldAfterContentionMs=20000] Пауза host після contention по ENQ.
 * @param {number} [options.enqRetryAfterNakMs=10000] Затримка перед повторним ENQ після NAK.
 * @param {number} [options.senderTimeoutMs=15000] Таймаут очікування відповіді на ENQ/frame.
 * @param {number} [options.receiverTimeoutMs=30000] Таймаут очікування продовження inbound-передачі.
 * @param {number} [options.maxFrameTextLength=240] Максимальна довжина тексту в одному frame.
 * @param {number} [options.maxSendAttempts=6] Максимальна кількість спроб відправити один frame.
 * @param {boolean} [options.checksumIncludeStx=false] Чи включати STX у checksum при outbound frames.
 * @returns {{
 *   feed: (chunk: Buffer|string) => void,
 *   queueMessage: (messageText: string) => Promise<void>,
 *   destroy: () => void,
 *   constants: { ENQ: number, ACK: number, NAK: number, EOT: number, STX: number, ETX: number, ETB: number, CR: number, LF: number }
 * }}
 */
export function createCa1500AstmLink(options = {}) {
    const write = options.write || noop;
    const log = options.log || noop;
    const onMessage = options.onMessage || (async () => {});
    const hostYieldAfterContentionMs = Number(options.hostYieldAfterContentionMs || 20000);
    const enqRetryAfterNakMs = Number(options.enqRetryAfterNakMs || 10000);
    const senderTimeoutMs = Number(options.senderTimeoutMs || 15000);
    const receiverTimeoutMs = Number(options.receiverTimeoutMs || 30000);
    const maxFrameTextLength = Number(options.maxFrameTextLength || 240);
    const maxSendAttempts = Number(options.maxSendAttempts || 6);
    const checksumIncludeStx = options.checksumIncludeStx === true;

    // Поточний стан транспортного рівня:
    // - receiving: зараз лінією володіє аналізатор і шле нам frame-и
    // - sending: зараз лінією володіє host і чекає ACK/NAK на свої frame-и
    // - outgoingQueue: черга повних ASTM-повідомлень на відправку
    // - incomingQueue: черга вже зібраних ASTM message для послідовної бізнес-обробки
    const state = {
        frameBuffer: Buffer.alloc(0),
        receiveTextParts: [],
        pendingMessageText: "",
        receiving: false,
        receiveTimer: null,
        sendTimer: null,
        sending: null,
        outgoingQueue: [],
        incomingQueue: [],
        processingIncoming: false,
        flushing: false,
        contentedUntil: 0,
    };

    /**
     * Очищає один з активних таймерів, якщо він існує.
     *
     * @param {"receiveTimer"|"sendTimer"} timerName Назва поля state з таймером.
     * @returns {void}
     */
    function clearTimer(timerName) {
        if (state[timerName]) {
            clearTimeout(state[timerName]);
            state[timerName] = null;
        }
    }

    /**
     * Відправляє один ASTM control byte: ENQ/ACK/NAK/EOT.
     *
     * @param {number} byte Control byte для відправки.
     * @returns {void}
     */
    function writeControl(byte) {
        log("OUT", normalizeControlName(byte));
        write(Buffer.from([byte]));
    }

    /**
     * Відправляє вже повністю зібраний ASTM frame.
     *
     * @param {Buffer} frameBuffer Готовий frame з checksum і CRLF.
     * @returns {void}
     */
    function writeFrame(frameBuffer) {
        log("OUT FRAME", frameBuffer.toString("ascii").replace(/\r/g, "<CR>").replace(/\n/g, "<LF>"));
        write(frameBuffer);
    }

    /**
     * Receiver-side watchdog: аналізатор має або продовжити передачу,
     * або завершити її через EOT у межах заданого таймауту.
     *
     * @returns {void}
     */
    function scheduleReceiveTimeout() {
        clearTimer("receiveTimer");
        state.receiveTimer = setTimeout(() => {
            log("Receiver timeout", `${receiverTimeoutMs}ms`);
            state.receiving = false;
            state.receiveTextParts = [];
            state.pendingMessageText = "";
        }, receiverTimeoutMs);
    }

    /**
     * Sender-side watchdog: host має вчасно отримати ACK/NAK/ENQ/EOT.
     *
     * @param {string} phase Назва етапу відправки для логів і помилки.
     * @returns {void}
     */
    function scheduleSendTimeout(phase) {
        clearTimer("sendTimer");
        state.sendTimer = setTimeout(() => {
            failCurrentSend(new Error(`ASTM send timeout during ${phase}.`));
        }, senderTimeoutMs);
    }

    /**
     * Безпечно завершує promise queued item через resolve.
     *
     * @param {{ resolve?: Function }} item Елемент черги.
     * @returns {void}
     */
    function resolveQueueItem(item) {
        try {
            item.resolve();
        } catch {
            noop();
        }
    }

    /**
     * Безпечно завершує promise queued item через reject.
     *
     * @param {{ reject?: Function }} item Елемент черги.
     * @param {Error} error Помилка для reject.
     * @returns {void}
     */
    function rejectQueueItem(item, error) {
        try {
            item.reject(error);
        } catch {
            noop();
        }
    }

    /**
     * Перетворює одне ASTM text message на набір numbered frame-ів.
     *
     * @param {string} messageText Повний ASTM text payload.
     * @returns {Buffer[]}
     */
    function buildFramesForMessage(messageText) {
        return splitTextIntoFrames(messageText, maxFrameTextLength).map((chunk, index, chunks) => {
            const frameNumber = (index + 1) % 8;
            const printableFrameNumber = frameNumber === 0 ? "0" : String(frameNumber);
            const terminator = index === chunks.length - 1 ? ETX : ETB;
            return buildFrameBytes(printableFrameNumber, chunk, terminator, checksumIncludeStx);
        });
    }

    /**
     * Послідовно обробляє вже зібрані inbound message.
     * Це не дає application layer обробляти кілька проб одночасно і
     * зберігає порядок `Q -> reply`, навіть якщо SQL або HTTP інколи відповідають повільніше.
     *
     * @returns {Promise<void>}
     */
    async function processIncomingQueue() {
        if (state.processingIncoming) {
            return;
        }

        state.processingIncoming = true;
        try {
            while (state.incomingQueue.length) {
                const messageText = state.incomingQueue.shift();
                try {
                    await onMessage(messageText);
                } catch (error) {
                    const reason = error instanceof Error ? error.message : String(error);
                    log("Message handler error", reason);
                }
            }
        } finally {
            state.processingIncoming = false;
            void flushQueue();
        }
    }

    /**
     * Починає відправку наступного повідомлення з черги, коли лінія вільна.
     * Якщо раніше був contention, host витримує паузу перед повторним ENQ.
     *
     * @returns {Promise<void>}
     */
    async function flushQueue() {
        if (state.flushing || state.sending || state.receiving || !state.outgoingQueue.length) {
            return;
        }

        state.flushing = true;
        try {
            const now = Date.now();
            if (state.contentedUntil > now) {
                await delay(state.contentedUntil - now);
            }

            if (state.sending || state.receiving || !state.outgoingQueue.length) {
                return;
            }

            const next = state.outgoingQueue.shift();
            state.sending = {
                ...next,
                frames: buildFramesForMessage(next.messageText),
                frameIndex: 0,
                attempts: 0,
                phase: "awaiting_enq_ack",
            };

            writeControl(ENQ);
            scheduleSendTimeout("enq-ack");
        } finally {
            state.flushing = false;
        }
    }

    /**
     * Public API: ставить одне повне ASTM-повідомлення в чергу на відправку.
     *
     * @param {string} messageText Повний ASTM text payload без transport-обгортки.
     * @returns {Promise<void>}
     */
    function queueMessage(messageText) {
        return new Promise((resolve, reject) => {
            state.outgoingQueue.push({ messageText, resolve, reject });
            void flushQueue();
        });
    }

    /**
     * Аварійно завершує поточну outbound-передачу і відхиляє її promise.
     *
     * @param {Error} error Причина аварійного завершення.
     * @returns {void}
     */
    function failCurrentSend(error) {
        clearTimer("sendTimer");
        const active = state.sending;
        state.sending = null;
        if (active) {
            try {
                writeControl(EOT);
            } catch {
                noop();
            }
            rejectQueueItem(active, error);
        }
        void flushQueue();
    }

    /**
     * Відправляє поточний frame або обриває передачу,
     * якщо вичерпано ліміт перевідправок.
     *
     * @returns {void}
     */
    function sendCurrentFrame() {
        const active = state.sending;
        if (!active) {
            return;
        }

        if (active.attempts >= maxSendAttempts) {
            failCurrentSend(new Error("ASTM frame retransmission limit reached."));
            return;
        }

        active.attempts += 1;
        active.phase = "awaiting_frame_ack";
        writeFrame(active.frames[active.frameIndex]);
        scheduleSendTimeout("frame-ack");
    }

    /**
     * Обробляє ACK/NAK/ENQ/EOT, які приходять під час outbound-передачі host.
     * Саме тут живе логіка retry і contention.
     *
     * @param {number} byte Control byte, який прийшов у відповідь.
     * @returns {void}
     */
    function handleSendResponse(byte) {
        const active = state.sending;
        if (!active) {
            return;
        }

        clearTimer("sendTimer");

        if (active.phase === "awaiting_enq_ack") {
            if (byte === ACK) {
                active.attempts = 0;
                sendCurrentFrame();
                return;
            }

            if (byte === NAK) {
                state.sending = null;
                state.contentedUntil = Date.now() + enqRetryAfterNakMs;
                state.outgoingQueue.unshift(active);
                log("ENQ rejected", `retry in ${enqRetryAfterNakMs}ms`);
                void flushQueue();
                return;
            }

            if (byte === ENQ) {
                state.sending = null;
                state.contentedUntil = Date.now() + hostYieldAfterContentionMs;
                state.outgoingQueue.unshift(active);
                log("Contention detected", `yield for ${hostYieldAfterContentionMs}ms`);
                return;
            }
        }

        if (active.phase === "awaiting_frame_ack") {
            if (byte === ACK || byte === EOT) {
                active.frameIndex += 1;
                active.attempts = 0;

                if (active.frameIndex >= active.frames.length) {
                    writeControl(EOT);
                    state.sending = null;
                    resolveQueueItem(active);
                    void flushQueue();
                    return;
                }

                sendCurrentFrame();
                return;
            }

            if (byte === NAK) {
                sendCurrentFrame();
                return;
            }

            sendCurrentFrame();
        }
    }

    /**
     * Перевіряє структуру ASTM frame і його checksum.
     * Валідація допускає обидва варіанти checksum: зі STX і без STX.
     *
     * @param {Buffer} frameBuffer Повний ASTM frame.
     * @returns {{ valid: boolean, reason: string, terminator?: number, text?: string }}
     */
    function validateFrame(frameBuffer) {
        if (frameBuffer.length < 7) {
            return { valid: false, reason: "frame-too-short" };
        }

        const terminatorIndex = frameBuffer.length - 5;
        const terminator = frameBuffer[terminatorIndex];
        if (![ETX, ETB].includes(terminator)) {
            return { valid: false, reason: "invalid-terminator" };
        }

        const payload = frameBuffer.slice(0, terminatorIndex + 1);
        const receivedChecksum = frameBuffer.slice(terminatorIndex + 1, terminatorIndex + 3).toString("ascii").toUpperCase();
        const expectedWithStx = computeChecksumBytes(payload, true);
        const expectedWithoutStx = computeChecksumBytes(payload, false);
        const valid = receivedChecksum === expectedWithStx || receivedChecksum === expectedWithoutStx;

        return {
            valid,
            reason: valid ? "" : `checksum mismatch: got=${receivedChecksum} expected=${expectedWithStx}/${expectedWithoutStx}`,
            terminator,
            text: frameBuffer.slice(2, terminatorIndex).toString("ascii"),
        };
    }

    /**
     * Обробляє один повністю отриманий frame від аналізатора.
     * ETB додає черговий шматок, ETX завершує складання text message.
     *
     * @param {Buffer} frameBuffer Повний ASTM frame.
     * @returns {void}
     */
    function handleFrame(frameBuffer) {
        const validation = validateFrame(frameBuffer);
        log("IN FRAME", frameBuffer.toString("ascii").replace(/\r/g, "<CR>").replace(/\n/g, "<LF>"));

        if (!validation.valid) {
            log("Invalid frame", validation.reason);
            writeControl(NAK);
            scheduleReceiveTimeout();
            return;
        }

        state.receiveTextParts.push(validation.text);
        if (validation.terminator === ETX) {
            state.pendingMessageText = state.receiveTextParts.join("");
            state.receiveTextParts = [];
        }

        writeControl(ACK);
        scheduleReceiveTimeout();
    }

    /**
     * Завершує одне inbound ASTM message після EOT від аналізатора.
     *
     * @returns {void}
     */
    function finalizeIncomingMessage() {
        const completed = state.pendingMessageText;
        state.receiving = false;
        state.pendingMessageText = "";
        state.receiveTextParts = [];
        clearTimer("receiveTimer");

        if (completed) {
            state.incomingQueue.push(completed);
            void processIncomingQueue();
        }

        void flushQueue();
    }

    /**
     * Обробляє transport control bytes, які не входять у STX...LF frame-и.
     *
     * @param {number} byte Один вхідний control byte.
     * @returns {void}
     */
    function handleControl(byte) {
        if (byte === ENQ) {
            log("IN", "ENQ");
            if (state.sending?.phase === "awaiting_enq_ack") {
                clearTimer("sendTimer");
                state.contentedUntil = Date.now() + hostYieldAfterContentionMs;
                state.outgoingQueue.unshift(state.sending);
                state.sending = null;
            }

            state.receiving = true;
            state.receiveTextParts = [];
            state.pendingMessageText = "";
            writeControl(ACK);
            scheduleReceiveTimeout();
            return;
        }

        if (byte === EOT) {
            log("IN", "EOT");
            if (state.receiving) {
                finalizeIncomingMessage();
                return;
            }
        }

        if (state.sending && [ACK, NAK, ENQ, EOT].includes(byte)) {
            log("IN", normalizeControlName(byte));
            handleSendResponse(byte);
        }
    }

    /**
     * Точка входу для сирих serial-байтів із COM-порту.
     * Відокремлює framed ASTM text traffic від окремих control byte.
     *
     * @param {Buffer|string} chunk Порція сирих байтів із serial layer.
     * @returns {void}
     */
    function feed(chunk) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

        for (const byte of buffer) {
            if (byte === STX || state.frameBuffer.length) {
                state.frameBuffer = Buffer.concat([state.frameBuffer, Buffer.from([byte])]);
                const extracted = extractCompletedFrames(state.frameBuffer);
                state.frameBuffer = extracted.rest;
                for (const frame of extracted.frames) {
                    handleFrame(frame);
                }
                continue;
            }

            if ([ENQ, ACK, NAK, EOT].includes(byte)) {
                handleControl(byte);
            }
        }
    }

    /**
     * Зупиняє таймери та відхиляє всі pending outbound-операції.
     *
     * @returns {void}
     */
    function destroy() {
        clearTimer("receiveTimer");
        clearTimer("sendTimer");
        const error = new Error("CA-1500 ASTM link destroyed.");
        if (state.sending) {
            rejectQueueItem(state.sending, error);
            state.sending = null;
        }
        while (state.outgoingQueue.length) {
            rejectQueueItem(state.outgoingQueue.shift(), error);
        }
    }

    return {
        feed,
        queueMessage,
        destroy,
        constants: { ENQ, ACK, NAK, EOT, STX, ETX, ETB, CR, LF },
    };
}
