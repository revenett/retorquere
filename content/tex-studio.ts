declare const Zotero: any

import { pathSearch } from './path-search'
import { KeyManager } from './key-manager'
import { log } from './logger'

// export singleton: https://k94n.com/es6-modules-single-instance-pattern
export const TeXstudio = new class { // eslint-disable-line @typescript-eslint/naming-convention,no-underscore-dangle,id-blacklist,id-match
  public enabled: boolean
  public texstudio: string

  public async init() {
    this.texstudio = await pathSearch('texstudio', { mac: ['/Applications/texstudio.app/Contents/MacOS'], win: ['C:\\Program Files (x86)\\texstudio', 'C:\\Program Files\\texstudio'] })
    this.enabled = !!this.texstudio
    if (this.enabled) {
      log.debug('TeXstudio: found at', this.texstudio)
    }
    else {
      log.debug('TeXstudio: not found')
    }
  }

  public async push(citation?: string) {
    if (!this.enabled) throw new Error('texstudio was not found')

    if (!citation) {
      try {
        const pane = Zotero.getActiveZoteroPane() // can Zotero 5 have more than one pane at all?
        const items = pane.getSelectedItems()
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        citation = items.map(item => KeyManager.get(item.id).citekey).filter(citekey => citekey).join(',')
      }
      catch (err) { // zoteroPane.getSelectedItems() doesn't test whether there's a selection and errors out if not
        log.error('TeXstudio: Could not get selected items:', err)
        return
      }
    }

    if (!citation) return

    try {
      await Zotero.Utilities.Internal.exec(this.texstudio, ['--insert-cite', citation])
    }
    catch (err) {
      log.error('TeXstudio: Could not get execute texstudio:', err)
    }
  }
}
