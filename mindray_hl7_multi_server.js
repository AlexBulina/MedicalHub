import "dotenv/config";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import analyzerProfiles from "./hl7_analyzer_profiles.js";

const workers = [];

function log(message, extra = "") {
    console.log(`[HL7-MULTI] ${message}${extra ? ` ${extra}` : ""}`);
}

function buildWorkerEnv(profile) {
    const env = { ...process.env };

    env.BS240_SERVER_LABEL = profile.name;
    env.BS240_HL7_HOST = profile.host;
    env.BS240_HL7_PORT = String(profile.port);
    env.BS240_BRANCH = profile.branch;
    env.BS240_KODLAB = profile.kodlab;
    env.BS240_LOOKBACK_DAYS = String(profile.searchDays);
    env.BS240_PRACLISTID = profile.praclistid || "";
    env.BS240_KODZAR = profile.kodzar || "";

    return env;
}

function prefixOutput(profile, chunk, streamName) {
    const text = String(chunk || "");
    for (const line of text.split(/\r?\n/)) {
        if (!line) {
            continue;
        }
        console.log(`[HL7-MULTI:${profile.name}:${profile.port}:${streamName}] ${line}`);
    }
}

function startProfileWorker(profile) {
    log(
        "Starting analyzer worker",
        `${profile.name} port=${profile.port} branch=${profile.branch} praclistid=${profile.praclistid || "-"} kodzar=${profile.kodzar || "-"}`
    );

    const child = spawn(process.execPath, ["mindray_bs240_hl7_server.js"], {
        cwd: process.cwd(),
        env: buildWorkerEnv(profile),
        stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => prefixOutput(profile, chunk, "OUT"));
    child.stderr.on("data", (chunk) => prefixOutput(profile, chunk, "ERR"));

    child.on("exit", (code, signal) => {
        log("Analyzer worker stopped", `${profile.name} port=${profile.port} code=${code ?? "null"} signal=${signal ?? "null"}`);
    });

    workers.push({ profile, child });
}

function stopAllWorkers() {
    for (const { child } of workers) {
        if (!child.killed) {
            child.kill("SIGTERM");
        }
    }
}

export function startMultiAnalyzerServers() {
    const usedPorts = new Set();

    for (const profile of analyzerProfiles) {
        if (usedPorts.has(profile.port)) {
            throw new Error(`Duplicate HL7 port in analyzer profiles: ${profile.port}`);
        }
        usedPorts.add(profile.port);
        startProfileWorker(profile);
    }

    log("All analyzer workers started", `${analyzerProfiles.length} profile(s)`);
}

process.on("SIGINT", () => {
    log("SIGINT received, stopping workers");
    stopAllWorkers();
    process.exit(0);
});

process.on("SIGTERM", () => {
    log("SIGTERM received, stopping workers");
    stopAllWorkers();
    process.exit(0);
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startMultiAnalyzerServers();
}
