const matchOperatorsRe: RegExp = /[|\\{}()[\]^$+*?.]/g

/**
 * Represents a token.
 */
export interface Token {
  type: TokenTypes,
  name?: string,
  piece: string,
  last: string
}

/**
 * Represents the supported token types.
 */
export enum TokenTypes {
  SINGLE,
  MULTI,
  RAW
}

/**
 * Tokenizes the pattern and returns the tokens.
 */
export function tokenize (pattern: string): Token[] {
  return pattern.split('/').map(processToken)
}

/**
 * Builds the regular expression for the pattern.
 */
export function buildRegularExpression (tokens: Token[]): RegExp {
  const regexStr:string = tokens.reduce((acc, token, index) => {
    const isLast: boolean = (index == (tokens.length - 1))
    const beforeMulti: boolean = (index === (tokens.length - 2)) && (getLastItem(tokens).type == TokenTypes.MULTI)
    return acc + ((isLast || beforeMulti) ? token.last : token.piece)
  }, '')

  return new RegExp(`^${regexStr}$`)
}

/**
 * Builds the function to exract parameters from the pattern.
 */
export function buildParameterFunction (tokens: Token[]): Function {
  return function (results: string[]) {
    const captureTokens: Token[] = removeRawTokens(tokens)
    let params: any = {}

    if (!results) return params
    results.slice(1).forEach((capture, index) => {
      const token: Token = captureTokens[index]
      let param: any = capture

      if (!token.name) {
        return
      } else if (token.type === TokenTypes.MULTI) {
        param = capture.split('/')
        if (!getLastItem(param)) {
          param = removeLastItem(param)
        }
      } else if (getLastItem(capture) === '/') {
        param = removeLastItem(capture)
      }

      params[token.name] = param
    })
    return params
  }
}

/**
 * Returns the amount of parameters.
 */
export function buildParameterCount (tokens: Token[]) {
  return tokens.filter(token => {
    return token.type !== TokenTypes.RAW && token.name && token.name.length > 0
  }).length
}

/**
 * Processes a token.
 */
function processToken (token: string, index: number, tokens: string[]): Token {
  const last: boolean = (index === (tokens.length - 1))
  if (token[0] === '+') {
    return processSingle(token)
  } else if (token[0] === '#') {
    return processMulti(token, last)
  } else {
    return processRaw(token)
  }
}

/**
 * Processes a single (+) token.
 */
function processSingle (token: string): Token {
  return {
    type: TokenTypes.SINGLE,
    name: token.slice(1),
    piece: '([^/#+]+/)',
    last: '([^/#+]+/?)'
  }
}

/**
 * Processes a multi (#) token.
 */
function processMulti (token: string, last: boolean): Token {
  if (!last) throw new Error("# wildcard must be at the end of the pattern")
  return {
    type: TokenTypes.MULTI,
    name: token.slice(1),
    piece: '((?:[^/#+]+/)*)',
    last: '((?:[^/#+]+/?)*)'
  }
}

/**
 * Processes a raw token.
 */
function processRaw (token: string): Token {
  token = escapeStringRegexp(token)
  return {
    type: TokenTypes.RAW,
    piece: `${token}/`,
    last: `${token}/?`
  }
}

/**
 * Escapes a regular expression in the form of a string.
 * https://github.com/sindresorhus/escape-string-regexp
 */
function escapeStringRegexp (str: string): string {
  return str.replace(matchOperatorsRe, '\\$&')
}

/**
 * Creates a clean topic for MQTT to consume.
 */
export function buildTopic (tokens: Token[]): string {
  return tokens.map(token => {
    switch (token.type) {
      case TokenTypes.RAW:
        return token.piece.slice(0, -1)
      case TokenTypes.SINGLE:
        return '+'
      case TokenTypes.MULTI:
        return '#'
    }
  }).join('/')
}

/**
 * Gets the last item from an array.
 */
function getLastItem (items: any): any {
  return items[items.length - 1]
}

/**
 * Removes the last item from an array.
 */
function removeLastItem (items: any): any {
  return items.slice(0, items.length - 1)
}

/**
 * Removes all raw type tokens.
 */
function removeRawTokens (tokens: Token[]): Token[] {
  return tokens.filter((token) => {
    return token.type !== TokenTypes.RAW
  })
}
