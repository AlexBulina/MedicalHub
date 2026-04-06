import net from "node:net";
import { transliterate } from "transliteration";
import BRANCHES from "./branches_config.js";
import { executeQuery } from "./database_repository.js";
import { createSybaseAnalyzerResultIngester } from "./sybase_analyzer_result_ingest.js";

const VT = String.fromCharCode(0x0b);
const FS = String.fromCharCode(0x1c);
const CR = "\r";

export function escapeSql(value) {
    return String(value ?? "").replace(/'/g, "''");
}

export function hl7Escape(value) {
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

export function formatHl7Timestamp(date = new Date()) {
    return [
        date.getFullYear(),
        pad2(date.getMonth() + 1),
        pad2(date.getDate()),
        pad2(date.getHours()),
        pad2(date.getMinutes()),
        pad2(date.getSeconds()),
    ].join("");
}

export function formatHl7Date(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("");
}

export function formatMindrayFullDate(value) {
    const datePart = formatHl7Date(value);
    return datePart ? `${datePart}000000` : "";
}

export function buildMessageControlId() {
    return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export function toMllpFrame(message) {
    return `${VT}${message}${FS}${CR}`;
}

export function parseSegments(message) {
    return String(message || "")
        .split(/\r?\n|\r/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const fields = line.split("|");
            return { name: fields[0], fields };
        });
}

export function getField(segments, segmentName, index) {
    const segment = segments.find((item) => item.name === segmentName);
    return segment?.fields?.[index] || "";
}

export function getMessageType(segments) {
    return getField(segments, "MSH", 8);
}

export function defaultFindBarcodeInSegments(segments) {
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

export function defaultParseBarcode(barcode) {
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

export function defaultParseObservationIdentifier(value) {
    return String(value || "").split("^")[0].trim();
}

export function defaultParseOruResultPayload(segments, helpers = {}) {
    const findBarcodeInSegments = helpers.findBarcodeInSegments || defaultFindBarcodeInSegments;
    const parseObservationIdentifier = helpers.parseObservationIdentifier || defaultParseObservationIdentifier;

    const barcode = getField(segments, "OBR", 2).trim().toUpperCase() || findBarcodeInSegments(segments);
    if (!barcode) {
        throw new Error("ORU does not contain barcode in OBR-2.");
    }

    const observations = segments
        .filter((segment) => segment.name === "OBX")
        .map((segment) => ({
            setId: segment.fields[1] || "",
            valueType: segment.fields[2] || "ST",
            observationId: parseObservationIdentifier(segment.fields[3] || ""),
            observationName: segment.fields[4] || "",
            value: segment.fields[5] || "",
            units: segment.fields[6] || "",
            abnormalFlag: segment.fields[8] || "",
            status: segment.fields[11] || "",
            observedAt: segment.fields[14] || "",
            observer: segment.fields[16] || "",
            rerunFlag: segment.fields[17] || "",
        }))
        .filter((item) => item.observationId);

    if (!observations.length) {
        throw new Error("ORU does not contain OBX observations.");
    }

    return { barcode, observations };
}

export function defaultSampleTypeToText(priradenie) {
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

export function defaultBuildDspSegments({ firstRow, parsedBarcode, rows, helpers = {} }) {
    const sampleTypeToText = helpers.sampleTypeToText || defaultSampleTypeToText;
    const values = [
        "",
        "",
        transliterate([firstRow.priezvisko, firstRow.meno].filter(Boolean).join(" ").trim()),
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
        values.push({
            value: `${row.analyzer_test_code || row.kodvys}^^^`,
            raw: true,
        });
    }

    return values.map((item, index) => {
        const payload =
            typeof item === "object"
                ? (item.raw ? item.value : hl7Escape(item.value))
                : hl7Escape(item);

        return ["DSP", String(index + 1), "", payload, "", "", ""].join("|");
    });
}

export function createSybaseHl7AnalyzerServer(options = {}) {
    const {
        serverHost = "0.0.0.0",
        serverPort = 4001,
        branchKey = "ad",
        analyzerKodzar = "",
        analyzerPraclistId = "BS240",
        searchDays = 90,
        sendingApp = "MEDICALHUB",
        sendingFacility = "LAB",
        receivingApp = "MINDRAY_BS240",
        receivingFacility = "ANALYZER",
        hl7Version = "2.3.1",
        resultOscis = 22,
        autoConfirmResults = true,
        serverLabel = analyzerPraclistId || analyzerKodzar || "HL7",
        protocolName = "HL7",
        labCode: explicitLabCode,
        protocolHooks = {},
    } = options;

    const branch = BRANCHES[branchKey];

    if (!branch?.db) {
        throw new Error(`Unknown HL7 branch "${branchKey}". Check branch configuration.`);
    }

    if (branch.db.type && branch.db.type !== "sybase") {
        throw new Error(`HL7 server requires a Sybase branch. "${branchKey}" uses ${branch.db.type}.`);
    }

    const dbConfig = branch.db;
    const labCode = explicitLabCode || branch.LabCode || "00001";

    const helpers = {
        escapeSql,
        hl7Escape,
        formatHl7Timestamp,
        formatHl7Date,
        formatMindrayFullDate,
        buildMessageControlId,
        parseSegments,
        getField,
        getMessageType,
        toMllpFrame,
        sampleTypeToText: protocolHooks.sampleTypeToText || defaultSampleTypeToText,
        findBarcodeInSegments: protocolHooks.findBarcodeInSegments || defaultFindBarcodeInSegments,
        parseBarcode: protocolHooks.parseBarcode || defaultParseBarcode,
        parseObservationIdentifier: protocolHooks.parseObservationIdentifier || defaultParseObservationIdentifier,
    };

    helpers.parseOruResultPayload =
        protocolHooks.parseOruResultPayload ||
        ((segments) =>
            defaultParseOruResultPayload(segments, {
                findBarcodeInSegments: helpers.findBarcodeInSegments,
                parseObservationIdentifier: helpers.parseObservationIdentifier,
            }));

    helpers.buildDspSegments =
        protocolHooks.buildDspSegments ||
        ((ctx) => defaultBuildDspSegments({ ...ctx, helpers }));

    function log(message, extra = "") {
        console.log(`[${protocolName}:${serverLabel}] ${message}${extra ? ` ${extra}` : ""}`);
    }

    function logObject(label, value) {
        log(label, JSON.stringify(value));
    }

    function logHl7(direction, message) {
        log(`${direction} HL7 BEGIN`);
        for (const line of String(message || "").split(/\r?\n|\r/).filter(Boolean)) {
            console.log(`[${protocolName}:${serverLabel}] ${direction} ${line}`);
        }
        log(`${direction} HL7 END`);
    }

    const resultIngester = createSybaseAnalyzerResultIngester({
        branchKey,
        analyzerKodzar,
        analyzerPraclistId,
        searchDays,
        resultOscis,
        autoConfirmResults,
        labCode,
        parseBarcode: helpers.parseBarcode,
        logger: (message, extra = "") => log(message, extra),
        queryLogger: (query) => console.log(String(query || "").trim()),
    });

    function buildAnalyzerFilter() {
        if (analyzerKodzar) {
            return `pl.kodzar = ${Number(analyzerKodzar)}`;
        }

        return `pl.praclistid = '${escapeSql(analyzerPraclistId)}'`;
    }

    function buildBarcodeWhereClause(parsedBarcode) {
        const clauses = [
            `z.kodlab = '${escapeSql(labCode)}'`,
            `z.datodberu >= DATEADD(day, -${Number.isFinite(searchDays) ? searchDays : 90}, CURRENT DATE)`,
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

    async function fetchWorkItemsInternal(parsedBarcode, includeCompleted = false) {
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
          ${includeCompleted ? "" : "AND (pp.stavvys IS NULL OR pp.stavvys <> 2)"}
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
            query,
        };
    }

    async function fetchWorkItems(parsedBarcode) {
        return fetchWorkItemsInternal(parsedBarcode, false);
    }

    function buildResultUpdateSql(row, observation) {
        const valueType = String(observation.valueType || "").toUpperCase();
        const rawValue = String(observation.value || "").trim();
        const numericValue = Number(rawValue.replace(",", "."));
        const isNumeric = valueType === "NM" && Number.isFinite(numericValue);
        const escapedDatevidcis = escapeSql(row.datevidcis);
        const resultNumSql = isNumeric ? numericValue : "NULL";
        const resultTextSql = isNumeric ? "NULL" : (rawValue ? `'${escapeSql(rawValue)}'` : "NULL");
        const concentrationSql = isNumeric ? numericValue : "NULL";
        const finalStatus = autoConfirmResults ? 2 : 1;

        return `
        UPDATE nis.ziad_okb_pom
        SET
            stavvys = ${finalStatus},
            oscisvys = ${resultOscis},
            datumvys = CURRENT TIMESTAMP,
            oscispotvr = ${autoConfirmResults ? resultOscis : "oscispotvr"},
            datumpotvrd = ${autoConfirmResults ? "CURRENT TIMESTAMP" : "datumpotvrd"},
            vysledoknum = ${resultNumSql},
            vysledoktext = ${resultTextSql},
            koncentracia = ${concentrationSql}
        WHERE datevidcis = '${escapedDatevidcis}'
          AND evidcis = ${row.evidcis}
          AND kodlab = '${escapeSql(labCode)}'
          AND kodvys = ${row.kodvys};

        UPDATE nis.ziad_okb_pra_pom
        SET
            stavvys = ${finalStatus},
            oscisvys = ${resultOscis},
            datumvys = CURRENT TIMESTAMP,
            oscispotvr = ${autoConfirmResults ? resultOscis : "oscispotvr"},
            datumpotvrd = ${autoConfirmResults ? "CURRENT TIMESTAMP" : "datumpotvrd"},
            vysledoknum = ${resultNumSql},
            vysledoktext = ${resultTextSql},
            koncentracia = ${concentrationSql}
        WHERE datevidcis = '${escapedDatevidcis}'
          AND evidcis = ${row.evidcis}
          AND kodlab = '${escapeSql(labCode)}'
          AND kodvys = ${row.kodvys};
    `;
    }

    async function applyOruResults(oruPayload) {
        const applied = await resultIngester.applyResultPayload(oruPayload);
        logObject("Applying ORU results for barcode", applied.parsedBarcode);
        return applied;
    }

    function buildResponseMsh(segments, messageType, controlId = buildMessageControlId(), acceptAckType = "", appAckType = "") {
        const remoteSendingApp = getField(segments, "MSH", 2) || receivingApp;
        const remoteSendingFacility = getField(segments, "MSH", 3) || receivingFacility;
        const localReceivingApp = getField(segments, "MSH", 4) || sendingApp;
        const localReceivingFacility = getField(segments, "MSH", 5) || sendingFacility;

        return [
            "MSH",
            "^~\\&",
            localReceivingApp,
            localReceivingFacility,
            remoteSendingApp,
            remoteSendingFacility,
            formatHl7Timestamp(),
            "",
            messageType,
            controlId,
            "P",
            hl7Version,
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
            ["MSA", ackCode, originalControlId, hl7Escape(errorText), "", "", statusCode, ""].join("|"),
            ["ERR", statusCode, ""].join("|"),
        ];
        return parts.join(CR) + CR;
    }

    function buildQckMessage(segments, ackCode = "AA", queryStatus = "OK", errorText = "") {
        const originalControlId = getField(segments, "MSH", 9) || "";
        const statusCode = ackCode === "AA" ? "0" : "207";
        return [
            buildResponseMsh(segments, "QCK^Q02"),
            ["MSA", ackCode, originalControlId, hl7Escape(errorText), "", "", statusCode, ""].join("|"),
            ["ERR", statusCode, ""].join("|"),
            ["QAK", "SR", queryStatus, ""].join("|"),
        ].join(CR) + CR;
    }

    function buildDsrMessage(segments, parsedBarcode, rows) {
        const firstRow = rows[0];
        const originalControlId = getField(segments, "MSH", 9) || "";
        const qrdSegment = segments.find((item) => item.name === "QRD");
        const qrfSegment = segments.find((item) => item.name === "QRF");

        return [
            buildResponseMsh(segments, "DSR^Q03", buildMessageControlId(), "P", ""),
            ["MSA", "AA", originalControlId, "Message accepted", "", "", "0", ""].join("|"),
            ["ERR", "0", ""].join("|"),
            ["QAK", "SR", "OK", ""].join("|"),
            qrdSegment ? qrdSegment.fields.join("|") : `QRD|${formatHl7Timestamp()}|R|D|1|||RD||OTH|||T|`,
            qrfSegment ? qrfSegment.fields.join("|") : "QRF||||||RCT|COR|ALL||",
            ...helpers.buildDspSegments({ firstRow, parsedBarcode, rows, helpers }),
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
        const barcode = helpers.findBarcodeInSegments(segments);
        if (!barcode) {
            const qck = buildQckMessage(segments, "AE", "AE", "Barcode not found in QRD-8.");
            log("Query rejected: barcode not found.");
            logHl7("OUT", qck);
            socket.write(toMllpFrame(qck));
            return;
        }

        const parsedBarcode = helpers.parseBarcode(barcode);
        logObject("Parsed barcode", parsedBarcode);
        const { rows, distinctOrders, query } = await fetchWorkItems(parsedBarcode);

        log("Incoming QRY", `${barcode}; matches=${distinctOrders.length}; tests=${rows.length}`);
        log("Sybase query prepared");
        console.log(query.trim());

        if (distinctOrders.length > 1) {
            const qck = buildQckMessage(
                segments,
                "AE",
                "AE",
                `Ambiguous barcode ${barcode}. Found ${distinctOrders.length} matching orders in the last ${searchDays} days.`
            );
            logHl7("OUT", qck);
            socket.write(toMllpFrame(qck));
            return;
        }

        if (!rows.length) {
            const qck = buildQckMessage(segments, "AA", "NF", `No pending work found for barcode ${barcode}.`);
            logHl7("OUT", qck);
            socket.write(toMllpFrame(qck));
            log("No pending work", barcode);
            return;
        }

        const qck = buildQckMessage(segments, "AA", "OK");
        const dsr = buildDsrMessage(segments, parsedBarcode, rows);
        logObject("Matched order", {
            datevidcis: rows[0].datevidcis,
            evidcis: rows[0].evidcis,
            typziad: rows[0].typziad,
            datodberu: rows[0].datodberu,
            patient: [rows[0].priezvisko, rows[0].meno].filter(Boolean).join(" "),
        });
        logObject("Analyzer tests", rows.map((row) => ({
            kodvys: row.kodvys,
            analyzer_test_code: row.analyzer_test_code,
            analyzer_test_code2: row.analyzer_test_code2,
            priradenie: row.priradenie,
        })));
        logHl7("OUT", qck);
        socket.write(toMllpFrame(qck));
        logHl7("OUT", dsr);
        socket.write(toMllpFrame(dsr));
        log("DSR worklist sent", `${barcode} -> ${rows.length} tests`);
    }

    function handleDsrAck(segments) {
        const ackCode = getField(segments, "MSA", 1) || "";
        const controlId = getField(segments, "MSA", 2) || "";
        log("Received ACK^Q03", `ack=${ackCode}; controlId=${controlId}`);
    }

    function handleOru(socket, segments) {
        const oruPayload = helpers.parseOruResultPayload(segments, helpers);
        logObject("Incoming ORU payload", oruPayload);

        const ack = buildAckMessage(
            segments,
            "AA",
            `Message accepted for barcode ${oruPayload.barcode}.`,
            "ACK^R01"
        );
        logHl7("OUT", ack);
        socket.write(toMllpFrame(ack));
        log("ORU accepted for background processing", oruPayload.barcode);

        void (async () => {
            try {
                const applied = await applyOruResults(oruPayload);
                logObject("ORU applied", applied);
                log("ORU results stored", `${oruPayload.barcode} -> ${applied.updated.length} tests`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                log("Post-ACK ORU processing error", `${oruPayload.barcode} ${errorMessage}`);
            }
        })();
    }

    async function handleHl7Message(socket, rawMessage) {
        const segments = parseSegments(rawMessage);
        if (!segments.length) {
            return;
        }

        try {
            const messageType = getMessageType(segments);
            logHl7("IN", rawMessage);
            log("HL7 message type", messageType || "unknown");

            if (messageType === "QRY^Q02") {
                await handleQuery(socket, segments);
                return;
            }

            if (messageType === "ACK^Q03") {
                handleDsrAck(segments);
                return;
            }

            if (messageType === "ORU^R01") {
                await handleOru(socket, segments);
                return;
            }

            const ack = buildAckMessage(segments, "AA", "", "ACK");
            logHl7("OUT", ack);
            socket.write(toMllpFrame(ack));
            log("Unsupported HL7 type acknowledged generically", messageType || "unknown");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const messageType = getMessageType(segments);
            if (messageType === "QRY^Q02") {
                const qck = buildQckMessage(segments, "AE", "AE", errorMessage);
                logHl7("OUT", qck);
                socket.write(toMllpFrame(qck));
            } else {
                const ack = buildAckMessage(segments, "AE", errorMessage, "ACK");
                logHl7("OUT", ack);
                socket.write(toMllpFrame(ack));
            }
            log("Processing error", errorMessage);
        }
    }

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

    return {
        server,
        start() {
            server.listen(serverPort, serverHost, () => {
                log(
                    "Server started",
                    `tcp://${serverHost}:${serverPort} branch=${branchKey} lab=${labCode} analyzer=${analyzerKodzar || analyzerPraclistId}`
                );
            });
            return server;
        },
        helpers,
    };
}

export function startSybaseHl7AnalyzerServer(options = {}) {
    return createSybaseHl7AnalyzerServer(options).start();
}
