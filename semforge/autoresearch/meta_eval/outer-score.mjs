const [finalScore = "0", convergenceSpeed = "0", improvementPerExperiment = "0"] = process.argv.slice(2);

const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const score =
  clamp(finalScore) * 0.5 +
  clamp(convergenceSpeed) * 0.3 +
  clamp(improvementPerExperiment) * 0.2;

console.log(`AUTORESEARCH_OUTER_SCORE=${score.toFixed(2)}`);
