# bus

**bus** provides a high-level way to work with MQTT. Under the hood it uses
the excellent [MQTT.js](https://github.com/mqttjs/MQTT.js) module.

This module is written using TypeScript. It is currently a work-in-progress and
as such is not published on npm (yet). This documentation will be updated
accordingly.

## Quick Example

> These examples assume you have downloaded the files directly or cloned this repo

### Instantiating, connecting and subscribing

```ts
import Bus from './bus'

// First argument is an (optional) context to bind `onLabel` and `onceLabel` to
const Bus: Bus = Bus.create(null, 'my-client-id', 'mqtt://localhost')

bus.connect().then(() => {
  // This function will be called each time `statusUpdate` is received
  // By not using an arrow function `bus` can bind it to the context given in
  // `Bus.create`
  bus.onLabel('statusUpdate', function (packet) {
    console.log(`Device ${packet.params.deviceId} is now ${packet.payload}`)
  })

  // Create the label `statusUpdate` for the given topic
  return bus.subscribe('statusUpdate', 'devices/+deviceId/status')
})
```

### Publishing

```ts
// Add a topic pattern with the given label
// #keys at the end is a parameteraized wildcard
bus.addPattern('updateConfig', 'devices/my-device/config/#keys')

// This will send the word 'online' to devices/my-device/config/status
bus.publish('updateConfig', { keys: [ 'status' ] }, 'online')
```

## To Do

This list is not exhaustive and my change at any moment.

- Catch possible thrown error by `params` in `bus.publish()`
- Find a good name for `bus.onLabel` and `bus.onceLabel` and `bus.addPattern`
- Improve `bus.isAvailable()` so the correct statuses are taken into account
- Better handling of the mqtt.js `error` event in `bus._addEventListeners()`

## Done

- De-promisify `bus.addPattern()`

## Inspired by

- [MQTT.js](https://github.com/mqttjs/MQTT.js), which this module uses under the hood
- [mqtt-regex](https://github.com/RangerMauve/mqtt-regex), whose support for parameterized
topics is integrated

## License

Copyright 2017 [Michiel van der Velde](http://www.michielvdvelde.nl).

This software is licensed under the [MIT License](LICENSE).
