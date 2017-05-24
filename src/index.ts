import { EventEmitter } from 'events'
import * as mqtt from 'mqtt'

import { default as Pattern } from './lib/Pattern'

export interface IBusOptions extends mqtt.IClientOptions {
  //
}

export interface IConnackPacket extends mqtt.IConnackPacket {
  //
}

export interface IClientSubscribeOptions extends mqtt.IClientSubscribeOptions {
  //
}

export interface ISubscriptionGrant extends mqtt.ISubscriptionGrant {
  //
}

export interface IClientPublishOptions extends mqtt.IClientPublishOptions {
  //
}

export interface IPacket extends mqtt.IPacket {
  topic?: string
  payload?: Buffer|string
  params?: any
  isJson?: boolean
  json?: any
}

export enum Status {
  READY,
  CONNECTING,
  CONNECTED,
  RECONNECTING,
  OFFLINE,
  ERROR,
  CLOSED
}

export default class Bus extends EventEmitter {
  /**
   * Creates a new Bus instance.
   * @param  {any}         context  The context to bind events to
   * @param  {string}      clientId The client ID
   * @param  {string}      url      The broker URL
   * @param  {IBusOptions} opts     Client options
   * @return {Bus}                  A new Bus instance
   */
  public static create (context: any, clientId: string, url: string, opts?: IBusOptions): Bus {
    return new Bus(context, url, Object.assign({}, opts || {}, { clientId: clientId }))
  }

  private _context: any
  private _url: string
  private _opts: IBusOptions
  private _status: Status = Status.READY
  private _client: mqtt.Client = null
  private _messageEvents: EventEmitter = new EventEmitter()
  private _subscriptionLabels: Map<string, Pattern> = new Map()
  private _publicationLabels: Map<string, Pattern> = new Map()
  private _subscriptionTopics: string[] = []

  private constructor (context: any, url: string, opts: IBusOptions) {
    super()
    this._context = context
    this._url = url
    this._opts = opts
  }

  /**
   * Gets the client ID for this bus.
   * @return {string} The client ID
   */
  public getId (): string {
    return this._opts.clientId
  }

  /**
   * Gets the bus's status.
   * @return {Status} The bus's status
   */
  public getStatus (): Status {
    return this._status
  }

  /**
   * Checks to see if the bus is available.
   * @return {boolean} True if the bus is available
   */
  public isAvailable (): boolean {
    return this._client && this._client !== null
  }

  /**
   * Adds a message event listener for the given label. When an incoming message
   * topic is matched to a label, it will be emitted.
   * @param  {string}  label                The label
   * @param  {IPacket} fn                   The method to call
   * @param  {boolean} [bindToContext=true] Whether or not to bind the method to the context
   */
  public onLabel (label: string, fn: (packet: IPacket) => void, bindToContext: boolean = true): void {
    if (this._context && this._context !== null && bindToContext) fn = fn.bind(this._context)
    this._messageEvents.on(label, fn)
  }

  /**
   * Adds a once message event listener for the given label. When an incoming
   * message topic is matched to a label, it will be emitted.
   * @param  {string}  label                The label
   * @param  {IPacket} fn                   The method to call
   * @param  {boolean} [bindToContext=true] Whether or not to bind the method to the context
   */
  public onceLabel (label: string, fn: (packet: IPacket) => void, bindToContext: boolean = true): void {
    if (this._context && this._context !== null && bindToContext) fn = fn.bind(this._context)
    this._messageEvents.once(label, fn)
  }

  /**
   * Adds a pattern identified by `label`. This label can then be used to
   * publish messages on the topic pattern.
   * @param  {string}        label   The label
   * @param  {string}        pattern The topic pattern
   * @return {Promise<null>}         Resolves on success
   */
  public addPattern (label: string, pattern: string): Promise<null> {
    return new Promise((resolve, reject) => {
      if (this._publicationLabels.has(label)) {
        return reject(new Error(`addPattern: label already in use (${label})`))
      }

      let _pattern: Pattern
      try {
        _pattern = Pattern.from(pattern)
      } catch (e) {
        return reject(e)
      }

      this._publicationLabels.set(label, _pattern)
      resolve()
    })
  }

  /**
   * Connects to the broker.
   * @return {Promise<IConnackPacket>} Connection acknowledge info
   */
  public connect (): Promise<IConnackPacket> {
    return new Promise((resolve, reject) => {
      if (this.isAvailable()) {
        return reject(new Error('connect: bus already available'))
      }

      const onConnect = (connack: IConnackPacket): void => {
        this._setStatus(Status.CONNECTED, false)
        this._client.removeListener('error', onError)
        this._addEventListeners()
        resolve(connack)
      }

      const onError = (err: Error) => {
        this._setStatus(Status.ERROR, false)
        this._client.removeListener('connect', onConnect)
        this._client = null
        reject(err)
      }

      this._setStatus(Status.CONNECTING, false)
      this._client = mqtt.connect(this._url, this._opts)
      this._client.once('connect', onConnect)
      this._client.once('error', onError)
    })
  }

