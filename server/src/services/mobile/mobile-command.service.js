import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';
import { env } from '../../config/env.js';

const execFileAsync = promisify(execFile);
const mockAdbState = new Map();

export async function runCommand(command, args, metadata = {}) {
  const startedAt = Date.now();
  if (env.mobileAutomation.commandMock) {
    return mockCommandResult(command, args, startedAt);
  }
  const executable = resolveExecutable(command);
  if (!executable) return missingExecutableResult(command, args, startedAt);

  try {
    const result = await execFileAsync(executable, args, {
      windowsHide: metadata.windowsHide !== false,
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
          windowsHide: metadata.windowsHide !== false,
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
  if (env.mobileAutomation.commandMock) {
    return mockBinaryCommandResult(command, args, startedAt);
  }
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

function mockCommandResult(command, args = [], startedAt = Date.now()) {
  const result = (stdout = '', extra = {}) => ({
    ok: true,
    command,
    args,
    durationMs: Math.max(0, Date.now() - startedAt),
    stdout,
    stderr: '',
    mock: env.mobileAutomation.commandMock,
    ...extra
  });
  const fail = (error, extra = {}) => ({
    ok: false,
    command,
    args,
    durationMs: Math.max(0, Date.now() - startedAt),
    stdout: '',
    stderr: '',
    error,
    mock: env.mobileAutomation.commandMock,
    ...extra
  });

  const normalizedArgs = args.map((item) => String(item));
  if (normalizedArgs[0] === 'start-server' || normalizedArgs[0] === 'kill-server') return result('');
  if (normalizedArgs[0] === 'devices') return result('List of devices attached\nemulator-5554\tdevice');
  if (normalizedArgs[0] === 'connect') return result(`connected to ${normalizedArgs[1] || 'emulator-5554'}`);
  if (normalizedArgs[0] === 'disconnect') return result('');

  const targetIndex = normalizedArgs[0] === '-s' ? 1 : -1;
  const target = targetIndex >= 0 ? normalizedArgs[targetIndex] : 'emulator-5554';
  const commandArgs = targetIndex >= 0 ? normalizedArgs.slice(2) : normalizedArgs;
  const state = getMockTargetState(target);

  if (commandArgs[0] === 'get-state') return result('device');

  if (commandArgs[0] === 'exec-out' && commandArgs[1] === 'uiautomator') {
    return result(buildMockFacebookXml(state));
  }

  if (commandArgs[0] === 'shell') {
    const shell = commandArgs.slice(1);
    const shellText = shell.join(' ');

    if (shell[0] === 'getprop') {
      const prop = shell[1] || '';
      if (['sys.boot_completed', 'dev.bootcomplete'].includes(prop)) return result('1');
      if (prop === 'init.svc.bootanim') return result('stopped');
      if (prop === 'ro.serialno') return result('MOCKSERIAL');
      return result('');
    }
    if (shell[0] === 'wm' && shell[1] === 'size') return result(`Physical size: ${state.width}x${state.height}`);
    if (shell[0] === 'wm' && shell[1] === 'density') return result('Physical density: 240');
    if (shell[0] === 'dumpsys' && shell[1] === 'window') {
      return result('mCurrentFocus=Window{mock u0 com.facebook.katana/.ComposerActivity}\nmFocusedApp=AppWindowToken{mock token=ActivityRecord{mock com.facebook.katana/.ComposerActivity}}\nmCurrentRotation=0');
    }
    if (shell[0] === 'pidof') return result('12345');
    if (shell[0] === 'pm' && shell[1] === 'path') return result(`package:/data/app/${shell[2] || 'com.facebook.katana'}-mock/base.apk`);
    if (shell[0] === 'settings' && shell[1] === 'get' && shell[2] === 'secure' && shell[3] === 'default_input_method') {
      return result('com.android.adbkeyboard/.AdbIME');
    }
    if (shell[0] === 'ime' && shell[1] === 'list') return result('mId=com.android.adbkeyboard/.AdbIME');
    if (shell[0] === 'ime' && shell[1] === 'set') return result('');
    if (shell[0] === 'uiautomator' && shell[1] === 'dump') return result('UI hierchary dumped to: /sdcard/window.xml');
    if (shell[0] === 'cat' && shell[1] === '/sdcard/window.xml') return result(buildMockFacebookXml(state));
    if (shell[0] === 'am' && shell[1] === 'start') {
      const text = readArgValue(normalizedArgs, 'android.intent.extra.TEXT') || readArgValue(normalizedArgs, 'msg');
      if (text) state.text = text;
      state.scenario = readMockScenario(text) || readMockScenarioFromTarget(target) || state.scenario || 'text';
      state.mediaKind = String(readArgValue(normalizedArgs, '-t') || '').startsWith('video/') ? 'video' : 'image';
      state.mediaAttached = normalizedArgs.includes('android.intent.extra.STREAM')
        && state.scenario !== 'collage-text-only';
      if (state.mediaAttached && state.scenario === 'share-chooser') {
        state.shareChooserPending = true;
        state.shareTapCount = 0;
      }
      if (state.mediaAttached && state.scenario === 'system-ui-once') {
        state.systemAnrPending = true;
      }
      state.packageName = readArgValue(normalizedArgs, '-p') || state.packageName;
      return result('Starting: Intent { act=android.intent.action.SEND typ=text/plain cmp=com.facebook.katana/.ComposerActivity }');
    }
    if (shell[0] === 'am' && shell[1] === 'broadcast') {
      if (shell.includes('ADB_CLEAR_TEXT')) state.text = '';
      const encoded = readArgValue(normalizedArgs, 'msg');
      if (encoded && shell.includes('ADB_INPUT_B64')) {
        state.text = Buffer.from(encoded, 'base64').toString('utf8');
      }
      return result('Broadcast completed: result=1');
    }
    if (shell[0] === 'cmd' && shell[1] === 'clipboard') {
      if (shell[2] === 'set') state.clipboard = shell.slice(4).join(' ');
      return result('');
    }
    if (shell[0] === 'input' && shell[1] === 'tap') {
      if (state.shareChooserPending) {
        state.shareTapCount = Number(state.shareTapCount || 0) + 1;
        if (state.shareTapCount >= 2) state.shareChooserPending = false;
      } else {
        const y = Number(shell[3] || 0);
        if (state.editorOpen && y > 0 && y < 180) {
          state.editorOpen = false;
        } else if (y >= 180 && y <= 650) {
          state.editorOpen = true;
        }
      }
      return result('');
    }
    if (shell[0] === 'input' && shell[1] === 'text') {
      state.text = decodeMockAdbInputText(shell.slice(2).join(' '));
      return result('');
    }
    if (shell[0] === 'input' && shell[1] === 'keyevent') {
      if (state.systemAnrPending) state.systemAnrPending = false;
      if (shell[2] === '4') state.editorOpen = false;
      if (shell[2] === '279') state.text = state.clipboard || state.text || '';
      if (shell[2] === '67') state.text = '';
      return result('');
    }
    if (shell[0] === 'input' && shell[1] === 'keycombination') {
      if (shell.includes('113') && shell.includes('50')) state.text = state.clipboard || state.text || '';
      return result('');
    }
    if (shell[0] === 'content' && shell[1] === 'insert') {
      const uri = readArgValue(shell, '--uri');
      return result(String(uri).includes('/video/')
        ? 'content://media/external/video/media/1001'
        : 'content://media/external/images/media/1001');
    }
    if (shell[0] === 'content' && shell[1] === 'query') {
      const uri = readArgValue(shell, '--uri');
      return result(String(uri).includes('/video/')
        ? 'Row: 0 _id=1001 _data=/sdcard/Pictures/SocialPilot/mock-video.mp4'
        : 'Row: 0 _id=1001 _data=/sdcard/Pictures/SocialPilot/mock-image.jpg');
    }
    if (['monkey', 'pm', 'appops', 'content'].includes(shell[0])) return result('');
    if (shell[0] === 'am' && ['force-stop', 'broadcast'].includes(shell[1])) return result('');
    if (/test -f|mkdir|touch|rm -f/i.test(shellText)) return result('');
  }

  if (env.mobileAutomation.commandMock === 'strict') {
    return fail(`Mock command chưa hỗ trợ: ${normalizedArgs.join(' ')}`);
  }
  return result('');
}

function mockBinaryCommandResult(command, args = [], startedAt = Date.now()) {
  const normalizedArgs = args.map((item) => String(item));
  if (normalizedArgs.includes('screencap')) {
    return {
      ok: true,
      command,
      args,
      durationMs: Math.max(0, Date.now() - startedAt),
      stdout: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAA4QAAAYACAYAAAAy5vXcAAAAG0lEQVR42u3BMQEAAADCoPVPbQwfoAAAAAAAAAAA4G0BQAABDQottAAAAABJRU5ErkJggg==', 'base64'),
      stderr: '',
      mock: env.mobileAutomation.commandMock
    };
  }
  return {
    ok: false,
    command,
    args,
    durationMs: Math.max(0, Date.now() - startedAt),
    stdout: Buffer.alloc(0),
    stderr: '',
    error: `Mock binary command chưa hỗ trợ: ${normalizedArgs.join(' ')}`,
    mock: env.mobileAutomation.commandMock
  };
}

function getMockTargetState(target) {
  if (!mockAdbState.has(target)) {
    mockAdbState.set(target, {
      text: process.env.MOBILE_COMMAND_MOCK_TEXT || '',
      packageName: 'com.facebook.katana',
      ...readMockTargetConfig(target),
      mediaAttached: false,
      shareChooserPending: false,
      systemAnrPending: false,
      shareTapCount: 0,
      clipboard: '',
      editorOpen: false,
      mediaKind: 'image'
    });
  }
  return mockAdbState.get(target);
}

function readMockScenario(text = '') {
  const match = String(text).match(/\[scenario:([a-z0-9-]+)\]/i);
  return match?.[1] || '';
}

function readMockScenarioFromTarget(target = '') {
  const match = String(target).match(/scenario-([a-z0-9-]+)/i);
  return match?.[1] || '';
}

function readMockTargetConfig(target = '') {
  const value = String(target);
  const sizeMatch = value.match(/size-(\d+)x(\d+)/i);
  const localeMatch = value.match(/locale-([a-z-]+)/i);
  return {
    scenario: readMockScenarioFromTarget(value) || 'text',
    locale: localeMatch?.[1]?.toLowerCase() || 'vi',
    width: Number(sizeMatch?.[1] || 900),
    height: Number(sizeMatch?.[2] || 1600)
  };
}

function readArgValue(args = [], key = '') {
  const index = args.findIndex((item) => item === key);
  if (index < 0 || index >= args.length - 1) return '';
  return args[index + 1] || '';
}

function decodeMockAdbInputText(value = '') {
  return String(value)
    .replace(/%s/g, ' ')
    .replace(/\\\\/g, '\\');
}

function buildMockFacebookXml(state = {}) {
  if (state.systemAnrPending) {
    state.systemAnrPending = false;
    return buildMockSystemAnrXml();
  }
  if (state.shareChooserPending) return buildMockFacebookShareChooserXml(state);
  return buildMockFacebookComposerXml(state);
}

function buildMockSystemAnrXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="System UI isn't responding" resource-id="" class="android.widget.TextView" package="android" content-desc="" clickable="false" enabled="true" bounds="[140,690][760,760]" />
  <node index="1" text="Close app" resource-id="" class="android.widget.TextView" package="android" content-desc="" clickable="true" enabled="true" bounds="[230,800][520,860]" />
  <node index="2" text="Wait" resource-id="" class="android.widget.TextView" package="android" content-desc="" clickable="true" enabled="true" bounds="[230,880][520,940]" />
</hierarchy>`;
}

function buildMockFacebookShareChooserXml(state = {}) {
  const composerText = state.text || process.env.MOBILE_COMMAND_MOCK_TEXT || '';
  const labels = getMockFacebookLabels(state.locale);
  const onceEnabled = Number(state.shareTapCount || 0) > 0 ? 'true' : 'false';
  const node = (index, attrs) => mockNode(state, index, attrs);
  return `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  ${node(0, { text: labels.title, className: 'android.widget.TextView', bounds: [330, 42, 570, 92] })}
  ${node(1, { text: composerText, resourceId: 'com.facebook.katana:id/composer_text', className: 'android.widget.EditText', clickable: true, bounds: [48, 260, 850, 520] })}
  ${node(2, { text: labels.editPhoto, className: 'android.widget.ImageView', desc: labels.editPhoto, clickable: true, bounds: [0, 600, 900, 1030] })}
  ${node(3, { text: labels.shareWith, packageName: 'android', className: 'android.widget.TextView', bounds: [126, 1140, 390, 1200] })}
  ${node(4, { text: 'Feed', packageName: 'android', className: 'android.widget.TextView', desc: 'Feed', clickable: true, bounds: [198, 1230, 330, 1288] })}
  ${node(5, { text: 'JUST ONCE', packageName: 'android', className: 'android.widget.Button', desc: 'JUST ONCE', clickable: true, enabled: onceEnabled === 'true', bounds: [548, 1515, 668, 1570] })}
  ${node(6, { text: 'ALWAYS', packageName: 'android', className: 'android.widget.Button', desc: 'ALWAYS', clickable: true, enabled: onceEnabled === 'true', bounds: [696, 1515, 780, 1570] })}
</hierarchy>`;
}

function buildMockFacebookComposerXml(state = {}) {
  const text = state.text || process.env.MOBILE_COMMAND_MOCK_TEXT || '';
  const labels = getMockFacebookLabels(state.locale);
  const composerText = text || labels.placeholder;
  const textClass = text ? 'android.widget.EditText' : 'android.widget.TextView';
  const node = (index, attrs) => mockNode(state, index, attrs);
  const editorDoneNode = state.editorOpen
    ? node(4, { text: labels.done, resourceId: 'com.facebook.katana:id/done_button', className: 'android.widget.TextView', desc: labels.done, clickable: true, bounds: [760, 42, 872, 100] })
    : '';
  const mediaNode = state.mediaAttached
    ? node(2, {
      text: state.mediaKind === 'video' ? labels.video : labels.editPhoto,
      className: state.mediaKind === 'video' ? 'android.view.TextureView' : 'android.widget.ImageView',
      desc: state.mediaKind === 'video' ? labels.video : labels.editPhoto,
      clickable: true,
      bounds: [0, 600, 900, 1030]
    })
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  ${node(0, { text: labels.title, className: 'android.widget.TextView', bounds: [330, 42, 570, 92] })}
  ${node(1, { text: composerText, resourceId: 'com.facebook.katana:id/composer_text', className: textClass, clickable: true, bounds: [48, 260, 850, 520] })}
  ${mediaNode}
  ${editorDoneNode}
  ${node(3, { text: labels.next, resourceId: 'com.facebook.katana:id/next_button', className: 'android.widget.Button', desc: labels.next, clickable: true, bounds: [720, 1490, 870, 1568] })}
</hierarchy>`;
}

function getMockFacebookLabels(locale = 'vi') {
  if (String(locale).toLowerCase().startsWith('en')) {
    return {
      title: 'New post',
      placeholder: "What's on your mind?",
      next: 'Next',
      done: 'Done',
      editPhoto: 'Edit photo',
      video: 'Video',
      shareWith: 'Share with'
    };
  }
  return {
    title: 'Bài viết mới',
    placeholder: 'Bạn đang nghĩ gì?',
    next: 'Tiếp',
    done: 'Xong',
    editPhoto: 'Chỉnh sửa ảnh',
    video: 'Video',
    shareWith: 'Chia sẻ với'
  };
}

function mockNode(state, index, attrs = {}) {
  const bounds = scaleMockBounds(attrs.bounds || [0, 0, 1, 1], state);
  return `<node index="${index}" text="${escapeXmlAttr(attrs.text || '')}" resource-id="${escapeXmlAttr(attrs.resourceId || '')}" class="${escapeXmlAttr(attrs.className || 'android.widget.TextView')}" package="${escapeXmlAttr(attrs.packageName || 'com.facebook.katana')}" content-desc="${escapeXmlAttr(attrs.desc || '')}" clickable="${attrs.clickable ? 'true' : 'false'}" enabled="${attrs.enabled === false ? 'false' : 'true'}" bounds="[${bounds[0]},${bounds[1]}][${bounds[2]},${bounds[3]}]" />`;
}

function scaleMockBounds(bounds, state = {}) {
  const scaleX = (Number(state.width) || 900) / 900;
  const scaleY = (Number(state.height) || 1600) / 1600;
  return [
    Math.round(bounds[0] * scaleX),
    Math.round(bounds[1] * scaleY),
    Math.round(bounds[2] * scaleX),
    Math.round(bounds[3] * scaleY)
  ];
}

function escapeXmlAttr(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
