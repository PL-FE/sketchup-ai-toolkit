import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createSetupPlan, installPlugin, mcpConfiguration, parseArguments,
  pluginsDirectory, runSetup, LEGAL_FILES,
} from '../scripts/setup.mjs';
import { crc32, packagePlugin, storedZip } from '../scripts/package-plugin.mjs';
import { assertLocalImportsIncluded, packageSource, sourceEntries } from '../scripts/package-source.mjs';
import { installSkills, runInstallSkills, skillInstallPlan } from '../scripts/install-skills.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sketchup-toolkit-setup-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const projectRoot = path.join(directory, 'project with spaces');
  const registry = { schema_version: 1, profiles: { 2020: { sketchup_major: 20, validation: 'pending-host-test' }, 2026: { sketchup_major: 26, validation: 'pending-host-test' } } };
  const write = (relative, content) => {
    const destination = path.join(projectRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  };
  write('config/sketchup-versions.json', JSON.stringify(registry));
  write('sketchup_plugin/alma_sketchup_mcp.rb', '# new loader\n');
  write('sketchup_plugin/alma_sketchup_mcp/bridge.rb', '# new bridge\n');
  write('sketchup_plugin/alma_sketchup_mcp/sketchup-versions.json', '{"stale":true}');
  write('src/mcp-server.mjs', 'export const ready = true;\n');
  write('package.json', '{"type":"module"}');
  write('package-lock.json', '{"lockfileVersion":3}');
  write('skills/sketchup-ai-modeling/SKILL.md', '---\nname: sketchup-ai-modeling\n---\nNew skill.\n');
  write('skills/sketchup-ai-modeling/agents/openai.yaml', 'display_name: SketchUp AI\n');
  for (const name of LEGAL_FILES) write(name, `Notice ${name}\n`);
  return { directory, projectRoot, registry, write, pluginsDir: path.join(directory, 'custom Plugins'), skillsDir: path.join(directory, 'client Skills') };
}

// Read a ZIP's records independently of the writer to check its format and payloads.
function unzipStored(bytes) {
  const files = new Map();
  const localOffsets = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0);
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    files.set(name, bytes.subarray(start, start + size));
    localOffsets.set(name, offset);
    offset = start + size;
  }
  const centralStart = offset;
  let centralCount = 0;
  while (bytes.readUInt32LE(offset) === 0x02014b50) {
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    assert.equal(bytes.readUInt32LE(offset + 42), localOffsets.get(name));
    assert.equal(bytes.readUInt32LE(offset + 24), files.get(name).length);
    centralCount += 1;
    offset += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x06054b50);
  assert.equal(bytes.readUInt16LE(offset + 10), files.size);
  assert.equal(centralCount, files.size);
  assert.equal(bytes.readUInt32LE(offset + 16), centralStart);
  assert.equal(bytes.readUInt32LE(offset + 12), offset - centralStart);
  assert.equal(offset + 22, bytes.length);
  return files;
}

test('native installation paths calculate macOS and Windows independently of the test host', () => {
  assert.equal(pluginsDirectory('2020', { platform: 'darwin', homeDirectory: '/Users/test user' }), '/Users/test user/Library/Application Support/SketchUp 2020/SketchUp/Plugins');
  assert.equal(pluginsDirectory('2026', { platform: 'win32', env: { APPDATA: 'C:\\Users\\Test User\\AppData\\Roaming' } }), 'C:\\Users\\Test User\\AppData\\Roaming\\SketchUp\\SketchUp 2026\\SketchUp\\Plugins');
  assert.throws(() => pluginsDirectory('2020', { platform: 'win32', env: {} }), /APPDATA/);
  assert.throws(() => pluginsDirectory('2020', { platform: 'linux' }), /--plugins-dir/);
});

test('default dry run is read only and permits an explicit not-yet-created target', t => {
  const f = fixture(t);
  const log = [];
  const result = runSetup(['--year', '2020', '--plugins-dir', f.pluginsDir], { projectRoot: f.projectRoot, log: text => log.push(text) });
  assert.equal(result.installation, null);
  assert.equal(fs.existsSync(f.pluginsDir), false);
  assert.equal(fs.readFileSync(path.join(f.projectRoot, 'sketchup_plugin/alma_sketchup_mcp/sketchup-versions.json'), 'utf8'), '{"stale":true}');
  assert.match(log.join('\n'), /DRY RUN/);
  assert.equal(result.plan.year, '2020');
});

