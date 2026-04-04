import {
  DEFAULT_CRITERIA,
  DEFAULT_METHODS,
  defaultCriteriaImportance,
  defaultMethodScores,
} from "../js/data.js";

export function createDefaultUserState() {
  const criteria = JSON.parse(JSON.stringify(DEFAULT_CRITERIA));
  const methods = JSON.parse(JSON.stringify(DEFAULT_METHODS));
  const k = criteria.length;
  const m = methods.length;
  return {
    criteria,
    methods,
    criteriaImportance: defaultCriteriaImportance(k),
    methodScores: defaultMethodScores(m, k),
    students: [],
  };
}
