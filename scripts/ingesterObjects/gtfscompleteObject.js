const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const unzipper = require('unzipper');
const stripBomStream = require('strip-bom-stream');
const request = require('request');
const RestObject  = require('./restObject');
const csv = require('csv-parser');
const fs = require('fs');

const MAX_ZOOM_DEPTH = 8;
const MIN_ZOOM_DEPTH = 0;

class GTFSCompleteObject extends RestObject {
  constructor(element) {
    super(element);
    this.lastRequestTime = null;
    if(!Array.isArray(this.streamObject.source)) {
      this.streamObject.source = [this.streamObject.source];
    }
    this.finishedSetup = false;

    this.services = {};
    this.routes = {};
    this.trips = [];
    this.stops = {};
    this.stopTimes = {};
    this.shapes = {};

    this.tripUpdates = {};

    this.dates = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday'
    ]

    if (this.streamObject.all) {
      var stream = request(this.streamObject.all).pipe(fs.createWriteStream('gtfs.zip'));
      stream.on('finish', () => { this.loadFiles() });
    }
  }

  loadFiles() {
    fs.createReadStream('gtfs.zip')
    .pipe(unzipper.Extract({ path: 'gtfs' }))
    .promise()
    .then(() => {
      this.setupServices();
    });
  }

  insertStations() {
    this.tripsWithRoute = [];

    for (let i = 0; i < this.trips.length; i++) {
      let cTrip = this.addStationsToTrips(i, this.trips[i].shape_id, this.trips[i].trip_id);

      if (this.services[cTrip.service_id]['routes'][cTrip.route_id] === undefined) {
        this.services[cTrip.service_id]['routes'][cTrip.route_id] = [];
      }
      this.services[cTrip.service_id]['routes'][cTrip.route_id].push(cTrip);
    }
    this.finishedSetup = true;
  }

  addStationsToTrips(currentI, shapeID, tripID) {
    let path = [];
    for (let i = 0; i < this.shapes[shapeID].length; i++) {
      let tmpShape = this.shapes[shapeID][i];
      path[i] = tmpShape;
    }

    let stations = this.stopTimes[tripID];

    let currentTrip = this.trips[currentI];

    let iMin = 0;

    for (let j = 0; j < stations.length; j++) {
      delete stations[j].trip_id;
      if (stations[j].arrival_time == '' || typeof stations[j].arrival_time != 'string')  {
        continue;
      }

      let newStationTime = new Date("01/01/2001");
      let hourMinuteSeconds = stations[j].arrival_time.split(':');
      newStationTime.setHours(hourMinuteSeconds[0], hourMinuteSeconds[1], hourMinuteSeconds[2]);
      stations[j].arrival_time = newStationTime;

      let newStationDepartureTime = new Date("01/01/2001");
      let hourMinuteSecondsDeparture = stations[j].departure_time.split(':');
      newStationDepartureTime.setHours(hourMinuteSecondsDeparture[0], hourMinuteSecondsDeparture[1], hourMinuteSecondsDeparture[2]);
      stations[j].departure_time = newStationDepartureTime;
    }

    for (let j = 0; j < stations.length; j++) {
      let insertPoint = iMin;
      let shouldCombinePoints = false;
      let n = path.length;

      if (stations[j].shape_dist_traveled != undefined && !parseFloat(stations[j].shape_dist_traveled)) {
        stations[j].shape_dist_traveled = 0;
      }

      for (let i = iMin; i < n; i++) {
        if (path[i].shape_dist_traveled != undefined && !parseFloat(path[i].shape_dist_traveled)) {
          path[i].shape_dist_traveled = 0;
        }
        if (path[i].shape_dist_traveled !== undefined && stations[j].shape_dist_traveled !== undefined) {
          if (parseFloat(path[i].shape_dist_traveled) === parseFloat(stations[j].shape_dist_traveled)) {
            shouldCombinePoints = true;
            break;
          } else if (parseFloat(path[i].shape_dist_traveled) > parseFloat(stations[j].shape_dist_traveled)) {
            break;
          }
          insertPoint = i + 1;
        } else {
          console.log("Invalid GTFS data: Missing shape_dist_traveled");
        }
      }

      if (insertPoint == n) {
        let stopDetails = this.stops[stations[j].stop_id];
        let newDetails = {
          "shape_pt_lat": stopDetails.stop_lat,
          "shape_pt_lon": stopDetails.stop_lon,
          "shape_dist_traveled": stations[j].shape_dist_traveled,
          "arrival_time": stations[j].arrival_time,
          "departure_time": stations[j].departure_time,
          "stop_id": stations[j].stop_id,
          "stop_sequence": stations[j].stop_sequence
        };
        path.push(newDetails);
      } else {
        this.sortIn(path, insertPoint, stations[j], shouldCombinePoints);
      }
      iMin = insertPoint;
    }

    path = path.slice(0, iMin + 1);

    currentTrip['path'] = path;
    currentTrip['start_time'] = stations[0]['arrival_time'];
    currentTrip['end_time'] = stations[stations.length - 1]['arrival_time'];

    return currentTrip;
  }

  addTimesToNodes(path, start, end, startTime, endTime, startDistance, endDistance) {
    let totalDistanceBetweenNodes = endDistance - startDistance;

    let timeDiff = endTime - startTime;

    for (let i = start; i < end; i++) {
      if (path[i].arrival_time != undefined && path[i].arrival_time != '') {
        continue;
      }
      let distanceOfNodeFromStart = path[i].shape_dist_traveled - startDistance;
      let distPercentBetweenNodes;
      if (totalDistanceBetweenNodes == 0 || distanceOfNodeFromStart == 0) {
        distPercentBetweenNodes = 0;
      } else {
        distPercentBetweenNodes = distanceOfNodeFromStart / totalDistanceBetweenNodes;
      }

      let newTime = new Date(startTime.getTime());
      newTime.setSeconds(newTime.getSeconds() + (timeDiff / 1000) * distPercentBetweenNodes);
      path[i].arrival_time = newTime;
      path[i].departure_time = newTime;
    }
  }

  sortIn(path, insertPoint, station, shouldCombinePoints) {
    let stopDetails = this.stops[station.stop_id];
    let newDetails = {
      "shape_pt_lat": stopDetails.stop_lat,
      "shape_pt_lon": stopDetails.stop_lon,
      "shape_dist_traveled": station.shape_dist_traveled,
      "arrival_time": station.arrival_time,
      "departure_time": station.departure_time,
      "stop_id": station.stop_id,
      "stop_sequence": station.stop_sequence
    };
    if (shouldCombinePoints) {
      path[insertPoint] = newDetails;
    } else {
      path.splice(insertPoint, 0, newDetails);
    }
  }

  d(s, v1, v2) {
    let a = Math.sqrt(Math.pow(parseFloat(v1.shape_pt_lat) - parseFloat(v2.shape_pt_lat), 2) + Math.pow(parseFloat(v1.shape_pt_lon) - parseFloat(v2.shape_pt_lon), 2));
    let b = Math.sqrt(Math.pow(parseFloat(v1.shape_pt_lat) - parseFloat(s.stop_lat), 2) + Math.pow(parseFloat(v1.shape_pt_lon) - parseFloat(s.stop_lon), 2));
    let c = Math.sqrt(Math.pow(parseFloat(v2.shape_pt_lat) - parseFloat(s.stop_lat), 2) + Math.pow(parseFloat(v2.shape_pt_lon) - parseFloat(s.stop_lon), 2));

    return Math.pow((b+c), 2) - Math.pow(a, 2);
  }

  setupServices() {
    fs.createReadStream('gtfs/calendar.txt')
      .pipe(stripBomStream())
      .pipe(csv())
      .on('data', (row) => {
        this.services[row.service_id] = row;
        this.services[row.service_id]['routes'] = {};
      })
      .on('end', () => {
        this.setupRoutes();
      });
  }

  setupRoutes() {
    fs.createReadStream('gtfs/routes.txt')
      .pipe(stripBomStream())
      .pipe(csv())
      .on('data', (row) => {
        this.routes[row.route_id] = row;
      })
      .on('end', () => {
        this.setupTrips();
      });
  }

  setupTrips() {
    fs.createReadStream('gtfs/trips.txt')
      .pipe(stripBomStream())
      .pipe(csv())
      .on('data', (row) => {
        this.trips.push(row);
      })
      .on('end', () => {
        this.setupStops();
      });
  }

  setupStops() {
    fs.createReadStream('gtfs/stops.txt')
      .pipe(stripBomStream())
      .pipe(csv())
      .on('data', (row) => {
        this.stops[row.stop_id] = row;
      })
      .on('end', () => {
        this.setupStopTimes();
      });
  }

  setupStopTimes() {
    fs.createReadStream('gtfs/stop_times.txt')
    .pipe(stripBomStream())
    .pipe(csv())
    .on('data', (row) => {
      if (this.stopTimes[row.trip_id] == undefined) {
        this.stopTimes[row.trip_id] = [];
      }
      this.stopTimes[row.trip_id].push(row);
    })
    .on('end', () => {
      for (let trip_stops in this.stopTimes) {
        this.stopTimes[trip_stops].sort(this.compareStopTimes);
      }
      this.setupShapes();
    });
  }

  setupShapes() {
    fs.createReadStream('gtfs/shapes.txt')
      .pipe(stripBomStream())
      .pipe(csv())
      .on('data', (row) => {
        if (this.shapes[row.shape_id] == undefined) {
          this.shapes[row.shape_id] = [];
        }
        delete row.pickup_type;
        delete row.drop_off_type;
        delete row.stop_headsign;
        this.shapes[row.shape_id].push(row);
      })
      .on('end', () => {
        for (let shape in this.shapes) {
          this.shapes[shape].sort(this.compareShapes);
        }
        this.insertStations();
      });
  }

  compareShapes(a, b) {
    if (parseInt(a.shape_pt_sequence, 10) < parseInt(b.shape_pt_sequence, 10)) {
      return -1;
    }
    if (parseInt(a.shape_pt_sequence, 10) > parseInt(b.shape_pt_sequence, 10)) {
      return 1;
    }
    return 0;
  }

  compareStopTimes(a, b) {
    if (parseInt(a.stop_sequence, 10) < parseInt(b.stop_sequence, 10)) {
      return -1;
    }
    if (parseInt(a.stop_sequence, 10) > parseInt(b.stop_sequence, 10)) {
      return 1;
    }
    return 0;
  }

  requestCall() {
    if (!this.finishedSetup) {
      return;
    }
    let date = new Date();
    let currentDay = this.dates[date.getDay()];

    this.requestRest({
      method: 'GET',
      url: this.streamObject.trip_updates,
      encoding: null
    });

    for (const [key, service] of Object.entries(this.services)) {
      if (service[currentDay] == 1) {
        this.loopRoutes(service['routes']);
      }
    }
  }

  loopRoutes(routes) {
    let currentTime = new Date();
    currentTime.setFullYear(2001, 0, 1);

    for (const [routeId, routeTrips] of Object.entries(routes)) {
      for (let i = 0; i < routeTrips.length; i++) {
        let trip = routeTrips[i];
        // If route is currently occuring, look to publish it
        // TODO: also check for updated times effecting start/end
        if (currentTime >= routes[routeId][i].start_time && currentTime < routes[routeId][i].end_time) {
          this.publishTrip(trip);
        }
      }
    }
  }

  publishTrip(trip) {
    let currentTime = new Date();
    currentTime.setFullYear(2001, 0, 1);

    for (let i = 0; i < trip.path.length - 1; i++) {
      let lastIWithTime = 0;
      let currentNode = trip.path[i];

      if (currentNode.arrival_time != undefined && currentNode.arrival_time != '') {
        let arrivalTime = this.getArrivalTimeConsideringDelays(currentNode, trip.trip_id, currentNode.arrival_time);

        if (arrivalTime <= currentTime) {
          lastIWithTime = i;
        } else {
          this.calculatePathDetails(trip, trip.path, lastIWithTime, i);
          return;
        }
      }
    }
  }

  calculatePathDetails(trip, path, startI, endI) {
    let currentTime = new Date();
    currentTime.setFullYear(2001, 0, 1);

    let currentDate = new Date();

    let objectToSend = {};
    objectToSend.trip_id = trip.trip_id;
    objectToSend.route = [];

    objectToSend.route.push(this.getPointInDeltaByTime(trip.trip_id, path, startI, endI, currentTime));

    let longestInterval = new Date(currentTime.getTime());
    longestInterval.setSeconds(longestInterval.getSeconds() + this.streamObject.options.frequency);

    let finalI = startI;
    let finalNodeIsExactTimeMatch = false;

    let bottomI = startI;
    let topI = endI;

    for (let i = startI+1; i < path.length; i++) {
      let time;
      if (path[i].arrival_time != undefined && path[i].arrival_time != '') {
        bottomI = i;
        for (let j = bottomI + 1; j < path.length; j++) {
          if (path[j].arrival_time != undefined && path[j].arrival_time != '') {
            topI = j;
            break;
          } else if (j == path.length - 1) {
            topI = j;
          }
        }
        time = this.getArrivalTimeConsideringDelays(path[i], trip.trip_id, path[i].arrival_time);

      } else {
        time = this.getTimeInDeltaByPoint(trip.trip_id, path, bottomI, topI, i);
      }

      if (time <= currentTime) {
        continue;
      }

      if (time <= longestInterval) {
        if (time == longestInterval) {
          finalNodeIsExactTimeMatch = true;
        } else {
          finalNodeIsExactTimeMatch = false;
        }
        finalI = i;
        let actualTime = new Date(time);
        actualTime.setFullYear(currentDate.getFullYear(), currentDate.getMonth(), actualTime.getDate());
        actualTime.setDate(actualTime.getDate() + currentDate.getDate() - 1);

        objectToSend.route.push({ 'time': actualTime, 'longitude': path[i].shape_pt_lon, 'latitude': path[i].shape_pt_lat });
      } else {
        break;
      }
    }

    if (!finalNodeIsExactTimeMatch && finalI != path.length - 1) {
      objectToSend.route.push(this.getPointInDeltaByTime(trip.trip_id, path, bottomI, topI, longestInterval));
    }

    for (let zoom = MAX_ZOOM_DEPTH; zoom >= MIN_ZOOM_DEPTH; zoom--) {
      let zoomAmount = Math.pow(2, zoom);
      let lastCellLon = -1;
      let lastCellLat = -1;
      let currentMsgObject = {};
      currentMsgObject.trip_id = objectToSend.trip_id;
      currentMsgObject.route = [];
      for (let j = 0; j < objectToSend.route.length; j++) {
        let lon = parseFloat(objectToSend.route[j].longitude);
        let lat = parseFloat(objectToSend.route[j].latitude);

        let cellLon = Math.floor((180 + lon) / (180 / zoomAmount));
        let cellLat = Math.floor((90  + lat) / (90  / zoomAmount));
        if (lastCellLon === -1) {
          lastCellLon = cellLon;
          lastCellLat = cellLat;
        }

        currentMsgObject.route.push(objectToSend.route[j]);
        if (cellLon !== lastCellLon || cellLat !== lastCellLat || j === objectToSend.route.length - 1) {
          this.publish(currentMsgObject, ':' + zoom + ':' + lastCellLon + ':' + lastCellLat);

          currentMsgObject.route = [];
          if (j > 0) {
            currentMsgObject.route.push(objectToSend.route[j- 1]);
          }
          currentMsgObject.route.push(objectToSend.route[j]);
          lastCellLon = cellLon;
          lastCellLat = cellLat;
        }
      }
    }
  }

  getArrivalTimeConsideringDelays(node, tripID, time) {
   if (node.stop_sequence != undefined &&
      this.tripUpdates[tripID] != undefined &&
      this.tripUpdates[tripID][node.stop_sequence] !== undefined) {
        let updatedNodeDetails = this.tripUpdates[tripID][node.stop_sequence];
        if (updatedNodeDetails.arrival.time != undefined) {
          return new Date(this.tripUpdates[tripID][node.stop_sequence].arrival.time);
        } else if (updatedNodeDetails.arrival.delay != undefined) {
          return time + this.tripUpdates[tripID][node.stop_sequence].arrival.delay;
        }
    }
    return time;
  }

  getDepartureTimeConsideringDelays(node, tripID, time) {
    if (node.stop_sequence != undefined &&
      this.tripUpdates[tripID] !== undefined &&
      this.tripUpdates[tripID][node.stop_sequence] !== undefined) {
        let updatedNodeDetails = this.tripUpdates[tripID][node.stop_sequence];
        if (updatedNodeDetails.departure.time != undefined) {
          return new Date(this.tripUpdates[tripID][node.stop_sequence].departure.time);
        } else if (updatedNodeDetails.departure.delay != undefined) {
          return time + this.tripUpdates[tripID][node.stop_sequence].departure.delay;
        }
    }
    return time;
  }

  getPointInDeltaByTime(tripID, path, startI, endI, currentTime) {
    let currentDate = new Date();

    let startDist = parseFloat(path[startI].shape_dist_traveled);
    let endDist = parseFloat(path[endI].shape_dist_traveled);

    let startDepTime = this.getDepartureTimeConsideringDelays(path[startI], tripID, path[startI].departure_time);

    let endArrTime = this.getArrivalTimeConsideringDelays(path[endI], tripID, path[endI].arrival_time);

    let timePercent = this.getTimePercent(startDepTime, endArrTime, currentTime);

    let distTraveled = startDist + ((endDist - startDist) * timePercent);

    let priorI;
    if (startI >= path.length - 1) {
      priorI = startI - 1;
    } else {
      priorI = startI;
    }
    // Find what nodes the current vehicle's position lies between
    for (let i = startI; i < endI; i++) {
      let currentDist = parseFloat(path[i].shape_dist_traveled);
      if (currentDist > distTraveled) {
        if (i == 0) {
          priorI = 0;
        } else {
          priorI = i - 1;
        }
        break;
      }
    }
    let distBetweenNodes = parseFloat(path[priorI+1].shape_dist_traveled) - parseFloat(path[priorI].shape_dist_traveled);
    let distBetweenNodesPercent = Math.abs(distTraveled - parseFloat(path[priorI].shape_dist_traveled)) / distBetweenNodes;

    let startPosX = parseFloat(path[startI].shape_pt_lat);
    let endPosX   = parseFloat(path[endI].shape_pt_lat);

    let vehicleXPos = startPosX + ((endPosX - startPosX) * distBetweenNodesPercent);

    let startPosY = parseFloat(path[startI].shape_pt_lon);
    let endPosY   = parseFloat(path[endI].shape_pt_lon);
    let vehicleYPos = startPosY + ((endPosY - startPosY) * distBetweenNodesPercent);

    let actualTime = new Date(currentTime);
    actualTime.setFullYear(currentDate.getFullYear(), currentDate.getMonth(), actualTime.getDate());
    actualTime.setDate(actualTime.getDate() + currentDate.getDate() - 1);

    return { 'time': actualTime, 'longitude': vehicleYPos, 'latitude': vehicleXPos };
  }

  getTimeInDeltaByPoint(tripID, path, startI, endI, currentI) {
    let totalDistanceBetweenNodes = path[endI].shape_dist_traveled - path[startI].shape_dist_traveled;
    let currentDistanceBetweenNodes = path[currentI].shape_dist_traveled - path[startI].shape_dist_traveled;

    let percentBetweenNodes = parseFloat((currentDistanceBetweenNodes/totalDistanceBetweenNodes).toFixed(4));

    let startTime = this.getDepartureTimeConsideringDelays(path[startI], tripID, path[startI].departure_time);
    let endTime = this.getArrivalTimeConsideringDelays(path[endI], tripID, path[endI].arrival_time);
    return new Date(startTime.getTime() + (endTime - startTime) * percentBetweenNodes);
  }

  getTimePercent(startTime, endTime, currentTime) {
    let totalTime = endTime - startTime;

    let timePercent = 0;
    if (totalTime != 0) {
      timePercent = (currentTime - startTime) / totalTime;
    }
    return timePercent;
  }

  requestRest(source, action) {
    try {
      request(source, (error, response, body) => {
        if(response==null) {
          this.warning('Error in ' + this.streamObject.displayname + ': response was null');
        }
        else if(error || response.statusCode !== 200) {
          this.warning('Error in ' + this.streamObject.displayname + ': ' + error + ' & status is ' + response.statusCode);
        } else {
          let feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(body);

          let newUpdates = {};
          for (let i = 0; i < feed.entity.length; i++) {
            if (feed.entity[i].tripUpdate === undefined) {
              continue;
            }

            let update = feed.entity[i].tripUpdate;
            let tripID = update.trip.tripId;
            newUpdates[tripID] = {};

            for (let j = 0; j < update.stopTimeUpdate.length; j++) {
              let tripUpdate = update.stopTimeUpdate[j];

              newUpdates[tripID][tripUpdate.stopSequence] = tripUpdate;
            }
          }
          this.tripUpdates = newUpdates;
        }
      });
    } catch(error) {
      this.warning('Caught error in Request for object '  + this.streamObject.displayname + ': ' + error);
    }
  }

  publish(message, type) {
    this.ably.publish(message, this.streamObject.namespace + type, this.streamObject.options.hide_log);
  }
}
module.exports = GTFSCompleteObject;
