const { useState, useEffect, useMemo, useRef } = React;

// ====== 1) COLLE TES INFOS SUPABASE ICI (Settings > API dans ton projet) ======
const SUPABASE_URL = "https://tezdewwkdzbpjeybzggg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_MXPoSntRqagjLA_DiMN58Q_eZZUAHC2";
// ================================================================================
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: window.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

const LOCAL_CACHE_KEY = "mon-budget-cache-v1";
const APP_MODE_KEY = "mon-budget-app-mode";

// ---- Design tokens ----
const BG = "#FBF3F2";
const SURFACE = "#FFFFFF";
const SURFACE_ALT = "#FCE9ED";
const BORDER = "#EAD7DA";
const TEXT = "#3B2E30";
const TEXT_MUTED = "#7A686B";
const ROSE = "#C85678";
const ROSE_PALE = "#E39FB3";
const SAGE = "#588A67";
const GOLD = "#B98A2E";
const DANGER = "#C1573D";
const ROSE_DEEP = "#9E3B5C";
const SHADOW = "0 1px 2px rgba(59,46,48,0.04), 0 8px 24px -12px rgba(158,59,92,0.18)";
const NUM = { fontFamily: "'Inter', sans-serif", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" };
const NAV_STYLE = { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, backgroundColor: "rgba(255,255,255,0.82)", backdropFilter: "saturate(180%) blur(16px)", WebkitBackdropFilter: "saturate(180%) blur(16px)", borderTop: `1px solid ${BORDER}`, paddingBottom: "env(safe-area-inset-bottom)" };

const CATEGORIES = [
  { id: "loyer", label: "Loyer", icon: "house", color: GOLD },
  { id: "abonnements", label: "Abonnements", icon: "rotate-right", color: SAGE },
  { id: "courses", label: "Courses", icon: "cart-shopping", color: "#CE7A52" },
  { id: "shopping", label: "Shopping", icon: "bag-shopping", color: "#9868A8" },
  { id: "transport", label: "Transport", icon: "car", color: "#4E7FAE" },
  { id: "assurance", label: "Assurance", icon: "shield-heart", color: "#3F8F8F" },
  { id: "telephone", label: "Téléphone / SIM", icon: "phone", color: ROSE },
  { id: "sante", label: "Santé", icon: "heart-pulse", color: "#D18242" },
  { id: "plaisir", label: "Loisirs & plaisir", icon: "champagne-glasses", color: ROSE_PALE },
  { id: "autres", label: "Autres", icon: "folder-open", color: "#9C8A8D" },
];
const INCOME_TYPES = [
  { id: "salaire", label: "Salaire", icon: "briefcase" },
  { id: "bourse", label: "Bourse", icon: "graduation-cap" },
  { id: "aide_familiale", label: "Aide familiale", icon: "house-chimney" },
  { id: "projet", label: "Revenu d’un projet", icon: "rocket" },
  { id: "occasionnel", label: "Revenu occasionnel", icon: "star" },
];
const catInfo = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(n) || 0);
const Icon = ({ name, className = "", style = {}, size = 14 }) => (
  <i className={`fa-solid fa-${name} ${className}`.trim()} style={{ fontSize: size, lineHeight: 1, ...style }} aria-hidden="true" />
);

function getIncomeSources(data) {
  const stored = Array.isArray(data?.incomeSources) ? data.incomeSources : [];
  if (stored.length > 0) {
    return stored
      .filter((source) => source && (Number(source.amount || 0) > 0 || String(source.label || "").trim()))
      .map((source) => ({ ...source, amount: Number(source.amount || 0) }));
  }
  const fallbackIncome = Number(data?.income || 0);
  if (fallbackIncome > 0) {
    return [{ id: uid(), type: "salaire", label: "Revenu mensuel", amount: fallbackIncome }];
  }
  return [];
}

function getMonthlyIncome(data) {
  const sources = getIncomeSources(data);
  if (sources.length > 0) {
    return sources.reduce((sum, source) => sum + Number(source.amount || 0), 0);
  }
  return Number(data?.income || 0);
}

function getPlannedSavings(data) {
  const goals = Array.isArray(data?.goals) ? data.goals : [];
  return goals.reduce((sum, goal) => {
    if (!goal?.deadline || !goal?.target || Number(goal.target) <= 0) return sum;
    const months = monthsUntil(goal.deadline);
    if (!months || months <= 0) return sum;
    const remaining = Math.max(0, Number(goal.target || 0) - Number(goal.current || 0));
    return sum + remaining / months;
  }, 0);
}

function getNextMajorExpense(data) {
  const charges = Array.isArray(data?.charges) ? data.charges : [];
  if (charges.length > 0) {
    const sorted = [...charges].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    return sorted[0] ? { ...sorted[0], kind: "charge" } : null;
  }
  const monthExpenses = (Array.isArray(data?.expenses) ? data.expenses : []).filter((expense) => inCurrentMonth(expense.date));
  if (monthExpenses.length > 0) {
    const sorted = [...monthExpenses].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    return sorted[0] ? { ...sorted[0], kind: "expense" } : null;
  }
  return null;
}

function getDailyBudget(remaining) {
  const today = new Date();
  const daysLeft = Math.max(1, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1);
  return remaining / daysLeft;
}

function getPersonalAdvice({ profile, remaining, monthlyIncome, plannedSavings, nextMajorExpense }) {
  const name = profile?.name?.trim() || "toi";
  if (remaining < 0) {
    return `${name}, ton budget du mois est déjà tendu. Priorise les charges fixes et reporte les achats non essentiels.`;
  }
  if (remaining < monthlyIncome * 0.2) {
    return `${name}, tu as peu de marge aujourd'hui. Un petit check rapide sur les dépenses variables peut te sauver d'une surprise.`;
  }
  if (plannedSavings > 0 && remaining >= plannedSavings) {
    return `${name}, tu as encore de la marge pour renforcer ton épargne sans casser ton équilibre du mois.`;
  }
  if (nextMajorExpense) {
    return `${name}, la prochaine grosse sortie est ${nextMajorExpense.name || catInfo(nextMajorExpense.category)?.label || "une dépense importante"}. Prévois-la dès maintenant.`;
  }
  return `${name}, un budget clair commence par une petite décision aujourd'hui : consigne une dépense, puis laisse l'app te guider.`;
}

function getFinancialProfile({ remaining, monthlyIncome, plannedSavings }) {
  if (remaining < 0) return { label: "Dépensière impulsive", note: "Le rythme actuel demande plus de vigilance." };
  if (plannedSavings > 0 && monthlyIncome > 0 && plannedSavings >= monthlyIncome * 0.15) {
    return { label: "Économe", note: "Tu mets déjà de la marge de côté avec méthode." };
  }
  if (remaining > 0 && remaining < monthlyIncome * 0.25) {
    return { label: "Irrégulière", note: "Ton suivi reste un peu instable, mais tu peux le stabiliser." };
  }
  return { label: "Prudente", note: "Tu gardes un bon équilibre entre besoins et plaisir." };
}

function getWeeklySummary(data) {
  const expenses = Array.isArray(data?.expenses) ? data.expenses : [];
  const currentWeekStart = startOfWeek();
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  const currentWeek = expenses.filter((expense) => inRange(expense.date, currentWeekStart));
  const previousWeek = expenses.filter((expense) => {
    const day = parseDay(expense.date);
    return day >= previousWeekStart && day < currentWeekStart;
  });

  const sumByCategory = (list) => {
    const map = {};
    list.forEach((expense) => {
      map[expense.category] = (map[expense.category] || 0) + Number(expense.amount || 0);
    });
    return map;
  };

  const currentMap = sumByCategory(currentWeek);
  const previousMap = sumByCategory(previousWeek);
  let best = null;
  Object.keys(currentMap).forEach((category) => {
    const previousValue = Number(previousMap[category] || 0);
    const currentValue = Number(currentMap[category] || 0);
    const diff = previousValue - currentValue;
    if (diff > 20 && (!best || diff > best.diff)) {
      best = { category, diff, label: catInfo(category).label };
    }
  });
  if (best) {
    return `Tu as dépensé moins en ${best.label.toLowerCase()} cette semaine.`;
  }
  return "Tu as tenu un rythme plus stable cette semaine.";
}

const DEFAULT_DATA = { onboarded: false, profile: null, income: 0, incomeSources: [], budgetSplit: { needs: 50, pleasures: 30, savings: 20 }, charges: [], expenses: [], goals: [], history: [], months: {}, categoryLimits: {}, badges: {}, pantry: { items: [], trips: [], usage: [] }, forecast: null };

const TIPS = [
  "Automatise un virement vers ton épargne le jour où tu es payée : ce que tu ne vois pas, tu ne le dépenses pas.",
  "Passe en revue tes charges fixes une fois par mois — un abonnement oublié coûte cher sur une année.",
  "Avant un achat plaisir, attends 24h. Si l'envie est toujours là, fais-toi plaisir sans culpabiliser.",
  "Garde une petite enveloppe « loisirs & plaisir » chaque mois : un budget trop strict craque plus vite.",
  "Compare le coût réel d'un déménagement (caution, assurance, premier loyer) pour éviter les surprises.",
  "Note chaque dépense variable le jour même : c'est le geste qui a le plus d'impact sur la maîtrise du budget.",
  "Un objectif chiffré avec une date te dit exactement combien mettre de côté chaque mois.",
  "Compare les offres télécom/SIM avant un départ à l'étranger — les forfaits varient beaucoup d'un pays à l'autre.",
];
const REFLECTIONS = [
  "Qu'est-ce qui t'a fait le plus plaisir cette semaine dans tes dépenses ?",
  "Une de tes charges fixes a-t-elle changé récemment et mérite une mise à jour ?",
  "Ton objectif d'épargne actuel te semble-t-il toujours réaliste ?",
  "As-tu dépensé par habitude cette semaine, ou par envie réelle ?",
  "Qu'est-ce que tu pourrais mettre de côté avant même de le voir sur ton compte ?",
];
const MOTIVATIONS = [
  { id: "projet", label: "Réaliser un projet précis", icon: "bullseye" },
  { id: "gaspillage", label: "Apprendre à ne pas gaspiller", icon: "lightbulb" },
  { id: "epargne", label: "Voir clair dans mon épargne", icon: "piggy-bank" },
  { id: "organisation", label: "Mieux organiser mon quotidien", icon: "clipboard-list" },
];
const PROJECT_TYPES = [
  { id: "logement", label: "Logement / installation" },
  { id: "voiture", label: "Voiture" },
  { id: "voyage", label: "Voyage" },
  { id: "etudes", label: "Études / formation" },
  { id: "autre", label: "Autre projet" },
];
const RELATIONSHIPS = [
  { id: "optimiser", label: "Je gère déjà bien, je veux optimiser" },
  { id: "sans_suivre", label: "Je dépense sans trop suivre" },
  { id: "stress", label: "Ça me stresse dès que j'y pense" },
  { id: "debute", label: "Je débute dans la gestion de mon budget" },
];
const FREQUENCIES = [
  { id: "jour", label: "Tous les jours" },
  { id: "semaine", label: "Une fois par semaine" },
  { id: "mois", label: "Une fois par mois" },
  { id: "sais_pas", label: "Je ne sais pas encore" },
];

function pickByDay(list) { return list[new Date().getDate() % list.length]; }
function startOfWeek(d = new Date()) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}
function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfNextMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); }
// "YYYY-MM-DD" → date locale à minuit (new Date("YYYY-MM-DD") est interprété en UTC)
function parseDay(dateStr) {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateStr);
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inRange(dateStr, from, to) {
  const day = parseDay(dateStr);
  if (!day || isNaN(day)) return false;
  return day >= from && (!to || day < to);
}
function inCurrentMonth(dateStr) { return inRange(dateStr, startOfMonth(), startOfNextMonth()); }
function dayHeading(dateStr) {
  const day = parseDay(dateStr);
  if (!day || isNaN(day)) return "Sans date";
  const today = parseDay(todayISO());
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  return day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function daysLeftInMonth() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1;
}
function goalPct(goal) {
  const target = Number(goal?.target || 0);
  return target > 0 ? Math.min(100, (Number(goal.current || 0) / target) * 100) : 0;
}
function savedFromIncomeThisMonth(data) {
  const goals = Array.isArray(data?.goals) ? data.goals : [];
  const from = startOfMonth();
  return goals.reduce((sum, goal) => sum + (Array.isArray(goal.trace) ? goal.trace : [])
    .filter((t) => t.direction === "decrease" && t.createdAt && new Date(t.createdAt) >= from)
    .reduce((s, t) => s + Number(t.amount || 0), 0), 0);
}

/* ---------- Historique mois par mois ---------- */

function monthKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function monthLabelShort(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
}
function monthLabelLong(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
function totalChargesOf(data) { return (data?.charges || []).reduce((s, c) => s + Number(c.amount || 0), 0); }
// Mémorise revenu + charges du mois en cours : chaque mois garde ses propres chiffres.
// Les revenus du tableau de bord sont ceux du mois en cours ; un nouveau mois repart des derniers revenus saisis.
function withMonthSnapshot(data) {
  const key = monthKey();
  const sources = getIncomeSources(data);
  const snapshot = { ...(data.months?.[key] || {}), income: getMonthlyIncome(data), incomeSources: sources, charges: totalChargesOf(data) };
  const prev = data.months?.[key];
  if (prev && prev.income === snapshot.income && prev.charges === snapshot.charges && JSON.stringify(prev.incomeSources || []) === JSON.stringify(sources)) return data;
  return { ...data, months: { ...(data.months || {}), [key]: snapshot } };
}
// Revenus d'un mois donné (null = pas encore renseignés pour ce mois passé).
function getMonthIncomeSources(data, key) {
  if (key === monthKey()) return getIncomeSources(data);
  const snap = data?.months?.[key];
  if (Array.isArray(snap?.incomeSources)) return snap.incomeSources;
  if (snap && Number(snap.income) > 0) return [{ id: uid(), type: "salaire", label: "Revenu", amount: Number(snap.income) }];
  return null;
}
function getMonthHistory(data, count = 6) {
  const expenses = Array.isArray(data?.expenses) ? data.expenses : [];
  const variableByMonth = {};
  expenses.forEach((e) => {
    const day = parseDay(e.date);
    if (!day || isNaN(day)) return;
    const key = monthKey(day);
    variableByMonth[key] = (variableByMonth[key] || 0) + Number(e.amount || 0);
  });
  const savedByMonth = {};
  (data?.goals || []).forEach((g) => (g.trace || []).forEach((t) => {
    if (t.direction !== "decrease" || !t.createdAt) return;
    const key = monthKey(new Date(t.createdAt));
    savedByMonth[key] = (savedByMonth[key] || 0) + Number(t.amount || 0);
  }));
  const now = new Date();
  // On remonte jusqu'au tout premier mois connu : le report se cumule de mois en mois, même au-delà de `count`.
  const firstKey = [...Object.keys(data?.months || {}), ...Object.keys(variableByMonth)].sort()[0];
  const [firstYear, firstMonth] = firstKey ? firstKey.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const span = Math.max(count, (now.getFullYear() - firstYear) * 12 + now.getMonth() - (firstMonth - 1) + 1);
  const result = [];
  let carry = 0;
  for (let i = span - 1; i >= 0; i -= 1) {
    const key = monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1));
    const snap = data?.months?.[key];
    const variable = variableByMonth[key] || 0;
    if (!snap && !variable && i > 0) continue;
    // Un mois passé sans revenu enregistré n'emprunte pas celui du mois en cours : il reste « à renseigner ».
    const income = i === 0 ? getMonthlyIncome(data) : snap && snap.income != null ? Number(snap.income) : null;
    const charges = snap && snap.charges != null ? snap.charges : totalChargesOf(data);
    const saved = savedByMonth[key] || 0;
    const carryAuto = carry;
    const carryIn = snap?.carryOverride != null ? Number(snap.carryOverride) : carryAuto;
    const balance = income === null ? null : Math.round((carryIn + income - charges - variable - saved) * 100) / 100;
    // Seul l'argent restant passe au mois suivant : un mois dans le rouge ne crée pas de dette reportée.
    carry = balance === null ? carryIn : Math.max(0, balance);
    if (i < count) result.push({ key, label: monthLabelShort(key), income, charges, variable, saved, total: charges + variable, carryIn, carryAuto, balance, estimated: !snap || snap.charges == null, incomeMissing: income === null, current: i === 0 });
  }
  return result;
}
// Argent restant des mois précédents, disponible sur le mois en cours.
function getCarryOver(data) {
  const history = getMonthHistory(data, 1);
  const current = history[history.length - 1];
  const now = new Date();
  return { amount: current.carryIn, auto: current.carryAuto, overridden: data?.months?.[monthKey()]?.carryOverride != null, fromLabel: monthLabelLong(monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))).split(" ")[0] };
}

/* ---------- Plafonds par catégorie ---------- */

function getCategoryUsage(data) {
  const limits = data?.categoryLimits || {};
  const spentByCat = {};
  (data?.expenses || []).filter((e) => inCurrentMonth(e.date)).forEach((e) => {
    spentByCat[e.category] = (spentByCat[e.category] || 0) + Number(e.amount || 0);
  });
  return CATEGORIES.filter((c) => Number(limits[c.id]) > 0).map((c) => {
    const limit = Number(limits[c.id]);
    const spent = spentByCat[c.id] || 0;
    const ratio = spent / limit;
    return { ...c, limit, spent, ratio, status: ratio >= 1 ? "over" : ratio >= 0.8 ? "warning" : "ok" };
  });
}

/* ---------- Badges ---------- */

function activeDays(data) {
  return [...new Set((data?.expenses || []).map((e) => e.date).filter(Boolean))].sort();
}
function getStreaks(data) {
  const days = activeDays(data).map((d) => parseDay(d).getTime());
  const set = new Set(days);
  const DAY = 86400000;
  let best = 0, run = 0, prev = null;
  days.forEach((t) => { run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t; });
  const today = parseDay(todayISO()).getTime();
  // La série reste active si la dernière dépense date d'aujourd'hui ou d'hier.
  let cursor = set.has(today) ? today : set.has(today - DAY) ? today - DAY : null;
  let current = 0;
  while (cursor !== null && set.has(cursor)) { current += 1; cursor -= DAY; }
  return { current, best };
}
function greenMonths(data) {
  const current = monthKey();
  return getMonthHistory(data, 24).filter((m) => m.key !== current && !m.estimated && !m.incomeMissing && m.income > 0 && m.total + m.saved <= m.income).length;
}

const BADGES = [
  { id: "first_expense", label: "Premier pas", desc: "Noter ta première dépense", icon: "shoe-prints", color: ROSE, goal: 1, value: (d) => (d.expenses || []).length },
  { id: "charges_set", label: "Bien organisée", desc: "Renseigner 3 charges fixes", icon: "receipt", color: GOLD, goal: 3, value: (d) => (d.charges || []).length },
  { id: "streak_3", label: "Sur ta lancée", desc: "3 jours de suite avec une dépense notée", icon: "fire", color: "#CE7A52", goal: 3, value: (d) => getStreaks(d).best },
  { id: "streak_7", label: "Semaine parfaite", desc: "7 jours de suite avec une dépense notée", icon: "fire-flame-curved", color: DANGER, goal: 7, value: (d) => getStreaks(d).best },
  { id: "days_15", label: "Régulière", desc: "Suivre ton budget sur 15 jours différents", icon: "calendar-check", color: "#4E7FAE", goal: 15, value: (d) => activeDays(d).length },
  { id: "days_50", label: "Assidue", desc: "Suivre ton budget sur 50 jours différents", icon: "medal", color: "#9868A8", goal: 50, value: (d) => activeDays(d).length },
  { id: "first_save", label: "Graine d'épargne", desc: "Faire un premier versement sur un objectif", icon: "seedling", color: SAGE, goal: 1, value: (d) => ((d.goals || []).some((g) => Number(g.current) > 0) ? 1 : 0) },
  { id: "saved_1000", label: "Cap des 1 000 €", desc: "Cumuler 1 000 € sur tes objectifs", icon: "gem", color: "#3F8F8F", goal: 1000, value: (d) => (d.goals || []).reduce((s, g) => s + Number(g.current || 0), 0), money: true },
  { id: "goal_done", label: "Mission accomplie", desc: "Atteindre 100 % d'un objectif", icon: "trophy", color: GOLD, goal: 1, value: (d) => (d.goals || []).filter((g) => goalPct(g) >= 100).length },
  { id: "limits_set", label: "Garde-fous", desc: "Fixer un plafond sur 2 catégories", icon: "shield-halved", color: "#4E7FAE", goal: 2, value: (d) => Object.values(d.categoryLimits || {}).filter((v) => Number(v) > 0).length },
  { id: "green_month", label: "Mois dans le vert", desc: "Terminer un mois sans dépasser ton revenu", icon: "leaf", color: SAGE, goal: 1, value: (d) => greenMonths(d) },
  { id: "green_3", label: "Maîtrise totale", desc: "Terminer 3 mois dans le vert", icon: "crown", color: GOLD, goal: 3, value: (d) => greenMonths(d) },
];

function getBadgeStates(data) {
  const unlockedAt = data?.badges || {};
  return BADGES.map((b) => {
    const value = Math.max(0, Number(b.value(data)) || 0);
    const unlocked = Boolean(unlockedAt[b.id]) || value >= b.goal;
    return { ...b, current: Math.min(value, b.goal), progress: Math.min(1, value / b.goal), unlocked, unlockedAt: unlockedAt[b.id] || null };
  });
}
// Ajoute les badges nouvellement débloqués à data.badges (un badge obtenu le reste).
function withBadges(data) {
  const fresh = getBadgeStates(data).filter((b) => b.unlocked && !data.badges?.[b.id]);
  if (fresh.length === 0) return { data, fresh };
  const stamp = new Date().toISOString();
  const badges = { ...(data.badges || {}) };
  fresh.forEach((b) => { badges[b.id] = stamp; });
  return { data: { ...data, badges }, fresh };
}

function monthsUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  let months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  if (target.getDate() < now.getDate()) months -= 1;
  return Math.max(1, months);
}
function objectiveLabel(profile) {
  if (!profile) return null;
  const motivations = Array.isArray(profile.motivation) ? profile.motivation : profile.motivation ? [profile.motivation] : [];
  const projectTypes = Array.isArray(profile.projectType) ? profile.projectType : profile.projectType ? [profile.projectType] : [];
  const motivationLabels = motivations.map((id) => MOTIVATIONS.find((x) => x.id === id)?.label).filter(Boolean);
  const projectLabels = projectTypes.map((id) => PROJECT_TYPES.find((p) => p.id === id)?.label).filter(Boolean);

  if (motivations.includes("projet")) {
    if (projectLabels.length) {
      return `Construire un budget autour de tes projets : ${projectLabels.join(" · ")}`;
    }
    return "Construire un budget autour de tes projets";
  }

  if (motivationLabels.length > 1) {
    return `Construire un budget autour de : ${motivationLabels.join(" · ")}`;
  }

  return motivationLabels[0] || "Construire un budget qui te ressemble";
}
function objectiveEmoji(profile) {
  const motivations = Array.isArray(profile?.motivation) ? profile.motivation : profile?.motivation ? [profile.motivation] : [];
  const first = motivations[0];
  const m = MOTIVATIONS.find((x) => x.id === first);
  return m ? <Icon name={m.icon} size={15} /> : <Icon name="compass" size={15} />;
}

function confirmDeleteAction(label) {
  return window.confirm(`Supprimer ${label} ?`);
}

function getIncomeImpactFromSource(source) {
  const normalized = String(source || "").toLowerCase();
  if (!normalized) return "none";
  const incomeKeywords = ["salaire", "revenu", "paie", "allocation", "prime", "loyer", "activité", "job", "travail", "rémunération"];
  const giftKeywords = ["don", "cadeau", "gain", "reçu", "aide", "subvention", "héritage"];
  if (giftKeywords.some((kw) => normalized.includes(kw))) return "none";
  if (incomeKeywords.some((kw) => normalized.includes(kw))) return "decrease";
  return "none";
}

function loadCache() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (raw) return { ...DEFAULT_DATA, ...JSON.parse(raw) };
  } catch (e) { }
  return null;
}
function saveCache(data) {
  try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(data)); } catch (e) { }
}

/* ---------- Rapports (PDF / Excel) ---------- */

const NEEDS_CATS = ["loyer", "abonnements", "courses", "transport", "assurance", "telephone", "sante", "autres"];
const PLEASURE_CATS = ["shopping", "plaisir"];

