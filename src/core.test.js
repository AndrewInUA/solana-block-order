const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const bs58 = require("./base58");
const { Budget } = require("./budget");
const { kendallTau } = require("./stats");
const { groupWindows, futureWindows } = require("./windows");
const { selectValidators } = require("./select");
const { fromVersionString, familyFromLabel } = require("./classify");
const { assignPrices } = require("./sender");
const { verdictFor, groupByValidator, analyze } = require("./analyze");

describe("base58", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = Uint8Array.from([0, 0, 1, 2, 3, 255, 254, 100]);
    assert.deepEqual(Uint8Array.from(bs58.decode(bs58.encode(bytes))), bytes);
  });
});

describe("Budget", () => {
  it("refuses to cross the cap", () => {
    const b = new Budget(10000);
    const fee = Budget.feeFor(0, 1200); // 5000 base
    assert.equal(b.tryReserve(fee), true);
    assert.equal(b.tryReserve(fee), true);
    assert.equal(b.tryReserve(fee), false); // third would exceed 10000
  });

  it("priority fee adds to base fee", () => {
    // 1_000_000 micro-lamports/CU * 1200 CU / 1e6 = 1200 lamports priority
    assert.equal(Budget.feeFor(1_000_000, 1200), 5000 + 1200);
  });
});

describe("kendallTau", () => {
  it("is -1 for perfectly inverted ranks (price up, position earlier)", () => {
    const pairs = [[0, 3], [10, 2], [20, 1], [30, 0]];
    assert.equal(kendallTau(pairs).tau, -1);
  });
  it("is near 0 for shuffled noise", () => {
    const pairs = [[0, 1], [10, 3], [20, 0], [30, 2]];
    assert.ok(Math.abs(kendallTau(pairs).tau) < 1);
  });
});

describe("windows", () => {
  it("groups consecutive slots into windows of 4", () => {
    const w = groupWindows([4, 5, 6, 7, 100, 101], 4);
    assert.deepEqual(w[0], [4, 5, 6, 7]);
    assert.deepEqual(w[1], [100, 101]);
  });
  it("keeps only future windows past the lead buffer", () => {
    const w = futureWindows([4, 5, 6, 7, 100, 101, 102, 103], 50, 4, 2);
    assert.equal(w.length, 1);
    assert.equal(w[0][0], 100);
  });
});

describe("selectValidators", () => {
  it("fails closed when fewer than 3 families exist", () => {
    const cands = [
      { identity: "a", client: { family: "agave" }, leaderSlots: [1] },
      { identity: "b", client: { family: "agave" }, leaderSlots: [2] }
    ];
    assert.equal(selectValidators(cands).ok, false);
  });
  it("ignores validators whose upcoming windows are already empty", () => {
    const cands = [
      { identity: "old", client: { family: "agave" }, leaderSlots: [1], futureWindows: [] },
      { identity: "a", client: { family: "agave" }, leaderSlots: [1], futureWindows: [[10]] },
      { identity: "f", client: { family: "firedancer" }, leaderSlots: [1], futureWindows: [[11]] },
      { identity: "j", client: { family: "jito" }, leaderSlots: [1], futureWindows: [[12]] },
      { identity: "a2", client: { family: "agave" }, leaderSlots: [1], futureWindows: [[13]] },
      { identity: "f2", client: { family: "firedancer" }, leaderSlots: [1], futureWindows: [[14]] },
      { identity: "j2", client: { family: "jito" }, leaderSlots: [1], futureWindows: [[15]] }
    ];
    const res = selectValidators(cands);
    assert.equal(res.ok, true);
    assert.equal(res.chosen.some(c => c.identity === "old"), false);
  });
  it("puts Agave, Jito and Firedancer in the set when they have windows", () => {
    const cands = [];
    for (const fam of ["FireBAM", "AgaveBam", "Rakurai", "Agave", "JitoLabs", "Firedancer", "HarmonicAgave"]) {
      cands.push({ identity: fam + "1", client: { family: fam }, leaderSlots: [1], futureWindows: [[10]] });
    }
    const res = selectValidators(cands);
    const families = new Set(res.chosen.map(c => c.client.family));
    assert.equal(families.has("Agave"), true);
    assert.equal(families.has("JitoLabs"), true);
    assert.equal(families.has("Firedancer"), true);
  });
  it("spreads picks across families", () => {
    const cands = [];
    for (let i = 0; i < 6; i++) cands.push({ identity: "ag" + i, client: { family: "agave" }, leaderSlots: [i] });
    for (let i = 0; i < 6; i++) cands.push({ identity: "fd" + i, client: { family: "firedancer" }, leaderSlots: [i] });
    for (let i = 0; i < 6; i++) cands.push({ identity: "jt" + i, client: { family: "jito" }, leaderSlots: [i] });
    const res = selectValidators(cands);
    assert.equal(res.ok, true);
    assert.ok(new Set(res.chosen.map(c => c.client.family)).size >= 3);
  });
});

