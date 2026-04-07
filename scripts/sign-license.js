import { createSign } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { stableStringify } from "../license/licenseService.js";

const [, , payloadPathArg, privateKeyPathArg, outputPathArg] = process.argv;

if (!payloadPathArg || !privateKeyPathArg || !outputPathArg) {
    console.error("Usage: node scripts/sign-license.js <payload.json> <private-key.pem> <output-license.json>");
    process.exit(1);
}

const payloadPath = path.resolve(process.cwd(), payloadPathArg);
const privateKeyPath = path.resolve(process.cwd(), privateKeyPathArg);
const outputPath = path.resolve(process.cwd(), outputPathArg);

const payload = JSON.parse(await fs.readFile(payloadPath, "utf-8"));
const privateKeyPem = await fs.readFile(privateKeyPath, "utf-8");

const signer = createSign("RSA-SHA256");
signer.update(stableStringify(payload));
signer.end();

const signature = signer.sign(privateKeyPem, "base64");
const signedLicense = {
    license: payload,
    signature
};

await fs.writeFile(outputPath, `${JSON.stringify(signedLicense, null, 2)}\n`, "utf-8");
console.log(`Signed license written to ${outputPath}`);