function buildReportContext(data) {
  const monthlyIncome = getMonthlyIncome(data);
  const totalCharges = totalChargesOf(data);
  const monthExpenses = (data.expenses || []).filter((e) => inCurrentMonth(e.date)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const variableMonthTotal = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const savedThisMonth = savedFromIncomeThisMonth(data);
  const plannedSavings = getPlannedSavings(data);
  const byCategory = {};
  (data.charges || []).forEach((c) => (byCategory[c.category] = (byCategory[c.category] || 0) + Number(c.amount || 0)));
  monthExpenses.forEach((e) => (byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount || 0)));
  const categories = CATEGORIES.map((c) => ({ ...c, amount: byCategory[c.id] || 0 })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const sumCats = (ids) => ids.reduce((s, id) => s + (byCategory[id] || 0), 0);
  const split = data.budgetSplit || DEFAULT_DATA.budgetSplit;
  const base = monthlyIncome > 0 ? monthlyIncome : 0;
  const pctOf = (v) => (base > 0 ? (v / base) * 100 : 0);
  const savingsAmount = Math.max(plannedSavings, savedThisMonth);
  const balance = [
    { label: "Besoins", amount: sumCats(NEEDS_CATS), color: ROSE, target: split.needs },
    { label: "Plaisirs", amount: sumCats(PLEASURE_CATS), color: GOLD, target: split.pleasures },
    { label: "Épargne", amount: savingsAmount, color: SAGE, target: split.savings },
  ].map((b) => ({ ...b, pct: pctOf(b.amount) }));
  const carryOver = getCarryOver(data).amount;
  const available = monthlyIncome + carryOver;
  const remaining = available - totalCharges - variableMonthTotal - savedThisMonth;
  return {
    data,
    name: data.profile?.name?.trim() || "",
    monthLabel: monthLabelLong(monthKey()),
    generatedAt: new Date().toLocaleDateString("fr-FR"),
    monthlyIncome, carryOver, available, totalCharges, variableMonthTotal, savedThisMonth, plannedSavings, remaining,
    engagedPct: available > 0 ? ((totalCharges + variableMonthTotal + savedThisMonth) / available) * 100 : 0,
    incomeSources: getIncomeSources(data),
    charges: [...(data.charges || [])].sort((a, b) => Number(b.amount) - Number(a.amount)),
    monthExpenses, categories, balance,
    history: getMonthHistory(data, 6),
    usage: getCategoryUsage(data),
    badges: getBadgeStates(data),
    goals: data.goals || [],
  };
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const formatDateFR = (iso) => { const d = parseDay(iso); return d && !isNaN(d) ? d.toLocaleDateString("fr-FR") : ""; };

function buildPdfReport(JsPDF, ctx) {
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 16, CW = W - 2 * M;
  const C = {
    ink: hexToRgb(TEXT), muted: hexToRgb(TEXT_MUTED), rose: hexToRgb(ROSE), deep: hexToRgb(ROSE_DEEP), pale: hexToRgb(SURFACE_ALT),
    bg: hexToRgb(BG), line: hexToRgb(BORDER), sage: hexToRgb(SAGE), gold: hexToRgb(GOLD), danger: hexToRgb(DANGER), white: [255, 255, 255],
  };
  // Les polices standard de jsPDF ne connaissent pas les espaces fines ni le signe moins typographique.
  const t = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/−/g, "-").replace(/≈/g, "env.");
  const eur = (n) => { const v = Number(n) || 0; return `${t(new Intl.NumberFormat("fr-FR", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(v))} €`; };
  const pctLabel = (p) => (p > 0 && p < 1 ? "< 1 %" : `${Math.round(p)} %`);
  const fill = (c) => doc.setFillColor(...c);
  const ink = (c) => doc.setTextColor(...c);
  const stroke = (c) => doc.setDrawColor(...c);
  const font = (style = "normal", size = 10, family = "helvetica") => { doc.setFont(family, style); doc.setFontSize(size); };
  let y = 0;
  const ensure = (h) => { if (y + h > H - 22) { doc.addPage(); y = 22; } };

  const section = (title, subtitle, need = 12) => {
    ensure(26 + need);
    y += 4;
    font("bold", 14, "times"); ink(C.ink); doc.text(t(title), M, y);
    fill(C.rose); doc.rect(M, y + 2.2, 12, 0.8, "F");
    y += 7;
    if (subtitle) { font("normal", 8.5); ink(C.muted); doc.text(t(subtitle), M, y); y += 5; }
    y += 2;
  };

  const table = (headers, rows, widths, { align = [], totalRow = null } = {}) => {
    const rowH = 7;
    const header = () => {
      fill(C.deep); doc.roundedRect(M, y, CW, rowH, 1.5, 1.5, "F");
      font("bold", 7.5); ink(C.white);
      let x = M;
      headers.forEach((h, i) => { const right = align[i] === "right"; doc.text(t(h).toUpperCase(), right ? x + widths[i] - 3 : x + 3, y + 4.7, { align: right ? "right" : "left" }); x += widths[i]; });
      y += rowH;
    };
    ensure(rowH * 2); header();
    const all = totalRow ? [...rows, totalRow] : rows;
    all.forEach((row, ri) => {
      if (y + rowH > H - 22) { doc.addPage(); y = 22; header(); }
      const isTotal = totalRow && ri === all.length - 1;
      if (isTotal) { fill(C.pale); doc.rect(M, y, CW, rowH, "F"); stroke(C.rose); doc.setLineWidth(0.3); doc.line(M, y, M + CW, y); }
      else if (ri % 2 === 1) { fill(C.bg); doc.rect(M, y, CW, rowH, "F"); }
      font(isTotal ? "bold" : "normal", 8.5); ink(C.ink);
      let x = M;
      row.forEach((cell, i) => {
        const right = align[i] === "right";
        const value = typeof cell === "object" && cell !== null ? cell : { text: cell };
        if (value.color) ink(value.color); else ink(C.ink);
        const str = doc.splitTextToSize(t(value.text ?? "-"), widths[i] - 6)[0] || "";
        doc.text(str, right ? x + widths[i] - 3 : x + 3, y + 4.7, { align: right ? "right" : "left" });
        x += widths[i];
      });
      y += rowH;
    });
    y += 6;
  };

  const progress = (x, py, w, h, ratio, color, track = C.line) => {
    fill(track); doc.roundedRect(x, py, w, h, h / 2, h / 2, "F");
    const fw = Math.max(0, Math.min(1, ratio)) * w;
    if (fw > 0.5) { fill(color); doc.roundedRect(x, py, Math.max(fw, h), h, h / 2, h / 2, "F"); }
  };

  /* --- En-tête --- */
  fill(C.rose); doc.rect(0, 0, W, 64, "F");
  fill([212, 116, 145]); doc.circle(W - 18, 6, 38, "F");
  ink(C.white);
  font("bolditalic", 32, "times"); doc.text("Mon Budget", M, 30);
  font("normal", 11); doc.text(t(`Rapport financier · ${ctx.monthLabel}`), M, 40);
  font("normal", 8.5); doc.text(t(`${ctx.name ? `Préparé pour ${ctx.name} · ` : ""}généré le ${ctx.generatedAt}`), M, 47);
  font("bold", 7.5); doc.text("RESTE À VIVRE CE MOIS", W - M, 24, { align: "right" });
  font("bold", 24); doc.text(eur(ctx.remaining), W - M, 35, { align: "right" });
  font("normal", 8.5); doc.text(t(ctx.available > 0 ? `${Math.round(ctx.engagedPct)} % du budget engagé` : "Revenu à renseigner"), W - M, 42, { align: "right" });
  y = 76;

  /* --- Indicateurs --- */
  const kpis = [
    { label: "Revenus", value: ctx.monthlyIncome, color: C.rose },
    { label: "Charges fixes", value: ctx.totalCharges, color: C.gold },
    { label: "Dépenses variables", value: ctx.variableMonthTotal, color: hexToRgb("#4E7FAE") },
    { label: "Épargne versée", value: ctx.savedThisMonth, color: C.sage },
  ];
  const gap = 4, cardW = (CW - gap * 3) / 4;
  kpis.forEach((k, i) => {
    const x = M + i * (cardW + gap);
    fill(C.white); stroke(C.line); doc.setLineWidth(0.3); doc.roundedRect(x, y, cardW, 25, 2.5, 2.5, "FD");
    fill(k.color); doc.roundedRect(x + 4, y + 4, 8, 1.2, 0.6, 0.6, "F");
    font("normal", 7); ink(C.muted); doc.text(t(k.label).toUpperCase(), x + 4, y + 11);
    font("bold", 12.5); ink(C.ink); doc.text(eur(k.value), x + 4, y + 19.5);
  });
  y += 33;
  if (ctx.available > 0) {
    progress(M, y, CW, 2.6, ctx.engagedPct / 100, ctx.engagedPct > 100 ? C.danger : C.rose);
    font("normal", 8); ink(C.muted);
    doc.text(t(`${eur(ctx.totalCharges + ctx.variableMonthTotal + ctx.savedThisMonth)} engagés sur ${eur(ctx.available)}${ctx.carryOver > 0 ? ` (dont ${eur(ctx.carryOver)} reportés)` : ""}`), M, y + 7);
    doc.text(t(`${Math.round(ctx.engagedPct)} %`), W - M, y + 7, { align: "right" });
    y += 12;
  }

  /* --- Équilibre 50/30/20 --- */
  section("Équilibre du mois", ctx.monthlyIncome > 0 ? "Part de ton revenu par poste, comparée à ta règle de répartition (le trait marque la cible)." : "Renseigne ton revenu pour comparer à la règle 50/30/20.");
  ctx.balance.forEach((b) => {
    ensure(10);
    const barX = M + 30, barW = CW - 30 - 52;
    font("normal", 9.5); ink(C.ink); doc.text(t(b.label), M, y + 3);
    progress(barX, y, barW, 3.6, b.pct / 100, hexToRgb(b.color));
    if (ctx.monthlyIncome > 0) { stroke(C.ink); doc.setLineWidth(0.5); const tx = barX + (b.target / 100) * barW; doc.line(tx, y - 1.2, tx, y + 4.8); }
    const over = ctx.monthlyIncome > 0 && b.label !== "Épargne" && b.pct > b.target;
    font("bold", 9); ink(over ? C.danger : C.ink); doc.text(t(`${Math.round(b.pct)} %`), W - M - 30, y + 3, { align: "right" });
    font("normal", 8); ink(C.muted); doc.text(t(`cible ${b.target} %`), W - M, y + 3, { align: "right" });
    y += 9;
  });

  /* --- Catégories --- */
  section("Dépenses du mois par catégorie", "Charges fixes et dépenses variables réunies.");
  if (ctx.categories.length === 0) { font("italic", 9); ink(C.muted); doc.text("Aucune dépense ce mois-ci.", M, y + 3); y += 9; }
  const totalCat = ctx.categories.reduce((s, c) => s + c.amount, 0) || 1;
  const maxCat = Math.max(1, ...ctx.categories.map((c) => c.amount));
  ctx.categories.forEach((c) => {
    ensure(9);
    const color = hexToRgb(c.color);
    fill(color); doc.circle(M + 1.6, y + 1.9, 1.6, "F");
    font("normal", 9.5); ink(C.ink); doc.text(t(c.label), M + 6, y + 3);
    progress(M + 46, y + 0.4, CW - 46 - 50, 3.2, c.amount / maxCat, color, C.bg);
    font("bold", 9); doc.text(eur(c.amount), W - M - 16, y + 3, { align: "right" });
    font("normal", 8); ink(C.muted); doc.text(pctLabel((c.amount / totalCat) * 100), W - M, y + 3, { align: "right" });
    y += 8;
  });

  /* --- Mois par mois --- */
  if (ctx.history.length > 0) {
    section("Mois par mois", "Total dépensé chaque mois (charges, dépenses et épargne versée). Le trait foncé indique le revenu.", 58);
    ensure(62);
    const chartH = 40, top = y, baseY = top + chartH;
    const maxH = Math.max(1, ...ctx.history.map((m) => Math.max(m.total + m.saved, m.income || 0))) * 1.1;
    stroke(C.line); doc.setLineWidth(0.2);
    [0.5, 1].forEach((f) => { const gy = baseY - f * chartH; doc.line(M, gy, W - M, gy); font("normal", 6.5); ink(C.muted); doc.text(eur(maxH * f), M, gy - 1); });
    stroke(C.muted); doc.setLineWidth(0.3); doc.line(M, baseY, W - M, baseY);
    const slot = CW / ctx.history.length, bw = Math.min(14, slot * 0.45);
    ctx.history.forEach((m, i) => {
      const cx = M + slot * i + slot / 2;
      const h = ((m.total + m.saved) / maxH) * chartH;
      fill(m.current ? C.rose : hexToRgb(ROSE_PALE));
      if (h > 0.5) { doc.roundedRect(cx - bw / 2, baseY - h, bw, h + 1, 1.2, 1.2, "F"); fill(C.white); doc.rect(cx - bw / 2, baseY, bw, 1.2, "F"); }
      if (m.income > 0) { stroke(C.ink); doc.setLineWidth(0.6); const iy = baseY - (m.income / maxH) * chartH; doc.line(cx - slot * 0.32, iy, cx + slot * 0.32, iy); }
      font(m.current ? "bold" : "normal", 8); ink(m.current ? C.ink : C.muted);
      doc.text(t(monthLabelShort(m.key)), cx, baseY + 5, { align: "center" });
    });
    y = baseY + 11;
    table(["Mois", "Report", "Revenu", "Dépensé", "Épargne", "Solde"],
      ctx.history.map((m) => {
        if (m.incomeMissing) return [monthLabelLong(m.key), eur(m.carryIn), "-", eur(m.total), eur(m.saved), "-"];
        const bal = m.balance;
        return [monthLabelLong(m.key) + (m.current ? " (en cours)" : ""), eur(m.carryIn), eur(m.income), eur(m.total), eur(m.saved), { text: `${bal >= 0 ? "+" : ""}${eur(bal)}`, color: bal >= 0 ? C.sage : C.danger }];
      }), [46, 27, 27, 27, 24, 27], { align: ["left", "right", "right", "right", "right", "right"] });
  }

  /* --- Plafonds --- */
  if (ctx.usage.length > 0) {
    section("Plafonds par catégorie", "Dépenses variables du mois face aux montants maximum que tu t'es fixés.");
    const statusLabel = { ok: ["Dans les clous", C.sage], warning: ["Bientôt atteint", C.gold], over: ["Dépassé", C.danger] };
    table(["Catégorie", "Dépensé", "Plafond", "Utilisé", "Statut"],
      ctx.usage.map((u) => [u.label, eur(u.spent), eur(u.limit), `${Math.round(u.ratio * 100)} %`, { text: statusLabel[u.status][0], color: statusLabel[u.status][1] }]),
      [52, 32, 32, 26, 36], { align: ["left", "right", "right", "right", "left"] });
  }

  /* --- Objectifs --- */
  section("Objectifs d'épargne", ctx.goals.length ? "Où tu en es sur chacun de tes projets." : "Aucun objectif pour l'instant.");
  ctx.goals.forEach((g) => {
    ensure(20);
    const pct = goalPct(g), done = pct >= 100;
    const color = done ? C.gold : C.rose;
    font("bold", 10.5); ink(C.ink); doc.text(t(g.name), M, y + 3);
    font("normal", 9); ink(C.muted); doc.text(t(`${eur(g.current)} / ${eur(g.target)}`), W - M - 16, y + 3, { align: "right" });
    font("bold", 9); ink(color); doc.text(t(`${Math.round(pct)} %`), W - M, y + 3, { align: "right" });
    progress(M, y + 5.5, CW, 2.8, pct / 100, color);
    const months = g.deadline && !done ? monthsUntil(g.deadline) : null;
    const details = done ? "Objectif atteint, bravo !" : [g.deadline ? `Échéance : ${parseDay(g.deadline).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}` : null, months ? `environ ${eur(Math.max(0, g.target - g.current) / months)} par mois` : null].filter(Boolean).join(" · ");
    if (details) { font("normal", 8); ink(done ? C.gold : C.muted); doc.text(t(details), M, y + 13); }
    y += 18;
  });

  /* --- Détails --- */
  section("Revenus", "Tes sources de revenus mensuelles.");
  table(["Source", "Type", "Montant"],
    ctx.incomeSources.map((s) => [s.label || "Revenu", INCOME_TYPES.find((it) => it.id === s.type)?.label || "", eur(s.amount)]),
    [88, 52, 38], { align: ["left", "left", "right"], totalRow: ["Total", "", eur(ctx.monthlyIncome)] });

  section("Charges fixes", "Ce qui part chaque mois, quoi qu'il arrive.");
  table(["Charge", "Catégorie", "Montant", "Part du revenu"],
    ctx.charges.map((c) => [c.name || catInfo(c.category).label, catInfo(c.category).label, eur(c.amount), ctx.monthlyIncome > 0 ? pctLabel((Number(c.amount) / ctx.monthlyIncome) * 100) : "-"]),
    [70, 44, 34, 30], { align: ["left", "left", "right", "right"], totalRow: ["Total", "", eur(ctx.totalCharges), ctx.monthlyIncome > 0 ? `${Math.round((ctx.totalCharges / ctx.monthlyIncome) * 100)} %` : "-"] });

  section(`Dépenses variables · ${ctx.monthLabel}`, `${ctx.monthExpenses.length} dépense${ctx.monthExpenses.length > 1 ? "s" : ""} enregistrée${ctx.monthExpenses.length > 1 ? "s" : ""} ce mois-ci.`);
  table(["Date", "Description", "Catégorie", "Montant"],
    ctx.monthExpenses.length ? ctx.monthExpenses.map((e) => [formatDateFR(e.date), e.name || catInfo(e.category).label, catInfo(e.category).label, eur(e.amount)]) : [["-", "Aucune dépense", "-", "-"]],
    [26, 76, 44, 32], { align: ["left", "left", "left", "right"], totalRow: ctx.monthExpenses.length ? ["Total", "", "", eur(ctx.variableMonthTotal)] : null });

  /* --- Badges --- */
  const won = ctx.badges.filter((b) => b.unlocked);
  section("Badges", `${won.length} badge${won.length > 1 ? "s" : ""} obtenu${won.length > 1 ? "s" : ""} sur ${ctx.badges.length}.`, Math.ceil(ctx.badges.length / 2) * 10);
  const colW = CW / 2;
  ctx.badges.forEach((b, i) => {
    if (i % 2 === 0) ensure(9);
    const x = M + (i % 2) * colW;
    const color = b.unlocked ? hexToRgb(b.color) : C.line;
    fill(color); doc.circle(x + 2.5, y + 1.8, 2.5, "F");
    if (b.unlocked) { stroke(C.white); doc.setLineWidth(0.5); doc.line(x + 1.4, y + 1.9, x + 2.2, y + 2.8); doc.line(x + 2.2, y + 2.8, x + 3.7, y + 0.9); }
    font(b.unlocked ? "bold" : "normal", 9); ink(b.unlocked ? C.ink : C.muted); doc.text(t(b.label), x + 7, y + 2.2);
    font("normal", 7); ink(C.muted); doc.text(t(b.unlocked ? b.desc : `${b.desc} (${b.money ? `${eur(b.current)} / ${eur(b.goal)}` : `${b.current}/${b.goal}`})`), x + 7, y + 5.6, { maxWidth: colW - 9 });
    if (i % 2 === 1 || i === ctx.badges.length - 1) y += 10;
  });

  /* --- Pied de page --- */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    stroke(C.line); doc.setLineWidth(0.3); doc.line(M, H - 14, W - M, H - 14);
    font("italic", 8, "times"); ink(C.rose); doc.text("Mon Budget", M, H - 8.5);
    font("normal", 7.5); ink(C.muted);
    doc.text(t(`Rapport · ${ctx.monthLabel}`), W / 2, H - 8.5, { align: "center" });
    doc.text(`${p} / ${pages}`, W - M, H - 8.5, { align: "right" });
  }
  return doc;
}