describe("classify.fromVersionString", () => {
  it("maps Agave-style versions to Agave-family as a last resort", () => {
    assert.equal(fromVersionString("4.3.2").family, "Agave-family");
  });
  it("maps 0.x to Firedancer-0.x, not a made-up Frankendancer label", () => {
    assert.equal(fromVersionString("0.1.1").family, "Firedancer-0.x");
  });
  it("maps 26.x to Firedancer", () => {
    assert.equal(fromVersionString("26.10.5").family, "Firedancer");
  });
});

describe("classify from gossip clientId", () => {
  const { classify } = require("./classify");
  it("prefers gossip clientId over the version string", () => {
    const c = classify("x", { version: "0.1.1", clientId: "Firedancer" }, {});
    assert.equal(c.client, "Firedancer");
    assert.equal(c.family, "Firedancer");
    assert.equal(c.source, "gossip-clientId");
  });
  it("keeps Jito, Agave and Harmonic as distinct families", () => {
    assert.equal(classify("a", { version: "4.4.0", clientId: "JitoLabs" }, {}).family, "JitoLabs");
    assert.equal(classify("b", { version: "4.4.0", clientId: "Agave" }, {}).family, "Agave");
    assert.equal(classify("c", { version: "4.4.0", clientId: "HarmonicAgave" }, {}).family, "HarmonicAgave");
  });
});

describe("assignPrices", () => {
  it("gives one price per signer", () => {
    assert.deepEqual(assignPrices([0, 100, 200], 3), [0, 100, 200]);
  });
  it("cycles when signers exceed ladder", () => {
    assert.deepEqual(assignPrices([0, 100], 3), [0, 100, 0]);
  });
});

describe("verdictFor", () => {
  it("calls strong negative tau with low p priority-ordered", () => {
    assert.equal(verdictFor(-0.8, 0.001, 20), "priority-ordered");
  });
  it("calls tiny samples insufficient", () => {
    assert.equal(verdictFor(-0.9, 0.001, 3), "insufficient-data");
  });
  it("calls flat tau noise", () => {
    assert.equal(verdictFor(-0.05, 0.6, 20), "no-rule/noise");
  });
});

describe("familyFromLabel", () => {
  it("keeps gossip client names intact", () => {
    assert.equal(familyFromLabel("Firedancer"), "Firedancer");
    assert.equal(familyFromLabel("JitoLabs"), "JitoLabs");
    assert.equal(familyFromLabel("HarmonicAgave"), "HarmonicAgave");
  });
});

describe("groupByValidator", () => {
  it("folds three windows of the same leader into one row", () => {
    const results = [0, 1, 2].map(i => ({
      validator: "Abc",
      client: { client: "Firedancer", family: "firedancer", source: "version-string" },
      windowSlots: [100 + i, 101 + i, 102 + i, 103 + i],
      landed: [],
      sentCount: 8,
      landedCount: 0
    }));
    const grouped = groupByValidator(results);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].sentCount, 24);
    assert.equal(grouped[0].windows.length, 3);
    const analysis = analyze(results);
    assert.equal(analysis.perValidator.length, 1);
    assert.equal(analysis.perFamily[0].validators, 1);
  });
});
