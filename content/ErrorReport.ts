declare const window: any
declare const document: any
declare const Components: any
declare const Zotero: any
declare const Services: any

import { Preferences as Prefs } from './prefs'
import { Translators } from './translators'
import { debug } from './debug'
// import { createFile } from './create-file'
import { Logger } from './logger'
import fastChunkString = require('fast-chunk-string')

const s3 = require('./s3.json')

const PACKAGE = require('../package.json')

Components.utils.import('resource://gre/modules/Services.jsm')

const kB = 1024
const MB = kB * kB

export = new class ErrorReport {
  private chunkSize
  private previewSize = 3 * kB // tslint:disable-line:no-magic-numbers binary-expression-operand-order

  private key: string
  private timestamp: string
  private bucket: string
  private params: any

  private errorlog: {
    info: string,
    errors: string,
    zotero: string | string[],
    bbt: string | string[],
    references?: string,
    db?: string
  }

  constructor() {
    window.addEventListener('load', () => this.init(), false)
  }

  public async send() {
    const wizard = document.getElementById('better-bibtex-error-report')
    wizard.getButton('next').disabled = true
    wizard.getButton('cancel').disabled = true
    wizard.canRewind = false

    try {
      const logs = [
        this.submit('zotero', 'text/plain', this.errorlog.zotero, `${this.errorlog.info}\n\n${this.errorlog.errors}\n\n`),
        this.submit('bbt', 'text/plain', this.errorlog.bbt),
        // this.submit('db', 'application/json', this.errorlog.db)
      ]
      if (this.errorlog.references) logs.push(this.submit('references', 'application/json', this.errorlog.references))
      await Zotero.Promise.all(logs)
      wizard.advance()

      document.getElementById('better-bibtex-report-id').value = this.key
      document.getElementById('better-bibtex-report-result').hidden = false
    } catch (err) {
      const ps = Components.classes['@mozilla.org/embedcomp/prompt-service;1'].getService(Components.interfaces.nsIPromptService)
      ps.alert(null, Zotero.getString('general.error'), `${err} (${this.key}, references: ${!!this.errorlog.references})`)
      if (wizard.rewind) wizard.rewind()
    }
  }

  public show() {
    const wizard = document.getElementById('better-bibtex-error-report')

    if (wizard.onLastPage) wizard.canRewind = false
    else if (wizard.pageIndex === 0) wizard.canRewind = false
    else if (wizard.pageIndex === 1 && (Zotero.Debug.enabled || Logger.enabled)) wizard.canRewind = false
    else wizard.canRewind = true
  }

  public restartWithDebugEnabled() {
    const ps = Services.prompt
    const buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING
        + ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL
        + ps.BUTTON_POS_2 * ps.BUTTON_TITLE_IS_STRING
    const index = ps.confirmEx(
      null,
      Zotero.getString('zotero.debugOutputLogging'),
      Zotero.getString('zotero.debugOutputLogging.enabledAfterRestart', [Zotero.clientName]),
      buttonFlags,
      Zotero.getString('general.restartNow'),
      null, Zotero.getString('general.restartLater'), null, {}
    )

    if (index !== 1) Zotero.Prefs.set('debug.store', true)

    if (index === 0) Zotero.Utilities.Internal.quit(true)
  }

  private async init() {
    const wizard = document.getElementById('better-bibtex-error-report')

    if (Zotero.Debug.enabled || Logger.enabled) wizard.pageIndex = 1

    const continueButton = wizard.getButton('next')
    continueButton.disabled = true

    // configure debug logging
    const debugLog = {
      chunkSize: null,
      region: null,
    }
    const m = Prefs.get('debugLog').match(/^([-a-z]+[0-9]?)|([-a-z]+[0-9]?)\.([0-9]+)|([0-9]+)$/)
    if (m) {
      debugLog.region = m[1] || m[2] // tslint:disable-line:no-magic-numbers
      debugLog.chunkSize = parseInt(m[3] || m[4] || 0)  // tslint:disable-line:no-magic-numbers
    }

    this.chunkSize = (debugLog.chunkSize || 10) * MB // tslint:disable-line:no-magic-numbers
    debug('ErrorReport.debuglog:', m, debugLog, this.chunkSize)

    const regions = []
    for (const candidate of PACKAGE.bugs.logs.regions) {
      const started = Date.now()
      try {
        await Zotero.HTTP.request('GET', `http://s3.${candidate}.amazonaws.com/ping`)
        regions.push({region: candidate, ping: ((candidate === debugLog.region) ? -1 : 1) * (Date.now() - started), ...s3[candidate]})
      } catch (err) {
        debug('ErrorReport.ping: could not reach', candidate, err)
      }
    }

    this.params = window.arguments[0].wrappedJSObject

    this.timestamp = (new Date()).toISOString().replace(/\..*/, '').replace(/:/g, '.')

    debug('ErrorReport.log:', Zotero.Debug.count())
    this.errorlog = {
      info: await this.info(),
      errors: Zotero.getErrors(true).join('\n'),
      zotero: Zotero.Debug.getConsoleViewerOutput(),
      bbt: Logger.output(),
      // db: Zotero.File.getContents(createFile('_better-bibtex.json')),
    }

    if (Zotero.BetterBibTeX.ready && this.params.items) {
      await Zotero.BetterBibTeX.ready

      debug('ErrorReport::init items', this.params.items.length)
      this.errorlog.references = await Translators.translate(Translators.byLabel.BetterBibTeXJSON.translatorID, {exportNotes: true}, this.params.items)
      debug('ErrorReport::init references', this.errorlog.references.length)
    }

    debug('ErrorReport.init:', Object.keys(this.errorlog))
    document.getElementById('better-bibtex-error-context').value = this.errorlog.info
    document.getElementById('better-bibtex-error-errors').value = this.errorlog.errors
    document.getElementById('better-bibtex-error-zotero').value = this.preview(this.errorlog.zotero)
    document.getElementById('better-bibtex-error-bbt').value = this.preview(this.errorlog.bbt)
    if (this.errorlog.references) document.getElementById('better-bibtex-error-references').value = this.preview(this.errorlog.references)
    document.getElementById('better-bibtex-error-tab-references').hidden = !this.errorlog.references

    const current = require('../gen/version.js')
    document.getElementById('better-bibtex-report-current').value = Zotero.BetterBibTeX.getString('ErrorReport.better-bibtex.current', { version: current })

    let latest = PACKAGE.xpi.releaseURL.replace('https://github.com/', 'https://api.github.com/repos/').replace(/\/releases\/.*/, '/releases/latest')
    debug('ErrorReport.current:', latest)
    latest = JSON.parse((await Zotero.HTTP.request('GET', latest)).responseText).tag_name.replace('v', '')
    debug('ErrorReport.current:', latest)
    const show_latest = document.getElementById('better-bibtex-report-latest')
    if (current === latest) {
      show_latest.hidden = true
    } else {
      show_latest.value = Zotero.BetterBibTeX.getString('ErrorReport.better-bibtex.latest', { version: latest })
      show_latest.hidden = false
    }

    regions.sort((a, b) => a.ping - b.ping)
    const region = regions[0]
    const postfix = region.short
    this.bucket = `http://${PACKAGE.bugs.logs.bucket}-${postfix}.s3-${region.region}.amazonaws.com${region.tld}`
    this.key = `${Zotero.Utilities.generateObjectKey()}-${postfix}`
    debug('ErrorReport.ping:', regions, this.bucket, this.key)

    continueButton.disabled = false
    continueButton.focus()
  }

  private preview(log) {
    if (Array.isArray(log)) {
      let preview = ''
      for (const line of log) {
        if (line.startsWith('(4)(+')) continue // DB statements

        preview += line + '\n'
        if (preview.length > this.previewSize) return preview + ' ...'
      }

      return preview

    } else if (log.length > this.previewSize) {
      return log.substr(0, this.previewSize) + ' ...'

    }

    return log
  }

  // general state of Zotero
  private async info() {
    let info = ''

    const appInfo = Components.classes['@mozilla.org/xre/app-info;1'].getService(Components.interfaces.nsIXULAppInfo)
    info += `Application: ${appInfo.name} ${appInfo.version} ${Zotero.locale}\n`
    info += `Platform: ${Zotero.platform} ${Zotero.oscpu}\n`

    const addons = await Zotero.getInstalledExtensions()
    if (addons.length) {
      info += 'Addons:\n'
      for (const addon of addons) {
        info += `  ${addon}\n`
      }
    }

    info += 'Settings:\n'
    const prefs = []
    for (const key of Prefs.branch.getChildList('')) {
      prefs.push(key)
    }
    for (const key of prefs.sort()) {
      info += `  ${key} = ${JSON.stringify(Prefs.get(key))}\n`
    }
    for (const key of ['export.quickCopy.setting']) {
      info += `  Zotero: ${key} = ${JSON.stringify(Zotero.Prefs.get(key))}\n`
    }

    return info
  }

  private async submit(filename, contentType, data, prefix = '') {
    const started = Date.now()
    debug('Errorlog.submit:', filename)

    const headers = {
      'x-amz-storage-class': 'STANDARD',
      'x-amz-acl': 'bucket-owner-full-control',
      'Content-Type': contentType,
    }

    let ext = ''
    switch (contentType) {
      case 'text/plain':
        ext = 'txt'
        break

      case 'application/json':
        ext = 'json'
        break
    }

    const url = `${this.bucket}/${this.key}-${this.timestamp}/${this.key}-${filename}`

    const isArray = Array.isArray(data)
    debug('ErrorReport.submit:', { filename, contentType, length: data.length, isArray })

    let chunks = []
    if (Array.isArray(data)) {
      let chunk = prefix
      for (const line of data) {
        if (filename === 'zotero' && line.startsWith('(4)(+')) continue // DB statements

        if ((chunk.length + line.length) > this.chunkSize) {
          if (chunk.length !== 0) chunks.push(chunk)
          chunk = line + '\n'

        } else {
          chunk += line + '\n'

        }
      }
      if (chunk.length) chunks.push(chunk)

    } else {
      chunks = fastChunkString(prefix + data, { size: this.chunkSize })

    }

    chunks = chunks.map((chunk, n) => ({ n: '.' + (n + 1).toString().padStart(4, '0'), body: chunk })) // tslint:disable-line:no-magic-numbers
    if (chunks.length === 1) chunks[0].n = ''

    await Promise.all(chunks.map(chunk => Zotero.HTTP.request('PUT', `${url}${chunk.n}.${ext}`, {
      body: chunk.body,
      headers,
      dontCache: true,
    })))

    debug('Errorlog.submit:', filename, Date.now() - started)
  }
}

// otherwise this entry point won't be reloaded: https://github.com/webpack/webpack/issues/156
delete require.cache[module.id]
