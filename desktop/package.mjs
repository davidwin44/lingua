// Copies the built launcher to release/Lingua-Setup-<version>.exe and prints its SHA-256.
// Fails if the version in desktop/Cargo.toml or desktop/lingua.rc doesn't match package.json.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const cargo = readFileSync('desktop/Cargo.toml', 'utf8').match(/^version = "([^"]+)"/m)?.[1];
const rc = readFileSync('desktop/lingua.rc', 'utf8').match(/"ProductVersion", "([^"]+)"/)?.[1];
if (cargo !== version || rc !== version) {
  console.error(`Version mismatch: package.json ${version}, Cargo.toml ${cargo}, lingua.rc ${rc}`);
  process.exit(1);
}

mkdirSync('release', { recursive: true });
const out = `release/Lingua-Setup-${version}.exe`;
copyFileSync('desktop/target/release/lingua.exe', out);
const sha = createHash('sha256').update(readFileSync(out)).digest('hex');
console.log(`${out}\nSHA-256: ${sha}`);
