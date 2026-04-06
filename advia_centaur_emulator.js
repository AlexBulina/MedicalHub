import "dotenv/config";
import { config as loadEnvFile } from "dotenv";
import readline from "node:readline";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createAstmE1381Link } from "./astm_e1381_link.js";
import { createLineFileLogger } from "./line_file_logger.js";
import {
    parseAdviaCentaurAstmMessage,
} from "./advia_centaur_parser.js";

loadEnvFile({
    path: path.join(process.cwd(), ".env"),
    override: false,
});

const fileLogger = createLineFileLogger({
    enabled: process.env.CENTAUR_FILE_LOG_ENABLED || "false",
    baseDir: process.cwd(),
    logDir: process.env.CENTAUR_LOG_DIR || "logs\\centaur",
    fileName: process.env.CENTAUR_EMULATOR_LOG_FILE || "",
    prefix: "CENTAUR-EMU",
    alsoConsole: true,
});

function log(message, extra = "") {
    fileLogger.info(message, extra);
}

function normalizeBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }
    return String(value).trim().toLowerCase() === "true";
}

function pad2(value) {
    return String(value).padStart(2, "0");
}

function formatTimestamp(date = new Date()) {
    return [
        date.getFullYear(),
        pad2(date.getMonth() + 1),
        pad2(date.getDate()),
        pad2(date.getHours()),
        pad2(date.getMinutes()),
        pad2(date.getSeconds()),
    ].join("");
}

function buildSampleId(sequenceNo) {
    return `SID${String(sequenceNo).padStart(5, "0")}`;
}

function parseCsvList(value, fallback = []) {
    const items = String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    return items.length ? items : fallback;
}

function buildHeaderRecord() {
    const senderId = process.env.CENTAUR_EMULATOR_SENDER_ID || "ADVCNT_LIS";
    const receiverId = process.env.CENTAUR_EMULATOR_RECEIVER_ID || "LIS_ID";
    const processingId = process.env.CENTAUR_EMULATOR_PROCESSING_ID || "P";
    const version = process.env.CENTAUR_EMULATOR_VERSION || "1";

    const fields = [];
    fields[0] = "H";
    fields[1] = "\\^&";
    fields[4] = senderId;
    fields[9] = receiverId;
    fields[11] = processingId;
    fields[12] = version;
    return fields.join("|");
}

function buildPatientRecord(context) {
    const fields = [];
    fields[0] = "P";
    fields[1] = "1";
    fields[2] = context.patientId || "";
    fields[5] = context.patientName || "";
    fields[7] = context.dateOfBirth || "";
    fields[8] = context.sex || "";
    return fields.join("|");
}

function buildSpecimenId(context) {
    if (context.sampleId && context.rackNo && context.samplePosition) {
        return `${context.sampleId}^${context.rackNo}^${context.samplePosition}`;
    }
    return context.sampleId || "";
}

function buildOrderTestField(tests = []) {
    return tests
        .map((item) => {
            const components = [
                "",
                "",
                "",
                item.testCode || "",
                item.dilutionProtocol || "",
                item.dilutionRatio || "",
            ];

            while (components.length && !components[components.length - 1]) {
                components.pop();
            }

            return components.join("^");
        })
        .filter(Boolean)
        .join("\\");
}

function buildOrderRecord(context) {
    const fields = [];
    fields[0] = "O";
    fields[1] = "1";
    fields[2] = buildSpecimenId(context);
    fields[4] = buildOrderTestField(context.tests);
    fields[5] = context.priority || "R";
    fields[11] = context.actionCode || "";
    fields[25] = context.reportType || "F";
    return fields.join("|");
}

function buildManufacturerOrderRecord(context) {
    if (!context.controlName && !context.controlLotNumber) {
        return "";
    }

    const fields = [];
    fields[0] = "M";
    fields[1] = "1";
    fields[2] = "CCD^ACS:NG^V1^O";
    fields[3] = context.controlName || "";
    fields[4] = context.controlLotNumber || "";
    return fields.join("|");
}

