# Web Deployment Guide

This guide explains how to build and ship the web version of Tine using Expo Web.

## Quickstart

1. Install Node 20 or 22.
2. Install dependencies:

```bash
npm install
```

3. Run the web build locally:

```bash
npm run web
```

4. Build a static export:

```bash
npx expo export --platform web --output-dir dist
```

5. Host `dist/` on Netlify, Vercel, or S3.

## Notes

- Web pitch detection uses Web Audio (AudioWorklet with a ScriptProcessor fallback).
- Microphone access requires HTTPS or localhost.
- The web UI renders inside a 9:16 viewport that scales to the window.

## Hosting examples

Netlify:
- Build command: `npx expo export --platform web --output-dir dist`
- Output directory: `dist`

Vercel:
- Build command: `npx expo export --platform web --output-dir dist`
- Output directory: `dist`

S3:

```bash
aws s3 sync dist/ s3://<bucket>/
```

## Verification

- Open the deployed URL in Chrome, Safari, and Edge.
- Confirm mic permission prompts and console has no errors.
- Verify the dial remains centered on resize.
