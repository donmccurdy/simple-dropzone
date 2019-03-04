const SimpleDropzone = require('../');

const dropEl = document.querySelector('.dropzone');
const inputEl = document.querySelector('.input');
const infoEl = document.querySelector('.info');
const listEl = document.querySelector('.list');

const dropzone = new SimpleDropzone(dropEl, inputEl);

dropzone.on('drop', ({files, archive}) => {
  files = Array.from( files );
  listEl.innerHTML = files
    .map(([filename, file]) => `<li>${filename} : ${file.size} bytes</li>`)
    .join('');

  infoEl.textContent = archive
    ? `Extracted from ${archive.name} : ${archive.size} bytes`
    : '';
});

dropzone.on('droperror', ({message}) => {
  alert(`Error: ${message}`);
});
