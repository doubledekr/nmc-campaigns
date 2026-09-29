/* Generates samples/sample-leads.csv — fake leads (example.com addresses) in a typical lead-export
   layout, for trying the app before real data arrives. Run: node scripts/make-sample.js */
const fs = require("fs"), path = require("path");
let seed = 42; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = a => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);
const firsts = ["James", "Maria", "Robert", "Linda", "Michael", "Patricia", "David", "Jennifer", "William", "Elizabeth", "Anthony", "Keisha", "Carlos", "Tanya", "Brian", "Aisha", "Kevin", "Nicole", "Jason", "Latoya", "Eric", "Samantha", "Marcus", "Angela", "Derek", "Monique", "Luis", "Rachel", "Tyrone", "Heather"];
const lasts = ["Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Wilson", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Robinson", "Clark", "Lewis", "Walker", "Hall", "Young", "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson"];
const places = [["Detroit", "MI"], ["Grand Rapids", "MI"], ["Ann Arbor", "MI"], ["Columbus", "OH"], ["Cleveland", "OH"], ["Indianapolis", "IN"], ["Atlanta", "GA"], ["Savannah", "GA"], ["Charlotte", "NC"], ["Raleigh", "NC"], ["Columbia", "SC"], ["Nashville", "TN"], ["Memphis", "TN"], ["Houston", "TX"], ["Dallas", "TX"], ["San Antonio", "TX"], ["Tampa", "FL"], ["Orlando", "FL"], ["Jacksonville", "FL"], ["Phoenix", "AZ"], ["Tucson", "AZ"], ["Sacramento", "CA"], ["Fresno", "CA"], ["Seattle", "WA"], ["Spokane", "WA"], ["Baltimore", "MD"], ["Birmingham", "AL"], ["Chicago", "IL"], ["Denver", "CO"], ["Newark", "NJ"]];
const streets = ["Maple", "Oak", "Cedar", "Elm", "Pine", "Lakeview", "Hillcrest", "Washington", "Park", "Sunset", "Ridge", "Meadow"];
const types = ["Conventional", "Conventional", "Conventional", "FHA", "FHA", "VA", "Conv 30yr", "FHA 30 Year"];
const los = ["Dave Maxwell", "Dave Maxwell", "Sarah Kim", "Jordan Reyes", ""];
const sources = ["Past client", "Past client", "Web inquiry", "Purchased list", "Referral"];

const headers = ["Lead ID", "Borrower First Name", "Borrower Last Name", "Email Address", "Mobile Phone", "Property Address", "City", "State", "Zip Code", "Loan Type", "Interest Rate", "Current UPB", "P&I Payment", "Est. Home Value", "Origination Date", "Loan Term", "FICO", "Revolving Debt", "Monthly Debt Payment", "Loan Officer", "Lead Source"];
const rows = [headers]; const usedEmails = new Set();
for (let i = 0; i < 240; i++) {
  const f = pick(firsts), l = pick(lasts), [city, st] = pick(places);
  const type = pick(types);
  const year = Math.floor(between(2019, 2025.9)); const month = 1 + Math.floor(rnd() * 12);
  const rate = year >= 2023 ? between(6.5, 8.1) : year === 2022 ? between(4.8, 7.2) : between(2.6, 4.2);
  const orig = Math.round(between(140, 520)) * 1000;
  const n = 360, used = (2026 - year) * 12 + (9 - month), r = rate / 1200;
  const p = orig * r / (1 - Math.pow(1 + r, -n));
  const bal = orig * Math.pow(1 + r, used) - p * (Math.pow(1 + r, used) - 1) / r;
  const value = Math.round(orig * between(1.02, 1.55) / 1000) * 1000;
  const debt = rnd() < 0.55 ? Math.round(between(4, 58)) * 1000 : 0;
  let email = (f + "." + l).toLowerCase() + "@example.com"; if (usedEmails.has(email)) email = (f + "." + l + i).toLowerCase() + "@example.com"; usedEmails.add(email);
  rows.push([
    "L" + (10000 + i), i % 11 === 0 ? f.toUpperCase() : f, i % 11 === 0 ? l.toUpperCase() : l,
    i === 17 ? "" : i === 33 ? "not-an-email" : email,
    "(" + Math.floor(between(200, 989)) + ") 555-" + String(Math.floor(between(1000, 9999))),
    Math.floor(between(100, 9999)) + " " + pick(streets) + " " + pick(["St", "Ave", "Dr", "Ln", "Ct"]), city, st, String(Math.floor(between(10000, 99999))),
    type, rate.toFixed(3) + "%", "$" + Math.round(bal).toLocaleString("en-US"), "$" + p.toFixed(2), "$" + value.toLocaleString("en-US"),
    month + "/" + (1 + Math.floor(rnd() * 27)) + "/" + year, "360", String(Math.floor(between(610, 815))),
    debt ? "$" + debt.toLocaleString("en-US") : "", debt ? "$" + Math.round(debt * between(0.025, 0.035)) : "", pick(los), pick(sources),
  ]);
}
const cell = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
fs.writeFileSync(path.join(__dirname, "..", "samples", "sample-leads.csv"), rows.map(r => r.map(cell).join(",")).join("\r\n") + "\r\n");
console.log("wrote", rows.length - 1, "leads");
