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

function splitRepeats(value) {
    return String(value || "").split("\\");
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

function inferValueType(value) {
    const normalized = String(value || "").trim().replace(",", ".");
    if (!normalized) {
        return "ST";
    }

    return /^[+-]?\d+(\.\d+)?$/.test(normalized) ? "NM" : "ST";
}

function parseQueryRangeField(value) {
    const raw = safeTrim(value);
    if (!raw || raw.toUpperCase() === "ALL") {
        return {
            raw,
            patientId: "",
            sampleId: "",
            rackNo: "",
            samplePosition: "",
            isAll: raw.toUpperCase() === "ALL",
        };
    }

    const components = splitComponents(raw);
    return {
        raw,
        patientId: safeTrim(components[0]),
        sampleId: safeTrim(components[1]).toUpperCase(),
        rackNo: safeTrim(components[2]),
        samplePosition: safeTrim(components[3]).toUpperCase(),
        isAll: false,
    };
}

function parseOrderSpecimenField(value) {
    const raw = safeTrim(value);
    const components = splitComponents(raw);
    return {
        raw,
        sampleId: safeTrim(components[0]).toUpperCase(),
        rackNo: safeTrim(components[1]),
        samplePosition: safeTrim(components[2]).toUpperCase(),
    };
}

function normalizeQueryTests(fieldValue) {
    const raw = safeTrim(fieldValue);
    if (!raw || raw.toUpperCase() === "ALL") {
        return {
            isAll: raw.toUpperCase() === "ALL",
            items: [],
        };
    }

    const items = splitRepeats(raw)
        .map((item) => splitComponents(item))
        .map((components) => ({
            raw: components.join("^"),
            testCode: safeTrim(components[3]),
        }))
        .filter((item) => item.testCode);

    return {
        isAll: false,
        items,
    };
}

function normalizeOrderTests(fieldValue) {
    return splitRepeats(fieldValue)
        .map((item) => splitComponents(item))
        .map((components) => ({
            raw: components.join("^"),
            testCode: safeTrim(components[3]),
            dilutionProtocol: safeTrim(components[4]),
            dilutionRatio: safeTrim(components[5]),
        }))
        .filter((item) => item.testCode);
}

function normalizeResultRecord(fields) {
    const universal = splitComponents(fields[2] || "");
    return {
        recordType: "R",
        sequenceNo: safeTrim(fields[1]),
        testCode: safeTrim(universal[3]),
        dilutionProtocol: safeTrim(universal[4]),
        dilutionRatio: safeTrim(universal[5]),
        replicateNumber: safeTrim(universal[6]),
        resultAspect: safeTrim(universal[7]),
        value: safeTrim(fields[3]),
        units: safeTrim(fields[4]),
        allergyClassRange: safeTrim(fields[5]),
        abnormalFlags: splitRepeats(fields[6] || "").map((item) => safeTrim(item)).filter(Boolean),
        resultStatus: splitRepeats(fields[8] || "").map((item) => safeTrim(item)).filter(Boolean),
        completedAt: safeTrim(fields[12]),
        rawFields: fields,
    };
}

function normalizeCommentRecord(fields) {
    const comment = splitComponents(fields[3] || "");
    return {
        recordType: "C",
        sequenceNo: safeTrim(fields[1]),
        source: safeTrim(fields[2]),
        commentCode: safeTrim(comment[0]),
        commentText: safeTrim(comment[1]),
        commentType: safeTrim(fields[4]),
        rawFields: fields,
    };
}

function normalizeManufacturerRecord(fields) {
    const manufacturerId = splitComponents(fields[2] || "");
    return {
        recordType: "M",
        sequenceNo: safeTrim(fields[1]),
        manufacturer: safeTrim(manufacturerId[0]),
        instrument: safeTrim(manufacturerId[1]),
        recordVersion: safeTrim(manufacturerId[2]),
        subRecordType: safeTrim(manufacturerId[3]),
        controlName: safeTrim(fields[3]),
        controlLotNumber: safeTrim(fields[4]),
        rawFields: fields,
    };
}

function buildHeaderRecord({
    senderId = "LIS_ID",
    receiverId = "ADVCNT_LIS",
    processingId = "P",
    version = "1",
}) {
    const fields = [];
    fields[0] = "H";
    fields[1] = "\\^&";
    fields[4] = senderId;
    fields[9] = receiverId;
    fields[11] = processingId;
    fields[12] = version;
    return fields.join("|");
}

function buildPatientRecord({
    sequenceNo = "1",
    patientId = "",
    patientName = "",
    dateOfBirth = "",
    sex = "",
    physicianId = "",
    location = "",
}) {
    const fields = [];
    fields[0] = "P";
    fields[1] = sequenceNo;
    fields[2] = patientId;
    fields[5] = patientName;
    fields[7] = dateOfBirth;
    fields[8] = sex;
    fields[13] = physicianId;
    fields[25] = location;
    return fields.join("|");
}

function buildSpecimenId({ sampleId = "", rackNo = "", samplePosition = "" }) {
    if (sampleId && rackNo && samplePosition) {
        return `${sampleId}^${rackNo}^${samplePosition}`;
    }
    if (sampleId) {
        return sampleId;
    }
    if (rackNo && samplePosition) {
        return `^${rackNo}^${samplePosition}`;
    }
    return "";
}

function buildOrderTestField(tests = []) {
    return tests
        .map((item) => {
            const code = safeTrim(item.testCode);
            const dilutionProtocol = safeTrim(item.dilutionProtocol);
            const dilutionRatio = safeTrim(item.dilutionRatio);
            const components = ["", "", "", code, dilutionProtocol, dilutionRatio];

            while (components.length && !components[components.length - 1]) {
                components.pop();
            }

            return components.join("^");
        })
        .filter(Boolean)
        .join("\\");
}

function buildOrderRecord({
    sequenceNo = "1",
    sampleId = "",
    rackNo = "",
    samplePosition = "",
    tests = [],
    priority = "R",
    actionCode = "",
    reportType = "O\\Q",
}) {
    const fields = [];
    fields[0] = "O";
    fields[1] = sequenceNo;
    fields[2] = buildSpecimenId({ sampleId, rackNo, samplePosition });
    fields[4] = buildOrderTestField(tests);
    fields[5] = safeTrim(priority) || "R";
    fields[11] = safeTrim(actionCode);
    fields[25] = safeTrim(reportType) || "O\\Q";
    return fields.join("|");
}

function buildManufacturerOrderRecord({
    sequenceNo = "1",
    controlName = "",
    controlLotNumber = "",
}) {
    const fields = [];
    fields[0] = "M";
    fields[1] = sequenceNo;
    fields[2] = "CCD^ACS:NG^V1^O";
    fields[3] = safeTrim(controlName);
    fields[4] = safeTrim(controlLotNumber);
    return fields.join("|");
}

function buildTerminationRecord(code = "N") {
    return `L|1|${safeTrim(code) || "N"}`;
}

export function parseAdviaCentaurAstmMessage(message) {
    const records = splitLines(message).map((line) => {
        const fields = splitFields(line);
        return { type: safeTrim(fields[0]).toUpperCase(), fields, line };
    });

    const parsed = {
        raw: String(message || ""),
        records,
        header: null,
        patients: [],
        comments: [],
        manufacturerRecords: [],
        orders: [],
        results: [],
        queries: [],
        termination: null,
    };

    let currentPatient = null;
    let currentOrder = null;
    let currentResult = null;

    for (const record of records) {
        if (record.type === "H") {
            parsed.header = {
                recordType: "H",
                delimiterDefinition: record.fields[1] || "",
                senderId: safeTrim(record.fields[4]),
                receiverId: safeTrim(record.fields[9]),
                processingId: safeTrim(record.fields[11] || "P"),
                version: safeTrim(record.fields[12] || "1"),
                rawFields: record.fields,
            };
            continue;
        }

        if (record.type === "P") {
            const patientRecord = {
                recordType: "P",
                sequenceNo: safeTrim(record.fields[1]),
                patientId: safeTrim(record.fields[2]),
                patientName: safeTrim(record.fields[5]),
                dateOfBirth: safeTrim(record.fields[7]),
                sex: safeTrim(record.fields[8]),
                physicianId: safeTrim(record.fields[13]),
                location: safeTrim(record.fields[25]),
                comments: [],
                orders: [],
                rawFields: record.fields,
            };
            parsed.patients.push(patientRecord);
            currentPatient = patientRecord;
            currentOrder = null;
            currentResult = null;
            continue;
        }

        if (record.type === "O") {
            const orderRecord = {
                recordType: "O",
                sequenceNo: safeTrim(record.fields[1]),
                specimen: parseOrderSpecimenField(record.fields[2] || ""),
                tests: normalizeOrderTests(record.fields[4] || ""),
                priority: safeTrim(record.fields[5]),
                actionCode: safeTrim(record.fields[11]),
                reportType: splitRepeats(record.fields[25] || "").map((item) => safeTrim(item)).filter(Boolean),
                comments: [],
                manufacturerRecords: [],
                results: [],
                rawFields: record.fields,
            };
            parsed.orders.push(orderRecord);
            if (currentPatient) {
                currentPatient.orders.push(orderRecord);
            }
            currentOrder = orderRecord;
            currentResult = null;
            continue;
        }

        if (record.type === "R") {
            const resultRecord = {
                ...normalizeResultRecord(record.fields),
                comments: [],
            };
            parsed.results.push(resultRecord);
            if (currentOrder) {
                currentOrder.results.push(resultRecord);
            }
            currentResult = resultRecord;
            continue;
        }

        if (record.type === "Q") {
            const tests = normalizeQueryTests(record.fields[4] || "");
            parsed.queries.push({
                recordType: "Q",
                sequenceNo: safeTrim(record.fields[1]),
                startingRangeId: parseQueryRangeField(record.fields[2] || ""),
                endingRangeId: parseQueryRangeField(record.fields[3] || ""),
                tests,
                requestTimeMode: safeTrim(record.fields[5]),
                beginResultsAt: safeTrim(record.fields[6]),
                endResultsAt: safeTrim(record.fields[7]),
                requestInformationStatusCode: safeTrim(record.fields[12] || "O"),
                rawFields: record.fields,
            });
            continue;
        }

        if (record.type === "C") {
            const commentRecord = normalizeCommentRecord(record.fields);
            parsed.comments.push(commentRecord);
            if (currentResult) {
                currentResult.comments.push(commentRecord);
            } else if (currentOrder) {
                currentOrder.comments.push(commentRecord);
            } else if (currentPatient) {
                currentPatient.comments.push(commentRecord);
            }
            continue;
        }

        if (record.type === "M") {
            const manufacturerRecord = normalizeManufacturerRecord(record.fields);
            parsed.manufacturerRecords.push(manufacturerRecord);
            if (currentOrder) {
                currentOrder.manufacturerRecords.push(manufacturerRecord);
            }
            continue;
        }

        if (record.type === "L") {
            parsed.termination = {
                recordType: "L",
                sequenceNo: safeTrim(record.fields[1]),
                terminationCode: safeTrim(record.fields[2] || "N"),
                rawFields: record.fields,
            };
        }
    }

    parsed.patient = parsed.patients[0] || null;
    parsed.order = parsed.orders[0] || null;
    parsed.query = parsed.queries[0] || null;
    parsed.messageKind = parsed.queries.length
        ? "query"
        : (parsed.results.length ? "result" : (parsed.orders.length ? "worklist" : "unknown"));
    return parsed;
}

export function buildAdviaCentaurResultPayload(parsedMessage, options = {}) {
    const codeMapping = options.codeMapping || {};
    const order = parsedMessage.order || {};
    const sample = order.specimen || {};
    const patient = parsedMessage.patient || {};

    const observations = (parsedMessage.results || []).map((result, index) => ({
        setId: result.sequenceNo || String(index + 1),
        code: result.testCode,
        observationId: codeMapping[result.testCode] || result.testCode,
        observationName: result.testCode,
        value: result.value,
        valueType: inferValueType(result.value),
        units: result.units,
        abnormalFlag: result.abnormalFlags.join("\\"),
        status: result.resultStatus.includes("P") ? "P" : "F",
        measuredAt: result.completedAt,
        metadata: {
            resultAspect: result.resultAspect,
            replicateNumber: result.replicateNumber,
            dilutionProtocol: result.dilutionProtocol,
            dilutionRatio: result.dilutionRatio,
            resultStatus: result.resultStatus,
            allergyClassRange: result.allergyClassRange,
            comments: result.comments || [],
        },
    }));

    return {
        transport: "serial",
        protocol: "ASTM-ADVIA-CENTAUR",
        analyzerId: options.analyzerId || "advia-centaur-com",
        analyzerLabel: options.analyzerLabel || "ADVIA Centaur ASTM",
        branchKey: options.branchKey || "ad",
        analyzerPraclistId: options.analyzerPraclistId || "",
        analyzerKodzar: options.analyzerKodzar || "",
        barcode: sample.sampleId || "",
        sampleId: sample.sampleId || "",
        patientId: patient.patientId || sample.patientId || sample.sampleId || "",
        patientName: patient.patientName || "",
        measuredAt: parsedMessage.results?.[0]?.completedAt || "",
        rawMessage: parsedMessage.raw,
        rackNo: sample.rackNo || "",
        tubePosition: sample.samplePosition || "",
        comments: parsedMessage.comments || [],
        manufacturerRecords: parsedMessage.manufacturerRecords || [],
        observations,
    };
}

export function buildAdviaCentaurWorklistMessage(orderData = {}) {
    const lines = [
        buildHeaderRecord(orderData),
        buildPatientRecord(orderData),
        buildOrderRecord(orderData),
    ];

    if (safeTrim(orderData.controlName) || safeTrim(orderData.controlLotNumber)) {
        lines.push(buildManufacturerOrderRecord(orderData));
    }

    lines.push(buildTerminationRecord("F"));
    return lines.join("\r") + "\r";
}

export function buildAdviaCentaurNoInformationMessage(orderData = {}) {
    return [
        buildHeaderRecord(orderData),
        buildTerminationRecord("I"),
    ].join("\r") + "\r";
}

export function buildAdviaCentaurQueryErrorMessage(orderData = {}) {
    return [
        buildHeaderRecord(orderData),
        buildTerminationRecord("Q"),
    ].join("\r") + "\r";
}

export function buildAdviaCentaurQueryContext(overrides = {}) {
    return {
        senderId: overrides.senderId || "LIS_ID",
        receiverId: overrides.receiverId || "ADVCNT_LIS",
        processingId: overrides.processingId || "P",
        version: overrides.version || "1",
        sequenceNo: overrides.sequenceNo || "1",
        patientId: overrides.patientId || "",
        patientName: overrides.patientName || "",
        dateOfBirth: overrides.dateOfBirth || "",
        sex: overrides.sex || "",
        physicianId: overrides.physicianId || "",
        location: overrides.location || "",
        sampleId: overrides.sampleId || "",
        rackNo: overrides.rackNo || "",
        samplePosition: overrides.samplePosition || "",
        priority: overrides.priority || "R",
        actionCode: overrides.actionCode || "",
        reportType: overrides.reportType || "O\\Q",
        tests: Array.isArray(overrides.tests) ? overrides.tests : [],
        timestamp: overrides.timestamp || formatTimestamp(),
    };
}
