'use strict';
// Minimal VS Code API mock for unit tests.
// Uses global.__vscodeMockFiles (a Map<string, Uint8Array>) as the in-memory
// file system so tests can seed it before importing the bundle.

function files() {
  return (global.__vscodeMockFiles = global.__vscodeMockFiles ?? new Map());
}

function readOnlyFiles() {
  return (global.__vscodeMockReadOnlyFiles = global.__vscodeMockReadOnlyFiles ?? new Set());
}

class Uri {
  constructor(scheme, path) {
    this.scheme = scheme;
    this.path = path;
    this.fsPath = path;
  }

  static file(p) {
    return new Uri('file', p.replace(/\\/g, '/'));
  }

  // Inverse of toString() below (`scheme://path`).
  static parse(value) {
    const match = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(value);
    return match ? new Uri(match[1], match[2]) : new Uri('file', value);
  }

  toString() {
    return `${this.scheme}://${this.path}`;
  }

  with(changes) {
    return new Uri(this.scheme, changes.path ?? this.path);
  }
}

class EventEmitter {
  constructor() {
    this._listeners = [];
    this.event = (listener) => {
      this._listeners.push(listener);
      return { dispose: () => { this._listeners = this._listeners.filter(l => l !== listener); } };
    };
  }

  fire(data) {
    for (const l of this._listeners) {
      l(data);
    }
  }

  dispose() {
    this._listeners = [];
  }
}

class RelativePattern {
  constructor(base, pattern) {
    this.base = base;
    this.pattern = pattern;
  }
}

// --- status bar / tab model (used by the stats status bar tests) ---
// Tests drive it through globals: set global.__vscodeMockActiveTab to a
// { input } (or undefined) and call global.__vscodeMockFireTabChange().
class MarkdownString {
  constructor(value) {
    this.value = value;
  }
}

// The bundle under test and the test file each load their own copy of this
// mock, so anything they must agree on (instanceof, the listener set) lives on
// a global shared between the copies.
const TabInputCustom = (global.__vscodeMockTabInputCustom = global.__vscodeMockTabInputCustom
  ?? class TabInputCustom {
    constructor(uri, viewType) {
      this.uri = uri;
      this.viewType = viewType;
    }
  });

const tabListeners = (global.__vscodeMockTabListeners = global.__vscodeMockTabListeners ?? new Set());
global.__vscodeMockFireTabChange = () => {
  for (const listener of [...tabListeners]) listener();
};
global.__vscodeMockStatusBarItems = global.__vscodeMockStatusBarItems ?? [];

const window = {
  createStatusBarItem(id, alignment, priority) {
    const item = {
      id,
      alignment,
      priority,
      name: undefined,
      text: '',
      tooltip: undefined,
      accessibilityInformation: undefined,
      visible: false,
      disposed: false,
      show() { this.visible = true; },
      hide() { this.visible = false; },
      dispose() { this.disposed = true; this.visible = false; },
    };
    global.__vscodeMockStatusBarItems.push(item);
    return item;
  },
  tabGroups: {
    get activeTabGroup() {
      return { activeTab: global.__vscodeMockActiveTab };
    },
    onDidChangeTabs(listener) {
      tabListeners.add(listener);
      return { dispose: () => tabListeners.delete(listener) };
    },
    onDidChangeTabGroups(listener) {
      tabListeners.add(listener);
      return { dispose: () => tabListeners.delete(listener) };
    },
  },
};

module.exports = {
  Uri,
  EventEmitter,
  RelativePattern,
  MarkdownString,
  TabInputCustom,
  StatusBarAlignment: { Left: 1, Right: 2 },
  window,
  FilePermission: { Readonly: 1 },
  workspace: {
    fs: {
      async readFile(uri) {
        const key = uri.path ?? uri.fsPath;
        const data = files().get(key);
        if (!data) {
          const err = new Error(`File not found: ${key}`);
          err.code = 'FileNotFound';
          throw err;
        }
        return data;
      },
      async writeFile(uri, bytes) {
        const key = uri.path ?? uri.fsPath;
        files().set(key, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      },
      async delete(uri) {
        files().delete(uri.path ?? uri.fsPath);
      },
      async stat(uri) {
        const key = uri.path ?? uri.fsPath;
        const data = files().get(key);
        if (!data) {
          const err = new Error(`File not found: ${key}`);
          err.code = 'FileNotFound';
          throw err;
        }
        return {
          type: 1,
          ctime: 0,
          mtime: 0,
          size: data.length,
          permissions: readOnlyFiles().has(key) ? 1 : undefined,
        };
      },
    },
    createFileSystemWatcher(_pattern) {
      return {
        onDidChange(_cb) { return { dispose() {} }; },
        onDidCreate(_cb) { return { dispose() {} }; },
        dispose() {},
      };
    },
  },
};
