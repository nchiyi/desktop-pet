export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface Session {
  id: string;
  created_at: number;
  messages: Message[];
}
