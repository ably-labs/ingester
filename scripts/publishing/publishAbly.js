const Ably = require('ably');
const Logger = require('../logging/rollbar');

class AblyPublisher {
  constructor(test, logger) {
    this.logger = new Logger(process.env.ROLLBAR_TOKEN);
    this.id = -1;
    this.test = test;
    this.clients = [];
  }

  connect(ablyOptions) {
    let i = 0;
    for (let key in ablyOptions) {
      this.clients[i] = new Ably.Rest(ablyOptions[key]);
      i++;
    }
  }

  isConnected() {
    return this.connected;
  }

  setId(id) {
    this.id = id;
  }

  async publish(result, channelName, hideLog) {
    let cName = channelName.split(' ').join('');
    try {
      if(!this.test) {
        for (let i = 0; i < this.clients.length; i++) {
          this.clients[i].channels.get(cName).publish('data', result, function(err) {
            if(err && !hideLog) {
              this.logger.error(err);
            }
          });
        }
      } else {
        console.log('CHANNEL IS: ' + cName);
        console.log(result);
      }
    } catch(err) {
      this.logger.error(err);
    }
  }
}
module.exports = AblyPublisher;