test('unknown years and missing native installation directories are refused', t => {
  const f = fixture(t);
  assert.throws(() => createSetupPlan({ year: '2021', pluginsDir: f.pluginsDir }, f), /Unsupported SketchUp year/);
  assert.throws(() => createSetupPlan({ year: '../2020', pluginsDir: f.pluginsDir }, f), /Unsupported SketchUp year/);
  assert.throws(() => createSetupPlan({ year: '2020' }, { ...f, platform: 'darwin', homeDirectory: f.directory }), /does not exist/);
  fs.writeFileSync(f.pluginsDir, 'not a directory');
  assert.throws(() => createSetupPlan({ year: '2020', pluginsDir: f.pluginsDir }, f), /not a directory/);
});

test('config-only works without SketchUp or plugin sources and emits parseable JSON', t => {
  const f = fixture(t);
  fs.rmSync(path.join(f.projectRoot, 'sketchup_plugin'), { recursive: true });
  const log = [];
  const result = runSetup(['--year', '2020', '--config-only', '--format', 'json'], { ...f, platform: 'linux', log: text => log.push(text) });
  const output = JSON.parse(log.join('\n'));
  const server = output.mcpServers['sketchup-2020'];
  assert.equal(server.command, process.execPath);
  assert.equal(server.args[0], path.join(f.projectRoot, 'src', 'mcp-server.mjs'));
  assert.deepEqual(server.env, { ALMA_SKETCHUP_YEAR: '2020', ALMA_SKETCHUP_AGENT_ALLOWED_RUNTIMES: 'mock,queue', ALMA_SKETCHUP_AGENT_ALLOW_QUEUE_MUTATION: '1' });
  assert.equal(result.plan, null);
  assert.equal(fs.existsSync(f.pluginsDir), false);
});

test('TOML configuration escapes paths and carries exactly the JSON environment', t => {
  const f = fixture(t);
  const configuration = mcpConfiguration('2026', { projectRoot: f.projectRoot, executable: 'C:\\Program Files\\nodejs\\node.exe' });
  const lines = configuration.toml.split('\n');
  assert.equal(JSON.parse(lines.find(line => line.startsWith('command = ')).slice(10)), configuration.json.mcpServers['sketchup-2026'].command);
  assert.deepEqual(JSON.parse(lines.find(line => line.startsWith('args = ')).slice(7)), configuration.json.mcpServers['sketchup-2026'].args);
  for (const [key, value] of Object.entries(configuration.json.mcpServers['sketchup-2026'].env)) {
    assert.equal(JSON.parse(lines.find(line => line.startsWith(`${key} = `)).slice(key.length + 3)), value);
  }
  const output = [];
  runSetup(['--year', '2026', '--config-only', '--format', 'toml'], { ...f, log: line => output.push(line) });
  assert.match(output.join('\n'), /^\[mcp_servers.sketchup-2026\]/);
});

test('explicit installation copies registry and license notices without touching unrelated plugins', t => {
  const f = fixture(t);
  fs.mkdirSync(f.pluginsDir);
  fs.writeFileSync(path.join(f.pluginsDir, 'unrelated.rb'), '# keep');
  const output = [];
  const { installation } = runSetup(['--year', '2020', '--plugins-dir', f.pluginsDir, '--install'], { ...f, log: line => output.push(line) });
  assert.equal(installation.backupDirectory, null);
  assert.equal(fs.readFileSync(path.join(f.pluginsDir, 'alma_sketchup_mcp.rb'), 'utf8'), '# new loader\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.pluginsDir, 'alma_sketchup_mcp/sketchup-versions.json'), 'utf8')), f.registry);
  for (const name of LEGAL_FILES) assert.equal(fs.readFileSync(path.join(f.pluginsDir, 'alma_sketchup_mcp', name), 'utf8'), `Notice ${name}\n`);
  assert.equal(fs.readFileSync(path.join(f.pluginsDir, 'unrelated.rb'), 'utf8'), '# keep');
  assert.equal(fs.readdirSync(f.pluginsDir).some(name => name.includes('staging')), false);
  assert.match(output.join('\n'), /Installed:/);
});

test('existing plugins receive unique complete backups and stale files are removed only from the replacement', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.pluginsDir, 'alma_sketchup_mcp'), { recursive: true });
  fs.writeFileSync(path.join(f.pluginsDir, 'alma_sketchup_mcp.rb'), '# old loader');
  fs.writeFileSync(path.join(f.pluginsDir, 'alma_sketchup_mcp/old.rb'), '# old module');
  const plan = createSetupPlan({ year: '2020', pluginsDir: f.pluginsDir }, f);
  const first = installPlugin(plan);
  assert.match(path.basename(first.backupDirectory), /^\.alma-sketchup-mcp-backup-\d{4}-/);
  assert.equal(fs.readFileSync(path.join(first.backupDirectory, 'alma_sketchup_mcp.rb'), 'utf8'), '# old loader');
  assert.equal(fs.readFileSync(path.join(first.backupDirectory, 'alma_sketchup_mcp/old.rb'), 'utf8'), '# old module');
  assert.equal(fs.existsSync(path.join(f.pluginsDir, 'alma_sketchup_mcp/old.rb')), false);
  const second = installPlugin(plan);
  assert.notEqual(first.backupDirectory, second.backupDirectory);
  assert.ok(fs.existsSync(first.backupDirectory));
});

