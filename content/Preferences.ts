declare const document: any
declare const window: any
declare const Zotero: any
declare const Zotero_Preferences: any

import { debug } from './debug.ts'
import { ZoteroConfig } from './zotero-config.ts'
import { patch as $patch$ } from './monkey-patch.ts'

import { Preferences as Prefs } from './prefs.ts'
import { Formatter } from './key-manager/formatter.ts'
import { KeyManager } from './key-manager.ts'
import { AutoExport } from './auto-export.ts'
import { Translators } from './translators.ts'

class AutoExportPrefPane {
  protected AutoExport: AutoExportPrefPane // tslint:disable-line:variable-name

  public remove() {
    const exportlist = document.getElementById('better-bibtex-export-list')
    if (!exportlist) return
    const selected = exportlist.currentIndex
    if (selected < 0) return

    const id = parseInt(exportlist.contentView.getItemAtIndex(selected).getAttribute('autoexport'))
    debug('AutoExport: removing', { id })
    AutoExport.db.remove(id)
    this.refresh()
  }

  public mark() {
    const exportlist = document.getElementById('better-bibtex-export-list')
    if (!exportlist) return
    const selected = exportlist.currentIndex
    if (selected < 0) return

    const id = parseInt(exportlist.contentView.getItemAtIndex(selected).getAttribute('autoexport'))
    AutoExport.run(id)
    this.refresh()
  }

  public refresh() {
    if (!AutoExport.db) {
      debug('AutoExportPrefPane.refresh: DB not loaded')
      return
    }

    const exportlist = document.getElementById('better-bibtex-auto-exports')
    if (!exportlist) return
    while (exportlist.hasChildNodes()) {
      exportlist.removeChild(exportlist.firstChild)
    }

    const columns = Array.from(
      document.getElementById('better-bibtex-export-list').getElementsByTagName('treecol') as NodeList
    ).map(
      col => (col as Element).getAttribute('id').replace(/^better-bibtex-preferences-auto-export-/, '')
    )

    const on = Zotero.BetterBibTeX.getString('Preferences.auto-export.setting.on')
    const off = Zotero.BetterBibTeX.getString('Preferences.auto-export.setting.off')

    for (const ae of AutoExport.db.chain().simplesort('path').data()) {
      const treeitem = exportlist.appendChild(document.createElement('treeitem'))
      treeitem.setAttribute('autoexport', `${ae.$loki}`)

      const treerow = treeitem.appendChild(document.createElement('treerow'))
      // TODO: https://github.com/Microsoft/TypeScript/issues/19186
      // TODO: https://github.com/Microsoft/TypeScript/issues/1260

      for (const column of columns) {
        debug('Preferences.AutoExport.refresh:', column)
        const treecell = treerow.appendChild(document.createElement('treecell'))
        treecell.setAttribute('editable', 'false')

        switch (column) {
          case 'collection':
            const type = Zotero.BetterBibTeX.getString(`Preferences.auto-export.type.${ae.type}`) || ae.type
            treecell.setAttribute('label', `${type}: ${this.autoExportName(ae)}`)
            break

          case 'status':
            let status = ae.error ? 'error' : ae.status
            status = Zotero.BetterBibTeX.getString(`Preferences.auto-export.status.${status}`) || status
            if (ae.error) status += `: ${ae.error}`
            treecell.setAttribute('label', status)
            break

          case 'updated':
            treecell.setAttribute('label', `${new Date(ae.meta.updated || ae.meta.created)}`)
            break

          case 'target':
            treecell.setAttribute('label', ae.path)
            break

          case 'translator':
            treecell.setAttribute('label', Translators.byId[ae.translatorID] ? Translators.byId[ae.translatorID].label : '??')
            break

          case 'auto-abbrev':
            treecell.setAttribute('label', ae.useJournalAbbreviation ? on : off)
            break

          case 'notes':
            treecell.setAttribute('label', ae.exportNotes ? on : off)
            break

          default:
            throw new Error(`Unexpected auto-export column ${column}`)
        }
      }
    }
  }

  private autoExportNameCollectionPath(id) {
    if (!id) return ''
    const coll = Zotero.Collections.get(id)
    if (!coll) return ''

    if (coll.parent) return `${this.autoExportNameCollectionPath(coll.parent)}/${coll.name}`
    return coll.name
  }

  private autoExportName(ae) {
    let name
    switch (ae.type) {
      case 'library':
        name = Zotero.Libraries.getName(ae.id)
        break
      case 'collection':
        name = this.autoExportNameCollectionPath(ae.id)
        break
    }
    return name || ae.path
  }
}

