debug = require('./debug.coffee')
flash = require('./flash.coffee')
co = Zotero.Promise.coroutine
events = require('./events.coffee')
getItemsAsync = require('./get-items-async.coffee')

Prefs = require('./preferences.coffee')
Citekey = require('./keymanager/get-set.coffee')
DB = require('./db/main.coffee')
Formatter = require('./keymanager/formatter.coffee')

debug('KeyManager: loading...', Object.keys(Formatter))

class KeyManager
  pin: co((ids) ->
    ids = @expandSelection(ids)
    debug('KeyManager.pin', ids)

    for item in yield getItemsAsync(ids)
      continue if item.isNote() || item.isAttachment()

      parsed = Citekey.get(item.getField('extra'))
      continue if parsed.pinned

      try
        citekey = @get(item.id).citekey || @update(item)
        item.setField('extra', Citekey.set(parsed.extra, citekey))
        item.saveTx() # this should cause an update and key registration
      catch err
        debug('KeyManager.pin', err)

    return
  )

  unpin: co((ids) ->
    ids = @expandSelection(ids)
    debug('KeyManager.unpin', ids)

    for item in yield getItemsAsync(ids)
      continue if item.isNote() || item.isAttachment()

      parsed = Citekey.get(item.getField('extra'))
      continue unless parsed.pinned

      debug('KeyManager.unpin', item.id)
      item.setField('extra', parsed.extra) # citekey is stripped here but will be regenerated by the notifier
      item.saveTx()

    return
  )

  refresh: co((ids) ->
    ids = @expandSelection(ids)
    debug('KeyManager.refresh', ids)

    for item in yield getItemsAsync(ids)
      continue if item.isNote() || item.isAttachment()

      parsed = Citekey.get(item.getField('extra'))
      debug('KeyManager.refresh?', item.id, parsed)
      continue if parsed.pinned

      @update(item)

    return
  )

  expandSelection: (ids) ->
    return ids if Array.isArray(ids)

    if ids == 'selected'
      pane = Zotero.getActiveZoteroPane()
      items = pane.getSelectedItems()
      return (item.id for item in (items || []))

    return [ids]

  init: co(->
    debug('KeyManager.init...')

    @keys = DB.getCollection('citekey')
    debug('KeyManager.init:', { keys: @keys })

    @query = {
      field: {}
      type: {}
    }

    for field in yield Zotero.DB.queryAsync("select fieldID, fieldName from fields where fieldName in ('extra')")
      @query.field[field.fieldName] = field.fieldID
    for type in yield Zotero.DB.queryAsync("select itemTypeID, typeName from itemTypes where typeName in ('note', 'attachment')") # 1, 14
      @query.type[type.typeName] = type.itemTypeID

    Formatter.update()

    yield @rescan()

    debug('KeyManager.init: done')

    events.on('preference-changed', (pref) ->
      debug('KeyManager.pref changed', pref)
      if pref in ['autoAbbrevStyle', 'citekeyFormat', 'citekeyFold', 'skipWords']
        Formatter.update()
      return
    )

    return
  )

  remaining: (start, done, total) ->
    remaining = (total - done) / (done / ((new Date()) - start))

    date = new Date(remaining)

    hh = date.getUTCHours()
    mm = date.getMinutes()
    ss = date.getSeconds()

    hh = "0#{hh}" if hh < 10
    mm = "0#{mm}" if mm < 10
    ss = "0#{ss}" if ss < 10

    return "#{done} / #{total}, #{hh}:#{mm}:#{ss} remaining"

  rescan: co((clean)->
    if @scanning
      if Array.isArray(@scanning)
        left = ", #{@scanning.length} items left"
      else
        left = ''
      flash('Scanning still in progress', "Scan is still running#{left}")
      return

    @scanning = true

    flash('Scanning', 'Scanning for references without citation keys. If you have a large library, this may take a while', 1)

    if clean
      @keys.removeDataOnly()
#    else
#      @keys.findAndRemove({ citekey: '' }) # how did empty keys get into the DB?!
    debug('KeyManager.rescan:', {clean, keys: @keys})

    ids = []
    items = yield Zotero.DB.queryAsync("""
      SELECT item.itemID, item.libraryID, extra.value as extra, item.itemTypeID
      FROM items item
      LEFT JOIN itemData field ON field.itemID = item.itemID AND field.fieldID = #{@query.field.extra}
      LEFT JOIN itemDataValues extra ON extra.valueID = field.valueID
      WHERE item.itemID NOT IN (select itemID from deletedItems)
      AND item.itemTypeID NOT IN (#{@query.type.attachment}, #{@query.type.note})
    """)
    for item in items
      ids.push(item.itemID)
      # if no citekey is found, it will be '', which will allow it to be found right after this loop
      citekey = Citekey.get(item.extra)
      debug('KeyManager.rescan:', {itemID: item.itemID, citekey})

      if !clean && saved = @keys.findOne({ itemID: item.itemID })
        if citekey.pinned && (citekey.citekey != saved.citekey || !saved.pinned)
          debug('KeyManager.rescan: resetting pinned citekey', citekey.citekey, 'for', item.itemID)
          Object.assign(saved, { citekey: citekey.citekey, pinned: true })
          @keys.update(saved)
        else
          debug('KeyManager.rescan: keeping', saved)
      else
        debug('KeyManager.rescan: clearing citekey for', item.itemID)
        @keys.insert({ citekey: citekey.citekey, pinned: citekey.pinned, itemID: item.itemID, libraryID: item.libraryID })

    debug('KeyManager.rescan: found', @keys.data.length)
    @keys.findAndRemove({ itemID: { $nin: ids } })
    debug('KeyManager.rescan: purged', @keys.data.length)

    # find all references without citekey
    @scanning = @keys.find({ citekey: '' })

    if @scanning.length != 0
      debug("Found #{@scanning.length} references without a citation key")
      progressWin = new Zotero.ProgressWindow({ closeOnClick: false })
      progressWin.changeHeadline('Better BibTeX: Assigning citation keys')
      progressWin.addDescription("Found #{@scanning.length} references without a citation key")
      icon = "chrome://zotero/skin/treesource-unfiled#{if Zotero.hiDPI then '@2x' else ''}.png"
      progress = new progressWin.ItemProgress(icon, "Assigning citation keys")
      progressWin.show()

      start = new Date()
      for key, done in @scanning
        try
          item = yield getItemsAsync(key.itemID)
        catch err
          debug('KeyManager.rescan: getItemsAsync failed:', err)

        try
          @update(item, key)
        catch err
          debug('KeyManager.rescan: update', done, 'failed:', err)

        if done % 10 == 1
          progress.setProgress((done * 100) / @scanning.length)
          progress.setText(@remaining(start, done, @scanning.length))

      progress.setProgress(100)
      progress.setText('Ready')
      progressWin.startCloseTimer(500)

    @scanning = false

    debug('KeyManager.rescan: done updating citation keys')

    return
  )

  postfixAlpha: (n) ->
    postfix = ''
    a = 1
    b = 26
    while (n -= a) >= 0
      postfix = String.fromCharCode(parseInt(n % b / a) + 97) + postfix
      a = b
      b *= 26
    return postfix

  postfixRE: {
    numeric: /^(-[0-9]+)?$/
    alphabetic: /^([a-z])?$/
  }

  propose: (item) ->
    debug('KeyManager.propose: getting existing key from extra field,if any')
    citekey = Citekey.get(item.getField('extra'))
    debug('KeyManager.propose: found key', citekey)
    citekey.pinned = !!citekey.pinned

    return citekey if citekey.pinned

    debug('KeyManager.propose: formatting...', citekey)
    proposed = Formatter.format(item)
    debug('KeyManager.propose: proposed=', proposed)

    if citekey = @keys.findOne({ itemID: item.id })
      # item already has proposed citekey ?
      debug("KeyManager.propose: testing whether #{item.id} can keep #{citekey.citekey}")
      if citekey.citekey.startsWith(proposed.citekey)                                                         # key begins with proposed sitekey
        re = (proposed.postfix == '0' && @postfixRE.numeric) || @postfixRE.alphabetic
        if citekey.citekey.slice(proposed.citekey.length).match(re)                                           # rest matches proposed postfix
          if !(other = @keys.findOne({ libraryID: item.libraryID, citekey: citekey.citekey, itemID: { $ne: item.id } })) # noone else is using it
            return citekey
