# simple-dropzone

A simple multi-file drag-and-drop input using vanilla JavaScript.

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

## API

### SimpleDropzone( `dropEl`, `inputEl` ) : extends [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)

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

### .once( `event`, `callback` ) : `this`

Listens for 1 occurrence of `event` and invokes the callback.

### .destroy()

Destroys the instance and unbinds all events.

## Events

| Event | Properties | Description |
|---|---|---|
| `drop` | `files : Map<string, File>` | New files added, from either drag-and-drop or selection. |
| `dropstart` |  — | Selection is in progress. Decompressing ZIP archives may take several seconds. |
| `droperror` | `message : string` | Selection has failed. |
