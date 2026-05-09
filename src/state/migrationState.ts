import type { MigrationState } from "../types/migration";

export const initialMigrationState: MigrationState = {
  sourceSystem: "sap_s4",
  cloudProvider: "azure",
  destination: "azure_blob",
  outputFormat: "parquet",
  sourceCredentials: {
    baseUrl: "http://127.0.0.1:8011",
    username: "demo",
    password: "",
    clientId: "100",
  },
  destinationCredentials: {
    connectionString: "",
    accountName: "",
    accountKey: "",
    containerName: "sap-api",
    landingFolder: "sap-s4",
  },
  scannedTables: [],
  chatMessages: [
    {
      id: "hello",
      role: "assistant",
      text: "I can scan SAP APIs and metadata, then recommend tables for the data lake landing zone.",
    },
  ],
  approval: null,
  lastAgentResponse: null,
};