function buildWorkbook(X, ctx) {
  const wb = X.utils.book_new();
  const FONT = "Calibri";
  const border = { style: "thin", color: { rgb: "EAD7DA" } };
  const S = {
    title: { font: { name: FONT, sz: 20, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "C85678" } }, alignment: { vertical: "center", indent: 1 } },
    subtitle: { font: { name: FONT, sz: 10, italic: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "C85678" } }, alignment: { vertical: "center", indent: 1 } },
    section: { font: { name: FONT, sz: 12, bold: true, color: { rgb: "9E3B5C" } }, border: { bottom: { style: "medium", color: { rgb: "C85678" } } } },
    head: { font: { name: FONT, sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "9E3B5C" } }, alignment: { horizontal: "center", vertical: "center" }, border: { bottom: border } },
    cell: { font: { name: FONT, sz: 10, color: { rgb: "3B2E30" } }, alignment: { vertical: "center" }, border: { bottom: border } },
    alt: { fill: { fgColor: { rgb: "FCE9ED" } } },
    total: { font: { name: FONT, sz: 10, bold: true, color: { rgb: "3B2E30" } }, fill: { fgColor: { rgb: "F6D9E1" } }, border: { top: { style: "thin", color: { rgb: "C85678" } } } },
    label: { font: { name: FONT, sz: 10, color: { rgb: "7A686B" } } },
    kpi: { font: { name: FONT, sz: 13, bold: true, color: { rgb: "3B2E30" } }, numFmt: '#,##0.00 "€"' },
  };
  const MONEY = '#,##0.00 "€"', PCT = "0%", DATE = "dd/mm/yyyy";
  const toDate = (iso) => { const d = parseDay(iso); return d && !isNaN(d) ? d : null; };
  const good = { font: { name: FONT, sz: 10, bold: true, color: { rgb: "588A67" } } };
  const bad = { font: { name: FONT, sz: 10, bold: true, color: { rgb: "C1573D" } } };
  const warn = { font: { name: FONT, sz: 10, bold: true, color: { rgb: "B98A2E" } } };

  // Feuille de données : ligne d'en-tête + lignes (réimportables), formats appliqués par colonne.
  const dataSheet = (name, columns, rows, { widths = [] } = {}) => {
    const aoa = [columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => r[c.key] ?? ""))];
    const ws = X.utils.aoa_to_sheet(aoa, { cellDates: true });
    aoa.forEach((row, ri) => row.forEach((_, ci) => {
      const ref = X.utils.encode_cell({ r: ri, c: ci });
      const cell = ws[ref];
      if (!cell) return;
      if (ri === 0) { cell.s = S.head; return; }
      const col = columns[ci];
      cell.s = { ...S.cell, ...(ri % 2 === 0 ? S.alt : {}), ...(col.fmt ? { numFmt: col.fmt } : {}), ...(col.fmt && col.fmt !== DATE ? { alignment: { horizontal: "right", vertical: "center" } } : {}), ...(col.fmt === DATE ? { alignment: { horizontal: "center", vertical: "center" } } : {}) };
      if (col.fmt === DATE && cell.v instanceof Date) { cell.t = "d"; cell.z = DATE; }
    }));
    ws["!cols"] = columns.map((c, i) => ({ wch: widths[i] || Math.min(40, Math.max(c.header.length + 4, ...rows.map((r) => String(r[c.key] ?? "").length + 2))) }));
    ws["!rows"] = [{ hpt: 22 }];
    if (rows.length) ws["!autofilter"] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: columns.length - 1 } }) };
    X.utils.book_append_sheet(wb, ws, name);
  };

  /* --- Synthèse (présentation) --- */
  const ws = {};
  const merges = [];
  let r = 0;
  const put = (c, v, s, extra = {}) => {
    const cell = typeof v === "number" ? { t: "n", v } : v instanceof Date ? { t: "d", v } : { t: "s", v: String(v ?? "") };
    ws[X.utils.encode_cell({ r, c })] = { ...cell, s, ...extra };
  };
  const fillRow = (style, cols = 5) => { for (let c = 0; c < cols; c += 1) put(c, "", style); };
  fillRow(S.title); put(0, "Mon Budget", S.title); merges.push({ s: { r, c: 0 }, e: { r, c: 4 } }); r += 1;
  fillRow(S.subtitle); put(0, `Rapport financier · ${ctx.monthLabel}${ctx.name ? ` · ${ctx.name}` : ""} · généré le ${ctx.generatedAt}`, S.subtitle); merges.push({ s: { r, c: 0 }, e: { r, c: 4 } }); r += 2;

  put(0, "Indicateurs du mois", S.section); for (let c = 1; c < 5; c += 1) put(c, "", S.section); r += 1;
  const kpiStart = r;
  [["Revenus mensuels", ctx.monthlyIncome], ["Report du mois précédent", ctx.carryOver], ["Charges fixes", ctx.totalCharges], ["Dépenses variables", ctx.variableMonthTotal], ["Épargne versée", ctx.savedThisMonth]].forEach(([label, value]) => {
    put(0, label, S.label); put(1, value, S.kpi); r += 1;
  });
  put(0, "Reste à vivre", { ...S.label, font: { ...S.label.font, bold: true, color: { rgb: "3B2E30" } } });
  put(1, ctx.remaining, { ...S.kpi, font: { ...S.kpi.font, color: { rgb: ctx.remaining >= 0 ? "588A67" : "C1573D" } } }, { f: `B${kpiStart + 1}+B${kpiStart + 2}-B${kpiStart + 3}-B${kpiStart + 4}-B${kpiStart + 5}` });
  r += 2;

  put(0, "Équilibre 50/30/20", S.section); for (let c = 1; c < 5; c += 1) put(c, "", S.section); r += 1;
  ["Poste", "Montant", "% du revenu", "Cible", "Écart"].forEach((h, c) => put(c, h, S.head)); r += 1;
  ctx.balance.forEach((b, i) => {
    const st = { ...S.cell, ...(i % 2 ? S.alt : {}) };
    const pct = ctx.monthlyIncome > 0 ? b.amount / ctx.monthlyIncome : 0;
    const over = b.label !== "Épargne" && pct * 100 > b.target;
    put(0, b.label, st); put(1, b.amount, { ...st, numFmt: MONEY }); put(2, pct, { ...st, numFmt: PCT });
    put(3, b.target / 100, { ...st, numFmt: PCT }); put(4, ctx.monthlyIncome > 0 ? (over ? "Au-dessus" : "OK") : "-", { ...st, ...(over ? bad : good) });
    r += 1;
  });
  r += 1;

  put(0, "Dépenses du mois par catégorie", S.section); for (let c = 1; c < 5; c += 1) put(c, "", S.section); r += 1;
  ["Catégorie", "Montant", "Part", "Plafond", "Statut"].forEach((h, c) => put(c, h, S.head)); r += 1;
  const catStart = r;
  const catTotal = ctx.categories.reduce((s, c) => s + c.amount, 0);
  ctx.categories.forEach((c, i) => {
    const st = { ...S.cell, ...(i % 2 ? S.alt : {}) };
    const u = ctx.usage.find((x) => x.id === c.id);
    put(0, c.label, st); put(1, c.amount, { ...st, numFmt: MONEY });
    put(2, catTotal ? c.amount / catTotal : 0, { ...st, numFmt: PCT }, { f: `B${r + 1}/B${catStart + ctx.categories.length + 1}` });
    put(3, u ? u.limit : "", u ? { ...st, numFmt: MONEY } : st);
    put(4, u ? (u.status === "over" ? "Dépassé" : u.status === "warning" ? "Bientôt atteint" : "Dans les clous") : "", { ...st, ...(u ? (u.status === "over" ? bad : u.status === "warning" ? warn : good) : {}) });
    r += 1;
  });
  put(0, "Total", S.total); put(1, catTotal, { ...S.total, numFmt: MONEY }, ctx.categories.length ? { f: `SUM(B${catStart + 1}:B${r})` } : {}); put(2, "", S.total); put(3, "", S.total); put(4, "", S.total);
  r += 2;

  put(0, "Objectifs d'épargne", S.section); for (let c = 1; c < 5; c += 1) put(c, "", S.section); r += 1;
  ["Objectif", "Épargné", "Cible", "Progression", "Échéance"].forEach((h, c) => put(c, h, S.head)); r += 1;
  if (ctx.goals.length === 0) { put(0, "Aucun objectif", S.cell); r += 1; }
  ctx.goals.forEach((g, i) => {
    const st = { ...S.cell, ...(i % 2 ? S.alt : {}) };
    put(0, g.name, st); put(1, Number(g.current || 0), { ...st, numFmt: MONEY }); put(2, Number(g.target || 0), { ...st, numFmt: MONEY });
    put(3, goalPct(g) / 100, { ...st, numFmt: PCT, ...(goalPct(g) >= 100 ? good : {}) }, { f: `MIN(1,B${r + 1}/C${r + 1})` });
    const d = toDate(g.deadline);
    if (d) put(4, d, { ...st, numFmt: DATE, alignment: { horizontal: "center" } }, { z: DATE }); else put(4, "", st);
    r += 1;
  });
  r += 1;
  put(0, `Badges obtenus : ${ctx.badges.filter((b) => b.unlocked).length} / ${ctx.badges.length}`, { ...S.label, font: { ...S.label.font, italic: true } });
  ws["!ref"] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: 4 } });
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
  ws["!rows"] = [{ hpt: 36 }, { hpt: 22 }];
  X.utils.book_append_sheet(wb, ws, "Synthèse");

  /* --- Feuilles de données (réimportables) --- */
  const allExpenses = [...(ctx.data.expenses || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  dataSheet("Dépenses", [
    { header: "Date", key: "date", fmt: DATE }, { header: "Description", key: "name" }, { header: "Catégorie", key: "cat" }, { header: "Montant", key: "amount", fmt: MONEY }, { header: "Mois", key: "month" },
  ], allExpenses.map((e) => ({ date: toDate(e.date) || "", name: e.name || "", cat: catInfo(e.category).label, amount: Number(e.amount || 0), month: e.date ? monthLabelLong(e.date.slice(0, 7)) : "" })), { widths: [12, 32, 20, 14, 18] });
  dataSheet("Charges", [
    { header: "Nom", key: "name" }, { header: "Catégorie", key: "cat" }, { header: "Montant", key: "amount", fmt: MONEY }, { header: "Part du revenu", key: "share", fmt: PCT },
  ], ctx.charges.map((c) => ({ name: c.name || "", cat: catInfo(c.category).label, amount: Number(c.amount || 0), share: ctx.monthlyIncome > 0 ? Number(c.amount || 0) / ctx.monthlyIncome : 0 })), { widths: [28, 20, 14, 16] });
  dataSheet("Revenus", [
    { header: "Type", key: "type" }, { header: "Libellé", key: "label" }, { header: "Montant", key: "amount", fmt: MONEY },
  ], ctx.incomeSources.map((s) => ({ type: INCOME_TYPES.find((it) => it.id === s.type)?.label || s.type, label: s.label || "", amount: Number(s.amount || 0) })), { widths: [22, 28, 14] });
  dataSheet("Épargne", [
    { header: "Objectif", key: "name" }, { header: "Épargné", key: "current", fmt: MONEY }, { header: "Cible", key: "target", fmt: MONEY }, { header: "Reste", key: "left", fmt: MONEY },
    { header: "Progression", key: "pct", fmt: PCT }, { header: "Échéance", key: "deadline", fmt: DATE }, { header: "Par mois conseillé", key: "monthly", fmt: MONEY }, { header: "Origine", key: "source" },
  ], ctx.goals.map((g) => {
    const left = Math.max(0, Number(g.target || 0) - Number(g.current || 0));
    const months = g.deadline && left > 0 ? monthsUntil(g.deadline) : null;
    return { name: g.name, current: Number(g.current || 0), target: Number(g.target || 0), left, pct: goalPct(g) / 100, deadline: toDate(g.deadline) || "", monthly: months ? left / months : "", source: g.source || "" };
  }), { widths: [26, 13, 13, 13, 12, 12, 18, 18] });
  dataSheet("Mois par mois", [
    { header: "Mois", key: "month" }, { header: "Report reçu", key: "carry", fmt: MONEY }, { header: "Revenu", key: "income", fmt: MONEY }, { header: "Charges fixes", key: "charges", fmt: MONEY }, { header: "Dépenses variables", key: "variable", fmt: MONEY },
    { header: "Épargne versée", key: "saved", fmt: MONEY }, { header: "Solde", key: "balance", fmt: MONEY },
  ], getMonthHistory(ctx.data, 24).map((m) => ({ month: monthLabelLong(m.key), carry: m.carryIn, income: m.incomeMissing ? "" : m.income, charges: m.charges, variable: m.variable, saved: m.saved, balance: m.incomeMissing ? "" : m.balance })), { widths: [18, 13, 14, 15, 19, 16, 14] });
  dataSheet("Plafonds", [{ header: "Catégorie", key: "cat" }, { header: "Plafond", key: "limit", fmt: MONEY }],
    Object.entries(ctx.data.categoryLimits || {}).filter(([, v]) => Number(v) > 0).map(([id, v]) => ({ cat: catInfo(id).label, limit: Number(v) })), { widths: [22, 14] });
  dataSheet("Profil", [{ header: "Prénom", key: "name" }, { header: "Revenu mensuel", key: "income", fmt: MONEY }], [{ name: ctx.name, income: ctx.monthlyIncome }], { widths: [20, 16] });
  return wb;
}

// Lit un classeur exporté par l'app (nouveau format accentué ou ancien format).
function parseWorkbook(X, workbook, fallbackProfile) {
  const sheet = (...names) => { const n = names.find((x) => workbook.Sheets[x]); return n ? X.utils.sheet_to_json(workbook.Sheets[n], { defval: "" }) : []; };
  const pick = (row, ...keys) => { for (const k of keys) if (row[k] !== undefined && row[k] !== "") return row[k]; return ""; };
  const num = (v) => (typeof v === "number" ? v : Number(String(v).replace(/[^0-9,.-]/g, "").replace(",", ".")) || 0);
  const iso = (v) => {
    if (v === "" || v === null || v === undefined) return "";
    if (typeof v === "number") { const p = X.SSF.parse_date_code(v); return p ? `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}` : ""; }
    if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
    const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v).trim());
    return fr ? `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}` : String(v).slice(0, 10);
  };
  const categoryId = (label) => CATEGORIES.find((c) => c.label.toLowerCase() === String(label).toLowerCase() || c.id === label)?.id || "autres";
  const incomeType = (label) => INCOME_TYPES.find((it) => it.label.toLowerCase() === String(label).toLowerCase() || it.id === label)?.id || "occasionnel";
  const profil = sheet("Profil")[0] || {};
  const limits = {};
  sheet("Plafonds").forEach((row) => { const v = num(pick(row, "Plafond")); if (v > 0) limits[categoryId(pick(row, "Catégorie", "Categorie"))] = v; });
  const name = pick(profil, "Prénom", "Nom");
  return {
    income: num(pick(profil, "Revenu mensuel", "RevenuMensuel")),
    incomeSources: sheet("Revenus").map((s) => ({ id: uid(), type: incomeType(pick(s, "Type")), label: pick(s, "Libellé", "Libelle") || "Revenu", amount: num(pick(s, "Montant")) })),
    charges: sheet("Charges").map((c) => ({ id: uid(), name: pick(c, "Nom"), category: categoryId(pick(c, "Catégorie", "Categorie")), amount: num(pick(c, "Montant")) })),
    expenses: sheet("Dépenses", "Depenses").map((e) => ({ id: uid(), date: iso(pick(e, "Date")), name: pick(e, "Description", "Nom"), category: categoryId(pick(e, "Catégorie", "Categorie")), amount: num(pick(e, "Montant")) })).filter((e) => e.amount > 0),
    goals: sheet("Épargne", "Epargne").map((g) => ({ id: uid(), name: pick(g, "Objectif") || "Objectif", target: num(pick(g, "Cible")), current: num(pick(g, "Épargné", "Actuel")), deadline: iso(pick(g, "Échéance", "DateLimite")), source: pick(g, "Origine"), trace: [] })),
    categoryLimits: limits,
    profile: name ? { ...(fallbackProfile || {}), name } : fallbackProfile,
  };
}

/* ---------- Auth ---------- */

function BrandMark({ size = 56 }) {
  return (
    <div className="rounded-2xl flex items-center justify-center" style={{ width: size, height: size, background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, color: "#FFFFFF", boxShadow: SHADOW }}>
      <Icon name="wallet" size={size * 0.4} />
    </div>
  );
}

function SplashScreen({ text }) {
  return (
    <div style={{ backgroundColor: BG, color: TEXT, minHeight: "100vh" }} className="flex flex-col items-center justify-center gap-4">
      <div className="anim-pulse"><BrandMark /></div>
      <p className="text-xs tracking-[0.15em] uppercase" style={{ color: TEXT_MUTED }}>{text}</p>
    </div>
  );
}

function Root() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <SplashScreen text="Connexion…" />;
  if (!session) return <AuthScreen />;
  return <App key={session.user.id} session={session} />;
}

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(""); setInfo(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        setInfo("Compte créé. Si une confirmation par email est demandée, vérifie ta boîte mail, puis connecte-toi.");
        setMode("signin");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      setError(e.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: BG, color: TEXT, minHeight: "100vh", fontFamily: "'Inter', sans-serif" }} className="flex flex-col justify-center px-6">
      <div className="flex justify-center mb-5 anim-fade-up"><BrandMark size={64} /></div>
      <p className="text-xs tracking-[0.2em] uppercase mb-2 text-center" style={{ color: ROSE }}>Mon budget</p>
      <h1 style={{ fontFamily: "'Lora', serif" }} className="text-3xl text-center mb-8">
        {mode === "signup" ? "Créer ton compte" : "Content de te revoir"}
      </h1>
      <div className="max-w-sm w-full mx-auto">
        <Field label="Email">
          <input type="email" className={inputClass} style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" />
        </Field>
        <Field label="Mot de passe">
          <input type="password" className={inputClass} style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        {error && <p className="text-xs mb-3" style={{ color: DANGER }}>{error}</p>}
        {info && <p className="text-xs mb-3" style={{ color: SAGE }}>{info}</p>}
        <button disabled={loading || !email || !password} onClick={submit}
          className="press w-full py-3.5 rounded-xl font-medium text-sm disabled:opacity-40 mb-3" style={{ background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, color: "#FFFFFF" }}>
          {loading ? "…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}
        </button>
        <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setInfo(""); }}
          className="w-full text-center text-xs" style={{ color: TEXT_MUTED }}>
          {mode === "signup" ? "J'ai déjà un compte" : "Pas encore de compte ? En créer un"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Main app ---------- */

function App({ session }) {
  const [data, setData] = useState(() => loadCache() || DEFAULT_DATA);
  const [dataReady, setDataReady] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [period, setPeriod] = useState("mois");
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseEditor, setExpenseEditor] = useState(null);
  const [showLimits, setShowLimits] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalEditor, setGoalEditor] = useState(null);
  const [showIncomeEdit, setShowIncomeEdit] = useState(false);
  const [chargeEditor, setChargeEditor] = useState(null);
  const [editProfile, setEditProfile] = useState(false);
  const [showCarryEdit, setShowCarryEdit] = useState(false);
  const [appMode, setAppModeState] = useState(() => { try { return localStorage.getItem(APP_MODE_KEY) === "prevision" ? "prevision" : "budget"; } catch (e) { return "budget"; } });
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data: row, error } = await sb.from("budget_data").select("data").eq("user_id", session.user.id).maybeSingle();
      if (!error && row && row.data) {
        const loaded = { ...DEFAULT_DATA, ...row.data };
        // Au chargement : photo du mois + badges déjà mérités, enregistrés sans notification.
        const upgraded = loaded.onboarded ? withBadges(withMonthSnapshot(loaded)).data : loaded;
        setData(upgraded);
        saveCache(upgraded);
        if (upgraded !== loaded) sb.from("budget_data").upsert({ user_id: session.user.id, data: upgraded, updated_at: new Date().toISOString() });
      }
      setDataReady(true);
    })();
  }, [session.user.id]);

  const persist = async (raw) => {
    const { data: next, fresh } = withBadges(withMonthSnapshot(raw));
    setData(next);
    saveCache(next);
    if (fresh.length > 0) {
      const first = fresh[0];
      setTimeout(() => notify(`Badge débloqué : ${first.label}${fresh.length > 1 ? ` (+${fresh.length - 1})` : ""}`, first.icon, "badge"), 2300);
    }
    const { error } = await sb.from("budget_data").upsert({ user_id: session.user.id, data: next, updated_at: new Date().toISOString() });
    setError(error ? "Sauvegardé sur cet appareil, mais pas encore synchronisé (vérifie ta connexion)." : "");
  };

  const notify = (message, icon = "check", variant = "default") => {
    setToast({ message, icon, variant, id: uid() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), variant === "default" ? 2200 : 3200);
  };

  const setAppMode = (mode) => {
    setAppModeState(mode);
    window.scrollTo(0, 0);
    try { localStorage.setItem(APP_MODE_KEY, mode); } catch (e) { }
  };

  const logout = () => { if (window.confirm("Te déconnecter de Mon Budget ?")) sb.auth.signOut(); };

  const totalCharges = useMemo(() => data.charges.reduce((s, c) => s + Number(c.amount || 0), 0), [data.charges]);
  const variableMonthExpenses = useMemo(() => data.expenses.filter((e) => inCurrentMonth(e.date)), [data.expenses]);
  const variableMonthTotal = useMemo(() => variableMonthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0), [variableMonthExpenses]);
  const variablePeriodExpenses = useMemo(() => {
    const from = period === "semaine" ? startOfWeek() : startOfMonth();
    return data.expenses.filter((e) => inRange(e.date, from));
  }, [data.expenses, period]);
  const variablePeriodTotal = useMemo(() => variablePeriodExpenses.reduce((s, e) => s + Number(e.amount || 0), 0), [variablePeriodExpenses]);
  const monthlyIncome = useMemo(() => getMonthlyIncome(data), [data]);
  const incomeSources = useMemo(() => getIncomeSources(data), [data]);
  const savedThisMonth = useMemo(() => savedFromIncomeThisMonth(data), [data.goals]);
  const carry = useMemo(() => getCarryOver(data), [data]);
  const available = monthlyIncome + carry.amount;
  const remaining = available - totalCharges - variableMonthTotal - savedThisMonth;
  const monthCategoryMap = useMemo(() => {
    const map = {};
    CATEGORIES.forEach((c) => (map[c.id] = 0));
    data.charges.forEach((c) => (map[c.category] = (map[c.category] || 0) + Number(c.amount || 0)));
    variableMonthExpenses.forEach((e) => (map[e.category] = (map[e.category] || 0) + Number(e.amount || 0)));
    return map;
  }, [data.charges, variableMonthExpenses]);
  const dailyBudget = useMemo(() => getDailyBudget(remaining), [remaining]);
  const plannedSavings = useMemo(() => getPlannedSavings(data), [data.goals]);
  const nextMajorExpense = useMemo(() => getNextMajorExpense(data), [data.charges, data.expenses]);
  const byCategoryChart = useMemo(() => {
    const map = {};
    CATEGORIES.forEach((c) => (map[c.id] = 0));
    if (period === "mois") data.charges.forEach((c) => (map[c.category] = (map[c.category] || 0) + Number(c.amount || 0)));
    variablePeriodExpenses.forEach((e) => (map[e.category] = (map[e.category] || 0) + Number(e.amount || 0)));
    return map;
  }, [data.charges, variablePeriodExpenses, period]);

  const saveExpense = (expense) => {
    const next = expense.id
      ? { ...data, expenses: data.expenses.map((e) => (e.id === expense.id ? expense : e)) }
      : { ...data, expenses: [...data.expenses, { ...expense, id: uid() }] };
    persist(next);
    setShowExpenseForm(false);
    setExpenseEditor(null);
    const before = getCategoryUsage(data).find((u) => u.id === expense.category);
    const after = getCategoryUsage(next).find((u) => u.id === expense.category);
    if (after && after.status === "over" && before?.status !== "over") {
      notify(`Plafond ${after.label} dépassé : ${fmt(after.spent)} / ${fmt(after.limit)} €`, "triangle-exclamation", "alert");
    } else if (after && after.status === "warning" && before?.status === "ok") {
      notify(`${after.label} : ${Math.round(after.ratio * 100)} % du plafond atteint`, "circle-exclamation", "alert");
    } else {
      notify(expense.id ? "Dépense modifiée" : `Dépense de ${fmt(expense.amount)} € ajoutée`);
    }
  };
  const saveLimits = (categoryLimits) => {
    persist({ ...data, categoryLimits });
    setShowLimits(false);
    notify("Plafonds enregistrés", "shield-halved");
  };
  const deleteExpense = (id) => {
    if (!confirmDeleteAction("cette dépense")) return;
    persist({ ...data, expenses: data.expenses.filter((e) => e.id !== id) });
    setExpenseEditor(null);
    notify("Dépense supprimée", "trash");
  };
  const saveCharge = (charge) => {
    if (charge.id) persist({ ...data, charges: data.charges.map((c) => (c.id === charge.id ? charge : c)) });
    else persist({ ...data, charges: [...data.charges, { ...charge, id: uid() }] });
    setChargeEditor(null);
    notify(charge.id ? "Charge modifiée" : "Charge fixe ajoutée");
  };
  const deleteCharge = (id) => {
    if (!confirmDeleteAction("cette charge fixe")) return;
    persist({ ...data, charges: data.charges.filter((c) => c.id !== id) });
    notify("Charge supprimée", "trash");
  };
  const saveGoal = (goal) => {
    const trace = Array.isArray(goal.trace) ? goal.trace : [];
    const nextGoals = goal.id
      ? data.goals.map((g) => (g.id === goal.id ? { ...g, ...goal, current: Number(goal.current) || 0, trace } : g))
      : [...data.goals, { ...goal, id: uid(), current: Number(goal.current) || 0, trace }];

    persist({ ...data, goals: nextGoals });
    setShowGoalForm(false);
    setGoalEditor(null);
    notify(goal.id ? "Objectif mis à jour" : "Nouvel objectif créé", "bullseye");
  };
  const deleteGoal = (id) => {
    if (!confirmDeleteAction("cet objectif d'épargne")) return;
    persist({ ...data, goals: data.goals.filter((g) => g.id !== id) });
  };
  const contribute = (id, amount, contributionOrigin) => {
    const goal = data.goals.find((g) => g.id === id);
    const willComplete = goal && goalPct(goal) < 100 && goalPct({ ...goal, current: Number(goal.current || 0) + amount }) >= 100;
    const traceEntry = {
      id: uid(),
      createdAt: new Date().toISOString(),
      type: "goal-contribution",
      label: contributionOrigin === "income" ? "Versement depuis le revenu" : "Versement depuis un don / cadeau",
      amount,
      source: contributionOrigin === "income" ? "Revenu" : "Autre",
      direction: contributionOrigin === "income" ? "decrease" : "none",
    };
    // Un versement depuis le revenu réduit le « reste à vivre » du mois (calculé via la trace),
    // sans toucher au revenu mensuel lui-même.
    persist({
      ...data,
      goals: data.goals.map((g) => (g.id === id ? { ...g, current: Math.max(0, Number(g.current) + amount), trace: [...(Array.isArray(g.trace) ? g.trace : []), traceEntry] } : g)),
      history: [
        ...((data.history || []).slice(-9)),
        {
          id: uid(),
          createdAt: new Date().toISOString(),
          label: `Versement sur ${data.goals.find((g) => g.id === id)?.name || "l'objectif"}`,
          amount,
          direction: contributionOrigin === "income" ? "decrease" : "none",
          type: "goal-contribution",
        }
      ],
    });
    if (willComplete) notify(`Objectif « ${goal.name} » atteint, bravo !`, "trophy");
    else notify(`${fmt(amount)} € versés sur ${goal?.name || "l'objectif"}`, "piggy-bank");
  };
  // Revenus d'un mois passé : enregistrés uniquement pour ce mois, sans toucher au mois en cours.
  const updateMonthIncome = (key, payload) => {
    const sources = payload?.sources || [];
    const income = sources.reduce((sum, source) => sum + Number(source.amount || 0), 0);
    persist({ ...data, months: { ...(data.months || {}), [key]: { ...(data.months?.[key] || {}), income, incomeSources: sources } } });
    setShowIncomeEdit(false);
    notify(`Revenus de ${monthLabelLong(key)} mis à jour`);
  };

  // Ajustement manuel du report du mois en cours (null = revenir au calcul automatique).
  const saveCarry = (value) => {
    const key = monthKey();
    const { carryOverride, ...snapshot } = data.months?.[key] || {};
    persist({ ...data, months: { ...(data.months || {}), [key]: value === null ? snapshot : { ...snapshot, carryOverride: value } } });
    setShowCarryEdit(false);
    notify("Report mis à jour", "arrow-right-arrow-left");
  };

  const updateIncome = (payload) => {
    const nextIncome = Number(payload?.total ?? payload ?? data.income) || 0;
    const nextSources = Array.isArray(payload?.sources)
      ? payload.sources.map((source) => ({ ...source, amount: Number(source.amount || 0) }))
      : getIncomeSources({ ...data, income: nextIncome });
    persist({ ...data, income: nextIncome, incomeSources: nextSources });
    setShowIncomeEdit(false);
    notify("Revenus mis à jour");
  };
  const saveForecast = (forecast) => persist({ ...data, forecast });
  const finishOnboarding = (profile) => persist({ ...data, profile, onboarded: true });
  const saveProfile = (profile) => { persist({ ...data, profile }); setEditProfile(false); };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const exportExcel = () => {
    if (!window.XLSX) {
      setError("Le module Excel n'est pas disponible. Vérifie ta connexion puis réessaie.");
      return;
    }
    const workbook = buildWorkbook(XLSX, buildReportContext(data));
    const output = XLSX.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true });
    downloadBlob(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `mon-budget-${todayISO()}.xlsx`);
    notify("Classeur Excel téléchargé", "file-excel");
  };
  const exportPdf = () => {
    if (!window.jspdf?.jsPDF) {
      setError("Le module PDF n'est pas disponible. Vérifie ta connexion puis réessaie.");
      return;
    }
    buildPdfReport(window.jspdf.jsPDF, buildReportContext(data)).save(`mon-budget-rapport-${todayISO()}.pdf`);
    notify("Rapport PDF téléchargé", "file-pdf");
  };
  const triggerImport = () => fileInputRef.current && fileInputRef.current.click();
  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        if (!window.XLSX) throw new Error("XLSX indisponible");
        const parsed = parseWorkbook(XLSX, XLSX.read(ev.target.result, { type: "array", cellDates: false }), data.profile);
        if (window.confirm(`Remplacer tes données actuelles par cette sauvegarde (${parsed.expenses.length} dépenses, ${parsed.charges.length} charges, ${parsed.goals.length} objectifs) ?`)) {
          persist({ ...DEFAULT_DATA, ...parsed, onboarded: true, budgetSplit: data.budgetSplit, months: data.months, badges: data.badges, pantry: data.pantry, forecast: data.forecast });
          notify("Sauvegarde importée", "upload");
        }
      } catch (err) {
        setError("Ce fichier Excel n'est pas exploitable ou ne contient pas les feuilles attendues.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  if (!dataReady) return <SplashScreen text="Chargement de tes données…" />;

  if (!data.onboarded) return <Onboarding onComplete={finishOnboarding} />;

  const monthLabel = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const now = new Date();
  const greeting = now.getHours() < 18 ? "Bonjour" : "Bonsoir";
  const streak = getStreaks(data);
  const displayName = data.profile?.name?.trim() || "toi";

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", backgroundColor: BG, color: TEXT, minHeight: "100vh", paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>
      {editProfile && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, backgroundColor: BG }} className="anim-fade-in">
          <Onboarding initial={data.profile} onComplete={saveProfile} onClose={() => setEditProfile(false)} />
        </div>
      )}

      <header className="px-5 pb-5" style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}>
        <AppSwitcher mode={appMode} onChange={setAppMode} alerts={forecastPendingReviews(data)} />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs tracking-[0.2em] uppercase truncate" style={{ color: appMode === "budget" ? ROSE : PLAN }}>{greeting} {displayName}</p>
            <h1 style={{ fontFamily: "'Lora', serif" }} className="text-3xl mt-1 font-semibold">{appMode === "budget" ? "Mon budget" : "Ma prévision"}</h1>
            {appMode === "budget" ? (
              <p style={{ color: TEXT_MUTED }} className="text-xs mt-1 capitalize">{monthLabel} · <span style={NUM}>J-{daysLeftInMonth()}</span>
                {streak.current > 1 && <span className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full normal-case" style={{ backgroundColor: "#CE7A5222", color: "#A85A35" }}><Icon name="fire" size={10} /> <span style={NUM}>{streak.current}</span> jours de suite</span>}
              </p>
            ) : <p style={{ color: TEXT_MUTED }} className="text-xs mt-1">Faire durer ton argent, sans sortir du budget</p>}
          </div>
          <button onClick={logout} aria-label="Se déconnecter" title="Se déconnecter"
            className="press w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-base font-semibold"
            style={{ background: `linear-gradient(135deg, ${ROSE_PALE} 0%, ${ROSE} 100%)`, color: "#FFFFFF", boxShadow: SHADOW, fontFamily: "'Lora', serif" }}>
            {displayName === "toi" ? <Icon name="user" size={14} /> : displayName.charAt(0).toUpperCase()}
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-5 mb-2 text-xs px-3 py-2 rounded-lg flex items-center gap-2 anim-fade-in" style={{ backgroundColor: DANGER + "14", border: `1px solid ${DANGER}55`, color: TEXT }}>
          <Icon name="cloud" size={12} style={{ color: DANGER }} /><span className="flex-1">{error}</span>
        </div>
      )}

      {appMode === "prevision" ? <Prevision data={data} onChange={saveForecast} notify={notify} /> : (<>
      <main className="px-5 mt-2">
        <div key={tab} className="anim-fade-up">
          {tab === "dashboard" && (
            <Dashboard data={data} carry={carry} available={available} onEditCarry={() => setShowCarryEdit(true)} totalCharges={totalCharges} variableMonthTotal={variableMonthTotal} remaining={remaining}
              byCategoryChart={byCategoryChart} monthCategoryMap={monthCategoryMap} period={period} setPeriod={setPeriod}
              onEditIncome={() => setShowIncomeEdit(monthKey())} onEditMonthIncome={(key) => setShowIncomeEdit(key)} onGoToCharges={() => setTab("charges")} onGoToExpenses={() => setTab("depenses")} onGoToSavings={() => setTab("epargne")}
              onEditProfile={() => setEditProfile(true)} onEditExpense={(e) => setExpenseEditor(e)}
              monthlyIncome={monthlyIncome} incomeSources={incomeSources} dailyBudget={dailyBudget} plannedSavings={plannedSavings} savedThisMonth={savedThisMonth} onEditLimits={() => setShowLimits(true)} onGoToParcours={() => setTab("parcours")} />
          )}
          {tab === "charges" && (
            <Charges charges={data.charges} totalCharges={totalCharges} monthlyIncome={monthlyIncome} onAdd={() => setChargeEditor(true)} onEdit={(c) => setChargeEditor(c)} onDelete={deleteCharge} />
          )}
          {tab === "depenses" && (
            <Expenses period={period} setPeriod={setPeriod} periodExpenses={variablePeriodExpenses} periodTotal={variablePeriodTotal} onDelete={deleteExpense} onEdit={(e) => setExpenseEditor(e)} onAdd={() => setShowExpenseForm(true)} nextMajorExpense={nextMajorExpense} />
          )}
          {tab === "epargne" && <Savings goals={data.goals} onAdd={() => setShowGoalForm(true)} onDelete={deleteGoal} onEdit={(goal) => setGoalEditor(goal)} onContribute={contribute} />}
          {tab === "parcours" && (
            <Parcours data={data} remaining={remaining} monthlyIncome={monthlyIncome} onEditProfile={() => setEditProfile(true)} onExportPdf={exportPdf} onExportExcel={exportExcel} onImport={triggerImport} onLogout={logout} />
          )}
        </div>
      </main>

      {(tab === "dashboard" || tab === "depenses") && (
        <button onClick={() => setShowExpenseForm(true)} aria-label="Ajouter une dépense"
          className="press fixed z-30 w-14 h-14 rounded-full flex items-center justify-center anim-fade-up"
          style={{ right: 20, bottom: "calc(84px + env(safe-area-inset-bottom))", background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, color: "#FFFFFF", boxShadow: "0 10px 30px -8px rgba(158,59,92,0.55)" }}>
          <Icon name="plus" size={20} />
        </button>
      )}

      <nav style={NAV_STYLE} className="flex px-2">
        <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon="chart-pie" label="Aperçu" />
        <TabButton active={tab === "charges"} onClick={() => setTab("charges")} icon="receipt" label="Charges" />
        <TabButton active={tab === "depenses"} onClick={() => setTab("depenses")} icon="wallet" label="Dépenses" />
        <TabButton active={tab === "epargne"} onClick={() => setTab("epargne")} icon="piggy-bank" label="Épargne" />
        <TabButton active={tab === "parcours"} onClick={() => setTab("parcours")} icon="route" label="Parcours" />
      </nav>
      </>)}
      <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: "none" }} onChange={handleImportFile} />

      {toast && (
        <div key={toast.id} role="status" className="fixed z-[60] anim-toast flex items-center gap-2 px-4 py-2.5 rounded-full text-sm"
          style={{ left: "50%", top: "calc(14px + env(safe-area-inset-top))", transform: "translateX(-50%)", background: toast.variant === "badge" ? `linear-gradient(135deg, ${GOLD} 0%, #8E6A22 100%)` : toast.variant === "alert" ? DANGER : TEXT, color: "#FFFFFF", boxShadow: "0 12px 30px -10px rgba(59,46,48,0.5)", maxWidth: "calc(100vw - 32px)" }}>
          <Icon name={toast.icon} size={toast.variant === "badge" ? 14 : 12} style={{ color: toast.variant === "default" ? ROSE_PALE : "#FFFFFF" }} />
          <span className="truncate">{toast.message}</span>
        </div>
      )}

      {showCarryEdit && <CarryForm carry={carry} onClose={() => setShowCarryEdit(false)} onSubmit={saveCarry} />}
      {showExpenseForm && <ExpenseForm onClose={() => setShowExpenseForm(false)} onSubmit={saveExpense} />}
      {expenseEditor && <ExpenseForm initial={expenseEditor} onClose={() => setExpenseEditor(null)} onSubmit={saveExpense} onDelete={deleteExpense} />}
      {chargeEditor && <ChargeForm initial={typeof chargeEditor === "object" ? chargeEditor : null} onClose={() => setChargeEditor(null)} onSubmit={saveCharge} />}
      {showGoalForm && <GoalForm onClose={() => setShowGoalForm(false)} onSubmit={saveGoal} />}
      {goalEditor && <GoalForm initial={goalEditor} onClose={() => setGoalEditor(null)} onSubmit={saveGoal} />}
      {showLimits && <LimitsForm initial={data.categoryLimits || {}} usage={getCategoryUsage(data)} onClose={() => setShowLimits(false)} onSubmit={saveLimits} />}
      {showIncomeEdit && (showIncomeEdit === true || showIncomeEdit === monthKey()
        ? <IncomeForm key="current" monthKey={monthKey()} initial={data.income} initialSources={incomeSources} onClose={() => setShowIncomeEdit(false)} onSubmit={updateIncome} />
        : <IncomeForm key={showIncomeEdit} monthKey={showIncomeEdit} initial={0} initialSources={getMonthIncomeSources(data, showIncomeEdit) || []} onClose={() => setShowIncomeEdit(false)} onSubmit={(payload) => updateMonthIncome(showIncomeEdit, payload)} />)}
    </div>
  );
}

