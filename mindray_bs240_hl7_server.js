import "dotenv/config";
import net from "node:net";
import { pathToFileURL } from "node:url";
import BRANCHES from "./branches_config.js";
import { executeQuery } from "./database_repository.js";

const VT = String.fromCharCode(0x0b);
const FS = String.fromCharCode(0x1c);
const CR = "\r";

const SERVER_HOST = process.env.BS240_HL7_HOST || "0.0.0.0";
const SERVER_PORT = Number(process.env.BS240_HL7_PORT || 4001);
const BRANCH_KEY = process.env.BS240_BRANCH || "ad";
const ANALYZER_KODZAR = process.env.BS240_KODZAR?.trim() || "";
const ANALYZER_PRACLISTID = process.env.BS240_PRACLISTID?.trim() || "BS240";
const SEARCH_DAYS = Number(process.env.BS240_LOOKBACK_DAYS || 90);
const SENDING_APP = process.env.BS240_SENDING_APP || "MEDICALHUB";
const SENDING_FACILITY = process.env.BS240_SENDING_FACILITY || "LAB";
const RECEIVING_APP = process.env.BS240_RECEIVING_APP || "MINDRAY_BS240";
const RECEIVING_FACILITY = process.env.BS240_RECEIVING_FACILITY || "ANALYZER";
const HL7_VERSION = process.env.BS240_HL7_VERSION || "2.3.1";

const branch = BRANCHES[BRANCH_KEY];

if (!branch?.db) {
    throw new Error(`Unknown BS240 branch "${BRANCH_KEY}". Check BS240_BRANCH.`);
}

if (branch.db.type && branch.db.type !== "sybase") {
    throw new Error(`BS240 server requires a Sybase branch. "${BRANCH_KEY}" uses ${branch.db.type}.`);
}

const dbConfig = branch.db;
const labCode = process.env.BS240_KODLAB || branch.LabCode || "00001";

function log(message, extra = "") {
    console.log(`[BS240-HL7] ${message}${extra ? ` ${extra}` : ""}`);
}

