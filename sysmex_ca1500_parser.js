function safeTrim(value) {
    return String(value ?? "").trim();
}

function splitLines(message) {
    return String(message || "")
        .split(/\r?\n|\r/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function splitFields(recordLine) {
    return String(recordLine || "").split("|");
}

function splitComponents(value) {
    return String(value || "").split("^");
}

function normalizeSpecimen(components = []) {
    return {
        rackNo: safeTrim(components[0]),
        tubePosition: safeTrim(components[1]),
        sampleNo: safeTrim(components[2]).toUpperCase(),
        sampleAttribute: safeTrim(components[3]),
        expandedOrderFlag: safeTrim(components[4]),
    };
}

function stringifyComponents(components) {
    return Array.isArray(components) ? components.join("^") : String(components || "");
}

function normalizeQueryTests(fieldValue) {
    return String(fieldValue || "")
        .split("\\")
        .map((item) => splitComponents(item))
        .map((components) => ({
            raw: stringifyComponents(components),
            testCode: safeTrim(components[3]),
            testName: safeTrim(components[4]),
        }))
        .filter((item) => item.testCode || item.testName);
}

function normalizeOrderTests(fieldValue) {
    return String(fieldValue || "")
        .split("\\")
        .map((item) => splitComponents(item))
        .map((components) => ({
            raw: stringifyComponents(components),
            testCode: safeTrim(components[3]),
            testName: safeTrim(components[4]),
            dilution: safeTrim(components[5]),
            option: safeTrim(components[6]),
        }))
        .filter((item) => item.testCode || item.testName);
}

function normalizeResultRecord(fields) {
    const universalTestId = splitComponents(fields[2] || "");

    return {
        recordType: "R",
        sequenceNo: safeTrim(fields[1]),
        testCode: safeTrim(universalTestId[3]),
        testName: safeTrim(universalTestId[4]),
        dilution: safeTrim(universalTestId[5]),
        resultType: safeTrim(universalTestId[6]),
        expandOrderRequired: safeTrim(universalTestId[7]),
        expandOrderResult: safeTrim(universalTestId[8]),
        reflexRequired: safeTrim(universalTestId[9]),
        value: String(fields[3] || "").trim(),
        units: String(fields[4] || "").trim(),
        abnormalFlag: safeTrim(fields[6]),
        completedAt: safeTrim(fields[12]),
        rawFields: fields,
    };
}

function inferValueType(value) {
    const normalized = String(value || "").trim().replace(",", ".");
    if (!normalized) {
        return "ST";
    }

    return /^[+-]?\d+(\.\d+)?$/.test(normalized) ? "NM" : "ST";
}

function formatTimestamp(date = new Date()) {
    const pad2 = (value) => String(value).padStart(2, "0");
    return [
        date.getFullYear(),
        pad2(date.getMonth() + 1),
        pad2(date.getDate()),
        pad2(date.getHours()),
        pad2(date.getMinutes()),
        pad2(date.getSeconds()),
    ].join("");
}

function buildHeaderRecord({
    hostName = "MEDICALHUB",
    instrumentName = "CA-1500",
    instrumentNo = "",
    userInstrumentNo = "",
}) {
    return `H|\\^&|||${hostName}^^^^|||||${instrumentName}^^${instrumentNo}^^^${userInstrumentNo}`;
}

function buildPatientRecord({ patientName = "" } = {}) {
    return `P|1||||${String(patientName || "").trim()}`;
}

function buildOrderTestField(tests = []) {
    return tests
        .map((item) => {
            const code = safeTrim(item.testCode);
            const dilution = safeTrim(item.dilution || "100.00");
            const option = safeTrim(item.option);
            return option
                ? `^^^${code}^^${dilution}^${option}`
                : `^^^${code}^^${dilution}`;
        })
        .filter(Boolean)
        .join("\\");
}

function buildOrderRecord({
    rackNo = "",
    tubePosition = "",
    sampleNo = "",
    sampleAttribute = "C",
    tests = [],
    priority = "R",
    requestedAt = "",
    actionCode = "N",
}) {
    const specimen = [
        String(rackNo || "").trim(),
        String(tubePosition || "").trim(),
        String(sampleNo || "").trim(),
        String(sampleAttribute || "C").trim(),
    ].join("^");

    return `O|1|${specimen}||${buildOrderTestField(tests)}|${String(priority || "R").trim() || "R"}|${safeTrim(requestedAt) || formatTimestamp()}|||||${String(actionCode || "N").trim() || "N"}`;
}

function buildTerminationRecord() {
    return "L|1|N";
}

export function parseCa1500AstmMessage(message) {
    const records = splitLines(message).map((line) => {
        const fields = splitFields(line);
        return { type: safeTrim(fields[0]), fields, line };
    });

    const parsed = {
        raw: String(message || ""),
        records,
        header: null,
        patient: null,
        query: null,
        order: null,
        results: [],
        termination: null,
    };

    for (const record of records) {
        if (record.type === "H") {
            const sender = splitComponents(record.fields[4] || "");
            const receiver = splitComponents(record.fields[10] || "");
            parsed.header = {
                recordType: "H",
                delimiterDefinition: record.fields[1] || "",
                senderName: safeTrim(sender[0]),
                softwareVersion: safeTrim(sender[1]),
                instrumentNo: safeTrim(sender[2]),
                userInstrumentNo: safeTrim(sender[5]),
                receiverName: safeTrim(receiver[0]),
                rawFields: record.fields,
            };
            continue;
        }

        if (record.type === "P") {
            parsed.patient = {
                recordType: "P",
                sequenceNo: safeTrim(record.fields[1]),
                patientId: safeTrim(record.fields[4]),
                patientName: safeTrim(record.fields[5]),
                rawFields: record.fields,
            };
            continue;
        }

        if (record.type === "Q") {
            parsed.query = {
                recordType: "Q",
                sequenceNo: safeTrim(record.fields[1]),
                specimen: normalizeSpecimen(splitComponents(record.fields[2] || "")),
                tests: normalizeQueryTests(record.fields[4] || ""),
                requestTimeMode: safeTrim(record.fields[5]),
                requestStartAt: safeTrim(record.fields[6]),
                rawFields: record.fields,
            };
            continue;
        }

        if (record.type === "O") {
            const specimenField = safeTrim(record.fields[2]) ? record.fields[2] : record.fields[3];
            parsed.order = {
                recordType: "O",
                sequenceNo: safeTrim(record.fields[1]),
                specimen: normalizeSpecimen(splitComponents(specimenField || "")),
                tests: normalizeOrderTests(record.fields[4] || record.fields[5] || ""),
                priority: safeTrim(record.fields[5] || record.fields[6]),
                requestedAt: safeTrim(record.fields[6]),
                actionCode: safeTrim(record.fields[11] || record.fields[12]),
                rawFields: record.fields,
            };
            continue;
        }

        if (record.type === "R") {
            parsed.results.push(normalizeResultRecord(record.fields));
            continue;
        }

        if (record.type === "L") {
            parsed.termination = {
                recordType: "L",
                sequenceNo: safeTrim(record.fields[1]),
                terminationCode: safeTrim(record.fields[2]),
                rawFields: record.fields,
            };
        }
    }

    parsed.messageKind = parsed.query ? "query" : (parsed.results.length ? "result" : "unknown");
    return parsed;
}

export function buildCa1500ResultPayload(parsedMessage, options = {}) {
    const codeMapping = options.codeMapping || {};
    const identifierSource = String(options.identifierSource || "sample_no").trim().toLowerCase();
    const sample = parsedMessage?.order?.specimen || parsedMessage?.query?.specimen || {};

    let barcode = sample.sampleNo || "";
    if (identifierSource === "rack_tube_sample") {
        barcode = [sample.rackNo, sample.tubePosition, sample.sampleNo].filter(Boolean).join("^");
    }

    const observations = (parsedMessage.results || []).map((result, index) => ({
        setId: result.sequenceNo || String(index + 1),
        code: result.testCode,
        observationId: codeMapping[result.testCode] || result.testCode,
        observationName: result.testName,
        value: result.value,
        valueType: inferValueType(result.value),
        units: result.units,
        abnormalFlag: result.abnormalFlag,
        status: "F",
        measuredAt: result.completedAt,
        metadata: {
            dilution: result.dilution,
            resultType: result.resultType,
            expandOrderRequired: result.expandOrderRequired,
            expandOrderResult: result.expandOrderResult,
            reflexRequired: result.reflexRequired,
        },
    }));

    return {
        transport: "serial",
        protocol: "ASTM-CA1500",
        analyzerId: options.analyzerId || "ca1500-com",
        analyzerLabel: options.analyzerLabel || "Sysmex CA-1500 ASTM",
        branchKey: options.branchKey || "ad",
        analyzerPraclistId: options.analyzerPraclistId || "",
        analyzerKodzar: options.analyzerKodzar || "",
        barcode,
        sampleId: sample.sampleNo || "",
        patientId: parsedMessage?.patient?.patientId || sample.sampleNo || "",
        patientName: parsedMessage?.patient?.patientName || "",
        measuredAt: parsedMessage?.results?.[0]?.completedAt || "",
        rawMessage: parsedMessage.raw,
        rackNo: sample.rackNo || "",
        tubePosition: sample.tubePosition || "",
        sampleAttribute: sample.sampleAttribute || "",
        expandedOrderFlag: sample.expandedOrderFlag || "",
        observations,
    };
}

export function buildCa1500HostOrderMessage(orderData = {}) {
    return [
        buildHeaderRecord(orderData),
        buildPatientRecord(orderData),
        buildOrderRecord(orderData),
        buildTerminationRecord(),
    ].join("\r") + "\r";
}

export function buildCa1500EmptyOrderMessage(orderData = {}) {
    return buildCa1500HostOrderMessage({
        ...orderData,
        tests: [],
    });
}
