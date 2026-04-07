import { createVerify } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const WRITE_BLOCKED_STATUSES = new Set([
    "expired",
    "invalid",
    "missing",
    "instance_mismatch",
    "not_yet_valid"
]);

const DEFAULT_FEATURE_FLAGS = {
    customSms: true,
    resultDownloads: true,
    analysisRegistration: true
};

function stableStringify(value) {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map(item => stableStringify(item)).join(",")}]`;
    }

    const sortedKeys = Object.keys(value).sort();
    const serializedEntries = sortedKeys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${serializedEntries.join(",")}}`;
}

function normalizeIsoDate(dateValue) {
    if (!dateValue) {
        return null;
    }

    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) {
        throw new Error(`Некоректна дата в ліцензії: ${dateValue}`);
    }

    return parsedDate;
}

function getCurrentInstanceId() {
    return process.env.LICENSE_INSTANCE_ID || os.hostname();
}

function calculateStatus(license, now) {
    const validFrom = normalizeIsoDate(license.validFrom);
    const expiresAt = normalizeIsoDate(license.expiresAt);
    const graceUntil = normalizeIsoDate(license.graceUntil);

    if (!expiresAt) {
        return {
            status: "invalid",
            message: "У ліцензії відсутнє поле expiresAt."
        };
    }

    if (validFrom && now < validFrom) {
        return {
            status: "not_yet_valid",
            message: `Ліцензія ще не активна. Початок дії: ${license.validFrom}.`
        };
    }

    if (now <= expiresAt) {
        return {
            status: "active",
            message: `Ліцензія активна до ${license.expiresAt}.`
        };
    }

    if (graceUntil && now <= graceUntil) {
        return {
            status: "grace",
            message: `Термін дії ліцензії завершився ${license.expiresAt}, але пільговий період активний до ${license.graceUntil}.`
        };
    }

    return {
        status: "expired",
        message: `Ліцензія завершилася ${license.expiresAt}. Система працює лише в режимі читання.`
    };
}

function validateInstanceBinding(license) {
    const currentInstanceId = getCurrentInstanceId();
    const expectedInstanceId = license.instance?.instanceId;

    if (expectedInstanceId && expectedInstanceId !== currentInstanceId) {
        return {
            status: "instance_mismatch",
            message: `Ліцензія прив'язана до '${expectedInstanceId}', а поточний сервер ідентифікується як '${currentInstanceId}'.`
        };
    }

    return null;
}

async function safeReadJson(filePath) {
    const fileContents = await fs.readFile(filePath, "utf-8");
    return JSON.parse(fileContents);
}

function createBlockedResponse(statusSnapshot) {
    return {
        ok: false,
        licenseStatus: statusSnapshot.status,
        message: statusSnapshot.message,
        expiresAt: statusSnapshot.license?.expiresAt || null,
        graceUntil: statusSnapshot.license?.graceUntil || null,
        checkedAt: statusSnapshot.checkedAt
    };
}

function createFeatureBlockedResponse(featureName, statusSnapshot, message) {
    return {
        ok: false,
        feature: featureName,
        licenseStatus: statusSnapshot.status,
        message,
        checkedAt: statusSnapshot.checkedAt
    };
}