function buildResultRecord(result, index) {
    const universal = [
        "",
        "",
        "",
        result.testCode,
        result.dilutionProtocol || "",
        result.dilutionRatio || "",
        result.replicateNumber || "",
        result.resultAspect || "DOSE",
    ].join("^");

    const resultStatus = Array.isArray(result.resultStatus)
        ? result.resultStatus.join("\\")
        : (result.resultStatus || "F");
    const abnormalFlags = Array.isArray(result.abnormalFlags)
        ? result.abnormalFlags.join("\\")
        : (result.abnormalFlags || "");

    const fields = [];
    fields[0] = "R";
    fields[1] = String(index + 1);
    fields[2] = universal;
    fields[3] = result.value;
    fields[4] = result.units || "";
    fields[5] = result.allergyClassRange || "";
    fields[6] = abnormalFlags;
    fields[8] = resultStatus;
    fields[12] = result.completedAt || formatTimestamp();
    return fields.join("|");
}

function buildCommentRecord(comment, index = 1) {
    const fields = [];
    fields[0] = "C";
    fields[1] = String(index);
    fields[2] = comment.source || "I";
    fields[3] = [comment.commentCode || "", comment.commentText || ""].join("^");
    fields[4] = comment.commentType || "I";
    return fields.join("|");
}

function buildTerminationRecord(code = "N") {
    return `L|1|${code}`;
}

function buildQueryRecord(context) {
    const q3 = context.sampleId ? `^${context.sampleId}` : "ALL";
    const q4 = context.sampleId ? `^${context.sampleId}` : "";
    const testField = context.queryAllTests
        ? "ALL"
        : context.tests.map((item) => `^^^${item.testCode}`).join("\\");

    const fields = [];
    fields[0] = "Q";
    fields[1] = "1";
    fields[2] = q3;
    fields[3] = q4;
    fields[4] = testField || "ALL";
    fields[12] = context.queryStatus || "O";
    return fields.join("|");
}

function printMessage(title, message) {
    console.log(`\n=== ${title} ===`);
    for (const line of String(message || "").split(/\r?\n|\r/).filter(Boolean)) {
        console.log(line);
    }
}

const COMMON_RESULT_LIBRARY = {
    CKMB: [{ testCode: "CKMB", value: "3.6", units: "ng/mL", resultAspect: "DOSE" }],
    IRI: [{ testCode: "IRI", value: "11.8", units: "uIU/mL", resultAspect: "DOSE" }],
    VB12: [{ testCode: "VB12", value: "412", units: "pg/mL", resultAspect: "DOSE" }],
    FER: [{ testCode: "FER", value: "45.0", units: "ng/mL", abnormalFlags: ["L"], resultAspect: "DOSE" }],
    TSH: [{ testCode: "TSH", value: "2.35", units: "uIU/mL", resultAspect: "DOSE" }],
    TSH3UL: [{ testCode: "TSH3UL", value: "2.40", units: "uIU/mL", resultAspect: "DOSE" }],
    T3: [{ testCode: "T3", value: "1.42", units: "ng/mL", resultAspect: "DOSE" }],
    FT3: [{ testCode: "FT3", value: "3.20", units: "pg/mL", resultAspect: "DOSE" }],
    T4: [{ testCode: "T4", value: "8.6", units: "ug/dL", resultAspect: "DOSE" }],
    FT4: [{ testCode: "FT4", value: "1.18", units: "ng/dL", resultAspect: "DOSE" }],
    LH: [{ testCode: "LH", value: "6.4", units: "mIU/mL", resultAspect: "DOSE" }],
    FSH: [{ testCode: "FSH", value: "7.8", units: "mIU/mL", resultAspect: "DOSE" }],
    PRL: [{ testCode: "PRL", value: "14.6", units: "ng/mL", resultAspect: "DOSE" }],
    PRGE: [{ testCode: "PRGE", value: "8.2", units: "ng/mL", resultAspect: "DOSE" }],
    TSTO: [{ testCode: "TSTO", value: "5.40", units: "ng/mL", resultAspect: "DOSE" }],
    COR: [{ testCode: "COR", value: "14.2", units: "ug/dL", resultAspect: "DOSE" }],
    PTH: [{ testCode: "PTH", value: "42.0", units: "pg/mL", resultAspect: "DOSE" }],
    "CA15-3": [{ testCode: "CA15-3", value: "18.4", units: "U/mL", resultAspect: "DOSE" }],
    CA125II: [{ testCode: "CA125II", value: "24.1", units: "U/mL", resultAspect: "DOSE" }],
    CA199: [{ testCode: "CA199", value: "16.8", units: "U/mL", resultAspect: "DOSE" }],
    PSA: [{ testCode: "PSA", value: "1.92", units: "ng/mL", resultAspect: "DOSE" }],
    cPSA: [{ testCode: "cPSA", value: "0.61", units: "ng/mL", resultAspect: "DOSE" }],
    CEA: [{ testCode: "CEA", value: "2.3", units: "ng/mL", resultAspect: "DOSE" }],
    AFP: [{ testCode: "AFP", value: "8.4", units: "ng/mL", resultAspect: "DOSE" }],
    PCT: [{ testCode: "PCT", value: "0.08", units: "ng/mL", resultAspect: "DOSE" }],
    aHAVM: [{ testCode: "aHAVM", value: "0.12", units: "Index", resultAspect: "DOSE" }],
    aHAVT: [{ testCode: "aHAVT", value: "22.0", units: "mIU/mL", resultAspect: "DOSE" }],
    HBsII: [{ testCode: "HBsII", value: "0.18", units: "Index", resultAspect: "DOSE" }],
    Conf: [{ testCode: "Conf", value: "1.00", units: "Index", resultAspect: "DOSE" }],
    aHBs2: [{ testCode: "aHBs2", value: "146.0", units: "mIU/mL", resultAspect: "DOSE" }],
    HBeAg: [{ testCode: "HBeAg", value: "0.21", units: "Index", resultAspect: "DOSE" }],
    HBe: [{ testCode: "HBe", value: "0.34", units: "Index", resultAspect: "DOSE" }],
    aHCV: [{ testCode: "aHCV", value: "0.09", units: "Index", resultAspect: "DOSE" }],
    CARB: [{ testCode: "CARB", value: "7.4", units: "ug/mL", resultAspect: "DOSE" }],
    VALP: [{ testCode: "VALP", value: "82.0", units: "ug/mL", resultAspect: "DOSE" }],
    TnIUltra: [{ testCode: "TnIUltra", value: "0.012", units: "ng/mL", resultAspect: "DOSE" }],
    HCG: [{ testCode: "HCG", value: "125.0", units: "mIU/mL", resultAspect: "DOSE" }],
};

