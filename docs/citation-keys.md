Standard Zotero BibTeX citations keys are fully auto-generated, using an algorithm that usually generates unique keys. For serious LaTeX
users, "usually" presents the following problems:

* If a non-unique key is generated, which one gets postfixed with a distinguishing character is essentially
  non-deterministic.
* The keys are *always* auto-generated, so if you correct a typo in the author name or title, the key will change
* You can't see the citation keys until you export them

For a LaTeX author, the citation keys have their own meaning, fully separate from the other reference data, even if
people usually pick a naming scheme related to them. As the citation key is *the* piece of data that connects your
bibliography, this is a piece of data you want to have control over. BBT offers you this control:

* Set your own, fixed citation keys
* Stable citation keys, without key clashes. BBT generates citation keys that take into
  account other existing keys in your library
  in a deterministic way, regardless of what part of your library you export, or the order in which you do it.
* Generate citation keys from JabRef patterns

You can also

* Drag and drop LaTeX citations to your favorite LaTeX editor
* Show both pinned (fixed) citation keys and dynamically generated ones in the reference list view
* Search for citation keys (if you select "All fields and tags" in the search box)

## Set your own, fixed citation keys

You can fix the citation key for a reference by adding the text "bibtex: [your citekey]" (sans quotes) anywhere in the
"extra" field of the reference, or by using biblatexcitekey\[my_key\]. You can generate a fixed citation key by
selecting references, right-clicking, and selecting "Generate BibTeX key".

## Drag and drop/hotkey citations

You can drag and drop citations into your LaTeX/Markdown/Orgmode editor, and it will add a proper `\cite{citekey}`/`[@citekey]`/`[[zotero://select...][@citekey]`. The `cite` command is
configurable for LaTeX by setting the config option in the [[Preferences|Configuration]]. Do not include the leading backslash. This feature requires a one-time setup: go to Zotero preferences, tab Export, under Default Output Format, select "Better BibTeX Quick Copy", and choose the Quick Copy format under the `Citation keys` preferences for BBT.

## Find duplicate keys through integration with [Report Customizer](https://github.com/retorquere/zotero-report-customizer)

