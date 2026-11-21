"use strict";

const { execFileSync } = require("child_process");

try {
  execFileSync("schtasks", ["/Delete", "/TN", "AmoonsPrintAgent", "/F"], {
    stdio: "inherit",
  });
  console.log("Removed Windows scheduled task AmoonsPrintAgent.");
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
