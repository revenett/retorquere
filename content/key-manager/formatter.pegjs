{
}

start
  = patterns:pattern+ {
      var body = "var loop, citekey, postfix, chunk;\n"

      for (var pattern = 0; pattern < patterns.length; pattern++) {
			  body += "\nfor (loop = true; loop; loop=false) {\n  citekey = ''; postfix = 'a';\n\n"
        body += patterns[pattern] + "\n"
        body += "  citekey = citekey.replace(/[\\s{},]/g, '');\n"
        body += "  if (citekey) return {citekey: citekey, postfix: postfix};\n}\n"
      }
      body += "return {citekey: ''};"

      return body;
    }

pattern
  = blocks:block+ [\|]? { return blocks.filter(block => block).map(block => `  ${block}`).concat(['']).join(";\n") }

block
  = [ \t\r\n]+                            { return '' }
  / '[0]'                                 { return `postfix = '0'` }
  / '[=' types:[a-zA-Z/]+ ']'             { return `if (!${JSON.stringify(types.join('').toLowerCase().split('/'))}.includes(this.item.type.toLowerCase())) { break }` }
  / '[>' limit:[0-9]+ ']'                 { return `if (citekey.length <= ${limit.join('')}) { break }` }
  / '[' method:method filters:filter* ']' { return `${[method].concat(filters).join('; ')}; citekey += chunk`; }
  / chars:[^\|>\[\]]+                     { return `citekey += ${JSON.stringify(chars.join(''))}` }

method
  = prefix:('auth' / 'Auth' / 'authors' / 'Authors' / 'edtr' / 'Edtr' / 'editors' / 'Editors') name:[\.a-zA-Z]* params:mparams? flag:flag? {
      var scrub = (prefix[0] == prefix[0].toLowerCase());
      var creators = prefix.toLowerCase();
      var editorsOnly = (creators === 'edtr' || creators === 'editors');
      if (editorsOnly) creators = (creators == 'edtr') ? 'auth' : 'authors';

      if (flag && flag != 'initials') throw new Error("Unsupported flag " + flag + " in pattern")
      var withInitials = (flag == 'initials');

      var method = creators + name.join('');
      var $method = '$' + method.replace(/\./g, '_');

      if (!options[$method]) throw new Error(`Invalid method '${method}' in citekey pattern`)

      var args = [ '' + !!editorsOnly, '' + !!withInitials];
      if (params) args = args.concat(params); // mparams already are stringified integers

      var chunk = `chunk = this.${$method}(${args.join(', ')})`
      if (scrub) chunk += '; chunk = this.clean(chunk)';

      return chunk;
    }
  / name:[0\.a-zA-Z]+ params:mparams? {
      name = name.join('');
      var $method = '$' + name.replace(/\./g, '_');
      var chunk;

      if (options[$method]) {
        chunk = `chunk = this.${$method}(${(params || []).join(', ')})`
        if (name == 'zotero') chunk += `; postfix = '0'`
      } else {
        if (!name.match(/^[A-Z][A-Za-z]+$/)) throw new Error('Property access name "' + name + '" must start with a capital letter and can only contain letters');
        chunk = `chunk = this.$property(${JSON.stringify(name)})`
      }
      return chunk;
    }

mparams
  = n:[0-9]+ '_' m:[0-9]+             { return [n.join(''), m.join('')] }
  / n:[0-9]+                          { return [n.join('')] }

flag
  = '+' flag:[^_:\]]+                 { return flag.join('') }

filter
  = ':' text:default_filter  { return `chunk = chunk || ${JSON.stringify(text)}`; }
  / ':' f:function_filter   {
      var _filter = '_' + f.name;
      if (! options[_filter] ) throw new Error(`invalid filter "${f.name}" in pattern`);

      var params = ['chunk'].concat(f.params.map(function(p) { return JSON.stringify(p) }));

      return `chunk = this.${_filter}(${params})`;
    }

default_filter
  = '(' text:[^)]+ ')' { return text.join(''); }

function_filter
  = name:'fold' language:( [, =] ('german') )? {
      // handle here so the user gets feedback as the pattern is being typed
      return { name: name, params: language ? [ language[1] ] : [] };
    }
  / name:[a-z]+ params:fparam*  {
      return { name: name.join(''), params: params }
    }

fparam
  = [, =] value:fparamtext+ { return value.join('') }

fparamtext
  = chars:[^= ,\\\]:]+  { return chars.join(''); }
  / "\\" char:.       { return char;  }
