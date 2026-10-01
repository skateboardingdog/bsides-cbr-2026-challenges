import { ENGINE_VERSION, verifySolution } from "../src/engine.js";
import { levels } from "../src/levels.js";

export const REQUIRED_LEVEL_IDS = Array.from({ length: 10 }, (_, i) => `level-${i}`);
export const MAX_SOLUTION_MOVES = 10000;
export function validProofPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.engineVersion !== ENGINE_VERSION) return false;
  if (Object.keys(payload).length !== 2) return false;
  const proofs = payload.solutions;
  if (!proofs || typeof proofs !== "object" || Array.isArray(proofs) || Object.keys(proofs).length !== 10) return false;
  return REQUIRED_LEVEL_IDS.every(id => Object.hasOwn(proofs, id) && typeof proofs[id] === "string" &&
    proofs[id].length > 0 && proofs[id].length <= MAX_SOLUTION_MOVES && /^[UDLR]+$/.test(proofs[id]));
}

// Board data is selected by the server. The request contributes only inputs.
export function verifyCampaignSolutions(payload, trustedCampaign = levels) {
  if (!validProofPayload(payload)) return false;
  return REQUIRED_LEVEL_IDS.every(id => {
    const level = trustedCampaign.find(level => level.id === id);
    return Boolean(level?.goal && verifySolution(level, payload.solutions[id], { maxMoves: MAX_SOLUTION_MOVES }).valid);
  });
}
