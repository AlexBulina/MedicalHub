import "dotenv/config";
import axios from "axios";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseUrineClinicalResultString } from "./serial_urine_analyzer_parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function log(message, extra = "") {
    console.log(`[SERIAL-URINE] ${message}${extra ? ` ${extra}` : ""}`);
}

function normalizeBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }
    return String(value).trim().toLowerCase() === "true";
}

function validateAnalyzerBindingConfig() {
    const analyzerPraclistId = String(process.env.SERIAL_URINE_PRACLISTID || "").trim();
    const analyzerKodzar = String(process.env.SERIAL_URINE_KODZAR || "").trim();

    if (!analyzerPraclistId && !analyzerKodzar) {
        throw new Error("Analyzer binding is not configured. Set SERIAL_URINE_PRACLISTID or SERIAL_URINE_KODZAR in serial_urine_bridge.env.");
    }
}

function loadCodeMapping() {
    const mappingFile = process.env.SERIAL_URINE_MAPPING_FILE?.trim();
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

function buildPayload(parsedResult, codeMapping) {
    const usePatientIdAsBarcode = normalizeBoolean(process.env.SERIAL_URINE_USE_PATIENT_ID_AS_BARCODE, true);
    const barcode = usePatientIdAsBarcode ? parsedResult.patientId : "";

    return {
        transport: "serial",
        protocol: "URINE-CSV-CR",
        analyzerId: process.env.SERIAL_URINE_ANALYZER_ID || "urine-com",
        analyzerLabel: process.env.SERIAL_URINE_LABEL || "Urine COM Analyzer",
        branchKey: process.env.SERIAL_URINE_BRANCH || "ad",
        analyzerPraclistId: process.env.SERIAL_URINE_PRACLISTID || "",
        analyzerKodzar: process.env.SERIAL_URINE_KODZAR || "",
        barcodeShortWithSampleMode: process.env.SERIAL_URINE_SHORT_BARCODE_WITH_SAMPLE_MODE || "",
        barcode,
        sampleId: parsedResult.patientId,
        patientId: parsedResult.patientId,
        patientName: parsedResult.patientName,
        measuredAt: parsedResult.measuredAt,
        instrumentSerial: parsedResult.instrumentSerial,
        operatorId: parsedResult.operatorId,
        stripType: parsedResult.stripType,
        color: parsedResult.color,
        clarity: parsedResult.clarity,
        stripLotNum: parsedResult.stripLotNum,
        stripLotDate: parsedResult.stripLotDate,
        notes: parsedResult.notes,
        rawMessage: parsedResult.raw,
        observations: parsedResult.observations.map((item, index) => ({
            setId: String(index + 1),
            code: item.code,
            observationId: codeMapping[item.code] || item.code,
            value: item.value,
            valueType: "ST",
            abnormalFlag: item.mark,
            status: "F",
        })),
    };
}

async function postPayload(payload) {
    const serverUrl = process.env.SERIAL_URINE_SERVER_URL?.trim();
    if (!serverUrl) {
        throw new Error("SERIAL_URINE_SERVER_URL is not configured.");
    }

    const dryRun = normalizeBoolean(process.env.SERIAL_URINE_DRY_RUN, false);
    if (dryRun) {
        log("DRY RUN payload", JSON.stringify(payload));
        return;
    }

    const headers = {};
    if (process.env.ANALYZER_BRIDGE_TOKEN?.trim()) {
        headers["x-analyzer-token"] = process.env.ANALYZER_BRIDGE_TOKEN.trim();
    }

    let response;
    try {
        response = await axios.post(serverUrl, payload, { headers, timeout: 30000 });
    } catch (error) {
        const responseMessage = error?.response?.data?.message;
        if (responseMessage) {
            throw new Error(`Server returned ${error.response.status}: ${responseMessage}`);
        }

        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Expected HTTP/") || message.includes("protocol violation")) {
            throw new Error(
                `Endpoint ${serverUrl} did not return a valid HTTP response. Check that MedicalHub is running on this port and that the port is not occupied by another service.`
            );
        }

        throw error;
    }

    log("Server response", JSON.stringify(response.data));
}

function processRawLine(rawLine, codeMapping) {
    const parsed = parseUrineClinicalResultString(rawLine);
    log("Parsed COM result", JSON.stringify({
        patientId: parsed.patientId,
        patientName: parsed.patientName,
        measuredAt: parsed.measuredAt,
        observations: parsed.observations.length,
    }));

    const payload = buildPayload(parsed, codeMapping);
    if (!payload.barcode) {
        log("No barcode resolved from patientId. Set SERIAL_URINE_USE_PATIENT_ID_AS_BARCODE=true or adapt payload mapping.");
    }

    return postPayload(payload);
}

export async function startSerialUrineAnalyzerAgent() {
    const portPath = process.env.SERIAL_URINE_COM_PORT?.trim();
    if (!portPath) {
        throw new Error("SERIAL_URINE_COM_PORT is not configured.");
    }

    validateAnalyzerBindingConfig();

    const serialportModule = await import("serialport").catch(() => null);
    if (!serialportModule?.SerialPort) {
        throw new Error('Package "serialport" is not installed. Run npm install to enable the COM bridge.');
    }

    const { SerialPort } = serialportModule;
    const codeMapping = loadCodeMapping();
    const baudRate = Number(process.env.SERIAL_URINE_BAUD_RATE || 9600);
    const dataBits = Number(process.env.SERIAL_URINE_DATA_BITS || 8);
    const stopBits = Number(process.env.SERIAL_URINE_STOP_BITS || 1);
    const parity = process.env.SERIAL_URINE_PARITY || "none";

    log("Starting COM bridge", JSON.stringify({
        portPath,
        baudRate,
        dataBits,
        stopBits,
        parity,
        serverUrl: process.env.SERIAL_URINE_SERVER_URL || "",
    }));

    const port = new SerialPort({
        path: portPath,
        baudRate,
        dataBits,
        stopBits,
        parity,
        autoOpen: true,
    });

    let buffer = "";

    port.on("open", () => {
        log("COM port opened", portPath);
    });

    port.on("data", (chunk) => {
        buffer += Buffer.from(chunk).toString("utf8");

        while (buffer.includes("\r")) {
            const boundary = buffer.indexOf("\r");
            const rawLine = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 1);

            if (!rawLine.trim()) {
                continue;
            }

            log("IN COM", rawLine);
            processRawLine(rawLine, codeMapping).catch((error) => {
                log("COM payload processing error", error instanceof Error ? error.message : String(error));
            });
        }
    });

    port.on("error", (error) => {
        log("COM port error", error instanceof Error ? error.message : String(error));
    });

    port.on("close", () => {
        log("COM port closed", portPath);
    });

    return port;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startSerialUrineAnalyzerAgent().catch((error) => {
        console.error(`[SERIAL-URINE] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
