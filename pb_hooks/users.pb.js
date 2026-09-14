/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  require(`${__hooks}/lib/users_handlers.js`).create(e);
}, "users");

onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/users_handlers.js`).update(e);
}, "users");
