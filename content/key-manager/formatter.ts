declare const Zotero: any
declare const Node: any
declare const Components: any

const fold2ascii = require('fold-to-ascii')
import PunyCode = require('punycode')
import scripts = require('xregexp/tools/output/scripts')
import { transliterate } from 'transliteration'

import { flash } from '../flash'
import { Preferences as Prefs } from '../prefs'
import * as log from '../debug'
import { JournalAbbrev } from '../journal-abbrev'
import { kuroshiro } from './kuroshiro'
import * as Extra from '../extra'
import { buildCiteKey as zotero_buildCiteKey } from './formatter-zotero'

const parser = require('./formatter.pegjs')
import * as DateParser from '../dateparser'

import { parseScript } from 'meriyah'

import * as defaults from '../../gen/preferences/defaults.json'

import parse5 = require('parse5/lib/parser')
const htmlParser = new parse5()

function innerText(node) {
  if (node.nodeName === '#text') return node.value
  if (node.childNodes) return node.childNodes.map(innerText).join('')
  return ''
}

const script = {
  han: new RegExp('([' + scripts.find(s => s.name === 'Han').bmp + '])', 'g'), // tslint:disable-line prefer-template
}

type PartialDate = {
  Y?: string
  y?: string
  m?: string
  d?: string
  oY?: string
  oy?: string
  om?: string
  od?: string

  H?: string
  M?: string
  S?: string
}

function argumentNames(fn): string[] {
  const source = 'function ' + fn.toString()
  log.debug('parsing', source)
  const ast = parseScript(source)

  if (ast.type === 'Program') {
    if (ast.body[0].type === 'FunctionDeclaration') {
      return ast.body[0].params.map(p => {
        switch (p.type) {
          case 'AssignmentPattern':
            if (p.left.type === 'Identifier') return p.left.name
            break

          case 'Identifier':
            return p.name
        }
        throw new Error(`Unexpected parameter declaration ${JSON.stringify(p)}`)
      })
    }
  }
  throw new Error(`No function declaration found in ${source}`)
}
function listMethods(obj) {
  const methods = { _: {}, $: {} }
  for (const method of Object.getOwnPropertyNames(Object.getPrototypeOf(obj))) {
    if (typeof obj[method] === 'function' && (method[0] === '_' || method[0] === '$')) {
      methods[method[0]][method.substring(1)] = argumentNames(obj[method])
    }
  }
  return { functions: methods.$, filters: methods._ }
}

const safechars = '-:\\p{L}0-9_!$*+./;\\[\\]'
class PatternFormatter {
  public generate: Function

  public itemTypes: Set<string>
  public fieldNames: Record<string, string>

  public methods: Record<'functions' | 'filters', Record<string, string>> = listMethods(this)

  private re = {
    unsafechars_allow_spaces: Zotero.Utilities.XRegExp(`[^${safechars}\\s]`),
    unsafechars: Zotero.Utilities.XRegExp(`[^${safechars}]`),
    alphanum: Zotero.Utilities.XRegExp('[^\\p{L}\\p{N}]'),
    punct: Zotero.Utilities.XRegExp('\\p{Pe}|\\p{Pf}|\\p{Pi}|\\p{Po}|\\p{Ps}', 'g'),
    dash: Zotero.Utilities.XRegExp('(\\p{Pc}|\\p{Pd})+', 'g'),
    caseNotUpperTitle: Zotero.Utilities.XRegExp('[^\\p{Lu}\\p{Lt}]', 'g'),
    caseNotUpper: Zotero.Utilities.XRegExp('[^\\p{Lu}]', 'g'),
    word: Zotero.Utilities.XRegExp('[\\p{L}\\p{Nd}\\{Pc}\\p{M}]+(-[\\p{L}\\p{Nd}\\{Pc}\\p{M}]+)*', 'g'),
  }
  private language = {
    jp: 'japanese',
    japanese: 'japanese',
    de: 'german',
    german: 'german',
  }

