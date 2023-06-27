import { global, varBuy, theory } from "../../Sim/main.js";
import { add, createResult, l10, subtract, simResult, theoryData } from "../../Utils/helpers.js";
import { sleep } from "../../Utils/helpers.js";
import Variable, { ExponentialCost } from "../../Utils/variable.js";
import jsonData from "../../Data/data.json" assert { type: "json" };

export default async function sl(data: theoryData): Promise<simResult> {
  let sim = new slSim(data);
  let res = await sim.simulate();
  return res;
}

type strat = keyof typeof jsonData.theories.SL.strats;

class slSim {
  conditions: Array<Function>;
  milestoneConditions: Array<Function>;

  strat: strat;
  theory: theory;
  tauFactor: number;
  //theory
  cap: Array<number>;
  recovery: { value: number; time: number; recoveryTime: boolean };
  lastPub: number;
  sigma: number;
  totMult: number;
  curMult: number;
  dt: number;
  ddt: number;
  t: number;
  ticks: number;
  //currencies
  rho: number;
  maxRho: number;
  rho2: number;
  rho3: number;
  q: number;
  //initialize variables
  variables: Array<Variable>;
  inverseE_Gamma: number;
  boughtVars: Array<varBuy>;
  //pub values
  tauH: number;
  maxTauH: number;
  pubT: number;
  pubRho: number;
  //milestones  [dimensions, b1exp, b2exp, b3exp]
  milestones: Array<number>;
  pubMulti: number;

