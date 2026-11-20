import type {
  ChatResponse,
  SessionCreateResponse,
  SessionStatusResponse,
  SourceSystemMeta,
  CloudProviderMeta,
  PhaseInfo,
  HistoryEntry,
  SessionListItem,
} from "../types/migration";

const BASE = "/api";

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (data as any)?.error?.message ||
      (data as any)?.detail ||
      `Request failed with status ${response.status}`;
    throw new Error(
      Array.isArray(message)
        ? message.map((item: any) => item.msg || item).join(", ")
        : message
    );
  }
  return data as T;
}

export async function checkCoreHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// ── Session ──────────────────────────────────────────────────────────────────

export async function createSession(): Promise<SessionCreateResponse> {
  const response = await fetch(`${BASE}/v1/chat/sessions`, { method: "POST" });
  return readJson<SessionCreateResponse>(response);
}

export async function listSessions(): Promise<SessionListItem[]> {
  const response = await fetch(`${BASE}/v1/chat/sessions`);
  const data = await readJson<{ sessions: SessionListItem[] }>(response);
  return data.sessions ?? [];
}

export async function sendMessage(
  sessionId: string,
  message: string,
  approvalId?: string,
  approve?: boolean
): Promise<ChatResponse> {
  const body: Record<string, unknown> = { message };
  if (approvalId !== undefined) body.approval_id = approvalId;
  if (approve !== undefined) body.approve = approve;
  const response = await fetch(`${BASE}/v1/chat/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson<ChatResponse>(response);
}

export async function getHistory(sessionId: string): Promise<HistoryEntry[]> {
  const response = await fetch(`${BASE}/v1/chat/${sessionId}/history?limit=100`);
  const data = await readJson<{ history: HistoryEntry[] }>(response);
  return data.history ?? [];
}

export async function getSessionStatus(
  sessionId: string
): Promise<SessionStatusResponse> {
  const response = await fetch(`${BASE}/v1/chat/${sessionId}/status`);
  return readJson<SessionStatusResponse>(response);
}

export async function resolveApproval(
  sessionId: string,
  approvalId: string,
  approve: boolean
): Promise<ChatResponse> {
  return sendMessage(sessionId, "", approvalId, approve);
}

// ── Metadata endpoints ───────────────────────────────────────────────────────

export async function getSources(): Promise<SourceSystemMeta[]> {
  const response = await fetch(`${BASE}/v1/sources`);
  return readJson<SourceSystemMeta[]>(response);
}

export async function getClouds(): Promise<CloudProviderMeta[]> {
  const response = await fetch(`${BASE}/v1/clouds`);
  return readJson<CloudProviderMeta[]>(response);
}

export async function getPhases(): Promise<PhaseInfo[]> {
  const response = await fetch(`${BASE}/v1/migration/phases`);
  return readJson<PhaseInfo[]>(response);
}
