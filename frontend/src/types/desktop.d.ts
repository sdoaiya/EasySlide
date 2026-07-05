export {};

declare global {
  interface Window {
    electronAPI?: {
      getBackendPort: () => Promise<number>;
      openExternal: (url: string) => Promise<void>;
      openDataDir: () => Promise<string>;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      checkForUpdates: () => Promise<{ version: string; url: string; notes?: string } | null>;
    };
  }
}
