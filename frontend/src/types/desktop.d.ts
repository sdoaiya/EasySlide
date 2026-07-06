export {};

declare global {
  interface Window {
    electronAPI?: {
      getBackendPort: () => Promise<number>;
      openExternal: (url: string) => Promise<void>;
      openDataDir: () => Promise<string>;
      getExportDir: () => Promise<string>;
      chooseExportDir: () => Promise<string>;
      openExportDir: () => Promise<string>;
      saveDownload: (url: string, filename?: string) => Promise<string | null>;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      checkForUpdates: () => Promise<{ version: string; url: string; notes?: string } | null>;
    };
  }
}
