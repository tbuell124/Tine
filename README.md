# Tine React Native App

This project was bootstrapped to provide a TypeScript-enabled [Expo](https://expo.dev/) application that already includes the required animation and drawing libraries.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run start
   ```

   Use the on-screen Expo CLI instructions to launch the application on iOS, Android, or the web.

## Included libraries

- [`@shopify/react-native-skia`](https://shopify.github.io/react-native-skia/) for GPU-accelerated drawing.
- [`react-native-reanimated`](https://docs.swmansion.com/react-native-reanimated/) for smooth, declarative animations.
- [`react-native-gesture-handler`](https://docs.swmansion.com/react-native-gesture-handler/docs/) to work with complex gestures.

The sample screen demonstrates how the dependencies work together by animating a gradient orb on a Skia canvas that can be dragged around the screen.

## Required binary assets

The Expo configuration expects PNG artwork in the `assets/` directory for the application icon, adaptive icon, splash screen, and web favicon. These binaries are intentionally omitted from version control.

Before running a production build or publishing the app, generate the following files and save them into `assets/` with the exact filenames shown below:

- `icon.png`
- `adaptive-icon.png`
- `splash.png`
- `favicon.png`

You can use any design pipeline you prefer. Expo also provides helpers such as `npx @expo/cli generate icons ./assets/icon.png` if you want to derive the assets from a single source image.

## Useful commands

- `npm run android` – Build and launch the native Android application.
- `npm run ios` – Build and launch the native iOS application.
- `npm run web` – Start the Expo web bundler.
- `npm run lint` – Run ESLint using the shared Expo configuration.
