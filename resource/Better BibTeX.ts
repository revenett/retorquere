import { ITranslator } from '../gen/translator'
import { ISerializedItem } from './serialized-item'

declare const Translator: ITranslator

declare const Zotero: any

import { Reference } from './bibtex/reference.ts'
import { Exporter } from './lib/exporter.ts'

import debug = require('./lib/debug.ts')
import JSON5 = require('json5')
import htmlEscape = require('./lib/html-escape.ts')
const BibTeXParser = require('biblatex-csl-converter').BibLatexParser // tslint:disable-line:variable-name

Reference.prototype.caseConversion = {
  title: true,
  shorttitle: true,
  booktitle: true,
}

Reference.prototype.fieldEncoding = {
  url: 'verbatim',
  doi: 'verbatim',
  // school: 'literal'
  institution: 'literal',
  publisher: 'literal',
}

Reference.prototype.lint = function(explanation) {
  const required = {
    inproceedings: [ 'author', 'booktitle', 'pages', 'publisher', 'title', 'year' ],
    article: [ 'author', 'journal', 'number', 'pages', 'title', 'volume', 'year' ],
    techreport: [ 'author', 'institution', 'title', 'year' ],
    incollection: [ 'author', 'booktitle', 'pages', 'publisher', 'title', 'year' ],
    book: [ 'author', 'publisher', 'title', 'year' ],
    inbook: [ 'author', 'booktitle', 'pages', 'publisher', 'title', 'year' ],
    proceedings: [ 'editor', 'publisher', 'title', 'year' ],
    phdthesis: [ 'author', 'school', 'title', 'year' ],
    mastersthesis: [ 'author', 'school', 'title', 'year' ],
    electronic: [ 'author', 'title', 'url', 'year' ],
    misc: [ 'author', 'howpublished', 'title', 'year' ],
  }

  const fields = required[this.referencetype.toLowerCase()]
  if (!fields) return

  return fields.map(field => this.has[field] ? '' : `Missing required field '${field}'`).filter(msg => msg)
}

Reference.prototype.addCreators = function() {
  if (!this.item.creators || !this.item.creators.length) return

  /* split creators into subcategories */
  const authors = []
  const editors = []
  const translators = []
  const collaborators = []
  const primaryCreatorType = Zotero.Utilities.getCreatorsForType(this.item.itemType)[0]

  for (const creator of this.item.creators) {
    switch (creator.creatorType) {
      case 'editor': case 'seriesEditor': editors.push(creator); break
      case 'translator':                  translators.push(creator); break
      case primaryCreatorType:            authors.push(creator); break
      default:                            collaborators.push(creator)
    }
  }

  this.remove('author')
  this.remove('editor')
  this.remove('translator')
  this.remove('collaborator')

  this.add({ name: 'author', value: authors, enc: 'creators' })
  this.add({ name: 'editor', value: editors, enc: 'creators' })
  this.add({ name: 'translator', value: translators, enc: 'creators' })
  this.add({ name: 'collaborator', value: collaborators, enc: 'creators' })
}

Reference.prototype.typeMap = {
  csl: {
    article               : 'article',
    'article-journal'     : 'article',
    'article-magazine'    : 'article',
    'article-newspaper'   : 'article',
    bill                  : 'misc',
    book                  : 'book',
    broadcast             : 'misc',
    chapter               : 'incollection',
    dataset               : 'misc',
    entry                 : 'incollection',
    'entry-dictionary'    : 'incollection',
    'entry-encyclopedia'  : 'incollection',
    figure                : 'misc',
    graphic               : 'misc',
    interview             : 'misc',
    legal_case            : 'misc',
    legislation           : 'misc',
    manuscript            : 'unpublished',
    map                   : 'misc',
    motion_picture        : 'misc',
    musical_score         : 'misc',
    pamphlet              : 'booklet',
    'paper-conference'    : 'inproceedings',
    patent                : 'misc',
    personal_communication: 'misc',
    post                  : 'misc',
    'post-weblog'         : 'misc',
    report                : 'techreport',
    review                : 'article',
    'review-book'         : 'article',
    song                  : 'misc',
    speech                : 'misc',
    thesis                : 'phdthesis',
    treaty                : 'misc',
    webpage               : 'misc',
  },
  zotero: {
    artwork         : 'misc',
    audioRecording  : 'misc',
    bill            : 'misc',
    blogPost        : 'misc',
    book            : 'book',
    bookSection     : 'incollection',
    case            : 'misc',
    computerProgram : 'misc',
    conferencePaper : 'inproceedings',
    dictionaryEntry : 'misc',
    document        : 'misc',
    email           : 'misc',
    encyclopediaArticle:  'article',
    film            : 'misc',
    forumPost       : 'misc',
    hearing         : 'misc',
    instantMessage  : 'misc',
    interview       : 'misc',
    journalArticle  : 'article',
    letter          : 'misc',
    magazineArticle : 'article',
    manuscript      : 'unpublished',
    map             : 'misc',
    newspaperArticle: 'article',
    patent          : 'patent',
    podcast         : 'misc',
    presentation    : 'misc',
    radioBroadcast  : 'misc',
    report          : 'techreport',
    statute         : 'misc',
    thesis          : 'phdthesis',
    tvBroadcast     : 'misc',
    videoRecording  : 'misc',
    webpage         : 'misc',
  },
}

