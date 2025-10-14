# User Experience Overview

## Core Interaction Model
The Tine tuner centers on a dual-wheel interface that prioritizes clarity and accuracy:
- **Outer Note Wheel**: Rotates in 30° increments to highlight the detected pitch class. The brushed-metal finish, chamfered edges, and laser-etched note labels provide immediate readability without ornamental clutter.
- **Inner Cents Wheel**: Springs toward zero cents with damped overshoot and micro-jitters to visualize fine pitch adjustments. Subtle detent ticks every 5 cents, reinforced by light haptics, help performers make confident micro-corrections.
- **Lock Halo & Badge**: When alignment lands inside the target window a luminous halo wraps the wheels and an "IN TUNE" badge illuminates at center, making the lock state unmistakable from any viewing angle.

## Visual Feedback States
- **Approaching In-Tune**: As deviation narrows within ±2 cents, the lock halo glow transitions from amber to soft green. The rim brightness increases gently, guiding attention without distraction.
- **Locked Pitch**: When a note remains stable within ±2 cents for 400 ms, the interface emits a crisp success haptic, brightens the halo, and triggers the centered "IN TUNE" badge along with a fleeting shimmer along the outer rim. The effect communicates precision while keeping the screen composed.
- **Listening / Stabilizing**: If the input signal is weak or fluctuating, both wheels coast smoothly and a minimal text indicator (“Listening…” or “Stabilizing…”) appears beneath the tuner, signaling the system’s state without extra animation.

## Motion and Responsiveness
- **Note Changes**: The outer wheel eases gracefully into the new note position, avoiding abrupt jumps that could disorient the player.
- **Fine Tuning**: The inner wheel responds immediately to pitch fluctuations, showcasing the damping and micro-jitter behaviors musicians expect from a physical dial.
- **No Signal**: When silence is detected, motion slows to a gentle idle, preserving battery life and maintaining a sense of calm.

## Haptics and Audio Cues
- **Micro Ticks**: Optional light haptic ticks at every 5-cent crossing provide tactile guidance without overwhelming the player.
- **Success Tap**: A single, firm haptic fires once the tuner confirms lock for 400 ms within ±2 cents.
- **Guidance Rumble**: A subtle low-frequency rumble activates when the note drifts beyond ±30 cents, nudging the musician back toward center.
- **Sound Design**: Audio feedback is intentionally sparse—limited to a soft metallic click when the instrument reaches perfect alignment.

## Supporting Copy and Micro-Interactions
- **Status Messaging**: Short, context-aware messages appear only when needed (e.g., “Listening…”, “Stabilizing…”), preserving the minimal UI aesthetic.
- **Transitions**: All text fades in and out with smooth timing to avoid pulling focus from the wheels.

## Accessibility and Feel
- **High Contrast**: Clean note lettering and numeric ticks ensure readability on dimly lit stages.
- **Haptic-First**: The tactile system supports performers who rely more on feel than sight mid-performance.
- **Calming Presence**: Every interaction—from visual glow to audio cues—is tuned to reduce stress, letting musicians stay in the flow of performance.
