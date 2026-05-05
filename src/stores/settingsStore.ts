import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { AppConfig, DEFAULT_CONFIG } from "../types/settings";

interface SettingsState {
  config: AppConfig;
  load: () => Promise<void>;
  save: (config: AppConfig) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  config: DEFAULT_CONFIG,
  load: async () => {
    const config = await invoke<AppConfig>("get_config");
    set({ config });
  },
  save: async (config) => {
    await invoke("save_config", { config });
    set({ config });
  },
}));
