/** Approved first stage: unmounted creature. Rider poses are a separate stage. */
export const AUREA_MOUNT = {
  id: "52291cdd-57c4-497c-879e-8e9d6ca4152a",
  name: "Montaria Taurina Áurea",
  riderReady: false,
  actions: ["idle", "walk", "run", "jump", "attack", "hurt"],
  directions: ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"],
} as const;
