"use strict";
// Schéma initial. Les dates de service sont des chaînes "AAAA-MM-JJ" (heure de Genève),
// les horodatages des millisecondes (bigint) : identique sous MariaDB et SQLite.

const TABLES = ["rate_events", "photos", "audit_log", "users", "opening_signups", "loyalty_events", "loyalty_cards",
  "subscribers", "group_requests", "reservations", "settings", "formules", "matches", "week_menu", "menu_items", "pubs"];

exports.up = async function (knex) {
  // Si une première tentative a échoué à mi-chemin (MariaDB ne peut pas annuler la création de tables),
  // les tables déjà créées sont vides : on les retire pour repartir proprement.
  for (const t of TABLES) await knex.schema.dropTableIfExists(t);
  await knex.schema.createTable("pubs", t => {
    t.string("id", 32).primary();
    t.string("name", 80).notNullable();
    t.string("area", 120).defaultTo("");
    t.string("status", 10).notNullable().defaultTo("open"); // open | soon
    t.text("addr");
    t.string("tel", 32).defaultTo("");
    t.string("email", 160).defaultTo("");
    t.string("services", 200).defaultTo("");
    t.string("services_en", 200).defaultTo("");
    t.string("maps_url", 500).defaultTo("");
    t.string("review_url", 500).defaultTo("");
    t.integer("cap_midi").nullable();
    t.integer("cap_soir").nullable();
    t.string("open_date", 10).nullable();
    t.text("hours"); // JSON : 7 chaînes, lundi → dimanche
    t.integer("sort").defaultTo(0);
  });

  await knex.schema.createTable("menu_items", t => {
    t.increments("id");
    t.string("kind", 10).notNullable(); // beer | food
    t.string("name", 120).notNullable();
    t.string("name_en", 120).defaultTo("");
    t.string("descr", 240).defaultTo("");
    t.string("descr_en", 240).defaultTo("");
    t.string("price", 40).defaultTo("");
    t.string("tag", 40).defaultTo("");
    t.string("tag_en", 40).defaultTo("");
    t.boolean("sold_out").notNullable().defaultTo(false);
    t.integer("sort").defaultTo(0);
  });

  await knex.schema.createTable("week_menu", t => {
    t.integer("day").primary(); // 0 = lundi … 4 = vendredi
    t.string("name", 120).defaultTo("");
    t.string("name_en", 120).defaultTo("");
    t.string("descr", 240).defaultTo("");
    t.string("descr_en", 240).defaultTo("");
    t.string("price", 40).defaultTo("");
  });

  await knex.schema.createTable("matches", t => {
    t.increments("id");
    t.integer("day").notNullable(); // 0 = lundi … 6 = dimanche
    t.string("title", 120).notNullable();
    t.string("sub", 160).defaultTo("");
    t.string("time", 5).defaultTo("");
    t.string("pub_id", 32).nullable().references("pubs.id").onDelete("SET NULL");
    t.integer("sort").defaultTo(0);
  });

  await knex.schema.createTable("formules", t => {
    t.increments("id");
    t.string("label", 80).notNullable();
    t.string("label_en", 80).defaultTo("");
    t.string("descr", 240).defaultTo("");
    t.string("descr_en", 240).defaultTo("");
    t.integer("price_pp").notNullable().defaultTo(0);
    t.integer("sort").defaultTo(0);
  });

  await knex.schema.createTable("settings", t => {
    t.string("key", 64).primary();
    t.text("value");
  });

  await knex.schema.createTable("reservations", t => {
    t.increments("id");
    t.string("token", 64).notNullable().unique();
    t.string("pub_id", 32).notNullable().references("pubs.id");
    t.string("date", 10).notNullable();
    t.string("time", 5).notNullable();
    t.string("service", 5).notNullable(); // midi | soir
    t.integer("persons").notNullable();
    t.string("occasion", 40).defaultTo("");
    t.string("name", 120).notNullable();
    t.string("phone", 32).notNullable();
    t.string("email", 160).defaultTo("");
    t.text("note");
    t.string("lang", 2).notNullable().defaultTo("fr");
    t.string("status", 12).notNullable().defaultTo("pending"); // pending confirmed declined cancelled done noshow
    t.boolean("reminded").notNullable().defaultTo(false);
    t.boolean("anonymized").notNullable().defaultTo(false);
    t.bigInteger("created_at").notNullable();
    t.bigInteger("handled_at").nullable();
    t.integer("handled_by").nullable();
    t.index(["pub_id", "date", "service", "status"]);
  });

  await knex.schema.createTable("group_requests", t => {
    t.increments("id");
    t.string("pub_id", 32).notNullable().references("pubs.id");
    t.string("date", 10).nullable();
    t.integer("persons").notNullable();
    t.integer("budget").nullable();
    t.string("formule", 80).defaultTo("");
    t.integer("estimate").nullable();
    t.string("name", 120).notNullable();
    t.string("phone", 32).defaultTo("");
    t.string("email", 160).defaultTo("");
    t.text("note");
    t.string("lang", 2).notNullable().defaultTo("fr");
    t.string("status", 10).notNullable().defaultTo("new"); // new sent won lost
    t.boolean("anonymized").notNullable().defaultTo(false);
    t.bigInteger("created_at").notNullable();
  });

  await knex.schema.createTable("subscribers", t => {
    t.increments("id");
    t.string("email", 160).notNullable().unique();
    t.string("lang", 2).notNullable().defaultTo("fr");
    t.text("pubs"); // JSON
    t.string("status", 10).notNullable().defaultTo("pending"); // pending | confirmed
    t.string("token", 64).notNullable().unique();
    t.bigInteger("created_at").notNullable();
    t.bigInteger("confirmed_at").nullable();
  });

  await knex.schema.createTable("loyalty_cards", t => {
    t.increments("id");
    t.string("code", 8).notNullable().unique();
    t.string("email", 160).notNullable().unique();
    t.string("token", 64).notNullable().unique();
    t.string("lang", 2).notNullable().defaultTo("fr");
    t.integer("stamps").notNullable().defaultTo(0);
    t.integer("total").notNullable().defaultTo(0);
    t.integer("gifts").notNullable().defaultTo(0);
    t.bigInteger("created_at").notNullable();
    t.bigInteger("last_at").nullable();
  });

  await knex.schema.createTable("loyalty_events", t => {
    t.increments("id");
    t.integer("card_id").unsigned().notNullable().references("loyalty_cards.id").onDelete("CASCADE"); // unsigned : même type que l'id (exigé par MariaDB)
    t.string("kind", 10).notNullable(); // stamp | undo | gift
    t.integer("delta").notNullable();
    t.integer("user_id").nullable();
    t.string("pub_id", 32).nullable();
    t.bigInteger("created_at").notNullable();
    t.index(["card_id", "created_at"]);
  });

  await knex.schema.createTable("opening_signups", t => {
    t.increments("id");
    t.string("name", 120).notNullable();
    t.integer("persons").notNullable();
    t.string("email", 160).notNullable().unique();
    t.string("lang", 2).notNullable().defaultTo("fr");
    t.bigInteger("created_at").notNullable();
  });

  await knex.schema.createTable("users", t => {
    t.increments("id");
    t.string("email", 160).notNullable().unique();
    t.string("name", 120).notNullable();
    t.string("password_hash", 255).notNullable();
    t.string("role", 10).notNullable().defaultTo("manager"); // owner | manager
    t.string("pub_id", 32).nullable().references("pubs.id").onDelete("SET NULL");
    t.text("totp_secret_enc").nullable();
    t.boolean("totp_enabled").notNullable().defaultTo(false);
    t.integer("failed_logins").notNullable().defaultTo(0);
    t.bigInteger("locked_until").nullable();
    t.boolean("active").notNullable().defaultTo(true);
    t.integer("session_version").notNullable().defaultTo(1);
    t.bigInteger("last_login_at").nullable();
    t.bigInteger("created_at").notNullable();
  });

  await knex.schema.createTable("audit_log", t => {
    t.increments("id");
    t.integer("user_id").nullable();
    t.string("action", 60).notNullable();
    t.text("details");
    t.string("ip", 64).defaultTo("");
    t.bigInteger("created_at").notNullable();
    t.index(["created_at"]);
  });

  await knex.schema.createTable("photos", t => {
    t.increments("id");
    t.string("slot", 40).notNullable(); // hero | pub:<id> | gallery
    t.string("file", 80).notNullable();
    t.integer("width").notNullable();
    t.integer("height").notNullable();
    t.string("alt", 200).defaultTo("");
    t.string("alt_en", 200).defaultTo("");
    t.integer("sort").defaultTo(0);
    t.bigInteger("created_at").notNullable();
  });

  await knex.schema.createTable("rate_events", t => {
    // Compteurs anti-abus persistants (par exemple tentatives de connexion par adresse e-mail).
    t.increments("id");
    t.string("bucket", 120).notNullable();
    t.bigInteger("created_at").notNullable();
    t.index(["bucket", "created_at"]);
  });
};

exports.down = async function (knex) {
  for (const t of TABLES) await knex.schema.dropTableIfExists(t);
};
