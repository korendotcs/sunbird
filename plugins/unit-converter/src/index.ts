// @description Automatically converts imperial & metric units (F/C, mi/km, lb/kg, ft/m) under messages
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const settings = phoenix.settings.define({
  system: {
    type: "select",
    title: "Preferred System",
    description: "Convert units into this system (Both converts either way)",
    options: [
      { label: "Both", value: "both" },
      { label: "Metric", value: "metric" },
      { label: "Imperial", value: "imperial" },
    ],
    default: "both",
  },
});

const UNIT_RE = /(-?\d+(?:\.\d+)?)\s*(°?f|°?c|miles?|mi|km|kilometers?|lbs?|pounds?|kg|kilograms?|ft|feet|cm)\b/gi;

phoenix.ui.addMessageAccessory({
  render(ctx) {
    const content = ctx.message?.content;
    if (!content) return null;
    const sys = settings.system || "both";
    const results: string[] = [];
    let m: RegExpExecArray | null;
    UNIT_RE.lastIndex = 0;
    while ((m = UNIT_RE.exec(content)) !== null && results.length < 3) {
      const val = parseFloat(m[1]);
      if (Number.isNaN(val)) continue;
      const u = m[2].toLowerCase().replace("°", "");
      if (u === "f" && sys !== "imperial") {
        results.push(`${val}°F = ${(((val - 32) * 5) / 9).toFixed(1)}°C`);
      } else if (u === "c" && sys !== "metric") {
        results.push(`${val}°C = ${((val * 9) / 5 + 32).toFixed(1)}°F`);
      } else if ((u === "mi" || u.startsWith("mile")) && sys !== "imperial") {
        results.push(`${val} mi = ${(val * 1.60934).toFixed(2)} km`);
      } else if ((u === "km" || u.startsWith("kilometer")) && sys !== "metric") {
        results.push(`${val} km = ${(val / 1.60934).toFixed(2)} mi`);
      } else if ((u.startsWith("lb") || u.startsWith("pound")) && sys !== "imperial") {
        results.push(`${val} lb = ${(val * 0.453592).toFixed(2)} kg`);
      } else if ((u === "kg" || u.startsWith("kilogram")) && sys !== "metric") {
        results.push(`${val} kg = ${(val / 0.453592).toFixed(2)} lb`);
      } else if ((u === "ft" || u === "feet") && sys !== "imperial") {
        results.push(`${val} ft = ${(val * 0.3048).toFixed(2)} m`);
      } else if (u === "cm" && sys !== "metric") {
        results.push(`${val} cm = ${(val / 2.54).toFixed(1)} in`);
      }
    }
    if (!results.length) return null;
    return { text: results.join(" · "), color: 0xffa3be8c };
  },
});