function buildResultsFromRequestedTests(tests, options = {}) {
    const completedAt = options.completedAt || formatTimestamp();
    const resultStatus = parseCsvList(options.resultStatus, ["F"]);
    const abnormalFlags = parseCsvList(options.abnormalFlag, []);
    const dilutionProtocol = options.dilutionProtocol || "";
    const dilutionRatio = options.dilutionRatio || "";

    return tests.flatMap((test) => {
        const profiles = COMMON_RESULT_LIBRARY[test.testCode] || [{
            testCode: test.testCode,
            value: "1.0",
            units: "",
            resultAspect: "DOSE",
        }];

        return profiles.map((profile) => ({
            ...profile,
            dilutionProtocol,
            dilutionRatio,
            resultStatus: profile.resultStatus || resultStatus,
            abnormalFlags: profile.abnormalFlags || abnormalFlags,
            completedAt,
        }));
    });
}

function createDefaultContext(sequenceNo, overrides = {}) {
    const sampleId = overrides.sampleId || buildSampleId(sequenceNo);
    const tests = parseCsvList(process.env.CENTAUR_EMULATOR_TEST_CODES, ["FER", "TSH"]).map((testCode) => ({
        testCode,
    }));
    const isQc = sampleId.toUpperCase().startsWith("QC");

    return {
        sampleId,
        rackNo: process.env.CENTAUR_EMULATOR_RACK_NO || "",
        samplePosition: process.env.CENTAUR_EMULATOR_SAMPLE_POSITION || "",
        patientId: overrides.patientId || process.env.CENTAUR_EMULATOR_PATIENT_ID || "",
        patientName: overrides.patientName || process.env.CENTAUR_EMULATOR_PATIENT_NAME || "DOE^JOHN",
        dateOfBirth: process.env.CENTAUR_EMULATOR_DATE_OF_BIRTH || "",
        sex: process.env.CENTAUR_EMULATOR_SEX || "",
        priority: process.env.CENTAUR_EMULATOR_PRIORITY || "R",
        actionCode: isQc ? "Q" : (process.env.CENTAUR_EMULATOR_ACTION_CODE || ""),
        reportType: process.env.CENTAUR_EMULATOR_REPORT_TYPE || "F",
        queryStatus: process.env.CENTAUR_EMULATOR_QUERY_STATUS || "O",
        queryAllTests: normalizeBoolean(process.env.CENTAUR_EMULATOR_QUERY_ALL_TESTS, false),
        tests,
        controlName: isQc ? (process.env.CENTAUR_EMULATOR_CONTROL_NAME || "CTRL1") : "",
        controlLotNumber: isQc ? (process.env.CENTAUR_EMULATOR_CONTROL_LOT || "000001") : "",
        results: buildResultsFromRequestedTests(tests, {
            resultStatus: process.env.CENTAUR_EMULATOR_RESULT_STATUS || "F",
            abnormalFlag: process.env.CENTAUR_EMULATOR_ABNORMAL_FLAG || "",
            dilutionProtocol: process.env.CENTAUR_EMULATOR_DILUTION_PROTOCOL || "",
            dilutionRatio: process.env.CENTAUR_EMULATOR_DILUTION_RATIO || "",
        }),
        resultComments: (() => {
            const commentCode = String(process.env.CENTAUR_EMULATOR_RESULT_COMMENT_CODE || "").trim();
            if (!commentCode) {
                return [];
            }
            return [{
                source: "I",
                commentCode,
                commentText: String(process.env.CENTAUR_EMULATOR_RESULT_COMMENT_TEXT || "").trim(),
                commentType: "I",
            }];
        })(),
    };
}

