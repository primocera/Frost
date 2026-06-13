// Balance lives in config/Balance.ts and is already framework-free, so the sim
// re-exports it rather than duplicating the numbers. (Kept as a sim/ module so
// all simulation imports point at sim/, decoupled from the old Phaser tree.)
export { default } from '../config/Balance'
