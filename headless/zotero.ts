import { defaults } from '../content/prefs-meta'
import schema from '../schema/zotero.json'
import XRegExp from 'xregexp'
console.log(typeof XRegExp)

class Preferences {
  get(name) {
    return defaults[name]
  }
  set(name, v) {
    defaults[name] = v
  }
  registerObserver(name, any) {
    // pass
  }
}

class Utilities {
  XRegExp = XRegExp
}

const itemTypeID = require('../schema/item-types.json')
class ItemTypes {
  getName(itemTypeID) {
    return itemTypeID[`${itemTypeID}`]
  }
}

const items = require('../../sync/data/%2Fgroups%2F1844905.json').items
for (const item of items) {
  item.itemTypeID = itemTypeID[item.itemType]
  item.getField = function(field) { return this[field] }
}
export const Zotero = new class {
  Prefs = new Preferences
  Utilities = new Utilities
  ItemTypes = new ItemTypes

  items = require('../../sync/data/%2Fgroups%2F1844905.json').items
  Debug = { enabled: true }
  isWin = process.platform === 'win32'
  isMac = process.platform === 'darwin'
  isLinux = process.platform !== 'win32' && process.platform !== 'darwin'


  export(translator: string, preferences, options, items, collections) {
    console.log(translator)
  }
  debug(msg) {
    console.log(msg)
  }
}
