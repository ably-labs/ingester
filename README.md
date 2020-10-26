# Ably Ingester

This tool is intended for getting various sources, regardless of protocol or structure, into Ably.

## Configuration setup

In order to use the ingester, you need to define what sort of source you intend to ingest from from the available objects, and define the various required settings. This object should be stored in the environment of your project by the name of `SOURCE_CONFIG`, and should be in a JSON format. An example config would be:

```
{
  "namespace": "bus", // This defines the namespace in your Ably App the ingester will use
  "type": "mqtt", // This defines the Ingester Object to use
  "options": {
    "ably_options": { // All objects should contain an ably_options field, which allows you to define as many ably keys and settings as you'd like to be published in to
      "production": {
        "key": "INSERT_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

If you're running this locally, you can put this into a `.env` file. If you're going to run this as a pod in a kubernetes cluster, you can instead have this stored in a ConfigMap. Examples of using a ConfigMap are in the `samples` folder.

The currently supported types are:

### asyncmqtt

Consuming from an MQTT endpoint using an AsyncAPI spec to define the endpoints and channels to use. Messages can also be validated based on the AsyncAPI spec used.

#### asyncmqtt config json

```
{
  "namespace": "bus", // This defines the namespace in your Ably App the ingester will use
  "type": "mqtt", // This defines the Ingester Object to use
  "source": "sample_spec.yaml" // The AsyncAPI spec to be used. Currently only supports local specs
  "options": {
    "ably_options": { // All objects should contain an ably_options field, which allows you to define as many ably keys and settings as you'd like to be published in to
      "production": {
        "key": "INSERT_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

## Using the Ingester

You can either run the ingester locally, or as a kubernetes pod.

### Using the Ingester locally

Firstly, install the required npm modules with:

`npm install`

Once they're downloaded, run this repo with:

`node index.js`

### Using the Ingester as a kubernetes pod

If you wish to use one of the existing tools, you can pull from Docker Hub with `docker pull tomably/ingester:latest` to get the most recent version.

If you want to make changes to match your own requirements, you can build this into a docker image with `docker build .`. Once you've built the image, you can name it however you wish and store it on whatever service you like.

Next, you'll need to create a file to define the pod, and the config details. You can find examples of this in `/samples`. Once you've done that, you can use it to run the docker container using whatever kubernetes platform you'd like.
