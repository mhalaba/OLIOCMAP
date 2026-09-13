/// <reference path="../pb_data/types.d.ts" />

var env = require(`${__hooks}/lib/env.js`);

onRecordCreateRequest((e) => {
  var rec = e.record;
  if (e.hasSuperuserAuth()) {
    e.next();
    return;
  }

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
  rec.set("node_id", env.get("NODE_ID", "bytom-01"));
  if (!rec.get("name") || String(rec.get("name")).length < 2) {
    throw new BadRequestError("Podaj imię lub oznaczenie (max 60 znaków).");
  }
  e.next();
}, "users");

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) {
    e.next();
    return;
  }
  var rec = e.record;
  var orig = rec.original();
  var role = e.auth ? e.auth.get("role") : "";
  if (role !== "admin") {
    rec.set("role", orig.get("role"));
  }
  rec.set("node_id", orig.get("node_id") || env.get("NODE_ID", "bytom-01"));
  e.next();
}, "users");
