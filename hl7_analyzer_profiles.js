import "dotenv/config";

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toProfileKeyValueMap(rawEntry) {
    const map = {};

    for (const pair of String(rawEntry || "").split(",")) {
        const [rawKey, ...rawValueParts] = pair.split("=");
        const key = String(rawKey || "").trim();
        const value = rawValueParts.join("=").trim();
        if (!key) {
            continue;
        }
        map[key] = value;
    }

    return map;
}

function buildDefaultProfile() {
    const name =
        process.env.BS240_SERVER_LABEL ||
        process.env.BS240_PRACLISTID ||
        process.env.BS240_KODZAR ||
        "BS240";

    return {
        name,
        host: process.env.BS240_HL7_HOST || "0.0.0.0",
        port: toNumber(process.env.BS240_HL7_PORT, 4001),
        branch: process.env.BS240_BRANCH || "ad",
        kodlab: process.env.BS240_KODLAB || "",
        praclistid: process.env.BS240_PRACLISTID || "",
        kodzar: process.env.BS240_KODZAR || "",
        searchDays: toNumber(process.env.BS240_LOOKBACK_DAYS, 90),
    };
}

function normalizeProfile(rawProfile, fallbackProfile, index) {
    const profile = {
        name: rawProfile.name || rawProfile.praclistid || rawProfile.kodzar || `Analyzer${index + 1}`,
        host: rawProfile.host || fallbackProfile.host,
        port: toNumber(rawProfile.port, fallbackProfile.port + index),
        branch: rawProfile.branch || fallbackProfile.branch,
        kodlab: rawProfile.kodlab || fallbackProfile.kodlab,
        praclistid: rawProfile.praclistid || "",
        kodzar: rawProfile.kodzar || "",
        searchDays: toNumber(rawProfile.searchDays, fallbackProfile.searchDays),
    };

    if (!profile.praclistid && !profile.kodzar) {
        profile.praclistid = profile.name;
    }

    return profile;
}

function parseProfilesFromEnv(rawValue, fallbackProfile) {
    const trimmed = String(rawValue || "").trim();
    if (!trimmed) {
        return [];
    }

    if (trimmed.startsWith("[")) {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
            throw new Error("BS240_ANALYZER_PROFILES_JSON must be a JSON array.");
        }
        return parsed.map((profile, index) => normalizeProfile(profile || {}, fallbackProfile, index));
    }

    return trimmed
        .split(";")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry, index) => normalizeProfile(toProfileKeyValueMap(entry), fallbackProfile, index));
}

const fallbackProfile = buildDefaultProfile();
const parsedProfiles = parseProfilesFromEnv(process.env.BS240_ANALYZER_PROFILES, fallbackProfile);

const analyzerProfiles = parsedProfiles.length ? parsedProfiles : [fallbackProfile];

export default analyzerProfiles;
