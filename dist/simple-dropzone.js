(function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(require,module,exports){
const zip = window.zip = require('zipjs-browserify');
require('./lib/zip-fs');

const RE_GLTF = /\.(gltf|glb)$/;

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

    el.removeEventListener(this._onDragover);
    el.removeEventListener(this._onDrop);
    inputEl.removeEventListener(this._onSelect);

    delete this.el;
    delete this.inputEl;
    delete this.listeners;
  }

  /**
   * @param  {Event} e
   */
  _onDrop (e) {
    e.stopPropagation();
    e.preventDefault();

    this._emit('dropstart');

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
        this._emit('drop', {files: new Map([[file.name, file]])});
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
        this._emit('drop', {files: fileMap});
      });
    });
  }

  /**
   * @param {string} message
   * @throws
   */
  _fail (message) {
    this._emit('droperror', {message: message});
  }
}

module.exports = SimpleDropzone;

},{"./lib/zip-fs":2,"zipjs-browserify":3}],2:[function(require,module,exports){
/*
 Copyright (c) 2013 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright
 notice, this list of conditions and the following disclaimer in
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

(function() {
  "use strict";

  var CHUNK_SIZE = 512 * 1024;

  var TextWriter = zip.TextWriter, //
  BlobWriter = zip.BlobWriter, //
  Data64URIWriter = zip.Data64URIWriter, //
  Reader = zip.Reader, //
  TextReader = zip.TextReader, //
  BlobReader = zip.BlobReader, //
  Data64URIReader = zip.Data64URIReader, //
  createReader = zip.createReader, //
  createWriter = zip.createWriter;

  function ZipBlobReader(entry) {
    var that = this, blobReader;

    function init(callback) {
      that.size = entry.uncompressedSize;
      callback();
    }

    function getData(callback) {
      if (that.data)
        callback();
      else
        entry.getData(new BlobWriter(), function(data) {
          that.data = data;
          blobReader = new BlobReader(data);
          callback();
        }, null, that.checkCrc32);
    }

    function readUint8Array(index, length, callback, onerror) {
      getData(function() {
        blobReader.readUint8Array(index, length, callback, onerror);
      }, onerror);
    }

    that.size = 0;
    that.init = init;
    that.readUint8Array = readUint8Array;
  }
  ZipBlobReader.prototype = new Reader();
  ZipBlobReader.prototype.constructor = ZipBlobReader;
  ZipBlobReader.prototype.checkCrc32 = false;

  function getTotalSize(entry) {
    var size = 0;

    function process(entry) {
      size += entry.uncompressedSize || 0;
      entry.children.forEach(process);
    }

    process(entry);
    return size;
  }

  function initReaders(entry, onend, onerror) {
    var index = 0;

    function next() {
      index++;
      if (index < entry.children.length)
        process(entry.children[index]);
      else
        onend();
    }

    function process(child) {
      if (child.directory)
        initReaders(child, next, onerror);
      else {
        child.reader = new child.Reader(child.data, onerror);
        child.reader.init(function() {
          child.uncompressedSize = child.reader.size;
          next();
        });
      }
    }

    if (entry.children.length)
      process(entry.children[index]);
    else
      onend();
  }

  function detach(entry) {
    var children = entry.parent.children;
    children.forEach(function(child, index) {
      if (child.id == entry.id)
        children.splice(index, 1);
    });
  }

  function exportZip(zipWriter, entry, onend, onprogress, totalSize) {
    var currentIndex = 0;

    function process(zipWriter, entry, onend, onprogress, totalSize) {
      var childIndex = 0;

      function exportChild() {
        var child = entry.children[childIndex];
        if (child)
          zipWriter.add(child.getFullname(), child.reader, function() {
            currentIndex += child.uncompressedSize || 0;
            process(zipWriter, child, function() {
              childIndex++;
              exportChild();
            }, onprogress, totalSize);
          }, function(index) {
            if (onprogress)
              onprogress(currentIndex + index, totalSize);
          }, {
            directory : child.directory,
            version : child.zipVersion
          });
        else
          onend();
      }

      exportChild();
    }

    process(zipWriter, entry, onend, onprogress, totalSize);
  }

  function addFileEntry(zipEntry, fileEntry, onend, onerror) {
    function getChildren(fileEntry, callback) {
      if (fileEntry.isDirectory)
        fileEntry.createReader().readEntries(callback);
      if (fileEntry.isFile)
        callback([]);
    }

    function process(zipEntry, fileEntry, onend) {
      getChildren(fileEntry, function(children) {
        var childIndex = 0;

        function addChild(child) {
          function nextChild(childFileEntry) {
            process(childFileEntry, child, function() {
              childIndex++;
              processChild();
            });
          }

          if (child.isDirectory)
            nextChild(zipEntry.addDirectory(child.name));
          if (child.isFile)
            child.file(function(file) {
              var childZipEntry = zipEntry.addBlob(child.name, file);
              childZipEntry.uncompressedSize = file.size;
              nextChild(childZipEntry);
            }, onerror);
        }

        function processChild() {
          var child = children[childIndex];
          if (child)
            addChild(child);
          else
            onend();
        }

        processChild();
      });
    }

    if (fileEntry.isDirectory)
      process(zipEntry, fileEntry, onend);
    else
      fileEntry.file(function(file) {
        zipEntry.addBlob(fileEntry.name, file);
        onend();
      }, onerror);
  }

  function getFileEntry(fileEntry, entry, onend, onprogress, onerror, totalSize, checkCrc32) {
    var currentIndex = 0;

    function process(fileEntry, entry, onend, onprogress, onerror, totalSize) {
      var childIndex = 0;

      function addChild(child) {
        function nextChild(childFileEntry) {
          currentIndex += child.uncompressedSize || 0;
          process(childFileEntry, child, function() {
            childIndex++;
            processChild();
          }, onprogress, onerror, totalSize);
        }

        if (child.directory)
          fileEntry.getDirectory(child.name, {
            create : true
          }, nextChild, onerror);
        else
          fileEntry.getFile(child.name, {
            create : true
          }, function(file) {
            child.getData(new zip.FileWriter(file, zip.getMimeType(child.name)), nextChild, function(index) {
              if (onprogress)
                onprogress(currentIndex + index, totalSize);
            }, checkCrc32);
          }, onerror);
      }

      function processChild() {
        var child = entry.children[childIndex];
        if (child)
          addChild(child);
        else
          onend();
      }

      processChild();
    }

    if (entry.directory)
      process(fileEntry, entry, onend, onprogress, onerror, totalSize);
    else
      entry.getData(new zip.FileWriter(fileEntry, zip.getMimeType(entry.name)), onend, onprogress, checkCrc32);
  }

  function resetFS(fs) {
    fs.entries = [];
    fs.root = new ZipDirectoryEntry(fs);
  }

  function bufferedCopy(reader, writer, onend, onprogress, onerror) {
    var chunkIndex = 0;

    function stepCopy() {
      var index = chunkIndex * CHUNK_SIZE;
      if (onprogress)
        onprogress(index, reader.size);
      if (index < reader.size)
        reader.readUint8Array(index, Math.min(CHUNK_SIZE, reader.size - index), function(array) {
          writer.writeUint8Array(new Uint8Array(array), function() {
            chunkIndex++;
            stepCopy();
          });
        }, onerror);
      else
        writer.getData(onend);
    }

    stepCopy();
  }

  function addChild(parent, name, params, directory) {
    if (parent.directory)
      return directory ? new ZipDirectoryEntry(parent.fs, name, params, parent) : new ZipFileEntry(parent.fs, name, params, parent);
    else
      throw "Parent entry is not a directory.";
  }

  function ZipEntry() {
  }

  ZipEntry.prototype = {
    init : function(fs, name, params, parent) {
      var that = this;
      if (fs.root && parent && parent.getChildByName(name))
        throw "Entry filename already exists.";
      if (!params)
        params = {};
      that.fs = fs;
      that.name = name;
      that.id = fs.entries.length;
      that.parent = parent;
      that.children = [];
      that.zipVersion = params.zipVersion || 0x14;
      that.uncompressedSize = 0;
      fs.entries.push(that);
      if (parent)
        that.parent.children.push(that);
    },
    getFileEntry : function(fileEntry, onend, onprogress, onerror, checkCrc32) {
      var that = this;
      initReaders(that, function() {
        getFileEntry(fileEntry, that, onend, onprogress, onerror, getTotalSize(that), checkCrc32);
      }, onerror);
    },
    moveTo : function(target) {
      var that = this;
      if (target.directory) {
        if (!target.isDescendantOf(that)) {
          if (that != target) {
            if (target.getChildByName(that.name))
              throw "Entry filename already exists.";
            detach(that);
            that.parent = target;
            target.children.push(that);
          }
        } else
          throw "Entry is a ancestor of target entry.";
      } else
        throw "Target entry is not a directory.";
    },
    getFullname : function() {
      var that = this, fullname = that.name, entry = that.parent;
      while (entry) {
        fullname = (entry.name ? entry.name + "/" : "") + fullname;
        entry = entry.parent;
      }
      return fullname;
    },
    isDescendantOf : function(ancestor) {
      var entry = this.parent;
      while (entry && entry.id != ancestor.id)
        entry = entry.parent;
      return !!entry;
    }
  };
  ZipEntry.prototype.constructor = ZipEntry;

  var ZipFileEntryProto;

  function ZipFileEntry(fs, name, params, parent) {
    var that = this;
    ZipEntry.prototype.init.call(that, fs, name, params, parent);
    that.Reader = params.Reader;
    that.Writer = params.Writer;
    that.data = params.data;
    if (params.getData) {
      that.getData = params.getData;
    }
  }

  ZipFileEntry.prototype = ZipFileEntryProto = new ZipEntry();
  ZipFileEntryProto.constructor = ZipFileEntry;
  ZipFileEntryProto.getData = function(writer, onend, onprogress, onerror) {
    var that = this;
    if (!writer || (writer.constructor == that.Writer && that.data))
      onend(that.data);
    else {
      if (!that.reader)
        that.reader = new that.Reader(that.data, onerror);
      that.reader.init(function() {
        writer.init(function() {
          bufferedCopy(that.reader, writer, onend, onprogress, onerror);
        }, onerror);
      });
    }
  };

  ZipFileEntryProto.getText = function(onend, onprogress, checkCrc32, encoding) {
    this.getData(new TextWriter(encoding), onend, onprogress, checkCrc32);
  };
  ZipFileEntryProto.getBlob = function(mimeType, onend, onprogress, checkCrc32) {
    this.getData(new BlobWriter(mimeType), onend, onprogress, checkCrc32);
  };
  ZipFileEntryProto.getData64URI = function(mimeType, onend, onprogress, checkCrc32) {
    this.getData(new Data64URIWriter(mimeType), onend, onprogress, checkCrc32);
  };

  var ZipDirectoryEntryProto;

  function ZipDirectoryEntry(fs, name, params, parent) {
    var that = this;
    ZipEntry.prototype.init.call(that, fs, name, params, parent);
    that.directory = true;
  }

  ZipDirectoryEntry.prototype = ZipDirectoryEntryProto = new ZipEntry();
  ZipDirectoryEntryProto.constructor = ZipDirectoryEntry;
  ZipDirectoryEntryProto.addDirectory = function(name) {
    return addChild(this, name, null, true);
  };
  ZipDirectoryEntryProto.addText = function(name, text) {
    return addChild(this, name, {
      data : text,
      Reader : TextReader,
      Writer : TextWriter
    });
  };
  ZipDirectoryEntryProto.addBlob = function(name, blob) {
    return addChild(this, name, {
      data : blob,
      Reader : BlobReader,
      Writer : BlobWriter
    });
  };
  ZipDirectoryEntryProto.addData64URI = function(name, dataURI) {
    return addChild(this, name, {
      data : dataURI,
      Reader : Data64URIReader,
      Writer : Data64URIWriter
    });
  };
  ZipDirectoryEntryProto.addFileEntry = function(fileEntry, onend, onerror) {
    addFileEntry(this, fileEntry, onend, onerror);
  };
  ZipDirectoryEntryProto.addData = function(name, params) {
    return addChild(this, name, params);
  };
  ZipDirectoryEntryProto.importBlob = function(blob, onend, onerror) {
    this.importZip(new BlobReader(blob), onend, onerror);
  };
  ZipDirectoryEntryProto.importText = function(text, onend, onerror) {
    this.importZip(new TextReader(text), onend, onerror);
  };
  ZipDirectoryEntryProto.importData64URI = function(dataURI, onend, onerror) {
    this.importZip(new Data64URIReader(dataURI), onend, onerror);
  };
  ZipDirectoryEntryProto.exportBlob = function(onend, onprogress, onerror) {
    this.exportZip(new BlobWriter("application/zip"), onend, onprogress, onerror);
  };
  ZipDirectoryEntryProto.exportText = function(onend, onprogress, onerror) {
    this.exportZip(new TextWriter(), onend, onprogress, onerror);
  };
  ZipDirectoryEntryProto.exportFileEntry = function(fileEntry, onend, onprogress, onerror) {
    this.exportZip(new zip.FileWriter(fileEntry, "application/zip"), onend, onprogress, onerror);
  };
  ZipDirectoryEntryProto.exportData64URI = function(onend, onprogress, onerror) {
    this.exportZip(new Data64URIWriter("application/zip"), onend, onprogress, onerror);
  };
  ZipDirectoryEntryProto.importZip = function(reader, onend, onerror) {
    var that = this;
    createReader(reader, function(zipReader) {
      zipReader.getEntries(function(entries) {
        entries.forEach(function(entry) {
          var parent = that, path = entry.filename.split("/"), name = path.pop();
          path.forEach(function(pathPart) {
            parent = parent.getChildByName(pathPart) || new ZipDirectoryEntry(that.fs, pathPart, null, parent);
          });
          if (!entry.directory)
            addChild(parent, name, {
              data : entry,
              Reader : ZipBlobReader
            });
        });
        onend();
      });
    }, onerror);
  };
  ZipDirectoryEntryProto.exportZip = function(writer, onend, onprogress, onerror) {
    var that = this;
    initReaders(that, function() {
      createWriter(writer, function(zipWriter) {
        exportZip(zipWriter, that, function() {
          zipWriter.close(onend);
        }, onprogress, getTotalSize(that));
      }, onerror);
    }, onerror);
  };
  ZipDirectoryEntryProto.getChildByName = function(name) {
    var childIndex, child, that = this;
    for (childIndex = 0; childIndex < that.children.length; childIndex++) {
      child = that.children[childIndex];
      if (child.name == name)
        return child;
    }
  };

  function FS() {
    resetFS(this);
  }
  FS.prototype = {
    remove : function(entry) {
      detach(entry);
      this.entries[entry.id] = null;
    },
    find : function(fullname) {
      var index, path = fullname.split("/"), node = this.root;
      for (index = 0; node && index < path.length; index++)
        node = node.getChildByName(path[index]);
      return node;
    },
    getById : function(id) {
      return this.entries[id];
    },
    importBlob : function(blob, onend, onerror) {
      resetFS(this);
      this.root.importBlob(blob, onend, onerror);
    },
    importText : function(text, onend, onerror) {
      resetFS(this);
      this.root.importText(text, onend, onerror);
    },
    importData64URI : function(dataURI, onend, onerror) {
      resetFS(this);
      this.root.importData64URI(dataURI, onend, onerror);
    },
    exportBlob : function(onend, onprogress, onerror) {
      this.root.exportBlob(onend, onprogress, onerror);
    },
    exportText : function(onend, onprogress, onerror) {
      this.root.exportText(onend, onprogress, onerror);
    },
    exportFileEntry : function(fileEntry, onend, onprogress, onerror) {
      this.root.exportFileEntry(fileEntry, onend, onprogress, onerror);
    },
    exportData64URI : function(onend, onprogress, onerror) {
      this.root.exportData64URI(onend, onprogress, onerror);
    }
  };

  zip.fs = {
    FS : FS,
    ZipDirectoryEntry : ZipDirectoryEntry,
    ZipFileEntry : ZipFileEntry
  };

  zip.getMimeType = function() {
    return "application/octet-stream";
  };

})();

},{}],3:[function(require,module,exports){

var zip = require('zip');

function createUrl(src){
  var blob = new Blob([src], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

var zWorker = createUrl("/* jshint worker:true */\n(function main(global) {\n\t\"use strict\";\n\n\tif (global.zWorkerInitialized)\n\t\tthrow new Error('z-worker.js should be run only once');\n\tglobal.zWorkerInitialized = true;\n\n\taddEventListener(\"message\", function(event) {\n\t\tvar message = event.data, type = message.type, sn = message.sn;\n\t\tvar handler = handlers[type];\n\t\tif (handler) {\n\t\t\ttry {\n\t\t\t\thandler(message);\n\t\t\t} catch (e) {\n\t\t\t\tonError(type, sn, e);\n\t\t\t}\n\t\t}\n\t\t//for debug\n\t\t//postMessage({type: 'echo', originalType: type, sn: sn});\n\t});\n\n\tvar handlers = {\n\t\timportScripts: doImportScripts,\n\t\tnewTask: newTask,\n\t\tappend: processData,\n\t\tflush: processData,\n\t};\n\n\t// deflater/inflater tasks indexed by serial numbers\n\tvar tasks = {};\n\n\tfunction doImportScripts(msg) {\n\t\tif (msg.scripts && msg.scripts.length > 0)\n\t\t\timportScripts.apply(undefined, msg.scripts);\n\t\tpostMessage({type: 'importScripts'});\n\t}\n\n\tfunction newTask(msg) {\n\t\tvar CodecClass = global[msg.codecClass];\n\t\tvar sn = msg.sn;\n\t\tif (tasks[sn])\n\t\t\tthrow Error('duplicated sn');\n\t\ttasks[sn] =  {\n\t\t\tcodec: new CodecClass(msg.options),\n\t\t\tcrcInput: msg.crcType === 'input',\n\t\t\tcrcOutput: msg.crcType === 'output',\n\t\t\tcrc: new Crc32(),\n\t\t};\n\t\tpostMessage({type: 'newTask', sn: sn});\n\t}\n\n\t// performance may not be supported\n\tvar now = global.performance ? global.performance.now.bind(global.performance) : Date.now;\n\n\tfunction processData(msg) {\n\t\tvar sn = msg.sn, type = msg.type, input = msg.data;\n\t\tvar task = tasks[sn];\n\t\t// allow creating codec on first append\n\t\tif (!task && msg.codecClass) {\n\t\t\tnewTask(msg);\n\t\t\ttask = tasks[sn];\n\t\t}\n\t\tvar isAppend = type === 'append';\n\t\tvar start = now();\n\t\tvar output;\n\t\tif (isAppend) {\n\t\t\ttry {\n\t\t\t\toutput = task.codec.append(input, function onprogress(loaded) {\n\t\t\t\t\tpostMessage({type: 'progress', sn: sn, loaded: loaded});\n\t\t\t\t});\n\t\t\t} catch (e) {\n\t\t\t\tdelete tasks[sn];\n\t\t\t\tthrow e;\n\t\t\t}\n\t\t} else {\n\t\t\tdelete tasks[sn];\n\t\t\toutput = task.codec.flush();\n\t\t}\n\t\tvar codecTime = now() - start;\n\n\t\tstart = now();\n\t\tif (input && task.crcInput)\n\t\t\ttask.crc.append(input);\n\t\tif (output && task.crcOutput)\n\t\t\ttask.crc.append(output);\n\t\tvar crcTime = now() - start;\n\n\t\tvar rmsg = {type: type, sn: sn, codecTime: codecTime, crcTime: crcTime};\n\t\tvar transferables = [];\n\t\tif (output) {\n\t\t\trmsg.data = output;\n\t\t\ttransferables.push(output.buffer);\n\t\t}\n\t\tif (!isAppend && (task.crcInput || task.crcOutput))\n\t\t\trmsg.crc = task.crc.get();\n\t\t\n\t\t// posting a message with transferables will fail on IE10\n\t\ttry {\n\t\t\tpostMessage(rmsg, transferables);\n\t\t} catch(ex) {\n\t\t\tpostMessage(rmsg); // retry without transferables\n\t\t}\n\t}\n\n\tfunction onError(type, sn, e) {\n\t\tvar msg = {\n\t\t\ttype: type,\n\t\t\tsn: sn,\n\t\t\terror: formatError(e)\n\t\t};\n\t\tpostMessage(msg);\n\t}\n\n\tfunction formatError(e) {\n\t\treturn { message: e.message, stack: e.stack };\n\t}\n\n\t// Crc32 code copied from file zip.js\n\tfunction Crc32() {\n\t\tthis.crc = -1;\n\t}\n\tCrc32.prototype.append = function append(data) {\n\t\tvar crc = this.crc | 0, table = this.table;\n\t\tfor (var offset = 0, len = data.length | 0; offset < len; offset++)\n\t\t\tcrc = (crc >>> 8) ^ table[(crc ^ data[offset]) & 0xFF];\n\t\tthis.crc = crc;\n\t};\n\tCrc32.prototype.get = function get() {\n\t\treturn ~this.crc;\n\t};\n\tCrc32.prototype.table = (function() {\n\t\tvar i, j, t, table = []; // Uint32Array is actually slower than []\n\t\tfor (i = 0; i < 256; i++) {\n\t\t\tt = i;\n\t\t\tfor (j = 0; j < 8; j++)\n\t\t\t\tif (t & 1)\n\t\t\t\t\tt = (t >>> 1) ^ 0xEDB88320;\n\t\t\t\telse\n\t\t\t\t\tt = t >>> 1;\n\t\t\ttable[i] = t;\n\t\t}\n\t\treturn table;\n\t})();\n\n\t// \"no-op\" codec\n\tfunction NOOP() {}\n\tglobal.NOOP = NOOP;\n\tNOOP.prototype.append = function append(bytes, onprogress) {\n\t\treturn bytes;\n\t};\n\tNOOP.prototype.flush = function flush() {};\n})(this);\n");
zip.workerScripts = {
  deflater: [zWorker, createUrl("/*\n Copyright (c) 2013 Gildas Lormeau. All rights reserved.\n\n Redistribution and use in source and binary forms, with or without\n modification, are permitted provided that the following conditions are met:\n\n 1. Redistributions of source code must retain the above copyright notice,\n this list of conditions and the following disclaimer.\n\n 2. Redistributions in binary form must reproduce the above copyright \n notice, this list of conditions and the following disclaimer in \n the documentation and/or other materials provided with the distribution.\n\n 3. The names of the authors may not be used to endorse or promote products\n derived from this software without specific prior written permission.\n\n THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,\n INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND\n FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,\n INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,\n INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT\n LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,\n OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF\n LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING\n NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,\n EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n */\n\n/*\n * This program is based on JZlib 1.0.2 ymnk, JCraft,Inc.\n * JZlib is based on zlib-1.1.3, so all credit should go authors\n * Jean-loup Gailly(jloup@gzip.org) and Mark Adler(madler@alumni.caltech.edu)\n * and contributors of zlib.\n */\n\n(function(global) {\n\t\"use strict\";\n\n\t// Global\n\n\tvar MAX_BITS = 15;\n\tvar D_CODES = 30;\n\tvar BL_CODES = 19;\n\n\tvar LENGTH_CODES = 29;\n\tvar LITERALS = 256;\n\tvar L_CODES = (LITERALS + 1 + LENGTH_CODES);\n\tvar HEAP_SIZE = (2 * L_CODES + 1);\n\n\tvar END_BLOCK = 256;\n\n\t// Bit length codes must not exceed MAX_BL_BITS bits\n\tvar MAX_BL_BITS = 7;\n\n\t// repeat previous bit length 3-6 times (2 bits of repeat count)\n\tvar REP_3_6 = 16;\n\n\t// repeat a zero length 3-10 times (3 bits of repeat count)\n\tvar REPZ_3_10 = 17;\n\n\t// repeat a zero length 11-138 times (7 bits of repeat count)\n\tvar REPZ_11_138 = 18;\n\n\t// The lengths of the bit length codes are sent in order of decreasing\n\t// probability, to avoid transmitting the lengths for unused bit\n\t// length codes.\n\n\tvar Buf_size = 8 * 2;\n\n\t// JZlib version : \"1.0.2\"\n\tvar Z_DEFAULT_COMPRESSION = -1;\n\n\t// compression strategy\n\tvar Z_FILTERED = 1;\n\tvar Z_HUFFMAN_ONLY = 2;\n\tvar Z_DEFAULT_STRATEGY = 0;\n\n\tvar Z_NO_FLUSH = 0;\n\tvar Z_PARTIAL_FLUSH = 1;\n\tvar Z_FULL_FLUSH = 3;\n\tvar Z_FINISH = 4;\n\n\tvar Z_OK = 0;\n\tvar Z_STREAM_END = 1;\n\tvar Z_NEED_DICT = 2;\n\tvar Z_STREAM_ERROR = -2;\n\tvar Z_DATA_ERROR = -3;\n\tvar Z_BUF_ERROR = -5;\n\n\t// Tree\n\n\t// see definition of array dist_code below\n\tvar _dist_code = [ 0, 1, 2, 3, 4, 4, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,\n\t\t\t10, 10, 10, 10, 10, 10, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12,\n\t\t\t12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13,\n\t\t\t13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14,\n\t\t\t14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14,\n\t\t\t14, 14, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,\n\t\t\t15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 0, 0, 16, 17, 18, 18, 19, 19,\n\t\t\t20, 20, 20, 20, 21, 21, 21, 21, 22, 22, 22, 22, 22, 22, 22, 22, 23, 23, 23, 23, 23, 23, 23, 23, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,\n\t\t\t24, 24, 24, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26,\n\t\t\t26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27,\n\t\t\t27, 27, 27, 27, 27, 27, 27, 27, 27, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,\n\t\t\t28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 29,\n\t\t\t29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29,\n\t\t\t29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29 ];\n\n\tfunction Tree() {\n\t\tvar that = this;\n\n\t\t// dyn_tree; // the dynamic tree\n\t\t// max_code; // largest code with non zero frequency\n\t\t// stat_desc; // the corresponding static tree\n\n\t\t// Compute the optimal bit lengths for a tree and update the total bit\n\t\t// length\n\t\t// for the current block.\n\t\t// IN assertion: the fields freq and dad are set, heap[heap_max] and\n\t\t// above are the tree nodes sorted by increasing frequency.\n\t\t// OUT assertions: the field len is set to the optimal bit length, the\n\t\t// array bl_count contains the frequencies for each bit length.\n\t\t// The length opt_len is updated; static_len is also updated if stree is\n\t\t// not null.\n\t\tfunction gen_bitlen(s) {\n\t\t\tvar tree = that.dyn_tree;\n\t\t\tvar stree = that.stat_desc.static_tree;\n\t\t\tvar extra = that.stat_desc.extra_bits;\n\t\t\tvar base = that.stat_desc.extra_base;\n\t\t\tvar max_length = that.stat_desc.max_length;\n\t\t\tvar h; // heap index\n\t\t\tvar n, m; // iterate over the tree elements\n\t\t\tvar bits; // bit length\n\t\t\tvar xbits; // extra bits\n\t\t\tvar f; // frequency\n\t\t\tvar overflow = 0; // number of elements with bit length too large\n\n\t\t\tfor (bits = 0; bits <= MAX_BITS; bits++)\n\t\t\t\ts.bl_count[bits] = 0;\n\n\t\t\t// In a first pass, compute the optimal bit lengths (which may\n\t\t\t// overflow in the case of the bit length tree).\n\t\t\ttree[s.heap[s.heap_max] * 2 + 1] = 0; // root of the heap\n\n\t\t\tfor (h = s.heap_max + 1; h < HEAP_SIZE; h++) {\n\t\t\t\tn = s.heap[h];\n\t\t\t\tbits = tree[tree[n * 2 + 1] * 2 + 1] + 1;\n\t\t\t\tif (bits > max_length) {\n\t\t\t\t\tbits = max_length;\n\t\t\t\t\toverflow++;\n\t\t\t\t}\n\t\t\t\ttree[n * 2 + 1] = bits;\n\t\t\t\t// We overwrite tree[n*2+1] which is no longer needed\n\n\t\t\t\tif (n > that.max_code)\n\t\t\t\t\tcontinue; // not a leaf node\n\n\t\t\t\ts.bl_count[bits]++;\n\t\t\t\txbits = 0;\n\t\t\t\tif (n >= base)\n\t\t\t\t\txbits = extra[n - base];\n\t\t\t\tf = tree[n * 2];\n\t\t\t\ts.opt_len += f * (bits + xbits);\n\t\t\t\tif (stree)\n\t\t\t\t\ts.static_len += f * (stree[n * 2 + 1] + xbits);\n\t\t\t}\n\t\t\tif (overflow === 0)\n\t\t\t\treturn;\n\n\t\t\t// This happens for example on obj2 and pic of the Calgary corpus\n\t\t\t// Find the first bit length which could increase:\n\t\t\tdo {\n\t\t\t\tbits = max_length - 1;\n\t\t\t\twhile (s.bl_count[bits] === 0)\n\t\t\t\t\tbits--;\n\t\t\t\ts.bl_count[bits]--; // move one leaf down the tree\n\t\t\t\ts.bl_count[bits + 1] += 2; // move one overflow item as its brother\n\t\t\t\ts.bl_count[max_length]--;\n\t\t\t\t// The brother of the overflow item also moves one step up,\n\t\t\t\t// but this does not affect bl_count[max_length]\n\t\t\t\toverflow -= 2;\n\t\t\t} while (overflow > 0);\n\n\t\t\tfor (bits = max_length; bits !== 0; bits--) {\n\t\t\t\tn = s.bl_count[bits];\n\t\t\t\twhile (n !== 0) {\n\t\t\t\t\tm = s.heap[--h];\n\t\t\t\t\tif (m > that.max_code)\n\t\t\t\t\t\tcontinue;\n\t\t\t\t\tif (tree[m * 2 + 1] != bits) {\n\t\t\t\t\t\ts.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];\n\t\t\t\t\t\ttree[m * 2 + 1] = bits;\n\t\t\t\t\t}\n\t\t\t\t\tn--;\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\n\t\t// Reverse the first len bits of a code, using straightforward code (a\n\t\t// faster\n\t\t// method would use a table)\n\t\t// IN assertion: 1 <= len <= 15\n\t\tfunction bi_reverse(code, // the value to invert\n\t\tlen // its bit length\n\t\t) {\n\t\t\tvar res = 0;\n\t\t\tdo {\n\t\t\t\tres |= code & 1;\n\t\t\t\tcode >>>= 1;\n\t\t\t\tres <<= 1;\n\t\t\t} while (--len > 0);\n\t\t\treturn res >>> 1;\n\t\t}\n\n\t\t// Generate the codes for a given tree and bit counts (which need not be\n\t\t// optimal).\n\t\t// IN assertion: the array bl_count contains the bit length statistics for\n\t\t// the given tree and the field len is set for all tree elements.\n\t\t// OUT assertion: the field code is set for all tree elements of non\n\t\t// zero code length.\n\t\tfunction gen_codes(tree, // the tree to decorate\n\t\tmax_code, // largest code with non zero frequency\n\t\tbl_count // number of codes at each bit length\n\t\t) {\n\t\t\tvar next_code = []; // next code value for each\n\t\t\t// bit length\n\t\t\tvar code = 0; // running code value\n\t\t\tvar bits; // bit index\n\t\t\tvar n; // code index\n\t\t\tvar len;\n\n\t\t\t// The distribution counts are first used to generate the code values\n\t\t\t// without bit reversal.\n\t\t\tfor (bits = 1; bits <= MAX_BITS; bits++) {\n\t\t\t\tnext_code[bits] = code = ((code + bl_count[bits - 1]) << 1);\n\t\t\t}\n\n\t\t\t// Check that the bit counts in bl_count are consistent. The last code\n\t\t\t// must be all ones.\n\t\t\t// Assert (code + bl_count[MAX_BITS]-1 == (1<<MAX_BITS)-1,\n\t\t\t// \"inconsistent bit counts\");\n\t\t\t// Tracev((stderr,\"\\ngen_codes: max_code %d \", max_code));\n\n\t\t\tfor (n = 0; n <= max_code; n++) {\n\t\t\t\tlen = tree[n * 2 + 1];\n\t\t\t\tif (len === 0)\n\t\t\t\t\tcontinue;\n\t\t\t\t// Now reverse the bits\n\t\t\t\ttree[n * 2] = bi_reverse(next_code[len]++, len);\n\t\t\t}\n\t\t}\n\n\t\t// Construct one Huffman tree and assigns the code bit strings and lengths.\n\t\t// Update the total bit length for the current block.\n\t\t// IN assertion: the field freq is set for all tree elements.\n\t\t// OUT assertions: the fields len and code are set to the optimal bit length\n\t\t// and corresponding code. The length opt_len is updated; static_len is\n\t\t// also updated if stree is not null. The field max_code is set.\n\t\tthat.build_tree = function(s) {\n\t\t\tvar tree = that.dyn_tree;\n\t\t\tvar stree = that.stat_desc.static_tree;\n\t\t\tvar elems = that.stat_desc.elems;\n\t\t\tvar n, m; // iterate over heap elements\n\t\t\tvar max_code = -1; // largest code with non zero frequency\n\t\t\tvar node; // new node being created\n\n\t\t\t// Construct the initial heap, with least frequent element in\n\t\t\t// heap[1]. The sons of heap[n] are heap[2*n] and heap[2*n+1].\n\t\t\t// heap[0] is not used.\n\t\t\ts.heap_len = 0;\n\t\t\ts.heap_max = HEAP_SIZE;\n\n\t\t\tfor (n = 0; n < elems; n++) {\n\t\t\t\tif (tree[n * 2] !== 0) {\n\t\t\t\t\ts.heap[++s.heap_len] = max_code = n;\n\t\t\t\t\ts.depth[n] = 0;\n\t\t\t\t} else {\n\t\t\t\t\ttree[n * 2 + 1] = 0;\n\t\t\t\t}\n\t\t\t}\n\n\t\t\t// The pkzip format requires that at least one distance code exists,\n\t\t\t// and that at least one bit should be sent even if there is only one\n\t\t\t// possible code. So to avoid special checks later on we force at least\n\t\t\t// two codes of non zero frequency.\n\t\t\twhile (s.heap_len < 2) {\n\t\t\t\tnode = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0;\n\t\t\t\ttree[node * 2] = 1;\n\t\t\t\ts.depth[node] = 0;\n\t\t\t\ts.opt_len--;\n\t\t\t\tif (stree)\n\t\t\t\t\ts.static_len -= stree[node * 2 + 1];\n\t\t\t\t// node is 0 or 1 so it does not have extra bits\n\t\t\t}\n\t\t\tthat.max_code = max_code;\n\n\t\t\t// The elements heap[heap_len/2+1 .. heap_len] are leaves of the tree,\n\t\t\t// establish sub-heaps of increasing lengths:\n\n\t\t\tfor (n = Math.floor(s.heap_len / 2); n >= 1; n--)\n\t\t\t\ts.pqdownheap(tree, n);\n\n\t\t\t// Construct the Huffman tree by repeatedly combining the least two\n\t\t\t// frequent nodes.\n\n\t\t\tnode = elems; // next internal node of the tree\n\t\t\tdo {\n\t\t\t\t// n = node of least frequency\n\t\t\t\tn = s.heap[1];\n\t\t\t\ts.heap[1] = s.heap[s.heap_len--];\n\t\t\t\ts.pqdownheap(tree, 1);\n\t\t\t\tm = s.heap[1]; // m = node of next least frequency\n\n\t\t\t\ts.heap[--s.heap_max] = n; // keep the nodes sorted by frequency\n\t\t\t\ts.heap[--s.heap_max] = m;\n\n\t\t\t\t// Create a new node father of n and m\n\t\t\t\ttree[node * 2] = (tree[n * 2] + tree[m * 2]);\n\t\t\t\ts.depth[node] = Math.max(s.depth[n], s.depth[m]) + 1;\n\t\t\t\ttree[n * 2 + 1] = tree[m * 2 + 1] = node;\n\n\t\t\t\t// and insert the new node in the heap\n\t\t\t\ts.heap[1] = node++;\n\t\t\t\ts.pqdownheap(tree, 1);\n\t\t\t} while (s.heap_len >= 2);\n\n\t\t\ts.heap[--s.heap_max] = s.heap[1];\n\n\t\t\t// At this point, the fields freq and dad are set. We can now\n\t\t\t// generate the bit lengths.\n\n\t\t\tgen_bitlen(s);\n\n\t\t\t// The field len is now set, we can generate the bit codes\n\t\t\tgen_codes(tree, that.max_code, s.bl_count);\n\t\t};\n\n\t}\n\n\tTree._length_code = [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 12, 12, 13, 13, 13, 13, 14, 14, 14, 14, 15, 15, 15, 15, 16, 16, 16, 16,\n\t\t\t16, 16, 16, 16, 17, 17, 17, 17, 17, 17, 17, 17, 18, 18, 18, 18, 18, 18, 18, 18, 19, 19, 19, 19, 19, 19, 19, 19, 20, 20, 20, 20, 20, 20, 20, 20, 20,\n\t\t\t20, 20, 20, 20, 20, 20, 20, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22,\n\t\t\t22, 22, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,\n\t\t\t24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25,\n\t\t\t25, 25, 25, 25, 25, 25, 25, 25, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26,\n\t\t\t26, 26, 26, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 28 ];\n\n\tTree.base_length = [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 0 ];\n\n\tTree.base_dist = [ 0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192, 12288, 16384,\n\t\t\t24576 ];\n\n\t// Mapping from a distance to a distance code. dist is the distance - 1 and\n\t// must not have side effects. _dist_code[256] and _dist_code[257] are never\n\t// used.\n\tTree.d_code = function(dist) {\n\t\treturn ((dist) < 256 ? _dist_code[dist] : _dist_code[256 + ((dist) >>> 7)]);\n\t};\n\n\t// extra bits for each length code\n\tTree.extra_lbits = [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0 ];\n\n\t// extra bits for each distance code\n\tTree.extra_dbits = [ 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13 ];\n\n\t// extra bits for each bit length code\n\tTree.extra_blbits = [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7 ];\n\n\tTree.bl_order = [ 16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15 ];\n\n\t// StaticTree\n\n\tfunction StaticTree(static_tree, extra_bits, extra_base, elems, max_length) {\n\t\tvar that = this;\n\t\tthat.static_tree = static_tree;\n\t\tthat.extra_bits = extra_bits;\n\t\tthat.extra_base = extra_base;\n\t\tthat.elems = elems;\n\t\tthat.max_length = max_length;\n\t}\n\n\tStaticTree.static_ltree = [ 12, 8, 140, 8, 76, 8, 204, 8, 44, 8, 172, 8, 108, 8, 236, 8, 28, 8, 156, 8, 92, 8, 220, 8, 60, 8, 188, 8, 124, 8, 252, 8, 2, 8,\n\t\t\t130, 8, 66, 8, 194, 8, 34, 8, 162, 8, 98, 8, 226, 8, 18, 8, 146, 8, 82, 8, 210, 8, 50, 8, 178, 8, 114, 8, 242, 8, 10, 8, 138, 8, 74, 8, 202, 8, 42,\n\t\t\t8, 170, 8, 106, 8, 234, 8, 26, 8, 154, 8, 90, 8, 218, 8, 58, 8, 186, 8, 122, 8, 250, 8, 6, 8, 134, 8, 70, 8, 198, 8, 38, 8, 166, 8, 102, 8, 230, 8,\n\t\t\t22, 8, 150, 8, 86, 8, 214, 8, 54, 8, 182, 8, 118, 8, 246, 8, 14, 8, 142, 8, 78, 8, 206, 8, 46, 8, 174, 8, 110, 8, 238, 8, 30, 8, 158, 8, 94, 8,\n\t\t\t222, 8, 62, 8, 190, 8, 126, 8, 254, 8, 1, 8, 129, 8, 65, 8, 193, 8, 33, 8, 161, 8, 97, 8, 225, 8, 17, 8, 145, 8, 81, 8, 209, 8, 49, 8, 177, 8, 113,\n\t\t\t8, 241, 8, 9, 8, 137, 8, 73, 8, 201, 8, 41, 8, 169, 8, 105, 8, 233, 8, 25, 8, 153, 8, 89, 8, 217, 8, 57, 8, 185, 8, 121, 8, 249, 8, 5, 8, 133, 8,\n\t\t\t69, 8, 197, 8, 37, 8, 165, 8, 101, 8, 229, 8, 21, 8, 149, 8, 85, 8, 213, 8, 53, 8, 181, 8, 117, 8, 245, 8, 13, 8, 141, 8, 77, 8, 205, 8, 45, 8,\n\t\t\t173, 8, 109, 8, 237, 8, 29, 8, 157, 8, 93, 8, 221, 8, 61, 8, 189, 8, 125, 8, 253, 8, 19, 9, 275, 9, 147, 9, 403, 9, 83, 9, 339, 9, 211, 9, 467, 9,\n\t\t\t51, 9, 307, 9, 179, 9, 435, 9, 115, 9, 371, 9, 243, 9, 499, 9, 11, 9, 267, 9, 139, 9, 395, 9, 75, 9, 331, 9, 203, 9, 459, 9, 43, 9, 299, 9, 171, 9,\n\t\t\t427, 9, 107, 9, 363, 9, 235, 9, 491, 9, 27, 9, 283, 9, 155, 9, 411, 9, 91, 9, 347, 9, 219, 9, 475, 9, 59, 9, 315, 9, 187, 9, 443, 9, 123, 9, 379,\n\t\t\t9, 251, 9, 507, 9, 7, 9, 263, 9, 135, 9, 391, 9, 71, 9, 327, 9, 199, 9, 455, 9, 39, 9, 295, 9, 167, 9, 423, 9, 103, 9, 359, 9, 231, 9, 487, 9, 23,\n\t\t\t9, 279, 9, 151, 9, 407, 9, 87, 9, 343, 9, 215, 9, 471, 9, 55, 9, 311, 9, 183, 9, 439, 9, 119, 9, 375, 9, 247, 9, 503, 9, 15, 9, 271, 9, 143, 9,\n\t\t\t399, 9, 79, 9, 335, 9, 207, 9, 463, 9, 47, 9, 303, 9, 175, 9, 431, 9, 111, 9, 367, 9, 239, 9, 495, 9, 31, 9, 287, 9, 159, 9, 415, 9, 95, 9, 351, 9,\n\t\t\t223, 9, 479, 9, 63, 9, 319, 9, 191, 9, 447, 9, 127, 9, 383, 9, 255, 9, 511, 9, 0, 7, 64, 7, 32, 7, 96, 7, 16, 7, 80, 7, 48, 7, 112, 7, 8, 7, 72, 7,\n\t\t\t40, 7, 104, 7, 24, 7, 88, 7, 56, 7, 120, 7, 4, 7, 68, 7, 36, 7, 100, 7, 20, 7, 84, 7, 52, 7, 116, 7, 3, 8, 131, 8, 67, 8, 195, 8, 35, 8, 163, 8,\n\t\t\t99, 8, 227, 8 ];\n\n\tStaticTree.static_dtree = [ 0, 5, 16, 5, 8, 5, 24, 5, 4, 5, 20, 5, 12, 5, 28, 5, 2, 5, 18, 5, 10, 5, 26, 5, 6, 5, 22, 5, 14, 5, 30, 5, 1, 5, 17, 5, 9, 5,\n\t\t\t25, 5, 5, 5, 21, 5, 13, 5, 29, 5, 3, 5, 19, 5, 11, 5, 27, 5, 7, 5, 23, 5 ];\n\n\tStaticTree.static_l_desc = new StaticTree(StaticTree.static_ltree, Tree.extra_lbits, LITERALS + 1, L_CODES, MAX_BITS);\n\n\tStaticTree.static_d_desc = new StaticTree(StaticTree.static_dtree, Tree.extra_dbits, 0, D_CODES, MAX_BITS);\n\n\tStaticTree.static_bl_desc = new StaticTree(null, Tree.extra_blbits, 0, BL_CODES, MAX_BL_BITS);\n\n\t// Deflate\n\n\tvar MAX_MEM_LEVEL = 9;\n\tvar DEF_MEM_LEVEL = 8;\n\n\tfunction Config(good_length, max_lazy, nice_length, max_chain, func) {\n\t\tvar that = this;\n\t\tthat.good_length = good_length;\n\t\tthat.max_lazy = max_lazy;\n\t\tthat.nice_length = nice_length;\n\t\tthat.max_chain = max_chain;\n\t\tthat.func = func;\n\t}\n\n\tvar STORED = 0;\n\tvar FAST = 1;\n\tvar SLOW = 2;\n\tvar config_table = [ new Config(0, 0, 0, 0, STORED), new Config(4, 4, 8, 4, FAST), new Config(4, 5, 16, 8, FAST), new Config(4, 6, 32, 32, FAST),\n\t\t\tnew Config(4, 4, 16, 16, SLOW), new Config(8, 16, 32, 32, SLOW), new Config(8, 16, 128, 128, SLOW), new Config(8, 32, 128, 256, SLOW),\n\t\t\tnew Config(32, 128, 258, 1024, SLOW), new Config(32, 258, 258, 4096, SLOW) ];\n\n\tvar z_errmsg = [ \"need dictionary\", // Z_NEED_DICT\n\t// 2\n\t\"stream end\", // Z_STREAM_END 1\n\t\"\", // Z_OK 0\n\t\"\", // Z_ERRNO (-1)\n\t\"stream error\", // Z_STREAM_ERROR (-2)\n\t\"data error\", // Z_DATA_ERROR (-3)\n\t\"\", // Z_MEM_ERROR (-4)\n\t\"buffer error\", // Z_BUF_ERROR (-5)\n\t\"\",// Z_VERSION_ERROR (-6)\n\t\"\" ];\n\n\t// block not completed, need more input or more output\n\tvar NeedMore = 0;\n\n\t// block flush performed\n\tvar BlockDone = 1;\n\n\t// finish started, need only more output at next deflate\n\tvar FinishStarted = 2;\n\n\t// finish done, accept no more input or output\n\tvar FinishDone = 3;\n\n\t// preset dictionary flag in zlib header\n\tvar PRESET_DICT = 0x20;\n\n\tvar INIT_STATE = 42;\n\tvar BUSY_STATE = 113;\n\tvar FINISH_STATE = 666;\n\n\t// The deflate compression method\n\tvar Z_DEFLATED = 8;\n\n\tvar STORED_BLOCK = 0;\n\tvar STATIC_TREES = 1;\n\tvar DYN_TREES = 2;\n\n\tvar MIN_MATCH = 3;\n\tvar MAX_MATCH = 258;\n\tvar MIN_LOOKAHEAD = (MAX_MATCH + MIN_MATCH + 1);\n\n\tfunction smaller(tree, n, m, depth) {\n\t\tvar tn2 = tree[n * 2];\n\t\tvar tm2 = tree[m * 2];\n\t\treturn (tn2 < tm2 || (tn2 == tm2 && depth[n] <= depth[m]));\n\t}\n\n\tfunction Deflate() {\n\n\t\tvar that = this;\n\t\tvar strm; // pointer back to this zlib stream\n\t\tvar status; // as the name implies\n\t\t// pending_buf; // output still pending\n\t\tvar pending_buf_size; // size of pending_buf\n\t\t// pending_out; // next pending byte to output to the stream\n\t\t// pending; // nb of bytes in the pending buffer\n\t\tvar method; // STORED (for zip only) or DEFLATED\n\t\tvar last_flush; // value of flush param for previous deflate call\n\n\t\tvar w_size; // LZ77 window size (32K by default)\n\t\tvar w_bits; // log2(w_size) (8..16)\n\t\tvar w_mask; // w_size - 1\n\n\t\tvar window;\n\t\t// Sliding window. Input bytes are read into the second half of the window,\n\t\t// and move to the first half later to keep a dictionary of at least wSize\n\t\t// bytes. With this organization, matches are limited to a distance of\n\t\t// wSize-MAX_MATCH bytes, but this ensures that IO is always\n\t\t// performed with a length multiple of the block size. Also, it limits\n\t\t// the window size to 64K, which is quite useful on MSDOS.\n\t\t// To do: use the user input buffer as sliding window.\n\n\t\tvar window_size;\n\t\t// Actual size of window: 2*wSize, except when the user input buffer\n\t\t// is directly used as sliding window.\n\n\t\tvar prev;\n\t\t// Link to older string with same hash index. To limit the size of this\n\t\t// array to 64K, this link is maintained only for the last 32K strings.\n\t\t// An index in this array is thus a window index modulo 32K.\n\n\t\tvar head; // Heads of the hash chains or NIL.\n\n\t\tvar ins_h; // hash index of string to be inserted\n\t\tvar hash_size; // number of elements in hash table\n\t\tvar hash_bits; // log2(hash_size)\n\t\tvar hash_mask; // hash_size-1\n\n\t\t// Number of bits by which ins_h must be shifted at each input\n\t\t// step. It must be such that after MIN_MATCH steps, the oldest\n\t\t// byte no longer takes part in the hash key, that is:\n\t\t// hash_shift * MIN_MATCH >= hash_bits\n\t\tvar hash_shift;\n\n\t\t// Window position at the beginning of the current output block. Gets\n\t\t// negative when the window is moved backwards.\n\n\t\tvar block_start;\n\n\t\tvar match_length; // length of best match\n\t\tvar prev_match; // previous match\n\t\tvar match_available; // set if previous match exists\n\t\tvar strstart; // start of string to insert\n\t\tvar match_start; // start of matching string\n\t\tvar lookahead; // number of valid bytes ahead in window\n\n\t\t// Length of the best match at previous step. Matches not greater than this\n\t\t// are discarded. This is used in the lazy match evaluation.\n\t\tvar prev_length;\n\n\t\t// To speed up deflation, hash chains are never searched beyond this\n\t\t// length. A higher limit improves compression ratio but degrades the speed.\n\t\tvar max_chain_length;\n\n\t\t// Attempt to find a better match only when the current match is strictly\n\t\t// smaller than this value. This mechanism is used only for compression\n\t\t// levels >= 4.\n\t\tvar max_lazy_match;\n\n\t\t// Insert new strings in the hash table only if the match length is not\n\t\t// greater than this length. This saves time but degrades compression.\n\t\t// max_insert_length is used only for compression levels <= 3.\n\n\t\tvar level; // compression level (1..9)\n\t\tvar strategy; // favor or force Huffman coding\n\n\t\t// Use a faster search when the previous match is longer than this\n\t\tvar good_match;\n\n\t\t// Stop searching when current match exceeds this\n\t\tvar nice_match;\n\n\t\tvar dyn_ltree; // literal and length tree\n\t\tvar dyn_dtree; // distance tree\n\t\tvar bl_tree; // Huffman tree for bit lengths\n\n\t\tvar l_desc = new Tree(); // desc for literal tree\n\t\tvar d_desc = new Tree(); // desc for distance tree\n\t\tvar bl_desc = new Tree(); // desc for bit length tree\n\n\t\t// that.heap_len; // number of elements in the heap\n\t\t// that.heap_max; // element of largest frequency\n\t\t// The sons of heap[n] are heap[2*n] and heap[2*n+1]. heap[0] is not used.\n\t\t// The same heap array is used to build all trees.\n\n\t\t// Depth of each subtree used as tie breaker for trees of equal frequency\n\t\tthat.depth = [];\n\n\t\tvar l_buf; // index for literals or lengths */\n\n\t\t// Size of match buffer for literals/lengths. There are 4 reasons for\n\t\t// limiting lit_bufsize to 64K:\n\t\t// - frequencies can be kept in 16 bit counters\n\t\t// - if compression is not successful for the first block, all input\n\t\t// data is still in the window so we can still emit a stored block even\n\t\t// when input comes from standard input. (This can also be done for\n\t\t// all blocks if lit_bufsize is not greater than 32K.)\n\t\t// - if compression is not successful for a file smaller than 64K, we can\n\t\t// even emit a stored file instead of a stored block (saving 5 bytes).\n\t\t// This is applicable only for zip (not gzip or zlib).\n\t\t// - creating new Huffman trees less frequently may not provide fast\n\t\t// adaptation to changes in the input data statistics. (Take for\n\t\t// example a binary file with poorly compressible code followed by\n\t\t// a highly compressible string table.) Smaller buffer sizes give\n\t\t// fast adaptation but have of course the overhead of transmitting\n\t\t// trees more frequently.\n\t\t// - I can't count above 4\n\t\tvar lit_bufsize;\n\n\t\tvar last_lit; // running index in l_buf\n\n\t\t// Buffer for distances. To simplify the code, d_buf and l_buf have\n\t\t// the same number of elements. To use different lengths, an extra flag\n\t\t// array would be necessary.\n\n\t\tvar d_buf; // index of pendig_buf\n\n\t\t// that.opt_len; // bit length of current block with optimal trees\n\t\t// that.static_len; // bit length of current block with static trees\n\t\tvar matches; // number of string matches in current block\n\t\tvar last_eob_len; // bit length of EOB code for last block\n\n\t\t// Output buffer. bits are inserted starting at the bottom (least\n\t\t// significant bits).\n\t\tvar bi_buf;\n\n\t\t// Number of valid bits in bi_buf. All bits above the last valid bit\n\t\t// are always zero.\n\t\tvar bi_valid;\n\n\t\t// number of codes at each bit length for an optimal tree\n\t\tthat.bl_count = [];\n\n\t\t// heap used to build the Huffman trees\n\t\tthat.heap = [];\n\n\t\tdyn_ltree = [];\n\t\tdyn_dtree = [];\n\t\tbl_tree = [];\n\n\t\tfunction lm_init() {\n\t\t\tvar i;\n\t\t\twindow_size = 2 * w_size;\n\n\t\t\thead[hash_size - 1] = 0;\n\t\t\tfor (i = 0; i < hash_size - 1; i++) {\n\t\t\t\thead[i] = 0;\n\t\t\t}\n\n\t\t\t// Set the default configuration parameters:\n\t\t\tmax_lazy_match = config_table[level].max_lazy;\n\t\t\tgood_match = config_table[level].good_length;\n\t\t\tnice_match = config_table[level].nice_length;\n\t\t\tmax_chain_length = config_table[level].max_chain;\n\n\t\t\tstrstart = 0;\n\t\t\tblock_start = 0;\n\t\t\tlookahead = 0;\n\t\t\tmatch_length = prev_length = MIN_MATCH - 1;\n\t\t\tmatch_available = 0;\n\t\t\tins_h = 0;\n\t\t}\n\n\t\tfunction init_block() {\n\t\t\tvar i;\n\t\t\t// Initialize the trees.\n\t\t\tfor (i = 0; i < L_CODES; i++)\n\t\t\t\tdyn_ltree[i * 2] = 0;\n\t\t\tfor (i = 0; i < D_CODES; i++)\n\t\t\t\tdyn_dtree[i * 2] = 0;\n\t\t\tfor (i = 0; i < BL_CODES; i++)\n\t\t\t\tbl_tree[i * 2] = 0;\n\n\t\t\tdyn_ltree[END_BLOCK * 2] = 1;\n\t\t\tthat.opt_len = that.static_len = 0;\n\t\t\tlast_lit = matches = 0;\n\t\t}\n\n\t\t// Initialize the tree data structures for a new zlib stream.\n\t\tfunction tr_init() {\n\n\t\t\tl_desc.dyn_tree = dyn_ltree;\n\t\t\tl_desc.stat_desc = StaticTree.static_l_desc;\n\n\t\t\td_desc.dyn_tree = dyn_dtree;\n\t\t\td_desc.stat_desc = StaticTree.static_d_desc;\n\n\t\t\tbl_desc.dyn_tree = bl_tree;\n\t\t\tbl_desc.stat_desc = StaticTree.static_bl_desc;\n\n\t\t\tbi_buf = 0;\n\t\t\tbi_valid = 0;\n\t\t\tlast_eob_len = 8; // enough lookahead for inflate\n\n\t\t\t// Initialize the first block of the first file:\n\t\t\tinit_block();\n\t\t}\n\n\t\t// Restore the heap property by moving down the tree starting at node k,\n\t\t// exchanging a node with the smallest of its two sons if necessary,\n\t\t// stopping\n\t\t// when the heap property is re-established (each father smaller than its\n\t\t// two sons).\n\t\tthat.pqdownheap = function(tree, // the tree to restore\n\t\tk // node to move down\n\t\t) {\n\t\t\tvar heap = that.heap;\n\t\t\tvar v = heap[k];\n\t\t\tvar j = k << 1; // left son of k\n\t\t\twhile (j <= that.heap_len) {\n\t\t\t\t// Set j to the smallest of the two sons:\n\t\t\t\tif (j < that.heap_len && smaller(tree, heap[j + 1], heap[j], that.depth)) {\n\t\t\t\t\tj++;\n\t\t\t\t}\n\t\t\t\t// Exit if v is smaller than both sons\n\t\t\t\tif (smaller(tree, v, heap[j], that.depth))\n\t\t\t\t\tbreak;\n\n\t\t\t\t// Exchange v with the smallest son\n\t\t\t\theap[k] = heap[j];\n\t\t\t\tk = j;\n\t\t\t\t// And continue down the tree, setting j to the left son of k\n\t\t\t\tj <<= 1;\n\t\t\t}\n\t\t\theap[k] = v;\n\t\t};\n\n\t\t// Scan a literal or distance tree to determine the frequencies of the codes\n\t\t// in the bit length tree.\n\t\tfunction scan_tree(tree,// the tree to be scanned\n\t\tmax_code // and its largest code of non zero frequency\n\t\t) {\n\t\t\tvar n; // iterates over all tree elements\n\t\t\tvar prevlen = -1; // last emitted length\n\t\t\tvar curlen; // length of current code\n\t\t\tvar nextlen = tree[0 * 2 + 1]; // length of next code\n\t\t\tvar count = 0; // repeat count of the current code\n\t\t\tvar max_count = 7; // max repeat count\n\t\t\tvar min_count = 4; // min repeat count\n\n\t\t\tif (nextlen === 0) {\n\t\t\t\tmax_count = 138;\n\t\t\t\tmin_count = 3;\n\t\t\t}\n\t\t\ttree[(max_code + 1) * 2 + 1] = 0xffff; // guard\n\n\t\t\tfor (n = 0; n <= max_code; n++) {\n\t\t\t\tcurlen = nextlen;\n\t\t\t\tnextlen = tree[(n + 1) * 2 + 1];\n\t\t\t\tif (++count < max_count && curlen == nextlen) {\n\t\t\t\t\tcontinue;\n\t\t\t\t} else if (count < min_count) {\n\t\t\t\t\tbl_tree[curlen * 2] += count;\n\t\t\t\t} else if (curlen !== 0) {\n\t\t\t\t\tif (curlen != prevlen)\n\t\t\t\t\t\tbl_tree[curlen * 2]++;\n\t\t\t\t\tbl_tree[REP_3_6 * 2]++;\n\t\t\t\t} else if (count <= 10) {\n\t\t\t\t\tbl_tree[REPZ_3_10 * 2]++;\n\t\t\t\t} else {\n\t\t\t\t\tbl_tree[REPZ_11_138 * 2]++;\n\t\t\t\t}\n\t\t\t\tcount = 0;\n\t\t\t\tprevlen = curlen;\n\t\t\t\tif (nextlen === 0) {\n\t\t\t\t\tmax_count = 138;\n\t\t\t\t\tmin_count = 3;\n\t\t\t\t} else if (curlen == nextlen) {\n\t\t\t\t\tmax_count = 6;\n\t\t\t\t\tmin_count = 3;\n\t\t\t\t} else {\n\t\t\t\t\tmax_count = 7;\n\t\t\t\t\tmin_count = 4;\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\n\t\t// Construct the Huffman tree for the bit lengths and return the index in\n\t\t// bl_order of the last bit length code to send.\n\t\tfunction build_bl_tree() {\n\t\t\tvar max_blindex; // index of last bit length code of non zero freq\n\n\t\t\t// Determine the bit length frequencies for literal and distance trees\n\t\t\tscan_tree(dyn_ltree, l_desc.max_code);\n\t\t\tscan_tree(dyn_dtree, d_desc.max_code);\n\n\t\t\t// Build the bit length tree:\n\t\t\tbl_desc.build_tree(that);\n\t\t\t// opt_len now includes the length of the tree representations, except\n\t\t\t// the lengths of the bit lengths codes and the 5+5+4 bits for the\n\t\t\t// counts.\n\n\t\t\t// Determine the number of bit length codes to send. The pkzip format\n\t\t\t// requires that at least 4 bit length codes be sent. (appnote.txt says\n\t\t\t// 3 but the actual value used is 4.)\n\t\t\tfor (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) {\n\t\t\t\tif (bl_tree[Tree.bl_order[max_blindex] * 2 + 1] !== 0)\n\t\t\t\t\tbreak;\n\t\t\t}\n\t\t\t// Update opt_len to include the bit length tree and counts\n\t\t\tthat.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;\n\n\t\t\treturn max_blindex;\n\t\t}\n\n\t\t// Output a byte on the stream.\n\t\t// IN assertion: there is enough room in pending_buf.\n\t\tfunction put_byte(p) {\n\t\t\tthat.pending_buf[that.pending++] = p;\n\t\t}\n\n\t\tfunction put_short(w) {\n\t\t\tput_byte(w & 0xff);\n\t\t\tput_byte((w >>> 8) & 0xff);\n\t\t}\n\n\t\tfunction putShortMSB(b) {\n\t\t\tput_byte((b >> 8) & 0xff);\n\t\t\tput_byte((b & 0xff) & 0xff);\n\t\t}\n\n\t\tfunction send_bits(value, length) {\n\t\t\tvar val, len = length;\n\t\t\tif (bi_valid > Buf_size - len) {\n\t\t\t\tval = value;\n\t\t\t\t// bi_buf |= (val << bi_valid);\n\t\t\t\tbi_buf |= ((val << bi_valid) & 0xffff);\n\t\t\t\tput_short(bi_buf);\n\t\t\t\tbi_buf = val >>> (Buf_size - bi_valid);\n\t\t\t\tbi_valid += len - Buf_size;\n\t\t\t} else {\n\t\t\t\t// bi_buf |= (value) << bi_valid;\n\t\t\t\tbi_buf |= (((value) << bi_valid) & 0xffff);\n\t\t\t\tbi_valid += len;\n\t\t\t}\n\t\t}\n\n\t\tfunction send_code(c, tree) {\n\t\t\tvar c2 = c * 2;\n\t\t\tsend_bits(tree[c2] & 0xffff, tree[c2 + 1] & 0xffff);\n\t\t}\n\n\t\t// Send a literal or distance tree in compressed form, using the codes in\n\t\t// bl_tree.\n\t\tfunction send_tree(tree,// the tree to be sent\n\t\tmax_code // and its largest code of non zero frequency\n\t\t) {\n\t\t\tvar n; // iterates over all tree elements\n\t\t\tvar prevlen = -1; // last emitted length\n\t\t\tvar curlen; // length of current code\n\t\t\tvar nextlen = tree[0 * 2 + 1]; // length of next code\n\t\t\tvar count = 0; // repeat count of the current code\n\t\t\tvar max_count = 7; // max repeat count\n\t\t\tvar min_count = 4; // min repeat count\n\n\t\t\tif (nextlen === 0) {\n\t\t\t\tmax_count = 138;\n\t\t\t\tmin_count = 3;\n\t\t\t}\n\n\t\t\tfor (n = 0; n <= max_code; n++) {\n\t\t\t\tcurlen = nextlen;\n\t\t\t\tnextlen = tree[(n + 1) * 2 + 1];\n\t\t\t\tif (++count < max_count && curlen == nextlen) {\n\t\t\t\t\tcontinue;\n\t\t\t\t} else if (count < min_count) {\n\t\t\t\t\tdo {\n\t\t\t\t\t\tsend_code(curlen, bl_tree);\n\t\t\t\t\t} while (--count !== 0);\n\t\t\t\t} else if (curlen !== 0) {\n\t\t\t\t\tif (curlen != prevlen) {\n\t\t\t\t\t\tsend_code(curlen, bl_tree);\n\t\t\t\t\t\tcount--;\n\t\t\t\t\t}\n\t\t\t\t\tsend_code(REP_3_6, bl_tree);\n\t\t\t\t\tsend_bits(count - 3, 2);\n\t\t\t\t} else if (count <= 10) {\n\t\t\t\t\tsend_code(REPZ_3_10, bl_tree);\n\t\t\t\t\tsend_bits(count - 3, 3);\n\t\t\t\t} else {\n\t\t\t\t\tsend_code(REPZ_11_138, bl_tree);\n\t\t\t\t\tsend_bits(count - 11, 7);\n\t\t\t\t}\n\t\t\t\tcount = 0;\n\t\t\t\tprevlen = curlen;\n\t\t\t\tif (nextlen === 0) {\n\t\t\t\t\tmax_count = 138;\n\t\t\t\t\tmin_count = 3;\n\t\t\t\t} else if (curlen == nextlen) {\n\t\t\t\t\tmax_count = 6;\n\t\t\t\t\tmin_count = 3;\n\t\t\t\t} else {\n\t\t\t\t\tmax_count = 7;\n\t\t\t\t\tmin_count = 4;\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\n\t\t// Send the header for a block using dynamic Huffman trees: the counts, the\n\t\t// lengths of the bit length codes, the literal tree and the distance tree.\n\t\t// IN assertion: lcodes >= 257, dcodes >= 1, blcodes >= 4.\n\t\tfunction send_all_trees(lcodes, dcodes, blcodes) {\n\t\t\tvar rank; // index in bl_order\n\n\t\t\tsend_bits(lcodes - 257, 5); // not +255 as stated in appnote.txt\n\t\t\tsend_bits(dcodes - 1, 5);\n\t\t\tsend_bits(blcodes - 4, 4); // not -3 as stated in appnote.txt\n\t\t\tfor (rank = 0; rank < blcodes; rank++) {\n\t\t\t\tsend_bits(bl_tree[Tree.bl_order[rank] * 2 + 1], 3);\n\t\t\t}\n\t\t\tsend_tree(dyn_ltree, lcodes - 1); // literal tree\n\t\t\tsend_tree(dyn_dtree, dcodes - 1); // distance tree\n\t\t}\n\n\t\t// Flush the bit buffer, keeping at most 7 bits in it.\n\t\tfunction bi_flush() {\n\t\t\tif (bi_valid == 16) {\n\t\t\t\tput_short(bi_buf);\n\t\t\t\tbi_buf = 0;\n\t\t\t\tbi_valid = 0;\n\t\t\t} else if (bi_valid >= 8) {\n\t\t\t\tput_byte(bi_buf & 0xff);\n\t\t\t\tbi_buf >>>= 8;\n\t\t\t\tbi_valid -= 8;\n\t\t\t}\n\t\t}\n\n\t\t// Send one empty static block to give enough lookahead for inflate.\n\t\t// This takes 10 bits, of which 7 may remain in the bit buffer.\n\t\t// The current inflate code requires 9 bits of lookahead. If the\n\t\t// last two codes for the previous block (real code plus EOB) were coded\n\t\t// on 5 bits or less, inflate may have only 5+3 bits of lookahead to decode\n\t\t// the last real code. In this case we send two empty static blocks instead\n\t\t// of one. (There are no problems if the previous block is stored or fixed.)\n\t\t// To simplify the code, we assume the worst case of last real code encoded\n\t\t// on one bit only.\n\t\tfunction _tr_align() {\n\t\t\tsend_bits(STATIC_TREES << 1, 3);\n\t\t\tsend_code(END_BLOCK, StaticTree.static_ltree);\n\n\t\t\tbi_flush();\n\n\t\t\t// Of the 10 bits for the empty block, we have already sent\n\t\t\t// (10 - bi_valid) bits. The lookahead for the last real code (before\n\t\t\t// the EOB of the previous block) was thus at least one plus the length\n\t\t\t// of the EOB plus what we have just sent of the empty static block.\n\t\t\tif (1 + last_eob_len + 10 - bi_valid < 9) {\n\t\t\t\tsend_bits(STATIC_TREES << 1, 3);\n\t\t\t\tsend_code(END_BLOCK, StaticTree.static_ltree);\n\t\t\t\tbi_flush();\n\t\t\t}\n\t\t\tlast_eob_len = 7;\n\t\t}\n\n\t\t// Save the match info and tally the frequency counts. Return true if\n\t\t// the current block must be flushed.\n\t\tfunction _tr_tally(dist, // distance of matched string\n\t\tlc // match length-MIN_MATCH or unmatched char (if dist==0)\n\t\t) {\n\t\t\tvar out_length, in_length, dcode;\n\t\t\tthat.pending_buf[d_buf + last_lit * 2] = (dist >>> 8) & 0xff;\n\t\t\tthat.pending_buf[d_buf + last_lit * 2 + 1] = dist & 0xff;\n\n\t\t\tthat.pending_buf[l_buf + last_lit] = lc & 0xff;\n\t\t\tlast_lit++;\n\n\t\t\tif (dist === 0) {\n\t\t\t\t// lc is the unmatched char\n\t\t\t\tdyn_ltree[lc * 2]++;\n\t\t\t} else {\n\t\t\t\tmatches++;\n\t\t\t\t// Here, lc is the match length - MIN_MATCH\n\t\t\t\tdist--; // dist = match distance - 1\n\t\t\t\tdyn_ltree[(Tree._length_code[lc] + LITERALS + 1) * 2]++;\n\t\t\t\tdyn_dtree[Tree.d_code(dist) * 2]++;\n\t\t\t}\n\n\t\t\tif ((last_lit & 0x1fff) === 0 && level > 2) {\n\t\t\t\t// Compute an upper bound for the compressed length\n\t\t\t\tout_length = last_lit * 8;\n\t\t\t\tin_length = strstart - block_start;\n\t\t\t\tfor (dcode = 0; dcode < D_CODES; dcode++) {\n\t\t\t\t\tout_length += dyn_dtree[dcode * 2] * (5 + Tree.extra_dbits[dcode]);\n\t\t\t\t}\n\t\t\t\tout_length >>>= 3;\n\t\t\t\tif ((matches < Math.floor(last_lit / 2)) && out_length < Math.floor(in_length / 2))\n\t\t\t\t\treturn true;\n\t\t\t}\n\n\t\t\treturn (last_lit == lit_bufsize - 1);\n\t\t\t// We avoid equality with lit_bufsize because of wraparound at 64K\n\t\t\t// on 16 bit machines and because stored blocks are restricted to\n\t\t\t// 64K-1 bytes.\n\t\t}\n\n\t\t// Send the block data compressed using the given Huffman trees\n\t\tfunction compress_block(ltree, dtree) {\n\t\t\tvar dist; // distance of matched string\n\t\t\tvar lc; // match length or unmatched char (if dist === 0)\n\t\t\tvar lx = 0; // running index in l_buf\n\t\t\tvar code; // the code to send\n\t\t\tvar extra; // number of extra bits to send\n\n\t\t\tif (last_lit !== 0) {\n\t\t\t\tdo {\n\t\t\t\t\tdist = ((that.pending_buf[d_buf + lx * 2] << 8) & 0xff00) | (that.pending_buf[d_buf + lx * 2 + 1] & 0xff);\n\t\t\t\t\tlc = (that.pending_buf[l_buf + lx]) & 0xff;\n\t\t\t\t\tlx++;\n\n\t\t\t\t\tif (dist === 0) {\n\t\t\t\t\t\tsend_code(lc, ltree); // send a literal byte\n\t\t\t\t\t} else {\n\t\t\t\t\t\t// Here, lc is the match length - MIN_MATCH\n\t\t\t\t\t\tcode = Tree._length_code[lc];\n\n\t\t\t\t\t\tsend_code(code + LITERALS + 1, ltree); // send the length\n\t\t\t\t\t\t// code\n\t\t\t\t\t\textra = Tree.extra_lbits[code];\n\t\t\t\t\t\tif (extra !== 0) {\n\t\t\t\t\t\t\tlc -= Tree.base_length[code];\n\t\t\t\t\t\t\tsend_bits(lc, extra); // send the extra length bits\n\t\t\t\t\t\t}\n\t\t\t\t\t\tdist--; // dist is now the match distance - 1\n\t\t\t\t\t\tcode = Tree.d_code(dist);\n\n\t\t\t\t\t\tsend_code(code, dtree); // send the distance code\n\t\t\t\t\t\textra = Tree.extra_dbits[code];\n\t\t\t\t\t\tif (extra !== 0) {\n\t\t\t\t\t\t\tdist -= Tree.base_dist[code];\n\t\t\t\t\t\t\tsend_bits(dist, extra); // send the extra distance bits\n\t\t\t\t\t\t}\n\t\t\t\t\t} // literal or match pair ?\n\n\t\t\t\t\t// Check that the overlay between pending_buf and d_buf+l_buf is\n\t\t\t\t\t// ok:\n\t\t\t\t} while (lx < last_lit);\n\t\t\t}\n\n\t\t\tsend_code(END_BLOCK, ltree);\n\t\t\tlast_eob_len = ltree[END_BLOCK * 2 + 1];\n\t\t}\n\n\t\t// Flush the bit buffer and align the output on a byte boundary\n\t\tfunction bi_windup() {\n\t\t\tif (bi_valid > 8) {\n\t\t\t\tput_short(bi_buf);\n\t\t\t} else if (bi_valid > 0) {\n\t\t\t\tput_byte(bi_buf & 0xff);\n\t\t\t}\n\t\t\tbi_buf = 0;\n\t\t\tbi_valid = 0;\n\t\t}\n\n\t\t// Copy a stored block, storing first the length and its\n\t\t// one's complement if requested.\n\t\tfunction copy_block(buf, // the input data\n\t\tlen, // its length\n\t\theader // true if block header must be written\n\t\t) {\n\t\t\tbi_windup(); // align on byte boundary\n\t\t\tlast_eob_len = 8; // enough lookahead for inflate\n\n\t\t\tif (header) {\n\t\t\t\tput_short(len);\n\t\t\t\tput_short(~len);\n\t\t\t}\n\n\t\t\tthat.pending_buf.set(window.subarray(buf, buf + len), that.pending);\n\t\t\tthat.pending += len;\n\t\t}\n\n\t\t// Send a stored block\n\t\tfunction _tr_stored_block(buf, // input block\n\t\tstored_len, // length of input block\n\t\teof // true if this is the last block for a file\n\t\t) {\n\t\t\tsend_bits((STORED_BLOCK << 1) + (eof ? 1 : 0), 3); // send block type\n\t\t\tcopy_block(buf, stored_len, true); // with header\n\t\t}\n\n\t\t// Determine the best encoding for the current block: dynamic trees, static\n\t\t// trees or store, and output the encoded block to the zip file.\n\t\tfunction _tr_flush_block(buf, // input block, or NULL if too old\n\t\tstored_len, // length of input block\n\t\teof // true if this is the last block for a file\n\t\t) {\n\t\t\tvar opt_lenb, static_lenb;// opt_len and static_len in bytes\n\t\t\tvar max_blindex = 0; // index of last bit length code of non zero freq\n\n\t\t\t// Build the Huffman trees unless a stored block is forced\n\t\t\tif (level > 0) {\n\t\t\t\t// Construct the literal and distance trees\n\t\t\t\tl_desc.build_tree(that);\n\n\t\t\t\td_desc.build_tree(that);\n\n\t\t\t\t// At this point, opt_len and static_len are the total bit lengths\n\t\t\t\t// of\n\t\t\t\t// the compressed block data, excluding the tree representations.\n\n\t\t\t\t// Build the bit length tree for the above two trees, and get the\n\t\t\t\t// index\n\t\t\t\t// in bl_order of the last bit length code to send.\n\t\t\t\tmax_blindex = build_bl_tree();\n\n\t\t\t\t// Determine the best encoding. Compute first the block length in\n\t\t\t\t// bytes\n\t\t\t\topt_lenb = (that.opt_len + 3 + 7) >>> 3;\n\t\t\t\tstatic_lenb = (that.static_len + 3 + 7) >>> 3;\n\n\t\t\t\tif (static_lenb <= opt_lenb)\n\t\t\t\t\topt_lenb = static_lenb;\n\t\t\t} else {\n\t\t\t\topt_lenb = static_lenb = stored_len + 5; // force a stored block\n\t\t\t}\n\n\t\t\tif ((stored_len + 4 <= opt_lenb) && buf != -1) {\n\t\t\t\t// 4: two words for the lengths\n\t\t\t\t// The test buf != NULL is only necessary if LIT_BUFSIZE > WSIZE.\n\t\t\t\t// Otherwise we can't have processed more than WSIZE input bytes\n\t\t\t\t// since\n\t\t\t\t// the last block flush, because compression would have been\n\t\t\t\t// successful. If LIT_BUFSIZE <= WSIZE, it is never too late to\n\t\t\t\t// transform a block into a stored block.\n\t\t\t\t_tr_stored_block(buf, stored_len, eof);\n\t\t\t} else if (static_lenb == opt_lenb) {\n\t\t\t\tsend_bits((STATIC_TREES << 1) + (eof ? 1 : 0), 3);\n\t\t\t\tcompress_block(StaticTree.static_ltree, StaticTree.static_dtree);\n\t\t\t} else {\n\t\t\t\tsend_bits((DYN_TREES << 1) + (eof ? 1 : 0), 3);\n\t\t\t\tsend_all_trees(l_desc.max_code + 1, d_desc.max_code + 1, max_blindex + 1);\n\t\t\t\tcompress_block(dyn_ltree, dyn_dtree);\n\t\t\t}\n\n\t\t\t// The above check is made mod 2^32, for files larger than 512 MB\n\t\t\t// and uLong implemented on 32 bits.\n\n\t\t\tinit_block();\n\n\t\t\tif (eof) {\n\t\t\t\tbi_windup();\n\t\t\t}\n\t\t}\n\n\t\tfunction flush_block_only(eof) {\n\t\t\t_tr_flush_block(block_start >= 0 ? block_start : -1, strstart - block_start, eof);\n\t\t\tblock_start = strstart;\n\t\t\tstrm.flush_pending();\n\t\t}\n\n\t\t// Fill the window when the lookahead becomes insufficient.\n\t\t// Updates strstart and lookahead.\n\t\t//\n\t\t// IN assertion: lookahead < MIN_LOOKAHEAD\n\t\t// OUT assertions: strstart <= window_size-MIN_LOOKAHEAD\n\t\t// At least one byte has been read, or avail_in === 0; reads are\n\t\t// performed for at least two bytes (required for the zip translate_eol\n\t\t// option -- not supported here).\n\t\tfunction fill_window() {\n\t\t\tvar n, m;\n\t\t\tvar p;\n\t\t\tvar more; // Amount of free space at the end of the window.\n\n\t\t\tdo {\n\t\t\t\tmore = (window_size - lookahead - strstart);\n\n\t\t\t\t// Deal with !@#$% 64K limit:\n\t\t\t\tif (more === 0 && strstart === 0 && lookahead === 0) {\n\t\t\t\t\tmore = w_size;\n\t\t\t\t} else if (more == -1) {\n\t\t\t\t\t// Very unlikely, but possible on 16 bit machine if strstart ==\n\t\t\t\t\t// 0\n\t\t\t\t\t// and lookahead == 1 (input done one byte at time)\n\t\t\t\t\tmore--;\n\n\t\t\t\t\t// If the window is almost full and there is insufficient\n\t\t\t\t\t// lookahead,\n\t\t\t\t\t// move the upper half to the lower one to make room in the\n\t\t\t\t\t// upper half.\n\t\t\t\t} else if (strstart >= w_size + w_size - MIN_LOOKAHEAD) {\n\t\t\t\t\twindow.set(window.subarray(w_size, w_size + w_size), 0);\n\n\t\t\t\t\tmatch_start -= w_size;\n\t\t\t\t\tstrstart -= w_size; // we now have strstart >= MAX_DIST\n\t\t\t\t\tblock_start -= w_size;\n\n\t\t\t\t\t// Slide the hash table (could be avoided with 32 bit values\n\t\t\t\t\t// at the expense of memory usage). We slide even when level ==\n\t\t\t\t\t// 0\n\t\t\t\t\t// to keep the hash table consistent if we switch back to level\n\t\t\t\t\t// > 0\n\t\t\t\t\t// later. (Using level 0 permanently is not an optimal usage of\n\t\t\t\t\t// zlib, so we don't care about this pathological case.)\n\n\t\t\t\t\tn = hash_size;\n\t\t\t\t\tp = n;\n\t\t\t\t\tdo {\n\t\t\t\t\t\tm = (head[--p] & 0xffff);\n\t\t\t\t\t\thead[p] = (m >= w_size ? m - w_size : 0);\n\t\t\t\t\t} while (--n !== 0);\n\n\t\t\t\t\tn = w_size;\n\t\t\t\t\tp = n;\n\t\t\t\t\tdo {\n\t\t\t\t\t\tm = (prev[--p] & 0xffff);\n\t\t\t\t\t\tprev[p] = (m >= w_size ? m - w_size : 0);\n\t\t\t\t\t\t// If n is not on any hash chain, prev[n] is garbage but\n\t\t\t\t\t\t// its value will never be used.\n\t\t\t\t\t} while (--n !== 0);\n\t\t\t\t\tmore += w_size;\n\t\t\t\t}\n\n\t\t\t\tif (strm.avail_in === 0)\n\t\t\t\t\treturn;\n\n\t\t\t\t// If there was no sliding:\n\t\t\t\t// strstart <= WSIZE+MAX_DIST-1 && lookahead <= MIN_LOOKAHEAD - 1 &&\n\t\t\t\t// more == window_size - lookahead - strstart\n\t\t\t\t// => more >= window_size - (MIN_LOOKAHEAD-1 + WSIZE + MAX_DIST-1)\n\t\t\t\t// => more >= window_size - 2*WSIZE + 2\n\t\t\t\t// In the BIG_MEM or MMAP case (not yet supported),\n\t\t\t\t// window_size == input_size + MIN_LOOKAHEAD &&\n\t\t\t\t// strstart + s->lookahead <= input_size => more >= MIN_LOOKAHEAD.\n\t\t\t\t// Otherwise, window_size == 2*WSIZE so more >= 2.\n\t\t\t\t// If there was sliding, more >= WSIZE. So in all cases, more >= 2.\n\n\t\t\t\tn = strm.read_buf(window, strstart + lookahead, more);\n\t\t\t\tlookahead += n;\n\n\t\t\t\t// Initialize the hash value now that we have some input:\n\t\t\t\tif (lookahead >= MIN_MATCH) {\n\t\t\t\t\tins_h = window[strstart] & 0xff;\n\t\t\t\t\tins_h = (((ins_h) << hash_shift) ^ (window[strstart + 1] & 0xff)) & hash_mask;\n\t\t\t\t}\n\t\t\t\t// If the whole input has less than MIN_MATCH bytes, ins_h is\n\t\t\t\t// garbage,\n\t\t\t\t// but this is not important since only literal bytes will be\n\t\t\t\t// emitted.\n\t\t\t} while (lookahead < MIN_LOOKAHEAD && strm.avail_in !== 0);\n\t\t}\n\n\t\t// Copy without compression as much as possible from the input stream,\n\t\t// return\n\t\t// the current block state.\n\t\t// This function does not insert new strings in the dictionary since\n\t\t// uncompressible data is probably not useful. This function is used\n\t\t// only for the level=0 compression option.\n\t\t// NOTE: this function should be optimized to avoid extra copying from\n\t\t// window to pending_buf.\n\t\tfunction deflate_stored(flush) {\n\t\t\t// Stored blocks are limited to 0xffff bytes, pending_buf is limited\n\t\t\t// to pending_buf_size, and each stored block has a 5 byte header:\n\n\t\t\tvar max_block_size = 0xffff;\n\t\t\tvar max_start;\n\n\t\t\tif (max_block_size > pending_buf_size - 5) {\n\t\t\t\tmax_block_size = pending_buf_size - 5;\n\t\t\t}\n\n\t\t\t// Copy as much as possible from input to output:\n\t\t\twhile (true) {\n\t\t\t\t// Fill the window as much as possible:\n\t\t\t\tif (lookahead <= 1) {\n\t\t\t\t\tfill_window();\n\t\t\t\t\tif (lookahead === 0 && flush == Z_NO_FLUSH)\n\t\t\t\t\t\treturn NeedMore;\n\t\t\t\t\tif (lookahead === 0)\n\t\t\t\t\t\tbreak; // flush the current block\n\t\t\t\t}\n\n\t\t\t\tstrstart += lookahead;\n\t\t\t\tlookahead = 0;\n\n\t\t\t\t// Emit a stored block if pending_buf will be full:\n\t\t\t\tmax_start = block_start + max_block_size;\n\t\t\t\tif (strstart === 0 || strstart >= max_start) {\n\t\t\t\t\t// strstart === 0 is possible when wraparound on 16-bit machine\n\t\t\t\t\tlookahead = (strstart - max_start);\n\t\t\t\t\tstrstart = max_start;\n\n\t\t\t\t\tflush_block_only(false);\n\t\t\t\t\tif (strm.avail_out === 0)\n\t\t\t\t\t\treturn NeedMore;\n\n\t\t\t\t}\n\n\t\t\t\t// Flush if we may have to slide, otherwise block_start may become\n\t\t\t\t// negative and the data will be gone:\n\t\t\t\tif (strstart - block_start >= w_size - MIN_LOOKAHEAD) {\n\t\t\t\t\tflush_block_only(false);\n\t\t\t\t\tif (strm.avail_out === 0)\n\t\t\t\t\t\treturn NeedMore;\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tflush_block_only(flush == Z_FINISH);\n\t\t\tif (strm.avail_out === 0)\n\t\t\t\treturn (flush == Z_FINISH) ? FinishStarted : NeedMore;\n\n\t\t\treturn flush == Z_FINISH ? FinishDone : BlockDone;\n\t\t}\n\n\t\tfunction longest_match(cur_match) {\n\t\t\tvar chain_length = max_chain_length; // max hash chain length\n\t\t\tvar scan = strstart; // current string\n\t\t\tvar match; // matched string\n\t\t\tvar len; // length of current match\n\t\t\tvar best_len = prev_length; // best match length so far\n\t\t\tvar limit = strstart > (w_size - MIN_LOOKAHEAD) ? strstart - (w_size - MIN_LOOKAHEAD) : 0;\n\t\t\tvar _nice_match = nice_match;\n\n\t\t\t// Stop when cur_match becomes <= limit. To simplify the code,\n\t\t\t// we prevent matches with the string of window index 0.\n\n\t\t\tvar wmask = w_mask;\n\n\t\t\tvar strend = strstart + MAX_MATCH;\n\t\t\tvar scan_end1 = window[scan + best_len - 1];\n\t\t\tvar scan_end = window[scan + best_len];\n\n\t\t\t// The code is optimized for HASH_BITS >= 8 and MAX_MATCH-2 multiple of\n\t\t\t// 16.\n\t\t\t// It is easy to get rid of this optimization if necessary.\n\n\t\t\t// Do not waste too much time if we already have a good match:\n\t\t\tif (prev_length >= good_match) {\n\t\t\t\tchain_length >>= 2;\n\t\t\t}\n\n\t\t\t// Do not look for matches beyond the end of the input. This is\n\t\t\t// necessary\n\t\t\t// to make deflate deterministic.\n\t\t\tif (_nice_match > lookahead)\n\t\t\t\t_nice_match = lookahead;\n\n\t\t\tdo {\n\t\t\t\tmatch = cur_match;\n\n\t\t\t\t// Skip to next match if the match length cannot increase\n\t\t\t\t// or if the match length is less than 2:\n\t\t\t\tif (window[match + best_len] != scan_end || window[match + best_len - 1] != scan_end1 || window[match] != window[scan]\n\t\t\t\t\t\t|| window[++match] != window[scan + 1])\n\t\t\t\t\tcontinue;\n\n\t\t\t\t// The check at best_len-1 can be removed because it will be made\n\t\t\t\t// again later. (This heuristic is not always a win.)\n\t\t\t\t// It is not necessary to compare scan[2] and match[2] since they\n\t\t\t\t// are always equal when the other bytes match, given that\n\t\t\t\t// the hash keys are equal and that HASH_BITS >= 8.\n\t\t\t\tscan += 2;\n\t\t\t\tmatch++;\n\n\t\t\t\t// We check for insufficient lookahead only every 8th comparison;\n\t\t\t\t// the 256th check will be made at strstart+258.\n\t\t\t\tdo {\n\t\t\t\t} while (window[++scan] == window[++match] && window[++scan] == window[++match] && window[++scan] == window[++match]\n\t\t\t\t\t\t&& window[++scan] == window[++match] && window[++scan] == window[++match] && window[++scan] == window[++match]\n\t\t\t\t\t\t&& window[++scan] == window[++match] && window[++scan] == window[++match] && scan < strend);\n\n\t\t\t\tlen = MAX_MATCH - (strend - scan);\n\t\t\t\tscan = strend - MAX_MATCH;\n\n\t\t\t\tif (len > best_len) {\n\t\t\t\t\tmatch_start = cur_match;\n\t\t\t\t\tbest_len = len;\n\t\t\t\t\tif (len >= _nice_match)\n\t\t\t\t\t\tbreak;\n\t\t\t\t\tscan_end1 = window[scan + best_len - 1];\n\t\t\t\t\tscan_end = window[scan + best_len];\n\t\t\t\t}\n\n\t\t\t} while ((cur_match = (prev[cur_match & wmask] & 0xffff)) > limit && --chain_length !== 0);\n\n\t\t\tif (best_len <= lookahead)\n\t\t\t\treturn best_len;\n\t\t\treturn lookahead;\n\t\t}\n\n\t\t// Compress as much as possible from the input stream, return the current\n\t\t// block state.\n\t\t// This function does not perform lazy evaluation of matches and inserts\n\t\t// new strings in the dictionary only for unmatched strings or for short\n\t\t// matches. It is used only for the fast compression options.\n\t\tfunction deflate_fast(flush) {\n\t\t\t// short hash_head = 0; // head of the hash chain\n\t\t\tvar hash_head = 0; // head of the hash chain\n\t\t\tvar bflush; // set if current block must be flushed\n\n\t\t\twhile (true) {\n\t\t\t\t// Make sure that we always have enough lookahead, except\n\t\t\t\t// at the end of the input file. We need MAX_MATCH bytes\n\t\t\t\t// for the next match, plus MIN_MATCH bytes to insert the\n\t\t\t\t// string following the next match.\n\t\t\t\tif (lookahead < MIN_LOOKAHEAD) {\n\t\t\t\t\tfill_window();\n\t\t\t\t\tif (lookahead < MIN_LOOKAHEAD && flush == Z_NO_FLUSH) {\n\t\t\t\t\t\treturn NeedMore;\n\t\t\t\t\t}\n\t\t\t\t\tif (lookahead === 0)\n\t\t\t\t\t\tbreak; // flush the current block\n\t\t\t\t}\n\n\t\t\t\t// Insert the string window[strstart .. strstart+2] in the\n\t\t\t\t// dictionary, and set hash_head to the head of the hash chain:\n\t\t\t\tif (lookahead >= MIN_MATCH) {\n\t\t\t\t\tins_h = (((ins_h) << hash_shift) ^ (window[(strstart) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;\n\n\t\t\t\t\t// prev[strstart&w_mask]=hash_head=head[ins_h];\n\t\t\t\t\thash_head = (head[ins_h] & 0xffff);\n\t\t\t\t\tprev[strstart & w_mask] = head[ins_h];\n\t\t\t\t\thead[ins_h] = strstart;\n\t\t\t\t}\n\n\t\t\t\t// Find the longest match, discarding those <= prev_length.\n\t\t\t\t// At this point we have always match_length < MIN_MATCH\n\n\t\t\t\tif (hash_head !== 0 && ((strstart - hash_head) & 0xffff) <= w_size - MIN_LOOKAHEAD) {\n\t\t\t\t\t// To simplify the code, we prevent matches with the string\n\t\t\t\t\t// of window index 0 (in particular we have to avoid a match\n\t\t\t\t\t// of the string with itself at the start of the input file).\n\t\t\t\t\tif (strategy != Z_HUFFMAN_ONLY) {\n\t\t\t\t\t\tmatch_length = longest_match(hash_head);\n\t\t\t\t\t}\n\t\t\t\t\t// longest_match() sets match_start\n\t\t\t\t}\n\t\t\t\tif (match_length >= MIN_MATCH) {\n\t\t\t\t\t// check_match(strstart, match_start, match_length);\n\n\t\t\t\t\tbflush = _tr_tally(strstart - match_start, match_length - MIN_MATCH);\n\n\t\t\t\t\tlookahead -= match_length;\n\n\t\t\t\t\t// Insert new strings in the hash table only if the match length\n\t\t\t\t\t// is not too large. This saves time but degrades compression.\n\t\t\t\t\tif (match_length <= max_lazy_match && lookahead >= MIN_MATCH) {\n\t\t\t\t\t\tmatch_length--; // string at strstart already in hash table\n\t\t\t\t\t\tdo {\n\t\t\t\t\t\t\tstrstart++;\n\n\t\t\t\t\t\t\tins_h = ((ins_h << hash_shift) ^ (window[(strstart) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;\n\t\t\t\t\t\t\t// prev[strstart&w_mask]=hash_head=head[ins_h];\n\t\t\t\t\t\t\thash_head = (head[ins_h] & 0xffff);\n\t\t\t\t\t\t\tprev[strstart & w_mask] = head[ins_h];\n\t\t\t\t\t\t\thead[ins_h] = strstart;\n\n\t\t\t\t\t\t\t// strstart never exceeds WSIZE-MAX_MATCH, so there are\n\t\t\t\t\t\t\t// always MIN_MATCH bytes ahead.\n\t\t\t\t\t\t} while (--match_length !== 0);\n\t\t\t\t\t\tstrstart++;\n\t\t\t\t\t} else {\n\t\t\t\t\t\tstrstart += match_length;\n\t\t\t\t\t\tmatch_length = 0;\n\t\t\t\t\t\tins_h = window[strstart] & 0xff;\n\n\t\t\t\t\t\tins_h = (((ins_h) << hash_shift) ^ (window[strstart + 1] & 0xff)) & hash_mask;\n\t\t\t\t\t\t// If lookahead < MIN_MATCH, ins_h is garbage, but it does\n\t\t\t\t\t\t// not\n\t\t\t\t\t\t// matter since it will be recomputed at next deflate call.\n\t\t\t\t\t}\n\t\t\t\t} else {\n\t\t\t\t\t// No match, output a literal byte\n\n\t\t\t\t\tbflush = _tr_tally(0, window[strstart] & 0xff);\n\t\t\t\t\tlookahead--;\n\t\t\t\t\tstrstart++;\n\t\t\t\t}\n\t\t\t\tif (bflush) {\n\n\t\t\t\t\tflush_block_only(false);\n\t\t\t\t\tif (strm.avail_out === 0)\n\t\t\t\t\t\treturn NeedMore;\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tflush_block_only(flush == Z_FINISH);\n\t\t\tif (strm.avail_out === 0) {\n\t\t\t\tif (flush == Z_FINISH)\n\t\t\t\t\treturn FinishStarted;\n\t\t\t\telse\n\t\t\t\t\treturn NeedMore;\n\t\t\t}\n\t\t\treturn flush == Z_FINISH ? FinishDone : BlockDone;\n\t\t}\n\n\t\t// Same as above, but achieves better compression. We use a lazy\n\t\t// evaluation for matches: a match is finally adopted only if there is\n\t\t// no better match at the next window position.\n\t\tfunction deflate_slow(flush) {\n\t\t\t// short hash_head = 0; // head of hash chain\n\t\t\tvar hash_head = 0; // head of hash chain\n\t\t\tvar bflush; // set if current block must be flushed\n\t\t\tvar max_insert;\n\n\t\t\t// Process the input block.\n\t\t\twhile (true) {\n\t\t\t\t// Make sure that we always have enough lookahead, except\n\t\t\t\t// at the end of the input file. We need MAX_MATCH bytes\n\t\t\t\t// for the next match, plus MIN_MATCH bytes to insert the\n\t\t\t\t// string following the next match.\n\n\t\t\t\tif (lookahead < MIN_LOOKAHEAD) {\n\t\t\t\t\tfill_window();\n\t\t\t\t\tif (lookahead < MIN_LOOKAHEAD && flush == Z_NO_FLUSH) {\n\t\t\t\t\t\treturn NeedMore;\n\t\t\t\t\t}\n\t\t\t\t\tif (lookahead === 0)\n\t\t\t\t\t\tbreak; // flush the current block\n\t\t\t\t}\n\n\t\t\t\t// Insert the string window[strstart .. strstart+2] in the\n\t\t\t\t// dictionary, and set hash_head to the head of the hash chain:\n\n\t\t\t\tif (lookahead >= MIN_MATCH) {\n\t\t\t\t\tins_h = (((ins_h) << hash_shift) ^ (window[(strstart) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;\n\t\t\t\t\t// prev[strstart&w_mask]=hash_head=head[ins_h];\n\t\t\t\t\thash_head = (head[ins_h] & 0xffff);\n\t\t\t\t\tprev[strstart & w_mask] = head[ins_h];\n\t\t\t\t\thead[ins_h] = strstart;\n\t\t\t\t}\n\n\t\t\t\t// Find the longest match, discarding those <= prev_length.\n\t\t\t\tprev_length = match_length;\n\t\t\t\tprev_match = match_start;\n\t\t\t\tmatch_length = MIN_MATCH - 1;\n\n\t\t\t\tif (hash_head !== 0 && prev_length < max_lazy_match && ((strstart - hash_head) & 0xffff) <= w_size - MIN_LOOKAHEAD) {\n\t\t\t\t\t// To simplify the code, we prevent matches with the string\n\t\t\t\t\t// of window index 0 (in particular we have to avoid a match\n\t\t\t\t\t// of the string with itself at the start of the input file).\n\n\t\t\t\t\tif (strategy != Z_HUFFMAN_ONLY) {\n\t\t\t\t\t\tmatch_length = longest_match(hash_head);\n\t\t\t\t\t}\n\t\t\t\t\t// longest_match() sets match_start\n\n\t\t\t\t\tif (match_length <= 5 && (strategy == Z_FILTERED || (match_length == MIN_MATCH && strstart - match_start > 4096))) {\n\n\t\t\t\t\t\t// If prev_match is also MIN_MATCH, match_start is garbage\n\t\t\t\t\t\t// but we will ignore the current match anyway.\n\t\t\t\t\t\tmatch_length = MIN_MATCH - 1;\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\t// If there was a match at the previous step and the current\n\t\t\t\t// match is not better, output the previous match:\n\t\t\t\tif (prev_length >= MIN_MATCH && match_length <= prev_length) {\n\t\t\t\t\tmax_insert = strstart + lookahead - MIN_MATCH;\n\t\t\t\t\t// Do not insert strings in hash table beyond this.\n\n\t\t\t\t\t// check_match(strstart-1, prev_match, prev_length);\n\n\t\t\t\t\tbflush = _tr_tally(strstart - 1 - prev_match, prev_length - MIN_MATCH);\n\n\t\t\t\t\t// Insert in hash table all strings up to the end of the match.\n\t\t\t\t\t// strstart-1 and strstart are already inserted. If there is not\n\t\t\t\t\t// enough lookahead, the last two strings are not inserted in\n\t\t\t\t\t// the hash table.\n\t\t\t\t\tlookahead -= prev_length - 1;\n\t\t\t\t\tprev_length -= 2;\n\t\t\t\t\tdo {\n\t\t\t\t\t\tif (++strstart <= max_insert) {\n\t\t\t\t\t\t\tins_h = (((ins_h) << hash_shift) ^ (window[(strstart) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;\n\t\t\t\t\t\t\t// prev[strstart&w_mask]=hash_head=head[ins_h];\n\t\t\t\t\t\t\thash_head = (head[ins_h] & 0xffff);\n\t\t\t\t\t\t\tprev[strstart & w_mask] = head[ins_h];\n\t\t\t\t\t\t\thead[ins_h] = strstart;\n\t\t\t\t\t\t}\n\t\t\t\t\t} while (--prev_length !== 0);\n\t\t\t\t\tmatch_available = 0;\n\t\t\t\t\tmatch_length = MIN_MATCH - 1;\n\t\t\t\t\tstrstart++;\n\n\t\t\t\t\tif (bflush) {\n\t\t\t\t\t\tflush_block_only(false);\n\t\t\t\t\t\tif (strm.avail_out === 0)\n\t\t\t\t\t\t\treturn NeedMore;\n\t\t\t\t\t}\n\t\t\t\t} else if (match_available !== 0) {\n\n\t\t\t\t\t// If there was no match at the previous position, output a\n\t\t\t\t\t// single literal. If there was a match but the current match\n\t\t\t\t\t// is longer, truncate the previous match to a single literal.\n\n\t\t\t\t\tbflush = _tr_tally(0, window[strstart - 1] & 0xff);\n\n\t\t\t\t\tif (bflush) {\n\t\t\t\t\t\tflush_block_only(false);\n\t\t\t\t\t}\n\t\t\t\t\tstrstart++;\n\t\t\t\t\tlookahead--;\n\t\t\t\t\tif (strm.avail_out === 0)\n\t\t\t\t\t\treturn NeedMore;\n\t\t\t\t} else {\n\t\t\t\t\t// There is no previous match to compare with, wait for\n\t\t\t\t\t// the next step to decide.\n\n\t\t\t\t\tmatch_available = 1;\n\t\t\t\t\tstrstart++;\n\t\t\t\t\tlookahead--;\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tif (match_available !== 0) {\n\t\t\t\tbflush = _tr_tally(0, window[strstart - 1] & 0xff);\n\t\t\t\tmatch_available = 0;\n\t\t\t}\n\t\t\tflush_block_only(flush == Z_FINISH);\n\n\t\t\tif (strm.avail_out === 0) {\n\t\t\t\tif (flush == Z_FINISH)\n\t\t\t\t\treturn FinishStarted;\n\t\t\t\telse\n\t\t\t\t\treturn NeedMore;\n\t\t\t}\n\n\t\t\treturn flush == Z_FINISH ? FinishDone : BlockDone;\n\t\t}\n\n\t\tfunction deflateReset(strm) {\n\t\t\tstrm.total_in = strm.total_out = 0;\n\t\t\tstrm.msg = null; //\n\t\t\t\n\t\t\tthat.pending = 0;\n\t\t\tthat.pending_out = 0;\n\n\t\t\tstatus = BUSY_STATE;\n\n\t\t\tlast_flush = Z_NO_FLUSH;\n\n\t\t\ttr_init();\n\t\t\tlm_init();\n\t\t\treturn Z_OK;\n\t\t}\n\n\t\tthat.deflateInit = function(strm, _level, bits, _method, memLevel, _strategy) {\n\t\t\tif (!_method)\n\t\t\t\t_method = Z_DEFLATED;\n\t\t\tif (!memLevel)\n\t\t\t\tmemLevel = DEF_MEM_LEVEL;\n\t\t\tif (!_strategy)\n\t\t\t\t_strategy = Z_DEFAULT_STRATEGY;\n\n\t\t\t// byte[] my_version=ZLIB_VERSION;\n\n\t\t\t//\n\t\t\t// if (!version || version[0] != my_version[0]\n\t\t\t// || stream_size != sizeof(z_stream)) {\n\t\t\t// return Z_VERSION_ERROR;\n\t\t\t// }\n\n\t\t\tstrm.msg = null;\n\n\t\t\tif (_level == Z_DEFAULT_COMPRESSION)\n\t\t\t\t_level = 6;\n\n\t\t\tif (memLevel < 1 || memLevel > MAX_MEM_LEVEL || _method != Z_DEFLATED || bits < 9 || bits > 15 || _level < 0 || _level > 9 || _strategy < 0\n\t\t\t\t\t|| _strategy > Z_HUFFMAN_ONLY) {\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\t}\n\n\t\t\tstrm.dstate = that;\n\n\t\t\tw_bits = bits;\n\t\t\tw_size = 1 << w_bits;\n\t\t\tw_mask = w_size - 1;\n\n\t\t\thash_bits = memLevel + 7;\n\t\t\thash_size = 1 << hash_bits;\n\t\t\thash_mask = hash_size - 1;\n\t\t\thash_shift = Math.floor((hash_bits + MIN_MATCH - 1) / MIN_MATCH);\n\n\t\t\twindow = new Uint8Array(w_size * 2);\n\t\t\tprev = [];\n\t\t\thead = [];\n\n\t\t\tlit_bufsize = 1 << (memLevel + 6); // 16K elements by default\n\n\t\t\t// We overlay pending_buf and d_buf+l_buf. This works since the average\n\t\t\t// output size for (length,distance) codes is <= 24 bits.\n\t\t\tthat.pending_buf = new Uint8Array(lit_bufsize * 4);\n\t\t\tpending_buf_size = lit_bufsize * 4;\n\n\t\t\td_buf = Math.floor(lit_bufsize / 2);\n\t\t\tl_buf = (1 + 2) * lit_bufsize;\n\n\t\t\tlevel = _level;\n\n\t\t\tstrategy = _strategy;\n\t\t\tmethod = _method & 0xff;\n\n\t\t\treturn deflateReset(strm);\n\t\t};\n\n\t\tthat.deflateEnd = function() {\n\t\t\tif (status != INIT_STATE && status != BUSY_STATE && status != FINISH_STATE) {\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\t}\n\t\t\t// Deallocate in reverse order of allocations:\n\t\t\tthat.pending_buf = null;\n\t\t\thead = null;\n\t\t\tprev = null;\n\t\t\twindow = null;\n\t\t\t// free\n\t\t\tthat.dstate = null;\n\t\t\treturn status == BUSY_STATE ? Z_DATA_ERROR : Z_OK;\n\t\t};\n\n\t\tthat.deflateParams = function(strm, _level, _strategy) {\n\t\t\tvar err = Z_OK;\n\n\t\t\tif (_level == Z_DEFAULT_COMPRESSION) {\n\t\t\t\t_level = 6;\n\t\t\t}\n\t\t\tif (_level < 0 || _level > 9 || _strategy < 0 || _strategy > Z_HUFFMAN_ONLY) {\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\t}\n\n\t\t\tif (config_table[level].func != config_table[_level].func && strm.total_in !== 0) {\n\t\t\t\t// Flush the last buffer:\n\t\t\t\terr = strm.deflate(Z_PARTIAL_FLUSH);\n\t\t\t}\n\n\t\t\tif (level != _level) {\n\t\t\t\tlevel = _level;\n\t\t\t\tmax_lazy_match = config_table[level].max_lazy;\n\t\t\t\tgood_match = config_table[level].good_length;\n\t\t\t\tnice_match = config_table[level].nice_length;\n\t\t\t\tmax_chain_length = config_table[level].max_chain;\n\t\t\t}\n\t\t\tstrategy = _strategy;\n\t\t\treturn err;\n\t\t};\n\n\t\tthat.deflateSetDictionary = function(strm, dictionary, dictLength) {\n\t\t\tvar length = dictLength;\n\t\t\tvar n, index = 0;\n\n\t\t\tif (!dictionary || status != INIT_STATE)\n\t\t\t\treturn Z_STREAM_ERROR;\n\n\t\t\tif (length < MIN_MATCH)\n\t\t\t\treturn Z_OK;\n\t\t\tif (length > w_size - MIN_LOOKAHEAD) {\n\t\t\t\tlength = w_size - MIN_LOOKAHEAD;\n\t\t\t\tindex = dictLength - length; // use the tail of the dictionary\n\t\t\t}\n\t\t\twindow.set(dictionary.subarray(index, index + length), 0);\n\n\t\t\tstrstart = length;\n\t\t\tblock_start = length;\n\n\t\t\t// Insert all strings in the hash table (except for the last two bytes).\n\t\t\t// s->lookahead stays null, so s->ins_h will be recomputed at the next\n\t\t\t// call of fill_window.\n\n\t\t\tins_h = window[0] & 0xff;\n\t\t\tins_h = (((ins_h) << hash_shift) ^ (window[1] & 0xff)) & hash_mask;\n\n\t\t\tfor (n = 0; n <= length - MIN_MATCH; n++) {\n\t\t\t\tins_h = (((ins_h) << hash_shift) ^ (window[(n) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;\n\t\t\t\tprev[n & w_mask] = head[ins_h];\n\t\t\t\thead[ins_h] = n;\n\t\t\t}\n\t\t\treturn Z_OK;\n\t\t};\n\n\t\tthat.deflate = function(_strm, flush) {\n\t\t\tvar i, header, level_flags, old_flush, bstate;\n\n\t\t\tif (flush > Z_FINISH || flush < 0) {\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\t}\n\n\t\t\tif (!_strm.next_out || (!_strm.next_in && _strm.avail_in !== 0) || (status == FINISH_STATE && flush != Z_FINISH)) {\n\t\t\t\t_strm.msg = z_errmsg[Z_NEED_DICT - (Z_STREAM_ERROR)];\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\t}\n\t\t\tif (_strm.avail_out === 0) {\n\t\t\t\t_strm.msg = z_errmsg[Z_NEED_DICT - (Z_BUF_ERROR)];\n\t\t\t\treturn Z_BUF_ERROR;\n\t\t\t}\n\n\t\t\tstrm = _strm; // just in case\n\t\t\told_flush = last_flush;\n\t\t\tlast_flush = flush;\n\n\t\t\t// Write the zlib header\n\t\t\tif (status == INIT_STATE) {\n\t\t\t\theader = (Z_DEFLATED + ((w_bits - 8) << 4)) << 8;\n\t\t\t\tlevel_flags = ((level - 1) & 0xff) >> 1;\n\n\t\t\t\tif (level_flags > 3)\n\t\t\t\t\tlevel_flags = 3;\n\t\t\t\theader |= (level_flags << 6);\n\t\t\t\tif (strstart !== 0)\n\t\t\t\t\theader |= PRESET_DICT;\n\t\t\t\theader += 31 - (header % 31);\n\n\t\t\t\tstatus = BUSY_STATE;\n\t\t\t\tputShortMSB(header);\n\t\t\t}\n\n\t\t\t// Flush as much pending output as possible\n\t\t\tif (that.pending !== 0) {\n\t\t\t\tstrm.flush_pending();\n\t\t\t\tif (strm.avail_out === 0) {\n\t\t\t\t\t// console.log(\" avail_out==0\");\n\t\t\t\t\t// Since avail_out is 0, deflate will be called again with\n\t\t\t\t\t// more output space, but possibly with both pending and\n\t\t\t\t\t// avail_in equal to zero. There won't be anything to do,\n\t\t\t\t\t// but this is not an error situation so make sure we\n\t\t\t\t\t// return OK instead of BUF_ERROR at next call of deflate:\n\t\t\t\t\tlast_flush = -1;\n\t\t\t\t\treturn Z_OK;\n\t\t\t\t}\n\n\t\t\t\t// Make sure there is something to do and avoid duplicate\n\t\t\t\t// consecutive\n\t\t\t\t// flushes. For repeated and useless calls with Z_FINISH, we keep\n\t\t\t\t// returning Z_STREAM_END instead of Z_BUFF_ERROR.\n\t\t\t} else if (strm.avail_in === 0 && flush <= old_flush && flush != Z_FINISH) {\n\t\t\t\tstrm.msg = z_errmsg[Z_NEED_DICT - (Z_BUF_ERROR)];\n\t\t\t\treturn Z_BUF_ERROR;\n\t\t\t}\n\n\t\t\t// User must not provide more input after the first FINISH:\n\t\t\tif (status == FINISH_STATE && strm.avail_in !== 0) {\n\t\t\t\t_strm.msg = z_errmsg[Z_NEED_DICT - (Z_BUF_ERROR)];\n\t\t\t\treturn Z_BUF_ERROR;\n\t\t\t}\n\n\t\t\t// Start a new block or continue the current one.\n\t\t\tif (strm.avail_in !== 0 || lookahead !== 0 || (flush != Z_NO_FLUSH && status != FINISH_STATE)) {\n\t\t\t\tbstate = -1;\n\t\t\t\tswitch (config_table[level].func) {\n\t\t\t\tcase STORED:\n\t\t\t\t\tbstate = deflate_stored(flush);\n\t\t\t\t\tbreak;\n\t\t\t\tcase FAST:\n\t\t\t\t\tbstate = deflate_fast(flush);\n\t\t\t\t\tbreak;\n\t\t\t\tcase SLOW:\n\t\t\t\t\tbstate = deflate_slow(flush);\n\t\t\t\t\tbreak;\n\t\t\t\tdefault:\n\t\t\t\t}\n\n\t\t\t\tif (bstate == FinishStarted || bstate == FinishDone) {\n\t\t\t\t\tstatus = FINISH_STATE;\n\t\t\t\t}\n\t\t\t\tif (bstate == NeedMore || bstate == FinishStarted) {\n\t\t\t\t\tif (strm.avail_out === 0) {\n\t\t\t\t\t\tlast_flush = -1; // avoid BUF_ERROR next call, see above\n\t\t\t\t\t}\n\t\t\t\t\treturn Z_OK;\n\t\t\t\t\t// If flush != Z_NO_FLUSH && avail_out === 0, the next call\n\t\t\t\t\t// of deflate should use the same flush parameter to make sure\n\t\t\t\t\t// that the flush is complete. So we don't have to output an\n\t\t\t\t\t// empty block here, this will be done at next call. This also\n\t\t\t\t\t// ensures that for a very small output buffer, we emit at most\n\t\t\t\t\t// one empty block.\n\t\t\t\t}\n\n\t\t\t\tif (bstate == BlockDone) {\n\t\t\t\t\tif (flush == Z_PARTIAL_FLUSH) {\n\t\t\t\t\t\t_tr_align();\n\t\t\t\t\t} else { // FULL_FLUSH or SYNC_FLUSH\n\t\t\t\t\t\t_tr_stored_block(0, 0, false);\n\t\t\t\t\t\t// For a full flush, this empty block will be recognized\n\t\t\t\t\t\t// as a special marker by inflate_sync().\n\t\t\t\t\t\tif (flush == Z_FULL_FLUSH) {\n\t\t\t\t\t\t\t// state.head[s.hash_size-1]=0;\n\t\t\t\t\t\t\tfor (i = 0; i < hash_size/*-1*/; i++)\n\t\t\t\t\t\t\t\t// forget history\n\t\t\t\t\t\t\t\thead[i] = 0;\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t\tstrm.flush_pending();\n\t\t\t\t\tif (strm.avail_out === 0) {\n\t\t\t\t\t\tlast_flush = -1; // avoid BUF_ERROR at next call, see above\n\t\t\t\t\t\treturn Z_OK;\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\n\t\t\tif (flush != Z_FINISH)\n\t\t\t\treturn Z_OK;\n\t\t\treturn Z_STREAM_END;\n\t\t};\n\t}\n\n\t// ZStream\n\n\tfunction ZStream() {\n\t\tvar that = this;\n\t\tthat.next_in_index = 0;\n\t\tthat.next_out_index = 0;\n\t\t// that.next_in; // next input byte\n\t\tthat.avail_in = 0; // number of bytes available at next_in\n\t\tthat.total_in = 0; // total nb of input bytes read so far\n\t\t// that.next_out; // next output byte should be put there\n\t\tthat.avail_out = 0; // remaining free space at next_out\n\t\tthat.total_out = 0; // total nb of bytes output so far\n\t\t// that.msg;\n\t\t// that.dstate;\n\t}\n\n\tZStream.prototype = {\n\t\tdeflateInit : function(level, bits) {\n\t\t\tvar that = this;\n\t\t\tthat.dstate = new Deflate();\n\t\t\tif (!bits)\n\t\t\t\tbits = MAX_BITS;\n\t\t\treturn that.dstate.deflateInit(that, level, bits);\n\t\t},\n\n\t\tdeflate : function(flush) {\n\t\t\tvar that = this;\n\t\t\tif (!that.dstate) {\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\t}\n\t\t\treturn that.dstate.deflate(that, flush);\n\t\t},\n\n\t\tdeflateEnd : function() {\n\t\t\tvar that = this;\n\t\t\tif (!that.dstate)\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\tvar ret = that.dstate.deflateEnd();\n\t\t\tthat.dstate = null;\n\t\t\treturn ret;\n\t\t},\n\n\t\tdeflateParams : function(level, strategy) {\n\t\t\tvar that = this;\n\t\t\tif (!that.dstate)\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\treturn that.dstate.deflateParams(that, level, strategy);\n\t\t},\n\n\t\tdeflateSetDictionary : function(dictionary, dictLength) {\n\t\t\tvar that = this;\n\t\t\tif (!that.dstate)\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\treturn that.dstate.deflateSetDictionary(that, dictionary, dictLength);\n\t\t},\n\n\t\t// Read a new buffer from the current input stream, update the\n\t\t// total number of bytes read. All deflate() input goes through\n\t\t// this function so some applications may wish to modify it to avoid\n\t\t// allocating a large strm->next_in buffer and copying from it.\n\t\t// (See also flush_pending()).\n\t\tread_buf : function(buf, start, size) {\n\t\t\tvar that = this;\n\t\t\tvar len = that.avail_in;\n\t\t\tif (len > size)\n\t\t\t\tlen = size;\n\t\t\tif (len === 0)\n\t\t\t\treturn 0;\n\t\t\tthat.avail_in -= len;\n\t\t\tbuf.set(that.next_in.subarray(that.next_in_index, that.next_in_index + len), start);\n\t\t\tthat.next_in_index += len;\n\t\t\tthat.total_in += len;\n\t\t\treturn len;\n\t\t},\n\n\t\t// Flush as much pending output as possible. All deflate() output goes\n\t\t// through this function so some applications may wish to modify it\n\t\t// to avoid allocating a large strm->next_out buffer and copying into it.\n\t\t// (See also read_buf()).\n\t\tflush_pending : function() {\n\t\t\tvar that = this;\n\t\t\tvar len = that.dstate.pending;\n\n\t\t\tif (len > that.avail_out)\n\t\t\t\tlen = that.avail_out;\n\t\t\tif (len === 0)\n\t\t\t\treturn;\n\n\t\t\t// if (that.dstate.pending_buf.length <= that.dstate.pending_out || that.next_out.length <= that.next_out_index\n\t\t\t// || that.dstate.pending_buf.length < (that.dstate.pending_out + len) || that.next_out.length < (that.next_out_index +\n\t\t\t// len)) {\n\t\t\t// console.log(that.dstate.pending_buf.length + \", \" + that.dstate.pending_out + \", \" + that.next_out.length + \", \" +\n\t\t\t// that.next_out_index + \", \" + len);\n\t\t\t// console.log(\"avail_out=\" + that.avail_out);\n\t\t\t// }\n\n\t\t\tthat.next_out.set(that.dstate.pending_buf.subarray(that.dstate.pending_out, that.dstate.pending_out + len), that.next_out_index);\n\n\t\t\tthat.next_out_index += len;\n\t\t\tthat.dstate.pending_out += len;\n\t\t\tthat.total_out += len;\n\t\t\tthat.avail_out -= len;\n\t\t\tthat.dstate.pending -= len;\n\t\t\tif (that.dstate.pending === 0) {\n\t\t\t\tthat.dstate.pending_out = 0;\n\t\t\t}\n\t\t}\n\t};\n\n\t// Deflater\n\n\tfunction Deflater(options) {\n\t\tvar that = this;\n\t\tvar z = new ZStream();\n\t\tvar bufsize = 512;\n\t\tvar flush = Z_NO_FLUSH;\n\t\tvar buf = new Uint8Array(bufsize);\n\t\tvar level = options ? options.level : Z_DEFAULT_COMPRESSION;\n\t\tif (typeof level == \"undefined\")\n\t\t\tlevel = Z_DEFAULT_COMPRESSION;\n\t\tz.deflateInit(level);\n\t\tz.next_out = buf;\n\n\t\tthat.append = function(data, onprogress) {\n\t\t\tvar err, buffers = [], lastIndex = 0, bufferIndex = 0, bufferSize = 0, array;\n\t\t\tif (!data.length)\n\t\t\t\treturn;\n\t\t\tz.next_in_index = 0;\n\t\t\tz.next_in = data;\n\t\t\tz.avail_in = data.length;\n\t\t\tdo {\n\t\t\t\tz.next_out_index = 0;\n\t\t\t\tz.avail_out = bufsize;\n\t\t\t\terr = z.deflate(flush);\n\t\t\t\tif (err != Z_OK)\n\t\t\t\t\tthrow new Error(\"deflating: \" + z.msg);\n\t\t\t\tif (z.next_out_index)\n\t\t\t\t\tif (z.next_out_index == bufsize)\n\t\t\t\t\t\tbuffers.push(new Uint8Array(buf));\n\t\t\t\t\telse\n\t\t\t\t\t\tbuffers.push(new Uint8Array(buf.subarray(0, z.next_out_index)));\n\t\t\t\tbufferSize += z.next_out_index;\n\t\t\t\tif (onprogress && z.next_in_index > 0 && z.next_in_index != lastIndex) {\n\t\t\t\t\tonprogress(z.next_in_index);\n\t\t\t\t\tlastIndex = z.next_in_index;\n\t\t\t\t}\n\t\t\t} while (z.avail_in > 0 || z.avail_out === 0);\n\t\t\tarray = new Uint8Array(bufferSize);\n\t\t\tbuffers.forEach(function(chunk) {\n\t\t\t\tarray.set(chunk, bufferIndex);\n\t\t\t\tbufferIndex += chunk.length;\n\t\t\t});\n\t\t\treturn array;\n\t\t};\n\t\tthat.flush = function() {\n\t\t\tvar err, buffers = [], bufferIndex = 0, bufferSize = 0, array;\n\t\t\tdo {\n\t\t\t\tz.next_out_index = 0;\n\t\t\t\tz.avail_out = bufsize;\n\t\t\t\terr = z.deflate(Z_FINISH);\n\t\t\t\tif (err != Z_STREAM_END && err != Z_OK)\n\t\t\t\t\tthrow new Error(\"deflating: \" + z.msg);\n\t\t\t\tif (bufsize - z.avail_out > 0)\n\t\t\t\t\tbuffers.push(new Uint8Array(buf.subarray(0, z.next_out_index)));\n\t\t\t\tbufferSize += z.next_out_index;\n\t\t\t} while (z.avail_in > 0 || z.avail_out === 0);\n\t\t\tz.deflateEnd();\n\t\t\tarray = new Uint8Array(bufferSize);\n\t\t\tbuffers.forEach(function(chunk) {\n\t\t\t\tarray.set(chunk, bufferIndex);\n\t\t\t\tbufferIndex += chunk.length;\n\t\t\t});\n\t\t\treturn array;\n\t\t};\n\t}\n\n\t// 'zip' may not be defined in z-worker and some tests\n\tvar env = global.zip || global;\n\tenv.Deflater = env._jzlib_Deflater = Deflater;\n})(this);\n")],
  inflater: [zWorker, createUrl("/*\n Copyright (c) 2013 Gildas Lormeau. All rights reserved.\n\n Redistribution and use in source and binary forms, with or without\n modification, are permitted provided that the following conditions are met:\n\n 1. Redistributions of source code must retain the above copyright notice,\n this list of conditions and the following disclaimer.\n\n 2. Redistributions in binary form must reproduce the above copyright \n notice, this list of conditions and the following disclaimer in \n the documentation and/or other materials provided with the distribution.\n\n 3. The names of the authors may not be used to endorse or promote products\n derived from this software without specific prior written permission.\n\n THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,\n INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND\n FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,\n INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,\n INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT\n LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,\n OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF\n LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING\n NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,\n EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n */\n\n/*\n * This program is based on JZlib 1.0.2 ymnk, JCraft,Inc.\n * JZlib is based on zlib-1.1.3, so all credit should go authors\n * Jean-loup Gailly(jloup@gzip.org) and Mark Adler(madler@alumni.caltech.edu)\n * and contributors of zlib.\n */\n\n(function(global) {\n\t\"use strict\";\n\n\t// Global\n\tvar MAX_BITS = 15;\n\n\tvar Z_OK = 0;\n\tvar Z_STREAM_END = 1;\n\tvar Z_NEED_DICT = 2;\n\tvar Z_STREAM_ERROR = -2;\n\tvar Z_DATA_ERROR = -3;\n\tvar Z_MEM_ERROR = -4;\n\tvar Z_BUF_ERROR = -5;\n\n\tvar inflate_mask = [ 0x00000000, 0x00000001, 0x00000003, 0x00000007, 0x0000000f, 0x0000001f, 0x0000003f, 0x0000007f, 0x000000ff, 0x000001ff, 0x000003ff,\n\t\t\t0x000007ff, 0x00000fff, 0x00001fff, 0x00003fff, 0x00007fff, 0x0000ffff ];\n\n\tvar MANY = 1440;\n\n\t// JZlib version : \"1.0.2\"\n\tvar Z_NO_FLUSH = 0;\n\tvar Z_FINISH = 4;\n\n\t// InfTree\n\tvar fixed_bl = 9;\n\tvar fixed_bd = 5;\n\n\tvar fixed_tl = [ 96, 7, 256, 0, 8, 80, 0, 8, 16, 84, 8, 115, 82, 7, 31, 0, 8, 112, 0, 8, 48, 0, 9, 192, 80, 7, 10, 0, 8, 96, 0, 8, 32, 0, 9, 160, 0, 8, 0,\n\t\t\t0, 8, 128, 0, 8, 64, 0, 9, 224, 80, 7, 6, 0, 8, 88, 0, 8, 24, 0, 9, 144, 83, 7, 59, 0, 8, 120, 0, 8, 56, 0, 9, 208, 81, 7, 17, 0, 8, 104, 0, 8, 40,\n\t\t\t0, 9, 176, 0, 8, 8, 0, 8, 136, 0, 8, 72, 0, 9, 240, 80, 7, 4, 0, 8, 84, 0, 8, 20, 85, 8, 227, 83, 7, 43, 0, 8, 116, 0, 8, 52, 0, 9, 200, 81, 7, 13,\n\t\t\t0, 8, 100, 0, 8, 36, 0, 9, 168, 0, 8, 4, 0, 8, 132, 0, 8, 68, 0, 9, 232, 80, 7, 8, 0, 8, 92, 0, 8, 28, 0, 9, 152, 84, 7, 83, 0, 8, 124, 0, 8, 60,\n\t\t\t0, 9, 216, 82, 7, 23, 0, 8, 108, 0, 8, 44, 0, 9, 184, 0, 8, 12, 0, 8, 140, 0, 8, 76, 0, 9, 248, 80, 7, 3, 0, 8, 82, 0, 8, 18, 85, 8, 163, 83, 7,\n\t\t\t35, 0, 8, 114, 0, 8, 50, 0, 9, 196, 81, 7, 11, 0, 8, 98, 0, 8, 34, 0, 9, 164, 0, 8, 2, 0, 8, 130, 0, 8, 66, 0, 9, 228, 80, 7, 7, 0, 8, 90, 0, 8,\n\t\t\t26, 0, 9, 148, 84, 7, 67, 0, 8, 122, 0, 8, 58, 0, 9, 212, 82, 7, 19, 0, 8, 106, 0, 8, 42, 0, 9, 180, 0, 8, 10, 0, 8, 138, 0, 8, 74, 0, 9, 244, 80,\n\t\t\t7, 5, 0, 8, 86, 0, 8, 22, 192, 8, 0, 83, 7, 51, 0, 8, 118, 0, 8, 54, 0, 9, 204, 81, 7, 15, 0, 8, 102, 0, 8, 38, 0, 9, 172, 0, 8, 6, 0, 8, 134, 0,\n\t\t\t8, 70, 0, 9, 236, 80, 7, 9, 0, 8, 94, 0, 8, 30, 0, 9, 156, 84, 7, 99, 0, 8, 126, 0, 8, 62, 0, 9, 220, 82, 7, 27, 0, 8, 110, 0, 8, 46, 0, 9, 188, 0,\n\t\t\t8, 14, 0, 8, 142, 0, 8, 78, 0, 9, 252, 96, 7, 256, 0, 8, 81, 0, 8, 17, 85, 8, 131, 82, 7, 31, 0, 8, 113, 0, 8, 49, 0, 9, 194, 80, 7, 10, 0, 8, 97,\n\t\t\t0, 8, 33, 0, 9, 162, 0, 8, 1, 0, 8, 129, 0, 8, 65, 0, 9, 226, 80, 7, 6, 0, 8, 89, 0, 8, 25, 0, 9, 146, 83, 7, 59, 0, 8, 121, 0, 8, 57, 0, 9, 210,\n\t\t\t81, 7, 17, 0, 8, 105, 0, 8, 41, 0, 9, 178, 0, 8, 9, 0, 8, 137, 0, 8, 73, 0, 9, 242, 80, 7, 4, 0, 8, 85, 0, 8, 21, 80, 8, 258, 83, 7, 43, 0, 8, 117,\n\t\t\t0, 8, 53, 0, 9, 202, 81, 7, 13, 0, 8, 101, 0, 8, 37, 0, 9, 170, 0, 8, 5, 0, 8, 133, 0, 8, 69, 0, 9, 234, 80, 7, 8, 0, 8, 93, 0, 8, 29, 0, 9, 154,\n\t\t\t84, 7, 83, 0, 8, 125, 0, 8, 61, 0, 9, 218, 82, 7, 23, 0, 8, 109, 0, 8, 45, 0, 9, 186, 0, 8, 13, 0, 8, 141, 0, 8, 77, 0, 9, 250, 80, 7, 3, 0, 8, 83,\n\t\t\t0, 8, 19, 85, 8, 195, 83, 7, 35, 0, 8, 115, 0, 8, 51, 0, 9, 198, 81, 7, 11, 0, 8, 99, 0, 8, 35, 0, 9, 166, 0, 8, 3, 0, 8, 131, 0, 8, 67, 0, 9, 230,\n\t\t\t80, 7, 7, 0, 8, 91, 0, 8, 27, 0, 9, 150, 84, 7, 67, 0, 8, 123, 0, 8, 59, 0, 9, 214, 82, 7, 19, 0, 8, 107, 0, 8, 43, 0, 9, 182, 0, 8, 11, 0, 8, 139,\n\t\t\t0, 8, 75, 0, 9, 246, 80, 7, 5, 0, 8, 87, 0, 8, 23, 192, 8, 0, 83, 7, 51, 0, 8, 119, 0, 8, 55, 0, 9, 206, 81, 7, 15, 0, 8, 103, 0, 8, 39, 0, 9, 174,\n\t\t\t0, 8, 7, 0, 8, 135, 0, 8, 71, 0, 9, 238, 80, 7, 9, 0, 8, 95, 0, 8, 31, 0, 9, 158, 84, 7, 99, 0, 8, 127, 0, 8, 63, 0, 9, 222, 82, 7, 27, 0, 8, 111,\n\t\t\t0, 8, 47, 0, 9, 190, 0, 8, 15, 0, 8, 143, 0, 8, 79, 0, 9, 254, 96, 7, 256, 0, 8, 80, 0, 8, 16, 84, 8, 115, 82, 7, 31, 0, 8, 112, 0, 8, 48, 0, 9,\n\t\t\t193, 80, 7, 10, 0, 8, 96, 0, 8, 32, 0, 9, 161, 0, 8, 0, 0, 8, 128, 0, 8, 64, 0, 9, 225, 80, 7, 6, 0, 8, 88, 0, 8, 24, 0, 9, 145, 83, 7, 59, 0, 8,\n\t\t\t120, 0, 8, 56, 0, 9, 209, 81, 7, 17, 0, 8, 104, 0, 8, 40, 0, 9, 177, 0, 8, 8, 0, 8, 136, 0, 8, 72, 0, 9, 241, 80, 7, 4, 0, 8, 84, 0, 8, 20, 85, 8,\n\t\t\t227, 83, 7, 43, 0, 8, 116, 0, 8, 52, 0, 9, 201, 81, 7, 13, 0, 8, 100, 0, 8, 36, 0, 9, 169, 0, 8, 4, 0, 8, 132, 0, 8, 68, 0, 9, 233, 80, 7, 8, 0, 8,\n\t\t\t92, 0, 8, 28, 0, 9, 153, 84, 7, 83, 0, 8, 124, 0, 8, 60, 0, 9, 217, 82, 7, 23, 0, 8, 108, 0, 8, 44, 0, 9, 185, 0, 8, 12, 0, 8, 140, 0, 8, 76, 0, 9,\n\t\t\t249, 80, 7, 3, 0, 8, 82, 0, 8, 18, 85, 8, 163, 83, 7, 35, 0, 8, 114, 0, 8, 50, 0, 9, 197, 81, 7, 11, 0, 8, 98, 0, 8, 34, 0, 9, 165, 0, 8, 2, 0, 8,\n\t\t\t130, 0, 8, 66, 0, 9, 229, 80, 7, 7, 0, 8, 90, 0, 8, 26, 0, 9, 149, 84, 7, 67, 0, 8, 122, 0, 8, 58, 0, 9, 213, 82, 7, 19, 0, 8, 106, 0, 8, 42, 0, 9,\n\t\t\t181, 0, 8, 10, 0, 8, 138, 0, 8, 74, 0, 9, 245, 80, 7, 5, 0, 8, 86, 0, 8, 22, 192, 8, 0, 83, 7, 51, 0, 8, 118, 0, 8, 54, 0, 9, 205, 81, 7, 15, 0, 8,\n\t\t\t102, 0, 8, 38, 0, 9, 173, 0, 8, 6, 0, 8, 134, 0, 8, 70, 0, 9, 237, 80, 7, 9, 0, 8, 94, 0, 8, 30, 0, 9, 157, 84, 7, 99, 0, 8, 126, 0, 8, 62, 0, 9,\n\t\t\t221, 82, 7, 27, 0, 8, 110, 0, 8, 46, 0, 9, 189, 0, 8, 14, 0, 8, 142, 0, 8, 78, 0, 9, 253, 96, 7, 256, 0, 8, 81, 0, 8, 17, 85, 8, 131, 82, 7, 31, 0,\n\t\t\t8, 113, 0, 8, 49, 0, 9, 195, 80, 7, 10, 0, 8, 97, 0, 8, 33, 0, 9, 163, 0, 8, 1, 0, 8, 129, 0, 8, 65, 0, 9, 227, 80, 7, 6, 0, 8, 89, 0, 8, 25, 0, 9,\n\t\t\t147, 83, 7, 59, 0, 8, 121, 0, 8, 57, 0, 9, 211, 81, 7, 17, 0, 8, 105, 0, 8, 41, 0, 9, 179, 0, 8, 9, 0, 8, 137, 0, 8, 73, 0, 9, 243, 80, 7, 4, 0, 8,\n\t\t\t85, 0, 8, 21, 80, 8, 258, 83, 7, 43, 0, 8, 117, 0, 8, 53, 0, 9, 203, 81, 7, 13, 0, 8, 101, 0, 8, 37, 0, 9, 171, 0, 8, 5, 0, 8, 133, 0, 8, 69, 0, 9,\n\t\t\t235, 80, 7, 8, 0, 8, 93, 0, 8, 29, 0, 9, 155, 84, 7, 83, 0, 8, 125, 0, 8, 61, 0, 9, 219, 82, 7, 23, 0, 8, 109, 0, 8, 45, 0, 9, 187, 0, 8, 13, 0, 8,\n\t\t\t141, 0, 8, 77, 0, 9, 251, 80, 7, 3, 0, 8, 83, 0, 8, 19, 85, 8, 195, 83, 7, 35, 0, 8, 115, 0, 8, 51, 0, 9, 199, 81, 7, 11, 0, 8, 99, 0, 8, 35, 0, 9,\n\t\t\t167, 0, 8, 3, 0, 8, 131, 0, 8, 67, 0, 9, 231, 80, 7, 7, 0, 8, 91, 0, 8, 27, 0, 9, 151, 84, 7, 67, 0, 8, 123, 0, 8, 59, 0, 9, 215, 82, 7, 19, 0, 8,\n\t\t\t107, 0, 8, 43, 0, 9, 183, 0, 8, 11, 0, 8, 139, 0, 8, 75, 0, 9, 247, 80, 7, 5, 0, 8, 87, 0, 8, 23, 192, 8, 0, 83, 7, 51, 0, 8, 119, 0, 8, 55, 0, 9,\n\t\t\t207, 81, 7, 15, 0, 8, 103, 0, 8, 39, 0, 9, 175, 0, 8, 7, 0, 8, 135, 0, 8, 71, 0, 9, 239, 80, 7, 9, 0, 8, 95, 0, 8, 31, 0, 9, 159, 84, 7, 99, 0, 8,\n\t\t\t127, 0, 8, 63, 0, 9, 223, 82, 7, 27, 0, 8, 111, 0, 8, 47, 0, 9, 191, 0, 8, 15, 0, 8, 143, 0, 8, 79, 0, 9, 255 ];\n\tvar fixed_td = [ 80, 5, 1, 87, 5, 257, 83, 5, 17, 91, 5, 4097, 81, 5, 5, 89, 5, 1025, 85, 5, 65, 93, 5, 16385, 80, 5, 3, 88, 5, 513, 84, 5, 33, 92, 5,\n\t\t\t8193, 82, 5, 9, 90, 5, 2049, 86, 5, 129, 192, 5, 24577, 80, 5, 2, 87, 5, 385, 83, 5, 25, 91, 5, 6145, 81, 5, 7, 89, 5, 1537, 85, 5, 97, 93, 5,\n\t\t\t24577, 80, 5, 4, 88, 5, 769, 84, 5, 49, 92, 5, 12289, 82, 5, 13, 90, 5, 3073, 86, 5, 193, 192, 5, 24577 ];\n\n\t// Tables for deflate from PKZIP's appnote.txt.\n\tvar cplens = [ // Copy lengths for literal codes 257..285\n\t3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0 ];\n\n\t// see note #13 above about 258\n\tvar cplext = [ // Extra bits for literal codes 257..285\n\t0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 112, 112 // 112==invalid\n\t];\n\n\tvar cpdist = [ // Copy offsets for distance codes 0..29\n\t1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577 ];\n\n\tvar cpdext = [ // Extra bits for distance codes\n\t0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13 ];\n\n\t// If BMAX needs to be larger than 16, then h and x[] should be uLong.\n\tvar BMAX = 15; // maximum bit length of any code\n\n\tfunction InfTree() {\n\t\tvar that = this;\n\n\t\tvar hn; // hufts used in space\n\t\tvar v; // work area for huft_build\n\t\tvar c; // bit length count table\n\t\tvar r; // table entry for structure assignment\n\t\tvar u; // table stack\n\t\tvar x; // bit offsets, then code stack\n\n\t\tfunction huft_build(b, // code lengths in bits (all assumed <=\n\t\t// BMAX)\n\t\tbindex, n, // number of codes (assumed <= 288)\n\t\ts, // number of simple-valued codes (0..s-1)\n\t\td, // list of base values for non-simple codes\n\t\te, // list of extra bits for non-simple codes\n\t\tt, // result: starting table\n\t\tm, // maximum lookup bits, returns actual\n\t\thp,// space for trees\n\t\thn,// hufts used in space\n\t\tv // working area: values in order of bit length\n\t\t) {\n\t\t\t// Given a list of code lengths and a maximum table size, make a set of\n\t\t\t// tables to decode that set of codes. Return Z_OK on success,\n\t\t\t// Z_BUF_ERROR\n\t\t\t// if the given code set is incomplete (the tables are still built in\n\t\t\t// this\n\t\t\t// case), Z_DATA_ERROR if the input is invalid (an over-subscribed set\n\t\t\t// of\n\t\t\t// lengths), or Z_MEM_ERROR if not enough memory.\n\n\t\t\tvar a; // counter for codes of length k\n\t\t\tvar f; // i repeats in table every f entries\n\t\t\tvar g; // maximum code length\n\t\t\tvar h; // table level\n\t\t\tvar i; // counter, current code\n\t\t\tvar j; // counter\n\t\t\tvar k; // number of bits in current code\n\t\t\tvar l; // bits per table (returned in m)\n\t\t\tvar mask; // (1 << w) - 1, to avoid cc -O bug on HP\n\t\t\tvar p; // pointer into c[], b[], or v[]\n\t\t\tvar q; // points to current table\n\t\t\tvar w; // bits before this table == (l * h)\n\t\t\tvar xp; // pointer into x\n\t\t\tvar y; // number of dummy codes added\n\t\t\tvar z; // number of entries in current table\n\n\t\t\t// Generate counts for each bit length\n\n\t\t\tp = 0;\n\t\t\ti = n;\n\t\t\tdo {\n\t\t\t\tc[b[bindex + p]]++;\n\t\t\t\tp++;\n\t\t\t\ti--; // assume all entries <= BMAX\n\t\t\t} while (i !== 0);\n\n\t\t\tif (c[0] == n) { // null input--all zero length codes\n\t\t\t\tt[0] = -1;\n\t\t\t\tm[0] = 0;\n\t\t\t\treturn Z_OK;\n\t\t\t}\n\n\t\t\t// Find minimum and maximum length, bound *m by those\n\t\t\tl = m[0];\n\t\t\tfor (j = 1; j <= BMAX; j++)\n\t\t\t\tif (c[j] !== 0)\n\t\t\t\t\tbreak;\n\t\t\tk = j; // minimum code length\n\t\t\tif (l < j) {\n\t\t\t\tl = j;\n\t\t\t}\n\t\t\tfor (i = BMAX; i !== 0; i--) {\n\t\t\t\tif (c[i] !== 0)\n\t\t\t\t\tbreak;\n\t\t\t}\n\t\t\tg = i; // maximum code length\n\t\t\tif (l > i) {\n\t\t\t\tl = i;\n\t\t\t}\n\t\t\tm[0] = l;\n\n\t\t\t// Adjust last length count to fill out codes, if needed\n\t\t\tfor (y = 1 << j; j < i; j++, y <<= 1) {\n\t\t\t\tif ((y -= c[j]) < 0) {\n\t\t\t\t\treturn Z_DATA_ERROR;\n\t\t\t\t}\n\t\t\t}\n\t\t\tif ((y -= c[i]) < 0) {\n\t\t\t\treturn Z_DATA_ERROR;\n\t\t\t}\n\t\t\tc[i] += y;\n\n\t\t\t// Generate starting offsets into the value table for each length\n\t\t\tx[1] = j = 0;\n\t\t\tp = 1;\n\t\t\txp = 2;\n\t\t\twhile (--i !== 0) { // note that i == g from above\n\t\t\t\tx[xp] = (j += c[p]);\n\t\t\t\txp++;\n\t\t\t\tp++;\n\t\t\t}\n\n\t\t\t// Make a table of values in order of bit lengths\n\t\t\ti = 0;\n\t\t\tp = 0;\n\t\t\tdo {\n\t\t\t\tif ((j = b[bindex + p]) !== 0) {\n\t\t\t\t\tv[x[j]++] = i;\n\t\t\t\t}\n\t\t\t\tp++;\n\t\t\t} while (++i < n);\n\t\t\tn = x[g]; // set n to length of v\n\n\t\t\t// Generate the Huffman codes and for each, make the table entries\n\t\t\tx[0] = i = 0; // first Huffman code is zero\n\t\t\tp = 0; // grab values in bit order\n\t\t\th = -1; // no tables yet--level -1\n\t\t\tw = -l; // bits decoded == (l * h)\n\t\t\tu[0] = 0; // just to keep compilers happy\n\t\t\tq = 0; // ditto\n\t\t\tz = 0; // ditto\n\n\t\t\t// go through the bit lengths (k already is bits in shortest code)\n\t\t\tfor (; k <= g; k++) {\n\t\t\t\ta = c[k];\n\t\t\t\twhile (a-- !== 0) {\n\t\t\t\t\t// here i is the Huffman code of length k bits for value *p\n\t\t\t\t\t// make tables up to required level\n\t\t\t\t\twhile (k > w + l) {\n\t\t\t\t\t\th++;\n\t\t\t\t\t\tw += l; // previous table always l bits\n\t\t\t\t\t\t// compute minimum size table less than or equal to l bits\n\t\t\t\t\t\tz = g - w;\n\t\t\t\t\t\tz = (z > l) ? l : z; // table size upper limit\n\t\t\t\t\t\tif ((f = 1 << (j = k - w)) > a + 1) { // try a k-w bit table\n\t\t\t\t\t\t\t// too few codes for\n\t\t\t\t\t\t\t// k-w bit table\n\t\t\t\t\t\t\tf -= a + 1; // deduct codes from patterns left\n\t\t\t\t\t\t\txp = k;\n\t\t\t\t\t\t\tif (j < z) {\n\t\t\t\t\t\t\t\twhile (++j < z) { // try smaller tables up to z bits\n\t\t\t\t\t\t\t\t\tif ((f <<= 1) <= c[++xp])\n\t\t\t\t\t\t\t\t\t\tbreak; // enough codes to use up j bits\n\t\t\t\t\t\t\t\t\tf -= c[xp]; // else deduct codes from patterns\n\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t}\n\t\t\t\t\t\tz = 1 << j; // table entries for j-bit table\n\n\t\t\t\t\t\t// allocate new table\n\t\t\t\t\t\tif (hn[0] + z > MANY) { // (note: doesn't matter for fixed)\n\t\t\t\t\t\t\treturn Z_DATA_ERROR; // overflow of MANY\n\t\t\t\t\t\t}\n\t\t\t\t\t\tu[h] = q = /* hp+ */hn[0]; // DEBUG\n\t\t\t\t\t\thn[0] += z;\n\n\t\t\t\t\t\t// connect to last table, if there is one\n\t\t\t\t\t\tif (h !== 0) {\n\t\t\t\t\t\t\tx[h] = i; // save pattern for backing up\n\t\t\t\t\t\t\tr[0] = /* (byte) */j; // bits in this table\n\t\t\t\t\t\t\tr[1] = /* (byte) */l; // bits to dump before this table\n\t\t\t\t\t\t\tj = i >>> (w - l);\n\t\t\t\t\t\t\tr[2] = /* (int) */(q - u[h - 1] - j); // offset to this table\n\t\t\t\t\t\t\thp.set(r, (u[h - 1] + j) * 3);\n\t\t\t\t\t\t\t// to\n\t\t\t\t\t\t\t// last\n\t\t\t\t\t\t\t// table\n\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\tt[0] = q; // first table is returned result\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\n\t\t\t\t\t// set up table entry in r\n\t\t\t\t\tr[1] = /* (byte) */(k - w);\n\t\t\t\t\tif (p >= n) {\n\t\t\t\t\t\tr[0] = 128 + 64; // out of values--invalid code\n\t\t\t\t\t} else if (v[p] < s) {\n\t\t\t\t\t\tr[0] = /* (byte) */(v[p] < 256 ? 0 : 32 + 64); // 256 is\n\t\t\t\t\t\t// end-of-block\n\t\t\t\t\t\tr[2] = v[p++]; // simple code is just the value\n\t\t\t\t\t} else {\n\t\t\t\t\t\tr[0] = /* (byte) */(e[v[p] - s] + 16 + 64); // non-simple--look\n\t\t\t\t\t\t// up in lists\n\t\t\t\t\t\tr[2] = d[v[p++] - s];\n\t\t\t\t\t}\n\n\t\t\t\t\t// fill code-like entries with r\n\t\t\t\t\tf = 1 << (k - w);\n\t\t\t\t\tfor (j = i >>> w; j < z; j += f) {\n\t\t\t\t\t\thp.set(r, (q + j) * 3);\n\t\t\t\t\t}\n\n\t\t\t\t\t// backwards increment the k-bit code i\n\t\t\t\t\tfor (j = 1 << (k - 1); (i & j) !== 0; j >>>= 1) {\n\t\t\t\t\t\ti ^= j;\n\t\t\t\t\t}\n\t\t\t\t\ti ^= j;\n\n\t\t\t\t\t// backup over finished tables\n\t\t\t\t\tmask = (1 << w) - 1; // needed on HP, cc -O bug\n\t\t\t\t\twhile ((i & mask) != x[h]) {\n\t\t\t\t\t\th--; // don't need to update q\n\t\t\t\t\t\tw -= l;\n\t\t\t\t\t\tmask = (1 << w) - 1;\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\t// Return Z_BUF_ERROR if we were given an incomplete table\n\t\t\treturn y !== 0 && g != 1 ? Z_BUF_ERROR : Z_OK;\n\t\t}\n\n\t\tfunction initWorkArea(vsize) {\n\t\t\tvar i;\n\t\t\tif (!hn) {\n\t\t\t\thn = []; // []; //new Array(1);\n\t\t\t\tv = []; // new Array(vsize);\n\t\t\t\tc = new Int32Array(BMAX + 1); // new Array(BMAX + 1);\n\t\t\t\tr = []; // new Array(3);\n\t\t\t\tu = new Int32Array(BMAX); // new Array(BMAX);\n\t\t\t\tx = new Int32Array(BMAX + 1); // new Array(BMAX + 1);\n\t\t\t}\n\t\t\tif (v.length < vsize) {\n\t\t\t\tv = []; // new Array(vsize);\n\t\t\t}\n\t\t\tfor (i = 0; i < vsize; i++) {\n\t\t\t\tv[i] = 0;\n\t\t\t}\n\t\t\tfor (i = 0; i < BMAX + 1; i++) {\n\t\t\t\tc[i] = 0;\n\t\t\t}\n\t\t\tfor (i = 0; i < 3; i++) {\n\t\t\t\tr[i] = 0;\n\t\t\t}\n\t\t\t// for(int i=0; i<BMAX; i++){u[i]=0;}\n\t\t\tu.set(c.subarray(0, BMAX), 0);\n\t\t\t// for(int i=0; i<BMAX+1; i++){x[i]=0;}\n\t\t\tx.set(c.subarray(0, BMAX + 1), 0);\n\t\t}\n\n\t\tthat.inflate_trees_bits = function(c, // 19 code lengths\n\t\tbb, // bits tree desired/actual depth\n\t\ttb, // bits tree result\n\t\thp, // space for trees\n\t\tz // for messages\n\t\t) {\n\t\t\tvar result;\n\t\t\tinitWorkArea(19);\n\t\t\thn[0] = 0;\n\t\t\tresult = huft_build(c, 0, 19, 19, null, null, tb, bb, hp, hn, v);\n\n\t\t\tif (result == Z_DATA_ERROR) {\n\t\t\t\tz.msg = \"oversubscribed dynamic bit lengths tree\";\n\t\t\t} else if (result == Z_BUF_ERROR || bb[0] === 0) {\n\t\t\t\tz.msg = \"incomplete dynamic bit lengths tree\";\n\t\t\t\tresult = Z_DATA_ERROR;\n\t\t\t}\n\t\t\treturn result;\n\t\t};\n\n\t\tthat.inflate_trees_dynamic = function(nl, // number of literal/length codes\n\t\tnd, // number of distance codes\n\t\tc, // that many (total) code lengths\n\t\tbl, // literal desired/actual bit depth\n\t\tbd, // distance desired/actual bit depth\n\t\ttl, // literal/length tree result\n\t\ttd, // distance tree result\n\t\thp, // space for trees\n\t\tz // for messages\n\t\t) {\n\t\t\tvar result;\n\n\t\t\t// build literal/length tree\n\t\t\tinitWorkArea(288);\n\t\t\thn[0] = 0;\n\t\t\tresult = huft_build(c, 0, nl, 257, cplens, cplext, tl, bl, hp, hn, v);\n\t\t\tif (result != Z_OK || bl[0] === 0) {\n\t\t\t\tif (result == Z_DATA_ERROR) {\n\t\t\t\t\tz.msg = \"oversubscribed literal/length tree\";\n\t\t\t\t} else if (result != Z_MEM_ERROR) {\n\t\t\t\t\tz.msg = \"incomplete literal/length tree\";\n\t\t\t\t\tresult = Z_DATA_ERROR;\n\t\t\t\t}\n\t\t\t\treturn result;\n\t\t\t}\n\n\t\t\t// build distance tree\n\t\t\tinitWorkArea(288);\n\t\t\tresult = huft_build(c, nl, nd, 0, cpdist, cpdext, td, bd, hp, hn, v);\n\n\t\t\tif (result != Z_OK || (bd[0] === 0 && nl > 257)) {\n\t\t\t\tif (result == Z_DATA_ERROR) {\n\t\t\t\t\tz.msg = \"oversubscribed distance tree\";\n\t\t\t\t} else if (result == Z_BUF_ERROR) {\n\t\t\t\t\tz.msg = \"incomplete distance tree\";\n\t\t\t\t\tresult = Z_DATA_ERROR;\n\t\t\t\t} else if (result != Z_MEM_ERROR) {\n\t\t\t\t\tz.msg = \"empty distance tree with lengths\";\n\t\t\t\t\tresult = Z_DATA_ERROR;\n\t\t\t\t}\n\t\t\t\treturn result;\n\t\t\t}\n\n\t\t\treturn Z_OK;\n\t\t};\n\n\t}\n\n\tInfTree.inflate_trees_fixed = function(bl, // literal desired/actual bit depth\n\tbd, // distance desired/actual bit depth\n\ttl,// literal/length tree result\n\ttd// distance tree result\n\t) {\n\t\tbl[0] = fixed_bl;\n\t\tbd[0] = fixed_bd;\n\t\ttl[0] = fixed_tl;\n\t\ttd[0] = fixed_td;\n\t\treturn Z_OK;\n\t};\n\n\t// InfCodes\n\n\t// waiting for \"i:\"=input,\n\t// \"o:\"=output,\n\t// \"x:\"=nothing\n\tvar START = 0; // x: set up for LEN\n\tvar LEN = 1; // i: get length/literal/eob next\n\tvar LENEXT = 2; // i: getting length extra (have base)\n\tvar DIST = 3; // i: get distance next\n\tvar DISTEXT = 4;// i: getting distance extra\n\tvar COPY = 5; // o: copying bytes in window, waiting\n\t// for space\n\tvar LIT = 6; // o: got literal, waiting for output\n\t// space\n\tvar WASH = 7; // o: got eob, possibly still output\n\t// waiting\n\tvar END = 8; // x: got eob and all data flushed\n\tvar BADCODE = 9;// x: got error\n\n\tfunction InfCodes() {\n\t\tvar that = this;\n\n\t\tvar mode; // current inflate_codes mode\n\n\t\t// mode dependent information\n\t\tvar len = 0;\n\n\t\tvar tree; // pointer into tree\n\t\tvar tree_index = 0;\n\t\tvar need = 0; // bits needed\n\n\t\tvar lit = 0;\n\n\t\t// if EXT or COPY, where and how much\n\t\tvar get = 0; // bits to get for extra\n\t\tvar dist = 0; // distance back to copy from\n\n\t\tvar lbits = 0; // ltree bits decoded per branch\n\t\tvar dbits = 0; // dtree bits decoder per branch\n\t\tvar ltree; // literal/length/eob tree\n\t\tvar ltree_index = 0; // literal/length/eob tree\n\t\tvar dtree; // distance tree\n\t\tvar dtree_index = 0; // distance tree\n\n\t\t// Called with number of bytes left to write in window at least 258\n\t\t// (the maximum string length) and number of input bytes available\n\t\t// at least ten. The ten bytes are six bytes for the longest length/\n\t\t// distance pair plus four bytes for overloading the bit buffer.\n\n\t\tfunction inflate_fast(bl, bd, tl, tl_index, td, td_index, s, z) {\n\t\t\tvar t; // temporary pointer\n\t\t\tvar tp; // temporary pointer\n\t\t\tvar tp_index; // temporary pointer\n\t\t\tvar e; // extra bits or operation\n\t\t\tvar b; // bit buffer\n\t\t\tvar k; // bits in bit buffer\n\t\t\tvar p; // input data pointer\n\t\t\tvar n; // bytes available there\n\t\t\tvar q; // output window write pointer\n\t\t\tvar m; // bytes to end of window or read pointer\n\t\t\tvar ml; // mask for literal/length tree\n\t\t\tvar md; // mask for distance tree\n\t\t\tvar c; // bytes to copy\n\t\t\tvar d; // distance back to copy from\n\t\t\tvar r; // copy source pointer\n\n\t\t\tvar tp_index_t_3; // (tp_index+t)*3\n\n\t\t\t// load input, output, bit values\n\t\t\tp = z.next_in_index;\n\t\t\tn = z.avail_in;\n\t\t\tb = s.bitb;\n\t\t\tk = s.bitk;\n\t\t\tq = s.write;\n\t\t\tm = q < s.read ? s.read - q - 1 : s.end - q;\n\n\t\t\t// initialize masks\n\t\t\tml = inflate_mask[bl];\n\t\t\tmd = inflate_mask[bd];\n\n\t\t\t// do until not enough input or output space for fast loop\n\t\t\tdo { // assume called with m >= 258 && n >= 10\n\t\t\t\t// get literal/length code\n\t\t\t\twhile (k < (20)) { // max bits for literal/length code\n\t\t\t\t\tn--;\n\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\tk += 8;\n\t\t\t\t}\n\n\t\t\t\tt = b & ml;\n\t\t\t\ttp = tl;\n\t\t\t\ttp_index = tl_index;\n\t\t\t\ttp_index_t_3 = (tp_index + t) * 3;\n\t\t\t\tif ((e = tp[tp_index_t_3]) === 0) {\n\t\t\t\t\tb >>= (tp[tp_index_t_3 + 1]);\n\t\t\t\t\tk -= (tp[tp_index_t_3 + 1]);\n\n\t\t\t\t\ts.window[q++] = /* (byte) */tp[tp_index_t_3 + 2];\n\t\t\t\t\tm--;\n\t\t\t\t\tcontinue;\n\t\t\t\t}\n\t\t\t\tdo {\n\n\t\t\t\t\tb >>= (tp[tp_index_t_3 + 1]);\n\t\t\t\t\tk -= (tp[tp_index_t_3 + 1]);\n\n\t\t\t\t\tif ((e & 16) !== 0) {\n\t\t\t\t\t\te &= 15;\n\t\t\t\t\t\tc = tp[tp_index_t_3 + 2] + (/* (int) */b & inflate_mask[e]);\n\n\t\t\t\t\t\tb >>= e;\n\t\t\t\t\t\tk -= e;\n\n\t\t\t\t\t\t// decode distance base of block to copy\n\t\t\t\t\t\twhile (k < (15)) { // max bits for distance code\n\t\t\t\t\t\t\tn--;\n\t\t\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\t\t\tk += 8;\n\t\t\t\t\t\t}\n\n\t\t\t\t\t\tt = b & md;\n\t\t\t\t\t\ttp = td;\n\t\t\t\t\t\ttp_index = td_index;\n\t\t\t\t\t\ttp_index_t_3 = (tp_index + t) * 3;\n\t\t\t\t\t\te = tp[tp_index_t_3];\n\n\t\t\t\t\t\tdo {\n\n\t\t\t\t\t\t\tb >>= (tp[tp_index_t_3 + 1]);\n\t\t\t\t\t\t\tk -= (tp[tp_index_t_3 + 1]);\n\n\t\t\t\t\t\t\tif ((e & 16) !== 0) {\n\t\t\t\t\t\t\t\t// get extra bits to add to distance base\n\t\t\t\t\t\t\t\te &= 15;\n\t\t\t\t\t\t\t\twhile (k < (e)) { // get extra bits (up to 13)\n\t\t\t\t\t\t\t\t\tn--;\n\t\t\t\t\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\t\t\t\t\tk += 8;\n\t\t\t\t\t\t\t\t}\n\n\t\t\t\t\t\t\t\td = tp[tp_index_t_3 + 2] + (b & inflate_mask[e]);\n\n\t\t\t\t\t\t\t\tb >>= (e);\n\t\t\t\t\t\t\t\tk -= (e);\n\n\t\t\t\t\t\t\t\t// do the copy\n\t\t\t\t\t\t\t\tm -= c;\n\t\t\t\t\t\t\t\tif (q >= d) { // offset before dest\n\t\t\t\t\t\t\t\t\t// just copy\n\t\t\t\t\t\t\t\t\tr = q - d;\n\t\t\t\t\t\t\t\t\tif (q - r > 0 && 2 > (q - r)) {\n\t\t\t\t\t\t\t\t\t\ts.window[q++] = s.window[r++]; // minimum\n\t\t\t\t\t\t\t\t\t\t// count is\n\t\t\t\t\t\t\t\t\t\t// three,\n\t\t\t\t\t\t\t\t\t\ts.window[q++] = s.window[r++]; // so unroll\n\t\t\t\t\t\t\t\t\t\t// loop a\n\t\t\t\t\t\t\t\t\t\t// little\n\t\t\t\t\t\t\t\t\t\tc -= 2;\n\t\t\t\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\t\t\t\ts.window.set(s.window.subarray(r, r + 2), q);\n\t\t\t\t\t\t\t\t\t\tq += 2;\n\t\t\t\t\t\t\t\t\t\tr += 2;\n\t\t\t\t\t\t\t\t\t\tc -= 2;\n\t\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t\t} else { // else offset after destination\n\t\t\t\t\t\t\t\t\tr = q - d;\n\t\t\t\t\t\t\t\t\tdo {\n\t\t\t\t\t\t\t\t\t\tr += s.end; // force pointer in window\n\t\t\t\t\t\t\t\t\t} while (r < 0); // covers invalid distances\n\t\t\t\t\t\t\t\t\te = s.end - r;\n\t\t\t\t\t\t\t\t\tif (c > e) { // if source crosses,\n\t\t\t\t\t\t\t\t\t\tc -= e; // wrapped copy\n\t\t\t\t\t\t\t\t\t\tif (q - r > 0 && e > (q - r)) {\n\t\t\t\t\t\t\t\t\t\t\tdo {\n\t\t\t\t\t\t\t\t\t\t\t\ts.window[q++] = s.window[r++];\n\t\t\t\t\t\t\t\t\t\t\t} while (--e !== 0);\n\t\t\t\t\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\t\t\t\t\ts.window.set(s.window.subarray(r, r + e), q);\n\t\t\t\t\t\t\t\t\t\t\tq += e;\n\t\t\t\t\t\t\t\t\t\t\tr += e;\n\t\t\t\t\t\t\t\t\t\t\te = 0;\n\t\t\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t\t\t\tr = 0; // copy rest from start of window\n\t\t\t\t\t\t\t\t\t}\n\n\t\t\t\t\t\t\t\t}\n\n\t\t\t\t\t\t\t\t// copy all or what's left\n\t\t\t\t\t\t\t\tif (q - r > 0 && c > (q - r)) {\n\t\t\t\t\t\t\t\t\tdo {\n\t\t\t\t\t\t\t\t\t\ts.window[q++] = s.window[r++];\n\t\t\t\t\t\t\t\t\t} while (--c !== 0);\n\t\t\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\t\t\ts.window.set(s.window.subarray(r, r + c), q);\n\t\t\t\t\t\t\t\t\tq += c;\n\t\t\t\t\t\t\t\t\tr += c;\n\t\t\t\t\t\t\t\t\tc = 0;\n\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t\tbreak;\n\t\t\t\t\t\t\t} else if ((e & 64) === 0) {\n\t\t\t\t\t\t\t\tt += tp[tp_index_t_3 + 2];\n\t\t\t\t\t\t\t\tt += (b & inflate_mask[e]);\n\t\t\t\t\t\t\t\ttp_index_t_3 = (tp_index + t) * 3;\n\t\t\t\t\t\t\t\te = tp[tp_index_t_3];\n\t\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\t\tz.msg = \"invalid distance code\";\n\n\t\t\t\t\t\t\t\tc = z.avail_in - n;\n\t\t\t\t\t\t\t\tc = (k >> 3) < c ? k >> 3 : c;\n\t\t\t\t\t\t\t\tn += c;\n\t\t\t\t\t\t\t\tp -= c;\n\t\t\t\t\t\t\t\tk -= c << 3;\n\n\t\t\t\t\t\t\t\ts.bitb = b;\n\t\t\t\t\t\t\t\ts.bitk = k;\n\t\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\t\ts.write = q;\n\n\t\t\t\t\t\t\t\treturn Z_DATA_ERROR;\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t} while (true);\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\n\t\t\t\t\tif ((e & 64) === 0) {\n\t\t\t\t\t\tt += tp[tp_index_t_3 + 2];\n\t\t\t\t\t\tt += (b & inflate_mask[e]);\n\t\t\t\t\t\ttp_index_t_3 = (tp_index + t) * 3;\n\t\t\t\t\t\tif ((e = tp[tp_index_t_3]) === 0) {\n\n\t\t\t\t\t\t\tb >>= (tp[tp_index_t_3 + 1]);\n\t\t\t\t\t\t\tk -= (tp[tp_index_t_3 + 1]);\n\n\t\t\t\t\t\t\ts.window[q++] = /* (byte) */tp[tp_index_t_3 + 2];\n\t\t\t\t\t\t\tm--;\n\t\t\t\t\t\t\tbreak;\n\t\t\t\t\t\t}\n\t\t\t\t\t} else if ((e & 32) !== 0) {\n\n\t\t\t\t\t\tc = z.avail_in - n;\n\t\t\t\t\t\tc = (k >> 3) < c ? k >> 3 : c;\n\t\t\t\t\t\tn += c;\n\t\t\t\t\t\tp -= c;\n\t\t\t\t\t\tk -= c << 3;\n\n\t\t\t\t\t\ts.bitb = b;\n\t\t\t\t\t\ts.bitk = k;\n\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\ts.write = q;\n\n\t\t\t\t\t\treturn Z_STREAM_END;\n\t\t\t\t\t} else {\n\t\t\t\t\t\tz.msg = \"invalid literal/length code\";\n\n\t\t\t\t\t\tc = z.avail_in - n;\n\t\t\t\t\t\tc = (k >> 3) < c ? k >> 3 : c;\n\t\t\t\t\t\tn += c;\n\t\t\t\t\t\tp -= c;\n\t\t\t\t\t\tk -= c << 3;\n\n\t\t\t\t\t\ts.bitb = b;\n\t\t\t\t\t\ts.bitk = k;\n\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\ts.write = q;\n\n\t\t\t\t\t\treturn Z_DATA_ERROR;\n\t\t\t\t\t}\n\t\t\t\t} while (true);\n\t\t\t} while (m >= 258 && n >= 10);\n\n\t\t\t// not enough input or output--restore pointers and return\n\t\t\tc = z.avail_in - n;\n\t\t\tc = (k >> 3) < c ? k >> 3 : c;\n\t\t\tn += c;\n\t\t\tp -= c;\n\t\t\tk -= c << 3;\n\n\t\t\ts.bitb = b;\n\t\t\ts.bitk = k;\n\t\t\tz.avail_in = n;\n\t\t\tz.total_in += p - z.next_in_index;\n\t\t\tz.next_in_index = p;\n\t\t\ts.write = q;\n\n\t\t\treturn Z_OK;\n\t\t}\n\n\t\tthat.init = function(bl, bd, tl, tl_index, td, td_index) {\n\t\t\tmode = START;\n\t\t\tlbits = /* (byte) */bl;\n\t\t\tdbits = /* (byte) */bd;\n\t\t\tltree = tl;\n\t\t\tltree_index = tl_index;\n\t\t\tdtree = td;\n\t\t\tdtree_index = td_index;\n\t\t\ttree = null;\n\t\t};\n\n\t\tthat.proc = function(s, z, r) {\n\t\t\tvar j; // temporary storage\n\t\t\tvar tindex; // temporary pointer\n\t\t\tvar e; // extra bits or operation\n\t\t\tvar b = 0; // bit buffer\n\t\t\tvar k = 0; // bits in bit buffer\n\t\t\tvar p = 0; // input data pointer\n\t\t\tvar n; // bytes available there\n\t\t\tvar q; // output window write pointer\n\t\t\tvar m; // bytes to end of window or read pointer\n\t\t\tvar f; // pointer to copy strings from\n\n\t\t\t// copy input/output information to locals (UPDATE macro restores)\n\t\t\tp = z.next_in_index;\n\t\t\tn = z.avail_in;\n\t\t\tb = s.bitb;\n\t\t\tk = s.bitk;\n\t\t\tq = s.write;\n\t\t\tm = q < s.read ? s.read - q - 1 : s.end - q;\n\n\t\t\t// process input and output based on current state\n\t\t\twhile (true) {\n\t\t\t\tswitch (mode) {\n\t\t\t\t// waiting for \"i:\"=input, \"o:\"=output, \"x:\"=nothing\n\t\t\t\tcase START: // x: set up for LEN\n\t\t\t\t\tif (m >= 258 && n >= 10) {\n\n\t\t\t\t\t\ts.bitb = b;\n\t\t\t\t\t\ts.bitk = k;\n\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\ts.write = q;\n\t\t\t\t\t\tr = inflate_fast(lbits, dbits, ltree, ltree_index, dtree, dtree_index, s, z);\n\n\t\t\t\t\t\tp = z.next_in_index;\n\t\t\t\t\t\tn = z.avail_in;\n\t\t\t\t\t\tb = s.bitb;\n\t\t\t\t\t\tk = s.bitk;\n\t\t\t\t\t\tq = s.write;\n\t\t\t\t\t\tm = q < s.read ? s.read - q - 1 : s.end - q;\n\n\t\t\t\t\t\tif (r != Z_OK) {\n\t\t\t\t\t\t\tmode = r == Z_STREAM_END ? WASH : BADCODE;\n\t\t\t\t\t\t\tbreak;\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t\tneed = lbits;\n\t\t\t\t\ttree = ltree;\n\t\t\t\t\ttree_index = ltree_index;\n\n\t\t\t\t\tmode = LEN;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase LEN: // i: get length/literal/eob next\n\t\t\t\t\tj = need;\n\n\t\t\t\t\twhile (k < (j)) {\n\t\t\t\t\t\tif (n !== 0)\n\t\t\t\t\t\t\tr = Z_OK;\n\t\t\t\t\t\telse {\n\n\t\t\t\t\t\t\ts.bitb = b;\n\t\t\t\t\t\t\ts.bitk = k;\n\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\ts.write = q;\n\t\t\t\t\t\t\treturn s.inflate_flush(z, r);\n\t\t\t\t\t\t}\n\t\t\t\t\t\tn--;\n\t\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\t\tk += 8;\n\t\t\t\t\t}\n\n\t\t\t\t\ttindex = (tree_index + (b & inflate_mask[j])) * 3;\n\n\t\t\t\t\tb >>>= (tree[tindex + 1]);\n\t\t\t\t\tk -= (tree[tindex + 1]);\n\n\t\t\t\t\te = tree[tindex];\n\n\t\t\t\t\tif (e === 0) { // literal\n\t\t\t\t\t\tlit = tree[tindex + 2];\n\t\t\t\t\t\tmode = LIT;\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tif ((e & 16) !== 0) { // length\n\t\t\t\t\t\tget = e & 15;\n\t\t\t\t\t\tlen = tree[tindex + 2];\n\t\t\t\t\t\tmode = LENEXT;\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tif ((e & 64) === 0) { // next table\n\t\t\t\t\t\tneed = e;\n\t\t\t\t\t\ttree_index = tindex / 3 + tree[tindex + 2];\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tif ((e & 32) !== 0) { // end of block\n\t\t\t\t\t\tmode = WASH;\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tmode = BADCODE; // invalid code\n\t\t\t\t\tz.msg = \"invalid literal/length code\";\n\t\t\t\t\tr = Z_DATA_ERROR;\n\n\t\t\t\t\ts.bitb = b;\n\t\t\t\t\ts.bitk = k;\n\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\ts.write = q;\n\t\t\t\t\treturn s.inflate_flush(z, r);\n\n\t\t\t\tcase LENEXT: // i: getting length extra (have base)\n\t\t\t\t\tj = get;\n\n\t\t\t\t\twhile (k < (j)) {\n\t\t\t\t\t\tif (n !== 0)\n\t\t\t\t\t\t\tr = Z_OK;\n\t\t\t\t\t\telse {\n\n\t\t\t\t\t\t\ts.bitb = b;\n\t\t\t\t\t\t\ts.bitk = k;\n\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\ts.write = q;\n\t\t\t\t\t\t\treturn s.inflate_flush(z, r);\n\t\t\t\t\t\t}\n\t\t\t\t\t\tn--;\n\t\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\t\tk += 8;\n\t\t\t\t\t}\n\n\t\t\t\t\tlen += (b & inflate_mask[j]);\n\n\t\t\t\t\tb >>= j;\n\t\t\t\t\tk -= j;\n\n\t\t\t\t\tneed = dbits;\n\t\t\t\t\ttree = dtree;\n\t\t\t\t\ttree_index = dtree_index;\n\t\t\t\t\tmode = DIST;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase DIST: // i: get distance next\n\t\t\t\t\tj = need;\n\n\t\t\t\t\twhile (k < (j)) {\n\t\t\t\t\t\tif (n !== 0)\n\t\t\t\t\t\t\tr = Z_OK;\n\t\t\t\t\t\telse {\n\n\t\t\t\t\t\t\ts.bitb = b;\n\t\t\t\t\t\t\ts.bitk = k;\n\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\ts.write = q;\n\t\t\t\t\t\t\treturn s.inflate_flush(z, r);\n\t\t\t\t\t\t}\n\t\t\t\t\t\tn--;\n\t\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\t\tk += 8;\n\t\t\t\t\t}\n\n\t\t\t\t\ttindex = (tree_index + (b & inflate_mask[j])) * 3;\n\n\t\t\t\t\tb >>= tree[tindex + 1];\n\t\t\t\t\tk -= tree[tindex + 1];\n\n\t\t\t\t\te = (tree[tindex]);\n\t\t\t\t\tif ((e & 16) !== 0) { // distance\n\t\t\t\t\t\tget = e & 15;\n\t\t\t\t\t\tdist = tree[tindex + 2];\n\t\t\t\t\t\tmode = DISTEXT;\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tif ((e & 64) === 0) { // next table\n\t\t\t\t\t\tneed = e;\n\t\t\t\t\t\ttree_index = tindex / 3 + tree[tindex + 2];\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tmode = BADCODE; // invalid code\n\t\t\t\t\tz.msg = \"invalid distance code\";\n\t\t\t\t\tr = Z_DATA_ERROR;\n\n\t\t\t\t\ts.bitb = b;\n\t\t\t\t\ts.bitk = k;\n\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\ts.write = q;\n\t\t\t\t\treturn s.inflate_flush(z, r);\n\n\t\t\t\tcase DISTEXT: // i: getting distance extra\n\t\t\t\t\tj = get;\n\n\t\t\t\t\twhile (k < (j)) {\n\t\t\t\t\t\tif (n !== 0)\n\t\t\t\t\t\t\tr = Z_OK;\n\t\t\t\t\t\telse {\n\n\t\t\t\t\t\t\ts.bitb = b;\n\t\t\t\t\t\t\ts.bitk = k;\n\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\ts.write = q;\n\t\t\t\t\t\t\treturn s.inflate_flush(z, r);\n\t\t\t\t\t\t}\n\t\t\t\t\t\tn--;\n\t\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\t\tk += 8;\n\t\t\t\t\t}\n\n\t\t\t\t\tdist += (b & inflate_mask[j]);\n\n\t\t\t\t\tb >>= j;\n\t\t\t\t\tk -= j;\n\n\t\t\t\t\tmode = COPY;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase COPY: // o: copying bytes in window, waiting for space\n\t\t\t\t\tf = q - dist;\n\t\t\t\t\twhile (f < 0) { // modulo window size-\"while\" instead\n\t\t\t\t\t\tf += s.end; // of \"if\" handles invalid distances\n\t\t\t\t\t}\n\t\t\t\t\twhile (len !== 0) {\n\n\t\t\t\t\t\tif (m === 0) {\n\t\t\t\t\t\t\tif (q == s.end && s.read !== 0) {\n\t\t\t\t\t\t\t\tq = 0;\n\t\t\t\t\t\t\t\tm = q < s.read ? s.read - q - 1 : s.end - q;\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\tif (m === 0) {\n\t\t\t\t\t\t\t\ts.write = q;\n\t\t\t\t\t\t\t\tr = s.inflate_flush(z, r);\n\t\t\t\t\t\t\t\tq = s.write;\n\t\t\t\t\t\t\t\tm = q < s.read ? s.read - q - 1 : s.end - q;\n\n\t\t\t\t\t\t\t\tif (q == s.end && s.read !== 0) {\n\t\t\t\t\t\t\t\t\tq = 0;\n\t\t\t\t\t\t\t\t\tm = q < s.read ? s.read - q - 1 : s.end - q;\n\t\t\t\t\t\t\t\t}\n\n\t\t\t\t\t\t\t\tif (m === 0) {\n\t\t\t\t\t\t\t\t\ts.bitb = b;\n\t\t\t\t\t\t\t\t\ts.bitk = k;\n\t\t\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\t\t\ts.write = q;\n\t\t\t\t\t\t\t\t\treturn s.inflate_flush(z, r);\n\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t}\n\n\t\t\t\t\t\ts.window[q++] = s.window[f++];\n\t\t\t\t\t\tm--;\n\n\t\t\t\t\t\tif (f == s.end)\n\t\t\t\t\t\t\tf = 0;\n\t\t\t\t\t\tlen--;\n\t\t\t\t\t}\n\t\t\t\t\tmode = START;\n\t\t\t\t\tbreak;\n\t\t\t\tcase LIT: // o: got literal, waiting for output space\n\t\t\t\t\tif (m === 0) {\n\t\t\t\t\t\tif (q == s.end && s.read !== 0) {\n\t\t\t\t\t\t\tq = 0;\n\t\t\t\t\t\t\tm = q < s.read ? s.read - q - 1 : s.end - q;\n\t\t\t\t\t\t}\n\t\t\t\t\t\tif (m === 0) {\n\t\t\t\t\t\t\ts.write = q;\n\t\t\t\t\t\t\tr = s.inflate_flush(z, r);\n\t\t\t\t\t\t\tq = s.write;\n\t\t\t\t\t\t\tm = q < s.read ? s.read - q - 1 : s.end - q;\n\n\t\t\t\t\t\t\tif (q == s.end && s.read !== 0) {\n\t\t\t\t\t\t\t\tq = 0;\n\t\t\t\t\t\t\t\tm = q < s.read ? s.read - q - 1 : s.end - q;\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\tif (m === 0) {\n\t\t\t\t\t\t\t\ts.bitb = b;\n\t\t\t\t\t\t\t\ts.bitk = k;\n\t\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\t\ts.write = q;\n\t\t\t\t\t\t\t\treturn s.inflate_flush(z, r);\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t\tr = Z_OK;\n\n\t\t\t\t\ts.window[q++] = /* (byte) */lit;\n\t\t\t\t\tm--;\n\n\t\t\t\t\tmode = START;\n\t\t\t\t\tbreak;\n\t\t\t\tcase WASH: // o: got eob, possibly more output\n\t\t\t\t\tif (k > 7) { // return unused byte, if any\n\t\t\t\t\t\tk -= 8;\n\t\t\t\t\t\tn++;\n\t\t\t\t\t\tp--; // can always return one\n\t\t\t\t\t}\n\n\t\t\t\t\ts.write = q;\n\t\t\t\t\tr = s.inflate_flush(z, r);\n\t\t\t\t\tq = s.write;\n\t\t\t\t\tm = q < s.read ? s.read - q - 1 : s.end - q;\n\n\t\t\t\t\tif (s.read != s.write) {\n\t\t\t\t\t\ts.bitb = b;\n\t\t\t\t\t\ts.bitk = k;\n\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\ts.write = q;\n\t\t\t\t\t\treturn s.inflate_flush(z, r);\n\t\t\t\t\t}\n\t\t\t\t\tmode = END;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase END:\n\t\t\t\t\tr = Z_STREAM_END;\n\t\t\t\t\ts.bitb = b;\n\t\t\t\t\ts.bitk = k;\n\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\ts.write = q;\n\t\t\t\t\treturn s.inflate_flush(z, r);\n\n\t\t\t\tcase BADCODE: // x: got error\n\n\t\t\t\t\tr = Z_DATA_ERROR;\n\n\t\t\t\t\ts.bitb = b;\n\t\t\t\t\ts.bitk = k;\n\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\ts.write = q;\n\t\t\t\t\treturn s.inflate_flush(z, r);\n\n\t\t\t\tdefault:\n\t\t\t\t\tr = Z_STREAM_ERROR;\n\n\t\t\t\t\ts.bitb = b;\n\t\t\t\t\ts.bitk = k;\n\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\ts.write = q;\n\t\t\t\t\treturn s.inflate_flush(z, r);\n\t\t\t\t}\n\t\t\t}\n\t\t};\n\n\t\tthat.free = function() {\n\t\t\t// ZFREE(z, c);\n\t\t};\n\n\t}\n\n\t// InfBlocks\n\n\t// Table for deflate from PKZIP's appnote.txt.\n\tvar border = [ // Order of the bit length code lengths\n\t16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15 ];\n\n\tvar TYPE = 0; // get type bits (3, including end bit)\n\tvar LENS = 1; // get lengths for stored\n\tvar STORED = 2;// processing stored block\n\tvar TABLE = 3; // get table lengths\n\tvar BTREE = 4; // get bit lengths tree for a dynamic\n\t// block\n\tvar DTREE = 5; // get length, distance trees for a\n\t// dynamic block\n\tvar CODES = 6; // processing fixed or dynamic block\n\tvar DRY = 7; // output remaining window bytes\n\tvar DONELOCKS = 8; // finished last block, done\n\tvar BADBLOCKS = 9; // ot a data error--stuck here\n\n\tfunction InfBlocks(z, w) {\n\t\tvar that = this;\n\n\t\tvar mode = TYPE; // current inflate_block mode\n\n\t\tvar left = 0; // if STORED, bytes left to copy\n\n\t\tvar table = 0; // table lengths (14 bits)\n\t\tvar index = 0; // index into blens (or border)\n\t\tvar blens; // bit lengths of codes\n\t\tvar bb = [ 0 ]; // bit length tree depth\n\t\tvar tb = [ 0 ]; // bit length decoding tree\n\n\t\tvar codes = new InfCodes(); // if CODES, current state\n\n\t\tvar last = 0; // true if this block is the last block\n\n\t\tvar hufts = new Int32Array(MANY * 3); // single malloc for tree space\n\t\tvar check = 0; // check on output\n\t\tvar inftree = new InfTree();\n\n\t\tthat.bitk = 0; // bits in bit buffer\n\t\tthat.bitb = 0; // bit buffer\n\t\tthat.window = new Uint8Array(w); // sliding window\n\t\tthat.end = w; // one byte after sliding window\n\t\tthat.read = 0; // window read pointer\n\t\tthat.write = 0; // window write pointer\n\n\t\tthat.reset = function(z, c) {\n\t\t\tif (c)\n\t\t\t\tc[0] = check;\n\t\t\t// if (mode == BTREE || mode == DTREE) {\n\t\t\t// }\n\t\t\tif (mode == CODES) {\n\t\t\t\tcodes.free(z);\n\t\t\t}\n\t\t\tmode = TYPE;\n\t\t\tthat.bitk = 0;\n\t\t\tthat.bitb = 0;\n\t\t\tthat.read = that.write = 0;\n\t\t};\n\n\t\tthat.reset(z, null);\n\n\t\t// copy as much as possible from the sliding window to the output area\n\t\tthat.inflate_flush = function(z, r) {\n\t\t\tvar n;\n\t\t\tvar p;\n\t\t\tvar q;\n\n\t\t\t// local copies of source and destination pointers\n\t\t\tp = z.next_out_index;\n\t\t\tq = that.read;\n\n\t\t\t// compute number of bytes to copy as far as end of window\n\t\t\tn = /* (int) */((q <= that.write ? that.write : that.end) - q);\n\t\t\tif (n > z.avail_out)\n\t\t\t\tn = z.avail_out;\n\t\t\tif (n !== 0 && r == Z_BUF_ERROR)\n\t\t\t\tr = Z_OK;\n\n\t\t\t// update counters\n\t\t\tz.avail_out -= n;\n\t\t\tz.total_out += n;\n\n\t\t\t// copy as far as end of window\n\t\t\tz.next_out.set(that.window.subarray(q, q + n), p);\n\t\t\tp += n;\n\t\t\tq += n;\n\n\t\t\t// see if more to copy at beginning of window\n\t\t\tif (q == that.end) {\n\t\t\t\t// wrap pointers\n\t\t\t\tq = 0;\n\t\t\t\tif (that.write == that.end)\n\t\t\t\t\tthat.write = 0;\n\n\t\t\t\t// compute bytes to copy\n\t\t\t\tn = that.write - q;\n\t\t\t\tif (n > z.avail_out)\n\t\t\t\t\tn = z.avail_out;\n\t\t\t\tif (n !== 0 && r == Z_BUF_ERROR)\n\t\t\t\t\tr = Z_OK;\n\n\t\t\t\t// update counters\n\t\t\t\tz.avail_out -= n;\n\t\t\t\tz.total_out += n;\n\n\t\t\t\t// copy\n\t\t\t\tz.next_out.set(that.window.subarray(q, q + n), p);\n\t\t\t\tp += n;\n\t\t\t\tq += n;\n\t\t\t}\n\n\t\t\t// update pointers\n\t\t\tz.next_out_index = p;\n\t\t\tthat.read = q;\n\n\t\t\t// done\n\t\t\treturn r;\n\t\t};\n\n\t\tthat.proc = function(z, r) {\n\t\t\tvar t; // temporary storage\n\t\t\tvar b; // bit buffer\n\t\t\tvar k; // bits in bit buffer\n\t\t\tvar p; // input data pointer\n\t\t\tvar n; // bytes available there\n\t\t\tvar q; // output window write pointer\n\t\t\tvar m; // bytes to end of window or read pointer\n\n\t\t\tvar i;\n\n\t\t\t// copy input/output information to locals (UPDATE macro restores)\n\t\t\t// {\n\t\t\tp = z.next_in_index;\n\t\t\tn = z.avail_in;\n\t\t\tb = that.bitb;\n\t\t\tk = that.bitk;\n\t\t\t// }\n\t\t\t// {\n\t\t\tq = that.write;\n\t\t\tm = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);\n\t\t\t// }\n\n\t\t\t// process input based on current state\n\t\t\t// DEBUG dtree\n\t\t\twhile (true) {\n\t\t\t\tswitch (mode) {\n\t\t\t\tcase TYPE:\n\n\t\t\t\t\twhile (k < (3)) {\n\t\t\t\t\t\tif (n !== 0) {\n\t\t\t\t\t\t\tr = Z_OK;\n\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t\t}\n\t\t\t\t\t\tn--;\n\t\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\t\tk += 8;\n\t\t\t\t\t}\n\t\t\t\t\tt = /* (int) */(b & 7);\n\t\t\t\t\tlast = t & 1;\n\n\t\t\t\t\tswitch (t >>> 1) {\n\t\t\t\t\tcase 0: // stored\n\t\t\t\t\t\t// {\n\t\t\t\t\t\tb >>>= (3);\n\t\t\t\t\t\tk -= (3);\n\t\t\t\t\t\t// }\n\t\t\t\t\t\tt = k & 7; // go to byte boundary\n\n\t\t\t\t\t\t// {\n\t\t\t\t\t\tb >>>= (t);\n\t\t\t\t\t\tk -= (t);\n\t\t\t\t\t\t// }\n\t\t\t\t\t\tmode = LENS; // get length of stored block\n\t\t\t\t\t\tbreak;\n\t\t\t\t\tcase 1: // fixed\n\t\t\t\t\t\t// {\n\t\t\t\t\t\tvar bl = []; // new Array(1);\n\t\t\t\t\t\tvar bd = []; // new Array(1);\n\t\t\t\t\t\tvar tl = [ [] ]; // new Array(1);\n\t\t\t\t\t\tvar td = [ [] ]; // new Array(1);\n\n\t\t\t\t\t\tInfTree.inflate_trees_fixed(bl, bd, tl, td);\n\t\t\t\t\t\tcodes.init(bl[0], bd[0], tl[0], 0, td[0], 0);\n\t\t\t\t\t\t// }\n\n\t\t\t\t\t\t// {\n\t\t\t\t\t\tb >>>= (3);\n\t\t\t\t\t\tk -= (3);\n\t\t\t\t\t\t// }\n\n\t\t\t\t\t\tmode = CODES;\n\t\t\t\t\t\tbreak;\n\t\t\t\t\tcase 2: // dynamic\n\n\t\t\t\t\t\t// {\n\t\t\t\t\t\tb >>>= (3);\n\t\t\t\t\t\tk -= (3);\n\t\t\t\t\t\t// }\n\n\t\t\t\t\t\tmode = TABLE;\n\t\t\t\t\t\tbreak;\n\t\t\t\t\tcase 3: // illegal\n\n\t\t\t\t\t\t// {\n\t\t\t\t\t\tb >>>= (3);\n\t\t\t\t\t\tk -= (3);\n\t\t\t\t\t\t// }\n\t\t\t\t\t\tmode = BADBLOCKS;\n\t\t\t\t\t\tz.msg = \"invalid block type\";\n\t\t\t\t\t\tr = Z_DATA_ERROR;\n\n\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t}\n\t\t\t\t\tbreak;\n\t\t\t\tcase LENS:\n\n\t\t\t\t\twhile (k < (32)) {\n\t\t\t\t\t\tif (n !== 0) {\n\t\t\t\t\t\t\tr = Z_OK;\n\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t\t}\n\t\t\t\t\t\tn--;\n\t\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\t\tk += 8;\n\t\t\t\t\t}\n\n\t\t\t\t\tif ((((~b) >>> 16) & 0xffff) != (b & 0xffff)) {\n\t\t\t\t\t\tmode = BADBLOCKS;\n\t\t\t\t\t\tz.msg = \"invalid stored block lengths\";\n\t\t\t\t\t\tr = Z_DATA_ERROR;\n\n\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t}\n\t\t\t\t\tleft = (b & 0xffff);\n\t\t\t\t\tb = k = 0; // dump bits\n\t\t\t\t\tmode = left !== 0 ? STORED : (last !== 0 ? DRY : TYPE);\n\t\t\t\t\tbreak;\n\t\t\t\tcase STORED:\n\t\t\t\t\tif (n === 0) {\n\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t}\n\n\t\t\t\t\tif (m === 0) {\n\t\t\t\t\t\tif (q == that.end && that.read !== 0) {\n\t\t\t\t\t\t\tq = 0;\n\t\t\t\t\t\t\tm = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);\n\t\t\t\t\t\t}\n\t\t\t\t\t\tif (m === 0) {\n\t\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\t\tr = that.inflate_flush(z, r);\n\t\t\t\t\t\t\tq = that.write;\n\t\t\t\t\t\t\tm = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);\n\t\t\t\t\t\t\tif (q == that.end && that.read !== 0) {\n\t\t\t\t\t\t\t\tq = 0;\n\t\t\t\t\t\t\t\tm = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\tif (m === 0) {\n\t\t\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t\tr = Z_OK;\n\n\t\t\t\t\tt = left;\n\t\t\t\t\tif (t > n)\n\t\t\t\t\t\tt = n;\n\t\t\t\t\tif (t > m)\n\t\t\t\t\t\tt = m;\n\t\t\t\t\tthat.window.set(z.read_buf(p, t), q);\n\t\t\t\t\tp += t;\n\t\t\t\t\tn -= t;\n\t\t\t\t\tq += t;\n\t\t\t\t\tm -= t;\n\t\t\t\t\tif ((left -= t) !== 0)\n\t\t\t\t\t\tbreak;\n\t\t\t\t\tmode = last !== 0 ? DRY : TYPE;\n\t\t\t\t\tbreak;\n\t\t\t\tcase TABLE:\n\n\t\t\t\t\twhile (k < (14)) {\n\t\t\t\t\t\tif (n !== 0) {\n\t\t\t\t\t\t\tr = Z_OK;\n\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t\t}\n\n\t\t\t\t\t\tn--;\n\t\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\t\tk += 8;\n\t\t\t\t\t}\n\n\t\t\t\t\ttable = t = (b & 0x3fff);\n\t\t\t\t\tif ((t & 0x1f) > 29 || ((t >> 5) & 0x1f) > 29) {\n\t\t\t\t\t\tmode = BADBLOCKS;\n\t\t\t\t\t\tz.msg = \"too many length or distance symbols\";\n\t\t\t\t\t\tr = Z_DATA_ERROR;\n\n\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t}\n\t\t\t\t\tt = 258 + (t & 0x1f) + ((t >> 5) & 0x1f);\n\t\t\t\t\tif (!blens || blens.length < t) {\n\t\t\t\t\t\tblens = []; // new Array(t);\n\t\t\t\t\t} else {\n\t\t\t\t\t\tfor (i = 0; i < t; i++) {\n\t\t\t\t\t\t\tblens[i] = 0;\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\n\t\t\t\t\t// {\n\t\t\t\t\tb >>>= (14);\n\t\t\t\t\tk -= (14);\n\t\t\t\t\t// }\n\n\t\t\t\t\tindex = 0;\n\t\t\t\t\tmode = BTREE;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase BTREE:\n\t\t\t\t\twhile (index < 4 + (table >>> 10)) {\n\t\t\t\t\t\twhile (k < (3)) {\n\t\t\t\t\t\t\tif (n !== 0) {\n\t\t\t\t\t\t\t\tr = Z_OK;\n\t\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\tn--;\n\t\t\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\t\t\tk += 8;\n\t\t\t\t\t\t}\n\n\t\t\t\t\t\tblens[border[index++]] = b & 7;\n\n\t\t\t\t\t\t// {\n\t\t\t\t\t\tb >>>= (3);\n\t\t\t\t\t\tk -= (3);\n\t\t\t\t\t\t// }\n\t\t\t\t\t}\n\n\t\t\t\t\twhile (index < 19) {\n\t\t\t\t\t\tblens[border[index++]] = 0;\n\t\t\t\t\t}\n\n\t\t\t\t\tbb[0] = 7;\n\t\t\t\t\tt = inftree.inflate_trees_bits(blens, bb, tb, hufts, z);\n\t\t\t\t\tif (t != Z_OK) {\n\t\t\t\t\t\tr = t;\n\t\t\t\t\t\tif (r == Z_DATA_ERROR) {\n\t\t\t\t\t\t\tblens = null;\n\t\t\t\t\t\t\tmode = BADBLOCKS;\n\t\t\t\t\t\t}\n\n\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t}\n\n\t\t\t\t\tindex = 0;\n\t\t\t\t\tmode = DTREE;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase DTREE:\n\t\t\t\t\twhile (true) {\n\t\t\t\t\t\tt = table;\n\t\t\t\t\t\tif (index >= 258 + (t & 0x1f) + ((t >> 5) & 0x1f)) {\n\t\t\t\t\t\t\tbreak;\n\t\t\t\t\t\t}\n\n\t\t\t\t\t\tvar j, c;\n\n\t\t\t\t\t\tt = bb[0];\n\n\t\t\t\t\t\twhile (k < (t)) {\n\t\t\t\t\t\t\tif (n !== 0) {\n\t\t\t\t\t\t\t\tr = Z_OK;\n\t\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\tn--;\n\t\t\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\t\t\tk += 8;\n\t\t\t\t\t\t}\n\n\t\t\t\t\t\t// if (tb[0] == -1) {\n\t\t\t\t\t\t// System.err.println(\"null...\");\n\t\t\t\t\t\t// }\n\n\t\t\t\t\t\tt = hufts[(tb[0] + (b & inflate_mask[t])) * 3 + 1];\n\t\t\t\t\t\tc = hufts[(tb[0] + (b & inflate_mask[t])) * 3 + 2];\n\n\t\t\t\t\t\tif (c < 16) {\n\t\t\t\t\t\t\tb >>>= (t);\n\t\t\t\t\t\t\tk -= (t);\n\t\t\t\t\t\t\tblens[index++] = c;\n\t\t\t\t\t\t} else { // c == 16..18\n\t\t\t\t\t\t\ti = c == 18 ? 7 : c - 14;\n\t\t\t\t\t\t\tj = c == 18 ? 11 : 3;\n\n\t\t\t\t\t\t\twhile (k < (t + i)) {\n\t\t\t\t\t\t\t\tif (n !== 0) {\n\t\t\t\t\t\t\t\t\tr = Z_OK;\n\t\t\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t\tn--;\n\t\t\t\t\t\t\t\tb |= (z.read_byte(p++) & 0xff) << k;\n\t\t\t\t\t\t\t\tk += 8;\n\t\t\t\t\t\t\t}\n\n\t\t\t\t\t\t\tb >>>= (t);\n\t\t\t\t\t\t\tk -= (t);\n\n\t\t\t\t\t\t\tj += (b & inflate_mask[i]);\n\n\t\t\t\t\t\t\tb >>>= (i);\n\t\t\t\t\t\t\tk -= (i);\n\n\t\t\t\t\t\t\ti = index;\n\t\t\t\t\t\t\tt = table;\n\t\t\t\t\t\t\tif (i + j > 258 + (t & 0x1f) + ((t >> 5) & 0x1f) || (c == 16 && i < 1)) {\n\t\t\t\t\t\t\t\tblens = null;\n\t\t\t\t\t\t\t\tmode = BADBLOCKS;\n\t\t\t\t\t\t\t\tz.msg = \"invalid bit length repeat\";\n\t\t\t\t\t\t\t\tr = Z_DATA_ERROR;\n\n\t\t\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t\t\t}\n\n\t\t\t\t\t\t\tc = c == 16 ? blens[i - 1] : 0;\n\t\t\t\t\t\t\tdo {\n\t\t\t\t\t\t\t\tblens[i++] = c;\n\t\t\t\t\t\t\t} while (--j !== 0);\n\t\t\t\t\t\t\tindex = i;\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\n\t\t\t\t\ttb[0] = -1;\n\t\t\t\t\t// {\n\t\t\t\t\tvar bl_ = []; // new Array(1);\n\t\t\t\t\tvar bd_ = []; // new Array(1);\n\t\t\t\t\tvar tl_ = []; // new Array(1);\n\t\t\t\t\tvar td_ = []; // new Array(1);\n\t\t\t\t\tbl_[0] = 9; // must be <= 9 for lookahead assumptions\n\t\t\t\t\tbd_[0] = 6; // must be <= 9 for lookahead assumptions\n\n\t\t\t\t\tt = table;\n\t\t\t\t\tt = inftree.inflate_trees_dynamic(257 + (t & 0x1f), 1 + ((t >> 5) & 0x1f), blens, bl_, bd_, tl_, td_, hufts, z);\n\n\t\t\t\t\tif (t != Z_OK) {\n\t\t\t\t\t\tif (t == Z_DATA_ERROR) {\n\t\t\t\t\t\t\tblens = null;\n\t\t\t\t\t\t\tmode = BADBLOCKS;\n\t\t\t\t\t\t}\n\t\t\t\t\t\tr = t;\n\n\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t}\n\t\t\t\t\tcodes.init(bl_[0], bd_[0], hufts, tl_[0], hufts, td_[0]);\n\t\t\t\t\t// }\n\t\t\t\t\tmode = CODES;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase CODES:\n\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\tthat.write = q;\n\n\t\t\t\t\tif ((r = codes.proc(that, z, r)) != Z_STREAM_END) {\n\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t}\n\t\t\t\t\tr = Z_OK;\n\t\t\t\t\tcodes.free(z);\n\n\t\t\t\t\tp = z.next_in_index;\n\t\t\t\t\tn = z.avail_in;\n\t\t\t\t\tb = that.bitb;\n\t\t\t\t\tk = that.bitk;\n\t\t\t\t\tq = that.write;\n\t\t\t\t\tm = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);\n\n\t\t\t\t\tif (last === 0) {\n\t\t\t\t\t\tmode = TYPE;\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tmode = DRY;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase DRY:\n\t\t\t\t\tthat.write = q;\n\t\t\t\t\tr = that.inflate_flush(z, r);\n\t\t\t\t\tq = that.write;\n\t\t\t\t\tm = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);\n\t\t\t\t\tif (that.read != that.write) {\n\t\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\t\tthat.write = q;\n\t\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t\t}\n\t\t\t\t\tmode = DONELOCKS;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase DONELOCKS:\n\t\t\t\t\tr = Z_STREAM_END;\n\n\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\tthat.write = q;\n\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\tcase BADBLOCKS:\n\t\t\t\t\tr = Z_DATA_ERROR;\n\n\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\tthat.write = q;\n\t\t\t\t\treturn that.inflate_flush(z, r);\n\n\t\t\t\tdefault:\n\t\t\t\t\tr = Z_STREAM_ERROR;\n\n\t\t\t\t\tthat.bitb = b;\n\t\t\t\t\tthat.bitk = k;\n\t\t\t\t\tz.avail_in = n;\n\t\t\t\t\tz.total_in += p - z.next_in_index;\n\t\t\t\t\tz.next_in_index = p;\n\t\t\t\t\tthat.write = q;\n\t\t\t\t\treturn that.inflate_flush(z, r);\n\t\t\t\t}\n\t\t\t}\n\t\t};\n\n\t\tthat.free = function(z) {\n\t\t\tthat.reset(z, null);\n\t\t\tthat.window = null;\n\t\t\thufts = null;\n\t\t\t// ZFREE(z, s);\n\t\t};\n\n\t\tthat.set_dictionary = function(d, start, n) {\n\t\t\tthat.window.set(d.subarray(start, start + n), 0);\n\t\t\tthat.read = that.write = n;\n\t\t};\n\n\t\t// Returns true if inflate is currently at the end of a block generated\n\t\t// by Z_SYNC_FLUSH or Z_FULL_FLUSH.\n\t\tthat.sync_point = function() {\n\t\t\treturn mode == LENS ? 1 : 0;\n\t\t};\n\n\t}\n\n\t// Inflate\n\n\t// preset dictionary flag in zlib header\n\tvar PRESET_DICT = 0x20;\n\n\tvar Z_DEFLATED = 8;\n\n\tvar METHOD = 0; // waiting for method byte\n\tvar FLAG = 1; // waiting for flag byte\n\tvar DICT4 = 2; // four dictionary check bytes to go\n\tvar DICT3 = 3; // three dictionary check bytes to go\n\tvar DICT2 = 4; // two dictionary check bytes to go\n\tvar DICT1 = 5; // one dictionary check byte to go\n\tvar DICT0 = 6; // waiting for inflateSetDictionary\n\tvar BLOCKS = 7; // decompressing blocks\n\tvar DONE = 12; // finished check, done\n\tvar BAD = 13; // got an error--stay here\n\n\tvar mark = [ 0, 0, 0xff, 0xff ];\n\n\tfunction Inflate() {\n\t\tvar that = this;\n\n\t\tthat.mode = 0; // current inflate mode\n\n\t\t// mode dependent information\n\t\tthat.method = 0; // if FLAGS, method byte\n\n\t\t// if CHECK, check values to compare\n\t\tthat.was = [ 0 ]; // new Array(1); // computed check value\n\t\tthat.need = 0; // stream check value\n\n\t\t// if BAD, inflateSync's marker bytes count\n\t\tthat.marker = 0;\n\n\t\t// mode independent information\n\t\tthat.wbits = 0; // log2(window size) (8..15, defaults to 15)\n\n\t\t// this.blocks; // current inflate_blocks state\n\n\t\tfunction inflateReset(z) {\n\t\t\tif (!z || !z.istate)\n\t\t\t\treturn Z_STREAM_ERROR;\n\n\t\t\tz.total_in = z.total_out = 0;\n\t\t\tz.msg = null;\n\t\t\tz.istate.mode = BLOCKS;\n\t\t\tz.istate.blocks.reset(z, null);\n\t\t\treturn Z_OK;\n\t\t}\n\n\t\tthat.inflateEnd = function(z) {\n\t\t\tif (that.blocks)\n\t\t\t\tthat.blocks.free(z);\n\t\t\tthat.blocks = null;\n\t\t\t// ZFREE(z, z->state);\n\t\t\treturn Z_OK;\n\t\t};\n\n\t\tthat.inflateInit = function(z, w) {\n\t\t\tz.msg = null;\n\t\t\tthat.blocks = null;\n\n\t\t\t// set window size\n\t\t\tif (w < 8 || w > 15) {\n\t\t\t\tthat.inflateEnd(z);\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\t}\n\t\t\tthat.wbits = w;\n\n\t\t\tz.istate.blocks = new InfBlocks(z, 1 << w);\n\n\t\t\t// reset state\n\t\t\tinflateReset(z);\n\t\t\treturn Z_OK;\n\t\t};\n\n\t\tthat.inflate = function(z, f) {\n\t\t\tvar r;\n\t\t\tvar b;\n\n\t\t\tif (!z || !z.istate || !z.next_in)\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\tf = f == Z_FINISH ? Z_BUF_ERROR : Z_OK;\n\t\t\tr = Z_BUF_ERROR;\n\t\t\twhile (true) {\n\t\t\t\t// System.out.println(\"mode: \"+z.istate.mode);\n\t\t\t\tswitch (z.istate.mode) {\n\t\t\t\tcase METHOD:\n\n\t\t\t\t\tif (z.avail_in === 0)\n\t\t\t\t\t\treturn r;\n\t\t\t\t\tr = f;\n\n\t\t\t\t\tz.avail_in--;\n\t\t\t\t\tz.total_in++;\n\t\t\t\t\tif (((z.istate.method = z.read_byte(z.next_in_index++)) & 0xf) != Z_DEFLATED) {\n\t\t\t\t\t\tz.istate.mode = BAD;\n\t\t\t\t\t\tz.msg = \"unknown compression method\";\n\t\t\t\t\t\tz.istate.marker = 5; // can't try inflateSync\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tif ((z.istate.method >> 4) + 8 > z.istate.wbits) {\n\t\t\t\t\t\tz.istate.mode = BAD;\n\t\t\t\t\t\tz.msg = \"invalid window size\";\n\t\t\t\t\t\tz.istate.marker = 5; // can't try inflateSync\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tz.istate.mode = FLAG;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase FLAG:\n\n\t\t\t\t\tif (z.avail_in === 0)\n\t\t\t\t\t\treturn r;\n\t\t\t\t\tr = f;\n\n\t\t\t\t\tz.avail_in--;\n\t\t\t\t\tz.total_in++;\n\t\t\t\t\tb = (z.read_byte(z.next_in_index++)) & 0xff;\n\n\t\t\t\t\tif ((((z.istate.method << 8) + b) % 31) !== 0) {\n\t\t\t\t\t\tz.istate.mode = BAD;\n\t\t\t\t\t\tz.msg = \"incorrect header check\";\n\t\t\t\t\t\tz.istate.marker = 5; // can't try inflateSync\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\n\t\t\t\t\tif ((b & PRESET_DICT) === 0) {\n\t\t\t\t\t\tz.istate.mode = BLOCKS;\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tz.istate.mode = DICT4;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase DICT4:\n\n\t\t\t\t\tif (z.avail_in === 0)\n\t\t\t\t\t\treturn r;\n\t\t\t\t\tr = f;\n\n\t\t\t\t\tz.avail_in--;\n\t\t\t\t\tz.total_in++;\n\t\t\t\t\tz.istate.need = ((z.read_byte(z.next_in_index++) & 0xff) << 24) & 0xff000000;\n\t\t\t\t\tz.istate.mode = DICT3;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase DICT3:\n\n\t\t\t\t\tif (z.avail_in === 0)\n\t\t\t\t\t\treturn r;\n\t\t\t\t\tr = f;\n\n\t\t\t\t\tz.avail_in--;\n\t\t\t\t\tz.total_in++;\n\t\t\t\t\tz.istate.need += ((z.read_byte(z.next_in_index++) & 0xff) << 16) & 0xff0000;\n\t\t\t\t\tz.istate.mode = DICT2;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase DICT2:\n\n\t\t\t\t\tif (z.avail_in === 0)\n\t\t\t\t\t\treturn r;\n\t\t\t\t\tr = f;\n\n\t\t\t\t\tz.avail_in--;\n\t\t\t\t\tz.total_in++;\n\t\t\t\t\tz.istate.need += ((z.read_byte(z.next_in_index++) & 0xff) << 8) & 0xff00;\n\t\t\t\t\tz.istate.mode = DICT1;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase DICT1:\n\n\t\t\t\t\tif (z.avail_in === 0)\n\t\t\t\t\t\treturn r;\n\t\t\t\t\tr = f;\n\n\t\t\t\t\tz.avail_in--;\n\t\t\t\t\tz.total_in++;\n\t\t\t\t\tz.istate.need += (z.read_byte(z.next_in_index++) & 0xff);\n\t\t\t\t\tz.istate.mode = DICT0;\n\t\t\t\t\treturn Z_NEED_DICT;\n\t\t\t\tcase DICT0:\n\t\t\t\t\tz.istate.mode = BAD;\n\t\t\t\t\tz.msg = \"need dictionary\";\n\t\t\t\t\tz.istate.marker = 0; // can try inflateSync\n\t\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\t\tcase BLOCKS:\n\n\t\t\t\t\tr = z.istate.blocks.proc(z, r);\n\t\t\t\t\tif (r == Z_DATA_ERROR) {\n\t\t\t\t\t\tz.istate.mode = BAD;\n\t\t\t\t\t\tz.istate.marker = 0; // can try inflateSync\n\t\t\t\t\t\tbreak;\n\t\t\t\t\t}\n\t\t\t\t\tif (r == Z_OK) {\n\t\t\t\t\t\tr = f;\n\t\t\t\t\t}\n\t\t\t\t\tif (r != Z_STREAM_END) {\n\t\t\t\t\t\treturn r;\n\t\t\t\t\t}\n\t\t\t\t\tr = f;\n\t\t\t\t\tz.istate.blocks.reset(z, z.istate.was);\n\t\t\t\t\tz.istate.mode = DONE;\n\t\t\t\t\t/* falls through */\n\t\t\t\tcase DONE:\n\t\t\t\t\treturn Z_STREAM_END;\n\t\t\t\tcase BAD:\n\t\t\t\t\treturn Z_DATA_ERROR;\n\t\t\t\tdefault:\n\t\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\t\t}\n\t\t\t}\n\t\t};\n\n\t\tthat.inflateSetDictionary = function(z, dictionary, dictLength) {\n\t\t\tvar index = 0;\n\t\t\tvar length = dictLength;\n\t\t\tif (!z || !z.istate || z.istate.mode != DICT0)\n\t\t\t\treturn Z_STREAM_ERROR;\n\n\t\t\tif (length >= (1 << z.istate.wbits)) {\n\t\t\t\tlength = (1 << z.istate.wbits) - 1;\n\t\t\t\tindex = dictLength - length;\n\t\t\t}\n\t\t\tz.istate.blocks.set_dictionary(dictionary, index, length);\n\t\t\tz.istate.mode = BLOCKS;\n\t\t\treturn Z_OK;\n\t\t};\n\n\t\tthat.inflateSync = function(z) {\n\t\t\tvar n; // number of bytes to look at\n\t\t\tvar p; // pointer to bytes\n\t\t\tvar m; // number of marker bytes found in a row\n\t\t\tvar r, w; // temporaries to save total_in and total_out\n\n\t\t\t// set up\n\t\t\tif (!z || !z.istate)\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\tif (z.istate.mode != BAD) {\n\t\t\t\tz.istate.mode = BAD;\n\t\t\t\tz.istate.marker = 0;\n\t\t\t}\n\t\t\tif ((n = z.avail_in) === 0)\n\t\t\t\treturn Z_BUF_ERROR;\n\t\t\tp = z.next_in_index;\n\t\t\tm = z.istate.marker;\n\n\t\t\t// search\n\t\t\twhile (n !== 0 && m < 4) {\n\t\t\t\tif (z.read_byte(p) == mark[m]) {\n\t\t\t\t\tm++;\n\t\t\t\t} else if (z.read_byte(p) !== 0) {\n\t\t\t\t\tm = 0;\n\t\t\t\t} else {\n\t\t\t\t\tm = 4 - m;\n\t\t\t\t}\n\t\t\t\tp++;\n\t\t\t\tn--;\n\t\t\t}\n\n\t\t\t// restore\n\t\t\tz.total_in += p - z.next_in_index;\n\t\t\tz.next_in_index = p;\n\t\t\tz.avail_in = n;\n\t\t\tz.istate.marker = m;\n\n\t\t\t// return no joy or set up to restart on a new block\n\t\t\tif (m != 4) {\n\t\t\t\treturn Z_DATA_ERROR;\n\t\t\t}\n\t\t\tr = z.total_in;\n\t\t\tw = z.total_out;\n\t\t\tinflateReset(z);\n\t\t\tz.total_in = r;\n\t\t\tz.total_out = w;\n\t\t\tz.istate.mode = BLOCKS;\n\t\t\treturn Z_OK;\n\t\t};\n\n\t\t// Returns true if inflate is currently at the end of a block generated\n\t\t// by Z_SYNC_FLUSH or Z_FULL_FLUSH. This function is used by one PPP\n\t\t// implementation to provide an additional safety check. PPP uses\n\t\t// Z_SYNC_FLUSH\n\t\t// but removes the length bytes of the resulting empty stored block. When\n\t\t// decompressing, PPP checks that at the end of input packet, inflate is\n\t\t// waiting for these length bytes.\n\t\tthat.inflateSyncPoint = function(z) {\n\t\t\tif (!z || !z.istate || !z.istate.blocks)\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\treturn z.istate.blocks.sync_point();\n\t\t};\n\t}\n\n\t// ZStream\n\n\tfunction ZStream() {\n\t}\n\n\tZStream.prototype = {\n\t\tinflateInit : function(bits) {\n\t\t\tvar that = this;\n\t\t\tthat.istate = new Inflate();\n\t\t\tif (!bits)\n\t\t\t\tbits = MAX_BITS;\n\t\t\treturn that.istate.inflateInit(that, bits);\n\t\t},\n\n\t\tinflate : function(f) {\n\t\t\tvar that = this;\n\t\t\tif (!that.istate)\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\treturn that.istate.inflate(that, f);\n\t\t},\n\n\t\tinflateEnd : function() {\n\t\t\tvar that = this;\n\t\t\tif (!that.istate)\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\tvar ret = that.istate.inflateEnd(that);\n\t\t\tthat.istate = null;\n\t\t\treturn ret;\n\t\t},\n\n\t\tinflateSync : function() {\n\t\t\tvar that = this;\n\t\t\tif (!that.istate)\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\treturn that.istate.inflateSync(that);\n\t\t},\n\t\tinflateSetDictionary : function(dictionary, dictLength) {\n\t\t\tvar that = this;\n\t\t\tif (!that.istate)\n\t\t\t\treturn Z_STREAM_ERROR;\n\t\t\treturn that.istate.inflateSetDictionary(that, dictionary, dictLength);\n\t\t},\n\t\tread_byte : function(start) {\n\t\t\tvar that = this;\n\t\t\treturn that.next_in.subarray(start, start + 1)[0];\n\t\t},\n\t\tread_buf : function(start, size) {\n\t\t\tvar that = this;\n\t\t\treturn that.next_in.subarray(start, start + size);\n\t\t}\n\t};\n\n\t// Inflater\n\n\tfunction Inflater() {\n\t\tvar that = this;\n\t\tvar z = new ZStream();\n\t\tvar bufsize = 512;\n\t\tvar flush = Z_NO_FLUSH;\n\t\tvar buf = new Uint8Array(bufsize);\n\t\tvar nomoreinput = false;\n\n\t\tz.inflateInit();\n\t\tz.next_out = buf;\n\n\t\tthat.append = function(data, onprogress) {\n\t\t\tvar err, buffers = [], lastIndex = 0, bufferIndex = 0, bufferSize = 0, array;\n\t\t\tif (data.length === 0)\n\t\t\t\treturn;\n\t\t\tz.next_in_index = 0;\n\t\t\tz.next_in = data;\n\t\t\tz.avail_in = data.length;\n\t\t\tdo {\n\t\t\t\tz.next_out_index = 0;\n\t\t\t\tz.avail_out = bufsize;\n\t\t\t\tif ((z.avail_in === 0) && (!nomoreinput)) { // if buffer is empty and more input is available, refill it\n\t\t\t\t\tz.next_in_index = 0;\n\t\t\t\t\tnomoreinput = true;\n\t\t\t\t}\n\t\t\t\terr = z.inflate(flush);\n\t\t\t\tif (nomoreinput && (err === Z_BUF_ERROR)) {\n\t\t\t\t\tif (z.avail_in !== 0)\n\t\t\t\t\t\tthrow new Error(\"inflating: bad input\");\n\t\t\t\t} else if (err !== Z_OK && err !== Z_STREAM_END)\n\t\t\t\t\tthrow new Error(\"inflating: \" + z.msg);\n\t\t\t\tif ((nomoreinput || err === Z_STREAM_END) && (z.avail_in === data.length))\n\t\t\t\t\tthrow new Error(\"inflating: bad input\");\n\t\t\t\tif (z.next_out_index)\n\t\t\t\t\tif (z.next_out_index === bufsize)\n\t\t\t\t\t\tbuffers.push(new Uint8Array(buf));\n\t\t\t\t\telse\n\t\t\t\t\t\tbuffers.push(new Uint8Array(buf.subarray(0, z.next_out_index)));\n\t\t\t\tbufferSize += z.next_out_index;\n\t\t\t\tif (onprogress && z.next_in_index > 0 && z.next_in_index != lastIndex) {\n\t\t\t\t\tonprogress(z.next_in_index);\n\t\t\t\t\tlastIndex = z.next_in_index;\n\t\t\t\t}\n\t\t\t} while (z.avail_in > 0 || z.avail_out === 0);\n\t\t\tarray = new Uint8Array(bufferSize);\n\t\t\tbuffers.forEach(function(chunk) {\n\t\t\t\tarray.set(chunk, bufferIndex);\n\t\t\t\tbufferIndex += chunk.length;\n\t\t\t});\n\t\t\treturn array;\n\t\t};\n\t\tthat.flush = function() {\n\t\t\tz.inflateEnd();\n\t\t};\n\t}\n\n\t// 'zip' may not be defined in z-worker and some tests\n\tvar env = global.zip || global;\n\tenv.Inflater = env._jzlib_Inflater = Inflater;\n})(this);\n")]
};

module.exports = zip;


},{"zip":4}],4:[function(require,module,exports){
(function (global){
; var __browserify_shim_require__=require;(function browserifyShim(module, exports, require, define, browserify_shim__define__module__export__) {
/*
 Copyright (c) 2013 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright
 notice, this list of conditions and the following disclaimer in
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

(function(obj) {
	"use strict";

	var ERR_BAD_FORMAT = "File format is not recognized.";
	var ERR_CRC = "CRC failed.";
	var ERR_ENCRYPTED = "File contains encrypted entry.";
	var ERR_ZIP64 = "File is using Zip64 (4gb+ file size).";
	var ERR_READ = "Error while reading zip file.";
	var ERR_WRITE = "Error while writing zip file.";
	var ERR_WRITE_DATA = "Error while writing file data.";
	var ERR_READ_DATA = "Error while reading file data.";
	var ERR_DUPLICATED_NAME = "File already exists.";
	var CHUNK_SIZE = 512 * 1024;
	
	var TEXT_PLAIN = "text/plain";

	var appendABViewSupported;
	try {
		appendABViewSupported = new Blob([ new DataView(new ArrayBuffer(0)) ]).size === 0;
	} catch (e) {
	}

	function Crc32() {
		this.crc = -1;
	}
	Crc32.prototype.append = function append(data) {
		var crc = this.crc | 0, table = this.table;
		for (var offset = 0, len = data.length | 0; offset < len; offset++)
			crc = (crc >>> 8) ^ table[(crc ^ data[offset]) & 0xFF];
		this.crc = crc;
	};
	Crc32.prototype.get = function get() {
		return ~this.crc;
	};
	Crc32.prototype.table = (function() {
		var i, j, t, table = []; // Uint32Array is actually slower than []
		for (i = 0; i < 256; i++) {
			t = i;
			for (j = 0; j < 8; j++)
				if (t & 1)
					t = (t >>> 1) ^ 0xEDB88320;
				else
					t = t >>> 1;
			table[i] = t;
		}
		return table;
	})();
	
	// "no-op" codec
	function NOOP() {}
	NOOP.prototype.append = function append(bytes, onprogress) {
		return bytes;
	};
	NOOP.prototype.flush = function flush() {};

	function blobSlice(blob, index, length) {
		if (index < 0 || length < 0 || index + length > blob.size)
			throw new RangeError('offset:' + index + ', length:' + length + ', size:' + blob.size);
		if (blob.slice)
			return blob.slice(index, index + length);
		else if (blob.webkitSlice)
			return blob.webkitSlice(index, index + length);
		else if (blob.mozSlice)
			return blob.mozSlice(index, index + length);
		else if (blob.msSlice)
			return blob.msSlice(index, index + length);
	}

	function getDataHelper(byteLength, bytes) {
		var dataBuffer, dataArray;
		dataBuffer = new ArrayBuffer(byteLength);
		dataArray = new Uint8Array(dataBuffer);
		if (bytes)
			dataArray.set(bytes, 0);
		return {
			buffer : dataBuffer,
			array : dataArray,
			view : new DataView(dataBuffer)
		};
	}

	// Readers
	function Reader() {
	}

	function TextReader(text) {
		var that = this, blobReader;

		function init(callback, onerror) {
			var blob = new Blob([ text ], {
				type : TEXT_PLAIN
			});
			blobReader = new BlobReader(blob);
			blobReader.init(function() {
				that.size = blobReader.size;
				callback();
			}, onerror);
		}

		function readUint8Array(index, length, callback, onerror) {
			blobReader.readUint8Array(index, length, callback, onerror);
		}

		that.size = 0;
		that.init = init;
		that.readUint8Array = readUint8Array;
	}
	TextReader.prototype = new Reader();
	TextReader.prototype.constructor = TextReader;

	function Data64URIReader(dataURI) {
		var that = this, dataStart;

		function init(callback) {
			var dataEnd = dataURI.length;
			while (dataURI.charAt(dataEnd - 1) == "=")
				dataEnd--;
			dataStart = dataURI.indexOf(",") + 1;
			that.size = Math.floor((dataEnd - dataStart) * 0.75);
			callback();
		}

		function readUint8Array(index, length, callback) {
			var i, data = getDataHelper(length);
			var start = Math.floor(index / 3) * 4;
			var end = Math.ceil((index + length) / 3) * 4;
			var bytes = obj.atob(dataURI.substring(start + dataStart, end + dataStart));
			var delta = index - Math.floor(start / 4) * 3;
			for (i = delta; i < delta + length; i++)
				data.array[i - delta] = bytes.charCodeAt(i);
			callback(data.array);
		}

		that.size = 0;
		that.init = init;
		that.readUint8Array = readUint8Array;
	}
	Data64URIReader.prototype = new Reader();
	Data64URIReader.prototype.constructor = Data64URIReader;

	function BlobReader(blob) {
		var that = this;

		function init(callback) {
			that.size = blob.size;
			callback();
		}

		function readUint8Array(index, length, callback, onerror) {
			var reader = new FileReader();
			reader.onload = function(e) {
				callback(new Uint8Array(e.target.result));
			};
			reader.onerror = onerror;
			try {
				reader.readAsArrayBuffer(blobSlice(blob, index, length));
			} catch (e) {
				onerror(e);
			}
		}

		that.size = 0;
		that.init = init;
		that.readUint8Array = readUint8Array;
	}
	BlobReader.prototype = new Reader();
	BlobReader.prototype.constructor = BlobReader;

	// Writers

	function Writer() {
	}
	Writer.prototype.getData = function(callback) {
		callback(this.data);
	};

	function TextWriter(encoding) {
		var that = this, blob;

		function init(callback) {
			blob = new Blob([], {
				type : TEXT_PLAIN
			});
			callback();
		}

		function writeUint8Array(array, callback) {
			blob = new Blob([ blob, appendABViewSupported ? array : array.buffer ], {
				type : TEXT_PLAIN
			});
			callback();
		}

		function getData(callback, onerror) {
			var reader = new FileReader();
			reader.onload = function(e) {
				callback(e.target.result);
			};
			reader.onerror = onerror;
			reader.readAsText(blob, encoding);
		}

		that.init = init;
		that.writeUint8Array = writeUint8Array;
		that.getData = getData;
	}
	TextWriter.prototype = new Writer();
	TextWriter.prototype.constructor = TextWriter;

	function Data64URIWriter(contentType) {
		var that = this, data = "", pending = "";

		function init(callback) {
			data += "data:" + (contentType || "") + ";base64,";
			callback();
		}

		function writeUint8Array(array, callback) {
			var i, delta = pending.length, dataString = pending;
			pending = "";
			for (i = 0; i < (Math.floor((delta + array.length) / 3) * 3) - delta; i++)
				dataString += String.fromCharCode(array[i]);
			for (; i < array.length; i++)
				pending += String.fromCharCode(array[i]);
			if (dataString.length > 2)
				data += obj.btoa(dataString);
			else
				pending = dataString;
			callback();
		}

		function getData(callback) {
			callback(data + obj.btoa(pending));
		}

		that.init = init;
		that.writeUint8Array = writeUint8Array;
		that.getData = getData;
	}
	Data64URIWriter.prototype = new Writer();
	Data64URIWriter.prototype.constructor = Data64URIWriter;

	function BlobWriter(contentType) {
		var blob, that = this;

		function init(callback) {
			blob = new Blob([], {
				type : contentType
			});
			callback();
		}

		function writeUint8Array(array, callback) {
			blob = new Blob([ blob, appendABViewSupported ? array : array.buffer ], {
				type : contentType
			});
			callback();
		}

		function getData(callback) {
			callback(blob);
		}

		that.init = init;
		that.writeUint8Array = writeUint8Array;
		that.getData = getData;
	}
	BlobWriter.prototype = new Writer();
	BlobWriter.prototype.constructor = BlobWriter;

	/** 
	 * inflate/deflate core functions
	 * @param worker {Worker} web worker for the task.
	 * @param initialMessage {Object} initial message to be sent to the worker. should contain
	 *   sn(serial number for distinguishing multiple tasks sent to the worker), and codecClass.
	 *   This function may add more properties before sending.
	 */
	function launchWorkerProcess(worker, initialMessage, reader, writer, offset, size, onprogress, onend, onreaderror, onwriteerror) {
		var chunkIndex = 0, index, outputSize, sn = initialMessage.sn, crc;

		function onflush() {
			worker.removeEventListener('message', onmessage, false);
			onend(outputSize, crc);
		}

		function onmessage(event) {
			var message = event.data, data = message.data, err = message.error;
			if (err) {
				err.toString = function () { return 'Error: ' + this.message; };
				onreaderror(err);
				return;
			}
			if (message.sn !== sn)
				return;
			if (typeof message.codecTime === 'number')
				worker.codecTime += message.codecTime; // should be before onflush()
			if (typeof message.crcTime === 'number')
				worker.crcTime += message.crcTime;

			switch (message.type) {
				case 'append':
					if (data) {
						outputSize += data.length;
						writer.writeUint8Array(data, function() {
							step();
						}, onwriteerror);
					} else
						step();
					break;
				case 'flush':
					crc = message.crc;
					if (data) {
						outputSize += data.length;
						writer.writeUint8Array(data, function() {
							onflush();
						}, onwriteerror);
					} else
						onflush();
					break;
				case 'progress':
					if (onprogress)
						onprogress(index + message.loaded, size);
					break;
				case 'importScripts': //no need to handle here
				case 'newTask':
				case 'echo':
					break;
				default:
					console.warn('zip.js:launchWorkerProcess: unknown message: ', message);
			}
		}

		function step() {
			index = chunkIndex * CHUNK_SIZE;
			// use `<=` instead of `<`, because `size` may be 0.
			if (index <= size) {
				reader.readUint8Array(offset + index, Math.min(CHUNK_SIZE, size - index), function(array) {
					if (onprogress)
						onprogress(index, size);
					var msg = index === 0 ? initialMessage : {sn : sn};
					msg.type = 'append';
					msg.data = array;
					
					// posting a message with transferables will fail on IE10
					try {
						worker.postMessage(msg, [array.buffer]);
					} catch(ex) {
						worker.postMessage(msg); // retry without transferables
					}
					chunkIndex++;
				}, onreaderror);
			} else {
				worker.postMessage({
					sn: sn,
					type: 'flush'
				});
			}
		}

		outputSize = 0;
		worker.addEventListener('message', onmessage, false);
		step();
	}

	function launchProcess(process, reader, writer, offset, size, crcType, onprogress, onend, onreaderror, onwriteerror) {
		var chunkIndex = 0, index, outputSize = 0,
			crcInput = crcType === 'input',
			crcOutput = crcType === 'output',
			crc = new Crc32();
		function step() {
			var outputData;
			index = chunkIndex * CHUNK_SIZE;
			if (index < size)
				reader.readUint8Array(offset + index, Math.min(CHUNK_SIZE, size - index), function(inputData) {
					var outputData;
					try {
						outputData = process.append(inputData, function(loaded) {
							if (onprogress)
								onprogress(index + loaded, size);
						});
					} catch (e) {
						onreaderror(e);
						return;
					}
					if (outputData) {
						outputSize += outputData.length;
						writer.writeUint8Array(outputData, function() {
							chunkIndex++;
							setTimeout(step, 1);
						}, onwriteerror);
						if (crcOutput)
							crc.append(outputData);
					} else {
						chunkIndex++;
						setTimeout(step, 1);
					}
					if (crcInput)
						crc.append(inputData);
					if (onprogress)
						onprogress(index, size);
				}, onreaderror);
			else {
				try {
					outputData = process.flush();
				} catch (e) {
					onreaderror(e);
					return;
				}
				if (outputData) {
					if (crcOutput)
						crc.append(outputData);
					outputSize += outputData.length;
					writer.writeUint8Array(outputData, function() {
						onend(outputSize, crc.get());
					}, onwriteerror);
				} else
					onend(outputSize, crc.get());
			}
		}

		step();
	}

	function inflate(worker, sn, reader, writer, offset, size, computeCrc32, onend, onprogress, onreaderror, onwriteerror) {
		var crcType = computeCrc32 ? 'output' : 'none';
		if (obj.zip.useWebWorkers) {
			var initialMessage = {
				sn: sn,
				codecClass: 'Inflater',
				crcType: crcType,
			};
			launchWorkerProcess(worker, initialMessage, reader, writer, offset, size, onprogress, onend, onreaderror, onwriteerror);
		} else
			launchProcess(new obj.zip.Inflater(), reader, writer, offset, size, crcType, onprogress, onend, onreaderror, onwriteerror);
	}

	function deflate(worker, sn, reader, writer, level, onend, onprogress, onreaderror, onwriteerror) {
		var crcType = 'input';
		if (obj.zip.useWebWorkers) {
			var initialMessage = {
				sn: sn,
				options: {level: level},
				codecClass: 'Deflater',
				crcType: crcType,
			};
			launchWorkerProcess(worker, initialMessage, reader, writer, 0, reader.size, onprogress, onend, onreaderror, onwriteerror);
		} else
			launchProcess(new obj.zip.Deflater(), reader, writer, 0, reader.size, crcType, onprogress, onend, onreaderror, onwriteerror);
	}

	function copy(worker, sn, reader, writer, offset, size, computeCrc32, onend, onprogress, onreaderror, onwriteerror) {
		var crcType = 'input';
		if (obj.zip.useWebWorkers && computeCrc32) {
			var initialMessage = {
				sn: sn,
				codecClass: 'NOOP',
				crcType: crcType,
			};
			launchWorkerProcess(worker, initialMessage, reader, writer, offset, size, onprogress, onend, onreaderror, onwriteerror);
		} else
			launchProcess(new NOOP(), reader, writer, offset, size, crcType, onprogress, onend, onreaderror, onwriteerror);
	}

	// ZipReader

	function decodeASCII(str) {
		var i, out = "", charCode, extendedASCII = [ '\u00C7', '\u00FC', '\u00E9', '\u00E2', '\u00E4', '\u00E0', '\u00E5', '\u00E7', '\u00EA', '\u00EB',
				'\u00E8', '\u00EF', '\u00EE', '\u00EC', '\u00C4', '\u00C5', '\u00C9', '\u00E6', '\u00C6', '\u00F4', '\u00F6', '\u00F2', '\u00FB', '\u00F9',
				'\u00FF', '\u00D6', '\u00DC', '\u00F8', '\u00A3', '\u00D8', '\u00D7', '\u0192', '\u00E1', '\u00ED', '\u00F3', '\u00FA', '\u00F1', '\u00D1',
				'\u00AA', '\u00BA', '\u00BF', '\u00AE', '\u00AC', '\u00BD', '\u00BC', '\u00A1', '\u00AB', '\u00BB', '_', '_', '_', '\u00A6', '\u00A6',
				'\u00C1', '\u00C2', '\u00C0', '\u00A9', '\u00A6', '\u00A6', '+', '+', '\u00A2', '\u00A5', '+', '+', '-', '-', '+', '-', '+', '\u00E3',
				'\u00C3', '+', '+', '-', '-', '\u00A6', '-', '+', '\u00A4', '\u00F0', '\u00D0', '\u00CA', '\u00CB', '\u00C8', 'i', '\u00CD', '\u00CE',
				'\u00CF', '+', '+', '_', '_', '\u00A6', '\u00CC', '_', '\u00D3', '\u00DF', '\u00D4', '\u00D2', '\u00F5', '\u00D5', '\u00B5', '\u00FE',
				'\u00DE', '\u00DA', '\u00DB', '\u00D9', '\u00FD', '\u00DD', '\u00AF', '\u00B4', '\u00AD', '\u00B1', '_', '\u00BE', '\u00B6', '\u00A7',
				'\u00F7', '\u00B8', '\u00B0', '\u00A8', '\u00B7', '\u00B9', '\u00B3', '\u00B2', '_', ' ' ];
		for (i = 0; i < str.length; i++) {
			charCode = str.charCodeAt(i) & 0xFF;
			if (charCode > 127)
				out += extendedASCII[charCode - 128];
			else
				out += String.fromCharCode(charCode);
		}
		return out;
	}

	function decodeUTF8(string) {
		return decodeURIComponent(escape(string));
	}

	function getString(bytes) {
		var i, str = "";
		for (i = 0; i < bytes.length; i++)
			str += String.fromCharCode(bytes[i]);
		return str;
	}

	function getDate(timeRaw) {
		var date = (timeRaw & 0xffff0000) >> 16, time = timeRaw & 0x0000ffff;
		try {
			return new Date(1980 + ((date & 0xFE00) >> 9), ((date & 0x01E0) >> 5) - 1, date & 0x001F, (time & 0xF800) >> 11, (time & 0x07E0) >> 5,
					(time & 0x001F) * 2, 0);
		} catch (e) {
		}
	}

	function readCommonHeader(entry, data, index, centralDirectory, onerror) {
		entry.version = data.view.getUint16(index, true);
		entry.bitFlag = data.view.getUint16(index + 2, true);
		entry.compressionMethod = data.view.getUint16(index + 4, true);
		entry.lastModDateRaw = data.view.getUint32(index + 6, true);
		entry.lastModDate = getDate(entry.lastModDateRaw);
		if ((entry.bitFlag & 0x01) === 0x01) {
			onerror(ERR_ENCRYPTED);
			return;
		}
		if (centralDirectory || (entry.bitFlag & 0x0008) != 0x0008) {
			entry.crc32 = data.view.getUint32(index + 10, true);
			entry.compressedSize = data.view.getUint32(index + 14, true);
			entry.uncompressedSize = data.view.getUint32(index + 18, true);
		}
		if (entry.compressedSize === 0xFFFFFFFF || entry.uncompressedSize === 0xFFFFFFFF) {
			onerror(ERR_ZIP64);
			return;
		}
		entry.filenameLength = data.view.getUint16(index + 22, true);
		entry.extraFieldLength = data.view.getUint16(index + 24, true);
	}

	function createZipReader(reader, callback, onerror) {
		var inflateSN = 0;

		function Entry() {
		}

		Entry.prototype.getData = function(writer, onend, onprogress, checkCrc32) {
			var that = this;

			function testCrc32(crc32) {
				var dataCrc32 = getDataHelper(4);
				dataCrc32.view.setUint32(0, crc32);
				return that.crc32 == dataCrc32.view.getUint32(0);
			}

			function getWriterData(uncompressedSize, crc32) {
				if (checkCrc32 && !testCrc32(crc32))
					onerror(ERR_CRC);
				else
					writer.getData(function(data) {
						onend(data);
					});
			}

			function onreaderror(err) {
				onerror(err || ERR_READ_DATA);
			}

			function onwriteerror(err) {
				onerror(err || ERR_WRITE_DATA);
			}

			reader.readUint8Array(that.offset, 30, function(bytes) {
				var data = getDataHelper(bytes.length, bytes), dataOffset;
				if (data.view.getUint32(0) != 0x504b0304) {
					onerror(ERR_BAD_FORMAT);
					return;
				}
				readCommonHeader(that, data, 4, false, onerror);
				dataOffset = that.offset + 30 + that.filenameLength + that.extraFieldLength;
				writer.init(function() {
					if (that.compressionMethod === 0)
						copy(that._worker, inflateSN++, reader, writer, dataOffset, that.compressedSize, checkCrc32, getWriterData, onprogress, onreaderror, onwriteerror);
					else
						inflate(that._worker, inflateSN++, reader, writer, dataOffset, that.compressedSize, checkCrc32, getWriterData, onprogress, onreaderror, onwriteerror);
				}, onwriteerror);
			}, onreaderror);
		};

		function seekEOCDR(eocdrCallback) {
			// "End of central directory record" is the last part of a zip archive, and is at least 22 bytes long.
			// Zip file comment is the last part of EOCDR and has max length of 64KB,
			// so we only have to search the last 64K + 22 bytes of a archive for EOCDR signature (0x06054b50).
			var EOCDR_MIN = 22;
			if (reader.size < EOCDR_MIN) {
				onerror(ERR_BAD_FORMAT);
				return;
			}
			var ZIP_COMMENT_MAX = 256 * 256, EOCDR_MAX = EOCDR_MIN + ZIP_COMMENT_MAX;

			// In most cases, the EOCDR is EOCDR_MIN bytes long
			doSeek(EOCDR_MIN, function() {
				// If not found, try within EOCDR_MAX bytes
				doSeek(Math.min(EOCDR_MAX, reader.size), function() {
					onerror(ERR_BAD_FORMAT);
				});
			});

			// seek last length bytes of file for EOCDR
			function doSeek(length, eocdrNotFoundCallback) {
				reader.readUint8Array(reader.size - length, length, function(bytes) {
					for (var i = bytes.length - EOCDR_MIN; i >= 0; i--) {
						if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
							eocdrCallback(new DataView(bytes.buffer, i, EOCDR_MIN));
							return;
						}
					}
					eocdrNotFoundCallback();
				}, function() {
					onerror(ERR_READ);
				});
			}
		}

		var zipReader = {
			getEntries : function(callback) {
				var worker = this._worker;
				// look for End of central directory record
				seekEOCDR(function(dataView) {
					var datalength, fileslength;
					datalength = dataView.getUint32(16, true);
					fileslength = dataView.getUint16(8, true);
					if (datalength < 0 || datalength >= reader.size) {
						onerror(ERR_BAD_FORMAT);
						return;
					}
					reader.readUint8Array(datalength, reader.size - datalength, function(bytes) {
						var i, index = 0, entries = [], entry, filename, comment, data = getDataHelper(bytes.length, bytes);
						for (i = 0; i < fileslength; i++) {
							entry = new Entry();
							entry._worker = worker;
							if (data.view.getUint32(index) != 0x504b0102) {
								onerror(ERR_BAD_FORMAT);
								return;
							}
							readCommonHeader(entry, data, index + 6, true, onerror);
							entry.commentLength = data.view.getUint16(index + 32, true);
							entry.directory = ((data.view.getUint8(index + 38) & 0x10) == 0x10);
							entry.offset = data.view.getUint32(index + 42, true);
							filename = getString(data.array.subarray(index + 46, index + 46 + entry.filenameLength));
							entry.filename = ((entry.bitFlag & 0x0800) === 0x0800) ? decodeUTF8(filename) : decodeASCII(filename);
							if (!entry.directory && entry.filename.charAt(entry.filename.length - 1) == "/")
								entry.directory = true;
							comment = getString(data.array.subarray(index + 46 + entry.filenameLength + entry.extraFieldLength, index + 46
									+ entry.filenameLength + entry.extraFieldLength + entry.commentLength));
							entry.comment = ((entry.bitFlag & 0x0800) === 0x0800) ? decodeUTF8(comment) : decodeASCII(comment);
							entries.push(entry);
							index += 46 + entry.filenameLength + entry.extraFieldLength + entry.commentLength;
						}
						callback(entries);
					}, function() {
						onerror(ERR_READ);
					});
				});
			},
			close : function(callback) {
				if (this._worker) {
					this._worker.terminate();
					this._worker = null;
				}
				if (callback)
					callback();
			},
			_worker: null
		};

		if (!obj.zip.useWebWorkers)
			callback(zipReader);
		else {
			createWorker('inflater',
				function(worker) {
					zipReader._worker = worker;
					callback(zipReader);
				},
				function(err) {
					onerror(err);
				}
			);
		}
	}

	// ZipWriter

	function encodeUTF8(string) {
		return unescape(encodeURIComponent(string));
	}

	function getBytes(str) {
		var i, array = [];
		for (i = 0; i < str.length; i++)
			array.push(str.charCodeAt(i));
		return array;
	}

	function createZipWriter(writer, callback, onerror, dontDeflate) {
		var files = {}, filenames = [], datalength = 0;
		var deflateSN = 0;

		function onwriteerror(err) {
			onerror(err || ERR_WRITE);
		}

		function onreaderror(err) {
			onerror(err || ERR_READ_DATA);
		}

		var zipWriter = {
			add : function(name, reader, onend, onprogress, options) {
				var header, filename, date;
				var worker = this._worker;

				function writeHeader(callback) {
					var data;
					date = options.lastModDate || new Date();
					header = getDataHelper(26);
					files[name] = {
						headerArray : header.array,
						directory : options.directory,
						filename : filename,
						offset : datalength,
						comment : getBytes(encodeUTF8(options.comment || ""))
					};
					header.view.setUint32(0, 0x14000808);
					if (options.version)
						header.view.setUint8(0, options.version);
					if (!dontDeflate && options.level !== 0 && !options.directory)
						header.view.setUint16(4, 0x0800);
					header.view.setUint16(6, (((date.getHours() << 6) | date.getMinutes()) << 5) | date.getSeconds() / 2, true);
					header.view.setUint16(8, ((((date.getFullYear() - 1980) << 4) | (date.getMonth() + 1)) << 5) | date.getDate(), true);
					header.view.setUint16(22, filename.length, true);
					data = getDataHelper(30 + filename.length);
					data.view.setUint32(0, 0x504b0304);
					data.array.set(header.array, 4);
					data.array.set(filename, 30);
					datalength += data.array.length;
					writer.writeUint8Array(data.array, callback, onwriteerror);
				}

				function writeFooter(compressedLength, crc32) {
					var footer = getDataHelper(16);
					datalength += compressedLength || 0;
					footer.view.setUint32(0, 0x504b0708);
					if (typeof crc32 != "undefined") {
						header.view.setUint32(10, crc32, true);
						footer.view.setUint32(4, crc32, true);
					}
					if (reader) {
						footer.view.setUint32(8, compressedLength, true);
						header.view.setUint32(14, compressedLength, true);
						footer.view.setUint32(12, reader.size, true);
						header.view.setUint32(18, reader.size, true);
					}
					writer.writeUint8Array(footer.array, function() {
						datalength += 16;
						onend();
					}, onwriteerror);
				}

				function writeFile() {
					options = options || {};
					name = name.trim();
					if (options.directory && name.charAt(name.length - 1) != "/")
						name += "/";
					if (files.hasOwnProperty(name)) {
						onerror(ERR_DUPLICATED_NAME);
						return;
					}
					filename = getBytes(encodeUTF8(name));
					filenames.push(name);
					writeHeader(function() {
						if (reader)
							if (dontDeflate || options.level === 0)
								copy(worker, deflateSN++, reader, writer, 0, reader.size, true, writeFooter, onprogress, onreaderror, onwriteerror);
							else
								deflate(worker, deflateSN++, reader, writer, options.level, writeFooter, onprogress, onreaderror, onwriteerror);
						else
							writeFooter();
					}, onwriteerror);
				}

				if (reader)
					reader.init(writeFile, onreaderror);
				else
					writeFile();
			},
			close : function(callback) {
				if (this._worker) {
					this._worker.terminate();
					this._worker = null;
				}

				var data, length = 0, index = 0, indexFilename, file;
				for (indexFilename = 0; indexFilename < filenames.length; indexFilename++) {
					file = files[filenames[indexFilename]];
					length += 46 + file.filename.length + file.comment.length;
				}
				data = getDataHelper(length + 22);
				for (indexFilename = 0; indexFilename < filenames.length; indexFilename++) {
					file = files[filenames[indexFilename]];
					data.view.setUint32(index, 0x504b0102);
					data.view.setUint16(index + 4, 0x1400);
					data.array.set(file.headerArray, index + 6);
					data.view.setUint16(index + 32, file.comment.length, true);
					if (file.directory)
						data.view.setUint8(index + 38, 0x10);
					data.view.setUint32(index + 42, file.offset, true);
					data.array.set(file.filename, index + 46);
					data.array.set(file.comment, index + 46 + file.filename.length);
					index += 46 + file.filename.length + file.comment.length;
				}
				data.view.setUint32(index, 0x504b0506);
				data.view.setUint16(index + 8, filenames.length, true);
				data.view.setUint16(index + 10, filenames.length, true);
				data.view.setUint32(index + 12, length, true);
				data.view.setUint32(index + 16, datalength, true);
				writer.writeUint8Array(data.array, function() {
					writer.getData(callback);
				}, onwriteerror);
			},
			_worker: null
		};

		if (!obj.zip.useWebWorkers)
			callback(zipWriter);
		else {
			createWorker('deflater',
				function(worker) {
					zipWriter._worker = worker;
					callback(zipWriter);
				},
				function(err) {
					onerror(err);
				}
			);
		}
	}

	function resolveURLs(urls) {
		var a = document.createElement('a');
		return urls.map(function(url) {
			a.href = url;
			return a.href;
		});
	}

	var DEFAULT_WORKER_SCRIPTS = {
		deflater: ['z-worker.js', 'deflate.js'],
		inflater: ['z-worker.js', 'inflate.js']
	};
	function createWorker(type, callback, onerror) {
		if (obj.zip.workerScripts !== null && obj.zip.workerScriptsPath !== null) {
			onerror(new Error('Either zip.workerScripts or zip.workerScriptsPath may be set, not both.'));
			return;
		}
		var scripts;
		if (obj.zip.workerScripts) {
			scripts = obj.zip.workerScripts[type];
			if (!Array.isArray(scripts)) {
				onerror(new Error('zip.workerScripts.' + type + ' is not an array!'));
				return;
			}
			scripts = resolveURLs(scripts);
		} else {
			scripts = DEFAULT_WORKER_SCRIPTS[type].slice(0);
			scripts[0] = (obj.zip.workerScriptsPath || '') + scripts[0];
		}
		var worker = new Worker(scripts[0]);
		// record total consumed time by inflater/deflater/crc32 in this worker
		worker.codecTime = worker.crcTime = 0;
		worker.postMessage({ type: 'importScripts', scripts: scripts.slice(1) });
		worker.addEventListener('message', onmessage);
		function onmessage(ev) {
			var msg = ev.data;
			if (msg.error) {
				worker.terminate(); // should before onerror(), because onerror() may throw.
				onerror(msg.error);
				return;
			}
			if (msg.type === 'importScripts') {
				worker.removeEventListener('message', onmessage);
				worker.removeEventListener('error', errorHandler);
				callback(worker);
			}
		}
		// catch entry script loading error and other unhandled errors
		worker.addEventListener('error', errorHandler);
		function errorHandler(err) {
			worker.terminate();
			onerror(err);
		}
	}

	function onerror_default(error) {
		console.error(error);
	}
	obj.zip = {
		Reader : Reader,
		Writer : Writer,
		BlobReader : BlobReader,
		Data64URIReader : Data64URIReader,
		TextReader : TextReader,
		BlobWriter : BlobWriter,
		Data64URIWriter : Data64URIWriter,
		TextWriter : TextWriter,
		createReader : function(reader, callback, onerror) {
			onerror = onerror || onerror_default;

			reader.init(function() {
				createZipReader(reader, callback, onerror);
			}, onerror);
		},
		createWriter : function(writer, callback, onerror, dontDeflate) {
			onerror = onerror || onerror_default;
			dontDeflate = !!dontDeflate;

			writer.init(function() {
				createZipWriter(writer, callback, onerror, dontDeflate);
			}, onerror);
		},
		useWebWorkers : true,
		/**
		 * Directory containing the default worker scripts (z-worker.js, deflate.js, and inflate.js), relative to current base url.
		 * E.g.: zip.workerScripts = './';
		 */
		workerScriptsPath : null,
		/**
		 * Advanced option to control which scripts are loaded in the Web worker. If this option is specified, then workerScriptsPath must not be set.
		 * workerScripts.deflater/workerScripts.inflater should be arrays of urls to scripts for deflater/inflater, respectively.
		 * Scripts in the array are executed in order, and the first one should be z-worker.js, which is used to start the worker.
		 * All urls are relative to current base url.
		 * E.g.:
		 * zip.workerScripts = {
		 *   deflater: ['z-worker.js', 'deflate.js'],
		 *   inflater: ['z-worker.js', 'inflate.js']
		 * };
		 */
		workerScripts : null,
	};

})(this);

; browserify_shim__define__module__export__(typeof zip != "undefined" ? zip : window.zip);

}).call(global, undefined, undefined, undefined, undefined, function defineExport(ex) { module.exports = ex; });

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}]},{},[1]);