const months = [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec' ]

function importReferences(input) {
  const parser = new BibTeXParser(input, {
    rawFields: true,
    processUnexpected: true,
    processUnknown: { comment: 'f_verbatim' },
    processInvalidURIs: true,
  })

  /* this must be called before requesting warnings or errors -- this really, really weirds me out */
  const references = parser.output

  /* relies on side effect of calling '.output' */
  return {
    references,
    groups: parser.groups,
    errors: parser.errors,
    warnings: parser.warnings,
  }
}

Translator.doExport = () => {
  // Zotero.write(`\n% ${Translator.header.label}\n`)
  Zotero.write('\n')

  let item: ISerializedItem
  while (item = Exporter.nextItem()) {
    const ref = new Reference(item)

    ref.add({name: 'address', value: item.place})
    ref.add({name: 'chapter', value: item.section})
    ref.add({name: 'edition', value: item.edition})
    ref.add({name: 'type', value: item.type})
    ref.add({name: 'series', value: item.series})
    ref.add({name: 'title', value: item.title})
    ref.add({name: 'volume', value: item.volume})
    ref.add({name: 'copyright', value: item.rights})
    ref.add({name: 'isbn', value: item.ISBN})
    ref.add({name: 'issn', value: item.ISSN})
    ref.add({name: 'lccn', value: item.callNumber})
    ref.add({name: 'shorttitle', value: item.shortTitle})
    ref.add({name: 'doi', value: item.DOI})
    ref.add({name: 'abstract', value: item.abstractNote})
    ref.add({name: 'nationality', value: item.country})
    ref.add({name: 'language', value: item.language})
    ref.add({name: 'assignee', value: item.assignee})

    ref.add({ name: 'number', value: item.number || item.issue || item.seriesNumber })
    ref.add({ name: 'urldate', value: item.accessDate && item.accessDate.replace(/\s*T?\d+:\d+:\d+.*/, '') })

    switch (Translator.preferences.bibtexURL) {
      case 'url':
        ref.add({ name: 'url', value: item.url })
        break
      case 'note':
        ref.add({ name: (['misc', 'booklet'].includes(ref.referencetype) ? 'howpublished' : 'note'), value: item.url, enc: 'url' })
        break
      default:
        if (['webpage', 'post', 'post-weblog'].includes(item.__type__)) ref.add({ name: 'howpublished', value: item.url })
    }

    if (['bookSection', 'conferencePaper', 'chapter'].includes(item.__type__)) {
      ref.add({ name: 'booktitle', value: item.publicationTitle, preserveBibTeXVariables: true })
    } else if (ref.isBibVar(item.publicationTitle)) {
      ref.add({ name: 'journal', value: item.publicationTitle, preserveBibTeXVariables: true })
    } else {
      ref.add({ name: 'journal', value: (Translator.options.useJournalAbbreviation && item.journalAbbreviation) || item.publicationTitle, preserveBibTeXVariables: true })
    }

    switch (item.__type__) {
      case 'thesis': ref.add({ name: 'school', value: item.publisher }); break
      case 'report': ref.add({ name: 'institution', value: item.publisher }); break
      default:       ref.add({ name: 'publisher', value: item.publisher })
    }

    if (item.__type__ === 'thesis' && ['mastersthesis', 'phdthesis'].includes(item.type)) {
      ref.referencetype = item.type
      ref.remove('type')
    }

    ref.addCreators()

    if (item.date) {
      const date = Zotero.BetterBibTeX.parseDate(item.date)
      switch ((date || {}).type || 'verbatim') {
        case 'verbatim':
          ref.add({ name: 'year', value: item.date })
          break

        case 'interval':
          if (date.from.month) ref.add({ name: 'month', value: months[date.from.month - 1], bare: true })
          ref.add({ name: 'year', value: `${date.from.year}` })
          break

        case 'date':
          if (date.month) ref.add({ name: 'month', value: months[date.month - 1], bare: true })
          if ((date.orig || {}).type === 'date') {
            ref.add({ name: 'year', value: `[${date.orig.year}] ${date.year}` })
          } else {
            ref.add({ name: 'year', value: `${date.year}` })
          }
          break
      }
    }

    ref.add({ name: 'keywords', value: item.tags, enc: 'tags' })

    if (item.pages) {
      let pages = item.pages
      if (!ref.raw) pages = pages.replace(/[-\u2012-\u2015\u2053]+/g, '--')
      ref.add({ name: 'pages', value: pages })
    }

    ref.add({ name: 'file', value: item.attachments, enc: 'attachments' })
    ref.complete()
  }

  Exporter.complete()
  Zotero.write('\n')
}

Translator.detectImport = () => {
  const input = Zotero.read(102400) // tslint:disable-line:no-magic-numbers
  const bib = importReferences(input)
  const found = Object.keys(bib.references).length > 0
  return found
}

function importGroup(group, itemIDs, root = null) {
  const collection = new Zotero.Collection()
  collection.type = 'collection'
  collection.name = group.name
  collection.children = group.references.filter(citekey => itemIDs[citekey]).map(citekey => ({type: 'item', id: itemIDs[citekey]}))

  for (const subgroup of group.groups || []) {
    collection.children.push(importGroup(subgroup, itemIDs))
  }

  if (root) collection.complete()
  return collection
}

class ZoteroItem {
  public tags = {
    strong: { open: '<b>', close: '</b>' },
    em: { open: '<i>', close: '</i>' },
    sub: { open: '<sub>', close: '</sub>' },
    sup: { open: '<sup>', close: '</sup>' },
    smallcaps: { open: '<span style="font-variant:small-caps;">', close: '</span>' },
    nocase: { open: '', close: '' },
    enquote: { open: '“', close: '”' },
    url: { open: '', close: '' },
    undefined: { open: '[', close: ']' },
  }

  public groups: any // comes from biblatex parser

  protected item: any

  private typeMap = {
    book:           'book',
    booklet:        'book',
    manual:         'book',
    proceedings:    'book',
    collection:     'book',
    incollection:   'bookSection',
    inbook:         'bookSection',
    inreference:    'encyclopediaArticle',
    article:        'journalArticle',
    misc:           'journalArticle',
    phdthesis:      'thesis',
    mastersthesis:  'thesis',
    thesis:         'thesis',
    unpublished:    'manuscript',
    patent:         'patent',
    inproceedings:  'conferencePaper',
    conference:     'conferencePaper',
    techreport:     'report',
    report:         'report',
  }

  private sup = {
    '(': '\u207D',
    ')': '\u207E',
    '+': '\u207A',
    '=': '\u207C',
    '-': '\u207B',
    '\u00C6': '\u1D2D', // tslint:disable-line:object-literal-key-quotes
    '\u014B': '\u1D51', // tslint:disable-line:object-literal-key-quotes
    '\u018E': '\u1D32', // tslint:disable-line:object-literal-key-quotes
    '\u0222': '\u1D3D', // tslint:disable-line:object-literal-key-quotes
    '\u0250': '\u1D44', // tslint:disable-line:object-literal-key-quotes
    '\u0251': '\u1D45', // tslint:disable-line:object-literal-key-quotes
    '\u0254': '\u1D53', // tslint:disable-line:object-literal-key-quotes
    '\u0259': '\u1D4A', // tslint:disable-line:object-literal-key-quotes
    '\u025B': '\u1D4B', // tslint:disable-line:object-literal-key-quotes
    '\u025C': '\u1D4C', // tslint:disable-line:object-literal-key-quotes
    '\u0263': '\u02E0', // tslint:disable-line:object-literal-key-quotes
    '\u0266': '\u02B1', // tslint:disable-line:object-literal-key-quotes
    '\u026F': '\u1D5A', // tslint:disable-line:object-literal-key-quotes
    '\u0279': '\u02B4', // tslint:disable-line:object-literal-key-quotes
    '\u027B': '\u02B5', // tslint:disable-line:object-literal-key-quotes
    '\u0281': '\u02B6', // tslint:disable-line:object-literal-key-quotes
    '\u0294': '\u02C0', // tslint:disable-line:object-literal-key-quotes
    '\u0295': '\u02C1', // tslint:disable-line:object-literal-key-quotes
    '\u03B2': '\u1D5D', // tslint:disable-line:object-literal-key-quotes
    '\u03B3': '\u1D5E', // tslint:disable-line:object-literal-key-quotes
    '\u03B4': '\u1D5F', // tslint:disable-line:object-literal-key-quotes
    '\u03C6': '\u1D60', // tslint:disable-line:object-literal-key-quotes
    '\u03C7': '\u1D61', // tslint:disable-line:object-literal-key-quotes
    '\u1D02': '\u1D46', // tslint:disable-line:object-literal-key-quotes
    '\u1D16': '\u1D54', // tslint:disable-line:object-literal-key-quotes
    '\u1D17': '\u1D55', // tslint:disable-line:object-literal-key-quotes
    '\u1D1D': '\u1D59', // tslint:disable-line:object-literal-key-quotes
    '\u1D25': '\u1D5C', // tslint:disable-line:object-literal-key-quotes
    '\u2212': '\u207B', // tslint:disable-line:object-literal-key-quotes
    '\u2218': '\u00B0', // tslint:disable-line:object-literal-key-quotes
    '\u4E00': '\u3192', // tslint:disable-line:object-literal-key-quotes
    0: '\u2070',
    1: '\u00B9',
    2: '\u00B2',
    3: '\u00B3',
    4: '\u2074',
    5: '\u2075',
    6: '\u2076',
    7: '\u2077',
    8: '\u2078',
    9: '\u2079',
    A: '\u1D2C',
    B: '\u1D2E',
    D: '\u1D30',
    E: '\u1D31',
    G: '\u1D33',
    H: '\u1D34',
    I: '\u1D35',
    J: '\u1D36',
    K: '\u1D37',
    L: '\u1D38',
    M: '\u1D39',
    N: '\u1D3A',
    O: '\u1D3C',
    P: '\u1D3E',
    R: '\u1D3F',
    T: '\u1D40',
    U: '\u1D41',
    W: '\u1D42',
    a: '\u1D43',
    b: '\u1D47',
    d: '\u1D48',
    e: '\u1D49',
    g: '\u1D4D',
    h: '\u02B0',
    i: '\u2071',
    j: '\u02B2',
    k: '\u1D4F',
    l: '\u02E1',
    m: '\u1D50',
    n: '\u207F',
    o: '\u1D52',
    p: '\u1D56',
    r: '\u02B3',
    s: '\u02E2',
    t: '\u1D57',
    u: '\u1D58',
    v: '\u1D5B',
    w: '\u02B7',
    x: '\u02E3',
    y: '\u02B8',
  }

  private sub = {
    0: '\u2080',
    1: '\u2081',
    2: '\u2082',
    3: '\u2083',
    4: '\u2084',
    5: '\u2085',
    6: '\u2086',
    7: '\u2087',
    8: '\u2088',
    9: '\u2089',
    '+': '\u208A',
    '-': '\u208B',
    '=': '\u208C',
    '(': '\u208D',
    ')': '\u208E',
    a: '\u2090',
    e: '\u2091',
    o: '\u2092',
    x: '\u2093',
    h: '\u2095',
    k: '\u2096',
    l: '\u2097',
    m: '\u2098',
    n: '\u2099',
    p: '\u209A',
    s: '\u209B',
    t: '\u209C',
  }

  private id: string
  private bibtex: any // comes from biblatex parser
  private fields: any // comes from biblatex parser
  private type: string
  private hackyFields: string[]
  private biblatexdata: { [key: string]: string }
  private biblatexdatajson: boolean
  private validFields: { [key: string]: boolean }

  constructor(id, bibtex, groups, validFields) {
    this.id = id
    this.bibtex = bibtex
    this.groups = groups
    this.bibtex.bib_type = this.bibtex.bib_type.toLowerCase()
    this.type = this.typeMap[this.bibtex.bib_type] || 'journalArticle'
    this.validFields = validFields[this.type]

    if (!this.validFields) this.error(`import error: unexpected item ${bibtex.entry_key} of type ${this.type}`)

    this.item = new Zotero.Item(this.type)
    this.item.itemID = this.id
    this.biblatexdata = {}

    this.import()

    if (Translator.preferences.testing) {
      const err = Object.keys(this.item).filter(name => !this.validFields[name]).join(', ')
      if (err) this.error(`import error: unexpected fields on ${this.type} ${bibtex.entry_key}: ${err}`)
    }

    this.item.complete()
  }

  protected $title(value) {
    if (this.type === 'encyclopediaArticle') {
      this.set('publicationTitle', this.unparse(value))
    } else {
      this.set('title', this.unparse(value))
    }
    return true
  }

  protected $author(value, field) {
    for (const name of value) {
      const creator: {lastName?: string, firstName?: string, fieldMode?: number, creatorType: string } = { creatorType: field }

      if (name.literal) {
        creator.lastName = this.unparse(name.literal)
        creator.fieldMode = 1
      } else {
        creator.firstName = this.unparse(name.given)
        creator.lastName = this.unparse(name.family)
        if (name.prefix) creator.lastName = `${this.unparse(name.prefix)} ${creator.lastName}`
        if (name.suffix) creator.lastName = `${creator.lastName}, ${this.unparse(name.suffix)}`
        // creator = Zotero.Utilities.cleanAuthor(creator, field, false)
        if (creator.lastName && !creator.firstName) creator.fieldMode = 1
      }
      this.item.creators.push(creator)
    }
    return true
  }
  protected $editor(value, field) { return this.$author(value, field) }
  protected $translator(value, field) { return this.$author(value, field) }

  protected $publisher(value) {
    if (!this.validFields.publisher) return false

    if (!this.item.publisher) this.item.publisher = ''
    if (this.item.publisher) this.item.publisher += ' / '
    this.item.publisher += value.map(this.unparse).join(' and ').replace(/[ \t\r\n]+/g, ' ')
    return true
  }
  protected $institution(value) { return this.$publisher(value) }
  protected $school(value) { return this.$publisher(value) }

  protected $address(value) { return this.set('place', this.unparse(value)) }
  protected $location(value) { return this.$address(value) }

  protected $edition(value) { return this.set('edition', this.unparse(value)) }

  protected $isbn(value) { return this.set('ISBN', this.unparse(value)) }

  protected $date(value) { return this.set('date', this.unparse(value)) }

  protected $booktitle(value) {
    value = this.unparse(value)

    switch (this.type) {
      case 'conferencePaper':
        return this.set('publicationTitle', value)

      case 'book':
        if (!this.item.title) return this.set('title', value)
        break
    }

    return false
  }

  protected $journaltitle(value) {
    value = this.unparse(value)

    switch (this.type) {
      case 'conferencePaper':
        this.set('series', value)
        break

      default:
        this.set('publicationTitle', value)
        break
    }

    return true
  }
  protected $journal(value) { return this.$journaltitle(value) }

  protected $pages(value) {
    // https://github.com/fiduswriter/biblatex-csl-converter/issues/51
    const pages = []
    for (const range of value) {
      if (range.length === 1) {
        const p = this.unparse(range[0])
        if (p) pages.push(p)
      } else {
        const p0 = this.unparse(range[0])
        const p1 = this.unparse(range[1])
        if (p0.indexOf('-') >= 0 || p1.indexOf('-') >= 0) {
          pages.push(`${p0}--${p1}`)
        } else if (p0 || p1) {
          pages.push(`${p0}-${p1}`)
        }
      }
    }

    if (!pages.length) return true

    if (['book', 'thesis', 'manuscript'].includes(this.type)) {
      this.set('numPages', pages.join(', '))
    } else {
      this.set('pages', pages.join(', '))
    }

    return true
  }

  protected $volume(value) { return this.set('volume', this.unparse(value)) }

  protected $doi(value) { return this.set('DOI', this.unparse(value)) }

  protected $abstract(value) { return this.set('abstractNote', this.unparse(value, false)) }

  protected $keywords(value) {
    value = value.map(tag => this.unparse(tag).replace(/\n+/g, ' '))
    if (value.length === 1 && value[0].indexOf(';') > 0) value = value[0].split(/\s*;\s*/)
    if (!this.item.tags) this.item.tags = []
    this.item.tags = this.item.tags.concat(value)
    this.item.tags = this.item.tags.sort().filter((item, pos, ary) => !pos || (item !== ary[pos - 1]))
    return true
  }
  protected $keyword(value) { return this.$keywords(value) }

  protected $year(value) {
    value = this.unparse(value)

    if (this.item.date) {
      if (this.item.date.indexOf(value) < 0) this.item.date += value
    } else {
      this.item.date = value
    }
    return true
  }

  protected $month(value) {
    value = this.unparse(value)

    const month = months.indexOf(value.toLowerCase())
    if (month >= 0) {
      value = Zotero.Utilities.formatDate({month})
    } else {
      value += ' '
    }

    if (this.item.date) {
      if (value.indexOf(this.item.date) >= 0) {
        /* value contains year and more */
        this.item.date = value
      } else {
        this.item.date = value + this.item.date
      }
    } else {
      this.item.date = value
    }
    return true
  }

  protected $file(value) {
    let m, mimeType, path, title
    value = this.unparse(value)

    // :Better BibTeX.001/Users/heatherwright/Documents/Scientific Papers/AVX3W9~F.PDF:PDF
    if (m = value.match(/^([^:]*):([^:]+):([^:]*)$/)) {
      title = m[1]
      path = m[2]
      mimeType = m[3] // tslint:disable-line:no-magic-numbers
    } else {
      path = value
    }

    mimeType = (mimeType || '').toLowerCase()
    if (!mimeType && path.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf'
    if (mimeType.toLowerCase() === 'pdf') mimeType = 'application/pdf'
    if (!mimeType) mimeType = undefined

    this.item.attachments.push({ title, path, mimeType })
    return true
  }

  protected '$date-modified'(value) { return this.item.dateAdded = this.unparse(value) }
  protected '$date-added'(value) { return this.item.dateAdded = this.unparse(value) }
  protected '$added-at'(value) { return this.item.dateAdded = this.unparse(value) }
  protected $timestamp(value) { return this.item.dateAdded = this.unparse(value) }

  protected $number(value) {
    value = this.unparse(value)
    let field
    switch (this.type) {
      case 'report':
        field = 'reportNumber'
        break

      case 'book':
      case 'bookSection':
      case 'chapter':
        field = 'seriesNumber'
        break

      case 'patent':
        field = 'patentNumber'
        break

      default:
        field = 'issue'
    }

    if (!this.validFields[field]) return false
    this.set(field, value)

    return true
  }

  protected $issn(value) {
    if (!this.validFields.ISSN) return false

    return this.set('ISSN', this.unparse(value))
  }

  protected $url(value, field) {
    let m, url
    value = this.unparse(value)

    if (m = value.match(/^(\\url{)(https?:\/\/|mailto:)}$/i)) {
      url = m[2]
    } else if (field === 'url' || /^(https?:\/\/|mailto:)/i.test(value)) {
      url = value
    } else {
      url = null
    }

    if (!url) return false

    if (this.item.url) return (this.item.url === url)

    this.item.url = url
    return true
  }
  protected $howpublished(value, field) { return this.$url(value, field) }

  protected $type(value) {
    for (const field of ['sessionType', 'websiteType', 'manuscriptType', 'genre', 'postType', 'sessionType', 'letterType', 'manuscriptType', 'mapType', 'presentationType', 'regulationType', 'reportType', 'thesisType', 'websiteType']) {
      if (this.validFields[field]) {
        this.set(field, this.unparse(value))
        return true
      }
    }
    return false
  }

  protected $lista(value) {
    if (this.type !== 'encyclopediaArticle' || !!this.item.title) return false

    this.set('title', this.unparse(value))
    return true
  }

  protected $annotation(value) {
    this.item.notes.push(Zotero.Utilities.text2html(this.unparse(value, false)))
    return true
  }
  protected $comment(value) { return this.$annotation(value) }
  protected $annote(value) { return this.$annotation(value) }
  protected $review(value) { return this.$annotation(value) }
  protected $notes(value) { return this.$annotation(value) }

  protected $urldate(value) { return this.set('accessDate', this.unparse(value)) }
  protected $lastchecked(value) { return this.$urldate(value) }

  protected $series(value) { return this.set('series', this.unparse(value)) }

  // if the biblatex-csl-converter hasn't already taken care of it it is a remnant of the horribly broken JabRaf 3.8.1
  // groups format -- shoo, we don't want you
  protected $groups(value) { return true }

  protected $note(value) {
    this.addToExtra(this.unparse(value, false))
    return true
  }

  protected $language(value, field) {
    let language
    if (field === 'language') {
      language = value.map(this.unparse).join(' and ')
    } else {
      language = this.unparse(value)
    }
    if (!language) return true

    switch (language.toLowerCase()) {
      case 'en':
      case 'eng':
      case 'usenglish':
      case 'english':
        language = 'English'
        break
    }
    this.set('language', language)
    return true
  }
  protected $langid(value, field) { return this.$language(value, field) }

  protected $shorttitle(value) { return this.set('shortTitle', this.unparse(value)) }

  protected $eprint(value, field) {
    /* Support for IDs exported by BibLaTeX */
    let eprinttype = this.fields.eprinttype ||  this.fields.archiveprefix
    if (!eprinttype) return false

    const eprint = this.unparse(value)
    eprinttype = this.unparse(eprinttype)

    switch (eprinttype.trim().toLowerCase()) {
      case 'arxiv': this.hackyFields.push(`arXiv: ${eprint}`); break
      case 'jstor': this.hackyFields.push(`JSTOR: ${eprint}`); break
      case 'pubmed': this.hackyFields.push(`PMID: ${eprint}`); break
      case 'hdl': this.hackyFields.push(`HDL: ${eprint}`); break
      case 'googlebooks': this.hackyFields.push(`GoogleBooksID: ${eprint}`); break
      default:
        return false
    }
    return true
  }
  protected $eprinttype(value) { return this.fields.eprint }
  protected $archiveprefix(value) { return this.$eprinttype(value) }

  protected $nationality(value) { return this.set('country', this.unparse(value)) }

  protected $chapter(value) { return this.set('section', this.unparse(value)) }

  private error(err) {
    debug(err)
    throw new Error(err)
  }

  private unparse(text, condense = true): string {
    if (Array.isArray(text) && Array.isArray(text[0])) return text.map(t => this.unparse(t)).join(' and ')

    if (['string', 'number'].includes(typeof text)) return text

    // split out sup/sub text that can be unicodified
    const chunks = []
    for (const node of text) {
      if (node.type === 'variable') {
        chunks.push({text: node.attrs.variable, marks: []})
        continue
      }

      if (!node.marks) {
        chunks.push(node)
        continue
      }

      let sup = false
      let sub = false
      const nosupb = node.marks.filter(mark => {
        sup = sup || mark.type === 'sup'
        sub = sub || mark.type === 'sub'
        return !['sup', 'sub'].includes(mark.type)
      })

      if (sup === sub) { // !xor
        chunks.push(node)
        continue
      }

      const tr = sup ? this.sup : this.sub
      let unicoded = ''
      for (const c of Zotero.Utilities.XRegExp.split(node.text, '')) {
        if (sup && c === '\u00B0') { // spurious mark
          unicoded += c
        } else if (tr[c]) {
          unicoded += tr[c]
        } else {
          unicoded = null
          break
        }
      }
      if (unicoded) {
        node.text = unicoded
        node.marks = nosupb
      }
      chunks.push(node)
    }

//        switch
//          when tr[c] && (i == 0 || !chunks[chunks.length - 1].unicoded) # can be replaced but not appended
//            chunks.push({text: tr[c], marks: nosupb, unicoded: true})
//          when tr[c]
//            chunks[chunks.length - 1].text += tr[c] # can be replaced and appended
//          when i == 0 || chunks[chunks.length - 1].unicoded # cannot be replaced and and cannot be appended
//            chunks.push({text: c, marks: node.marks})
//          else
//            chunks[chunks.length - 1].text += c # cannot be replaced but can be appended

    // convert to string
    let html = ''
    let lastMarks = []
    for (const node of chunks) {
      if (node.type === 'variable') {
        // This is an undefined variable
        // This should usually not happen, as CSL doesn't know what to
        // do with these. We'll put them into an unsupported tag.
        html += `${this.tags.undefined.open}${node.attrs.variable}${this.tags.undefined.close}`
        continue
      }

      const newMarks = []
      if (node.marks) {
        for (const mark of node.marks) {
          newMarks.push(mark.type)
        }
      }

      // close all tags that are not present in current text node.
      let closing = false
      const closeTags = []
      for (let index = 0; index < lastMarks.length; index++) {
        const mark = lastMarks[index]
        if (mark !== newMarks[index]) closing = true
        if (closing) closeTags.push(this.tags[mark].close)
      }
      // Add close tags in reverse order to close innermost tags
      // first.
      closeTags.reverse()

      html += closeTags.join('')
      // open all new tags that were not present in the last text node.
      let opening = false
      for (let index = 0; index < newMarks.length; index++) {
        const mark = newMarks[index]
        if (mark !== lastMarks[index]) opening = true
        if (opening) html += this.tags[mark].open
      }

      html += node.text
      lastMarks = newMarks
    }

    // Close all still open tags
    for (const mark of lastMarks.slice().reverse()) {
      html += this.tags[mark].close
    }

    html = html.replace(/ \u00A0/g, ' ~') // if allowtilde
    html = html.replace(/\u00A0 /g, '~ ') // if allowtilde
    // html = html.replace(/\uFFFD/g, '') # we have no use for the unicode replacement character

    return condense ? html.replace(/[\t\r\n ]+/g, ' ') : html
  }

  private import() {
    this.hackyFields = []

    let fields = Object.keys(this.bibtex.fields)
    const unexpected = Object.keys(this.bibtex.unexpected_fields || {})
    const unknown = Object.keys(this.bibtex.unknown_fields || {})
    if (Translator.preferences.testing) {
      fields.sort()
      unexpected.sort()
      unknown.sort()
    }
    fields = fields.concat(unexpected).concat(unknown)
    // tslint:disable-next-line:prefer-object-spread
    this.fields = Object.assign({}, (this.bibtex.fields || {}), (this.bibtex.unexpected_fields || {}), this.bibtex.unknown_fields)

    debug('importing bibtex:', fields, this.bibtex)
    for (const field of fields) {
      const value = this.fields[field]

      if (field.match(/^local-zo-url-[0-9]+$/)) {
        if (this.$file(value)) continue
      } else if (field.match(/^bdsk-url-[0-9]+$/)) {
        if (this.$url(value, field)) continue
      }

      if (this[`$${field}`] && this[`$${field}`](value, field)) continue

      switch (field) {
        case 'doi':
          this.hackyFields.push(`DOI: ${this.unparse(value)}`)
          break

        case 'issn':
          this.hackyFields.push(`ISSN: ${this.unparse(value)}`)
          break

        default:
          this.addToExtraData(field, this.unparse(value))
          break
      }
    }

    if (this.bibtex.entry_key) this.addToExtra(`bibtex: ${this.bibtex.entry_key}`) // Endnote has no citation keys in their bibtex

    const keys = Object.keys(this.biblatexdata)
    if (keys.length > 0) {
      let biblatexdata
      if (Translator.preferences.testing) keys.sort()
      if (this.biblatexdatajson && Translator.preferences.testing) {
        biblatexdata = `bibtex{${keys.map(k => JSON5.stringify({[k]: this.biblatexdata[k]}).slice(1, -1))}}`

      } else if (this.biblatexdatajson) {
        biblatexdata = `bibtex${JSON5.stringify(this.biblatexdata)}`

      } else {
        biblatexdata = `bibtex[${keys.map(key => `${key}=${this.biblatexdata[key]}`).join(';')}]`
      }

      this.addToExtra(biblatexdata)
    }

    if (this.hackyFields.length > 0) {
      this.hackyFields.sort()
      this.addToExtra(this.hackyFields.join(' \n'))
    }

    if (!this.item.publisher && this.item.backupPublisher) {
      this.item.publisher = this.item.backupPublisher
      delete this.item.backupPublisher
    }
  }

  private addToExtra(str) {
    if (this.item.extra && (this.item.extra !== '')) {
      this.item.extra += ` \n${str}`
    } else {
      this.item.extra = str
    }
  }

  private addToExtraData(key, value) {
    this.biblatexdata[key] = this.unparse(value)
    if (key.match(/[\[\]=;\r\n]/) || value.match(/[\[\]=;\r\n]/)) this.biblatexdatajson = true
  }

  private set(field, value) {
    debug('import.set:', this.type, field, this.validFields[field])
    if (!this.validFields[field]) return false

    if (Translator.preferences.testing && (this.item[field] || typeof this.item[field] === 'number') && (value || typeof value === 'number') && this.item[field] !== value) {
      this.error(`import error: duplicate ${field} on ${this.type} ${this.bibtex.entry_key} (old: ${this.item[field]}, new: ${value})`)
    }

    this.item[field] = value
    return true
  }
}

// ZoteroItem::$__note__ = ZoteroItem::$__key__ = -> true

//
// ZoteroItem::$__type__ = (value) ->
//   @item.thesisType = value if value in [ 'phdthesis', 'mastersthesis' ]
//   return true
//
// ### these return the value which will be interpreted as 'true' ###
// ZoteroItem::$institution  = ZoteroItem::$organization = (value) -> @item.backupPublisher = value
// ZoteroItem::$school       = ZoteroItem::$institution  = ZoteroItem::$publisher = (value) -> @item.publisher = value
//
// ZoteroItem::$copyright    = (value) -> @item.rights = value
// ZoteroItem::$assignee     = (value) -> @item.assignee = value
// ZoteroItem::$issue        = (value) -> @item.issue = value
//
// ### ZoteroItem::$lccn = (value) -> @item.callNumber = value ###
// ZoteroItem::$lccn = (value) -> @hackyFields.push("LCCB: #{value}")
// ZoteroItem::$pmid = ZoteroItem::$pmcid = (value, field) -> @hackyFields.push("#{field.toUpperCase()}: #{value}")
// ZoteroItem::$mrnumber = (value) -> @hackyFields.push("MR: #{value}")
// ZoteroItem::$zmnumber = (value) -> @hackyFields.push("Zbl: #{value}")
//
// ZoteroItem::$subtitle = (value) ->
//   @item.title = '' unless @item.title
//   @item.title = @item.title.trim()
//   value = value.trim()
//   if not /[-–—:!?.;]$/.test(@item.title) and not /^[-–—:.;¡¿]/.test(value)
//     @item.title += ': '
//   else
//   @item.title += ' ' if @item.title.length
//   @item.title += value
//   return true
//
// ZoteroItem::$fjournal = (value) ->
//   @item.journalAbbreviation = @item.publicationTitle if @item.publicationTitle
//   @item.publicationTitle = value
//   return true

Translator.initialize = () => {
  Reference.installPostscript()
  Translator.unicode = !Translator.preferences.asciiBibTeX
}

Translator.doImport = () => {
  let read
  let input = ''
  while ((read = Zotero.read(0x100000)) !== false) { // tslint:disable-line:no-magic-numbers
    input += read
  }
  const bib = importReferences(input)

  if (bib.errors.length) {
    const item = new Zotero.Item('note')
    item.note = 'Import errors found: <ul>'
    for (const err of bib.errors) {
      switch (err.type) {
        case 'cut_off_citation':
          item.note += `<li>line ${err.line}: ${htmlEscape(`incomplete reference @${err.entry}`)}</li>`
          break
        case 'token_mismatch':
          item.note += `<li>line ${err.line}: found ${htmlEscape(JSON.stringify(err.found))}, expected ${htmlEscape(JSON.stringify(err.expected))}</li>`
          break
        default:
          throw(err)
      }
    }
    item.tags = ['#Better BibTeX import error']
    item.note += '</ul>'
    item.complete()
  }

  if (Translator.preferences.csquotes) {
    ZoteroItem.prototype.tags.enquote = { open: Translator.preferences.csquotes[0], close: Translator.preferences.csquotes[1]}
  }

  const validFields = Zotero.BetterBibTeX.validFields()

  const itemIDS = {}
  for (const [id, ref] of Object.entries(bib.references)) {
    if (ref.entry_key) itemIDS[ref.entry_key] = id // Endnote has no citation keys
    new ZoteroItem(id, ref, bib.groups, validFields) // tslint:disable-line:no-unused-expression
  }

  for (const group of bib.groups || []) {
    importGroup(group, itemIDS, true)
  }
}