test('an interrupted replacement restores the complete previous plugin', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.pluginsDir, 'alma_sketchup_mcp'), { recursive: true });
  fs.writeFileSync(path.join(f.pluginsDir, 'alma_sketchup_mcp.rb'), '# old loader');
  fs.writeFileSync(path.join(f.pluginsDir, 'alma_sketchup_mcp/old.rb'), '# old module');
  const originalRename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (path.basename(to) === 'alma_sketchup_mcp') throw new Error('simulated destination error');
    return originalRename(from, to);
  });
  assert.throws(() => installPlugin(createSetupPlan({ year: '2020', pluginsDir: f.pluginsDir }, f)), /simulated destination error/);
  assert.equal(fs.readFileSync(path.join(f.pluginsDir, 'alma_sketchup_mcp.rb'), 'utf8'), '# old loader');
  assert.equal(fs.readFileSync(path.join(f.pluginsDir, 'alma_sketchup_mcp/old.rb'), 'utf8'), '# old module');
  assert.equal(fs.existsSync(path.join(f.pluginsDir, 'alma_sketchup_mcp/bridge.rb')), false);
});

test('CLI arguments have explicit errors and help needs no installed files', () => {
  for (const args of [[], ['--year'], ['--year', '2020', '--bad'], ['--year', '2020', '--install', '--dry-run'], ['--year', '2020', '--config-only', '--install'], ['--year', '2020', '--format', 'yaml'], ['--year', '2020', '--format', 'json']]) assert.throws(() => parseArguments(args));
  const output = [];
  runSetup(['--help'], { projectRoot: '/missing', log: text => output.push(text) });
  assert.match(output.join('\n'), /--config-only/);
});

test('all installer and package CLIs execute through a symlinked project directory', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.projectRoot, 'scripts'));
  for (const name of ['setup.mjs', 'install-skills.mjs', 'package-plugin.mjs', 'package-source.mjs']) {
    fs.copyFileSync(fileURLToPath(new URL(`../scripts/${name}`, import.meta.url)), path.join(f.projectRoot, 'scripts', name));
  }
  const linkedRoot = path.join(f.directory, 'linked project');
  fs.symlinkSync(f.projectRoot, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
  const run = (name, args) => execFileSync(process.execPath, [path.join(linkedRoot, 'scripts', name), ...args], { encoding: 'utf8' });
  const output = JSON.parse(run('setup.mjs', ['--year', '2020', '--config-only', '--format', 'json']));
  assert.equal(output.mcpServers['sketchup-2020'].env.ALMA_SKETCHUP_YEAR, '2020');
  assert.match(run('install-skills.mjs', ['--target', f.skillsDir]), /DRY RUN/);
  const rbz = path.join(f.directory, 'plugin.rbz');
  const zip = path.join(f.directory, 'source.zip');
  assert.match(run('package-plugin.mjs', ['--output', rbz]), /Created/);
  assert.ok(fs.existsSync(rbz));
  assert.match(run('package-source.mjs', ['--output', zip]), /Created/);
  assert.ok(fs.existsSync(zip));
});