export function createLicenseManager({ baseDir, logger, cacheTtlMs = 30_000 } = {}) {
    const licenseFilePath = process.env.LICENSE_FILE_PATH
        ? path.resolve(baseDir || process.cwd(), process.env.LICENSE_FILE_PATH)
        : path.resolve(baseDir || process.cwd(), "license", "license.json");

    const publicKeyPath = process.env.LICENSE_PUBLIC_KEY_PATH
        ? path.resolve(baseDir || process.cwd(), process.env.LICENSE_PUBLIC_KEY_PATH)
        : path.resolve(baseDir || process.cwd(), "license", "license.public.pem");

    let cachedSnapshot = null;
    let cacheExpiresAt = 0;
    let cachedMtimeMs = null;

    function isLicenseOperational(snapshot) {
        return Boolean(snapshot) && !WRITE_BLOCKED_STATUSES.has(snapshot.status);
    }

    function getResolvedFeatureFlags(snapshot) {
        const licenseFeatures = snapshot?.license?.features || {};
        const resolvedFlags = {};

        for (const [featureName, defaultValue] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
            if (!isLicenseOperational(snapshot)) {
                resolvedFlags[featureName] = false;
                continue;
            }

            const featureValue = licenseFeatures[featureName];
            resolvedFlags[featureName] = featureValue === undefined ? defaultValue : featureValue !== false;
        }

        return resolvedFlags;
    }

    async function evaluateLicense({ forceRefresh = false } = {}) {
        const nowMs = Date.now();
        if (!forceRefresh && cachedSnapshot && nowMs < cacheExpiresAt) {
            return cachedSnapshot;
        }

        const checkedAt = new Date(nowMs).toISOString();

        try {
            const [licenseStat, publicKeyPem] = await Promise.all([
                fs.stat(licenseFilePath),
                fs.readFile(publicKeyPath, "utf-8")
            ]);

            if (!forceRefresh && cachedSnapshot && cachedMtimeMs === licenseStat.mtimeMs) {
                cacheExpiresAt = nowMs + cacheTtlMs;
                return cachedSnapshot;
            }

            const parsedLicenseFile = await safeReadJson(licenseFilePath);
            const license = parsedLicenseFile.license;
            const signature = parsedLicenseFile.signature;

            if (!license || typeof license !== "object") {
                throw new Error("Файл ліцензії не містить об'єкта license.");
            }

            if (!signature || typeof signature !== "string") {
                throw new Error("Файл ліцензії не містить підпису signature.");
            }

            const verifier = createVerify("RSA-SHA256");
            verifier.update(stableStringify(license));
            verifier.end();

            const isSignatureValid = verifier.verify(publicKeyPem, signature, "base64");
            if (!isSignatureValid) {
                cachedSnapshot = {
                    status: "invalid",
                    message: "Підпис ліцензії не пройшов перевірку.",
                    checkedAt,
                    license: null,
                    source: licenseFilePath,
                    isWriteAllowed: false
                };
            } else {
                const instanceValidation = validateInstanceBinding(license);
                const timelineStatus = calculateStatus(license, new Date(nowMs));
                const resolvedStatus = instanceValidation || timelineStatus;
                const writeEnabled = !WRITE_BLOCKED_STATUSES.has(resolvedStatus.status)
                    && license.features?.writeAccess !== false;

                cachedSnapshot = {
                    status: resolvedStatus.status,
                    message: resolvedStatus.message,
                    checkedAt,
                    license,
                    source: licenseFilePath,
                    isWriteAllowed: writeEnabled
                };
            }

            cachedMtimeMs = licenseStat.mtimeMs;
            cacheExpiresAt = nowMs + cacheTtlMs;
            return cachedSnapshot;
        } catch (error) {
            const missingFile = error?.code === "ENOENT";
            cachedSnapshot = {
                status: missingFile ? "missing" : "invalid",
                message: missingFile
                    ? "Файл ліцензії або публічний ключ не знайдено. Система працює лише в режимі читання."
                    : `Не вдалося перевірити ліцензію: ${error.message}`,
                checkedAt,
                license: null,
                source: licenseFilePath,
                isWriteAllowed: false
            };
            cachedMtimeMs = null;
            cacheExpiresAt = nowMs + cacheTtlMs;
            return cachedSnapshot;
        }
    }

    async function getPublicStatus() {
        const snapshot = await evaluateLicense();
        return {
            status: snapshot.status,
            message: snapshot.message,
            checkedAt: snapshot.checkedAt,
            licenseId: snapshot.license?.licenseId || null,
            customerName: snapshot.license?.customer?.name || null,
            issuedAt: snapshot.license?.issuedAt || null,
            validFrom: snapshot.license?.validFrom || null,
            expiresAt: snapshot.license?.expiresAt || null,
            graceUntil: snapshot.license?.graceUntil || null,
            features: snapshot.license?.features || {},
            resolvedFeatures: getResolvedFeatureFlags(snapshot)
        };
    }

    async function getFeatureFlags() {
        const snapshot = await evaluateLicense();
        return getResolvedFeatureFlags(snapshot);
    }

    async function evaluateFeatureAccess(featureName, {
        requireWriteAccess = false,
        disabledMessage = null
    } = {}) {
        const snapshot = await evaluateLicense();

        if (!isLicenseOperational(snapshot)) {
            return {
                allowed: false,
                statusCode: 423,
                snapshot,
                body: createBlockedResponse(snapshot)
            };
        }

        if (requireWriteAccess && !snapshot.isWriteAllowed) {
            return {
                allowed: false,
                statusCode: 423,
                snapshot,
                body: createBlockedResponse(snapshot)
            };
        }

        const featureFlags = getResolvedFeatureFlags(snapshot);
        if (!featureFlags[featureName]) {
            return {
                allowed: false,
                statusCode: 403,
                snapshot,
                body: createFeatureBlockedResponse(
                    featureName,
                    snapshot,
                    disabledMessage || `Функція '${featureName}' вимкнена поточною ліцензією.`
                )
            };
        }

        return {
            allowed: true,
            statusCode: 200,
            snapshot,
            body: null
        };
    }

    async function enforceWriteAccess(req, res, next) {
        const snapshot = await evaluateLicense();
        req.license = snapshot;
        res.setHeader("X-License-Status", snapshot.status);

        if (snapshot.status === "grace") {
            res.setHeader("X-License-Warning", snapshot.message);
        }

        if (!snapshot.isWriteAllowed) {
            if (logger?.warn) {
                logger.warn(`Заблоковано write-запит ${req.method} ${req.originalUrl}: ${snapshot.message}`);
            }

            return res.status(423).json(createBlockedResponse(snapshot));
        }

        return next();
    }

    function enforceFeature(featureName, options = {}) {
        return async (req, res, next) => {
            const access = await evaluateFeatureAccess(featureName, options);
            req.license = access.snapshot;
            res.setHeader("X-License-Status", access.snapshot.status);

            if (!access.allowed) {
                if (logger?.warn) {
                    logger.warn(
                        `Заблоковано доступ до функції '${featureName}' для ${req.method} ${req.originalUrl}: ${access.body.message}`
                    );
                }

                return res.status(access.statusCode).json(access.body);
            }

            return next();
        };
    }

    return {
        evaluateLicense,
        getPublicStatus,
        getFeatureFlags,
        evaluateFeatureAccess,
        enforceWriteAccess,
        enforceFeature
    };
}

export { stableStringify };
