/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  require(`${__hooks}/lib/points_handlers.js`).create(e);
}, "points");

onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/points_handlers.js`).update(e);
}, "points");

onRecordDeleteRequest((e) => {
  require(`${__hooks}/lib/points_handlers.js`).remove(e);
}, "points");

onRecordEnrich((e) => {
  require(`${__hooks}/lib/points_handlers.js`).enrich(e);
}, "points");
