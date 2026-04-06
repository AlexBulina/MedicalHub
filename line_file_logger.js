import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

function pad2(value) {
    return String(value).padStart(2, "0");
}

function formatDateStamp(date = new Date()) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatTimestamp(date = new Date()) {
    return [
        date.getFullYear(),
        pad2(date.getMonth() + 1),
        pad2(date.getDate()),
    ].join("-") + " " + [
        pad2(date.getHours()),
        pad2(date.getMinutes()),
        pad2(date.getSeconds()),
    ].join(":");
}

function normalizeBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }
    return String(value).trim().toLowerCase() === "true";
}

export function createLineFileLogger(options = {}) {
    const {
        enabled = false,
        baseDir = process.cwd(),
        logDir = "logs",
        fileName = "",
        prefix = "APP",
        alsoConsole = true,
    } = options;

    const isEnabled = normalizeBoolean(enabled, false);
    const resolvedLogDir = path.isAbsolute(logDir) ? logDir : path.join(baseDir, logDir);
    const resolvedFileName = fileName || `${String(prefix || "app").toLowerCase()}-${formatDateStamp()}.log`;
    const resolvedPath = path.join(resolvedLogDir, resolvedFileName);

    if (isEnabled) {
        mkdirSync(resolvedLogDir, { recursive: true });
    }

    function write(level, message, extra = "") {
        const line = `[${formatTimestamp()}] [${String(prefix || "APP").toUpperCase()}] [${level}] ${message}${extra ? ` ${extra}` : ""}`;

        if (alsoConsole) {
            console.log(line);
        }

        if (isEnabled) {
            appendFileSync(resolvedPath, `${line}\n`, "utf8");
        }
    }

    return {
        path: resolvedPath,
        enabled: isEnabled,
        info: (message, extra = "") => write("INFO", message, extra),
        warn: (message, extra = "") => write("WARN", message, extra),
        error: (message, extra = "") => write("ERROR", message, extra),
    };
}
