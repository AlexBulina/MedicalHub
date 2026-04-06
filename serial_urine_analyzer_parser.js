function splitCsvLine(line) {
    return String(line || "")
        .replace(/\r?\n/g, "")
        .replace(/\r/g, "")
        .split(",")
        .map((item) => item.trim());
}

const CLINITEK_VALUE_TRANSLATIONS = {
    neg: "Негативний",
    negative: "Негативний",
    heg: "Негативний",
    pos: "Позитивний",
    positive: "Позитивний",
    norm: "Норма",
    normal: "Норма",
    trace: "Сліди",
    tr: "Сліди",
    small: "Незначна кількість",
    moderate: "Помірна кількість",
    large: "Значна кількість",
    yellow: "Жовтий",
    "light yellow": "Світло-жовтий",
    "dark yellow": "Темно-жовтий",
    straw: "Солом'яний",
    amber: "Бурштиновий",
    colorless: "Безбарвний",
    clear: "Прозора",
    hazy: "Злегка каламутна",
    cloudy: "Каламутна",
    turbid: "Мутна",
    "slightly cloudy": "Злегка каламутна",
};

function translateClinitekValue(value) {
    const normalized = String(value || "").trim();
    if (!normalized) {
        return "";
    }

    const lookupKey = normalized.toLowerCase().replace(/\s+/g, " ");
    return CLINITEK_VALUE_TRANSLATIONS[lookupKey] || normalized;
}

function normalizeObservation(observation) {
    const code = String(observation.code || "").trim();
    const rawValue = String(observation.value || "").trim();
    const rawMark = String(observation.mark || "").trim();

    if (!code) {
        return null;
    }

    return {
        code,
        rawValue,
        value: translateClinitekValue(rawValue),
        rawMark,
        mark: translateClinitekValue(rawMark),
    };
}

export function parseUrineClinicalResultString(rawLine) {
    const cleaned = String(rawLine || "").replace(/\u000d$/, "").trim();
    if (!cleaned) {
        throw new Error("Urine analyzer line is empty.");
    }

    const fields = splitCsvLine(cleaned);
    if (fields.length < 44) {
        throw new Error(`Urine analyzer line is too short. Expected at least 44 fields, got ${fields.length}.`);
    }

    const observations = [];
    for (let index = 12; index <= 41; index += 3) {
        const observation = normalizeObservation({
            code: fields[index],
            value: fields[index + 1],
            mark: fields[index + 2],
        });

        if (observation) {
            observations.push(observation);
        }
    }

    const notes = fields
        .slice(44)
        .map((item) => item.trim())
        .filter(Boolean);

    return {
        raw: cleaned,
        sequenceNo: fields[0] || "",
        measuredDate: fields[1] || "",
        measuredTime: fields[2] || "",
        instrumentSerial: fields[3] || "",
        patientId: fields[4] || "",
        patientName: fields[5] || "",
        demographicHeader: fields[6] || "",
        demographicData: fields[7] || "",
        operatorId: fields[8] || "",
        stripType: fields[9] || "",
        rawColor: fields[10] || "",
        color: translateClinitekValue(fields[10] || ""),
        rawClarity: fields[11] || "",
        clarity: translateClinitekValue(fields[11] || ""),
        stripLotNum: fields[42] || "",
        stripLotDate: fields[43] || "",
        measuredAt:
            fields[1] && fields[2]
                ? `${fields[1]} ${fields[2]}`
                : (fields[1] || fields[2] || ""),
        observations,
        notes,
    };
}
