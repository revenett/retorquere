declare const window: any
declare const document: any
declare const ZoteroItemPane: any

import { patch as $patch$ } from './monkey-patch'
import { sentenceCase } from './case'

function display(itemID) {
  let menuitem = document.getElementById('zotero-field-transform-menu-better-sentencecase')
  if (!menuitem) {
    Zotero.debug('adding better-sentencecase')
    const zotero_field_transform_menu = document.getElementById('zotero-field-transform-menu')
    if (zotero_field_transform_menu) {
      menuitem = zotero_field_transform_menu.appendChild(document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuitem'))
      menuitem.setAttribute('id', 'zotero-field-transform-menu-better-sentencecase')
      menuitem.setAttribute('label', 'BBT sentence case')
      menuitem.addEventListener('command', function(_e) { title_sentenceCase.call(document.getBindingParent(this), document.popupNode) }, false)
    }
  }

  const field = document.getElementById('better-bibtex-citekey-display')
  if (field.getAttribute('itemID') !== `${itemID}`) return null

  const citekey = Zotero.BetterBibTeX.KeyManager.get(itemID)
  field.value = citekey.citekey

  const pin = ' \uD83D\uDCCC'
  const label = document.getElementById('better-bibtex-citekey-label')
  label.value = `${label.value.replace(pin, '')}${(citekey.pinned ? pin : '')}`
}

let observer = null
function init() {
  if (observer || !Zotero.BetterBibTeX.KeyManager.keys) return null

  observer = Zotero.BetterBibTeX.KeyManager.keys.on(['update', 'insert'], citekey => {
    display(citekey.itemID)
  })
}

async function title_sentenceCase(label) {
  const val = this._getFieldValue(label)
  const newVal = sentenceCase(val)
  this._setFieldValue(label, newVal)
  const fieldName = label.getAttribute('fieldname')
  this._modifyField(fieldName, newVal)

  // If this is a title field, convert the Short Title too
  const isTitle = Zotero.ItemFields.getBaseIDFromTypeAndField(this.item.itemTypeID, fieldName) === Zotero.ItemFields.getID('title')
  const shortTitleVal = this.item.getField('shortTitle')
  if (isTitle && newVal.toLowerCase().startsWith(shortTitleVal.toLowerCase())) {
    this._modifyField('shortTitle', newVal.substr(0, shortTitleVal.length))
  }

  if (this.saveOnEdit) {
    // If a field is open, blur it, which will trigger a save and cause
    // the saveTx() to be a no-op
    await this.blurOpenField()
    await this.item.saveTx()
  }
}

function load() {
  Zotero.BetterBibTeX?.ready?.then(() => {
    init()
    const itemBox = document.getElementById('zotero-editpane-item-box')
    const citekeyBox = document.getElementById('better-bibtex-editpane-item-box')

    if (itemBox.parentNode !== citekeyBox.parentNode) {
      itemBox.parentNode.appendChild(citekeyBox.parentNode) // move the vbox into the tabbox
      citekeyBox.parentNode.appendChild(itemBox) // move the itembox into the vbox
    }
  })
}

function unload() {
  if (Zotero.BetterBibTeX.KeyManager.keys && observer) {
    Zotero.BetterBibTeX.KeyManager.keys.removeListener(observer)
  }
}

$patch$(ZoteroItemPane, 'viewItem', original => async function(item, _mode, _index) {
  // eslint-disable-next-line prefer-rest-params
  await original.apply(this, arguments)
  init()

  document.getElementById('better-bibtex-citekey-display').setAttribute('itemID', `${item.id}`)
  display(item.id)
})

window.addEventListener('load', load, false)
window.addEventListener('unload', unload, false)

// otherwise this entry point won't be reloaded: https://github.com/webpack/webpack/issues/156
delete require.cache[module.id]

// otherwise typescript won't see this as a module
export = true
