import { Preference } from '../../gen/preferences'
import { log } from '../logger'
import { Events } from '../events'

import Jieba = require('ooooevan-jieba')
import Pinyin from 'pinyin'

export const jieba = new class {
  private jieba: any

  init() {
    log.debug('jieba enabled:', Preference.jieba)
    this.load()
    Events.on('preference-changed', pref => {
      if (pref === 'jieba') this.load()
    })
  }

  private load() {
    if (Preference.jieba && !this.jieba) {
      this.jieba = new Jieba()
      this.jieba.load()
    }
  }

  public cut(input: string): string[] {
    if (Preference.jieba) {
      this.init()
    }
    else {
      throw new Error('jieba not loaded')
    }
    return (this.jieba.cut(input, { cutAll: false, dag: false, hmm: true, cutForSearch: false }) as string[])
  }
}

export function pinyin(str: string): string {
  return (Pinyin(str) as string[][]).map((c: string[]) => c[0]).join('')
}
