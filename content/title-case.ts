// declare const Zotero: any
// declare const Components: any

import * as log from './debug'
import * as CSL from 'citeproc'

// const CiteProc = { CSL: null } // tslint:disable-line:variable-name
// const CiteProc = { CSL: Zotero.CiteProc.CSL } // tslint:disable-line:variable-name
const CiteProc = { CSL } // tslint:disable-line:variable-name

// Components.utils.import('resource://gre/modules/Services.jsm')
// declare const Services: any
// if (!CiteProc.CSL) Services.scriptloader.loadSubScript('chrome://zotero-better-bibtex/content/citeproc.js', CiteProc, 'UTF-8')

const state = {
  opt: { lang: 'en' },

  locale: {
    en: {
      opts: {
        'skip-words': CiteProc.CSL.SKIP_WORDS,
        'skip-words-regexp': new RegExp( '(?:(?:[?!:]*\\s+|-|^)(?:' + CiteProc.CSL.SKIP_WORDS.join('|') + ')(?=[!?:]*\\s+|-|$))', 'g'), // tslint:disable-line:prefer-template
      },
    },
  },
}

export function titleCase(text) {
  const titleCased = CiteProc.CSL.Output.Formatters.title(state, text)
  log.debug('titlecase:', {text, titleCased})
  return titleCased
}
