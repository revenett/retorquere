# Changelog

## [5.2.18] - 2020-03-05

 - tex.IDs= did not work (#1449)
 - optionally un-abbreviate journal titles on import (#1346)
 - Page range cleanup on export (#1438)
 - Allow Post Script to remove entries from extra field (#1423)
 - Export edition numbers as text for bibtex (#1446)
 - Duplicate number field caused export error (#1448)
 - Git pull/push was not triggered on automatic export (#1439)
 - LaTeX <> unicode mapping updates (#1434)
 - filter < span > from title for key generation
 - InspireHEP lookup failed (#1428)

## [5.2.16] - 2020-02-10

 - Custom postscript per export directory (#1101)
 - Auto-export including subcollections (#1074)
 - Performance improvements for large libraries(#1391)
 - \par breaks in annotations (#1422)
 - Make export stats available (#1391)
 - Performance improvements for CSL exports
 - Confirmation dialog for removing auto-exports (#1421)
 - Export Patent Applications as such (#1413)

## [5.2.14] - 2020-02-02

 - Foreground exports would fail, fixed
 - Retry for background workers
 - Collected notes exporter works again
 - Background exports to SMB shares sometimes fail, defaulting those to foreground
 - Stable sort for exports
 - Faster background export setup
 - Restore jabref groups import
 - Map "Page" CSL field in extra
 - Expose export dir / path to postscript
 - Find texstudio in the default installation dir for windows

## [5.2.10] 2020-01-27

 - Make export path available to postscript
 - Find TeXstudio in the default installation path on Windows
 - Map `page` CSL variable from `extra` field

## [5.2.10] 2020-01-20

 - Minimize required LaTeX packages by default
 - origyear was not taken from extra field for key generation
 - fix: attachment export creates empty directories
 - fix: sort CSL item fields for export

## [5.2.7] - 2020-01-11
 - allow capping the number of export workers

## [5.2.6] - 2020-01-11
 - fixed quality report for 'online' entries

## [5.2.5] - 2020-01-11
 - added cache support for workers

## [5.2.4] - 2020-01-10
 - bugfix in zotero worker shim

## [5.2.0] - 2020-01-10
 - merging of extra-fields would strip arXiv lines
 - clear out duplicate alias-ids on key refresh
 - cayw tex-studio push
 - re-add raw imports
 - preferences layout restructuring
 - always sort output
 - adds background exports

## [5.1.175] - 2019-12-28
 - overwrite standard zotero fields with explicit fields listed in `extra`

## [5.1.172] - 2019-12-25
 - import sentence casing fixed for non-english entries
 - citation graph exporter fixed

## [5.1.171] - 2019-12-18
 - Treat ideographs as individual words for key generation
 - icons for pinned keys

## [5.1.170] - 2019-12-15
 - fixed import of `online` entries
 - retain referencetype if it could not be matched on import

## [5.1.169] - 2019-12-06
 - loading icon caused 30% load on idle -- icon changed to static

## [5.1.168] - 2019-12-02
 - remove chatty logging
