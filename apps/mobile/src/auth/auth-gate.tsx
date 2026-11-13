import { useAuth, useClerk } from "@clerk/expo";
import { reloadAppAsync } from "expo";
import { Button, Spinner } from "heroui-native";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { ScreenLayout } from "@/components/screen";
import { Text } from "@/components/text";
import { SignIn } from "@/screens/sign-in";
import { SignUp } from "@/screens/sign-up";

/**
 * Shows the app only once signed in; until then, sign-in (or creating an account). `children`
 * gets the Clerk user ID, so the local database opens per user.
 */
export function AuthGate({ children }: { children: (userId: string) => ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const clerk = useClerk();
  const [creating, setCreating] = useState(false);

  if (clerk.status === "error") return <SignInUnavailable />;
  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner accessibilityLabel="Loading" />
      </View>
    );
  }
  if (!isSignedIn || !userId) {
    return creating ? (
      <SignUp onSignIn={() => setCreating(false)} />
    ) : (
      <SignIn onCreateAccount={() => setCreating(true)} />
    );
  }
  return children(userId);
}

function SignInUnavailable() {
  return (
    <ScreenLayout title="Can't reach sign-in">
      <Text className="text-foreground">
        Kineō needs an internet connection to sign in. Check your connection, then try again.
      </Text>
      <Button className="min-h-11 self-start" onPress={() => void reloadAppAsync()}>
        Try again
      </Button>
    </ScreenLayout>
  );
}
