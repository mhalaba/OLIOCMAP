var env = require(`${__hooks}/lib/env.js`);

function actorRole(e) {
  if (!e.auth) return "";
  return String(e.auth.get("role") || "");
}

function isStaff(role) {
  return role === "admin" || role === "operator";
}

module.exports.create = function (e) {
  var rec = e.record;
  if (e.hasSuperuserAuth()) {
    e.next();
    return;
  }

  var actor = actorRole(e);
  var staffCreate = isStaff(actor);

  if (!staffCreate) {
    var mode = env.get("REGISTRATION_MODE", "open");
    if (mode === "closed") {
      throw new ForbiddenError("Rejestracja zamknięta — zgłoś się do OSP.");
    }
    if (mode === "invite") {
      var code = String(rec.get("invite_code") || "");
      if (code.length < 8) {
        throw new BadRequestError("Wymagany kod zaproszenia.");
      }
      var invite;
      try {
        invite = e.app.findFirstRecordByData("invites", "code", code);
      } catch (err) {
        throw new BadRequestError("Nieprawidłowy kod zaproszenia.");
      }
      var left = invite.getInt("uses_left");
      if (left <= 0) throw new BadRequestError("Kod zaproszenia został wykorzystany.");
      var exp = invite.get("expires_at");
      if (exp && String(exp) !== "" && Date.parse(String(exp).replace(" ", "T")) < Date.now()) {
        throw new BadRequestError("Kod zaproszenia wygasł.");
      }
      invite.set("uses_left", left - 1);
      e.app.save(invite);
    }
    rec.set("role", "citizen");
  } else {
    var requested = String(rec.get("role") || "citizen");
    var allowed = actor === "admin" ? ["citizen", "zaufany", "operator", "admin"] : ["citizen", "zaufany"];
    if (allowed.indexOf(requested) < 0) requested = "citizen";
    rec.set("role", requested);
  }

  rec.set("node_id", env.get("NODE_ID", "bytom-01"));
  rec.set("emailVisibility", true);
  if (!rec.get("name") || String(rec.get("name")).length < 2) {
    throw new BadRequestError("Podaj imię lub oznaczenie (max 60 znaków).");
  }
  e.next();
};

module.exports.update = function (e) {
  if (e.hasSuperuserAuth()) {
    e.next();
    return;
  }
  var rec = e.record;
  var orig = rec.original();
  var role = actorRole(e);
  if (role !== "admin") {
    rec.set("role", orig.get("role"));
  } else {
    var nextRole = String(rec.get("role") || orig.get("role"));
    if (["citizen", "zaufany", "operator", "admin"].indexOf(nextRole) < 0) {
      rec.set("role", orig.get("role"));
    }
  }
  rec.set("node_id", orig.get("node_id") || env.get("NODE_ID", "bytom-01"));
  e.next();
};
