import QUnit from 'qunit';
import Stream from '../src/stream';

QUnit.module('stream', {

  beforeEach() {
    this.stream = new Stream();
  },

  afterEach() {
    this.stream.dispose();
  }
});

QUnit.test('trigger calls listeners', function(assert) {
  const args = [];

  this.stream.on('test', function(...data) {
    data.forEach((d) => {
      args.push(d);
    });
  });

  this.stream.trigger('test', 1);
  this.stream.trigger('test', 2);
  this.stream.trigger('test', 3, 4);

  assert.deepEqual(args, [1, 2, 3, 4]);
});

QUnit.test('callbacks can remove themselves', function(assert) {
  const args1 = [];
  const args2 = [];
  const args3 = [];
  const arg2Fn = (event) => {
    args2.push(event);
    this.stream.off('test', arg2Fn);
  };

  this.stream.on('test', (event) => {
    args1.push(event);
  });
  this.stream.on('test', arg2Fn);
  this.stream.on('test', (event) => {
    args3.push(event);
  });

  this.stream.trigger('test', 1);
  this.stream.trigger('test', 2);

  assert.deepEqual(args1, [1, 2], 'first callback ran all times');
  assert.deepEqual(args2, [1], 'second callback removed after first run');
  assert.deepEqual(args3, [1, 2], 'third callback ran all times');
});

QUnit.test('can pipe', function(assert) {
  const pipeData = [];
  const stream2 = new Stream();

  stream2.push = function(data) {
    assert.equal(this, stream2, 'context is the same');
    pipeData.push(data);
  };

  this.stream
    .pipe(stream2);

  this.stream.trigger('data', 1, 2, 3, 4, 5);
  this.stream.trigger('data', 6);

  assert.deepEqual(pipeData, [1, 2, 3, 4, 5, 6], 'data piped to stream2');

  stream2.dispose();
});

QUnit.test('off no listener', function(assert) {
  assert.strictEqual(this.stream.off('nope'), false, 'returns false when no listener is removed');
});

QUnit.test('trigger no listener', function(assert) {
  assert.strictEqual(this.stream.trigger('nope'), undefined, 'returns undefined for trigger with no listeners');
});
