// Re-signs the packaged app before the dmg is built.
//
// Without a Developer ID, electron-builder leaves the bundle carrying the
// signature Electron itself shipped with. Our files change the bundle, so that
// signature no longer matches, and macOS reports the download as "damaged and
// can't be opened" rather than as merely unverified.
//
// An ad-hoc signature (`-`) costs nothing and makes the bundle internally
// consistent. The app is still unsigned as far as Apple is concerned, so a
// download still has to be allowed once under Privacy & Security, but it is no
// longer broken. Notarizing, which removes the prompt entirely, needs a paid
// Apple Developer account.

const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  // --deep is the pragmatic way to cover the helpers and the framework in one
  // pass; it is only deprecated for real identities, not for ad-hoc.
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
  console.log(`  • ad-hoc signed    ${path.basename(app)} (${context.arch === 1 ? "x64" : "arm64"})`);
};
