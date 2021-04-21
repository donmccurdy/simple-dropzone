# simple-dropzone

[![Latest NPM release](https://img.shields.io/npm/v/simple-dropzone.svg)](https://www.npmjs.com/package/simple-dropzone)
[![Minzipped size](https://badgen.net/bundlephobia/minzip/simple-dropzone)](https://bundlephobia.com/result?p=simple-dropzone)
[![License](https://img.shields.io/npm/l/simple-dropzone.svg)](https://github.com/donmccurdy/simple-dropzone/blob/master/LICENSE)
[![CI](https://github.com/donmccurdy/simple-dropzone/workflows/CI/badge.svg?branch=main&event=push)](https://github.com/donmccurdy/simple-dropzone/actions?query=workflow%3ACI)

A simple drag-and-drop input using vanilla JavaScript.

The library supports supports selection of multiple files, ZIP decoding, and fallback to `<input type=file multiple>` on older browsers.

## Installation

```
npm install --save simple-dropzone
```

## Usage

Create DOM elements for the dropzone and a file input (for compatibility with older browsers). Both may be styled in CSS however you choose.

```html
<div id="dropzone"></div>
<input type="file" id="input">
```

Create a `SimpleDropzone` controller. When files are added, by drag-and-drop or selection with the input, a `drop` event is emitted. This event contains a map of filenames to HTML5 [File](https://developer.mozilla.org/en-US/docs/Web/API/File) objects. The file list is flat, although directory structure is shown in the filenames.

```js

dropzone.on('drop', ({files}) => {
  console.log(files);
});
```

Optionally, you may want to set [additional attributes](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file#additional_attributes) to configure the file input element, e.g. to allow selection of multiple files.

## API

### SimpleDropzone( `dropEl`, `inputEl` )

Constructor takes two DOM elements, for the dropzone and file input.

```js
const dropEl = document.querySelector('#dropzone');
const inputEl = document.querySelector('#input');
const dropCtrl = new SimpleDropzone(dropEl, inputEl);
```

```html
<div id="dropzone"></div>
<input type="file" id="input">
```

### .on( `event`, `callback` ) : `this`

Listens for `event` and invokes the callback.

```js
dropCtrl.on('drop', ({files}) => {
  console.log(files);
});
```

### .destroy()

Destroys the instance and unbinds all events.

## Events

| Event | Properties | Description |
|---|---|---|
| `drop` | `files : Map<string, File>, archive?: File` | New files added, from either drag-and-drop or selection. `archive` is provided if the files were extracted from a ZIP archive. |
| `dropstart` |  — | Selection is in progress. Decompressing ZIP archives may take several seconds. |
| `droperror` | `message : string` | Selection has failed. |
