// The system paste button, as a React component.
//
// iOS asks "would like to paste from…" whenever an app READS the pasteboard.
// It never asks when the user taps a `UIPasteControl`, because the tap is the
// consent. So this button is the one way to paste a picture into the composer
// without the dialog (the user, 2026-09-30).
//
// On anything but iOS 16+ the native view is absent; `available` says so and
// the composer keeps its own paste button for those cases.
import { Platform, type ViewProps } from 'react-native';
import { requireNativeView } from 'expo';

export interface PastedImage {
  base64: string;
  mime: string;
  width: number;
  height: number;
}

export type PasteFailure = 'not_an_image' | 'unreadable';

interface NativeProps extends ViewProps {
  onPasteImage?: (event: { nativeEvent: PastedImage }) => void;
  onPasteError?: (event: { nativeEvent: { reason: PasteFailure } }) => void;
}

/** iOS 16 is where UIPasteControl arrives; the podspec sets the same floor. */
export const available =
  Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 16;

const NativePasteControl = available
  ? requireNativeView<NativeProps>('PasteControl')
  : null;

export function PasteControl({
  onImage,
  onFailure,
  ...rest
}: ViewProps & {
  onImage: (image: PastedImage) => void;
  onFailure?: (reason: PasteFailure) => void;
}) {
  if (!NativePasteControl) return null;
  return (
    <NativePasteControl
      {...rest}
      onPasteImage={(e) => onImage(e.nativeEvent)}
      onPasteError={(e) => onFailure?.(e.nativeEvent.reason)}
    />
  );
}
