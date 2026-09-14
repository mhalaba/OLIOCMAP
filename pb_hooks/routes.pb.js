/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/feed.geojson", (e) => {
  require(`${__hooks}/lib/routes_handlers.js`).feed(e);
});

routerAdd("GET", "/api/status", (e) => {
  require(`${__hooks}/lib/routes_handlers.js`).status(e);
});

routerAdd("GET", "/api/config", (e) => {
  require(`${__hooks}/lib/routes_handlers.js`).config(e);
});
