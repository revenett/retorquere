declare const Components: any
declare const Zotero: any

import debug = require('./debug.ts')
import Events = require('./events.ts')
import ZoteroConfig = require('./zotero-config.ts')

class Preferences {
  private static prefix = 'translators.better-bibtex'

  public branch: any

  constructor() {
    const prefService = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService)
    this.branch = prefService.getBranch(`${ZoteroConfig.PREF_BRANCH}${Preferences.prefix}.`)

    // preference upgrades
    for (const pref of this.branch.getChildList('')) {
      switch (pref) {
        case 'jabrefGroups':
          debug('Preferences: jabrefGroups -> jabrefFormat')
          this.set('jabrefFormat', this.get(pref))
          this.clear(pref)
      }
    }

    this.branch.addObserver('', this, false)
  }

  public observe(branch, topic, pref) {
    debug('preference', pref, 'changed to', this.get(pref))
    Events.emit('preference-changed', pref)
  }

  public set(pref, value) {
    debug('Prefs.set', pref, value)
    Zotero.Prefs.set(this.key(pref), value)
  }

  public get(pref) {
    try {
      return Zotero.Prefs.get(this.key(pref))
    } catch (error) {
      return null
    }
  }

  public clear(pref) {
    try {
      Zotero.Prefs.clear(this.key(pref))
    } catch (err) {
      debug('Prefs.clear', pref, err)
    }

  }

  private key(pref) { return `${Preferences.prefix}.${pref}` }
}

export = new Preferences()
