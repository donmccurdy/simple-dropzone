const SimpleDropzone = require('../');

const dropEl = document.querySelector('.dropzone');
const inputEl = document.querySelector('.input');
const listEl = document.querySelector('.list');

const dropzone = new SimpleDropzone(dropEl, inputEl);

dropzone.on('drop', ({files}) => {
  files = Array.from( files );
  listEl.innerHTML = files
    .map(([filename, file]) => `<li>${filename} : ${file.size} bytes</li>`)
    .join('');
});

dropzone.on('droperror', ({message}) => {
  alert(`Error: ${message}`);
});
