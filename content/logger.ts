declare const Zotero: any

import stringify = require('json-stringify-safe')

// export singleton: https://k94n.com/es6-modules-single-instance-pattern
export let Logger = new class { // tslint:disable-line:variable-name
  public errors = false

  private timestamp: number
  private _trigger: number
  // `n` seconds after `change` is reset, log messages as errors
  private too_long = 30 * 1000 // tslint:disable-line:no-magic-numbers

  public trigger() {
    this._trigger = Date.now()
  }

  public log(prefix, ...msg) {
    const working = typeof this._trigger === 'undefined' ? 0 : Date.now() - this._trigger

    if (working > this.too_long) {
      this.errors = true
      this._log(Zotero.logError, `${working} >> ${prefix}`, msg)
    } else if (Zotero.Debug.enabled) {
      this._log(Zotero.debug, prefix, msg)
    }
  }

  public error(prefix, ...msg) {
    this.errors = true
    this._log(Zotero.logError, `${prefix}!`, msg)
  }

  public _log(logger, prefix, msg) {
    let diff = null
    const now = Date.now()
    if (this.timestamp) diff = now - this.timestamp
    this.timestamp = now

    if (typeof msg !== 'string') {
      let _msg = ''
      for (const m of msg) {
        const type = typeof m
        if (type === 'string' || m instanceof String || type === 'number' || type === 'undefined' || type === 'boolean' || m === null) {
          _msg += m
        } else if (m instanceof Error) {
          _msg += `<Error: ${m.message || m.name}${m.stack ? `\n${m.stack}` : ''}>`
        } else if (m && type === 'object' && m.message) { // mozilla exception, no idea on the actual instance type
          // message,fileName,lineNumber,column,stack,errorCode
          _msg += `<Error: ${m.message}#\n${m.stack}>`
        } else {
          _msg += stringify(m)
        }

        _msg += ' '
      }
      msg = _msg
    }

    logger(`{${prefix} +${diff}} ${msg}`)
  }
}
