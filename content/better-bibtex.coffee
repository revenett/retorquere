debug = require('./debug.coffee')
flash = require('./flash.coffee')
edtf = require('edtf')

Zotero.BetterBibTeX.PrefPane = require('./preferences/preferences.coffee')
Zotero.BetterBibTeX.ErrorReport = require('./error-report/error-report.coffee')

Prefs = require('./preferences.coffee') # needs to be here early, initializes the prefs observer

# TODO: remove after beta
Zotero.Prefs.get('debug.store', true)
Zotero.Debug.setStore(true)

Translators = require('./translators.coffee')
KeyManager = require('./keymanager.coffee')
DB = require('./db.coffee')
Serializer = require('./serializer.coffee')
Citekey = require('./keymanager/get-set.coffee')

###
  MONKEY PATCHES
###
### bugger this, I don't want megabytes of shared code in the translators ###
parseDate = require('./dateparser.coffee')
CiteProc = require('./citeproc.coffee')
titleCase = require('./title-case.coffee')
Zotero.Translate.Export::Sandbox.BetterBibTeX = {
  parseDate: (sandbox, date) -> parseDate(date)
  isEDTF: (sandbox, date) ->
    try
      edtf.parse(date)
      return true
    catch
      return false
  parseParticles: (sandbox, name) -> CiteProc.parseParticles(name) # && CiteProc.parseParticles(name)
  titleCase: (sandbox, text) -> titleCase(text)
  simplifyFields: (sandbox, item) -> Serializer.simplify(item)
  debugEnabled: (sandbox) -> Zotero.Debug.enabled
}
Zotero.Translate.Import::Sandbox.BetterBibTeX = {
  simplifyFields: (sandbox, item) -> Serializer.simplify(item)
  debugEnabled: (sandbox) -> Zotero.Debug.enabled
}

Zotero.Item::save = ((original) ->
  return Zotero.Promise.coroutine((options)->
    Zotero.debug("Zotero.Item::save: pre-#{if @deleted then 'delete' else 'save'}")

    try
      citekey = KeyManager.generate(@) unless @deleted || @isNote() || @isAttachment()
    catch err
      throw new Error("Zotero.Item::save: could not generate citekey: " + err + "\n\n" + err.stack)

    if citekey
      try
        @setField('extra', Citekey.set(@getField('extra'), citekey))
        debug('Zotero.Item::save: citekey embedded', citekey)
      catch err
        debug('Zotero.Item::save: failed to embed citekey' + err + "\n\n" + err.stack)
        citekey = false
    else
      debug('Zotero.Item::save: leave citekey as-is')

    try
      Zotero.debug("Zotero.Item::save: native...")
      result = yield original.call(@, options)
    catch err
      Zotero.debug("Zotero.Item::save: native save failed! " + err + "\n\n" + err.stack)
      throw err

    Zotero.debug("Zotero.Item::save: native succeeded")

    try
      keys = DB.getCollection('citekey')
      keys.findAndRemove({itemID: @id}) if citekey || @deleted
      keys.insert({itemID: @id, libraryID: @libraryID, citekey}) if citekey
      DB.getCollection('itemToExportFormat').findAndRemove({itemID: @id})
    catch err
      Zotero.debug("Zotero.Item::save: post-native save failed: " + err + "\n\n" + err.stack)

    return result
  )
)(Zotero.Item::save)

###
PatchItemRemove = ((original, name) ->
  return Zotero.Promise.coroutine(->
    try
      Zotero.debug("Zotero.Item::#{name}: native...")
      result = yield original.apply(@, arguments)
    catch err
      Zotero.debug("Zotero.Item::#{name}: native #{name} failed! " + err + "\n\n" + err.stack)
      throw err

    try
      DB.getCollection('citekey').findAndRemove({itemID: @id})
      DB.getCollection('itemToExportFormat').findAndRemove({itemID: @id})
    catch err
      Zotero.debug("Zotero.Item::#{name}: post-native #{name} failed: " + err + "\n\n" + err.stack)

    return result
  )
)
Zotero.Item::erase = PatchItemRemove(Zotero.Item::erase, 'erase')
Zotero.Item::trash = PatchItemRemove(Zotero.Item::trash, 'trash')

Must also patch Zotero.Items.trash...

perhaps the notifiers are fast enough
###

Zotero.Notifier.registerObserver({
  notify: (action, type, ids, extraData) ->
    debug('item.notify', {action, type, ids, extraData})

    if action in ['delete', 'trash']
      DB.getCollection('citekey').findAndRemove({ itemID : { $in : ids } })
      DB.getCollection('itemToExportFormat').findAndRemove({ itemID : { $in : ids } })

    return
}, ['item'], 'BetterBibTeX', 1)


Zotero.Utilities.Internal.itemToExportFormat = ((original) ->
  return (zoteroItem, legacy, skipChildItems) ->
    try
      return Serializer.fetch(zoteroItem.id, legacy, skipChildItems) || Serializer.store(zoteroItem.id, original.apply(@, arguments), legacy, skipChildItems)
    catch err # fallback for safety for non-BBT
      debug('Zotero.Utilities.Internal.itemToExportFormat', err)

    return original.apply(@, arguments)
)(Zotero.Utilities.Internal.itemToExportFormat)

###
  INIT
###

bench = (msg) ->
  now = new Date()
  debug("startup: #{msg} took #{(now - bench.start) / 1000.0}s")
  bench.start = now
  return
do Zotero.Promise.coroutine(->
  ready = Zotero.Promise.defer()
  Zotero.BetterBibTeX.ready = ready.promise
  bench.start = new Date()

  yield Zotero.initializationPromise
  bench('Zotero.initializationPromise')

  yield DB.init()
  bench('DB.init()')

  yield KeyManager.init() # inits the key cache by scanning the DB
  bench('KeyManager.init()')

  yield Serializer.init() # creates simplify et al
  bench('Serializer.init()')

  if Prefs.get('testing')
    Zotero.BetterBibTeX.TestSupport = require('./test/support.coffee')
    bench('Zotero.BetterBibTeX.TestSupport')
  else
    debug('starting, skipping test support')

  flash('waiting for Zotero translators...', 'Better BibTeX needs the translators to be loaded')
  yield Zotero.Schema.schemaUpdatePromise
  bench('Zotero.Schema.schemaUpdatePromise')

  flash('Zotero translators loaded', 'Better BibTeX ready for business')

  yield Translators.init()
  bench('Translators.init()')

  # should be safe to start tests at this point. I hate async.

  ready.resolve(true)

  return
)
