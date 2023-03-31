import zip from 'zip-js-esm';
import { fs } from './vendor/zip-fs.js';

zip.useWebWorkers = false;

/**
 * Watches an element for file drops, parses to create a filemap hierarchy,
 * and emits the result.
 */
class SimpleDropzone {

  /**
   * @param  {Element} el
   * @param  {Element} inputEl
   */
  constructor (el, inputEl) {
    this.el = el;
    this.inputEl = inputEl;

    this.listeners = {
      drop: [],
      dropstart: [],
      droperror: []
    };

    this._onDragover = this._onDragover.bind(this);
    this._onDrop = this._onDrop.bind(this);
    this._onSelect = this._onSelect.bind(this);

    el.addEventListener('dragover', this._onDragover, false);
    el.addEventListener('drop', this._onDrop, false);
    inputEl.addEventListener('change', this._onSelect);
  }

  /**
   * @param  {string}   type
   * @param  {Function} callback
   * @return {SimpleDropzone}
   */
  on (type, callback) {
    this.listeners[type].push(callback);
    return this;
  }

  /**
   * @param  {string} type
   * @param  {Object} data
   * @return {SimpleDropzone}
   */
  _emit (type, data) {
    this.listeners[type]
      .forEach((callback) => callback(data));
    return this;
  }

  /**
   * Destroys the instance.
   */
  destroy () {
    const el = this.el;
    const inputEl = this.inputEl;

    el.removeEventListener('dragover', this._onDragover, false);
    el.removeEventListener('drop', this._onDrop, false);
    inputEl.removeEventListener('change', this._onSelect);

    delete this.el;
    delete this.inputEl;
    delete this.listeners;
  }

  /**
   * References (and horror):
   * - https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/items
   * - https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files
   * - https://code.flickr.net/2012/12/10/drag-n-drop/
   * - https://stackoverflow.com/q/44842247/1314762
   *
   * @param  {Event} e
   */
  _onDrop (e) {
    e.stopPropagation();
    e.preventDefault();

    this._emit('dropstart');

    const files = Array.from(e.dataTransfer.files || []);
    const items = Array.from(e.dataTransfer.items || []);

    if (files.length === 0 && items.length === 0) {
      this._fail('Required drag-and-drop APIs are not supported in this browser.');
      return;
    }

    // Prefer .items, which allow folder traversal if necessary.
    if (items.length > 0) {
      const entries = items.map((item) => item.webkitGetAsEntry()).filter(entry => entry !== null);

      // donmccurdy/simple-dropzone#69
      if (entries.length > 0) {
        if (entries[0].name.match(/\.zip$/)) {
          this._loadZip(items[0].getAsFile());
        } else {
          this._loadNextEntry(new Map(), entries);
        }
      }

      return;
    }

    // Fall back to .files, since folders can't be traversed.
    if (files.length === 1 && files[0].name.match(/\.zip$/)) {
      this._loadZip(files[0]);
    }
    this._emit('drop', {files: new Map(files.map((file) => [file.name, file]))});
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
    this._emit('dropstart');

    // HTML file inputs do not seem to support folders, so assume this is a flat file list.
    const files = [].slice.call(this.inputEl.files);

    // Automatically decompress a zip archive if it is the only file given.
    if (files.length === 1 && this._isZip(files[0])) {
      this._loadZip(files[0]);
      return;
    }

    const fileMap = new Map();
    files.forEach((file) => fileMap.set(file.webkitRelativePath || file.name, file));
    this._emit('drop', {files: fileMap});
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
      this._emit('drop', {files: fileMap});
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
    const archive = new fs.FS();

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
        this._emit('drop', {files: fileMap, archive: file});
      });
    });
  }

  /**
   * @param  {File} file
   * @return {Boolean}
   */
  _isZip (file) {
    return file.type === 'application/zip' || file.name.match(/\.zip$/);
  }

  /**
   * @param {string} message
   * @throws
   */
  _fail (message) {
    this._emit('droperror', {message: message});
  }
}

export { SimpleDropzone };
