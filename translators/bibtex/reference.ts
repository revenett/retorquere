declare const Zotero: any

import { Translator } from '../lib/translator'

import { Exporter } from './exporter'
import { text2latex } from './unicode_translator'
import { debug } from '../lib/debug'
import { datefield } from './datefield'
import * as Extra from '../../content/extra'
import * as cslVariables from '../../content/csl-vars.json'
import * as CSL from '../../gen/citeproc'

import { arXiv } from '../../content/arXiv'

const Path = { // tslint:disable-line variable-name
  normalize(path) {
    return Translator.paths.caseSensitive ? path : path.toLowerCase()
  },

  drive(path) {
    if (Translator.preferences.platform !== 'win') return ''
    return path.match(/^[a-z]:\//) ? path.substring(0, 2) : ''
  },

  relative(path) {
    if (this.drive(Translator.exportDir) !== this.drive(path)) return path

    const from = Translator.exportDir.split(Translator.paths.sep)
    const to = path.split(Translator.paths.sep)

    while (from.length && to.length && this.normalize(from[0]) === this.normalize(to[0])) {
      from.shift()
      to.shift()
    }
    return `..${Translator.paths.sep}`.repeat(from.length) + to.join(Translator.paths.sep)
  },
}

interface IField {
  name: string
  verbatim?: string
  value: string | string[] | number | null | { path: string; title?: string; mimeType?: string; } | { tag: string, type?: number }[]
  enc?: string
  orig?: { name?: string, verbatim?: string, inherit?: boolean }
  bibtexStrings?: boolean
  bare?: boolean
  raw?: boolean

  // kept as seperate booleans for backwards compat
  replace?: boolean
  fallback?: boolean

  html?: boolean

  bibtex?: string
}

const Language = new class { // tslint:disable-line:variable-name
  public babelMap = {
    af: 'afrikaans',
    am: 'amharic',
    ar: 'arabic',
    ast: 'asturian',
    bg: 'bulgarian',
    bn: 'bengali',
    bo: 'tibetan',
    br: 'breton',
    ca: 'catalan',
    cop: 'coptic',
    cy: 'welsh',
    cz: 'czech',
    da: 'danish',
    de_1996: 'ngerman',
    de_at_1996: 'naustrian',
    de_at: 'austrian',
    de_de_1996: 'ngerman',
    de: ['german', 'germanb'],
    dsb: ['lsorbian', 'lowersorbian'],
    dv: 'divehi',
    el: 'greek',
    el_polyton: 'polutonikogreek',
    en_au: 'australian',
    en_ca: 'canadian',
    en: 'english',
    en_gb: ['british', 'ukenglish'],
    en_nz: 'newzealand',
    en_us: ['american', 'usenglish'],
    eo: 'esperanto',
    es: 'spanish',
    et: 'estonian',
    eu: 'basque',
    fa: 'farsi',
    fi: 'finnish',
    fr_ca: [ 'acadian', 'canadian', 'canadien' ],
    fr: ['french', 'francais', 'français'],
    fur: 'friulan',
    ga: 'irish',
    gd: ['scottish', 'gaelic'],
    gl: 'galician',
    he: 'hebrew',
    hi: 'hindi',
    hr: 'croatian',
    hsb: ['usorbian', 'uppersorbian'],
    hu: 'magyar',
    hy: 'armenian',
    ia: 'interlingua',
    id: [ 'indonesian', 'bahasa', 'bahasai', 'indon', 'meyalu' ],
    is: 'icelandic',
    it: 'italian',
    ja: 'japanese',
    kn: 'kannada',
    la: 'latin',
    lo: 'lao',
    lt: 'lithuanian',
    lv: 'latvian',
    ml: 'malayalam',
    mn: 'mongolian',
    mr: 'marathi',
    nb: ['norsk', 'bokmal', 'nob'],
    nl: 'dutch',
    nn: 'nynorsk',
    no: ['norwegian', 'norsk'],
    oc: 'occitan',
    pl: 'polish',
    pms: 'piedmontese',
    pt_br: ['brazil', 'brazilian'],
    pt: ['portuguese', 'portuges'],
    pt_pt: 'portuguese',
    rm: 'romansh',
    ro: 'romanian',
    ru: 'russian',
    sa: 'sanskrit',
    se: 'samin',
    sk: 'slovak',
    sl: ['slovenian', 'slovene'],
    sq_al: 'albanian',
    sr_cyrl: 'serbianc',
    sr_latn: 'serbian',
    sr: 'serbian',
    sv: 'swedish',
    syr: 'syriac',
    ta: 'tamil',
    te: 'telugu',
    th: ['thai', 'thaicjk'],
    tk: 'turkmen',
    tr: 'turkish',
    uk: 'ukrainian',
    ur: 'urdu',
    vi: 'vietnamese',
    zh_latn: 'pinyin',
    zh: 'pinyin',
    zlm: [ 'malay', 'bahasam', 'melayu' ],
  }

  private prefix: { [key: string]: boolean | string }
  private babelList: string[]
  private cache: { [key: string]: { lang: string, sim: number }[] }

  constructor() {
    for (const [key, value] of Object.entries(this.babelMap)) {
      if (typeof value === 'string') this.babelMap[key] = [value]
    }

    // list of unique languages
    this.babelList = []
    for (const v of Object.values(this.babelMap)) {
      for (const lang of v) {
        if (this.babelList.indexOf(lang) < 0) this.babelList.push(lang)
      }
    }

    this.cache = {}
    this.prefix = {}
  }

  public lookup(langcode) {
    if (!this.cache[langcode]) {
      this.cache[langcode] = []
      for (const lc of Language.babelList) {
        this.cache[langcode].push({ lang: lc, sim: this.string_similarity(langcode, lc) })
      }
      this.cache[langcode].sort((a, b) => b.sim - a.sim)
    }

    return this.cache[langcode]
  }

  public fromPrefix(langcode) {
    if (!langcode || (langcode.length < 2)) return false

    if (this.prefix[langcode] == null) {
      // consider a langcode matched if it is the prefix of exactly one language in the map
      const lc = langcode.toLowerCase()
      const matches = []
      for (const languages of Object.values(Language.babelMap)) {
        for (const lang of languages) {
          if (lang.toLowerCase().indexOf(lc) !== 0) continue
          matches.push(languages)
          break
        }
      }
      if (matches.length === 1) {
        this.prefix[langcode] = matches[0]
      } else {
        this.prefix[langcode] = false
      }
    }

    return this.prefix[langcode]
  }

  private get_bigrams(str) {
    const s = str.toLowerCase()
    const bigrams = [...Array(s.length).keys()].map(i => s.slice(i, i + 2))
    bigrams.sort()
    return bigrams
  }

  private string_similarity(str1, str2) {
    const pairs1 = this.get_bigrams(str1)
    const pairs2 = this.get_bigrams(str2)
    const union = pairs1.length + pairs2.length
    let hit_count = 0

    while ((pairs1.length > 0) && (pairs2.length > 0)) {
      if (pairs1[0] === pairs2[0]) {
        hit_count++
        pairs1.shift()
        pairs2.shift()
        continue
      }

      if (pairs1[0] < pairs2[0]) {
        pairs1.shift()
      } else {
        pairs2.shift()
      }
    }

    return (hit_count * 2) / union
  }
}

/*
 * h1 Global object: Translator
 *
 * The global Translator object allows access to the current configuration of the translator
 *
 * @param {enum} caseConversion whether titles should be title-cased and case-preserved
 * @param {boolean} bibtexURL set to true when BBT will generate \url{..} around the urls for BibTeX
 */

/*
 * h1 class: Reference
 *
 * The Bib(La)TeX references are generated by the `Reference` class. Before being comitted to the cache, you can add
 * postscript code that can manipulated the `has` or the `referencetype`
 *
 * @param {String} @referencetype referencetype
 * @param {Object} @item the current Zotero item being converted
 */

const fieldOrder = [
  'ids',
  'title',
  'shorttitle',
  'booktitle',
  'author',
  'editor',
  'date',
  'origdate',
  'year',
  'month',
  'journaltitle',
  'shortjournal',
  'edition',
  'volume',
  'pages',
  'publisher',
  'address',
  'institution',
  'location',
  'issn',
  'doi',
  'url',
  'urldate',
].reduce((acc, field, idx, fields) => { acc[field] = idx + 1; return acc }, {})

/*
 * The fields are objects with the following keys:
 *   * name: name of the Bib(La)TeX field
 *   * value: the value of the field
 *   * bibtex: the LaTeX-encoded value of the field
 *   * enc: the encoding to use for the field
 */
export class Reference {
  public has: { [key: string]: any } = {}
  public item: ISerializedItem
  public referencetype: string
  public useprefix: boolean
  public language: string
  public english: boolean

  // patched in by the Bib(La)TeX translators
  public fieldEncoding: { [key: string]: string }
  public caseConversion: { [key: string]: boolean }
  public typeMap: { csl: { [key: string]: string | { type: string, subtype?: string } }, zotero: { [key: string]: string | { type: string, subtype?: string } } }
  public lint: Function
  public addCreators: Function

  private cachable = true

  // private nonLetters = new Zotero.Utilities.XRegExp('[^\\p{Letter}]', 'g')
  private punctuationAtEnd = new Zotero.Utilities.XRegExp('[\\p{Punctuation}]$')
  private startsWithLowercase = new Zotero.Utilities.XRegExp('^[\\p{Ll}]')
  private hasLowercaseWord = new Zotero.Utilities.XRegExp('\\s[\\p{Ll}]')
  private whitespace = new Zotero.Utilities.XRegExp('\\p{Zs}')

  private inPostscript = false

  public static installPostscript() {
    let postscript = Translator.preferences.postscript

    if (typeof postscript !== 'string' || postscript.trim() === '') return

    try {
      postscript = `this.inPostscript = true; ${postscript}; this.inPostscript = false;`
      // workaround for https://github.com/Juris-M/zotero/issues/65
      Reference.prototype.postscript = new Function('reference', 'item', 'Translator', 'Zotero', postscript) as (reference: any, item: any) => boolean
      debug(`Installed postscript: ${JSON.stringify(postscript)}`)
    } catch (err) {
      if (Translator.preferences.testing) throw err
      debug(`Failed to compile postscript: ${err}\n\n${JSON.stringify(postscript)}`)
    }
  }

  private _enc_creators_initials_marker = '\u0097' // end of guarded area
  private _enc_creators_relax_marker = '\u200C' // zero-width non-joiner

  private isBibStringRE = /^[a-z][-a-z0-9_]*$/i
  private metadata: Types.DB.Cache.ExportedItemMetadata = { DeclarePrefChars: '', noopsort: false, packages: [] }
  private packages: { [key: string]: boolean }
  private juniorcomma: boolean

  constructor(item) {
    this.item = item
    this.packages = {}

    if (!this.item.language) {
      this.english = true
    } else {
      const langlc = this.item.language.toLowerCase()

      let language = Language.babelMap[langlc.replace(/[^a-z0-9]/, '_')]
      if (!language) language = Language.babelMap[langlc.replace(/-[a-z]+$/i, '').replace(/[^a-z0-9]/, '_')]
      if (!language) language = Language.fromPrefix(langlc)
      if (language) {
        this.language = language[0]
      } else {
        const match = Language.lookup(langlc)
        if (match[0].sim >= 0.9) { // tslint:disable-line:no-magic-numbers
          this.language = match[0].lang
        } else {
          this.language = this.item.language
        }
      }

      this.english = ['american', 'british', 'canadian', 'english', 'australian', 'newzealand', 'usenglish', 'ukenglish', 'anglais'].includes(this.language.toLowerCase())
    }

    if (this.item.extraFields.csl.type) {
      this.item.cslType = (this.item.extraFields.csl.type as string).toLowerCase()
      delete item.extraFields.csl.type
    }

    if (this.item.extraFields.csl['volume-title']) { // should just have been mapped by Zotero
      this.item.cslVolumeTitle = (this.item.extraFields.csl['volume-title'] as string)
      delete this.item.extraFields.csl['volume-title']
    }

    this.item.referenceType = this.item.extraFields.tex.referencetype?.value || this.item.cslType || this.item.itemType
    // should be const referencetype: string | { type: string, subtype?: string }
    // https://github.com/Microsoft/TypeScript/issues/10422
    const referencetype: any = this.item.extraFields.tex.referencetype?.value || this.typeMap.csl[this.item.cslType] || this.typeMap.zotero[this.item.itemType] || 'misc'
    if (typeof referencetype === 'string') {
      this.referencetype = referencetype
    } else {
      this.add({ name: 'entrysubtype', value: referencetype.subtype })
      this.referencetype = referencetype.type
    }
    delete this.item.extraFields.tex.referencetype

    if (Translator.preferences.jabrefFormat) {
      if (Translator.preferences.testing) {
        this.add({name: 'timestamp', value: '2015-02-24 12:14:36 +0100'})
      } else {
        this.add({name: 'timestamp', value: this.item.dateModified || this.item.dateAdded})
      }
    }

    if ((this.item.libraryCatalog || '').match(/^arxiv(\.org)?$/i) && (this.item.arXiv = arXiv.parse(this.item.publicationTitle)) && this.item.arXiv.id) {
      this.item.arXiv.source = 'publicationTitle'
      if (Translator.BetterBibLaTeX) delete this.item.publicationTitle

    } else if (this.item.extraFields.tex.arxiv && (this.item.arXiv = arXiv.parse(this.item.extraFields.tex.arxiv.value)) && this.item.arXiv.id) {
      this.item.arXiv.source = 'extra'

    } else {
      this.item.arXiv = null

    }

    if (this.item.arXiv) {
      delete this.item.extraFields.tex.arxiv
      this.add({ name: 'archivePrefix', value: 'arXiv'} )
      this.add({ name: 'eprinttype', value: 'arxiv'})
      this.add({ name: 'eprint', value: this.item.arXiv.id })
      this.add({ name: 'primaryClass', value: this.item.arXiv.category })
    }
  }

  /** normalize dashes, mainly for use in `pages` */
  public normalizeDashes(str) {
    str = (str || '').trim()

    if (this.item.raw) return str

    return str
      .replace(/\u2053/g, '~')
      .replace(/[\u2014\u2015]/g, '---') // em-dash
      .replace(/[\u2012\u2013]/g, '--') // en-dash
      .split(/(,\s*)/).map(range => {
        if (range.match(/^,\s+/)) return ', '
        if (range === ',') return range

        return range
          .replace(/^([0-9]+)\s*(-+)\s*([0-9]+)\s*$/g, '$1$2$3') // treat space-hyphens-space like a range when it's between numbers
          .replace(/^([0-9]+)-([0-9]+)$/g, '$1--$2') // single dash is probably a range, which should be an n-dash
          .replace(/^([0-9]+)-{4,}([0-9]+)$/g, '$1---$2') // > 4 dashes can't be right. Settle for em-dash
      }).join('')
  }

  /*
   * Add a field to the reference field set
   *
   * @param {field} field to add. 'name' must be set, and either 'value' or 'bibtex'. If you set 'bibtex', BBT will trust
   *   you and just use that as-is. If you set 'value', BBT will escape the value according the encoder passed in 'enc'; no
   *   'enc' means 'enc_latex'. If you pass both 'bibtex' and 'latex', 'bibtex' takes precedence (and 'value' will be
   *   ignored)
   */
  public add(field: IField) {
    if (!field.value && !field.bibtex && this.inPostscript) {
      delete this.has[field.name]
      return
    }

    if (Translator.skipField[field.name]) return null

    if (field.enc === 'date') {
      if (!field.value) return null

      if (Translator.BetterBibLaTeX && Translator.preferences.biblatexExtendedDateFormat && Zotero.BetterBibTeX.isEDTF(field.value, true)) {
        return this.add({
          ...field,
          enc: 'verbatim',
        })
      }

      if (field.value === 'today') {
        return this.add({
          ...field,
          value: '<pre>\\today</pre>',
          enc: 'verbatim',
        })
      }

      const date = Zotero.BetterBibTeX.parseDate(field.value)

      this.add(datefield(date, field))

      this.add(datefield(date.orig, {
        ...field,
        name: (field.orig && field.orig.inherit) ? `orig${field.name}` : (field.orig && field.orig.name),
        verbatim: (field.orig && field.orig.inherit && field.verbatim) ? `orig${field.verbatim}` : (field.orig && field.orig.verbatim),
      }))

      return field.name
    }

    if (field.fallback && field.replace) throw new Error('pick fallback or replace, buddy')
    if (field.fallback && this.has[field.name]) return null

    // legacy field addition, leave in place for postscripts
    if (!field.name) {
      const keys = Object.keys(field)
      switch (keys.length) {
        case 0: // name -> undefined/null
          return null

        case 1:
          field = {name: keys[0], value: field[keys[0]]}
          break

        default:
          throw new Error(`Quick-add mode expects exactly one name -> value mapping, found ${JSON.stringify(field)} (${(new Error()).stack})`)
      }
    }

    if (!field.bibtex) {
      if ((typeof field.value !== 'number') && !field.value) return null
      if ((typeof field.value === 'string') && (field.value.trim() === '')) return null
      if (Array.isArray(field.value) && (field.value.length === 0)) return null
    }

    if (this.has[field.name]) {
      if (!this.inPostscript && !field.replace) throw new Error(`duplicate field '${field.name}' for ${this.item.citekey}`)
      this.remove(field.name)
    }

    if (!field.bibtex) {
      if ((typeof field.value === 'number') || (field.bibtexStrings && this.isBibString(field.value))) {
        field.bibtex = `${field.value}`

      } else {
        const enc = field.enc || this.fieldEncoding[field.name] || 'latex'
        let value = this[`enc_${enc}`](field, this.item.raw)

        if (!value) return null

        value = value.trim()

        // scrub fields of unwanted {}, but not if it's a raw field or a bare field without spaces
        if (!field.bare || (field.value as string).match(/\s/)) {
          // clean up unnecesary {} when followed by a char that safely terminates the command before
          // value = value.replace(/({})+($|[{}$\/\\.;,])/g, '$2') // don't remove trailing {} https://github.com/retorquere/zotero-better-bibtex/issues/1091
          if (!(this.item.raw || field.raw)) value = value.replace(/({})+([{}\$\/\\\.;,])/g, '$2')
          value = `{${value}}`
        }

        field.bibtex = value
      }
    }

    this.has[field.name] = field

    return field.name
  }

  /*
   * Remove a field from the reference field set
   *
   * @param {name} field to remove.
   * @return {Object} the removed field, if present
   */
  public remove(name) {
    if (!this.has[name]) return
    const removed = this.has[name]
    delete this.has[name]
    return removed
  }

  public isBibString(value) {
    if (!value || typeof value !== 'string') return false

    switch (Translator.preferences.exportBibTeXStrings) {
      case 'off':
        return false
      case 'detect':
        return this.isBibStringRE.test(value)
      case 'match':
        return !!Exporter.strings[value.toUpperCase()] // the importer uppercases string declarations
      default:
        return false
    }
  }

  public hasCreator(type) { return (this.item.creators || []).some(creator => creator.creatorType === type) }

  public override(field: IField) {
    const itemtype_name = field.name.split('.')
    let name
    if (itemtype_name.length === 2) {
      if (this.referencetype !== itemtype_name[0]) return
      name = itemtype_name[1]
    } else {
      name = field.name
    }

    if ((typeof field.value === 'string') && (field.value.trim() === '')) {
      this.remove(name)
      return
    }

    this.add({ ...field, name, replace: (typeof field.replace !== 'boolean' && typeof field.fallback !== 'boolean') || field.replace })
  }

  public complete() {
    if ((this.item.collections || []).length && Translator.preferences.jabrefFormat === 4) { // tslint:disable-line:no-magic-numbers
      let groups = this.item.collections.filter(key => Translator.collections[key]).map(key => Translator.collections[key].name)
      groups = groups.sort().filter((item, pos, ary) => !pos || (item !== ary[pos - 1]))
      this.add({ name: 'groups', value: groups.join(',') })
    }

    if (this.item.extraFields.aliases.length) {
      this.add({ name: 'ids', value: this.item.extraFields.aliases.join(',') })
    }

    for (let [cslName, value] of Object.entries(this.item.extraFields.csl)) {
      // these are handled just like 'arxiv' and 'lccn', respectively
      if (['PMID', 'PMCID'].includes(cslName) && typeof value === 'string') {
        this.item.extraFields.tex[cslName.toLowerCase()] = { value }
        delete this.item.extraFields.csl[cslName]
        continue
      }

      const type = cslVariables[cslName]
      let name = null
      let replace = false
      let enc
      switch (type) {
        case 'string':
          enc = null
          break

        case 'creator':
          enc = 'creators'
          if (Array.isArray(value)) value = (value.map(Extra.zoteroCreator) as string[]) // yeah yeah, shut up TS
          break

        case 'date':
          enc = 'date'
          replace = true

        default:
          enc = type
      }

      // CSL names are not in BibTeX format, so only add it if there's a mapping
      if (Translator.BetterBibLaTeX) {
        switch (cslName) {
          case 'authority':
            name = 'institution'
            break

          case 'status':
            name = 'pubstate'
            break

          case 'title':
            name = this.referencetype === 'book' ? 'maintitle' : null
            break

          case 'container-title':
            switch (this.item.referenceType) {
              case 'film':
              case 'tvBroadcast':
              case 'videoRecording':
              case 'motion_picture':
                name = 'booktitle'
                break

              case 'bookSection':
              case 'chapter':
                name = 'maintitle'
                break

              default:
                name = 'journaltitle'
                break
            }
            break

          case 'original-publisher':
            name = 'origpublisher'
            enc = 'literal'
            break
          case 'original-publisher-place':
            name = 'origlocation'
            enc = 'literal'
            break

          case 'original-title':
            name = 'origtitle'
            break

          case 'original-date':
            name = 'origdate'
            enc = 'date'
            break

          case 'publisher-place':
            name = 'location'
            enc = 'literal'
            break

          case 'page':
            name = 'pages'
            break

          case 'issued':
            name = 'date'
            break

          // https://github.com/retorquere/zotero-better-bibtex/issues/644
          case 'event-place':
            name = 'venue'
            break

          case 'event-date':
            name = 'eventdate'
            break

          case 'accessed':
            name = 'urldate'
            break

          case 'number':
          case 'volume':
          case 'author':
          case 'director':
          case 'editor':
          case 'DOI':
          case 'ISBN':
          case 'ISSN':
            name = cslName.toLowerCase()
            break
        }
      }

      if (Translator.BetterBibTeX) {
        switch (cslName) {
          case 'call-number':
            name = 'lccn'
            break

          case 'DOI':
          case 'ISSN':
            name = cslName.toLowerCase()
            break
        }
      }

      if (name) {
        this.override({ name, verbatim: name, orig: { inherit: true }, value, enc, replace, fallback: !replace })
      } else {
        debug('Unmapped CSL field', cslName, '=', value)
      }
    }

    const tex = Translator.BetterBibLaTeX ? 'biblatex' : 'bibtex'
    const bibtexStrings = Translator.preferences.exportBibTeXStrings === 'match'
    for (const [name, field] of Object.entries(this.item.extraFields.tex)) {
      // psuedo-var, sets the reference type
      if (name === 'referencetype') {
        this.referencetype = field.value
        continue
      }

      if (field.type && field.type !== tex) continue

      switch (name) {
        case 'mr':
          this.override({ name: 'mrnumber', value: field.value, raw: field.raw })
          break
        case 'zbl':
          this.override({ name: 'zmnumber', value: field.value, raw: field.raw })
          break
        case 'lccn': case 'pmcid':
          this.override({ name, value: field.value, raw: field.raw })
          break
        case 'pmid':
        case 'arxiv':
        case 'jstor':
        case 'hdl':
          if (Translator.BetterBibLaTeX) {
            this.override({ name: 'eprinttype', value: name })
            this.override({ name: 'eprint', value: field.value, raw: field.raw })
          } else {
            this.override({ name, value: field.value, raw: field.raw })
          }
          break
        case 'googlebooksid':
          if (Translator.BetterBibLaTeX) {
            this.override({ name: 'eprinttype', value: 'googlebooks' })
            this.override({ name: 'eprint', value: field.value, raw: field.raw })
          } else {
            this.override({ name: 'googlebooks', value: field.value, raw: field.raw })
          }
          break
        case 'xref':
          this.override({ name, value: field.value, raw: field.raw })
          break

        default:
          this.override({ ...field, name, bibtexStrings })
          break
      }
    }

    let notes = ''
    if (Translator.options.exportNotes && this.item.notes && this.item.notes.length) {
      notes = this.item.notes.join('<p>')
    }
    const annotation = Translator.BetterBibTeX ? 'annote' : 'annotation'
    if (this.has.note && this.item.extra) {
      this.add({ name: annotation, value: notes ? `${this.item.extra.replace(/\n/g, '<br/>')}<p>${notes}` : this.item.extra, html: !!notes })
    } else {
      this.add({ name: 'note', value: this.item.extra })
      this.add({ name: annotation, value: notes, html: true })
    }

    // sort before postscript so the postscript can affect field order
    const keys = Object.keys(this.has).sort((a, b) => {
      const fa = fieldOrder[a]
      const fb = fieldOrder[b]

      if (fa && fb) return fa - fb
      if (fa) return -1
      if (fb) return 1
      return a.localeCompare(b)
    })
    for (const field of keys) {
      const value = this.has[field]
      delete this.has[field]
      this.has[field] = value
    }
    let cache
    try {
      cache = this.postscript(this, this.item, Translator, Zotero)
    } catch (err) {
      if (Translator.preferences.testing && !Translator.preferences.ignorePostscriptErrors) throw err
      debug('Reference.postscript failed:', err)
      cache = false
    }
    this.cachable = this.cachable && (typeof cache !== 'boolean' || cache)

    for (const name of Translator.skipFields) {
      this.remove(name)
    }

    if (this.has.url && this.has.doi) {
      switch (Translator.preferences.DOIandURL) {
        case 'url':
          delete this.has.doi
          break
        case 'doi':
          delete this.has.url
          break
      }
    }

    if (!this.has.url) this.remove('urldate')

    if (!Object.keys(this.has).length) this.add({name: 'type', value: this.referencetype})

    const fields = Object.values(this.has).map(field => `  ${field.name} = ${field.bibtex}`)

    let ref = `@${this.referencetype}{${this.item.citekey},\n`
    ref += fields.join(',\n')
    ref += '\n}\n'
    ref += this.qualityReport()
    ref += '\n'

    Zotero.write(ref)

    this.metadata.DeclarePrefChars = Exporter.unique_chars(this.metadata.DeclarePrefChars)

    this.metadata.packages = Object.keys(this.packages)
    if (Translator.caching && this.cachable) Zotero.BetterBibTeX.cacheStore(this.item.itemID, Translator.options, Translator.preferences, ref, this.metadata)

    Exporter.postfix.add(this)
  }

  /*
   * 'Encode' to raw LaTeX value
   *
   * @param {field} field to encode
   * @return {String} unmodified `field.value`
   */
  protected enc_raw(f) {
    return f.value
  }

  /*
   * Encode to LaTeX url
   *
   * @param {field} field to encode
   * @return {String} field.value encoded as verbatim LaTeX string (minimal escaping). If in Better BibTeX, wraps return value in `\url{string}`
   */
  protected enc_url(f) {
    const value = this.enc_verbatim(f)

    if (Translator.BetterBibTeX) {
      return `\\url{${value}}`
    } else {
      return value
    }
  }

  /*
   * Encode to verbatim LaTeX
   *
   * @param {field} field to encode
   * @return {String} field.value encoded as verbatim LaTeX string (minimal escaping).
   */
  protected enc_verbatim(f) {
    return this.toVerbatim(f.value)
  }

  protected _enc_creators_scrub_name(name) {
    return Zotero.Utilities.XRegExp.replace(name, this.whitespace, ' ', 'all')
  }
  /*
   * Encode creators to author-style field
   *
   * @param {field} field to encode. The 'value' must be an array of Zotero-serialized `creator` objects.
   * @return {String} field.value encoded as author-style value
   */
  protected enc_creators(f, raw) {
    if (f.value.length === 0) return null

    const encoded = []
    for (const creator of f.value) {
      let name
      if (creator.name || (creator.lastName && (creator.fieldMode === 1))) {
        name = creator.name || creator.lastName
        if (name !== 'others') name = raw ? `{${name}}` : this.enc_latex({value: new String(this._enc_creators_scrub_name(name))}) // tslint:disable-line:no-construct

      } else if (raw) {
        name = [creator.lastName || '', creator.firstName || ''].join(', ')

      } else if (creator.lastName || creator.firstName) {
        name = {
          family: this._enc_creators_scrub_name(creator.lastName || ''),
          given: this._enc_creators_scrub_name(creator.firstName || ''),
        }

        if (Translator.preferences.parseParticles) CSL.parseParticles(name)

        if (!Translator.BetterBibLaTeX || !Translator.preferences.biblatexExtendedNameFormat) {
          // side effects to set use-prefix/uniorcomma -- make sure addCreators is called *before* adding 'options'
          if (!this.useprefix) this.useprefix = !!name['non-dropping-particle']
          if (!this.juniorcomma) this.juniorcomma = (f.juniorcomma && name['comma-suffix'])
        }

        if (Translator.BetterBibTeX) {
          name = this._enc_creators_bibtex(name)
        } else {
          name = this._enc_creators_biblatex(name)
        }

        name = name.replace(/ and /g, ' {and} ')

      } else {
        continue
      }

      encoded.push(name.trim())
    }

    return encoded.join(' and ')
  }

  /*
   * Encode text to LaTeX literal list (double-braced)
   *
   * This encoding supports simple HTML markup.
   *
   * @param {field} field to encode.
   * @return {String} field.value encoded as author-style value
   */
  protected enc_literal(f, raw = false) {
    if (!f.value) return null
    return this.enc_latex({...f, value: Translator.preferences.exportBraceProtection ? new String(f.value) : f.value}, raw) // tslint:disable-line:no-construct
  }

  /*
   * Encode text to LaTeX
   *
   * This encoding supports simple HTML markup.
   *
   * @param {field} field to encode.
   * @return {String} field.value encoded as author-style value
   */
  protected enc_latex(f, raw = false) {
    if (typeof f.value === 'number') return f.value
    if (!f.value) return null

    if (Array.isArray(f.value)) {
      if (f.value.length === 0) return null
      return f.value.map(elt => this.enc_latex({...f, bibtex: undefined, value: elt}, raw)).join(f.sep || '')
    }

    if (f.raw || raw) return f.value

    const caseConversion = this.caseConversion[f.name] || f.caseConversion
    const latex = text2latex(f.value, {html: f.html, caseConversion: caseConversion && this.english})
    for (const pkg of latex.packages) {
      this.packages[pkg] = true
    }
    let value: String | string = latex.latex

    /*
      biblatex has a langid field it can use to exclude non-English
      titles from any lowercasing a style might request, so no
      additional protection by BBT is necessary. bibtex lacks a
      comparable mechanism, so the only thing BBT can do to tell
      bibtex to back off from non-English titles is to wrap the whole
      thing in braces.
    */
    if (caseConversion && Translator.BetterBibTeX && !this.english && Translator.preferences.exportBraceProtection) value = `{${value}}`

    if (f.value instanceof String && !latex.raw) value = new String(`{${value}}`) // tslint:disable-line:no-construct
    return value
  }

  protected enc_tags(f) {
    const tags = f.value
      .map(tag => (typeof tag === 'string' ? { tag } : tag))
      .filter(tag => (Translator.preferences.automaticTags || (tag.type !== 1)) && tag.tag !== Translator.preferences.rawLaTag)
    if (tags.length === 0) return null

    tags.sort((a, b) => Translator.stringCompare(a.tag, b.tag))

    for (const tag of tags) {
      if (Translator.BetterBibTeX) {
        tag.tag = tag.tag.replace(/([#\\%&])/g, '\\$1')
      } else {
        tag.tag = tag.tag.replace(/([#%\\])/g, '\\$1')
      }

      // the , -> ; is unfortunate, but I see no other way
      tag.tag = tag.tag.replace(/,/g, ';')

      // verbatim fields require balanced braces -- please just don't use braces in your tags
      let balanced = 0
      for (const ch of tag.tag) {
        switch (ch) {
          case '{': balanced += 1; break
          case '}': balanced -= 1; break
        }
        if (balanced < 0) break
      }
      if (balanced !== 0) tag.tag = tag.tag.replace(/{/g, '(').replace(/}/g, ')')
    }

    return tags.map(tag => tag.tag).join(',')
  }

  protected enc_attachments(f) {
    if (!f.value || (f.value.length === 0)) return null
    const attachments = []
    const errors = []

    for (const attachment of f.value) {
      const att = {
        title: attachment.title,
        mimetype: attachment.contentType || '',
        path: '',
      }

      if (Translator.options.exportFileData) {
        att.path = attachment.saveFile ? attachment.defaultPath : ''
      } else if (attachment.localPath) {
        att.path = attachment.localPath
      }

      if (!att.path) continue // amazon/googlebooks etc links show up as atachments without a path
      // att.path = att.path.replace(/^storage:/, '')
      att.path = att.path.replace(/(?:\s*[{}]+)+\s*/g, ' ')

      if (Translator.options.exportFileData) {
        attachment.saveFile(att.path, true)
      }

      if (!att.title) att.title = att.path.replace(/.*[\\\/]/, '') || 'attachment'

      if (!att.mimetype && (att.path.slice(-4).toLowerCase() === '.pdf')) att.mimetype = 'application/pdf' // tslint:disable-line:no-magic-numbers

      if (Translator.preferences.testing) {
        att.path = `files/${this.item.citekey}/${att.path.replace(/.*[\/\\]/, '')}`
      } else if (Translator.preferences.relativeFilePaths && Translator.exportDir) {
        const relative = Path.relative(att.path)
        if (relative !== att.path) {
          this.cachable = false
          att.path = relative
        }
      }

      attachments.push(att)
    }

    if (errors.length !== 0) f.errors = errors
    if (attachments.length === 0) return null

    // sort attachments for stable tests, and to make non-snapshots the default for JabRef to open (#355)
    attachments.sort((a, b) => {
      if ((a.mimetype === 'text/html') && (b.mimetype !== 'text/html')) return 1
      if ((b.mimetype === 'text/html') && (a.mimetype !== 'text/html')) return -1
      return Translator.stringCompare(a.path, b.path)
    })

    if (Translator.preferences.jabrefFormat) return attachments.map(att => [att.title, att.path, att.mimetype].map(part => part.replace(/([\\{}:;])/g, '\\$1')).join(':')).join(';')
    return attachments.map(att => att.path.replace(/([\\{}:;])/g, '\\$1')).join(';')
  }

  private _enc_creators_pad_particle(particle, relax = false) {
    // space at end is always OK
    if (particle[particle.length - 1] === ' ') return particle

    if (Translator.BetterBibLaTeX) {
      if (Zotero.Utilities.XRegExp.test(particle, this.punctuationAtEnd)) this.metadata.DeclarePrefChars += particle[particle.length - 1]
      // if BBLT, always add a space if it isn't there
      return particle + ' '
    }

    // otherwise, we're in BBT.

    // If the particle ends in a period, add a space
    if (particle[particle.length - 1] === '.') return particle + ' '

    // if it ends in any other punctuation, it's probably something like d'Medici -- no space
    if (Zotero.Utilities.XRegExp.test(particle, this.punctuationAtEnd)) {
      if (relax) return `${particle}${this._enc_creators_relax_marker} `
      return particle
    }

    // otherwise, add a space
    return particle + ' '
  }

  private _enc_creators_biblatex(name) {
    let family, latex
    if ((name.family.length > 1) && (name.family[0] === '"') && (name.family[name.family.length - 1] === '"')) {
      family = new String(name.family.slice(1, -1)) // tslint:disable-line:no-construct
    } else {
      ({ family } = name)
    }

    let initials = (name.given || '').indexOf(this._enc_creators_initials_marker) // end of guarded area

    if (Translator.preferences.biblatexExtendedNameFormat && (name['dropping-particle'] || name['non-dropping-particle'] || name['comma-suffix'])) {
      if (initials >= 0) {
        initials = name.given.substring(0, initials)
        if (initials.length > 1) initials = new String(initials) // tslint:disable-line:no-construct
        name.given = name.given.replace(this._enc_creators_initials_marker, '')
      } else {
        initials = ''
      }

      latex = []
      if (family) latex.push(`family=${this.enc_latex({value: family})}`)
      if (name.given) latex.push(`given=${this.enc_latex({value: name.given})}`)
      if (initials) latex.push(`given-i=${this.enc_latex({value: initials})}`)
      if (name.suffix) latex.push(`suffix=${this.enc_latex({value: name.suffix})}`)
      if (name['dropping-particle'] || name['non-dropping-particle']) {
        latex.push(`prefix=${this.enc_latex({value: name['dropping-particle'] || name['non-dropping-particle']})}`)
        latex.push(`useprefix=${!!name['non-dropping-particle']}`)
      }
      if (name['comma-suffix']) latex.push('juniorcomma=true')
      return latex.join(', ')
    }

    if (family && Zotero.Utilities.XRegExp.test(family, this.startsWithLowercase)) family = new String(family) // tslint:disable-line:no-construct

    if (family) family = this.enc_latex({value: family})

    if (initials >= 0) name.given = `<span relax="true">${name.given.replace(this._enc_creators_initials_marker, '</span>')}`

    latex = ''
    if (name['dropping-particle']) latex += this.enc_latex({value: this._enc_creators_pad_particle(name['dropping-particle'])})
    if (name['non-dropping-particle']) latex += this.enc_latex({value: this._enc_creators_pad_particle(name['non-dropping-particle'])})
    if (family) latex += family
    if (name.suffix) latex += `, ${this.enc_latex({value: name.suffix})}`
    if (name.given) latex += `, ${this.enc_latex({value: name.given})}`

    return latex
  }

  private _enc_creators_bibtex(name) {
    let family
    if ((name.family.length > 1) && (name.family[0] === '"') && (name.family[name.family.length - 1] === '"')) { // quoted
      family = new String(name.family.slice(1, -1)) // tslint:disable-line:no-construct
    } else {
      family = name.family
    }

    if (name.given && (name.given.indexOf(this._enc_creators_initials_marker) >= 0)) {
      name.given = `<span relax="true">${name.given.replace(this._enc_creators_initials_marker, '</span>')}`
    }

    /*
      TODO: http://chat.stackexchange.com/rooms/34705/discussion-between-retorquere-and-egreg

      My advice is never using the alpha style; it's a relic of the past, when numbering citations was very difficult
      because one didn't know the full citation list when writing a paper. In order to have the bibliography in
      alphabetical order, such tricks were devised. The alternative was listing the citation in order of appearance.
      Your document gains nothing with something like XYZ88 as citation key.

      The “van” problem should be left to the bibliographic style. Some styles consider “van” as part of the name, some
      don't. In any case, you'll have a kludge, mostly unportable. However, if you want van Gogh to be realized as vGo
      in the label, use {\relax van} Gogh or something like this.
    */

    if (name['non-dropping-particle']) family = new String(this._enc_creators_pad_particle(name['non-dropping-particle']) + family) // tslint:disable-line:no-construct
    if (Zotero.Utilities.XRegExp.test(family, this.startsWithLowercase) || Zotero.Utilities.XRegExp.test(family, this.hasLowercaseWord)) family = new String(family) // tslint:disable-line:no-construct

    // https://github.com/retorquere/zotero-better-bibtex/issues/978 -- enc_latex can return null
    family = this.enc_latex({value: family}) || ''

    // https://github.com/retorquere/zotero-better-bibtex/issues/976#issuecomment-393442419
    if (family[0] !== '{' && name.family.match(/[-\u2014\u2015\u2012\u2013]/)) family = `{${family}}`

    if (name['dropping-particle']) family = this.enc_latex({value: this._enc_creators_pad_particle(name['dropping-particle'], true)}) + family

    if (Translator.BetterBibTeX && Translator.preferences.bibtexParticleNoOp && (name['non-dropping-particle'] || name['dropping-particle'])) {
      family = `{\\noopsort{${this.enc_latex({value: name.family.toLowerCase()})}}}${family}`
      this.metadata.noopsort = true
    }

    if (name.given) name.given = this.enc_latex({value: name.given})
    if (name.suffix) name.suffix = this.enc_latex({value: name.suffix})

    let latex = family
    if (name.suffix) latex += `, ${name.suffix}`
    if (name.given) latex += `, ${name.given}`

    return latex
  }

  private postscript(_reference, _item, _translator, _zotero) {} // tslint:disable-line:no-empty

  private toVerbatim(text) {
    text = text || ''

    let value
    if (Translator.BetterBibTeX) {
      value = text.replace(/([#\\%&{}])/g, '\\$1')
    } else {
      value = text.replace(/([\\{}])/g, '\\$1')
    }
    if (!Translator.unicode) value = value.replace(/[^\x20-\x7E]/g, (chr => `\\%${`00${chr.charCodeAt(0).toString(16).slice(-2)}`}`)) // tslint:disable-line:no-magic-numbers
    return value
  }

  private qualityReport() {
    if (!Translator.preferences.qualityReport) return ''

    let report = this.lint({
      timestamp: `added because JabRef format is set to ${Translator.preferences.jabrefFormat || '?'}`,
    })

    if (report) {
      if (this.has.pages) {
        const dashes = this.has.pages.bibtex.match(/-+/g)
        // if (dashes && dashes.includes('-')) report.push('? hyphen found in pages field, did you mean to use an en-dash?')
        if (dashes && dashes.includes('---')) report.push('? em-dash found in pages field, did you mean to use an en-dash?')
      }
      if (this.has.journal && this.has.journal.value.indexOf('.') >= 0) report.push(`? Possibly abbreviated journal title ${this.has.journal.value}`)
      if (this.has.journaltitle && this.has.journaltitle.value.indexOf('.') >= 0) report.push(`? Possibly abbreviated journal title ${this.has.journaltitle.value}`)

      if (this.referencetype === 'inproceedings' && this.has.booktitle) {
        if (!this.has.booktitle.value.match(/:|Proceedings|Companion| '/) || this.has.booktitle.value.match(/\.|workshop|conference|symposium/)) {
          report.push('? Unsure about the formatting of the booktitle')
        }
      }

      if (this.has.title && Translator.preferences.exportTitleCase) {
        const titleCased = Zotero.BetterBibTeX.titleCase(this.has.title.value) === this.has.title.value
        if (this.has.title.value.match(/\s/)) {
          if (titleCased) report.push('? Title looks like it was stored in title-case in Zotero')
        } else {
          if (!titleCased) report.push('? Title looks like it was stored in lower-case in Zotero')
        }
      }
    } else {
      report = [`I don't know how to quality-check ${this.referencetype} references`]
    }

    if (!report.length) return ''

    report.unshift(`== ${Translator.BetterBibTeX ? 'BibTeX' : 'BibLateX'} quality report for ${this.item.citekey}:`)

    return report.map(line => `% ${line}\n`).join('')
  }
}

//  @polyglossia = [
//    'albanian'
//    'amharic'
//    'arabic'
//    'armenian'
//    'asturian'
//    'bahasai'
//    'bahasam'
//    'basque'
//    'bengali'
//    'brazilian'
//    'brazil'
//    'breton'
//    'bulgarian'
//    'catalan'
//    'coptic'
//    'croatian'
//    'czech'
//    'danish'
//    'divehi'
//    'dutch'
//    'english'
//    'british'
//    'ukenglish'
//    'esperanto'
//    'estonian'
//    'farsi'
//    'finnish'
//    'french'
//    'friulan'
//    'galician'
//    'german'
//    'austrian'
//    'naustrian'
//    'greek'
//    'hebrew'
//    'hindi'
//    'icelandic'
//    'interlingua'
//    'irish'
//    'italian'
//    'kannada'
//    'lao'
//    'latin'
//    'latvian'
//    'lithuanian'
//    'lsorbian'
//    'magyar'
//    'malayalam'
//    'marathi'
//    'nko'
//    'norsk'
//    'nynorsk'
//    'occitan'
//    'piedmontese'
//    'polish'
//    'portuges'
//    'romanian'
//    'romansh'
//    'russian'
//    'samin'
//    'sanskrit'
//    'scottish'
//    'serbian'
//    'slovak'
//    'slovenian'
//    'spanish'
//    'swedish'
//    'syriac'
//    'tamil'
//    'telugu'
//    'thai'
//    'tibetan'
//    'turkish'
//    'turkmen'
//    'ukrainian'
//    'urdu'
//    'usorbian'
//    'vietnamese'
//    'welsh'
//  ]
