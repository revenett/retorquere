/* eslint-disable @typescript-eslint/no-unsafe-return */
declare const Zotero: any
import { get as getLibrary } from './library'

class CollectionError extends Error {
  kind: 'duplicate' | 'notfound'

  constructor(message: string, kind: 'duplicate' | 'notfound') {
    // 'Error' breaks prototype chain here
    super(message)

    // restore prototype chain
    Object.setPrototypeOf(this, new.target.prototype)

    this.kind = kind
  }
}

async function getCollection(parent, name, path, create) {
  const children = parent instanceof Zotero.Library ? Zotero.Collections.getByLibrary(parent.id) : Zotero.Collections.getByParent(parent.id)
  let found = children.filter(coll => coll.name === name)
  switch (found.length) {
    case 0:
      break
    case 1:
      return found[0]
    default:
      throw new CollectionError(`Collection '${path}' is not unique`, 'duplicate')
  }

  found = children.filter(coll => coll.name.toLowerCase() === name.toLowerCase())
  switch (found.length) {
    case 0:
      break
    case 1:
      return found[0]
    default:
      throw new CollectionError(`Collection '${path}' is not unique`, 'duplicate')
  }

  if (!create) throw new CollectionError(`Collection '${path}' does not exist`, 'notfound')
  const collection = new Zotero.Collection({
    name,
    libraryID: parent instanceof Zotero.Library ? parent.id : parent.libraryID,
    parentID: parent instanceof Zotero.Library ? undefined : parent.id,
  })
  await collection.saveTx()
  return collection
}

export async function get(path: string, create = false): Promise<any> {
  const names = (path || '').split('/')
  if (names.shift() !== '') throw new CollectionError('path must be absolute', 'notfound')
  const root = names.shift()
  if (names.length === 0) throw new CollectionError('path is too short', 'notfound')

  let collection = root.match(/^[0-9]+$/) ? Zotero.Libraries.get(root) : getLibrary(root)
  if (!collection) throw new CollectionError(`Library ${root} not found`, 'notfound')
  let tmp_path = `/${root}`

  for (const name of names) {
    tmp_path += `/${name}`
    collection = await getCollection(collection, name, tmp_path, create)
  }

  return collection
}
