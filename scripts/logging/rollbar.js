const RollbarLib = require('rollbar');
class Rollbar {
  constructor(token) {
    if (token == null) {
      this.localLog = true;
    } else {
      this.rollbar = new RollbarLib({
        accessToken: token,
        captureUncaught: true,
        captureUnhandledRejections: true
      });
    }
  }

  error(message) {
    if (this.localLog) {
      console.error(message);
    } else {
      this.rollbar.error(message);
    }
  }

  warning(message) {
    if (this.localLog) {
      console.warn(message);
    } else {
      this.rollbar.warning(message);
    }
  }

  log(message) {
    if (this.localLog) {
      console.log(message);
    } else {
      this.rollbar.log(message);
    }
  }

}
module.exports = Rollbar
