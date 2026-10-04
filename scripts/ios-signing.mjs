#!/usr/bin/env node
/**
 * CI helper for the TestFlight job (.github/workflows/ios.yml): switches the
 * App target's Release configuration to manual signing with the given team
 * and provisioning profile. Only the app target is touched — passing these as
 * xcodebuild command-line settings would also apply them to the Swift package
 * targets, which can't take a provisioning profile.
 *
 *   node scripts/ios-signing.mjs --team ABCDE12345 --profile "OVERRUN App Store" [--identity "Apple Distribution"]
 *
 * Local projects stay on automatic signing; don't commit the result.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const team = arg('team');
const profile = arg('profile');
const identity = arg('identity', 'Apple Distribution');
const config = arg('config', 'Release');
const PBX = path.resolve(ROOT, arg('pbxproj', 'ios/App/App.xcodeproj/project.pbxproj'));
if (!team || !profile) {
  console.error('usage: node scripts/ios-signing.mjs --team <TEAM_ID> --profile <profile name> [--identity "Apple Distribution"]');
  process.exit(1);
}

const q = (v) => (/^[A-Za-z0-9_.\/-]+$/.test(v) ? v : `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);

let src = fs.readFileSync(PBX, 'utf8');
let patched = 0;
// XCBuildConfiguration blocks: "<id> /* Release */ = { isa = XCBuildConfiguration; ... buildSettings = { ... }; name = Release; };"
src = src.replace(
  /(\t\t[0-9A-F]{24} \/\* (\w+) \*\/ = \{\n\t\t\tisa = XCBuildConfiguration;\n(?:\t\t\t[^\n]*\n)*?\t\t\tbuildSettings = \{\n)([\s\S]*?)(\n\t\t\t\};\n\t\t\tname = \w+;\n\t\t\};)/g,
  (block, head, name, body, tail) => {
    if (name !== config || !/PRODUCT_BUNDLE_IDENTIFIER/.test(body)) return block;
    const settings = {
      CODE_SIGN_STYLE: 'Manual',
      DEVELOPMENT_TEAM: team,
      PROVISIONING_PROFILE_SPECIFIER: profile,
      '"CODE_SIGN_IDENTITY[sdk=iphoneos*]"': identity,
    };
    let lines = body.split('\n').filter((l) => {
      const key = l.trim().split(' = ')[0];
      return !(key in settings) && key !== 'CODE_SIGN_IDENTITY' && key !== 'PROVISIONING_PROFILE';
    });
    for (const [k, v] of Object.entries(settings)) lines.push(`\t\t\t\t${k} = ${q(v)};`);
    lines = lines.filter((l) => l.trim());
    patched++;
    return head + lines.join('\n') + tail;
  },
);
if (patched !== 1) {
  console.error(`expected to patch exactly one ${config} configuration of the App target, patched ${patched}`);
  process.exit(1);
}
fs.writeFileSync(PBX, src);
console.log(`[ios-signing] App/${config}: manual signing, team ${team}, profile "${profile}", identity "${identity}"`);
