function makeSeed() {
  const holidays = [
    { date: "2026-01-26", name: "Republic Day", internalCode: "HOL-001" },
    { date: "2026-08-15", name: "Independence Day", internalCode: "HOL-002" },
    { date: "2026-10-02", name: "Gandhi Jayanti", internalCode: "HOL-003" },
    { date: "2026-12-25", name: "Christmas", internalCode: "HOL-004" }
  ];
  return { holidays };
}

module.exports = { makeSeed };
