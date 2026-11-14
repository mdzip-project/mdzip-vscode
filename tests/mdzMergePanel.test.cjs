const assert = require('node:assert/strict');
const test = require('node:test');
const { addMergeAttribute } = require('../dist/test/mdzMergePanel.cjs');

test('adds a *.mdz line with merge and diff when there is none', () => {
  assert.deepEqual(addMergeAttribute(''), { text: '*.mdz merge=mdz diff=mdz\n', addedDiff: true });
  assert.deepEqual(addMergeAttribute('*.png binary\n'), { text: '*.png binary\n*.mdz merge=mdz diff=mdz\n', addedDiff: true });
  assert.equal(addMergeAttribute('*.png binary').text, '*.png binary\n*.mdz merge=mdz diff=mdz\n');
});

test('adds merge=mdz to an existing *.mdz line, keeping CRLF', () => {
  assert.deepEqual(addMergeAttribute('*.md text\r\n*.mdz diff=mdz  \r\n'), {
    text: '*.md text\r\n*.mdz diff=mdz merge=mdz\r\n',
    addedDiff: false,
  });
});

test('leaves a line that already names a merge driver alone', () => {
  for (const text of ['*.mdz merge=mdz diff=mdz\n', '*.mdz binary -merge\n', '*.mdz merge=binary\n']) {
    assert.deepEqual(addMergeAttribute(text), { text, addedDiff: false });
  }
});
