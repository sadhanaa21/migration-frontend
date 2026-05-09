export type WizardStep =
  | "welcome"
  | "source"
  | "cloud"
  | "destination"
  | "review"
  | "scan"
  | "approval";

export type SourceSystem = "sap_s4" | "sap_ecc" | "oracle" | "custom";
export type CloudProvider = "azure" | "aws" | "gcp";
export type DestinationWarehouse = "azure_blob" | "adls_gen2" | "synapse" | "databricks";
export type OutputFormat = "parquet" | "json" | "csv";

export interface SourceCredentials {
  baseUrl: string;
  username: string;
  password: string;
  clientId: string;
}

export interface DestinationCredentials {
  connectionString: string;
  accountName: string;
  accountKey: string;
  containerName: string;
  landingFolder: string;
}

export interface SapTable {
  id: string;
  name: string;
  description: string;
  module: string;
  apiPath: string;
  estimatedRows: number;
  selected: boolean;
  destinationPath: string;
  confidence: number;
}

export interface AgentApproval {
  approval_id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  summary: string;
  expires_at: string;
}

export interface SapAgentResponse {
  status: "completed" | "approval_required" | "rejected" | "error" | "no_data";
  message: string;
  result?: unknown;
  approval?: AgentApproval | null;
}

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
}

export interface MigrationState {
  sourceSystem: SourceSystem;
  cloudProvider: CloudProvider;
  destination: DestinationWarehouse;
  outputFormat: OutputFormat;
  sourceCredentials: SourceCredentials;
  destinationCredentials: DestinationCredentials;
  scannedTables: SapTable[];
  chatMessages: ChatMessage[];
  approval?: AgentApproval | null;
  lastAgentResponse?: SapAgentResponse | null;
}
