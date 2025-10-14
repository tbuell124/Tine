/**
 * Helper functions for critically damped spring motion in angular space.
 */

// Tunable constants derived from design requirements. Keeping them isolated makes
// it easier to tweak the "feel" without touching the integration logic.
export const SPRING_DAMPING_RATIO = 0.92; // Approximately critical damping for a responsive feel.
export const SPRING_ANGULAR_FREQUENCY = 12; // Natural frequency (rad/s) controlling stiffness.

/**
 * Represents the state of the spring, consisting of the current angle and angular velocity.
 */
export interface SpringState {
  /** Current angular position in radians. */
  angle: number;
  /** Current angular velocity in radians per second. */
  velocity: number;
}

/**
 * Normalizes an angle difference so the spring always takes the shortest path.
 *
 * @param value Angle difference in radians.
 * @returns The wrapped angle in the range [-π, π).
 */
function normalizeAngle(value: number): number {
  const twoPi = Math.PI * 2;
  let wrapped = value % twoPi;

  if (wrapped >= Math.PI) {
    wrapped -= twoPi;
  } else if (wrapped < -Math.PI) {
    wrapped += twoPi;
  }

  return wrapped;
}

/**
 * Advances the angular spring by one timestep using a semi-implicit Euler integrator.
 *
 * The spring is parameterized for a near-critically damped response (ζ ≈ 0.92) with an
 * angular natural frequency of roughly 12 rad/s. These values provide a responsive yet
 * stable motion for UI transitions that should converge without oscillation.
 *
 * @param currentAngle Current angle in radians.
 * @param targetAngle Target angle in radians that the spring should approach.
 * @param velocity Current angular velocity in radians per second.
 * @param deltaTime Simulation timestep in seconds.
 * @returns The next angle and velocity after advancing by `deltaTime`.
 */
export function stepSpring(
  currentAngle: number,
  targetAngle: number,
  velocity: number,
  deltaTime: number,
): SpringState {
  if (deltaTime <= 0) {
    // Nothing to integrate; return the original state.
    return { angle: currentAngle, velocity };
  }

  // Compute displacement to target while respecting angular wrap-around.
  const displacement = normalizeAngle(currentAngle - targetAngle);

  // Compute acceleration based on the second-order ODE of a damped harmonic oscillator.
  const stiffness = SPRING_ANGULAR_FREQUENCY * SPRING_ANGULAR_FREQUENCY;
  const damping = 2 * SPRING_DAMPING_RATIO * SPRING_ANGULAR_FREQUENCY;
  const acceleration = -stiffness * displacement - damping * velocity;

  // Integrate velocity first (semi-implicit) for better energy behavior than explicit Euler.
  const nextVelocity = velocity + acceleration * deltaTime;

  // Integrate position using the updated velocity and re-wrap around the target.
  const nextAngleUnwrapped = currentAngle + nextVelocity * deltaTime;
  const nextAngle = targetAngle + normalizeAngle(nextAngleUnwrapped - targetAngle);

  return { angle: nextAngle, velocity: nextVelocity };
}

export default stepSpring;
