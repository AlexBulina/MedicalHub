import "dotenv/config";
import { pathToFileURL } from "node:url";
import BRANCHES from "./branches_config.js";
import { executeQuery } from "./database_repository.js";

const BRANCH_KEY = process.env.BS240_BRANCH || "ad";
const ANALYZER_KODZAR = process.env.BS240_KODZAR?.trim() || "";
const ANALYZER_PRACLISTID = process.env.BS240_PRACLISTID?.trim() || "BS240";
const SEARCH_DAYS = Number(process.env.BS240_LOOKBACK_DAYS || 490);

const branch = BRANCHES[BRANCH_KEY];

if (!branch?.db) {
    throw new Error(`Unknown BS240 branch "${BRANCH_KEY}". Check BS240_BRANCH.`);
}

if (branch.db.type && branch.db.type !== "sybase") {
    throw new Error(`BS240 reset requires a Sybase branch. "${BRANCH_KEY}" uses ${branch.db.type}.`);
}

const dbConfig = branch.db;
const labCode = process.env.BS240_KODLAB || branch.LabCode || "00001";

function log(message, extra = "") {
    console.log(`[BS240-RESET] ${message}${extra ? ` ${extra}` : ""}`);
}

function escapeSql(value) {
    return String(value ?? "").replace(/'/g, "''");
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
        `z.datodberu >= DATEADD(day, -${Number.isFinite(SEARCH_DAYS) ? SEARCH_DAYS : 90}, CURRENT DATE)`,
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

async function findMatchingRows(parsedBarcode) {
    const query = `
        SELECT
            z.datevidcis,
            z.evidcis,
            z.typziad,
            z.datodberu,
            p.kodvys,
            v.nazov,
            v.priradenie,
            pl.kodzar,
            pl.praclistid,
            pv.kodvyszar1 AS analyzer_test_code
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
        WHERE ${buildBarcodeWhereClause(parsedBarcode)}
        ORDER BY z.datevidcis DESC, z.datodberu DESC, p.kodvys ASC
    `;

    const rows = await executeQuery(query, dbConfig);
    if (!rows) {
        throw new Error("Query to Sybase returned undefined.");
    }

    return { rows, query };
}

function buildResetSql(row) {
    const escapedDate = escapeSql(row.datevidcis);

    return `
        UPDATE nis.ziad_okb_pom
        SET
            stavvys = 1,
            oscisvys = NULL,
            datumvys = NULL,
            oscispotvr = NULL,
            datumpotvrd = NULL,
            vysledoknum = NULL,
            vysledoktext = NULL,
            koncentracia = NULL
        WHERE datevidcis = '${escapedDate}'
          AND evidcis = ${row.evidcis}
          AND kodlab = '${escapeSql(labCode)}'
          AND kodvys = ${row.kodvys};

        UPDATE nis.ziad_okb_pra_pom
        SET
            stavvys = 1,
            oscisvys = NULL,
            datumvys = NULL,
            oscispotvr = NULL,
            datumpotvrd = NULL,
            vysledoknum = NULL,
            vysledoktext = NULL,
            vysledokstary = NULL,
            koncentracia = NULL
        WHERE datevidcis = '${escapedDate}'
          AND evidcis = ${row.evidcis}
          AND kodlab = '${escapeSql(labCode)}'
          AND kodvys = ${row.kodvys};
    `;
}

async function resetBarcode(barcode) {
    const parsedBarcode = parseBarcode(barcode);
    log("Parsed barcode", JSON.stringify(parsedBarcode));

    const { rows, query } = await findMatchingRows(parsedBarcode);
    log("Search query");
    console.log(query.trim());

    if (!rows.length) {
        log("No matching analyzer rows found", parsedBarcode.raw);
        return;
    }

    const orderKeys = new Set(rows.map((row) => `${row.datevidcis}|${row.evidcis}|${row.typziad}`));
    log("Matched orders", `${orderKeys.size}`);
    log("Matched tests", `${rows.length}`);

    for (const row of rows) {
        log(
            "Resetting test",
            `${row.datevidcis} evidcis=${row.evidcis} kodvys=${row.kodvys} analyzer=${row.analyzer_test_code || ""}`
        );
        const sql = buildResetSql(row);
        console.log(sql.trim());
        const result = await executeQuery(sql, dbConfig);
        if (result === undefined) {
            throw new Error(`Failed to reset kodvys ${row.kodvys}.`);
        }
    }

    log("Reset complete", `${parsedBarcode.raw} -> ${rows.length} test(s) back to pending`);
}

async function main() {
    const barcode = process.argv[2];
    if (!barcode) {
        console.error("Usage: npm run bs240-reset -- <BARCODE>");
        process.exitCode = 1;
        return;
    }

    try {
        await resetBarcode(barcode);
    } catch (error) {
        console.error("[BS240-RESET] Failed:", error.message);
        process.exitCode = 1;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
