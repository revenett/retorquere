Using for remote code execution:

* Install VScode
* Install VSCode Code Runner (https://github.com/formulahendry/vscode-code-runner/) in VSCode
* Get debug-bridge from https://github.com/retorquere/zotero-better-bibtex/releases/tag/debug-bridge and install in Zotero
* In the VSCode Code Runner options, create a customCommand `cd $dir && curl -s -H "Content-Type: application/javascript" -X POST --data-binary @$fileName http://127.0.0.1:23119/debug-bridge/execute`

Now you can edit your javascript and run with and run with ctrl-alt-K.

By default, this is unprotected, and any program running on the same
system as Zotero could issue commands through this interface. If you
want to guard against this, go into the Advanced section of the Zotero
settings and open the Config Editor; create a new string value
with the name `extensions.zotero.debug-bridge.password`,
enter a password there, and change the url above to
`http://127.0.0.1:23119/debug-bridge/execute?password=<your password>`,
but if you have something running on your computer that may exploit
this, such a hostile program can likely achieve its ends easier
and more reliably without using this conduit.
