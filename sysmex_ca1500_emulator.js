import "dotenv/config";
import { config as loadEnvFile } from "dotenv";
import readline from "node:readline";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCa1500AstmLink } from "./sysmex_ca1500_astm.js";
import { parseCa1500AstmMessage } from "./sysmex_ca1500_parser.js";

loadEnvFile({
    path: path.join(process.cwd(), ".env"),
    override: false,
});

function log(message, extra = "") {
    console.log(`[CA1500-EMU] ${message}${extra ? ` ${extra}` : ""}`);
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

function buildSampleNo(sequenceNo) {
    return String(sequenceNo).padStart(15, "0");
}

function parseCsvList(value, fallback = []) {
    const items = String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    return items.length ? items : fallback;
}

function buildAnalyzerHeader() {
    const softwareVersion = process.env.CA1500_EMULATOR_SOFTWARE_VERSION || "00-01";
    const instrumentNo = process.env.CA1500_EMULATOR_INSTRUMENT_NO || "INSNO";
    const userInstrumentNo = process.env.CA1500_EMULATOR_USER_INSTRUMENT_NO || "USERINSNO";
    return `H|\\^&|||CA-1500^${softwareVersion}^${instrumentNo}^^^${userInstrumentNo}||||||||1`;
}

function buildPatientRecord(patientName) {
    return `P|1||||${String(patientName || "").trim()}`;
}

function buildAnalyzerOrderRecord({
    rackNo,
    tubePosition,
    sampleNo,
    sampleAttribute,
    expandedOrderFlag = "",
    priority = "R",
    actionCode = "N",
}) {
    const specimen = [rackNo, tubePosition, sampleNo, sampleAttribute, expandedOrderFlag].join("^");
    return `O|1||${specimen}||${priority}||||||${actionCode}`;
}

function buildQueryRecord({
    rackNo,
    tubePosition,
    sampleNo,
    sampleAttribute,
    tests,
    requestedAt,
}) {
    const specimen = [rackNo, tubePosition, sampleNo, sampleAttribute].join("^");
    const testField = tests
        .map((item) => `^^^${item.testCode}^${item.testName || ""}`)
        .join("\\");

    return `Q|1|${specimen}||${testField}|0|${requestedAt}`;
}

function buildResultRecord(result, index) {
    const universal = [
        "",
        "",
        "",
        result.testCode,
        result.testName || "",
        result.dilution || "100.00",
        result.resultType || "1",
        result.expandOrderRequired || "",
        result.expandOrderResult || "",
        result.reflexRequired || "",
    ].join("^");

    return `R|${index + 1}|${universal}|${result.value}|${result.units || ""}||${result.abnormalFlag || "N"}||||||${result.completedAt || formatTimestamp()}`;
}

function buildTerminationRecord() {
    return "L|1|N";
}

function buildResultMessage(context) {
    const lines = [
        buildAnalyzerHeader(),
        buildPatientRecord(context.patientName),
        buildAnalyzerOrderRecord(context),
        ...context.results.map((result, index) => buildResultRecord(result, index)),
        buildTerminationRecord(),
    ];

    return lines.join("\r") + "\r";
}

function buildQueryMessage(context) {
    const lines = [
        buildAnalyzerHeader(),
        buildQueryRecord(context),
        buildTerminationRecord(),
    ];

    return lines.join("\r") + "\r";
}

const COMMON_RESULT_LIBRARY = {
    "040": [
        { testCode: "041", testName: "PT", value: "15.2", units: "sec" },
        { testCode: "042", testName: "PT %", value: "78.6", units: "%" },
        { testCode: "043", testName: "PT R.", value: "1.32", units: "" },
        { testCode: "044", testName: "PT INR", value: "1.74", units: "" },
    ],
    "041": [{ testCode: "041", testName: "PT", value: "15.2", units: "sec" }],
    "042": [{ testCode: "042", testName: "PT %", value: "78.6", units: "%" }],
    "043": [{ testCode: "043", testName: "PT R.", value: "1.32", units: "" }],
    "044": [{ testCode: "044", testName: "PT INR", value: "1.74", units: "" }],
    "050": [{ testCode: "051", testName: "APTT", value: "32.6", units: "sec" }],
    "051": [{ testCode: "051", testName: "APTT", value: "32.6", units: "sec" }],
    "060": [
        { testCode: "061", testName: "Fbg", value: "8.2", units: "sec" },
        { testCode: "062", testName: "Fbg C.", value: "220.0", units: "mg/dL" },
    ],
    "061": [{ testCode: "061", testName: "Fbg", value: "8.2", units: "sec" }],
    "062": [{ testCode: "062", testName: "Fbg C.", value: "220.0", units: "mg/dL" }],
    "270": [{ testCode: "271", testName: "271", value: "36.4", units: "sec" }],
    "271": [{ testCode: "271", testName: "271", value: "36.4", units: "sec" }],
    "280": [
        { testCode: "281", testName: "281", value: "12.8", units: "sec" },
        { testCode: "283", testName: "283", value: "1.16", units: "" },
    ],
    "281": [{ testCode: "281", testName: "281", value: "12.8", units: "sec" }],
    "283": [{ testCode: "283", testName: "283", value: "1.16", units: "" }],
    "290": [{ testCode: "292", testName: "292", value: "145.0", units: "mg/dL" }],
    "292": [{ testCode: "292", testName: "292", value: "145.0", units: "mg/dL" }],
    "300": [{ testCode: "302", testName: "302", value: "28.4", units: "sec" }],
    "302": [{ testCode: "302", testName: "302", value: "28.4", units: "sec" }],
    "330": [{ testCode: "331", testName: "331", value: "2.45", units: "" }],
    "331": [{ testCode: "331", testName: "331", value: "2.45", units: "" }],
    "510": [
        { testCode: "511", testName: "TT", value: "18.5", units: "sec" },
        { testCode: "513", testName: "513", value: "2.8", units: "g/L" },
    ],
    "511": [{ testCode: "511", testName: "TT", value: "18.5", units: "sec" }],
    "513": [{ testCode: "513", testName: "513", value: "2.8", units: "g/L" }],
};

function buildResultsFromRequestedTests(tests, options = {}) {
    const resultType = String(options.resultType || "1");
    const completedAt = options.completedAt || formatTimestamp();
    const expandOrderRequired = options.expandOrderRequired || "";
    const expandOrderResult = options.expandOrderResult || "";
    const reflexRequired = options.reflexRequired || "";
    const dilution = options.dilution || "100.00";

    return tests.flatMap((test) => {
        const profiles = COMMON_RESULT_LIBRARY[test.testCode] || [{
            testCode: test.testCode,
            testName: test.testName || test.testCode,
            value: "1.0",
            units: "",
        }];

        return profiles.map((profile) => ({
            ...profile,
            dilution,
            resultType,
            expandOrderRequired,
            expandOrderResult,
            reflexRequired,
            abnormalFlag: options.abnormalFlag || "N",
            completedAt,
        }));
    });
}

function createDefaultContext(sequenceNo, overrides = {}) {
    const rackNo = process.env.CA1500_EMULATOR_RACK_NO || "001000";
    const tubePosition = process.env.CA1500_EMULATOR_TUBE_POSITION || "01";
    const sampleNo = overrides.sampleNo || buildSampleNo(sequenceNo);
    const sampleAttribute = process.env.CA1500_EMULATOR_SAMPLE_ATTRIBUTE || "A";
    const patientName = overrides.patientName || process.env.CA1500_EMULATOR_PATIENT_NAME || "PATIENTNAME";
    const tests = parseCsvList(process.env.CA1500_EMULATOR_TEST_CODES, ["040", "050", "060"]).map((testCode) => ({
        testCode,
        testName: "",
    }));

    return {
        rackNo,
        tubePosition,
        sampleNo,
        sampleAttribute,
        patientName,
        tests,
        requestedAt: formatTimestamp(),
        expandedOrderFlag: process.env.CA1500_EMULATOR_EXPANDED_ORDER_FLAG || "",
        priority: process.env.CA1500_EMULATOR_PRIORITY || "R",
        actionCode: process.env.CA1500_EMULATOR_ACTION_CODE || "N",
        results: buildResultsFromRequestedTests(tests, {
            resultType: process.env.CA1500_EMULATOR_RESULT_TYPE || "1",
            dilution: process.env.CA1500_EMULATOR_DILUTION || "100.00",
            expandOrderRequired: process.env.CA1500_EMULATOR_EXPAND_ORDER_REQUIRED || "",
            expandOrderResult: process.env.CA1500_EMULATOR_EXPAND_ORDER_RESULT || "",
            reflexRequired: process.env.CA1500_EMULATOR_REFLEX_REQUIRED || "",
            abnormalFlag: process.env.CA1500_EMULATOR_ABNORMAL_FLAG || "N",
        }),
    };
}

async function getSerialPortClass() {
    const serialportModule = await import("serialport").catch(() => null);
    if (!serialportModule?.SerialPort) {
        throw new Error('Package "serialport" is not installed. Run npm install to enable the CA-1500 emulator.');
    }

    return serialportModule.SerialPort;
}

async function createPort(printOnly = false) {
    if (printOnly) {
        return null;
    }

    const SerialPort = await getSerialPortClass();
    const portPath = process.env.CA1500_EMULATOR_COM_PORT?.trim() || process.env.CA1500_COM_PORT?.trim();
    if (!portPath) {
        throw new Error("CA1500_EMULATOR_COM_PORT is not configured.");
    }

    const port = new SerialPort({
        path: portPath,
        baudRate: Number(process.env.CA1500_EMULATOR_BAUD_RATE || process.env.CA1500_BAUD_RATE || 9600),
        dataBits: Number(process.env.CA1500_EMULATOR_DATA_BITS || process.env.CA1500_DATA_BITS || 8),
        stopBits: Number(process.env.CA1500_EMULATOR_STOP_BITS || process.env.CA1500_STOP_BITS || 1),
        parity: process.env.CA1500_EMULATOR_PARITY || process.env.CA1500_PARITY || "none",
        autoOpen: true,
    });

    await new Promise((resolve, reject) => {
        port.once("open", resolve);
        port.once("error", reject);
    });

    log("COM port opened", portPath);
    return port;
}

function printMessage(title, message) {
    console.log(`\n=== ${title} ===`);
    for (const line of String(message || "").split(/\r?\n|\r/).filter(Boolean)) {
        console.log(line);
    }
}

function hasWorkInOrder(parsedMessage) {
    return Boolean(parsedMessage?.order && Array.isArray(parsedMessage.order.tests) && parsedMessage.order.tests.length);
}

async function runScenario({
    mode,
    sequenceNo,
    sampleNo,
    patientName,
    printOnly = false,
}) {
    const context = createDefaultContext(sequenceNo, { sampleNo, patientName });
    const port = await createPort(printOnly);
    let link;
    let done;
    let doneResolve;

    done = new Promise((resolve) => {
        doneResolve = resolve;
    });

    let hostOrderMessageReceived = false;

    const write = (buffer) => {
        if (printOnly) {
            const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
            console.log(bytes.toString("ascii").replace(/\r/g, "<CR>").replace(/\n/g, "<LF>"));
            return;
        }
        port.write(buffer);
    };

    link = createCa1500AstmLink({
        write,
        log: (message, extra = "") => log(message, extra),
        checksumIncludeStx: normalizeBoolean(process.env.CA1500_EMULATOR_CHECKSUM_INCLUDE_STX, false),
        onMessage: async (rawMessage) => {
            printMessage("HOST->EMU ASTM", rawMessage);
            const parsed = parseCa1500AstmMessage(rawMessage);
            if (parsed.order) {
                hostOrderMessageReceived = true;
                log("Host order received", parsed.order.specimen.sampleNo || "");

                if (!hasWorkInOrder(parsed)) {
                    log("No work returned by host", parsed.order.specimen.sampleNo || "");
                    doneResolve();
                    return;
                }

                log("Work returned by host", `${parsed.order.tests.length} test(s)`);

                if (mode === "query-then-result") {
                    const derivedResults = buildResultsFromRequestedTests(
                        parsed.order.tests.length
                            ? parsed.order.tests
                            : context.tests,
                        {
                            resultType: process.env.CA1500_EMULATOR_RESULT_TYPE || "1",
                            dilution: process.env.CA1500_EMULATOR_DILUTION || "100.00",
                            expandOrderRequired: process.env.CA1500_EMULATOR_EXPAND_ORDER_REQUIRED || "",
                            expandOrderResult: process.env.CA1500_EMULATOR_EXPAND_ORDER_RESULT || "",
                            reflexRequired: process.env.CA1500_EMULATOR_REFLEX_REQUIRED || "",
                            abnormalFlag: process.env.CA1500_EMULATOR_ABNORMAL_FLAG || "N",
                        }
                    );

                    const resultMessage = buildResultMessage({
                        ...context,
                        patientName: parsed.patient?.patientName || context.patientName,
                        results: derivedResults,
                    });

                    const resultDelayMs = Number(process.env.CA1500_EMULATOR_RESULT_DELAY_MS || 30000);
                    log("Emulating analyzer work", `${resultDelayMs}ms before sending results`);
                    await new Promise((resolve) => setTimeout(resolve, resultDelayMs));
                    printMessage("EMU->HOST RESULT", resultMessage);
                    await link.queueMessage(resultMessage);
                    doneResolve();
                    return;
                }

                doneResolve();
            }
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
            const queryTimeoutMs = Number(process.env.CA1500_EMULATOR_QUERY_TIMEOUT_MS || 8000);
            setTimeout(() => doneResolve(), queryTimeoutMs);
        } else {
            doneResolve();
        }
    } else if (mode === "query-then-result") {
        const queryMessage = buildQueryMessage(context);
        printMessage("EMU->HOST QUERY", queryMessage);
        if (!printOnly) {
            await link.queueMessage(queryMessage);
            const queryTimeoutMs = Number(process.env.CA1500_EMULATOR_QUERY_TIMEOUT_MS || 8000);
            setTimeout(() => {
                if (!hostOrderMessageReceived) {
                    log("No host order reply received within timeout");
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

    let sequenceNo = Number(process.env.CA1500_EMULATOR_START_SEQUENCE || 1);
    const ask = () => new Promise((resolve) => rl.question("sampleNo> ", resolve));

    log(`Interactive mode. Current scenario: ${mode}. Press Enter for auto sampleNo, type "exit" to quit.`);

    while (true) {
        const answer = String(await ask()).trim();
        if (["exit", "quit", "q"].includes(answer.toLowerCase())) {
            break;
        }

        const sampleNo = answer || buildSampleNo(sequenceNo);
        try {
            await runScenario({
                mode,
                sequenceNo,
                sampleNo,
                patientName: process.env.CA1500_EMULATOR_PATIENT_NAME || "PATIENTNAME",
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
    let sequenceNo = Number(process.env.CA1500_EMULATOR_START_SEQUENCE || 1);
    const intervalMs = Number(process.env.CA1500_EMULATOR_INTERVAL_MS || 7000);

    log("Auto-send mode started", JSON.stringify({ mode, intervalMs, printOnly }));

    while (true) {
        const sampleNo = buildSampleNo(sequenceNo);
        try {
            await runScenario({
                mode,
                sequenceNo,
                sampleNo,
                patientName: process.env.CA1500_EMULATOR_PATIENT_NAME || "PATIENTNAME",
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
    const mode = (modeFlag ? modeFlag.split("=")[1] : process.env.CA1500_EMULATOR_MODE || "result").trim();
    const sampleNo = positional[0]?.trim();
    const patientName = positional.slice(1).join(" ").trim() || process.env.CA1500_EMULATOR_PATIENT_NAME || "PATIENTNAME";
    const printOnly = flags.has("--print-only") || normalizeBoolean(process.env.CA1500_EMULATOR_PRINT_ONLY, false);

    if (normalizeBoolean(process.env.CA1500_EMULATOR_AUTO_SEND, false)) {
        await startAutoMode(mode, printOnly);
        return;
    }

    if (sampleNo) {
        await runScenario({
            mode,
            sequenceNo: Number(process.env.CA1500_EMULATOR_START_SEQUENCE || 1),
            sampleNo,
            patientName,
            printOnly,
        });
        return;
    }

    await startInteractiveMode(mode, printOnly);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(`[CA1500-EMU] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
