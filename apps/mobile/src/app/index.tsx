import { Card } from "heroui-native";
import { Text, View } from "react-native";
import { SafeAreaView as SafeArea } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { readyLine } from "@/utils/ready-line";

// Uniwind styles React Native's own components; others need wrapping.
const SafeAreaView = withUniwind(SafeArea);

/** First screen (M1), replaced by Home in M3. Styled by the Kineō theme (M2). */
export default function Index() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center gap-4 px-6">
        <Text className="font-semibold text-[28px] text-foreground">Kineō is ready</Text>
        <Card>
          <Card.Title>Shared code</Card.Title>
          <Card.Description>{readyLine()}</Card.Description>
        </Card>
      </View>
    </SafeAreaView>
  );
}
