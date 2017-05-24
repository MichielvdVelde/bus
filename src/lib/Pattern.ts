import * as Helpers from './PatternHelpers'

export default class Pattern {
  static from (pattern: string): Pattern {
    return new Pattern(pattern)
  }

  private _pattern: string
  private _topic: string
  private _regex: RegExp
  private _fnParams: Function
  private _paramCount: number

  private constructor (pattern: string) {
    const tokens: Helpers.Token[] = Helpers.tokenize(pattern)

    this._pattern = pattern
    this._topic = Helpers.buildTopic(tokens)
    this._regex = Helpers.buildRegularExpression(tokens)
    this._fnParams = Helpers.buildParameterFunction(tokens)
    this._paramCount = Helpers.buildParameterCount(tokens)
  }

  /**
   * Gets an MQTT-compatible topic.
   */
  public getTopic (): string {
    return this._topic
  }

  /**
   * Gets the original pattern.
   */
  public getPattern (): string {
    return this._pattern
  }

  /**
   * Gets the parameter count.
   */
  public getParameterCount (): number {
    return this._paramCount
  }

  /**
   * Builds a parameterized topic for use by MQTT.
   */
  public buildParameterizedTopic (params: any): string {
    return this._pattern.split('/').map(token => {
      if (token[0] === '+') {
        const key:string = token.slice(1)
        if (key in params) return params[key]
      } else if (token[0] === '#') {
        const key:string = token.slice(1)
        if (key in params) {
          if (Array.isArray(params[key])) {
            return params[key].join('/')
          }
          return params[key]
        }
      }
      return token
    }).join('/')
  }

  /**
   * Matches a topic to the pattern.
   */
  public match (topic: string): RegExpExecArray {
    return this._regex.exec(topic)
  }

  /**
   * Gets the parameters for a match.
   */
  public getParameters (match: RegExpExecArray): any {
    return this._fnParams(match)
  }
}
