---
tags:
- automatic-export
- configuration
- export
- preferences
title: Automatic export
weight: 13
---


#### Automatic export

default: `On Change`

Determines when [automatic exports](push-and-pull) are kicked off. Having it disabled still marks
auto-exports as needing updates, so when you re-enable it, those exports will start. On-change means exports
happen whenever a reference in the export changes/is added/is removed. On idle does more or less what
`Disabled` (that is, no exports but mark as needing changes), but will kick off exports when your computer is
idle. You mostly want this if your computer is performance-constrained (aka slow).

Options:

* Disabled
* On Change
* When Idle


