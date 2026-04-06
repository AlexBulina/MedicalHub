import "dotenv/config";
import net from "node:net";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

const VT = String.fromCharCode(0x0b);
const FS = String.fromCharCode(0x1c);
const CR = "\r";

const HOST = process.env.BS240_EMULATOR_HOST || process.env.BS240_HL7_HOST || "127.0.0.1";
const PORT = Number(process.env.BS240_EMULATOR_PORT || process.env.BS240_HL7_PORT || 4001);
const RESPONSE_TIMEOUT_MS = Number(process.env.BS240_EMULATOR_TIMEOUT_MS || 6000);
const RESULT_DELAY_MS = Number(process.env.BS240_RESULT_DELAY_MS || 30000);
const AUTO_SEND_RESULTS = String(process.env.BS240_AUTO_SEND_RESULTS || "true").toLowerCase() !== "false";
const SENDING_APP = process.env.BS240_EMULATOR_APP || "BS-240";
const SENDING_FACILITY = process.env.BS240_EMULATOR_FACILITY || "MINDRAY";
const HL7_VERSION = process.env.BS240_HL7_VERSION || "2.3.1";

function pad2(value) {
    return String(value).padStart(2, "0");
}

function formatHl7Timestamp(date = new Date()) {
    return [
        date.getFullYear(),
        pad2(date.getMonth() + 1),
        pad2(date.getDate()),
        pad2(date.getHours()),
        pad2(date.getMinutes()),
        pad2(date.getSeconds()),
    ].join("");
}

function toMllpFrame(message) {
    return `${VT}${message}${FS}${CR}`;
}

function parseSegments(message) {
    return message
        .split(/\r?\n|\r/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const fields = line.split("|");
            return { name: fields[0], fields };
        });
}

function getField(segments, segmentName, index) {
    const segment = segments.find((item) => item.name === segmentName);
    return segment?.fields?.[index] || "";
}

function extractMessagesFromBuffer(state) {
    const messages = [];

    while (true) {
        const start = state.buffer.indexOf(VT);
        if (start === -1) {
            state.buffer = "";
            break;
        }

        const end = state.buffer.indexOf(`${FS}${CR}`, start);
        if (end === -1) {
            if (start > 0) {
                state.buffer = state.buffer.slice(start);
            }
            break;
        }

        messages.push(state.buffer.slice(start + 1, end));
        state.buffer = state.buffer.slice(end + 2);
    }

    return messages;
}

function buildQueryMessage(barcode, queryId) {
    const timestamp = formatHl7Timestamp();

    return [
        `MSH|^~\\&|${SENDING_APP}|${SENDING_FACILITY}|||${timestamp}||QRY^Q02|${queryId}|P|${HL7_VERSION}||||||ASCII|||`,
        `QRD|${timestamp}|R|D|${queryId}|||RD|${barcode}|OTH|||T|`,
        `QRF||${timestamp.slice(0, 8)}000000|${timestamp}|||RCT|COR|ALL||`,
    ].join(CR) + CR;
}

function buildAckQ03Message(dsrMessage) {
    const segments = parseSegments(dsrMessage);
    const controlId = getField(segments, "MSH", 9) || "";
    return [
        `MSH|^~\\&|${SENDING_APP}|${SENDING_FACILITY}|||${formatHl7Timestamp()}||ACK^Q03|${Date.now()}|P|${HL7_VERSION}||||||ASCII|||`,
        `MSA|AA|${controlId}|Message accepted|||0`,
        "ERR|0",
    ].join(CR) + CR;
}

function printMessage(title, message) {
    console.log(`\n=== ${title} ===`);
    for (const line of message.split(/\r?\n|\r/).filter(Boolean)) {
        console.log(line);
    }
}

function parseMessageType(message) {
    const msh = message.split(/\r?\n|\r/).find((line) => line.startsWith("MSH|"));
    if (!msh) return "";
    return msh.split("|")[8] || "";
}