  getBuyingConditions() {
    const conditions: { [key in strat]: Array<boolean | Function> } = {
      SL: [true, true, true, true],
      SLStopA: [() => this.curMult < 4.5, () => this.curMult < 4.5, () => this.curMult < 6, () => this.curMult < 6],
      SLStopAd: [
        () => this.curMult < 4.5 && this.variables[0].cost + l10(2 * (this.variables[0].lvl % 3) + 0.0001) < this.variables[1].cost,
        () => this.curMult < 4.5,
        () => this.curMult < 6 && this.variables[2].cost + l10(this.variables[2].cost % 4) < this.variables[3].cost,
        () => this.curMult < 6
      ],
      SLMS: [() => this.curMult < 4, () => this.curMult < 4, () => this.curMult < 7.5, () => this.curMult < 7.5],
      SLMSd: [
        () => this.curMult < 4 && this.variables[0].cost + l10(2 * (this.variables[0].lvl % 3) + 0.0001) < this.variables[1].cost,
        () => this.curMult < 4,
        () => this.curMult < 7.5 && this.variables[2].cost + l10(this.variables[2].cost % 4) < this.variables[3].cost,
        () => this.curMult < 7.5
      ]
    };
    const condition = conditions[this.strat].map((v) => (typeof v === "function" ? v : () => v));
    return condition;
  }
  getMilestoneConditions() {
    let conditions: Array<Function> = [() => true, () => true, () => true, () => true];
    return conditions;
  }
  getTotMult(val: number) {
    return Math.max(0, val * this.tauFactor * 1.5);
  }
  updateMilestones(): void {
    let maxVal = Math.max(this.lastPub, this.maxRho);
    let milestoneCount = Math.min(13, Math.floor(maxVal / 25));
    this.milestones = [0, 0, 0, 0];
    let priority = [4, 3, 1, 2];
    if ((this.strat === "SLMS" || this.strat === "SLMSd") && maxVal >= 25 && maxVal <= 300) {
      //when to swap to a3exp (increasing rho2dot) before b1b2
      let emg_Before_b1b2 = 5;
      //when to swap to rho2 exp before b1b2
      let r2exp_Before_b1b2 = 4;
      if (maxVal < 50) {
        emg_Before_b1b2 = 5;
        r2exp_Before_b1b2 = 4;
      } else if (maxVal < 75) {
        emg_Before_b1b2 = 7;
        r2exp_Before_b1b2 = 6;
      } else if (maxVal < 100) {
        emg_Before_b1b2 = 12;
        r2exp_Before_b1b2 = 10;
      } else if (maxVal < 150) {
        emg_Before_b1b2 = 20;
        r2exp_Before_b1b2 = 15;
      } else if (maxVal < 175) {
        emg_Before_b1b2 = 8;
        r2exp_Before_b1b2 = 6;
      } else if (maxVal < 200) {
        emg_Before_b1b2 = 1.5;
        r2exp_Before_b1b2 = 1;
      } else if (maxVal < 275) {
        emg_Before_b1b2 = 3;
        r2exp_Before_b1b2 = 3;
      } else if (maxVal < 300) {
        emg_Before_b1b2 = 2;
        r2exp_Before_b1b2 = 2;
      }
      let minCost = Math.min(this.variables[2].cost, this.variables[3].cost);
      if (this.rho + l10(emg_Before_b1b2) < minCost) {
        //b12 exp
        priority = [4, 3, 1, 2];
      } else if (this.curMult > 4.5 || this.rho + l10(r2exp_Before_b1b2) > minCost) {
        //rho2 exp
        priority = [1, 2, 4, 3];
      } else if (this.rho + l10(emg_Before_b1b2) > minCost && this.rho + l10(r2exp_Before_b1b2) < minCost) {
        //a3 boost
        priority = [2, 1, 4, 3];
      }
    }
    const max = [3, 5, 2, 2];
    for (let i = 0; i < priority.length; i++) {
      while (this.milestones[priority[i] - 1] < max[priority[i] - 1] && milestoneCount > 0) {
        this.milestones[priority[i] - 1]++;
        milestoneCount--;
      }
    }
  }
  updateInverseE_Gamma = (x: number) => {
    let y = l10(l10(2) / Math.LOG10E + x / Math.LOG10E + l10(Math.PI) / Math.LOG10E) - (l10(2) + x);
    this.inverseE_Gamma = 0 - Math.LOG10E - add(subtract(y, y + y - l10(2)), y + y + y + l10(6));
  };
  constructor(data: theoryData) {
    this.strat = data.strat as strat;
    this.theory = "SL";
    this.tauFactor = jsonData.theories.SL.tauFactor;
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
    this.rho = 0;
    this.maxRho = 0;
    this.rho2 = 0;
    this.rho3 = 0;
    this.q = 0;
    //initialize variables
    this.variables = [
      new Variable({ cost: new ExponentialCost(1, 0.369 * Math.log2(10), true), stepwisePowerSum: { base: 3.5, length: 3 }, firstFreeCost: true }),
      new Variable({ cost: new ExponentialCost(175, 10), varBase: 2 }),
      new Variable({ cost: new ExponentialCost(500, 0.649 * Math.log2(10), true), stepwisePowerSum: { base: 6.5, length: 4 } }),
      new Variable({ cost: new ExponentialCost(1000, 0.926 * Math.log2(10), true), varBase: 2 })
    ];
    this.inverseE_Gamma = 0;
    this.boughtVars = [];
    //pub values
    this.tauH = 0;
    this.maxTauH = 0;
    this.pubT = 0;
    this.pubRho = 0;
    //milestones  [rho2exp, a3exp, b1exp, b2exp]
    this.milestones = [0, 0, 0, 0];
    this.pubMulti = 0;
    this.conditions = this.getBuyingConditions();
    this.milestoneConditions = this.getMilestoneConditions();
    this.updateMilestones();
  }
  async simulate() {
    let pubCondition = false;
    while (!pubCondition) {
      if (!global.simulating) break;
      if ((this.ticks + 1) % 500000 === 0) await sleep();
      this.tick();
      if (this.rho > this.maxRho) this.maxRho = this.rho;
      if (this.lastPub < 300) this.updateMilestones();
      this.curMult = 10 ** (this.getTotMult(this.maxRho) - this.totMult);
      this.buyVariables();
      pubCondition = (global.forcedPubTime !== Infinity ? this.t > global.forcedPubTime : this.t > this.pubT * 2 || this.pubRho > this.cap[0] || this.curMult > 15) && this.pubRho > 10;
      this.ticks++;
    }
    this.pubMulti = 10 ** (this.getTotMult(this.pubRho) - this.totMult);
    let result = createResult(this, "");

    while (this.boughtVars[this.boughtVars.length - 1].timeStamp > this.pubT) this.boughtVars.pop();
    global.varBuy.push([result[7], this.boughtVars]);

    return result;
  }
  tick() {
    let rho3dot = this.variables[2].value * (1 + 0.02 * this.milestones[2]) + this.variables[3].value * (1 + 0.02 * this.milestones[3]);
    this.rho3 = add(this.rho3, rho3dot + l10(this.dt));
    this.updateInverseE_Gamma(Math.max(1, this.rho3));

    let rho2dot = Math.LOG10E * (this.variables[0].value / Math.LOG10E + this.variables[1].value / Math.LOG10E - Math.log(2 - 0.008 * this.milestones[1]) * (Math.max(1, this.rho3) / Math.LOG10E));

    this.rho2 = add(this.rho2, Math.max(0, rho2dot) + l10(this.dt));

    let rhodot = this.rho2 * (1 + this.milestones[0] * 0.02) * 0.5 + this.inverseE_Gamma;
    this.rho = add(this.rho, rhodot + this.totMult + l10(this.dt));

    this.t += this.dt / 1.5;
    this.dt *= this.ddt;
    if (this.maxRho < this.recovery.value) this.recovery.time = this.t;

    this.tauH = (this.maxRho - this.lastPub) / (this.t / 3600);
    if (this.maxTauH < this.tauH || this.maxRho >= this.cap[0] - this.cap[1] || this.pubRho < 10 || global.forcedPubTime !== Infinity) {
      this.maxTauH = this.tauH;
      this.pubT = this.t;
      this.pubRho = this.maxRho;
    }
  }
  buyVariables() {
    for (let i = this.variables.length - 1; i >= 0; i--)
      while (true) {
        if (this.rho > this.variables[i].cost && this.conditions[i]() && this.milestoneConditions[i]()) {
          if (this.maxRho + 5 > this.lastPub) {
            let vars = ["a1", "a2", "b1", "b2"];
            this.boughtVars.push({ variable: vars[i], level: this.variables[i].lvl + 1, cost: this.variables[i].cost, timeStamp: this.t });
          }
          this.rho = subtract(this.rho, this.variables[i].cost);
          this.variables[i].buy();
        } else break;
      }
  }
}
