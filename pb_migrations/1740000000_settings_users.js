/// <reference path="../pb_data/types.d.ts" />

function env(key, fallback) {
  var v = $os.getenv(key);
  if (v === null || v === undefined || v === "") return fallback;
  return v;
}

function flexibleId(collection) {
  var id = collection.fields.getByName("id");
  if (!id) return;
  id.min = 3;
  id.max = 40;
  id.pattern = "^[a-z0-9-]+$";
  id.autogeneratePattern = "[a-z0-9]{15}";
}

migrate((app) => {
  var settings = app.settings();
  settings.meta.appName = "Mapa Kryzysowa";
  settings.meta.appURL = "http://localhost";
  settings.logs.maxDays = 14;
  settings.rateLimits.enabled = true;
  settings.rateLimits.rules = [
    { label: "users:create", duration: 60, maxRequests: 8, audience: "@guest" },
    { label: "points:create", duration: 60, maxRequests: 20, audience: "@auth" },
    { label: "/api/", duration: 10, maxRequests: 120, audience: "" },
  ];
  app.save(settings);

  var users = app.findCollectionByNameOrId("users");
  users.listRule = "id = @request.auth.id || @request.auth.role = 'admin'";
  users.viewRule = "id = @request.auth.id || @request.auth.role = 'admin' || @request.auth.role = 'operator'";
  users.createRule = "";
  users.updateRule = "id = @request.auth.id || @request.auth.role = 'admin'";
  users.deleteRule = null;

  var nameField = users.fields.getByName("name");
  if (nameField) {
    nameField.required = true;
    nameField.max = 60;
  }

  if (!users.fields.getByName("role")) {
    users.fields.add(new SelectField({
      name: "role",
      required: true,
      maxSelect: 1,
      values: ["citizen", "zaufany", "operator", "admin"],
    }));
  }
  if (!users.fields.getByName("org_name")) {
    users.fields.add(new TextField({ name: "org_name", max: 80 }));
  }
  if (!users.fields.getByName("node_id")) {
    users.fields.add(new TextField({ name: "node_id", max: 40 }));
  }
  if (!users.fields.getByName("invite_code")) {
    users.fields.add(new TextField({ name: "invite_code", max: 16 }));
  }

  app.save(users);
}, (app) => {
  /* keep users */
});
