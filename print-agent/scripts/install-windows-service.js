/**
 * Registers the print agent to start automatically with Windows via Task Scheduler.
 * Run from an elevated PowerShell/CMD: node scripts/install-windows-service.js
 */
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const server = path.join(root, "server.js");
const taskName = "AmoonsPrintAgent";
const nodePath = process.execPath;
const startBat = path.join(root, "start-agent.cmd");

const bat = `@echo off
cd /d "${root}"
"${nodePath}" "${server}"
`;

fs.writeFileSync(startBat, bat, "utf8");

try {
  execFileSync(
    "schtasks",
    ["/Delete", "/TN", taskName, "/F"],
    { stdio: "ignore" }
  );
} catch {
  /* task may not exist */
}

execFileSync(
  "schtasks",
  [
    "/Create",
    "/TN",
    taskName,
    "/TR",
    `"${startBat}"`,
    "/SC",
    "ONLOGON",
    "/RL",
    "HIGHEST",
    "/F",
  ],
  { stdio: "inherit" }
);

console.log(`Installed Windows scheduled task "${taskName}" (starts on logon).`);
console.log(`Agent entry: ${startBat}`);
console.log("Start now with: npm start");
