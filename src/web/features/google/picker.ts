import { DRIVE_IMPORT_MAX_FILES } from "../../../shared/schemas/google";
import { UPLOAD_CONTENT_TYPES } from "../../../shared/schemas/uploads";

const API_SCRIPT_URL = "https://apis.google.com/js/api.js";
const PICKER_LOCALE = "es-419";
const MIME_TYPES = [...UPLOAD_CONTENT_TYPES.keys()].join(",");

export interface PickerCredentials {
  accessToken: string;
  apiKey: string;
  appId: string;
}

export interface PickerDocument {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

interface PickerResponse {
  action: string;
  docs?: PickerDocument[];
}

interface DocsView {
  setParent(folderId: string): DocsView;
  setMimeTypes(mimeTypes: string): DocsView;
  setIncludeFolders(include: boolean): DocsView;
}

interface Picker {
  setVisible(visible: boolean): Picker;
}

interface PickerBuilder {
  addView(view: DocsView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  setMaxItems(max: number): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setCallback(callback: (response: PickerResponse) => void): PickerBuilder;
  build(): Picker;
}

export interface GooglePicker {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId: string) => DocsView;
  ViewId: { DOCS: string };
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string; CANCEL: string };
}

declare global {
  interface Window {
    gapi?: {
      load(
        api: string,
        options: { callback: () => void; onerror: () => void },
      ): void;
    };
    google?: { picker?: GooglePicker };
  }
}

let apiLoad: Promise<void> | null = null;

const loadScript = () =>
  new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = API_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PICKER_SCRIPT_FAILED"));
    document.head.append(script);
  });

const loadPickerModule = () =>
  new Promise<void>((resolve, reject) => {
    if (!window.gapi) return reject(new Error("PICKER_SCRIPT_FAILED"));
    window.gapi.load("picker", {
      callback: resolve,
      onerror: () => reject(new Error("PICKER_SCRIPT_FAILED")),
    });
  });

export function loadPickerApi(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  apiLoad ??= loadScript()
    .then(loadPickerModule)
    .catch((error: unknown) => {
      apiLoad = null;
      throw error;
    });
  return apiLoad;
}

export function pickDriveFiles(
  { accessToken, apiKey, appId }: PickerCredentials,
  folderId: string | null,
): Promise<PickerDocument[]> {
  const picker = window.google?.picker;
  if (!picker) return Promise.reject(new Error("PICKER_NOT_LOADED"));
  const view = new picker.DocsView(picker.ViewId.DOCS)
    .setMimeTypes(MIME_TYPES)
    .setIncludeFolders(true);
  if (folderId) view.setParent(folderId);

  return new Promise((resolve) => {
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setLocale(PICKER_LOCALE)
      .setMaxItems(DRIVE_IMPORT_MAX_FILES)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setCallback(({ action, docs }) => {
        if (action === picker.Action.PICKED) resolve(docs ?? []);
        if (action === picker.Action.CANCEL) resolve([]);
      })
      .build()
      .setVisible(true);
  });
}
