export interface Message {
  role: "user" | "assistant";
  content: string;
  /** UI-only flag. True for optimistic placeholders ("思考中…") that have not
   *  yet been persisted into the Rust-side session. Never set on synced data. */
  pending?: boolean;
}

export interface Session {
  id: string;
  created_at: number;
  messages: Message[];
}
