import { LOGO_TYPES, logoFileError } from "@kineo/shared";
import { invoke } from "@tauri-apps/api/core";

/**
 * Invoice logos in Storage, through Rust (src-tauri/src/logos.rs), which keeps a
 * copy of each in the app's data folder so invoices show it offline. The invoice
 * style stores the logo's path; screens turn it into an image with logoDataUrl.
 */

type LogoType = (typeof LOGO_TYPES)[number];

const EXTENSIONS: Record<LogoType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

const TYPES_BY_EXTENSION: Record<string, LogoType> = {
  png: "image/png",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
};

/** A logo's error message to show under the field. */
export class LogoError extends Error {
  override name = "LogoError";
}

function isLogoType(type: string): type is LogoType {
  return LOGO_TYPES.some((allowed) => allowed === type);
}

/** A new, unique path in the practitioner's own folder, e.g. `user_abc/logo-<uuid>.png`. */
export function newLogoPath(
  ownerId: string,
  type: LogoType,
  newId: () => string = () => crypto.randomUUID(),
): string {
  return `${ownerId}/logo-${newId()}.${EXTENSIONS[type]}`;
}

/** Checks and uploads a chosen image. Resolves to its Storage path, for the invoice style. */
export async function uploadLogo(ownerId: string, file: File): Promise<string> {
  const problem = logoFileError(file);
  if (problem || !isLogoType(file.type))
    throw new LogoError(problem ?? "Choose a PNG, JPEG or SVG image.");
  const path = newLogoPath(ownerId, file.type);
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    await invoke("logo_upload", bytes, { headers: { "kineo-logo-path": path } });
  } catch (error) {
    throw new LogoError(typeof error === "string" ? error : "Couldn't upload the logo. Try again.");
  }
  return path;
}

const dataUrls = new Map<string, Promise<string>>();

/** The logo as a data: URL for invoices. Remembered for this run; read from the local copy offline. */
export function logoDataUrl(path: string): Promise<string> {
  let url = dataUrls.get(path);
  if (!url) {
    url = invoke<ArrayBuffer>("logo_read", { path }).then(
      (buffer) => toDataUrl(buffer, TYPES_BY_EXTENSION[path.split(".").pop() ?? ""] ?? "image/png"),
      (error: unknown) => {
        dataUrls.delete(path);
        throw new LogoError(typeof error === "string" ? error : "Couldn't load the logo.");
      },
    );
    dataUrls.set(path, url);
  }
  return url;
}

/** Deletes a logo that's no longer used (after the style points at a new one, or none). */
export async function deleteLogo(path: string): Promise<void> {
  dataUrls.delete(path);
  await invoke("logo_delete", { path });
}

/** Forgets every logo on this computer (Sign out). */
export async function clearLogos(): Promise<void> {
  dataUrls.clear();
  await invoke("logo_clear_cache");
}

function toDataUrl(buffer: ArrayBuffer, type: string): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}