  /*
   * three-letter month abbreviations. I assume these are the same ones that the
   * docs say are defined in some appendix of the LaTeX book. (I don't have the
   * LaTeX book.)
  */
  private months = { 1: 'jan', 2: 'feb', 3: 'mar', 4: 'apr', 5: 'may', 6: 'jun', 7: 'jul', 8: 'aug', 9: 'sep', 10: 'oct', 11: 'nov', 12: 'dec' }

  // tslint:disable-next-line:variable-name
  private DOMParser = Components.classes['@mozilla.org/xmlextras/domparser;1'].createInstance(Components.interfaces.nsIDOMParser)

  private item: {
    type: string
    language: string
    kv: Record<string, string>
    item: any

    date?: PartialDate

    title?: string
    tags?: string[]
    pages?: string
  }

  private skipWords: Set<string>

  private fold: boolean
  private citekeyFormat: string

  public init(itemTypes: Set<string>, fieldNames: Record<string, string>) {
    this.itemTypes = itemTypes
    this.fieldNames = fieldNames
  }

  public update(reason) {
    if (!this.itemTypes) throw new Error('PatternFormatter.update called before init')

    this.skipWords = new Set(Prefs.get('skipWords').split(',').map(word => word.trim()).filter(word => word))
    this.fold = Prefs.get('citekeyFold')

    for (const attempt of ['get', 'strip', 'reset']) {
      switch (attempt) {
        case 'get':
          // the zero-width-space is a marker to re-save the current default so it doesn't get replaced when the default changes later, which would change new keys suddenly
          this.citekeyFormat = (Prefs.get('citekeyFormat') || Prefs.clear('citekeyFormat')).replace(/^\u200B/, '')
          break

        case 'strip':
          let citekeyFormat = ''
          const errors = []
          for (const chunk of Prefs.get('citekeyFormat').replace(/^\u200B/, '').match(/[^\]]*\]*/g)) {
            try {
              this.parsePattern(citekeyFormat + chunk)
              citekeyFormat += chunk
            } catch (err) {
              errors.push(chunk)
            }
          }
          citekeyFormat = citekeyFormat.trim()
          if (citekeyFormat.includes('[')) {
            // tslint:disable-next-line:no-magic-numbers
            if (errors.length) flash('Malformed citation pattern', `removed malformed patterns:\n${errors.join('\n')}`, 20)
            Prefs.set('citekeyFormat', this.citekeyFormat = citekeyFormat)
          } else {
            continue
          }
          break

        case 'reset':
          // tslint:disable-next-line:no-magic-numbers
          flash('Malformed citation pattern', 'resetting to default', 20)
          Prefs.set('citekeyFormat', this.citekeyFormat = defaults.citekeyFormat.replace(/^\u200B/, ''))
          break
      }