function buildResultMessage(context) {
    const lines = [
        buildHeaderRecord(),
        buildPatientRecord(context),
        buildOrderRecord(context),
    ];

    const manufacturerRecord = buildManufacturerOrderRecord(context);
    if (manufacturerRecord) {
        lines.push(manufacturerRecord);
    }

    context.results.forEach((result, index) => {
        lines.push(buildResultRecord(result, index));
        if (index === 0 && context.resultComments.length) {
            context.resultComments.forEach((comment, commentIndex) => {
                lines.push(buildCommentRecord(comment, commentIndex + 1));
            });
        }
    });

    lines.push(buildTerminationRecord(context.resultTerminationCode || "N"));
    return lines.join("\r") + "\r";
}

function buildQueryMessage(context) {
    return [
        buildHeaderRecord(),
        buildQueryRecord(context),
        buildTerminationRecord("N"),
    ].join("\r") + "\r";
}

async function getSerialPortClass() {
    const serialportModule = await import("serialport").catch(() => null);
    if (!serialportModule?.SerialPort) {
        throw new Error('Package "serialport" is not installed. Run npm install to enable the ADVIA Centaur emulator.');
    }

    return serialportModule.SerialPort;
}

async function createPort(printOnly = false) {
    if (printOnly) {
        return null;
    }

    const SerialPort = await getSerialPortClass();
    const portPath = process.env.CENTAUR_EMULATOR_COM_PORT?.trim() || process.env.CENTAUR_COM_PORT?.trim();
    if (!portPath) {
        throw new Error("CENTAUR_EMULATOR_COM_PORT is not configured.");
    }

    const port = new SerialPort({
        path: portPath,
        baudRate: Number(process.env.CENTAUR_EMULATOR_BAUD_RATE || process.env.CENTAUR_BAUD_RATE || 9600),
        dataBits: Number(process.env.CENTAUR_EMULATOR_DATA_BITS || process.env.CENTAUR_DATA_BITS || 8),
        stopBits: Number(process.env.CENTAUR_EMULATOR_STOP_BITS || process.env.CENTAUR_STOP_BITS || 1),
        parity: process.env.CENTAUR_EMULATOR_PARITY || process.env.CENTAUR_PARITY || "none",
        autoOpen: true,
    });

    await new Promise((resolve, reject) => {
        port.once("open", resolve);
        port.once("error", reject);
    });

    log("COM port opened", portPath);
    return port;
}

function hasWorkReply(parsedMessage) {
    return Boolean(parsedMessage?.order && Array.isArray(parsedMessage.order.tests) && parsedMessage.order.tests.length);
}

function isNoInfoReply(parsedMessage) {
    return parsedMessage?.termination?.terminationCode === "I";
}

function describeHostReply(parsedMessage) {
    const terminationCode = String(parsedMessage?.termination?.terminationCode || "").trim().toUpperCase();

    if (terminationCode === "I") {
        return {
            type: "no-work",
            terminationCode,
        };
    }

    if (terminationCode === "Q") {
        return {
            type: "query-error",
            terminationCode,
        };
    }

    if (hasWorkReply(parsedMessage)) {
        return {
            type: "worklist",
            terminationCode,
        };
    }

    return {
        type: "reply",
        terminationCode,
    };
}

