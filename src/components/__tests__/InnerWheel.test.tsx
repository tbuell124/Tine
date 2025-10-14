import React from 'react';
import renderer from 'react-test-renderer';

jest.mock('@shopify/react-native-skia');
jest.mock('@hooks/useSpecularHighlight', () => ({
  useSpecularHighlight: () => ({
    localAngle: 0.1,
    worldAngle: 0.1,
    width: 0.18,
    intensity: 0.5,
    tiltStrength: 0.2,
  }),
}));
jest.mock('../shaders/specularHighlight', () => ({
  createSpecularHighlightPaint: () => ({ kind: 'specular-paint' }),
}));

import { InnerWheel } from '../InnerWheel';

describe('InnerWheel', () => {
  it('matches the visual snapshot', () => {
    const tree = renderer
      .create(<InnerWheel size={220} rotation={Math.PI / 8} showDetentPegs />)
      .toJSON();
    expect(tree).toMatchInlineSnapshot(`
      <View
        accessibilityLabel="Canvas"
        style={
          {
            "height": 220,
            "width": 220,
          }
        }
      >
        <View
          accessibilityLabel="Group"
          origin={
            {
              "x": 110,
              "y": 110,
            }
          }
          transform={
            [
              {
                "rotate": 0.39269908169872414,
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
            cx={110}
            cy={110}
            paint={
              {
                "kind": "specular-paint",
              }
            }
            r={105.6}
          />
        </View>
      </View>
    `);
  });
});
