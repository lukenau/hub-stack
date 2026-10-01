// The limits the agent imposes on itself, and how close it is to each. This
// exists because 744 of the journal's denials are the guardrails doing their
// job — invisible until now, and easy to mistake for breakage once they do
// appear. Counts, not a list.
//
// The losing-day figure is the one the derive RECOMPUTES; the stored counter
// lags a session by design and would alarm all night over nothing — see
// tradingFormat.losingDaysWarning.
//
// Port of apps/hub/src/components/trading/GuardrailsStrip.tsx. Its own card
// (radius 14 / 16×11 padding), not the shell Card's 16/18×14.
import { StyleSheet, Text, View } from 'react-native';
import type { TradingBudget } from '../../lib/types';
import { fonts, MONO_FEATURES } from '../../theme/fonts';
import { useTheme } from '../../theme/useTheme';
import { guardrailsLine, losingDaysWarning } from './tradingFormat';

export function GuardrailsStrip({ budget }: { budget: TradingBudget | null | undefined }) {
  const { t } = useTheme();
  if (!budget) return null;
  const oneMore = losingDaysWarning(budget);

  return (
    <View style={[styles.card, { backgroundColor: t('bg-1'), borderColor: t('border') }]}>
      <Text style={[styles.line, { color: t('fg-3') }]}>{guardrailsLine(budget)}</Text>
      {oneMore ? <Text style={[styles.warn, { color: t('status-down') }]}>{oneMore}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginBottom: 12,
  },
  line: { fontFamily: fonts.mono(400), fontSize: 11, ...MONO_FEATURES },
  warn: { fontFamily: fonts.sans(600), fontSize: 12.5, lineHeight: 18.125, marginTop: 4 },
});
