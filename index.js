const EventEmitter = require('events');
const zip = window.zip = require('zipjs-browserify');
require('./lib/zip-fs');

const RE_GLTF = /\.(gltf|glb)$/;

/**
 * Watches an element for file drops, parses to create a filemap hierarchy,
 * and emits the result.
 */
class SimpleDropzone extends EventEmitter {

  /**
   * @param  {Element} el
   * @param  {Element} inputEl
   */
  constructor (el, inputEl) {
    super();

    this.el = el;
    this.inputEl = inputEl;

    this._onDragover = this._onDragover.bind(this);
    this._onDrop = this._onDrop.bind(this);
    this._onSelect = this._onSelect.bind(this);

    el.addEventListener('dragover', this._onDragover, false);
    el.addEventListener('drop', this._onDrop, false);
    inputEl.addEventListener('change', this._onSelect);
  }

  /**
   * Destroys the instance.
   */
  destroy () {
    const el = this.el;
    const inputEl = this.inputEl;

    el.removeEventListener(this._onDragover);
    el.removeEventListener(this._onDrop);
    inputEl.removeEventListener(this._onSelect);

    this.removeAllListeners();

    delete this.el;
    delete this.inputEl;
  }

  /**
   * @param  {Event} e
   */
  _onDrop (e) {
    e.stopPropagation();
    e.preventDefault();

    this.emit('dropstart');

    let entries;
    if (e.dataTransfer.items) {
      entries = [].slice.call(e.dataTransfer.items)
        .map((item) => item.webkitGetAsEntry());
    } else if ((e.dataTransfer.files||[]).length === 1) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/zip') {
        this._loadZip(file);
        return;
      } else {
        this._emitResult(new Map([[file.name, file]]));
        return;
      }
    }

    if (!entries) {
      this._fail('Required drag-and-drop APIs are not supported in this browser.');
    }

    if (entries.length === 1 && entries[0].name.match(/\.zip$/)) {
      entries[0].file((file) => this._loadZip(file));
    } else {
      this._loadNextEntry(new Map(), entries);
    }
  }

  /**
   * @param  {Event} e
   */
  _onDragover (e) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
  }

  /**
   * @param  {Event} e
   */
  _onSelect (e) {
    // HTML file inputs do not seem to support folders, so assume this is a flat file list.
    const files = [].slice.call(this.inputEl.files);
    const fileMap = new Map();
    files.forEach((file) => fileMap.set(file.name, file));
    this._emitResult(fileMap);
  }

  /**
   * Iterates through a list of FileSystemEntry objects, creates the fileMap
   * tree, and emits the result.
   * @param  {Map<string, File>} fileMap
   * @param  {Array<FileSystemEntry>} entries
   */
  _loadNextEntry (fileMap, entries) {
    const entry = entries.pop();

    if (!entry) {
      this._emitResult(fileMap);
      return;
    }

    if (entry.isFile) {
      entry.file((file) => {
        fileMap.set(entry.fullPath, file);
        this._loadNextEntry(fileMap, entries);
      }, () => console.error('Could not load file: %s', entry.fullPath));
    } else if (entry.isDirectory) {
      // readEntries() must be called repeatedly until it stops returning results.
      // https://www.w3.org/TR/2012/WD-file-system-api-20120417/#the-directoryreader-interface
      // https://bugs.chromium.org/p/chromium/issues/detail?id=378883
      const reader = entry.createReader();
      const readerCallback = (newEntries) => {
        if (newEntries.length) {
          entries = entries.concat(newEntries);
          reader.readEntries(readerCallback);
        } else {
          this._loadNextEntry(fileMap, entries);
        }
      };
      reader.readEntries(readerCallback);
    } else {
      console.warn('Unknown asset type: ' + entry.fullPath);
      this._loadNextEntry(fileMap, entries);
    }
  }

  /**
   * Inflates a File in .ZIP format, creates the fileMap tree, and emits the
   * result.
   * @param  {File} file
   */
  _loadZip (file) {
    const pending = [];
    const fileMap = new Map();
    const archive = new zip.fs.FS();

    const traverse = (node) => {
      if (node.directory) {
        node.children.forEach(traverse);
      } else if (node.name[0] !== '.') {
        pending.push(new Promise((resolve) => {
          node.getData(new zip.BlobWriter(), (blob) => {
            blob.name = node.name;
            fileMap.set(node.getFullname(), blob);
            resolve();
          });
        }));
      }
    };

    archive.importBlob(file, () => {
      traverse(archive.root);
      Promise.all(pending).then(() => {
        this._emitResult(fileMap);
      });
    });
  }

  /**
   * @param {Map<string, File>} fileMap
   */
  _emitResult (files) {
    this.emit('drop', {files: files});
  }

  /**
   * @param {string} message
   * @throws
   */
  _fail (message) {
    this.emit('droperror', {message: message});
  }
}

module.exports = SimpleDropzone;
