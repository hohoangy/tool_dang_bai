import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';
import { env } from '../../config/env.js';

const execFileAsync = promisify(execFile);

export async function runCommand(command, args, metadata = {}) {
  const startedAt = Date.now();
  const executable = resolveExecutable(command);
  if (!executable) return missingExecutableResult(command, args, startedAt);

  try {
    const result = await execFileAsync(executable, args, {
      windowsHide: true,
      timeout: metadata.timeoutMs || 60_000,
      maxBuffer: metadata.maxBuffer || 1024 * 1024
    });
    return {
      ok: true,
      command,
      args,
      durationMs: Date.now() - startedAt,
      stdout: result.stdout?.trim() || '',
      stderr: result.stderr?.trim() || ''
    };
  } catch (error) {
    if (
      isAdbExecutable(command, executable)
      && metadata.retryTransient !== false
      && !['start-server', 'kill-server'].includes(args[0])
      && isTransientAdbCommandError(error)
    ) {
      try {
        await execFileAsync(executable, ['kill-server'], {
          windowsHide: true,
          timeout: 10_000,
          maxBuffer: 1024 * 1024
        }).catch(() => null);
        await execFileAsync(executable, ['start-server'], {
          windowsHide: true,
          timeout: 10_000,
          maxBuffer: 1024 * 1024
        });
        const retry = await execFileAsync(executable, args, {
          windowsHide: true,
          timeout: metadata.timeoutMs || 60_000,
          maxBuffer: metadata.maxBuffer || 1024 * 1024
        });
        return {
          ok: true,
          command,
          args,
          durationMs: Date.now() - startedAt,
          stdout: retry.stdout?.trim() || '',
          stderr: retry.stderr?.trim() || '',
          retriedAfterAdbRestart: true,
          firstError: summarizeCommandError(error)
        };
      } catch (retryError) {
        error.retryError = retryError;
      }
    }
    return {
      ok: false,
      command,
      args,
      durationMs: Date.now() - startedAt,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || '',
      error: error.retryError?.message || error.message,
      firstError: error.retryError ? summarizeCommandError(error) : undefined,
      retriedAfterAdbRestart: Boolean(error.retryError)
    };
  }
}

export async function runBinaryCommand(command, args, metadata = {}) {
  const startedAt = Date.now();
  const executable = resolveExecutable(command);
  if (!executable) return missingExecutableResult(command, args, startedAt, Buffer.alloc(0));

  try {
    const result = await execFileAsync(executable, args, {
      windowsHide: true,
      timeout: metadata.timeoutMs || 60_000,
      maxBuffer: metadata.maxBuffer || 8 * 1024 * 1024,
      encoding: 'buffer'
    });
    return {
      ok: true,
      command,
      args,
      durationMs: Date.now() - startedAt,
      stdout: result.stdout,
      stderr: result.stderr?.toString('utf8').trim() || ''
    };
  } catch (error) {
    return {
      ok: false,
      command,
      args,
      durationMs: Date.now() - startedAt,
      stdout: error.stdout,
      stderr: error.stderr?.toString('utf8').trim() || '',
      error: error.message
    };
  }
}

export function runDetachedCommand(command, args = []) {
  const executable = resolveExecutable(command);
  if (!executable) {
    return {
      ok: false,
      command,
      args,
      error: `Không tìm thấy ${command}.`
    };
  }

  try {
    const child = spawn(executable, args, {
      detached: true,
      windowsHide: true,
      stdio: 'ignore'
    });
    child.unref();
    return {
      ok: true,
      command,
      args,
      processId: child.pid
    };
  } catch (error) {
    return {
      ok: false,
      command,
      args,
      error: error.message
    };
  }
}

export function resolveExecutable(command) {
  if (!command) return null;
  if (command.includes('\\') || command.includes('/')) return existsSync(command) ? command : null;

  const lower = command.toLowerCase();
  const candidates = [];
  const programFiles = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA,
    process.env.ProgramData
  ].filter(Boolean);

  if (lower === 'adb' || lower === 'adb.exe') {
    candidates.push(
      ...programFiles.flatMap((base) => [
        path.join(base, 'Android', 'android-sdk', 'platform-tools', 'adb.exe'),
        path.join(base, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
        path.join(base, 'LDPlayer', 'LDPlayer9', 'adb.exe'),
        path.join(base, 'LDPlayer9', 'adb.exe'),
        path.join(base, 'leidian', 'LDPlayer9', 'adb.exe'),
        path.join(base, 'dnplayerext2', 'adb.exe')
      ]),
      'C:\\LDPlayer\\LDPlayer9\\adb.exe',
      'D:\\LDPlayer\\LDPlayer9\\adb.exe',
      'E:\\LDPlayer\\LDPlayer9\\adb.exe',
      'C:\\leidian\\LDPlayer9\\adb.exe',
      'D:\\leidian\\LDPlayer9\\adb.exe',
      'E:\\leidian\\LDPlayer9\\adb.exe'
    );
  } else if (lower === 'ldconsole' || lower === 'ldconsole.exe') {
    candidates.push(
      ...programFiles.flatMap((base) => [
        path.join(base, 'LDPlayer', 'LDPlayer9', 'ldconsole.exe'),
        path.join(base, 'LDPlayer9', 'ldconsole.exe'),
        path.join(base, 'leidian', 'LDPlayer9', 'ldconsole.exe')
      ]),
      'C:\\LDPlayer\\LDPlayer9\\ldconsole.exe',
      'D:\\LDPlayer\\LDPlayer9\\ldconsole.exe',
      'E:\\LDPlayer\\LDPlayer9\\ldconsole.exe',
      'C:\\leidian\\LDPlayer9\\ldconsole.exe',
      'D:\\leidian\\LDPlayer9\\ldconsole.exe',
      'E:\\leidian\\LDPlayer9\\ldconsole.exe'
    );
  } else {
    candidates.push(command);
  }

  return candidates.find((candidate) => existsSync(candidate))
    || (['adb', 'adb.exe', 'ldconsole', 'ldconsole.exe'].includes(lower) ? null : command);
}

function missingExecutableResult(command, args, startedAt, stdout = '') {
  const executable = command.toLowerCase().includes('adb') ? 'adb.exe' : command;
  return {
    ok: false,
    command,
    args,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr: '',
    error: `Không tìm thấy ${executable}. Hãy cài LDPlayer hoặc cập nhật ADB_PATH/LDCONSOLE_PATH trong file .env.`
  };
}

function isAdbExecutable(command, executable) {
  return path.basename(String(command || executable)).toLowerCase() === 'adb.exe'
    || path.basename(String(executable || command)).toLowerCase() === 'adb.exe'
    || String(command || '').toLowerCase() === 'adb';
}

function isTransientAdbCommandError(error) {
  const output = `${error?.message || ''}\n${error?.stderr || ''}\n${error?.stdout || ''}`;
  return Boolean(
    error?.killed
    || error?.signal
    || /timed out|timeout|device offline|device .+ not found|no devices?\/emulators? found|transport error|protocol fault|closed/i.test(output)
  );
}

function summarizeCommandError(error) {
  return {
    message: error?.message || '',
    killed: Boolean(error?.killed),
    signal: error?.signal || null,
    stderr: error?.stderr?.trim?.() || ''
  };
}
