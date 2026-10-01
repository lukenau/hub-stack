// Assistant's dot-matrix poses, each a small LED screen with its own dark
// backdrop. Adding one: a prompt line in scripts/assistant/poses.prompts.mjs,
// `node scripts/assistant/gen-pose.mjs <id>`, export, then one line here.
// JS-required images ship over the air.
import type { ImageSourcePropType } from 'react-native';

export const POSES = {
  portrait: require('../../assets/assistant/portrait.jpg'),
  bow: require('../../assets/assistant/bow.jpg'),
  'tray-empty': require('../../assets/assistant/tray-empty.jpg'),
  'tray-offer': require('../../assets/assistant/tray-offer.jpg'),
  sniffing: require('../../assets/assistant/sniffing.jpg'),
  ledger: require('../../assets/assistant/ledger.jpg'),
  'ears-up': require('../../assets/assistant/ears-up.jpg'),
  tilt: require('../../assets/assistant/tilt.jpg'),
  oops: require('../../assets/assistant/oops.jpg'),
  triumph: require('../../assets/assistant/triumph.jpg'),
  asleep: require('../../assets/assistant/asleep.jpg'),
  pyjamas: require('../../assets/assistant/pyjamas.jpg'),
  party: require('../../assets/assistant/party.jpg'),
} satisfies Record<string, ImageSourcePropType>;

export type PoseId = keyof typeof POSES;

export const POSE_LABELS: Record<PoseId, string> = {
  portrait: 'Assistant',
  bow: 'Assistant bowing',
  'tray-empty': 'Assistant holding an empty silver tray',
  'tray-offer': 'Assistant presenting a sealed letter on a tray',
  sniffing: 'Assistant sniffing about',
  ledger: 'Assistant reading his ledger',
  'ears-up': 'Assistant, ears up',
  tilt: 'Assistant tilting his head',
  oops: 'Assistant catching a falling teacup',
  triumph: 'Assistant ringing a service bell',
  asleep: 'Assistant dozing',
  pyjamas: 'Assistant in his pyjamas',
  party: 'Assistant in a party hat',
};

/** The small round tile's crop: centre (0–1) and zoom, framed on his face AND
 * the prop — the prop is what says which moment this is (the magnifier while
 * checking, the teacup on an error). Tune with a rendered preview, never blind. */
export const POSE_FACES: Record<PoseId, { x: number; y: number; zoom: number }> = {
  portrait: { x: 0.5, y: 0.42, zoom: 1.15 },
  sniffing: { x: 0.68, y: 0.32, zoom: 1.45 },
  oops: { x: 0.6, y: 0.3, zoom: 1.55 },
  'tray-empty': { x: 0.42, y: 0.3, zoom: 1.35 },
  triumph: { x: 0.6, y: 0.45, zoom: 1.2 },
  'ears-up': { x: 0.45, y: 0.3, zoom: 1.5 },
  ledger: { x: 0.52, y: 0.38, zoom: 1.4 },
  bow: { x: 0.5, y: 0.32, zoom: 1.4 },
  tilt: { x: 0.5, y: 0.28, zoom: 1.6 },
  asleep: { x: 0.5, y: 0.4, zoom: 1.35 },
  'tray-offer': { x: 0.5, y: 0.38, zoom: 1.3 },
  pyjamas: { x: 0.45, y: 0.35, zoom: 1.35 },
  party: { x: 0.5, y: 0.28, zoom: 1.45 },
};
