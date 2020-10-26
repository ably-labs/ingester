const Logger = require('./logging/rollbar');
require('dotenv').config();

class Feeds {
  constructor() {
    if (Feeds._instance) {
      throw new Error('Instance of Feeds already exists.');
    }
    Feeds._instance = this;
    this.logger = new Logger(process.env.ROLLBAR_TOKEN);
  }

  getFeeds() {
    return this.feed;
  }

  createFeedObject() {
    let objectRef;
    let streamSettings;
    try {
      streamSettings = JSON.parse(`${process.env.SOURCE_CONFIG}`);

      objectRef = require('./ingesterObjects/' + streamSettings.type + 'Object');
      this.object = new objectRef(streamSettings);
      this.setupLogging();
    } catch(error) {
      if (streamSettings == null || streamSettings.type == undefined) {
        this.logger.error(`Unsupported object passed in with SOURCE_CONFIG`);
      } else {
      this.logger.error(`Unsupported source type "${streamSettings.type}", or error: ${error}`)
      }
    }
    this.feed = this.object;
    console.log('Feed created');
  }

  setupLogging() {
    this.object.on('log', (message) => {
      this.logger.log(message);
    });
    this.object.on('warning', (message) => {
      this.logger.warning(message);
    });
    this.object.on('error', (message) => {
      this.logger.error(message);
    });
  }

  watchObject() {
    if(!this.feed.isOn()) {
      this.feed.setActive(true);
      this.feed.watch();
    }
  }

  stopObject(id) {
    if(this.feed.isOn()) {
      this.feed.setActive(false);
      this.feed.stop();
    }
  }

  stopWatchingAllObjects() {
    if(this.feed.isOn()) {
      this.feed.stop();
    }
  }
}
module.exports = Feeds
