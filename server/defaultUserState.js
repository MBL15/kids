import {
  DEFAULT_CRITERIA,
  DEFAULT_METHODS,
} from "../js/data.js";
import { defaultLocalMatrices } from "../js/ahp.js";

export function createDefaultUserState() {
  const criteria = JSON.parse(JSON.stringify(DEFAULT_CRITERIA));
  const methods = JSON.parse(JSON.stringify(DEFAULT_METHODS));
  const k = criteria.length;
  const m = methods.length;
  return {
    criteria,
    methods,
    criteriaImportance: [],
    methodScores: [],
    localMatrices: defaultLocalMatrices(k, m),
    students: [],
  };
}
