;if (typeof Zotero !== 'undefined' && Zotero.Debug) Zotero.Debug.enabled = true

const __estrace = {
  hold: '',
  prefix: 'zotero(?)(+0000000): ',
  MB: 1024 * 1024,

  ready() {
    if (!Zotero
      || !Zotero.BetterBibTeX
      || !Zotero.BetterBibTeX.ready
      || Zotero.BetterBibTeX.ready.isPending()
      || !Zotero.BetterBibTeX.TestSupport
    ) return false

    return true
  },

  enter(name, url, args) {
    if (name.startsWith('<anonymous')) return
    this.log(`bbt.trace.enter ${url} : ${name}`)
    // const replacer = this.circularReplacer()
    //this.report(`bbt trace.enter ${url}.${name}(${Array.from(args).map(arg => JSON.stringify(arg, replacer)).join(', ')})`)
  },

  exit(name, url, result) {
    if (name.startsWith('<anonymous')) return
    this.log(`bbt.trace.exit ${url} : ${name}`)
    // this.report(`bbt trace.exit ${url}.${name} => ${JSON.stringify(result, this.circularReplacer())}`)
  },

  log(msg) {
    const now = Date.now()
    if (this.ready() && (!this.last || (now - this.last) > 1000)) {
      Zotero.debug((this.hold ? this.hold.replace(this.prefix, '') + this.prefix : '') + msg)
      this.last = now
      this.hold = ''
    }
    else {
      this.hold += this.prefix + msg + '\n'
    }
  },

  circularReplacer() {
    const seen = new WeakSet()
    return (key, value) => {
      try {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return
          seen.add(value)
          return { ...value }
        }
        else {
          return value
      }
      }
      catch (err) {
        return
      }
    }
  },
};
