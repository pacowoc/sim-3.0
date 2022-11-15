import { global } from "../../Sim/main.js";
import { logToExp, simResult, theoryData } from "../../Utils/simHelpers.js";
import { add, createResult, l10, subtract } from "../../Utils/simHelpers.js";
import { findIndex, sleep } from "../../Utils/helperFunctions.js";
import { variableInterface } from "../../Utils/simHelpers.js";
import Variable from "../../Utils/variable.js";
import { getTauFactor } from "../../Sim/Components/helpers.js";

export default async function ef(data: theoryData): Promise<simResult> {
  let sim = new efSim(data);
  let res = await sim.simulate(data);
  return res;
}

class efSim {
  conditions: Array<Array<boolean | Function>>;
  milestoneConditions: Array<Function>;
  milestoneTree: Array<Array<Array<number>>>;

  stratIndex: number;
  strat: string;
  theory: string;
  tauFactor: number;
  //theory
  cap: Array<number>;
  recovery: { value: number; time: number; recoveryTime: boolean };
  recursionValue: Array<number>;
  lastPub: number;
  sigma: number;
  totMult: number;
  curMult: number;
  dt: number;
  ddt: number;
  t: number;
  ticks: number;
  //currencies
  currencies: Array<number>;
  maxRho: number;
  q: number;
  t_var: number;
  //initialize variables
  variables: Array<variableInterface>;
  //pub values
  tauH: number;
  maxTauH: number;
  pubT: number;
  pubRho: number;
  //milestones  [dimensions, b1exp, b2exp, b3exp]
  milestones: Array<number>;
  nextMilestoneCost: number;
  pubMulti: number;
  result: Array<any>;