test('RBZ is a readable ZIP containing both profiles, the loader and Apache notices', t => {
  const f = fixture(t);
  const result = packagePlugin({ projectRoot: f.projectRoot });
  assert.equal(path.basename(result.outputPath), 'sketchup-ai-toolkit.rbz');
  const files = unzipStored(fs.readFileSync(result.outputPath));
  assert.equal(files.get('alma_sketchup_mcp.rb').toString(), '# new loader\n');
  assert.deepEqual(JSON.parse(files.get('alma_sketchup_mcp/sketchup-versions.json').toString()), f.registry);
  for (const name of LEGAL_FILES) assert.equal(files.get(`alma_sketchup_mcp/${name}`).toString(), `Notice ${name}\n`);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.projectRoot, 'sketchup_plugin/alma_sketchup_mcp/sketchup-versions.json'), 'utf8')), f.registry);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.throws(() => storedZip([{ name: '../escape.rb', data: 'bad' }]), /Unsafe/);
});

test('source package contains complete distributable files and excludes state, binaries and dependencies', t => {
  const f = fixture(t);
  for (const relative of ['README.md', '.gitattributes', 'docs/installation.md', 'examples/demo.json', 'scripts/setup.mjs', 'test/ready.test.mjs', '.github/workflows/ci.yml']) f.write(relative, '');
  for (const relative of ['.session/private.json', 'node_modules/private.js', 'dist/old.zip', 'work/private.txt', '.env', 'src/.env.local', 'src/runtime/private.json', 'examples/model.skp', 'docs/.DS_Store']) f.write(relative, 'private');
  const result = packageSource({ projectRoot: f.projectRoot });
  const files = unzipStored(fs.readFileSync(result.outputPath));
  for (const relative of ['src/mcp-server.mjs', 'README.md', '.gitattributes', 'docs/installation.md', 'skills/sketchup-ai-modeling/SKILL.md', 'package-lock.json', 'sketchup_plugin/alma_sketchup_mcp.rb', '.github/workflows/ci.yml']) assert.ok(files.has(`sketchup-ai-toolkit/${relative}`), relative);
  assert.ok([...files.keys()].every(name => !/node_modules|\.session|\/dist\/|\/work\/|\.env|\/runtime\/|\.skp$|\.DS_Store/.test(name)));
  assert.deepEqual(JSON.parse(files.get('sketchup-ai-toolkit/sketchup_plugin/alma_sketchup_mcp/sketchup-versions.json').toString()), f.registry);
});

test('source packaging refuses missing local imports', t => {
  const f = fixture(t);
  f.write('src/mcp-server.mjs', ['import', '"./missing.mjs";'].join(' '));
  assert.throws(() => sourceEntries(f.projectRoot), /missing local imports/);
  assertLocalImportsIncluded([{ name: 'src/a.mjs', data: Buffer.from('export const a = 1;') }]);
});

test('Skills installation requires an explicit target and defaults to read-only preview', t => {
  const f = fixture(t);
  assert.throws(() => runInstallSkills([], { ...f, log: () => {} }), /--target is required/);
  assert.throws(() => skillInstallPlan(path.join(f.projectRoot, 'skills'), f), /source skills/);
  const result = runInstallSkills(['--target', f.skillsDir], { ...f, log: () => {} });
  assert.equal(result.installation, null);
  assert.deepEqual(result.plan.skills, ['sketchup-ai-modeling']);
  assert.equal(fs.existsSync(f.skillsDir), false);
});

test('Skills installer copies supporting files, preserves unrelated skills, and backs up replacements', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.skillsDir, 'another-skill'), { recursive: true });
  fs.writeFileSync(path.join(f.skillsDir, 'another-skill/SKILL.md'), 'keep');
  const first = runInstallSkills(['--target', f.skillsDir, '--install'], { ...f, log: () => {} });
  assert.equal(first.installation.backupDirectory, null);
  assert.ok(fs.existsSync(path.join(f.skillsDir, 'sketchup-ai-modeling/agents/openai.yaml')));
  fs.writeFileSync(path.join(f.skillsDir, 'sketchup-ai-modeling/SKILL.md'), 'previous skill');
  const next = installSkills(skillInstallPlan(f.skillsDir, f));
  assert.equal(fs.readFileSync(path.join(next.backupDirectory, 'sketchup-ai-modeling/SKILL.md'), 'utf8'), 'previous skill');
  assert.match(fs.readFileSync(path.join(f.skillsDir, 'sketchup-ai-modeling/SKILL.md'), 'utf8'), /New skill/);
  assert.equal(fs.readFileSync(path.join(f.skillsDir, 'another-skill/SKILL.md'), 'utf8'), 'keep');
});
