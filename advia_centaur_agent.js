import "dotenv/config";
import axios from "axios";
import { config as loadEnvFile } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAnalyzerAccessClient } from "./analyzer_access_client.js";
import { createSybaseAnalyzerResultIngester } from "./sybase_analyzer_result_ingest.js";
import { createAstmE1381Link } from "./astm_e1381_link.js";
import { createLineFileLogger } from "./line_file_logger.js";
import {
    buildAdviaCentaurNoInformationMessage,
    buildAdviaCentaurQueryContext,
    buildAdviaCentaurQueryErrorMessage,
    buildAdviaCentaurResultPayload,
    buildAdviaCentaurWorklistMessage,
    parseAdviaCentaurAstmMessage,
} from "./advia_centaur_parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnvFile({
    path: path.join(__dirname, ".env"),
    override: false,
});

const fileLogger = createLineFileLogger({
    enabled: process.env.CENTAUR_FILE_LOG_ENABLED || "false",
    baseDir: __dirname,
    logDir: process.env.CENTAUR_LOG_DIR || "logs\\centaur",
    fileName: process.env.CENTAUR_AGENT_LOG_FILE || "",
    prefix: "CENTAUR",
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

function uniqueValues(values = []) {
    return Array.from(new Set(values.filter(Boolean)));
}

function formatDateOfBirth(value) {
    if (!value) {
        return "";
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const pad2 = (part) => String(part).padStart(2, "0");
        return `${value.getFullYear()}${pad2(value.getMonth() + 1)}${pad2(value.getDate())}`;
    }

    const normalized = String(value).trim();
    const digits = normalized.replace(/\D/g, "");
    if (digits.length >= 8) {
        return digits.slice(0, 8);
    }

    return "";
}

function normalizeSex(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (["M", "F", "U"].includes(normalized)) {
        return normalized;
    }
    return "";
}

function describeQueryReply(replyMessage) {
    const match = String(replyMessage || "").match(/(?:^|\r)L\|1\|([A-Z])(?:\r|$)/);
    const terminationCode = String(match?.[1] || "").trim().toUpperCase();

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

    if (terminationCode === "F") {
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

function loadCodeMapping() {
    const mappingFile = process.env.CENTAUR_MAPPING_FILE?.trim();
    if (!mappingFile) {
        return {};
    }

    const absolutePath = path.isAbsolute(mappingFile)
        ? mappingFile
        : path.join(__dirname, mappingFile);

    if (!existsSync(absolutePath)) {
        throw new Error(`Mapping file not found: ${absolutePath}`);
    }

    return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function validateBindingConfig() {
    const analyzerPraclistId = String(process.env.CENTAUR_PRACLISTID || "").trim();
    const analyzerKodzar = String(process.env.CENTAUR_KODZAR || "").trim();

    if (!analyzerPraclistId && !analyzerKodzar) {
        throw new Error("Analyzer binding is not configured. Set CENTAUR_PRACLISTID or CENTAUR_KODZAR.");
    }
}

async function postPayload(payload, accessClient) {
    const serverUrl = process.env.CENTAUR_SERVER_URL?.trim();
    if (!serverUrl) {
        throw new Error("CENTAUR_SERVER_URL is not configured.");
    }

    if (normalizeBoolean(process.env.CENTAUR_DRY_RUN, false)) {
        log("DRY RUN payload", JSON.stringify(payload));
        return;
    }

    const headers = {};
    if (process.env.ANALYZER_BRIDGE_TOKEN?.trim()) {
        headers["x-analyzer-token"] = process.env.ANALYZER_BRIDGE_TOKEN.trim();
    }

    const access = await accessClient.getAccess();
    if (!access.allowed) {
        log(
            "Analyzer ingest skipped by license",
            `${payload.barcode || payload.sampleId || ""} ${access.message}`.trim()
        );
        return {
            success: false,
            skippedByLicense: true,
            message: access.message,
        };
    }

    try {
        const response = await axios.post(serverUrl, payload, { headers, timeout: 30000 });
        log("Server response", JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        const serverMessage = String(error?.response?.data?.message || "").trim();
        const serverStatus = Number(error?.response?.status || 0);
        if (serverMessage && (serverStatus === 403 || serverStatus === 423)) {
            accessClient.clearCache();
            log("Analyzer ingest blocked by server license check", `${payload.barcode || payload.sampleId || ""} ${serverMessage}`.trim());
            return {
                success: false,
                skippedByLicense: true,
                message: serverMessage,
            };
        }

        const normalized = serverMessage.toLowerCase();
        const ignoreMissingSqlRecord =
            normalized.includes("resolved to 0 orders") ||
            normalized.includes("resolved to 0 order") ||
            normalized.includes("did not match analyzer map") ||
            normalized.includes("unsupported barcode format") ||
            normalized.includes("does not contain barcode") ||
            normalized.includes("barcode/sampleid/patientid is required");

        if (ignoreMissingSqlRecord) {
            log("Server skipped sample", `${payload.barcode || payload.sampleId || ""} ${serverMessage}`);
            return {
                success: false,
                skippedByServer: true,
                message: serverMessage,
            };
        }

        throw error;
    }
}

function buildResultPayload(parsedMessage, codeMapping) {
    const payload = buildAdviaCentaurResultPayload(parsedMessage, {
        codeMapping,
        analyzerId: process.env.CENTAUR_ANALYZER_ID || "advia-centaur-1",
        analyzerLabel: process.env.CENTAUR_LABEL || "ADVIA Centaur ASTM",
        branchKey: process.env.CENTAUR_BRANCH || "ad",
        analyzerPraclistId: process.env.CENTAUR_PRACLISTID || "",
        analyzerKodzar: process.env.CENTAUR_KODZAR || "",
    });

    return {
        ...payload,
        barcodeShortWithSampleMode: process.env.CENTAUR_SHORT_BARCODE_WITH_SAMPLE_MODE || "",
        searchDays: Number(process.env.CENTAUR_LOOKBACK_DAYS || 90),
        resultOscis: Number(process.env.CENTAUR_RESULT_OSCIS || 22),
        autoConfirmResults: normalizeBoolean(process.env.CENTAUR_AUTO_CONFIRM_RESULTS, true),
        labCode: process.env.CENTAUR_KODLAB || "",
    };
}

function createQueryOrderBuilder(accessClient) {
    if (normalizeBoolean(process.env.CENTAUR_DISABLE_QUERY_RESPONSE, false)) {
        return async () => null;
    }

    const ingester = createSybaseAnalyzerResultIngester({
        branchKey: process.env.CENTAUR_BRANCH || "ad",
        analyzerPraclistId: process.env.CENTAUR_PRACLISTID || "",
        analyzerKodzar: process.env.CENTAUR_KODZAR || "",
        shortBarcodeWithSampleMode: process.env.CENTAUR_SHORT_BARCODE_WITH_SAMPLE_MODE || "",
        searchDays: Number(process.env.CENTAUR_LOOKBACK_DAYS || 90),
        resultOscis: Number(process.env.CENTAUR_RESULT_OSCIS || 22),
        autoConfirmResults: normalizeBoolean(process.env.CENTAUR_AUTO_CONFIRM_RESULTS, true),
        labCode: process.env.CENTAUR_KODLAB || "",
        logger: (message, extra = "") => log(`QUERY ${message}`, extra),
        queryLogger: (query) => log("QUERY SQL", `\n${String(query || "").trim()}`),
    });

    return async (parsedMessage) => {
        const query = parsedMessage.query;
        const specimen = query?.startingRangeId;
        const sampleId = String(specimen?.sampleId || "").trim().toUpperCase();
        const requestStatusCode = String(query?.requestInformationStatusCode || "O").trim().toUpperCase();
        const isQcSample = sampleId.startsWith("QC");

        const common = buildAdviaCentaurQueryContext({
            senderId: process.env.CENTAUR_HOST_SENDER_ID || "LIS_ID",
            receiverId: process.env.CENTAUR_INSTRUMENT_RECEIVER_ID || "ADVCNT_LIS",
            processingId: process.env.CENTAUR_PROCESSING_ID || "P",
            version: process.env.CENTAUR_VERSION || "1",
            sampleId,
            rackNo: specimen?.rackNo || "",
            samplePosition: specimen?.samplePosition || "",
            actionCode: isQcSample ? "Q" : "",
        });

        if (!["O", "I", ""].includes(requestStatusCode)) {
            log("Unsupported query request status", requestStatusCode);
            return buildAdviaCentaurQueryErrorMessage(common);
        }

        if (!sampleId) {
            log("Query without sample ID", JSON.stringify(query));
            return buildAdviaCentaurNoInformationMessage(common);
        }

        const access = await accessClient.getAccess();
        if (!access.allowed) {
            log("Query worklist blocked by license", `${sampleId} ${access.message}`.trim());
            return buildAdviaCentaurNoInformationMessage(common);
        }

        let fetched;
        try {
            fetched = await ingester.fetchWorkItems(ingester.parseBarcode(sampleId));
        } catch (error) {
            log("Query worklist lookup failed", `${sampleId} ${error instanceof Error ? error.message : String(error)}`);
            return buildAdviaCentaurNoInformationMessage(common);
        }

        const rows = fetched.rows || [];
        if (!rows.length) {
            log("No worklist rows found", sampleId);
            return buildAdviaCentaurNoInformationMessage(common);
        }

        const orderCodeSource = String(process.env.CENTAUR_ORDER_CODE_SOURCE || "secondary_or_primary").trim().toLowerCase();
        const requestedCodes = query.tests?.isAll
            ? []
            : (query.tests?.items || []).map((item) => String(item.testCode || "").trim()).filter(Boolean);

        const resolvedCodes = uniqueValues(rows.map((row) => {
            const primaryCode = String(row.analyzer_test_code || "").trim();
            const secondaryCode = String(row.analyzer_test_code2 || "").trim();
            return orderCodeSource === "primary" ? primaryCode : (secondaryCode || primaryCode);
        }));

        const finalCodes = requestedCodes.length
            ? resolvedCodes.filter((code) => requestedCodes.includes(code))
            : resolvedCodes;

        log(
            "Query requested vs returned",
            `${sampleId} requested=[${requestedCodes.join(",") || "ALL"}] returned=[${finalCodes.join(",")}]`
        );

        if (!finalCodes.length) {
            return buildAdviaCentaurNoInformationMessage(common);
        }

        const firstRow = rows[0];
        const patientName = [firstRow.priezvisko, firstRow.meno].filter(Boolean).join("^");
        const tests = finalCodes.map((testCode) => ({
            testCode,
            dilutionProtocol: String(process.env.CENTAUR_DEFAULT_DILUTION_PROTOCOL || "").trim(),
            dilutionRatio: String(process.env.CENTAUR_DEFAULT_DILUTION_RATIO || "").trim(),
        }));

        return buildAdviaCentaurWorklistMessage({
            ...common,
            patientId: String(firstRow.rodcis || "").trim(),
            patientName,
            dateOfBirth: formatDateOfBirth(firstRow.datumnarod),
            sex: normalizeSex(firstRow.pohlavie),
            tests,
            priority: String(process.env.CENTAUR_DEFAULT_PRIORITY || "R").trim(),
            reportType: requestStatusCode === "I" ? "I\\Q" : "O\\Q",
            controlName: isQcSample ? String(process.env.CENTAUR_QC_CONTROL_NAME || "").trim() : "",
            controlLotNumber: isQcSample ? String(process.env.CENTAUR_QC_CONTROL_LOT || "").trim() : "",
        });
    };
}

export async function startAdviaCentaurAgent() {
    const portPath = process.env.CENTAUR_COM_PORT?.trim();
    if (!portPath) {
        throw new Error("CENTAUR_COM_PORT is not configured.");
    }

    validateBindingConfig();

    log(
        "Startup config",
        JSON.stringify({
            port: portPath,
            branch: process.env.CENTAUR_BRANCH || "ad",
            praclistid: process.env.CENTAUR_PRACLISTID || "",
            kodzar: process.env.CENTAUR_KODZAR || "",
            kodlab: process.env.CENTAUR_KODLAB || "",
            checksumIncludeStx: normalizeBoolean(process.env.CENTAUR_CHECKSUM_INCLUDE_STX, false),
            orderCodeSource: process.env.CENTAUR_ORDER_CODE_SOURCE || "secondary_or_primary",
            fileLogEnabled: fileLogger.enabled,
            fileLogPath: fileLogger.path,
        })
    );

    const serialportModule = await import("serialport").catch(() => null);
    if (!serialportModule?.SerialPort) {
        throw new Error('Package "serialport" is not installed. Run npm install to enable the ADVIA Centaur bridge.');
    }

    const { SerialPort } = serialportModule;
    const codeMapping = loadCodeMapping();
    const accessClient = createAnalyzerAccessClient({
        serverUrl: process.env.CENTAUR_SERVER_URL?.trim(),
        token: process.env.ANALYZER_BRIDGE_TOKEN?.trim(),
        logger: log,
    });
    const buildQueryReply = createQueryOrderBuilder(accessClient);

    const port = new SerialPort({
        path: portPath,
        baudRate: Number(process.env.CENTAUR_BAUD_RATE || 9600),
        dataBits: Number(process.env.CENTAUR_DATA_BITS || 8),
        stopBits: Number(process.env.CENTAUR_STOP_BITS || 1),
        parity: process.env.CENTAUR_PARITY || "none",
        autoOpen: true,
    });

    let link;
    link = createAstmE1381Link({
        write: (buffer) => port.write(buffer),
        log: (message, extra = "") => log(message, extra),
        checksumIncludeStx: normalizeBoolean(process.env.CENTAUR_CHECKSUM_INCLUDE_STX, false),
        onMessage: async (rawMessage) => {
            try {
                const parsed = parseAdviaCentaurAstmMessage(rawMessage);
                log("ASTM message received", parsed.messageKind);

                if (parsed.messageKind === "result") {
                    const payload = buildResultPayload(parsed, codeMapping);
                    log("Parsed result payload", JSON.stringify({
                        barcode: payload.barcode,
                        patientName: payload.patientName,
                        observations: payload.observations.length,
                        comments: payload.comments.length,
                        manufacturerRecords: payload.manufacturerRecords.length,
                    }));
                    await postPayload(payload, accessClient);
                    return;
                }

                if (parsed.messageKind === "query") {
                    log("Parsed query", JSON.stringify(parsed.query));
                    const replyMessage = await buildQueryReply(parsed);
                    if (!replyMessage) {
                        log("Query response skipped", parsed.query?.startingRangeId?.sampleId || "");
                        return;
                    }

                    const replyInfo = describeQueryReply(replyMessage);
                    await link.queueMessage(replyMessage);
                    if (replyInfo.type === "no-work") {
                        log("No work reply sent", `${parsed.query?.startingRangeId?.sampleId || ""} L|1|${replyInfo.terminationCode}`);
                    } else if (replyInfo.type === "worklist") {
                        log("Worklist reply sent", `${parsed.query?.startingRangeId?.sampleId || ""} L|1|${replyInfo.terminationCode}`);
                    } else if (replyInfo.type === "query-error") {
                        log("Query error reply sent", `${parsed.query?.startingRangeId?.sampleId || ""} L|1|${replyInfo.terminationCode}`);
                    } else {
                        log("Query reply sent", `${parsed.query?.startingRangeId?.sampleId || ""} L|1|${replyInfo.terminationCode || "?"}`);
                    }
                    return;
                }

                log("Unsupported ASTM message ignored");
            } catch (error) {
                log("Message processing error", error instanceof Error ? error.message : String(error));
            }
        },
    });

    port.on("open", () => {
        log("COM port opened", portPath);
    });

    port.on("data", (chunk) => {
        link.feed(chunk);
    });

    port.on("error", (error) => {
        log("COM port error", error instanceof Error ? error.message : String(error));
    });

    port.on("close", () => {
        log("COM port closed", portPath);
        link.destroy();
    });

    return { port, link };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startAdviaCentaurAgent().catch((error) => {
        console.error(`[CENTAUR] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
