import type { SapAgentResponse } from "../types/migration";

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.detail ||
      `Request failed with status ${response.status}`;
    throw new Error(Array.isArray(message) ? message.map((item) => item.msg || item).join(", ") : message);
  }

  return data as T;
}

export async function checkCoreHealth(): Promise<boolean> {
  try {
    const response = await fetch("/api/health");
    return response.ok;
  } catch {
    return false;
  }
}

export async function runSapAgent(payload: {
  message: string;
  approval_id?: string;
  approve?: boolean;
}): Promise<SapAgentResponse> {
  const response = await fetch("/api/v1/llm/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      domain: "sap",
      ...payload,
    }),
  });

  return readJson<SapAgentResponse>(response);
}
