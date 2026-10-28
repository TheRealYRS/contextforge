// Sample application entry point.
import { readConfig, normalizeData } from "./utils.mjs";
import { fetchUsers } from "./api.js";

const config = readConfig("../config/config.json");

export async function main() {
  const users = await fetchUsers(config.apiBase);
  return normalizeData(users);
}

export default main;
