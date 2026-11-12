// The extension talks to Chrome-only offscreen APIs that webextension-polyfill
// does not type. `compilerOptions.types` loads only that package, so declare
// the calls this project makes.

export {};

declare global {
  const chrome: {
    runtime: {
      getContexts(filter: { contextTypes: string[]; documentUrls: string[] }): Promise<unknown[]>;
      ContextType: { readonly OFFSCREEN_DOCUMENT: string };
      getURL(path: string): string;
      sendMessage(message: unknown): Promise<unknown>;
      onMessage: {
        addListener(callback: (message: { type: string }) => void): void;
      };
    };
    offscreen: {
      hasDocument(): Promise<boolean>;
      createDocument(parameters: {
        url: string;
        reasons: string[];
        justification: string;
      }): Promise<void>;
      Reason: { readonly AUDIO_PLAYBACK: string };
    };
  };
}
