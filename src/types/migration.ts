// Migration phase enum — mirrors backend MigrationPhase
export type MigrationPhase =
  | "INIT"
  | "SOURCE_CONFIGURED"
  | "CLOUD_SELECTED"
  | "VAULT_SETUP"
  | "STORAGE_PROVISIONED"
  | "METADATA_EXTRACTED"
  | "DATABRICKS_PROVISIONED"
  | "NOTEBOOKS_UPLOADED"
  | "METADATA_LOADED"
  | "PIPELINE_CONFIGURED"
  | "ADF_PROVISIONED"
  | "COMPLETED";

// Chat status from backend
export type ChatStatus =
  | "ok"
  | "approval_required"
  | "clarification_required"
  | "error";

// Approval item
export interface ApprovalItem {
  approval_id: string;
  summary: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  expires_at: string;
  cloud_resource_type?: string;
}

// Chat API request shape
export interface ChatRequest {
  message: string;
  approval_id?: string;
  approve?: boolean;
}

// Chat API response shape
export interface ChatResponse {
  session_id: string;
  message: string;
  status: ChatStatus;
  migration_phase: MigrationPhase;
  completed_phases: MigrationPhase[];
  pending_approvals: ApprovalItem[];
  suggestions: string[];
  phase_data: Record<string, unknown>;
}

// Session create response
export interface SessionCreateResponse {
  session_id: string;
  migration_phase: MigrationPhase;
  created_at: string;
}

// Session status response
export interface SessionStatusResponse {
  session_id: string;
  migration_phase: MigrationPhase;
  completed_phases: MigrationPhase[];
  pending_approvals: ApprovalItem[];
  source_system?: string;
  cloud_provider?: string;
}

// Credential field definition (from backend)
export interface CredentialField {
  name: string;
  label: string;
  type: "text" | "password" | "url";
  required: boolean;
  placeholder?: string;
}

// Source system metadata from /v1/sources
export interface SourceSystemMeta {
  id: string;
  display_name: string;
  icon_key: string;
  description: string;
  required_cred_fields: CredentialField[];
}

// Cloud provider metadata from /v1/clouds
export interface CloudProviderMeta {
  id: string;
  display_name: string;
  icon_key: string;
  description: string;
  secrets_service_name: string;
  secrets_service_icon: string;
}

// Phase info from /v1/migration/phases
export interface PhaseInfo {
  id: MigrationPhase;
  display_name: string;
  description: string;
  order: number;
}

// Session list item from GET /sessions
export interface SessionListItem {
  session_id: string;
  migration_phase: MigrationPhase;
  source_system?: string;
  cloud_provider?: string;
  created_at: string;
  updated_at: string;
}

// Conversation history entry
export interface HistoryEntry {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// UI chat message (includes suggestions from backend)
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  suggestions?: string[];
  pendingApprovals?: ApprovalItem[];
}

