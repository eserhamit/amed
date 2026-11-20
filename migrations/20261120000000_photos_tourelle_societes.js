"use strict";
// 20 novembre 2026 :
//  - les photos sont stockées dans la base (elles survivent aux mises à jour du site) ;
//  - champ « société qui exploite ce pub », à remplir dans l'espace gérant (mentions légales) ;
//  - coordonnées et horaires de la Tourelle (seulement si pas déjà saisis dans l'espace gérant).
const blob = knex => (knex.client.config.client === "mysql2" ? "longblob" : "blob");

exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn("photos", "img800"))) {
    await knex.schema.alterTable("photos", t => { t.specificType("img800", blob(knex)).nullable(); t.specificType("img1600", blob(knex)).nullable(); });
  }
  if (!(await knex.schema.hasColumn("pubs", "company"))) {
    await knex.schema.alterTable("pubs", t => { t.string("company", 120).defaultTo(""); t.string("company_ide", 40).defaultTo(""); });
  }
  const set = async (id, field, value) => {
    await knex("pubs").where({ id }).andWhere(q => q.whereNull(field).orWhere(field, "")).update({ [field]: value });
  };
  await set("tourelle", "addr", "Chemin de la Tourelle 2\n1209 Genève");
  await set("tourelle", "tel", "+41 22 920 80 84");
  await set("tourelle", "maps_url", "https://www.google.com/maps/search/?api=1&query=Pub+Goudale+Chemin+de+la+Tourelle+2+1209+Gen%C3%A8ve");
  const t = await knex("pubs").where({ id: "tourelle" }).first();
  if (t) {
    let hours = []; try { hours = JSON.parse(t.hours || "[]"); } catch { hours = []; }
    if (!hours.some(Boolean)) {
      await knex("pubs").where({ id: "tourelle" }).update({ hours: JSON.stringify([
        "11:30 – 00:00", "11:30 – 00:00", "11:30 – 00:00", "11:30 – 00:00", "11:30 – 02:00", "11:00 – 02:00", "11:00 – 00:00"]) });
    }
    if (!t.area || t.area === "Petit-Saconnex") await knex("pubs").where({ id: "tourelle" }).update({ area: "Ch. de la Tourelle 2" });
  }
};

exports.down = async function (knex) {
  await knex.schema.alterTable("photos", t => { t.dropColumn("img800"); t.dropColumn("img1600"); });
  await knex.schema.alterTable("pubs", t => { t.dropColumn("company"); t.dropColumn("company_ide"); });
};
