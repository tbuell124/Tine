# Tine React Native Starter

This repository contains an Expo-managed React Native project configured for TypeScript. Core rendering and gesture libraries are preinstalled in the `package.json`, including:

- [`@shopify/react-native-skia`](https://shopify.github.io/react-native-skia/) for GPU-accelerated canvas drawing.
- [`react-native-reanimated`](https://docs.swmansion.com/react-native-reanimated/) for smooth, native-backed animations.
- [`react-native-gesture-handler`](https://docs.swmansion.com/react-native-gesture-handler/docs/) for high-performance gesture recognition.

The sample application demonstrates how each dependency is wired together so you can iterate quickly on more complex features.

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

   > If you prefer Yarn or pnpm, initialise the corresponding lockfile before installing.

2. **Start the development server**

   ```bash
   npm run start
   ```

   Scan the generated QR code with the Expo Go application or launch a simulator from the Expo CLI interface.

3. **Run on a specific platform**

   ```bash
   npm run ios     # Requires Xcode and an iOS simulator or device
   npm run android # Requires Android Studio and an emulator or connected device
   npm run web     # Launches the Expo web preview
   ```

4. **Execute tests**

   ```bash
   npm test
   ```

## Project structure

```
.
├── App.tsx             # Entry point showcasing Gesture Handler, Reanimated, and Skia
├── app.json            # Expo project configuration
├── assets/             # Placeholder directory for icons and splash assets
├── babel.config.js     # Babel configuration with the Reanimated plugin enabled
├── jest.config.js      # Jest configuration for TypeScript testing
├── package.json        # Dependencies and npm scripts
├── tsconfig.json       # TypeScript compiler configuration
└── README.md           # Project documentation
```

## Next steps

- Replace the placeholder artwork in `assets/` with production-ready icons and splash images.
- Configure code signing and native build settings as needed for release builds.
- Expand the Jest configuration with React Native Testing Library once UI components are added.

## Troubleshooting

- **Pod installation errors (iOS builds)**: Run `npx pod-install` inside the project directory after installing dependencies.
- **Reanimated Babel plugin warnings**: Confirm the plugin remains listed in both `babel.config.js` and `app.json`.
- **Skia build issues**: Follow the [Skia installation guide](https://shopify.github.io/react-native-skia/docs/getting-started/installation/) for platform-specific steps.

Happy building!