#          else
#            debug('KeyManager.propose: no, because', other, 'is using it')
#        else
#          debug('KeyManager.propose: no, because', citekey.citekey.slice(proposed.citekey.length), 'does not match', '' + re)
#      else
#        debug('KeyManager.propose: no, because', citekey.citekey, 'does not start with', citekey.citekey)

    debug("KeyManager.propose: testing whether #{item.id} can use proposed #{proposed.citekey}")
    # unpostfixed citekey is available
    if !@keys.findOne({ libraryID: item.libraryID, citekey: proposed.citekey, itemID: { $ne: item.id } })
      debug("KeyManager.propose: #{item.id} can use proposed #{proposed.citekey}")
      return { citekey: proposed.citekey, pinned: false}

    debug("KeyManager.propose: generating free citekey from #{item.id} from", proposed.citekey)
    postfix = 1
    while true
      postfixed = proposed.citekey + (if proposed.postfix == '0' then '-' + postfix else @postfixAlpha(postfix))
      if !@keys.findOne({ libraryID: item.libraryID, citekey: postfixed })
        debug("KeyManager.propose: found <#{postfixed}> for #{item.id}")
        return { citekey: postfixed, pinned: false }
      postfix += 1

    # we should never get here
    debug("KeyManager.propose: we should not be here!")
    return null

  update: (item, current) ->
    return if item.isNote() || item.isAttachment()

    current ||= @keys.findOne({ itemID: item.id })
    proposed = @propose(item)

    return current.citekey if current && current.pinned == proposed.pinned && current.citekey == proposed.citekey

    if current
      current.pinned = proposed.pinned
      current.citekey = proposed.citekey
      @keys.update(current)
    else
      @keys.insert({ itemID: item.id, libraryID: item.libraryID, pinned: proposed.pinned, citekey: proposed.citekey })

    return proposed.citekey

   remove: (ids) ->
     ids = [ids] unless Array.isArray(ids)
     debug('KeyManager.remove:', ids)
     @keys.findAndRemove({ itemID : { $in : ids } })
     return

  get: (itemID) ->
    if !@keys
      err = new Error("KeyManager.get called for #{itemID} before init")
      # throw err unless softFail
      Zotero.logError(err)
      return { citekey: '', pinned: false, retry: true }

    return key if key = @keys.findOne({ itemID })

    err = new Error("KeyManager.get called for non-existent #{itemID}")
    # throw err unless softFail
    Zotero.logError(err)
    return { citekey: '', pinned: false }

debug('KeyManager: loaded', Object.keys(Formatter))

module.exports = new KeyManager()
