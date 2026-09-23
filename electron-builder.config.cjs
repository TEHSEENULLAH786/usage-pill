// electron-builder configuration.
//
// A script rather than YAML because two things depend on what this machine
// has: whether there is a Developer ID certificate to sign with, and whether
// there are credentials to notarize with. Both are absent on a fresh clone, and
// the build has to work anyway.
//
//   no certificate   → scripts/adhoc-sign.cjs signs ad-hoc; macOS calls the
//                      download unverified, and Open Anyway gets past it.
//   certificate      → electron-builder signs for real.
//   + credentials    → and notarizes, after which downloads just open.
//
// Credentials come from the environment. Put them in .env.local, which git
// ignores, and `npm run dist` loads it:
//
//   APPLE_ID=you@example.com
//   APPLE_APP_SPECIFIC_PASSWORD=abcd-efgh-ijkl-mnop
//   APPLE_TEAM_ID=XXXXXXXXXX

const { execFileSync } = require("node:child_process");

/** Whether this Mac holds a Developer ID Application certificate. */
function hasDeveloperId() {
  try {
    const out = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf-8" });
    return /Developer ID Application/.test(out);
  } catch {
    return false;
  }
}

// Notarizing only matters for a download. A build you install yourself is
// never quarantined, so SKIP_NOTARIZE trades twenty minutes for a quick test.
const notarizeCredentials =
  !process.env.SKIP_NOTARIZE &&
  !!process.env.APPLE_ID &&
  !!process.env.APPLE_APP_SPECIFIC_PASSWORD &&
  !!process.env.APPLE_TEAM_ID;
const signed = hasDeveloperId();

if (!signed) {
  console.log("  • no Developer ID certificate: the app will be ad-hoc signed");
} else if (process.env.SKIP_NOTARIZE) {
  console.log("  • signing with Developer ID, not notarizing (SKIP_NOTARIZE) — for local testing only");
} else if (!notarizeCredentials) {
  console.log("  • signing with Developer ID, but not notarizing: no APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID");
} else {
  console.log("  • signing with Developer ID and notarizing");
}

module.exports = {
  appId: "com.usagepill.app",
  productName: "Usage Pill",
  electronVersion: "44.4.3",
  directories: { output: "dist" },
  // Both dmgs sit side by side, so each says which Mac it is for.
  artifactName: "${productName}-${version}-${arch}.${ext}",
  // Re-signs each bundle when there is no real identity; see the script.
  afterPack: "scripts/adhoc-sign.cjs",
  files: ["src/**", "assets/**", "package.json"],
  mac: {
    category: "public.app-category.developer-tools",
    // Drawn by scripts/app-icon.mjs; electron-builder makes the .icns from it.
    icon: "assets/icon.png",
    target: [
      { target: "dmg", arch: ["arm64", "x64"] },
      { target: "zip", arch: ["arm64", "x64"] },
    ],
    extendInfo: {
      LSUIElement: true, // menu bar app: no Dock icon
      NSUserNotificationAlertStyle: "alert",
    },
    // `null` tells electron-builder not to look for an identity at all, which
    // is right only when there isn't one.
    identity: signed ? undefined : null,
    hardenedRuntime: signed,
    gatekeeperAssess: false,
    notarize: signed && notarizeCredentials,
  },
  dmg: {
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: "link", path: "/Applications" },
    ],
  },
};
