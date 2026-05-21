/**
 * Set isMobile from GameScene once the Phaser device info is available.
 * All systems that emit particles read particleCount() so mobile gets
 * roughly half the particles without touching every call site individually.
 */
export const Device = {
  isMobile: false,
  particleCount(base: number): number {
    return Device.isMobile ? Math.max(1, Math.round(base * 0.45)) : base
  },
}
