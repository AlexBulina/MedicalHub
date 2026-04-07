import { generateKeyPairSync } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const [, , targetDirArg] = process.argv;
const targetDir = path.resolve(process.cwd(), targetDirArg || "license");

await fs.mkdir(targetDir, { recursive: true });

const privateKeyPath = path.join(targetDir, "private.pem");
const publicKeyPath = path.join(targetDir, "license.public.pem");

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
        type: "spki",
        format: "pem"
    },
    privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
    }
});

await fs.writeFile(privateKeyPath, privateKey, "utf-8");
await fs.writeFile(publicKeyPath, publicKey, "utf-8");

console.log(`Private key: ${privateKeyPath}`);
console.log(`Public key: ${publicKeyPath}`);
