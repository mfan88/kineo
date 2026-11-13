import { Redirect } from "expo-router";

/**
 * Where "Continue with Google" comes back to (`kineo://sso-callback`). The browser
 * sheet usually takes the link itself; if Android hands it to the app instead, there's
 * nothing to show, so go Home (or to sign-in, while signed out).
 */
export default function SsoCallback() {
  return <Redirect href="/" />;
}
