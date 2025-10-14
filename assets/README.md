# Project Assets

The Expo configuration references the following image assets:

- `icon.png`
- `splash.png`
- `adaptive-icon.png`
- `favicon.png`

These files are not checked into the repository. Before building or publishing the app, generate the required PNG assets and place them in this directory with the exact filenames listed above.

You can create them using your design tool of choice or by running Expo's asset generation utilities, for example:

```bash
npx @expo/cli generate icons ./assets/icon.png
```

Replace the example command with whatever pipeline you use to export the final artwork.
