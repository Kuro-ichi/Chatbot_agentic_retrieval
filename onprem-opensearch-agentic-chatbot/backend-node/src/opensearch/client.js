import { Client } from "@opensearch-project/opensearch";
import { config } from "../config.js";

export function createOpenSearchClient() {
  const opts = {
    node: config.opensearch.node,
    ssl: { rejectUnauthorized: config.opensearch.sslRejectUnauthorized },
  };

  if (config.opensearch.authMode === "basic") {
    opts.auth = { username: config.opensearch.username, password: config.opensearch.password };
  } else if (config.opensearch.authMode === "apikey") {
    opts.headers = { [config.opensearch.apiKeyHeader]: `${config.opensearch.apiKeyPrefix} ${config.opensearch.apiKey}` };
  }
  return new Client(opts);
}
