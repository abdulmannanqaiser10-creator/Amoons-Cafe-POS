const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const certPath = path.join(__dirname, "..", "qz", "digital-certificate.txt");
const keyPath = path.join(__dirname, "..", "qz", "private-key.pem");

function readCert() {
  if (process.env.QZ_CERTIFICATE) return process.env.QZ_CERTIFICATE;
  try {
    return fs.readFileSync(certPath, "utf8");
  } catch {
    return null;
  }
}

function readKey() {
  if (process.env.QZ_PRIVATE_KEY) return process.env.QZ_PRIVATE_KEY;
  try {
    return fs.readFileSync(keyPath, "utf8");
  } catch {
    return null;
  }
}

exports.getCertificate = (_req, res) => {
  const certificate = readCert();
  if (!certificate) {
    return res.status(404).type("text/plain").send("QZ certificate not configured");
  }
  res.type("text/plain").send(certificate);
};

exports.signRequest = (req, res) => {
  try {
    const toSign = String(req.body?.request ?? req.body?.toSign ?? "");
    const key = readKey();
    if (!toSign) {
      return res.status(400).json({ message: "Missing request to sign" });
    }
    if (!key) {
      return res.status(404).json({ message: "QZ private key not configured" });
    }

    const signer = crypto.createSign("SHA512");
    signer.update(toSign);
    signer.end();
    const signature = signer.sign(key, "base64");
    res.json({ signature });
  } catch (error) {
    console.error("[qz] sign failed:", error.message);
    res.status(500).json({ message: "Could not sign QZ request" });
  }
};
