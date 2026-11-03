import type { PacketModel } from "../packet/model";
import type { DecisionOption, DecisionType } from "./decision";
import { evaluateAlternative } from "../change/scenario";
import { taxEffects } from "../effects";

// Offered decision templates for this packet's real cases. Software OFFERS
// options with effects, evidence and authority; the CPA creates the Decision
// and selects. Exact numbers come from what_if where available; otherwise a
// labelled rate estimate.

export interface DecisionTemplate {
  key: string;
  issueHint: string; // problem class to link an Issue
  type: DecisionType;
  question: string;
  facts: string;
  authority: string;
  evidenceIds: string[];
  watchedLineKeys: string[];
  options: DecisionOption[];
  /** True when a required document is still missing (gates past 'proposed'). */
  missingEvidence?: boolean;
  irrevocable?: boolean;
  formWhereMade?: string;
}

function altOption(model: PacketModel, id: string, label: string, consequence: string): DecisionOption {
  const r = evaluateAlternative(model, id);
  return {
    id,
    label,
    consequence,
    taxEffectFed: r?.fedTaxChange ?? 0n,
    taxEffectCa: r?.caTaxChange ?? 0n,
    method: "what_if_exact",
  };
}

export function decisionTemplates(model: PacketModel): DecisionTemplate[] {
  const V = "v3";
  const templates: DecisionTemplate[] = [];

  // C6 crypto basis — evidence incomplete (bank statement missing).
  templates.push({
    key: "c6_basis",
    issueHint: "basis",
    type: "judgment_call",
    question: "Coinhaven lot C6: use zero basis (engine) or the client's 2021 purchase basis?",
    facts: "BTC transferred in from an external wallet; engine used 0 basis, short-term. Erik's message says ~$3,050 purchased in 2021 (long-term). The bank statement line confirming it is still missing.",
    authority: "Taxpayer basis records; Notice 2014-21. Needs substantiation (bank/exchange record).",
    evidenceIds: ["msg-Erik-c6"],
    watchedLineKeys: ["F8949.H.C6"],
    missingEvidence: true,
    options: [
      { id: "A", label: "Engine: 0 basis, short-term", consequence: "Full proceeds taxed short-term; conservative.", taxEffectFed: 0n, taxEffectCa: 0n, method: "rate_estimate" },
      {
        id: "B",
        label: "$3,050 basis, 2021, long-term",
        consequence: "Gain reduced and reclassified long-term; requires substantiation.",
        ...(() => {
          // move 5,325 stcg -> 2,275 ltcg: remove stcg gain, add ltcg gain
          const removeStcg = taxEffects(-532500n, "stcg", { model, versionId: V, caSource: true });
          const addLtcg = taxEffects(227500n, "ltcg", { model, versionId: V, caSource: true });
          return { taxEffectFed: removeStcg.taxFed + addLtcg.taxFed, taxEffectCa: removeStcg.taxCa + addLtcg.taxCa };
        })(),
        method: "rate_estimate",
      },
    ],
  });

  // HVAC repair vs improvement — exact from what_if.
  templates.push({
    key: "hvac",
    issueHint: "hvac",
    type: "judgment_call",
    question: "HVAC at 1450 Fremont Way: deductible repair or capital improvement?",
    facts: "Whole-system heat-pump replacement (new air handler, line set, permit) per D47 and call-01. A full replacement points to a capital improvement.",
    authority: "Treas. Reg. §1.263(a)-3 (improvements vs repairs).",
    evidenceIds: ["D47", "call-01"],
    watchedLineKeys: ["SchE.14B"],
    options: [
      { id: "repair", label: "Repair (deduct now)", consequence: "Current deduction; aggressive for a full replacement.", taxEffectFed: 0n, taxEffectCa: 0n, method: "rate_estimate" },
      altOption(model, "hvac_improvement", "Improvement (capitalize + depreciate)", "Capitalize; depreciate over time."),
    ],
  });

  // Equipment election — bonus vs §179 vs no bonus (election, irrevocable).
  templates.push({
    key: "equipment_election",
    issueHint: "election_equipment",
    type: "election",
    question: "Studio equipment ($38,000): 100% bonus, §179, or no bonus?",
    facts: "Bought March 2025 for large-format print work; used only in the business (call-01).",
    authority: "IRC §168(k) bonus; §179 election.",
    evidenceIds: ["D47", "call-01"],
    watchedLineKeys: ["F4562-C.12", "F4562-C.14"],
    irrevocable: true,
    formWhereMade: "Form 4562",
    options: [
      { id: "bonus", label: "100% bonus (engine)", consequence: "Full expensing federally.", taxEffectFed: 0n, taxEffectCa: 0n, method: "rate_estimate" },
      altOption(model, "equipment_section179", "§179 election", "Federal unchanged; California differs."),
    ],
  });

  // Form 2210 method — election + penalty.
  templates.push({
    key: "f2210_method",
    issueHint: "penalty",
    type: "election",
    question: "Form 2210: regular or annualized-income installment method?",
    facts: "Underpayment penalty F1040.38 = 164 under the regular method. Income was uneven (stock comp, rental sale).",
    authority: "IRC §6654; Form 2210 Part III (annualized method).",
    evidenceIds: ["F1040.38"],
    watchedLineKeys: ["F1040.38"],
    formWhereMade: "Form 2210",
    options: [
      { id: "regular", label: "Regular method (engine)", consequence: "Penalty as computed.", taxEffectFed: 0n, taxEffectCa: 0n, method: "rate_estimate" },
      altOption(model, "penalty_annualized", "Annualized method", "May reduce the penalty."),
    ],
  });

  // Standard vs itemized — election.
  templates.push({
    key: "std_vs_itemized",
    issueHint: "election_deduction",
    type: "election",
    question: "Standard deduction or itemize?",
    facts: "Itemized deductions currently exceed the standard deduction; corrections (the Subaru) reduce itemized.",
    authority: "IRC §63.",
    evidenceIds: ["SchA.12"],
    watchedLineKeys: ["SchA.12"],
    formWhereMade: "Schedule A / Form 1040",
    options: [
      { id: "itemize", label: "Itemize (engine)", consequence: "Current itemized total.", taxEffectFed: 0n, taxEffectCa: 0n, method: "rate_estimate" },
      altOption(model, "standard_deduction", "Standard deduction", "Switch to the standard deduction."),
    ],
  });

  // Home office — prior preparer open item.
  templates.push({
    key: "home_office",
    issueHint: "home_office",
    type: "judgment_call",
    question: "Home office square footage: what to claim across the move?",
    facts: "D24: 220 sq ft in Sacramento, 260 sq ft in Austin (from 2025-07-16). Engine used an average of 240; 2024 used 300.",
    authority: "IRC §280A; simplified method ($5/sq ft, 300 cap).",
    evidenceIds: ["D24"],
    watchedLineKeys: ["SchC.30"],
    options: [
      { id: "avg240", label: "Average 240 sq ft (engine)", consequence: "$1,200 simplified.", taxEffectFed: 0n, taxEffectCa: 0n, method: "rate_estimate" },
      { id: "prorate", label: "Pro-rate 220/260 by months", consequence: "Time-apportioned between states.", taxEffectFed: 0n, taxEffectCa: 0n, method: "rate_estimate" },
    ],
  });

  return templates;
}