  getBuyingConditions() {
    let conditions: Array<Array<boolean | Function>> = [
      [...new Array(10).fill(true)], //EF
      [true, () => this.curMult < 1, true, () => this.curMult < 1, () => this.curMult < 1, () => this.curMult < 1, () => this.curMult < 1, () => this.curMult < 1 || this.lastPub > 150, true, true], //EFsnax
      [true, () => this.variables[1].cost + 1 < this.variables[2].cost, true, true, true, true, true, () => this.variables[6].cost + l10(2.5) < this.variables[2].cost, true, true], //EFd
      [
        true,
        () => this.variables[1].cost + l10(10 + (this.variables[1].lvl % 10)) < this.variables[2].cost && this.variables[1].cost + l10((this.variables[1].lvl % 10) + 5) < this.recursionValue[0],
        () => this.variables[2].cost + 0.2 < this.recursionValue[0],
        () => this.variables[3].cost + l10(5) < this.variables[8].cost || this.milestones[1] < 2 || this.curMult < 1,
        () => this.variables[4].cost + l10(5) < this.variables[8].cost || this.milestones[1] < 2 || this.curMult < 1,
        () => this.variables[5].cost + l10(5) < this.variables[9].cost || this.milestones[1] < 2 || this.curMult < 1,
        () => this.variables[6].cost + l10(5) < this.variables[9].cost || this.milestones[1] < 2 || this.curMult < 1,
        () =>
          (this.variables[7].cost + l10(4 + (this.variables[7].lvl % 10) / 2) < this.variables[2].cost || this.variables[2].cost > this.recursionValue[0]) &&
          this.variables[7].cost + l10((this.variables[7].lvl % 10) / 3) < this.recursionValue[0],
        true,
        true
      ] //EFAI -_-
    ];
    conditions = conditions.map((elem) => elem.map((i) => (typeof i === "function" ? i : () => i)));
    return conditions;
  }
  getMilestoneConditions() {
    let conditions: Array<Function> = [
      () => this.variables[0].lvl < 4 && this.maxRho + l10(5) < this.nextMilestoneCost,
      () => true && this.maxRho + l10(5) < this.nextMilestoneCost,
      () => true && this.maxRho + l10(5) < this.nextMilestoneCost,
      () => this.milestones[0] > 0 && this.maxRho + l10(5) < this.nextMilestoneCost,
      () => this.milestones[0] > 0 && this.maxRho + l10(5) < this.nextMilestoneCost,
      () => this.milestones[0] > 1 && this.maxRho + l10(5) < this.nextMilestoneCost,
      () => this.milestones[0] > 1 && this.maxRho + l10(5) < this.nextMilestoneCost,
      () => this.milestones[1] > 0 && this.maxRho + l10(5) < this.nextMilestoneCost,
      () => this.milestones[1] > 1,
      () => this.milestones[1] > 2
    ];
    return conditions;
  }
  getMilestoneTree() {
    let tree: Array<Array<Array<number>>> = [
      ...new Array(4).fill([
        [0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0],
        [2, 0, 0, 0, 0],
        [2, 1, 0, 0, 0],
        [2, 2, 0, 0, 0],
        [2, 3, 0, 0, 0],
        [2, 3, 1, 0, 0],
        [2, 3, 2, 0, 0],
        [2, 3, 3, 0, 0],
        [2, 3, 4, 0, 0],
        [2, 3, 5, 0, 0],
        [2, 3, 5, 1, 0],
        [2, 3, 5, 2, 0],
        [2, 3, 5, 2, 1],
        [2, 3, 5, 2, 2]
      ])
      //EF EFsnax EFd EFAI
    ];
    return tree;
  }
  getTotMult(val: number) {
    return Math.max(0, val * this.tauFactor * 0.387);
  }
  updateMilestones(): void {
    let stage = 0;
    let points = [10, 20, 30, 40, 50, 70, 90, 110, 130, 150, 250, 275, 300, 325];
    for (let i = 0; i < points.length; i++) {
      if (Math.max(this.lastPub, this.maxRho) >= points[i]) stage = i + 1;
      if (points[i] > Math.max(this.lastPub, this.maxRho)) {
        this.nextMilestoneCost = points[i];
        break;
      }
    }
    if (Math.max(this.lastPub, this.maxRho) > 325) this.nextMilestoneCost = Infinity;
    this.milestones = this.milestoneTree[this.stratIndex][Math.min(this.milestoneTree[this.stratIndex].length - 1, stage)];
    if (this.variables[4].varBase !== 1.1 + 0.01 * this.milestones[3]) {
      this.variables[4].varBase = 1.1 + 0.01 * this.milestones[3];
      this.variables[4].reCalculate();
    }
    if (this.variables[6].varBase !== 1.1 + 0.0125 * this.milestones[4]) {
      this.variables[6].varBase = 1.1 + 0.0125 * this.milestones[4];
      this.variables[6].reCalculate();
    }
  }
  evaluatePubConditions() {
    if (this.stratIndex !== 3) return false;
    let totalMilestones = 0;
    let initMilestones = 0;
    let points = [10, 20, 30, 40, 50, 70, 90, 110, 130, 150, 250, 275, 300, 325];
    for (let i = 0; i < points.length; i++) {
      if (Math.max(this.lastPub, this.maxRho) >= points[i]) totalMilestones = i + 1;
      if (this.lastPub >= points[i]) initMilestones = i + 1;
    }
    return (
      (this.lastPub < 30 && this.maxRho > 32.4) ||
      (this.lastPub < 40 && this.maxRho > 42) ||
      (this.lastPub < 50 && this.maxRho > 55) ||
      (this.lastPub < 70 && this.maxRho > 72) ||
      (this.lastPub < 90 && this.maxRho > 92) ||
      (this.lastPub < 110 && this.maxRho > 113) ||
      (this.lastPub < 150 && this.maxRho > 153) ||
      (this.lastPub < 130 && this.maxRho > 134) ||
      (this.lastPub < 146 && this.lastPub > 145 && this.curMult > 2) ||
      (this.lastPub < 126 && this.lastPub > 125 && this.curMult > 2) ||
      (this.lastPub < 106 && this.lastPub > 105 && this.curMult > 3) ||
      (this.lastPub < 87 && this.lastPub > 85 && this.curMult > 3) ||
      (this.lastPub < 67 && this.lastPub > 65 && this.curMult > 3) ||
      (this.lastPub < 46.4 && this.lastPub > 44.7 && this.curMult > 3) ||
      (this.lastPub < 37 && this.lastPub > 36 && this.curMult > 3) ||
      (this.lastPub < 27 && this.lastPub > 26 && this.curMult > 3) ||
      (totalMilestones - initMilestones < 1 && this.curMult > 2.6 + (totalMilestones - initMilestones) && this.recursionValue[1] < 2 && this.stratIndex === 3) ||
      (this.recursionValue[1] === 2 && this.pubRho > this.variables[7].cost + l10(4) && this.variables[7].cost + l10((this.variables[7].lvl % 10) / 3) > this.recursionValue[0])
    );
  }
  constructor(data: theoryData) {
    this.stratIndex = findIndex(data.strats, data.strat);
    this.strat = data.strat;
    this.theory = "EF";
    this.tauFactor = getTauFactor(this.theory);
    //theory
    this.cap = typeof data.cap === "number" && data.cap > 0 ? [data.cap, 1] : [Infinity, 0];
    this.recovery = data.recovery ?? { value: 0, time: 0, recoveryTime: false };
    this.lastPub = data.rho;
    this.sigma = data.sigma;
    this.totMult = this.getTotMult(data.rho);
    this.curMult = 0;
    this.dt = global.dt;
    this.ddt = global.ddt;
    this.t = 0;
    this.ticks = 0;
    //currencies
    this.currencies = [0, 0, 0];
    this.maxRho = 0;
    this.q = 0;
    this.t_var = 0;
    //initialize variables
    this.variables = [
      new Variable({ cost: 1e6, costInc: 1e6 }),
      new Variable({ cost: 10, costInc: 1.61328, stepwisePowerSum: { default: true }, firstFreeCost: true }),
      new Variable({ cost: 5, costInc: 60, varBase: 2 }),
      new Variable({ cost: 20, costInc: 200, value: 1, stepwisePowerSum: { default: true }, firstFreeCost: true }),
      new Variable({ cost: 100, costInc: 2, varBase: 1.1 }),
      new Variable({ cost: 20, costInc: 200, value: 1, stepwisePowerSum: { default: true }, firstFreeCost: true }),
      new Variable({ cost: 100, costInc: 2, varBase: 1.1 }),
      new Variable({ cost: 2000, costInc: 2 ** 2.2, value: 1, stepwisePowerSum: { default: true } }),
      new Variable({ cost: 500, costInc: 2 ** 2.2, value: 1, stepwisePowerSum: { base: 40, length: 10 } }),
      new Variable({ cost: 500, costInc: 2 ** 2.2, varBase: 2 })
    ];
    this.recursionValue = <Array<number>>data.recursionValue ?? [Infinity, 0];
    //pub values
    this.tauH = 0;
    this.maxTauH = 0;
    this.pubT = 0;
    this.pubRho = 0;
    //milestones  [dimensions, aterm, aexp, b2base, c2base]
    this.milestones = [0, 0, 0, 0, 0];
    this.nextMilestoneCost = Infinity;
    this.result = [];
    this.pubMulti = 0;
    this.conditions = this.getBuyingConditions();
    this.milestoneConditions = this.getMilestoneConditions();
    this.milestoneTree = this.getMilestoneTree();
    this.updateMilestones();
  }
  async simulate(data: theoryData) {
    if (this.lastPub >= 10 && data.recursionValue == null && this.stratIndex === 3) {
      data.recursionValue = [Infinity, 0];
      let res1 = await ef(data);
      data.recursionValue = [(<Array<Array<number>>>res1)[9][0], 1];
      let res2 = await ef(data);
      this.recursionValue = [(<Array<Array<number>>>res2)[9][0], 2];
    }
    let pubCondition = false;
    while (!pubCondition) {
      if (!global.simulating) break;
      if ((this.ticks + 1) % 500000 === 0) await sleep();
      this.tick();
      if (this.currencies[0] > this.maxRho) this.maxRho = this.currencies[0];
      if (this.lastPub < 325) this.updateMilestones();
      this.curMult = 10 ** (this.getTotMult(this.maxRho) - this.totMult);
      this.buyVariables();
      pubCondition = (global.forcedPubTime !== Infinity ? this.t > global.forcedPubTime : this.t > this.pubT * 2 || this.pubRho > this.cap[0] || this.evaluatePubConditions()) && this.pubRho > 10;
      this.ticks++;
    }
    this.pubMulti = 10 ** (this.getTotMult(this.pubRho) - this.totMult);
    this.result = createResult(this, this.stratIndex === 3 ? ` q1: ${this.variables[1].lvl} q2: ${this.variables[2].lvl} a1: ${this.variables[7].lvl}` : "");
    return this.result;
  }
  tick() {
    let logbonus = l10(this.dt) + this.totMult;
    this.q = add(this.q, this.variables[1].value + this.variables[2].value + logbonus);

    this.t_var += this.dt * (this.variables[0].lvl / 5 + 0.2);

    let a = (this.variables[7].value + this.variables[8].value + this.variables[9].value) * (0.1 * this.milestones[2] + 1);

    let b = this.variables[3].value + this.variables[4].value;

    let c = this.variables[5].value + this.variables[6].value;

    let R = b + l10(Math.abs(Math.cos(this.t_var)));
    let I = c + l10(Math.abs(Math.sin(this.t_var)));

    this.currencies[1] = this.milestones[0] > 0 ? add(this.currencies[1], logbonus + R * 2) : 0;

    this.currencies[2] = this.milestones[0] > 1 ? add(this.currencies[2], logbonus + I * 2) : 0;

    switch (this.milestones[0]) {
      case 0:
        this.currencies[0] = add(this.currencies[0], logbonus + (l10(this.t_var) + this.q * 2) / 2);
        break;
      case 1:
        this.currencies[0] = add(this.currencies[0], logbonus + add(l10(this.t_var) + this.q * 2, this.currencies[1] * 2) / 2);
        break;
      case 2:
        this.currencies[0] = add(this.currencies[0], logbonus + a + add(add(l10(this.t_var) + this.q * 2, this.currencies[1] * 2), this.currencies[2] * 2) / 2);
        break;
    }

    this.t += this.dt / 1.5;
    this.dt *= this.stratIndex === 3 && this.recursionValue[1] < 2 ? Math.min(1.3, this.ddt * 50) : this.ddt;
    if (this.maxRho < this.recovery.value) this.recovery.time = this.t;

    this.tauH = (this.maxRho - this.lastPub) / (this.t / 3600);
    if (this.maxTauH < this.tauH || this.maxRho >= this.cap[0] - this.cap[1] || this.pubRho < 10 || global.forcedPubTime !== Infinity) {
      this.maxTauH = this.tauH;
      this.pubT = this.t;
      this.pubRho = this.maxRho;
    }
  }
  buyVariables() {
    let currencyIndexes = [0, 0, 0, 1, 1, 2, 2, 0, 1, 2];
    for (let i = this.variables.length - 1; i >= 0; i--)
      while (true) {
        if (this.currencies[currencyIndexes[i]] > this.variables[i].cost && (<Function>this.conditions[this.stratIndex][i])() && this.milestoneConditions[i]()) {
          this.currencies[currencyIndexes[i]] = subtract(this.currencies[currencyIndexes[i]], this.variables[i].cost);
          this.variables[i].buy();
        } else break;
      }
  }
}