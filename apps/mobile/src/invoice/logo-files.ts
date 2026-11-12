import { File, Paths } from "expo-file-system";
import type { LogoFiles } from "./logo";

/**
 * Logo copies in the app's documents folder (`logos/<owner>/<file>`), kept until
 * sign-out. Paths are checked by LogoStore before they reach here.
 */
export const logoFiles: LogoFiles = {
  async read(path) {
    const file = new File(Paths.document, "logos", path);
    return file.exists ? file.base64() : null;
  },
  async write(path, bytes) {
    const file = new File(Paths.document, "logos", path);
    const folder = file.parentDirectory;
    if (!folder.exists) folder.create({ intermediates: true });
    await file.write(bytes);
  },
};
