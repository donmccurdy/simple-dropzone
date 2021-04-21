const test = require('tape');
const { SimpleDropzone } = require('./');

const INPUT_FILES = [
	{name: 'a.png', webkitRelativePath: 'path/to/a.png'},
	{name: 'b.png', webkitRelativePath: 'path/to/b.png'},
]

test('construct', (t) => {
	const inputEl = new MockHTMLElement();
	const dropEl = new MockHTMLElement();
	const ctrl = new SimpleDropzone(dropEl, inputEl);
	t.ok(ctrl, 'creates dropzone');
	t.equal(inputEl.listeners.length, 1, 'adds input listeners');
	t.equal(dropEl.listeners.length, 2, 'adds dropzone listeners');
	t.end();
});

test('select', async (t) => {
	const inputEl = new MockHTMLElement();
	const dropEl = new MockHTMLElement();
	const ctrl = new SimpleDropzone(dropEl, inputEl);

	inputEl.files = INPUT_FILES;

	let receivedDropstart = false;
	let receivedDroperror = false;
	let receivedDrop = false;

	ctrl.on('dropstart', () => (receivedDropstart = true));
	ctrl.on('droperror', () => (receivedDroperror = true));
	ctrl.on('drop', () => (receivedDrop = true));

	const dropEvent = await new Promise((resolve, reject) => {
		ctrl.on('drop', resolve);
		ctrl.on('droperror', reject);
		inputEl.dispatchEvent(new CustomEvent('change', {}));
	});

	t.ok(receivedDropstart, 'dropstart');
	t.notOk(receivedDroperror, 'droperror');
	t.ok(receivedDrop, 'drop');
	t.deepEqual(Array.from(dropEvent.files), [
		[INPUT_FILES[0].webkitRelativePath, INPUT_FILES[0]],
		[INPUT_FILES[1].webkitRelativePath, INPUT_FILES[1]],
	], 'content');
	t.end();
});

test('destroy', (t) => {
	const inputEl = new MockHTMLElement();
	const dropEl = new MockHTMLElement();
	const ctrl = new SimpleDropzone(dropEl, inputEl);

	t.equal(inputEl.listeners.length, 1, 'adds input listeners');
	t.equal(dropEl.listeners.length, 2, 'adds dropzone listeners');

	ctrl.destroy();

	t.equal(inputEl.listeners.length, 0, 'removes input listeners');
	t.equal(dropEl.listeners.length, 0, 'removes dropzone listeners');

	t.end();
});

/**
 * Mock HTMLElement.
 *
 * Using an actual HTMLInputElement, it's difficult to modify the .files property
 * without user interaction (https://stackoverflow.com/q/1696877/1314762). So
 * instead, we use a simple mock element here.
 */
class MockHTMLElement {
	constructor () {
		this.listeners = [];
	}
	addEventListener (type, fn, options) {
		this.listeners.push([type, fn, options]);
	}
	removeEventListener (type, fn) {
		this.listeners = this.listeners.filter((listener) => {
			return !(listener[0] === type && listener[1] === fn);
		});
	}
	dispatchEvent (event) {
		for (const listener of this.listeners) {
			if (listener[0] === event.type) listener[1](event);
		}
	}
}