import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { canonicalJson } from "./canonical.mjs";

export function generateNodeKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateDer: privateKey.export({ type: "pkcs8", format: "der" }),
    publicDer: publicKey.export({ type: "spki", format: "der" }),
    publicB64: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateB64: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

export function publicKeyFromB64(b64) {
  const der = Buffer.from(b64, "base64");
  return createPublicKey({ key: der, type: "spki", format: "der" });
}

export function privateKeyFromB64(b64) {
  const der = Buffer.from(b64, "base64");
  return createPrivateKey({ key: der, type: "pkcs8", format: "der" });
}

export function sha256hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function signRow(row, privateKey) {
  const bytes = Buffer.from(canonicalJson(row), "utf8");
  const sig = cryptoSign(null, bytes, privateKey);
  return sig.toString("base64");
}

export function verifyRow(row, publicKey, signatureB64) {
  if (!signatureB64) return false;
  try {
    const bytes = Buffer.from(canonicalJson(row), "utf8");
    const sig = Buffer.from(signatureB64, "base64");
    return cryptoVerify(null, bytes, publicKey, sig);
  } catch {
    return false;
  }
}

export function fingerprint(publicB64) {
  const hex = sha256hex(Buffer.from(publicB64, "base64"));
  return hex.slice(0, 8) + " " + hex.slice(8, 16) + " " + hex.slice(16, 24);
}
