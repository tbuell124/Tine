import React from 'react';
import renderer from 'react-test-renderer';

jest.mock('@shopify/react-native-skia');
jest.mock('@hooks/useSpecularHighlight', () => ({
  useSpecularHighlight: () => ({
    localAngle: 0.3,
    worldAngle: 0.3,
    width: 0.15,
    intensity: 0.7,
    tiltStrength: 0.4,
  }),
}));
jest.mock('../shaders/specularHighlight', () => ({
  createSpecularHighlightPaint: () => ({ kind: 'specular-paint' }),
}));

import { OuterWheel } from '../OuterWheel';

describe('OuterWheel', () => {
  it('matches the visual snapshot', () => {
    const tree = renderer.create(<OuterWheel size={280} rotation={Math.PI / 4} />).toJSON();
    expect(tree).toMatchInlineSnapshot(`
      <View
        accessibilityLabel="Canvas"
        style={
          {
            "height": 280,
            "width": 280,
          }
        }
      >
        <View
          accessibilityLabel="Group"
          origin={
            {
              "x": 140,
              "y": 140,
            }
          }
          transform={
            [
              {
                "rotate": 0.7853981633974483,
              },
            ]
          }
        >
          <View
            accessibilityLabel="Picture"
            picture={
              {
                "kind": "picture",
              }
            }
          />
          <View
            accessibilityLabel="Circle"
            cx={140}
            cy={140}
            paint={
              {
                "kind": "specular-paint",
              }
            }
            r={134.4}
          />
        </View>
      </View>
    `);
  });
});
