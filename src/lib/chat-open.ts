const CHAT_OPEN_EVENT = "cb:open-chat";

export const CHAT_OPEN_EVENT_NAME = CHAT_OPEN_EVENT;

export function requestOpenChat(question?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT, { detail: { question } }));
}
