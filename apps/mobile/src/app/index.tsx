import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { readyLine } from "@/utils/ready-line";

/** First screen (M1), replaced by Home in M3. */
export default function Index() {
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.body}>
        <Text style={styles.title}>Kineō is ready</Text>
        <Text style={styles.line}>{readyLine()}</Text>
      </View>
    </SafeAreaView>
  );
}

// Plain values until M2 brings the theme from @kineo/tokens.
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F7FBFF" },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: "600", color: "#11181C" },
  line: { fontSize: 16, color: "#71717A" },
});