function OptionCard({ selected, onClick, label, icon }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors"
      style={{ borderColor: selected ? ROSE : BORDER, backgroundColor: selected ? ROSE + "14" : SURFACE }}>
      {icon && <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: (selected ? ROSE : TEXT_MUTED) + "20", color: selected ? ROSE : TEXT_MUTED }}><Icon name={icon} size={15} /></div>}
      <span className="text-sm flex-1">{label}</span>
      <div className="w-4 h-4 rounded-full border shrink-0" style={{ borderColor: selected ? ROSE : BORDER, backgroundColor: selected ? ROSE : "transparent" }} />
    </button>
  );
}

function Onboarding({ initial, onComplete, onClose }) {
  const [answers, setAnswers] = useState(initial || { name: "", motivation: [], projectType: [], relationship: [], frequency: [] });
  const selectedMotivations = Array.isArray(answers.motivation) ? answers.motivation : answers.motivation ? [answers.motivation] : [];
  const selectedProjectTypes = Array.isArray(answers.projectType) ? answers.projectType : answers.projectType ? [answers.projectType] : [];
  const selectedRelationships = Array.isArray(answers.relationship) ? answers.relationship : answers.relationship ? [answers.relationship] : [];
  const selectedFrequencies = Array.isArray(answers.frequency) ? answers.frequency : answers.frequency ? [answers.frequency] : [];
  const includesProject = selectedMotivations.includes("projet");
  const stepsOrder = ["profile", "motivation", ...(includesProject ? ["projectType"] : []), "relationship", "frequency", "summary"];
  const [stepIndex, setStepIndex] = useState(0);
  const current = stepsOrder[Math.min(stepIndex, stepsOrder.length - 1)];
  const set = (key, val) => setAnswers((a) => ({ ...a, [key]: val }));
  const toggleChoice = (key, val) => {
    setAnswers((a) => {
      const currentValues = Array.isArray(a[key]) ? a[key] : a[key] ? [a[key]] : [];
      const nextValues = currentValues.includes(val) ? currentValues.filter((item) => item !== val) : [...currentValues, val];
      return { ...a, [key]: nextValues };
    });
  };
  const canNext =
    current === "profile" ||
    (current === "motivation" && selectedMotivations.length > 0) ||
    (current === "projectType" && selectedProjectTypes.length > 0) ||
    (current === "relationship" && selectedRelationships.length > 0) ||
    (current === "frequency" && selectedFrequencies.length > 0) ||
    current === "summary";
  const next = () => setStepIndex((i) => Math.min(i + 1, stepsOrder.length - 1));
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));
  const objLabel = objectiveLabel(answers);
  const objEmoji = objectiveEmoji(answers);

  return (
    <div style={{ backgroundColor: BG, color: TEXT, minHeight: "100vh", fontFamily: "'Inter', sans-serif" }} className="flex flex-col">
      <div className="px-5 pb-4 flex items-center justify-between" style={{ paddingTop: "calc(2rem + env(safe-area-inset-top))" }}>
        <div className="flex gap-1.5">
          {stepsOrder.map((s, i) => <div key={s} className="h-1.5 rounded-full transition-all" style={{ width: i === stepIndex ? 24 : 8, backgroundColor: i <= stepIndex ? ROSE : BORDER }} />)}
        </div>
        {onClose && <button onClick={onClose} style={{ color: TEXT_MUTED, fontSize: 20 }} aria-label="Fermer"><Icon name="xmark" size={14} /></button>}
      </div>
      <div className="px-5 flex-1 overflow-y-auto">
        <p className="text-xs tracking-[0.2em] uppercase mb-2" style={{ color: ROSE }}>{onClose ? "Ton profil" : "Avant de commencer"}</p>
        {current === "profile" && (
          <>
            <h2 style={{ fontFamily: "'Lora', serif" }} className="text-2xl mb-4">Comment je dois te saluer ?</h2>
            <Field label="Prénom / pseudo">
              <input className={inputClass} style={inputStyle} value={answers.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Prénom ou pseudo" />
            </Field>
            <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>Ce prénom sera utilisé pour te saluer au bon moment du jour et rendre l'app plus personnelle.</p>
          </>
        )}
        {current === "motivation" && (
          <>
            <h2 style={{ fontFamily: "'Lora', serif" }} className="text-2xl mb-2">Qu'est-ce qui t'amène ici aujourd'hui ?</h2>
            <p className="text-xs mb-4" style={{ color: TEXT_MUTED }}>Tu peux choisir plusieurs réponses.</p>
            <div className="space-y-2.5">{MOTIVATIONS.map((m) => <OptionCard key={m.id} icon={m.icon} label={m.label} selected={selectedMotivations.includes(m.id)} onClick={() => toggleChoice("motivation", m.id)} />)}</div>
          </>
        )}
        {current === "projectType" && (
          <>
            <h2 style={{ fontFamily: "'Lora', serif" }} className="text-2xl mb-2">Quel type de projet ?</h2>
            <p className="text-xs mb-4" style={{ color: TEXT_MUTED }}>Tu peux en sélectionner plusieurs si besoin.</p>
            <div className="space-y-2.5">{PROJECT_TYPES.map((p) => <OptionCard key={p.id} label={p.label} selected={selectedProjectTypes.includes(p.id)} onClick={() => toggleChoice("projectType", p.id)} />)}</div>
          </>
        )}
        {current === "relationship" && (
          <>
            <h2 style={{ fontFamily: "'Lora', serif" }} className="text-2xl mb-2">Comment décrirais-tu ta relation à l'argent aujourd'hui ?</h2>
            <p className="text-xs mb-4" style={{ color: TEXT_MUTED }}>Tu peux choisir plusieurs réponses si ça te correspond.</p>
            <div className="space-y-2.5">{RELATIONSHIPS.map((r) => <OptionCard key={r.id} label={r.label} selected={selectedRelationships.includes(r.id)} onClick={() => toggleChoice("relationship", r.id)} />)}</div>
          </>
        )}
        {current === "frequency" && (
          <>
            <h2 style={{ fontFamily: "'Lora', serif" }} className="text-2xl mb-2">À quelle fréquence veux-tu suivre ton budget ?</h2>
            <p className="text-xs mb-4" style={{ color: TEXT_MUTED }}>Tu peux en choisir plusieurs si tu veux varier.</p>
            <div className="space-y-2.5">{FREQUENCIES.map((f) => <OptionCard key={f.id} label={f.label} selected={selectedFrequencies.includes(f.id)} onClick={() => toggleChoice("frequency", f.id)} />)}</div>
          </>
        )}
        {current === "summary" && (
          <>
            <h2 style={{ fontFamily: "'Lora', serif" }} className="text-2xl mb-5">Ton profil budget</h2>
            <div className="rounded-xl border p-5 mb-4" style={{ backgroundColor: SURFACE, borderColor: BORDER }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: ROSE + "20", fontSize: 18 }}>{objEmoji}</div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.1em]" style={{ color: TEXT_MUTED }}>Ton objectif général</p>
                  <p className="text-sm font-medium">{objLabel}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs pt-3 border-t" style={{ borderColor: BORDER, color: TEXT_MUTED }}>
                <p>Prénom : <span style={{ color: TEXT }}>{answers.name || "À renseigner"}</span></p>
                <p>Motivations : <span style={{ color: TEXT }}>{selectedMotivations.map((id) => MOTIVATIONS.find((m) => m.id === id)?.label).filter(Boolean).join(", ") || "À préciser"}</span></p>
                {includesProject && <p>Projets : <span style={{ color: TEXT }}>{selectedProjectTypes.map((id) => PROJECT_TYPES.find((p) => p.id === id)?.label).filter(Boolean).join(", ")}</span></p>}
                <p>Relation à l'argent : <span style={{ color: TEXT }}>{selectedRelationships.map((id) => RELATIONSHIPS.find((r) => r.id === id)?.label).filter(Boolean).join(", ")}</span></p>
                <p>Suivi souhaité : <span style={{ color: TEXT }}>{selectedFrequencies.map((id) => FREQUENCIES.find((f) => f.id === id)?.label).filter(Boolean).join(", ")}</span></p>
              </div>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>On garde ce cap comme fil rouge — tu pourras le modifier à tout moment depuis l'onglet Parcours.</p>
          </>
        )}
      </div>
      <div className="px-5 py-5 flex gap-3" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}>
        {stepIndex > 0 && <button onClick={back} className="px-4 py-3 rounded-lg border" style={{ borderColor: BORDER, color: TEXT_MUTED }}>‹</button>}
        <button disabled={!canNext} onClick={() => (current === "summary" ? onComplete(answers) : next())}
          className="press flex-1 py-3.5 rounded-xl font-medium text-sm disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, color: "#FFFFFF" }}>
          {current === "summary" ? "Commencer à gérer mon budget" : "Continuer →"}
        </button>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, accent = ROSE }) {
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined} className="flex-1 flex flex-col items-center gap-1 pt-2 pb-2.5" style={{ color: active ? accent : TEXT_MUTED }}>
      <span className="flex items-center justify-center h-7 w-12 rounded-full transition-colors" style={{ backgroundColor: active ? accent + "1A" : "transparent" }}>
        <Icon name={icon} size={16} style={{ opacity: active ? 1 : 0.65 }} />
      </span>
      <span className="text-[10px] tracking-wide text-center leading-none" style={{ fontWeight: active ? 600 : 400 }}>{label}</span>
    </button>
  );
}

function PeriodToggle({ period, setPeriod }) {
  return (
    <div className="flex rounded-full p-1 text-xs" style={{ backgroundColor: SURFACE_ALT, border: `1px solid ${BORDER}` }}>
      {[{ id: "semaine", label: "Semaine" }, { id: "mois", label: "Mois" }].map((p) => (
        <button key={p.id} onClick={() => setPeriod(p.id)} className="px-3 py-1.5 rounded-full"
          style={{ backgroundColor: period === p.id ? ROSE : "transparent", color: period === p.id ? "#FFFFFF" : TEXT_MUTED, fontWeight: period === p.id ? 600 : 400 }}>{p.label}</button>
      ))}
    </div>
  );
}

function Card({ children, className = "", style = {} }) {
  return <div className={`rounded-2xl border p-5 ${className}`} style={{ backgroundColor: SURFACE, borderColor: BORDER, boxShadow: SHADOW, ...style }}>{children}</div>;
}

function MetricBox({ label, value, hint, accent = TEXT }) {
  return (
    <div className="rounded-xl border p-3" style={{ backgroundColor: BG, borderColor: BORDER }}>
      <p className="text-[10px] uppercase tracking-[0.1em]" style={{ color: TEXT_MUTED }}>{label}</p>
      <p style={{ ...NUM, color: accent }} className="text-base font-semibold mt-1">{value}</p>
      {hint && <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>{hint}</p>}
    </div>
  );
}

function SectionTitle({ children, action, accent = ROSE }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-[11px] uppercase tracking-[0.15em]" style={{ color: accent }}>{children}</p>
      {action}
    </div>
  );
}

function LinkButton({ onClick, children }) {
  return <button onClick={onClick} className="text-xs inline-flex items-center gap-1" style={{ color: TEXT_MUTED }}>{children} <Icon name="chevron-right" size={9} /></button>;
}

