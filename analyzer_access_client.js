import axios from "axios";

const DEFAULT_ACCESS_CACHE_TTL_MS = 30_000;
const ALLOWED_RESPONSE_STATUSES = new Set([200, 401, 403, 423]);

function normalizeTtlMs(value) {
    const ttlMs = Number(value);
    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
        return DEFAULT_ACCESS_CACHE_TTL_MS;
    }

    return ttlMs;
}

function createProtocolError(serverUrl) {
    return new Error(
        `Endpoint ${serverUrl} did not return a valid HTTP response. Check that MedicalHub is running on this port and that the port is not occupied by another service.`
    );
}

function buildAccessUrl(serverUrl) {
    const accessUrl = new URL(serverUrl);
    accessUrl.pathname = "/api/analyzer/access";
    accessUrl.search = "";
    accessUrl.hash = "";
    return accessUrl.toString();
}

function buildHeaders(token) {
    const headers = {};
    if (String(token || "").trim()) {
        headers["x-analyzer-token"] = String(token).trim();
    }

    return headers;
}

function normalizeAccessResponse(statusCode, responseBody = {}) {
    const allowed = statusCode === 200 && responseBody.allowed !== false;
    const deniedCapabilities = { ingest: false, query: false };

    return {
        ok: allowed ? responseBody.ok !== false : false,
        allowed,
        statusCode,
        feature: responseBody.feature || "analyzerIntegration",
        licenseStatus: responseBody.licenseStatus || null,
        message: responseBody.message || "",
        checkedAt: responseBody.checkedAt || null,
        capabilities: responseBody.capabilities || (allowed ? { ingest: true, query: true } : deniedCapabilities),
    };
}

export function createAnalyzerAccessClient({
    serverUrl,
    token,
    ttlMs = process.env.ANALYZER_ACCESS_CACHE_TTL_MS,
    logger = null,
} = {}) {
    if (!String(serverUrl || "").trim()) {
        throw new Error("Analyzer server URL is not configured.");
    }

    const accessUrl = buildAccessUrl(serverUrl);
    const cacheTtlMs = normalizeTtlMs(ttlMs);
    let cachedAccess = null;
    let cacheExpiresAt = 0;

    function log(message, extra = "") {
        if (typeof logger === "function") {
            logger(message, extra);
        }
    }

    async function getAccess({ forceRefresh = false } = {}) {
        const nowMs = Date.now();
        if (!forceRefresh && cachedAccess && nowMs < cacheExpiresAt) {
            return cachedAccess;
        }

        let response;
        try {
            response = await axios.get(accessUrl, {
                headers: buildHeaders(token),
                timeout: 30000,
                validateStatus: () => true,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("Expected HTTP/") || message.includes("protocol violation")) {
                throw createProtocolError(accessUrl);
            }

            throw error;
        }

        if (!ALLOWED_RESPONSE_STATUSES.has(response.status)) {
            throw new Error(`Analyzer access check failed with status ${response.status}.`);
        }

        const normalized = normalizeAccessResponse(response.status, response.data || {});
        if (response.status === 401) {
            throw new Error(normalized.message || "Unauthorized analyzer bridge request.");
        }

        cachedAccess = normalized;
        cacheExpiresAt = nowMs + cacheTtlMs;

        if (!normalized.allowed) {
            log("Analyzer access blocked", `${normalized.statusCode} ${normalized.message}`.trim());
        }

        return normalized;
    }

    function clearCache() {
        cachedAccess = null;
        cacheExpiresAt = 0;
    }

    return {
        accessUrl,
        getAccess,
        clearCache,
    };
}
