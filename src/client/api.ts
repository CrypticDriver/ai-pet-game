import type { Pet, ShopItem, EquippedAccessory, AccessorySlot } from "../shared/types.js";

const BASE = "";

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  init(userId: string, username: string, petName?: string) {
    return request<{ user: any; pet: Pet }>("/api/init", {
      method: "POST",
      body: JSON.stringify({ userId, username, petName }),
    });
  },

  getPet(petId: string) {
    return request<Pet>(`/api/pet/${petId}`);
  },

  feed(petId: string) {
    return request<Pet>(`/api/pet/${petId}/feed`, { method: "POST" });
  },

  play(petId: string) {
    return request<Pet>(`/api/pet/${petId}/play`, { method: "POST" });
  },

  rest(petId: string) {
    return request<Pet>(`/api/pet/${petId}/rest`, { method: "POST" });
  },

  changeSkin(petId: string, skinId: string) {
    return request<Pet>(`/api/pet/${petId}/skin`, {
      method: "POST",
      body: JSON.stringify({ skinId }),
    });
  },

  // Accessories
  getAccessories(petId: string) {
    return request<EquippedAccessory[]>(`/api/pet/${petId}/accessories`);
  },

  equipAccessory(petId: string, itemId: string, slot: AccessorySlot) {
    return request<{ ok: boolean; error?: string }>(`/api/pet/${petId}/accessories/equip`, {
      method: "POST",
      body: JSON.stringify({ itemId, slot }),
    });
  },

  unequipAccessory(petId: string, slot: AccessorySlot) {
    return request<{ ok: boolean }>(`/api/pet/${petId}/accessories/unequip`, {
      method: "POST",
      body: JSON.stringify({ slot }),
    });
  },

  getShop() {
    return request<ShopItem[]>("/api/shop");
  },

  getOwned(userId: string) {
    return request<ShopItem[]>(`/api/shop/${userId}/owned`);
  },

  buyItem(userId: string, itemId: string) {
    return request<{ ok: boolean; error?: string }>("/api/shop/buy", {
      method: "POST",
      body: JSON.stringify({ userId, itemId }),
    });
  },

  chat(petId: string, message: string) {
    return request<{ response: string; pet: Pet }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ petId, message }),
    });
  },

  getNotifications(userId: string) {
    return request<Array<{ id: number; type: string; message: string; created_at: string }>>(`/api/notifications/${userId}`);
  },

  markNotificationsRead(userId: string) {
    return request<{ ok: boolean }>(`/api/notifications/${userId}/read`, { method: "POST" });
  },
};

// WebSocket helper
export function createChatSocket(
  onMessage: (data: any) => void,
  onClose?: () => void
): WebSocket {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${window.location.host}/ws/chat`);

  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {}
  };

  ws.onclose = () => onClose?.();
  return ws;
}
