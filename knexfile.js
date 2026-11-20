"use strict";
const path = require("path");
const fs = require("fs");
const config = require("./src/config");

function connection() {
  if (config.DB_CLIENT === "mysql2") {
    return {
      client: "mysql2",
      connection: {
        host: config.DB_HOST, port: config.DB_PORT || 3306, user: config.DB_USER,
        password: config.DB_PASSWORD, database: config.DB_NAME,
        charset: "utf8mb4", timezone: "Z", dateStrings: true
      },
      pool: { min: 0, max: 8 }
    };
  }
  const file = config.isTest ? ":memory:" : path.resolve(config.DB_FILE);
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  return { client: "better-sqlite3", connection: { filename: file }, useNullAsDefault: true, pool: { min: 1, max: 1 } };
}

module.exports = { ...connection(), migrations: { directory: path.join(__dirname, "migrations") } };
