const Rollbar = require('./scripts/logging/rollbar');
const Feeds = require('./scripts/feedCollection');

require('dotenv').config();

var rollbar = new Rollbar(process.env.ROLLBAR_TOKEN);

let feeds;
feeds = new Feeds();
feeds.createFeedObject();
feeds.watchObject();

function error(error) {
  rollbar.error(error);
}

function warning(warning) {
  rollbar.warning(warning);
}
