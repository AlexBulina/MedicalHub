import "dotenv/config";
import axios from "axios";
import { config as loadEnvFile } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAnalyzerAccessClient } from "./analyzer_access_client.js";
import { createSybaseAnalyzerResultIngester } from "./sybase_analyzer_result_ingest.js";
import { createCa1500AstmLink } from "./sysmex_ca1500_astm.js";
import {
    buildCa1500EmptyOrderMessage,
    buildCa1500HostOrderMessage,
    buildCa1500ResultPayload,
    parseCa1500AstmMessage,
} from "./sysmex_ca1500_parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnvFile({
    path: path.join(__dirname, ".env"),
    override: false,
});

function log(message, extra = "") {
    console.log(`[CA1500] ${message}${extra ? ` ${extra}` : ""}`);
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

function loadCodeMapping() {
    const mappingFile = process.env.CA1500_MAPPING_FILE?.trim();
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

function loadOrderGroupMapping() {
    const mappingFile = process.env.CA1500_ORDER_GROUP_MAPPING_FILE?.trim();
    if (!mappingFile) {
        return {};
    }

    const absolutePath = path.isAbsolute(mappingFile)
        ? mappingFile
        : path.join(__dirname, mappingFile);

    if (!existsSync(absolutePath)) {
        throw new Error(`Order group mapping file not found: ${absolutePath}`);
    }

    return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function buildReverseOrderGroupMapping(orderGroupMapping = {}) {
    const reverse = new Map();

    for (const [groupCode, members] of Object.entries(orderGroupMapping)) {
        const normalizedGroupCode = String(groupCode || "").trim();
        if (!normalizedGroupCode) {
            continue;
        }

        reverse.set(normalizedGroupCode, normalizedGroupCode);

        if (!Array.isArray(members)) {
            continue;
        }

        for (const member of members) {
            const normalizedMember = String(member || "").trim();
            if (!normalizedMember) {
                continue;
            }
            reverse.set(normalizedMember, normalizedGroupCode);
        }
    }

    return reverse;
}

function buildRowGroupCandidates(row, orderCodeSource, matchSource) {
    const primaryAnalyzerCode = String(row.analyzer_test_code || "").trim();
    const secondaryAnalyzerCode = String(row.analyzer_test_code2 || "").trim();
    const preferredAnalyzerCode =
        orderCodeSource === "primary"
            ? primaryAnalyzerCode
            : (secondaryAnalyzerCode || primaryAnalyzerCode);
    const lisKodvys = String(row.kodvys || "").trim();

    if (matchSource === "kodvys") {
        return [lisKodvys].filter(Boolean);
    }

    if (matchSource === "analyzer_codes") {
        return [preferredAnalyzerCode, primaryAnalyzerCode, secondaryAnalyzerCode].filter(Boolean);
    }

    return [preferredAnalyzerCode, primaryAnalyzerCode, secondaryAnalyzerCode, lisKodvys].filter(Boolean);
}

function validateBindingConfig() {
    const analyzerPraclistId = String(process.env.CA1500_PRACLISTID || "").trim();
    const analyzerKodzar = String(process.env.CA1500_KODZAR || "").trim();

    if (!analyzerPraclistId && !analyzerKodzar) {
        throw new Error("Analyzer binding is not configured. Set CA1500_PRACLISTID or CA1500_KODZAR.");
    }
}

async function postPayload(payload, accessClient) {
    const serverUrl = process.env.CA1500_SERVER_URL?.trim();
    if (!serverUrl) {
        throw new Error("CA1500_SERVER_URL is not configured.");
    }

    if (normalizeBoolean(process.env.CA1500_DRY_RUN, false)) {
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

    let response;
    try {
        response = await axios.post(serverUrl, payload, { headers, timeout: 30000 });
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

    log("Server response", JSON.stringify(response.data));
    return response.data;
}

function buildResultPayload(parsedMessage, codeMapping) {
    const payload = buildCa1500ResultPayload(parsedMessage, {
        codeMapping,
        analyzerId: process.env.CA1500_ANALYZER_ID || "ca1500-com",
        analyzerLabel: process.env.CA1500_LABEL || "Sysmex CA-1500 ASTM",
        branchKey: process.env.CA1500_BRANCH || "ad",
        analyzerPraclistId: process.env.CA1500_PRACLISTID || "",
        analyzerKodzar: process.env.CA1500_KODZAR || "",
        identifierSource: process.env.CA1500_IDENTIFIER_SOURCE || "sample_no",
    });

    return {
        ...payload,
        barcodeShortWithSampleMode: process.env.CA1500_SHORT_BARCODE_WITH_SAMPLE_MODE || "",
        searchDays: Number(process.env.CA1500_LOOKBACK_DAYS || 90),
        resultOscis: Number(process.env.CA1500_RESULT_OSCIS || 22),
        autoConfirmResults: normalizeBoolean(process.env.CA1500_AUTO_CONFIRM_RESULTS, true),
        labCode: process.env.CA1500_KODLAB || "",
    };
}

function createQueryOrderBuilder(accessClient) {
    if (normalizeBoolean(process.env.CA1500_DISABLE_QUERY_RESPONSE, false)) {
        return async () => null;
    }

    const ingester = createSybaseAnalyzerResultIngester({
        branchKey: process.env.CA1500_BRANCH || "ad",
        analyzerPraclistId: process.env.CA1500_PRACLISTID || "",
        analyzerKodzar: process.env.CA1500_KODZAR || "",
        shortBarcodeWithSampleMode: process.env.CA1500_SHORT_BARCODE_WITH_SAMPLE_MODE || "",
        searchDays: Number(process.env.CA1500_LOOKBACK_DAYS || 90),
        resultOscis: Number(process.env.CA1500_RESULT_OSCIS || 22),
        autoConfirmResults: normalizeBoolean(process.env.CA1500_AUTO_CONFIRM_RESULTS, true),
        labCode: process.env.CA1500_KODLAB || "",
        logger: (message, extra = "") => log(`QUERY ${message}`, extra),
        queryLogger: (query) => log("QUERY SQL", `\n${String(query || "").trim()}`),
    });
    const orderGroupMapping = loadOrderGroupMapping();
    const reverseOrderGroupMapping = buildReverseOrderGroupMapping(orderGroupMapping);

    return async (parsedMessage) => {
        const specimen = parsedMessage?.query?.specimen;
        const sampleNo = String(specimen?.sampleNo || "").trim().toUpperCase();
        if (!sampleNo) {
            throw new Error("Query does not contain sample number.");
        }
        const requestedQueryCodes = new Set(
            (parsedMessage?.query?.tests || [])
                .map((item) => String(item.testCode || "").trim())
                .filter(Boolean)
        );

        const common = {
            hostName: process.env.CA1500_HOST_NAME || "MEDICALHUB",
            instrumentName: "CA-1500",
            instrumentNo: process.env.CA1500_INSTRUMENT_NO || "",
            userInstrumentNo: process.env.CA1500_USER_INSTRUMENT_NO || "",
            rackNo: specimen.rackNo,
            tubePosition: specimen.tubePosition,
            sampleNo: specimen.sampleNo,
            sampleAttribute: specimen.sampleAttribute || "C",
            patientName: "",
            priority: "R",
            requestedAt: parsedMessage.query.requestStartAt || "",
            actionCode: sampleNo.startsWith("QC") ? "Q" : "N",
        };

        const access = await accessClient.getAccess();
        if (!access.allowed) {
            log("Query worklist blocked by license", `${sampleNo} ${access.message}`.trim());
            return buildCa1500EmptyOrderMessage(common);
        }

        let fetched;
        try {
            fetched = await ingester.fetchWorkItems(ingester.parseBarcode(sampleNo));
        } catch (error) {
            log("Query worklist lookup failed", `${sampleNo} ${error instanceof Error ? error.message : String(error)}`);
            return buildCa1500EmptyOrderMessage(common);
        }

        const rows = fetched.rows || [];
        const firstRow = rows[0] || null;
        const orderCodeSource = String(process.env.CA1500_ORDER_CODE_SOURCE || "secondary_or_primary").trim().toLowerCase();
        const orderGroupMatchSource = String(process.env.CA1500_ORDER_GROUP_MATCH_SOURCE || "auto").trim().toLowerCase();
        const allowUnrequestedGroups = normalizeBoolean(process.env.CA1500_ALLOW_UNREQUESTED_GROUPS, false);
        const queryGroupDebug = normalizeBoolean(process.env.CA1500_QUERY_GROUP_DEBUG, true);

        const resolvedLisGroups = [];
        for (const row of rows) {
            const candidateCodes = buildRowGroupCandidates(row, orderCodeSource, orderGroupMatchSource);

            let resolvedCode = "";
            for (const candidateCode of candidateCodes) {
                const groupedCode = reverseOrderGroupMapping.get(candidateCode) || candidateCode;
                if (groupedCode) {
                    resolvedCode = groupedCode;
                    break;
                }
            }

            if (queryGroupDebug) {
                log(
                    "Query group row",
                    `sample=${sampleNo} kodvys=${String(row.kodvys || "").trim()} analyzer1=${String(row.analyzer_test_code || "").trim()} analyzer2=${String(row.analyzer_test_code2 || "").trim()} candidates=[${candidateCodes.join(",")}] grouped=${resolvedCode || "(none)"}`
                );
            }

            if (resolvedCode) {
                resolvedLisGroups.push(resolvedCode);
            }
        }

        const uniqueLisGroups = uniqueValues(resolvedLisGroups);
        const returnedGroups = allowUnrequestedGroups || !requestedQueryCodes.size
            ? uniqueLisGroups
            : uniqueLisGroups.filter((groupCode) => requestedQueryCodes.has(groupCode));

        const tests = returnedGroups.map((testCode) => ({
            testCode,
            dilution: process.env.CA1500_DEFAULT_DILUTION || "100.00",
            option: "",
        }));

        common.patientName = firstRow ? [firstRow.priezvisko, firstRow.meno].filter(Boolean).join(" ").trim() : "";

        const requestedGroups = Array.from(requestedQueryCodes);
        const missingRequestedGroups = requestedGroups.filter((groupCode) => !returnedGroups.includes(groupCode));
        const availableButNotRequestedGroups = uniqueLisGroups.filter((groupCode) => !requestedQueryCodes.has(groupCode));

        log(
            "Query requested vs returned",
            `${sampleNo} requested=[${requestedGroups.join(",")}] lisGroups=[${uniqueLisGroups.join(",")}] returned=[${tests.map((item) => item.testCode).join(",")}] missingRequested=[${missingRequestedGroups.join(",")}] availableButNotRequested=[${availableButNotRequestedGroups.join(",")}] matchSource=${orderGroupMatchSource} allowUnrequested=${allowUnrequestedGroups}`
        );

        return tests.length
            ? buildCa1500HostOrderMessage({ ...common, tests })
            : buildCa1500EmptyOrderMessage(common);
    };
}

export async function startSysmexCa1500Agent() {
    const portPath = process.env.CA1500_COM_PORT?.trim();
    if (!portPath) {
        throw new Error("CA1500_COM_PORT is not configured.");
    }

    validateBindingConfig();

    log(
        "Startup config",
        JSON.stringify({
            port: portPath,
            branch: process.env.CA1500_BRANCH || "ad",
            praclistid: process.env.CA1500_PRACLISTID || "",
            kodzar: process.env.CA1500_KODZAR || "",
            kodlab: process.env.CA1500_KODLAB || "",
            checksumIncludeStx: normalizeBoolean(process.env.CA1500_CHECKSUM_INCLUDE_STX, false),
            orderGroupMatchSource: process.env.CA1500_ORDER_GROUP_MATCH_SOURCE || "auto",
            allowUnrequestedGroups: normalizeBoolean(process.env.CA1500_ALLOW_UNREQUESTED_GROUPS, false),
        })
    );

    const serialportModule = await import("serialport").catch(() => null);
    if (!serialportModule?.SerialPort) {
        throw new Error('Package "serialport" is not installed. Run npm install to enable the CA-1500 bridge.');
    }

    const { SerialPort } = serialportModule;
    const codeMapping = loadCodeMapping();
    const accessClient = createAnalyzerAccessClient({
        serverUrl: process.env.CA1500_SERVER_URL?.trim(),
        token: process.env.ANALYZER_BRIDGE_TOKEN?.trim(),
        logger: log,
    });
    const buildOrderMessage = createQueryOrderBuilder(accessClient);

    const port = new SerialPort({
        path: portPath,
        baudRate: Number(process.env.CA1500_BAUD_RATE || 9600),
        dataBits: Number(process.env.CA1500_DATA_BITS || 8),
        stopBits: Number(process.env.CA1500_STOP_BITS || 1),
        parity: process.env.CA1500_PARITY || "none",
        autoOpen: true,
    });

    let link;
    link = createCa1500AstmLink({
        write: (buffer) => port.write(buffer),
        log: (message, extra = "") => log(message, extra),
        checksumIncludeStx: normalizeBoolean(process.env.CA1500_CHECKSUM_INCLUDE_STX, false),
        onMessage: async (rawMessage) => {
            try {
                const parsed = parseCa1500AstmMessage(rawMessage);
                log("ASTM message received", parsed.messageKind);

                if (parsed.messageKind === "result") {
                    const payload = buildResultPayload(parsed, codeMapping);
                    log("Parsed result payload", JSON.stringify({
                        barcode: payload.barcode,
                        patientName: payload.patientName,
                        observations: payload.observations.length,
                    }));
                    await postPayload(payload, accessClient);
                    return;
                }

                if (parsed.messageKind === "query") {
                    log("Parsed query", JSON.stringify(parsed.query));
                    const orderMessage = await buildOrderMessage(parsed);
                    if (!orderMessage) {
                        log("Query response skipped", parsed.query?.specimen?.sampleNo || "");
                        return;
                    }

                    await link.queueMessage(orderMessage);
                    log("Host order message sent", parsed.query?.specimen?.sampleNo || "");
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
    startSysmexCa1500Agent().catch((error) => {
        console.error(`[CA1500] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
