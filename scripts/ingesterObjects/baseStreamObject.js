const AblyPublisher = require('../publishing/publishAbly');
const EventEmitter = require('events');

class BaseStreamObject extends EventEmitter {
  constructor(stream) {
    super();
    this.streamObject = stream;
    this.active = false;
    let isTest = stream.test == true;
    this.ably = new AblyPublisher(isTest);
    this.ably.connect(stream.options.ably_options);
  }

  watch() {
    throw 'Child of baseStreamObject needs to specify watch function';
  }

  stop() {
    throw 'Child of baseStreamObject needs to specify stop function';
  }

  isOn() {
    return this.active;
  }

  setActive(val) {
    this.active = val;
  }

  startTimer(action, frequency) {
    this.watcher = setInterval(() => {
      action.call(this);
    }, frequency * 1000);
  }

  startBatchTimer(action, frequency, numItems, currentIter) {
    let numIters = Math.ceil(numItems / this.streamObject.options.batchsize);
    if(currentIter < numIters) {
      let startItem = currentIter * this.streamObject.options.batchsize;
      let endItem = startItem + Math.min(numItems - startItem, this.streamObject.options.batchsize);
      action.call(this, startItem, endItem);
      this.watcher = setInterval(() => {
        this.currentIter = currentIter;
        action.call(this, startItem, endItem);
      }, numIters * frequency * 1000);

      let newIter = currentIter + 1;
      this.batchTimeout = setTimeout(() => {
        this.startBatchTimer(action, frequency, numItems, newIter);
      }, frequency * 1000);
    }
  }

  stopTimer() {
    clearInterval(this.watcher);
    clearInterval(this.batchTimeout);
  }

  log(warning) {
    this.emit('log', warning);
  }
  warning(warning) {
    this.emit('warning', warning);
  }

  error(error) {
    this.emit('error', error);
  }

  updateWholeObject(baseObject) {
    this.baseObject = baseObject;
  }

  parseJSON(str) {
    let parsed;
    try {
      parsed = JSON.parse(str);
    } catch (e) {
      this.warning('Failed to parse JSON, value was: ' + str);
      return [];
    }
    return parsed;
  }

  objectSize(object) {
    let objectList = [];
    let stack = [ object ];
    let bytes = 0;

    while ( stack.length ) {
      var value = stack.pop();

      if ( typeof value === 'boolean' ) {
        bytes += 4;
      }
      else if ( typeof value === 'string' ) {
        bytes += value.length * 2;
      }
      else if ( typeof value === 'number' ) {
        bytes += 8;
      }
      else if (typeof value === 'object' && objectList.indexOf( value ) === -1) {
        objectList.push( value );

        for( var i in value ) {
          stack.push( value[ i ] );
        }
      }
    }
    return bytes;
  }
}
module.exports = BaseStreamObject;