async function runScenario({
    mode,
    sequenceNo,
    sampleId,
    patientName,
    printOnly = false,
}) {
    const context = createDefaultContext(sequenceNo, { sampleId, patientName });
    const port = await createPort(printOnly);
    let doneResolve;
    const done = new Promise((resolve) => {
        doneResolve = resolve;
    });
    let hostReplyReceived = false;

    const write = (buffer) => {
        if (printOnly) {
            const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
            console.log(bytes.toString("ascii").replace(/\r/g, "<CR>").replace(/\n/g, "<LF>"));
            return;
        }
        port.write(buffer);
    };

    const link = createAstmE1381Link({
        write,
        log: (message, extra = "") => log(message, extra),
        checksumIncludeStx: normalizeBoolean(process.env.CENTAUR_EMULATOR_CHECKSUM_INCLUDE_STX, false),
        onMessage: async (rawMessage) => {
            printMessage("HOST->EMU ASTM", rawMessage);
            const parsed = parseAdviaCentaurAstmMessage(rawMessage);
            hostReplyReceived = true;
            const replyInfo = describeHostReply(parsed);

            if (replyInfo.type === "no-work") {
                log("HOST REPLIED NO WORK", `${context.sampleId} L|1|${replyInfo.terminationCode}`);
            } else if (replyInfo.type === "worklist") {
                const testCodes = (parsed.order?.tests || []).map((item) => item.testCode).filter(Boolean).join(",");
                log("HOST REPLIED WORKLIST", `${context.sampleId} tests=[${testCodes}] L|1|${replyInfo.terminationCode || "F"}`);
            } else if (replyInfo.type === "query-error") {
                log("HOST REPLIED QUERY ERROR", `${context.sampleId} L|1|${replyInfo.terminationCode}`);
            } else {
                log("HOST REPLIED", `${context.sampleId} L|1|${replyInfo.terminationCode || "?"}`);
            }

            if (isNoInfoReply(parsed) || !hasWorkReply(parsed)) {
                log("No work returned by host", context.sampleId);
                doneResolve();
                return;
            }

            if (mode === "query-then-result") {
                const derivedResults = buildResultsFromRequestedTests(parsed.order.tests, {
                    resultStatus: process.env.CENTAUR_EMULATOR_RESULT_STATUS || "F",
                    abnormalFlag: process.env.CENTAUR_EMULATOR_ABNORMAL_FLAG || "",
                    dilutionProtocol: process.env.CENTAUR_EMULATOR_DILUTION_PROTOCOL || "",
                    dilutionRatio: process.env.CENTAUR_EMULATOR_DILUTION_RATIO || "",
                });

                const resultMessage = buildResultMessage({
                    ...context,
                    patientId: parsed.patient?.patientId || context.patientId,
                    patientName: parsed.patient?.patientName || context.patientName,
                    dateOfBirth: parsed.patient?.dateOfBirth || context.dateOfBirth,
                    sex: parsed.patient?.sex || context.sex,
                    sampleId: parsed.order?.specimen?.sampleId || context.sampleId,
                    rackNo: parsed.order?.specimen?.rackNo || context.rackNo,
                    samplePosition: parsed.order?.specimen?.samplePosition || context.samplePosition,
                    actionCode: parsed.order?.actionCode || context.actionCode,
                    results: derivedResults,
                });

                const resultDelayMs = Number(process.env.CENTAUR_EMULATOR_RESULT_DELAY_MS || 30000);
                log("Emulating analyzer work", `${resultDelayMs}ms before sending results`);
                await new Promise((resolve) => setTimeout(resolve, resultDelayMs));
                printMessage("EMU->HOST RESULT", resultMessage);
                await link.queueMessage(resultMessage);
                doneResolve();
                return;
            }

            doneResolve();
        },
    });

    if (port) {
        port.on("data", (chunk) => {
            link.feed(chunk);
        });
        port.on("error", (error) => {
            log("COM port error", error instanceof Error ? error.message : String(error));
        });
    }

    if (mode === "result") {
        const resultMessage = buildResultMessage(context);
        printMessage("EMU->HOST RESULT", resultMessage);
        if (!printOnly) {
            await link.queueMessage(resultMessage);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        doneResolve();
    } else if (mode === "query") {
        const queryMessage = buildQueryMessage(context);
        printMessage("EMU->HOST QUERY", queryMessage);
        if (!printOnly) {
            await link.queueMessage(queryMessage);
            const queryTimeoutMs = Number(process.env.CENTAUR_EMULATOR_QUERY_TIMEOUT_MS || 8000);
            setTimeout(() => doneResolve(), queryTimeoutMs);
        } else {
            doneResolve();
        }
    } else if (mode === "query-then-result") {
        const queryMessage = buildQueryMessage(context);
        printMessage("EMU->HOST QUERY", queryMessage);
        if (!printOnly) {
            await link.queueMessage(queryMessage);
            const queryTimeoutMs = Number(process.env.CENTAUR_EMULATOR_QUERY_TIMEOUT_MS || 8000);
            setTimeout(() => {
                if (!hostReplyReceived) {
                    log("No host reply received within timeout");
                    doneResolve();
                }
            }, queryTimeoutMs);
        } else {
            const resultMessage = buildResultMessage(context);
            printMessage("EMU->HOST RESULT", resultMessage);
            doneResolve();
        }
    } else {
        throw new Error(`Unsupported emulator mode: ${mode}`);
    }

    await done;

    if (port) {
        await new Promise((resolve) => port.close(() => resolve()));
    }
}

async function startInteractiveMode(mode, printOnly = false) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
    });

    let sequenceNo = Number(process.env.CENTAUR_EMULATOR_START_SEQUENCE || 1);
    const ask = () => new Promise((resolve) => rl.question("sampleId> ", resolve));

    log(`Interactive mode. Current scenario: ${mode}. Press Enter for auto sampleId, type "exit" to quit.`);

    while (true) {
        const answer = String(await ask()).trim();
        if (["exit", "quit", "q"].includes(answer.toLowerCase())) {
            break;
        }

        const sampleId = answer || buildSampleId(sequenceNo);
        try {
            await runScenario({
                mode,
                sequenceNo,
                sampleId,
                patientName: process.env.CENTAUR_EMULATOR_PATIENT_NAME || "DOE^JOHN",
                printOnly,
            });
        } catch (error) {
            log("Scenario error", error instanceof Error ? error.message : String(error));
        }

        sequenceNo += 1;
    }

    rl.close();
}

