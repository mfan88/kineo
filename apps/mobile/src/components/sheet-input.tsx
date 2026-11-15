import { Input, useBottomSheetAwareHandlers, type InputProps } from "heroui-native";
import type { BlurEvent, FocusEvent } from "react-native";

/**
 * HeroUI's `Input` for use inside `BottomSheet.Content`. It tells the sheet which
 * field has focus, so the sheet moves up above the keyboard instead of leaving the
 * field hidden behind it. Outside a sheet it behaves like a plain `Input`.
 */
export function SheetInput({ onFocus, onBlur, ...props }: InputProps) {
  const sheet = useBottomSheetAwareHandlers();
  return (
    <Input
      {...props}
      onFocus={(event: FocusEvent) => {
        sheet.onFocus(event);
        onFocus?.(event);
      }}
      onBlur={(event: BlurEvent) => {
        sheet.onBlur(event);
        onBlur?.(event);
      }}
    />
  );
}
