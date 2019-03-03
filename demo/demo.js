const SimpleDropzone = require('../');

const dropEl = document.querySelector('.dropzone');
const inputEl = document.querySelector('.input');
const textEl = document.querySelector('.text');
const listEl = document.querySelector('.list');

const dropzone = new SimpleDropzone(dropEl, inputEl);

dropzone.on('drop', ({files, archive}) => {
  files = Array.from( files );
  listEl.innerHTML = files
    .map(([filename, file]) => `<li>${filename} : ${file.size} bytes</li>`)
    .join('');
  if (archive)
    textEl.innerHTML = `Extracted from ${archive.name} : ${archive.size} bytes`;
});

dropzone.on('droperror', ({message}) => {
  alert(`Error: ${message}`);
});