async function startAutoMode(mode, printOnly = false) {
    let sequenceNo = Number(process.env.CENTAUR_EMULATOR_START_SEQUENCE || 1);
    const intervalMs = Number(process.env.CENTAUR_EMULATOR_INTERVAL_MS || 7000);

    log("Auto-send mode started", JSON.stringify({ mode, intervalMs, printOnly }));

    while (true) {
        try {
            await runScenario({
                mode,
                sequenceNo,
                sampleId: buildSampleId(sequenceNo),
                patientName: process.env.CENTAUR_EMULATOR_PATIENT_NAME || "DOE^JOHN",
                printOnly,
            });
        } catch (error) {
            log("Auto scenario error", error instanceof Error ? error.message : String(error));
        }

        sequenceNo += 1;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
}

async function main() {
    const args = process.argv.slice(2);
    const flags = new Set(args.filter((item) => item.startsWith("--")));
    const positional = args.filter((item) => !item.startsWith("--"));

    const modeFlag = Array.from(flags).find((item) => item.startsWith("--mode="));
    const mode = (modeFlag ? modeFlag.split("=")[1] : process.env.CENTAUR_EMULATOR_MODE || "result").trim();
    const sampleId = positional[0]?.trim();
    const patientName = positional.slice(1).join(" ").trim() || process.env.CENTAUR_EMULATOR_PATIENT_NAME || "DOE^JOHN";
    const printOnly = flags.has("--print-only") || normalizeBoolean(process.env.CENTAUR_EMULATOR_PRINT_ONLY, false);

    log(
        "Startup config",
        JSON.stringify({
            mode,
            printOnly,
            autoSend: normalizeBoolean(process.env.CENTAUR_EMULATOR_AUTO_SEND, false),
            fileLogEnabled: fileLogger.enabled,
            fileLogPath: fileLogger.path,
        })
    );

    if (normalizeBoolean(process.env.CENTAUR_EMULATOR_AUTO_SEND, false)) {
        await startAutoMode(mode, printOnly);
        return;
    }

    if (sampleId) {
        await runScenario({
            mode,
            sequenceNo: Number(process.env.CENTAUR_EMULATOR_START_SEQUENCE || 1),
            sampleId,
            patientName,
            printOnly,
        });
        return;
    }

    await startInteractiveMode(mode, printOnly);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(`[CENTAUR-EMU] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