      try {
        this.generate = new Function(this.parsePattern(this.citekeyFormat))
        break
      } catch (err) {
        log.error('PatternFormatter.update: Error parsing citekeyFormat ', {pattern: this.citekeyFormat}, err)
      }
    }
  }

  public parsePattern(pattern) {
    const formatter = parser.parse(pattern, this)
    log.debug('key formatter=', formatter)
    return formatter
  }

  public format(item) {
    this.item = {
      item,
      type: Zotero.ItemTypes.getName(item.itemTypeID),
      language: this.language[(item.getField('language') || '').toLowerCase()] || '',
      kv: Extra.get(item.getField('extra'), { kv: true }, 'zotero').extraFields.kv,
    }

    if (['attachment', 'note'].includes(this.item.type)) return {}

    try {
      this.item.date = this.parseDate(item.getField('date', false, true))
    } catch (err) {
      this.item.date = {}
    }
    if (this.item.kv['original-date'] || this.item.kv.priorityDate) {
      const date = this.parseDate(this.item.kv['original-date'] || this.item.kv.priorityDate)
      if (date.y) {
        Object.assign(this.item.date, { oy: date.y, om: date.m, od: date.d, oY: date.Y })
        if (!this.item.date.y) Object.assign(this.item.date, { y: date.y, m: date.m, d: date.d, Y: date.Y })
      }
    }

    try {
      this.item.title = item.getField('title', false, true) || ''
      if (this.item.title.includes('<')) this.item.title = innerText(htmlParser.parseFragment(this.item.title))
    } catch (err) {
      this.item.title = ''
    }

    const citekey = this.generate()

    if (!citekey.citekey) citekey.citekey = `zotero-${item.id}`
    if (citekey.citekey && this.fold) citekey.citekey = this.removeDiacritics(citekey.citekey)
    citekey.citekey = citekey.citekey.replace(/[\s{},@]/g, '')

    return citekey
  }

  private parseDate(v): PartialDate {
    v = v || ''
    const parsed: {
      y?: number
      m?: number
      d?: number
      oy?: number
      om?: number
      od?: number
    } = {}

    let date = DateParser.parse(v, Zotero.BetterBibTeX.localeDateOrder)
    if (date.type === 'list') date = date.dates.find(d => d.type !== 'open') || date.dates[0]
    if (date.type === 'interval') date = (date.from && date.from.type !== 'open') ? date.from : date.to
    if (!date.type) date.type = 'date' // will rescue 'orig' if present

    switch (date.type) {
      case 'open':
        break

      case 'verbatim':
        const reparsed = Zotero.Date.strToDate(date.verbatim)
        if (typeof reparsed.year === 'number' || reparsed.year) {
          parsed.y = reparsed.year
          parsed.m = parseInt(reparsed.month) || undefined
          parsed.d = parseInt(reparsed.day) || undefined

        } else {
          parsed.y = parsed.oy = date.verbatim

        }

        break

      case 'date':
        Object.assign(parsed, { y: date.year, m: date.month, d: date.day })

        if (date.orig) {
          Object.assign(parsed, { oy: date.orig.year, om: date.orig.month, od: date.orig.day })
          if (typeof date.year !== 'number') Object.assign(parsed, { y: date.orig.year, m: date.orig.month, d: date.orig.day })
        } else {
          Object.assign(parsed, { oy: date.year, om: date.month, od: date.day })
        }
        break

      case 'season':
        parsed.y = parsed.oy = date.year
        break

      default:
        throw new Error(`Unexpected parsed date ${JSON.stringify(v)} => ${JSON.stringify(date)}`)
    }

    const res: PartialDate = {}

    res.m = (typeof parsed.m !== 'undefined') ? ('' + parsed.m) : ''
    res.d = (typeof parsed.d !== 'undefined') ? ('' + parsed.d) : ''
    res.y = (typeof parsed.y !== 'undefined') ? ('' + (parsed.y % 100)) : '' // tslint:disable-line:no-magic-numbers
    res.Y = (typeof parsed.y !== 'undefined') ? ('' + parsed.y) : ''
    res.om = (typeof parsed.om !== 'undefined') ? ('' + parsed.om) : ''
    res.od = (typeof parsed.od !== 'undefined') ? ('' + parsed.od) : ''
    res.oy = (typeof parsed.oy !== 'undefined') ? ('' + (parsed.oy % 100)) : '' // tslint:disable-line:no-magic-numbers
    res.oY = (typeof parsed.oy !== 'undefined') ? ('' + parsed.oy) : ''
    if (date.type !== 'verbatim') {
      const [ , H, M, S ] = v.match(/(?: |T)([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?(?:[A-Z]+|[-+][0-9]+)?$/) || [null, '', '', '']
      Object.assign(res, { H, M, S })
      res.S = res.S || ''
    } else {
      Object.assign(res, { H: '', M: '', S: '' })
    }

    return res
  }

  /** Generates citation keys as the stock Zotero Bib(La)TeX export does. Note that this pattern inherits all the problems of the original Zotero citekey generation -- you should really only use this if you have existing papers that rely on this behavior. */
  public $zotero() {
    return zotero_buildCiteKey({
      creators: this.item.item.getCreators(),
      title: this.item.item.getField('title'),
      date: this.item.item.getField('date'),
      dateAdded: this.item.item.getField('dateAdded'),
    }, null, {})
  }

  public $property(name) {
    try {
      return this.innerText(this.item.item.getField(name, false, true) || '')
    } catch (err) {}

    try {
      return this.innerText(this.item.item.getField(name[0].toLowerCase() + name.slice(1), false, true) || '')
    } catch (err) {}

    return ''
  }

  /** returns the name of the shared group library, or nothing if the reference is in your personal library */
  public $library() {
    if (this.item.item.libraryID === Zotero.Libraries.userLibraryID) return ''
    return Zotero.Libraries.get(this.item.item.libraryID).name
  }

  /** The first `N` (default: all) characters of the `M`th (default: first) author's last name. */
  public $auth(onlyEditors, withInitials, joiner, n, m) {
    const authors = this.creators(onlyEditors, {withInitials})
    if (!authors || !authors.length) return ''
    let author = authors[m ? m - 1 : 0]
    if (author && n) author = author.substring(0, n)
    return author || ''
  }

  /** The forename initial of the first author. */
  public $authForeIni(onlyEditors) {
    const authors = this.creators(onlyEditors, {initialOnly: true})
    if (!authors || !authors.length) return ''
    return authors[0]
  }

  /** The forename initial of the last author. */
  public $authorLastForeIni(onlyEditors) {
    const authors = this.creators(onlyEditors, {initialOnly: true})
    if (!authors || !authors.length) return ''
    return authors[authors.length - 1]
  }

  /** The last name of the last author */
  public $authorLast(onlyEditors, withInitials, joiner) {
    const authors = this.creators(onlyEditors, {withInitials})
    if (!authors || !authors.length) return ''
    return authors[authors.length - 1]
  }

  /** returns the journal abbreviation, or, if not found, the journal title, If 'automatic journal abbreviation' is enabled in the BBT settings,
   * it will use the same abbreviation filter Zotero uses in the wordprocessor integration. You might want to use the `abbr` filter on this.
   */
  public $journal() { return JournalAbbrev.get(this.item.item, true) || this.item.item.getField('publicationTitle', false, true) }

  /** The last name of up to N authors. If there are more authors, "EtAl" is appended. */
  public $authors(onlyEditors, withInitials, joiner, n) {
    let authors = this.creators(onlyEditors, {withInitials})
    if (!authors || !authors.length) return ''

    if (n) {
      const etal = authors.length > n
      authors = authors.slice(0, n)
      if (etal) authors.push('EtAl')
    }

    return authors.join(joiner || ' ')
  }

  /** Corresponds to the BibTeX style "alpha". One author: First three letters of the last name. Two to four authors: First letters of last names concatenated.
   * More than four authors: First letters of last names of first three authors concatenated. "+" at the end.
   */
  public $authorsAlpha(onlyEditors, withInitials, joiner) {
    const authors = this.creators(onlyEditors, {withInitials})
    if (!authors || !authors.length) return ''

    switch (authors.length) {
      case 1: // tslint:disable-line:no-magic-numbers
        return authors[0].substring(0, 3) // tslint:disable-line:no-magic-numbers

      case 2: // tslint:disable-line:no-magic-numbers
      case 3: // tslint:disable-line:no-magic-numbers
      case 4: // tslint:disable-line:no-magic-numbers
        return authors.map(author => author.substring(0, 1)).join(joiner || ' ')

      default:
        // tslint:disable-next-line:no-magic-numbers
        return authors.slice(0, 3).map(author => author.substring(0, 1)).join(joiner || ' ') + '+'
    }
  }

  /** The beginning of each author's last name, using no more than `N` characters. */
  public $authIni(onlyEditors, withInitials, joiner, n) {
    const authors = this.creators(onlyEditors, {withInitials})
    if (!authors || !authors.length) return ''
    return authors.map(author => author.substring(0, n)).join(joiner || '.')
  }

  /** The first 5 characters of the first author's last name, and the last name initials of the remaining authors. */
  public $authorIni(onlyEditors, withInitials, joiner) {
    const authors = this.creators(onlyEditors, {withInitials})
    if (!authors || !authors.length) return ''
    const firstAuthor = authors.shift()

    // tslint:disable-next-line:no-magic-numbers
    return [firstAuthor.substring(0, 5)].concat(authors.map(auth => auth.map(name => name.substring(0, 1)).join('.'))).join(joiner || '.')
  }

  /** The last name of the first two authors, and ".ea" if there are more than two. */
  public $auth_auth_ea(onlyEditors, withInitials, joiner) {
    const authors = this.creators(onlyEditors, {withInitials})
    if (!authors || !authors.length) return ''

    // tslint:disable-next-line:no-magic-numbers
    return authors.slice(0, 2).concat(authors.length > 2 ? ['ea'] : []).join(joiner || '.')
  }

  /** The last name of the first author, and the last name of the second author if there are two authors or "EtAl" if there are more than two. This is similar to `auth.etal`. The difference is that the authors are not separated by "." and in case of more than 2 authors "EtAl" instead of ".etal" is appended. */
  public $authEtAl(onlyEditors, withInitials, joiner) {
    const authors = this.creators(onlyEditors, {withInitials})
    if (!authors || !authors.length) return ''

    // tslint:disable-next-line:no-magic-numbers
    if (authors.length === 2) return authors.join(joiner || ' ')
    return authors.slice(0, 1).concat(authors.length > 1 ? ['EtAl'] : []).join(joiner || ' ')
  }

  /** The last name of the first author, and the last name of the second author if there are two authors or ".etal" if there are more than two. */
  public $auth_etal(onlyEditors, withInitials, joiner) {
    const authors = this.creators(onlyEditors, {withInitials})
    if (!authors || !authors.length) return ''

    // tslint:disable-next-line:no-magic-numbers
    if (authors.length === 2) return authors.join(joiner || '.')
    return authors.slice(0, 1).concat(authors.length > 1 ? ['etal'] : []).join(joiner || '.')
  }

  /** The last name if one author is given; the first character of up to three authors' last names if more than one author is given. A plus character is added, if there are more than three authors. */
  public $authshort(onlyEditors, withInitials, joiner) {
    const authors = this.creators(onlyEditors, {withInitials})
    if (!authors || !authors.length) return ''

    switch (authors.length) {
      case 0:
        return ''

      case 1:
        return authors[0]

      default:
        // tslint:disable-next-line:no-magic-numbers
        return authors.slice(0, 3).map(author => author.substring(0, 1)).join(joiner || '.') + (authors.length > 3 ? '+' : '')
    }
  }

  /** The number of the first page of the publication (Caution: this will return the lowest number found in the pages field, since BibTeX allows `7,41,73--97` or `43+`.) */
  public $firstpage() {
    if (typeof this.item.pages !== 'string') this.item.pages = (this.item.item.getField('pages', false, true) || '')
    return this.item.pages.split(/[-\s,–]/)[0] || ''
  }

  /** The number of the last page of the publication (See the remark on `firstpage`) */
  public $lastpage() {
    if (typeof this.item.pages !== 'string') this.item.pages = (this.item.item.getField('pages', false, true) || '')
    return this.item.pages.split(/[-\s,–]/).pop() || ''
  }

  /** Tag number `N` */
  public $keyword(n) {
    this.item.tags = this.item.tags || this.item.item.getTags().map(tag => tag.tag).sort((a, b) => a.localeCompare(b))
    return this.item.tags[n] || ''
  }

  /* internal alphanumeric zotero item key
  public $key() {
    return this.item.item.key
  }
  */

  /** The first `N` (default: 3) words of the title, apply capitalization to first `M` (default: 0) of those */
  public $shorttitle(n = 3, m = 0) { // tslint:disable-line:no-magic-numbers
    const words = this.titleWords(this.item.title, { skipWords: true, asciiOnly: true})
    if (!words) return ''

    return words.slice(0, n).map((word, i) => i < m ? word.charAt(0).toUpperCase() + word.slice(1) : word).join(' ')
  }

  /** The first `N` (default: 1) words of the title, apply capitalization to first `M` (default: 0) of those */
  public $veryshorttitle(n = 1, m = 0) { // tslint:disable-line:no-magic-numbers
    return this.$shorttitle(n, m)
  }

  /** The last 2 digits of the publication year */
  public $shortyear() {
    return this._format_date(this.item.date, '%y')
  }

  /** The year of the publication */
  public $year() {
    return this.padYear(this._format_date(this.item.date, '%-Y'), 2)
  }

  /** The date of the publication */
  public $date(format = '%Y-%m-%d') {
    return this._format_date(this.item.date, format)
  }

  /** the original year of the publication */
  public $origyear() {
    return this.padYear(this._format_date(this.item.date, '%-oY'), 2)
  }

  /** the original date of the publication */
  public $origdate() {
    return this._format_date(this.item.date, '%oY-%om-%od')
  }

  /** the month of the publication */
  public $month() {
    return this.months[this.item.date.m] || ''
  }

  /** Capitalize all the significant words of the title, and concatenate them. For example, `An awesome paper on JabRef` will become `AnAwesomePaperJabref` */
  public $title() { return (this.titleWords(this.item.title) || []).join(' ') }

  private padYear(year, length) {
    return year ? year.replace(/[0-9]+/, y => y.length >= length ? y : ('0000' + y).slice(-length)): ''
  }

  /** formats date as by replacing y, m and d in the format */
  public _format_date(value: string | PartialDate, format='%Y-%m-%d') {
    if (!value) return ''

    const date = (typeof value === 'string') ? this.parseDate(value) : value

    let keep = true
    const formatted = format.split(/(%-?o?[a-z]|%%)/i).map((spec, i, arr) => {
      if ((i % 2) === 0) return spec
      if (spec === '%%') return '%'

      const pad = spec[1] !== '-'
      const field = spec.substring(pad ? 1 : 2)
      let repl = date[field]
      if (typeof repl !== 'string') throw new Error(`:format-date: unsupported formatter ${JSON.stringify(spec)}`)
      if (!repl) return null

      if (pad) repl = this.padYear(repl, (field === 'Y' || field === 'oY') ? 4 : 2) // tslint:disable-line:no-magic-numbers

      return repl

    }).filter((field, i, arr) => {
      if ((i % 2) === 0) { // separator, peek ahead
        keep = keep && arr[i + 1]
      } else {
        keep = keep && field
      }
      return keep

    }).join('')

    return formatted
  }

  /** returns the value if it's an integer */
  public _numeric(value) {
    return isNaN(parseInt(value)) ? '' : value
  }

  /** replaces text, case insensitive; `:replace=.etal,&etal` will replace `.EtAl` with `&etal` */
  public _replace(value, find, replace) {
    if (!find || !replace) return (value || '')
    return (value || '').replace(new RegExp(find.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&'), 'ig'), replace)
  }

  /**
   * this replaces spaces in the value passed in. You can specify what to replace it with by adding it as a
   * parameter, e.g `condense=_` will replace spaces with underscores. **Parameters should not contain spaces** unless
   * you want the spaces in the value passed in to be replaced with those spaces in the parameter
   */
  public _condense(value, sep) {
    return (value || '').replace(/\s/g, sep || '')
  }

  /**
   * prefixes with its parameter, so `prefix=_` will add an underscore to the front if, and only if, the value
   * it is supposed to prefix isn't empty. If you want to use a reserved character (such as `:` or `\`), you'll need to
   * add a backslash (`\`) in front of it.
   */
  public _prefix(value, prefix) {
    value = value || ''
    if (value && prefix) return `${prefix}${value}`
    return value
  }

  /**
   * postfixes with its parameter, so `postfix=_` will add an underscore to the end if, and only if, the value
   * it is supposed to postfix isn't empty
   */
  public _postfix(value, postfix) {
    value = value || ''
    if (value && postfix) return `${value}${postfix}`
    return value
  }

  /**
   * Abbreviates the text. Only the first character and subsequent characters following white space will be included.
   */
  public _abbr(value) {
    return (value || '').split(/\s+/).map(word => word.substring(0, 1)).join(' ')
  }

  /** Forces the text inserted by the field marker to be in lowercase. For example, `[auth:lower]` expands the last name of the first author in lowercase. */
  public _lower(value) {
    return (value || '').toLowerCase()
  }

  /** Forces the text inserted by the field marker to be in uppercase. For example, `[auth:upper]` expands the last name of the first author in uppercase. */
  public _upper(value) {
    return (value || '').toUpperCase()
  }

  /**
   * filters out common words like 'of', 'the', ... the list of words can be seen and changed by going into
   * `about:config` under the key `extensions.zotero.translators.better-bibtex.skipWords` as a comma-separated,
   * case-insensitive list of words.
   *
   * If you want to strip words like 'Jr.' from names, you could use something like `[Auth:nopunct:skipwords:fold]`
   * after adding `jr` to the skipWords list.
   * Note that this filter is always applied if you use `title` (which is different from `Title`) or `shorttitle`.
   */
  public _skipwords(value) {
    return (value || '').split(/\s+/).filter(word => !this.skipWords.has(word.toLowerCase())).join(' ').trim()
  }

  /**
   * selects words from the value passed in. The format is `select=start,number` (1-based), so `select=1,4`
   * would select the first four words. If `number` is not given, all words from `start` to the end of the list are
   * selected.
   */
  public _select(value, start, n) {
    value = (value || '').split(/\s+/)
    let end = value.length

    if (typeof start === 'undefined') start = 1
    start = parseInt(start) - 1
    if (typeof n !== 'undefined') end = start + parseInt(n)
    return value.slice(start, end).join(' ')
  }

  /** (`substring=start,n`) selects `n` (default: all) characters starting at `start` (default: 1) */
  public _substring(value, start, n) {
    start = parseInt(start)
    if (isNaN(start)) start = 1
    n = parseInt(n)
    if (isNaN(n)) n = value.length

    return (value || '').slice(parseInt(start) - 1, (start - 1) + n)
  }

  /** removes all non-ascii characters */
  public _ascii(value) {
    return (value || '').replace(/[^ -~]/g, '').split(/\s+/).join(' ').trim()
  }

  /** clears out everything but unicode alphanumeric characters (unicode character classes `L` and `N`) */
  public _alphanum(value) {
    return Zotero.Utilities.XRegExp.replace(value || '', this.re.alphanum, '', 'all').split(/\s+/).join(' ').trim()
  }

  /** tries to replace diacritics with ascii look-alikes. Removes non-ascii characters it cannot match */
  public _fold(value, mode?: string) {
    return this.removeDiacritics(value, mode).split(/\s+/).join(' ').trim()
  }

  /** uppercases the first letter of each word */
  public _capitalize(value) {
    return (value || '').replace(/((^|\s)[a-z])/g, m => m.toUpperCase())
  }

  /** Removes punctuation */
  public _nopunct(value) {
    value = value || ''
    value = Zotero.Utilities.XRegExp.replace(value, this.re.dash, '-', 'all')
    value = Zotero.Utilities.XRegExp.replace(value, this.re.punct, '', 'all')
    return value
  }

  /** Removes punctuation and word-connecting dashes */
  public _nopunctordash(value) {
    value = value || ''
    value = Zotero.Utilities.XRegExp.replace(value, this.re.dash, '', 'all')
    value = Zotero.Utilities.XRegExp.replace(value, this.re.punct, '', 'all')
    return value
  }

  /** Treat ideaographs as individual words */
  public _split_ideographs(value) {
    return (value || '').replace(script.han, ' $1 ').trim()
  }

  /** transliterates the citation key and removes unsafe characters */
  public _clean(value) {
    if (!value) return ''
    return this.clean(value)
  }

  /** transliterates the citation key */
  public _transliterate(value) {
    if (!value) return ''
    return this.removeDiacritics(value)
  }

  private removeDiacritics(str, mode?: string) {
    mode = mode || this.item.language

    if (mode === 'japanese') mode = null
    const replace = {
      german: {
        '\u00E4': 'ae', // tslint:disable-line:object-literal-key-quotes
        '\u00F6': 'oe', // tslint:disable-line:object-literal-key-quotes
        '\u00FC': 'ue', // tslint:disable-line:object-literal-key-quotes
        '\u00C4': 'Ae', // tslint:disable-line:object-literal-key-quotes
        '\u00D6': 'Oe', // tslint:disable-line:object-literal-key-quotes
        '\u00DC': 'Ue', // tslint:disable-line:object-literal-key-quotes
      },
    }[mode]
    if (mode && !replace) throw new Error(`Unsupported fold mode "${mode}"`)

    if (kuroshiro.enabled) str = kuroshiro.convert(str, {to: 'romaji'})
    str = transliterate(str || '', {
      unknown: '\uFFFD', // unicode replacement char
      replace,
    })

    str = fold2ascii.foldMaintaining(str)

    return str
  }

  private clean(str, allow_spaces = false) {
    return Zotero.Utilities.XRegExp.replace(this.removeDiacritics(str), allow_spaces ? this.re.unsafechars_allow_spaces : this.re.unsafechars, '', 'all').trim()
  }

  private titleWords(title, options: { asciiOnly?: boolean, skipWords?: boolean} = {}) {
    if (!title) return null

    title = this.innerText(title)

    if (options.asciiOnly && kuroshiro.enabled) title = kuroshiro.convert(title, {to: 'romaji', mode: 'spaced'})

    // 551
    let words = (Zotero.Utilities.XRegExp.matchChain(title, [this.re.word]).map(word => this.clean(word).replace(/-/g, '')))

    if (options.asciiOnly) words = words.map(word => word.replace(/[^ -~]/g, ''))
    words = words.filter(word => word)
    if (options.skipWords) words = words.filter(word => !this.skipWords.has(word.toLowerCase()) && (PunyCode.ucs2.decode(word).length > 1) || word.match(script.han))
    if (words.length === 0) return null
    return words
  }

  private innerText(str) {
    if (!str) return ''
    let doc = this.DOMParser.parseFromString(`<span>${str}</span>`, 'text/html')
    if (doc.nodeType === Node.DOCUMENT_NODE) doc = doc.documentElement
    return doc.textContent
  }

  private stripQuotes(name) {
    if (!name) return ''
    if (name.length >= 2 && name[0] === '"' && name[name.length - 1] === '"') return name.slice(1, -1)
    return name
  }

  private initial(creator) {
    if (!creator.firstName) return ''

    const firstName = this.stripQuotes(creator.firstName)

    let initial, m
    if (m = firstName.match(/(.+)\u0097/)) {
      initial = m[1]
    } else {
      initial = firstName[0]
    }

    return this.removeDiacritics(initial)
  }

  private creators(onlyEditors, options: { initialOnly?: boolean, withInitials?: boolean} = {}) {
    const format = `creators${options.initialOnly ? '_io' : ''}${options.initialOnly ? '_wi' : ''}`
    let creators = this.item[format]
    if (!creators) {
      let types = Zotero.CreatorTypes.getTypesForItemType(this.item.item.itemTypeID)
      types = types.reduce((map, type) => { map[type.name] = type.id; return map }, {})
      const primary = Zotero.CreatorTypes.getPrimaryIDForType(this.item.item.itemTypeID)

      creators = this.item[format] = {}

      for (const creator of this.item.item.getCreators()) {
        if (onlyEditors && ![types.editor, types.seriesEditor].includes(creator.creatorTypeID)) continue

        let name = options.initialOnly ? this.initial(creator) : this.stripQuotes(this.innerText(creator.lastName))
        if (name) {
          if (options.withInitials && creator.firstName) {
            let initials = Zotero.Utilities.XRegExp.replace(this.stripQuotes(creator.firstName), this.re.caseNotUpperTitle, '', 'all')
            initials = this.removeDiacritics(initials)
            initials = Zotero.Utilities.XRegExp.replace(initials, this.re.caseNotUpper, '', 'all')
            name += initials
          }
        } else {
          name = this.stripQuotes(this.innerText(creator.firstName))
        }

        if (!name) continue

        switch (creator.creatorTypeID) {
          case types.editor:
          case types.seriesEditor:
            creators.editors = creators.editors || []
            creators.editors.push(name)
            break

          case types.translator:
            creators.translators = creators.translators || []
            creators.translators.push(name)
            break

          case primary:
            creators.authors = creators.authors || []
            creators.authors.push(name)
            break

          default:
            creators.collaborators = creators.collaborators || []
            creators.collaborators.push(name)
        }
      }
    }

    if (onlyEditors) return creators.editors || []
    return creators.authors || creators.editors || creators.translators || creators.collaborators || []
  }
}

// export singleton: https://k94n.com/es6-modules-single-instance-pattern
export let Formatter = new PatternFormatter // tslint:disable-line:variable-name
