const request           = require('request');
const BaseStreamObject  = require('./baseStreamObject');

class RestObject extends BaseStreamObject {
  constructor(element) {
    super(element);
  }

  watch() {
    this.requestCall(this.streamObject.source, this.publish);
    this.startTimer(this.requestCall, this.streamObject.options.frequency);
    this.on = true;
  }

  stop() {
    this.on = false;
    this.stopTimer();
  }

  requestCall() {
    this.requestRest(this.streamObject.source, this.publish);
  }

  requestRest(source, action, opt1, opt2) {
    try {
      request(source, (error, response, body) => {
        if(error) {
          this.warning('Error in ' + this.streamObject.displayname + ': ' + error);
        } else {
          action.call(this, this.parseJSON(body), opt1, opt2);
        }
      });
    } catch(error) {
      this.warning('Caught error in Request for object '  + this.streamObject.displayname + ': ' + error);
    }
  }

  publish(message) {
    this.ably.publish(message, this.streamObject.namespace);
  }
}
module.exports = RestObject;
