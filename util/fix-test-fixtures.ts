#!/usr/bin/env node

import * as fs from 'fs'
import * as glob from 'glob'
import * as path from 'path'
import { sortify } from 'sorted-json'

import { upgradeExtra } from '../content/db/upgrade'

const root = path.join(__dirname, '..')

const preferences = Object.keys(require(path.join(root, 'gen/preferences/preferences.json')))

for (const lib of glob.sync('test/fixtures/*/*.json', { cwd: root, absolute: true })) {
  if (lib.endsWith('.csl.json') || lib.endsWith('.schomd.json')) continue
  
  const data = require(lib)
  let resave = null
  if (!data.items) throw new Error(`${lib} is not a library`)

  if (data.config && data.config.preferences) {
    if (data.config.preferences.jabrefGroups) {
      data.config.preferences.jabrefFormat = data.config.preferences.jabrefGroups
      resave = 'jabrefGroups'
    }

    if (data.config.preferences.preserveBibTeXVariables) {
      data.config.preferences.exportBibTeXStrings = data.config.preferences.preserveBibTeXVariables ? 'detect' : 'off'
      resave = 'preserveBibTeXVariables'
    }

    if (Array.isArray(data.config.preferences.skipWords)) {
      data.config.preferences.skipWords = data.config.preferences.skipWords.join(',')
      resave = 'skipWords'
    }

    if (Array.isArray(data.config.preferences.skipFields)) {
      data.config.preferences.skipFields = data.config.preferences.skipFields.join(',')
      resave = 'skipFields'
    }

    if (data.config.preferences.skipField) {
      delete data.config.preferences.skipField
      resave = 'skipField'
    }

    for (const k of Object.keys(data.config.preferences)) {
      if (!preferences.includes(k)) {
        delete data.config.preferences[k]
        resave = k
      }
    }
  }

  if (lib.includes('/export/')) {
    if (data.config && data.config.options && data.config.options.exportPath) {
      delete data.config.options.exportPath
      resave = 'exportPath'
    }
  }

  for (const item of data.items) {
    if (item.extra) {
      const extra = upgradeExtra(item.extra)

      if (extra != item.extra) {
        item.extra = extra
        resave = 'extraFields'
      }
    }

    if (lib.includes('/export/') && item.attachments && item.attachments.length) {
      const attachments = item.attachments.filter(att => {
        if (att.url) return true
        if (!att.path) return false
        if (att.path.match(/^(\/|([a-z]:\\))/i)) return false
        if (!fs.existsSync(path.join(path.dirname(lib), att.path))) return false
        return true
      })
      if (attachments.length != item.attachments.length) {
        item.attachments = attachments
        resave = 'attachments'
      }
    }
  }

  if (resave) {
    console.log(`${resave}: ${lib}`)

    // add trailing newline for POSIX compatibility
    fs.writeFileSync(lib, JSON.stringify(sortify(data), null, 2).replace(/[\u007F-\uFFFF]/g, chr => `\\u${("0000" + chr.charCodeAt(0).toString(16)).substr(-4)}`) + '\n')
  }
}