The plugin will generate BibTeX comments to show whether a key conflicts and with which entry. BBT integrates with
[Zotero: Report Customizer](https://github.com/retorquere/zotero-report-customizer) to display the BibTeX key plus any
conflicts between them in the zotero report.

## Configurable citekey generator

BBT also implements a new citekey generator for those entries that don't have one set explicitly; the formatter follows
the [JabRef key formatting syntax](http://jabref.sourceforge.net/help/LabelPatterns.php) in the Better BibTeX
preferences (you can get there via the Zotero preferences, or by clicking the Better BibTeX "Preferences" button in the addons pane.

The default key pattern is `[zotero]`, which implements the key generator of the standard Bib(La)TeX exporters in
order to ease migration from existing exports for people who previously used the standard Zotero Bib(La)TeX exports. **I would strongly recommend setting a different pattern**, because Zotero's key generator has a number of problems, including readily generating citation keys not supported by LaTeX's bibliography processors. Using the `[zotero]` pattern inherits all the problems of the standard Zotero citekey generation except one; where Zotero will, by default, generate duplicate keys if you export overlapping parts of your library, BBT will not. That said, **don't use the `[zotero]` pattern** unless you already have a lot of papers that rely on those keys.

A common pattern is `[auth:lower][year]`, which means

1. last name of first author without spaces, in lowercase
2. year of publication if any,
3. a letter postfix in case of a clash (this part is always added, you can't disable it)



**note that changing the pattern will cause all your non-fixed keys to be regenerated**

If you want to get fancy, you can set multiple patterns separated by a vertical bar, of which the first will be applied
that yields a non-empty string. If all return a empty string, a random key will be generated. Note that in addition to
the 'special' fields listed JabRef also allows all 'native' fields as key values; the plugin does the same but allows
for *Zotero* native fields (case sensitive!) not Bib(La)TeX native fields. The possible fields are:

|                      |                      |                      |                      |
| -------------------- | -------------------- | -------------------- | -------------------- |
| AbstractNote         | AccessDate           | ApplicationNumber    | Archive              |
| ArchiveLocation      | ArtworkMedium        | ArtworkSize          | Assignee             |
| Attachments          | AudioFileType        | AudioRecordingFormat | BillNumber           |
| BlogTitle            | BookTitle            | CallNumber           | CaseName             |
| Code                 | CodeNumber           | CodePages            | CodeVolume           |
| Committee            | Company              | ConferenceName       | Country              |
| Court                | Date                 | DateAdded            | DateDecided          |
| DateEnacted          | DateModified         | DictionaryTitle      | Distributor          |
| DocketNumber         | DocumentNumber       | DOI                  | Edition              |
| EncyclopediaTitle    | EpisodeNumber        | Extra                | FilingDate           |
| FirstPage            | ForumTitle           | Genre                | History              |
| Institution          | InterviewMedium      | ISBN                 | ISSN                 |
| Issue                | IssueDate            | IssuingAuthority     | ItemType             |
| JournalAbbreviation  | Label                | Language             | LegalStatus          |
| LegislativeBody      | LetterType           | LibraryCatalog       | ManuscriptType       |
| MapType              | Medium               | MeetingName          | Month                |
| NameOfAct            | Network              | Notes                | Number               |
| NumberOfVolumes      | NumPages             | Pages                | PatentNumber         |
| Place                | PostType             | PresentationType     | PriorityNumbers      |
| ProceedingsTitle     | ProgrammingLanguage  | ProgramTitle         | PublicationTitle     |
| PublicLawNumber      | Publisher            | References           | Related              |
| Reporter             | ReporterVolume       | ReportNumber         | ReportType           |
| Rights               | RunningTime          | Scale                | Section              |
| Series               | SeriesNumber         | SeriesText           | SeriesTitle          |
| Session              | ShortTitle           | Source               | Studio               |
| Subject              | System               | Tags                 | ThesisType           |
| Title                | University           | Url                  | Version              |
| VideoRecordingFormat | Volume               | WebsiteTitle         | WebsiteType          |

### Advanced usage

BBT adds a few fields, flags and filter functions that JabRef (perhaps wisely) doesn't. These are:

#### Functions

- `auth`, `authIni`, `edtr`, ... and all the author-related fields that mimic the JabRef equivalents also have
  capitalized versions (so `Auth`, `AuthIni`, `Edtr`, ...) which follow the same algorithm but do not have any cleaning
  (diacritic folding, space removal, stripping of invalid citekey characters) applied. These can be used to pass through
  the filters specified below much like the fields from the table above. See also "usage note" below.
- `journal`: returns the journal abbreviation, or, if not found, the journal title, If 'automatic journal abbreviation' is enabled in the BBT settings, it will use the same abbreviation filter Zotero
  uses in the wordprocessor integration. You might want to use the `abbr` filter (see below) on this.
- `library`: returns the name of the shared group library, or nothing if the reference is in your personal library
- `0`: a pseudo-function that sets the citekey disambiguation postfix to numeric (-1, -2, etc, like the standard Zotero
  Bib(La)TeX translators do) rather than alphabetic (a, b, c). Does not add any text to the citekey otherwise.
- `>X`: a pseudo-function which aborts the current pattern generation if what came before it is X characters or less (`[>0]` is a typical use. You'd typically use this with something like `[auth][>0][year]|[title][year]` which means if there's no author you get `title-year` rather than just `year`.

#### Flags

- `+initials` adds initials to any author name function. Specify using e.g. [auth+initials]

#### Filters

- `nopunct`: removes punctuation
- `condense`: this replaces spaces in the value passed in. You can specify what to replace it with by adding it as a
  parameter, e.g `condense,_` will replace spaces with underscores. **Parameters should not contain spaces** unless you
  want the spaces in the value passed in to be replaced with those spaces in the parameter
- `skipwords`: filters out common words like 'of', 'the', ... the list of words can be seen and changed by going into
  `about:config` under the key `extensions.zotero.translators.better-bibtex.skipWords` as a comma-separated,
  case-insensitive list of words.
  If you want to strip words like 'Jr.' from names, you could use something like `[Auth:nopunct:skipwords:fold]` after adding `jr` to the skipWords list.
  Note that this filter is always applied if you use `title` (which is different from `Title`) or `shorttitle`.
- `select`: selects words from the value passed in. The format is `select,start,number` (1-based), so `select,1,4`
  would select the first four words. If `number` is not given, all words from `start` to the end of the list are selected. It is important to note that `select' works only on values that have the words separated by whitespace, so the caveat below applies.
- `ascii`: removes all non-ascii characters
- `fold`: tries to replace diacritics with ascii look-alikes. Removes non-ascii characters it cannot match
- `alphanum`: clears out everything but unicode alphanumeric characters (unicode character classes `L` and `N`)
- `capitalize`: uppercases the first letter of each word
- `postfix`: postfixes with its parameter, so `postfix,_` will add an underscore to the end if, and only if, the value
  it is supposed to postfix isn't empty
- `prefix`: prefixes with its parameter, so `prefix,_` will add an underscore to the front if, and only if, the value
  it is supposed to prefix isn't empty. If you want to use a reserved character (such as `:` or `\`), you'll need to add a
  backslash (`\`) in front of it.

*Usage note*: the functions `condense`, `skipwords`, `capitalize` and `select` rely on whitespaces for word handling. The JabRef functions strip
whitespace and thereby make these filter functions sort of useless. You will in general want to use the fields from the
table above, which give you the values from Zotero without any changes.

## Generation of stable keys, and syncing

Better BibTeX versions after 0.6.8 generate stable citation keys across your entire library. These stable keys come in
two flavors:

1. 'soft' keys, which auto-update whenever the relevant data from the reference does, and
2. 'pinned' or 'fixed' keys, which don't.

The pinned keys show up in the 'extra' field of your references, and sync across libraries. The citation key is shown in
the details pane of the reference, and in the `extra` column of the references list if you have enabled it in the BBT
preferences. In the details pane, soft keys are displayed in italics; in the references list, soft keys have an asterisk
after the key. The soft keys **do not sync**, but they're present in a separate
database so partial exports will know to generate keys not already in use (even if that is a 'soft' use), and so these
soft keys will reliably survive restarts of Zotero.

Quite a bit of trickery is involved in generating these stable keys, and some of this trickery could cause an undue burden
on the Zotero sync infrastructure. To prevent such strain on the Zotero sync servers, the following restrictions are in
place:

* By default, BBT only generates soft keys. You can generate a pinned key by right-clicking the reference and choosing
  'Generate BibTeX key'. You can clear this key either by editing the extra field, or right-clicking the reference and
  selecting 'clear BibTeX key'. Clearing will immediately generate a fresh soft key.
* If you want to make sure all your exported BibTeX files have pinned keys (very useful if you have a shared library, or
  you work from multiple workstations), go into the BBT preferences and select 'on export'. This option will be greyed out
  unless you have Zotero sync off, or, if enabled, have set it to auto-sync. Each pinned key change (or clearing of a
  pinned key) means a change to the reference, and that means the item will be synced if you have that set up. Massive
  amounts of key changes (which can easily happen if you have on-export and you export your full library) could
  overwhelm the Zotero sync service if presented in sudden bulk; automatic syncing ameliorates that problem. I'm working
  on a change so you can make this a per-library setting, and a change that syncs citekeys outside the Zotero servers.
* If you always want pinned keys, go into the BBT preferences and select 'on change'. Mind that creation of a new
  reference counts as a change, and thus any new reference created (e.g. through import by any means) will immediately
  get a fixed key set which will *not* respond to subsequent edits of the reference.

I am terribly sorry having to do this, but not doing this would risk sync being permanently impossible, as the Zotero
server will kick you out if a sync takes too long.
