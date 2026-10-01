// The shipped async-storage mock only EXPORTS a mock object; it does not
// register itself, so it has to be used as a jest.mock factory.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Skia's native module throws at import time under jest
// (TurboModuleRegistry.getEnforcing). Since the chat transcript can now render
// a chart widget, any test that mounts a message reaches it, so the stand-in
// belongs here rather than in each suite. The chart suites still declare their
// own richer mock, which takes precedence over this one.
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');
  const node = (name) => (props) => React.createElement(View, { testID: name, ...props }, props.children);
  return {
    Canvas: node('sk-canvas'),
    Group: node('sk-group'),
    Line: node('sk-line'),
    Path: node('sk-path'),
    Rect: node('sk-rect'),
    RoundedRect: node('sk-rrect'),
    Circle: node('sk-circle'),
    Text: node('sk-text'),
    vec: (x, y) => ({ x, y }),
    useFont: () => ({
      measureText: (text) => ({ x: 0, y: 0, width: text.length * 6, height: 10 }),
    }),
  };
});

// Whimsy's decorative loops (scan band, sheen, dot scanner) are Animated.loops
// that run until unmount. Suites that leave a tree mounted — ThreadScreen does —
// would keep them firing after the environment is torn down, which crashes the
// worker or stops jest exiting. Tests get the level from the real store but
// never the motion, exactly like iOS Reduce Motion.
jest.mock('./src/whimsy/level', () => {
  const actual = jest.requireActual('./src/whimsy/level');
  return {
    ...actual,
    useWhimsy: () => ({ level: actual.useWhimsyStore((s) => s.level), motion: false }),
  };
});
