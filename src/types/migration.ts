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

export type ChatActionKind =
  | "show_source_options"
  | "show_cloud_options"
  | "show_destination_options"
  | "select_source"
  | "select_cloud"
  | "select_destination"
  | "show_source_help"
  | "show_destination_help"
  | "use_demo_source"
  | "use_default_destination"
  | "test_core"
  | "run_scan"
  | "request_approval"
  | "resolve_approval"
  | "guide_source_url"
  | "guide_source_credentials"
  | "guide_destination_storage"
  | "guide_destination_credentials"
  | "need_help_with_this"
  | "provide_source_details"
  | "provide_destination_details";

export interface ChatAction {
  label: string;
  kind: ChatActionKind;
  value?: string;
  tone?: "primary" | "secondary" | "danger";
}

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  actions?: ChatAction[];
}

export interface MigrationState {
  sourceSystem: SourceSystem;
  cloudProvider: CloudProvider;
  destination: DestinationWarehouse;
  sourceCredentials: SourceCredentials;
  destinationCredentials: DestinationCredentials;
  scannedTables: SapTable[];
  chatMessages: ChatMessage[];
  approval?: AgentApproval | null;
  lastAgentResponse?: SapAgentResponse | null;
}
