// import Citeproc = require('./citeproc')
declare const Zotero: any

import * as log from './debug'

const state = {
  opt: { lang: 'en' },

  locale: {
    en: {
      opts: {
        'skip-words': Zotero.CiteProc.CSL.SKIP_WORDS,
        'skip-words-regexp': new RegExp(`(?:(?:[?!:]*\\s+|-|^)(?:${Zotero.CiteProc.CSL.SKIP_WORDS.slice().join('|')})(?=[!?:]*\\s+|-|$))`, 'g'),
      },
    },
  },
}

export function titleCase(text) {
  const titleCased = Zotero.CiteProc.CSL.Output.Formatters.title(state, text)
  log.debug('titlecase:', {text, titleCased})
  return titleCased
}
