// LINQ Connect (ADM's food-service vendor) menu client.
//
// Shared by the browser and scripts/fetch-menus.mjs, so it touches no DOM. The API is public and
// sends `Access-Control-Allow-Origin: *`, which is what lets a static site read it directly.
// Its raw shape is deeply nested (session → plan → day → meal → category → recipe); `normalize`
// flattens it to the only question the site asks: what's for lunch on this date, at this school.

const API = 'https://api.linqconnect.com/api/FamilyMenu';

// Categories that repeat every day and add nothing to "what's for lunch".
const SKIP = [/^daily milk/i, /condiment/i];

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// "9/28/2026" → "2026-09-28"
function isoFromLinq(d) {
  const [m, day, y] = d.split('/').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// "2026-09-28" → "9-28-2026" (the format the API takes)
function linqFromIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}-${d}-${y}`;
}

// "Week 2 Monday - Hot Lunch Options" → "Hot Lunch"
function mealLabel(name) {
  const tail = clean(name).split(' - ').pop();
  return tail.replace(/\s*options?$/i, '').trim() || 'Lunch';
}

// "Reimbursable meals - (Includes Milk)" → "main"; others keep a short readable name.
function categoryLabel(name) {
  const n = clean(name);
  if (/reimbursable|entree|choose one/i.test(n)) return 'main';
  return n.replace(/\s*-.*$/, '');
}

/** Raw API payload → { "2026-09-28": { breakfast: [meal], lunch: [meal] } }.
 *  meal = { label, main: [..], sides: [{ label, items: [..] }] } */
export function normalize(raw) {
  const days = {};
  for (const session of raw?.FamilyMenuSessions || []) {
    const key = /breakfast/i.test(session.ServingSession) ? 'breakfast' : 'lunch';
    for (const plan of session.MenuPlans || []) {
      for (const day of plan.Days || []) {
        const iso = isoFromLinq(day.Date);
        const slot = (days[iso] ||= { breakfast: [], lunch: [] })[key];
        for (const meal of day.MenuMeals || []) {
          const out = { label: key === 'breakfast' ? 'Breakfast' : mealLabel(meal.MenuMealName), main: [], sides: [] };
          for (const cat of meal.RecipeCategories || []) {
            if (SKIP.some((re) => re.test(cat.CategoryName))) continue;
            const items = (cat.Recipes || []).map((r) => clean(r.RecipeName)).filter(Boolean);
            if (!items.length) continue;
            const label = categoryLabel(cat.CategoryName);
            if (label === 'main') out.main.push(...items);
            else out.sides.push({ label, items });
          }
          if (out.main.length || out.sides.length) slot.push(out);
        }
      }
    }
  }
  return days;
}

/** Fetch and normalize one building's menu for an inclusive ISO date range. */
export async function fetchMenu({ districtId, buildingId, start, end, headers = {} }) {
  const url = `${API}?buildingId=${buildingId}&districtId=${districtId}` +
    `&startDate=${linqFromIso(start)}&endDate=${linqFromIso(end)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`LINQ ${res.status}`);
  return normalize(await res.json());
}
