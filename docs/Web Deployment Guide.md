# Web Deployment Guide

This guide explains how to build and ship the web version of **Tine** using Expo Web. It assumes no prior deployment experience and walks through development setup, builds, hosting, and verification.

---

## 0. Quickstart (first successful deploy)

1. Install Node 20 or 22 (use `nvm install 20 && nvm use 20`).
2. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/tylerbuell/Tine.git
   cd Tine
   npm install
   ```
3. Run the app locally for smoke testing:
   ```bash
   npm run web
   ```
   Open the printed localhost URL in your browser and confirm the tuner UI renders.
4. Run automated checks:
   ```bash
   npm run lint
   npm run test
   npm run format:check
   ```
5. Create a production build (static site) into `dist/`:
   ```bash
   npx expo export --platform web --output-dir dist
   ```
6. Pick a host:
   - **Netlify**: drag `dist/` into the Deploys page or connect the Git repo.
   - **Vercel**: import the repo, set `Build Command` to `npx expo export --platform web --output-dir dist` and `Output Directory` to `dist`.
   - **Amazon S3 + CloudFront**: sync `dist/` to an S3 bucket with static website hosting and front it with CloudFront.
7. Verify the deployed URL on desktop and mobile browsers. Clear cache or use a private window to ensure fresh assets.

---

## 1. Prerequisites checklist

| Requirement        | Details                                                                 | Verification                        |
| ------------------ | ----------------------------------------------------------------------- | ----------------------------------- |
| Node.js            | 20 LTS or 22 LTS                                                        | `node --version`                    |
| npm / Yarn         | npm 10+ (bundled) or Yarn 4 via Corepack                                | `npm --version` or `yarn --version` |
| Expo CLI (bundled) | Installed via project dependencies                                      | `npx expo --version`                |
| Browser support    | Test on Chrome, Safari, and Edge (latest)                               | Open the local dev server           |
| Hosting account    | Netlify, Vercel, or AWS account with permissions to deploy static sites | Log into the chosen provider        |

---

## 2. Configure the project

1. **Install dependencies** (skip if already done):
   ```bash
   npm install
   ```
2. **Check app metadata** in `app.json`:
   - `expo.name` – displayed in the browser tab title.
   - `expo.slug` – used in asset paths and PWA manifest.
   - `expo.web` – verify `bundler` remains `metro` and update `favicon`, `themeColor`, or `backgroundColor` if needed.
3. **Environment variables**: If you need environment-specific values, define them in `.env` and load them via `app.config.js` or `expo-env`. Do **not** commit secrets.
4. **Assets**: Ensure favicons and web icons are present in `assets/`. Update the splash background color if branding changes.

---

## 3. Develop and test locally

1. Start the dev server:

   ```bash
   npm run web
   ```

   - The command opens Expo DevTools in the browser. Click **Run in web browser** if it does not auto-open.
   - Hot reloading is enabled; changes in `src/` refresh automatically.

2. Verify core flows:
   - Tuner UI renders without console errors.
   - Keyboard/mouse input is not required for tuning; confirm layout responsiveness between mobile and desktop widths.
   - Confirm audio permission prompts (if used) appear and can be granted.
3. Stop the dev server with **Ctrl+C** when finished.

---

## 4. Build a production bundle

1. Clean previous artifacts (optional but recommended):
   ```bash
   rm -rf dist
   ```
2. Export the static site:

   ```bash
   npx expo export --platform web --output-dir dist
   ```

   - Output: static assets in `dist/` suitable for any static host.
   - Expo automatically inlines the correct asset paths and generates a `manifest.json` for PWA support.

3. Smoke test the build locally:
   ```bash
   npx serve dist
   ```
   If `serve` is not installed, add it globally with `npm install --global serve`.
4. Open `http://localhost:3000` (default) and confirm the UI loads without console errors.

---

## 5. Deploy to a host

### Option A – Netlify (UI-driven)

1. Sign in to Netlify and click **Add new site ▸ Deploy manually**.
2. Drag the `dist/` folder into the upload target. Wait for the upload to finish.
3. Netlify assigns a temporary URL. Rename it under **Site settings ▸ Site details** if desired.
4. Add a custom domain under **Domain management** and enable HTTPS.

### Option B – Netlify (connected repo)

1. In Netlify, select **Add new site ▸ Import an existing project** and choose GitHub.
2. Select the `Tine` repository.
3. Set **Build command** to `npx expo export --platform web --output-dir dist` and **Publish directory** to `dist`.
4. Add environment variables in **Site settings ▸ Build & deploy ▸ Environment** if required.
5. Trigger the initial deploy. Subsequent pushes to the selected branch auto-deploy.

### Option C – Vercel

1. In Vercel, click **Add New ▸ Project**, then import the GitHub repo.
2. Override defaults:
   - **Build Command**: `npx expo export --platform web --output-dir dist`
   - **Output Directory**: `dist`
3. Add any environment variables under **Settings ▸ Environment Variables**.
4. Deploy the project. Preview deployments attach to pull requests automatically.

### Option D – Amazon S3 + CloudFront

1. Create an S3 bucket (enable static website hosting or leave private if fronted only by CloudFront).
2. Upload the contents of `dist/`:
   ```bash
   aws s3 sync dist/ s3://<your-bucket-name>/
   ```
3. (Recommended) Create a CloudFront distribution pointing to the bucket origin. Enable gzip/brotli and cache invalidations.
4. Set the **Default Root Object** to `index.html`. Invalidate `/*` after each deploy to refresh cached assets.

---

## 6. Post-deploy verification

- Open the deployed URL in Chrome, Safari, and Edge; test on both desktop and mobile widths.
- Confirm the app loads over HTTPS and the address bar displays the correct icon/title.
- Clear the browser cache or use a private window to ensure fresh assets load.
- Check DevTools **Console** and **Network** tabs for 404s or CSP violations.
- Optional: add uptime monitoring (e.g., Netlify Analytics, Vercel Analytics, or an external service).

---

## 7. Troubleshooting

| Issue                                     | Resolution                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Cannot find module 'expo'` during export | Ensure `npm install` succeeded; delete `node_modules` and reinstall.                                       |
| Assets missing after deploy               | Confirm `dist/` was exported after the last code change and that the host points to `dist/` root.          |
| Blank page in production                  | Check the browser console for path errors; verify `expo.slug` and hosting base path do not conflict.       |
| Slow first load                           | Enable CDN caching (Netlify/Vercel automatic, CloudFront recommended) and avoid large uncompressed assets. |
| Service worker cache serving old build    | Use a cache-busting deploy (new `dist/`), then hard refresh or clear site data.                            |

---

## 8. Release cadence template

| Day | Task                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| -2  | Cut a release branch and run `npm run lint`, `npm run test`, `npm run format:check`.                                |
| -1  | Export a fresh build (`npx expo export --platform web --output-dir dist`) and smoke test with `npx serve dist`.     |
| 0   | Deploy to staging host, verify, then promote to production (Netlify/Vercel branch alias or CloudFront origin swap). |
| +1  | Monitor errors/analytics; invalidate CDN cache if issues arise.                                                     |

Follow this cadence to ensure repeatable, low-risk web releases.