function parseDsrWorklist(message) {
    const segments = parseSegments(message);
    const values = new Map();

    for (const segment of segments.filter((item) => item.name === "DSP")) {
        const index = Number(segment.fields[1]);
        const dataLine = segment.fields[3] || "";
        if (Number.isFinite(index)) {
            values.set(index, dataLine);
        }
    }

    const tests = [];
    for (let i = 29; values.has(i); i += 1) {
        const code = String(values.get(i) || "").split("^")[0].trim();
        if (code) {
            tests.push(code);
        }
    }

    return {
        patientName: values.get(3) || "",
        birthDate: values.get(4) || "",
        sex: values.get(5) || "",
        collectedAt: values.get(12) || "",
        patientId: values.get(16) || "",
        barcode: values.get(21) || "",
        sampleId: values.get(22) || "",
        sampleType: values.get(26) || "",
        tests,
    };
}

function generateObservationValue(testCode, index) {
    const base = Number.parseInt(String(testCode).replace(/\D/g, ""), 10);
    const safeBase = Number.isFinite(base) ? base : 10 + index;
    return ((safeBase % 70) + 1 + index / 10).toFixed(2);
}

function buildOruMessage(worklist) {
    const timestamp = formatHl7Timestamp();
    const sampleTypeTitle = worklist.sampleType ? worklist.sampleType[0].toUpperCase() + worklist.sampleType.slice(1) : "";
    const patientName = worklist.patientName || "TEST PATIENT";

    const segments = [
        `MSH|^~\\&|${SENDING_APP}|${SENDING_FACILITY}|||${timestamp}||ORU^R01|${Date.now()}|P|${HL7_VERSION}||||0||ASCII|||`,
        `PID|1|${worklist.patientId || worklist.sampleId}||${patientName}||${worklist.birthDate}|${worklist.sex || 'O'}`,
        `OBR|1|${worklist.barcode}|${worklist.sampleId}|Mindray^BS-240|N|${worklist.collectedAt || timestamp}||||||||${sampleTypeTitle}|`,
    ];

    worklist.tests.forEach((testCode, index) => {
        const resultValue = generateObservationValue(testCode, index + 1);
        segments.push(
            `OBX|${index + 1}|NM|${testCode}|${testCode}|${resultValue}|||N|||F||${resultValue}|${timestamp}|${SENDING_APP}|EMULATOR|0`
        );
    });

    return segments.join(CR) + CR;
}

async function exchangeSingleMessage({ message, title, timeoutMs = RESPONSE_TIMEOUT_MS }) {
    return await new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: HOST, port: PORT });
        const state = { buffer: "" };
        const responses = [];
        let timeoutId;

        function finish() {
            clearTimeout(timeoutId);
            socket.end();
            resolve(responses);
        }

        function resetTimeout(customTimeoutMs = timeoutMs) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => finish(), customTimeoutMs);
        }

        socket.setEncoding("utf8");

        socket.on("connect", () => {
            printMessage(title, message);
            socket.write(toMllpFrame(message));
            resetTimeout();
        });

        socket.on("data", (chunk) => {
            state.buffer += chunk;
            for (const rawMessage of extractMessagesFromBuffer(state)) {
                responses.push(rawMessage);
                printMessage(`INBOUND ${parseMessageType(rawMessage) || "UNKNOWN"}`, rawMessage);
                resetTimeout();
            }
        });

        socket.on("error", (error) => {
            clearTimeout(timeoutId);
            reject(error);
        });

        socket.on("end", () => {
            clearTimeout(timeoutId);
            resolve(responses);
        });

        socket.on("close", () => {
            clearTimeout(timeoutId);
        });
    });
}

