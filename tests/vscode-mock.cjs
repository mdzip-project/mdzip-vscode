'use strict';
// Minimal VS Code API mock for unit tests.
// Uses global.__vscodeMockFiles (a Map<string, Uint8Array>) as the in-memory
// file system so tests can seed it before importing the bundle.

function files() {
  return (global.__vscodeMockFiles = global.__vscodeMockFiles ?? new Map());
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

module.exports = {
  Uri,
  EventEmitter,
  RelativePattern,
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
        return { type: 1, ctime: 0, mtime: 0, size: data.length };
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
