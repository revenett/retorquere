debug = require('./debug.coffee')
Prefs = require('./preferences.coffee')
co = Zotero.Promise.coroutine
Formatter = require('./keymanager/formatter.coffee')
getCiteKey = require('./getCiteKey.coffee')

class KeyManager
  init: co(->
    debug('KeyManager.init...')
    @query = {
      field: {}
      type: {}
    }

    for field in yield Zotero.DB.queryAsync("select fieldID, fieldName from fields where fieldName in ('extra')")
      @query.field[field.fieldName] = field.fieldID
    for type in yield Zotero.DB.queryAsync("select itemTypeID, typeName from itemTypes where typeName in ('note', 'attachment')") # 1, 14
      @query.type[type.typeName] = type.itemTypeID

    @formatter = new Formatter(@)

    @observerID = Zotero.Notifier.registerObserver(@, ['item'], 'BetterBibTeX.KeyManager', 100)

    if Prefs.get('scanCitekeys')
      yield @update(yield @unset())
      Prefs.set('scanCitekeys', false)
      debug('KeyManager.init: scanning for unset keys finished')

    debug('KeyManager.init: done')

    Prefs.observe((subject, topic, data) =>
      key = data.split('.')
      key = key[key.length - 1]
      if key in ['autoAbbrev', 'autoAbbrevStyle', 'citekeyFormat', 'citekeyFold', 'skipWords']
        @formatter.update()
        @patternChanged().catch(err -> debug('KeyManager.patternChanged error:', err))
      return
    )
    return
  )

  notify: co((action, type, ids, extraData) ->
    debug('KeyManager.notify', {action, type, ids, extraData})

    ## TODO: test for field updates https://groups.google.com/d/msg/zotero-dev/naAxXIbpDhU/7rM-5IKGBQAJ

    ## skip saves we caused ourselves
    ids = (id for id in ids when !extraData[id].BetterBibTeX)
    debug('KeyManager.notify', {ids})

    yield @update(ids)

    return
  )

  citekeyRE: /(?:^|\n)bibtex(\*?):\s*([^\n]+)(?:\n|$)/

  unset: co(->
    unset = []
    items = yield Zotero.DB.queryAsync("""
      select item.itemID, extra.value as extra
      from items item
      left join itemData field on field.fieldID = #{@query.field.extra} and field.itemID = item.itemID
      left join itemDataValues extra on extra.valueID = field.valueID
      where item.itemTypeId not in (#{@query.type.attachment}, #{@query.type.note}) and item.itemID not in (select itemID from deletedItems)
    """)
    for item in items
      citekey = getCiteKey(item)
      unset.push(item.itemID) unless citekey.citekey
    return unset
  )

  patternChanged: co(->
    dyn = []
    items = yield Zotero.DB.queryAsync("""
      select item.itemID, extra.value as extra
      from items item
      join itemData field on field.fieldID = #{@query.field.extra} and field.itemID = item.itemID
      join itemDataValues extra on extra.valueID = field.valueID
      where item.itemTypeId not in (#{@query.type.attachment}, #{@query.type.note}) and item.itemID not in (select itemID from deletedItems)
    """)
    for item in items
      citekey = getCiteKey(item)
      dyn.push(item.itemID) if citekey.dynamic || !citekey.citekey
    yield @update(dyn)
    return
  )

  # update finds all references without citation keys, and all dynamic references that are marked to be overridden -- either
  # an array of ids, or the string '*' for all dynamic references (only to be used when the pattern changes)
  update: co((ids = []) ->
    debug('KeyManager.update', {ids})
    return unless ids.length

    citekeys = {}
    update = []

    start = new Date()
    debug('Keymanager.update: citekey scan start')
    items = yield Zotero.DB.queryAsync("""
      select item.itemID, item.libraryID, extra.value as extra
      from items item
      join itemData field on field.itemID = item.itemID
      join itemDataValues extra on extra.valueID = field.valueID
      where field.fieldID = #{@query.field.extra} and field.itemID not in (select itemID from deletedItems)
    """)
    for item in items
      ### TODO: remove ###
      continue
      citekeys[item.libraryID] ||= {}

      citekey = getCiteKey(item)
      citekeys[item.libraryID][citekey.citekey] = true if !citekey.dynamic || !item.itemID in ids
    debug('Keymanager.update: citekey scan complete:', new Date() - start)

    debug('KeyManager.update', {citekeys})

    basechar = 'a'.charCodeAt(0) - 1

    items = yield Zotero.Items.getAsync(ids)
    debug('KeyManager.update:', {update: update.length, items: items.length})
    for item in items
      citekeys[item.libraryID] ||= {}
      extra = {extra: item.getField('extra') || ''}

      citekey = getCiteKey(extra)

      continue unless citekey.dynamic
      citekey = citekey.citekey

      proposed = @formatter.format(item)

      debug('KeyManager.update:', {id: item.id, library: item.libraryID, extra, found: citekey, proposed, keys: citekeys[item.libraryID]})

      # let's see if we can keep this citekey
      if citekey && !citekeys[item.libraryID][citekey]
        # citekey is unchanged and also not taken -- rare
        if citekey == proposed.citekey
          citekeys[item.libraryID][citekey] = true
          debug('KeyManager.update: keeping', {citekey})
          continue

        if citekey.startsWith(proposed.citekey)
          if proposed.postfix == '0'
            if citekey.substr(proposed.citekey.length).match(/-[0-9]+$/)
              citekeys[item.libraryID][citekey] = true
              debug('KeyManager.update: keeping', {citekey})
              continue
          else
            if citekey.substr(proposed.citekey.length).match(/[a-z]$/)
              citekeys[item.libraryID][citekey] = true
              debug('KeyManager.update: keeping', {citekey})
              continue

      debug('KeyManager.update: discarding', {citekey}) if citekey

      # perhaps no postfixing is required
      if !citekeys[item.libraryID][proposed.citekey]
        citekey = proposed.citekey

      # seek free postfix
      else
        postfix = 1
        while true
          citekey = proposed.citekey + (if proposed.postfix == '0' then '-' + postfix else String.fromCharCode(basechar + postfix))
          break unless citekeys[item.libraryID][citekey]
          postfix += 1

      debug('KeyManager.update: new', {citekey})
      citekeys[item.libraryID][citekey] = true

      item.setField('extra', (extra.extra + "\nbibtex*:" + citekey).trim())
      debug('Keymanager.update: setting citekey:', item.id, citekey)
      yield item.saveTx({ notifierData: { BetterBibTeX: true } })

    return
  )

module.exports = new KeyManager()