function escapeSql(value) {
    return String(value ?? "").replace(/'/g, "''");
}

function hl7Escape(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\E\\")
        .replace(/\|/g, "\\F\\")
        .replace(/\^/g, "\\S\\")
        .replace(/&/g, "\\T\\")
        .replace(/~/g, "\\R\\");
}

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

function formatHl7Date(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("");
}

function formatMindrayFullDate(value) {
    const datePart = formatHl7Date(value);
    return datePart ? `${datePart}000000` : "";
}

function buildMessageControlId() {
    return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
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

function getMessageType(segments) {
    return getField(segments, "MSH", 8);
}

function findBarcodeInSegments(segments) {
    const qrdBarcode = getField(segments, "QRD", 8).trim().toUpperCase();
    if (qrdBarcode) {
        return qrdBarcode;
    }

    const patterns = [
        /^\d{6}[A-Z]\d{4}[A-Z]$/i,
        /^\d{6}[A-Z]\d{4}$/i,
        /^\d{4}[A-Z]\d{4}[A-Z]$/i,
        /^\d{4}[A-Z]\d{4}$/i,
    ];

    for (const segment of segments) {
        for (const field of segment.fields.slice(1)) {
            for (const candidate of String(field).split("^")) {
                const value = candidate.trim().toUpperCase();
                if (patterns.some((pattern) => pattern.test(value))) {
                    return value;
                }
            }
        }
    }

    return "";
}

function parseBarcode(barcode) {
    const value = String(barcode || "").trim().toUpperCase();

    let match = value.match(/^(\d{2})(\d{2})(\d{2})([A-Z])(\d{4})([A-Z])$/);
    if (match) {
        const [, year, month, day, typziad, evidcis, priradenie] = match;
        return {
            raw: value,
            mode: "full_with_sample",
            datevidcis: `20${year}-${month}-${day}`,
            typziad,
            evidcis: Number(evidcis),
            priradenie,
        };
    }

    match = value.match(/^(\d{2})(\d{2})(\d{2})([A-Z])(\d{4})$/);
    if (match) {
        const [, year, month, day, typziad, evidcis] = match;
        return {
            raw: value,
            mode: "full_no_sample",
            datevidcis: `20${year}-${month}-${day}`,
            typziad,
            evidcis: Number(evidcis),
            priradenie: "",
        };
    }

    match = value.match(/^(\d{2})(\d{2})([A-Z])(\d{4})([A-Z])$/);
    if (match) {
        const [, day, month, typziad, evidcis, priradenie] = match;
        return {
            raw: value,
            mode: "short_with_sample",
            day: Number(day),
            month: Number(month),
            typziad,
            evidcis: Number(evidcis),
            priradenie,
        };
    }

    match = value.match(/^(\d{2})(\d{2})([A-Z])(\d{4})$/);
    if (match) {
        const [, year, month, typziad, evidcis] = match;
        return {
            raw: value,
            mode: "legacy_month_counter",
            year: Number(`20${year}`),
            month: Number(month),
            typziad,
            evidcis: Number(evidcis),
            priradenie: "",
        };
    }

    throw new Error(`Unsupported barcode format: ${value}`);
}

function buildAnalyzerFilter() {
    if (ANALYZER_KODZAR) {
        return `pl.kodzar = ${Number(ANALYZER_KODZAR)}`;
    }

    return `pl.praclistid = '${escapeSql(ANALYZER_PRACLISTID)}'`;
}

function buildBarcodeWhereClause(parsedBarcode) {
    const clauses = [
        `z.kodlab = '${escapeSql(labCode)}'`,
        `z.datodberu >= DATEADD(day, -${Number.isFinite(SEARCH_DAYS) ? SEARCH_DAYS : 390}, CURRENT DATE)`,
        `z.typziad = '${escapeSql(parsedBarcode.typziad)}'`,
        `z.evidcis = ${parsedBarcode.evidcis}`,
    ];

    if (parsedBarcode.mode === "full_with_sample" || parsedBarcode.mode === "full_no_sample") {
        clauses.push(`z.datevidcis = '${escapeSql(parsedBarcode.datevidcis)}'`);
    } else if (parsedBarcode.mode === "short_with_sample") {
        clauses.push(`DAY(z.datevidcis) = ${parsedBarcode.day}`);
        clauses.push(`MONTH(z.datevidcis) = ${parsedBarcode.month}`);
    } else if (parsedBarcode.mode === "legacy_month_counter") {
        clauses.push(`YEAR(z.datevidcis) = ${parsedBarcode.year}`);
        clauses.push(`MONTH(z.datevidcis) = ${parsedBarcode.month}`);
    }

    if (parsedBarcode.priradenie) {
        clauses.push(`v.priradenie = '${escapeSql(parsedBarcode.priradenie)}'`);
    }

    return clauses.join("\n          AND ");
}

async function fetchWorkItems(parsedBarcode) {
    const query = `
        SELECT
            z.datevidcis,
            z.evidcis,
            z.typziad,
            z.datodberu,
            p.rodcis,
            pa.priezvisko,
            pa.meno,
            pa.datumnarod,
            pa.pohlavie,
            p.kodvys,
            v.nazov,
            v.priradenie,
            pl.kodzar,
            pl.praclistid,
            pv.kodvyszar1 AS analyzer_test_code,
            pv.kodvyszar2 AS analyzer_test_code2,
            pv.kodvyspom,
            pv.priznak1,
            pp.stavvys,
            pp.datumpotvrd
        FROM nis.ziad_okb z
        JOIN nis.ziad_okb_pom p
            ON z.datevidcis = p.datevidcis
           AND z.evidcis = p.evidcis
           AND z.kodlab = p.kodlab
        JOIN nis.c_okb_vys v
            ON v.kodvys = p.kodvys
           AND v.kodlab = p.kodlab
        JOIN nis.c_okb_prac_list pl
            ON ${buildAnalyzerFilter()}
           AND pl.kodlab = z.kodlab
           AND pl.aktivny = 'A'
        JOIN nis.c_okb_prac_list_varianty pv
            ON pv.praclistid = pl.praclistid
           AND pv.kodvys = v.kodvys
           AND pv.kodlab = v.kodlab
        LEFT JOIN nis.ziad_okb_pra_pom pp
            ON pp.datevidcis = p.datevidcis
           AND pp.evidcis = p.evidcis
           AND pp.kodvys = p.kodvys
           AND pp.kodlab = p.kodlab
        LEFT JOIN nis.c_pacient pa
            ON pa.rodcis = p.rodcis
        WHERE ${buildBarcodeWhereClause(parsedBarcode)}
          AND (pp.stavvys IS NULL OR pp.stavvys <> 2)
        ORDER BY z.datevidcis DESC, z.datodberu DESC, p.kodvys ASC
    `;

    const rows = await executeQuery(query, dbConfig);
    if (!rows) {
        throw new Error("Query to Sybase returned undefined.");
    }

    const distinctOrders = new Map();
    for (const row of rows) {
        const key = `${row.datevidcis}|${row.evidcis}|${row.typziad}`;
        if (!distinctOrders.has(key)) {
            distinctOrders.set(key, row);
        }
    }

    return {
        rows,
        distinctOrders: Array.from(distinctOrders.values()),
    };
}

function sampleTypeToText(priradenie) {
    const mapping = {
        S: "serum",
        P: "plasma",
        B: "whole blood",
        U: "urine",
        C: "CSF",
        X: "other",
    };

    return mapping[String(priradenie || "").toUpperCase()] || "other";
}

function buildResponseMsh(segments, messageType, controlId = buildMessageControlId(), acceptAckType = "", appAckType = "") {
    const sendingApp = getField(segments, "MSH", 2) || RECEIVING_APP;
    const sendingFacility = getField(segments, "MSH", 3) || RECEIVING_FACILITY;
    const receivingApp = getField(segments, "MSH", 4) || SENDING_APP;
    const receivingFacility = getField(segments, "MSH", 5) || SENDING_FACILITY;

    return [
        "MSH",
        "^~\\&",
        receivingApp,
        receivingFacility,
        sendingApp,
        sendingFacility,
        formatHl7Timestamp(),
        "",
        messageType,
        controlId,
        "P",
        HL7_VERSION,
        "",
        "",
        acceptAckType,
        appAckType,
        "",
        "ASCII",
        "",
        "",
    ].join("|");
}

function buildAckMessage(segments, ackCode = "AA", errorText = "", messageType = "ACK") {
    const originalControlId = getField(segments, "MSH", 9) || "";
    const statusCode = ackCode === "AA" ? "0" : "207";
    const parts = [
        buildResponseMsh(segments, messageType),
        ["MSA", ackCode, originalControlId, hl7Escape(errorText), "", "", statusCode].join("|"),
        ["ERR", statusCode].join("|"),
    ];
    return parts.join(CR) + CR;
}

function buildQckMessage(segments, ackCode = "AA", queryStatus = "OK", errorText = "") {
    const originalControlId = getField(segments, "MSH", 9) || "";
    const statusCode = ackCode === "AA" ? "0" : "207";
    return [
        buildResponseMsh(segments, "QCK^Q02"),
        ["MSA", ackCode, originalControlId, hl7Escape(errorText), "", "", statusCode].join("|"),
        ["ERR", statusCode].join("|"),
        ["QAK", "SR", queryStatus].join("|"),
    ].join(CR) + CR;
}

function buildDspSegments(firstRow, parsedBarcode, rows) {
    const values = [
        "",
        "",
        [firstRow.priezvisko, firstRow.meno].filter(Boolean).join(" ").trim(),
        formatMindrayFullDate(firstRow.datumnarod),
        firstRow.pohlavie || "O",
        "",
        "",
        "",
        "",
        "",
        "",
        formatHl7Timestamp(new Date(firstRow.datodberu || firstRow.datevidcis)),
        "",
        "",
        "outpatient",
        firstRow.rodcis || "",
        "",
        "",
        "",
        "",
        parsedBarcode.raw,
        String(firstRow.evidcis),
        formatHl7Timestamp(),
        "N",
        "",
        sampleTypeToText(firstRow.priradenie),
        "",
        "",
    ];

    for (const row of rows) {
        values.push(`${row.analyzer_test_code || row.kodvys}^^^`);
    }

    return values.map((value, index) => ["DSP", String(index + 1), hl7Escape(value), "", "", ""].join("|"));
}

function buildDsrMessage(segments, parsedBarcode, rows) {
    const firstRow = rows[0];
    const originalControlId = getField(segments, "MSH", 9) || "";
    const qrdSegment = segments.find((item) => item.name === "QRD");
    const qrfSegment = segments.find((item) => item.name === "QRF");

    return [
        buildResponseMsh(segments, "DSR^Q03", buildMessageControlId(), "P", ""),
        ["MSA", "AA", originalControlId, "Message accepted", "", "", "0"].join("|"),
        ["ERR", "0"].join("|"),
        ["QAK", "SR", "OK"].join("|"),
        qrdSegment ? qrdSegment.fields.join("|") : `QRD|${formatHl7Timestamp()}|R|D|1|||RD||OTH|||T|`,
        qrfSegment ? qrfSegment.fields.join("|") : "QRF||||||RCT|COR|ALL||",
        ...buildDspSegments(firstRow, parsedBarcode, rows),
        "DSC||",
    ].join(CR) + CR;
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

async function handleQuery(socket, segments) {
    const barcode = findBarcodeInSegments(segments);
    if (!barcode) {
        socket.write(toMllpFrame(buildQckMessage(segments, "AE", "AE", "Barcode not found in QRD-8.")));
        log("Query rejected: barcode not found.");
        return;
    }

    const parsedBarcode = parseBarcode(barcode);
    const { rows, distinctOrders } = await fetchWorkItems(parsedBarcode);

    log("Incoming QRY", `${barcode}; matches=${distinctOrders.length}; tests=${rows.length}`);

    if (distinctOrders.length > 1) {
        socket.write(
            toMllpFrame(
                buildQckMessage(
                    segments,
                    "AE",
                    "AE",
                    `Ambiguous barcode ${barcode}. Found ${distinctOrders.length} matching orders in the last ${SEARCH_DAYS} days.`
                )
            )
        );
        return;
    }

    if (!rows.length) {
        socket.write(toMllpFrame(buildQckMessage(segments, "AA", "NF", `No pending work found for barcode ${barcode}.`)));
        return;
    }

    socket.write(toMllpFrame(buildQckMessage(segments, "AA", "OK")));
    socket.write(toMllpFrame(buildDsrMessage(segments, parsedBarcode, rows)));
    log("DSR worklist sent", `${barcode} -> ${rows.length} tests`);
}

function handleDsrAck(segments) {
    const ackCode = getField(segments, "MSA", 1) || "";
    const controlId = getField(segments, "MSA", 2) || "";
    log("Received ACK^Q03", `ack=${ackCode}; controlId=${controlId}`);
}

async function handleHl7Message(socket, rawMessage) {
    const segments = parseSegments(rawMessage);
    if (!segments.length) {
        return;
    }

    try {
        const messageType = getMessageType(segments);

        if (messageType === "QRY^Q02") {
            await handleQuery(socket, segments);
            return;
        }

        if (messageType === "ACK^Q03") {
            handleDsrAck(segments);
            return;
        }

        if (messageType === "ORU^R01") {
            socket.write(toMllpFrame(buildAckMessage(segments, "AA", "", "ACK^R01")));
            log("ORU received and acknowledged.");
            return;
        }

        socket.write(toMllpFrame(buildAckMessage(segments, "AA", "", "ACK")));
        log("Unsupported HL7 type acknowledged generically", messageType || "unknown");
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const messageType = getMessageType(segments);
        if (messageType === "QRY^Q02") {
            socket.write(toMllpFrame(buildQckMessage(segments, "AE", "AE", errorMessage)));
        } else {
            socket.write(toMllpFrame(buildAckMessage(segments, "AE", errorMessage, "ACK")));
        }
        log("Processing error", errorMessage);
    }
}

export function startMindrayBs240Hl7Server() {
    const server = net.createServer((socket) => {
        const state = { buffer: "" };
        const remote = `${socket.remoteAddress || "unknown"}:${socket.remotePort || "?"}`;

        log("Client connected", remote);
        socket.setEncoding("utf8");

        socket.on("data", async (chunk) => {
            state.buffer += chunk;
            for (const message of extractMessagesFromBuffer(state)) {
                await handleHl7Message(socket, message);
            }
        });

        socket.on("error", (error) => {
            log("Socket error", `${remote} ${error.message}`);
        });

        socket.on("close", () => {
            log("Client disconnected", remote);
        });
    });

    server.on("error", (error) => {
        log("Server error", error.message);
    });

    server.listen(SERVER_PORT, SERVER_HOST, () => {
        log(
            "Server started",
            `tcp://${SERVER_HOST}:${SERVER_PORT} branch=${BRANCH_KEY} lab=${labCode} analyzer=${ANALYZER_KODZAR || ANALYZER_PRACLISTID}`
        );
    });

    return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startMindrayBs240Hl7Server();
}