  /**
   * Closes the connection with the broker.
   * @param  {boolean}       [force=false] Don't wait for in-flight messages to be acked
   * @param  {boolean}       [reset=false] Reset the bus so it can be re-used
   * @return {Promise<null>}               Resolves on success
   */
  public end (force: boolean = false, reset: boolean = false): Promise<null> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) {
        return reject(new Error('end: bus not available'))
      }

      this._client.end(force, () => {
        if (!reset) return resolve()
        this.reset().then(resolve).catch(reject)
      })
    })
  }

  /**
   * Subscribe to a topic `pattern` identified by `label`.
   * @param  {string}                           label   The label
   * @param  {string}                           pattern The topic pattern
   * @param  {IClientSubscribeOptions}          opts    The options (optional)
   * @return {Promise<mqtt.ISubscriptionGrant>}         Resolves on success
   */
  public subscribe (label: string, pattern: string, opts?: IClientSubscribeOptions): Promise<ISubscriptionGrant> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) {
        return reject(new Error('subscribe: bus not available'))
      } else if (this._subscriptionLabels.has(label)) {
        return reject(new Error(`subscribe: label already in use (${label})`))
      }

      let _pattern: Pattern
      try {
        _pattern = Pattern.from(pattern)
      } catch (e) {
        return reject(e)
      }

      if (_pattern.getTopic() in this._subscriptionTopics) {
        return reject(new Error(`subscribe: already subscribed to topic (${_pattern.getTopic()})`))
      }

      this._client.subscribe(_pattern.getTopic(), opts, (err, granted) => {
        if (err) return reject(err)
        this._subscriptionLabels.set(label, _pattern)
        this._subscriptionTopics.push(_pattern.getTopic())
        resolve(granted)
      })
    })
  }

  /**
   * Unsubscribes from a topic identified by `label`. Optionally removes all
   * listeners for the label.
   * @param  {string}        label                  The label
   * @param  {boolean}       [removeListeners=true] Whether or not to remove this label's listeners
   * @return {Promise<null>}                        Resolves on success
   */
  public unsubscribe (label: string, removeListeners: boolean = true): Promise<null> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) {
        return reject(new Error('unsubscribe: bus not available'))
      } else if (!this._subscriptionLabels.has(label)) {
        return reject(new Error(`unsubscribe: unknown label (${label})`))
      }

      const pattern: Pattern = this._subscriptionLabels.get(label)
      this._client.unsubscribe(pattern.getTopic(), err => {
        if (err) return reject(err)
        this._subscriptionLabels.delete(label)
        this._subscriptionTopics.splice(this._subscriptionTopics.indexOf(pattern.getTopic()), 1)
        if (removeListeners) this._messageEvents.removeAllListeners(label)
        resolve()
      })
    })
  }

  /**
   * Publishes the `payload` on the topic pattern identified by `label`.
   * @param  {string}                              label   The label
   * @param  {any}                                 params  Parameters to build the topic with
   * @param  {any}                                 payload The message payload
   * @param  {IClientPublishOptions}               opts    Options (optional)
   * @return {Promise<IClientPublishOptions>}              Resolves on success
   */
  public publish (label: string, params: any, payload: any, opts?: IClientPublishOptions): Promise<IPacket> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) {
        return reject(new Error('publish: bus not available'))
      } else if (!this._publicationLabels.has(label)) {
        return reject(new Error(`publish: unknown label (${label})`))
      }

      const pattern: Pattern = this._publicationLabels.get(label)
      const paramCount: number = Object.keys(params).length
      if (paramCount !== pattern.getParameterCount()) {
        return reject(new Error(`publish: wrong parameter count, got ${paramCount}, expected ${pattern.getParameterCount()}`))
      }

      // Stringify possible JSON
      if (typeof payload === 'object' || Array.isArray(payload)) {
        payload = JSON.stringify(payload)
      }

      const topic: string = pattern.buildParameterizedTopic(params)
      this._client.publish(topic, payload, opts || {}, err => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  /**
   * Resets the bus so it can be reused. It removes all subscriptions, publication
   * labels and message events.
   * @return {Promise<null>} Resolves on success
   */
  public reset (): Promise<null> {
    return new Promise((resolve, reject) => {
      if(this._status !== Status.CLOSED || (this._client && (this._client.connected || this._client.reconnecting))) {
        return reject(new Error('unable to reset, end connection first'))
      }

      this._messageEvents.removeAllListeners()
      this._subscriptionLabels.clear()
      this._publicationLabels.clear()
      this._subscriptionTopics = []
      this._client = null
      this._setStatus(Status.READY)
    })
  }

  /**
   * Adds all the necessary event emitters to the underlying MQTT client.
   */
  private _addEventListeners (): void {
    this._client.on('connect', () => { this._setStatus(Status.CONNECTED) })
    this._client.on('reconnect', () => { this._setStatus(Status.RECONNECTING) })
    this._client.on('offline', () => { this._setStatus(Status.OFFLINE) })
    this._client.on('close', () => { this._setStatus(Status.CLOSED) })
    this._client.on('error', err => { this._setStatus(Status.ERROR) })

    this._client.on('message', (topic: string, message: string, packet: IPacket) => {
      packet.isJson = false
      try {
        packet.json = JSON.parse(Buffer.isBuffer(packet.payload)
          ? packet.payload.toString()
          : packet.payload)
        packet.isJson = true
      } catch (e) { }

      this._handleMessagePacket(packet)
    })
  }

  /**
   * Handles a single message.
   * @param {IPacket} packet The message packer
   */
  private _handleMessagePacket (packet: IPacket): void {
    for (let [ label, pattern ] of this._subscriptionLabels) {
      const match: RegExpExecArray = pattern.match(packet.topic)
      if (match) {
        packet.params = pattern.getParameters(match)
        this._messageEvents.emit(label, packet)
        break
      }
    }
  }

  /**
   * Sets the status for the bus.
   * @param {Status} status The new status
   */
  private _setStatus (status: Status, emitStatus: boolean = true): void {
    this._status = status
    if (emitStatus) this.emit('statusChanged', this._status)
  }
}
