const request = require('request');
const RestObject  = require('./restObject');
const BaseStreamObject = require('./baseStreamObject');

class flightawareObject extends RestObject {
  constructor(element) {
    super(element);
    this.lastRequestTime = null;
    if(!Array.isArray(this.streamObject.source)) {
      this.streamObject.source = [this.streamObject.source];
    }
    this.finishedSetup = true;
    this.aircraft = {};
    this.topLevel = {};
  }

  parseAircraft() {
    // Extract current timestamp  
    let timestamp = new Date(this.topLevel.now * 1000);
    // Extract each flight & build new structure
    let message = {};
    for (let i = 0; i <     this.topLevel.aircraft.length; i++){
      message.timestamp = timestamp;
      message.aircraft = this.topLevel.aircraft[i];
      // Throw away anything which doesn't have a valid location
      if (message.aircraft.lon != null){
        message.geo_point = { "location": { "lat": message.aircraft.lat, "lon": message.aircraft.lon }};
        // Send to Ably
        this.ably.publish(message, this.streamObject.namespace, this.streamObject.hide_log);
    }
    }
  }


  requestCall() {
    if (!this.finishedSetup) {
      return;
    }
    this.requestRest({
      method: 'GET',
      url: this.streamObject.url,
      encoding: 'UTF-8',
      headers: { 'Content-Type': 'application/json' }
    });

  }
  requestRest(source, action) {
    try {

      request(source, (error, response, body) => {
        if(error) {
          this.warning('Error in ' + this.streamObject.displayname + ': ' + error);
        } else {
          this.topLevel = this.parseJSON(body);
          this.parseAircraft(this.topLevel); 
        }
      });
    } catch(error) {
      this.warning('Caught error in Request for object '  + this.streamObject.displayname + ': ' + error);
    }
  }

}
module.exports = flightawareObject;
