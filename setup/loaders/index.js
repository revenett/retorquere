const fs = require('fs')
const path = require('path')
const diff = require('diff')
const { bibertool } = require('./bibertool')
const pegjs = require('pegjs')
const shell = require('shelljs')
const { filePathFilter } = require('file-path-filter')
const esbuild = require('esbuild')
const putout = require('putout')
const { estracePlugin: estrace } = require('estrace/plugin')

function load_patches(dir) {
  const patches = {}
  for (let patchfile of fs.readdirSync(dir)) {
    for (const patch of diff.parsePatch(fs.readFileSync(path.join(dir, patchfile), 'utf-8'))) {
      if (patch.oldFileName != patch.newFileName) throw new Error(`${patchfile} renames ${JSON.stringify(patch.oldFileName)} to ${JSON.stringify(patch.newFileName)}`)
      if (patches[patch.oldFileName]) throw new Error(`${patchfile} re-patches ${JSON.stringify(patch.oldFileName)}`)
      if (!patch.oldFileName.startsWith('node_modules/')) throw new Error(`${patchfile} patches ${JSON.stringify(patch.oldFileName)} outside node_modules`)
      patches[patch.oldFileName] = patch
    }
  }
  return patches
}

module.exports.patcher = function(dir) {
  const patches = load_patches(dir)
  const filter = '.*\\/(' + Object.keys(patches).map(source => source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')$'

  return {
    name: 'patcher',
    setup(build) {
      build.onLoad({ filter: new RegExp(filter) }, async (args) => {
        const target = args.path.replace(/.*[/]node_modules[/]/, 'node_modules/')
        console.log('  patching', target)
        const source = await fs.promises.readFile(args.path, 'utf-8')
        const patch = patches[target]

        return {
          contents: diff.applyPatch(source, patch),
          loader: 'js',
        }
      })
    }
  }
}

module.exports.bibertool = {
  name: 'bibertool',
  setup(build) {
    build.onLoad({ filter: /\/biber-tool\.conf$/ }, async (args) => {
      return {
        contents: bibertool(await fs.promises.readFile(args.path, 'utf-8')),
        loader: 'js'
      }
    })
  }
}

module.exports.pegjs = {
  name: 'pegjs',
  setup(build) {
    build.onLoad({ filter: /\.pegjs$/ }, async (args) => {
      return {
        contents: pegjs.generate(await fs.promises.readFile(args.path, 'utf-8'), {
          output: 'source',
          cache: false,
          optimize: 'speed',
          trace: false,
          format: 'commonjs',
        }),
        loader: 'js'
      }
    })
  }
}

module.exports.__dirname = {
  name: '__dirname',
  setup(build) {
    build.onLoad({ filter: /\/node_modules\/.+\.js$/ }, async (args) => {
      let contents = await fs.promises.readFile(args.path, 'utf-8')
      const filename = 'resource://zotero-better-bibtex/' + args.path.replace(/.*\/node_modules\/(\.pnpm)?/, '')
      const dirname = path.dirname(filename)

      contents = [
        `var __dirname=${JSON.stringify(dirname)};`,
        `var __filename=${JSON.stringify(filename)};`,
        contents,
      ].join('\n')

      return {
        contents,
        loader: 'js'
      }
    })
  }
}

function modulename(source) {
  source = source.replace(/.*(^|\/)node_modules\//, '')
  if (source[0] === '.') return null
  const dirs = source.split('/')

  if (dirs[0][0] === '@') {
    return dirs.unshift(2).join('/')
  }
  else {
    return dirs[0]
  }
}
module.exports.modulename = modulename
module.exports.node_modules = function(dir) {
  const patched = [...new Set(Object.keys(load_patches(dir)).map(modulename))]
  const external = []

  return {
    patched,
    external,
    // plugin: nodeExternalsPlugin({ allowList: patched }),
    plugin: {
      name: 'node-externals',
      setup(build) {
        build.onResolve({ namespace: 'file', filter: /.*/ }, args => {
          const name = modulename(args.path)
          if (!name || patched.includes(name)) return null
          if (!external.includes(name)) external.push(name)
          return { path: args.path, external: true }
        })
      }
    }
  }
}

let trace
if (fs.existsSync(path.join(__dirname, '../../.trace.json'))) {
  const branch = (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/heads/')) ? process.env.GITHUB_REF.replace('refs/heads/', '') : shell.exec('git rev-parse --abbrev-ref HEAD', { silent: true }).stdout.trim()
  console.log('building on', branch)
  if (branch !== 'master' && branch !== 'main') {
    trace = require('../../.trace.json')
    trace = trace[branch]
    console.log(`instrumenting ${branch}: ${!!trace}`)
  }
}

const prefix = fs.readFileSync(path.join(__dirname, 'trace.js'), 'utf-8')
module.exports.trace = function(section) {
  const selected = trace && trace[section] ? filePathFilter(trace[section]) : null

  return {
    name: 'trace',
    setup(build) {
      build.onLoad({ filter: selected ? /\.ts$/ : /^$/ }, async (args) => {
        const source = await esbuild.transform(await fs.promises.readFile(args.path, 'utf-8'), { loader: 'ts' })
        for (const warning of source.warnings) {
          console.log('!!', warning)
        }

        const localpath = path.relative(process.cwd(), args.path)

        // inject __estrace so sources can tell an instrumented build is active even if not on the current source
        if (!selected(localpath)) {
          const contents = `const __estrace = true;\n${source.code}`
          return {
            contents,
            loader: 'js',
          }
        }

        console.log(`!!!!!!!!!!!!!! Instrumenting ${localpath} for trace logging !!!!!!!!!!!!!`)

        try {
          const {code} = putout(await fs.promises.readFile(source, 'utf-8'), {
            fixCount: 1,
            rules: {
              'estrace/trace': ['on', { url: 'inline', exclude: [ 'FunctionExpression', 'ArrowFunctionExpression' ] }],
            },
            plugins: [ estrace ],
          })

          return {
            contents: prefix + code,
            loader: 'js',
          }
        }
        catch (err) {
          await fs.promises.writeFile('/tmp/tt', `/* ${localpath.replace(/\.ts$/, '')}\n${err.stack}\n*/\n/${source.code}`)
          throw err
        }
      })
    }
  }
}