async function queryWorklist(barcode) {
    const cleanBarcode = String(barcode || "").trim().toUpperCase();
    if (!cleanBarcode) {
        console.log("Barcode is empty.");
        return null;
    }

    const queryId = `${Date.now()}`;
    const message = buildQueryMessage(cleanBarcode, queryId);

    return await new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: HOST, port: PORT });
        const state = { buffer: "" };
        let timeoutId;
        let worklist = null;

        function finish() {
            clearTimeout(timeoutId);
            socket.end();
            resolve(worklist);
        }

        function resetTimeout(customTimeout = RESPONSE_TIMEOUT_MS) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => finish(), customTimeout);
        }

        socket.setEncoding("utf8");

        socket.on("connect", () => {
            console.log(`\n--> Sending barcode ${cleanBarcode} to ${HOST}:${PORT}`);
            printMessage("OUTBOUND QRY^Q02", message);
            socket.write(toMllpFrame(message));
            resetTimeout();
        });

        socket.on("data", (chunk) => {
            state.buffer += chunk;
            for (const rawMessage of extractMessagesFromBuffer(state)) {
                const messageType = parseMessageType(rawMessage) || "UNKNOWN";
                printMessage(`INBOUND ${messageType}`, rawMessage);

                if (messageType === "DSR^Q03") {
                    worklist = parseDsrWorklist(rawMessage);
                    const ack = buildAckQ03Message(rawMessage);
                    printMessage("OUTBOUND ACK^Q03", ack);
                    socket.write(toMllpFrame(ack));
                }

                resetTimeout();
            }
        });

        socket.on("error", (error) => {
            clearTimeout(timeoutId);
            reject(error);
        });

        socket.on("end", () => {
            clearTimeout(timeoutId);
            resolve(worklist);
        });

        socket.on("close", () => {
            clearTimeout(timeoutId);
        });
    });
}

async function sendResults(worklist) {
    const oruMessage = buildOruMessage(worklist);
    const responses = await exchangeSingleMessage({
        message: oruMessage,
        title: "OUTBOUND ORU^R01",
        timeoutMs: RESPONSE_TIMEOUT_MS,
    });

    const ackResponse = responses.find((message) => parseMessageType(message) === "ACK^R01");
    if (ackResponse) {
        console.log("ACK^R01 received successfully.");
        return;
    }

    if (!responses.length) {
        console.log("No ACK^R01 response received.");
        return;
    }

    console.log("Response received after ORU, but ACK^R01 was not found.");
}

async function runBarcodeFlow(barcode) {
    const worklist = await queryWorklist(barcode);

    if (!worklist) {
        console.log("No worklist returned from LIS.");
        return;
    }

    console.log(`\nWorklist received for ${worklist.barcode}: ${worklist.tests.length} test(s).`);

    if (!AUTO_SEND_RESULTS) {
        console.log("Auto result sending is disabled.");
        return;
    }

    console.log(`Waiting ${RESULT_DELAY_MS / 1000} seconds before sending simulated ORU^R01 results...`);
    await new Promise((resolve) => setTimeout(resolve, RESULT_DELAY_MS));
    await sendResults(worklist);
}

async function startInteractiveMode() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
    });

    console.log(`BS-240 emulator connected to ${HOST}:${PORT}`);
    console.log('Type a barcode and press Enter. Type "exit" to quit.');

    const ask = () =>
        new Promise((resolve) => {
            rl.question("barcode> ", resolve);
        });

    while (true) {
        const answer = (await ask()).trim();
        if (!answer) {
            continue;
        }
        if (["exit", "quit", "q"].includes(answer.toLowerCase())) {
            break;
        }

        try {
            await runBarcodeFlow(answer);
        } catch (error) {
            console.error("Emulator error:", error.message);
        }
    }

    rl.close();
}

async function main() {
    const barcodeArg = process.argv[2];

    try {
        if (barcodeArg) {
            await runBarcodeFlow(barcodeArg);
            return;
        }

        await startInteractiveMode();
    } catch (error) {
        console.error("Failed to run BS-240 emulator:", error.message);
        process.exitCode = 1;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
