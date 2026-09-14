/// <reference path="../pb_data/types.d.ts" />

/**
 * Oddolny portal + mesh:
 *  - kto potwierdził: verified_by_name / confirmed_by_name (inicjały + organizacja, bez PESEL),
 *  - potrzeby widzą też zaufani sąsiedzi (rola zaufany) i mogą je wziąć (assigned_to) albo zamknąć,
 *  - operator (nie tylko admin) dodaje i zaufa sąsiednim węzłom.
 */
migrate(
  (app) => {
    var points = app.findCollectionByNameOrId("points");
    if (!points.fields.getByName("verified_by_name")) {
      points.fields.add(new TextField({ name: "verified_by_name", max: 80 }));
    }
    if (!points.fields.getByName("confirmed_by_name")) {
      points.fields.add(new TextField({ name: "confirmed_by_name", max: 80 }));
    }
    var publicRule =
      "(status = 'verified' && blocked = false && category != 'potrzeba' && (deleted_at = '' || deleted_at = null))";
    var needRule =
      "(category = 'potrzeba' && status != 'expired' && (deleted_at = '' || deleted_at = null) && (@request.auth.role = 'zaufany' || @request.auth.role = 'operator' || @request.auth.role = 'admin'))";
    var staff = "(@request.auth.role = 'operator' || @request.auth.role = 'admin')";
    points.listRule = publicRule + " || " + needRule + " || (created_by = @request.auth.id) || " + staff;
    points.viewRule = points.listRule;
    points.updateRule =
      staff +
      " || (created_by = @request.auth.id && status = 'pending')" +
      " || (category = 'potrzeba' && status != 'expired' && @request.auth.role = 'zaufany')";
    app.save(points);

    var peers = app.findCollectionByNameOrId("peers");
    peers.createRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'";
    peers.updateRule = "@request.auth.role = 'admin' || @request.auth.role = 'operator'";
    app.save(peers);
  },
  (app) => {
    var points = app.findCollectionByNameOrId("points");
    points.listRule =
      "(status = 'verified' && blocked = false && category != 'potrzeba' && (deleted_at = '' || deleted_at = null)) || (created_by = @request.auth.id) || (@request.auth.role = 'operator' || @request.auth.role = 'admin')";
    points.viewRule = points.listRule;
    points.updateRule =
      "@request.auth.role = 'operator' || @request.auth.role = 'admin' || (created_by = @request.auth.id && status = 'pending')";
    try { points.fields.removeByName("verified_by_name"); } catch (e) {}
    try { points.fields.removeByName("confirmed_by_name"); } catch (e) {}
    app.save(points);
    var peers = app.findCollectionByNameOrId("peers");
    peers.createRule = "@request.auth.role = 'admin'";
    peers.updateRule = "@request.auth.role = 'admin'";
    app.save(peers);
  }
);
