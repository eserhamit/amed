"use strict";
const knex = require("knex");
const db = knex(require("../knexfile"));
module.exports = db;
