import BRANCHES from "./branches_config.js";
import { executeQuery, executeQueriesInTransaction } from "./database_repository.js";

function escapeSql(value) {
    return String(value ?? "").replace(/'/g, "''");
}

function resolveShortBarcodeWithSampleMode(configuredMode) {
    const normalizedMode = String(configuredMode || "").trim().toLowerCase();
    if (normalizedMode === "year_month" || normalizedMode === "yymm") {
        return "year_month";
    }

    return "day_month";
}

function defaultParseBarcode(barcode, options = {}) {
    const value = String(barcode || "").trim().toUpperCase();
    const shortBarcodeWithSampleMode = resolveShortBarcodeWithSampleMode(
        options.shortBarcodeWithSampleMode || process.env.SERIAL_URINE_SHORT_BARCODE_WITH_SAMPLE_MODE
    );

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
        const [, first, second, typziad, evidcis, priradenie] = match;
        if (shortBarcodeWithSampleMode === "year_month") {
            return {
                raw: value,
                mode: "year_month_with_sample",
                year: Number(`20${first}`),
                month: Number(second),
                typziad,
                evidcis: Number(evidcis),
                priradenie,
            };
        }

        return {
            raw: value,
            mode: "short_with_sample",
            day: Number(first),
            month: Number(second),
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

export function createSybaseAnalyzerResultIngester(options = {}) {
    const {
        branchKey = "ad",
        analyzerKodzar = "",
        analyzerPraclistId = "BS240",
        shortBarcodeWithSampleMode = "",
        searchDays = 90,
        resultOscis = 22,
        autoConfirmResults = true,
        labCode: explicitLabCode,
        parseBarcode = (barcode) => defaultParseBarcode(barcode, { shortBarcodeWithSampleMode }),
        logger = () => { },
        queryLogger = () => { },
    } = options;

    const branch = BRANCHES[branchKey];

    if (!branch?.db) {
        throw new Error(`Unknown analyzer branch "${branchKey}".`);
    }

    if (branch.db.type && branch.db.type !== "sybase") {
        throw new Error(`Analyzer ingest requires a Sybase branch. "${branchKey}" uses ${branch.db.type}.`);
    }

    const dbConfig = {
        ...branch.db,
        dsn: branch.db?.dsn || process.env.DB_DSN_SYBASE || process.env.DB_DSN || "",
    };
    const labCode = explicitLabCode || branch.LabCode || "00001";

    if (dbConfig.type === "sybase" && !dbConfig.dsn) {
        throw new Error(
            `Sybase DSN is not configured for branch "${branchKey}". Set DB_DSN_SYBASE in .env or provide branch.db.dsn.`
        );
    }

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
        } else if (parsedBarcode.mode === "legacy_month_counter" || parsedBarcode.mode === "year_month_with_sample") {
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

        queryLogger(query);
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

    async function fetchWorkItems(parsedBarcode) {
        return fetchWorkItemsInternal(parsedBarcode, false);
    }

    async function applyResultPayload(resultPayload) {
        const barcode = String(
            resultPayload?.barcode ||
            resultPayload?.sampleId ||
            resultPayload?.patientId ||
            ""
        ).trim().toUpperCase();

        if (!barcode) {
            throw new Error("Analyzer payload does not contain barcode/sampleId/patientId.");
        }

        const parsedBarcode = parseBarcode(barcode);
        const { rows, distinctOrders } = await fetchWorkItemsInternal(parsedBarcode, true);

        logger("Applying analyzer results", JSON.stringify(parsedBarcode));

        if (distinctOrders.length !== 1) {
            throw new Error(`Analyzer identifier ${barcode} resolved to ${distinctOrders.length} orders.`);
        }

        const rowByAnalyzerCode = new Map();
        for (const row of rows) {
            const primary = String(row.analyzer_test_code || "").trim();
            const secondary = String(row.analyzer_test_code2 || "").trim();
            if (primary) rowByAnalyzerCode.set(primary, row);
            if (secondary) rowByAnalyzerCode.set(secondary, row);
        }

        const updated = [];
        const skipped = [];
        const batchQueries = [];

        for (const item of resultPayload.observations || []) {
            const observationId = String(
                item.observationId ||
                item.analyzerCode ||
                item.code ||
                ""
            ).trim();

            if (!observationId) {
                skipped.push("(missing-code)");
                continue;
            }

            const row = rowByAnalyzerCode.get(observationId);
            if (!row) {
                skipped.push(observationId);
                continue;
            }

            const observation = {
                observationId,
                value: item.value,
                valueType: item.valueType || "ST",
            };

            const sql = buildResultUpdateSql(row, observation);
            queryLogger(sql);
            batchQueries.push(sql);
            updated.push({
                kodvys: row.kodvys,
                analyzerCode: observationId,
                value: item.value,
                valueType: observation.valueType,
            });
        }

        if (!updated.length) {
            throw new Error(`Analyzer results did not match analyzer map for identifier ${barcode}.`);
        }

        const result = await executeQueriesInTransaction(batchQueries, dbConfig);
        if (result === undefined) {
            throw new Error(`Failed to update Sybase transactionally for identifier ${barcode}.`);
        }

        return { updated, skipped, barcode, parsedBarcode };
    }

    return {
        dbConfig,
        labCode,
        parseBarcode,
        fetchWorkItems,
        fetchWorkItemsInternal,
        applyResultPayload,
    };
}
