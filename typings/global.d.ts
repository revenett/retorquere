interface DirectoryIterator {
  forEach(handler: any): Promise<void>
  close(): void
  next: () => Entry
}
interface DirectoryIteratorConstructable {
  new(path: string): DirectoryIterator // eslint-disable-line @typescript-eslint/prefer-function-type
}

namespace OS {
  namespace File {
    type Entry = { isDir: boolean, size: number, path: string, unixMode?: number }
  }
}
declare const OS: {
  // https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/OSFile.jsm/OS.File_for_the_main_thread
  File: {
    exists: (path: string) => boolean | Promise<boolean>
    read: (path: string, options?: { encoding: string } ) => Uint8Array | Promise<Uint8Array>
    move: (from: string, to: string) => void | Promise<void>
    remove: (path: string, options?: { ignoreAbsent: boolean }) => Promise<void>
    writeAtomic: (path: string, data: Uint8Array | string, options?: { tmpPath?: string, encoding?: string }) => void | Promise<void>
    makeDir: (path: string, options?: { ignoreExisting?: boolean }) => void | Promise<void>
    stat: (path: string) => OS.File.Entry | Promise<OS.File.Entry>
    copy: (src: string, tgt: string, options?: { noOverwrite?: boolean }) => void
    removeDir: (path: string, options?: { ignoreAbsent?: boolean, ignorePermissions?: boolean }) => void

    DirectoryIterator: DirectoryIteratorConstructable
  }

  // https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/OSFile.jsm/OS.Path
  Path: {
    join: (...args: string[]) => string
    dirname: (path: string) => string
    basename: (path: string) => string
    normalize: (path: string) => string
    split: (path: string) => { absolute: boolean, components: string[], winDrive?: string }
  }
}

interface ZoteroItem {
  id: number
  isNote: () => boolean
  isAttachment: () => boolean
  isAnnotation?: () => boolean
  libraryID: number
  key: string
  getField: (string) => string | number
}

// https://stackoverflow.com/questions/39040108/import-class-in-definition-file-d-ts
declare const Zotero: {
  [attr: string]: any
  BetterBibTeX: import('../content/better-bibtex').CBetterBibTeX
}

declare const Components: any
declare const Services: any
