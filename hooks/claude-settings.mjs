// Writes the Claude Code hooks block for this notifier.
// Schema: https://code.claude.com/docs/en/hooks (Configuration, hook handler fields).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NOTIFY_HOOK_TIMEOUT_SEC = 15;
const NOTIFY_SCRIPT_MARKER = 'claude-code-notify/hooks/notify.sh';
const HOOK_EVENTS = ['PermissionRequest', 'Notification', 'Stop'];

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function isOurNotifyCommand(command, installDir) {
  if (typeof command !== 'string') return false;
  if (command.includes(NOTIFY_SCRIPT_MARKER)) return true;
  if (typeof installDir !== 'string' || !installDir) return false;
  const script = `${installDir}/hooks/notify.sh`;
  return command.includes(script) || command.includes(shellQuote(script));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function notifyHandler(installDir) {
  // async: the hook must not block, and a background PermissionRequest hook
  // cannot allow or deny. onFailure continue: a failed command hook must not
  // deny the permission request. timeout is seconds and is not enforced while
  // async is true; it bounds the hook if a host ignores async.
  return {
    type: 'command',
    command: shellQuote(`${installDir}/hooks/notify.sh`),
    timeout: NOTIFY_HOOK_TIMEOUT_SEC,
    async: true,
    onFailure: 'continue',
  };
}

// Empty matcher matches every tool and every notification type, including
// types added later. Stop does not support a matcher, so that group omits it.
export function buildNotifyHookGroups(installDir) {
  return {
    PermissionRequest: { matcher: '', hooks: [notifyHandler(installDir)] },
    Notification: { matcher: '', hooks: [notifyHandler(installDir)] },
    Stop: { hooks: [notifyHandler(installDir)] },
  };
}

function stripGroups(groups, installDir) {
  if (!Array.isArray(groups)) return [];
  const kept = [];
  for (const group of groups) {
    if (!isPlainObject(group) || !Array.isArray(group.hooks)) {
      kept.push(group);
      continue;
    }
    const hooks = group.hooks.filter((hook) => !isOurNotifyCommand(hook?.command, installDir));
    if (hooks.length === 0) continue;
    if (hooks.length === group.hooks.length) kept.push(group);
    else kept.push({ ...group, hooks });
  }
  return kept;
}

export function migrateSettings(settings, installDir) {
  const next = isPlainObject(settings) ? clone(settings) : {};
  if (!isPlainObject(next.hooks)) next.hooks = {};

  for (const event of HOOK_EVENTS) {
    const stripped = stripGroups(next.hooks[event], installDir);
    if (stripped.length === 0) delete next.hooks[event];
    else next.hooks[event] = stripped;
  }

  const additions = buildNotifyHookGroups(installDir);
  for (const event of HOOK_EVENTS) {
    if (!Array.isArray(next.hooks[event])) next.hooks[event] = [];
    next.hooks[event].push(additions[event]);
  }
  return next;
}

export function removeNotifyHooks(settings, installDir) {
  const next = isPlainObject(settings) ? clone(settings) : {};
  if (!isPlainObject(next.hooks)) {
    return { settings: next, modified: false };
  }

  let modified = false;
  for (const event of HOOK_EVENTS) {
    if (!Array.isArray(next.hooks[event])) continue;
    const stripped = stripGroups(next.hooks[event], installDir);
    if (JSON.stringify(stripped) === JSON.stringify(next.hooks[event])) continue;
    modified = true;
    if (stripped.length === 0) delete next.hooks[event];
    else next.hooks[event] = stripped;
  }

  if (modified && Object.keys(next.hooks).length === 0) {
    delete next.hooks;
  }
  return { settings: next, modified };
}

function readSettings(settingsPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return isPlainObject(parsed) ? parsed : {};
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error instanceof SyntaxError)) return {};
    throw error;
  }
}

function writeSettings(settingsPath, settings) {
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

function installDirFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

function runCli() {
  const [command, settingsPath] = process.argv.slice(2);
  if (!settingsPath || (command !== 'install' && command !== 'uninstall')) {
    console.error('Usage: claude-settings.mjs <install|uninstall> <settings.json>');
    process.exit(1);
  }

  const installDir = installDirFromHere();
  if (command === 'install') {
    const migrated = migrateSettings(readSettings(settingsPath), installDir);
    writeSettings(settingsPath, migrated);
    return;
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    console.log('  - Could not read settings file');
    return;
  }

  if (!isPlainObject(settings) || !isPlainObject(settings.hooks)) {
    console.log('  - No hooks configured, nothing to remove');
    return;
  }

  const { settings: next, modified } = removeNotifyHooks(settings, installDir);
  if (!modified) {
    console.log('  - No matching hooks found to remove');
    return;
  }
  writeSettings(settingsPath, next);
  console.log('  - Hooks removed from settings');
}

if (isDirectRun()) {
  runCli();
}