export = new class PrefPane {
  private AutoExport: AutoExportPrefPane // tslint:disable-line:variable-name

  public getCitekeyFormat() {
    debug('prefs: fetching citekey for display...')
    const keyformat = document.getElementById('id-better-bibtex-preferences-citekeyFormat')
    keyformat.value = Prefs.get('citekeyFormat')
    debug('prefs: fetched citekey for display:', keyformat.value)
  }

  public checkCitekeyFormat() {
    const keyformat = document.getElementById('id-better-bibtex-preferences-citekeyFormat')
    if (keyformat.disabled) return // itemTypes not available yet

    let msg
    try {
      Formatter.parsePattern(keyformat.value)
      msg = ''
    } catch (err) {
      msg = err.message
      if (err.location) msg += ` at ${err.location.start.offset + 1}`
      debug('prefs: key format error:', msg)
    }

    keyformat.setAttribute('style', (msg ? '-moz-appearance: none !important; background-color: DarkOrange' : ''))
    keyformat.setAttribute('tooltiptext', msg)
  }

  public saveCitekeyFormat() {
    const keyformat = document.getElementById('id-better-bibtex-preferences-citekeyFormat')
    try {
      debug('prefs: saving new citekey format', keyformat.value)
      Formatter.parsePattern(keyformat.value)
      Prefs.set('citekeyFormat', keyformat.value)
    } catch (error) {
      // restore previous value
      debug('prefs: error saving new citekey format', keyformat.value, 'restoring previous')
      this.getCitekeyFormat()
      keyformat.setAttribute('style', '')
      keyformat.setAttribute('tooltiptext', '')
    }
  }

  public checkPostscript() {
    const postscript = document.getElementById('zotero-better-bibtex-postscript')

    let error = ''
    try {
      // don't care about the return value, just if it throws an error
      new Function(postscript.value) // tslint:disable-line:no-unused-expression
    } catch (err) {
      debug('PrefPane.checkPostscript: error compiling postscript:', err)
      error = `${err}`
    }

    postscript.setAttribute('style', (error ? '-moz-appearance: none !important; background-color: DarkOrange' : ''))
    postscript.setAttribute('tooltiptext', error)
  }

  public async rescanCitekeys() {
    debug('starting manual key rescan')
    await KeyManager.rescan()
    debug('manual key rescan done')
  }

  public load() {
    debug('prefs: loading...')

    if (typeof Zotero_Preferences === 'undefined') return

    // disable key format editing until DB clears because of course async
    const keyformat = document.getElementById('id-better-bibtex-preferences-citekeyFormat')
    keyformat.disabled = true
    Zotero.BetterBibTeX.ready
      .then(() => {
        keyformat.disabled = false
        this.getCitekeyFormat()
        this.update()
      })
      .catch(err => debug('preferences.load: BBT init failed', err))

    // no other way that I know of to know that I've just been selected
    const timer = window.setInterval(() => {
      const pane = document.getElementById('zotero-prefpane-better-bibtex')
      if (pane) {
        if (pane.selected) window.sizeToContent()
      } else {
        window.clearInterval(timer)
      }
    }, 500) // tslint:disable-line:no-magic-numbers

    this.AutoExport = new AutoExportPrefPane()

    // document.getElementById('better-bibtex-prefs-tab-journal-abbrev').setAttribute('hidden', !ZoteroConfig.Zotero.isJurisM)
    document.getElementById('better-bibtex-abbrev-style').setAttribute('hidden', !ZoteroConfig.Zotero.isJurisM)

    $patch$(Zotero_Preferences, 'openHelpLink', original => function() {
      if (document.getElementsByTagName('prefwindow')[0].currentPane.helpTopic === 'BetterBibTeX') {
        const id = document.getElementById('better-bibtex-prefs-tabbox').selectedPanel.id
        if (id) this.openURL(`https://github.com/retorquere/zotero-better-bibtex/wiki/Configuration#${id.replace('better-bibtex-prefs-', '')}`)
      } else {
        original.apply(this, arguments)
      }
    })

    this.getCitekeyFormat()
    this.update()

    debug('prefs: loaded @', document.location.hash)

    if (document.location.hash === '#better-bibtex') {
      // runs into the 'TypeError: aId is undefined' problem for some reason unless I delay the activation of the pane
      // tslint:disable-next-line:no-magic-numbers
      setTimeout(() => document.getElementById('zotero-prefs').showPane(document.getElementById('zotero-prefpane-better-bibtex')), 500)
    }
    debug('prefs: ready')

    window.sizeToContent()
  }

  private update() {
    this.checkCitekeyFormat()

    if (ZoteroConfig.Zotero.isJurisM) {
      Zotero.Styles.init().then(() => {
        const styles = Zotero.Styles.getVisible().filter(style => style.usesAbbreviation)
        debug('prefPane.update: found styles', styles)

        const stylebox = document.getElementById('better-bibtex-abbrev-style')
        const refill = stylebox.children.length === 0
        const selectedStyle = Prefs.get('autoAbbrevStyle')
        let selectedIndex = -1
        for (const [i, style] of styles.entries()) {
          if (refill) {
            const itemNode = document.createElement('listitem')
            itemNode.setAttribute('value', style.styleID)
            itemNode.setAttribute('label', style.title)
            stylebox.appendChild(itemNode)
          }
          if (style.styleID === selectedStyle) selectedIndex = i
        }
        if (selectedIndex === -1) selectedIndex = 0
        this.styleChanged(selectedIndex)

        setTimeout(() => { stylebox.ensureIndexIsVisible(selectedIndex); stylebox.selectedIndex = selectedIndex }, 0)
      })
    }

    const quickCopyNode = document.getElementById('id-better-bibtex-preferences-quickCopyMode').selectedItem
    const quickCopyMode = quickCopyNode ? quickCopyNode.getAttribute('value') : ''
    for (const [row, enabledFor] of [['citeCommand', 'latex'], ['quickCopyPandocBrackets', 'pandoc']]) {
      document.getElementById(`id-better-bibtex-preferences-${row}`).setAttribute('hidden', quickCopyMode !== enabledFor)
    }

    this.AutoExport.refresh()

    window.sizeToContent()
  }

  private styleChanged(index) {
    if (!ZoteroConfig.Zotero.isJurisM) return

    const stylebox = document.getElementById('better-bibtex-abbrev-style')
    const selectedItem = typeof index !== 'undefined' ? stylebox.getItemAtIndex(index) : stylebox.selectedItem
    const styleID = selectedItem.getAttribute('value')
    Prefs.set('autoAbbrevStyle', styleID)
  }

  /* Unused?
  private display(id, text) {
    const elt = document.getElementById(id)
    elt.value = text
    if (text !== '') elt.setAttribute('tooltiptext', text)
  }
  */
}

// otherwise this entry point won't be reloaded: https://github.com/webpack/webpack/issues/156
delete require.cache[module.id]
