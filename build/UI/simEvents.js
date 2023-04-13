var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { simulate, global } from "../Sim/main.js";
import { qs, event, sleep, ce, qsa } from "../Utils/helperFunctions.js";
import { convertTime, logToExp } from "../Utils/simHelpers.js";
import { getSimState, setSimState } from "./simState.js";
//Inputs
const theory = qs(".theory");
const strat = qs(".strat");
const sigma = qs(".sigma");
const input = qs(".input");
const cap = qs(".cap");
const mode = qs(".mode");
const modeInput = qs("textarea");
const timeDiffInputs = qsa(".timeDiffInput");
const hardCap = qs(".hardCap");
const semi_idle = qs(".semi-idle");
const hard_active = qs(".hard-active");
//Outputs
const output = qs(".output");
let table = qs(".simTable");
let thead = qs(".simTable > thead");
let tbody = qs(".simTable > tbody");
//Buttons
const simulateButton = qs(".simulate");
//Setting Inputs
const dtOtp = qs(".dtOtp");
const ddtOtp = qs(".ddtOtp");
const showA23 = qs(".a23");
let prevMode = "All";
const tau = `<span style="font-size:0.9rem; font-style:italics">&tau;</span>`;
const tableHeaders = {
    current: "All",
    single: `<th style="padding-inline: 0.5rem !important">Theory</th><th><span style="font-size:0.9rem;">&sigma;</span><sub>t</sub></th><th>Last Pub</th><th>Max Rho</th><th>&Delta;${tau}</th><th>Multi</th><th>Strat</th><th>${tau}/h</th><th>Pub Time</th>`,
    all: `<th>&emsp;</th><th>Input</th><th>${tau}/h Active</th><th>${tau}/h Idle</th><th>Ratio</th><th>Multi Active</th><th>Multi Idle</th><th>Strat Active</th><th>Strat Idle</th><th>Time Active</th><th>Time Idle</th><th>&Delta;${tau} Active</th><th>&Delta;${tau} Idle</th>`
};
thead.innerHTML = tableHeaders.all;
table.classList.add("big");
if (localStorage.getItem("autoSave") === "true")
    setTimeout(() => getSimState(), 500);
event(simulateButton, "click", () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    global.dt = parseFloat((_a = dtOtp.textContent) !== null && _a !== void 0 ? _a : "1.5");
    global.ddt = parseFloat((_b = ddtOtp.textContent) !== null && _b !== void 0 ? _b : "1.0001");
    global.stratFilter = true;
    global.showA23 = showA23.checked;
    localStorage.setItem("simAllSettings", JSON.stringify([semi_idle.checked, hard_active.checked]));
    const data = {
        theory: theory.value,
        strat: strat.value,
        sigma: sigma.value.replace(" ", ""),
        rho: input.value.replace(" ", ""),
        cap: cap.value.replace(" ", ""),
        mode: mode.value,
        modeInput: modeInput.value,
        simAllInputs: [semi_idle.checked, hard_active.checked],
        timeDiffInputs: [],
        hardCap: hardCap.checked
    };
    for (let element of timeDiffInputs) {
        data.timeDiffInputs.push(element.value);
    }
    output.textContent = "";
    simulateButton.textContent = "Stop simulating";
    yield sleep();
    let res = yield simulate(data);
    if (typeof res === "string")
        output.textContent = res;
    else
        output.textContent = "";
    if (res !== null && typeof res !== "string")
        updateTable(res);
    simulateButton.textContent = "Simulate";
    global.simulating = false;
    setSimState();
}));
function updateTable(arr) {
    if (prevMode !== mode.value)
        clearTable();
    prevMode = mode.value;
    table = qs(".simTable");
    thead = qs(".simTable > thead");
    tbody = qs(".simTable > tbody");
    if (mode.value === "All") {
        table.classList.add("big");
        table.classList.remove("small");
        thead.innerHTML = tableHeaders.all;
        thead.children[0].children[0].innerHTML = arr[arr.length - 1][0].toString() + '<span style="font-size:0.9rem;">&sigma;</span><sub>t</sub>';
        arr.pop();
    }
    else {
        table.classList.remove("big");
        table.classList.add("small");
        thead.innerHTML = tableHeaders.single;
    }
    if ((tbody.children.length > 1 && (arr.length > 1 || tbody.children[tbody.children.length - 1].children[0].innerHTML === "")) || mode.value === "All")
        clearTable();
    for (let i = 0; i < arr.length; i++) {
        const row = ce("tr");
        for (let j = 0; j < thead.children[0].children.length; j++) {
            const cell = ce("td");
            cell.innerHTML = String(arr[i][j]);
            row.appendChild(cell);
        }
        tbody.appendChild(row);
    }
    resetVarBuy();
}
function resetVarBuy() {
    tbody = qs(".simTable > tbody");
    for (let i = 0; i < global.varBuy.length; i++) {
        for (let j = 0; j < (tbody === null || tbody === void 0 ? void 0 : tbody.children.length); j++) {
            const row = tbody === null || tbody === void 0 ? void 0 : tbody.children[j];
            if (parseFloat(row === null || row === void 0 ? void 0 : row.children[7].innerHTML) === global.varBuy[i][0]) {
                let val = global.varBuy[i][1];
                (row === null || row === void 0 ? void 0 : row.children[8]).onpointerdown = () => {
                    openVarModal(val);
                };
                (row === null || row === void 0 ? void 0 : row.children[8]).style.cursor = "pointer";
            }
        }
    }
    global.varBuy = [];
}
function openVarModal(arr) {
    document.body.style.overflow = "hidden";
    qs(".boughtVars").showModal();
    const tbody = qs(".boughtVarsOtp");
    while (tbody.firstChild)
        tbody.firstChild.remove();
    for (let i = 0; i < arr.length; i++) {
        const tr = document.createElement("tr");
        const td1 = document.createElement("td");
        td1.innerText = arr[i].variable;
        tr.appendChild(td1);
        const td2 = document.createElement("td");
        td2.innerText = arr[i].level.toString();
        tr.appendChild(td2);
        const td3 = document.createElement("td");
        td3.innerText = logToExp(arr[i].cost, 2);
        tr.appendChild(td3);
        const td4 = document.createElement("td");
        td4.innerText = convertTime(arr[i].timeStamp);
        tr.appendChild(td4);
        tbody.appendChild(tr);
    }
}
event(qs(".boughtVarsCloseBtn"), "pointerdown", () => {
    qs(".boughtVars").close();
    document.body.style.overflow = "auto";
});
function clearTable() {
    while (tbody.firstChild)
        tbody.firstChild.remove();
}
