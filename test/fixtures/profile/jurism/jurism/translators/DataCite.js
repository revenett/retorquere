{
	"translatorID": "9f1fb86b-92c8-4db7-b8ee-0b481d456428",
	"label": "DataCite",
	"creator": "Aurimas Vinckevicius",
	"target": "",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 8,
	"browserSupport": "gcsibv",
	"lastUpdated": "2018-07-09 07:15:00"
}

function detectSearch(items) {
	if (!items) return false;
	
	if (typeof items == 'string' || !items.length) items = [items];
	
	for (var i=0, n=items.length; i<n; i++) {
		if (!items[i]) continue;
		
		if (items[i].DOI && ZU.cleanDOI(items[i].DOI)) return true;
		if (typeof items[i] == 'string' && ZU.cleanDOI(items[i])) return true;
	}
	
	return false;
}

function filterQuery(items) {
	if (!items) return [];
	
	if (typeof items == 'string' || !items.length) items = [items];
	
	//filter out invalid queries
	var dois = [], doi;
	for (var i=0, n=items.length; i<n; i++) {
		if (items[i].DOI && (doi = ZU.cleanDOI(items[i].DOI)) ) {
			dois.push(doi);
		} else if (typeof items[i] == 'string' && (doi = ZU.cleanDOI(items[i])) ) {
			dois.push(doi);
		}
	}
	return dois;
}

function doSearch(items) {
	var dois = filterQuery(items);
	if (!dois.length) return;
	
	processDOIs(dois);
}

function fixJSON(text) {
	try {
		var item = JSON.parse(text);
	  //Z.debug(item)
		if (item.type == 'misc') item.type = 'article-journal';
		if (item.type == 'dataset') {
			item.note = "type: dataset";
			if (item["container-title"]) {
				//see test case for 10.17171/2-3-1
				item.note += "\ncontainer-title: " + item["container-title"];
			}
		}
		if (item.issued && item.issued.raw) item.issued.literal = item.issued.raw;
		if (item.accessed && item.accessed.raw) item.accessed.literal = item.accessed.raw;
		
		return JSON.stringify([item]);
	} catch(e) {
		return false;
	}
}

function processDOIs(dois) {
	var doi = dois.pop();
	ZU.doGet('https://data.datacite.org/application/citeproc+json/' + encodeURIComponent(doi), function(text) {
		text = fixJSON(text);
		if (!text) {
			return;
		}
		
		// use CSL JSON translator
		var trans = Zotero.loadTranslator('import');
		trans.setTranslator('bc03b4fe-436d-4a1f-ba59-de4d2d7a63f7');
		trans.setString(text);
		trans.setHandler("itemDone", function(obj, item) {
			if (!item.DOI) {
				if (item.extra) {
						item.extra +="\nDOI: " + doi;
				}
				else {
					item.extra = "DOI: " + doi;
				}
			}
			item.complete();
		});
		trans.translate();
	}, function() {
		if (dois.length) processDOIs(dois);
	});
}

/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "search",
		"input": {
			"DOI": "10.12763/ONA1045"
		},
		"items": [
			{
				"itemType": "report",
				"creators": [
					{
						"lastName": "Heiliges R??misches Reich Deutscher Nation",
						"fieldMode": 1,
						"creatorType": "author"
					}
				],
				"notes": [],
				"tags": [],
				"seeAlso": [],
				"attachments": [],
				"title": "Code criminel de l'empereur Charles V vulgairement appell?? la Caroline contenant les loix qui sont suivies dans les jurisdictions criminelles de l'Empire et ?? l'usage des conseils de guerre des troupes suisses.",
				"date": "1734",
				"itemID": "https://doi.org/10.12763/ona1045",
				"abstractNote": "Le code est accompagn?? de commentaires de F. A. Vogel, qui signe l'??pitre d??dicatoire",
				"language": "fre",
				"institution": "de l'imprimerie de Claude Simon (A Paris)",
				"libraryCatalog": "DataCite",
				"extra": "DOI: 10.12763/ONA1045"
			}
		]
	},
	{
		"type": "search",
		"input": {
			"DOI": "10.17171/2-3-1"
		},
		"items": [
			{
				"itemType": "document",
				"url": "http://repository.edition-topoi.org/collection/MAGN/object/V1.2-71",
				"publisher": "Edition Topoi",
				"date": "2016",
				"extra": "type: dataset\ncontainer-title: Architectural Fragments from Magnesia on the Maeander\nDOI: 10.17171/2-3-1",
				"accessDate": "2018-07-15 23:32:00",
				"libraryCatalog": "DataCite",
				"abstractNote": "About a quarter of the piece is preserved.",
				"title": "Ionic capital",
				"creators": [
					{
						"creatorType": "author",
						"fieldMode": 1,
						"lastName": "Staatliche Museen Zu Berlin-Antikensammlung"
					}
				],
				"tags": [],
				"attachments": [],
				"notes": [],
				"seeAlso": []
			}
		]
	}
]
/** END TEST CASES **/
