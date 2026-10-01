// An image in the transcript. It rendered as the literal string "[image]" with
// a comment saying no media route existed — true when it was written, stale
// since GET /api/chat/media/{id} shipped (2026-09-22).
//
// The bytes are behind the same cookie as every other chat read, and iOS
// shares its cookie jar between fetch and image loading, so a plain <Image>
// with the absolute URL authenticates itself. A failure says so rather than
// leaving a silent gap — an image that did not load is information.
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { HUB_ORIGIN } from '../../../lib/api';
import { fonts } from '../../../theme/fonts';
import { useTheme } from '../../../theme/useTheme';
import type { ImagePart as ImagePartT } from '../../../chat/types';

/** Widest a transcript image gets; taller than this and it scales down rather
 * than pushing the conversation off the screen. */
const MAX_WIDTH = 240;
const MAX_HEIGHT = 300;

export function ImagePart({ part }: { part: ImagePartT }) {
  const { t } = useTheme();
  const [failed, setFailed] = useState(false);

  const uri = part.url ?? (part.media_id ? `${HUB_ORIGIN}/api/chat/media/${part.media_id}` : null);
  if (!uri || failed) {
    return (
      <View style={[styles.missing, { borderColor: t('border'), backgroundColor: t('bg-2') }]}>
        <Text style={[styles.missingLabel, { color: t('fg-2') }]}>
          {uri ? 'Image did not load' : 'Image unavailable'}
        </Text>
      </View>
    );
  }

  // Keep the sender's aspect ratio when they told us it; square-ish otherwise.
  const ratio = part.width && part.height ? part.width / part.height : 4 / 3;
  const width = Math.min(MAX_WIDTH, MAX_HEIGHT * ratio);

  return (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel="Image in the conversation"
      source={{ uri }}
      onError={() => setFailed(true)}
      resizeMode="cover"
      style={[styles.image, { width, height: width / ratio, borderColor: t('border') }]}
    />
  );
}

const styles = StyleSheet.create({
  image: { borderRadius: 11, borderWidth: 1, marginVertical: 2 },
  missing: { borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  missingLabel: { fontFamily: fonts.mono(400), fontSize: 11 },
});
