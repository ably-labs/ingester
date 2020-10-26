const mqtt             = require('mqtt')
const yaml             = require('js-yaml');
const fs               = require('fs');
const BaseStreamObject = require('./baseStreamObject');
const jsrp             = require('@apidevtools/json-schema-ref-parser');
const Ajv              = require('ajv');
const asyncapi         = require('@asyncapi/specs/schemas/2.0.0');
const MQTTPattern      = require("mqtt-pattern");

class AsyncapimqttObject extends BaseStreamObject {
  constructor(element) {
    super(element);
    try {
      this.spec = yaml.safeLoad(fs.readFileSync(this.streamObject.source, 'utf8'));
    } catch (e) {
      this.error(e);
    }

    this.setupValidator();
    this.setupServer(this.spec.servers);
    this.setupChannels(this.spec.channels);
  }

  async setupValidator() {
    let schemaAjv = new Ajv({
      allErrors: true
    });
    let validate = schemaAjv.compile(asyncapi);
    let valid = validate(this.spec);
    if (!valid) {

      this.error('Invalid AsyncAPI spec provided');
    }
    this.dereferencedSpec = await this.parseSpec(this.spec);

    this.convertChannelsInDereferencedSpec();
  }

  setupServer(servers) {
    for (let server in servers) {
      let serverObj = servers[server];
      if (serverObj.protocol === 'secure-mqtt' || serverObj.protocol === 'mqtt') {
        this.endpoint = this.setupWithVariables(serverObj.url, serverObj.variables);
        return;
      }
    }

    this.error('Invalid server for MQTT in spec');
  }

  async parseSpec() {
    try {
      const options = {
        parse: {
          yaml: {
            allowEmpty: false
          },
          text: false,
          binary: false
        },
        dereference: {
          circular: 'ignore'
        }
      };
      return jsrp.dereference(this.spec, options);
    } catch (err) {
     this.error('Failed to dereference AsyncAPI Spec');
    }
  }

  /* This replaces any variable insertions with wildcards */
  convertChannelsInDereferencedSpec() {
    for (let channel in this.dereferencedSpec.channels) {
      let newChannel = channel.replace(/{.+?}/g, '+');
      if (newChannel != channel) {
        this.dereferencedSpec.channels[newChannel] = this.dereferencedSpec.channels[channel];
        delete this.dereferencedSpec.channels[channel];
      }
    }
  }

  setupChannels(channels) {
    this.channels = {};

    for (let channel in channels) {
      let channelObj = channels[channel];
      if (channelObj.subscribe != undefined) {
        this.channels[this.setupWithParameters(channel, channelObj.parameters)] = channelObj.operationId;
      }
    }

    if (this.channels.length == 0) {
      this.error('No valid channels found to subscribe to');
    }
  }

  setupWithVariables(stringWithVars, variables) {
    let newString = stringWithVars;

    for (let key in variables) {
      if (variables[key].default != null) {
        newString = newString.replace('{' + key + '}', variables[key].default);
      }
    }

    return newString;
  }

  setupWithParameters(stringWithParams, parameters) {
    let newString = stringWithParams;

    for (let key in parameters) {
      newString = newString.replace('{' + key + '}', '+');
    }

    return newString;
  }

  watch() {
    this.client = mqtt.connect(this.endpoint);
    this.client.on('error', (err) => {
      this.error(err);
    });

    this.subscribe();
    this.listen();
    this.on = true;
  }

  subscribe() {
    this.client.on('connect', () => {
      for (let channel in this.channels) {
        this.client.subscribe(channel, (err) => {
          if (err) {
            this.error('Failed to subscribe to ' + channel + ' due to error: ' + err);
          }
        });
      }
    });
  }

  listen() {
    this.client.on('message', (topic, message) => {
      let jsonMsg = JSON.parse(message.toString());

      let potentialMatches = [];

      for (let channel in this.dereferencedSpec.channels) {
        if (MQTTPattern.exec(channel, topic) != null) {
          potentialMatches.push(channel);
        }
      }

      if (this.dereferencedSpec.channels[topic] != null) {
        let message = this.dereferencedSpec.channels[topic].subscribe.message;
        this.sendMessage(jsonMsg, message, topic);
      } else {
        for (let i = 0; i < potentialMatches.length; i++) {
          let message = this.dereferencedSpec.channels[potentialMatches[i]].subscribe.message;
          this.sendMessage(jsonMsg, message, topic);
        }
      }
    });
  }

  sendMessage(jsonMsg, message, topic) {
    let payloadSchema;
    if (message.payload !== undefined) {
      payloadSchema = message.payload;
      if (this.isValid(message.payload[i], jsonMsg)) {
         this.publishToAbly(topic.replace(/\//g, ':').replace(/^:/, ''), jsonMsg);
         return;
      }
    } else if (message.oneOf !== undefined) {
      for (let i = 0; i < message.oneOf.length; i++) {
        if (this.isValid(message.oneOf[i], jsonMsg)) {
           this.publishToAbly(topic.replace(/\//g, ':').replace(/^:/, ''), jsonMsg);
           return;
        }
      }
    } else if (message.anyOf !== undefined) {
      for (let i = 0; i < message.anyOf.length; i++) {
        if (this.isValid(message.anyOf[i], jsonMsg)) {
           this.publishToAbly(topic.replace(/\//g, ':').replace(/^:/, ''), jsonMsg);
           return;
        }
      }
    }
  }

  isValid(schema, msg) {
    let messageAjv = new Ajv({ allErrors: true });
    let validator = messageAjv.compile(schema);

    if(validator(msg)) {
      return true;
    }
    return false;
  }

  hasChild(obj) {
    return !!Object.keys(obj).length;
  }

  publishToAbly(channel, message) {
    this.ably.publish(message, channel);
  }

  stop() {
    this.client.end();
    this.on = false;
  }
}

module.exports = AsyncapimqttObject;