function Dashboard({ data, carry, available, onEditCarry, totalCharges, variableMonthTotal, remaining, byCategoryChart, monthCategoryMap, period, setPeriod, onEditIncome, onEditMonthIncome, onGoToExpenses, onGoToSavings, onEditProfile, onEditExpense, monthlyIncome, incomeSources, dailyBudget, plannedSavings, savedThisMonth, onEditLimits, onGoToParcours }) {
  const usage = getCategoryUsage(data);
  const alerts = usage.filter((u) => u.status !== "ok").sort((a, b) => b.ratio - a.ratio);
  const maxCat = Math.max(1, ...Object.values(byCategoryChart));
  const activeCats = CATEGORIES.filter((c) => (byCategoryChart[c.id] || 0) > 0).sort((a, b) => byCategoryChart[b.id] - byCategoryChart[a.id]);
  const incomeSummary = incomeSources.length > 0 ? incomeSources : [{ id: "default", type: "salaire", label: "Revenu mensuel", amount: monthlyIncome }];
  const savingsLabel = plannedSavings > 0 ? `${fmt(plannedSavings)} €/mois` : "À planifier";
  const spent = totalCharges + variableMonthTotal + savedThisMonth;
  const spentPct = available > 0 ? Math.round((spent / available) * 100) : 0;
  const advice = getPersonalAdvice({ profile: data.profile, remaining, monthlyIncome, plannedSavings, nextMajorExpense: getNextMajorExpense(data) });

  const sumOf = (keys) => keys.reduce((sum, key) => sum + Number(monthCategoryMap[key] || 0), 0);
  const totalNeeds = sumOf(["loyer", "abonnements", "courses", "transport", "assurance", "telephone", "sante", "autres"]);
  const totalPleasures = sumOf(["shopping", "plaisir"]);
  const totalSavings = Math.max(plannedSavings, savedThisMonth);
  const base = monthlyIncome > 0 ? monthlyIncome : Math.max(1, totalNeeds + totalPleasures + totalSavings);
  const split = data.budgetSplit || DEFAULT_DATA.budgetSplit;
  const mix = [
    { label: "Besoins", color: ROSE, value: (totalNeeds / base) * 100, target: split.needs },
    { label: "Plaisirs", color: GOLD, value: (totalPleasures / base) * 100, target: split.pleasures },
    { label: "Épargne", color: SAGE, value: (totalSavings / base) * 100, target: split.savings },
  ];
  let acc = 0;
  const stops = mix.map((m) => { const from = Math.min(100, acc); acc += m.value; return `${m.color} ${from}% ${Math.min(100, acc)}%`; });
  const donutGradient = `conic-gradient(${stops.join(", ")}, ${BORDER} ${Math.min(100, acc)}% 100%)`;
  const usedPct = Math.round(Math.min(999, acc));

  const recent = [...data.expenses].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 4);

  return (
    <div className="space-y-6 stagger">
      <div className="rounded-3xl p-6 relative overflow-hidden" style={{ background: remaining >= 0 ? `linear-gradient(140deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)` : `linear-gradient(140deg, ${DANGER} 0%, #8E3A26 100%)`, color: "#FFFFFF", boxShadow: "0 18px 40px -18px rgba(158,59,92,0.6)" }}>
        <div className="absolute rounded-full" style={{ width: 220, height: 220, right: -70, top: -90, background: "rgba(255,255,255,0.08)" }} />
        <div className="absolute rounded-full" style={{ width: 140, height: 140, right: 30, bottom: -80, background: "rgba(255,255,255,0.06)" }} />
        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.18em] opacity-80">Reste à vivre ce mois</p>
          <p style={{ fontFamily: "'Lora', serif", fontVariantNumeric: "tabular-nums" }} className="text-[2.6rem] leading-tight font-semibold mt-1">
            {fmt(remaining)} <span className="text-2xl opacity-80">€</span>
          </p>
          <div className="mt-4 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.22)" }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, spentPct)}%`, backgroundColor: "#FFFFFF" }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px] opacity-85">
            <span><span style={NUM}>{fmt(spent)} €</span> engagés</span>
            <span style={NUM}>{available > 0 ? `${spentPct}% du budget` : "Revenu à renseigner"}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.16)" }}>
              <Icon name="sun" size={11} /> <span style={NUM}>{fmt(Math.max(0, dailyBudget))} €</span> / jour
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.16)" }}>
              <Icon name="calendar-day" size={11} /> <span style={NUM}>{daysLeftInMonth()}</span> jours restants
            </span>
            {carry.amount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.16)" }}>
                <Icon name="arrow-right-arrow-left" size={11} /> <span style={NUM}>+{fmt(carry.amount)} €</span> reportés
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-4 flex gap-3 items-start" style={{ backgroundColor: SURFACE_ALT, border: `1px solid ${BORDER}` }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: SURFACE, color: ROSE }}><Icon name="wand-magic-sparkles" size={13} /></div>
        <p className="text-[13px] leading-relaxed" style={{ fontFamily: "'Lora', serif", fontStyle: "italic" }}>{advice}</p>
      </div>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-[0.15em]" style={{ color: ROSE }}>Revenus de {new Date().toLocaleDateString("fr-FR", { month: "long" })}</p>
            <p style={NUM} className="text-2xl font-semibold mt-1">{fmt(monthlyIncome)} €</p>
          </div>
          <button onClick={onEditIncome} className="press shrink-0 px-3 py-2 rounded-full text-xs font-medium" style={{ backgroundColor: SURFACE_ALT, color: ROSE }}><span className="inline-flex items-center gap-1"><Icon name="pen" size={10} /> Modifier</span></button>
        </div>
        {incomeSummary.length > 0 && (
          <div className="mt-4 space-y-2 border-t pt-3" style={{ borderColor: BORDER }}>
            {incomeSummary.map((source) => {
              const type = INCOME_TYPES.find((item) => item.id === source.type);
              return (
                <div key={source.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: BG }}>
                  <Icon name={type?.icon || "coins"} size={11} style={{ color: TEXT_MUTED }} />
                  <span className="flex-1 truncate">{source.label || type?.label || "Revenu"}</span>
                  <span style={NUM}>{fmt(source.amount)} €</span>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={onEditCarry} className="press w-full mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left" style={{ backgroundColor: SAGE + "1A" }}>
          <Icon name="arrow-right-arrow-left" size={11} style={{ color: SAGE }} />
          <span className="flex-1 min-w-0 truncate">Report de {carry.fromLabel}{carry.overridden ? " (ajusté)" : ""}</span>
          <span style={{ ...NUM, color: carry.amount > 0 ? SAGE : TEXT_MUTED }} className="font-semibold">{carry.amount > 0 ? "+" : ""}{fmt(carry.amount)} €</span>
          <Icon name="pen" size={9} style={{ color: TEXT_MUTED }} />
        </button>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricBox label="Dépenses du mois" value={`${fmt(totalCharges + variableMonthTotal)} €`} hint="Charges fixes + variables" />
          <MetricBox label="Épargne prévue" value={savingsLabel} hint={savedThisMonth > 0 ? `${fmt(savedThisMonth)} € déjà versés` : "Selon tes objectifs"} accent={SAGE} />
        </div>
      </Card>

      <Card>
        <p className="text-[11px] uppercase tracking-[0.15em]" style={{ color: ROSE }}>Équilibre du mois</p>
        <p className="text-[11px] mt-1 mb-4" style={{ color: TEXT_MUTED }}>{monthlyIncome > 0 ? `Comparé à ta règle ${split.needs}/${split.pleasures}/${split.savings}` : "Renseigne ton revenu pour comparer à la règle 50/30/20"}</p>
        <div className="flex items-center gap-5">
          <div className="relative shrink-0 w-28 h-28">
            <div className="w-28 h-28 rounded-full transition-all" style={{ background: donutGradient }} />
            <div className="absolute rounded-full flex flex-col items-center justify-center text-center" style={{ inset: 12, backgroundColor: SURFACE }}>
              <p style={{ fontFamily: "'Lora', serif" }} className="text-xl font-semibold leading-none">{usedPct}%</p>
              <p className="text-[9px] uppercase tracking-[0.08em] mt-1" style={{ color: TEXT_MUTED }}>utilisé</p>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            {mix.map((item) => {
              const over = monthlyIncome > 0 && item.label !== "Épargne" && item.value > item.target;
              return (
                <div key={item.label}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-xs flex-1">{item.label}</span>
                    <span className="text-xs font-semibold" style={{ ...NUM, color: over ? DANGER : TEXT }}>{Math.round(item.value)}%</span>
                  </div>
                  {monthlyIncome > 0 && <p className="text-[10px] ml-[18px]" style={{ color: TEXT_MUTED }}>cible {item.target}%{over ? " · au-dessus" : ""}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {alerts.length > 0 && (
        <div className="rounded-2xl p-4 border" style={{ backgroundColor: DANGER + "0F", borderColor: DANGER + "40" }}>
          {alerts.map((a) => (
            <div key={a.id} className="flex items-center gap-3 py-1">
              <Icon name={a.status === "over" ? "triangle-exclamation" : "circle-exclamation"} size={13} style={{ color: a.status === "over" ? DANGER : GOLD }} />
              <p className="text-xs flex-1"><span className="font-semibold">{a.label}</span> · {a.status === "over" ? "plafond dépassé" : "bientôt au plafond"}</p>
              <span className="text-xs" style={NUM}>{fmt(a.spent)} / {fmt(a.limit)} €</span>
            </div>
          ))}
        </div>
      )}

      <LimitsCard usage={usage} onEdit={onEditLimits} />

      <MonthHistoryCard history={getMonthHistory(data, 6)} onEditMonthIncome={onEditMonthIncome} />

      <div>
        <SectionTitle action={<PeriodToggle period={period} setPeriod={setPeriod} />}>Par catégorie</SectionTitle>
        {activeCats.length === 0 ? <EmptyState icon="chart-simple" text="Rien à afficher pour cette période." /> : (
          <Card className="space-y-3.5">
            {activeCats.map((c) => {
              const val = byCategoryChart[c.id] || 0;
              const pct = Math.round((val / maxCat) * 100);
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: c.color + "22", color: c.color }}><Icon name={c.icon} size={11} /></div>
                  <span className="text-xs w-24 shrink-0 truncate">{c.label}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: BG }}><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: c.color }} /></div>
                  <span style={NUM} className="text-xs w-16 text-right">{fmt(val)} €</span>
                </div>
              );
            })}
            <p className="text-[10px] pt-1" style={{ color: TEXT_MUTED }}>{period === "semaine" ? "Dépenses variables de la semaine" : "Charges fixes + dépenses variables du mois"}</p>
          </Card>
        )}
      </div>

      <div>
        <SectionTitle action={data.expenses.length > 0 && <LinkButton onClick={onGoToExpenses}>Tout voir</LinkButton>}>Derniers mouvements</SectionTitle>
        {recent.length === 0 ? <EmptyState icon="receipt" text="Aucune dépense pour l'instant. Touche le bouton + pour noter la première." /> : (
          <Card className="!p-2">
            {recent.map((e, i) => <ExpenseRow key={e.id} expense={e} onClick={() => onEditExpense(e)} divider={i > 0} showDate />)}
          </Card>
        )}
      </div>

      <NextBadgeCard data={data} onOpen={onGoToParcours} />

      {data.goals.length > 0 && (
        <div>
          <SectionTitle action={<LinkButton onClick={onGoToSavings}>Épargne</LinkButton>}>Objectifs en cours</SectionTitle>
          <div className="space-y-2">
            {data.goals.slice(0, 3).map((g) => {
              const pct = Math.round(goalPct(g));
              return (
                <button key={g.id} onClick={onGoToSavings} className="press w-full text-left rounded-xl px-4 py-3 border" style={{ backgroundColor: SURFACE, borderColor: BORDER }}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-2">{pct >= 100 && <Icon name="trophy" size={11} style={{ color: GOLD }} />}{g.name}</span>
                    <span style={{ ...NUM, color: pct >= 100 ? GOLD : ROSE }} className="font-semibold">{pct}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: BG }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: pct >= 100 ? GOLD : `linear-gradient(90deg, ${ROSE_PALE}, ${ROSE})` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const LIMIT_STATUS = {
  ok: { color: SAGE, icon: "circle-check", label: "Dans les clous" },
  warning: { color: GOLD, icon: "circle-exclamation", label: "Bientôt atteint" },
  over: { color: DANGER, icon: "triangle-exclamation", label: "Dépassé" },
};

function LimitsCard({ usage, onEdit }) {
  if (usage.length === 0) {
    return (
      <button onClick={onEdit} className="press w-full rounded-2xl p-4 flex items-center gap-3 text-left border border-dashed" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#4E7FAE1F", color: "#4E7FAE" }}><Icon name="shield-halved" size={14} /></div>
        <div className="flex-1">
          <p className="text-sm font-medium">Fixe tes plafonds</p>
          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Un montant max par catégorie, et l'app t'alerte avant que ça déborde.</p>
        </div>
        <Icon name="chevron-right" size={11} style={{ color: TEXT_MUTED }} />
      </button>
    );
  }
  return (
    <div>
      <SectionTitle action={<LinkButton onClick={onEdit}>Gérer</LinkButton>}>Plafonds du mois</SectionTitle>
      <Card className="space-y-4">
        {usage.map((u) => {
          const st = LIMIT_STATUS[u.status];
          return (
            <div key={u.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon name={u.icon} size={11} style={{ color: u.color }} />
                <span className="text-xs flex-1">{u.label}</span>
                <span className="text-xs" style={NUM}>{fmt(u.spent)} <span style={{ color: TEXT_MUTED }}>/ {fmt(u.limit)} €</span></span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: BG }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, u.ratio * 100)}%`, backgroundColor: st.color }} />
              </div>
              <p className="text-[10px] mt-1 inline-flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                <Icon name={st.icon} size={9} style={{ color: st.color }} /> {st.label}
                {u.status !== "over" ? ` · reste ${fmt(u.limit - u.spent)} €` : ` · +${fmt(u.spent - u.limit)} €`}
              </p>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function MonthHistoryCard({ history, onEditMonthIncome }) {
  const [selectedKey, setSelectedKey] = useState(null);
  if (history.length === 0) return null;
  const selected = history.find((m) => m.key === selectedKey) || history[history.length - 1];
  const index = history.indexOf(selected);
  const previous = index > 0 ? history[index - 1] : null;
  const max = Math.max(1, ...history.map((m) => Math.max(m.total + m.saved, m.income || 0))) * 1.08;
  const balance = selected.balance;
  const delta = previous && previous.total > 0 ? Math.round(((selected.total - previous.total) / previous.total) * 100) : null;
  const H = 120;
  return (
    <div>
      <SectionTitle>Mois par mois</SectionTitle>
      <Card>
        <div className="flex items-center gap-4 text-[10px] mb-3" style={{ color: TEXT_MUTED }}>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ROSE }} /> Dépensé</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: TEXT }} /> Revenu</span>
        </div>
        <div className="flex items-end gap-2" style={{ height: H + 20 }} role="list" aria-label="Dépenses des derniers mois">
          {history.map((m) => {
            const isSel = m.key === selected.key;
            const barH = Math.max(3, ((m.total + m.saved) / max) * H);
            const incomeY = ((m.income || 0) / max) * H;
            return (
              <button key={m.key} role="listitem" onClick={() => setSelectedKey(m.key)} aria-label={`${monthLabelLong(m.key)} : ${fmt(m.total + m.saved)} € dépensés`}
                className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="relative w-full flex justify-center" style={{ height: H }}>
                  {m.income > 0 && <div className="absolute rounded-full" style={{ bottom: incomeY, height: 2, left: "12%", right: "12%", backgroundColor: TEXT, opacity: isSel ? 0.9 : 0.35 }} />}
                  <div className="absolute bottom-0 transition-all duration-500" style={{ width: "56%", maxWidth: 26, height: barH, borderRadius: "4px 4px 0 0", backgroundColor: ROSE, opacity: isSel ? 1 : 0.35 }} />
                </div>
                <span className="text-[10px] mt-1.5 capitalize" style={{ color: isSel ? TEXT : TEXT_MUTED, fontWeight: isSel ? 600 : 400 }}>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t" style={{ borderColor: BORDER }}>
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium capitalize">{monthLabelLong(selected.key)}{selected.current ? " · en cours" : ""}</p>
            {delta !== null && (
              <span className="text-[11px] inline-flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                <Icon name={delta > 0 ? "arrow-trend-up" : "arrow-trend-down"} size={10} style={{ color: delta > 0 ? DANGER : SAGE }} />
                <span style={NUM}>{delta > 0 ? "+" : ""}{delta} %</span> vs {previous.label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-xs">
            {[["Report reçu", selected.carryIn], ["Revenu", selected.income], ["Charges fixes", selected.charges], ["Dépenses variables", selected.variable], ["Épargne versée", selected.saved]].map(([label, value]) => (
              <div key={label} className="flex justify-between"><span style={{ color: TEXT_MUTED }}>{label}</span><span style={NUM}>{value === null ? "à renseigner" : `${fmt(value)} €`}</span></div>
            ))}
          </div>
          {onEditMonthIncome && (
            <button onClick={() => onEditMonthIncome(selected.key)} className="press mt-2 text-[11px] font-medium inline-flex items-center gap-1" style={{ color: ROSE }}>
              <Icon name="pen" size={9} /> {selected.incomeMissing ? "Renseigner" : "Modifier"} le revenu de {monthLabelLong(selected.key).split(" ")[0]}
            </button>
          )}
          {balance !== null ? (
            <div className="flex items-center justify-between mt-3 rounded-xl px-3 py-2" style={{ backgroundColor: BG }}>
              <span className="text-xs inline-flex items-center gap-1.5">
                <Icon name={balance >= 0 ? "leaf" : "triangle-exclamation"} size={11} style={{ color: balance >= 0 ? SAGE : DANGER }} />
                {balance >= 0 ? (selected.current ? "Solde à date" : "Reporté sur le mois suivant") : "Mois dans le rouge"}
              </span>
              <span className="text-sm font-semibold" style={NUM}>{balance >= 0 ? "+" : ""}{fmt(balance)} €</span>
            </div>
          ) : (
            <p className="text-[11px] mt-3 rounded-xl px-3 py-2" style={{ backgroundColor: BG, color: TEXT_MUTED }}>Renseigne le revenu de ce mois pour voir son solde.</p>
          )}
          {selected.estimated && !selected.current && <p className="text-[10px] mt-2" style={{ color: TEXT_MUTED }}>Charges estimées avec tes montants actuels (pas encore d'historique enregistré pour ce mois).</p>}
        </div>
      </Card>
    </div>
  );
}

function NextBadgeCard({ data, onOpen }) {
  const states = getBadgeStates(data);
  const unlockedCount = states.filter((b) => b.unlocked).length;
  const next = states.filter((b) => !b.unlocked).sort((a, b) => b.progress - a.progress)[0];
  return (
    <button onClick={onOpen} className="press w-full rounded-2xl p-4 flex items-center gap-4 text-left border" style={{ backgroundColor: SURFACE, borderColor: BORDER, boxShadow: SHADOW }}>
      <div className="relative w-12 h-12 shrink-0">
        <div className="w-12 h-12 rounded-full" style={{ background: `conic-gradient(${next ? next.color : GOLD} 0 ${next ? next.progress * 100 : 100}%, ${BORDER} 0 100%)` }} />
        <div className="absolute rounded-full flex items-center justify-center" style={{ inset: 4, backgroundColor: SURFACE, color: next ? next.color : GOLD }}><Icon name={next ? next.icon : "crown"} size={15} /></div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: TEXT_MUTED }}>{next ? "Prochain badge" : "Collection complète"} · {unlockedCount}/{states.length}</p>
        <p className="text-sm font-medium truncate">{next ? next.label : "Tous les badges débloqués !"}</p>
        <p className="text-[11px] truncate" style={{ color: TEXT_MUTED }}>{next ? `${next.desc} — ${next.money ? `${fmt(next.current)} / ${fmt(next.goal)} €` : `${next.current}/${next.goal}`}` : "Tu es une pro du budget."}</p>
      </div>
      <Icon name="chevron-right" size={11} style={{ color: TEXT_MUTED }} />
    </button>
  );
}

function BadgesSection({ data }) {
  const states = getBadgeStates(data);
  const unlocked = states.filter((b) => b.unlocked);
  const ordered = [...unlocked, ...states.filter((b) => !b.unlocked).sort((a, b) => b.progress - a.progress)];
  return (
    <div>
      <SectionTitle action={<span className="text-xs" style={{ ...NUM, color: TEXT_MUTED }}>{unlocked.length} / {states.length}</span>}>Tes badges</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {ordered.map((b) => (
          <div key={b.id} className="rounded-2xl border p-3 flex flex-col gap-2" style={{ backgroundColor: SURFACE, borderColor: b.unlocked ? b.color + "55" : BORDER, boxShadow: b.unlocked ? SHADOW : "none" }}>
            <div className="flex items-center gap-2.5">
              <div className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={b.unlocked ? { background: `linear-gradient(135deg, ${b.color}33, ${b.color}66)`, color: b.color } : { backgroundColor: BG, color: "#BCAAAD" }}>
                <Icon name={b.icon} size={15} />
                {!b.unlocked && <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: SURFACE, color: TEXT_MUTED, border: `1px solid ${BORDER}` }}><Icon name="lock" size={7} /></span>}
              </div>
              <p className="text-xs font-semibold leading-tight" style={{ color: b.unlocked ? TEXT : TEXT_MUTED }}>{b.label}</p>
            </div>
            <p className="text-[10.5px] leading-snug" style={{ color: TEXT_MUTED }}>{b.desc}</p>
            {b.unlocked ? (
              <p className="text-[10px] inline-flex items-center gap-1" style={{ color: b.color }}><Icon name="circle-check" size={9} /> {b.unlockedAt ? `Obtenu le ${new Date(b.unlockedAt).toLocaleDateString("fr-FR")}` : "Obtenu"}</p>
            ) : (
              <div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: BG }}><div className="h-full rounded-full" style={{ width: `${b.progress * 100}%`, backgroundColor: b.color, opacity: 0.7 }} /></div>
                <p className="text-[10px] mt-1" style={{ ...NUM, color: TEXT_MUTED }}>{b.money ? `${fmt(b.current)} / ${fmt(b.goal)} €` : `${b.current} / ${b.goal}`}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileCard({ profile, onEdit }) {
  if (!profile) return null;
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const groups = [
    { title: "Ce qui t'amène", items: list(profile.motivation).map((id) => MOTIVATIONS.find((m) => m.id === id)).filter(Boolean) },
    { title: "Tes projets", items: list(profile.projectType).map((id) => PROJECT_TYPES.find((p) => p.id === id)).filter(Boolean) },
    { title: "Ta relation à l'argent", items: list(profile.relationship).map((id) => RELATIONSHIPS.find((r) => r.id === id)).filter(Boolean) },
    { title: "Rythme de suivi", items: list(profile.frequency).map((id) => FREQUENCIES.find((f) => f.id === id)).filter(Boolean) },
  ].filter((g) => g.items.length > 0);
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-[0.15em]" style={{ color: ROSE }}>Ton profil</p>
        <button onClick={onEdit} className="press text-xs px-3 py-1.5 rounded-full inline-flex items-center gap-1" style={{ backgroundColor: SURFACE_ALT, color: ROSE }}><Icon name="pen" size={9} /> Modifier</button>
      </div>
      {groups.length === 0 ? <p className="text-xs" style={{ color: TEXT_MUTED }}>Complète ton profil pour personnaliser l'app.</p> : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="text-[10px] uppercase tracking-[0.1em] mb-1.5" style={{ color: TEXT_MUTED }}>{g.title}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((item) => (
                  <span key={item.id} className="text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}>
                    {item.icon && <Icon name={item.icon} size={10} style={{ color: ROSE }} />}{item.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LimitsForm({ initial, usage, onClose, onSubmit }) {
  const [limits, setLimits] = useState(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, initial[c.id] ? String(initial[c.id]) : ""])));
  const spentById = Object.fromEntries(usage.map((u) => [u.id, u.spent]));
  return (
    <Sheet title="Plafonds par catégorie" onClose={onClose}>
      <p className="text-[11px] mb-4" style={{ color: TEXT_MUTED }}>Montant maximum de dépenses variables par mois. Laisse vide pour ne pas fixer de plafond. Tu seras alertée à 80 % puis au dépassement.</p>
      <div className="space-y-2 mb-5">
        {CATEGORIES.filter((c) => c.id !== "loyer").map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2 border" style={{ borderColor: BORDER, backgroundColor: BG }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: c.color + "22", color: c.color }}><Icon name={c.icon} size={12} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{c.label}</p>
              {spentById[c.id] !== undefined && <p className="text-[10px]" style={{ color: TEXT_MUTED }}>{fmt(spentById[c.id])} € ce mois-ci</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <input type="text" inputMode="decimal" aria-label={`Plafond ${c.label}`} value={limits[c.id]} placeholder="—"
                onChange={(e) => setLimits((l) => ({ ...l, [c.id]: e.target.value.replace(/[^0-9.,]/g, "") }))}
                className="w-20 text-right rounded-lg px-2 py-1.5 text-sm focus:outline-none" style={{ ...NUM, backgroundColor: SURFACE, border: `1px solid ${BORDER}`, color: TEXT }} />
              <span className="text-xs" style={{ color: TEXT_MUTED }}>€</span>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => onSubmit(Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, Number(String(v).replace(",", ".")) || 0]).filter(([, v]) => v > 0)))}
        className="press w-full py-3.5 rounded-xl font-medium text-sm" style={{ background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, color: "#FFFFFF" }}>
        Enregistrer les plafonds
      </button>
    </Sheet>
  );
}

function ExpenseRow({ expense, onClick, divider, showDate }) {
  const c = catInfo(expense.category);
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-xl transition-colors" style={{ borderTop: divider ? `1px solid ${BORDER}80` : "none" }}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: c.color + "22", color: c.color }}><Icon name={c.icon} size={13} /></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{expense.name || c.label}</p>
        <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{c.label}{showDate && expense.date ? ` · ${dayHeading(expense.date)}` : ""}</p>
      </div>
      <p style={NUM} className="text-sm font-semibold shrink-0">−{fmt(expense.amount)} €</p>
    </button>
  );
}

function TipCard() {
  const tip = pickByDay(TIPS);
  return (
    <div className="rounded-xl p-4 flex gap-3" style={{ backgroundColor: SURFACE_ALT, border: `1px solid ${BORDER}` }}>
      <span style={{ fontSize: 18 }} className="shrink-0"><Icon name="lightbulb" size={16} /></span>
      <div>
        <p className="text-[11px] uppercase tracking-[0.15em] mb-1" style={{ color: GOLD }}>Conseil du jour</p>
        <p className="text-xs leading-relaxed">{tip}</p>
      </div>
    </div>
  );
}

function AddButton({ onClick, children }) {
  return (
    <button onClick={onClick} className="press flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-full font-medium" style={{ background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, color: "#FFFFFF", boxShadow: SHADOW }}>
      <Icon name="plus" size={10} /> {children}
    </button>
  );
}

function Charges({ charges, totalCharges, monthlyIncome, onAdd, onEdit, onDelete }) {
  const sorted = [...charges].sort((a, b) => Number(b.amount) - Number(a.amount));
  const share = monthlyIncome > 0 ? Math.round((totalCharges / monthlyIncome) * 100) : null;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] uppercase tracking-[0.15em]" style={{ color: ROSE }}>{charges.length} charge{charges.length > 1 ? "s" : ""} fixe{charges.length > 1 ? "s" : ""}</p>
        <AddButton onClick={onAdd}>Ajouter</AddButton>
      </div>
      <p style={NUM} className="text-3xl font-semibold mt-1">{fmt(totalCharges)} € <span className="text-sm font-normal" style={{ color: TEXT_MUTED }}>/ mois</span></p>
      {share !== null && (
        <div className="mt-3 mb-5">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: BORDER }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, share)}%`, backgroundColor: share > 60 ? DANGER : GOLD }} />
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: TEXT_MUTED }}><span style={NUM}>{share}%</span> de ton revenu part en charges fixes{share > 60 ? " — c'est beaucoup, un abonnement à revoir ?" : ""}</p>
        </div>
      )}
      {share === null && <div className="mb-5" />}
      {sorted.length === 0 ? <EmptyState icon="receipt" text="Aucune charge fixe définie. Ajoute ton loyer, tes abonnements, ton assurance… pour prévoir ton budget chaque mois, sans avoir à tout ressaisir." /> : (
        <div className="space-y-2 stagger">
          {sorted.map((c) => {
            const info = catInfo(c.category);
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-2xl px-3 py-3 border" style={{ backgroundColor: SURFACE, borderColor: BORDER }}>
                <button onClick={() => onEdit(c)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: info.color + "22", color: info.color }}><Icon name={info.icon} size={14} /></div>
                  <div className="flex-1 min-w-0"><p className="text-sm truncate">{c.name || info.label}</p><p className="text-[11px]" style={{ color: TEXT_MUTED }}>{info.label}</p></div>
                  <p style={NUM} className="text-sm font-semibold shrink-0">{fmt(c.amount)} €</p>
                </button>
                <button onClick={() => onDelete(c.id)} aria-label="Supprimer" style={{ color: TEXT_MUTED }} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full"><Icon name="trash" size={12} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Expenses({ period, setPeriod, periodExpenses, periodTotal, onEdit, onAdd, nextMajorExpense }) {
  const sorted = [...periodExpenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const groups = [];
  sorted.forEach((e) => {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) { last.items.push(e); last.total += Number(e.amount || 0); }
    else groups.push({ date: e.date, items: [e], total: Number(e.amount || 0) });
  });
  const nextExpenseLabel = nextMajorExpense ? (nextMajorExpense.name || catInfo(nextMajorExpense.category)?.label || "Dépense importante") : "";
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PeriodToggle period={period} setPeriod={setPeriod} />
        <AddButton onClick={onAdd}>Ajouter</AddButton>
      </div>
      <p className="text-[11px] uppercase tracking-[0.15em] mb-1" style={{ color: ROSE }}>Dépenses variables · {period === "semaine" ? "cette semaine" : "ce mois-ci"}</p>
      <p style={NUM} className="text-3xl font-semibold mb-4">{fmt(periodTotal)} €</p>
      {nextMajorExpense && (
        <div className="rounded-2xl border p-3 mb-5 flex items-center gap-3" style={{ backgroundColor: SURFACE_ALT, borderColor: BORDER }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: SURFACE, color: GOLD }}><Icon name="triangle-exclamation" size={12} /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.1em]" style={{ color: ROSE }}>Plus grosse sortie à prévoir</p>
            <p className="text-sm truncate">{nextExpenseLabel}</p>
          </div>
          <p style={{ ...NUM, color: GOLD }} className="text-sm font-semibold shrink-0">{fmt(nextMajorExpense.amount)} €</p>
        </div>
      )}
      {groups.length === 0 ? <EmptyState icon="wallet" text="Aucune dépense variable pour cette période. Les charges fixes (loyer, abonnements…) se gèrent dans l'onglet Charges." /> : (
        <div className="space-y-5 stagger">
          {groups.map((g) => (
            <div key={g.date || "none"}>
              <div className="flex items-center justify-between px-1 mb-1.5">
                <p className="text-xs font-medium first-letter:uppercase" style={{ color: TEXT }}>{dayHeading(g.date)}</p>
                <p style={{ ...NUM, color: TEXT_MUTED }} className="text-xs">−{fmt(g.total)} €</p>
              </div>
              <Card className="!p-2">
                {g.items.map((e, i) => <ExpenseRow key={e.id} expense={e} onClick={() => onEdit(e)} divider={i > 0} />)}
              </Card>
            </div>
          ))}
          <p className="text-[11px] text-center" style={{ color: TEXT_MUTED }}>Touche une dépense pour la modifier ou la supprimer.</p>
        </div>
      )}
    </div>
  );
}

function Savings({ goals, onAdd, onDelete, onContribute, onEdit }) {
  const totalSaved = goals.reduce((s, g) => s + Number(g.current || 0), 0);
  const totalTarget = goals.reduce((s, g) => s + Number(g.target || 0), 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] uppercase tracking-[0.15em]" style={{ color: ROSE }}>{goals.length} objectif{goals.length > 1 ? "s" : ""}</p>
        <AddButton onClick={onAdd}>Nouvel objectif</AddButton>
      </div>
      {goals.length > 0 && (
        <p style={NUM} className="text-3xl font-semibold mt-1 mb-5">{fmt(totalSaved)} € <span className="text-sm font-normal" style={{ color: TEXT_MUTED }}>/ {fmt(totalTarget)} € épargnés</span></p>
      )}
      {goals.length === 0 ? <div className="mt-4"><EmptyState icon="piggy-bank" text="Crée un objectif d'épargne pour commencer à suivre tes progrès." /></div> : (
        <div className="space-y-4 stagger">{goals.map((g) => <GoalCard key={g.id} goal={g} onDelete={onDelete} onEdit={onEdit} onContribute={onContribute} />)}</div>
      )}
    </div>
  );
}

function GoalCard({ goal, onDelete, onEdit, onContribute }) {
  const [amount, setAmount] = useState("");
  const [contributionOrigin, setContributionOrigin] = useState("income");
  const pct = goalPct(goal);
  const done = pct >= 100;
  const accent = done ? GOLD : ROSE;
  const ticks = 20;
  const filledTicks = Math.round((pct / 100) * ticks);
  const months = goal.deadline && !done ? monthsUntil(goal.deadline) : null;
  const monthlyNeeded = months ? Math.max(0, goal.target - goal.current) / months : null;
  const deadlineLabel = goal.deadline ? parseDay(goal.deadline).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : null;
  const traceItems = Array.isArray(goal.trace) ? goal.trace : [];
  return (
    <Card style={done ? { borderColor: GOLD + "88", background: `linear-gradient(160deg, #FFFFFF 40%, ${GOLD}14 100%)` } : {}}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: accent + "1F", color: accent }}><Icon name={done ? "trophy" : "bullseye"} size={14} /></div>
          <div className="min-w-0">
            <p style={{ fontFamily: "'Lora', serif" }} className="text-lg leading-tight truncate">{goal.name}</p>
            {done ? <p className="text-[11px] font-medium" style={{ color: GOLD }}>Objectif atteint, bravo !</p>
              : deadlineLabel && <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Échéance : {deadlineLabel}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(goal)} aria-label="Modifier" className="w-8 h-8 flex items-center justify-center rounded-full" style={{ color: TEXT_MUTED }}><Icon name="pen" size={12} /></button>
          <button onClick={() => onDelete(goal.id)} aria-label="Supprimer" className="w-8 h-8 flex items-center justify-center rounded-full" style={{ color: TEXT_MUTED }}><Icon name="trash" size={12} /></button>
        </div>
      </div>
      {goal.source && (
        <div className="mt-3 rounded-lg border px-3 py-2 text-[11px]" style={{ backgroundColor: SURFACE_ALT, borderColor: BORDER }}>
          <p>Origine : <span style={{ color: TEXT }}>{goal.source}</span></p>
        </div>
      )}
      <div className="mt-4 flex gap-[3px] h-6 items-end">
        {Array.from({ length: ticks }).map((_, i) => <div key={i} className="flex-1 rounded-sm transition-all duration-500" style={{ height: i < filledTicks ? "100%" : "40%", backgroundColor: i < filledTicks ? accent : BORDER, transitionDelay: `${i * 15}ms` }} />)}
      </div>
      <div className="flex items-center justify-between mt-3">
        <p style={NUM} className="text-sm">{fmt(goal.current)} / {fmt(goal.target)} €</p>
        <p style={{ ...NUM, color: accent }} className="text-sm font-semibold">{Math.round(pct)}%</p>
      </div>
      {monthlyNeeded !== null && <p className="text-[11px] mt-1.5" style={{ color: SAGE }}>≈ {fmt(monthlyNeeded)} €/mois pour l'atteindre d'ici {deadlineLabel}</p>}
      {traceItems.length > 0 && (
        <div className="mt-3 rounded-lg border px-3 py-2" style={{ backgroundColor: BG, borderColor: BORDER }}>
          <p className="text-[10px] uppercase tracking-[0.12em] mb-1" style={{ color: TEXT_MUTED }}>Historique</p>
          {traceItems.slice(-3).reverse().map((entry) => (
            <p key={entry.id} className="text-[11px] leading-relaxed" style={{ color: TEXT_MUTED }}>
              {new Date(entry.createdAt).toLocaleDateString("fr-FR")} · {entry.label} · <span style={{ ...NUM, color: SAGE }}>+{fmt(entry.amount)} €</span>
            </p>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <input type="number" inputMode="decimal" placeholder="Montant" value={amount} onChange={(ev) => setAmount(ev.target.value)}
          className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ backgroundColor: BG, border: `1px solid ${BORDER}`, color: TEXT }} />
        <select value={contributionOrigin} onChange={(ev) => setContributionOrigin(ev.target.value)} className="rounded-lg px-2 py-2 text-xs" style={{ backgroundColor: BG, border: `1px solid ${BORDER}`, color: TEXT }}>
          <option value="income">Revenu / salaire</option>
          <option value="gift">Don / cadeau</option>
          <option value="other">Autre</option>
        </select>
        <button onClick={() => { const n = Number(amount); if (n > 0) { onContribute(goal.id, n, contributionOrigin); setAmount(""); } }}
          className="press px-3 py-2 rounded-lg text-sm font-medium shrink-0" style={{ backgroundColor: SAGE, color: "#FFFFFF" }}>Verser</button>
      </div>
      {contributionOrigin === "income" && <p className="text-[10px] mt-1.5" style={{ color: TEXT_MUTED }}>Un versement depuis ton revenu est déduit de ton reste à vivre du mois.</p>}
    </Card>
  );
}

function StepIcon({ done }) {
  if (done) return <div style={{ width: 18, height: 18, borderRadius: "50%", backgroundColor: SAGE, color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }} className="shrink-0">✓</div>;
  return <div style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${BORDER}` }} className="shrink-0" />;
}

function Parcours({ data, remaining, monthlyIncome, onEditProfile, onExportPdf, onExportExcel, onImport, onLogout }) {
  const hasIncome = monthlyIncome > 0;
  const hasCharges = data.charges.length > 0;
  const hasGoal = data.goals.length > 0;
  const hasContribution = data.goals.some((g) => g.current > 0);
  const weekStart = startOfWeek();
  const activeDaysThisWeek = new Set(data.expenses.filter((e) => inRange(e.date, weekStart)).map((e) => e.date)).size;
  const hasWeeklyTracking = activeDaysThisWeek > 0;
  const financialProfile = getFinancialProfile({ remaining, monthlyIncome, plannedSavings: getPlannedSavings(data) });
  const weeklySummary = getWeeklySummary(data);
  const steps = [
    { label: "Revenu mensuel renseigné", done: hasIncome },
    { label: "Charges fixes définies", done: hasCharges },
    { label: "Un objectif d'épargne posé", done: hasGoal },
    { label: "Premier versement à l'épargne", done: hasContribution },
    { label: "Suivi de la semaine commencé", done: hasWeeklyTracking },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  let level = "Premiers pas";
  if (pct === 100) level = "Maîtrise du budget";
  else if (pct >= 80) level = "Presque au sommet";
  else if (pct >= 40) level = "Sur la bonne voie";
  else if (pct > 0) level = "En chemin";
  const reflection = pickByDay(REFLECTIONS);

  return (
    <div className="space-y-6 stagger">
      <Card>
        <div className="flex items-center gap-5">
          <div className="relative w-24 h-24 shrink-0">
            <div className="w-24 h-24 rounded-full" style={{ background: `conic-gradient(${ROSE} 0 ${pct}%, ${BORDER} ${pct}% 100%)` }} />
            <div className="absolute rounded-full flex items-center justify-center" style={{ inset: 9, backgroundColor: SURFACE }}>
              <p style={{ fontFamily: "'Lora', serif" }} className="text-2xl font-semibold">{pct}%</p>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><Icon name={pct === 100 ? "crown" : "star"} size={12} style={{ color: pct === 100 ? GOLD : ROSE }} /><p className="text-xs font-medium" style={{ color: pct === 100 ? GOLD : ROSE }}>{level}</p></div>
            <p style={{ fontFamily: "'Lora', serif" }} className="text-xl mt-1">{doneCount} / {steps.length} étapes</p>
          </div>
        </div>
        <p className="text-xs mt-4" style={{ color: TEXT_MUTED }}>
          {activeDaysThisWeek} jour{activeDaysThisWeek > 1 ? "s" : ""} actif{activeDaysThisWeek > 1 ? "s" : ""} cette semaine — cela compte un jour dès qu’au moins une dépense a été ajoutée ce jour-là.
        </p>
      </Card>
      <Card>
        <p className="text-[11px] uppercase tracking-[0.15em] mb-2" style={{ color: ROSE }}>Profil financier</p>
        <p className="text-sm font-medium">{financialProfile.label}</p>
        <p className="text-[11px] mt-1" style={{ color: TEXT_MUTED }}>{financialProfile.note}</p>
      </Card>
      <Card>
        <p className="text-[11px] uppercase tracking-[0.15em] mb-2" style={{ color: ROSE }}>Résumé hebdomadaire</p>
        <p className="text-sm leading-relaxed">{weeklySummary}</p>
      </Card>
      <div>
        <p className="text-[11px] uppercase tracking-[0.15em] mb-3" style={{ color: ROSE }}>Tes premiers pas</p>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5 border" style={{ backgroundColor: SURFACE, borderColor: BORDER }}>
              <StepIcon done={s.done} /><span className="text-sm" style={{ color: s.done ? TEXT : TEXT_MUTED }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
      <BadgesSection data={data} />
      <ProfileCard profile={data.profile} onEdit={onEditProfile} />
      <div className="rounded-xl p-4" style={{ backgroundColor: SURFACE_ALT, border: `1px solid ${BORDER}` }}>
        <p className="text-[11px] uppercase tracking-[0.15em] mb-1.5" style={{ color: ROSE }}>Question du jour</p>
        <p className="text-sm leading-relaxed">{reflection}</p>
      </div>
      <div className="rounded-xl p-4 flex gap-3" style={{ backgroundColor: SURFACE_ALT, border: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 18, color: GOLD }} className="shrink-0"><Icon name="gift" size={15} /></span>
        <p className="text-xs leading-relaxed">Un budget sain garde de la place pour se faire plaisir. La catégorie « Loisirs & plaisir » n'est pas un excès à éviter, c'est une ligne à prévoir.</p>
      </div>
      <Card>
        <p className="text-[11px] uppercase tracking-[0.15em] mb-2" style={{ color: ROSE }}>Synchronisation</p>
        <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>
          Tes données sont sauvegardées automatiquement sur ton compte et disponibles sur tous tes appareils. Tu peux aussi garder une copie locale, au cas où.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onExportPdf} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ backgroundColor: ROSE, color: "#FFFFFF" }}><span className="inline-flex items-center justify-center gap-2"><Icon name="file-pdf" size={12} /> PDF</span></button>
          <button onClick={onExportExcel} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ backgroundColor: SAGE, color: "#FFFFFF" }}><span className="inline-flex items-center justify-center gap-2"><Icon name="file-excel" size={12} /> Excel</span></button>
          <button onClick={onImport} className="col-span-2 py-2.5 rounded-lg text-sm font-medium border" style={{ borderColor: BORDER, color: TEXT }}><span className="inline-flex items-center justify-center gap-2"><Icon name="upload" size={12} /> Importer Excel</span></button>
        </div>
      </Card>
      <TipCard />
      <button onClick={onLogout} className="w-full py-3 rounded-xl text-sm border inline-flex items-center justify-center gap-2" style={{ borderColor: BORDER, color: TEXT_MUTED, backgroundColor: SURFACE }}>
        <Icon name="arrow-right-from-bracket" size={12} /> Se déconnecter
      </button>
    </div>
  );
}

function EmptyState({ text, icon = "feather" }) {
  return (
    <div className="text-center py-10 px-6 rounded-2xl border border-dashed" style={{ borderColor: BORDER, backgroundColor: SURFACE + "99" }}>
      <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: SURFACE_ALT, color: ROSE_PALE }}><Icon name={icon} size={18} /></div>
      <p className="text-sm leading-relaxed" style={{ color: TEXT_MUTED }}>{text}</p>
    </div>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 flex items-end z-50 anim-fade-in" style={{ backgroundColor: "rgba(59,46,48,0.38)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-xl mx-auto rounded-t-3xl px-5 pt-3 overflow-y-auto anim-sheet-up"
        style={{ backgroundColor: SURFACE, maxHeight: "88vh", paddingBottom: "calc(2rem + env(safe-area-inset-bottom))", boxShadow: "0 -12px 40px -16px rgba(59,46,48,0.35)" }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: BORDER }} />
        <div className="flex items-center justify-between mb-5">
          <p style={{ fontFamily: "'Lora', serif" }} className="text-xl">{title}</p>
          <button onClick={onClose} style={{ color: TEXT_MUTED, fontSize: 20 }} aria-label="Fermer"><Icon name="xmark" size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, color = "#B97A8D" }) {
  return <div className="mb-4"><label className="text-[11px] uppercase tracking-[0.15em] block mb-1.5" style={{ color }}>{label}</label>{children}</div>;
}

const inputStyle = { backgroundColor: BG, border: `1px solid ${BORDER}`, color: TEXT };
const inputClass = "w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none";

function CategoryPicker({ category, setCategory }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {CATEGORIES.map((c) => (
        <button key={c.id} onClick={() => setCategory(c.id)} className="flex flex-col items-center gap-1 py-2.5 rounded-lg border text-[10px] text-center leading-tight"
          style={{ borderColor: category === c.id ? c.color : BORDER, backgroundColor: category === c.id ? c.color + "1F" : "transparent", color: category === c.id ? TEXT : TEXT_MUTED }}>
          <Icon name={c.icon} size={16} style={{ color: category === c.id ? c.color : TEXT_MUTED }} />
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}

function ExpenseForm({ initial, onClose, onSubmit, onDelete }) {
  const [category, setCategory] = useState(initial?.category || "courses");
  const [name, setName] = useState(initial?.name || "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [date, setDate] = useState(initial?.date || todayISO());
  const parsedAmount = Number(String(amount).replace(",", "."));
  const valid = parsedAmount > 0;
  const submit = () => valid && onSubmit({ ...(initial || {}), category, name, amount: parsedAmount, date });
  return (
    <Sheet title={initial ? "Modifier la dépense" : "Nouvelle dépense"} onClose={onClose}>
      <div className="text-center mb-5">
        <div className="inline-flex items-baseline gap-1">
          <input autoFocus={!initial} type="text" inputMode="decimal" aria-label="Montant en euros" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="0"
            className="bg-transparent text-center focus:outline-none font-semibold" style={{ ...NUM, fontSize: 44, width: `${Math.max(2, String(amount).length + 1)}ch`, maxWidth: "70vw", color: TEXT }} />
          <span className="text-2xl" style={{ color: TEXT_MUTED }}>€</span>
        </div>
        {!initial && (
          <div className="flex justify-center gap-2 mt-2">
            {[5, 10, 20, 50].map((v) => (
              <button key={v} onClick={() => setAmount(String(v))} className="press text-xs px-3 py-1.5 rounded-full border" style={{ ...NUM, borderColor: BORDER, color: TEXT_MUTED }}>{v} €</button>
            ))}
          </div>
        )}
      </div>
      <Field label="Catégorie"><CategoryPicker category={category} setCategory={setCategory} /></Field>
      <Field label="Description (optionnel)"><input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : sortie, cadeau, imprévu…" /></Field>
      <Field label="Date"><input type="date" className={inputClass} style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <button disabled={!valid} onClick={submit}
        className="press w-full py-3.5 rounded-xl font-medium text-sm disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, color: "#FFFFFF" }}>
        {initial ? "Enregistrer les modifications" : "Ajouter la dépense"}
      </button>
      {initial && onDelete && (
        <button onClick={() => onDelete(initial.id)} className="w-full py-3 mt-2 text-sm inline-flex items-center justify-center gap-2" style={{ color: DANGER }}>
          <Icon name="trash" size={12} /> Supprimer cette dépense
        </button>
      )}
    </Sheet>
  );
}

function ChargeForm({ initial, onClose, onSubmit }) {
  const [category, setCategory] = useState(initial?.category || CATEGORIES[0].id);
  const [name, setName] = useState(initial?.name || "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  return (
    <Sheet title={initial ? "Modifier la charge" : "Ajouter une charge fixe"} onClose={onClose}>
      <Field label="Catégorie"><CategoryPicker category={category} setCategory={setCategory} /></Field>
      <Field label="Nom (optionnel)"><input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Loyer studio, Netflix, Forfait SFR…" /></Field>
      <Field label="Montant mensuel (€)"><input type="number" inputMode="decimal" className={inputClass} style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
      <button disabled={!amount || Number(amount) <= 0} onClick={() => onSubmit({ id: initial?.id, category, name, amount: Number(amount) })}
        className="press w-full py-3.5 rounded-xl font-medium text-sm disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, color: "#FFFFFF" }}>
        {initial ? "Enregistrer les modifications" : "Ajouter la charge"} →
      </button>
    </Sheet>
  );
}

function GoalForm({ initial, onClose, onSubmit }) {
  const [name, setName] = useState(initial?.name || "");
  const [target, setTarget] = useState(initial?.target ?? "");
  const [current, setCurrent] = useState(initial?.current ?? "");
  const [deadline, setDeadline] = useState(initial?.deadline || "");
  const [source, setSource] = useState(initial?.source || "");
  return (
    <Sheet title={initial ? "Modifier l'objectif" : "Nouvel objectif d'épargne"} onClose={onClose}>
      <Field label="Nom de l'objectif"><input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Installation à Valence" /></Field>
      <Field label="Montant cible (€)"><input type="number" inputMode="decimal" className={inputClass} style={inputStyle} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" /></Field>
      <Field label="Déjà épargné (optionnel)"><input type="number" inputMode="decimal" className={inputClass} style={inputStyle} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0" /></Field>
      <Field label="Date cible (optionnel)"><input type="date" className={inputClass} style={inputStyle} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
      <Field label="Origine de l'épargne"><input className={inputClass} style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Salaire, don, bonus, projet…" /></Field>
      <p className="text-[11px] mb-3" style={{ color: TEXT_MUTED }}>Le montant que tu vas verser sur l'objectif sera déduit de ton revenu si tu choisis une origine liée au salaire ou au revenu. Sinon, il ne modifie pas ton revenu.</p>
      <button disabled={!name || !target || Number(target) <= 0} onClick={() => onSubmit({
        id: initial?.id,
        name,
        target: Number(target),
        current: Number(current) || 0,
        deadline,
        source,
        trace: initial?.trace || []
      })}
        className="press w-full py-3.5 rounded-xl font-medium text-sm disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, color: "#FFFFFF" }}>{initial ? "Enregistrer les changements" : "Créer l'objectif"} →</button>
    </Sheet>
  );
}

function CarryForm({ carry, onClose, onSubmit }) {
  const [amount, setAmount] = useState(String(carry.amount));
  const parsed = Number(String(amount).replace(",", "."));
  const valid = amount !== "" && parsed >= 0;
  return (
    <Sheet title={`Report de ${carry.fromLabel}`} onClose={onClose}>
      <p className="text-[11px] mb-4" style={{ color: TEXT_MUTED }}>L'argent restant à la fin d'un mois s'ajoute automatiquement au suivant. Si le montant réel est différent (dépense oubliée, argent déjà mis de côté…), corrige-le ici : les mois suivants repartiront de ce chiffre.</p>
      <Field label="Montant reporté (€)"><input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0" /></Field>
      <p className="text-[11px] mb-4" style={{ color: TEXT_MUTED }}>Calcul automatique : <span style={NUM}>{fmt(carry.auto)} €</span></p>
      <button disabled={!valid} onClick={() => onSubmit(parsed)} className="press w-full py-3.5 rounded-xl font-medium text-sm disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, color: "#FFFFFF" }}>Enregistrer le report</button>
      {carry.overridden && <button onClick={() => onSubmit(null)} className="w-full py-3 mt-2 text-sm" style={{ color: TEXT_MUTED }}>Revenir au calcul automatique</button>}
    </Sheet>
  );
}

/* ---------- Prévision (budget sur plusieurs mois) ---------- */

const PLAN = "#5866A8";
const PLAN_DEEP = "#3E4A85";
const PLAN_GRADIENT = `linear-gradient(135deg, ${PLAN} 0%, ${PLAN_DEEP} 100%)`;
const DEFAULT_FORECAST = { capital: 0, startMonth: null, months: 9, monthlyIncome: 0, cushion: 0, reductions: {}, purchases: [], reviews: {} };
const SAVING_TIPS = {
  loyer: "Vérifie tes droits aux aides au logement (APL), et pense à la colocation si le loyer pèse trop.",
  abonnements: "Garde un seul service de streaming à la fois et résilie ce que tu n'as pas utilisé ce mois-ci.",
  courses: "Menus de la semaine + liste, marques distributeur, et jamais de courses le ventre vide.",
  shopping: "Règle des 48 h : note l'envie, attends deux jours, et achète seulement si elle est toujours là.",
  transport: "Pass mensuel, covoiturage, vélo ou marche pour les petits trajets.",
  assurance: "Compare ton contrat une fois par an et regroupe tes assurances chez un seul assureur.",
  telephone: "Un forfait sans engagement à moins de 10 € suffit souvent.",
  sante: "Vérifie ta mutuelle et tes remboursements, demande les génériques.",
  plaisir: "Fixe une enveloppe plaisir par semaine et alterne sorties payantes et sorties gratuites.",
  autres: "Note chaque petite dépense : ce sont souvent elles qui font déborder le mois.",
};
const MOODS = [
  { id: "bien", label: "Bien tenu", icon: "face-smile", color: SAGE },
  { id: "moyen", label: "Moyen", icon: "face-meh", color: GOLD },
  { id: "difficile", label: "Difficile", icon: "face-frown", color: DANGER },
];
const eur = (n) => `${fmt(Math.round(Number(n) || 0))} €`;
const parseAmount = (v) => Math.max(0, Number(String(v ?? "").replace(",", ".")) || 0);

function addMonthsKey(key, n) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}
function getForecastPlan(data) { return { ...DEFAULT_FORECAST, ...(data?.forecast || {}) }; }

// Dépenses variables regroupées par mois (total, par catégorie, et la liste).
function getVariableByMonth(data) {
  const map = {};
  (data?.expenses || []).forEach((e) => {
    const day = parseDay(e.date);
    if (!day || isNaN(day)) return;
    const key = monthKey(day);
    const bucket = map[key] || (map[key] = { total: 0, cats: {}, items: [] });
    const amount = Number(e.amount || 0);
    bucket.total += amount;
    bucket.cats[e.category] = (bucket.cats[e.category] || 0) + amount;
    bucket.items.push(e);
  });
  return map;
}

// Épargne prise sur le revenu, par mois (les dons et cadeaux versés sur un objectif ne comptent pas).
function getIncomeSavingsByMonth(data) {
  const map = {};
  (data?.goals || []).forEach((g) => (g.trace || []).forEach((t) => {
    if (t.direction !== "decrease" || !t.createdAt) return;
    const key = monthKey(new Date(t.createdAt));
    map[key] = (map[key] || 0) + Number(t.amount || 0);
  }));
  return map;
}

const nameWords = (s) => String(s || "").toLowerCase().replace(/œ/g, "oe").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w.length > 2).map((w) => w.replace(/s$/, ""));

// Retrouve dans les dépenses de Budget les paiements d'un achat prévu :
// même nom (au moins un mot en commun) et montant proche du prix ou d'une mensualité.
function matchPurchases(purchases, expenses) {
  const used = new Set();
  const result = {};
  purchases.forEach((p) => {
    const words = nameWords(p.name);
    const fromKey = addMonthsKey(p.month, -1);
    const installment = p.price / p.spread;
    const close = (amount, ref) => ref > 0 && Math.abs(amount - ref) <= ref * 0.2;
    const found = words.length === 0 ? [] : expenses.filter((e) => {
      if (used.has(e.id)) return false;
      const day = parseDay(e.date);
      if (!day || isNaN(day) || monthKey(day) < fromKey) return false;
      const amount = Number(e.amount || 0);
      if (!close(amount, p.price) && !close(amount, installment)) return false;
      const ew = nameWords(e.name);
      return words.some((w) => ew.includes(w));
    }).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let paid = 0;
    const hits = [];
    for (const e of found) {
      if (paid >= p.price * 0.95) break;
      paid += Number(e.amount || 0);
      hits.push(e);
      used.add(e.id);
    }
    result[p.id] = { hits, paid: Math.min(paid, p.price), months: hits.map((e) => monthKey(parseDay(e.date))) };
  });
  return result;
}

// Projection mois par mois : les mois passés utilisent le réel, le mois en cours le rythme actuel,
// les mois à venir le rythme habituel (charges + moyenne des dépenses variables) moins les efforts prévus.
function getForecast(data, override) {
  const plan = { ...getForecastPlan(data), ...(override || {}) };
  const nowKey = monthKey();
  const start = plan.startMonth || nowKey;
  const count = Math.min(60, Math.max(1, Math.round(Number(plan.months) || 1)));
  const capital = Number(plan.capital) || 0;
  // Revenus : ceux de l'onglet Budget (mois passés = revenus enregistrés pour ce mois), ou un montant fixe choisi dans le plan.
  const linkedIncome = plan.incomeSource !== "manual";
  const budgetIncome = getMonthlyIncome(data);
  const income = linkedIncome ? budgetIncome : Number(plan.monthlyIncome) || 0;
  const incomeFor = (key) => {
    if (!linkedIncome || key >= nowKey) return income;
    const snap = data.months?.[key]?.income;
    return snap != null ? Number(snap) : budgetIncome;
  };
  const savedByMonth = getIncomeSavingsByMonth(data);
  const cushion = Number(plan.cushion) || 0;
  const charges = totalChargesOf(data);
  const byMonth = getVariableByMonth(data);
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const reductions = Object.values(plan.reductions || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const rawPurchases = (plan.purchases || []).map((p) => ({ ...p, month: p.month || nowKey, price: Number(p.price) || 0, spread: Math.max(1, Number(p.spread) || 1), monthlySaving: Number(p.monthlySaving) || 0, monthlyCost: Number(p.monthlyCost) || 0 }));
  const matches = matchPurchases(rawPurchases.filter((p) => !p.done && !p.ignoreMatch), data.expenses || []);
  // Ce qui reste à payer pour chaque achat, réparti sur ses mensualités pas encore passées.
  const purchases = rawPurchases.map((p) => {
    const m = matches[p.id] || { hits: [], paid: 0, months: [] };
    const autoDone = !p.done && m.paid >= p.price * 0.95;
    const done = p.done || autoDone;
    const remaining = done ? 0 : Math.max(0, p.price - m.paid);
    let schedule = Array.from({ length: p.spread }, (_, i) => addMonthsKey(p.month, i)).filter((k) => k >= nowKey && !m.months.includes(k));
    if (remaining > 0 && schedule.length === 0) schedule = [nowKey < p.month ? p.month : nowKey];
    return { ...p, done, autoDone, paid: m.paid, hits: m.hits, remaining, schedule };
  });
  // Les achats prévus repérés dans les dépenses sont des paiements uniques : ils ne servent pas à calculer le rythme habituel.
  const oneOff = {};
  purchases.forEach((p) => p.hits.forEach((e) => { const k = monthKey(parseDay(e.date)); oneOff[k] = (oneOff[k] || 0) + Number(e.amount || 0); }));
  const usualVar = (k) => Math.max(0, (byMonth[k]?.total || 0) - (oneOff[k] || 0));
  const currentPace = (usualVar(nowKey) / Math.max(1, today.getDate())) * daysInMonth;
  const recent = [1, 2, 3].map((i) => monthKey(new Date(today.getFullYear(), today.getMonth() - i, 1))).filter((k) => byMonth[k]);
  const baselineVar = recent.length ? recent.reduce((s, k) => s + usualVar(k), 0) / recent.length : currentPace;
  // En début de mois, le rythme du mois en cours n'est pas encore fiable : on s'appuie sur l'habitude.
  const projectedVar = (oneOff[nowKey] || 0) + Math.max(usualVar(nowKey), today.getDate() >= 7 || !recent.length ? currentPace : baselineVar);
  const purchaseCostIn = (key) => purchases.reduce((s, p) => (p.remaining > 0 && p.schedule.includes(key) ? s + p.remaining / p.schedule.length : s), 0);
  const effectIn = (key) => purchases.reduce((s, p) => (p.month < key ? s + p.monthlyCost - p.monthlySaving : s), 0);
  const incomes = Array.from({ length: count }, (_, i) => incomeFor(addMonthsKey(start, i)));
  const envelope = (capital + incomes.reduce((s, v) => s + v, 0) - cushion - purchases.reduce((s, p) => s + p.price, 0)) / count;

  let balance = capital;
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const key = addMonthsKey(start, i);
    const status = key < nowKey ? "past" : key === nowKey ? "current" : "future";
    const monthCharges = status === "past" ? Number(data.months?.[key]?.charges ?? charges) : charges;
    const variable = byMonth[key]?.total || 0;
    const purchaseCost = status === "past" ? 0 : purchaseCostIn(key);
    const saved = status === "future" ? 0 : savedByMonth[key] || 0;
    const monthIncome = incomes[i];
    let spent;
    if (status === "past") spent = monthCharges + variable + saved;
    else if (status === "current") spent = monthCharges + projectedVar + saved + purchaseCost;
    else spent = Math.max(0, monthCharges + baselineVar - reductions + effectIn(key)) + purchaseCost;
    const startBalance = balance;
    balance += monthIncome - spent;
    rows.push({ key, status, income: monthIncome, charges: monthCharges, variable, saved, purchaseCost, spent, soFar: status === "current" ? monthCharges + variable + saved : spent, startBalance, endBalance: balance, reviewed: !!plan.reviews?.[key] });
  }

  const firstActive = rows.findIndex((r) => r.status !== "past");
  const remainingMonths = firstActive === -1 ? 0 : count - firstActive;
  const pendingPurchases = firstActive === -1 ? 0 : rows.slice(firstActive).reduce((s, r) => s + r.purchaseCost, 0);
  const envelopeNow = remainingMonths > 0 ? (rows[firstActive].startBalance + incomes.slice(firstActive).reduce((s, v) => s + v, 0) - cushion - pendingPurchases) / remainingMonths : 0;
  const finalBalance = balance;
  const margin = finalBalance - cushion;
  const futureMonthlySpend = Math.max(0, charges + baselineVar - reductions + effectIn(addMonthsKey(start, count)));
  const net = income - futureMonthlySpend;
  const shortIdx = rows.findIndex((r) => r.endBalance < cushion);
  let lastCoveredIdx;
  let balanced = false;
  if (shortIdx !== -1) lastCoveredIdx = shortIdx - 1;
  else if (net >= 0) { lastCoveredIdx = Infinity; balanced = true; }
  else lastCoveredIdx = count - 1 + Math.floor(margin / -net);
  return {
    plan, start, count, rows, capital, income, linkedIncome, budgetIncome, purchases, cushion, charges, baselineVar, reductions, envelope, envelopeNow, remainingMonths,
    finalBalance, margin, futureMonthlySpend, balanced, lastCoveredIdx,
    lastCoveredKey: Number.isFinite(lastCoveredIdx) && lastCoveredIdx >= 0 ? addMonthsKey(start, lastCoveredIdx) : null,
    endKey: addMonthsKey(start, count - 1),
    cutNeeded: margin < 0 && remainingMonths > 0 ? -margin / remainingMonths : 0,
    current: rows.find((r) => r.status === "current") || null,
    configured: !!data.forecast && (capital > 0 || income > 0),
  };
}

function forecastPendingReviews(data) {
  if (!data?.forecast) return 0;
  const fc = getForecast(data);
  return fc.configured ? fc.rows.filter((r) => r.status === "past" && !r.reviewed).length : 0;
}

// Analyse d'un mois : catégories qui ont pesé plus que d'habitude, plafonds dépassés, plus grosses dépenses.
function getMonthReview(data, key) {
  const byMonth = getVariableByMonth(data);
  const month = byMonth[key] || { total: 0, cats: {}, items: [] };
  const others = Object.keys(byMonth).filter((k) => k !== key && k < monthKey());
  const limits = data.categoryLimits || {};
  const cats = CATEGORIES.map((c) => {
    const amount = month.cats[c.id] || 0;
    const avg = others.length ? others.reduce((s, k) => s + (byMonth[k].cats[c.id] || 0), 0) / others.length : null;
    const limit = Number(limits[c.id]) || 0;
    let reason = "";
    if (limit > 0 && amount > limit) reason = `Plafond de ${eur(limit)} dépassé de ${eur(amount - limit)}`;
    else if (avg !== null && amount > avg * 1.25 && amount - avg >= 15) reason = `${eur(amount - avg)} de plus que ta moyenne (${eur(avg)})`;
    else if (avg === null && PLEASURE_CATS.includes(c.id) && month.total > 0 && amount >= month.total * 0.3) reason = `${Math.round((amount / month.total) * 100)} % de tes dépenses du mois`;
    const extra = limit > 0 && amount > limit ? amount - limit : avg !== null ? amount - avg : amount * 0.2;
    return { ...c, amount, avg, reason, suggestion: Math.max(5, Math.round(Math.max(extra, amount * 0.1) / 5) * 5) };
  }).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const top = [...month.items].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5);
  return { cats, top, total: month.total };
}

function Prevision({ data, onChange, notify }) {
  const [tab, setTab] = useState("plan");
  const [showSetup, setShowSetup] = useState(false);
  const [showReductions, setShowReductions] = useState(false);
  const [reviewKey, setReviewKey] = useState(null);
  const plan = getForecastPlan(data);
  const fc = useMemo(() => getForecast(data), [data]);
  const save = (patch, message, icon = "check") => {
    onChange({ ...plan, ...patch });
    if (message) notify(message, icon);
  };
  const pendingReviews = fc.rows.filter((r) => r.status === "past" && !r.reviewed).length;

  return (
    <>
      <main className="px-5 mt-2">
        <div key={fc.configured ? tab : "intro"} className="anim-fade-up">
          {!fc.configured ? <ForecastIntro onStart={() => setShowSetup(true)} /> : (<>
            {tab === "plan" && <ForecastOverview fc={fc} pendingReviews={pendingReviews} onEdit={() => setShowSetup(true)} onEditReductions={() => setShowReductions(true)} onReview={setReviewKey} onGoTo={setTab} />}
            {tab === "mois" && <ForecastMonths fc={fc} onOpen={setReviewKey} />}
            {tab === "achats" && (
              <PurchasePlanner data={data} fc={fc} plan={plan}
                onAdd={(p) => save({ purchases: [...(plan.purchases || []), { ...p, id: uid() }] }, `« ${p.name || "Achat"} » ajouté au plan`, "cart-plus")}
                onToggle={(p) => save({ purchases: plan.purchases.map((x) => (x.id !== p.id ? x : p.done ? { ...x, done: false, ignoreMatch: p.autoDone || x.ignoreMatch } : { ...x, done: true })) }, p.done ? "Achat remis en prévu" : "Achat marqué comme fait")}
                onDelete={(p) => { if (confirmDeleteAction("cet achat prévu")) save({ purchases: plan.purchases.filter((x) => x.id !== p.id) }, "Achat retiré du plan", "trash"); }} />
            )}
          </>)}
        </div>
      </main>

      {fc.configured && (
        <nav style={NAV_STYLE} className="flex px-2">
          <TabButton accent={PLAN} active={tab === "plan"} onClick={() => setTab("plan")} icon="chart-line" label="Mon plan" />
          <TabButton accent={PLAN} active={tab === "mois"} onClick={() => setTab("mois")} icon="calendar-days" label={pendingReviews > 0 ? `Bilans (${pendingReviews})` : "Bilans"} />
          <TabButton accent={PLAN} active={tab === "achats"} onClick={() => setTab("achats")} icon="scale-balanced" label="Achats" />
        </nav>
      )}

      {showSetup && <ForecastSetupForm initial={plan} budgetIncome={fc.budgetIncome} charges={fc.charges} baselineVar={fc.baselineVar} onClose={() => setShowSetup(false)}
        onSubmit={(patch) => { save(patch, fc.configured ? "Plan mis à jour" : "Ton plan est prêt", "chart-line"); setShowSetup(false); }} />}
      {showReductions && <ReductionsForm initial={plan.reductions || {}} onClose={() => setShowReductions(false)}
        onSubmit={(reductions) => { save({ reductions }, "Efforts enregistrés", "scissors"); setShowReductions(false); }} />}
      {reviewKey && <MonthReviewSheet data={data} fc={fc} monthKey={reviewKey} review={plan.reviews?.[reviewKey]} reductions={plan.reductions || {}} onClose={() => setReviewKey(null)}
        onSubmit={(review, reductions) => { save({ reviews: { ...(plan.reviews || {}), [reviewKey]: review }, reductions }, `Bilan de ${monthLabelLong(reviewKey).split(" ")[0]} enregistré`, "lightbulb"); setReviewKey(null); }} />}
    </>
  );
}

function PlanButton({ onClick, children, disabled }) {
  return <button disabled={disabled} onClick={onClick} className="press w-full py-3.5 rounded-xl font-medium text-sm disabled:opacity-40" style={{ background: PLAN_GRADIENT, color: "#FFFFFF" }}>{children}</button>;
}

function ForecastIntro({ onStart }) {
  const steps = [
    { icon: "sack-dollar", title: "Ton capital", text: "L'argent dont tu disposes pour les mois à venir (et tes revenus réguliers s'il y en a)." },
    { icon: "calendar-days", title: "La durée", text: "Combien de mois il doit tenir : l'app calcule ce que tu peux dépenser chaque mois." },
    { icon: "lightbulb", title: "Un bilan chaque mois", text: "Ce qui était de trop, ce que tu changes : le plan se réajuste tout seul." },
    { icon: "scale-balanced", title: "Avant chaque gros achat", text: "Simule-le : est-ce qu'il te fait sortir du budget ? Est-ce qu'il te fait économiser ?" },
  ];
  return (
    <div className="space-y-4">
      <Card style={{ background: PLAN_GRADIENT, color: "#FFFFFF", borderColor: "transparent" }}>
        <p className="text-[11px] uppercase tracking-[0.15em]" style={{ opacity: 0.8 }}>Prévision budgétaire</p>
        <p style={{ fontFamily: "'Lora', serif" }} className="text-2xl mt-2 leading-snug">Faire durer ton argent, mois après mois</p>
        <p className="text-sm mt-2" style={{ opacity: 0.85 }}>Tu as de quoi tenir plusieurs mois ? Construis ton plan pour savoir exactement combien dépenser, et jusqu'à quand ça tient.</p>
      </Card>
      <Card>
        <div className="space-y-4">
          {steps.map((s) => (
            <div key={s.title} className="flex gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: PLAN + "1A", color: PLAN }}><Icon name={s.icon} size={13} /></div>
              <div><p className="text-sm font-medium">{s.title}</p><p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{s.text}</p></div>
            </div>
          ))}
        </div>
      </Card>
      <PlanButton onClick={onStart}>Créer mon plan →</PlanButton>
    </div>
  );
}

function BalanceChart({ fc }) {
  const max = Math.max(1, fc.capital, ...fc.rows.map((r) => Math.abs(r.endBalance)));
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-end gap-1.5" style={{ height: 120, minWidth: fc.rows.length * 30 }}>
        {fc.rows.map((r) => {
          const color = r.endBalance < 0 ? DANGER : r.endBalance < fc.cushion ? GOLD : r.status === "future" ? PLAN + "88" : PLAN;
          return (
            <div key={r.key} className="flex-1 flex flex-col items-center justify-end h-full" title={`${monthLabelLong(r.key)} : ${eur(r.endBalance)}`}>
              <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, (Math.abs(r.endBalance) / max) * 100)}%`, backgroundColor: color, border: r.status === "current" ? `2px solid ${PLAN_DEEP}` : "none" }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5" style={{ minWidth: fc.rows.length * 30 }}>
        {fc.rows.map((r) => <span key={r.key} className="flex-1 text-center text-[10px] capitalize" style={{ color: r.status === "current" ? PLAN : TEXT_MUTED, fontWeight: r.status === "current" ? 600 : 400 }}>{monthLabelShort(r.key)}</span>)}
      </div>
    </div>
  );
}

function ForecastOverview({ fc, pendingReviews, onEdit, onEditReductions, onReview, onGoTo }) {
  const ok = fc.margin >= 0;
  const cur = fc.current;
  const daysLeft = daysLeftInMonth() + 1;
  const leftThisMonth = cur ? fc.envelopeNow - cur.soFar : 0;
  const reductionEntries = Object.entries(fc.plan.reductions || {}).filter(([, v]) => Number(v) > 0);
  let headline;
  if (fc.balanced) headline = "Ton budget s'équilibre";
  else if (fc.lastCoveredKey) headline = `Jusqu'à fin ${monthLabelLong(fc.lastCoveredKey)}`;
  else headline = "Pas jusqu'à la fin de ce mois";
  return (
    <div className="space-y-4">
      <Card style={{ background: PLAN_GRADIENT, color: "#FFFFFF", borderColor: "transparent" }}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.15em]" style={{ opacity: 0.8 }}>{fc.balanced ? "Tes revenus couvrent ton rythme" : "À ce rythme, ton argent tient"}</p>
          <button onClick={onEdit} className="press text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.18)" }}><Icon name="pen" size={9} /> Plan</button>
        </div>
        <p style={{ fontFamily: "'Lora', serif" }} className="text-2xl mt-1 first-letter:uppercase">{headline}</p>
        <p className="text-xs mt-1 first-letter:uppercase" style={{ opacity: 0.8 }}>Plan de {fc.count} mois : {monthLabelLong(fc.start)} → {monthLabelLong(fc.endKey)}</p>
        <div className="mt-4 px-3 py-2.5 rounded-xl text-sm flex items-start gap-2" style={{ backgroundColor: "rgba(255,255,255,0.16)" }}>
          <Icon name={ok ? "circle-check" : "triangle-exclamation"} size={13} style={{ marginTop: 3 }} />
          <span>{ok
            ? <>Tu finis le plan avec <b style={NUM}>{eur(fc.finalBalance)}</b>{fc.cushion > 0 ? <> (dont {eur(fc.cushion)} de coussin)</> : null}.</>
            : <>Il manque <b style={NUM}>{eur(-fc.margin)}</b> pour tenir le plan : réduis de <b style={NUM}>{eur(fc.cutNeeded)}</b> par mois.</>}</span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <MetricBox label="À dépenser / mois" value={eur(fc.envelopeNow)} hint="Charges comprises, pour tenir le plan" accent={PLAN} />
        <MetricBox label="Ton rythme actuel" value={eur(fc.futureMonthlySpend)} hint={fc.reductions > 0 ? `Efforts de ${eur(fc.reductions)} déduits` : "Charges + dépenses habituelles"} accent={fc.futureMonthlySpend - fc.income > fc.envelopeNow - fc.income + 1 ? DANGER : SAGE} />
        <MetricBox label="Solde fin de plan" value={eur(fc.finalBalance)} accent={fc.finalBalance < 0 ? DANGER : TEXT} />
        <MetricBox label="Coussin de sécurité" value={eur(fc.cushion)} hint="Jamais dépensé" />
      </div>

      {cur && (
        <Card>
          <SectionTitle accent={PLAN} action={<LinkButton onClick={() => onReview(cur.key)}>Faire le point</LinkButton>}>Ce mois-ci</SectionTitle>
          <div className="flex items-baseline justify-between">
            <p style={NUM} className="text-xl font-semibold">{eur(cur.soFar)}</p>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>sur <span style={NUM}>{eur(fc.envelopeNow)}</span></p>
          </div>
          <div className="h-2 rounded-full mt-2 overflow-hidden" style={{ backgroundColor: SURFACE_ALT }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, fc.envelopeNow > 0 ? (cur.soFar / fc.envelopeNow) * 100 : 100)}%`, backgroundColor: cur.soFar > fc.envelopeNow ? DANGER : PLAN }} />
          </div>
          <p className="text-xs mt-2" style={{ color: TEXT_MUTED }}>
            {leftThisMonth >= 0
              ? <>Il te reste <b style={{ ...NUM, color: TEXT }}>{eur(leftThisMonth)}</b>, soit environ <b style={{ ...NUM, color: TEXT }}>{eur(leftThisMonth / daysLeft)}</b> par jour jusqu'à la fin du mois.</>
              : <>Enveloppe dépassée de <b style={{ ...NUM, color: DANGER }}>{eur(-leftThisMonth)}</b> : les mois suivants vont se resserrer.</>}
          </p>
        </Card>
      )}

      {pendingReviews > 0 && (
        <button onClick={() => onGoTo("mois")} className="press w-full text-left rounded-2xl border p-4 flex items-center gap-3" style={{ backgroundColor: GOLD + "14", borderColor: GOLD + "55" }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: GOLD + "22", color: GOLD }}><Icon name="lightbulb" size={13} /></div>
          <div className="flex-1"><p className="text-sm font-medium">{pendingReviews} bilan{pendingReviews > 1 ? "s" : ""} de mois à faire</p><p className="text-xs" style={{ color: TEXT_MUTED }}>Repère ce qui était de trop et ajuste la suite.</p></div>
          <Icon name="chevron-right" size={11} style={{ color: TEXT_MUTED }} />
        </button>
      )}

      <Card>
        <SectionTitle accent={PLAN}>Ton solde, mois par mois</SectionTitle>
        <BalanceChart fc={fc} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px]" style={{ color: TEXT_MUTED }}>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PLAN }} />Réel</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PLAN + "88" }} />Prévu</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: GOLD }} />Sous le coussin</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: DANGER }} />Dans le rouge</span>
        </div>
      </Card>

      <Card>
        <SectionTitle accent={PLAN} action={<LinkButton onClick={onEditReductions}>{reductionEntries.length ? "Ajuster" : "Ajouter"}</LinkButton>}>Mes efforts chaque mois</SectionTitle>
        {reductionEntries.length === 0 ? (
          <p className="text-xs" style={{ color: TEXT_MUTED }}>Aucun effort prévu pour l'instant. Fais le bilan d'un mois pour repérer ce qui était de trop, ou fixe directement une réduction par catégorie.</p>
        ) : (
          <>
            <div className="space-y-2">
              {reductionEntries.map(([id, v]) => {
                const c = catInfo(id);
                return (
                  <div key={id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: c.color + "22", color: c.color }}><Icon name={c.icon} size={12} /></div>
                    <p className="flex-1 text-sm">{c.label}</p>
                    <p style={{ ...NUM, color: SAGE }} className="text-sm font-medium">−{eur(v)}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-xs mt-3 pt-3 border-t" style={{ color: TEXT_MUTED, borderColor: BORDER }}>
              Soit <b style={{ ...NUM, color: TEXT }}>{eur(fc.reductions)}</b> par mois, environ <b style={{ ...NUM, color: SAGE }}>{eur(fc.reductions * fc.rows.filter((r) => r.status === "future").length)}</b> gardés d'ici la fin du plan.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

function ForecastMonths({ fc, onOpen }) {
  const statusChip = { past: { label: "Terminé", color: TEXT_MUTED }, current: { label: "En cours", color: PLAN }, future: { label: "Prévu", color: GOLD } };
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm">Chaque mois terminé mérite son bilan : qu'est-ce qui était de trop ? Qu'est-ce que tu changes ? Tes efforts sont repris automatiquement dans la prévision.</p>
      </Card>
      <div className="space-y-2.5">
        {fc.rows.map((r) => {
          const target = r.status === "past" ? fc.envelope : fc.envelopeNow;
          const amount = r.status === "current" ? r.soFar : r.spent;
          const over = amount - target;
          const chip = statusChip[r.status];
          const clickable = r.status !== "future";
          return (
            <button key={r.key} disabled={!clickable} onClick={() => onOpen(r.key)} className="press w-full text-left rounded-2xl border p-4 disabled:cursor-default" style={{ backgroundColor: SURFACE, borderColor: r.status === "current" ? PLAN + "77" : BORDER, boxShadow: SHADOW }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium capitalize">{monthLabelLong(r.key)}</p>
                <div className="flex items-center gap-2">
                  {r.reviewed && <span className="text-[10px] inline-flex items-center gap-1" style={{ color: SAGE }}><Icon name="lightbulb" size={9} /> Bilan fait</span>}
                  {r.status === "past" && !r.reviewed && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: GOLD + "22", color: GOLD }}>Bilan à faire</span>}
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: chip.color + "1A", color: chip.color }}>{chip.label}</span>
                </div>
              </div>
              <div className="flex items-baseline justify-between mt-2">
                <p className="text-xs" style={{ color: TEXT_MUTED }}>{r.status === "future" ? "Estimé" : r.status === "current" ? "Dépensé à ce jour" : "Dépensé"} : <span style={{ ...NUM, color: TEXT }}>{eur(amount)}</span> / <span style={NUM}>{eur(target)}</span></p>
                {r.status !== "future" && <p style={{ ...NUM, color: over > 0 ? DANGER : SAGE }} className="text-xs font-medium">{over > 0 ? `+${eur(over)}` : `−${eur(-over)}`}</p>}
              </div>
              <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ backgroundColor: SURFACE_ALT }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, target > 0 ? (amount / target) * 100 : 100)}%`, backgroundColor: over > 0 ? DANGER : r.status === "future" ? PLAN + "88" : PLAN }} />
              </div>
              <p className="text-[11px] mt-2" style={{ color: TEXT_MUTED }}>Solde en fin de mois : <span style={{ ...NUM, color: r.endBalance < 0 ? DANGER : TEXT }}>{eur(r.endBalance)}</span>{r.saved > 0 ? <> · dont épargne {eur(r.saved)}</> : null}{r.purchaseCost > 0 ? <> · dont achat prévu {eur(r.purchaseCost)}</> : null}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthReviewSheet({ data, fc, monthKey: key, review, reductions, onClose, onSubmit }) {
  const analysis = useMemo(() => getMonthReview(data, key), [data, key]);
  const row = fc.rows.find((r) => r.key === key);
  const [mood, setMood] = useState(review?.mood || "");
  const [tooMuch, setTooMuch] = useState(review?.tooMuch || "");
  const [actions, setActions] = useState(review?.actions || "");
  const [regrets, setRegrets] = useState(review?.regrets || []);
  const [cuts, setCuts] = useState(reductions);
  const isCurrent = row?.status === "current";
  const target = isCurrent ? fc.envelopeNow : fc.envelope;
  const spent = row ? (isCurrent ? row.soFar : row.spent) : 0;
  const over = spent - target;
  const regretTotal = analysis.top.filter((e) => regrets.includes(e.id)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const futureMonths = fc.rows.filter((r) => r.status === "future").length;
  const toggleRegret = (id) => setRegrets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleCut = (cat, amount) => setCuts((prev) => {
    const next = { ...prev };
    if (Number(next[cat]) > 0) delete next[cat]; else next[cat] = amount;
    return next;
  });
  const flagged = analysis.cats.filter((c) => c.reason);

  return (
    <Sheet title={`Bilan de ${monthLabelLong(key)}`} onClose={onClose}>
      <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: over > 0 ? DANGER + "12" : SAGE + "14" }}>
        <p className="text-xs" style={{ color: TEXT_MUTED }}>{isCurrent ? "Dépensé à ce jour" : "Dépensé ce mois-là"} (charges{row?.saved > 0 ? " et épargne" : ""} comprises)</p>
        <p style={NUM} className="text-2xl font-semibold mt-0.5">{eur(spent)} <span className="text-sm font-normal" style={{ color: TEXT_MUTED }}>/ {eur(target)}</span></p>
        {row?.saved > 0 && <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>Dont <span style={NUM}>{eur(row.saved)}</span> mis de côté sur tes objectifs depuis ton revenu</p>}
        <p className="text-xs mt-1" style={{ color: over > 0 ? DANGER : SAGE }}>{over > 0 ? `${eur(over)} au-dessus de l'enveloppe prévue` : `${eur(-over)} sous l'enveloppe, bien joué`}</p>
      </div>

      <Field label="Comment s'est passé ce mois ?" color={PLAN}>
        <div className="grid grid-cols-3 gap-2">
          {MOODS.map((m) => (
            <button key={m.id} onClick={() => setMood(m.id)} className="press flex flex-col items-center gap-1 py-2.5 rounded-lg border text-[11px]"
              style={{ borderColor: mood === m.id ? m.color : BORDER, backgroundColor: mood === m.id ? m.color + "1A" : "transparent", color: mood === m.id ? TEXT : TEXT_MUTED }}>
              <Icon name={m.icon} size={18} style={{ color: mood === m.id ? m.color : TEXT_MUTED }} />{m.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label={flagged.length ? "Ce qui a pesé plus que d'habitude" : "Où est parti l'argent"} color={PLAN}>
        {analysis.cats.length === 0 ? <p className="text-xs" style={{ color: TEXT_MUTED }}>Aucune dépense variable notée ce mois-là.</p> : (
          <div className="space-y-2.5">
            {(flagged.length ? flagged : analysis.cats.slice(0, 4)).map((c) => {
              const active = Number(cuts[c.id]) > 0;
              return (
                <div key={c.id} className="rounded-xl border p-3" style={{ borderColor: c.reason ? DANGER + "44" : BORDER }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: c.color + "22", color: c.color }}><Icon name={c.icon} size={12} /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{c.label}</p>
                      {c.reason && <p className="text-[11px]" style={{ color: DANGER }}>{c.reason}</p>}
                    </div>
                    <p style={NUM} className="text-sm font-medium">{eur(c.amount)}</p>
                  </div>
                  <p className="text-[11px] mt-2" style={{ color: TEXT_MUTED }}><Icon name="lightbulb" size={9} style={{ color: GOLD }} /> {SAVING_TIPS[c.id]}</p>
                  <button onClick={() => toggleCut(c.id, c.suggestion)} className="press mt-2 text-[11px] px-3 py-1.5 rounded-full inline-flex items-center gap-1.5"
                    style={{ backgroundColor: active ? SAGE : SAGE + "14", color: active ? "#FFFFFF" : SAGE }}>
                    <Icon name={active ? "check" : "scissors"} size={9} /> {active ? `Effort prévu : −${eur(cuts[c.id])} / mois` : `Viser −${eur(c.suggestion)} les prochains mois`}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Field>

      {analysis.top.length > 0 && (
        <Field label="Tes plus grosses dépenses : ça valait le coup ?" color={PLAN}>
          <div className="rounded-xl border" style={{ borderColor: BORDER }}>
            {analysis.top.map((e, i) => {
              const c = catInfo(e.category);
              const regret = regrets.includes(e.id);
              return (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                  <Icon name={c.icon} size={12} style={{ color: c.color }} />
                  <div className="flex-1 min-w-0"><p className="text-sm truncate">{e.name || c.label}</p><p className="text-[10px]" style={{ color: TEXT_MUTED }}>{formatDateFR(e.date)}</p></div>
                  <p style={NUM} className="text-sm">{eur(e.amount)}</p>
                  <button onClick={() => toggleRegret(e.id)} className="press text-[10px] px-2 py-1 rounded-full shrink-0" style={{ backgroundColor: regret ? DANGER : SURFACE_ALT, color: regret ? "#FFFFFF" : TEXT_MUTED }}>{regret ? "De trop" : "Utile ?"}</button>
                </div>
              );
            })}
          </div>
          {regretTotal > 0 && <p className="text-xs mt-2" style={{ color: TEXT_MUTED }}><b style={{ ...NUM, color: DANGER }}>{eur(regretTotal)}</b> de dépenses évitables. Si tu évites ça chaque mois, c'est <b style={{ ...NUM, color: SAGE }}>{eur(regretTotal * futureMonths)}</b> de plus d'ici la fin du plan.</p>}
        </Field>
      )}

      <Field label="Ce qui était de trop" color={PLAN}>
        <textarea rows={2} className={inputClass} style={inputStyle} value={tooMuch} onChange={(e) => setTooMuch(e.target.value)} placeholder="Ex : trop de livraisons, achats d'impulsion le week-end…" />
      </Field>
      <Field label="Ce que je change le mois prochain" color={PLAN}>
        <textarea rows={2} className={inputClass} style={inputStyle} value={actions} onChange={(e) => setActions(e.target.value)} placeholder="Ex : cuisiner le dimanche, une seule sortie par semaine…" />
      </Field>
      <PlanButton onClick={() => onSubmit({ mood, tooMuch, actions, regrets, regretTotal, at: new Date().toISOString() }, cuts)}>Enregistrer le bilan</PlanButton>
    </Sheet>
  );
}

function PurchasePlanner({ data, fc, plan, onAdd, onToggle, onDelete }) {
  const nowKey = monthKey();
  const monthOptions = fc.rows.filter((r) => r.status !== "past").map((r) => r.key);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [month, setMonth] = useState(monthOptions[0] || nowKey);
  const [spread, setSpread] = useState(1);
  const [saving, setSaving] = useState("");
  const [cost, setCost] = useState("");
  const candidate = { name: name.trim(), price: parseAmount(price), month, spread, monthlySaving: parseAmount(saving), monthlyCost: parseAmount(cost) };
  const after = useMemo(() => (candidate.price > 0 ? getForecast(data, { purchases: [...(plan.purchases || []), candidate] }) : null), [data, candidate.price, month, spread, candidate.monthlySaving, candidate.monthlyCost]);
  const netSaving = candidate.monthlySaving - candidate.monthlyCost;
  const payback = netSaving > 0 ? candidate.price / netSaving : null;
  const daysOfBudget = fc.envelopeNow > 0 ? candidate.price / (fc.envelopeNow / 30) : null;

  let verdict = null;
  if (after) {
    if (after.margin >= 0 && payback && payback <= Math.max(1, after.remainingMonths)) verdict = { color: SAGE, icon: "seedling", title: "Bon investissement", text: `Il se rembourse en ${Math.ceil(payback)} mois grâce à ce qu'il te fait économiser, et tu restes dans ton budget.` };
    else if (after.margin >= 0) verdict = { color: SAGE, icon: "circle-check", title: "Ça passe", text: `Tu restes dans ton plan : ton enveloppe passe de ${eur(fc.envelopeNow)} à ${eur(after.envelopeNow)} par mois.` };
    else if (fc.margin >= 0) verdict = { color: GOLD, icon: "scale-balanced", title: "Possible, avec un effort", text: `Pour l'acheter sans sortir du plan, il faudrait réduire tes dépenses de ${eur(after.cutNeeded)} par mois.` };
    else verdict = { color: DANGER, icon: "hand", title: "Pas maintenant", text: `Ton plan est déjà serré : cet achat ferait passer le manque de ${eur(-fc.margin)} à ${eur(-after.margin)}. Commence par trouver des économies.` };
  }
  const reset = () => { setName(""); setPrice(""); setSaving(""); setCost(""); setSpread(1); };
  const purchases = [...fc.purchases].sort((a, b) => (a.month || "").localeCompare(b.month || ""));

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle accent={PLAN}>Est-ce que je peux me l'acheter ?</SectionTitle>
        <Field label="Quoi ?" color={PLAN}><input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : vélo, robot cuiseur, téléphone…" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix (€)" color={PLAN}><input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0" /></Field>
          <Field label="Quand ?" color={PLAN}>
            <select className={inputClass} style={inputStyle} value={month} onChange={(e) => setMonth(e.target.value)}>
              {monthOptions.map((k) => <option key={k} value={k}>{monthLabelLong(k)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Paiement" color={PLAN}>
          <div className="flex gap-2">
            {[1, 3, 4, 10].map((n) => (
              <button key={n} onClick={() => setSpread(n)} className="press flex-1 py-2 rounded-lg border text-xs" style={{ borderColor: spread === n ? PLAN : BORDER, backgroundColor: spread === n ? PLAN + "1A" : "transparent", color: spread === n ? TEXT : TEXT_MUTED }}>{n === 1 ? "Comptant" : `${n} fois`}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Me fait économiser / mois" color={SAGE}><input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={saving} onChange={(e) => setSaving(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="Optionnel" /></Field>
          <Field label="Me coûte en plus / mois" color={DANGER}><input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={cost} onChange={(e) => setCost(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="Optionnel" /></Field>
        </div>
        <p className="text-[11px] -mt-2 mb-4" style={{ color: TEXT_MUTED }}>Ex : un vélo qui remplace le pass transport fait économiser 30 €/mois ; un abonnement ou un entretien coûte en plus.</p>

        {verdict && (
          <div className="rounded-xl p-4 anim-fade-in" style={{ backgroundColor: verdict.color + "14", border: `1px solid ${verdict.color}44` }}>
            <p className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: verdict.color }}><Icon name={verdict.icon} size={13} /> {verdict.title}</p>
            <p className="text-xs mt-1.5">{verdict.text}</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <MetricBox label="Enveloppe / mois" value={eur(after.envelopeNow)} hint={`Avant : ${eur(fc.envelopeNow)}`} accent={PLAN} />
              <MetricBox label="Solde fin de plan" value={eur(after.finalBalance)} hint={`Avant : ${eur(fc.finalBalance)}`} accent={after.margin < 0 ? DANGER : TEXT} />
            </div>
            {(daysOfBudget || payback) && (
              <p className="text-[11px] mt-2" style={{ color: TEXT_MUTED }}>
                {daysOfBudget ? <>Cet achat représente environ <b style={{ ...NUM, color: TEXT }}>{Math.round(daysOfBudget)} jours</b> de ton budget. </> : null}
                {payback ? <>Rentabilisé en <b style={{ ...NUM, color: TEXT }}>{Math.ceil(payback)} mois</b>.</> : null}
              </p>
            )}
            <button onClick={() => { onAdd(candidate); reset(); }} className="press w-full mt-3 py-2.5 rounded-lg text-sm font-medium" style={{ background: PLAN_GRADIENT, color: "#FFFFFF" }}>Ajouter à mon plan</button>
          </div>
        )}
      </Card>

      <div>
        <SectionTitle accent={PLAN}>Achats prévus dans le plan</SectionTitle>
        {purchases.length === 0 ? <EmptyState icon="cart-plus" text="Aucun achat prévu. Simule un achat ci-dessus et ajoute-le : la prévision en tiendra compte." /> : (
          <Card className="!p-0">
            {purchases.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? `1px solid ${BORDER}` : "none", opacity: p.done ? 0.6 : 1 }}>
                <button onClick={() => onToggle(p)} aria-label={p.done ? "Marquer comme prévu" : "Marquer comme acheté"} className="w-6 h-6 rounded-full border flex items-center justify-center shrink-0" style={{ borderColor: p.done ? SAGE : BORDER, backgroundColor: p.done ? SAGE : "transparent", color: "#FFFFFF" }}>{p.done && <Icon name="check" size={10} />}</button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ textDecoration: p.done ? "line-through" : "none" }}>{p.name || "Achat"}</p>
                  <p className="text-[11px] first-letter:uppercase" style={{ color: TEXT_MUTED }}>{monthLabelLong(p.month || nowKey)}{Number(p.spread) > 1 ? ` · en ${p.spread} fois` : ""}{Number(p.monthlySaving) > 0 ? ` · économise ${eur(p.monthlySaving)}/mois` : ""}</p>
                  {p.hits.length > 0 && <p className="text-[11px] mt-0.5 inline-flex items-center gap-1" style={{ color: SAGE }}><Icon name="link" size={9} /> {p.autoDone ? "Repéré dans tes dépenses" : `${eur(p.paid)} déjà payés sur ${eur(p.price)}`} ({p.hits.map((e) => formatDateFR(e.date)).join(", ")})</p>}
                </div>
                <p style={NUM} className="text-sm font-medium">{eur(p.price)}</p>
                <button onClick={() => onDelete(p)} aria-label="Retirer" style={{ color: TEXT_MUTED }}><Icon name="xmark" size={12} /></button>
              </div>
            ))}
          </Card>
        )}
        {purchases.some((p) => !p.done) && <p className="text-[11px] mt-2" style={{ color: TEXT_MUTED }}>Note la dépense dans Budget avec le même nom (ex : « Vélo ») : l'achat sera repéré tout seul et ne sera pas compté deux fois. Sinon, coche-le à la main.</p>}
      </div>
    </div>
  );
}

function ForecastSetupForm({ initial, budgetIncome, charges, baselineVar, onClose, onSubmit }) {
  const nowKey = monthKey();
  const [capital, setCapital] = useState(initial.capital ? String(initial.capital) : "");
  const [months, setMonths] = useState(Number(initial.months) || 9);
  const [startMonth, setStartMonth] = useState(initial.startMonth || nowKey);
  const [incomeSource, setIncomeSource] = useState(initial.incomeSource === "manual" ? "manual" : "budget");
  const [manualIncome, setIncome] = useState(initial.monthlyIncome ? String(initial.monthlyIncome) : "");
  const income = incomeSource === "budget" ? budgetIncome : manualIncome;
  const [cushion, setCushion] = useState(initial.cushion ? String(initial.cushion) : "");
  const startOptions = Array.from({ length: 19 }, (_, i) => addMonthsKey(nowKey, i - 12));
  const total = parseAmount(capital) + parseAmount(income) * months - parseAmount(cushion);
  const envelope = months > 0 ? total / months : 0;
  const pace = charges + baselineVar;
  const valid = (parseAmount(capital) > 0 || parseAmount(income) > 0) && months >= 1;
  return (
    <Sheet title={initial.capital || initial.monthlyIncome || initial.incomeSource ? "Modifier mon plan" : "Créer mon plan"} onClose={onClose}>
      <Field label="Argent disponible au départ (€)" color={PLAN}>
        <input autoFocus type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={capital} onChange={(e) => setCapital(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="Ex : 6 000" />
      </Field>
      <Field label="Il doit tenir combien de mois ?" color={PLAN}>
        <div className="flex gap-2 mb-2">
          {[3, 6, 9, 12].map((n) => (
            <button key={n} onClick={() => setMonths(n)} className="press flex-1 py-2 rounded-lg border text-xs" style={{ ...NUM, borderColor: months === n ? PLAN : BORDER, backgroundColor: months === n ? PLAN + "1A" : "transparent", color: months === n ? TEXT : TEXT_MUTED }}>{n} mois</button>
          ))}
        </div>
        <input type="number" min="1" max="60" className={inputClass} style={inputStyle} value={months} onChange={(e) => setMonths(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} />
      </Field>
      <Field label="À partir de" color={PLAN}>
        <select className={inputClass} style={inputStyle} value={startMonth} onChange={(e) => setStartMonth(e.target.value)}>
          {startOptions.map((k) => <option key={k} value={k}>{monthLabelLong(k)}</option>)}
        </select>
      </Field>
      <Field label="Revenus pendant la période" color={PLAN}>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {[{ id: "budget", label: "Mes revenus de Budget", hint: `${eur(budgetIncome)} / mois` }, { id: "manual", label: "Autre montant", hint: "Fixe chaque mois" }].map((o) => (
            <button key={o.id} onClick={() => setIncomeSource(o.id)} className="press py-2.5 px-2 rounded-lg border text-xs text-center"
              style={{ borderColor: incomeSource === o.id ? PLAN : BORDER, backgroundColor: incomeSource === o.id ? PLAN + "1A" : "transparent", color: incomeSource === o.id ? TEXT : TEXT_MUTED }}>
              <span className="block font-medium">{o.label}</span><span className="block text-[10px] mt-0.5" style={NUM}>{o.hint}</span>
            </button>
          ))}
        </div>
        {incomeSource === "manual"
          ? <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={manualIncome} onChange={(e) => setIncome(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0 si tu n'as pas d'autres rentrées" />
          : <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Le plan suit automatiquement les revenus saisis dans Budget, mois par mois.</p>}
      </Field>
      <Field label="Coussin de sécurité à ne pas toucher (€)" color={PLAN}>
        <input type="text" inputMode="decimal" className={inputClass} style={inputStyle} value={cushion} onChange={(e) => setCushion(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="Ex : 300 pour les imprévus" />
      </Field>
      {valid && (
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: PLAN + "12" }}>
          <p className="text-xs" style={{ color: TEXT_MUTED }}>Tu pourras dépenser chaque mois (charges et épargne comprises)</p>
          <p style={{ ...NUM, color: PLAN }} className="text-2xl font-semibold mt-0.5">{eur(envelope)}</p>
          {pace > 0 && (
            <p className="text-xs mt-1.5" style={{ color: pace > envelope ? DANGER : SAGE }}>
              Ton rythme actuel est d'environ {eur(pace)} / mois{pace > envelope ? ` : il faudra réduire d'environ ${eur(pace - envelope)} par mois.` : " : ça tient."}
            </p>
          )}
        </div>
      )}
      <PlanButton disabled={!valid} onClick={() => onSubmit({ capital: parseAmount(capital), months, startMonth, incomeSource, monthlyIncome: parseAmount(manualIncome), cushion: parseAmount(cushion) })}>Enregistrer le plan</PlanButton>
    </Sheet>
  );
}

function ReductionsForm({ initial, onClose, onSubmit }) {
  const [values, setValues] = useState(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, initial[c.id] ? String(initial[c.id]) : ""])));
  const total = Object.values(values).reduce((s, v) => s + parseAmount(v), 0);
  return (
    <Sheet title="Mes efforts chaque mois" onClose={onClose}>
      <p className="text-[11px] mb-4" style={{ color: TEXT_MUTED }}>Combien veux-tu dépenser en moins, chaque mois, dans chaque catégorie ? Ces montants sont déduits de ton rythme habituel pour les mois à venir.</p>
      <div className="space-y-2.5 mb-4">
        {CATEGORIES.map((c) => (
          <div key={c.id} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: c.color + "22", color: c.color }}><Icon name={c.icon} size={12} /></div>
            <p className="flex-1 text-sm">{c.label}</p>
            <div className="flex items-center gap-1 w-28">
              <span className="text-sm" style={{ color: TEXT_MUTED }}>−</span>
              <input type="text" inputMode="decimal" className={inputClass} style={{ ...inputStyle, ...NUM }} value={values[c.id]} onChange={(e) => setValues({ ...values, [c.id]: e.target.value.replace(/[^0-9.,]/g, "") })} placeholder="0" aria-label={`Réduction ${c.label}`} />
              <span className="text-sm" style={{ color: TEXT_MUTED }}>€</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm mb-4">Total : <b style={{ ...NUM, color: SAGE }}>−{eur(total)} / mois</b></p>
      <PlanButton onClick={() => onSubmit(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, parseAmount(v)]).filter(([, v]) => v > 0)))}>Enregistrer</PlanButton>
    </Sheet>
  );
}

/* ---------- Sélecteur d'application ---------- */

function AppSwitcher({ mode, onChange, alerts = 0 }) {
  const apps = [
    { id: "budget", label: "Budget", icon: "wallet", accent: ROSE },
    { id: "prevision", label: "Prévision", icon: "chart-line", accent: PLAN, badge: alerts },
  ];
  return (
    <div className="flex rounded-full p-1 mb-4" role="tablist" aria-label="Choisir l'application" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
      {apps.map((app) => (
        <button key={app.id} role="tab" aria-selected={mode === app.id} onClick={() => onChange(app.id)} className="press flex-1 py-2 rounded-full text-xs inline-flex items-center justify-center gap-2 transition-colors"
          style={{ backgroundColor: mode === app.id ? app.accent : "transparent", color: mode === app.id ? "#FFFFFF" : TEXT_MUTED, fontWeight: mode === app.id ? 600 : 400 }}>
          <Icon name={app.icon} size={12} /> {app.label}
          {app.badge > 0 && <span aria-label={`${app.badge} bilan${app.badge > 1 ? "s" : ""} à faire`} className="text-[10px] px-1.5 rounded-full font-semibold" style={{ ...NUM, backgroundColor: GOLD, color: "#FFFFFF" }}>{app.badge}</span>}
        </button>
      ))}
    </div>
  );
}

function IncomeForm({ monthKey: key, initial, initialSources, onClose, onSubmit }) {
  const [sources, setSources] = useState(
    (Array.isArray(initialSources) && initialSources.length > 0
      ? initialSources
      : initial > 0
        ? [{ id: uid(), type: "salaire", label: "Salaire", amount: initial }]
        : [{ id: uid(), type: "salaire", label: "Salaire", amount: "" }]
    ).map((source) => ({ ...source, amount: source.amount ?? "" }))
  );

  const updateSource = (id, key, value) => {
    setSources((prev) => prev.map((source) => (source.id === id ? { ...source, [key]: value } : source)));
  };
  const addSource = () => setSources((prev) => [...prev, { id: uid(), type: "salaire", label: "", amount: "" }]);
  const removeSource = (id) => setSources((prev) => prev.filter((source) => source.id !== id));
  const handleSubmit = () => {
    const normalized = sources
      .filter((source) => String(source.label || "").trim() || Number(source.amount || 0) > 0)
      .map((source) => ({
        ...source,
        label: String(source.label || "").trim() || INCOME_TYPES.find((item) => item.id === source.type)?.label || "Revenu",
        type: source.type || "salaire",
        amount: Number(source.amount || 0),
      }));
    const total = normalized.reduce((sum, source) => sum + Number(source.amount || 0), 0);
    onSubmit({ total, sources: normalized });
  };

  return (
    <Sheet title={key ? `Revenus de ${monthLabelLong(key)}` : "Revenus mensuels"} onClose={onClose}>
      <p className="text-[11px] mb-3" style={{ color: TEXT_MUTED }}>Chaque mois a ses propres revenus : ce que tu saisis ici ne concerne que {key ? monthLabelLong(key) : "ce mois-ci"}. Ajoute plusieurs entrées si ton budget vient de plusieurs sources (bourse, aide, projet, etc.).</p>
      {sources.map((source, index) => (
        <div key={source.id} className="rounded-xl border p-3 mb-3" style={{ backgroundColor: BG, borderColor: BORDER }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: TEXT_MUTED }}>Revenu {index + 1}</p>
            {sources.length > 1 && <button onClick={() => removeSource(source.id)} className="text-[11px]" style={{ color: TEXT_MUTED }}>Supprimer</button>}
          </div>
          <Field label="Type">
            <select value={source.type} onChange={(e) => updateSource(source.id, "type", e.target.value)} className={inputClass} style={inputStyle}>
              {INCOME_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Libellé">
            <input className={inputClass} style={inputStyle} value={source.label || ""} onChange={(e) => updateSource(source.id, "label", e.target.value)} placeholder="Ex. Salaire, bourse…" />
          </Field>
          <Field label="Montant (€)">
            <input type="number" inputMode="decimal" className={inputClass} style={inputStyle} value={source.amount} onChange={(e) => updateSource(source.id, "amount", e.target.value)} placeholder="0" />
          </Field>
        </div>
      ))}
      <button onClick={addSource} className="w-full py-2.5 rounded-lg border text-sm mb-4" style={{ borderColor: BORDER, color: TEXT_MUTED }}>+ Ajouter un revenu</button>
      <button onClick={handleSubmit} className="press w-full py-3.5 rounded-xl font-medium text-sm" style={{ background: `linear-gradient(135deg, ${ROSE} 0%, ${ROSE_DEEP} 100%)`, color: "#FFFFFF" }}>Mettre à jour →</button>
    </Sheet>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
  