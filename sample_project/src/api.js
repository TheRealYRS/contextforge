const https = require("https");
const { DEFAULTS } = require("./constants.mjs");

function fetchUsers(base) {
  return Promise.resolve([{ id: 1, name: "Ada " }]);
}

module.exports = { fetchUsers, DEFAULTS };
